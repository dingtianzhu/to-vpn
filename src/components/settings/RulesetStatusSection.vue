<script setup lang="ts">
/**
 * 规则集状态组件
 * 
 * **Feature: vpn-optimization**
 * **Validates: Requirements 5.3, 7.3**
 * 
 * 显示规则集版本和更新时间，提供手动更新功能
 */
import { computed, ref, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useI18nStore } from '@/stores/i18n'
import { useNotification } from '@/composables/useNotification'
import { storeToRefs } from 'pinia'
import SettingRow from './SettingRow.vue'

// 规则集信息类型
interface RulesetInfo {
  name: string
  path: string
  exists: boolean
  size: number
  last_modified: number | null
  last_modified_formatted: string | null
  needs_update: boolean
  days_since_update: number | null
}

// 规则集状态类型
interface RulesetStatus {
  geosite_cn: RulesetInfo
  geoip_cn: RulesetInfo
  any_needs_update: boolean
  checked_at: number
}

// 规则集更新结果类型
interface RulesetUpdateResult {
  success: boolean
  updated_count: number
  error: string | null
  status: RulesetStatus | null
}

const i18nStore = useI18nStore()
const notification = useNotification()

const { locale } = storeToRefs(i18nStore)

// 状态
const rulesetStatus = ref<RulesetStatus | null>(null)
const isLoading = ref(false)
const isUpdating = ref(false)

// 翻译文本
const texts = computed(() => ({
  sectionTitle: locale.value === 'zh' ? '规则集' : 'Ruleset',
  geositeCn: locale.value === 'zh' ? '域名规则集' : 'Domain Ruleset',
  geoipCn: locale.value === 'zh' ? 'IP 规则集' : 'IP Ruleset',
  lastUpdated: locale.value === 'zh' ? '更新时间' : 'Last Updated',
  daysAgo: locale.value === 'zh' ? '天前' : 'days ago',
  today: locale.value === 'zh' ? '今天' : 'Today',
  notFound: locale.value === 'zh' ? '未找到' : 'Not Found',
  needsUpdate: locale.value === 'zh' ? '需要更新' : 'Needs Update',
  upToDate: locale.value === 'zh' ? '已是最新' : 'Up to Date',
  updateRuleset: locale.value === 'zh' ? '更新规则集' : 'Update Ruleset',
  updating: locale.value === 'zh' ? '更新中...' : 'Updating...',
  updateHint: locale.value === 'zh' 
    ? '规则集超过 7 天未更新，建议更新以保持最佳分流效果' 
    : 'Ruleset is over 7 days old. Consider updating for optimal routing.',
  checkFailed: locale.value === 'zh' ? '检查失败' : 'Check Failed',
  updateSuccess: locale.value === 'zh' ? '规则集更新成功' : 'Ruleset Updated Successfully',
  updateFailed: locale.value === 'zh' ? '更新失败' : 'Update Failed',
  partialSuccess: locale.value === 'zh' ? '部分更新成功' : 'Partial Update Success',
}))

// 图标
const icons = {
  ruleset: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  check: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  refresh: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
}

// 格式化天数显示
function formatDaysAgo(days: number | null): string {
  if (days === null) return texts.value.notFound
  if (days === 0) return texts.value.today
  return `${days} ${texts.value.daysAgo}`
}

// 格式化文件大小
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// 更新规则集
async function updateRulesets() {
  isUpdating.value = true
  try {
    const result = await invoke<RulesetUpdateResult>('update_ruleset')
    
    if (result.status) {
      rulesetStatus.value = result.status
    }
    
    if (result.success && result.updated_count === 2) {
      notification.success(texts.value.updateSuccess)
    } else if (result.updated_count > 0) {
      notification.warning(`${texts.value.partialSuccess}: ${result.error || ''}`)
    } else {
      notification.error(`${texts.value.updateFailed}: ${result.error || ''}`)
    }
  } catch (error) {
    console.error('Failed to update rulesets:', error)
    notification.error(`${texts.value.updateFailed}: ${error}`)
  } finally {
    isUpdating.value = false
  }
}

