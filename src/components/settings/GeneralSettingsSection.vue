<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'

const settingsStore = useSettingsStore()
const i18nStore = useI18nStore()

const { theme } = storeToRefs(settingsStore)
const { t, locale } = storeToRefs(i18nStore)
</script>

<template>
  <section>
    <h2 class="text-[11px] font-semibold text-[var(--vpn-muted)] uppercase tracking-wider mb-2 pl-2">
      {{ t.settings.general }}
    </h2>
    <div
      class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-xl overflow-hidden shadow-sm divide-y divide-[var(--vpn-border)]">

      <!-- Language -->
      <div class="flex items-center justify-between p-4 hover:bg-[var(--vpn-card-hover)] transition-colors">
        <span class="text-[13px] font-medium text-[var(--vpn-text)]">{{ t.settings.language }}</span>
        <div class="flex bg-[var(--vpn-input-bg)] p-0.5 rounded-lg">
          <button @click="i18nStore.setLocale('en')" :class="locale === 'en'
            ? 'bg-[var(--vpn-card)] shadow-sm text-[var(--vpn-text)]'
            : 'text-[var(--vpn-text-secondary)]'" class="px-3 py-1 text-[11px] rounded-md transition-all">
            EN
          </button>
          <button @click="i18nStore.setLocale('zh')" :class="locale === 'zh'
            ? 'bg-[var(--vpn-card)] shadow-sm text-[var(--vpn-text)]'
            : 'text-[var(--vpn-text-secondary)]'" class="px-3 py-1 text-[11px] rounded-md transition-all">
            中文
          </button>
        </div>
      </div>

      <!-- Theme -->
      <div class="flex items-center justify-between p-4 hover:bg-[var(--vpn-card-hover)] transition-colors">
        <span class="text-[13px] font-medium text-[var(--vpn-text)]">{{ t.settings.appearance }}</span>
        <div class="flex bg-[var(--vpn-input-bg)] p-0.5 rounded-lg">
          <button @click="settingsStore.setTheme('light')" :class="theme === 'light'
            ? 'bg-[var(--vpn-card)] shadow-sm text-[var(--vpn-text)]'
            : 'text-[var(--vpn-text-secondary)]'" class="px-3 py-1 text-[11px] rounded-md transition-all">
            {{ t.settings.theme.light }}
          </button>
          <button @click="settingsStore.setTheme('dark')" :class="theme === 'dark'
            ? 'bg-[var(--vpn-card)] shadow-sm text-[var(--vpn-text)]'
            : 'text-[var(--vpn-text-secondary)]'" class="px-3 py-1 text-[11px] rounded-md transition-all">
            {{ t.settings.theme.dark }}
          </button>
        </div>
      </div>

    </div>
  </section>
</template>