/**
 * 邀请相关类型定义
 */

/** 邀请码信息 */
export interface InviteCodeInfo {
  invite_code: string
  invite_url: string
  total_invited: number
  total_reward: number
}

/** 邀请记录状态 */
export enum InviteRecordStatus {
  Active = 1,
  Pending = 2
}

/** 邀请记录 */
export interface InviteRecord {
  id: number
  invited_user: string    // 脱敏后的用户标识
  reward: number
  status: InviteRecordStatus
  created_at: string
}

/** 邀请记录列表响应 */
export interface InviteRecordListResponse {
  list: InviteRecord[]
  total: number
  page: number
  page_size: number
}
