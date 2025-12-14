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
import type { DnsMode } from '@/types'

const router = useRouter()
const settingsStore = useSettingsStore()
const i18nStore = useI18nStore()
const vpnStore = useVpnStore()
const notification = useNotification()

const { settings } = storeToRefs(settingsStore)
const { t } = storeToRefs(i18nStore)
const { status } = storeToRefs(vpnStore)

// 自定义 DNS 输入状态
const customDnsInput = ref(settings.value.customDns || '')
const customDnsError = ref('')

// 同步 customDns 到输入框
watch(() => settings.value.customDns, (newVal) => {
  if (newVal !== customDnsInput.value) {
    customDnsInput.value = newVal || ''
  }
})

const dnsOptions = computed(() => [
  { value: 'cloudflare', label: 'Cloudflare (1.1.1.1)' },
  { value: 'google', label: 'Google (8.8.8.8)' },
  { value: 'aliyun', label: 'Aliyun (223.5.5.5)' },
  { value: 'custom', label: t.value.settings.customDns || 'Custom DNS...' },
])

// MTU 选项说明：
// - 0: 自动（使用默认值 1400）
// - 1400: 推荐值，平衡稳定性和隐蔽性
// - 1450: 更高性能，适合稳定网络
// - 1500: 最大值，与正常网络一致，但可能导致分片
const mtuOptions = computed(() => [
  { value: 0, label: 'Auto (1400)' },
  { value: 1400, label: '1400 (Recommended)' },
  { value: 1450, label: '1450 (Balanced)' },
  { value: 1500, label: '1500 (Max)' },
])

const icons = {
  reconnect: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  dns: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9',
  mtu: 'M13 10V3L4 14h7v7l9-11h-7z'
}

// 验证 IP 地址格式
function isValidIp(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
  if (!ipv4Regex.test(ip)) return false
  const parts = ip.split('.')
  return parts.every(part => {
    const num = parseInt(part, 10)
    return num >= 0 && num <= 255
  })
}

// 触发重连（如果已连接）
async function triggerReconnect() {
  if (status.value === 'connected' || status.value === 'connecting') {
    await vpnStore.disconnect()
    router.push('/')
    setTimeout(() => vpnStore.connect(), 500)
  }
}

// DNS 选择变化（非 custom 时立即触发重连）
async function updateDns(value: string | number) {
  const newDns = value as DnsMode
  const oldDns = settings.value.dnsMode
  
  settingsStore.updateSettings({ dnsMode: newDns })
  
  // 如果从非 custom 切换到非 custom，触发重连
  if (newDns !== 'custom' && oldDns !== newDns) {
    await triggerReconnect()
  }
  // 如果切换到 custom，不触发重连，等待用户输入并验证
}

// MTU 变化时触发重连
async function updateMtu(value: string | number) {
  const newMtu = Number(value)
  const oldMtu = settings.value.mtu
  
  // 0 表示自动（使用默认值）
  if (newMtu !== oldMtu) {
    settingsStore.updateSettings({ mtu: newMtu })
    // 只有在已连接时才触发重连
    await triggerReconnect()
  }
}

function toggleAutoReconnect() {
  settingsStore.updateSettings({ autoReconnect: !settings.value.autoReconnect })
}

// 自定义 DNS 失去焦点时验证并触发重连
async function handleCustomDnsBlur() {
  const dns = customDnsInput.value.trim()
  
  // 空值时清除错误，不触发重连
  if (!dns) {
    customDnsError.value = ''
    return
  }
  
  // 验证 IP 格式
  if (!isValidIp(dns)) {
    customDnsError.value = t.value.errors?.invalidDns || 'Invalid IP address format'
    notification.warning(customDnsError.value)
    return
  }
  
  customDnsError.value = ''
  
  // 只有值变化时才保存并触发重连
  if (dns !== settings.value.customDns) {
    settingsStore.updateSettings({ customDns: dns })
    await triggerReconnect()
  }
}
</script>

<template>
  <section>
    <h2 class="text-[11px] font-semibold text-[var(--vpn-muted)] uppercase tracking-wider mb-2 pl-2">
      {{ t.settings.networkPreferences }}
    </h2>
    <div
      class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-xl overflow-hidden shadow-sm divide-y divide-[var(--vpn-border)]">

      <!-- Auto Reconnect -->
      <SettingRow :icon="icons.reconnect" icon-color="text-orange-500" icon-bg="bg-orange-500/10"
        :title="t.settings.autoReconnect">
        <SettingSwitch :model-value="settings.autoReconnect" @update:model-value="toggleAutoReconnect" />
      </SettingRow>

      <!-- DNS Provider -->
      <div>
        <SettingRow :icon="icons.dns" icon-color="text-blue-500" icon-bg="bg-blue-500/10" :title="t.settings.dns">
          <SettingSelect :model-value="settings.dnsMode" :options="dnsOptions" @update:model-value="updateDns" />
        </SettingRow>

        <!-- Custom DNS Input -->
        <div v-if="settings.dnsMode === 'custom'" class="px-4 pb-3 pt-1">
          <div class="flex items-start gap-3 pl-11">
            <div class="flex-1">
              <input v-model="customDnsInput" type="text" :placeholder="t.settings.customDnsPlaceholder"
                @blur="handleCustomDnsBlur"
                @keyup.enter="handleCustomDnsBlur"
                :class="[
                  'w-full bg-[var(--vpn-input-bg)] border rounded-lg px-3 py-2 text-[12px] text-[var(--vpn-text)] outline-none transition-all font-mono',
                  customDnsError ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20' : 'border-[var(--vpn-border)] focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10'
                ]" />
              <p v-if="customDnsError" class="text-[10px] text-red-500 mt-1.5 flex items-center gap-1">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {{ customDnsError }}
              </p>
              <p v-else class="text-[10px] text-[var(--vpn-muted)] mt-1.5">
                {{ t.settings.customDnsHint || 'Press Enter or click outside to apply' }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- MTU Size -->
      <SettingRow :icon="icons.mtu" icon-color="text-purple-500" icon-bg="bg-purple-500/10" :title="t.settings.mtu">
        <SettingSelect :model-value="settings.mtu" :options="mtuOptions" @update:model-value="updateMtu" />
      </SettingRow>

    </div>
  </section>
</template>