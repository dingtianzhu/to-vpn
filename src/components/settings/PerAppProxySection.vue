<script setup lang="ts">
/**
 * 分应用代理设置组件
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 7.1, 7.2, 7.4, 7.5, 7.6**
 */
import { computed, ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useVpnStore } from '@/stores/vpn'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'
import { 
  APP_PRESET_GROUPS, 
  getPresetGroupName, 
  getPresetGroupDesc,
  type AppPresetGroup 
} from '@/constants/apps'

const settingsStore = useSettingsStore()
const vpnStore = useVpnStore()
const i18nStore = useI18nStore()

const { settings } = storeToRefs(settingsStore)
const { locale } = storeToRefs(i18nStore)

// 新应用输入状态
// **Feature: vpn-pure-mode**
// **Validates: Requirements 7.4**
const newExcludedApp = ref('')
const newForcedProxyApp = ref('')
const excludedAppError = ref<string | null>(null)
const forcedProxyAppError = ref<string | null>(null)

// 预设组展开状态
const expandedPresetGroup = ref<string | null>(null)

// 翻译文本
const texts = computed(() => ({
  sectionTitle: locale.value === 'zh' ? '分应用代理' : 'Per-App Proxy',
  excludedApps: locale.value === 'zh' ? '排除的应用' : 'Excluded Apps',
  excludedAppsDesc: locale.value === 'zh' 
    ? '这些应用将绕过 VPN 直连' 
    : 'These apps will bypass VPN',
  forcedProxyApps: locale.value === 'zh' ? '强制代理应用' : 'Forced Proxy Apps',
  forcedProxyAppsDesc: locale.value === 'zh' 
    ? '这些应用将强制使用 VPN' 
    : 'These apps will always use VPN',
  appPlaceholder: locale.value === 'zh' ? '输入应用名称，如 WeChat' : 'Enter app name, e.g. WeChat',
  addApp: locale.value === 'zh' ? '添加' : 'Add',
  removeApp: locale.value === 'zh' ? '移除' : 'Remove',
  presets: locale.value === 'zh' ? '预设组' : 'Presets',
  presetsDesc: locale.value === 'zh' 
    ? '快速添加常用应用组' 
    : 'Quickly add common app groups',
  addAll: locale.value === 'zh' ? '全部添加' : 'Add All',
  emptyApp: locale.value === 'zh' ? '应用名称不能为空' : 'App name cannot be empty',
  duplicateApp: locale.value === 'zh' ? '应用已存在' : 'App already exists',
  tunModeRequired: locale.value === 'zh' 
    ? '分应用代理仅在 TUN 模式下生效' 
    : 'Per-app proxy only works in TUN mode',
  requiresReconnect: locale.value === 'zh' 
    ? '修改后需要重新连接' 
    : 'Requires reconnection after changes',
}))

// 验证应用名称
// **Feature: vpn-pure-mode**
// **Validates: Requirements 7.5**
function validateAppName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim()
  if (!trimmed) {
    return { valid: false, error: texts.value.emptyApp }
  }
  return { valid: true }
}

// 添加排除的应用
// **Feature: vpn-pure-mode**
// **Validates: Requirements 7.1, 7.4**
function addExcludedApp() {
  excludedAppError.value = null
  const appName = newExcludedApp.value.trim()
  
  const validation = validateAppName(appName)
  if (!validation.valid) {
    excludedAppError.value = validation.error || texts.value.emptyApp
    return
  }
  
  if (settings.value.excludedApps.includes(appName)) {
    excludedAppError.value = texts.value.duplicateApp
    return
  }
  
  const newApps = [...settings.value.excludedApps, appName]
  settingsStore.updateSettings({ excludedApps: newApps })
  newExcludedApp.value = ''
  
  promptReconnectIfNeeded()
}

// 移除排除的应用
// **Feature: vpn-pure-mode**
// **Validates: Requirements 7.1, 7.4**
function removeExcludedApp(appName: string) {
  const newApps = settings.value.excludedApps.filter((a: string) => a !== appName)
  settingsStore.updateSettings({ excludedApps: newApps })
  promptReconnectIfNeeded()
}

// 添加强制代理应用
// **Feature: vpn-pure-mode**
// **Validates: Requirements 7.2, 7.4**
function addForcedProxyApp() {
  forcedProxyAppError.value = null
  const appName = newForcedProxyApp.value.trim()
  
  const validation = validateAppName(appName)
  if (!validation.valid) {
    forcedProxyAppError.value = validation.error || texts.value.emptyApp
    return
  }
  
  if (settings.value.forcedProxyApps.includes(appName)) {
    forcedProxyAppError.value = texts.value.duplicateApp
    return
  }
  
  const newApps = [...settings.value.forcedProxyApps, appName]
  settingsStore.updateSettings({ forcedProxyApps: newApps })
  newForcedProxyApp.value = ''
  
  promptReconnectIfNeeded()
}

