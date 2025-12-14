/**
 * 邀请 API 模块
 */
import request from '@/utils/request'
import type { InviteCodeInfo, InviteRecordListResponse } from '@/types/invite'
import type { PaginationParams } from '@/types/user'

/** 获取邀请码 */
export function getInviteCode(): Promise<InviteCodeInfo> {
  return request<InviteCodeInfo>({
    url: '/user/invite-code',
    method: 'get'
  })
}

/** 获取邀请记录 */
export function getInviteRecords(params?: PaginationParams): Promise<InviteRecordListResponse> {
  return request<InviteRecordListResponse>({
    url: '/user/invites',
    method: 'get',
    params
  })
}
