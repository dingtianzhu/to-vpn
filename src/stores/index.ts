/**
 * Pinia Store 模块统一导出
 * 集中导出所有状态管理 store
 */

import { createPinia } from 'pinia'

// 创建 Pinia 实例
export const pinia = createPinia()

// VPN 状态管理
export { useVpnStore } from './vpn'

// 服务器列表管理
export { useServersStore } from './servers'

// 设置管理
export { useSettingsStore } from './settings'

// 日志管理
export { useLogsStore } from './logs'

// 认证管理
export { useAuthStore } from './auth'

// 国际化管理
export { useI18nStore } from './i18n'

// 统计管理
export { useStatsStore } from './stats'
