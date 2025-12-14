/**
 * 公告 API 模块
 */
import request from '@/utils/request'
import type { AnnouncementListResponse } from '@/types/announce'
import type { PaginationParams } from '@/types/user'

/** 获取公告列表 */
export function getAnnouncements(params?: PaginationParams): Promise<AnnouncementListResponse> {
  return request<AnnouncementListResponse>({
    url: '/announcements',
    method: 'get',
    params
  })
}
