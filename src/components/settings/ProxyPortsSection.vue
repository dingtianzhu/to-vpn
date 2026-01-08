<script setup lang="ts">
/**
 * 代理端口配置组件
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 1.3, 1.4, 1.6**
 */
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore } from '@/stores/settings'
import { useVpnStore } from '@/stores/vpn'
import { useI18nStore } from '@/stores/i18n'
import SettingRow from './SettingRow.vue'

const settingsStore = useSettingsStore()
const vpnStore = useVpnStore()
const i18nStore = useI18nStore()

const { settings } = storeToRefs(settingsStore)
const { locale } = storeToRefs(i18nStore)
const { isConnected } = storeToRefs(vpnStore)

// Local state for port inputs
const socksPort = ref(settings.value.socksPort)
const httpPort = ref(settings.value.httpPort)
const socksPortError = ref<string | null>(null)
const httpPortError = ref<string | null>(null)
const isValidating = ref(false)
const showReconnectPrompt = ref(false)
const pendingChanges = ref<{ socksPort?: number; httpPort?: number } | null>(null)

// Port validation constants
const PORT_MIN = 1024
const PORT_MAX = 65535

// Translations
const texts = computed(() => locale.value === 'zh' ? {
  title: '代理端口',
  socksPort: 'SOCKS5 端口',
  socksPortDesc: '本地 SOCKS5 代理监听端口，用于支持 SOCKS5 协议的应用',
  httpPort: 'HTTP 端口',
  httpPortDesc: '本地 HTTP 代理监听端口，用于浏览器和 HTTP 应用',
  portRangeError: `端口必须在 ${PORT_MIN}-${PORT_MAX} 范围内`,
  portInUseError: '端口已被占用',
  samePortError: 'SOCKS 和 HTTP 端口不能相同',
  reconnectTitle: '需要重新连接',
  reconnectMessage: '更改端口设置需要重新连接 VPN 才能生效。',
  reconnectConfirm: '重新连接',
  reconnectCancel: '稍后',
  reset: '重置',
  validating: '验证中...',
  defaultSocks: '默认: 1080',
  defaultHttp: '默认: 1087',
} : {
  title: 'Proxy Ports',
  socksPort: 'SOCKS5 Port',
  socksPortDesc: 'Local SOCKS5 proxy port for apps supporting SOCKS5 protocol',
  httpPort: 'HTTP Port',
  httpPortDesc: 'Local HTTP proxy port for browsers and HTTP applications',
  portRangeError: `Port must be between ${PORT_MIN} and ${PORT_MAX}`,
  portInUseError: 'Port is already in use',
  samePortError: 'SOCKS and HTTP ports must be different',
  reconnectTitle: 'Reconnection Required',
  reconnectMessage: 'Changing port settings requires reconnecting the VPN.',
  reconnectConfirm: 'Reconnect',
  reconnectCancel: 'Later',
  reset: 'Reset',
  validating: 'Validating...',
  defaultSocks: 'Default: 1080',
  defaultHttp: 'Default: 1087',
})

// Validate port range locally
function validatePortRange(port: number): boolean {
  return port >= PORT_MIN && port <= PORT_MAX
}

// Validate port availability via Rust backend
async function checkPortAvailable(port: number): Promise<boolean> {
  try {
    return await invoke<boolean>('check_port_available', { port })
  } catch (e) {
    console.error('Port check failed:', e)
    return false
  }
}

// Validate and save SOCKS port
async function validateAndSaveSocksPort() {
  const port = socksPort.value
  socksPortError.value = null
  
  // Range validation
  if (!validatePortRange(port)) {
    socksPortError.value = texts.value.portRangeError
    return
  }
  
  // Same port check
  if (port === httpPort.value) {
    socksPortError.value = texts.value.samePortError
    return
  }
  
  // Skip availability check if port hasn't changed
  if (port === settings.value.socksPort) {
    return
  }
  
  isValidating.value = true
  
  // Availability check (only when not connected)
  if (!isConnected.value) {
    const available = await checkPortAvailable(port)
    if (!available) {
      socksPortError.value = texts.value.portInUseError
      isValidating.value = false
      return
    }
  }
  
  isValidating.value = false
  
  // If connected, show reconnect prompt
  if (isConnected.value) {
    pendingChanges.value = { socksPort: port }
    showReconnectPrompt.value = true
  } else {
    settingsStore.updateSettings({ socksPort: port })
  }
}

// Validate and save HTTP port
async function validateAndSaveHttpPort() {
  const port = httpPort.value
  httpPortError.value = null
  
  // Range validation
  if (!validatePortRange(port)) {
    httpPortError.value = texts.value.portRangeError
    return
  }
  
  // Same port check
  if (port === socksPort.value) {
    httpPortError.value = texts.value.samePortError
    return
  }
  
  // Skip availability check if port hasn't changed
  if (port === settings.value.httpPort) {
    return
  }
  
  isValidating.value = true
  
  // Availability check (only when not connected)
  if (!isConnected.value) {
    const available = await checkPortAvailable(port)
    if (!available) {
      httpPortError.value = texts.value.portInUseError
      isValidating.value = false
      return
    }
  }
  
  isValidating.value = false
  
  // If connected, show reconnect prompt
  if (isConnected.value) {
    pendingChanges.value = { httpPort: port }
    showReconnectPrompt.value = true
  } else {
    settingsStore.updateSettings({ httpPort: port })
  }
}

