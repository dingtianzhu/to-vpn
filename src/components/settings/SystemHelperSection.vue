<script setup lang="ts">
import { useVpnStore } from '@/stores/vpn'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

const vpnStore = useVpnStore()
const i18nStore = useI18nStore()

const { helperStatus, isHelperBusy } = storeToRefs(vpnStore)
const { t } = storeToRefs(i18nStore)

const isHelperActive = computed(() =>
  helperStatus.value === 'running' || helperStatus.value === 'installed'
)

function handleHelperAction() {
  if (helperStatus.value === 'not_installed') {
    vpnStore.installHelper()
  } else {
    vpnStore.uninstallHelper()
  }
}
</script>

<template>
  <section>
    <h2 class="text-[11px] font-semibold text-[var(--vpn-muted)] uppercase tracking-wider mb-2 pl-2">
      {{ t.settings.helper.title }}
    </h2>
    <div
      class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-xl p-4 shadow-sm flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center"
          :class="isHelperActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div>
          <div class="text-[13px] font-medium text-[var(--vpn-text)]">
            {{ isHelperActive ? t.settings.helper.installed : t.settings.helper.missing }}
          </div>
          <div class="text-[11px] text-[var(--vpn-text-secondary)]">
            {{ t.settings.helper.desc }}
          </div>
        </div>
      </div>

      <button @click="handleHelperAction" :disabled="isHelperBusy"
        class="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all shadow-sm border disabled:opacity-50 disabled:cursor-not-allowed"
        :class="helperStatus === 'not_installed'
          ? 'bg-[var(--vpn-text)] text-[var(--vpn-bg)] border-transparent hover:opacity-90'
          : 'bg-transparent border-[var(--vpn-border)] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'">
        <span v-if="isHelperBusy" class="flex items-center gap-1.5">
          <span class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
          {{ t.common.loading }}
        </span>
        <span v-else>
          {{ helperStatus === 'not_installed' ? t.settings.helper.install : t.settings.helper.uninstall }}
        </span>
      </button>
    </div>
  </section>
</template>