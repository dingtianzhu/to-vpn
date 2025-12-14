// src/stores/vpn/useDailyLimits.ts
// 每日用量限制管理模块

import { ref, type Ref } from "vue";
import type { DailyUsage, UsageLimitCheckResult, ConnectionStats } from "./types";
import {
    DAILY_USAGE_KEY,
    USER_DAILY_TRAFFIC_LIMIT,
    USER_DAILY_TIME_LIMIT,
} from "./constants";
import { useAuthStore } from "@/stores/auth";
import router from "@/router";

/**
 * 每日用量限制 Composable
 * 管理用户每日流量和时间限制
 */
export function useDailyLimits(
    stats: Ref<ConnectionStats>,
    disconnect: () => Promise<void>
) {
    // ============ State ============
    const dailyUsage = ref<DailyUsage>(loadDailyUsage());
    const showPurchaseModal = ref(false);
    const pendingConnectAfterPurchase = ref(false);

    // ============ 内部函数 ============

    /**
     * 从 localStorage 加载每日用量
     */
    function loadDailyUsage(): DailyUsage {
        const today = new Date().toISOString().split("T")[0];
        const stored = localStorage.getItem(DAILY_USAGE_KEY);
        if (stored) {
            try {
                const data = JSON.parse(stored) as DailyUsage;
                if (data.date === today) return data;
            } catch (e) {
                console.error("Failed to parse daily usage:", e);
            }
        }
        return { date: today, traffic: 0, time: 0 };
    }

    /**
     * 保存每日用量到 localStorage
     */
    function saveDailyUsage(): void {
        try {
            localStorage.setItem(DAILY_USAGE_KEY, JSON.stringify(dailyUsage.value));
        } catch (e) {
            console.error("Failed to save daily usage:", e);
        }
    }

    /**
     * 检查是否超过每日限制
     */
    function checkDailyLimit(): { exceeded: boolean; reason?: string } {
        const authStore = useAuthStore();
        if (authStore.limitType !== "user") return { exceeded: false };

        const trafficLimit =
            authStore.dailyTrafficLimit || USER_DAILY_TRAFFIC_LIMIT;
        const timeLimit = authStore.dailyTimeLimit || USER_DAILY_TIME_LIMIT;

        if (trafficLimit > 0 && dailyUsage.value.traffic >= trafficLimit) {
            return { exceeded: true, reason: `Daily traffic limit reached` };
        }
        if (timeLimit > 0 && dailyUsage.value.time >= timeLimit) {
            return { exceeded: true, reason: `Daily time limit reached` };
        }
        return { exceeded: false };
    }

    /**
     * 连接前检查用量限制
     * Admin/VIP 用户直接返回 canConnect=true
     * 普通用户检查流量和时间限制
     */
    function checkUsageLimitsBeforeConnect(): UsageLimitCheckResult {
        const authStore = useAuthStore();

        // Admin 用户跳过所有限制检查
        if (authStore.isAdmin) {
            return {
                canConnect: true,
                trafficExceeded: false,
                timeExceeded: false,
                remainingTraffic: -1, // -1 表示无限
                remainingTime: -1,
            };
        }

        // VIP 用户也跳过限制检查
        if (authStore.isVip) {
            return {
                canConnect: true,
                trafficExceeded: false,
                timeExceeded: false,
                remainingTraffic: -1,
                remainingTime: -1,
            };
        }

        // 普通用户检查限制
        const trafficLimit =
            authStore.dailyTrafficLimit || USER_DAILY_TRAFFIC_LIMIT;
        const timeLimit = authStore.dailyTimeLimit || USER_DAILY_TIME_LIMIT;

        const trafficUsed = dailyUsage.value.traffic;
        const timeUsed = dailyUsage.value.time;

        const trafficExceeded = trafficLimit > 0 && trafficUsed >= trafficLimit;
        const timeExceeded = timeLimit > 0 && timeUsed >= timeLimit;

        const remainingTraffic =
            trafficLimit > 0 ? Math.max(0, trafficLimit - trafficUsed) : -1;
        const remainingTime =
            timeLimit > 0 ? Math.max(0, timeLimit - timeUsed) : -1;

        let reason: string | undefined;
        if (trafficExceeded && timeExceeded) {
            reason = "Daily traffic and time limits exceeded";
        } else if (trafficExceeded) {
            reason = "Daily traffic limit exceeded";
        } else if (timeExceeded) {
            reason = "Daily time limit exceeded";
        }

        return {
            canConnect: !trafficExceeded && !timeExceeded,
            trafficExceeded,
            timeExceeded,
            remainingTraffic,
            remainingTime,
            reason,
        };
    }

    /**
     * 实时检查限制（连接中定期调用）
     */
    function checkRealTimeLimit(errorRef: Ref<string | null>): void {
        const authStore = useAuthStore();
        if (authStore.limitType !== "user") return;

        const currentTraffic =
            dailyUsage.value.traffic +
            stats.value.totalDownload +
            stats.value.totalUpload;
        const currentTime = dailyUsage.value.time + stats.value.connectedTime;

        const trafficLimit =
            authStore.dailyTrafficLimit || USER_DAILY_TRAFFIC_LIMIT;
        const timeLimit = authStore.dailyTimeLimit || USER_DAILY_TIME_LIMIT;

        if (
            (trafficLimit > 0 && currentTraffic >= trafficLimit) ||
            (timeLimit > 0 && currentTime >= timeLimit)
        ) {
            disconnect();
            errorRef.value = "Usage limit reached. Upgrade to Pro.";
        }
    }

    /**
     * 购买成功后的处理
     * 刷新用户信息并自动连接
     */
    async function handlePurchaseSuccess(connect: () => Promise<void>): Promise<void> {
        const authStore = useAuthStore();

        // 刷新用户信息
        await authStore.refreshUserInfo();

        // 关闭购买弹框
        showPurchaseModal.value = false;

        // 如果有待连接标志，自动连接
        if (pendingConnectAfterPurchase.value) {
            pendingConnectAfterPurchase.value = false;
            await connect();
        }
    }

    /**
     * 带限制检查的连接方法
     * 如果限制超出，显示购买弹框而不是直接连接
     */
    async function connectWithLimitCheck(
        connect: () => Promise<void>,
        errorRef: Ref<string | null>
    ): Promise<void> {
        const authStore = useAuthStore();

        // 未登录时跳转登录页
        if (authStore.needsLogin) {
            router.push("/login?pendingConnect=true");
            return;
        }

        // 检查用量限制
        const limitCheck = checkUsageLimitsBeforeConnect();

        if (!limitCheck.canConnect) {
            // 限制超出，显示购买弹框
            errorRef.value = limitCheck.reason || "Usage limit exceeded";
            pendingConnectAfterPurchase.value = true;
            showPurchaseModal.value = true;
            return;
        }

        // 限制满足，正常连接
        await connect();
    }

    /**
     * 累加当前会话用量到每日用量
     */
    function accumulateUsage(): void {
        dailyUsage.value.traffic +=
            stats.value.totalDownload + stats.value.totalUpload;
        dailyUsage.value.time += stats.value.connectedTime;
        saveDailyUsage();
    }

    return {
        // State
        dailyUsage,
        showPurchaseModal,
        pendingConnectAfterPurchase,

        // Functions
        loadDailyUsage,
        saveDailyUsage,
        checkDailyLimit,
        checkUsageLimitsBeforeConnect,
        checkRealTimeLimit,
        handlePurchaseSuccess,
        connectWithLimitCheck,
        accumulateUsage,
    };
}
