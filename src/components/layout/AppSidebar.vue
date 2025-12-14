<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'
import { useVpn } from '@/composables/useVpn'
import { useAuthStore } from '@/stores/auth'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'

const route = useRoute()
const router = useRouter()
const { isConnected } = useVpn()
const authStore = useAuthStore()
const i18nStore = useI18nStore()
const { t } = storeToRefs(i18nStore)
const { isAuthenticated, avatarColor, avatarLetter, currentUser } = storeToRefs(authStore)

// 最小化到托盘
async function minimizeToTray() {
  await invoke('minimize_to_tray')
}

const navItems = computed(() => [
  { id: 'home', path: '/', icon: 'power', label: t.value.nav.home },
  { id: 'servers', path: '/servers', icon: 'globe', label: t.value.nav.servers },
  { id: 'stats', path: '/stats', icon: 'chart', label: '流量统计' },
  { id: 'logs', path: '/logs', icon: 'terminal', label: t.value.nav.logs },
])

const currentPath = computed(() => route.path)

const icons: Record<string, string> = {
  power: 'M13 10V3L4 14h7v7l9-11h-7z',
  globe: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9',
  terminal: 'M4 17l6-6-6-6M12 19h8',
  chart: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  settings: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
}

// 点击头像处理
function handleAvatarClick() {
  if (isAuthenticated.value) {
    router.push('/profile')
  } else {
    // 未登录时跳转登录页，并记录要去 profile
    router.push({ path: '/login', query: { redirect: '/profile' } })
  }
}
</script>

<template>
  <nav
    class="w-[72px] h-full flex flex-col items-center py-6 vpn-sidebar vpn-blur-bg titlebar-drag z-50 border-r border-[var(--vpn-border)]"
    data-tauri-drag-region>
    <div class="h-6 w-full mb-4" data-tauri-drag-region></div>

    <!-- App Logo / Status -->
    <div class="mb-8 titlebar-no-drag">
      <div :class="[
        'w-10 h-10 rounded-xl flex items-center justify-center shadow-md transition-all duration-500',
        isConnected
          ? 'bg-gradient-to-br from-emerald-400 to-teal-500 shadow-emerald-500/20'
          : 'bg-gradient-to-br from-slate-500 to-slate-600'
      ]">
        <svg class="w-5 h-5 text-white drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"
            d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.2-2.858.59-4.18" />
        </svg>
      </div>
    </div>

    <!-- Main Navigation -->
    <div class="flex-1 flex flex-col gap-4 w-full px-3 titlebar-no-drag">
      <button v-for="item in navItems" :key="item.id" @click="router.push(item.path)" :title="item.label"
        class="group relative w-full aspect-square flex items-center justify-center rounded-xl transition-all duration-300"
        :class="currentPath === item.path ? 'text-[var(--vpn-primary)] shadow-sm' : 'text-[var(--vpn-text-secondary)] hover:bg-black/5 dark:hover:bg-white/10'">

        <!-- Active Background Indicator -->
        <span v-if="currentPath === item.path"
          class="absolute inset-0 bg-white dark:bg-white/10 rounded-xl shadow-sm z-0">
        </span>

        <!-- Icon (z-10 ensures it's above background) -->
        <svg class="w-6 h-6 transition-colors duration-300 relative z-10" fill="none" stroke="currentColor"
          viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="icons[item.icon]" />
        </svg>
      </button>
    </div>

    <!-- Bottom Actions -->
    <div class="flex flex-col gap-4 mb-4 px-3 titlebar-no-drag items-center">

      <!-- Minimize to Tray Button -->
      <button @click="minimizeToTray"
        class="w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 text-[var(--vpn-text-secondary)] hover:bg-black/5 dark:hover:bg-white/10"
        title="最小化到托盘">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </button>

      <!-- Settings Button -->
      <button @click="router.push('/settings')"
        class="w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 relative group"
        :class="currentPath === '/settings' ? 'text-[var(--vpn-text)] bg-white dark:bg-white/10 shadow-sm' : 'text-[var(--vpn-text-secondary)] hover:bg-black/5 dark:hover:bg-white/10'"
        title="Settings">
        <svg class="w-5 h-5 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="icons.settings" />
        </svg>
      </button>

      <!-- Avatar -->
      <button @click="handleAvatarClick"
        class="group relative w-10 h-10 rounded-full flex items-center justify-center overflow-hidden transition-all duration-300 shadow-sm ring-2 ring-transparent hover:ring-gray-200 dark:hover:ring-white/10"
        :class="[isAuthenticated ? (currentUser?.avatar ? '' : avatarColor) : 'bg-slate-200 dark:bg-white/10']"
        title="Profile">

        <template v-if="isAuthenticated">
          <img v-if="currentUser?.avatar" :src="currentUser.avatar" class="w-full h-full object-cover" />
          <span v-else class="text-white font-bold text-sm">{{ avatarLetter }}</span>
        </template>

        <template v-else>
          <svg class="w-5 h-5 text-[var(--vpn-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </template>
      </button>
    </div>
  </nav>
</template>