// 移除强制代理应用
// **Feature: vpn-pure-mode**
// **Validates: Requirements 7.2, 7.4**
function removeForcedProxyApp(appName: string) {
  const newApps = settings.value.forcedProxyApps.filter((a: string) => a !== appName)
  settingsStore.updateSettings({ forcedProxyApps: newApps })
  promptReconnectIfNeeded()
}

// 添加预设组到排除列表
// **Feature: vpn-pure-mode**
// **Validates: Requirements 7.7**
function addPresetToExcluded(preset: AppPresetGroup) {
  const currentApps = new Set(settings.value.excludedApps)
  const newApps = preset.apps.filter(app => !currentApps.has(app))
  
  if (newApps.length > 0) {
    settingsStore.updateSettings({ 
      excludedApps: [...settings.value.excludedApps, ...newApps] 
    })
    promptReconnectIfNeeded()
  }
}

// 添加预设组到强制代理列表
// **Feature: vpn-pure-mode**
// **Validates: Requirements 7.7**
function addPresetToForcedProxy(preset: AppPresetGroup) {
  const currentApps = new Set(settings.value.forcedProxyApps)
  const newApps = preset.apps.filter(app => !currentApps.has(app))
  
  if (newApps.length > 0) {
    settingsStore.updateSettings({ 
      forcedProxyApps: [...settings.value.forcedProxyApps, ...newApps] 
    })
    promptReconnectIfNeeded()
  }
}

// 切换预设组展开状态
function togglePresetGroup(groupId: string) {
  expandedPresetGroup.value = expandedPresetGroup.value === groupId ? null : groupId
}

// 如果已连接，提示需要重连
// **Feature: vpn-pure-mode**
// **Validates: Requirements 7.6**
async function promptReconnectIfNeeded() {
  if (vpnStore.isConnected || vpnStore.isConnecting) {
    await vpnStore.disconnect()
    setTimeout(() => vpnStore.connect(), 500)
  }
}

// 处理回车键添加应用
function handleExcludedKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    addExcludedApp()
  }
}

function handleForcedProxyKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    addForcedProxyApp()
  }
}

// 获取预设组名称
function getGroupName(group: AppPresetGroup): string {
  return getPresetGroupName(group, locale.value)
}

// 获取预设组描述
function getGroupDesc(group: AppPresetGroup): string {
  return getPresetGroupDesc(group, locale.value)
}

// 检查是否为 TUN 模式
const isTunMode = computed(() => settings.value.connectionMode === 'tun')
</script>

