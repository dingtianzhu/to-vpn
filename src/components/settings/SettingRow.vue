<script setup lang="ts">
interface Props {
  icon?: string
  iconColor?: string
  iconBg?: string
  title: string
  subtitle?: string
}

defineProps<Props>()
</script>

<template>
  <div class="flex items-center justify-between p-4 hover:bg-[var(--vpn-card-hover)] transition-colors">
    <div class="flex items-center gap-3">
      <div v-if="icon" class="w-8 h-8 rounded-lg flex items-center justify-center" :class="iconBg || 'bg-blue-500/10'">
        <svg class="w-4 h-4" :class="iconColor || 'text-blue-500'" fill="none" stroke="currentColor"
          viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="icon" />
        </svg>
      </div>
      <div>
        <span class="text-[13px] font-medium text-[var(--vpn-text)]">{{ title }}</span>
        <p v-if="subtitle" class="text-[11px] text-[var(--vpn-text-secondary)] mt-0.5">{{ subtitle }}</p>
      </div>
    </div>
    <slot />
  </div>
</template>