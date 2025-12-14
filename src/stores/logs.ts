import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ConnectionLog } from '@/types'

const MAX_LOGS = 100

export const useLogsStore = defineStore('logs', () => {
  const logs = ref<ConnectionLog[]>([])

  const recentLogs = computed(() => logs.value.slice(-50))

  function addLog(level: ConnectionLog['level'], message: string) {
    const log: ConnectionLog = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      level,
      message,
    }
    
    logs.value.push(log)
    
    // 保持日志数量在限制内
    if (logs.value.length > MAX_LOGS) {
      logs.value = logs.value.slice(-MAX_LOGS)
    }
  }

  function clearLogs() {
    logs.value = []
  }

  return {
    logs,
    recentLogs,
    addLog,
    clearLogs,
  }
})
