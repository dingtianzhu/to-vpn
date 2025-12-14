// src/stores/vpn/types.ts
// VPN Store 类型定义

import type { UnlistenFn } from "@tauri-apps/api/event";

// ============ VPN 状态类型 ============

export type VpnStatus =
    | "disconnected"
    | "connecting"
    | "connected"
    | "disconnecting"
    | "error";

export type HelperStatus =
    | "not_installed"
    | "installed"
    | "running"
    | "error";

// ============ 事件类型 ============

export interface LogEvent {
    level: string;
    message: string;
    timestamp: number;
}

export interface TrafficEvent {
    download_bytes: number;
    upload_bytes: number;
    download_speed: number;
    upload_speed: number;
}

export interface LatencyEvent {
    latency_ms: number;
}

export interface VpnStatusEvent {
    status: string;
    server_id: number | null;
    connected_at: number | null;
}

export interface VpnConnectionErrorEvent {
    error: string;
    fatal: boolean;
}

export interface VpnProcessTerminatedEvent {
    reason: string;
    exit_code: number;
}

// ============ API 响应类型 ============

export interface HelperResult {
    success: boolean;
    message: string;
}

export interface HelperStatusResult {
    status: string;
}

export interface TunPrecheckResult {
    singbox_installed: boolean;
    sudo_cached: boolean;
    will_prompt: boolean;
    platform: string;
}

export interface VpnStatusResult {
    status: string;
    server_id: number | null;
    connected_at: number | null;
}

export interface ConnectivityResult {
    success: boolean;
    latency_ms: number | null;
    error: string | null;
    test_url: string;
}

// ============ 每日用量类型 ============

export interface DailyUsage {
    date: string;
    traffic: number;
    time: number;
}

export interface UsageLimitCheckResult {
    canConnect: boolean;
    trafficExceeded: boolean;
    timeExceeded: boolean;
    remainingTraffic: number;
    remainingTime: number;
    reason?: string;
}

// ============ 事件监听器类型 ============

export interface VpnEventListeners {
    log: UnlistenFn | null;
    traffic: UnlistenFn | null;
    latency: UnlistenFn | null;
    status: UnlistenFn | null;
    error: UnlistenFn | null;
    terminated: UnlistenFn | null;
}

// ============ 连接统计类型 ============

export interface ConnectionStats {
    ip: string;
    downloadSpeed: number;
    uploadSpeed: number;
    latency: number;
    connectedTime: number;
    totalDownload: number;
    totalUpload: number;
}
