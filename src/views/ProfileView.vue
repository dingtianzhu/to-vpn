<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useI18nStore } from '@/stores/i18n'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useNotification } from '@/composables/useNotification'
import { getUserUsage, uploadAvatar, updateUserProfile, type UsageStats } from '@/api/user'
import { getSubscription } from '@/api/plan'
import type { Subscription } from '@/types/plan'
import { SubscriptionStatus } from '@/types/plan'

const router = useRouter()
const authStore = useAuthStore()
const { t } = storeToRefs(useI18nStore())
const notification = useNotification()
const usageStats = ref<UsageStats | null>(null)
const subscription = ref<Subscription | null>(null)
const isLoadingSubscription = ref(false)
const {
  currentUser,
  avatarColor,
  avatarLetter,
  displayName,
  userEmail,
  membershipLevel,
  membershipClass,
  memberSince,
  isVip,
  vipExpireDisplay,
  vipDaysRemaining,
  isAdmin,
} = storeToRefs(authStore)

// 编辑状态
const isEditing = ref(false)
const isSaving = ref(false)
const isUploadingAvatar = ref(false)
// 编辑表单
const editForm = ref({
  nickname: '',
  email: '',
  avatar: '',
})

// 初始化编辑表单
function initEditForm() {
  editForm.value = {
    nickname: currentUser.value?.nickname || '',
    email: currentUser.value?.email || '',
    avatar: currentUser.value?.avatar || '',
  }
}

// 监听用户变化，同步表单
watch(currentUser, () => {
  if (!isEditing.value) {
    initEditForm()
  }
}, { immediate: true })

// 开始编辑
function startEditing() {
  initEditForm()
  isEditing.value = true
}

// 取消编辑
function cancelEditing() {
  isEditing.value = false
  initEditForm()
}

// 保存编辑
async function saveProfile() {
  isSaving.value = true

  try {
    // 调用 API 保存用户信息
    await updateUserProfile({
      nickname: editForm.value.nickname,
      email: editForm.value.email,
    })

    // 更新本地状态
    authStore.updateUser({
      nickname: editForm.value.nickname,
      email: editForm.value.email,
      avatar: editForm.value.avatar,
    })

    isEditing.value = false
    notification.success(t.value.profile.profileUpdated)
  } catch (e) {
    notification.error(t.value.profile.updateFailed)
  } finally {
    isSaving.value = false
  }
}

// 头像上传
async function handleAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  // 基本校验：类型 & 大小
  if (!file.type.startsWith('image/')) {
    notification.warning(t.value.profile.onlyImages)
    input.value = ''
    return
  }
  if (file.size > 2 * 1024 * 1024) { // 2MB
    notification.warning(t.value.profile.maxSize)
    input.value = ''
    return
  }

  // 可选：先本地预览，避免等待时空白
  const reader = new FileReader()
  reader.onload = (e) => {
    editForm.value.avatar = e.target?.result as string
  }
  reader.readAsDataURL(file)

  isUploadingAvatar.value = true
  try {
    // 调后端上传接口
    const { url } = await uploadAvatar(file)

    // 用后端返回的 URL 覆盖为正式地址
    editForm.value.avatar = url

    // 立即同步到当前用户 & 后端，避免等到点 Save
    authStore.updateUser({ avatar: url })
    await updateUserProfile({ avatar: url })

    notification.success(t.value.profile.avatarUpdated)
  } catch (e) {
    console.error('Avatar upload failed', e)
    notification.error(t.value.profile.avatarUploadFailed)
  } finally {
    isUploadingAvatar.value = false
    input.value = ''
  }
}

// 复制到剪贴板
function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
  notification.success('已复制到剪贴板')
}

// 登出
function handleLogout() {
  authStore.logout()
  router.push('/login')
}
// 挂载时拉一次今日用量和订阅信息
onMounted(async () => {
  if (currentUser.value) {
    // 并行加载使用统计和订阅信息
    const loadUsage = async () => {
      try {
        usageStats.value = await getUserUsage()
      } catch (e) {
        console.error('Failed to load usage stats', e)
      }
    }
    
    const loadSubscription = async () => {
      isLoadingSubscription.value = true
      try {
        subscription.value = await getSubscription()
      } catch (e) {
        console.error('Failed to load subscription', e)
      } finally {
        isLoadingSubscription.value = false
      }
    }
    
    await Promise.all([loadUsage(), loadSubscription()])
  }
})

