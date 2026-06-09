<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18nStore } from '@/stores/i18n'
import type { Server } from '@/types'

const props = defineProps<{ server: Server; selected: boolean }>()
defineEmits<{ select: [] }>()

const i18nStore = useI18nStore()
const { t } = storeToRefs(i18nStore)

const isAvailable = computed(() => props.server.status === 'online')
</script>

<template>
  <button
    class="w-full flex items-center justify-between p-3 rounded-lg transition-all duration-200 group"
    :class="[
      selected
        ? 'bg-[var(--vpn-primary)] text-white shadow-sm'
        : !isAvailable
          ? 'opacity-40 cursor-not-allowed bg-black/[0.02] dark:bg-white/[0.02] text-[var(--vpn-text-secondary)]'
          : 'hover:bg-black/5 dark:hover:bg-white/5 text-[var(--vpn-text)]'
    ]"
    :disabled="!isAvailable"
    @click="$emit('select')"
  >
    <div class="flex items-center gap-3">
      <!-- Flag with minimal shadow -->
      <div
        class="w-8 h-8 flex items-center justify-center text-xl bg-white/50 dark:bg-white/10 rounded-md shadow-sm border border-black/5 dark:border-white/5 backdrop-blur-sm"
        :class="{ 'opacity-60': !isAvailable }"
      >
        {{ server.flag }}
      </div>

      <div class="text-left">
        <div class="font-medium text-[13px] leading-tight" :class="selected ? 'text-white' : 'text-[var(--vpn-text)]'">
          {{ server.city }}
        </div>
        <div class="text-[11px] mt-0.5 opacity-80"
          :class="selected ? 'text-white/80' : 'text-[var(--vpn-text-secondary)]'">
          {{ server.country }}
        </div>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <!-- Status Badge -->
      <span
        v-if="!selected"
        class="px-1.5 py-0.5 text-[10px] font-medium rounded border transition-all duration-200"
        :class="{
          'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20': isAvailable,
          'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20': !isAvailable && server.status === 'maintenance',
          'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20': !isAvailable && server.status !== 'maintenance'
        }"
      >
        {{ isAvailable ? t.servers.available : (server.status === 'maintenance' ? t.servers.maintenance : t.servers.cannotConnect) }}
      </span>

      <!-- Ping Indicator -->
      <div v-if="isAvailable" class="flex items-center gap-1.5" :class="selected ? 'text-white/90' : 'text-[var(--vpn-text-secondary)]'">
        <template v-if="server.ping === 999">
          <div class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></div>
          <span class="text-[11px] font-mono tabular-nums opacity-60">- ms</span>
        </template>
        <template v-else>
          <div class="w-1.5 h-1.5 rounded-full" :class="{
            'bg-emerald-500': server.ping < 100 && !selected,
            'bg-amber-500': server.ping >= 100 && server.ping < 200 && !selected,
            'bg-red-500': server.ping >= 200 && !selected,
            'bg-white': selected
          }"></div>
          <span class="text-[11px] font-mono tabular-nums">{{ server.ping }}ms</span>
        </template>
      </div>

      <!-- Selection Checkmark -->
      <div class="w-4 h-4 flex items-center justify-center">
        <svg v-if="selected" class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    </div>
  </button>
</template>

