import request from "@/utils/request";
import type { ResultData, LoginData } from "@/types/login";

// ============ 类型定义 ============

/** 验证码类型 */
export type CodeType = 1 | 2 | 3 | 4 | 5; // 1注册 2登录 3重置密码 4绑定手机 5绑定邮箱

/** 发送验证码参数 */
export interface SendCodeData {
  target: string; // 邮箱或手机号
  type: CodeType;
}

/** 注册参数 */
export interface RegisterData {
  username: string;
  email: string;
  password: string;
  code: string;
}

/** 重置密码参数 */
export interface ResetPasswordData {
  email: string;
  code: string;
  new_password: string;
}

/** 修改密码参数 */
export interface ChangePasswordData {
  old_password: string;
  new_password: string;
}

// ============ API 接口 ============

/** 发送验证码 */
export function sendCode(data: SendCodeData) {
  return request<null>({
    url: "/auth/send-code",
    method: "post",
    data,
  });
}

/** 用户注册 */
export function register(data: RegisterData) {
  return request<null>({
    url: "/auth/register",
    method: "post",
    data,
  });
}

/** 登录 */
export function login(data: LoginData) {
  return request<ResultData>({
    url: "/auth/login",
    method: "post",
    data,
  });
}

/** 登出 */
export function logout() {
  return request<null>({
    url: "/auth/logout",
    method: "post",
  });
}

/** 刷新 Token */
export function refreshToken(refresh_token: string) {
  return request<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  }>({
    url: "/auth/refresh",
    method: "post",
    data: { refresh_token },
  });
}

/** 重置密码（忘记密码） */
export function resetPassword(data: ResetPasswordData) {
  return request<null>({
    url: "/auth/reset-password",
    method: "post",
    data,
  });
}

/** 修改密码（已登录用户） */
export function changePassword(data: ChangePasswordData) {
  return request<null>({
    url: "/user/password",
    method: "put",
    data,
  });
}
