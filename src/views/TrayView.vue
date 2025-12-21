<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useVpnStore } from '@/stores/vpn'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'
import { formatBytes } from '@/utils/format'

const vpnStore = useVpnStore()
const i18nStore = useI18nStore()
const { status, stats, isConnected } = storeToRefs(vpnStore)
const { t } = storeToRefs(i18nStore)

const isLoading = ref(false)

const downloadSpeed = computed(() => isConnected.value ? formatBytes(stats.value.downloadSpeed) + '/s' : '0 B/s')
const uploadSpeed = computed(() => isConnected.value ? formatBytes(stats.value.uploadSpeed) + '/s' : '0 B/s')

async function handleConnect() {
  if (isLoading.value) return
  isLoading.value = true
  try {
    if (status.value === 'connected') {
      await vpnStore.disconnect()
    } else {
      await vpnStore.connect()
    }
  } catch (e) {
    await invoke('show_main_window')
  } finally {
    isLoading.value = false
  }
}

async function handleExit() {
  const { exit } = await import('@tauri-apps/plugin-process')
  await exit(0)
}

async function showMainWindow() {
  await invoke('show_main_window')
}

onMounted(() => {
  // 核心：强制所有父级透明
  document.documentElement.style.background = 'transparent'
  document.body.style.background = 'transparent'
})
</script>

<template>
  <!-- 保持你之前成功的 stage 结构：无 padding，100% 铺满 -->
  <div class="tray-stage">
    <div class="tray-card">

      <!-- 1. 流量统计区 -->
      <div class="stats-area" @click="showMainWindow">
        <div class="stat-item">
          <div class="stat-label">
            <svg class="arrow-up" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <path d="M5 15l7-7 7 7" />
            </svg>
            <span>上传</span>
          </div>
          <div class="stat-value color-up">{{ uploadSpeed }}</div>
        </div>

        <div class="stat-divider"></div>

        <div class="stat-item">
          <div class="stat-label">
            <svg class="arrow-down" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <path d="M19 9l-7 7-7-7" />
            </svg>
            <span>下载</span>
          </div>
          <div class="stat-value color-down">{{ downloadSpeed }}</div>
        </div>
      </div>

      <!-- 2. 中间圆形连接按钮 (增加图标切换和转圈动画) -->
      <div class="connect-area">
        <button class="circle-btn" :class="status" :disabled="isLoading" @click="handleConnect">
          <div class="circle-content">
            <!-- 根据状态显示不同图标 -->
            <svg v-if="status === 'connected'" class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="3">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <svg v-else-if="status === 'connecting'" class="btn-icon rotating" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="3">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10" />
            </svg>
            <svg v-else class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>

            <span class="btn-text">
              {{ status === 'connected' ? '断开' : (status === 'connecting' ? '连接中' : '连接') }}
            </span>
          </div>
        </button>
      </div>

      <!-- 3. 底部导航区 (增加主页和退出图标) -->
      <div class="nav-area">
        <button class="flat-btn" @click="showMainWindow">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path
              d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span>主页</span>
        </button>
        <button class="flat-btn" @click="handleExit">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span>退出</span>
        </button>
      </div>

    </div>
  </div>
</template>

<style>
/* 暴力清理，确保动画重绘时不产生底色 */
html,
body,
#app {
  background: transparent !important;
  background-color: transparent !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden;
}
</style>

<style scoped>
.tray-stage {
  /* 严格遵循成功版本的 100vw/vh 和 0 padding */
  width: 100vw;
  height: 100vh;
  display: flex;
  background: transparent !important;
  padding: 0;
}

.tray-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  /* 背景调浅：从 0.95 降到 0.8，增加磨砂感 */
  background: rgba(50, 50, 52, 0.8);
  backdrop-filter: blur(25px);
  -webkit-backdrop-filter: blur(25px);

  /* 圆角 */
  border-radius: 24px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* 流量统计区 */
.stats-area {
  margin: 12px;
  padding: 12px 0;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  display: flex;
  align-items: center;
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #a1a1a6;
  margin-bottom: 2px;
}

.stat-value {
  font-size: 16px;
  font-weight: 800;
  font-family: 'SF Pro Display', ui-monospace, monospace;
}

.stat-divider {
  width: 1px;
  height: 24px;
  background: rgba(255, 255, 255, 0.1);
}

.color-up {
  color: #ff9f0a;
}

.color-down {
  color: #0a84ff;
}

.arrow-up,
.arrow-down {
  width: 10px;
  height: 10px;
}

/* 按钮区：增加平滑过渡动画 */
.connect-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.circle-btn {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  cursor: pointer;
  /* transition 只针对颜色，不影响布局，减少重绘开销 */
  transition: background-color 0.3s ease;
  /* 开启硬件加速隔离层，防止重绘影响四角 */
  transform: translateZ(0);
}

.circle-btn.connected {
  background-color: #34c759;
}

.circle-btn.connecting {
  background-color: #ffd60a;
  color: #000;
}

.circle-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.btn-icon {
  width: 32px;
  height: 32px;
  margin-bottom: 2px;
}

.btn-text {
  font-size: 13px;
  font-weight: 700;
}

/* 旋转动画：只针对图标，不针对整个按钮 */
.rotating {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

/* 底部导航 */
.nav-area {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 12px;
}

.flat-btn {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  /* 图标文字间距 */
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 14px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.nav-icon {
  width: 18px;
  height: 18px;
  opacity: 0.9;
}

.flat-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>