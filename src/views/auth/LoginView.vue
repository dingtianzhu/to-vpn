<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useNotification } from '@/composables/useNotification'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'
import { useRouter, useRoute } from 'vue-router'

const authStore = useAuthStore()
const { t } = storeToRefs(useI18nStore())
const router = useRouter()
const route = useRoute()
const notification = useNotification()

const { isLoading, loginError, isAuthenticated } = storeToRefs(authStore)

const username = ref('')
const password = ref('')

// 计算重定向目标
const redirectTarget = computed(() => {
  const redirect = route.query.redirect as string
  // 验证 redirect 是否是有效的内部路径
  if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
    return redirect
  }
  return '/'
})

// 检查是否需要登录后自动连接
const hasPendingConnect = computed(() => {
  return route.query.pendingConnect === 'true'
})

// 判断是否从 profile 页来的
const fromProfile = computed(() => {
  return route.query.redirect === '/profile'
})

// 如果已登录，直接跳转
onMounted(() => {
  if (isAuthenticated.value) {
    router.replace(redirectTarget.value)
  }
})

const handleLogin = async () => {
  // 输入验证
  const trimmedUsername = username.value.trim()
  const trimmedPassword = password.value

  if (!trimmedUsername || !trimmedPassword) {
    notification.warning(t.value.login.pleaseEnterCredentials)
    return
  }

  // 用户名长度检查
  if (trimmedUsername.length < 3 || trimmedUsername.length > 50) {
    notification.warning(t.value.errors?.invalidUsername || 'Invalid username')
    return
  }

  // 密码长度检查
  if (trimmedPassword.length < 6 || trimmedPassword.length > 100) {
    notification.warning(t.value.errors?.invalidPassword || 'Password must be at least 6 characters')
    return
  }

  const success = await authStore.doLogin(trimmedUsername, trimmedPassword)

  if (success) {
    notification.success(t.value.login.loginSuccess)
    
    // 如果有 pendingConnect 参数，设置自动连接标志
    if (hasPendingConnect.value) {
      authStore.setPendingConnect(true)
    }
    
    router.push(redirectTarget.value)
  } else {
    notification.error(loginError.value || t.value.login.loginFailed)
  }
}

// 返回上一页
function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/')
  }
}
</script>

<template>
  <div class="h-full flex flex-col items-center justify-center bg-[var(--vpn-bg)] relative p-6 titlebar-drag" data-tauri-drag-region>
    <!-- Background Effect -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div class="absolute top-0 right-0 w-96 h-96 bg-emerald-400/20 rounded-full blur-[120px]"></div>
      <div class="absolute bottom-0 left-0 w-80 h-80 bg-blue-400/20 rounded-full blur-[100px]"></div>
    </div>

    <!-- Back Button -->
    <button @click="goBack"
      class="absolute top-4 left-4 p-2 rounded-lg text-[var(--vpn-text-secondary)] hover:text-[var(--vpn-text)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors titlebar-no-drag z-20">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
    </button>

    <!-- Security Warning -->
    <!-- <div
      class="absolute top-0 left-0 w-full bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center backdrop-blur-sm titlebar-no-drag">
      <p class="text-[11px] font-bold text-amber-600 dark:text-amber-500 flex items-center justify-center gap-2">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        {{ t.common.betaWarning }}
      </p>
      <p class="text-[10px] text-amber-600/80 dark:text-amber-500/70 mt-0.5">
        {{ t.common.securityTip }}
      </p>
    </div> -->

    <!-- Login Card -->
    <div
      class="w-full max-w-[340px] bg-[var(--vpn-card)]/80 backdrop-blur-xl border border-[var(--vpn-border)] shadow-2xl rounded-2xl p-8 titlebar-no-drag relative z-10">

      <!-- Logo & Title -->
      <div class="flex flex-col items-center mb-8">
        <div
          class="w-14 h-14 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-2xl shadow-lg shadow-emerald-500/20 flex items-center justify-center mb-4 text-white">
          <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 class="text-xl font-bold text-[var(--vpn-text)]">{{ t.login.title }}</h2>
        <p class="text-[11px] text-[var(--vpn-text-secondary)] mt-1">
          {{ fromProfile ? t.login.loginToProfile : t.login.subtitle }}
        </p>
      </div>

      <!-- Login Form -->
      <form @submit.prevent="handleLogin" class="space-y-4">
        <div>
          <label class="block text-[11px] font-medium text-[var(--vpn-text-secondary)] mb-1.5 ml-1">
            {{ t.login.username }}
          </label>
          <div class="relative">
            <div class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--vpn-muted)]">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <input v-model="username" type="text"
              class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--vpn-input-bg)] border border-transparent focus:bg-[var(--vpn-bg)] focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 text-[13px] text-[var(--vpn-text)] transition-all outline-none"
              :placeholder="t.login.enterUsername" :disabled="isLoading" autocomplete="username" />
          </div>
        </div>

        <div>
          <label class="block text-[11px] font-medium text-[var(--vpn-text-secondary)] mb-1.5 ml-1">
            {{ t.login.password }}
          </label>
          <div class="relative">
            <div class="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--vpn-muted)]">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <input v-model="password" type="password"
              class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--vpn-input-bg)] border border-transparent focus:bg-[var(--vpn-bg)] focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 text-[13px] text-[var(--vpn-text)] transition-all outline-none"
              :placeholder="t.login.enterPassword" :disabled="isLoading" autocomplete="current-password" />
          </div>
        </div>

        <!-- Error Message -->
        <Transition name="fade">
          <div v-if="loginError"
            class="flex items-center gap-2 text-red-500 text-[12px] bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{{ loginError }}</span>
          </div>
        </Transition>

        <button type="submit" :disabled="isLoading"
          class="w-full py-3 mt-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-[13px] font-semibold shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          <span v-if="isLoading"
            class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          {{ isLoading ? t.common.loading : t.login.submit }}
        </button>
      </form>

      <!-- Bottom Links -->
      <div class="mt-6 flex flex-row justify-between w-full items-center">
        <!-- 忘记密码 (左) -->
        <button @click="router.push('/forget')"
          class="text-[11px] text-[var(--vpn-text-secondary)] hover:text-[var(--vpn-text)] transition-colors">
          {{ t.login.forgotPassword }}
        </button>

        <!-- 去注册 (右) -->
        <button @click="router.push('/register')"
          class="text-[11px] text-[var(--vpn-text-secondary)] hover:text-[var(--vpn-text)] transition-colors">
          {{ t.login.register }}
        </button>
      </div>

    </div>

    <!-- App Version -->
    <p class="absolute bottom-4 text-[10px] text-[var(--vpn-muted)]">ToVPN v1.0.0</p>
  </div>
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