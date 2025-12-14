/**
 * 用户相关类型定义
 * 
 * 注意：核心 User 类型定义在 login.ts 中
 * 此文件包含用户相关的扩展类型
 */

// 从 login.ts 重新导出核心用户类型
export {
  type User,
  type UserRole,
  type UserLimitType,
  UserRoles,
  hasRole,
  hasAnyRole,
  isAdmin,
  isVip,
  getUserLimitType
} from './login'

/** 分页参数 */
export interface PaginationParams {
  page?: number
  page_size?: number
}
