/** 用户信息 */
export interface User {
  id: number;
  uuid: string;
  username: string;
  email: string;
  nickname: string;
  avatar: string;
  roles: string[];
  // 会员相关字段（可选，后端返回）
  vip_expire_at?: string; // VIP过期时间 ISO格式
  daily_traffic_limit?: number; // 每日流量限制(bytes)，0表示无限制
  daily_time_limit?: number; // 每日时长限制(秒)，0表示无限制
  created_at?: string;
  updated_at?: string;
}

/** 登录接口返回数据 */
export interface ResultData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: User;
}

/** 登录请求参数 */
export interface LoginData {
  account: string;
  password: string;
}

/** 用户角色常量 */
export const UserRoles = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  ADMINISTRATOR: "administrator", // 兼容不同命名
  VIP: "vip",
  USER: "user",
  GUEST: "guest",
} as const;

export type UserRole = (typeof UserRoles)[keyof typeof UserRoles];

/** 用户限制类型 */
export type UserLimitType = "none" | "vip" | "user";

/** 角色判断辅助函数 */
export function hasRole(user: User | null, role: UserRole): boolean {
  return user?.roles?.includes(role) ?? false;
}

export function hasAnyRole(user: User | null, roles: UserRole[]): boolean {
  return roles.some((role) => hasRole(user, role));
}

export function isAdmin(user: User | null): boolean {
  // 兼容多种管理员角色命名
  return hasAnyRole(user, [UserRoles.SUPER_ADMIN, UserRoles.ADMIN, UserRoles.ADMINISTRATOR]);
}

export function isVip(user: User | null): boolean {
  if (!user) return false;
  // 检查是否有 VIP 角色
  if (!user.roles.includes(UserRoles.VIP)) return false;
  // 检查 VIP 是否过期
  if (user.vip_expire_at) {
    return new Date(user.vip_expire_at) > new Date();
  }
  return true;
}

/** 获取用户限制类型 */
export function getUserLimitType(user: User | null): UserLimitType {
  if (!user) return "user"; // 未登录视为普通用户限制
  if (isAdmin(user)) return "none";
  if (isVip(user)) return "vip";
  return "user";
}
