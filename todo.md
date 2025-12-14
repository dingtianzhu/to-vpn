非常棒！这份接口文档已经非常规范且完整，涵盖了从认证、用户、角色到权限管理的全部核心功能。

现在，我将基于这份文档，指导你如何改造现有的 Tauri 客户端。

**改造目标：**
1.  **彻底移除本地数据库逻辑**：删除 Rust 端的 `db.rs` 和 `sqlx` 依赖。
2.  **工程化前端结构**：
    *   建立标准的 API 封装层 (`src/api/`)。
    *   建立统一的请求拦截器 (`src/utils/request.ts`)。
    *   改造 Store 以使用 API。
3.  **对接后端**：实现真实的登录、获取用户信息、获取服务器节点逻辑。

---

### 第一步：清理 Rust 后端 (移除本地数据库)

**操作**：
1.  删除 `src-tauri/src/db.rs`。
2.  修改 `src-tauri/src/vpn.rs`，移除所有 `db_*` 相关的命令。
3.  修改 `src-tauri/src/lib.rs`，移除 `db::init_db()` 调用和注册的命令。
4.  修改 `src-tauri/Cargo.toml`，移除 `sqlx` 和 `tokio` (如果只为了 db 使用) 依赖。

**修改后的 `src-tauri/src/lib.rs` (极简版)**：

```rust
mod vpn;

use std::sync::Mutex;
use vpn::VpnState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            app.manage(VpnState {
                child: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vpn::connect_hysteria,
            vpn::disconnect_vpn,
            vpn::check_helper_status,
            vpn::install_helper,
            vpn::uninstall_helper
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

### 第二步：前端工程化 - 网络层封装

我们将使用 `axios` 或 `tauri-plugin-http`（推荐 axios 用于 Web 开发习惯）。

1.  **安装 axios**：`pnpm add axios`
2.  **创建 `src/utils/request.ts`**：

```typescript
import axios from 'axios';
import { useAuthStore } from '@/stores/auth';
import { useNotification } from '@/composables/useNotification';

// 基础配置
const service = axios.create({
  baseURL: 'http://localhost:8080/api/v1', // 你的后端地址
  timeout: 10000,
});

