// src/stores/vpn/useVpnReconnect.ts
// VPN 自动重连模块

import { type Ref } from "vue";
import type { VpnStatus } from "./types";
import {
    RECONNECT_MAX_ATTEMPTS,
    RECONNECT_BASE_DELAY,
    RECONNECT_MAX_DELAY,
} from "./constants";
import { useLogsStore } from "@/stores/logs";
import { useSettingsStore } from "@/stores/settings";

/**
 * VPN 自动重连 Composable
 * 管理断线后的指数退避重连逻辑
 */
export function useVpnReconnect(
    connect: () => Promise<void>,
    status: Ref<VpnStatus>
) {
    // ============ 内部状态 ============
    let reconnectAttempts = 0;
    let reconnectTimer: number | null = null;

    /**
     * 调度重连
     * 使用指数退避策略
     */
    function scheduleReconnect(): void {
        if (reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
            console.log("Max reconnect attempts reached");
            reconnectAttempts = 0;
            return;
        }

        // 指数退避延迟
        const delay = Math.min(
            RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts),
            RECONNECT_MAX_DELAY
        );

        console.log(
            `Scheduling reconnect attempt ${reconnectAttempts + 1} in ${delay}ms`
        );
        useLogsStore().addLog(
            "info",
            `Reconnecting in ${Math.round(delay / 1000)}s...`
        );

        reconnectTimer = window.setTimeout(async () => {
            reconnectAttempts++;

            try {
                await connect();
                // 连接成功，重置计数
                if (status.value === "connected") {
                    reconnectAttempts = 0;
                    useLogsStore().addLog("info", "Reconnected successfully");
                }
            } catch (e) {
                console.error("Reconnect failed:", e);
                // 继续尝试
                const settingsStore = useSettingsStore();
                if (
                    settingsStore.settings.autoReconnect &&
                    status.value === "disconnected"
                ) {
                    scheduleReconnect();
                }
            }
        }, delay);
    }

    /**
     * 取消重连
     */
    function cancelReconnect(): void {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        reconnectAttempts = 0;
    }

    /**
     * 获取当前重连尝试次数
     */
    function getReconnectAttempts(): number {
        return reconnectAttempts;
    }

    /**
     * 检查是否应该触发重连
     */
    function shouldAutoReconnect(): boolean {
        const settingsStore = useSettingsStore();
        return (
            settingsStore.settings.autoReconnect &&
            status.value === "disconnected" &&
            reconnectAttempts < RECONNECT_MAX_ATTEMPTS
        );
    }

    return {
        scheduleReconnect,
        cancelReconnect,
        getReconnectAttempts,
        shouldAutoReconnect,
    };
}
