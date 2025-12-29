<script setup lang="ts">
/**
 * 代理配置说明组件
 * 
 * **Feature: vpn-enhancement**
 * **Validates: Requirements 1.3 - 显示代理配置说明（终端环境变量设置）**
 */
import { ref, computed } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'

const i18nStore = useI18nStore()
const { locale } = storeToRefs(i18nStore)

const copied = ref(false)

// 代理配置命令
const proxyCommands = computed(() => ({
  bash: `export http_proxy=http://127.0.0.1:1087
export https_proxy=http://127.0.0.1:1087
export all_proxy=socks5://127.0.0.1:1080`,
  unset: `unset http_proxy https_proxy all_proxy`
}))

// 复制到剪贴板
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

// 翻译文本
const texts = computed(() => locale.value === 'zh' ? {
  title: '终端代理配置',
  desc: '在终端中使用以下命令启用代理：',
  copy: '复制',
  copied: '已复制',
  unsetTitle: '取消代理：',
  note: '提示：SOCKS 模式已自动配置系统代理（HTTP 1087 / SOCKS 1080）'
} : {
  title: 'Terminal Proxy Config',
  desc: 'Use these commands to enable proxy in terminal:',
  copy: 'Copy',
  copied: 'Copied',
  unsetTitle: 'To disable proxy:',
  note: 'Note: SOCKS mode auto-configures system proxy (HTTP 1087 / SOCKS 1080)'
})
</script>

<template>
  <section>
    <h2 class="text-[11px] font-semibold text-[var(--vpn-muted)] uppercase tracking-wider mb-2 pl-2">
      {{ texts.title }}
    </h2>
    <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-xl overflow-hidden shadow-sm">
      <!-- 说明文字 -->
      <div class="p-4 border-b border-[var(--vpn-border)]">
        <p class="text-[12px] text-[var(--vpn-text-secondary)] mb-3">{{ texts.desc }}</p>
        
        <!-- 代理命令 -->
        <div class="relative">
          <pre class="bg-[var(--vpn-input-bg)] rounded-lg p-3 text-[11px] font-mono text-[var(--vpn-text)] overflow-x-auto">{{ proxyCommands.bash }}</pre>
          <button
            @click="copyToClipboard(proxyCommands.bash)"
            class="absolute top-2 right-2 px-2 py-1 text-[10px] rounded-md transition-all"
            :class="copied 
              ? 'bg-green-500/20 text-green-500' 
              : 'bg-[var(--vpn-card)] text-[var(--vpn-text-secondary)] hover:text-[var(--vpn-text)]'"
          >
            {{ copied ? texts.copied : texts.copy }}
          </button>
        </div>
      </div>

      <!-- 取消代理命令 -->
      <div class="p-4">
        <p class="text-[12px] text-[var(--vpn-text-secondary)] mb-2">{{ texts.unsetTitle }}</p>
        <pre class="bg-[var(--vpn-input-bg)] rounded-lg p-3 text-[11px] font-mono text-[var(--vpn-text)] overflow-x-auto">{{ proxyCommands.unset }}</pre>
      </div>

      <!-- 提示信息 -->
      <div class="px-4 pb-4">
        <p class="text-[11px] text-[var(--vpn-muted)] italic">{{ texts.note }}</p>
      </div>
    </div>
  </section>
</template>