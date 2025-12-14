<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { useLogsStore } from '@/stores/logs'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'

const store = useLogsStore()
const i18nStore = useI18nStore()
const { logs } = storeToRefs(store)
const { t } = storeToRefs(i18nStore)

const containerRef = ref<HTMLDivElement>()
const filter = ref<'all' | 'info' | 'warn' | 'error'>('all')

// 1. 强力去除 ANSI 颜色代码 (支持 256 色模式)
const stripAnsi = (str: string) => {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
}

// 2. 清洗日志内容：去色 + 去除头部时间戳
const cleanLogMessage = (message: string) => {
  let cleanMsg = stripAnsi(message)

  // 去除 Sing-box 自带的时间前缀 (例如: "+0800 2025-12-05 14:19:27 ")
  // 正则匹配：以 +数字 开头，后面跟着 日期 时间
  cleanMsg = cleanMsg.replace(/^\+\d{4} \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} /, '')

  return cleanMsg
}

const filteredLogs = computed(() => {
  let targetLogs = logs.value

  if (filter.value !== 'all') {
    targetLogs = targetLogs.filter(log => log.level === filter.value)
  }

  // 返回处理过的数据
  return targetLogs.map(log => ({
    ...log,
    message: cleanLogMessage(log.message)
  }))
})

// 自动滚动到底部
watch(logs, async () => {
  await nextTick()
  if (containerRef.value) {
    containerRef.value.scrollTop = containerRef.value.scrollHeight
  }
}, { deep: true })
</script>

<template>
  <div class="h-full flex flex-col bg-[#ffffff] dark:bg-[#1e1e1e] transition-colors duration-300">

    <!-- Terminal Header -->
    <div
      class="px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-[#333] bg-gray-50/80 dark:bg-[#252526]/90 backdrop-blur-md sticky top-0 z-10 select-none">
      <div class="flex items-center gap-3">
        <h1 class="text-sm font-semibold text-gray-700 dark:text-gray-300 font-mono flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {{ t.logs.title }}
        </h1>
      </div>

      <div class="flex items-center gap-2">
        <!-- Filter Tabs -->
        <div class="flex bg-gray-200 dark:bg-[#333] rounded-md p-0.5">
          <button v-for="f in ['all', 'info', 'warn', 'error'] as const" :key="f" @click="filter = f"
            class="px-2.5 py-0.5 text-[10px] uppercase font-bold rounded-sm transition-all font-mono" :class="filter === f
              ? 'bg-white dark:bg-[#1e1e1e] text-black dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'">
            {{ f }}
          </button>
        </div>

        <button @click="store.clearLogs"
          class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-[#333] text-gray-500 dark:text-gray-400 transition-colors"
          :title="t.logs.clear">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Terminal Body -->
    <div ref="containerRef"
      class="flex-1 overflow-y-auto p-4 font-mono text-[12px] leading-relaxed scroll-smooth select-text selection:bg-blue-200 dark:selection:bg-blue-900">

      <div v-if="filteredLogs.length === 0"
        class="h-full flex items-center justify-center text-gray-400 dark:text-gray-600 select-none">
        <span>_ {{ t.logs.waiting }}</span>
      </div>

      <div v-for="log in filteredLogs" :key="log.id"
        class="group flex gap-2 -mx-2 px-2 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-[#2a2d2e] transition-colors">

        <!-- Level Indicator -->
        <span class="shrink-0 font-bold w-14 text-right select-none" :class="{
          'text-blue-600 dark:text-blue-400': log.level === 'info',
          'text-yellow-600 dark:text-yellow-400': log.level === 'warn',
          'text-red-600 dark:text-red-400': log.level === 'error',
        }">
          {{ log.level.toUpperCase() }}
        </span>

        <!-- Message -->
        <span class="break-all whitespace-pre-wrap text-gray-800 dark:text-[#cccccc] flex-1">
          {{ log.message }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 滚动条美化 */
::-webkit-scrollbar {
  width: 10px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 5px;
  border: 2px solid transparent;
  background-clip: content-box;
}

.dark ::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid transparent;
  background-clip: content-box;
}

::-webkit-scrollbar-thumb:hover {
  background-color: rgba(0, 0, 0, 0.2);
}

.dark ::-webkit-scrollbar-thumb:hover {
  background-color: rgba(255, 255, 255, 0.2);
}
</style>