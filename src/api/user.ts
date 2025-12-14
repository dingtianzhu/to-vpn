import request from "@/utils/request";
import type { User } from "@/types/login";

/** 更新用户信息参数 */
export interface UpdateProfileData {
  nickname?: string;
  email?: string;
  avatar?: string;
}

/** 使用统计 */
export interface UsageStats {
  date: string;
  traffic_used: number;
  traffic_limit: number;
  time_used: number;
  time_limit: number;
  connections: number;
}

/** 使用上报参数 */
export interface UsageReportData {
  node_id: number;
  traffic_download: number;
  traffic_upload: number;
  duration: number;
  connected_at: string;
  disconnected_at: string;
}

/** 使用上报结果 */
export interface UsageReportResult {
  daily_traffic_used: number;
  daily_time_used: number;
  limit_exceeded: boolean;
}

/** 获取用户信息 */
export function getUserProfile() {
  return request<User>({
    url: "/user/profile",
    method: "get",
  });
}

/** 更新用户信息 */
export function updateUserProfile(data: UpdateProfileData) {
  return request<User>({
    url: "/user/profile",
    method: "put",
    data,
  });
}

/** 上传头像 */
export function uploadAvatar(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  return request<{ url: string }>({
    url: "/user/avatar",
    method: "post",
    data: formData,
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
}
/** 获取使用统计 */
export function getUserUsage(date?: string) {
  return request<UsageStats>({
    url: "/user/usage",
    method: "get",
    params: { date },
  });
}

/** 上报使用统计 */
export function reportUsage(data: UsageReportData) {
  return request<UsageReportResult>({
    url: "/user/usage/report",
    method: "post",
    data,
  });
}
