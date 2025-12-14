/**
 * 统计状态管理 Store
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getUserUsage, type UsageStats } from '@/api/user'
import { getUsageHistory, getUsageTrend } from '@/api/stats'
import type {
  UsageHistoryParams,
  UsageHistoryItem,
  UsageTrendParams,
  UsageTrendData
} from '@/types/stats'
import { formatError } from '@/utils/error'

export const useStatsStore = defineStore('stats', () => {
  // State
  const todayStats = ref<UsageStats | null>(null)
  const historyRecords = ref<UsageHistoryItem[]>([])
  const trendData = ref<UsageTrendData | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  
  // 历史记录分页信息
  const historyTotal = ref(0)
  const historyPage = ref(1)
  const historyPageSize = ref(10)
  
  // 汇总信息
  const historySummary = ref<{
    total_download: number
    total_upload: number
    total_duration: number
    total_connections: number
  } | null>(null)

  /**
   * 加载今日统计数据
   */
  async function loadTodayStats(): Promise<void> {
    try {
      isLoading.value = true
      error.value = null
      todayStats.value = await getUserUsage()
    } catch (e) {
      error.value = formatError(e)
      console.error('Failed to load today stats:', e)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 加载历史使用记录
   */
  async function loadHistory(params?: UsageHistoryParams): Promise<void> {
    try {
      isLoading.value = true
      error.value = null
      
      const response = await getUsageHistory(params)
      historyRecords.value = response.list
      historyTotal.value = response.total
      historyPage.value = response.page
      historyPageSize.value = response.page_size
      historySummary.value = response.summary
    } catch (e) {
      error.value = formatError(e)
      console.error('Failed to load history:', e)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 加载流量趋势数据
   */
  async function loadTrend(params?: UsageTrendParams): Promise<void> {
    try {
      isLoading.value = true
      error.value = null
      
      const response = await getUsageTrend(params)
      trendData.value = response.data
    } catch (e) {
      error.value = formatError(e)
      console.error('Failed to load trend:', e)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 清除错误状态
   */
  function clearError(): void {
    error.value = null
  }

  /**
   * 重置所有状态
   */
  function reset(): void {
    todayStats.value = null
    historyRecords.value = []
    trendData.value = null
    isLoading.value = false
    error.value = null
    historyTotal.value = 0
    historyPage.value = 1
    historySummary.value = null
  }

  return {
    // State
    todayStats,
    historyRecords,
    trendData,
    isLoading,
    error,
    historyTotal,
    historyPage,
    historyPageSize,
    historySummary,
    
    // Actions
    loadTodayStats,
    loadHistory,
    loadTrend,
    clearError,
    reset
  }
})
