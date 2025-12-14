/**
 * 统计 API 模块
 */
import request from '@/utils/request'
import type {
  UsageHistoryParams,
  UsageHistoryResponse,
  UsageTrendParams,
  UsageTrendResponse
} from '@/types/stats'

/** 获取历史使用统计 */
export function getUsageHistory(params?: UsageHistoryParams): Promise<UsageHistoryResponse> {
  return request<UsageHistoryResponse>({
    url: '/user/usage/history',
    method: 'get',
    params
  })
}

/** 获取流量趋势数据 */
export function getUsageTrend(params?: UsageTrendParams): Promise<UsageTrendResponse> {
  return request<UsageTrendResponse>({
    url: '/user/usage/trend',
    method: 'get',
    params
  })
}
