<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'
import { sendCode, register } from '@/api/auth'

const router = useRouter()
const i18nStore = useI18nStore()
const { t } = storeToRefs(i18nStore)

// 表单数据
const form = ref({
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  code: ''
})

// 状态
const isLoading = ref(false)
const isSendingCode = ref(false)
const countdown = ref(0)
const error = ref('')
const success = ref('')

// 验证
const isEmailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email))
const isUsernameValid = computed(() => form.value.username.length >= 3 && form.value.username.length <= 50)
const isPasswordValid = computed(() => form.value.password.length >= 6)
const isPasswordMatch = computed(() => form.value.password === form.value.confirmPassword)
const isCodeValid = computed(() => form.value.code.length === 6)

const canSubmit = computed(() => 
  isEmailValid.value && 
  isUsernameValid.value && 
  isPasswordValid.value && 
  isPasswordMatch.value && 
  isCodeValid.value &&
  !isLoading.value
)

// 发送验证码
async function handleSendCode() {
  if (!isEmailValid.value || isSendingCode.value || countdown.value > 0) return
  
  isSendingCode.value = true
  error.value = ''
  
  try {
    await sendCode({ target: form.value.email, type: 1 }) // 1 = 注册
    success.value = t.value.register?.codeSent || '验证码已发送'
    // 开始倒计时
    countdown.value = 60
    const timer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) {
        clearInterval(timer)
      }
    }, 1000)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '发送验证码失败'
  } finally {
    isSendingCode.value = false
  }
}

// 提交注册
async function handleSubmit() {
  if (!canSubmit.value) return
  
  isLoading.value = true
  error.value = ''
  success.value = ''
  
  try {
    await register({
      username: form.value.username,
      email: form.value.email,
      password: form.value.password,
      code: form.value.code
    })
    success.value = t.value.register?.success || '注册成功'
    // 延迟跳转到登录页
    setTimeout(() => {
      router.push('/login')
    }, 1500)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '注册失败'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="h-full w-full flex items-center justify-center bg-[var(--vpn-bg)] relative titlebar-drag" data-tauri-drag-region>
    <div class="absolute top-[-10%] right-[-10%] w-96 h-96 bg-emerald-400/20 rounded-full blur-[100px]"></div>

    <div
      class="w-full max-w-[340px] bg-white/60 dark:bg-black/40 backdrop-blur-2xl border border-white/20 dark:border-white/5 shadow-2xl rounded-2xl p-8 titlebar-no-drag">
      <h2 class="text-xl font-semibold text-center text-[var(--vpn-text)] mb-6">
        {{ t.register?.title || 'Create Account' }}
      </h2>

      <!-- 错误/成功提示 -->
      <div v-if="error" class="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
        {{ error }}
      </div>
      <div v-if="success" class="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs">
        {{ success }}
      </div>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <!-- 用户名 -->
        <input 
          v-model="form.username"
          type="text" 
          :placeholder="t.register?.username || 'Username (3-50 chars)'"
          class="w-full px-4 py-2.5 rounded-lg bg-white/50 dark:bg-white/5 border border-black/5 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-[13px] text-[var(--vpn-text)] transition-all" 
        />
        
        <!-- 邮箱 -->
        <input 
          v-model="form.email"
          type="email" 
          :placeholder="t.register?.email || 'Email'"
          class="w-full px-4 py-2.5 rounded-lg bg-white/50 dark:bg-white/5 border border-black/5 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-[13px] text-[var(--vpn-text)] transition-all" 
        />
        
        <!-- 验证码 -->
        <div class="flex gap-2">
          <input 
            v-model="form.code"
            type="text" 
            maxlength="6"
            :placeholder="t.register?.code || 'Verification Code'"
            class="flex-1 px-4 py-2.5 rounded-lg bg-white/50 dark:bg-white/5 border border-black/5 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-[13px] text-[var(--vpn-text)] transition-all" 
          />
          <button 
            type="button"
            :disabled="!isEmailValid || isSendingCode || countdown > 0"
            @click="handleSendCode"
            class="px-4 py-2.5 rounded-lg bg-emerald-500/80 hover:bg-emerald-500 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-[12px] font-medium transition-all whitespace-nowrap"
          >
            {{ countdown > 0 ? `${countdown}s` : (isSendingCode ? '...' : (t.register?.sendCode || 'Send')) }}
          </button>
        </div>
        
        <!-- 密码 -->
        <input 
          v-model="form.password"
          type="password" 
          :placeholder="t.register?.password || 'Password (min 6 chars)'"
          class="w-full px-4 py-2.5 rounded-lg bg-white/50 dark:bg-white/5 border border-black/5 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-[13px] text-[var(--vpn-text)] transition-all" 
        />
        
        <!-- 确认密码 -->
        <input 
          v-model="form.confirmPassword"
          type="password" 
          :placeholder="t.register?.confirmPassword || 'Confirm Password'"
          class="w-full px-4 py-2.5 rounded-lg bg-white/50 dark:bg-white/5 border border-black/5 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-[13px] text-[var(--vpn-text)] transition-all" 
        />
        
        <!-- 密码不匹配提示 -->
        <p v-if="form.confirmPassword && !isPasswordMatch" class="text-red-500 text-[11px]">
          {{ t.register?.passwordMismatch || 'Passwords do not match' }}
        </p>

        <button 
          type="submit"
          :disabled="!canSubmit"
          class="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-[13px] font-medium shadow-md shadow-emerald-500/20 transition-all active:scale-95"
        >
          {{ isLoading ? (t.common?.loading || 'Loading...') : (t.register?.submit || 'Sign Up') }}
        </button>
      </form>

      <div class="mt-6 text-center text-[11px]">
        <span class="text-[var(--vpn-text-secondary)]">{{ t.register?.hasAccount || 'Already have an account?' }} </span>
        <router-link to="/login" class="text-emerald-500 hover:text-emerald-600 font-medium">
          {{ t.register?.login || 'Log In' }}
        </router-link>
      </div>
    </div>
  </div>
</template>
