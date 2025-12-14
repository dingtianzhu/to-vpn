// src/stores/vpn/constants.ts
// VPN Store 常量定义

import type { VpnStatus, HelperStatus } from "./types";

// ============ 存储键 ============

export const DAILY_USAGE_KEY = "daily_usage";

// ============ 用量限制 ============

/** 普通用户每日流量限制: 1GB */
export const USER_DAILY_TRAFFIC_LIMIT = 1 * 1024 * 1024 * 1024;

/** 普通用户每日时间限制: 2小时 */
export const USER_DAILY_TIME_LIMIT = 2 * 60 * 60;

// ============ 自动重连配置 ============

/** 最大重连尝试次数 */
export const RECONNECT_MAX_ATTEMPTS = 5;

/** 重连基础延迟 (1秒) */
export const RECONNECT_BASE_DELAY = 1000;

/** 重连最大延迟 (30秒) */
export const RECONNECT_MAX_DELAY = 30000;

// ============ 类型守卫 ============

export const VPN_STATUSES = [
    "disconnected",
    "connecting",
    "connected",
    "disconnecting",
    "error",
] as const;

export const HELPER_STATUSES = [
    "not_installed",
    "installed",
    "running",
    "error",
] as const;

/**
 * 检查是否为有效的 VPN 状态
 */
export function isValidVpnStatus(status: string): status is VpnStatus {
    return VPN_STATUSES.includes(status as VpnStatus);
}

/**
 * 检查是否为有效的 Helper 状态
 */
export function isValidHelperStatus(status: string): status is HelperStatus {
    return HELPER_STATUSES.includes(status as HelperStatus);
}

// ============ 默认值 ============

export const DEFAULT_CONNECTION_STATS = {
    ip: "",
    downloadSpeed: 0,
    uploadSpeed: 0,
    latency: 0,
    connectedTime: 0,
    totalDownload: 0,
    totalUpload: 0,
};
