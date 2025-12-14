// src/stores/vpn.ts
// VPN Store 主文件，包含心跳同步和状态恢复逻辑

import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// 子模块导入
import type {
  VpnStatus,
  HelperStatus,
  ConnectionStats,
  VpnEventListeners,
  LogEvent,
  TrafficEvent,
  LatencyEvent,
  VpnStatusEvent,
  VpnConnectionErrorEvent,
  VpnProcessTerminatedEvent,
  HelperResult,
  HelperStatusResult,
  TunPrecheckResult,
  VpnStatusResult,
  ConnectivityResult,
} from "./vpn/types";
import {
  isValidVpnStatus,
  isValidHelperStatus,
  DEFAULT_CONNECTION_STATS,
} from "./vpn/constants";
import { useDailyLimits } from "./vpn/useDailyLimits";
import { useVpnMonitor } from "./vpn/useVpnMonitor";
import { useVpnReconnect } from "./vpn/useVpnReconnect";

// 其他 Store 导入
import { useLogsStore } from "./logs";
import { useSettingsStore } from "./settings";
import { useServersStore } from "./servers";
import { useAuthStore } from "./auth";
import router from "@/router";
import { reportUsage } from "@/api/user";
import { connectPrecheck, getRealtimeUsage } from "@/api/vpn";
import { requestLock } from "@/utils/debounce";

// 常量定义
const HEARTBEAT_INTERVAL = 3000; // 3秒心跳
const CONNECTING_GRACE_PERIOD = 5000; // 连接动作的宽容期（毫秒）