// Handle reconnect confirmation
async function handleReconnect() {
  if (pendingChanges.value) {
    settingsStore.updateSettings(pendingChanges.value)
    pendingChanges.value = null
  }
  showReconnectPrompt.value = false
  
  // Disconnect and reconnect
  await vpnStore.disconnect()
  setTimeout(() => {
    vpnStore.connect()
  }, 500)
}

// Handle reconnect cancel
function handleReconnectCancel() {
  // Revert local values
  socksPort.value = settings.value.socksPort
  httpPort.value = settings.value.httpPort
  pendingChanges.value = null
  showReconnectPrompt.value = false
}

// Reset to defaults
function resetToDefaults() {
  settingsStore.resetProxyPortSettings()
  socksPort.value = settings.value.socksPort
  httpPort.value = settings.value.httpPort
  socksPortError.value = null
  httpPortError.value = null
}

// Sync local state when settings change externally
watch(() => settings.value.socksPort, (newVal: number) => {
  socksPort.value = newVal
})

watch(() => settings.value.httpPort, (newVal: number) => {
  httpPort.value = newVal
})
</script>

<template>
  <section>
    <div class="flex items-center justify-between mb-2 pl-2">
      <h2 class="text-[11px] font-semibold text-[var(--vpn-muted)] uppercase tracking-wider">
        {{ texts.title }}
      </h2>
      <button
        @click="resetToDefaults"
        class="text-[10px] text-[var(--vpn-text-secondary)] hover:text-[var(--vpn-text)] transition-colors"
      >
        {{ texts.reset }}
      </button>
    </div>
    
    <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-xl overflow-hidden shadow-sm">
      <!-- SOCKS Port -->
      <!-- **Feature: vpn-pure-mode** -->
      <!-- **Validates: Requirements 10.2, 10.3** -->
      <SettingRow
        icon="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        icon-color="text-blue-500"
        icon-bg="bg-blue-500/10"
        :title="texts.socksPort"
        :subtitle="texts.socksPortDesc"
        :default-value="texts.defaultSocks"
        :requires-reconnect="true"
      >
        <div class="flex flex-col items-end">
          <input
            v-model.number="socksPort"
            type="number"
            :min="PORT_MIN"
            :max="PORT_MAX"
            @blur="validateAndSaveSocksPort"
            @keyup.enter="validateAndSaveSocksPort"
            class="w-24 px-3 py-1.5 text-[13px] text-right bg-[var(--vpn-input-bg)] border border-[var(--vpn-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
            :class="{ 'border-red-500': socksPortError }"
          />
          <span v-if="socksPortError" class="text-[10px] text-red-500 mt-1">
            {{ socksPortError }}
          </span>
        </div>
      </SettingRow>
      
      <div class="border-t border-[var(--vpn-border)]" />
      
      <!-- HTTP Port -->
      <!-- **Feature: vpn-pure-mode** -->
      <!-- **Validates: Requirements 10.2, 10.3** -->
      <SettingRow
        icon="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
        icon-color="text-green-500"
        icon-bg="bg-green-500/10"
        :title="texts.httpPort"
        :subtitle="texts.httpPortDesc"
        :default-value="texts.defaultHttp"
        :requires-reconnect="true"
      >
        <div class="flex flex-col items-end">
          <input
            v-model.number="httpPort"
            type="number"
            :min="PORT_MIN"
            :max="PORT_MAX"
            @blur="validateAndSaveHttpPort"
            @keyup.enter="validateAndSaveHttpPort"
            class="w-24 px-3 py-1.5 text-[13px] text-right bg-[var(--vpn-input-bg)] border border-[var(--vpn-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
            :class="{ 'border-red-500': httpPortError }"
          />
          <span v-if="httpPortError" class="text-[10px] text-red-500 mt-1">
            {{ httpPortError }}
          </span>
        </div>
      </SettingRow>
      
      <!-- Validating indicator -->
      <div v-if="isValidating" class="px-4 py-2 text-[11px] text-[var(--vpn-muted)] text-center border-t border-[var(--vpn-border)]">
        {{ texts.validating }}
      </div>
    </div>
    
    <!-- Reconnect Prompt Modal -->
    <Teleport to="body">
      <div
        v-if="showReconnectPrompt"
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        @click.self="handleReconnectCancel"
      >
        <div class="bg-[var(--vpn-card)] rounded-xl p-6 max-w-sm mx-4 shadow-xl border border-[var(--vpn-border)]">
          <h3 class="text-[15px] font-semibold text-[var(--vpn-text)] mb-2">
            {{ texts.reconnectTitle }}
          </h3>
          <p class="text-[13px] text-[var(--vpn-text-secondary)] mb-4">
            {{ texts.reconnectMessage }}
          </p>
          <div class="flex gap-3 justify-end">
            <button
              @click="handleReconnectCancel"
              class="px-4 py-2 text-[13px] text-[var(--vpn-text-secondary)] hover:text-[var(--vpn-text)] transition-colors"
            >
              {{ texts.reconnectCancel }}
            </button>
            <button
              @click="handleReconnect"
              class="px-4 py-2 text-[13px] bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              {{ texts.reconnectConfirm }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>
