<template>
  <div class="h-full flex flex-col bg-[var(--vpn-bg)] overflow-y-auto">
    <!-- macOS 风格头部 -->
    <div class="px-6 pt-8 pb-4 titlebar-drag">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold tracking-tight text-[var(--vpn-text)]">流量统计</h1>
        <div class="flex gap-2 titlebar-no-drag">
          <button 
            v-for="period in periods" 
            :key="period.value"
            :class="[
              'px-3 py-1.5 text-[12px] font-medium rounded-lg transition-all',
              selectedPeriod === period.value 
                ? 'bg-[var(--vpn-primary)] text-white' 
                : 'text-[var(--vpn-text-secondary)] hover:bg-[var(--vpn-primary)]/10'
            ]"
            @click="selectedPeriod = period.value"
          >
            {{ period.label }}
          </button>
        </div>
      </div>
    </div>

    <div class="flex-1 px-6 pb-8 space-y-6">
      <!-- 错误提示 -->
      <div v-if="statsStore.error" class="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
              <svg class="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
            </div>
            <span class="text-[13px] text-red-500">{{ statsStore.error }}</span>
          </div>
          <button 
            @click="loadAllData"
            class="px-3 py-1.5 text-[12px] font-medium text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            重试
          </button>
        </div>
      </div>

      <!-- 加载状态 -->
      <div v-if="statsStore.isLoading && !hasData" class="flex flex-col items-center justify-center py-16">
        <div class="w-8 h-8 border-2 border-[var(--vpn-primary)]/30 border-t-[var(--vpn-primary)] rounded-full animate-spin mb-4"></div>
        <span class="text-[13px] text-[var(--vpn-text-secondary)]">加载中...</span>
      </div>

      <!-- 今日概览 -->
      <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-2xl shadow-sm p-5">
        <h3 class="text-[11px] font-bold text-[var(--vpn-muted)] uppercase tracking-wider mb-4">今日概览</h3>
        
        <div class="grid grid-cols-2 gap-4">
          <!-- 下载流量 -->
          <div class="bg-[var(--vpn-bg)] rounded-xl p-4 border border-[var(--vpn-border)]">
            <div class="flex items-center gap-2 mb-2">
              <div class="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"/>
                </svg>
              </div>
              <span class="text-[11px] text-[var(--vpn-text-secondary)] uppercase tracking-wider">下载</span>
            </div>
            <p class="text-[18px] font-semibold text-[var(--vpn-text)]">{{ formatBytes(todayDownload) }}</p>
          </div>

          <!-- 上传流量 -->
          <div class="bg-[var(--vpn-bg)] rounded-xl p-4 border border-[var(--vpn-border)]">
            <div class="flex items-center gap-2 mb-2">
              <div class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/>
                </svg>
              </div>
              <span class="text-[11px] text-[var(--vpn-text-secondary)] uppercase tracking-wider">上传</span>
            </div>
            <p class="text-[18px] font-semibold text-[var(--vpn-text)]">{{ formatBytes(todayUpload) }}</p>
          </div>

          <!-- 连接时长 -->
          <div class="bg-[var(--vpn-bg)] rounded-xl p-4 border border-[var(--vpn-border)]">
            <div class="flex items-center gap-2 mb-2">
              <div class="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <svg class="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
              <span class="text-[11px] text-[var(--vpn-text-secondary)] uppercase tracking-wider">时长</span>
            </div>
            <p class="text-[18px] font-semibold text-[var(--vpn-text)]">{{ formatDuration(todayDuration) }}</p>
          </div>

          <!-- 连接次数 -->
          <div class="bg-[var(--vpn-bg)] rounded-xl p-4 border border-[var(--vpn-border)]">
            <div class="flex items-center gap-2 mb-2">
              <div class="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <svg class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
              </div>
              <span class="text-[11px] text-[var(--vpn-text-secondary)] uppercase tracking-wider">连接</span>
            </div>
            <p class="text-[18px] font-semibold text-[var(--vpn-text)]">{{ todayConnections }} 次</p>
          </div>
        </div>
      </div>

      <!-- 流量趋势图表 -->
      <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-2xl shadow-sm overflow-hidden">
        <div class="px-5 pt-5 pb-3 flex items-center justify-between">
          <h3 class="text-[11px] font-bold text-[var(--vpn-muted)] uppercase tracking-wider">流量趋势</h3>
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-blue-500"></span>
              <span class="text-[10px] text-[var(--vpn-text-secondary)]">下载</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span class="text-[10px] text-[var(--vpn-text-secondary)]">上传</span>
            </div>
          </div>
        </div>
        <div class="px-5 pb-5">
          <div class="h-[180px] bg-[var(--vpn-bg)] rounded-xl border border-[var(--vpn-border)] p-4">
            <canvas ref="chartCanvas" class="w-full h-full"></canvas>
          </div>
        </div>
      </div>

      <!-- 使用配额 -->
      <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-2xl shadow-sm p-5">
        <h3 class="text-[11px] font-bold text-[var(--vpn-muted)] uppercase tracking-wider mb-4">使用配额</h3>
        
        <div class="space-y-4">
          <!-- 流量配额 -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <div class="w-6 h-6 rounded-md bg-blue-500/10 flex items-center justify-center">
                  <svg class="w-3 h-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/>
                  </svg>
                </div>
                <span class="text-[12px] text-[var(--vpn-text-secondary)]">流量配额</span>
              </div>
              <span class="text-[12px] text-[var(--vpn-text)]">
                {{ formatBytes(quotaStats.trafficUsed) }} / 
                {{ quotaStats.trafficLimit < 0 ? '无限制' : formatBytes(quotaStats.trafficLimit) }}
              </span>
            </div>
            <div class="h-2 bg-[var(--vpn-bg)] rounded-full overflow-hidden">
              <div 
                class="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-blue-500 to-blue-400"
                :style="{ width: `${trafficPercent}%` }"
              ></div>
            </div>
          </div>

          <!-- 时长配额 -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <div class="w-6 h-6 rounded-md bg-purple-500/10 flex items-center justify-center">
                  <svg class="w-3 h-3 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
                <span class="text-[12px] text-[var(--vpn-text-secondary)]">时长配额</span>
              </div>
              <span class="text-[12px] text-[var(--vpn-text)]">
                {{ formatDuration(quotaStats.timeUsed) }} / 
                {{ quotaStats.timeLimit < 0 ? '无限制' : formatDuration(quotaStats.timeLimit) }}
              </span>
            </div>
            <div class="h-2 bg-[var(--vpn-bg)] rounded-full overflow-hidden">
              <div 
                class="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-purple-500 to-purple-400"
                :style="{ width: `${timePercent}%` }"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 历史记录 -->
      <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-2xl shadow-sm overflow-hidden">
        <h3 class="text-[11px] font-bold text-[var(--vpn-muted)] uppercase tracking-wider px-5 pt-5 pb-3">
          使用记录
        </h3>
        
        <div class="divide-y divide-[var(--vpn-border)]">
          <div 
            v-for="record in statsStore.historyRecords" 
            :key="record.date" 
            class="flex items-center justify-between px-5 py-3.5 hover:bg-[var(--vpn-card-hover)] transition-colors"
          >
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-slate-500/10 flex items-center justify-center">
                <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
              </div>
              <div>
                <p class="text-[13px] font-medium text-[var(--vpn-text)]">{{ record.date }}</p>
                <p class="text-[11px] text-[var(--vpn-text-secondary)]">{{ record.connections }} 次连接</p>
              </div>
            </div>
            <div class="text-right">
              <p class="text-[13px] font-medium text-[var(--vpn-text)]">{{ formatBytes(record.download + record.upload) }}</p>
              <p class="text-[11px] text-[var(--vpn-text-secondary)]">{{ formatDuration(record.duration) }}</p>
            </div>
          </div>
          
          <!-- 空状态 -->
          <div v-if="statsStore.historyRecords.length === 0 && !statsStore.isLoading" class="px-5 py-12 text-center">
            <div class="w-12 h-12 rounded-2xl bg-slate-500/10 flex items-center justify-center mx-auto mb-3">
              <svg class="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
              </svg>
            </div>
            <p class="text-[13px] text-[var(--vpn-text-secondary)]">暂无使用记录</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>


