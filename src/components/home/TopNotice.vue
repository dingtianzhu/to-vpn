<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'

interface Props {
  type: 'login' | 'helper' | 'limit' | null
  limitInfo?: string | null
}

const props = defineProps<Props>()
const router = useRouter()
const { t } = storeToRefs(useI18nStore())

const noticeConfig = computed(() => {
  switch (props.type) {
    case 'login':
      return {
        icon: 'M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1',
        text: t.value.home.loginToConnect,
        class: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30',
        action: () => router.push('/login')
      }
    case 'helper':
      return {
        icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
        text: t.value.home.installExtension,
        class: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 hover:bg-amber-100',
        action: () => router.push('/settings')
      }
    case 'limit':
      return {
        text: `${t.value.home.daily}: ${props.limitInfo}`,
        class: 'bg-slate-100 dark:bg-white/10 text-[var(--vpn-text-secondary)]',
        action: null
      }
    default:
      return null
  }
})
</script>

<template>
  <Transition name="fade" mode="out-in">
    <button v-if="noticeConfig && type !== 'limit'" :key="type || 'default'" @click="noticeConfig.action?.()"
      class="px-4 py-1.5 rounded-full border text-xs font-medium flex items-center gap-2 transition-colors shadow-sm"
      :class="noticeConfig.class">
      <svg v-if="noticeConfig.icon" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="noticeConfig.icon" />
      </svg>
      <span>{{ noticeConfig.text }}</span>
    </button>

    <div v-else-if="type === 'limit' && noticeConfig" :key="'limit'"
      class="px-3 py-1.5 rounded-full text-[11px] flex items-center gap-2 shadow-sm" :class="noticeConfig.class">
      <span>{{ noticeConfig.text }}</span>
      <span class="text-[var(--vpn-primary)] cursor-pointer hover:underline">{{ t.home.upgrade }}</span>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>