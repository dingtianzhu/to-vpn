<script setup lang="ts">
interface Props {
  message: string
  visible: boolean
}

defineProps<Props>()
const emit = defineEmits<{ dismiss: [] }>()
</script>

<template>
  <Transition name="fade">
    <div v-if="visible && message"
      class="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
      <svg class="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span class="flex-1 text-xs text-red-600 dark:text-red-400 font-medium truncate">
        {{ message }}
      </span>
      <button @click="emit('dismiss')" class="p-0.5 rounded hover:bg-red-200 dark:hover:bg-red-800 transition-colors">
        <svg class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: all 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>