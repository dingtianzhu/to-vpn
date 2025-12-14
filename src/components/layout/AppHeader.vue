<script setup lang="ts">
import { computed } from 'vue'
import { useVpn } from '@/composables/useVpn'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'

// 移除 networkIssue, forceRecover 的解构
const { status } = useVpn()
const i18nStore = useI18nStore()
const { t } = storeToRefs(i18nStore)

const statusConfig = computed(() => ({
  disconnected: {
    text: t.value.status.disconnected,
    class: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/10 dark:text-slate-400 dark:border-white/5'
  },
  connecting: {
    text: t.value.status.connecting,
    class: 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
  },
  connected: {
    text: t.value.status.connected,
    class: 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
  },
  disconnecting: {
    text: t.value.status.disconnecting,
    class: 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
  },
  error: {
    text: t.value.status.error,
    class: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'
  },
}))

const currentStatus = computed(() => statusConfig.value[status.value])
</script>

<template>
  <header class="h-16 flex items-center justify-center titlebar-drag px-6 w-full z-50" data-tauri-drag-region>
    <div class="flex items-center gap-3 titlebar-no-drag">
      <div :class="[
        'px-3 py-1 rounded-full text-[11px] font-medium border shadow-sm flex items-center gap-2 transition-all duration-300 backdrop-blur-md',
        currentStatus.class
      ]">
        <span :class="[
          'w-1.5 h-1.5 rounded-full shadow-[0_0_8px_currentColor]',
          status === 'connected' ? 'bg-emerald-500 text-emerald-500' :
            status === 'disconnected' ? 'bg-slate-400 text-slate-400' : 'bg-amber-500 text-amber-500 animate-pulse'
        ]" />
        {{ currentStatus.text }}
      </div>
    </div>
  </header>
</template>