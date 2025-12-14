<script setup lang="ts">
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@/stores/settings'
import { useI18nStore } from '@/stores/i18n'
import { useVpnStore } from '@/stores/vpn'

// 拆分后的组件
import ConnectionModeSection from '@/components/settings/ConnectionModeSection.vue'
import NetworkPreferencesSection from '@/components/settings/NetworkPreferencesSection.vue'
import SystemHelperSection from '@/components/settings/SystemHelperSection.vue'
import GeneralSettingsSection from '@/components/settings/GeneralSettingsSection.vue'

const router = useRouter()
const settingsStore = useSettingsStore()
const i18nStore = useI18nStore()
const vpnStore = useVpnStore()

const { settings } = storeToRefs(settingsStore)
const { t } = storeToRefs(i18nStore)
const { status } = storeToRefs(vpnStore)
// 监听连接模式和 MTU 变化 -> 自动重连
// 注意：DNS 变化不在这里处理，由 NetworkPreferencesSection 组件处理
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
      <h1 class="text-2xl font-bold tracking-tight text-[var(--vpn-text)]">
        {{ t.settings.title }}
      </h1>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto px-6 pb-10 space-y-6">
      <!-- General Settings -->
      <GeneralSettingsSection />
      <!-- Connection Mode -->
      <ConnectionModeSection />

      <!-- Network Preferences -->
      <NetworkPreferencesSection />

      <!-- System Helper -->
      <SystemHelperSection />



      <!-- Version Info -->
      <div class="text-center pt-2">
        <p class="text-[10px] text-[var(--vpn-muted)]">
          ToVpn Client v1.0.0
        </p>
      </div>

    </div>
  </div>
</template>