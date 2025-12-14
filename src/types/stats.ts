/**
 * 统计相关类型定义
 */

/** 历史使用统计查询参数 */
export interface UsageHistoryParams {
  period?: 'today' | 'week' | 'month'
  page?: number
  page_size?: number
}

/** 历史使用统计项 */
export interface UsageHistoryItem {
  date: string
  download: number      // 下载流量（字节）
  upload: number        // 上传流量（字节）
  duration: number      // 连接时长（秒）
  connections: number   // 连接次数
}

/** 历史使用统计响应 */
export interface UsageHistoryResponse {
  list: UsageHistoryItem[]
  total: number
  page: number
  page_size: number
  summary: {
    total_download: number
    total_upload: number
    total_duration: number
    total_connections: number
  }
}

/** 流量趋势查询参数 */
export interface UsageTrendParams {
  period?: 'week' | 'month' | 'year'
  granularity?: 'hour' | 'day' | 'week'
}

/** 流量趋势数据 */
export interface UsageTrendData {
  labels: string[]
  download: number[]
  upload: number[]
  duration: number[]
}

/** 流量趋势响应 */
export interface UsageTrendResponse {
  data: UsageTrendData
  period: string
  granularity: string
}
