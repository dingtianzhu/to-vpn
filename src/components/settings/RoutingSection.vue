<script setup lang="ts">
/**
 * 路由模式设置组件
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 3.1, 3.5, 3.6, 5.1, 5.2, 5.6**
 */
import { computed, ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useVpnStore } from '@/stores/vpn'
import { useI18nStore } from '@/stores/i18n'
import { useNotification } from '@/composables/useNotification'
import { storeToRefs } from 'pinia'
import type { RouteMode } from '@/types'
import { isValidCustomDomain, normalizeDomain } from '@/utils/validation'

const settingsStore = useSettingsStore()
const vpnStore = useVpnStore()
const i18nStore = useI18nStore()
const notification = useNotification()

const { settings } = storeToRefs(settingsStore)
const { t, locale } = storeToRefs(i18nStore)

const isLocalSwitching = ref(false)
const switchError = ref<string | null>(null)

// 自定义域名输入状态
// **Feature: vpn-pure-mode**
// **Validates: Requirements 5.1, 5.2**
const newBypassDomain = ref('')
const newProxyDomain = ref('')
const bypassDomainError = ref<string | null>(null)
const proxyDomainError = ref<string | null>(null)

interface RouteModeOption {
  value: RouteMode
  label: string
  description: string
  icon: string
  color: string
}

// 路由模式选项
// **Feature: vpn-pure-mode**
// **Validates: Requirements 3.1**
const routeModes = computed<RouteModeOption[]>(() => [
  {
    value: 'rule',
    label: t.value.routing?.ruleMode ?? 'Rule Mode',
    description: t.value.routing?.ruleDesc ?? 'Bypass China, proxy others',
    icon: '🎯',
    color: 'text-blue-600 dark:text-blue-400'
  },
  {
    value: 'global',
    label: t.value.routing?.globalMode ?? 'Global Mode',
    description: t.value.routing?.globalDesc ?? 'All traffic through proxy',
    icon: '🌐',
    color: 'text-emerald-600 dark:text-emerald-400'
  },
  {
    value: 'direct',
    label: t.value.routing?.directMode ?? 'Direct Mode',
    description: t.value.routing?.directDesc ?? 'All traffic direct',
    icon: '⚡',
    color: 'text-amber-600 dark:text-amber-400'
  }
])

const isSwitching = computed(() => {
  return isLocalSwitching.value
})

// 选择路由模式
// **Feature: vpn-pure-mode**
// **Validates: Requirements 3.5**
async function selectRouteMode(mode: RouteMode) {
  if (settings.value.routeMode === mode || isSwitching.value) {
    return
  }

  switchError.value = null
  isLocalSwitching.value = true

  try {
    // 如果已连接，需要提示重连
    if (vpnStore.isConnected || vpnStore.isConnecting) {
      // 先更新设置
      settingsStore.setRouteMode(mode)
      // 断开并重连
      await vpnStore.disconnect()
      setTimeout(() => vpnStore.connect(), 500)
    } else {
      // 未连接时直接更新设置
      settingsStore.setRouteMode(mode)
    }
  } catch (e) {
    switchError.value = e instanceof Error ? e.message : String(e)
    setTimeout(() => { switchError.value = null }, 3000)
  } finally {
    isLocalSwitching.value = false
  }
}

// 获取当前模式的显示信息
// **Feature: vpn-pure-mode**
// **Validates: Requirements 3.6**
const currentModeInfo = computed(() => {
  return routeModes.value.find(m => m.value === settings.value.routeMode) || routeModes.value[0]
})

// 添加直连域名
// **Feature: vpn-pure-mode**
// **Validates: Requirements 5.1, 5.4, 5.5**
function addBypassDomain() {
  bypassDomainError.value = null
  const domain = normalizeDomain(newBypassDomain.value)
  
  if (!domain) {
    return
  }
  
  if (!isValidCustomDomain(domain)) {
    bypassDomainError.value = t.value.routing?.invalidDomain ?? 'Invalid domain format'
    return
  }
  
  if (settings.value.customBypassDomains.includes(domain)) {
    bypassDomainError.value = t.value.routing?.duplicateDomain ?? 'Domain already exists'
    return
  }
  
  const newDomains = [...settings.value.customBypassDomains, domain]
  settingsStore.updateSettings({ customBypassDomains: newDomains })
  newBypassDomain.value = ''
  
  // 如果已连接，提示需要重连
  promptReconnectIfNeeded()
}

