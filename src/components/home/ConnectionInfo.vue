<script setup lang="ts">
import { formatDuration } from '@/utils/format'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'

interface Props {
  isConnected: boolean
  connectedTime: number
  membershipLevel: string
  showMembership: boolean
}

defineProps<Props>()
const { t } = storeToRefs(useI18nStore())

const badgeClass = (level: string) => {
  switch (level) {
    case 'Administrator':
      return 'bg-purple-500/10 text-purple-500'
    case 'Pro Member':
      return 'bg-emerald-500/10 text-emerald-500'
    default:
      return 'bg-slate-500/10 text-slate-500'
  }
}
</script>

<template>
  <div class="h-6 flex items-center justify-center gap-3">
    <!-- 连接计时器 -->
    <Transition name="fade">
      <div v-if="isConnected && connectedTime > 0"
        class="px-3 py-1 rounded-full bg-white/80 dark:bg-white/10 border border-[var(--vpn-border)] shadow-sm text-xs font-mono text-[var(--vpn-text-secondary)] flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        {{ formatDuration(connectedTime) }}
      </div>
    </Transition>

    <!-- 分隔点 (仅当两者都显示时) -->
    <span v-if="isConnected && connectedTime > 0 && showMembership"
      class="w-1 h-1 rounded-full bg-[var(--vpn-border)]"></span>

    <!-- 会员标识 -->
    <div v-if="showMembership" class="flex items-center gap-1.5 text-[11px]">
      <span class="text-[var(--vpn-text-secondary)]">{{ t.home.as }}</span>
      <span class="px-2 py-0.5 rounded-full font-medium" :class="badgeClass(membershipLevel)">
        {{ membershipLevel }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>