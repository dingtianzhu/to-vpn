<script setup lang="ts">
interface Props {
  modelValue: boolean
  disabled?: boolean
}

defineProps<Props>()
defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <button @click="!disabled && $emit('update:modelValue', !modelValue)" :disabled="disabled"
    class="relative w-10 h-6 rounded-full transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
    :class="modelValue ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-white/10'">
    <span
      class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-200"
      :class="modelValue ? 'translate-x-4' : 'translate-x-0'" />
  </button>
</template>