// 移除直连域名
// **Feature: vpn-pure-mode**
// **Validates: Requirements 5.1**
function removeBypassDomain(domain: string) {
  const newDomains = settings.value.customBypassDomains.filter(d => d !== domain)
  settingsStore.updateSettings({ customBypassDomains: newDomains })
  promptReconnectIfNeeded()
}

// 添加代理域名
// **Feature: vpn-pure-mode**
// **Validates: Requirements 5.2, 5.4, 5.5**
function addProxyDomain() {
  proxyDomainError.value = null
  const domain = normalizeDomain(newProxyDomain.value)
  
  if (!domain) {
    return
  }
  
  if (!isValidCustomDomain(domain)) {
    proxyDomainError.value = t.value.routing?.invalidDomain ?? 'Invalid domain format'
    return
  }
  
  if (settings.value.customProxyDomains.includes(domain)) {
    proxyDomainError.value = t.value.routing?.duplicateDomain ?? 'Domain already exists'
    return
  }
  
  const newDomains = [...settings.value.customProxyDomains, domain]
  settingsStore.updateSettings({ customProxyDomains: newDomains })
  newProxyDomain.value = ''
  
  // 如果已连接，提示需要重连
  promptReconnectIfNeeded()
}

// 移除代理域名
// **Feature: vpn-pure-mode**
// **Validates: Requirements 5.2**
function removeProxyDomain(domain: string) {
  const newDomains = settings.value.customProxyDomains.filter(d => d !== domain)
  settingsStore.updateSettings({ customProxyDomains: newDomains })
  promptReconnectIfNeeded()
}

// 如果已连接，提示需要重连
// **Feature: vpn-pure-mode**
// **Validates: Requirements 5.6**
async function promptReconnectIfNeeded() {
  if (vpnStore.isConnected || vpnStore.isConnecting) {
    // 自动重连
    await vpnStore.disconnect()
    setTimeout(() => vpnStore.connect(), 500)
  }
}

// 处理回车键添加域名
function handleBypassKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    addBypassDomain()
  }
}

function handleProxyKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    addProxyDomain()
  }
}

// 切换绕过局域网设置
// **Feature: vpn-pure-mode**
// **Validates: Requirements 9.1**
async function toggleBypassLan() {
  const newValue = !settings.value.bypassLan
  settingsStore.updateSettings({ bypassLan: newValue })
  
  // 如果已连接，提示需要重连
  if (vpnStore.isConnected || vpnStore.isConnecting) {
    await vpnStore.disconnect()
    setTimeout(() => vpnStore.connect(), 500)
  }
}

/**
 * 重置路由设置为默认值
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 10.4**
 */
function resetRoutingSettings() {
  settingsStore.resetRoutingSettings()
  notification.success(locale.value === 'zh' ? '路由设置已重置' : 'Routing settings reset')
  promptReconnectIfNeeded()
}
</script>