export const useVpnStore = defineStore("vpn", () => {
  // ============ 基础状态 ============
  const status = ref<VpnStatus>("disconnected");
  const helperStatus = ref<HelperStatus>("not_installed");
  const isVpnBusy = ref(false);
  const isHelperBusy = ref(false);
  const error = ref<string | null>(null);
  const isUserDisconnecting = ref(false);

  const stats = ref<ConnectionStats>({ ...DEFAULT_CONNECTION_STATS });

  // 事件监听句柄
  const listeners = ref<VpnEventListeners>({
    log: null,
    traffic: null,
    latency: null,
    status: null,
    error: null,
    terminated: null,
  });

  let connectedTimeTimer: number | null = null;
  let connectedAt = 0;
  let listenersInitialized = false;

  // 新增：心跳和宽容期状态
  let heartbeatTimer: number | null = null;
  let lastActionTime = 0; // 最后一次用户操作时间

  // ============ 组合子模块 ============
  // TS修复: 显式声明可能为 undefined
  let _dailyLimits: ReturnType<typeof useDailyLimits> | undefined;
  let _monitor: ReturnType<typeof useVpnMonitor> | undefined;
  let _reconnect: ReturnType<typeof useVpnReconnect> | undefined;

  function initSubModules() {
    if (!_dailyLimits) {
      _dailyLimits = useDailyLimits(stats, disconnect);
    }
    if (!_monitor) {
      _monitor = useVpnMonitor(stats, status);
    }
    if (!_reconnect) {
      _reconnect = useVpnReconnect(connect, status);
    }
  }

  // ============ Getters ============
  const isConnected = computed(() => status.value === "connected");
  const isConnecting = computed(() => status.value === "connecting");
  const isDisconnecting = computed(() => status.value === "disconnecting");

  const isHelperReady = computed(
    () => helperStatus.value === "installed" || helperStatus.value === "running"
  );

  const canConnect = computed(
    () =>
      !isVpnBusy.value && isHelperReady.value && status.value === "disconnected"
  );

  const canDisconnect = computed(
    () =>
      !isVpnBusy.value &&
      (status.value === "connected" || status.value === "connecting")
  );

  const canCancel = computed(() => status.value === "connecting");
  const canInstallHelper = computed(() => !isHelperBusy.value);
  const canUninstallHelper = computed(
    () => !isHelperBusy.value && helperStatus.value !== "not_installed"
  );

  // ============ 状态同步 (核心优化) ============
  async function syncVpnStatus(isHeartbeat = false) {
    try {
      const result = await invoke<VpnStatusResult>("check_vpn_status");

      if (!isValidVpnStatus(result.status)) {
        console.warn(`Invalid VPN status received: ${result.status}`);
        return;
      }

      const backendStatus = result.status;
      const frontendStatus = status.value;
      const now = Date.now();

      // --- 智能状态合并逻辑 ---

      // 场景 1: 前端正在连接中，但后端显示未连接 (Rust 进程启动中)
      // 策略: 如果在宽容期内，保持 "connecting" 状态，忽略后端的 "disconnected"
      if (frontendStatus === "connecting" && backendStatus === "disconnected") {
        if (now - lastActionTime < CONNECTING_GRACE_PERIOD) {
          if (!isHeartbeat)
            console.log("[VPN Sync] Waiting for backend to catch up...");
          return;
        } else {
          // 超时了，说明连接真的失败了但没收到错误事件
          console.warn(
            "[VPN Sync] Connection timed out, syncing to disconnected"
          );
          status.value = "disconnected";
          if (!error.value) error.value = "Connection attempt timed out";
          isVpnBusy.value = false;
        }
      }

      // 场景 2: 前端显示断开，但后端实际已连接 (HMR重载、崩溃恢复、休眠唤醒)
      // 策略: 立即同步为已连接，并恢复计时器和监控
      else if (
        frontendStatus === "disconnected" &&
        backendStatus === "connected"
      ) {
        console.warn("[VPN Sync] Recovering lost connection state");
        status.value = "connected";

        // 恢复开始连接的时间
        connectedAt = result.connected_at
          ? result.connected_at * 1000
          : Date.now();
        startConnectedTimeCounter();

        // 重新初始化所有子模块并重启监控
        initSubModules();
        // TS修复: 确认 _monitor 已初始化
        _monitor!.startTrafficMonitor();
        _monitor!.startPingLoop();
        startRealtimeUsageCheck();

        // 确保事件监听器是激活的
        if (!listenersInitialized) {
          await initEventListeners();
        }

        // 尝试通知后端重启监控推流（如果后端支持热重启）
        try {
          await invoke("restart_vpn_monitor");
        } catch (e) {
          /* 忽略 */
        }

        // 恢复当前服务器信息显示（如果有）
        const serversStore = useServersStore();
        if (result.server_id && serversStore.servers.length > 0) {
          serversStore.currentServerId = result.server_id;
        }
      }

      // 场景 3: 状态不一致的其他情况 (常规纠正)
      else if (frontendStatus !== backendStatus) {
        // 如果我们正在 disconnect 且在宽容期内，也忽略 backend 的 connected
        if (
          frontendStatus === "disconnecting" &&
          backendStatus === "connected"
        ) {
          if (now - lastActionTime < CONNECTING_GRACE_PERIOD) return;
        }

        console.log(
          `[VPN Sync] Status corrected: ${frontendStatus} -> ${backendStatus}`
        );
        status.value = backendStatus;

        if (backendStatus === "disconnected") {
          stopConnectedTimeCounter();
          resetStats();
          isVpnBusy.value = false;
        }
      }
    } catch (e) {
      console.error("[VPN] Failed to sync status:", e);
    }
  }

  // ============ 心跳管理 ============
  function startHeartbeat() {
    if (heartbeatTimer) return;
    console.log("[VPN] Starting heartbeat...");
    // 立即同步一次
    syncVpnStatus();
    heartbeatTimer = window.setInterval(() => {
      // 只有在非繁忙状态下才进行心跳同步，避免干扰正在进行的操作
      if (!isVpnBusy.value) {
        syncVpnStatus(true);
      }
    }, HEARTBEAT_INTERVAL);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  // ============ 事件监听器初始化 ============
  async function initEventListeners() {
    if (listenersInitialized) return;
    listenersInitialized = true;

    const logs = useLogsStore();
    initSubModules();

    try {
      // 日志事件
      listeners.value.log = await listen<LogEvent>("vpn-log", (event) => {
        const { level, message } = event.payload;
        let logLevel: "info" | "warn" | "error" = "info";
        const levelLower = level.toLowerCase();
        if (levelLower === "error" || levelLower === "fatal")
          logLevel = "error";
        else if (levelLower === "warn") logLevel = "warn";
        logs.addLog(logLevel, message);
      });

      // 状态变更事件
      listeners.value.status = await listen<VpnStatusEvent>(
        "vpn-status-change",
        (event) => {
          if (!isValidVpnStatus(event.payload.status)) return;
          const newStatus = event.payload.status;
          console.log(`VPN status event: ${newStatus}`);

          status.value = newStatus;
          isVpnBusy.value = false; // 收到明确状态变更，解除繁忙

          if (newStatus === "connected") {
            connectedAt = Date.now();
            startConnectedTimeCounter();
            _monitor!.startTrafficMonitor();
            _monitor!.startPingLoop();
            startRealtimeUsageCheck();
            isUserDisconnecting.value = false;
          } else if (newStatus === "disconnected") {
            stopConnectedTimeCounter();
            stopRealtimeUsageCheck();
            _monitor!.stopTrafficMonitor();
            _monitor!.stopPingLoop();
            if (!isUserDisconnecting.value) _dailyLimits!.accumulateUsage();
            resetStats();
            isUserDisconnecting.value = false;
          }
        }
      );

      // 连接错误事件
      listeners.value.error = await listen<VpnConnectionErrorEvent>(
        "vpn-connection-error",
        (event) => {
          const { error: errorMsg, fatal } = event.payload;
          console.error(`VPN connection error: ${errorMsg}`);
          error.value = `Connection failed: ${errorMsg}`;
          isVpnBusy.value = false;
          if (fatal) {
            status.value = "disconnected";
            stopConnectedTimeCounter();
            resetStats();
          }
        }
      );

      // 进程终止事件
      listeners.value.terminated = await listen<VpnProcessTerminatedEvent>(
        "vpn-process-terminated",
        async (event) => {
          if (!isUserDisconnecting.value && status.value !== "disconnected") {
            status.value = "disconnected";
            stopConnectedTimeCounter();
            _dailyLimits!.accumulateUsage();
            await reportCurrentUsage();
            resetStats();
            isVpnBusy.value = false;

            if (event.payload.reason === "fatal_error") {
              error.value = "Connection terminated unexpectedly.";
            } else {
              if (_reconnect!.shouldAutoReconnect())
                _reconnect!.scheduleReconnect();
            }
          }
        }
      );

      // 流量事件
      listeners.value.traffic = await listen<TrafficEvent>(
        "vpn-traffic",
        (event) => {
          if (status.value === "connected") {
            stats.value.totalDownload = event.payload.download_bytes;
            stats.value.totalUpload = event.payload.upload_bytes;
            stats.value.downloadSpeed = event.payload.download_speed;
            stats.value.uploadSpeed = event.payload.upload_speed;
            _dailyLimits!.checkRealTimeLimit(error);
          }
        }
      );

      // 延迟事件
      listeners.value.latency = await listen<LatencyEvent>(
        "vpn-latency",
        (event) => {
          if (status.value === "connected") {
            stats.value.latency = event.payload.latency_ms;
          }
        }
      );
    } catch (e) {
      console.error("Failed to initialize event listeners:", e);
      listenersInitialized = false;
    }
  }

  // ============ Helper 管理 ============
  async function checkHelperStatus() {
    try {
      const res = await invoke<HelperStatusResult>("check_helper_status");
      helperStatus.value = isValidHelperStatus(res.status)
        ? res.status
        : "error";
    } catch (e) {
      console.error("Failed to check helper:", e);
      helperStatus.value = "error";
    }
  }

  async function installHelper() {
    if (!canInstallHelper.value) return;
    isHelperBusy.value = true;
    error.value = null;
    try {
      const res = await invoke<HelperResult>("install_helper");
      if (res.success) helperStatus.value = "installed";
      else throw new Error(res.message);
    } catch (e) {
      error.value = String(e);
    } finally {
      isHelperBusy.value = false;
    }
  }

  async function uninstallHelper() {
    if (!canUninstallHelper.value) return;
    isHelperBusy.value = true;
    error.value = null;
    try {
      const res = await invoke<HelperResult>("uninstall_helper");
      if (res.success) helperStatus.value = "not_installed";
      else throw new Error(res.message);
    } catch (e) {
      error.value = String(e);
    } finally {
      isHelperBusy.value = false;
    }
  }

  async function precheckTunPermission(): Promise<TunPrecheckResult | null> {
    try {
      return await invoke<TunPrecheckResult>("precheck_tun_permission");
    } catch (e) {
      return null;
    }
  }

  // ============ VPN 连接 ============
  async function connect() {
    if (requestLock.isLocked("vpn-connect")) return;

    initSubModules();
    const authStore = useAuthStore();
    const settingsStore = useSettingsStore();
    const serversStore = useServersStore();

    if (status.value === "connected" || status.value === "connecting") return;

    if (authStore.needsLogin) {
      router.push("/login");
      return;
    }

    const tokenValid = await authStore.checkAndRefreshToken();
    if (!tokenValid) {
      router.push("/login");
      return;
    }

    // 服务端用量验证
    try {
      const precheckResult = await connectPrecheck({
        node_id: serversStore.currentServer?.id || 0,
        connection_mode: settingsStore.settings.connectionMode as
          | "tun"
          | "socks",
        client_version: "1.0.0",
      });

      // TS修复: 必须使用非空断言，因为 initSubModules 已调用
      _dailyLimits!.dailyUsage.value = {
        date: new Date().toISOString().split("T")[0],
        traffic: precheckResult.daily_traffic_used,
        time: precheckResult.daily_time_used,
      };

      if (!precheckResult.can_connect) {
        if (precheckResult.reject_reason?.includes("limit")) {
          _dailyLimits!.showPurchaseModal.value = true;
          _dailyLimits!.pendingConnectAfterPurchase.value = true;
        }
        error.value = precheckResult.reject_reason || "Connection denied";
        return;
      }
    } catch (e) {
      // 回退到本地验证
      const limitCheck = _dailyLimits!.checkDailyLimit();
      if (limitCheck.exceeded) {
        error.value = limitCheck.reason ?? null;
        return;
      }
    }

    if (!isHelperReady.value) {
      error.value = "System Extension required";
      return;
    }

    const server = serversStore.currentServer;
    if (!server) {
      error.value = "No server selected";
      return;
    }

    await requestLock.withLock("vpn-connect", async () => {
      // 记录操作时间并立即设置状态以响应 UI
      lastActionTime = Date.now();
      status.value = "connecting";
      isVpnBusy.value = true;
      isUserDisconnecting.value = false;
      error.value = null;
      resetStats();

      try {
        let dnsConfig: string = settingsStore.settings.dnsMode;
        if (
          settingsStore.settings.dnsMode === "custom" &&
          settingsStore.settings.customDns
        ) {
          dnsConfig = `custom:${settingsStore.settings.customDns}`;
        }

        await invoke("connect_hysteria", {
          serverId: server.id,
          domain: server.domain,
          port: server.port,
          password: server.password || "",
          mode: settingsStore.settings.connectionMode,
          serverMtu: settingsStore.settings.mtu,
          serverDns: dnsConfig,
        });

        // 短暂等待后同步一次状态
        await new Promise((resolve) => setTimeout(resolve, 500));
        await syncVpnStatus();

        if (status.value === ("connected" as VpnStatus)) {
          const isTunMode = settingsStore.settings.connectionMode === "tun";
          testConnectivity(!isTunMode);
        }
      } catch (e) {
        console.error("[VPN] Connect error:", e);
        error.value = String(e);
        status.value = "disconnected";
        isVpnBusy.value = false;
      }
    });
  }

  async function disconnect() {
    if (status.value === "disconnected") return;
    if (requestLock.isLocked("vpn-disconnect")) return;

    initSubModules();

    await requestLock.withLock("vpn-disconnect", async () => {
      lastActionTime = Date.now();
      status.value = "disconnecting"; // 立即设置 UI 状态
      isVpnBusy.value = true;
      isUserDisconnecting.value = true;
      _reconnect!.cancelReconnect();

      try {
        _dailyLimits!.accumulateUsage();
        await reportCurrentUsage();
        await invoke("disconnect_vpn");

        await new Promise((resolve) => setTimeout(resolve, 300));
        await syncVpnStatus();
      } catch (e) {
        console.error("[VPN] Disconnect error:", e);
      } finally {
        isVpnBusy.value = false;
      }
    });
  }

  async function cancelConnect() {
    if (!canCancel.value) return;
    isUserDisconnecting.value = true;
    await disconnect();
  }

  // ============ 辅助功能 ============
  async function testConnectivity(
    useProxy = true
  ): Promise<ConnectivityResult> {
    try {
      return await invoke<ConnectivityResult>("test_connectivity", {
        useProxy,
      });
    } catch (e) {
      return {
        success: false,
        latency_ms: null,
        error: String(e),
        test_url: "",
      };
    }
  }

  async function reportCurrentUsage() {
    const authStore = useAuthStore();
    const serversStore = useServersStore();
    if (!authStore.isAuthenticated || !serversStore.currentServer) return;
    if (stats.value.connectedTime <= 0) return;

    try {
      const connectedAtMs =
        connectedAt || Date.now() - stats.value.connectedTime * 1000;
      await reportUsage({
        node_id: serversStore.currentServer.id,
        traffic_download: stats.value.totalDownload,
        traffic_upload: stats.value.totalUpload,
        duration: stats.value.connectedTime,
        connected_at: new Date(connectedAtMs).toISOString(),
        disconnected_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error("Report usage failed:", e);
    }
  }

  // 计时器和检查逻辑
  function startConnectedTimeCounter() {
    stopConnectedTimeCounter();
    initSubModules();
    connectedTimeTimer = window.setInterval(() => {
      if (status.value === "connected") {
        stats.value.connectedTime = Math.floor(
          (Date.now() - connectedAt) / 1000
        );
        _dailyLimits!.checkRealTimeLimit(error);
      }
    }, 1000);
  }

  function stopConnectedTimeCounter() {
    if (connectedTimeTimer) {
      clearInterval(connectedTimeTimer);
      connectedTimeTimer = null;
    }
  }

  function resetStats() {
    stats.value = { ...DEFAULT_CONNECTION_STATS };
  }

  let realtimeUsageTimer: number | null = null;
  function startRealtimeUsageCheck() {
    stopRealtimeUsageCheck();
    initSubModules();
    realtimeUsageTimer = window.setInterval(async () => {
      if (status.value !== "connected") {
        stopRealtimeUsageCheck();
        return;
      }
      try {
        const usage = await getRealtimeUsage();
        _dailyLimits!.dailyUsage.value = {
          date: new Date().toISOString().split("T")[0],
          traffic: usage.daily_traffic_used,
          time: usage.daily_time_used,
        };
        if (usage.should_disconnect) {
          await disconnect();
          error.value = usage.disconnect_reason || "Usage limit exceeded";
          _dailyLimits!.showPurchaseModal.value = true;
        }
      } catch (e) {
        /* ignore */
      }
    }, 60000);
  }

  function stopRealtimeUsageCheck() {
    if (realtimeUsageTimer) {
      clearInterval(realtimeUsageTimer);
      realtimeUsageTimer = null;
    }
  }

  function cleanup() {
    stopHeartbeat(); // 清理心跳
    Object.values(listeners.value).forEach((u) => u?.());
    listeners.value = {
      log: null,
      traffic: null,
      latency: null,
      status: null,
      error: null,
      terminated: null,
    };
    stopConnectedTimeCounter();
    stopRealtimeUsageCheck();
    _monitor?.cleanup();
    _reconnect?.cancelReconnect();
    listenersInitialized = false;
  }

  // 包装函数 - TS修复: 添加非空断言
  function checkDailyLimit() {
    initSubModules();
    return _dailyLimits!.checkDailyLimit();
  }
  function checkUsageLimitsBeforeConnect() {
    initSubModules();
    return _dailyLimits!.checkUsageLimitsBeforeConnect();
  }
  async function connectWithLimitCheck() {
    initSubModules();
    return _dailyLimits!.connectWithLimitCheck(connect, error);
  }
  async function handlePurchaseSuccess() {
    initSubModules();
    return _dailyLimits!.handlePurchaseSuccess(connect);
  }
  function clearError() {
    error.value = null;
  }

  return {
    // State
    status,
    helperStatus,
    isVpnBusy,
    isHelperBusy,
    error,
    stats,
    // TS修复: Getter 返回值需使用 ! 断言
    get dailyUsage() {
      initSubModules();
      return _dailyLimits!.dailyUsage;
    },
    get showPurchaseModal() {
      initSubModules();
      return _dailyLimits!.showPurchaseModal;
    },
    get pendingConnectAfterPurchase() {
      initSubModules();
      return _dailyLimits!.pendingConnectAfterPurchase;
    },
    // Getters
    isConnected,
    isConnecting,
    isDisconnecting,
    isHelperReady,
    canConnect,
    canDisconnect,
    canCancel,
    canInstallHelper,
    canUninstallHelper,
    // Actions
    syncVpnStatus,
    startHeartbeat,
    stopHeartbeat,
    checkHelperStatus,
    installHelper,
    uninstallHelper,
    precheckTunPermission,
    connect,
    disconnect,
    cancelConnect,
    initEventListeners,
    cleanup,
    checkDailyLimit,
    checkUsageLimitsBeforeConnect,
    connectWithLimitCheck,
    handlePurchaseSuccess,
    clearError,
    testConnectivity,
  };
});
