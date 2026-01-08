<script setup lang="ts">
/**
 * SettingRow.vue - 设置行组件
 * 
 * 通用设置行组件，支持图标、标题、描述、默认值和重连提示
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 10.2, 10.3**
 */
interface Props {
  icon?: string
  iconColor?: string
  iconBg?: string
  title: string
  subtitle?: string
  /** 默认值显示 */
  defaultValue?: string
  /** 是否需要重连才能生效 */
  requiresReconnect?: boolean
}

defineProps<Props>()
</script>

<template>
  <div class="flex items-center justify-between p-4 hover:bg-[var(--vpn-card-hover)] transition-colors">
    <div class="flex items-center gap-3 flex-1 min-w-0">
      <div v-if="icon" class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" :class="iconBg || 'bg-blue-500/10'">
        <svg class="w-4 h-4" :class="iconColor || 'text-blue-500'" fill="none" stroke="currentColor"
          viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="icon" />
        </svg>
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-[13px] font-medium text-[var(--vpn-text)]">{{ title }}</span>
          <!-- 需要重连标记 -->
          <!-- **Feature: vpn-pure-mode** -->
          <!-- **Validates: Requirements 10.3** -->
          <span 
            v-if="requiresReconnect" 
            class="px-1.5 py-0.5 text-[9px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded shrink-0"
            :title="'Requires reconnection to take effect'"
          >
            ↻
          </span>
          <!-- 默认值显示 -->
          <span 
            v-if="defaultValue" 
            class="px-1.5 py-0.5 text-[9px] font-mono bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded shrink-0"
          >
            {{ defaultValue }}
          </span>
        </div>
        <p v-if="subtitle" class="text-[11px] text-[var(--vpn-text-secondary)] mt-0.5 leading-relaxed">{{ subtitle }}</p>
      </div>
    </div>
    <div class="shrink-0 ml-3">
      <slot />
    </div>
  </div>
</template>
