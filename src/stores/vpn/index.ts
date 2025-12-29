// src/stores/vpn/index.ts
// VPN 模块统一导出

// 类型导出
export type {
    VpnStatus,
    HelperStatus,
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
    DailyUsage,
    UsageLimitCheckResult,
    VpnEventListeners,
    ConnectionStats,
} from "./types";

// 常量导出
export {
    DAILY_USAGE_KEY,
    USER_DAILY_TRAFFIC_LIMIT,
    USER_DAILY_TIME_LIMIT,
    RECONNECT_MAX_ATTEMPTS,
    RECONNECT_BASE_DELAY,
    RECONNECT_MAX_DELAY,
    VPN_STATUSES,
    HELPER_STATUSES,
    isValidVpnStatus,
    isValidHelperStatus,
    DEFAULT_CONNECTION_STATS,
} from "./constants";

// Composables 导出
export { useDailyLimits } from "./useDailyLimits";
export { useVpnMonitor } from "./useVpnMonitor";
export { useVpnReconnect } from "./useVpnReconnect";
export { useLatencyMonitor } from "./useLatencyMonitor";
export { useModeSwitcher } from "./useModeSwitcher";

// 延迟监控类型导出
export type { LatencyMetrics, LatencyAnomalyResult } from "./useLatencyMonitor";
export { 
    DEFAULT_LATENCY_METRICS,
    calculateAverage,
    calculateJitter,
    detectLatencyAnomaly,
    updateMetricsFromSamples,
} from "./useLatencyMonitor";

// 模式切换器类型导出
export type { 
    ModeSwitchProgress, 
    ModeSwitchState, 
    ModeSwitchResult 
} from "./useModeSwitcher";
export {
    DEFAULT_MODE_SWITCH_STATE,
    isValidConnectionMode,
    getNextProgress,
    canStartSwitch,
} from "./useModeSwitcher";
