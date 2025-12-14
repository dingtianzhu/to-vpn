<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from './AppSidebar.vue'
import AppHeader from './AppHeader.vue'
import AppToast from '@/components/common/AppToast.vue'

const route = useRoute()
const showSidebar = computed(() => !route.meta.hideSidebar)
const isTray = computed(() => route.meta.isTray)
</script>

<template>
  <!-- 托盘视图使用简化布局 -->
  <div v-if="isTray" class="h-screen w-screen overflow-hidden">
    <router-view />
  </div>
  
  <!-- 正常布局 -->
  <div v-else class="flex h-screen w-screen overflow-hidden text-sm"
    style="background-color: var(--vpn-bg); color: var(--vpn-text)">

    <!-- Conditionally render Sidebar -->
    <AppSidebar v-if="showSidebar" class="z-20" />

    <div class="flex-1 flex flex-col h-full relative z-10">
      <!-- Conditionally render Header (Auth pages might want a simpler or no header) -->
      <AppHeader v-if="showSidebar" />
      <!-- Or implement a simple drag-region for auth pages inside their views -->

      <main class="flex-1 overflow-hidden relative">
        <router-view v-slot="{ Component }">
          <Transition name="fade" mode="out-in">
            <component :is="Component" class="h-full" />
          </Transition>
        </router-view>
      </main>
    </div>

    <AppToast />
  </div>
</template>