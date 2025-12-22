<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useVpnStore } from '@/stores/vpn'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'
import { formatBytes } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'
import { emit } from '@tauri-apps/api/event';
// 引入按钮组件
import VpnButton from '@/components/dashboard/ConnectButton.vue'
const vpnStore = useVpnStore()
const i18nStore = useI18nStore()
const { status, stats, isConnected } = storeToRefs(vpnStore)
const { t } = storeToRefs(i18nStore)
const isLoading = ref(false)

const downloadSpeed = computed(() => isConnected.value ? formatBytes(stats.value.downloadSpeed) + '/s' : '0 B/s')
const uploadSpeed = computed(() => isConnected.value ? formatBytes(stats.value.uploadSpeed) + '/s' : '0 B/s')
async function handleConnect() {
  if (isLoading.value) return
  const authStore = useAuthStore()
  await authStore.syncFromStorage();

  if (authStore.needsLogin) {
    console.log("检测到需要登录，唤起主窗口");
    await emit('navigate-to-login');
    await invoke('show_main_window');

    return;
  }
  isLoading.value = true
  try {
    if (status.value === 'connected') {
      await vpnStore.disconnect()
    } else {
      await vpnStore.connect()
    }
  } catch (e) {
    showMainWindow
  } finally {
    isLoading.value = false
    showMainWindow
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
            <span>{{ t.tray.upload }}</span>
          </div>
          <div class="stat-value color-up">{{ uploadSpeed }}</div>
        </div>

        <div class="stat-divider"></div>

        <div class="stat-item">
          <div class="stat-label">
            <svg class="arrow-down" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <path d="M19 9l-7 7-7-7" />
            </svg>
            <span>{{ t.tray.download }}</span>
          </div>
          <div class="stat-value color-down">{{ downloadSpeed }}</div>
        </div>
      </div>

      <!-- 2. 中间圆形连接按钮 (增加图标切换和转圈动画) -->
      <div class="connect-area">
        <VpnButton :status="status" :disabled="isLoading" size="sm" :can-cancel="true" @click="handleConnect"
          @cancel="handleConnect" />
      </div>

      <!-- 3. 底部导航区 (增加主页和退出图标) -->
      <div class="nav-area">
        <button class="flat-btn" @click="showMainWindow">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path
              d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          <span>{{ t.tray.home }}</span>
        </button>
        <button class="flat-btn" @click="handleExit">
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span>{{ t.tray.exit }}</span>
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
/* 舞台容器：撑满窗口 */
.tray-stage {
  width: 100vw;
  height: 100vh;
  display: flex;
  background: transparent !important;
  padding: 0;
  box-sizing: border-box;
}

/* 核心卡片容器：磨砂玻璃效果 */
.tray-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  /* 磨砂背景色：暗深色调，透明度 0.8 */
  background: rgba(30, 30, 32, 0.85);
  /* 磨砂模糊核心 */
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);

  /* 圆角和细边框 */
  border-radius: 20px;
  overflow: hidden;

}

/* 1. 流量统计区 */
.stats-area {
  margin: 12px 12px 0 12px;
  padding: 10px 0;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 14px;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: background 0.2s ease;
}

.stats-area:hover {
  background: rgba(255, 255, 255, 0.08);
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
  font-size: 10px;
  color: #a1a1a6;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 2px;
}

.stat-value {
  font-size: 15px;
  font-weight: 700;
  /* 等宽字体让数字跳动时页面不抖动 */
  font-family: 'SF Pro Display', 'Roboto Mono', ui-monospace, monospace;
}

.stat-divider {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.1);
}

/* 统计颜色 */
.color-up {
  color: #ff9f0a;
}

/* 橙色 - 上传 */
.color-down {
  color: #0a84ff;
}

/* 蓝色 - 下载 */

.arrow-up,
.arrow-down {
  width: 10px;
  height: 10px;
}

/* 2. 中间连接按钮区 */
.connect-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 核心：由于 VpnButton 有 ping 扩散动画，必须留出 padding */
  padding: 12px;
  position: relative;
}

/* 补充：确保连接按钮区域不要把底部顶得太死 */


/* 3. 底部导航区 */
.nav-area {
  display: flex;
  /* 改用 flex，垂直居中更稳 */
  align-items: center;
  /* 核心：子元素（按钮）垂直居中 */
  justify-content: center;
  /* 核心：子元素水平居中 */
  gap: 12px;

  /* 关键修改点 */
  height: 64px;
  height: 64px;
  /* 明确给一个较高的固定高度，方便看居中效果 */
  padding: 0 16px;
  /* 只留左右边距，取消上下内边距 */

  background: rgba(0, 0, 0, 0.45);
  /* 加深一点背景，对比更明显 */
  flex-shrink: 0;
  /* 防止被上方内容挤扁 */
  box-sizing: border-box;
}

/* 扁平化按钮 */
.flat-btn {
  flex: 1;
  /* 两个按钮平分宽度 */
  max-width: 140px;
  /* 限制最大宽度，防止太长难看 */
  height: 42px;
  /* 按钮自身高度 */

  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  gap: 8px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  color: #efeff4;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.flat-btn:hover {
  background: rgba(255, 255, 255, 0.25) !important;
  transform: translateY(-1px);
}



.flat-btn:active {
  transform: translateY(0);
  background: rgba(255, 255, 255, 0.05);
}

.nav-icon {
  width: 16px;
  height: 16px;
  color: #fff;
}

/* 旋转动画 (如果 VpnButton 没自带的话可以用这个) */
@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.rotating {
  animation: spin 1.2s linear infinite;
}
</style>