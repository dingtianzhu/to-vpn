// src/stores/auth.ts - Token 刷新逻辑修复 + 安全存储

import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getItem, setItem, removeItem } from "@/utils/storage";
import {
  secureGet,
  secureSet,
  SECURE_KEYS,
  clearTokens,
} from "@/utils/secureStorage";
import { login, logout as logoutApi } from "@/api/auth";
import type { User } from "@/types/login";
import { refreshAccessToken, updateCachedToken } from "@/utils/request";
import { useVpnStore } from "@/stores/vpn";
import {
  isAdmin as checkIsAdmin,
  isVip as checkIsVip,
  getUserLimitType,
} from "@/types/login";
import { getUserProfile } from "@/api/user";

// Storage Keys (用户信息仍用 localStorage，不敏感)
const USER_KEY = "user_info";

// 旧的 localStorage keys（用于迁移）
const LEGACY_TOKEN_KEY = "access_token";
const LEGACY_REFRESH_TOKEN_KEY = "refresh_token";
const LEGACY_TOKEN_EXPIRE_KEY = "token_expire_at";

// Token 刷新阈值（提前5分钟刷新）
const REFRESH_THRESHOLD = 5 * 60 * 1000;

// 头像颜色池
const AVATAR_COLORS = [
  "bg-gradient-to-br from-red-400 to-pink-500",
  "bg-gradient-to-br from-orange-400 to-amber-500",
  "bg-gradient-to-br from-emerald-400 to-teal-500",
  "bg-gradient-to-br from-blue-400 to-indigo-500",
  "bg-gradient-to-br from-purple-400 to-violet-500",
  "bg-gradient-to-br from-pink-400 to-rose-500",
];

// 普通用户限制
const USER_DAILY_TRAFFIC_LIMIT = 1 * 1024 * 1024 * 1024;
const USER_DAILY_TIME_LIMIT = 2 * 60 * 60;

