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
  tcpFastOpen: locale.value === 'zh' ? 'TCP Fast Open' : 'TCP Fast Open',
  tcpFastOpenDesc: locale.value === 'zh' ? '减少连接延迟' : 'Reduce connection latency',
  upMbps: locale.value === 'zh' ? '上行带宽限制' : 'Upload Bandwidth',
  downMbps: locale.value === 'zh' ? '下行带宽限制' : 'Download Bandwidth',
  blockQuic: locale.value === 'zh' ? '阻断 QUIC' : 'Block QUIC',
  blockQuicDesc: locale.value === 'zh' ? '避免与 Hysteria2 冲突' : 'Avoid conflicts with Hysteria2',
  disableIpv6: locale.value === 'zh' ? '禁用 IPv6' : 'Disable IPv6',
  disableIpv6Desc: locale.value === 'zh' ? 'TUN 模式下防止 IPv6 泄漏' : 'Prevent IPv6 leak in TUN mode',
  mbps: 'Mbps',
  invalidBandwidth: locale.value === 'zh' ? '请输入有效的带宽值 (1-10000)' : 'Enter valid bandwidth (1-10000)',
}))

const icons = {
  tcpFastOpen: 'M13 10V3L4 14h7v7l9-11h-7z',
  bandwidth: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  quic: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
  ipv6: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9',
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

// TCP Fast Open 切换
async function toggleTcpFastOpen() {
  settingsStore.updateSettings({ enableTcpFastOpen: !settings.value.enableTcpFastOpen })
  await triggerReconnect()
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
</script>

<template>
  <section>
    <h2 class="text-[11px] font-semibold text-[var(--vpn-muted)] uppercase tracking-wider mb-2 pl-2">
      {{ texts.sectionTitle }}
    </h2>
    <div
      class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-xl overflow-hidden shadow-sm divide-y divide-[var(--vpn-border)]">

      <!-- TCP Fast Open -->
      <SettingRow :icon="icons.tcpFastOpen" icon-color="text-yellow-500" icon-bg="bg-yellow-500/10"
        :title="texts.tcpFastOpen" :subtitle="texts.tcpFastOpenDesc">
        <SettingSwitch :model-value="settings.enableTcpFastOpen" @update:model-value="toggleTcpFastOpen" />
      </SettingRow>

      <!-- Upload Bandwidth -->
      <div>
        <SettingRow :icon="icons.bandwidth" icon-color="text-green-500" icon-bg="bg-green-500/10"
          :title="texts.upMbps">
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
      <div>
        <SettingRow :icon="icons.bandwidth" icon-color="text-blue-500" icon-bg="bg-blue-500/10"
          :title="texts.downMbps">
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
      <SettingRow :icon="icons.quic" icon-color="text-red-500" icon-bg="bg-red-500/10"
        :title="texts.blockQuic" :subtitle="texts.blockQuicDesc">
        <SettingSwitch :model-value="settings.blockQuic" @update:model-value="toggleBlockQuic" />
      </SettingRow>

      <!-- Disable IPv6 -->
      <SettingRow :icon="icons.ipv6" icon-color="text-purple-500" icon-bg="bg-purple-500/10"
        :title="texts.disableIpv6" :subtitle="texts.disableIpv6Desc">
        <SettingSwitch :model-value="settings.disableIpv6" @update:model-value="toggleDisableIpv6" />
      </SettingRow>

    </div>
  </section>
</template>
