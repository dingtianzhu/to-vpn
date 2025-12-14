<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useVpnStore } from '@/stores/vpn'
import { useAuthStore } from '@/stores/auth'
import { useServersStore } from '@/stores/servers'
import { useI18nStore } from '@/stores/i18n'
import { formatBytes, formatDuration } from '@/utils/format'

// 组件
import ConnectButton from '@/components/dashboard/ConnectButton.vue'
import ServerCard from '@/components/dashboard/ServerCard.vue'
import StatsPanel from '@/components/dashboard/StatsPanel.vue'
import { TopNotice, ErrorBanner, ConnectionInfo } from '@/components/home'
import { PurchaseModal } from '@/components/purchase'

const router = useRouter()
const vpnStore = useVpnStore()
const authStore = useAuthStore()
const serversStore = useServersStore()
const { t } = storeToRefs(useI18nStore())

// Store 状态
const { status, isVpnBusy, error, stats, isConnected, isHelperReady, canCancel, showPurchaseModal } = storeToRefs(vpnStore)
const { currentServer } = storeToRefs(serversStore)
const { isAuthenticated, needsLogin, hasConnectionLimit, dailyTrafficLimit, dailyTimeLimit, membershipLevel } = storeToRefs(authStore)

// ============ 错误提示逻辑 ============
const showError = ref(false)
const errorMessage = ref('')
let errorTimer: number | null = null

watch(error, (newError) => {
  if (newError) {
    errorMessage.value = newError
    showError.value = true

    if (errorTimer) clearTimeout(errorTimer)

    errorTimer = window.setTimeout(() => {
      showError.value = false
      vpnStore.clearError()
      setTimeout(() => errorMessage.value = '', 300)
    }, 5000)
  } else {
    showError.value = false
  }
}, { immediate: true })

function dismissError() {
  showError.value = false
  vpnStore.clearError()
  if (errorTimer) {
    clearTimeout(errorTimer)
    errorTimer = null
  }
}

onUnmounted(() => {
  if (errorTimer) clearTimeout(errorTimer)
})

// ============ 初始化 ============
onMounted(async () => {


  const pendingAction = serversStore.consumePendingAction()

  if (pendingAction === 'connect') {
    if (isConnected.value) {
      await vpnStore.disconnect()
      setTimeout(() => handleConnect(), 500)
    } else {
      handleConnect()
    }
  } else if (authStore.consumeAutoConnect() && isHelperReady.value) {
    setTimeout(() => handleConnect(), 500)
  }
})

watch(isAuthenticated, (authenticated) => {
  if (!authenticated && isConnected.value) {
    vpnStore.disconnect()
  }
})

// ============ 计算属性 ============
const buttonDisabled = computed(() => {
  if (status.value === 'disconnecting') return true
  if (status.value === 'connecting') return false
  return isVpnBusy.value
})

const limitInfo = computed(() => {
  if (!hasConnectionLimit.value) return null
  const parts = []
  if (dailyTrafficLimit.value > 0) parts.push(formatBytes(dailyTrafficLimit.value))
  if (dailyTimeLimit.value > 0) parts.push(formatDuration(dailyTimeLimit.value))
  return parts.join(' / ')
})

const topNoticeType = computed(() => {
  if (needsLogin.value) return 'login'
  if (isAuthenticated.value && !isHelperReady.value && status.value === 'disconnected') return 'helper'
  if (isAuthenticated.value && hasConnectionLimit.value && limitInfo.value) return 'limit'
  return null
})

// ============ 方法 ============
async function handleConnect() {
  // 已连接时断开
  if (status.value === 'connected') {
    return vpnStore.disconnect()
  }

  // 未登录时跳转登录页，带上 pendingConnect 参数
  if (needsLogin.value) {
    router.push('/login?pendingConnect=true')
    return
  }

  // 检查 Helper 是否就绪
  if (!isHelperReady.value) {
    if (window.confirm(t.value.home.systemExtensionRequired)) {
      router.push('/settings')
    }
    return
  }

  // 使用带限制检查的连接方法
  // 如果限制超出，会自动显示购买弹框
  vpnStore.connectWithLimitCheck()
}

// 购买成功回调
async function handlePurchaseSuccess() {
  await vpnStore.handlePurchaseSuccess()
}


</script>

<template>
  <div class="h-full flex flex-col bg-[var(--vpn-bg)] overflow-hidden relative">
    <!-- Background Effects -->
    <div class="absolute inset-0 pointer-events-none overflow-hidden">
      <div class="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-sky-400/10 rounded-full blur-[100px]"></div>
      <div class="absolute bottom-[10%] left-[-10%] w-[400px] h-[400px] bg-emerald-400/10 rounded-full blur-[80px]">
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 relative z-10 flex flex-col">
      <div class="flex-1 flex flex-col items-center justify-center px-6">

        <!-- Top Notice (绝对定位) -->
        <div class="absolute top-4 left-0 right-0 flex justify-center px-6">
          <TopNotice :type="topNoticeType" :limit-info="limitInfo" />
        </div>

        <!-- Main Content Group -->
        <div class="flex flex-col items-center w-full max-w-md">

          <!-- Error Banner (固定高度容器) -->
          <div class="w-full h-12 flex items-center justify-center mb-2">
            <ErrorBanner :message="errorMessage" :visible="showError" @dismiss="dismissError" />
          </div>

          <!-- Connect Button -->
          <ConnectButton :status="status" :disabled="buttonDisabled" :can-cancel="canCancel" @click="handleConnect"
            @cancel="vpnStore.cancelConnect" />

          <!-- Connection Info (计时器 + 会员标识 同一行) -->
          <ConnectionInfo :is-connected="isConnected" :connected-time="stats.connectedTime"
            :membership-level="membershipLevel" :show-membership="isAuthenticated" class="mt-4" />

          <!-- Server Card -->
          <div class="mt-5">
            <ServerCard v-if="currentServer" :server="currentServer" @click="router.push('/servers')" />
          </div>
        </div>
      </div>
    </div>

    <!-- Stats Panel -->
    <StatsPanel :stats="stats" :is-connected="isConnected" class="shrink-0 relative z-20" />

    <!-- Purchase Modal -->
    <PurchaseModal 
      :visible="showPurchaseModal" 
      @success="handlePurchaseSuccess"
      @update:visible="showPurchaseModal = $event"
    />
  </div>
</template>