<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useStatsStore } from '@/stores/stats'
import { useAuthStore } from '@/stores/auth'
import { storeToRefs } from 'pinia'

// 时间周期选项
const periods = [
  { label: '今日', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
] as const

type PeriodValue = (typeof periods)[number]['value']

const selectedPeriod = ref<PeriodValue>('today')
const chartCanvas = ref<HTMLCanvasElement | null>(null)

const statsStore = useStatsStore()
const authStore = useAuthStore()
const { currentUser } = storeToRefs(authStore)

// 是否有数据
const hasData = computed(
  () =>
    statsStore.todayStats !== null ||
    statsStore.historyRecords.length > 0 ||
    statsStore.trendData !== null
)

// 今日统计数据
const todayDownload = computed(() => {
  if (statsStore.todayStats) {
    return statsStore.todayStats.traffic_used / 2 // 假设下载占一半
  }
  return 0
})

const todayUpload = computed(() => {
  if (statsStore.todayStats) {
    return statsStore.todayStats.traffic_used / 2 // 假设上传占一半
  }
  return 0
})

const todayDuration = computed(() => {
  return statsStore.todayStats?.time_used || 0
})

const todayConnections = computed(() => {
  return statsStore.todayStats?.connections || 0
})

// 配额统计 - 从用户信息获取真实限制
const quotaStats = computed(() => {
  const trafficUsed = statsStore.todayStats?.traffic_used || 0
  const timeUsed = statsStore.todayStats?.time_used || 0

  // 从用户信息获取配额限制，-1 表示无限制
  const trafficLimit = currentUser.value?.daily_traffic_limit ?? 1 * 1024 * 1024 * 1024 // 默认 1GB
  const timeLimit = currentUser.value?.daily_time_limit ?? 2 * 60 * 60 // 默认 2小时

  return {
    trafficUsed,
    trafficLimit: trafficLimit === 0 ? -1 : trafficLimit, // 0 表示无限制
    timeUsed,
    timeLimit: timeLimit === 0 ? -1 : timeLimit, // 0 表示无限制
  }
})

const trafficPercent = computed(() => {
  if (quotaStats.value.trafficLimit <= 0) return 0
  return Math.min(100, (quotaStats.value.trafficUsed / quotaStats.value.trafficLimit) * 100)
})

const timePercent = computed(() => {
  if (quotaStats.value.timeLimit <= 0) return 0
  return Math.min(100, (quotaStats.value.timeUsed / quotaStats.value.timeLimit) * 100)
})

// 格式化字节
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 0) return '无限制'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 格式化时长
function formatDuration(seconds: number): string {
  if (seconds < 0) return '无限制'
  if (seconds === 0) return '0秒'
  if (seconds < 60) return `${seconds}秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分${seconds % 60}秒`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}小时${minutes}分`
}

// 加载所有数据
async function loadAllData() {
  statsStore.clearError()
  await Promise.all([
    statsStore.loadTodayStats(),
    statsStore.loadHistory({ period: selectedPeriod.value }),
    statsStore.loadTrend({
      period: selectedPeriod.value === 'today' ? 'week' : selectedPeriod.value,
    }),
  ])
  setTimeout(drawChart, 100)
}

// 绘制图表
function drawChart() {
  if (!chartCanvas.value) return

  const ctx = chartCanvas.value.getContext('2d')
  if (!ctx) return

  const canvas = chartCanvas.value
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  ctx.scale(dpr, dpr)

  ctx.clearRect(0, 0, rect.width, rect.height)

  // 使用趋势数据或历史记录
  const trendData = statsStore.trendData
  const historyData = statsStore.historyRecords.slice(0, 7).reverse()

  let data: { download: number; upload: number }[] = []

  if (trendData && trendData.download.length > 0) {
    data = trendData.download.map((d, i) => ({
      download: d,
      upload: trendData.upload[i] || 0,
    }))
  } else if (historyData.length > 0) {
    data = historyData.map((r) => ({
      download: r.download,
      upload: r.upload,
    }))
  }

  if (data.length === 0) {
    // 绘制空状态
    ctx.fillStyle = 'rgba(148, 163, 184, 0.5)'
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('暂无数据', rect.width / 2, rect.height / 2)
    return
  }

  const padding = { top: 20, right: 20, bottom: 30, left: 50 }
  const chartWidth = rect.width - padding.left - padding.right
  const chartHeight = rect.height - padding.top - padding.bottom
  const barWidth = Math.min(20, chartWidth / data.length / 3)
  const barGap = 4
  const maxValue = Math.max(...data.map((d) => Math.max(d.download, d.upload))) || 1

  // 绘制网格线
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)'
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartHeight / 4) * i
    ctx.beginPath()
    ctx.moveTo(padding.left, y)
    ctx.lineTo(rect.width - padding.right, y)
    ctx.stroke()
  }

  // 绘制柱状图
  data.forEach((record, i) => {
    const groupWidth = barWidth * 2 + barGap
    const x = padding.left + (i * chartWidth) / data.length + (chartWidth / data.length - groupWidth) / 2

    // 下载柱 - 蓝色渐变
    const downloadHeight = (record.download / maxValue) * chartHeight
    const downloadGradient = ctx.createLinearGradient(0, padding.top + chartHeight - downloadHeight, 0, padding.top + chartHeight)
    downloadGradient.addColorStop(0, '#3b82f6')
    downloadGradient.addColorStop(1, '#60a5fa')
    ctx.fillStyle = downloadGradient
    ctx.beginPath()
    ctx.roundRect(x, padding.top + chartHeight - downloadHeight, barWidth, downloadHeight, 3)
    ctx.fill()

    // 上传柱 - 绿色渐变
    const uploadHeight = (record.upload / maxValue) * chartHeight
    const uploadGradient = ctx.createLinearGradient(0, padding.top + chartHeight - uploadHeight, 0, padding.top + chartHeight)
    uploadGradient.addColorStop(0, '#10b981')
    uploadGradient.addColorStop(1, '#34d399')
    ctx.fillStyle = uploadGradient
    ctx.beginPath()
    ctx.roundRect(x + barWidth + barGap, padding.top + chartHeight - uploadHeight, barWidth, uploadHeight, 3)
    ctx.fill()
  })
}

// 监听时间周期变化
watch(selectedPeriod, async (newPeriod) => {
  await Promise.all([
    statsStore.loadHistory({ period: newPeriod }),
    statsStore.loadTrend({ period: newPeriod === 'today' ? 'week' : newPeriod }),
  ])
  setTimeout(drawChart, 100)
})

onMounted(() => {
  loadAllData()
  window.addEventListener('resize', drawChart)
})

onUnmounted(() => {
  window.removeEventListener('resize', drawChart)
})
</script>
