<script setup lang="ts">
/**
 * SettingsView.vue - 设置页面
 * 
 * 按照工业级纯净版要求，将设置组织为四个主要部分：
 * 1. 代理端口 (Proxy Ports)
 * 2. 安全 (Security)
 * 3. 路由 (Routing)
 * 4. 高级 (Advanced)
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 10.1, 10.2, 10.3**
 */
import { watch, computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@/stores/settings'
import { useI18nStore } from '@/stores/i18n'
import { useVpnStore } from '@/stores/vpn'
import { useNotification } from '@/composables/useNotification'

// 设置组件
import GeneralSettingsSection from '@/components/settings/GeneralSettingsSection.vue'
import ProxyPortsSection from '@/components/settings/ProxyPortsSection.vue'
import SecuritySection from '@/components/settings/SecuritySection.vue'
import RoutingSection from '@/components/settings/RoutingSection.vue'
import PerAppProxySection from '@/components/settings/PerAppProxySection.vue'
import ConnectionModeSection from '@/components/settings/ConnectionModeSection.vue'
import NetworkPreferencesSection from '@/components/settings/NetworkPreferencesSection.vue'
import AdvancedNetworkSection from '@/components/settings/AdvancedNetworkSection.vue'
import RulesetStatusSection from '@/components/settings/RulesetStatusSection.vue'
import SystemHelperSection from '@/components/settings/SystemHelperSection.vue'

const router = useRouter()
const settingsStore = useSettingsStore()
const i18nStore = useI18nStore()
const vpnStore = useVpnStore()
const notification = useNotification()

const { settings } = storeToRefs(settingsStore)
const { t, locale } = storeToRefs(i18nStore)
const { status } = storeToRefs(vpnStore)

// 确认重置对话框状态
const showResetConfirm = ref(false)

// 检测是否为 macOS 平台
const isMacOS = computed(() => {
  return typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac')
})

// 重置相关文本
const resetTexts = computed(() => ({
  resetAll: locale.value === 'zh' ? '恢复默认' : 'Reset All',
  confirmTitle: locale.value === 'zh' ? '确认恢复默认设置' : 'Confirm Reset',
  confirmMessage: locale.value === 'zh' 
    ? '这将把所有设置恢复为默认值，此操作不可撤销。' 
    : 'This will reset all settings to default values. This action cannot be undone.',
  confirm: locale.value === 'zh' ? '确认重置' : 'Reset',
  cancel: locale.value === 'zh' ? '取消' : 'Cancel',
  resetSuccess: locale.value === 'zh' ? '所有设置已恢复默认' : 'All settings reset to defaults',
}))

// 一键恢复默认设置
async function resetAllSettings() {
  showResetConfirm.value = false
  
  // 如果已连接，先断开
  if (status.value === 'connected' || status.value === 'connecting') {
    await vpnStore.disconnect()
  }
  
  // 重置所有设置
  settingsStore.resetSettings()
  
  notification.success(resetTexts.value.resetSuccess)
}

// 监听连接模式和 MTU 变化 -> 自动重连
// 注意：DNS 变化不在这里处理，由 NetworkPreferencesSection 组件处理
// 注意：高级网络设置变化由 AdvancedNetworkSection 组件处理
watch(
  () => [settings.value.connectionMode, settings.value.mtu],
  async ([newConnMode, newMtu], [oldConnMode, oldMtu]) => {
    // 如果没变化，则不执行
    if (newConnMode === oldConnMode && newMtu === oldMtu) return

    if (status.value === 'connected' || status.value === 'connecting') {
      await vpnStore.disconnect()
      router.push('/')
      setTimeout(() => vpnStore.connect(), 500)
    }
  }
)
</script>

<template>
  <div class="h-full flex flex-col bg-[var(--vpn-bg)] overflow-hidden">
    <!-- Header -->
    <div
      class="px-6 pt-8 pb-4 sticky top-0 z-10 bg-[var(--vpn-bg)]/95 backdrop-blur-xl shrink-0 border-b border-transparent">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold tracking-tight text-[var(--vpn-text)]">
          {{ t.settings.title }}
        </h1>
        <!-- 一键恢复默认设置按钮 -->
        <button
          @click="showResetConfirm = true"
          class="px-3 py-1.5 text-[11px] text-[var(--vpn-muted)] hover:text-red-500 bg-[var(--vpn-input-bg)] hover:bg-red-50 dark:hover:bg-red-900/20 border border-[var(--vpn-border)] hover:border-red-200 dark:hover:border-red-800 rounded-lg transition-all flex items-center gap-1.5"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {{ resetTexts.resetAll }}
        </button>
      </div>
    </div>
    
    <!-- 确认重置对话框 -->
    <Teleport to="body">
      <div
        v-if="showResetConfirm"
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        @click.self="showResetConfirm = false"
      >
        <div class="bg-[var(--vpn-card)] rounded-xl p-6 max-w-sm mx-4 shadow-xl border border-[var(--vpn-border)]">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 class="text-[15px] font-semibold text-[var(--vpn-text)]">
              {{ resetTexts.confirmTitle }}
            </h3>
          </div>
          <p class="text-[13px] text-[var(--vpn-text-secondary)] mb-5 pl-13">
            {{ resetTexts.confirmMessage }}
          </p>
          <div class="flex gap-3 justify-end">
            <button
              @click="showResetConfirm = false"
              class="px-4 py-2 text-[13px] text-[var(--vpn-text-secondary)] hover:text-[var(--vpn-text)] transition-colors"
            >
              {{ resetTexts.cancel }}
            </button>
            <button
              @click="resetAllSettings"
              class="px-4 py-2 text-[13px] bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              {{ resetTexts.confirm }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto px-6 pb-10 space-y-8">
      
      <!-- ==================== 通用设置 ==================== -->
      <GeneralSettingsSection />

      <!-- ==================== 代理端口部分 ==================== -->
      <!-- **Feature: vpn-pure-mode** -->
      <!-- **Validates: Requirements 10.1** -->
      <div class="space-y-4">
        <ProxyPortsSection />
        <!-- 连接模式移动到代理端口下方 -->
        <ConnectionModeSection />
      </div>

      <!-- ==================== 安全部分 ==================== -->
      <!-- **Feature: vpn-pure-mode** -->
      <!-- **Validates: Requirements 10.1** -->
      <SecuritySection />

      <!-- ==================== 路由部分 ==================== -->
      <!-- **Feature: vpn-pure-mode** -->
      <!-- **Validates: Requirements 10.1** -->
      <div class="space-y-4">
        <RoutingSection />
        <!-- 分应用代理在 macOS 上隐藏（sing-box 不支持） -->
        <PerAppProxySection v-if="!isMacOS" />
      </div>

      <!-- ==================== 高级部分 ==================== -->
      <!-- **Feature: vpn-pure-mode** -->
      <!-- **Validates: Requirements 10.1** -->
      <div class="space-y-4">
        <NetworkPreferencesSection />
        <AdvancedNetworkSection />
      </div>

      <!-- ==================== 系统部分 ==================== -->
      <div class="space-y-4">
        <RulesetStatusSection />
        <SystemHelperSection />
      </div>

      <!-- Version Info -->
      <div class="text-center pt-2">
        <p class="text-[10px] text-[var(--vpn-muted)]">
          ToVpn Client v1.0.0
        </p>
      </div>

    </div>
  </div>
</template>
