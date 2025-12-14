import request from "@/utils/request";
import type { ServerNode } from "@/types/server";

export type { ServerNode };

export interface GetVpnNodesParams {
  country?: string;
  status?: number;
}

export function getVpnNodes(params?: GetVpnNodesParams) {
  return request<ServerNode[]>({
    url: "/vpn/nodes",
    method: "post",
    data: params || {},
  });
}