// 订阅状态文本
const subscriptionStatusText = computed(() => {
  if (!subscription.value) return ''
  switch (subscription.value.status) {
    case SubscriptionStatus.Active:
      return '有效'
    case SubscriptionStatus.Expired:
      return '已过期'
    case SubscriptionStatus.Cancelled:
      return '已取消'
    default:
      return '未知'
  }
})

// 订阅到期日期格式化
const subscriptionExpireDate = computed(() => {
  if (!subscription.value?.expire_date) return null
  return new Date(subscription.value.expire_date).toLocaleDateString('zh-CN')
})

// 配额限制 - 优先从订阅信息获取，否则从用户信息获取
const quotaLimits = computed(() => {
  // 优先使用订阅信息中的限制
  if (subscription.value) {
    return {
      trafficLimit: subscription.value.traffic_limit,
      timeLimit: subscription.value.time_limit
    }
  }
  // 否则使用用户信息中的限制
  return {
    trafficLimit: currentUser.value?.daily_traffic_limit ?? 1 * 1024 * 1024 * 1024, // 默认 1GB
    timeLimit: currentUser.value?.daily_time_limit ?? 2 * 60 * 60 // 默认 2小时
  }
})

// 使用量百分比（普通用户显示）
const usagePercent = computed(() => {
  if (!usageStats.value) return 0
  const { traffic_used } = usageStats.value
  const { trafficLimit } = quotaLimits.value
  if (!trafficLimit || trafficLimit <= 0) return 0 // 无限时显示 0% 或直接隐藏
  return Math.min(100, Math.round((traffic_used / trafficLimit) * 100))
})

