<script setup lang="ts">
/**
 * SecuritySection.vue - 安全设置组件
 * 
 * 包含 Kill Switch、DNS 泄漏防护、WebRTC 阻断等安全相关设置
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 2.1, 4.1, 6.1**
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'
import { useI18nStore } from '@/stores/i18n'
import { useVpnStore } from '@/stores/vpn'
import { useNotification } from '@/composables/useNotification'
import { storeToRefs } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import SettingRow from './SettingRow.vue'
import SettingSwitch from './SettingSwitch.vue'

const router = useRouter()
const settingsStore = useSettingsStore()
const i18nStore = useI18nStore()
const vpnStore = useVpnStore()
const notification = useNotification()

const { settings } = storeToRefs(settingsStore)
const { locale } = storeToRefs(i18nStore)
const { status } = storeToRefs(vpnStore)

// Kill Switch 操作中状态
const killSwitchLoading = ref(false)

// 翻译文本
const texts = computed(() => ({
  sectionTitle: locale.value === 'zh' ? '安全' : 'Security',
  killSwitch: locale.value === 'zh' ? 'Kill Switch (网络锁)' : 'Kill Switch',
  killSwitchDesc: locale.value === 'zh' 
    ? 'VPN 断开时阻断所有网络流量，防止真实 IP 泄露' 
    : 'Block all traffic when VPN disconnects to prevent IP leaks',
  killSwitchWarning: locale.value === 'zh'
    ? '启用后，VPN 断开时将无法访问网络'
    : 'When enabled, network will be blocked if VPN disconnects',
  dnsLeakProtection: locale.value === 'zh' ? 'DNS 泄漏防护' : 'DNS Leak Protection',
  dnsLeakProtectionDesc: locale.value === 'zh' 
    ? '确保 DNS 查询通过 VPN 隧道，防止 DNS 泄露真实位置' 
    : 'Ensure DNS queries go through VPN tunnel to prevent location leaks',
  blockWebRTC: locale.value === 'zh' ? 'WebRTC 阻断' : 'Block WebRTC',
  blockWebRTCDesc: locale.value === 'zh' 
    ? '阻断 STUN/TURN 端口和 WebRTC 域名，防止浏览器泄露真实 IP' 
    : 'Block STUN/TURN ports and WebRTC domains to prevent browser IP leaks',
  resetToDefaults: locale.value === 'zh' ? '重置为默认' : 'Reset to Defaults',
  enableSuccess: locale.value === 'zh' ? 'Kill Switch 已启用' : 'Kill Switch enabled',
  disableSuccess: locale.value === 'zh' ? 'Kill Switch 已禁用' : 'Kill Switch disabled',
  enableFailed: locale.value === 'zh' ? 'Kill Switch 启用失败' : 'Failed to enable Kill Switch',
  disableFailed: locale.value === 'zh' ? 'Kill Switch 禁用失败' : 'Failed to disable Kill Switch',
  requiresReconnect: locale.value === 'zh' ? '此设置需要重新连接才能生效' : 'This setting requires reconnection to take effect',
  // 默认值
  defaultOff: locale.value === 'zh' ? '默认: 关' : 'Default: Off',
  defaultOn: locale.value === 'zh' ? '默认: 开' : 'Default: On',
}))

const icons = {
  killSwitch: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
  dnsLeak: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  webrtc: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
  reset: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
}

// 触发重连（如果已连接）
async function triggerReconnect() {
  if (status.value === 'connected' || status.value === 'connecting') {
    notification.info(texts.value.requiresReconnect)
    await vpnStore.disconnect()
    router.push('/')
    setTimeout(() => vpnStore.connect(), 500)
  }
}

/**
 * 切换 Kill Switch
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 2.1, 2.2, 2.4**
 */
async function toggleKillSwitch() {
  if (killSwitchLoading.value) return
  
  killSwitchLoading.value = true
  const newValue = !settings.value.killSwitch
  
  try {
    if (newValue) {
      // 启用 Kill Switch
      // 只有在 VPN 已连接时才立即启用防火墙规则
      if (status.value === 'connected') {
        await invoke('enable_kill_switch')
      }
      settingsStore.updateSettings({ killSwitch: true })
      notification.success(texts.value.enableSuccess)
    } else {
      // 禁用 Kill Switch
      await invoke('disable_kill_switch')
      settingsStore.updateSettings({ killSwitch: false })
      notification.success(texts.value.disableSuccess)
    }
  } catch (error) {
    console.error('Kill Switch toggle failed:', error)
    notification.error(newValue ? texts.value.enableFailed : texts.value.disableFailed)
  } finally {
    killSwitchLoading.value = false
  }
}

