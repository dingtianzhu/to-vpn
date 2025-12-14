<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { useVpnStore } from '@/stores/vpn'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'
import { formatBytes } from '@/utils/format'

const vpnStore = useVpnStore()
const i18nStore = useI18nStore()
const { status, stats, isConnected } = storeToRefs(vpnStore)
const { t } = storeToRefs(i18nStore)

const isLoading = ref(false)
let unlistenPopupShown: UnlistenFn | null = null

// 计算属性
const downloadSpeed = computed(() => 
  isConnected.value ? formatBytes(stats.value.downloadSpeed) + '/s' : '0 B/s'
)

const uploadSpeed = computed(() => 
  isConnected.value ? formatBytes(stats.value.uploadSpeed) + '/s' : '0 B/s'
)

const buttonText = computed(() => {
  if (status.value === 'connected') return t.value.tray.disconnect
  if (status.value === 'connecting') return t.value.tray.connecting
  if (status.value === 'disconnecting') return t.value.tray.disconnecting
  return t.value.tray.connect
})

// 连接按钮的 CSS 类
const connectButtonClass = computed(() => {
  if (status.value === 'connected') return 'connected'
  if (status.value === 'connecting' || status.value === 'disconnecting') return 'connecting'
  return ''
})

// 方法
async function handleConnect() {
  if (isLoading.value) return
  
  if (status.value === 'connected') {
    isLoading.value = true
    try {
      await vpnStore.disconnect()
    } finally {
      isLoading.value = false
    }
  } else if (status.value === 'disconnected') {
    isLoading.value = true
    try {
      await vpnStore.connect()
    } finally {
      isLoading.value = false
    }
  }
}

async function handleExit() {
  // 先断开 VPN
  if (isConnected.value) {
    await vpnStore.disconnect()
  }
  // 退出应用
  const { exit } = await import('@tauri-apps/plugin-process')
  await exit(0)
}

async function showMainWindow() {
  await invoke('show_main_window')
}

onMounted(async () => {
  // 设置透明背景（托盘窗口专用）
  document.documentElement.style.background = 'transparent'
  document.body.style.background = 'transparent'
  
  // 从 localStorage 同步语言设置（托盘窗口是独立窗口）
  const savedLocale = localStorage.getItem('tovpn_locale') as 'en' | 'zh' | null
  if (savedLocale && savedLocale !== i18nStore.locale) {
    i18nStore.setLocale(savedLocale)
  }
  
  // 初始化事件监听
  await vpnStore.initEventListeners()
  await vpnStore.syncVpnStatus()
  
  // 监听弹窗显示事件，刷新状态和语言
  unlistenPopupShown = await listen('tray-popup-shown', async () => {
    // 同步语言设置
    const locale = localStorage.getItem('tovpn_locale') as 'en' | 'zh' | null
    if (locale && locale !== i18nStore.locale) {
      i18nStore.setLocale(locale)
    }
    await vpnStore.syncVpnStatus()
  })
})

onUnmounted(() => {
  if (unlistenPopupShown) {
    unlistenPopupShown()
  }
  // 恢复背景（如果需要）
  document.documentElement.style.background = ''
  document.body.style.background = ''
})
</script>

<template>
  <!-- 外层透明包装器 -->
  <div class="tray-wrapper">
    <div class="tray-container">
      <!-- 田字格布局：2x2 网格，右下格再分上下两部分 -->
      <div class="tray-grid">
      <!-- 左上：上传速度 -->
      <div class="tray-cell tray-upload" @click="showMainWindow">
        <svg class="tray-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <span class="tray-label">{{ t.tray.upload }}</span>
        <span class="tray-value">{{ uploadSpeed }}</span>
      </div>
      
      <!-- 右上：下载速度 -->
      <div class="tray-cell tray-download" @click="showMainWindow">
        <svg class="tray-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span class="tray-label">{{ t.tray.download }}</span>
        <span class="tray-value">{{ downloadSpeed }}</span>
      </div>
      
      <!-- 左下：连接/断开按钮 -->
      <button
        class="tray-cell tray-connect"
        :class="connectButtonClass"
        :disabled="status === 'connecting' || status === 'disconnecting'"
        @click="handleConnect"
      >
        <!-- 连接图标 -->
        <svg v-if="status === 'disconnected'" class="tray-icon-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <!-- 断开图标 -->
        <svg v-else-if="status === 'connected'" class="tray-icon-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
        <!-- 加载图标 -->
        <svg v-else class="tray-icon-lg tray-spin" fill="none" viewBox="0 0 24 24">
          <circle style="opacity: 0.25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path style="opacity: 0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span class="tray-btn-text">{{ buttonText }}</span>
      </button>
      
      <!-- 右下：分成上下两部分（主页 + 退出） -->
      <div class="tray-cell-split">
        <!-- 上半部分：主页按钮 -->
        <button class="tray-split-btn tray-home" @click="showMainWindow">
          <svg class="tray-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span>{{ t.tray.home }}</span>
        </button>
        <!-- 下半部分：退出按钮 -->
        <button class="tray-split-btn tray-exit" @click="handleExit">
          <svg class="tray-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span>{{ t.tray.exit }}</span>
        </button>
      </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 外层透明包装器 - 让窗口背景完全透明，同时设置圆角 */
.tray-wrapper {
  width: 200px;
  height: 200px;
  background: transparent;
  padding: 0;
  margin: 0;
  border-radius: 12px;
  overflow: hidden;
}