<template>
  <!-- 整个组件在 macOS 上由父组件控制隐藏 -->
  <section>
    <h2 class="text-[11px] font-semibold text-[var(--vpn-muted)] uppercase tracking-wider mb-2 pl-2">
      {{ texts.sectionTitle }}
    </h2>
    
    <!-- TUN 模式提示 -->
    <div v-if="!isTunMode" class="mb-3 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
      <p class="text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-2">
        <span>⚠️</span>
        <span>{{ texts.tunModeRequired }}</span>
      </p>
    </div>
    
    <!-- 排除的应用 -->
    <!-- **Feature: vpn-pure-mode** -->
    <!-- **Validates: Requirements 7.1, 7.4** -->
    <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-xl p-3 mb-3">
      <div class="flex items-center justify-between mb-2">
        <span class="text-[12px] font-medium text-[var(--vpn-text)]">
          {{ texts.excludedApps }}
        </span>
        <span class="text-[10px] text-[var(--vpn-muted)]">
          {{ settings.excludedApps.length }}
        </span>
      </div>
      <p class="text-[10px] text-[var(--vpn-muted)] mb-2">
        {{ texts.excludedAppsDesc }}
      </p>
      
      <!-- 应用列表 -->
      <div v-if="settings.excludedApps.length > 0" class="flex flex-wrap gap-1 mb-2 max-h-24 overflow-y-auto">
        <span 
          v-for="app in settings.excludedApps" 
          :key="app"
          class="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full text-[10px]"
        >
          {{ app }}
          <button 
            @click="removeExcludedApp(app)"
            class="hover:text-red-500 transition-colors"
            :title="texts.removeApp"
          >
            ×
          </button>
        </span>
      </div>
      
      <!-- 添加应用输入 -->
      <div class="flex gap-2">
        <input
          v-model="newExcludedApp"
          @keydown="handleExcludedKeydown"
          type="text"
          :placeholder="texts.appPlaceholder"
          :disabled="!isTunMode"
          class="flex-1 px-2 py-1 text-[11px] bg-[var(--vpn-bg)] border border-[var(--vpn-border)] rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          @click="addExcludedApp"
          :disabled="!isTunMode"
          class="px-3 py-1 text-[11px] bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-400 text-white rounded-lg transition-colors"
        >
          {{ texts.addApp }}
        </button>
      </div>
      <div v-if="excludedAppError" class="mt-1 text-[10px] text-red-500">
        {{ excludedAppError }}
      </div>
    </div>
    
    <!-- 强制代理应用 -->
    <!-- **Feature: vpn-pure-mode** -->
    <!-- **Validates: Requirements 7.2, 7.4** -->
    <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-xl p-3 mb-3">
      <div class="flex items-center justify-between mb-2">
        <span class="text-[12px] font-medium text-[var(--vpn-text)]">
          {{ texts.forcedProxyApps }}
        </span>
        <span class="text-[10px] text-[var(--vpn-muted)]">
          {{ settings.forcedProxyApps.length }}
        </span>
      </div>
      <p class="text-[10px] text-[var(--vpn-muted)] mb-2">
        {{ texts.forcedProxyAppsDesc }}
      </p>
      
      <!-- 应用列表 -->
      <div v-if="settings.forcedProxyApps.length > 0" class="flex flex-wrap gap-1 mb-2 max-h-24 overflow-y-auto">
        <span 
          v-for="app in settings.forcedProxyApps" 
          :key="app"
          class="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-[10px]"
        >
          {{ app }}
          <button 
            @click="removeForcedProxyApp(app)"
            class="hover:text-red-500 transition-colors"
            :title="texts.removeApp"
          >
            ×
          </button>
        </span>
      </div>
      
      <!-- 添加应用输入 -->
      <div class="flex gap-2">
        <input
          v-model="newForcedProxyApp"
          @keydown="handleForcedProxyKeydown"
          type="text"
          :placeholder="texts.appPlaceholder"
          :disabled="!isTunMode"
          class="flex-1 px-2 py-1 text-[11px] bg-[var(--vpn-bg)] border border-[var(--vpn-border)] rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          @click="addForcedProxyApp"
          :disabled="!isTunMode"
          class="px-3 py-1 text-[11px] bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg transition-colors"
        >
          {{ texts.addApp }}
        </button>
      </div>
      <div v-if="forcedProxyAppError" class="mt-1 text-[10px] text-red-500">
        {{ forcedProxyAppError }}
      </div>
    </div>
    
    <!-- 预设组 -->
    <!-- **Feature: vpn-pure-mode** -->
    <!-- **Validates: Requirements 7.7** -->
    <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-xl overflow-hidden">
      <div class="p-3 border-b border-[var(--vpn-border)]">
        <span class="text-[12px] font-medium text-[var(--vpn-text)]">
          {{ texts.presets }}
        </span>
        <p class="text-[10px] text-[var(--vpn-muted)] mt-0.5">
          {{ texts.presetsDesc }}
        </p>
      </div>
      
      <div class="divide-y divide-[var(--vpn-border)]">
        <div 
          v-for="group in APP_PRESET_GROUPS" 
          :key="group.id"
          class="transition-colors"
        >
          <!-- 预设组标题 -->
          <button
            @click="togglePresetGroup(group.id)"
            :disabled="!isTunMode"
            class="w-full flex items-center justify-between p-3 hover:bg-[var(--vpn-card-hover)] disabled:opacity-50 transition-colors"
          >
            <div class="flex items-center gap-2">
              <span class="text-lg">{{ group.icon }}</span>
              <div class="text-left">
                <span class="text-[12px] font-medium text-[var(--vpn-text)]">
                  {{ getGroupName(group) }}
                </span>
                <p class="text-[10px] text-[var(--vpn-muted)]">
                  {{ getGroupDesc(group) }}
                </p>
              </div>
            </div>
            <svg 
              class="w-4 h-4 text-[var(--vpn-muted)] transition-transform"
              :class="{ 'rotate-180': expandedPresetGroup === group.id }"
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          
          <!-- 预设组详情 -->
          <div 
            v-if="expandedPresetGroup === group.id"
            class="px-3 pb-3 bg-[var(--vpn-bg)]"
          >
            <!-- 应用列表预览 -->
            <div class="flex flex-wrap gap-1 mb-2 max-h-20 overflow-y-auto">
              <span 
                v-for="app in group.apps.slice(0, 20)" 
                :key="app"
                class="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded text-[9px]"
              >
                {{ app }}
              </span>
              <span 
                v-if="group.apps.length > 20"
                class="px-2 py-0.5 text-gray-500 text-[9px]"
              >
                +{{ group.apps.length - 20 }} more
              </span>
            </div>
            
            <!-- 添加按钮 -->
            <div class="flex gap-2">
              <button
                @click="addPresetToExcluded(group)"
                class="flex-1 px-2 py-1.5 text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 rounded-lg transition-colors"
              >
                {{ texts.addAll }} → {{ texts.excludedApps }}
              </button>
              <button
                @click="addPresetToForcedProxy(group)"
                class="flex-1 px-2 py-1.5 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 rounded-lg transition-colors"
              >
                {{ texts.addAll }} → {{ texts.forcedProxyApps }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 提示信息 -->
    <p class="mt-2 text-[10px] text-[var(--vpn-muted)] px-2">
      {{ texts.requiresReconnect }}
    </p>
  </section>
</template>
