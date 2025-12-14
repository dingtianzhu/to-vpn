<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useServersStore } from '@/stores/servers'
import { useVpnStore } from '@/stores/vpn'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'
import ServerItem from '@/components/servers/ServerItem.vue'

const router = useRouter()
const serversStore = useServersStore()
const vpnStore = useVpnStore()
const i18nStore = useI18nStore()

const { sortedServers, currentServerId, isLoading } = storeToRefs(serversStore)
const { isConnected, status } = storeToRefs(vpnStore)
const { t } = storeToRefs(i18nStore)

const searchQuery = ref('')
const isRefreshing = ref(false)

// 过滤后的服务器列表（从排序后的列表过滤）
const filteredServers = computed(() => {
  if (!searchQuery.value) return sortedServers.value
  const q = searchQuery.value.toLowerCase()
  return sortedServers.value.filter(s =>
    s.country.toLowerCase().includes(q) ||
    s.city.toLowerCase().includes(q) ||
    (s.name || '').toLowerCase().includes(q)
  )
})

// 处理服务器选择
async function handleServerSelect(serverId: number) {
  const isSameServer = serverId === currentServerId.value

  // 选择新服务器
  serversStore.selectServer(serverId)

  if (isSameServer) {
    // 同一服务器，直接跳转，不做额外操作
    router.push('/')
    return
  }

  // 不同服务器
  if (isConnected.value || status.value === 'connecting') {
    // 当前已连接或正在连接，设置 "switch" 动作（断开后重连新服务器）
    serversStore.setPendingAction('connect')
  } else {
    // 当前未连接，设置 "connect" 动作
    serversStore.setPendingAction('connect')
  }

  router.push('/')
}

async function handleRefresh() {
  isRefreshing.value = true
  await serversStore.testAllPings()
  setTimeout(() => isRefreshing.value = false, 500)
}

onMounted(() => {
  if (sortedServers.value.length === 0) {
    serversStore.loadServers()
  }
  // 启动实时延迟更新
  serversStore.startRealtimePingLoop()
})

onUnmounted(() => {
  // 离开页面时停止实时更新
  serversStore.stopRealtimePingLoop()
})
</script>

<template>
  <div class="h-full flex flex-col bg-[var(--vpn-bg)]">
    <!-- Header -->
    <div
      class="px-5 pt-6 pb-2 sticky top-0 z-10 bg-[var(--vpn-bg)]/95 backdrop-blur-xl border-b border-[var(--vpn-border)]">
      <div class="flex items-center justify-between mb-3">
        <h1 class="text-xl font-bold tracking-tight text-[var(--vpn-text)]">
          {{ t.servers.title }}
        </h1>
        <button @click="handleRefresh" :disabled="isRefreshing"
          class="group w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 active:scale-90 transition-all disabled:opacity-50"
          :title="t.servers.refresh">
          <svg class="w-4 h-4 text-[var(--vpn-text-secondary)] group-hover:text-[var(--vpn-text)]"
            :class="{ 'animate-spin': isRefreshing }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <!-- Search -->
      <div class="relative">
        <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--vpn-muted)]" fill="none"
          stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input v-model="searchQuery" type="text" :placeholder="t.servers.searchPlaceholder"
          class="w-full pl-9 pr-3 py-1.5 text-[13px] rounded-lg bg-[var(--vpn-card)] border border-[var(--vpn-border)] focus:border-blue-500/50 focus:ring-[3px] focus:ring-blue-500/10 focus:outline-none transition-all" />
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="flex-1 flex items-center justify-center">
      <div class="w-6 h-6 border-2 border-[var(--vpn-primary)] border-t-transparent rounded-full animate-spin"></div>
    </div>

    <!-- Server List -->
    <div v-else class="flex-1 overflow-y-auto p-3 space-y-1">
      <ServerItem v-for="server in filteredServers" :key="server.id" :server="server"
        :selected="server.id === currentServerId" @select="handleServerSelect(server.id)" />

      <div v-if="filteredServers.length === 0"
        class="flex flex-col items-center justify-center py-12 text-[var(--vpn-muted)]">
        <p class="text-[13px]">{{ t.servers.empty }}</p>
      </div>
    </div>

    <!-- 当前连接状态提示 -->
    <div v-if="isConnected"
      class="px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border-t border-emerald-200 dark:border-emerald-800">
      <div class="flex items-center justify-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span>{{ t.home.selectingNewServer }}</span>
      </div>
    </div>
  </div>
</template>