// 组件挂载时检查状态
onMounted(async () => {
  isLoading.value = true
  try {
    const status = await invoke<RulesetStatus>('get_ruleset_status')
    rulesetStatus.value = status
  } catch (error) {
    console.error('Failed to load ruleset status:', error)
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <section>
    <h2 class="text-[11px] font-semibold text-[var(--vpn-muted)] uppercase tracking-wider mb-2 pl-2">
      {{ texts.sectionTitle }}
    </h2>
    <div
      class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-xl overflow-hidden shadow-sm divide-y divide-[var(--vpn-border)]">

      <!-- 加载状态 -->
      <div v-if="isLoading" class="p-4 text-center">
        <div class="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
      </div>

      <template v-else-if="rulesetStatus">
        <!-- 更新提示 -->
        <div v-if="rulesetStatus.any_needs_update" 
          class="p-3 bg-yellow-500/10 border-b border-yellow-500/20 flex items-start gap-2">
          <svg class="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="icons.warning" />
          </svg>
          <p class="text-[11px] text-yellow-600 dark:text-yellow-400">
            {{ texts.updateHint }}
          </p>
        </div>

        <!-- geosite-cn 规则集 -->
        <SettingRow 
          :icon="icons.ruleset" 
          :icon-color="rulesetStatus.geosite_cn.needs_update ? 'text-yellow-500' : 'text-green-500'" 
          :icon-bg="rulesetStatus.geosite_cn.needs_update ? 'bg-yellow-500/10' : 'bg-green-500/10'"
          :title="texts.geositeCn"
          :subtitle="rulesetStatus.geosite_cn.exists 
            ? `${rulesetStatus.geosite_cn.last_modified_formatted || ''} (${formatSize(rulesetStatus.geosite_cn.size)})`
            : texts.notFound">
          <div class="flex items-center gap-2">
            <span 
              :class="[
                'text-[10px] px-2 py-0.5 rounded-full font-medium',
                rulesetStatus.geosite_cn.needs_update 
                  ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' 
                  : 'bg-green-500/10 text-green-600 dark:text-green-400'
              ]">
              {{ rulesetStatus.geosite_cn.needs_update ? texts.needsUpdate : texts.upToDate }}
            </span>
            <span v-if="rulesetStatus.geosite_cn.days_since_update !== null" 
              class="text-[10px] text-[var(--vpn-muted)]">
              {{ formatDaysAgo(rulesetStatus.geosite_cn.days_since_update) }}
            </span>
          </div>
        </SettingRow>

        <!-- geoip-cn 规则集 -->
        <SettingRow 
          :icon="icons.ruleset" 
          :icon-color="rulesetStatus.geoip_cn.needs_update ? 'text-yellow-500' : 'text-green-500'" 
          :icon-bg="rulesetStatus.geoip_cn.needs_update ? 'bg-yellow-500/10' : 'bg-green-500/10'"
          :title="texts.geoipCn"
          :subtitle="rulesetStatus.geoip_cn.exists 
            ? `${rulesetStatus.geoip_cn.last_modified_formatted || ''} (${formatSize(rulesetStatus.geoip_cn.size)})`
            : texts.notFound">
          <div class="flex items-center gap-2">
            <span 
              :class="[
                'text-[10px] px-2 py-0.5 rounded-full font-medium',
                rulesetStatus.geoip_cn.needs_update 
                  ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400' 
                  : 'bg-green-500/10 text-green-600 dark:text-green-400'
              ]">
              {{ rulesetStatus.geoip_cn.needs_update ? texts.needsUpdate : texts.upToDate }}
            </span>
            <span v-if="rulesetStatus.geoip_cn.days_since_update !== null" 
              class="text-[10px] text-[var(--vpn-muted)]">
              {{ formatDaysAgo(rulesetStatus.geoip_cn.days_since_update) }}
            </span>
          </div>
        </SettingRow>

        <!-- 更新按钮 -->
        <div class="p-3 flex justify-end">
          <button 
            @click="updateRulesets"
            :disabled="isUpdating"
            class="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg transition-colors
              bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20
              disabled:opacity-50 disabled:cursor-not-allowed">
            <svg 
              :class="['w-3.5 h-3.5', isUpdating ? 'animate-spin' : '']" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="icons.refresh" />
            </svg>
            {{ isUpdating ? texts.updating : texts.updateRuleset }}
          </button>
        </div>
      </template>

      <!-- 无数据状态 -->
      <div v-else class="p-4 text-center text-[12px] text-[var(--vpn-muted)]">
        {{ texts.checkFailed }}
      </div>

    </div>
  </section>
</template>
