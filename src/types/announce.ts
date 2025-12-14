/**
 * 公告相关类型定义
 */

/** 公告类型 */
export type AnnouncementType = 'notice' | 'update' | 'maintenance'

/** 公告信息 */
export interface Announcement {
  id: number
  title: string
  content: string
  type: AnnouncementType
  priority: number
  created_at: string
}

/** 公告列表响应 */
export interface AnnouncementListResponse {
  list: Announcement[]
  total: number
  page: number
  page_size: number
}