// 格式化流量
function formatTraffic(bytes: number): string {
  if (bytes <= 0) return '无限制'
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(0)} MB`
}

// 格式化时长
function formatTime(seconds: number): string {
  if (seconds <= 0) return '无限制'
  const hours = seconds / 3600
  if (hours >= 1) return `${hours.toFixed(0)} 小时`
  const minutes = seconds / 60
  return `${minutes.toFixed(0)} 分钟`
}
</script>

<template>
  <div class="h-full flex flex-col bg-[var(--vpn-bg)] overflow-y-auto">
    <!-- macOS 风格头部 -->
    <div class="px-6 pt-8 pb-4 titlebar-drag">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold tracking-tight text-[var(--vpn-text)]">{{ t.profile.title }}</h1>
        <button v-if="!isEditing" @click="startEditing"
          class="px-3 py-1.5 text-[12px] font-medium text-[var(--vpn-primary)] hover:bg-[var(--vpn-primary)]/10 rounded-lg transition-colors titlebar-no-drag">
          {{ t.profile.editProfile }}
        </button>
      </div>
    </div>

    <div class="flex-1 px-6 pb-8 space-y-6">
      <!-- Profile Card -->
      <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-2xl shadow-sm overflow-hidden">
        <!-- Header Background -->
        <div class="h-20 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 relative">
          <div class="absolute inset-0 backdrop-blur-3xl"></div>
        </div>

        <!-- Avatar & Basic Info -->
        <div class="px-6 pb-6">
          <div class="flex items-end gap-4 -mt-10 relative z-10">
            <!-- Avatar -->
            <div class="relative group">
              <div
                class="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold text-white shadow-xl ring-4 ring-[var(--vpn-card)]"
                :class="[currentUser?.avatar ? '' : avatarColor]">
                <img v-if="currentUser?.avatar || editForm.avatar"
                  :src="isEditing ? editForm.avatar : currentUser?.avatar"
                  class="w-full h-full rounded-2xl object-cover" />
                <span v-else>{{ avatarLetter }}</span>
              </div>

              <!-- 编辑时显示上传按钮 -->
              <label v-if="isEditing"
                class="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <svg v-if="!isUploadingAvatar" class="w-6 h-6 text-white" fill="none" stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span v-else class="w-5 h-5 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
                <input type="file" accept="image/*" class="hidden" @change="handleAvatarChange" />
              </label>

            </div>

            <!-- Name & Email -->
            <div class="flex-1 pb-1">
              <template v-if="isEditing">
                <input v-model="editForm.nickname" type="text" :placeholder="t.profile.nickname"
                  class="w-full text-xl font-semibold bg-transparent border-b border-[var(--vpn-border)] focus:border-[var(--vpn-primary)] outline-none text-[var(--vpn-text)] pb-1 mb-1" />
                <input v-model="editForm.email" type="email" :placeholder="t.profile.email"
                  class="w-full text-[13px] bg-transparent border-b border-[var(--vpn-border)] focus:border-[var(--vpn-primary)] outline-none text-[var(--vpn-text-secondary)] pb-1" />
              </template>
              <template v-else>
                <h2 class="text-xl font-semibold text-[var(--vpn-text)]">{{ displayName }}</h2>
                <p class="text-[13px] text-[var(--vpn-text-secondary)]">{{ userEmail }}</p>
              </template>
            </div>

            <!-- Membership Badge -->
            <div class="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider" :class="membershipClass">
              {{ membershipLevel }}
            </div>
          </div>

          <!-- 编辑模式操作按钮 -->
          <div v-if="isEditing" class="flex gap-3 mt-6">
            <button @click="cancelEditing"
              class="flex-1 py-2 rounded-xl border border-[var(--vpn-border)] text-[var(--vpn-text-secondary)] hover:bg-[var(--vpn-card-hover)] text-[13px] font-medium transition-colors">
              {{ t.profile.cancel }}
            </button>
            <button @click="saveProfile" :disabled="isSaving"
              class="flex-1 py-2 rounded-xl bg-[var(--vpn-primary)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2">
              <span v-if="isSaving"
                class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              {{ isSaving ? t.profile.saving : t.profile.saveChanges }}
            </button>
          </div>
        </div>
      </div>

      <!-- Membership Info -->
      <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-2xl shadow-sm p-5">
        <h3 class="text-[11px] font-bold text-[var(--vpn-muted)] uppercase tracking-wider mb-4">
          {{ t.profile.membership }}
        </h3>

        <div class="grid grid-cols-2 gap-4">
          <!-- Plan -->
          <div class="bg-[var(--vpn-bg)] rounded-xl p-4 border border-[var(--vpn-border)]">
            <div class="flex items-center gap-2 mb-2">
              <div class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </div>
              <span class="text-[11px] text-[var(--vpn-text-secondary)] uppercase tracking-wider">{{ t.profile.plan
              }}</span>
            </div>
            <p class="text-[15px] font-semibold"
              :class="isVip || isAdmin ? 'text-emerald-500' : 'text-[var(--vpn-text)]'">
              {{ membershipLevel }}
            </p>
          </div>

          <!-- Expires / Status -->
          <div class="bg-[var(--vpn-bg)] rounded-xl p-4 border border-[var(--vpn-border)]">
            <div class="flex items-center gap-2 mb-2">
              <div class="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span class="text-[11px] text-[var(--vpn-text-secondary)] uppercase tracking-wider">
                {{ isAdmin ? t.profile.status : t.profile.expires }}
              </span>
            </div>
            <p class="text-[15px] font-semibold text-[var(--vpn-text)]">
              {{ isAdmin ? t.profile.unlimited : (subscriptionExpireDate || vipExpireDisplay || 'N/A') }}
            </p>
          </div>
        </div>

        <!-- 订阅详情（有订阅时显示） -->
        <div v-if="subscription" class="mt-4 grid grid-cols-2 gap-4">
          <!-- 订阅状态 -->
          <div class="bg-[var(--vpn-bg)] rounded-xl p-3 border border-[var(--vpn-border)]">
            <span class="text-[10px] text-[var(--vpn-text-secondary)] uppercase">订阅状态</span>
            <p class="text-[13px] font-medium mt-1" :class="{
              'text-emerald-500': subscription.status === 1,
              'text-amber-500': subscription.status === 2,
              'text-red-500': subscription.status === 3
            }">{{ subscriptionStatusText }}</p>
          </div>
          <!-- 配额限制 -->
          <div class="bg-[var(--vpn-bg)] rounded-xl p-3 border border-[var(--vpn-border)]">
            <span class="text-[10px] text-[var(--vpn-text-secondary)] uppercase">每日配额</span>
            <p class="text-[13px] font-medium text-[var(--vpn-text)] mt-1">
              {{ formatTraffic(quotaLimits.trafficLimit) }} / {{ formatTime(quotaLimits.timeLimit) }}
            </p>
          </div>
        </div>

        <!-- VIP Days Remaining (仅VIP显示) -->
        <div v-if="isVip && vipDaysRemaining > 0"
          class="mt-4 p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
          <div class="flex items-center justify-between">
            <span class="text-[12px] text-emerald-600 dark:text-emerald-400">{{ t.profile.daysRemaining }}</span>
            <span class="text-[14px] font-bold text-emerald-600 dark:text-emerald-400">{{ vipDaysRemaining }}
              {{ t.profile.days }}</span>
          </div>
        </div>

        <!-- 普通用户显示今日使用量 -->
        <div v-if="!isVip && !isAdmin" class="mt-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[11px] text-[var(--vpn-text-secondary)]">{{ t.profile.todayUsage }}</span>
            <span class="text-[11px] text-[var(--vpn-text-secondary)]">{{ usagePercent }}%</span>
          </div>
          <div class="h-2 bg-[var(--vpn-bg)] rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all duration-500"
              :class="usagePercent > 80 ? 'bg-amber-500' : 'bg-emerald-500'" :style="{ width: `${usagePercent}%` }">
            </div>
          </div>
          <p class="text-[10px] text-[var(--vpn-muted)] mt-2">
            {{ t.profile.freePlanLimit }} <span class="text-[var(--vpn-primary)] cursor-pointer hover:underline">{{
              t.profile.upgradeToPro }}</span>
          </p>
        </div>
      </div>

      <!-- Account Details -->
      <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-2xl shadow-sm overflow-hidden">
        <h3 class="text-[11px] font-bold text-[var(--vpn-muted)] uppercase tracking-wider px-5 pt-5 pb-3">
          {{ t.profile.accountDetails }}
        </h3>

        <div class="divide-y divide-[var(--vpn-border)]">
          <!-- Username -->
          <div class="flex items-center justify-between px-5 py-3.5">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-slate-500/10 flex items-center justify-center">
                <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <p class="text-[11px] text-[var(--vpn-text-secondary)]">{{ t.profile.username }}</p>
                <p class="text-[13px] font-medium text-[var(--vpn-text)]">{{ currentUser?.username }}</p>
              </div>
            </div>
            <span class="text-[10px] text-[var(--vpn-muted)] bg-[var(--vpn-bg)] px-2 py-1 rounded">{{
              t.profile.cannotChange
            }}</span>
          </div>

          <!-- UUID -->
          <div class="flex items-center justify-between px-5 py-3.5">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <svg class="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              </div>
              <div>
                <p class="text-[11px] text-[var(--vpn-text-secondary)]">{{ t.profile.userId }}</p>
                <p class="text-[13px] font-mono text-[var(--vpn-text)] truncate max-w-[180px]">
                  {{ currentUser?.uuid?.substring(0, 8) }}...
                </p>
              </div>
            </div>
            <button @click="copyToClipboard(currentUser?.uuid || '')"
              class="text-[11px] text-[var(--vpn-primary)] hover:underline">
              {{ t.profile.copy }}
            </button>
          </div>

          <!-- Member Since -->
          <div class="flex items-center gap-3 px-5 py-3.5">
            <div class="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <svg class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p class="text-[11px] text-[var(--vpn-text-secondary)]">{{ t.profile.memberSince }}</p>
              <p class="text-[13px] font-medium text-[var(--vpn-text)]">{{ memberSince || t.profile.unknown }}</p>
            </div>
          </div>

          <!-- Roles -->
          <div class="flex items-center gap-3 px-5 py-3.5">
            <div class="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div class="flex-1">
              <p class="text-[11px] text-[var(--vpn-text-secondary)]">{{ t.profile.roles }}</p>
              <div class="flex gap-1.5 mt-1 flex-wrap">
                <span v-for="role in currentUser?.roles" :key="role"
                  class="px-2 py-0.5 text-[10px] font-medium rounded-full" :class="{
                    'bg-purple-500/10 text-purple-500': role === 'super_admin',
                    'bg-blue-500/10 text-blue-500': role === 'admin',
                    'bg-emerald-500/10 text-emerald-500': role === 'vip',
                    'bg-slate-500/10 text-slate-500': role === 'user',
                  }">
                  {{ role }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-2xl shadow-sm p-5">
        <h3 class="text-[11px] font-bold text-red-500 uppercase tracking-wider mb-4">
          {{ t.profile.dangerZone }}
        </h3>

        <button @click="handleLogout"
          class="w-full py-2.5 rounded-xl border border-red-200 dark:border-red-900/30 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors text-[13px] font-medium flex items-center justify-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          {{ t.profile.signOut }}
        </button>
      </div>

      <!-- Version -->
      <div class="text-center pb-4">
        <p class="text-[10px] text-[var(--vpn-muted)]">ToVPN v1.0.0</p>
      </div>
    </div>
  </div>
</template>