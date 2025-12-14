<script setup lang="ts">
import { computed } from 'vue'
import type { VpnStatus } from '@/types'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'

interface Props {
  status: VpnStatus
  disabled?: boolean
  canCancel?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  canCancel: false,
})

const emit = defineEmits<{
  click: []
  cancel: []
}>()

const i18nStore = useI18nStore()
const { t } = storeToRefs(i18nStore)

const isConnecting = computed(() => props.status === 'connecting' || props.status === 'disconnecting')

const buttonText = computed(() => {
  if (props.status === 'connected') return t.value.common.stop
  if (isConnecting.value) return t.value.common.cancel
  return t.value.common.connect
})

const buttonStyle = computed(() => {
  switch (props.status) {
    case 'connected':
      return 'from-emerald-400 to-teal-500 shadow-emerald-500/40 border-emerald-300 ring-emerald-500/20'
    case 'error':
      return 'from-red-400 to-rose-500 shadow-red-500/40 border-red-300 ring-red-500/20'
    case 'connecting':
    case 'disconnecting':
      return 'from-amber-400 to-orange-500 shadow-amber-500/40 border-amber-300 ring-amber-500/20'
    default:
      return 'from-slate-500 to-slate-600 dark:from-slate-600 dark:to-slate-700 shadow-slate-500/40 border-slate-400 ring-slate-500/20'
  }
})

function handleClick() {
  if (props.disabled) return
  if (props.status === 'connecting' && props.canCancel) {
    emit('cancel')
  } else {
    emit('click')
  }
}
</script>

<template>
  <div class="relative flex items-center justify-center py-0">
    <div v-if="status === 'connected'"
      class="absolute inset-0 rounded-full animate-ping opacity-10 bg-emerald-400 scale-150 duration-1000"></div>
    <div v-if="isConnecting"
      class="absolute inset-0 rounded-full animate-ping opacity-10 bg-amber-400 scale-125 duration-1000"></div>

    <button @click="handleClick" :disabled="disabled"
      class="group relative w-44 h-44 rounded-full flex items-center justify-center transition-all duration-500 focus:outline-none disabled:opacity-80 disabled:cursor-not-allowed">
      <div :class="[
        'absolute inset-0 rounded-full border-[6px] opacity-20 transition-all duration-500',
        status === 'connected' ? 'border-emerald-500' : 'border-slate-300 dark:border-white/10'
      ]" />

      <div :class="[
        'relative w-36 h-36 rounded-full flex flex-col items-center justify-center text-white shadow-2xl transition-all duration-500 bg-gradient-to-br border-t border-white/20',
        'transform group-hover:scale-[1.02] group-active:scale-95',
        buttonStyle
      ]">

        <div class="relative z-10 mb-1">
          <svg v-if="isConnecting" class="w-12 h-12 animate-spin text-white/90" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>

          <svg v-else class="w-12 h-12 drop-shadow-md text-white/90" fill="none" stroke="currentColor"
            viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>

        <span class="mt-1 text-xs font-bold tracking-widest uppercase drop-shadow-sm text-white/90">
          {{ buttonText }}
        </span>
      </div>
    </button>
  </div>
</template>