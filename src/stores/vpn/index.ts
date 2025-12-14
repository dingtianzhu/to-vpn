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
