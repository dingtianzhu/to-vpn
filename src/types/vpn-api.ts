// src/types/vpn-api.ts
// VPN 连接相关 API 类型定义

/**
 * 连接前验证请求
 */
export interface ConnectPrecheckRequest {
    /** 要连接的节点 ID */
    node_id: number;
    /** 连接模式 */
    connection_mode: "tun" | "socks";
    /** 客户端版本 */
    client_version: string;
    /** 设备标识（可选） */
    device_id?: string;
}

/**
 * 连接前验证响应
 */
export interface ConnectPrecheckResponse {
    /** 是否允许连接 */
    can_connect: boolean;
    /** 拒绝原因（如果不允许） */
    reject_reason?: string;

    /** 当日已用流量（字节） */
    daily_traffic_used: number;
    /** 当日流量限制（字节），-1 表示无限 */
    daily_traffic_limit: number;
    /** 当日已用时间（秒） */
    daily_time_used: number;
    /** 当日时间限制（秒），-1 表示无限 */
    daily_time_limit: number;

    /** 剩余流量，-1 表示无限 */
    remaining_traffic: number;
    /** 剩余时间，-1 表示无限 */
    remaining_time: number;

    /** 用户等级 */
    user_tier: "free" | "vip" | "admin";

    /** 是否有权访问此节点 */
    node_allowed: boolean;
    /** 节点拒绝原因 */
    node_reject_reason?: string;

    /** 连接令牌（防止重放攻击） */
    connect_token?: string;
    /** 令牌有效期（秒） */
    token_expires_in?: number;
}

/**
 * 实时用量响应
 */
export interface RealtimeUsageResponse {
    /** 当日已用流量（字节） */
    daily_traffic_used: number;
    /** 当日流量限制（字节） */
    daily_traffic_limit: number;
    /** 当日已用时间（秒） */
    daily_time_used: number;
    /** 当日时间限制（秒） */
    daily_time_limit: number;
    /** 是否应该断开连接 */
    should_disconnect: boolean;
    /** 断开原因 */
    disconnect_reason?: string;
    /** 接近限制时的警告 */
    warning?: string;
}

/**
 * 增强的用量上报请求 (V2)
 */
export interface UsageReportRequestV2 {
    /** 节点 ID */
    node_id: number;
    /** 下载流量（字节） */
    traffic_download: number;
    /** 上传流量（字节） */
    traffic_upload: number;
    /** 连接时长（秒） */
    duration: number;
    /** 连接时间 ISO8601 */
    connected_at: string;
    /** 断开时间 ISO8601 */
    disconnected_at: string;
    /** 连接时获取的令牌 */
    connect_token?: string;
    /** 会话标识 */
    session_id?: string;
}

/**
 * 增强的用量上报响应 (V2)
 */
export interface UsageReportResponseV2 {
    /** 当日累计流量 */
    daily_traffic_used: number;
    /** 当日累计时间 */
    daily_time_used: number;
    /** 是否超过限制 */
    limit_exceeded: boolean;
    /** 是否应该断开连接 */
    should_disconnect: boolean;
    /** 断开原因 */
    disconnect_reason?: string;
    /** 剩余流量 */
    remaining_traffic: number;
    /** 剩余时间 */
    remaining_time: number;
}
