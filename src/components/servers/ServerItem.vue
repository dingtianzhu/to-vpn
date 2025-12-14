<script setup lang="ts">
import type { Server } from '@/types'

defineProps<{ server: Server; selected: boolean }>()
defineEmits<{ select: [] }>()
</script>

<template>
  <button class="w-full flex items-center justify-between p-3 rounded-lg transition-all duration-200 group" :class="[
    selected
      ? 'bg-[var(--vpn-primary)] text-white shadow-sm'
      : 'hover:bg-black/5 dark:hover:bg-white/5 text-[var(--vpn-text)]'
  ]" @click="$emit('select')">
    <div class="flex items-center gap-3">
      <!-- Flag with minimal shadow -->
      <div
        class="w-8 h-8 flex items-center justify-center text-xl bg-white/50 dark:bg-white/10 rounded-md shadow-sm border border-black/5 dark:border-white/5 backdrop-blur-sm">
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
      <!-- Ping Indicator -->
      <div class="flex items-center gap-1.5" :class="selected ? 'text-white/90' : 'text-[var(--vpn-text-secondary)]'">
        <div class="w-1.5 h-1.5 rounded-full" :class="{
          'bg-emerald-500': server.ping < 100 && !selected,
          'bg-amber-500': server.ping >= 100 && server.ping < 200 && !selected,
          'bg-red-500': server.ping >= 200 && !selected,
          'bg-white': selected
        }"></div>
        <span class="text-[11px] font-mono tabular-nums">{{ server.ping }}ms</span>
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
