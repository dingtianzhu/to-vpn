<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { getPlans, createOrder, getOrderStatus } from '@/api/plan'
import type { Plan } from '@/types/plan'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'success'): void
  (e: 'update:visible', value: boolean): void
}>()

// 状态
const plans = ref<Plan[]>([])
const selectedPlan = ref<Plan | null>(null)
const paymentMethod = ref<'alipay' | 'wechat'>('alipay')
const isLoading = ref(false)
const isProcessing = ref(false)
const errorMessage = ref('')
const orderId = ref<string | null>(null)
const paymentUrl = ref<string | null>(null)

// 轮询相关
let pollTimer: number | null = null
const POLL_INTERVAL = 3000 // 3秒轮询一次
const MAX_POLL_TIME = 10 * 60 * 1000 // 最长轮询10分钟

// 加载套餐列表
async function loadPlans() {
  isLoading.value = true
  errorMessage.value = ''
  try {
    plans.value = await getPlans()
    // 默认选中推荐套餐
    const recommended = plans.value.find((p: Plan) => p.recommended)
    if (recommended) {
      selectedPlan.value = recommended
    } else if (plans.value.length > 0) {
      selectedPlan.value = plans.value[0]
    }
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to load plans'
  } finally {
    isLoading.value = false
  }
}

// 创建订单
async function handlePurchase() {
  if (!selectedPlan.value) return
  
  isProcessing.value = true
  errorMessage.value = ''
  
  try {
    const result = await createOrder({
      plan_id: selectedPlan.value.id,
      payment_method: paymentMethod.value
    })
    
    orderId.value = result.order_id
    paymentUrl.value = result.payment_url
    
    // 打开支付页面
    if (result.payment_url) {
      window.open(result.payment_url, '_blank')
    }
    
    // 开始轮询订单状态
    startPolling()
  } catch (e) {
    errorMessage.value = e instanceof Error ? e.message : 'Failed to create order'
    isProcessing.value = false
  }
}


// 开始轮询订单状态
function startPolling() {
  stopPolling()
  const startTime = Date.now()
  
  pollTimer = window.setInterval(async () => {
    if (!orderId.value) {
      stopPolling()
      return
    }
    
    // 超时检查
    if (Date.now() - startTime > MAX_POLL_TIME) {
      stopPolling()
      errorMessage.value = 'Payment timeout. Please try again.'
      isProcessing.value = false
      return
    }
    
    try {
      const status = await getOrderStatus(orderId.value)
      
      if (status.status === 1) { // Paid
        stopPolling()
        isProcessing.value = false
        emit('success')
      } else if (status.status === 2 || status.status === 3) { // Cancelled or Expired
        stopPolling()
        errorMessage.value = 'Order cancelled or expired'
        isProcessing.value = false
      }
    } catch (e) {
      console.error('Failed to check order status:', e)
    }
  }, POLL_INTERVAL)
}

// 停止轮询
function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// 格式化价格
function formatPrice(price: number): string {
  return `¥${(price / 100).toFixed(2)}`
}

// 格式化流量
function formatTraffic(bytes: number): string {
  if (bytes < 0) return '无限'
  const gb = bytes / (1024 * 1024 * 1024)
  return `${gb.toFixed(0)} GB`
}

// 格式化时长
function formatDuration(days: number): string {
  if (days >= 365) return `${Math.floor(days / 365)} 年`
  if (days >= 30) return `${Math.floor(days / 30)} 个月`
  return `${days} 天`
}

// 监听 visible 变化
watch(() => props.visible, (newVal: boolean) => {
  if (newVal) {
    loadPlans()
  } else {
    stopPolling()
    orderId.value = null
    paymentUrl.value = null
    isProcessing.value = false
    errorMessage.value = ''
  }
})