/* macOS 毛玻璃效果容器 */
.tray-container {
  width: 100%;
  height: 100%;
  background: rgba(250, 250, 250, 0.85);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border-radius: 12px;
  box-shadow: 
    0 0 0 1px rgba(0, 0, 0, 0.08),
    0 8px 32px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  user-select: none;
  padding: 8px;
  box-sizing: border-box;
}

/* 田字格网格布局 */
.tray-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 6px;
  width: 100%;
  height: 100%;
}

/* 单元格基础样式 */
.tray-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
  outline: none;
}

/* 上传区域 */
.tray-upload {
  background: rgba(251, 146, 60, 0.1);
}
.tray-upload:hover {
  background: rgba(251, 146, 60, 0.25);
  transform: scale(1.02);
}
.tray-upload:active {
  transform: scale(0.98);
}
.tray-upload .tray-icon {
  color: #f97316;
}
.tray-upload .tray-label {
  color: #ea580c;
}
.tray-upload .tray-value {
  color: #c2410c;
}

/* 下载区域 */
.tray-download {
  background: rgba(56, 189, 248, 0.1);
}
.tray-download:hover {
  background: rgba(56, 189, 248, 0.25);
  transform: scale(1.02);
}
.tray-download:active {
  transform: scale(0.98);
}
.tray-download .tray-icon {
  color: #0ea5e9;
}
.tray-download .tray-label {
  color: #0284c7;
}
.tray-download .tray-value {
  color: #0369a1;
}

/* 连接按钮 - 断开状态 */
.tray-connect {
  background: rgba(71, 85, 105, 0.85);
  color: white;
}
.tray-connect:hover {
  background: rgba(51, 65, 85, 1);
  transform: scale(1.02);
}
.tray-connect:active {
  transform: scale(0.98);
}

/* 连接按钮 - 已连接状态 */
.tray-connect.connected {
  background: rgba(16, 185, 129, 0.85);
}
.tray-connect.connected:hover {
  background: rgba(5, 150, 105, 1);
}

/* 连接按钮 - 连接中状态 */
.tray-connect.connecting {
  background: rgba(245, 158, 11, 0.85);
  cursor: wait;
}
.tray-connect.connecting:hover {
  transform: none;
}

/* 右下分割单元格 */
.tray-cell-split {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-radius: 8px;
  overflow: hidden;
}

/* 分割按钮通用样式 */
.tray-split-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: none;
  outline: none;
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 11px;
  font-weight: 500;
  border-radius: 6px;
}

/* 主页按钮 */
.tray-home {
  background: rgba(99, 102, 241, 0.1);
  color: #4f46e5;
}
.tray-home:hover {
  background: rgba(99, 102, 241, 0.28);
  transform: scale(1.03);
}
.tray-home:active {
  transform: scale(0.97);
}

/* 退出按钮 */
.tray-exit {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}
.tray-exit:hover {
  background: rgba(239, 68, 68, 0.28);
  transform: scale(1.03);
}
.tray-exit:active {
  transform: scale(0.97);
}

/* 图标样式 */
.tray-icon {
  width: 18px;
  height: 18px;
  margin-bottom: 2px;
}

.tray-icon-lg {
  width: 22px;
  height: 22px;
  margin-bottom: 2px;
}

.tray-icon-sm {
  width: 14px;
  height: 14px;
}

/* 标签文字 */
.tray-label {
  font-size: 10px;
  font-weight: 500;
}

/* 数值文字 */
.tray-value {
  font-size: 11px;
  font-weight: 700;
  font-family: ui-monospace, monospace;
}

/* 按钮文字 */
.tray-btn-text {
  font-size: 11px;
  font-weight: 500;
}

/* 旋转动画 */
.tray-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 暗色模式 - macOS 毛玻璃 */
@media (prefers-color-scheme: dark) {
  .tray-container {
    background: rgba(40, 40, 40, 0.85);
    box-shadow: 
      0 0 0 1px rgba(255, 255, 255, 0.08),
      0 8px 32px rgba(0, 0, 0, 0.4);
  }
  
  .tray-upload {
    background: rgba(251, 146, 60, 0.12);
  }
  .tray-upload:hover {
    background: rgba(251, 146, 60, 0.3);
  }
  .tray-upload .tray-label { color: #fb923c; }
  .tray-upload .tray-value { color: #fdba74; }
  
  .tray-download {
    background: rgba(56, 189, 248, 0.12);
  }
  .tray-download:hover {
    background: rgba(56, 189, 248, 0.3);
  }
  .tray-download .tray-label { color: #38bdf8; }
  .tray-download .tray-value { color: #7dd3fc; }
  
  .tray-home {
    background: rgba(99, 102, 241, 0.12);
    color: #818cf8;
  }
  .tray-home:hover {
    background: rgba(99, 102, 241, 0.32);
  }
  
  .tray-exit {
    background: rgba(248, 113, 113, 0.12);
    color: #f87171;
  }
  .tray-exit:hover {
    background: rgba(248, 113, 113, 0.32);
  }
  
  .tray-connect {
    background: rgba(71, 85, 105, 0.9);
  }
  .tray-connect:hover {
    background: rgba(100, 116, 139, 1);
  }
  .tray-connect.connected {
    background: rgba(16, 185, 129, 0.9);
  }
  .tray-connect.connected:hover {
    background: rgba(52, 211, 153, 1);
  }
}
</style>
