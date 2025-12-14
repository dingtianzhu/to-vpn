<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import AppLayout from '@/components/layout/AppLayout.vue'
import { useVpnStore } from '@/stores/vpn'
import { useServersStore } from '@/stores/servers'
import { useAuthStore } from '@/stores/auth'

const vpnStore = useVpnStore()
const serversStore = useServersStore()
const authStore = useAuthStore()

async function performCleanup() {
  if (vpnStore.isConnected || vpnStore.isConnecting) {
    try { await vpnStore.disconnect() } catch (e) { console.error(e) }
  }
  vpnStore.cleanup()
  serversStore.cleanup()
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    vpnStore.syncVpnStatus()
  }
}

let unlistenClose: (() => void) | null = null;
let unlistenFocus: (() => void) | null = null;

onMounted(async () => {
  await authStore.initialize()
  await vpnStore.initEventListeners()

  // 核心修改：给予一点延迟，确保后端响应
  setTimeout(() => {
    vpnStore.startHeartbeat();
    vpnStore.syncVpnStatus();
  }, 100);

  await vpnStore.checkHelperStatus()
  await serversStore.loadServers()

  document.addEventListener('visibilitychange', handleVisibilityChange)

  try {
    const appWindow = getCurrentWindow()
    unlistenClose = await appWindow.onCloseRequested(async (e) => {
      e.preventDefault()
      await appWindow.hide()
    })
    unlistenFocus = await appWindow.listen('tauri://focus', () => {
      vpnStore.syncVpnStatus()
    })
  } catch (e) { console.error(e) }

  window.addEventListener('beforeunload', performCleanup)

  if (import.meta.hot) {
    import.meta.hot.on('vite:beforeUpdate', () => {
      vpnStore.cleanup()
    })
    import.meta.hot.on('vite:afterUpdate', async () => {
      await vpnStore.initEventListeners()
      vpnStore.startHeartbeat()
      // HMR 后强制同步
      vpnStore.syncVpnStatus()
    })
  }
})

onUnmounted(() => {
  performCleanup()
  if (unlistenClose) unlistenClose()
  if (unlistenFocus) unlistenFocus()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('beforeunload', performCleanup)
})
</script>

<template>
  <AppLayout />
</template>