<template>
  <section>
    <h2 class="text-[11px] font-semibold text-[var(--vpn-muted)] uppercase tracking-wider mb-2 pl-2">
      {{ t.routing?.title ?? 'Routing Mode' }}
    </h2>
    
    <!-- 当前模式显示 -->
    <div class="mb-2 px-2 flex items-center gap-2 text-[11px] text-[var(--vpn-muted)]">
      <span>{{ t.routing?.current ?? 'Current' }}:</span>
      <span :class="currentModeInfo.color" class="font-medium">
        {{ currentModeInfo.icon }} {{ currentModeInfo.label }}
      </span>
    </div>
    
    <!-- 路由模式选择 -->
    <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-xl overflow-hidden shadow-sm grid grid-cols-3 p-1 gap-1">
      <button 
        v-for="mode in routeModes" 
        :key="mode.value" 
        @click="selectRouteMode(mode.value)"
        :disabled="isSwitching"
        class="flex flex-col items-center justify-center py-3 rounded-lg transition-all duration-200 border relative"
        :class="[
          settings.routeMode === mode.value
            ? `bg-blue-50 dark:bg-white/10 shadow-md border-blue-200 dark:border-white/20 font-medium ${mode.color}`
            : 'border-transparent text-[var(--vpn-text-secondary)] hover:bg-black/5 dark:hover:bg-white/5',
          isSwitching ? 'opacity-60 cursor-not-allowed' : ''
        ]">
        <span class="text-lg mb-1">{{ mode.icon }}</span>
        <span class="text-[12px]">{{ mode.label }}</span>
        <span class="text-[9px] opacity-60 text-center px-1">{{ mode.description }}</span>
      </button>
    </div>
    
    <!-- 切换进度 -->
    <div v-if="isSwitching" class="mt-2 flex items-center justify-center gap-2 text-[11px] text-[var(--vpn-muted)]">
      <svg class="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span>{{ t.routing?.switching ?? 'Switching...' }}</span>
    </div>
    
    <!-- 错误提示 -->
    <div v-if="switchError" class="mt-2 text-[11px] text-red-500 dark:text-red-400 text-center px-2">
      {{ switchError }}
    </div>
    
    <!-- 提示信息 -->
    <p class="mt-2 text-[10px] text-[var(--vpn-muted)] px-2">
      {{ t.routing?.hint ?? 'Changing route mode while connected will reconnect automatically.' }}
    </p>
    
    <!-- 自定义域名部分 -->
    <!-- **Feature: vpn-pure-mode** -->
    <!-- **Validates: Requirements 5.1, 5.2, 5.6** -->
    <div class="mt-6">
      <h3 class="text-[11px] font-semibold text-[var(--vpn-muted)] uppercase tracking-wider mb-2 pl-2">
        {{ t.routing?.customDomains ?? 'Custom Domains' }}
      </h3>
      
      <!-- 直连域名 -->
      <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-xl p-3 mb-3">
        <div class="flex items-center justify-between mb-2">
          <span class="text-[12px] font-medium text-[var(--vpn-text)]">
            {{ t.routing?.bypassDomains ?? 'Bypass Domains' }}
          </span>
          <span class="text-[10px] text-[var(--vpn-muted)]">
            {{ settings.customBypassDomains.length }}
          </span>
        </div>
        <p class="text-[10px] text-[var(--vpn-muted)] mb-2">
          {{ t.routing?.bypassDomainsDesc ?? 'Domains that connect directly (bypass proxy)' }}
        </p>
        
        <!-- 域名列表 -->
        <div v-if="settings.customBypassDomains.length > 0" class="flex flex-wrap gap-1 mb-2">
          <span 
            v-for="domain in settings.customBypassDomains" 
            :key="domain"
            class="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full text-[10px]"
          >
            {{ domain }}
            <button 
              @click="removeBypassDomain(domain)"
              class="hover:text-red-500 transition-colors"
              :title="t.routing?.removeDomain ?? 'Remove'"
            >
              ×
            </button>
          </span>
        </div>
        
        <!-- 添加域名输入 -->
        <div class="flex gap-2">
          <input
            v-model="newBypassDomain"
            @keydown="handleBypassKeydown"
            type="text"
            :placeholder="t.routing?.domainPlaceholder ?? 'e.g. example.com or *.example.com'"
            class="flex-1 px-2 py-1 text-[11px] bg-[var(--vpn-bg)] border border-[var(--vpn-border)] rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            @click="addBypassDomain"
            class="px-3 py-1 text-[11px] bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
          >
            {{ t.routing?.addDomain ?? 'Add' }}
          </button>
        </div>
        <div v-if="bypassDomainError" class="mt-1 text-[10px] text-red-500">
          {{ bypassDomainError }}
        </div>
      </div>
      
      <!-- 代理域名 -->
      <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-xl p-3">
        <div class="flex items-center justify-between mb-2">
          <span class="text-[12px] font-medium text-[var(--vpn-text)]">
            {{ t.routing?.proxyDomains ?? 'Proxy Domains' }}
          </span>
          <span class="text-[10px] text-[var(--vpn-muted)]">
            {{ settings.customProxyDomains.length }}
          </span>
        </div>
        <p class="text-[10px] text-[var(--vpn-muted)] mb-2">
          {{ t.routing?.proxyDomainsDesc ?? 'Domains that force proxy connection' }}
        </p>
        
        <!-- 域名列表 -->
        <div v-if="settings.customProxyDomains.length > 0" class="flex flex-wrap gap-1 mb-2">
          <span 
            v-for="domain in settings.customProxyDomains" 
            :key="domain"
            class="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-[10px]"
          >
            {{ domain }}
            <button 
              @click="removeProxyDomain(domain)"
              class="hover:text-red-500 transition-colors"
              :title="t.routing?.removeDomain ?? 'Remove'"
            >
              ×
            </button>
          </span>
        </div>
        
        <!-- 添加域名输入 -->
        <div class="flex gap-2">
          <input
            v-model="newProxyDomain"
            @keydown="handleProxyKeydown"
            type="text"
            :placeholder="t.routing?.domainPlaceholder ?? 'e.g. example.com or *.example.com'"
            class="flex-1 px-2 py-1 text-[11px] bg-[var(--vpn-bg)] border border-[var(--vpn-border)] rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            @click="addProxyDomain"
            class="px-3 py-1 text-[11px] bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            {{ t.routing?.addDomain ?? 'Add' }}
          </button>
        </div>
        <div v-if="proxyDomainError" class="mt-1 text-[10px] text-red-500">
          {{ proxyDomainError }}
        </div>
      </div>
      
      <!-- 提示信息 -->
      <p class="mt-2 text-[10px] text-[var(--vpn-muted)] px-2">
        {{ t.routing?.domainsHint ?? 'Supports wildcards: *.example.com or .example.com' }}
      </p>
    </div>
    
    <!-- 绕过局域网设置 -->
    <!-- **Feature: vpn-pure-mode** -->
    <!-- **Validates: Requirements 9.1** -->
    <div class="mt-6">
      <h3 class="text-[11px] font-semibold text-[var(--vpn-muted)] uppercase tracking-wider mb-2 pl-2">
        {{ t.routing?.lanBypass ?? 'LAN Bypass' }}
      </h3>
      
      <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-xl p-3">
        <div class="flex items-center justify-between">
          <div class="flex-1">
            <span class="text-[12px] font-medium text-[var(--vpn-text)]">
              {{ t.routing?.bypassLan ?? 'Bypass Local Network' }}
            </span>
            <p class="text-[10px] text-[var(--vpn-muted)] mt-0.5">
              {{ t.routing?.bypassLanDesc ?? 'Allow direct access to local network resources (192.168.x.x, 10.x.x.x, etc.)' }}
            </p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer ml-3">
            <input 
              type="checkbox" 
              :checked="settings.bypassLan"
              @change="toggleBypassLan"
              class="sr-only peer"
            />
            <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
          </label>
        </div>
        
        <!-- LAN 范围说明 -->
        <div class="mt-3 pt-3 border-t border-[var(--vpn-border)]">
          <p class="text-[10px] text-[var(--vpn-muted)] mb-2">
            {{ t.routing?.lanRanges ?? 'Bypassed IP ranges:' }}
          </p>
          <div class="flex flex-wrap gap-1">
            <span class="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded text-[9px] font-mono">
              10.0.0.0/8
            </span>
            <span class="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded text-[9px] font-mono">
              172.16.0.0/12
            </span>
            <span class="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded text-[9px] font-mono">
              192.168.0.0/16
            </span>
            <span class="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded text-[9px] font-mono">
              169.254.0.0/16
            </span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 重置路由设置按钮 -->
    <!-- **Feature: vpn-pure-mode** -->
    <!-- **Validates: Requirements 10.4** -->
    <div class="mt-4 flex justify-end">
      <button
        @click="resetRoutingSettings"
        class="px-3 py-1.5 text-[11px] text-[var(--vpn-muted)] hover:text-[var(--vpn-text)] bg-[var(--vpn-input-bg)] hover:bg-[var(--vpn-border)] border border-[var(--vpn-border)] rounded-lg transition-colors"
      >
        {{ locale === 'zh' ? '重置路由设置' : 'Reset Routing Settings' }}
      </button>
    </div>
  </section>
</template>
