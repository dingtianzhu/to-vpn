<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'
import type { ConnectionMode } from '@/types'

const settingsStore = useSettingsStore()
const i18nStore = useI18nStore()

const { settings } = storeToRefs(settingsStore)
const { t } = storeToRefs(i18nStore)

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
    description: t.value.settings.proxyOnly,
    color: 'text-blue-600 dark:text-blue-400'
  },
  {
    value: 'tun',
    label: t.value.settings.tunMode,
    description: t.value.settings.globalRoute,
    color: 'text-emerald-600 dark:text-emerald-400'
  }
])

function selectMode(mode: ConnectionMode) {
  settingsStore.setConnectionMode(mode)
}
</script>

<template>
  <section>
    <h2 class="text-[11px] font-semibold text-[var(--vpn-muted)] uppercase tracking-wider mb-2 pl-2">
      {{ t.settings.connectionMode }}
    </h2>
    <div
      class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-xl overflow-hidden shadow-sm grid grid-cols-2 p-1 gap-1">
      <button v-for="mode in modes" :key="mode.value" @click="selectMode(mode.value)"
        class="flex flex-col items-center justify-center py-3 rounded-lg transition-all duration-200 border"
        :class="settings.connectionMode === mode.value
          ? `bg-blue-50 dark:bg-white/10 shadow-md border-blue-200 dark:border-white/20 ${mode.color} font-medium`
          : 'border-transparent text-[var(--vpn-text-secondary)] hover:bg-black/5 dark:hover:bg-white/5'">
        <span class="text-[13px]">{{ mode.label }}</span>
        <span class="text-[10px] opacity-60">{{ mode.description }}</span>
      </button>
    </div>
  </section>
</template>