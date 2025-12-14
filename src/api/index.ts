/**
 * API 模块统一导出
 * 集中导出所有 API 接口，方便其他模块引用
 */

// 认证相关 API
export {
  sendCode,
  register,
  login,
  logout,
  refreshToken,
  resetPassword,
  changePassword,
} from './auth'
export type {
  CodeType,
  SendCodeData,
  RegisterData,
  ResetPasswordData,
  ChangePasswordData,
} from './auth'

// 服务器节点相关 API
export { getVpnNodes } from './server'
export type { GetVpnNodesParams } from './server'

// 用户相关 API
export {
  getUserProfile,
  updateUserProfile,
  uploadAvatar,
  getUserUsage,
  reportUsage,
} from './user'
export type {
  UpdateProfileData,
  UsageStats,
  UsageReportData,
  UsageReportResult,
} from './user'

// 统计相关 API
export { getUsageHistory, getUsageTrend } from './stats'

// 套餐/订阅相关 API
export { getPlans, getSubscription, createOrder, getOrderStatus } from './plan'

// 设备管理 API
export { getDevices, removeDevice } from './device'

// 公告 API
export { getAnnouncements } from './announce'

// 邀请 API
export { getInviteCode, getInviteRecords } from './invite'

// VPN 连接相关 API
export { connectPrecheck, getRealtimeUsage, checkNodeAccess } from './vpn'
export type {
  ConnectPrecheckRequest,
  ConnectPrecheckResponse,
  RealtimeUsageResponse,
} from '@/types/vpn-api'
