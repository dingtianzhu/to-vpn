// src/stores/vpn/useVpnMonitor.ts
// VPN 流量和延迟监控模块

import { type Ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import type { ConnectionStats, VpnStatus } from "./types";
import { useServersStore } from "@/stores/servers";

/**
 * VPN 监控 Composable
 * 管理流量监控和延迟检测
 */
export function useVpnMonitor(
    stats: Ref<ConnectionStats>,
    status: Ref<VpnStatus>
) {
    // ============ 内部状态 ============
    let trafficWs: WebSocket | null = null;
    let pingTimer: number | null = null;

    // ============ 流量监控 ============

    /**
     * 启动 WebSocket 流量监控
     * 连接 sing-box 的流量 API
     */
    function startTrafficMonitor(): void {
        if (trafficWs) return;

        try {
            // 连接 sing-box 流量 websocket
            trafficWs = new WebSocket("ws://127.0.0.1:9090/traffic?token=");

            trafficWs.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    // sing-box /traffic 返回 { up: bytes/s, down: bytes/s }
                    if (
                        data &&
                        typeof data.up === "number" &&
                        typeof data.down === "number"
                    ) {
                        stats.value.uploadSpeed = data.up;
                        stats.value.downloadSpeed = data.down;
                    }
                } catch (e) {
                    console.error("Failed to parse traffic data", e);
                }
            };

            trafficWs.onerror = (e) => {
                console.error("Traffic WS error:", e);
            };

            trafficWs.onclose = () => {
                trafficWs = null;
            };
        } catch (e) {
            console.error("Failed to connect traffic WS:", e);
        }
    }

    /**
     * 停止流量监控
     */
    function stopTrafficMonitor(): void {
        if (trafficWs) {
            trafficWs.close();
            trafficWs = null;
        }
    }

    // ============ 延迟检测 ============

    /**
     * 测试当前服务器延迟
     */
    async function pingCurrentServer(): Promise<void> {
        const serversStore = useServersStore();
        if (!serversStore.currentServer || status.value !== "connected") return;

        try {
            // 使用后端实现的 tcp ping
            const latency = await invoke<number>("ping_server", {
                host: serversStore.currentServer.domain,
                port: serversStore.currentServer.port,
            });
            stats.value.latency = latency;
        } catch (e) {
            console.error("Ping failed:", e);
            stats.value.latency = 999;
        }
    }

    /**
     * 启动延迟轮询
     * 每 5 秒测试一次延迟
     */
    function startPingLoop(): void {
        if (pingTimer) return;
        pingCurrentServer(); // 立即执行一次
        pingTimer = window.setInterval(pingCurrentServer, 5000); // 每5秒一次
    }

    /**
     * 停止延迟轮询
     */
    function stopPingLoop(): void {
        if (pingTimer) {
            clearInterval(pingTimer);
            pingTimer = null;
        }
    }

    /**
     * 清理所有监控资源
     */
    function cleanup(): void {
        stopTrafficMonitor();
        stopPingLoop();
    }

    return {
        startTrafficMonitor,
        stopTrafficMonitor,
        pingCurrentServer,
        startPingLoop,
        stopPingLoop,
        cleanup,
    };
}
