<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'
import { useI18nStore } from '@/stores/i18n'
import { useVpnStore } from '@/stores/vpn'
import { useNotification } from '@/composables/useNotification'
import { storeToRefs } from 'pinia'
import SettingRow from './SettingRow.vue'
import SettingSwitch from './SettingSwitch.vue'
import SettingSelect from './SettingSelect.vue'
import type { TunStack } from '@/types'


const router = useRouter()
const settingsStore = useSettingsStore()
const i18nStore = useI18nStore()
const vpnStore = useVpnStore()
const notification = useNotification()

const { settings } = storeToRefs(settingsStore)
const { locale } = storeToRefs(i18nStore)
const { status } = storeToRefs(vpnStore)

// 带宽输入状态
const upMbpsInput = ref(settings.value.upMbps.toString())
const downMbpsInput = ref(settings.value.downMbps.toString())
const upMbpsError = ref('')
const downMbpsError = ref('')

// 同步设置到输入框
watch(() => settings.value.upMbps, (newVal: number) => {
  if (newVal.toString() !== upMbpsInput.value) {
    upMbpsInput.value = newVal.toString()
  }
})

watch(() => settings.value.downMbps, (newVal: number) => {
  if (newVal.toString() !== downMbpsInput.value) {
    downMbpsInput.value = newVal.toString()
  }
})

// 翻译文本
const texts = computed(() => ({
  sectionTitle: locale.value === 'zh' ? '高级网络' : 'Advanced Network',
  upMbps: locale.value === 'zh' ? '上行带宽限制' : 'Upload Bandwidth',
  upMbpsDesc: locale.value === 'zh' ? '限制上传速度，0 表示不限制' : 'Limit upload speed, 0 means unlimited',
  downMbps: locale.value === 'zh' ? '下行带宽限制' : 'Download Bandwidth',
  downMbpsDesc: locale.value === 'zh' ? '限制下载速度，0 表示不限制' : 'Limit download speed, 0 means unlimited',
  blockQuic: locale.value === 'zh' ? '阻断 QUIC' : 'Block QUIC',
  blockQuicDesc: locale.value === 'zh' ? '阻断 UDP 443 端口，强制浏览器使用 TCP，避免 HTTP/3 流量绕过代理' : 'Block UDP port 443, force browsers to use TCP, prevent HTTP/3 traffic bypass',
  disableIpv6: locale.value === 'zh' ? '禁用 IPv6' : 'Disable IPv6',
  disableIpv6Desc: locale.value === 'zh' ? 'TUN 模式下只配置 IPv4 地址，防止 IPv6 泄漏真实位置' : 'Only configure IPv4 in TUN mode to prevent IPv6 location leaks',
  tunStack: locale.value === 'zh' ? 'TUN 网络栈' : 'TUN Stack',
  tunStackDesc: locale.value === 'zh' ? '选择 TUN 模式的网络栈实现，影响性能和兼容性' : 'Select TUN mode network stack, affects performance and compatibility',
  mbps: 'Mbps',
  invalidBandwidth: locale.value === 'zh' ? '请输入有效的带宽值 (1-10000)' : 'Enter valid bandwidth (1-10000)',
  requiresReconnect: locale.value === 'zh' ? '需要重连' : 'Requires reconnect',
  // 默认值
  defaultUp: locale.value === 'zh' ? '默认: 500' : 'Default: 500',
  defaultDown: locale.value === 'zh' ? '默认: 1000' : 'Default: 1000',
  defaultOn: locale.value === 'zh' ? '默认: 开' : 'Default: On',
  defaultGvisor: locale.value === 'zh' ? '默认: gVisor' : 'Default: gVisor',
}))

// TUN 网络栈选项
// **Feature: vpn-pure-mode**
// **Validates: Requirements 8.1, 8.3**
const tunStackOptions = computed(() => [
  {
    value: 'gvisor' as TunStack,
    label: 'gVisor',
    description: locale.value === 'zh' 
      ? '用户态网络栈，平衡性能和兼容性（推荐）' 
      : 'User-space stack, balanced performance and compatibility (recommended)'
  },
  {
    value: 'system' as TunStack,
    label: 'System',
    description: locale.value === 'zh' 
      ? '系统网络栈，原生高性能' 
      : 'System stack, native high performance'
  },
  {
    value: 'lwip' as TunStack,
    label: 'lwIP',
    description: locale.value === 'zh' 
      ? '轻量级网络栈，低资源占用' 
      : 'Lightweight stack, low resource usage'
  }
])