export const useAuthStore = defineStore("auth", () => {
  // ============ State ============
  const currentUser = ref<User | null>(getItem(USER_KEY, null));
  // Token 现在使用安全存储，初始值为空，通过 initializeTokens() 异步加载
  const accessToken = ref<string>("");
  const refreshToken = ref<string>("");
  const tokenExpireAt = ref<number>(0);
  const isLoading = ref(false);
  const loginError = ref<string | null>(null);
  const pendingAutoConnect = ref(false);
  const isRefreshing = ref(false);
  const isTokensLoaded = ref(false); // 标记 token 是否已从安全存储加载

  // ⚠️ 修复：使用 Map 而不是单个 Promise，支持并发刷新请求
  const refreshPromises = new Map<string, Promise<boolean>>();

  // ⚠️ 新增：自动刷新定时器
  let autoRefreshTimer: number | null = null;

  // ============ Getters ============
  const isTokenValid = computed(() => {
    if (!accessToken.value) return false;
    if (tokenExpireAt.value && Date.now() > tokenExpireAt.value) return false;
    return true;
  });

  const isTokenExpiringSoon = computed(() => {
    if (!accessToken.value || !tokenExpireAt.value) return false;
    return Date.now() > tokenExpireAt.value - REFRESH_THRESHOLD;
  });

  const isAuthenticated = computed(() => {
    return !!currentUser.value && isTokenValid.value;
  });

  const needsLogin = computed(() => !isAuthenticated.value);
  const isAdmin = computed(() => checkIsAdmin(currentUser.value));
  const isVip = computed(() => checkIsVip(currentUser.value));
  const limitType = computed(() => getUserLimitType(currentUser.value));
  const hasConnectionLimit = computed(() => limitType.value === "user");

  const dailyTrafficLimit = computed(() => {
    if (limitType.value === "none") return 0;
    if (limitType.value === "vip") return 0;
    return currentUser.value?.daily_traffic_limit || USER_DAILY_TRAFFIC_LIMIT;
  });

  const dailyTimeLimit = computed(() => {
    if (limitType.value === "none") return 0;
    if (limitType.value === "vip") return 0;
    return currentUser.value?.daily_time_limit || USER_DAILY_TIME_LIMIT;
  });

  const vipExpireDisplay = computed(() => {
    if (!currentUser.value?.vip_expire_at) return null;
    const expireDate = new Date(currentUser.value.vip_expire_at);
    if (expireDate < new Date()) return "Expired";
    return expireDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  });

  const vipDaysRemaining = computed(() => {
    if (!currentUser.value?.vip_expire_at) return 0;
    const expireDate = new Date(currentUser.value.vip_expire_at);
    const now = new Date();
    if (expireDate < now) return 0;
    return Math.ceil(
      (expireDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
  });

  const displayName = computed(() => {
    if (!currentUser.value) return "Guest";
    return currentUser.value.nickname || currentUser.value.username || "User";
  });

  const userEmail = computed(() => currentUser.value?.email || "");

  const avatarColor = computed(() => {
    const name = currentUser.value?.username || "G";
    return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  });

  const avatarLetter = computed(() => {
    const name =
      currentUser.value?.nickname || currentUser.value?.username || "G";
    return name.charAt(0).toUpperCase();
  });

  const membershipLevel = computed(() => {
    if (!currentUser.value) return "Guest";
    if (isAdmin.value) return "Administrator";
    if (isVip.value) return "Pro Member";
    return "Free";
  });

  const membershipClass = computed(() => {
    switch (membershipLevel.value) {
      case "Administrator":
        return "text-purple-500 bg-purple-500/10";
      case "Pro Member":
        return "text-emerald-500 bg-emerald-500/10";
      default:
        return "text-slate-500 bg-slate-500/10";
    }
  });

  const memberSince = computed(() => {
    if (!currentUser.value?.created_at) return null;
    return new Date(currentUser.value.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
  });

  // ============ 自动刷新定时器 ============
  function startAutoRefreshTimer() {
    stopAutoRefreshTimer();

    // 每分钟检查一次
    autoRefreshTimer = window.setInterval(() => {
      if (isTokenExpiringSoon.value && refreshToken.value) {
        console.log("Auto-refreshing token...");
        doRefreshToken();
      }
    }, 60 * 1000);
  }

  function stopAutoRefreshTimer() {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }
  }

  // ============ Token 初始化（从安全存储加载）============
  async function initializeTokens(): Promise<void> {
    if (isTokensLoaded.value) return;

    try {
      // 先尝试从安全存储加载
      let token = await secureGet(SECURE_KEYS.ACCESS_TOKEN, "");
      let refresh = await secureGet(SECURE_KEYS.REFRESH_TOKEN, "");
      let expireAt = await secureGet(SECURE_KEYS.TOKEN_EXPIRE_AT, 0);

      // 如果安全存储为空，尝试从旧的 localStorage 迁移
      if (!token) {
        const legacyToken = getItem(LEGACY_TOKEN_KEY, "");
        const legacyRefresh = getItem(LEGACY_REFRESH_TOKEN_KEY, "");
        const legacyExpire = getItem(LEGACY_TOKEN_EXPIRE_KEY, 0);

        if (legacyToken) {
          console.log("Migrating tokens from localStorage to secure storage...");
          token = legacyToken;
          refresh = legacyRefresh;
          expireAt = legacyExpire;

          // 保存到安全存储
          await secureSet(SECURE_KEYS.ACCESS_TOKEN, token);
          await secureSet(SECURE_KEYS.REFRESH_TOKEN, refresh);
          await secureSet(SECURE_KEYS.TOKEN_EXPIRE_AT, expireAt);

          // 清除旧的 localStorage 数据
          removeItem(LEGACY_TOKEN_KEY);
          removeItem(LEGACY_REFRESH_TOKEN_KEY);
          removeItem(LEGACY_TOKEN_EXPIRE_KEY);

          console.log("✓ Token migration completed");
        }
      }

      accessToken.value = token;
      refreshToken.value = refresh;
      tokenExpireAt.value = expireAt;
      isTokensLoaded.value = true;

      // 同步到 request.ts 的内存缓存
      if (token) {
        updateCachedToken(token);
      }

      // 如果已登录，启动自动刷新
      if (token && currentUser.value) {
        startAutoRefreshTimer();
      }
    } catch (e) {
      console.error("Failed to initialize tokens:", e);
      isTokensLoaded.value = true; // 即使失败也标记为已加载，避免重复尝试
    }
  }

  // ============ Actions ============
  async function doLogin(account: string, password: string): Promise<boolean> {
    if (isLoading.value) return false;

    isLoading.value = true;
    loginError.value = null;

    try {
      const res = await login({ account, password });

      if (!res || !res.user) {
        throw new Error("Invalid response");
      }

      const expireAt = Date.now() + res.expires_in * 1000;

      currentUser.value = res.user;
      accessToken.value = res.access_token;
      refreshToken.value = res.refresh_token;
      tokenExpireAt.value = expireAt;

      // 用户信息存 localStorage（不敏感）
      setItem(USER_KEY, res.user);
      
      // Token 存安全存储
      await secureSet(SECURE_KEYS.ACCESS_TOKEN, res.access_token);
      await secureSet(SECURE_KEYS.REFRESH_TOKEN, res.refresh_token);
      await secureSet(SECURE_KEYS.TOKEN_EXPIRE_AT, expireAt);

      // 同步到 request.ts 的内存缓存
      updateCachedToken(res.access_token);

      pendingAutoConnect.value = true;

      // ⚠️ 修复：登录成功后启动自动刷新
      startAutoRefreshTimer();

      return true;
    } catch (e) {
      loginError.value = e instanceof Error ? e.message : "Login failed";
      console.error("Login error:", e);
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  // ⚠️ 修复：改进 Token 刷新逻辑
  async function doRefreshToken(): Promise<boolean> {
    const currentRefreshToken = refreshToken.value;

    if (!currentRefreshToken) {
      console.warn("No refresh token available");
      logout();
      return false;
    }

    // 使用 refresh token 作为 key，避免重复刷新
    const existingPromise = refreshPromises.get(currentRefreshToken);
    if (existingPromise) {
      console.log("Waiting for existing refresh promise...");
      return existingPromise;
    }

    isRefreshing.value = true;

    const promise = (async () => {
      try {
        const newAccessToken = await refreshAccessToken();

        if (!newAccessToken) {
          throw new Error("Invalid refresh response");
        }

        // 从安全存储重新读取最新的 refresh_token 和 expireAt
        const newRefreshToken = await secureGet(SECURE_KEYS.REFRESH_TOKEN, "");
        const expireAt = await secureGet(SECURE_KEYS.TOKEN_EXPIRE_AT, 0);

        accessToken.value = newAccessToken;
        refreshToken.value = newRefreshToken;
        tokenExpireAt.value = expireAt;

        // 同步到 request.ts 的内存缓存
        updateCachedToken(newAccessToken);

        console.log("✓ Token refreshed successfully");
        return true;
      } catch (e) {
        console.error("Token refresh failed:", e);
        logout();
        return false;
      } finally {
        isRefreshing.value = false;
        refreshPromises.delete(currentRefreshToken);
      }
    })();

    refreshPromises.set(currentRefreshToken, promise);
    return promise;
  }

  async function checkAndRefreshToken(): Promise<boolean> {
    // Token 有效且未即将过期
    if (isTokenValid.value && !isTokenExpiringSoon.value) {
      return true;
    }

    // Token 即将过期或已过期，尝试刷新
    if (refreshToken.value) {
      return doRefreshToken();
    }

    // 无 refresh token，需要重新登录
    logout();
    return false;
  }

  async function clearAuthState() {
    currentUser.value = null;
    accessToken.value = "";
    refreshToken.value = "";
    tokenExpireAt.value = 0;
    loginError.value = null;
    pendingAutoConnect.value = false;
    await removeLoginInfo();

    // 清除 request.ts 的内存缓存
    updateCachedToken("");

    // ⚠️ 修复：清理状态时停止自动刷新
    stopAutoRefreshTimer();
    refreshPromises.clear();
  }

  async function logout() {
    const vpnStore = useVpnStore();

    // 先断开 VPN
    if (vpnStore.isConnected) {
      try {
        await vpnStore.disconnect();
      } catch (e) {
        console.error("Failed to disconnect VPN on logout:", e);
      }
    }

    // 调用后端登出
    try {
      await logoutApi();
    } catch (e) {
      console.error("API logout failed:", e);
    } finally {
      await clearAuthState();
    }
  }

  async function removeLoginInfo() {
    // 清除用户信息（localStorage）
    removeItem(USER_KEY);
    // 清除 Token（安全存储）
    await clearTokens();
    // 清除可能残留的旧 localStorage token
    removeItem(LEGACY_TOKEN_KEY);
    removeItem(LEGACY_REFRESH_TOKEN_KEY);
    removeItem(LEGACY_TOKEN_EXPIRE_KEY);
  }

  function updateUser(userData: Partial<User>) {
    if (currentUser.value) {
      currentUser.value = { ...currentUser.value, ...userData };
      setItem(USER_KEY, currentUser.value);
    }
  }

  function consumeAutoConnect(): boolean {
    if (pendingAutoConnect.value) {
      pendingAutoConnect.value = false;
      return true;
    }
    return false;
  }

  /**
   * 设置待连接标志
   * 用于登录后自动连接 VPN
   */
  function setPendingConnect(value: boolean) {
    pendingAutoConnect.value = value;
  }

  /**
   * 刷新用户信息
   * 从服务器获取最新的用户数据并更新本地状态
   */
  async function refreshUserInfo(): Promise<boolean> {
    if (!accessToken.value) {
      console.warn("Cannot refresh user info: not authenticated");
      return false;
    }

    try {
      const user = await getUserProfile();
      if (user) {
        currentUser.value = user;
        setItem(USER_KEY, user);
        console.log("✓ User info refreshed successfully");
        return true;
      }
      return false;
    } catch (e) {
      console.error("Failed to refresh user info:", e);
      return false;
    }
  }

  // ⚠️ 新增：初始化函数（异步加载 token）
  async function initialize() {
    await initializeTokens();
  }

  // 注意：不再自动初始化，需要在 App.vue 中手动调用 initialize()
  // 因为安全存储是异步的

  return {
    // State
    currentUser,
    accessToken,
    refreshToken,
    isLoading,
    loginError,
    pendingAutoConnect,
    isRefreshing,
    isTokensLoaded,

    // Getters
    isTokenValid,
    isTokenExpiringSoon,
    isAuthenticated,
    needsLogin,
    isAdmin,
    isVip,
    limitType,
    hasConnectionLimit,
    dailyTrafficLimit,
    dailyTimeLimit,
    vipExpireDisplay,
    vipDaysRemaining,
    displayName,
    userEmail,
    avatarColor,
    avatarLetter,
    membershipLevel,
    membershipClass,
    memberSince,

    // Actions
    initialize,
    initializeTokens,
    doLogin,
    doRefreshToken,
    checkAndRefreshToken,
    logout,
    updateUser,
    consumeAutoConnect,
    setPendingConnect,
    refreshUserInfo,
  };
});