onMounted(() => {
  if (props.visible) {
    loadPlans()
  }
})

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <!-- Modal Backdrop - 点击不关闭 (persistent) -->
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        
        <!-- Modal Content -->
        <div class="relative w-full max-w-lg mx-4 bg-[var(--vpn-card)] rounded-2xl shadow-2xl overflow-hidden">
          <!-- Header -->
          <div class="px-6 py-4 border-b border-[var(--vpn-border)]">
            <h2 class="text-lg font-semibold text-[var(--vpn-text)]">
              升级套餐
            </h2>
            <p class="text-sm text-[var(--vpn-text-secondary)] mt-1">
              您的使用额度已用完，请选择套餐继续使用
            </p>
          </div>
          
          <!-- Body -->
          <div class="p-6 max-h-[60vh] overflow-y-auto">
            <!-- Loading -->
            <div v-if="isLoading" class="flex items-center justify-center py-8">
              <div class="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            </div>
            
            <!-- Error -->
            <div v-else-if="errorMessage" class="text-center py-4">
              <p class="text-red-500 text-sm">{{ errorMessage }}</p>
              <button @click="loadPlans" class="mt-2 text-emerald-500 text-sm hover:underline">
                重试
              </button>
            </div>
            
            <!-- Plans List -->
            <div v-else class="space-y-3">
              <div
                v-for="plan in plans"
                :key="plan.id"
                @click="selectedPlan = plan"
                :class="[
                  'relative p-4 rounded-xl border-2 cursor-pointer transition-all',
                  selectedPlan?.id === plan.id
                    ? 'border-emerald-500 bg-emerald-500/5'
                    : 'border-[var(--vpn-border)] hover:border-emerald-500/50'
                ]"
              >
                <!-- Recommended Badge -->
                <div v-if="plan.recommended" class="absolute -top-2 -right-2 px-2 py-0.5 bg-emerald-500 text-white text-xs rounded-full">
                  推荐
                </div>
                
                <div class="flex items-center justify-between">
                  <div>
                    <h3 class="font-medium text-[var(--vpn-text)]">{{ plan.name }}</h3>
                    <p class="text-sm text-[var(--vpn-text-secondary)] mt-1">
                      {{ formatDuration(plan.duration) }} · {{ formatTraffic(plan.traffic_limit) }}
                    </p>
                  </div>
                  <div class="text-right">
                    <span class="text-xl font-bold text-emerald-500">{{ formatPrice(plan.price) }}</span>
                  </div>
                </div>
                
                <!-- Features -->
                <div v-if="plan.features?.length" class="mt-2 flex flex-wrap gap-1">
                  <span
                    v-for="feature in plan.features"
                    :key="feature"
                    class="px-2 py-0.5 text-xs bg-[var(--vpn-bg)] text-[var(--vpn-text-secondary)] rounded"
                  >
                    {{ feature }}
                  </span>
                </div>
              </div>
            </div>
            
            <!-- Payment Method -->
            <div v-if="!isLoading && plans.length > 0" class="mt-6">
              <p class="text-sm font-medium text-[var(--vpn-text)] mb-3">支付方式</p>
              <div class="flex gap-3">
                <button
                  @click="paymentMethod = 'alipay'"
                  :class="[
                    'flex-1 py-3 rounded-xl border-2 transition-all',
                    paymentMethod === 'alipay'
                      ? 'border-blue-500 bg-blue-500/5'
                      : 'border-[var(--vpn-border)]'
                  ]"
                >
                  <span class="text-sm">支付宝</span>
                </button>
                <button
                  @click="paymentMethod = 'wechat'"
                  :class="[
                    'flex-1 py-3 rounded-xl border-2 transition-all',
                    paymentMethod === 'wechat'
                      ? 'border-green-500 bg-green-500/5'
                      : 'border-[var(--vpn-border)]'
                  ]"
                >
                  <span class="text-sm">微信支付</span>
                </button>
              </div>
            </div>
          </div>
          
          <!-- Footer -->
          <div class="px-6 py-4 border-t border-[var(--vpn-border)] flex gap-3">
            <button
              @click="handlePurchase"
              :disabled="!selectedPlan || isProcessing"
              class="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span v-if="isProcessing" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {{ isProcessing ? '处理中...' : '立即购买' }}
            </button>
          </div>
          
          <!-- Processing Hint -->
          <div v-if="isProcessing" class="px-6 pb-4">
            <p class="text-xs text-center text-[var(--vpn-text-secondary)]">
              请在新窗口完成支付，支付完成后将自动跳转
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .relative,
.modal-leave-active .relative {
  transition: transform 0.2s ease;
}

.modal-enter-from .relative,
.modal-leave-to .relative {
  transform: scale(0.95);
}
</style>