/**
 * 切换 DNS 泄漏防护
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 4.1**
 */
async function toggleDnsLeakProtection() {
  settingsStore.updateSettings({ dnsLeakProtection: !settings.value.dnsLeakProtection })
  await triggerReconnect()
}

/**
 * 切换 WebRTC 阻断
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 6.1**
 */
async function toggleBlockWebRTC() {
  settingsStore.updateSettings({ blockWebRTC: !settings.value.blockWebRTC })
  await triggerReconnect()
}

/**
 * 重置安全设置为默认值
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 10.4**
 */
async function resetSecuritySettings() {
  // 如果 Kill Switch 当前启用，先禁用它
  if (settings.value.killSwitch) {
    try {
      await invoke('disable_kill_switch')
    } catch (error) {
      console.error('Failed to disable Kill Switch during reset:', error)
    }
  }
  
  settingsStore.resetSecuritySettings()
  notification.success(locale.value === 'zh' ? '安全设置已重置' : 'Security settings reset')
}

// 监听 VPN 连接状态变化，自动管理 Kill Switch
watch(status, async (newStatus: string, oldStatus: string) => {
  if (!settings.value.killSwitch) return
  
  try {
    if (newStatus === 'connected' && oldStatus !== 'connected') {
      // VPN 连接成功，启用 Kill Switch
      await invoke('enable_kill_switch')
    }
    // 注意：断开时不自动禁用 Kill Switch，这是 Kill Switch 的核心功能
    // 用户需要手动禁用 Kill Switch 才能恢复网络
  } catch (error) {
    console.error('Kill Switch auto-management failed:', error)
  }
})
</script>

<template>
  <section>
    <h2 class="text-[11px] font-semibold text-[var(--vpn-muted)] uppercase tracking-wider mb-2 pl-2">
      {{ texts.sectionTitle }}
    </h2>
    <div
      class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-xl overflow-hidden shadow-sm divide-y divide-[var(--vpn-border)]">

      <!-- Kill Switch -->
      <div>
        <SettingRow 
          :icon="icons.killSwitch" 
          icon-color="text-red-500" 
          icon-bg="bg-red-500/10"
          :title="texts.killSwitch" 
          :subtitle="texts.killSwitchDesc"
          :default-value="texts.defaultOff"
        >
          <SettingSwitch 
            :model-value="settings.killSwitch" 
            :disabled="killSwitchLoading"
            @update:model-value="toggleKillSwitch" 
          />
        </SettingRow>
        <!-- Kill Switch 警告提示 -->
        <p v-if="settings.killSwitch" class="text-[10px] text-amber-500 px-4 pb-2 pl-16">
          ⚠️ {{ texts.killSwitchWarning }}
        </p>
      </div>

      <!-- DNS Leak Protection -->
      <!-- **Feature: vpn-pure-mode** -->
      <!-- **Validates: Requirements 10.2, 10.3** -->
      <SettingRow 
        :icon="icons.dnsLeak" 
        icon-color="text-green-500" 
        icon-bg="bg-green-500/10"
        :title="texts.dnsLeakProtection" 
        :subtitle="texts.dnsLeakProtectionDesc"
        :default-value="texts.defaultOn"
        :requires-reconnect="true"
      >
        <SettingSwitch 
          :model-value="settings.dnsLeakProtection" 
          @update:model-value="toggleDnsLeakProtection" 
        />
      </SettingRow>

      <!-- Block WebRTC -->
      <!-- **Feature: vpn-pure-mode** -->
      <!-- **Validates: Requirements 10.2, 10.3** -->
      <SettingRow 
        :icon="icons.webrtc" 
        icon-color="text-purple-500" 
        icon-bg="bg-purple-500/10"
        :title="texts.blockWebRTC" 
        :subtitle="texts.blockWebRTCDesc"
        :default-value="texts.defaultOn"
        :requires-reconnect="true"
      >
        <SettingSwitch 
          :model-value="settings.blockWebRTC" 
          @update:model-value="toggleBlockWebRTC" 
        />
      </SettingRow>

      <!-- Reset to Defaults -->
      <SettingRow 
        :icon="icons.reset" 
        icon-color="text-gray-500" 
        icon-bg="bg-gray-500/10"
        :title="texts.resetToDefaults"
      >
        <button
          @click="resetSecuritySettings"
          class="px-3 py-1.5 text-[11px] text-[var(--vpn-muted)] hover:text-[var(--vpn-text)] bg-[var(--vpn-input-bg)] hover:bg-[var(--vpn-border)] border border-[var(--vpn-border)] rounded-lg transition-colors"
        >
          {{ texts.resetToDefaults }}
        </button>
      </SettingRow>

    </div>
  </section>
</template>
