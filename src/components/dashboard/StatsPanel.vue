<script setup lang="ts">
import { computed } from 'vue'
import type { ConnectionStats } from '@/types'
import { formatBytes } from '@/utils/format'
import { useI18nStore } from '@/stores/i18n'
import { useAuthStore } from '@/stores/auth'
import { storeToRefs } from 'pinia'

interface Props {
  stats: ConnectionStats
  isConnected: boolean
}

const props = defineProps<Props>()
const i18nStore = useI18nStore()
const authStore = useAuthStore()
const { t } = storeToRefs(i18nStore)
const { isAdmin } = storeToRefs(authStore)

// IP 显示逻辑：管理员或用户名为 admin 显示真实 IP，普通用户显示隐藏
const canViewIp = computed(() => {
  if (isAdmin.value) return true
  // 用户名为 admin 也可以查看
  const user = authStore.currentUser
  return user?.username === 'admin'
})

const ipDisplay = computed(() => {
  if (!props.isConnected) return t.value.stats.hidden
  if (canViewIp.value) {
    return props.stats.ip || t.value.stats.loading
  }
  return t.value.stats.hidden
})

const displayStats = computed(() => [
  {
    icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
    label: t.value.stats.download,
    value: props.isConnected ? formatBytes(props.stats.downloadSpeed) + '/s' : '—',
    color: 'text-sky-500 dark:text-sky-400',
    bg: 'bg-sky-50 dark:bg-sky-500/10'
  },
  {
    icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
    label: t.value.stats.upload,
    value: props.isConnected ? formatBytes(props.stats.uploadSpeed) + '/s' : '—',
    color: 'text-orange-500 dark:text-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-500/10'
  },
  {
    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    label: t.value.stats.latency,
    value: props.isConnected ? `${props.stats.latency} ms` : '—',
    color: 'text-emerald-500 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10'
  },
  {
    icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9',
    label: t.value.stats.ip,
    value: ipDisplay.value,
    color: 'text-purple-500 dark:text-purple-400',
    bg: 'bg-purple-50 dark:bg-purple-500/10'
  }
])
</script>

<template>
  <div class="px-6 py-6 pb-8 bg-white/50 dark:bg-black/20 backdrop-blur-md border-t border-[var(--vpn-border)]">
    <div class="grid grid-cols-4 gap-4">
      <div v-for="stat in displayStats" :key="stat.label"
        class="flex flex-col items-center justify-center p-3 rounded-xl bg-white/60 dark:bg-white/5 border border-[var(--vpn-border)] shadow-sm transition-transform hover:scale-[1.02]">

        <div class="flex items-center gap-1.5 mb-1.5 opacity-80">
          <div :class="['p-1 rounded-md', stat.bg]">
            <svg :class="['w-3.5 h-3.5', stat.color]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="stat.icon" />
            </svg>
          </div>
          <span class="text-[10px] font-bold uppercase tracking-wider text-[var(--vpn-muted)]">{{ stat.label }}</span>
        </div>

        <span class="text-sm font-semibold font-mono text-slate-800 dark:text-slate-200 truncate max-w-full px-2">
          {{ stat.value }}
        </span>
      </div>
    </div>
  </div>
</template>