const icons = {
  bandwidth: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  quic: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
  ipv6: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9',
  tunStack: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z',
}

// 验证带宽值
function isValidBandwidth(value: string): boolean {
  const num = parseInt(value, 10)
  return !isNaN(num) && num >= 1 && num <= 10000
}

// 触发重连（如果已连接）
async function triggerReconnect() {
  if (status.value === 'connected' || status.value === 'connecting') {
    await vpnStore.disconnect()
    router.push('/')
    setTimeout(() => vpnStore.connect(), 500)
  }
}

// Block QUIC 切换
async function toggleBlockQuic() {
  settingsStore.updateSettings({ blockQuic: !settings.value.blockQuic })
  await triggerReconnect()
}

// Disable IPv6 切换
async function toggleDisableIpv6() {
  settingsStore.updateSettings({ disableIpv6: !settings.value.disableIpv6 })
  // 只有在 TUN 模式下才需要重连
  if (settings.value.connectionMode === 'tun') {
    await triggerReconnect()
  }
}

// TUN 网络栈切换
// **Feature: vpn-pure-mode**
// **Validates: Requirements 8.1, 8.4**
async function handleTunStackChange(stack: string | number) {
  settingsStore.setTunStack(stack as TunStack)
  // 只有在 TUN 模式下才需要重连
  if (settings.value.connectionMode === 'tun') {
    notification.info(texts.value.requiresReconnect)
    await triggerReconnect()
  }
}

// 上行带宽失去焦点时验证并保存
async function handleUpMbpsBlur() {
  const value = upMbpsInput.value.trim()
  
  if (!isValidBandwidth(value)) {
    upMbpsError.value = texts.value.invalidBandwidth
    notification.warning(upMbpsError.value)
    return
  }
  
  upMbpsError.value = ''
  const newValue = parseInt(value, 10)
  
  if (newValue !== settings.value.upMbps) {
    settingsStore.updateSettings({ upMbps: newValue })
    await triggerReconnect()
  }
}

// 下行带宽失去焦点时验证并保存
async function handleDownMbpsBlur() {
  const value = downMbpsInput.value.trim()
  
  if (!isValidBandwidth(value)) {
    downMbpsError.value = texts.value.invalidBandwidth
    notification.warning(downMbpsError.value)
    return
  }
  
  downMbpsError.value = ''
  const newValue = parseInt(value, 10)
  
  if (newValue !== settings.value.downMbps) {
    settingsStore.updateSettings({ downMbps: newValue })
    await triggerReconnect()
  }
}

/**
 * 重置高级网络设置为默认值
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 10.4**
 */
async function resetAdvancedSettings() {
  settingsStore.resetAdvancedSettings()
  // 同步输入框
  upMbpsInput.value = settings.value.upMbps.toString()
  downMbpsInput.value = settings.value.downMbps.toString()
  upMbpsError.value = ''
  downMbpsError.value = ''
  notification.success(locale.value === 'zh' ? '高级网络设置已重置' : 'Advanced network settings reset')
  await triggerReconnect()
}
</script>

