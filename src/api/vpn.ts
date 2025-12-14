/**
 * VPN 连接相关 API 模块
 * 包含服务端用量验证接口
 */
import request from "@/utils/request";
import type {
    ConnectPrecheckRequest,
    ConnectPrecheckResponse,
    RealtimeUsageResponse,
} from "@/types/vpn-api";

/**
 * 连接前验证
 * 在连接 VPN 之前调用此接口验证用户权限和用量
 *
 * @param data - 验证请求参数
 * @returns 验证结果，包含是否允许连接及用量信息
 */
export function connectPrecheck(
    data: ConnectPrecheckRequest
): Promise<ConnectPrecheckResponse> {
    return request<ConnectPrecheckResponse>({
        url: "/vpn/connect/precheck",
        method: "post",
        data,
    });
}

/**
 * 获取实时用量
 * 连接中定期调用此接口检查用量状态
 *
 * @returns 实时用量信息
 */
export function getRealtimeUsage(): Promise<RealtimeUsageResponse> {
    return request<RealtimeUsageResponse>({
        url: "/user/usage/realtime",
        method: "get",
    });
}

/**
 * 检查节点访问权限
 * 快速检查用户是否有权访问指定节点
 *
 * @param nodeId - 节点 ID
 * @returns 是否有权访问
 */
export async function checkNodeAccess(nodeId: number): Promise<boolean> {
    try {
        const result = await connectPrecheck({
            node_id: nodeId,
            connection_mode: "tun",
            client_version: "1.0.0",
        });
        return result.node_allowed;
    } catch (e) {
        console.error("Failed to check node access:", e);
        return false;
    }
}
