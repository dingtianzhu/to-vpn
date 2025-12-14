<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'
import { sendCode, resetPassword } from '@/api/auth'

const router = useRouter()
const i18nStore = useI18nStore()
const { t } = storeToRefs(i18nStore)

// 表单数据
const form = ref({
  email: '',
  code: '',
  newPassword: '',
  confirmPassword: ''
})

// 步骤：1=输入邮箱 2=输入验证码和新密码
const step = ref(1)

// 状态
const isLoading = ref(false)
const isSendingCode = ref(false)
const countdown = ref(0)
const error = ref('')
const success = ref('')

// 验证
const isEmailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email))
const isCodeValid = computed(() => form.value.code.length === 6)
const isPasswordValid = computed(() => form.value.newPassword.length >= 6)
const isPasswordMatch = computed(() => form.value.newPassword === form.value.confirmPassword)

const canSendCode = computed(() => isEmailValid.value && !isSendingCode.value && countdown.value <= 0)
const canSubmit = computed(() => 
  isCodeValid.value && 
  isPasswordValid.value && 
  isPasswordMatch.value && 
  !isLoading.value
)

// 发送验证码
async function handleSendCode() {
  if (!canSendCode.value) return
  
  isSendingCode.value = true
  error.value = ''
  
  try {
    await sendCode({ target: form.value.email, type: 3 }) // 3 = 重置密码
    success.value = t.value.forgot?.codeSent || '验证码已发送到您的邮箱'
    step.value = 2
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

// 重置密码
async function handleSubmit() {
  if (!canSubmit.value) return
  
  isLoading.value = true
  error.value = ''
  success.value = ''
  
  try {
    await resetPassword({
      email: form.value.email,
      code: form.value.code,
      new_password: form.value.newPassword
    })
    success.value = t.value.forgot?.success || '密码重置成功'
    // 延迟跳转到登录页
    setTimeout(() => {
      router.push('/login')
    }, 1500)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '重置密码失败'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="h-full w-full flex items-center justify-center bg-[var(--vpn-bg)] relative titlebar-drag" data-tauri-drag-region>
    <div
      class="w-full max-w-[340px] bg-white/60 dark:bg-black/40 backdrop-blur-2xl border border-white/20 dark:border-white/5 shadow-2xl rounded-2xl p-8 titlebar-no-drag">
      <h2 class="text-xl font-semibold text-center text-[var(--vpn-text)] mb-2">
        {{ t.forgot?.title || 'Reset Password' }}
      </h2>
      <p class="text-[12px] text-center text-[var(--vpn-text-secondary)] mb-6">
        {{ step === 1 
          ? (t.forgot?.subtitle || 'Enter your email to receive reset code') 
          : (t.forgot?.step2 || 'Enter the code and set new password') 
        }}
      </p>

      <!-- 错误/成功提示 -->
      <div v-if="error" class="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
        {{ error }}
      </div>
      <div v-if="success" class="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs">
        {{ success }}
      </div>

      <!-- 步骤1：输入邮箱 -->
      <form v-if="step === 1" @submit.prevent="handleSendCode" class="space-y-4">
        <input 
          v-model="form.email"
          type="email" 
          :placeholder="t.forgot?.email || 'Email'"
          class="w-full px-4 py-2.5 rounded-lg bg-white/50 dark:bg-white/5 border border-black/5 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-[13px] text-[var(--vpn-text)] transition-all" 
        />

        <button 
          type="submit"
          :disabled="!canSendCode"
          class="w-full py-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-[13px] font-medium shadow-md shadow-orange-500/20 transition-all active:scale-95"
        >
          {{ isSendingCode ? (t.common?.loading || 'Loading...') : (t.forgot?.sendCode || 'Send Code') }}
        </button>
      </form>

      <!-- 步骤2：输入验证码和新密码 -->
      <form v-else @submit.prevent="handleSubmit" class="space-y-4">
        <!-- 显示邮箱（只读） -->
        <div class="px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-white/5 text-[13px] text-[var(--vpn-text-secondary)]">
          {{ form.email }}
        </div>
        
        <!-- 验证码 -->
        <div class="flex gap-2">
          <input 
            v-model="form.code"
            type="text" 
            maxlength="6"
            :placeholder="t.forgot?.code || 'Verification Code'"
            class="flex-1 px-4 py-2.5 rounded-lg bg-white/50 dark:bg-white/5 border border-black/5 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-[13px] text-[var(--vpn-text)] transition-all" 
          />
          <button 
            type="button"
            :disabled="!canSendCode"
            @click="handleSendCode"
            class="px-4 py-2.5 rounded-lg bg-orange-500/80 hover:bg-orange-500 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-[12px] font-medium transition-all whitespace-nowrap"
          >
            {{ countdown > 0 ? `${countdown}s` : (t.forgot?.resend || 'Resend') }}
          </button>
        </div>
        
        <!-- 新密码 -->
        <input 
          v-model="form.newPassword"
          type="password" 
          :placeholder="t.forgot?.newPassword || 'New Password (min 6 chars)'"
          class="w-full px-4 py-2.5 rounded-lg bg-white/50 dark:bg-white/5 border border-black/5 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-[13px] text-[var(--vpn-text)] transition-all" 
        />
        
        <!-- 确认密码 -->
        <input 
          v-model="form.confirmPassword"
          type="password" 
          :placeholder="t.forgot?.confirmPassword || 'Confirm Password'"
          class="w-full px-4 py-2.5 rounded-lg bg-white/50 dark:bg-white/5 border border-black/5 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-orange-500/50 text-[13px] text-[var(--vpn-text)] transition-all" 
        />
        
        <!-- 密码不匹配提示 -->
        <p v-if="form.confirmPassword && !isPasswordMatch" class="text-red-500 text-[11px]">
          {{ t.forgot?.passwordMismatch || 'Passwords do not match' }}
        </p>

        <button 
          type="submit"
          :disabled="!canSubmit"
          class="w-full py-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-[13px] font-medium shadow-md shadow-orange-500/20 transition-all active:scale-95"
        >
          {{ isLoading ? (t.common?.loading || 'Loading...') : (t.forgot?.submit || 'Reset Password') }}
        </button>
      </form>

      <div class="mt-6 text-center text-[11px]">
        <router-link to="/login" class="text-[var(--vpn-text-secondary)] hover:text-[var(--vpn-text)]">
          ← {{ t.forgot?.backToLogin || 'Back to Login' }}
        </router-link>
      </div>
    </div>
  </div>
</template>