// 请求拦截器
service.interceptors.request.use(
  (config) => {
    const authStore = useAuthStore();
    if (authStore.token) {
      config.headers['Authorization'] = `Bearer ${authStore.token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
service.interceptors.response.use(
  (response) => {
    const res = response.data;
    // 约定 code 0 为成功
    if (res.code !== 0) {
      const notification = useNotification();
      notification.error(res.message || 'Error');
      
      // 处理 Token 过期 (401)
      if (res.code === 401 || res.code === 20001 || res.code === 20002) {
        const authStore = useAuthStore();
        authStore.logout();
        window.location.reload();
      }
      return Promise.reject(new Error(res.message || 'Error'));
    }
    return res.data; // 直接返回 data 字段
  },
  (error) => {
    const notification = useNotification();
    notification.error(error.message || 'Network Error');
    return Promise.reject(error);
  }
);

export default service;
```

---

### 第三步：API 模块化定义

创建 `src/api` 目录，按业务拆分文件。

**1. `src/api/auth.ts` (认证相关)**

```typescript
import request from '@/utils/request';

export interface LoginData {
  account: string;
  password: string;
}

export interface LoginResult {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: UserInfo;
}

export interface UserInfo {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  roles: string[];
}

export function login(data: LoginData) {
  return request<LoginResult>({
    url: '/auth/login',
    method: 'post',
    data,
  });
}

export function logout() {
  return request({
    url: '/auth/logout',
    method: 'post',
  });
}

export function getUserProfile() {
  return request<UserInfo>({
    url: '/user/profile',
    method: 'get',
  });
}
```

**2. `src/api/server.ts` (VPN 节点相关)**
*注：虽然你的接口文档里主要写了用户管理，但我假设你需要一个接口来获取 VPN 节点配置。如果后端还没有，你需要加一个 `GET /api/v1/vpn/nodes`。暂且用模拟数据或扩展你的后端文档。*

```typescript
import request from '@/utils/request';

// 定义节点结构
export interface VpnNode {
  id: number;
  name: string;
  country: string;
  city: string;
  flag: string;
  domain: string; // Hysteria2 域名
  port: number;
  password?: string; // 连接密码 (如果不返回，则使用统一密码)
  ping?: number; // 前端测速用
}

// 假设后端新增了这个接口
export function getVpnNodes() {
  // 暂时 mock 一下，或者你实现后端接口
  // return request<VpnNode[]>({
  //   url: '/vpn/nodes',
  //   method: 'get',
  // });
  
  // 临时返回 Mock 数据以跑通流程
  return Promise.resolve([
    { id: 1, name: "US-LA", country: "USA", city: "Los Angeles", flag: "🇺🇸", domain: "us.example.com", port: 443 },
    { id: 2, name: "JP-Tokyo", country: "Japan", city: "Tokyo", flag: "🇯🇵", domain: "jp.example.com", port: 443 }
  ] as VpnNode[]);
}
```

---

### 第四步：改造 Store (对接 API)

**1. `src/stores/auth.ts`**

```typescript
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { login as apiLogin, logout as apiLogout, type LoginData, type UserInfo } from "@/api/auth";

export const useAuthStore = defineStore("auth", () => {
  const token = ref(localStorage.getItem("token") || "");
  const userInfo = ref<UserInfo | null>(null);

  const isLoggedIn = computed(() => !!token.value);
  const isAdmin = computed(() => userInfo.value?.roles.includes("super_admin") || false);

  async function login(formData: LoginData) {
    try {
      const res = await apiLogin(formData);
      token.value = res.access_token;
      userInfo.value = res.user;
      
      localStorage.setItem("token", res.access_token);
      localStorage.setItem("user_info", JSON.stringify(res.user));
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  async function logout() {
    try {
      await apiLogout();
    } catch (e) {
      // 忽略错误
    } finally {
      token.value = "";
      userInfo.value = null;
      localStorage.removeItem("token");
      localStorage.removeItem("user_info");
    }
  }

  // 初始化恢复
  function init() {
    const savedUser = localStorage.getItem("user_info");
    if (savedUser) {
      userInfo.value = JSON.parse(savedUser);
    }
  }
  init();

  return { token, userInfo, isLoggedIn, isAdmin, login, logout };
});
```

**2. `src/stores/servers.ts`**

```typescript
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getVpnNodes, type VpnNode } from "@/api/server";

export const useServersStore = defineStore("servers", () => {
  const servers = ref<VpnNode[]>([]);
  const currentServerId = ref<number | null>(null);
  const isLoading = ref(false);

  const currentServer = computed(() => 
    servers.value.find(s => s.id === currentServerId.value) || servers.value[0]
  );

  async function loadServers() {
    isLoading.value = true;
    try {
      const nodes = await getVpnNodes();
      servers.value = nodes.map(n => ({ ...n, ping: 0 })); // 添加运行时状态
      
      // 恢复选择
      const savedId = localStorage.getItem("currentServerId");
      if (savedId) {
        currentServerId.value = parseInt(savedId);
      } else if (nodes.length > 0) {
        currentServerId.value = nodes[0].id;
      }
    } catch (e) {
      console.error(e);
    } finally {
      isLoading.value = false;
    }
  }

  function selectServer(id: number) {
    currentServerId.value = id;
    localStorage.setItem("currentServerId", id.toString());
  }

  return { servers, currentServer, isLoading, loadServers, selectServer };
});
```

**3. `src/stores/vpn.ts` (连接逻辑)**

修改 `connect` 方法，从 `currentServer` 获取配置，而不是从 `configStore` (手动输入的域名密码)。

```typescript
// ... imports
import { useServersStore } from "./servers";
import { useAuthStore } from "./auth"; // 可能需要获取用户专属密码

// ... inside store
async function connect() {
    const serversStore = useServersStore();
    const server = serversStore.currentServer;

    if (!server) {
        error.value = "No server selected";
        return;
    }

    isConnecting.value = true;
    // ...
    try {
        await invoke("connect_hysteria", {
            domain: server.domain,
            // 假设密码是统一的，或者从 UserInfo 获取，或者 Server 对象里带了
            password: server.password || "default_password" 
        });
        // ...
    }
    // ...
}
```

---

### 第五步：页面适配

1.  **`src/views/LoginView.vue`**：
    *   修改字段绑定为 `account` 和 `password` (对应 API)。
    *   调用 `authStore.login({ account: username.value, password: password.value })`。

2.  **`src/views/SettingsView.vue`**：
    *   **移除**手动输入域名和密码的框（现在是云端下发）。
    *   **保留** DNS、MTU、Helper 等客户端本地设置。
    *   显示当前用户信息（`authStore.userInfo.nickname`）。

---

### 总结

这套改造方案完成后：
1.  **Rust 端** 变得非常轻量，只负责 VPN 内核管理和 Helper。
2.  **前端** 变成了标准的 SPA 架构，通过 REST API 与后端交互。
3.  **安全性** 大大提升，数据库凭证不再暴露在客户端。
4.  **扩展性** 增强，以后增加支付、流量统计、多设备管理，只需要后端加接口，前端调接口即可。



这是一个非常详细的前端重构需求。我将按照您的要求，拆分用户与设置，重构设置页面，设计个人中心，并实现游客试用限制逻辑。

以下是修改后的完整文件内容。

### 1. 修改 `src/stores/settings.ts`
增加连接模式的状态管理，默认设置为 SOCKS。

```typescript
import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { VpnSettings } from "@/types";
import { getItem, setItem } from "@/utils/storage";

const DEFAULT_SETTINGS: VpnSettings = {
  mtu: 1280,
  dnsMode: "cloudflare",
  customDns: "",
  autoReconnect: false,
  killSwitch: false,
  connectionMode: "socks", // 默认 SOCKS 模式
};

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<VpnSettings>(getItem("settings", DEFAULT_SETTINGS));
  const theme = ref<"dark" | "light">(getItem("theme", "dark"));

  // 监听设置变化并持久化
  watch(
    settings,
    (val) => {
      setItem("settings", val);
    },
    { deep: true }
  );

  // 监听主题变化
  watch(
    theme,
    (val) => {
      setItem("theme", val);
      applyTheme(val);
    },
    { immediate: true }
  );

  function applyTheme(t: "dark" | "light") {
    const root = document.documentElement;
    if (t === "light") {
      root.classList.add("light");
      root.classList.remove("dark");
    } else {
      root.classList.add("dark");
      root.classList.remove("light");
    }
    document.body.style.backgroundColor = t === "light" ? "#f8fafc" : "#0f172a";
  }

  function updateSettings(patch: Partial<VpnSettings>) {
    settings.value = { ...settings.value, ...patch };
  }

  function toggleTheme() {
    theme.value = theme.value === "dark" ? "light" : "dark";
  }

  function setTheme(t: "dark" | "light") {
    theme.value = t;
  }

  return {
    settings,
    theme,
    updateSettings,
    toggleTheme,
    setTheme,
  };
});
```

### 2. 修改 `src/stores/auth.ts`
增加游客模式判断、头像生成逻辑。

```typescript
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getItem, setItem, removeItem } from "@/utils/storage";

interface User {
  username: string;
  role: "admin" | "user" | "guest";
  email?: string;
  avatar?: string;
  expireDate?: string;
}

export const useAuthStore = defineStore("auth", () => {
  const currentUser = ref<User | null>(getItem("user_info", null));
  
  // 如果没有用户，视为游客
  const isGuest = computed(() => !currentUser.value || currentUser.value.role === 'guest');
  const isAuthenticated = computed(() => !!currentUser.value && currentUser.value.role !== 'guest');
  const isAdmin = computed(() => currentUser.value?.role === "admin");

  // 生成头像颜色
  const avatarColor = computed(() => {
    const name = currentUser.value?.username || 'G';
    const colors = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500', 'bg-teal-500', 'bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500'];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  });

  // 获取显示用的头像字符
  const avatarLetter = computed(() => {
    return (currentUser.value?.username || 'G').charAt(0).toUpperCase();
  });

  async function login(username: string, password: string): Promise<boolean> {
    // 模拟登录请求
    return new Promise((resolve) => {
      setTimeout(() => {
        // 模拟数据
        const user: User = { 
          username, 
          role: username === 'admin' ? 'admin' : 'user',
          email: `${username}@example.com`,
          expireDate: '2026-12-31'
        };
        currentUser.value = user;
        setItem("user_info", user);
        resolve(true);
      }, 500);
    });
  }

  function logout() {
    currentUser.value = null;
    removeItem("user_info");
  }

  // 注册设备（模拟游客记录）
  function registerGuest() {
    if (!currentUser.value) {
      const guestId = getItem("guest_uuid", crypto.randomUUID());
      setItem("guest_uuid", guestId);
      // 可以在这里记录游客开始使用的时间等
    }
  }

  return {
    currentUser,
    isAuthenticated,
    isGuest,
    isAdmin,
    avatarColor,
    avatarLetter,
    login,
    logout,
    registerGuest
  };
});
```

### 3. 修改 `src/stores/vpn.ts`
实现试用限制逻辑（流量/时间），并在限制达到时强制断开并跳转。

```typescript
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useRouter } from "vue-router";
import type { VpnStatus, HelperStatus, ConnectionStats } from "@/types";
import { useLogsStore } from "./logs";
import { useConfigStore } from "./config";
import { useAuthStore } from "./auth";
import { useSettingsStore } from "./settings";

interface LogEvent {
  level: string;
  message: string;
  timestamp: number;
}

interface HelperResult {
  success: boolean;
  message: string;
}

interface HelperStatusResult {
  status: string;
}

// 试用限制常量
const TRIAL_LIMIT_BYTES = 2 * 1024 * 1024; // 2MB
const TRIAL_LIMIT_SECONDS = 5 * 60; // 5分钟

export const useVpnStore = defineStore("vpn", () => {
  const router = useRouter(); // 注意：Store 中使用 router 可能需要在 setup 后
  
  const status = ref<VpnStatus>("disconnected");
  const helperStatus = ref<HelperStatus>("not_installed");
  const isVpnBusy = ref(false);
  const isHelperBusy = ref(false);
  const error = ref<string | null>(null);
  const isConnecting = ref(false);
  
  // 统计数据
  const stats = ref<ConnectionStats>({
    ip: "",
    downloadSpeed: 0,
    uploadSpeed: 0,
    latency: 0,
    connectedTime: 0,
  });

  // 累计流量（用于试用限制）
  const sessionTotalBytes = ref(0);

  let unlistenLog: UnlistenFn | null = null;
  let statsTimer: number | null = null;
  let connectedAt = 0;

  const isConnected = computed(() => status.value === "connected");
  const isHelperReady = computed(
    () => helperStatus.value === "installed" || helperStatus.value === "running"
  );

  const canConnect = computed(
    () => !isVpnBusy.value && status.value === "disconnected"
  );

  const canDisconnect = computed(
    () => !isVpnBusy.value && (status.value === "connected" || status.value === "connecting")
  );

  const canCancel = computed(
    () => status.value === "connecting" && isConnecting.value
  );

  // Helper Actions
  async function checkHelperStatus() {
    try {
      const res = await invoke<HelperStatusResult>("check_helper_status");
      helperStatus.value = res.status as HelperStatus;
    } catch (e) {
      console.error("Failed to check helper:", e);
      helperStatus.value = "error";
    }
  }

  async function installHelper() {
    isHelperBusy.value = true;
    error.value = null;
    try {
      const res = await invoke<HelperResult>("install_helper");
      if (res.success) {
        helperStatus.value = "installed";
        await checkHelperStatus();
      } else {
        throw new Error(res.message);
      }
    } catch (e) {
      error.value = String(e);
    } finally {
      isHelperBusy.value = false;
    }
  }

  async function uninstallHelper() {
    isHelperBusy.value = true;
    try {
      const res = await invoke<HelperResult>("uninstall_helper");
      if (res.success) {
        helperStatus.value = "not_installed";
      } else {
        throw new Error(res.message);
      }
    } catch (e) {
      error.value = String(e);
    } finally {
      isHelperBusy.value = false;
    }
  }

  // VPN Actions
  async function initEventListeners() {
    const logs = useLogsStore();
    if (unlistenLog) unlistenLog();
    unlistenLog = await listen<LogEvent>("vpn-log", (event) => {
      const { level, message } = event.payload;
      const logLvl = (level === "warn" || level === "error") ? level : "info";
      logs.addLog(logLvl, message);
    });
  }

  async function connect() {
    const configStore = useConfigStore();
    const authStore = useAuthStore();
    const settingsStore = useSettingsStore();

    // 检查 Helper
    if (!isHelperReady.value) {
      error.value = "System Extension required.";
      return;
    }

    if (!configStore.isValid()) {
      error.value = "Configuration missing.";
      return;
    }

    isConnecting.value = true;
    status.value = "connecting";
    error.value = null;
    isVpnBusy.value = true;
    sessionTotalBytes.value = 0; // 重置流量计数

    try {
      await initEventListeners();

      await invoke("connect_hysteria", {
        domain: configStore.domain,
        password: configStore.password,
        // 这里假设 Rust 端已经修改以接收 mode 参数，或者通过 configStore 传递
        // mode: settingsStore.settings.connectionMode 
      });

      status.value = "connected";
      authStore.registerGuest(); // 记录游客开始
      startStatsMonitor();
    } catch (e) {
      status.value = "disconnected";
      error.value = String(e);
    } finally {
      isConnecting.value = false;
      isVpnBusy.value = false;
    }
  }

  async function disconnect() {
    if (status.value === "connecting") return cancelConnect();
    if (status.value !== "connected") return;

    isVpnBusy.value = true;
    try {
      await invoke("disconnect_vpn");
      status.value = "disconnected";
      stopStatsMonitor();
      resetStats();
    } catch (e) {
      status.value = "disconnected";
    } finally {
      isVpnBusy.value = false;
    }
  }

  async function cancelConnect() {
    try {
      await invoke("disconnect_vpn");
    } catch (e) {}
    status.value = "disconnected";
    isConnecting.value = false;
    isVpnBusy.value = false;
  }

  // 监控逻辑（含试用限制）
  function startStatsMonitor() {
    connectedAt = Date.now();
    const authStore = useAuthStore();

    statsTimer = window.setInterval(() => {
      const now = Date.now();
      const connectedTime = Math.floor((now - connectedAt) / 1000);
      
      // 模拟流量数据 (实际应从 rust event 获取)
      const dl = Math.random() * 100 * 1024; 
      const ul = Math.random() * 20 * 1024;
      
      sessionTotalBytes.value += (dl + ul);

      stats.value = {
        ip: "", // 实际应从后端获取
        downloadSpeed: dl * 5, // 模拟瞬时速度
        uploadSpeed: ul * 5,
        latency: Math.floor(40 + Math.random() * 60),
        connectedTime: connectedTime,
      };

      // === 核心：试用限制检查 ===
      if (authStore.isGuest) {
        if (sessionTotalBytes.value > TRIAL_LIMIT_BYTES || connectedTime > TRIAL_LIMIT_SECONDS) {
          handleTrialExpiration();
        }
      }

    }, 1000);
  }

  function handleTrialExpiration() {
    disconnect();
    error.value = "Trial limit reached (2MB or 5mins). Please login.";
    // 强制跳转登录
    // 注意：Store 内直接跳转需要 router 实例，如果这里报错，可以在组件层监听 error
    window.location.hash = "/login"; 
  }

  function stopStatsMonitor() {
    if (statsTimer) {
      clearInterval(statsTimer);
      statsTimer = null;
    }
  }

  function resetStats() {
    stats.value = {
      ip: "", downloadSpeed: 0, uploadSpeed: 0, latency: 0, connectedTime: 0
    };
  }

  function cleanup() {
    if (unlistenLog) unlistenLog();
    stopStatsMonitor();
  }

  return {
    status, helperStatus, isVpnBusy, isHelperBusy, error, stats, isConnecting,
    isConnected, isHelperReady, canConnect, canDisconnect, canCancel, canInstallHelper, canUninstallHelper,
    checkHelperStatus, installHelper, uninstallHelper, connect, disconnect, cancelConnect,
    initEventListeners, cleanup
  };
});
```

### 4. 新建 `src/views/ProfileView.vue`
个人中心页面，Mac 设计风格。

```html
<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'

const router = useRouter()
const authStore = useAuthStore()
const { currentUser, avatarColor, avatarLetter } = storeToRefs(authStore)

function handleLogout() {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <div class="h-full flex flex-col bg-[var(--vpn-bg)] p-6 overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8 titlebar-drag">
      <h1 class="text-2xl font-bold tracking-tight text-[var(--vpn-text)]">Account</h1>
    </div>

    <!-- Profile Card -->
    <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-2xl shadow-sm p-6 flex flex-col items-center relative overflow-hidden backdrop-blur-md">
      
      <!-- Background Decoration -->
      <div class="absolute top-0 left-0 w-full h-24 bg-gradient-to-b from-blue-500/10 to-transparent pointer-events-none"></div>

      <!-- Avatar -->
      <div 
        class="w-24 h-24 rounded-full flex items-center justify-center text-4xl font-bold text-white shadow-lg mb-4 z-10 ring-4 ring-[var(--vpn-card)]"
        :class="[currentUser?.avatar ? '' : avatarColor]"
      >
        <img v-if="currentUser?.avatar" :src="currentUser.avatar" class="w-full h-full rounded-full object-cover" />
        <span v-else>{{ avatarLetter }}</span>
      </div>

      <!-- Info -->
      <h2 class="text-xl font-semibold text-[var(--vpn-text)] mb-1">{{ currentUser?.username || 'Guest' }}</h2>
      <p class="text-[13px] text-[var(--vpn-text-secondary)] mb-6">{{ currentUser?.email || 'Not logged in' }}</p>

      <!-- Stats / Plan -->
      <div class="w-full grid grid-cols-2 gap-4 mb-8">
        <div class="bg-[var(--vpn-bg)] rounded-xl p-4 text-center border border-[var(--vpn-border)]">
          <p class="text-[11px] text-[var(--vpn-text-secondary)] uppercase tracking-wider mb-1">Plan</p>
          <p class="text-sm font-medium text-emerald-500">Pro Member</p>
        </div>
        <div class="bg-[var(--vpn-bg)] rounded-xl p-4 text-center border border-[var(--vpn-border)]">
          <p class="text-[11px] text-[var(--vpn-text-secondary)] uppercase tracking-wider mb-1">Expires</p>
          <p class="text-sm font-medium text-[var(--vpn-text)]">{{ currentUser?.expireDate || 'N/A' }}</p>
        </div>
      </div>

      <!-- Actions -->
      <button 
        @click="handleLogout"
        class="w-full py-2.5 rounded-xl border border-red-200 dark:border-red-900/30 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors text-[13px] font-medium"
      >
        Sign Out
      </button>
    </div>
  </div>
</template>
```

### 5. 修改 `src/components/layout/AppSidebar.vue`
分离设置与头像。头像点击逻辑：未登录->登录页，已登录->个人中心。

```html
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useVpn } from '@/composables/useVpn'
import { useAuthStore } from '@/stores/auth'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'

const route = useRoute()
const router = useRouter()
const { isConnected } = useVpn()
const authStore = useAuthStore()
const i18nStore = useI18nStore()
const { t } = storeToRefs(i18nStore)
const { isAuthenticated, avatarColor, avatarLetter, currentUser } = storeToRefs(authStore)

const navItems = computed(() => [
  { id: 'home', path: '/', icon: 'power', label: t.value.nav.home },
  { id: 'servers', path: '/servers', icon: 'globe', label: t.value.nav.servers },
  { id: 'logs', path: '/logs', icon: 'terminal', label: t.value.nav.logs },
])

const currentPath = computed(() => route.path)

const icons: Record<string, string> = {
  power: 'M13 10V3L4 14h7v7l9-11h-7z',
  globe: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9',
  terminal: 'M4 17l6-6-6-6M12 19h8',
  settings: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
}

function handleAvatarClick() {
  if (isAuthenticated.value) {
    router.push('/profile')
  } else {
    router.push('/login')
  }
}
</script>

<template>
  <nav class="w-[72px] h-full flex flex-col items-center py-6 vpn-sidebar titlebar-drag z-50">
    <div class="h-6 w-full mb-4"></div>

    <!-- App Logo / Status -->
    <div class="mb-8 titlebar-no-drag">
      <div :class="[
        'w-10 h-10 rounded-xl flex items-center justify-center shadow-md transition-all duration-500',
        isConnected
          ? 'bg-gradient-to-br from-emerald-400 to-teal-500 shadow-emerald-500/20'
          : 'bg-gradient-to-br from-slate-500 to-slate-600'
      ]">
        <svg class="w-5 h-5 text-white drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5"
            d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.2-2.858.59-4.18" />
        </svg>
      </div>
    </div>

    <!-- Main Navigation -->
    <div class="flex-1 flex flex-col gap-3 w-full px-3 titlebar-no-drag">
      <button v-for="item in navItems" :key="item.id" @click="router.push(item.path)" :title="item.label"
        class="group relative w-full aspect-square flex items-center justify-center rounded-xl transition-all duration-300"
        :class="currentPath === item.path ? 'bg-white shadow-sm' : 'hover:bg-black/5 dark:hover:bg-white/10'">

        <svg class="w-5 h-5 transition-colors duration-300"
          :class="currentPath === item.path ? 'text-[var(--vpn-primary)]' : 'text-[var(--vpn-text-secondary)] group-hover:text-[var(--vpn-text)]'"
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="icons[item.icon]" />
        </svg>

        <span v-if="currentPath === item.path"
          class="absolute -left-1 top-1/2 -translate-y-1/2 w-0.5 h-3 rounded-full bg-[var(--vpn-primary)]">
        </span>
      </button>
    </div>

    <!-- Bottom Actions -->
    <div class="flex flex-col gap-4 mb-2 px-3 titlebar-no-drag items-center">
      
      <!-- Settings Button (Separated) -->
      <button @click="router.push('/settings')"
        class="w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 text-[var(--vpn-text-secondary)] hover:text-[var(--vpn-text)] hover:bg-black/5 dark:hover:bg-white/10"
        :class="currentPath === '/settings' ? 'text-[var(--vpn-text)] bg-white shadow-sm' : ''"
        title="Settings">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="icons.settings" />
        </svg>
      </button>

      <!-- Avatar / Profile Button -->
      <button @click="handleAvatarClick"
        class="group relative w-10 h-10 rounded-full flex items-center justify-center overflow-hidden transition-all duration-300 shadow-sm border border-transparent hover:border-gray-200 dark:hover:border-white/10"
        :class="[isAuthenticated ? (currentUser?.avatar ? '' : avatarColor) : 'bg-slate-200 dark:bg-white/10']"
        title="Profile / Login">
        
        <!-- User Avatar -->
        <template v-if="isAuthenticated">
          <img v-if="currentUser?.avatar" :src="currentUser.avatar" class="w-full h-full object-cover" />
          <span v-else class="text-white font-bold text-sm">{{ avatarLetter }}</span>
        </template>
        
        <!-- Guest Icon -->
        <template v-else>
          <svg class="w-5 h-5 text-[var(--vpn-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </template>

        <!-- Active Indicator for Profile -->
        <span v-if="currentPath === '/profile'" class="absolute -right-0.5 top-0 flex h-2.5 w-2.5">
          <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500 border-2 border-white dark:border-[#1e1e1e]"></span>
        </span>
      </button>
    </div>
  </nav>
</template>
```

### 6. 修改 `src/views/SettingsView.vue`
去除了输入框和警告，增加了模式切换后自动重连逻辑，保留了助手安装和语言设置。

```html
<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'

// Stores
import { useSettingsStore } from '@/stores/settings'
import { useI18nStore } from '@/stores/i18n'
import { useVpnStore } from '@/stores/vpn'

const router = useRouter()
const settingsStore = useSettingsStore()
const i18nStore = useI18nStore()
const vpnStore = useVpnStore()

const { settings, theme } = storeToRefs(settingsStore)
const { t, locale } = storeToRefs(i18nStore)
const { helperStatus, isHelperBusy, isConnected } = storeToRefs(vpnStore)

// Options Data
const dnsOptions = computed(() => [
  { value: 'cloudflare', label: 'Cloudflare (1.1.1.1)' },
  { value: 'google', label: 'Google (8.8.8.8)' },
  { value: 'custom', label: 'Custom DNS...' },
])

const mtuOptions = computed(() => [
  { value: 1280, label: '1280 (Standard)' },
  { value: '1420', label: '1420 (Balanced)' },
  { value: 1500, label: '1500 (High Speed)' },
])

// 监听连接模式变化 -> 自动重连
watch(() => settings.value.connectionMode, async (newMode, oldMode) => {
  if (newMode !== oldMode && isConnected.value) {
    // 1. 断开
    await vpnStore.disconnect()
    // 2. 跳转主页
    router.push('/')
    // 3. 延迟重新连接
    setTimeout(() => {
      vpnStore.connect()
    }, 800)
  }
})
</script>

<template>
  <div class="h-full flex flex-col bg-[var(--vpn-bg)] overflow-hidden">
    <!-- Header -->
    <div class="px-6 pt-8 pb-4 sticky top-0 z-10 bg-[var(--vpn-bg)] flex justify-between items-center shrink-0 border-b border-transparent">
      <h1 class="text-2xl font-bold tracking-tight text-[var(--vpn-text)]">
        {{ t.settings.title }}
      </h1>
    </div>

    <div class="flex-1 overflow-y-auto px-6 pb-8 space-y-6">
      
      <!-- 1. Connection Mode (Replaces Manual Config) -->
      <section>
        <h2 class="text-[11px] font-semibold text-[var(--vpn-muted)] uppercase tracking-wider mb-2 pl-2">
          Connection Mode
        </h2>
        <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-lg overflow-hidden shadow-sm p-1 flex gap-1">
          <button 
            @click="settingsStore.updateSettings({ connectionMode: 'socks' })"
            class="flex-1 flex flex-col items-center justify-center py-3 rounded-md transition-all duration-200"
            :class="settings.connectionMode === 'socks' 
              ? 'bg-white dark:bg-white/10 shadow-sm text-blue-600 dark:text-blue-400' 
              : 'text-[var(--vpn-text-secondary)] hover:text-[var(--vpn-text)]'"
          >
            <span class="text-[13px] font-bold">SOCKS Mode</span>
            <span class="text-[10px] opacity-70">Proxy Only</span>
          </button>

          <button 
            @click="settingsStore.updateSettings({ connectionMode: 'tun' })"
            class="flex-1 flex flex-col items-center justify-center py-3 rounded-md transition-all duration-200"
            :class="settings.connectionMode === 'tun' 
              ? 'bg-white dark:bg-white/10 shadow-sm text-emerald-600 dark:text-emerald-400' 
              : 'text-[var(--vpn-text-secondary)] hover:text-[var(--vpn-text)]'"
          >
            <span class="text-[13px] font-bold">TUN Mode</span>
            <span class="text-[10px] opacity-70">Global Route</span>
          </button>
        </div>
        <p class="text-[10px] text-[var(--vpn-muted)] mt-2 pl-2">
          Switching modes will automatically reconnect. TUN mode requires System Helper.
        </p>
      </section>

      <!-- 2. System Helper Section -->
      <section>
        <h2 class="text-[11px] font-semibold text-[var(--vpn-muted)] uppercase tracking-wider mb-2 pl-2">
          {{ t.settings.helper.title }}
        </h2>
        <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-lg p-4 shadow-sm">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <div :class="['w-2.5 h-2.5 rounded-full shadow-sm', (helperStatus === 'running' || helperStatus === 'installed') ? 'bg-emerald-500' : 'bg-red-500']"></div>
              <span class="text-[13px] font-medium text-[var(--vpn-text)]">
                {{ (helperStatus === 'running' || helperStatus === 'installed') ? t.settings.helper.installed : t.settings.helper.missing }}
              </span>
            </div>

            <button 
              @click="helperStatus === 'not_installed' ? vpnStore.installHelper() : vpnStore.uninstallHelper()"
              :disabled="isHelperBusy"
              class="px-3 py-1 rounded-md text-[11px] font-medium transition-all shadow-sm border border-transparent"
              :class="helperStatus === 'not_installed' 
                ? 'bg-emerald-500 text-white hover:bg-emerald-600' 
                : 'bg-white dark:bg-white/5 border-[var(--vpn-border)] text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'"
            >
              {{ isHelperBusy ? t.common.loading : (helperStatus === 'not_installed' ? t.settings.helper.install : t.settings.helper.uninstall) }}
            </button>
          </div>
          <p class="text-[11px] text-[var(--vpn-text-secondary)] leading-relaxed">
            {{ t.settings.helper.desc }}
          </p>
        </div>
      </section>

      <!-- 3. General Section -->
      <section>
        <h2 class="text-[11px] font-semibold text-[var(--vpn-muted)] uppercase tracking-wider mb-2 pl-2">
          {{ t.settings.general }}
        </h2>
        <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-lg overflow-hidden shadow-sm">
          
          <!-- Language -->
          <div class="flex items-center justify-between p-3 border-b border-[var(--vpn-border)]">
             <span class="text-[13px] font-medium text-[var(--vpn-text)] pl-1">{{ t.settings.language }}</span>
             <div class="relative">
               <select v-model="locale" @change="i18nStore.setLocale(locale)" class="appearance-none bg-transparent pl-3 pr-8 py-1 text-[13px] text-[var(--vpn-text)] font-medium outline-none text-right cursor-pointer focus:bg-black/5 dark:focus:bg-white/5 rounded-md transition-colors">
                 <option value="en">English</option>
                 <option value="zh">简体中文</option>
               </select>
               <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[var(--vpn-text-secondary)]">
                 <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                 </svg>
               </div>
             </div>
          </div>

          <!-- Theme -->
          <div class="flex items-center justify-between p-3">
             <span class="text-[13px] font-medium text-[var(--vpn-text)] pl-1">{{ t.settings.appearance }}</span>
             <div class="flex bg-[var(--vpn-input-bg)] p-0.5 rounded-md">
                <button @click="settingsStore.setTheme('light')" :class="theme === 'light' ? 'bg-[var(--vpn-card)] shadow-sm text-[var(--vpn-text)]' : 'text-[var(--vpn-text-secondary)]'" class="px-3 py-1 text-[11px] rounded-[5px] transition-all">Light</button>
                <button @click="settingsStore.setTheme('dark')" :class="theme === 'dark' ? 'bg-[var(--vpn-card)] shadow-sm text-[var(--vpn-text)]' : 'text-[var(--vpn-text-secondary)]'" class="px-3 py-1 text-[11px] rounded-[5px] transition-all">Dark</button>
             </div>
          </div>
        </div>
      </section>

      <!-- App Info -->
      <div class="text-center pt-4">
        <p class="text-[10px] text-[var(--vpn-muted)]">ToVpn Client v1.0.0</p>
      </div>

    </div>
  </div>
</template>
```

### 7. 修改 `src/views/HomeView.vue`
实现游客逻辑：点击连接 -> 检测助手 -> 未安装跳转设置 / 已安装则连接 -> 触发试用限制。

```html
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useVpn } from '@/composables/useVpn'
import { useConfigStore } from '@/stores/config'
import { formatDuration } from '@/utils/format'
import ConnectButton from '@/components/dashboard/ConnectButton.vue'
import ServerCard from '@/components/dashboard/ServerCard.vue'
import StatsPanel from '@/components/dashboard/StatsPanel.vue'

const router = useRouter()
const configStore = useConfigStore()
const {
  status, isVpnBusy, error, currentServer, stats,
  isConnected, isHelperReady, canCancel,
  connect, disconnect, cancelConnect, checkHelperStatus
} = useVpn()

onMounted(() => {
  checkHelperStatus()
})

const buttonDisabled = computed(() => {
  if (status.value === 'disconnecting') return true
  // 正在连接时允许取消
  if (status.value === 'connecting') return false
  return isVpnBusy.value
})

function handleConnect() {
  if (status.value === 'connected') return disconnect()
  
  if (status.value === 'disconnected') {
    // 方案 1: 游客点击 -> 检查助手
    if (!isHelperReady.value) {
      // 提示跳转去安装插件
      const confirm = window.confirm("System Extension is required to connect. Go to Settings to install?");
      if (confirm) {
        router.push('/settings');
      }
      return;
    }
    
    // 允许连接 (Trial 逻辑在 Store 内部控制)
    connect()
  }
}
</script>

<template>
  <div class="flex flex-col h-full bg-[var(--vpn-bg)] relative overflow-hidden">
    <!-- Subtle Background Gradient Glow -->
    <div
      class="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-sky-400/10 rounded-full blur-[100px] pointer-events-none">
    </div>
    <div
      class="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-emerald-400/10 rounded-full blur-[80px] pointer-events-none">
    </div>

    <!-- Main Content Area -->
    <div class="flex-1 flex flex-col items-center justify-center p-6 pb-12 relative z-10 w-full">

      <!-- 顶部提示区：如果助手没安装，提示用户 -->
      <Transition name="fade">
        <div v-if="!isHelperReady && status === 'disconnected'" class="absolute top-4 w-full flex justify-center pointer-events-none">
          <div class="pointer-events-auto px-4 py-2 rounded-full bg-amber-50 border border-amber-200 text-amber-600 text-xs font-medium shadow-sm flex items-center gap-2 animate-bounce-slight cursor-pointer" @click="router.push('/settings')">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Plugin required. Click to Install.</span>
          </div>
        </div>
      </Transition>

      <div class="flex flex-col items-center justify-center w-full max-w-md space-y-8 mt-8">
        <!-- Main Button -->
        <ConnectButton :status="status" :disabled="buttonDisabled" :can-cancel="canCancel" @click="handleConnect"
          @cancel="cancelConnect" />

        <!-- Timer -->
        <div class="h-6 flex items-center justify-center">
          <Transition name="fade">
            <div v-if="isConnected && stats.connectedTime > 0"
              class="px-3 py-1 rounded-full bg-white/80 dark:bg-white/10 border border-[var(--vpn-border)] shadow-sm text-xs font-mono text-[var(--vpn-text-secondary)]">
              {{ formatDuration(stats.connectedTime) }}
            </div>
          </Transition>
        </div>

        <!-- Server Card -->
        <ServerCard v-if="currentServer" :server="currentServer" @click="router.push('/servers')" />
      </div>

      <!-- Error Toast -->
      <Transition name="slide-up">
        <div v-if="error"
          class="absolute bottom-4 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-4 py-2.5 rounded-xl shadow-lg border border-red-100 dark:border-red-900/30 flex items-center gap-2 max-w-[90%]">
          <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="truncate">{{ error }}</span>
        </div>
      </Transition>
    </div>

    <!-- Bottom Panel -->
    <StatsPanel :stats="stats" :is-connected="isConnected" />
  </div>
</template>

<style scoped>
@keyframes bounce-slight {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
.animate-bounce-slight {
  animation: bounce-slight 2s infinite ease-in-out;
}
</style>
```

### 8. 修改 `src/router/index.ts`
添加 `profile` 路由。

```typescript
import { createRouter, createWebHistory } from "vue-router";
import HomeView from "@/views/HomeView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      component: HomeView,
    },
    {
      path: "/servers",
      name: "servers",
      component: () => import("@/views/ServersView.vue"),
    },
    {
      path: "/logs",
      name: "logs",
      component: () => import("@/views/LogsView.vue"),
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("@/views/SettingsView.vue"),
    },
    {
      path: "/profile",
      name: "profile",
      component: () => import("@/views/ProfileView.vue"),
    },
    // Auth Routes
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/auth/LoginView.vue"),
      meta: { hideSidebar: true },
    },
  ],
});

export default router;
```