<template>
  <section>
    <h2 class="text-[11px] font-semibold text-[var(--vpn-muted)] uppercase tracking-wider mb-2 pl-2">
      {{ texts.sectionTitle }}
    </h2>
    <div
      class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-xl overflow-hidden shadow-sm divide-y divide-[var(--vpn-border)]">

      <!-- TUN Stack Selection -->
      <!-- **Feature: vpn-pure-mode** -->
      <!-- **Validates: Requirements 8.1, 8.3, 8.4, 10.2, 10.3** -->
      <SettingRow :icon="icons.tunStack" icon-color="text-cyan-500" icon-bg="bg-cyan-500/10"
        :title="texts.tunStack" :subtitle="texts.tunStackDesc" :default-value="texts.defaultGvisor" :requires-reconnect="true">
        <SettingSelect
          :model-value="settings.tunStack"
          :options="tunStackOptions"
          @update:model-value="handleTunStackChange"
        />
      </SettingRow>

      <!-- Upload Bandwidth -->
      <!-- **Feature: vpn-pure-mode** -->
      <!-- **Validates: Requirements 10.2, 10.3** -->
      <div>
        <SettingRow :icon="icons.bandwidth" icon-color="text-green-500" icon-bg="bg-green-500/10"
          :title="texts.upMbps" :subtitle="texts.upMbpsDesc" :default-value="texts.defaultUp" :requires-reconnect="true">
          <div class="flex items-center gap-2">
            <input v-model="upMbpsInput" type="text" inputmode="numeric"
              @blur="handleUpMbpsBlur"
              @keyup.enter="handleUpMbpsBlur"
              :class="[
                'w-20 bg-[var(--vpn-input-bg)] border rounded-lg px-3 py-1.5 text-[12px] text-[var(--vpn-text)] text-right outline-none transition-all font-mono',
                upMbpsError ? 'border-red-500 focus:border-red-500' : 'border-[var(--vpn-border)] focus:border-blue-500/50'
              ]" />
            <span class="text-[11px] text-[var(--vpn-muted)]">{{ texts.mbps }}</span>
          </div>
        </SettingRow>
        <p v-if="upMbpsError" class="text-[10px] text-red-500 px-4 pb-2 pl-16">
          {{ upMbpsError }}
        </p>
      </div>

      <!-- Download Bandwidth -->
      <!-- **Feature: vpn-pure-mode** -->
      <!-- **Validates: Requirements 10.2, 10.3** -->
      <div>
        <SettingRow :icon="icons.bandwidth" icon-color="text-blue-500" icon-bg="bg-blue-500/10"
          :title="texts.downMbps" :subtitle="texts.downMbpsDesc" :default-value="texts.defaultDown" :requires-reconnect="true">
          <div class="flex items-center gap-2">
            <input v-model="downMbpsInput" type="text" inputmode="numeric"
              @blur="handleDownMbpsBlur"
              @keyup.enter="handleDownMbpsBlur"
              :class="[
                'w-20 bg-[var(--vpn-input-bg)] border rounded-lg px-3 py-1.5 text-[12px] text-[var(--vpn-text)] text-right outline-none transition-all font-mono',
                downMbpsError ? 'border-red-500 focus:border-red-500' : 'border-[var(--vpn-border)] focus:border-blue-500/50'
              ]" />
            <span class="text-[11px] text-[var(--vpn-muted)]">{{ texts.mbps }}</span>
          </div>
        </SettingRow>
        <p v-if="downMbpsError" class="text-[10px] text-red-500 px-4 pb-2 pl-16">
          {{ downMbpsError }}
        </p>
      </div>

      <!-- Block QUIC -->
      <!-- **Feature: vpn-pure-mode** -->
      <!-- **Validates: Requirements 10.2, 10.3** -->
      <SettingRow :icon="icons.quic" icon-color="text-red-500" icon-bg="bg-red-500/10"
        :title="texts.blockQuic" :subtitle="texts.blockQuicDesc" :default-value="texts.defaultOn" :requires-reconnect="true">
        <SettingSwitch :model-value="settings.blockQuic" @update:model-value="toggleBlockQuic" />
      </SettingRow>

      <!-- Disable IPv6 -->
      <!-- **Feature: vpn-pure-mode** -->
      <!-- **Validates: Requirements 10.2, 10.3** -->
      <SettingRow :icon="icons.ipv6" icon-color="text-purple-500" icon-bg="bg-purple-500/10"
        :title="texts.disableIpv6" :subtitle="texts.disableIpv6Desc" :default-value="texts.defaultOn" :requires-reconnect="true">
        <SettingSwitch :model-value="settings.disableIpv6" @update:model-value="toggleDisableIpv6" />
      </SettingRow>

    </div>
    
    <!-- 重置高级网络设置按钮 -->
    <!-- **Feature: vpn-pure-mode** -->
    <!-- **Validates: Requirements 10.4** -->
    <div class="mt-3 flex justify-end">
      <button
        @click="resetAdvancedSettings"
        class="px-3 py-1.5 text-[11px] text-[var(--vpn-muted)] hover:text-[var(--vpn-text)] bg-[var(--vpn-input-bg)] hover:bg-[var(--vpn-border)] border border-[var(--vpn-border)] rounded-lg transition-colors"
      >
        {{ locale === 'zh' ? '重置高级设置' : 'Reset Advanced Settings' }}
      </button>
    </div>
  </section>
</template>
