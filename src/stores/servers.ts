import { defineStore } from "pinia";
import { ref, shallowRef, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { getVpnNodes } from "@/api/server";
import type { Server, ServerStatus, ServerNode } from "@/types/server";
import { requestLock } from "@/utils/debounce";
import { cache, CACHE_KEYS, CACHE_TTL } from "@/utils/cache";

export type PendingAction = "connect" | "switch" | null;

interface PingResult {
  node_id: number;
  latency_ms: number;
  status: string;
}

// 类型守卫：验证服务器状态
function isValidServerStatus(status: string): status is ServerStatus {
  return status === "online" || status === "offline" || status === "maintenance";
}

export const useServersStore = defineStore("servers", () => {
  // 使用 shallowRef 优化大数组，减少深度响应式开销
  const servers = shallowRef<Server[]>([]);
  const currentServerId = ref<number | null>(null);
  const isLoading = ref(false);
  const isPinging = ref(false);
  const error = ref<string | null>(null);

  const pendingAction = ref<PendingAction>(null);

  let unlistenPing: UnlistenFn | null = null;

  const currentServer = computed(
    () =>
      servers.value.find((s) => s.id === currentServerId.value) ||
      servers.value[0]
  );
  function mapStatus(status: number): ServerStatus {
    switch (status) {
      case 1:
        return "online";
      case 2:
        return "maintenance";
      case 3:
        return "offline";
      default:
        return "offline";
    }
  }
  async function loadServers(forceRefresh = false) {
    // 防止重复加载
    if (requestLock.isLocked("load-servers")) {
      console.log("Server loading already in progress");
      return;
    }

    await requestLock.withLock("load-servers", async () => {
      isLoading.value = true;
      error.value = null;

      try {
        // 尝试从缓存获取
        let nodes: ServerNode[];
        if (!forceRefresh) {
          const cached = cache.get<ServerNode[]>(CACHE_KEYS.SERVERS);
          if (cached) {
            console.log("Using cached servers");
            nodes = cached;
          } else {
            nodes = await getVpnNodes();
            cache.set(CACHE_KEYS.SERVERS, nodes, CACHE_TTL.SERVERS);
          }
        } else {
          // 强制刷新
          nodes = await getVpnNodes();
          cache.set(CACHE_KEYS.SERVERS, nodes, CACHE_TTL.SERVERS);
        }

        servers.value = nodes.map((n) => ({
          ...n,
          ping: 999, // 默认延迟值，等待真实 ping 结果
          status: mapStatus(n.status),
        }));

        const savedId = localStorage.getItem("currentServerId");
        const parsedId = savedId ? parseInt(savedId, 10) : null;
        if (parsedId !== null && !isNaN(parsedId) && servers.value.some((s) => s.id === parsedId)) {
          currentServerId.value = parsedId;
        } else if (servers.value.length > 0) {
          currentServerId.value = servers.value[0].id;
        }

        await testAllPings();
      } catch (e) {
        error.value = e instanceof Error ? e.message : String(e);
        console.error("Failed to load servers:", e);
      } finally {
        isLoading.value = false;
      }
    });
  }

  /**
   * 强制刷新服务器列表（清除缓存）
   */
  async function refreshServers() {
    cache.delete(CACHE_KEYS.SERVERS);
    await loadServers(true);
  }
  function selectServer(id: number) {
    currentServerId.value = id;
    localStorage.setItem("currentServerId", id.toString());
  }

  function setPendingAction(action: PendingAction) {
    pendingAction.value = action;
  }

  function consumePendingAction(): PendingAction {
    const action = pendingAction.value;
    pendingAction.value = null;
    return action;
  }

  /**
   * 测试所有节点延迟（通过 Rust 批量测试）
   */
  async function testAllPings() {
    if (servers.value.length === 0) return;

    // 防止重复测试
    if (requestLock.isLocked("ping-all")) {
      console.log("Ping test already in progress");
      return;
    }

    await requestLock.withLock("ping-all", async () => {
      isPinging.value = true;
      let receivedCount = 0;
      const totalCount = servers.value.length;
      const receivedNodes = new Set<number>();

      // 设置监听器接收 ping 结果（在调用 ping_nodes 之前）
      if (unlistenPing) {
        unlistenPing();
        unlistenPing = null;
      }

      unlistenPing = await listen<PingResult>("ping-result", (event) => {
        const { node_id, latency_ms, status } = event.payload;

        // 防止重复处理同一节点
        if (receivedNodes.has(node_id)) {
          console.log(`[Ping] Duplicate result for node=${node_id}, ignoring`);
          return;
        }
        receivedNodes.add(node_id);

        console.log(`[Ping] Received: node=${node_id}, latency=${latency_ms}ms, status=${status}`);

        const serverIndex = servers.value.findIndex((s) => s.id === node_id);
        if (serverIndex !== -1) {
          // 创建新数组以触发响应式更新
          const newServers = [...servers.value];
          newServers[serverIndex] = {
            ...newServers[serverIndex],
            ping: latency_ms >= 0 ? latency_ms : 999,
            status: isValidServerStatus(status) ? status : "offline",
          };
          servers.value = newServers;

          receivedCount++;

          // 所有结果都收到后，标记完成
          if (receivedCount >= totalCount) {
            console.log(`[Ping] All ${totalCount} results received`);
            isPinging.value = false;
          }
        }
      });

      try {
        // 准备节点列表，过滤掉无效数据
        const nodes = servers.value
          .filter((s) => s.id != null && s.domain != null && typeof s.domain === 'string' && s.domain.length > 0)
          .map((s) => [s.id, s.domain, s.port || 443] as [number, string, number]);

        if (nodes.length === 0) {
          console.log("[Ping] No valid nodes to ping");
          isPinging.value = false;
          return;
        }

        console.log(`[Ping] Starting batch ping for ${nodes.length} nodes:`, nodes);

        // 调用 Rust 批量测试（这个调用会立即返回，结果通过事件发送）
        await invoke("ping_nodes", { nodes });

        // 设置超时，防止永远等待
        setTimeout(() => {
          if (isPinging.value && receivedCount < totalCount) {
            console.log(`[Ping] Timeout, received ${receivedCount}/${totalCount}`);
            isPinging.value = false;
          }
        }, 8000); // 8秒超时（减少等待时间）
      } catch (e) {
        console.error("Ping failed:", e);
        isPinging.value = false;
      }
    });
  }

  /**
   * 测试单个节点延迟
   */
  async function testSinglePing(serverId: number): Promise<number> {
    const serverIndex = servers.value.findIndex((s) => s.id === serverId);
    if (serverIndex === -1) return 999;

    const server = servers.value[serverIndex];

    try {
      const latency = await invoke<number>("ping_single_node", {
        domain: server.domain,
        port: server.port || 443,
      });

      const newPing = latency >= 0 ? latency : 999;
      const newStatus = latency >= 0 && latency < 500 ? "online" : "offline";

      // 创建新数组以触发响应式更新
      const newServers = [...servers.value];
      newServers[serverIndex] = {
        ...newServers[serverIndex],
        ping: newPing,
        status: newStatus as ServerStatus,
      };
      servers.value = newServers;

      return newPing;
    } catch (e) {
      console.error("Single ping failed:", e);
      return 999;
    }
  }

  function cleanup() {
    unlistenPing?.();
    unlistenPing = null;
    stopRealtimePingLoop();
  }

  // ============ 按延迟排序的服务器列表 ============
  const sortedServers = computed(() => {
    return [...servers.value].sort((a, b) => {
      // 999 表示无法连接，排到最后
      if (a.ping === 999 && b.ping !== 999) return 1;
      if (a.ping !== 999 && b.ping === 999) return -1;
      return a.ping - b.ping;
    });
  });

  // ============ 实时延迟更新 ============
  let realtimePingTimer: number | null = null;

  /**
   * 启动实时延迟更新（每 30 秒刷新一次）
   */
  function startRealtimePingLoop(): void {
    stopRealtimePingLoop();
    realtimePingTimer = window.setInterval(() => {
      testAllPings();
    }, 30000);
  }

  /**
   * 停止实时延迟更新
   */
  function stopRealtimePingLoop(): void {
    if (realtimePingTimer) {
      clearInterval(realtimePingTimer);
      realtimePingTimer = null;
    }
  }

  return {
    servers,
    sortedServers,
    currentServer,
    currentServerId,
    isLoading,
    isPinging,
    error,
    pendingAction,
    loadServers,
    refreshServers,
    selectServer,
    setPendingAction,
    consumePendingAction,
    testAllPings,
    testSinglePing,
    startRealtimePingLoop,
    stopRealtimePingLoop,
    cleanup,
  };
});
