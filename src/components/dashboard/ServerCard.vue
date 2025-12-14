<script setup lang="ts">
import type { Server } from '@/types'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'

defineProps<{ server: Server }>()
defineEmits<{ click: [] }>()

const i18nStore = useI18nStore()
const { t } = storeToRefs(i18nStore)
</script>

<template>
  <button
    class="flex items-center gap-4 w-full max-w-sm p-4 bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-[var(--vpn-border)] hover:shadow-md hover:-translate-y-0.5 hover:bg-white dark:hover:bg-white/10 transition-all duration-300 group backdrop-blur-sm"
    @click="$emit('click')">
    <div
      class="w-10 h-10 flex items-center justify-center text-2xl bg-slate-50 dark:bg-white/10 rounded-xl border border-slate-100 dark:border-white/5 shadow-inner">
      {{ server.flag }}
    </div>

    <div class="flex-1 text-left">
      <div class="text-[10px] font-bold text-[var(--vpn-muted)] uppercase tracking-wider mb-0.5">{{
        t.servers.selectedLocation }}</div>
      <div
        class="font-medium text-slate-900 dark:text-slate-100 text-sm group-hover:text-[var(--vpn-primary)] transition-colors">
        {{ server.city }}, {{ server.country }}
      </div>
    </div>

    <div
      class="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 dark:bg-white/10 text-slate-400 group-hover:bg-[var(--vpn-primary)] group-hover:text-white transition-all duration-300">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </div>
  </button>
</template>