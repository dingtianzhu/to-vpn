<script setup lang="ts">
interface Option {
  value: string | number
  label: string
}

interface Props {
  modelValue: string | number
  options: Option[]
}

defineProps<Props>()
defineEmits<{ 'update:modelValue': [value: string | number] }>()
</script>

<template>
  <div class="relative">
    <select :value="modelValue" @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      class="appearance-none bg-transparent pl-3 pr-8 py-1 text-[13px] text-[var(--vpn-text)] font-medium outline-none text-right cursor-pointer focus:bg-black/5 dark:focus:bg-white/5 rounded-md transition-colors">
      <option v-for="opt in options" :key="opt.value" :value="opt.value">
        {{ opt.label }}
      </option>
    </select>
    <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[var(--vpn-text-secondary)]">
      <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
      </svg>
    </div>
  </div>
</template>