<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useVpnStore } from '@/stores/vpn'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'
import type { ConnectionMode } from '@/types'

const settingsStore = useSettingsStore()
const vpnStore = useVpnStore()
const i18nStore = useI18nStore()

const { settings } = storeToRefs(settingsStore)
const { t, locale } = storeToRefs(i18nStore)

const isLocalSwitching = ref(false)
const switchError = ref<string | null>(null)

interface ModeOption {
  value: ConnectionMode
  label: string
  description: string
  color: string
}

const modes = computed<ModeOption[]>(() => [
  {
    value: 'socks',
    label: t.value.settings.socksMode,
    description: locale.value === 'zh' 
      ? '仅代理配置了代理的应用，系统其他流量不受影响' 
      : 'Only proxy configured apps, other traffic unaffected',
    color: 'text-blue-600 dark:text-blue-400'
  },
  {
    value: 'tun',
    label: t.value.settings.tunMode,
    description: locale.value === 'zh' 
      ? '全局接管系统网络，所有流量通过 VPN（需要管理员权限）' 
      : 'Global network takeover, all traffic through VPN (requires admin)',
    color: 'text-emerald-600 dark:text-emerald-400'
  }
])

// 默认值文本
const defaultText = computed(() => locale.value === 'zh' ? '默认: SOCKS' : 'Default: SOCKS')

const progressText = computed(() => {
  const progress = vpnStore.modeSwitchProgress
  switch (progress) {
    case 'saving': return 'Saving...'
    case 'disconnecting': return 'Disconnecting...'
    case 'switching': return 'Switching...'
    case 'connecting': return 'Reconnecting...'
    case 'rolling_back': return 'Rolling back...'
    default: return ''
  }
})

const isSwitching = computed(() => {
  return isLocalSwitching.value || vpnStore.isModeSwitching
})

const showProgress = computed(() => {
  const progress = vpnStore.modeSwitchProgress
  return isSwitching.value && progress !== 'idle' && progress !== 'done' && progress !== 'failed'
})

async function selectMode(mode: ConnectionMode) {
  if (settings.value.connectionMode === mode || isSwitching.value) {
    return
  }

  switchError.value = null
  isLocalSwitching.value = true

  try {
    if (vpnStore.isConnected || vpnStore.isConnecting) {
      const result = await vpnStore.switchMode(mode)
      if (!result.success) {
        switchError.value = result.error
        setTimeout(() => { switchError.value = null }, 3000)
      }
    } else {
      settingsStore.setConnectionMode(mode)
    }
  } catch (e) {
    switchError.value = e instanceof Error ? e.message : String(e)
    setTimeout(() => { switchError.value = null }, 3000)
  } finally {
    isLocalSwitching.value = false
  }
}
</script>

<template>
  <section>
    <div class="flex items-center justify-between mb-2 pl-2">
      <h2 class="text-[11px] font-semibold text-[var(--vpn-muted)] uppercase tracking-wider">
        {{ t.settings.connectionMode }}
      </h2>
      <span class="text-[9px] font-mono bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded">
        {{ defaultText }}
      </span>
    </div>
    <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-xl overflow-hidden shadow-sm grid grid-cols-2 p-1 gap-1">
      <button 
        v-for="mode in modes" 
        :key="mode.value" 
        @click="selectMode(mode.value)"
        :disabled="isSwitching"
        class="flex flex-col items-center justify-center py-3 rounded-lg transition-all duration-200 border relative"
        :class="[
          settings.connectionMode === mode.value
            ? `bg-blue-50 dark:bg-white/10 shadow-md border-blue-200 dark:border-white/20 font-medium ${mode.color}`
            : 'border-transparent text-[var(--vpn-text-secondary)] hover:bg-black/5 dark:hover:bg-white/5',
          isSwitching ? 'opacity-60 cursor-not-allowed' : ''
        ]">
        <span class="text-[13px]">{{ mode.label }}</span>
        <span class="text-[10px] opacity-60">{{ mode.description }}</span>
      </button>
    </div>
    
    <div v-if="showProgress" class="mt-2 flex items-center justify-center gap-2 text-[11px] text-[var(--vpn-muted)]">
      <svg class="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span>{{ progressText }}</span>
    </div>
    
    <div v-if="switchError" class="mt-2 text-[11px] text-red-500 dark:text-red-400 text-center px-2">
      {{ switchError }}
    </div>
  </section>
</template>
