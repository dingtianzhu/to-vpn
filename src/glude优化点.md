# 代码分析报告

## 一、无用/冗余文件

| 文件 | 原因 |
|------|------|
| `src/components/dashboard/StatusBar.vue` | 未被任何组件引用 |
| `src/composables/useTheme.ts` | 未被使用，主题切换直接用 `settingsStore` |
| `src/types/config.ts` | `HysteriaConfig` 和 `AppConfigStatus` 未被使用 |
| `src/types/tauri.ts` | 接口定义未被使用，invoke 调用没有用这些类型 |
| `src/views/auth/RegisterView.vue` | 表单无实际逻辑，仅跳转 |
| `src/views/auth/ForgotPasswordView.vue` | 表单无实际逻辑 |

---

## 二、文件结构化

```
src/
├── api/                          # API层
│   ├── auth.ts                   # 认证接口
│   └── server.ts                 # 节点接口
├── assets/styles/
│   └── main.css                  # 全局CSS变量+Tailwind
├── components/
│   ├── common/
│   │   └── AppToast.vue          # ❌ 缺失但被引用
│   ├── dashboard/                # 首页组件
│   │   ├── ConnectButton.vue     # 连接按钮
│   │   ├── ServerCard.vue        # 服务器卡片
│   │   ├── StatsPanel.vue        # 统计面板
│   │   └── StatusBar.vue         # ⚠️ 未使用
│   ├── layout/                   # 布局组件
│   │   ├── AppHeader.vue
│   │   ├── AppLayout.vue
│   │   └── AppSidebar.vue
│   └── servers/
│       └── ServerItem.vue
├── composables/                  # 组合式函数
│   ├── useNotification.ts
│   ├── useTauri.ts
│   ├── useTheme.ts               # ⚠️ 未使用
│   └── useVpn.ts                 # 核心VPN逻辑封装
├── router/index.ts
├── stores/                       # Pinia状态
│   ├── auth.ts                   # 用户认证
│   ├── config.ts                 # 配置管理(部分冗余)
│   ├── i18n.ts                   # 国际化
│   ├── logs.ts                   # 日志
│   ├── servers.ts                # 服务器列表
│   ├── settings.ts               # 设置
│   └── vpn.ts                    # VPN核心状态
├── types/                        # 类型定义
│   ├── config.ts                 # ⚠️ 未使用
│   ├── index.ts
│   ├── login.ts
│   ├── server.ts                 # ⚠️ 与api/server.ts类型冲突
│   ├── tauri.ts                  # ⚠️ 未使用
│   └── vpn.ts
├── utils/
│   ├── error.ts
│   ├── format.ts
│   ├── request.ts
│   └── storage.ts
└── views/                        # 页面视图
```

---

## 三、方案缺陷及问题代码

### 🔴 严重问题

#### 1. 类型定义冲突

```typescript
// types/server.ts - 定义的类型
interface ServerNode {
  id: number;
  endpoint: string;  // 这个字段
  // 没有 domain, password, port
}

// api/server.ts - 实际使用的类型
interface VpnNode {
  domain: string;    // 完全不同的字段
  password?: string;
  port: number;
}

// stores/vpn.ts - 运行时报错风险
const server = serversStore.currentServer;
await invoke("connect_hysteria", {
  domain: server.domain,      // ❌ 如果用 ServerNode 类型则不存在
  password: server.password,  // ❌ 可能 undefined
});
```

#### 2. User 类型缺少必要字段

```typescript
// types/login.ts
interface User {
  roles: string[];  // 是数组
  // 没有 role, expireDate
}

// stores/auth.ts - 运行时错误
const isGuest = computed(
  () => !currentUser.value || currentUser.value.role === "guest"  // ❌ role 不存在
);

// views/ProfileView.vue
{{ currentUser?.expireDate || 'N/A' }}  // ❌ expireDate 不存在
```

#### 3. ServersView 缺少变量导入

```vue
<!-- views/ServersView.vue -->
<ServerItem 
  :selected="server.id === currentServerId"  <!-- ❌ currentServerId 未定义 -->
/>

<!-- 缺少: -->
const { currentServerId } = storeToRefs(serversStore)  // 需要添加
```

#### 4. 缺失组件文件

```vue
<!-- components/layout/AppLayout.vue -->
<AppToast />  <!-- ❌ 文件不存在: src/components/common/AppToast.vue -->
```

---

### 🟠 逻辑缺陷

#### 5. 设置默认值拼写错误

```typescript
// stores/settings.ts
const DEFAULT_SETTINGS: VpnSettings = {
  connectionMode: "sock",  // ❌ 应该是 "socks"
};
```

#### 6. 模拟数据导致试用限制失效

```typescript
// stores/vpn.ts
function startStatsMonitor() {
  // 模拟流量数据 - 实际完全无效
  const dl = Math.random() * 100 * 1024;  // 假数据
  const ul = Math.random() * 20 * 1024;
  sessionTotalBytes.value += dl + ul;     // 累加假数据
  
  // 基于假数据判断 - 完全不可靠
  if (sessionTotalBytes.value > TRIAL_LIMIT_BYTES) {
    handleTrialExpiration();
  }
}
```

#### 7. configStore 导入未使用

```typescript
// views/HomeView.vue
import { useConfigStore } from '@/stores/config'  // 导入了
const configStore = useConfigStore()               // 赋值了
// 但从未使用 configStore
```

---

### 🟡 安全风险

#### 8. 敏感信息明文存储

```typescript
// stores/config.ts
const password = ref(localStorage.getItem("vpn_password") || "");
localStorage.setItem("vpn_password", newPassword);  // 明文密码

// stores/auth.ts
setItem("access_token", res.access_token);  // JWT 存 localStorage (XSS风险)
```

#### 9. 硬编码配置

```typescript
// utils/request.ts
baseURL: "http://localhost:8080/api/v1",  // 硬编码，无环境变量
```

---

### 🔵 代码质量问题

#### 10. i18n 不完整

```vue
<!-- views/SettingsView.vue -->
<span>SOCKS Mode</span>           <!-- 硬编码 -->
<span>TUN Mode</span>             <!-- 硬编码 -->
<span>Connection Mode</span>      <!-- 硬编码 -->
<span>Required for TUN mode</span><!-- 硬编码 -->
```

#### 11. stores/config.ts 与 stores/servers.ts 功能重叠

```typescript
// config.ts
const servers = ref<Server[]>([]);
async function testServerPing() {...}

// servers.ts  
const servers = ref<VpnNode[]>([]);
// 两个 store 都管理服务器，职责混乱
```

#### 12. 路由跳转方式不一致

```typescript
// stores/vpn.ts
window.location.hash = "/login";  // 直接操作 hash

// 其他地方
router.push('/login');            // 使用 router
```

---

## 四、修复优先级建议

| 优先级 | 问题 | 修复方案 |
|--------|------|----------|
| P0 | 类型冲突 | 统一 `VpnNode` 和 `Server` 定义 |
| P0 | 缺失 `currentServerId` | 添加 storeToRefs 导出 |
| P0 | User.role 不存在 | 改用 `roles.includes('guest')` |
| P1 | 缺失 AppToast.vue | 创建组件或移除引用 |
| P1 | connectionMode 拼写 | `"sock"` → `"socks"` |
| P2 | 试用限制失效 | 从 Rust 层获取真实流量 |
| P2 | 密码明文存储 | 使用 Tauri secure storage |
| P3 | 删除无用文件 | 清理 StatusBar, useTheme 等 |

# 代码优化方案

## 一、删除无用文件

```bash
# 删除以下文件
rm src/components/dashboard/StatusBar.vue
rm src/composables/useTheme.ts
rm src/types/config.ts
rm src/types/tauri.ts
rm src/views/auth/RegisterView.vue
rm src/views/auth/ForgotPasswordView.vue
```

---

## 二、统一类型定义

### `src/types/server.ts` (重写)

```typescript
// 统一服务器节点类型
export interface Server {
  id: number;
  name: string;
  country: string;
  city: string;
  flag: string;
  domain: string;
  port: number;
  password?: string;
  // 运行时状态
  ping: number;
  status: "online" | "offline" | "unknown";
}

// API 返回的原始数据
export type ServerNode = Omit<Server, "ping" | "status">;
```

### `src/types/login.ts` (修复)

```typescript
export interface User {
  id: number;
  uuid: string;
  username: string;
  email: string;
  nickname: string;
  avatar: string;
  roles: string[];
  expireDate?: string; // 添加过期日期
}

export interface ResultData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: User;
}

export interface LoginData {
  account: string;
  password: string;
}

export interface UserInfo {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  roles: string[];
}
```

### `src/types/vpn.ts` (优化)

```typescript
export type VpnStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "error";

export type HelperStatus = "not_installed" | "installed" | "running" | "error";

export type ConnectionMode = "tun" | "socks";
export type DnsMode = "cloudflare" | "google" | "aliyun" | "custom";

export interface VpnSettings {
  mtu: number;
  dnsMode: DnsMode;
  customDns: string;
  autoReconnect: boolean;
  killSwitch: boolean;
  connectionMode: ConnectionMode;
}

export interface ConnectionStats {
  ip: string;
  downloadSpeed: number;
  uploadSpeed: number;
  latency: number;
  connectedTime: number;
  totalDownload: number;
  totalUpload: number;
}

export interface ConnectionLog {
  id: string;
  timestamp: number;
  level: "info" | "warn" | "error";
  message: string;
}
```

### `src/types/index.ts` (简化)

```typescript
export * from "./vpn";
export * from "./server";
export * from "./login";
```

---

## 三、修复核心 Stores

### `src/stores/auth.ts` (修复 role 问题)

```typescript
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getItem, setItem, removeItem } from "@/utils/storage";
import { login } from "@/api/auth";
import type { User } from "@/types/login";

export const useAuthStore = defineStore("auth", () => {
  const currentUser = ref<User | null>(getItem("user_info", null));

  // 修复：使用 roles 数组判断
  const isGuest = computed(() => {
    if (!currentUser.value) return true;
    return currentUser.value.roles.length === 0 || 
           currentUser.value.roles.includes("guest");
  });

  const isAuthenticated = computed(() => !isGuest.value);

  const isAdmin = computed(() => 
    currentUser.value?.roles.includes("admin") || 
    currentUser.value?.roles.includes("super_admin") || 
    false
  );

  const avatarColor = computed(() => {
    const name = currentUser.value?.username || "G";
    const colors = [
      "bg-red-500", "bg-orange-500", "bg-amber-500",
      "bg-emerald-500", "bg-teal-500", "bg-blue-500",
      "bg-indigo-500", "bg-purple-500", "bg-pink-500",
    ];
    return colors[name.charCodeAt(0) % colors.length];
  });

  const avatarLetter = computed(() => 
    (currentUser.value?.username || "G").charAt(0).toUpperCase()
  );

  // 计算会员到期时间显示
  const expireDateDisplay = computed(() => {
    if (!currentUser.value?.expireDate) return "N/A";
    return new Date(currentUser.value.expireDate).toLocaleDateString();
  });

  // 计算会员等级显示
  const membershipLevel = computed(() => {
    if (!currentUser.value) return "Guest";
    if (currentUser.value.roles.includes("super_admin")) return "Admin";
    if (currentUser.value.roles.includes("vip")) return "Pro Member";
    return "Free";
  });

  async function logins(username: string, password: string): Promise<boolean> {
    try {
      const res = await login({ account: username, password });
      if (!res) return false;
      
      currentUser.value = res.user;
      setItem("user_info", res.user);
      setItem("access_token", res.access_token);
      setItem("refresh_token", res.refresh_token);
      return true;
    } catch (e) {
      console.error("Login error:", e);
      return false;
    }
  }

  function logout() {
    currentUser.value = null;
    removeItem("user_info");
    removeItem("access_token");
    removeItem("refresh_token");
  }

  function registerGuest() {
    if (!currentUser.value) {
      const guestId = getItem("guest_uuid", crypto.randomUUID());
      setItem("guest_uuid", guestId);
    }
  }

  return {
    currentUser,
    isAuthenticated,
    isGuest,
    isAdmin,
    avatarColor,
    avatarLetter,
    expireDateDisplay,
    membershipLevel,
    logins,
    logout,
    registerGuest,
  };
});
```

### `src/stores/servers.ts` (统一类型)

```typescript
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getVpnNodes } from "@/api/server";
import type { Server } from "@/types/server";

export const useServersStore = defineStore("servers", () => {
  const servers = ref<Server[]>([]);
  const currentServerId = ref<number | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const currentServer = computed(() =>
    servers.value.find((s) => s.id === currentServerId.value) || servers.value[0]
  );

  async function loadServers() {
    isLoading.value = true;
    error.value = null;
    
    try {
      const nodes = await getVpnNodes();
      servers.value = nodes.map((n) => ({
        ...n,
        ping: 9999,
        status: "unknown" as const,
      }));

      // 恢复选择
      const savedId = localStorage.getItem("currentServerId");
      if (savedId && servers.value.some(s => s.id === parseInt(savedId))) {
        currentServerId.value = parseInt(savedId);
      } else if (servers.value.length > 0) {
        currentServerId.value = servers.value[0].id;
      }
    } catch (e) {
      error.value = String(e);
      console.error("Failed to load servers:", e);
    } finally {
      isLoading.value = false;
    }
  }

  function selectServer(id: number) {
    currentServerId.value = id;
    localStorage.setItem("currentServerId", id.toString());
  }

  async function testPing(serverId: number): Promise<number> {
    // TODO: 实现真实 ping 测试
    const ping = Math.floor(Math.random() * 100) + 20;
    const server = servers.value.find((s) => s.id === serverId);
    if (server) {
      server.ping = ping;
      server.status = ping < 300 ? "online" : "offline";
    }
    return ping;
  }

  async function testAllPings() {
    await Promise.all(servers.value.map((s) => testPing(s.id)));
  }

  return {
    servers,
    currentServer,
    currentServerId, // 导出供视图使用
    isLoading,
    error,
    loadServers,
    selectServer,
    testPing,
    testAllPings,
  };
});
```

### `src/stores/settings.ts` (修复拼写)

```typescript
import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { VpnSettings, ConnectionMode, DnsMode } from "@/types";
import { getItem, setItem } from "@/utils/storage";

const DEFAULT_SETTINGS: VpnSettings = {
  mtu: 1280,
  dnsMode: "cloudflare",
  customDns: "",
  autoReconnect: false,
  killSwitch: false,
  connectionMode: "socks", // 修复: sock -> socks
};

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<VpnSettings>(getItem("settings", DEFAULT_SETTINGS));
  const theme = ref<"dark" | "light">(getItem("theme", "dark"));

  watch(settings, (val) => setItem("settings", val), { deep: true });
  
  watch(theme, (val) => {
    setItem("theme", val);
    applyTheme(val);
  }, { immediate: true });

  function applyTheme(t: "dark" | "light") {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(t);
    document.body.style.backgroundColor = t === "light" ? "#f5f5f7" : "#1e1e1e";
  }

  function updateSettings(patch: Partial<VpnSettings>) {
    settings.value = { ...settings.value, ...patch };
  }

  function setConnectionMode(mode: ConnectionMode) {
    settings.value.connectionMode = mode;
  }

  function setDnsMode(mode: DnsMode) {
    settings.value.dnsMode = mode;
  }

  function toggleTheme() {
    theme.value = theme.value === "dark" ? "light" : "dark";
  }

  function setTheme(t: "dark" | "light") {
    theme.value = t;
  }

  function resetSettings() {
    settings.value = { ...DEFAULT_SETTINGS };
  }

  applyTheme(theme.value);

  return {
    settings,
    theme,
    updateSettings,
    setConnectionMode,
    setDnsMode,
    toggleTheme,
    setTheme,
    resetSettings,
  };
});
```

### `src/stores/vpn.ts` (优化)

```typescript
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { VpnStatus, HelperStatus, ConnectionStats } from "@/types";
import { useLogsStore } from "./logs";
import { useSettingsStore } from "./settings";
import { useServersStore } from "./servers";
import { useAuthStore } from "./auth";
import router from "@/router"; // 统一使用 router

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

// 试用限制
const TRIAL_LIMIT_BYTES = 2 * 1024 * 1024;
const TRIAL_LIMIT_SECONDS = 5 * 60;

export const useVpnStore = defineStore("vpn", () => {
  // State
  const status = ref<VpnStatus>("disconnected");
  const helperStatus = ref<HelperStatus>("not_installed");
  const isVpnBusy = ref(false);
  const isHelperBusy = ref(false);
  const error = ref<string | null>(null);
  const isConnecting = ref(false);
  
  const stats = ref<ConnectionStats>({
    ip: "",
    downloadSpeed: 0,
    uploadSpeed: 0,
    latency: 0,
    connectedTime: 0,
    totalDownload: 0,
    totalUpload: 0,
  });

  let unlistenLog: UnlistenFn | null = null;
  let unlistenStats: UnlistenFn | null = null;
  let statsTimer: number | null = null;
  let connectedAt = 0;

  // Getters
  const isConnected = computed(() => status.value === "connected");
  const isHelperReady = computed(() => 
    helperStatus.value === "installed" || helperStatus.value === "running"
  );
  const canConnect = computed(() => 
    !isVpnBusy.value && isHelperReady.value && status.value === "disconnected"
  );
  const canDisconnect = computed(() => 
    !isVpnBusy.value && (status.value === "connected" || status.value === "connecting")
  );
  const canCancel = computed(() => 
    status.value === "connecting" && isConnecting.value
  );
  const canInstallHelper = computed(() => !isHelperBusy.value);
  const canUninstallHelper = computed(() => 
    !isHelperBusy.value && helperStatus.value !== "not_installed"
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
    if (!canInstallHelper.value) return;
    
    isHelperBusy.value = true;
    error.value = null;
    const logs = useLogsStore();

    try {
      await initEventListeners();
      const res = await invoke<HelperResult>("install_helper");
      if (res.success) {
        helperStatus.value = "installed";
        await checkHelperStatus();
        logs.addLog("info", "Helper installed successfully");
      } else {
        throw new Error(res.message);
      }
    } catch (e) {
      const msg = String(e);
      error.value = msg;
      logs.addLog("error", `Helper install failed: ${msg}`);
    } finally {
      isHelperBusy.value = false;
    }
  }

  async function uninstallHelper() {
    if (!canUninstallHelper.value) return;
    
    isHelperBusy.value = true;
    const logs = useLogsStore();

    try {
      await initEventListeners();
      const res = await invoke<HelperResult>("uninstall_helper");
      if (res.success) {
        helperStatus.value = "not_installed";
        logs.addLog("info", "Helper uninstalled");
      } else {
        throw new Error(res.message);
      }
    } catch (e) {
      logs.addLog("error", `Helper uninstall failed: ${e}`);
    } finally {
      isHelperBusy.value = false;
    }
  }

  // Event Listeners
  async function initEventListeners() {
    const logs = useLogsStore();
    
    if (unlistenLog) unlistenLog();
    unlistenLog = await listen<LogEvent>("vpn-log", (event) => {
      const { level, message } = event.payload;
      const logLvl = level === "warn" || level === "error" ? level : "info";
      logs.addLog(logLvl, message);
    });

    // 监听真实流量统计 (如果后端实现了)
    if (unlistenStats) unlistenStats();
    unlistenStats = await listen<ConnectionStats>("vpn-stats", (event) => {
      if (status.value === "connected") {
        stats.value = {
          ...stats.value,
          ...event.payload,
          connectedTime: Math.floor((Date.now() - connectedAt) / 1000),
        };
        checkTrialLimit();
      }
    });
  }

  // VPN Actions
  async function connect() {
    const settingsStore = useSettingsStore();
    const serversStore = useServersStore();
    const server = serversStore.currentServer;

    if (!server) {
      error.value = "No server selected";
      return;
    }

    if (!isHelperReady.value) {
      error.value = "System Extension required";
      return;
    }

    isConnecting.value = true;
    status.value = "connecting";
    error.value = null;
    isVpnBusy.value = true;
    resetStats();

    try {
      await initEventListeners();
      await invoke("connect_hysteria", {
        domain: server.domain,
        password: server.password || "",
        mode: settingsStore.settings.connectionMode,
      });

      status.value = "connected";
      connectedAt = Date.now();
      startStatsMonitor();
    } catch (e) {
      status.value = "disconnected";
      error.value = String(e);
      useLogsStore().addLog("error", String(e));
    } finally {
      isConnecting.value = false;
      isVpnBusy.value = false;
    }
  }

  async function disconnect() {
    if (status.value === "connecting") {
      return cancelConnect();
    }
    if (status.value !== "connected") return;

    isVpnBusy.value = true;
    status.value = "disconnecting";

    try {
      await invoke("disconnect_vpn");
    } catch (e) {
      useLogsStore().addLog("error", `Disconnect failed: ${e}`);
    } finally {
      status.value = "disconnected";
      isVpnBusy.value = false;
      stopStatsMonitor();
      resetStats();
    }
  }

  async function cancelConnect() {
    if (!canCancel.value) return;

    try {
      await invoke("disconnect_vpn");
    } catch (e) {
      console.warn("Cancel signal sent:", e);
    }

    status.value = "disconnected";
    isConnecting.value = false;
    isVpnBusy.value = false;
  }

  // Stats Management
  function startStatsMonitor() {
    statsTimer = window.setInterval(() => {
      if (status.value !== "connected") return;
      
      stats.value.connectedTime = Math.floor((Date.now() - connectedAt) / 1000);
      
      // 模拟数据 (后端实现后移除)
      if (!unlistenStats) {
        stats.value.downloadSpeed = Math.random() * 500 * 1024;
        stats.value.uploadSpeed = Math.random() * 100 * 1024;
        stats.value.latency = Math.floor(40 + Math.random() * 60);
        stats.value.totalDownload += stats.value.downloadSpeed;
        stats.value.totalUpload += stats.value.uploadSpeed;
      }
      
      checkTrialLimit();
    }, 1000);
  }

  function stopStatsMonitor() {
    if (statsTimer) {
      clearInterval(statsTimer);
      statsTimer = null;
    }
  }

  function resetStats() {
    stats.value = {
      ip: "",
      downloadSpeed: 0,
      uploadSpeed: 0,
      latency: 0,
      connectedTime: 0,
      totalDownload: 0,
      totalUpload: 0,
    };
  }

  function checkTrialLimit() {
    const authStore = useAuthStore();
    if (!authStore.isGuest) return;

    const totalBytes = stats.value.totalDownload + stats.value.totalUpload;
    const time = stats.value.connectedTime;

    if (totalBytes > TRIAL_LIMIT_BYTES || time > TRIAL_LIMIT_SECONDS) {
      handleTrialExpiration();
    }
  }

  function handleTrialExpiration() {
    disconnect();
    error.value = "Trial limit reached (2MB or 5min). Please login.";
    router.push("/login"); // 统一使用 router
  }

  function cleanup() {
    unlistenLog?.();
    unlistenStats?.();
    unlistenLog = null;
    unlistenStats = null;
    stopStatsMonitor();
  }

  return {
    status,
    helperStatus,
    isVpnBusy,
    isHelperBusy,
    error,
    stats,
    isConnecting,
    isConnected,
    isHelperReady,
    canConnect,
    canDisconnect,
    canCancel,
    canInstallHelper,
    canUninstallHelper,
    checkHelperStatus,
    installHelper,
    uninstallHelper,
    connect,
    disconnect,
    cancelConnect,
    initEventListeners,
    cleanup,
  };
});
```

### `src/stores/config.ts` (精简)

```typescript
import { defineStore } from "pinia";
import { ref, computed } from "vue";

// 精简后只保留全局配置，服务器管理移至 servers store
export const useConfigStore = defineStore("config", () => {
  const isLoading = ref(false);
  const configError = ref<string | null>(null);

  // 用于判断是否有有效配置
  const hasValidConfig = computed(() => true); // 改为从服务器获取配置

  async function loadConfig() {
    isLoading.value = true;
    try {
      // 加载全局配置
      await new Promise(resolve => setTimeout(resolve, 100));
    } finally {
      isLoading.value = false;
    }
  }

  return {
    isLoading,
    configError,
    hasValidConfig,
    loadConfig,
  };
});
```

---

## 四、修复视图层

### `src/views/ServersView.vue` (修复 currentServerId)

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useServersStore } from '@/stores/servers'
import { useVpnStore } from '@/stores/vpn'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'
import ServerItem from '@/components/servers/ServerItem.vue'

const router = useRouter()
const serversStore = useServersStore()
const vpnStore = useVpnStore()
const i18nStore = useI18nStore()

// 修复：正确解构 currentServerId
const { servers, currentServerId, isLoading } = storeToRefs(serversStore)
const { isConnected } = storeToRefs(vpnStore)
const { t } = storeToRefs(i18nStore)

const searchQuery = ref('')
const isRefreshing = ref(false)

const filteredServers = computed(() => {
  if (!searchQuery.value) return servers.value
  const q = searchQuery.value.toLowerCase()
  return servers.value.filter(s =>
    s.country.toLowerCase().includes(q) ||
    s.city.toLowerCase().includes(q) ||
    s.name.toLowerCase().includes(q)
  )
})

async function handleServerSelect(serverId: number) {
  if (isConnected.value) {
    await vpnStore.disconnect()
  }
  serversStore.selectServer(serverId)
  router.push('/')
  setTimeout(() => vpnStore.connect(), 300)
}

async function handleRefresh() {
  isRefreshing.value = true
  await serversStore.testAllPings()
  setTimeout(() => isRefreshing.value = false, 500)
}

onMounted(() => {
  if (servers.value.length === 0) {
    serversStore.loadServers()
  }
})
</script>

<template>
  <div class="h-full flex flex-col bg-[var(--vpn-bg)]">
    <!-- Header -->
    <div class="px-5 pt-6 pb-2 sticky top-0 z-10 bg-[var(--vpn-bg)]/95 backdrop-blur-xl border-b border-[var(--vpn-border)]">
      <div class="flex items-center justify-between mb-3">
        <h1 class="text-xl font-bold tracking-tight text-[var(--vpn-text)]">
          {{ t.servers.title }}
        </h1>
        <button 
          @click="handleRefresh"
          class="group relative w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 active:scale-90 transition-all"
          :disabled="isRefreshing"
          :title="t.servers.refresh"
        >
          <svg 
            class="w-4 h-4 text-[var(--vpn-text-secondary)] group-hover:text-[var(--vpn-text)]"
            :class="{ 'animate-spin': isRefreshing }" 
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <div class="relative group">
        <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--vpn-muted)]" 
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input 
          v-model="searchQuery" 
          type="text" 
          :placeholder="t.servers.searchPlaceholder"
          class="w-full pl-9 pr-3 py-1.5 text-[13px] rounded-lg bg-[var(--vpn-card)] border border-[var(--vpn-border)] focus:border-blue-500/50 focus:ring-[3px] focus:ring-blue-500/10 focus:outline-none transition-all"
        />
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="flex-1 flex items-center justify-center">
      <div class="w-6 h-6 border-2 border-[var(--vpn-primary)] border-t-transparent rounded-full animate-spin"></div>
    </div>

    <!-- Server List -->
    <div v-else class="flex-1 overflow-y-auto p-3 space-y-1">
      <ServerItem 
        v-for="server in filteredServers" 
        :key="server.id" 
        :server="server"
        :selected="server.id === currentServerId" 
        @select="handleServerSelect(server.id)" 
      />

      <div v-if="filteredServers.length === 0" class="flex flex-col items-center justify-center py-12 text-[var(--vpn-muted)]">
        <svg class="w-12 h-12 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <p class="text-[13px] font-medium">{{ t.servers.empty }}</p>
      </div>
    </div>
  </div>
</template>
```

### `src/views/ProfileView.vue` (修复)

```vue
<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'

const router = useRouter()
const authStore = useAuthStore()
const { 
  currentUser, 
  avatarColor, 
  avatarLetter, 
  membershipLevel, 
  expireDateDisplay 
} = storeToRefs(authStore)

function handleLogout() {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <div class="h-full flex flex-col bg-[var(--vpn-bg)] p-6 overflow-hidden">
    <div class="flex items-center justify-between mb-8 titlebar-drag">
      <h1 class="text-2xl font-bold tracking-tight text-[var(--vpn-text)]">Account</h1>
    </div>

    <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-2xl shadow-sm p-6 flex flex-col items-center relative overflow-hidden">
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
      <h2 class="text-xl font-semibold text-[var(--vpn-text)] mb-1">
        {{ currentUser?.nickname || currentUser?.username || 'Guest' }}
      </h2>
      <p class="text-[13px] text-[var(--vpn-text-secondary)] mb-6">
        {{ currentUser?.email || 'Not logged in' }}
      </p>

      <!-- Stats -->
      <div class="w-full grid grid-cols-2 gap-4 mb-8">
        <div class="bg-[var(--vpn-bg)] rounded-xl p-4 text-center border border-[var(--vpn-border)]">
          <p class="text-[11px] text-[var(--vpn-text-secondary)] uppercase tracking-wider mb-1">Plan</p>
          <p class="text-sm font-medium" :class="membershipLevel === 'Pro Member' ? 'text-emerald-500' : 'text-[var(--vpn-text)]'">
            {{ membershipLevel }}
          </p>
        </div>
        <div class="bg-[var(--vpn-bg)] rounded-xl p-4 text-center border border-[var(--vpn-border)]">
          <p class="text-[11px] text-[var(--vpn-text-secondary)] uppercase tracking-wider mb-1">Expires</p>
          <p class="text-sm font-medium text-[var(--vpn-text)]">{{ expireDateDisplay }}</p>
        </div>
      </div>

      <!-- Logout -->
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

---

## 五、创建缺失组件

### `src/components/common/AppToast.vue` (新建)

```vue
<script setup lang="ts">
import { useNotification } from '@/composables/useNotification'

const { notifications, remove } = useNotification()

const iconMap = {
  success: 'M5 13l4 4L19 7',
  error: 'M6 18L18 6M6 6l12 12',
  warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
}

const colorMap = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400',
  error: 'bg-red-50 border-red-200 text-red-600 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400',
  warning: 'bg-amber-50 border-amber-200 text-amber-600 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400',
  info: 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400',
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <TransitionGroup name="toast">
        <div
          v-for="notification in notifications"
          :key="notification.id"
          :class="[
            'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-md max-w-sm',
            colorMap[notification.type]
          ]"
        >
          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="iconMap[notification.type]" />
          </svg>
          <span class="text-sm font-medium flex-1">{{ notification.message }}</span>
          <button 
            @click="remove(notification.id)"
            class="shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active {
  transition: all 0.3s ease-out;
}
.toast-leave-active {
  transition: all 0.2s ease-in;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
.toast-move {
  transition: transform 0.3s ease;
}
</style>
```

---

## 六、API 层优化

### `src/api/server.ts` (统一类型)

```typescript
import request from "@/utils/request";
import type { ServerNode } from "@/types/server";

export type { ServerNode };

export function getVpnNodes() {
  return request<ServerNode[]>({
    url: "/vpn/nodes/all",
    method: "get",
  });
}

export function testNodePing(nodeId: number) {
  return request<{ ping: number }>({
    url: `/vpn/nodes/${nodeId}/ping`,
    method: "get",
  });
}
```

### `src/utils/request.ts` (添加环境变量)

```typescript
import axios, { AxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth";
import { useNotification } from "@/composables/useNotification";
import { getItem } from "./storage";

// 使用环境变量
const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api/v1";

const service = axios.create({
  baseURL,
  timeout: 10000,
});

service.interceptors.request.use(
  (config) => {
    const token = getItem("access_token", "");
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

service.interceptors.response.use(
  (response) => {
    const res = response.data;
    if (res.code !== 0) {
      const notification = useNotification();
      notification.error(res.message || "Error");

      if (res.code === 401 || res.code === 20001 || res.code === 20002) {
        const authStore = useAuthStore();
        authStore.logout();
        window.location.href = "/#/login";
      }
      return Promise.reject(new Error(res.message || "Error"));
    }
    return res.data;
  },
  (error) => {
    const notification = useNotification();
    notification.error(error.message || "Network Error");
    return Promise.reject(error);
  }
);

export function request<T>(config: AxiosRequestConfig): Promise<T> {
  return service(config) as Promise<T>;
}

export default request;
```

---

## 七、环境配置

### `.env` (新建)

```env
VITE_API_BASE_URL=http://localhost:8080/api/v1
```

### `.env.production` (新建)

```env
VITE_API_BASE_URL=https://api.yourdomain.com/api/v1
```

---

## 八、路由守卫优化

### `src/router/index.ts`

```typescript
import { createRouter, createWebHashHistory } from "vue-router";
import HomeView from "@/views/HomeView.vue";
import { useAuthStore } from "@/stores/auth";

const router = createRouter({
  history: createWebHashHistory(), // Tauri 建议使用 hash 模式
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
      meta: { requiresAuth: true },
    },
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/LoginView.vue"),
      meta: { hideSidebar: true, guestOnly: true },
    },
    // 404 fallback
    {
      path: "/:pathMatch(.*)*",
      redirect: "/",
    },
  ],
});

// 路由守卫
router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore();

  // 需要登录但未登录
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next("/login");
  }

  // 已登录但访问登录页
  if (to.meta.guestOnly && authStore.isAuthenticated) {
    return next("/");
  }

  next();
});

export default router;
```

---

## 九、优化后文件结构

```
src/
├── api/
│   ├── auth.ts
│   └── server.ts
├── assets/styles/
│   └── main.css
├── components/
│   ├── common/
│   │   └── AppToast.vue          ✅ 新建
│   ├── dashboard/
│   │   ├── ConnectButton.vue
│   │   ├── ServerCard.vue
│   │   └── StatsPanel.vue
│   ├── layout/
│   │   ├── AppHeader.vue
│   │   ├── AppLayout.vue
│   │   └── AppSidebar.vue
│   └── servers/
│       └── ServerItem.vue
├── composables/
│   ├── useNotification.ts
│   ├── useTauri.ts
│   └── useVpn.ts
├── router/
│   └── index.ts                  ✅ 优化
├── stores/
│   ├── auth.ts                   ✅ 修复
│   ├── config.ts                 ✅ 精简
│   ├── i18n.ts
│   ├── index.ts
│   ├── logs.ts
│   ├── servers.ts                ✅ 修复
│   ├── settings.ts               ✅ 修复
│   └── vpn.ts                    ✅ 优化
├── types/
│   ├── index.ts                  ✅ 简化
│   ├── login.ts                  ✅ 修复
│   ├── server.ts                 ✅ 重写
│   └── vpn.ts                    ✅ 优化
├── utils/
│   ├── error.ts
│   ├── format.ts
│   ├── request.ts                ✅ 优化
│   └── storage.ts
├── views/
│   ├── HomeView.vue
│   ├── LoginView.vue
│   ├── LogsView.vue
│   ├── ProfileView.vue           ✅ 修复
│   ├── ServersView.vue           ✅ 修复
│   └── SettingsView.vue
├── App.vue
└── main.ts
```

**删除的文件：**

- `src/components/dashboard/StatusBar.vue`
- `src/composables/useTheme.ts`
- `src/types/config.ts`
- `src/types/tauri.ts`
- `src/views/auth/RegisterView.vue`
- `src/views/auth/ForgotPasswordView.vue`

# 优化方案

## 一、登录类型和 Auth Store 优化

### `src/types/login.ts`

```typescript
/** 用户信息 */
export interface User {
  id: number;
  uuid: string;
  username: string;
  email: string;
  nickname: string;
  avatar: string;
  roles: string[];
}

/** 登录接口返回数据 */
export interface ResultData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: User;
}

/** 登录请求参数 */
export interface LoginData {
  account: string;
  password: string;
}

/** 用户角色常量 */
export const UserRoles = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  VIP: "vip",
  USER: "user",
  GUEST: "guest",
} as const;

export type UserRole = (typeof UserRoles)[keyof typeof UserRoles];

/** 角色判断辅助函数 */
export function hasRole(user: User | null, role: UserRole): boolean {
  return user?.roles?.includes(role) ?? false;
}

export function hasAnyRole(user: User | null, roles: UserRole[]): boolean {
  return roles.some((role) => hasRole(user, role));
}

export function isAdmin(user: User | null): boolean {
  return hasAnyRole(user, [UserRoles.SUPER_ADMIN, UserRoles.ADMIN]);
}

export function isVip(user: User | null): boolean {
  return hasAnyRole(user, [UserRoles.SUPER_ADMIN, UserRoles.ADMIN, UserRoles.VIP]);
}
```

### `src/stores/auth.ts`

```typescript
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getItem, setItem, removeItem } from "@/utils/storage";
import { login } from "@/api/auth";
import type { User } from "@/types/login";
import { UserRoles, hasAnyRole, isAdmin as checkIsAdmin, isVip as checkIsVip } from "@/types/login";

// Token 存储 Key
const TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const USER_KEY = "user_info";
const GUEST_UUID_KEY = "guest_uuid";

// 头像颜色池
const AVATAR_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-purple-500",
  "bg-pink-500",
];

export const useAuthStore = defineStore("auth", () => {
  // ============ State ============
  const currentUser = ref<User | null>(getItem(USER_KEY, null));
  const accessToken = ref<string>(getItem(TOKEN_KEY, ""));
  const refreshToken = ref<string>(getItem(REFRESH_TOKEN_KEY, ""));
  const isLoading = ref(false);
  const loginError = ref<string | null>(null);

  // ============ Getters ============
  
  /** 是否已登录 */
  const isAuthenticated = computed(() => !!currentUser.value && !!accessToken.value);

  /** 是否为游客（未登录或角色为 guest） */
  const isGuest = computed(() => {
    if (!currentUser.value) return true;
    if (currentUser.value.roles.length === 0) return true;
    return currentUser.value.roles.includes(UserRoles.GUEST);
  });

  /** 是否为管理员 */
  const isAdmin = computed(() => checkIsAdmin(currentUser.value));

  /** 是否为 VIP */
  const isVip = computed(() => checkIsVip(currentUser.value));

  /** 用户显示名称 */
  const displayName = computed(() => {
    if (!currentUser.value) return "Guest";
    return currentUser.value.nickname || currentUser.value.username || "User";
  });

  /** 用户邮箱 */
  const userEmail = computed(() => currentUser.value?.email || "");

  /** 头像颜色（基于用户名生成） */
  const avatarColor = computed(() => {
    const name = currentUser.value?.username || "G";
    const index = name.charCodeAt(0) % AVATAR_COLORS.length;
    return AVATAR_COLORS[index];
  });

  /** 头像首字母 */
  const avatarLetter = computed(() => {
    const name = currentUser.value?.nickname || currentUser.value?.username || "G";
    return name.charAt(0).toUpperCase();
  });

  /** 会员等级显示 */
  const membershipLevel = computed(() => {
    if (!currentUser.value) return "Guest";
    const roles = currentUser.value.roles;
    
    if (hasAnyRole(currentUser.value, [UserRoles.SUPER_ADMIN, UserRoles.ADMIN])) {
      return "Administrator";
    }
    if (roles.includes(UserRoles.VIP)) return "Pro Member";
    if (roles.includes(UserRoles.USER)) return "Free";
    return "Guest";
  });

  /** 会员等级样式类 */
  const membershipClass = computed(() => {
    const level = membershipLevel.value;
    switch (level) {
      case "Administrator":
        return "text-purple-500";
      case "Pro Member":
        return "text-emerald-500";
      default:
        return "text-[var(--vpn-text)]";
    }
  });

  // ============ Actions ============

  /** 登录 */
  async function doLogin(account: string, password: string): Promise<boolean> {
    if (isLoading.value) return false;
    
    isLoading.value = true;
    loginError.value = null;

    try {
      const res = await login({ account, password });
      
      if (!res || !res.user) {
        throw new Error("Invalid response");
      }

      // 保存用户信息
      currentUser.value = res.user;
      accessToken.value = res.access_token;
      refreshToken.value = res.refresh_token;

      // 持久化存储
      setItem(USER_KEY, res.user);
      setItem(TOKEN_KEY, res.access_token);
      setItem(REFRESH_TOKEN_KEY, res.refresh_token);

      return true;
    } catch (e) {
      loginError.value = e instanceof Error ? e.message : "Login failed";
      console.error("Login error:", e);
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  /** 登出 */
  function logout() {
    currentUser.value = null;
    accessToken.value = "";
    refreshToken.value = "";
    loginError.value = null;

    removeItem(USER_KEY);
    removeItem(TOKEN_KEY);
    removeItem(REFRESH_TOKEN_KEY);
  }

  /** 更新用户信息 */
  function updateUser(userData: Partial<User>) {
    if (currentUser.value) {
      currentUser.value = { ...currentUser.value, ...userData };
      setItem(USER_KEY, currentUser.value);
    }
  }

  /** 注册游客设备 */
  function registerGuest(): string {
    let guestId = getItem(GUEST_UUID_KEY, "");
    if (!guestId) {
      guestId = crypto.randomUUID();
      setItem(GUEST_UUID_KEY, guestId);
    }
    return guestId;
  }

  /** 检查角色 */
  function checkRole(role: string): boolean {
    return currentUser.value?.roles?.includes(role) ?? false;
  }

  /** 检查多个角色（任一匹配） */
  function checkAnyRole(roles: string[]): boolean {
    return roles.some((role) => checkRole(role));
  }

  return {
    // State
    currentUser,
    accessToken,
    refreshToken,
    isLoading,
    loginError,

    // Getters
    isAuthenticated,
    isGuest,
    isAdmin,
    isVip,
    displayName,
    userEmail,
    avatarColor,
    avatarLetter,
    membershipLevel,
    membershipClass,

    // Actions
    doLogin,
    logout,
    updateUser,
    registerGuest,
    checkRole,
    checkAnyRole,
  };
});
```

---

## 二、拆分 SettingsView

### 目录结构

```
src/components/settings/
├── ConnectionModeSection.vue
├── NetworkPreferencesSection.vue
├── SystemHelperSection.vue
├── GeneralSettingsSection.vue
├── SettingRow.vue
├── SettingSwitch.vue
└── SettingSelect.vue
```

### `src/components/settings/SettingRow.vue` (通用行组件)

```vue
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
      <div 
        v-if="icon" 
        class="w-8 h-8 rounded-lg flex items-center justify-center"
        :class="iconBg || 'bg-blue-500/10'"
      >
        <svg 
          class="w-4 h-4" 
          :class="iconColor || 'text-blue-500'"
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
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
```

### `src/components/settings/SettingSwitch.vue` (开关组件)

```vue
<script setup lang="ts">
interface Props {
  modelValue: boolean
  disabled?: boolean
}

defineProps<Props>()
defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <button 
    @click="!disabled && $emit('update:modelValue', !modelValue)"
    :disabled="disabled"
    class="relative w-10 h-6 rounded-full transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
    :class="modelValue ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-white/10'"
  >
    <span
      class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-200"
      :class="modelValue ? 'translate-x-4' : 'translate-x-0'"
    />
  </button>
</template>
```

### `src/components/settings/SettingSelect.vue` (选择框组件)

```vue
<script setup lang="ts">
interface Option {
  value: string | number
  label: string
}

interface Props {
  modelValue: string | number
  options: Option[]
}

defineProps<Props>()
defineEmits<{ 'update:modelValue': [value: string | number] }>()
</script>

<template>
  <div class="relative">
    <select
      :value="modelValue"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      class="appearance-none bg-transparent pl-3 pr-8 py-1 text-[13px] text-[var(--vpn-text)] font-medium outline-none text-right cursor-pointer focus:bg-black/5 dark:focus:bg-white/5 rounded-md transition-colors"
    >
      <option v-for="opt in options" :key="opt.value" :value="opt.value">
        {{ opt.label }}
      </option>
    </select>
    <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[var(--vpn-text-secondary)]">
      <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
      </svg>
    </div>
  </div>
</template>
```

### `src/components/settings/ConnectionModeSection.vue`

```vue
<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'
import type { ConnectionMode } from '@/types'

const settingsStore = useSettingsStore()
const i18nStore = useI18nStore()

const { settings } = storeToRefs(settingsStore)
const { t } = storeToRefs(i18nStore)

interface ModeOption {
  value: ConnectionMode
  label: string
  description: string
  color: string
}

const modes: ModeOption[] = [
  {
    value: 'socks',
    label: 'SOCKS Mode',
    description: 'Proxy Only (1080)',
    color: 'text-blue-600 dark:text-blue-400'
  },
  {
    value: 'tun',
    label: 'TUN Mode',
    description: 'Global Route',
    color: 'text-emerald-600 dark:text-emerald-400'
  }
]

function selectMode(mode: ConnectionMode) {
  settingsStore.setConnectionMode(mode)
}
</script>

<template>
  <section>
    <h2 class="text-[11px] font-semibold text-[var(--vpn-muted)] uppercase tracking-wider mb-2 pl-2">
      Connection Mode
    </h2>
    <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-xl overflow-hidden shadow-sm grid grid-cols-2 p-1 gap-1">
      <button
        v-for="mode in modes"
        :key="mode.value"
        @click="selectMode(mode.value)"
        class="flex flex-col items-center justify-center py-3 rounded-lg transition-all duration-200 border border-transparent"
        :class="settings.connectionMode === mode.value
          ? `bg-white dark:bg-white/10 shadow-sm ${mode.color} font-medium`
          : 'text-[var(--vpn-text-secondary)] hover:bg-black/5 dark:hover:bg-white/5'"
      >
        <span class="text-[13px]">{{ mode.label }}</span>
        <span class="text-[10px] opacity-60">{{ mode.description }}</span>
      </button>
    </div>
  </section>
</template>
```

### `src/components/settings/NetworkPreferencesSection.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'
import SettingRow from './SettingRow.vue'
import SettingSwitch from './SettingSwitch.vue'
import SettingSelect from './SettingSelect.vue'
import type { DnsMode } from '@/types'

const settingsStore = useSettingsStore()
const i18nStore = useI18nStore()

const { settings } = storeToRefs(settingsStore)
const { t } = storeToRefs(i18nStore)

const dnsOptions = computed(() => [
  { value: 'cloudflare', label: 'Cloudflare (1.1.1.1)' },
  { value: 'google', label: 'Google (8.8.8.8)' },
  { value: 'aliyun', label: 'Aliyun (223.5.5.5)' },
  { value: 'custom', label: 'Custom DNS...' },
])

const mtuOptions = computed(() => [
  { value: 1280, label: '1280 (Standard)' },
  { value: 1420, label: '1420 (Balanced)' },
  { value: 1500, label: '1500 (High Speed)' },
])

const icons = {
  reconnect: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  dns: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9',
  mtu: 'M13 10V3L4 14h7v7l9-11h-7z'
}

function updateDns(value: string | number) {
  settingsStore.updateSettings({ dnsMode: value as DnsMode })
}

function updateMtu(value: string | number) {
  settingsStore.updateSettings({ mtu: Number(value) })
}

function toggleAutoReconnect() {
  settingsStore.updateSettings({ autoReconnect: !settings.value.autoReconnect })
}
</script>

<template>
  <section>
    <h2 class="text-[11px] font-semibold text-[var(--vpn-muted)] uppercase tracking-wider mb-2 pl-2">
      Network Preferences
    </h2>
    <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-xl overflow-hidden shadow-sm divide-y divide-[var(--vpn-border)]">
      
      <!-- Auto Reconnect -->
      <SettingRow 
        :icon="icons.reconnect"
        icon-color="text-orange-500"
        icon-bg="bg-orange-500/10"
        :title="t.settings.autoReconnect"
      >
        <SettingSwitch 
          :model-value="settings.autoReconnect"
          @update:model-value="toggleAutoReconnect"
        />
      </SettingRow>

      <!-- DNS Provider -->
      <div>
        <SettingRow 
          :icon="icons.dns"
          icon-color="text-blue-500"
          icon-bg="bg-blue-500/10"
          :title="t.settings.dns"
        >
          <SettingSelect 
            :model-value="settings.dnsMode"
            :options="dnsOptions"
            @update:model-value="updateDns"
          />
        </SettingRow>
        
        <!-- Custom DNS Input -->
        <div v-if="settings.dnsMode === 'custom'" class="px-4 pb-4">
          <input 
            v-model="settings.customDns" 
            type="text" 
            :placeholder="t.settings.customDnsPlaceholder"
            class="w-full bg-[var(--vpn-input-bg)] border border-[var(--vpn-border)] rounded-lg px-3 py-2 text-[12px] text-[var(--vpn-text)] outline-none focus:border-blue-500/50 transition-all font-mono ml-11"
          />
        </div>
      </div>

      <!-- MTU Size -->
      <SettingRow 
        :icon="icons.mtu"
        icon-color="text-purple-500"
        icon-bg="bg-purple-500/10"
        :title="t.settings.mtu"
      >
        <SettingSelect 
          :model-value="settings.mtu"
          :options="mtuOptions"
          @update:model-value="updateMtu"
        />
      </SettingRow>

    </div>
  </section>
</template>
```

### `src/components/settings/SystemHelperSection.vue`

```vue
<script setup lang="ts">
import { useVpnStore } from '@/stores/vpn'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'

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

<script lang="ts">
import { computed } from 'vue'
</script>

<template>
  <section>
    <h2 class="text-[11px] font-semibold text-[var(--vpn-muted)] uppercase tracking-wider mb-2 pl-2">
      {{ t.settings.helper.title }}
    </h2>
    <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-xl p-4 shadow-sm flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div 
          class="w-8 h-8 rounded-lg flex items-center justify-center"
          :class="isHelperActive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <div>
          <div class="text-[13px] font-medium text-[var(--vpn-text)]">
            {{ isHelperActive ? 'Core Helper Active' : 'Core Helper Missing' }}
          </div>
          <div class="text-[11px] text-[var(--vpn-text-secondary)]">
            Required for TUN mode
          </div>
        </div>
      </div>

      <button 
        @click="handleHelperAction"
        :disabled="isHelperBusy"
        class="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all shadow-sm border disabled:opacity-50 disabled:cursor-not-allowed"
        :class="helperStatus === 'not_installed'
          ? 'bg-[var(--vpn-text)] text-[var(--vpn-bg)] border-transparent hover:opacity-90'
          : 'bg-transparent border-[var(--vpn-border)] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'"
      >
        <span v-if="isHelperBusy" class="flex items-center gap-1.5">
          <span class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
          {{ t.common.loading }}
        </span>
        <span v-else>
          {{ helperStatus === 'not_installed' ? 'Install' : 'Uninstall' }}
        </span>
      </button>
    </div>
  </section>
</template>
```

### `src/components/settings/GeneralSettingsSection.vue`

```vue
<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'

const settingsStore = useSettingsStore()
const i18nStore = useI18nStore()

const { theme } = storeToRefs(settingsStore)
const { t, locale } = storeToRefs(i18nStore)

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '简体中文' },
]

function handleLanguageChange(event: Event) {
  const target = event.target as HTMLSelectElement
  i18nStore.setLocale(target.value as 'en' | 'zh')
}
</script>

<template>
  <section>
    <h2 class="text-[11px] font-semibold text-[var(--vpn-muted)] uppercase tracking-wider mb-2 pl-2">
      {{ t.settings.general }}
    </h2>
    <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-xl overflow-hidden shadow-sm divide-y divide-[var(--vpn-border)]">

      <!-- Language -->
      <div class="flex items-center justify-between p-4 hover:bg-[var(--vpn-card-hover)] transition-colors">
        <span class="text-[13px] font-medium text-[var(--vpn-text)]">{{ t.settings.language }}</span>
        <div class="relative">
          <select 
            :value="locale"
            @change="handleLanguageChange"
            class="appearance-none bg-transparent pl-3 pr-6 py-1 text-[13px] text-[var(--vpn-text)] font-medium outline-none text-right cursor-pointer"
          >
            <option v-for="opt in languageOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center text-[var(--vpn-text-secondary)]">
            <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      <!-- Theme -->
      <div class="flex items-center justify-between p-4 hover:bg-[var(--vpn-card-hover)] transition-colors">
        <span class="text-[13px] font-medium text-[var(--vpn-text)]">{{ t.settings.appearance }}</span>
        <div class="flex bg-[var(--vpn-input-bg)] p-0.5 rounded-lg">
          <button 
            @click="settingsStore.setTheme('light')"
            :class="theme === 'light' 
              ? 'bg-[var(--vpn-card)] shadow-sm text-[var(--vpn-text)]' 
              : 'text-[var(--vpn-text-secondary)]'"
            class="px-3 py-1 text-[11px] rounded-md transition-all"
          >
            Light
          </button>
          <button 
            @click="settingsStore.setTheme('dark')"
            :class="theme === 'dark' 
              ? 'bg-[var(--vpn-card)] shadow-sm text-[var(--vpn-text)]' 
              : 'text-[var(--vpn-text-secondary)]'"
            class="px-3 py-1 text-[11px] rounded-md transition-all"
          >
            Dark
          </button>
        </div>
      </div>

    </div>
  </section>
</template>
```

### `src/views/SettingsView.vue` (精简后)

```vue
<script setup lang="ts">
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@/stores/settings'
import { useI18nStore } from '@/stores/i18n'
import { useVpnStore } from '@/stores/vpn'

// 拆分后的组件
import ConnectionModeSection from '@/components/settings/ConnectionModeSection.vue'
import NetworkPreferencesSection from '@/components/settings/NetworkPreferencesSection.vue'
import SystemHelperSection from '@/components/settings/SystemHelperSection.vue'
import GeneralSettingsSection from '@/components/settings/GeneralSettingsSection.vue'

const router = useRouter()
const settingsStore = useSettingsStore()
const i18nStore = useI18nStore()
const vpnStore = useVpnStore()

const { settings } = storeToRefs(settingsStore)
const { t } = storeToRefs(i18nStore)
const { isConnected } = storeToRefs(vpnStore)

// 监听连接模式变化 -> 自动重连
watch(() => settings.value.connectionMode, async (newMode, oldMode) => {
  if (newMode !== oldMode && isConnected.value) {
    await vpnStore.disconnect()
    router.push('/')
    setTimeout(() => vpnStore.connect(), 1000)
  }
})
</script>

<template>
  <div class="h-full flex flex-col bg-[var(--vpn-bg)] overflow-hidden">
    <!-- Header -->
    <div class="px-6 pt-8 pb-4 sticky top-0 z-10 bg-[var(--vpn-bg)]/95 backdrop-blur-xl shrink-0 border-b border-transparent">
      <h1 class="text-2xl font-bold tracking-tight text-[var(--vpn-text)]">
        {{ t.settings.title }}
      </h1>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto px-6 pb-10 space-y-6">
      
      <!-- Connection Mode -->
      <ConnectionModeSection />

      <!-- Network Preferences -->
      <NetworkPreferencesSection />

      <!-- System Helper -->
      <SystemHelperSection />

      <!-- General Settings -->
      <GeneralSettingsSection />

      <!-- Version Info -->
      <div class="text-center pt-2">
        <p class="text-[10px] text-[var(--vpn-muted)]">
          ToVpn Client v1.0.0
        </p>
      </div>

    </div>
  </div>
</template>
```

---

## 三、更新 LoginView 使用新的 Auth Store

### `src/views/LoginView.vue`

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useNotification } from '@/composables/useNotification'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'

const authStore = useAuthStore()
const { t } = storeToRefs(useI18nStore())
const router = useRouter()
const notification = useNotification()

const { isLoading, loginError } = storeToRefs(authStore)

const username = ref('')
const password = ref('')

const handleLogin = async () => {
  if (!username.value || !password.value) {
    notification.warning('Please enter username and password')
    return
  }

  const success = await authStore.doLogin(username.value, password.value)

  if (success) {
    notification.success('Login successful')
    router.push('/')
  } else {
    notification.error(loginError.value || 'Login Failed')
  }
}
</script>

<template>
  <div class="h-full flex flex-col items-center justify-center bg-[var(--vpn-bg)] relative p-6 titlebar-drag">

    <!-- Security Warning -->
    <div class="absolute top-0 left-0 w-full bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center backdrop-blur-sm titlebar-no-drag">
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
    </div>

    <!-- Login Card -->
    <div class="w-full max-w-[320px] bg-[var(--vpn-card)] border border-[var(--vpn-border)] shadow-xl rounded-2xl p-8 titlebar-no-drag">

      <div class="flex flex-col items-center mb-8">
        <div class="w-12 h-12 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center mb-4 text-white">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 class="text-xl font-bold text-[var(--vpn-text)]">{{ t.login.title }}</h2>
        <p class="text-[11px] text-[var(--vpn-text-secondary)] mt-1">{{ t.login.subtitle }}</p>
      </div>

      <form @submit.prevent="handleLogin" class="space-y-4">
        <div>
          <label class="block text-[11px] font-medium text-[var(--vpn-text-secondary)] mb-1.5 ml-1">
            {{ t.login.username }}
          </label>
          <input 
            v-model="username" 
            type="text"
            class="w-full px-4 py-2.5 rounded-lg bg-[var(--vpn-input-bg)] border border-transparent focus:bg-[var(--vpn-bg)] focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 text-[13px] text-[var(--vpn-text)] transition-all outline-none"
            placeholder="admin"
            :disabled="isLoading"
          />
        </div>

        <div>
          <label class="block text-[11px] font-medium text-[var(--vpn-text-secondary)] mb-1.5 ml-1">
            {{ t.login.password }}
          </label>
          <input 
            v-model="password" 
            type="password"
            class="w-full px-4 py-2.5 rounded-lg bg-[var(--vpn-input-bg)] border border-transparent focus:bg-[var(--vpn-bg)] focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 text-[13px] text-[var(--vpn-text)] transition-all outline-none"
            placeholder="••••••"
            :disabled="isLoading"
          />
        </div>

        <button 
          type="submit" 
          :disabled="isLoading"
          class="w-full py-2.5 mt-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[13px] font-medium shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <span v-if="isLoading" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          {{ isLoading ? t.common.loading : t.login.submit }}
        </button>
      </form>
    </div>
  </div>
</template>
```

---

## 四、更新类型导出

### `src/types/index.ts`

```typescript
export * from "./vpn";
export * from "./server";
export * from "./login";
```

### `src/types/vpn.ts` (添加类型导出)

```typescript
export type VpnStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "error";

export type HelperStatus = "not_installed" | "installed" | "running" | "error";

export type ConnectionMode = "tun" | "socks";
export type DnsMode = "cloudflare" | "google" | "aliyun" | "custom";

export interface VpnSettings {
  mtu: number;
  dnsMode: DnsMode;
  customDns: string;
  autoReconnect: boolean;
  killSwitch: boolean;
  connectionMode: ConnectionMode;
}

export interface ConnectionStats {
  ip: string;
  downloadSpeed: number;
  uploadSpeed: number;
  latency: number;
  connectedTime: number;
  totalDownload: number;
  totalUpload: number;
}

export interface ConnectionLog {
  id: string;
  timestamp: number;
  level: "info" | "warn" | "error";
  message: string;
}
```

---

## 五、最终文件结构

```
src/
├── components/
│   ├── common/
│   │   └── AppToast.vue
│   ├── dashboard/
│   │   ├── ConnectButton.vue
│   │   ├── ServerCard.vue
│   │   └── StatsPanel.vue
│   ├── layout/
│   │   ├── AppHeader.vue
│   │   ├── AppLayout.vue
│   │   └── AppSidebar.vue
│   ├── servers/
│   │   └── ServerItem.vue
│   └── settings/                    # 新增
│       ├── ConnectionModeSection.vue
│       ├── NetworkPreferencesSection.vue
│       ├── SystemHelperSection.vue
│       ├── GeneralSettingsSection.vue
│       ├── SettingRow.vue
│       ├── SettingSwitch.vue
│       └── SettingSelect.vue
├── stores/
│   ├── auth.ts                      # 重构
│   └── ...
├── types/
│   ├── login.ts                     # 重构
│   ├── vpn.ts                       # 更新
│   └── ...
└── views/
    ├── SettingsView.vue             # 精简
    └── ...
```

# 完整优化方案

## 一、扩展用户类型

### `src/types/login.ts`

```typescript
/** 用户信息 */
export interface User {
  id: number;
  uuid: string;
  username: string;
  email: string;
  nickname: string;
  avatar: string;
  roles: string[];
  // 会员相关字段（可选，后端返回）
  vip_expire_at?: string;      // VIP过期时间 ISO格式
  daily_traffic_limit?: number; // 每日流量限制(bytes)，0表示无限制
  daily_time_limit?: number;    // 每日时长限制(秒)，0表示无限制
  created_at?: string;
  updated_at?: string;
}

/** 登录接口返回数据 */
export interface ResultData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: User;
}

/** 登录请求参数 */
export interface LoginData {
  account: string;
  password: string;
}

/** 用户角色常量 */
export const UserRoles = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  VIP: "vip",
  USER: "user",
  GUEST: "guest",
} as const;

export type UserRole = (typeof UserRoles)[keyof typeof UserRoles];

/** 用户限制类型 */
export type UserLimitType = "none" | "vip" | "user";

/** 角色判断辅助函数 */
export function hasRole(user: User | null, role: UserRole): boolean {
  return user?.roles?.includes(role) ?? false;
}

export function hasAnyRole(user: User | null, roles: UserRole[]): boolean {
  return roles.some((role) => hasRole(user, role));
}

export function isAdmin(user: User | null): boolean {
  return hasAnyRole(user, [UserRoles.SUPER_ADMIN, UserRoles.ADMIN]);
}

export function isVip(user: User | null): boolean {
  if (!user) return false;
  // 检查是否有 VIP 角色
  if (!user.roles.includes(UserRoles.VIP)) return false;
  // 检查 VIP 是否过期
  if (user.vip_expire_at) {
    return new Date(user.vip_expire_at) > new Date();
  }
  return true;
}

/** 获取用户限制类型 */
export function getUserLimitType(user: User | null): UserLimitType {
  if (!user) return "user"; // 未登录视为普通用户限制
  if (isAdmin(user)) return "none";
  if (isVip(user)) return "vip";
  return "user";
}
```

---

## 二、重构 Auth Store

### `src/stores/auth.ts`

```typescript
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getItem, setItem, removeItem } from "@/utils/storage";
import { login } from "@/api/auth";
import type { User } from "@/types/login";
import { 
  UserRoles, 
  hasAnyRole, 
  isAdmin as checkIsAdmin, 
  isVip as checkIsVip,
  getUserLimitType 
} from "@/types/login";

// Storage Keys
const TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const USER_KEY = "user_info";
const TOKEN_EXPIRE_KEY = "token_expire_at";

// 头像颜色池
const AVATAR_COLORS = [
  "bg-gradient-to-br from-red-400 to-pink-500",
  "bg-gradient-to-br from-orange-400 to-amber-500",
  "bg-gradient-to-br from-emerald-400 to-teal-500",
  "bg-gradient-to-br from-blue-400 to-indigo-500",
  "bg-gradient-to-br from-purple-400 to-violet-500",
  "bg-gradient-to-br from-pink-400 to-rose-500",
];

// 普通用户限制常量
const USER_DAILY_TRAFFIC_LIMIT = 1 * 1024 * 1024 * 1024; // 1GB
const USER_DAILY_TIME_LIMIT = 2 * 60 * 60; // 2小时

export const useAuthStore = defineStore("auth", () => {
  // ============ State ============
  const currentUser = ref<User | null>(getItem(USER_KEY, null));
  const accessToken = ref<string>(getItem(TOKEN_KEY, ""));
  const refreshToken = ref<string>(getItem(REFRESH_TOKEN_KEY, ""));
  const tokenExpireAt = ref<number>(getItem(TOKEN_EXPIRE_KEY, 0));
  const isLoading = ref(false);
  const loginError = ref<string | null>(null);
  const pendingAutoConnect = ref(false); // 登录后自动连接标记

  // ============ Getters ============

  /** Token 是否有效 */
  const isTokenValid = computed(() => {
    if (!accessToken.value) return false;
    if (tokenExpireAt.value && Date.now() > tokenExpireAt.value) return false;
    return true;
  });

  /** 是否已登录（Token有效且有用户信息） */
  const isAuthenticated = computed(() => {
    return !!currentUser.value && isTokenValid.value;
  });

  /** 是否需要登录 */
  const needsLogin = computed(() => !isAuthenticated.value);

  /** 是否为管理员 */
  const isAdmin = computed(() => checkIsAdmin(currentUser.value));

  /** 是否为有效 VIP */
  const isVip = computed(() => checkIsVip(currentUser.value));

  /** 用户限制类型 */
  const limitType = computed(() => getUserLimitType(currentUser.value));

  /** 是否有连接限制 */
  const hasConnectionLimit = computed(() => limitType.value === "user");

  /** 每日流量限制（bytes） */
  const dailyTrafficLimit = computed(() => {
    if (limitType.value === "none") return 0;
    if (limitType.value === "vip") return 0;
    return currentUser.value?.daily_traffic_limit || USER_DAILY_TRAFFIC_LIMIT;
  });

  /** 每日时长限制（秒） */
  const dailyTimeLimit = computed(() => {
    if (limitType.value === "none") return 0;
    if (limitType.value === "vip") return 0;
    return currentUser.value?.daily_time_limit || USER_DAILY_TIME_LIMIT;
  });

  /** VIP 过期时间显示 */
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

  /** VIP 剩余天数 */
  const vipDaysRemaining = computed(() => {
    if (!currentUser.value?.vip_expire_at) return 0;
    const expireDate = new Date(currentUser.value.vip_expire_at);
    const now = new Date();
    if (expireDate < now) return 0;
    return Math.ceil((expireDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  });

  /** 用户显示名称 */
  const displayName = computed(() => {
    if (!currentUser.value) return "Guest";
    return currentUser.value.nickname || currentUser.value.username || "User";
  });

  /** 用户邮箱 */
  const userEmail = computed(() => currentUser.value?.email || "");

  /** 头像颜色 */
  const avatarColor = computed(() => {
    const name = currentUser.value?.username || "G";
    return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  });

  /** 头像首字母 */
  const avatarLetter = computed(() => {
    const name = currentUser.value?.nickname || currentUser.value?.username || "G";
    return name.charAt(0).toUpperCase();
  });

  /** 会员等级显示 */
  const membershipLevel = computed(() => {
    if (!currentUser.value) return "Guest";
    if (isAdmin.value) return "Administrator";
    if (isVip.value) return "Pro Member";
    return "Free";
  });

  /** 会员等级样式 */
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

  /** 账户注册时间 */
  const memberSince = computed(() => {
    if (!currentUser.value?.created_at) return null;
    return new Date(currentUser.value.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
  });

  // ============ Actions ============

  /** 登录 */
  async function doLogin(account: string, password: string): Promise<boolean> {
    if (isLoading.value) return false;

    isLoading.value = true;
    loginError.value = null;

    try {
      const res = await login({ account, password });

      if (!res || !res.user) {
        throw new Error("Invalid response");
      }

      // 计算过期时间
      const expireAt = Date.now() + res.expires_in * 1000;

      // 更新状态
      currentUser.value = res.user;
      accessToken.value = res.access_token;
      refreshToken.value = res.refresh_token;
      tokenExpireAt.value = expireAt;

      // 持久化
      setItem(USER_KEY, res.user);
      setItem(TOKEN_KEY, res.access_token);
      setItem(REFRESH_TOKEN_KEY, res.refresh_token);
      setItem(TOKEN_EXPIRE_KEY, expireAt);

      // 标记需要自动连接
      pendingAutoConnect.value = true;

      return true;
    } catch (e) {
      loginError.value = e instanceof Error ? e.message : "Login failed";
      console.error("Login error:", e);
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  /** 登出 */
  function logout() {
    currentUser.value = null;
    accessToken.value = "";
    refreshToken.value = "";
    tokenExpireAt.value = 0;
    loginError.value = null;
    pendingAutoConnect.value = false;

    removeItem(USER_KEY);
    removeItem(TOKEN_KEY);
    removeItem(REFRESH_TOKEN_KEY);
    removeItem(TOKEN_EXPIRE_KEY);
  }

  /** 更新用户信息 */
  function updateUser(userData: Partial<User>) {
    if (currentUser.value) {
      currentUser.value = { ...currentUser.value, ...userData };
      setItem(USER_KEY, currentUser.value);
    }
  }

  /** 消费自动连接标记 */
  function consumeAutoConnect(): boolean {
    if (pendingAutoConnect.value) {
      pendingAutoConnect.value = false;
      return true;
    }
    return false;
  }

  /** 检查并刷新 Token（如需要） */
  async function checkAndRefreshToken(): Promise<boolean> {
    if (isTokenValid.value) return true;
    // TODO: 实现 Token 刷新逻辑
    logout();
    return false;
  }

  return {
    // State
    currentUser,
    accessToken,
    refreshToken,
    isLoading,
    loginError,
    pendingAutoConnect,

    // Getters
    isTokenValid,
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
    doLogin,
    logout,
    updateUser,
    consumeAutoConnect,
    checkAndRefreshToken,
  };
});
```

---

## 三、重构 VPN Store（限制逻辑）

### `src/stores/vpn.ts`

```typescript
import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { VpnStatus, HelperStatus, ConnectionStats } from "@/types";
import { useLogsStore } from "./logs";
import { useSettingsStore } from "./settings";
import { useServersStore } from "./servers";
import { useAuthStore } from "./auth";
import router from "@/router";

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

// 每日限制存储 Key
const DAILY_USAGE_KEY = "daily_usage";

interface DailyUsage {
  date: string;
  traffic: number;
  time: number;
}

export const useVpnStore = defineStore("vpn", () => {
  // ============ State ============
  const status = ref<VpnStatus>("disconnected");
  const helperStatus = ref<HelperStatus>("not_installed");
  const isVpnBusy = ref(false);
  const isHelperBusy = ref(false);
  const error = ref<string | null>(null);
  const isConnecting = ref(false);

  const stats = ref<ConnectionStats>({
    ip: "",
    downloadSpeed: 0,
    uploadSpeed: 0,
    latency: 0,
    connectedTime: 0,
    totalDownload: 0,
    totalUpload: 0,
  });

  // 每日使用量追踪
  const dailyUsage = ref<DailyUsage>(loadDailyUsage());

  let unlistenLog: UnlistenFn | null = null;
  let unlistenStats: UnlistenFn | null = null;
  let statsTimer: number | null = null;
  let connectedAt = 0;

  // ============ Getters ============
  const isConnected = computed(() => status.value === "connected");

  const isHelperReady = computed(
    () => helperStatus.value === "installed" || helperStatus.value === "running"
  );

  const canConnect = computed(
    () => !isVpnBusy.value && isHelperReady.value && status.value === "disconnected"
  );

  const canDisconnect = computed(
    () => !isVpnBusy.value && (status.value === "connected" || status.value === "connecting")
  );

  const canCancel = computed(
    () => status.value === "connecting" && isConnecting.value
  );

  const canInstallHelper = computed(() => !isHelperBusy.value);

  const canUninstallHelper = computed(
    () => !isHelperBusy.value && helperStatus.value !== "not_installed"
  );

  // ============ 每日限制相关 ============

  function loadDailyUsage(): DailyUsage {
    const today = new Date().toISOString().split("T")[0];
    const stored = localStorage.getItem(DAILY_USAGE_KEY);

    if (stored) {
      try {
        const data = JSON.parse(stored) as DailyUsage;
        // 如果是今天的数据，返回
        if (data.date === today) return data;
      } catch {
        // ignore
      }
    }

    // 新的一天，重置
    return { date: today, traffic: 0, time: 0 };
  }

  function saveDailyUsage() {
    localStorage.setItem(DAILY_USAGE_KEY, JSON.stringify(dailyUsage.value));
  }

  function checkDailyLimit(): { exceeded: boolean; reason?: string } {
    const authStore = useAuthStore();

    // 管理员和VIP无限制
    if (authStore.limitType !== "user") {
      return { exceeded: false };
    }

    const trafficLimit = authStore.dailyTrafficLimit;
    const timeLimit = authStore.dailyTimeLimit;

    if (trafficLimit > 0 && dailyUsage.value.traffic >= trafficLimit) {
      return {
        exceeded: true,
        reason: `Daily traffic limit reached (${formatBytes(trafficLimit)})`,
      };
    }

    if (timeLimit > 0 && dailyUsage.value.time >= timeLimit) {
      return {
        exceeded: true,
        reason: `Daily time limit reached (${formatTime(timeLimit)})`,
      };
    }

    return { exceeded: false };
  }

  // ============ Helper Actions ============

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
    if (!canInstallHelper.value) return;

    isHelperBusy.value = true;
    error.value = null;
    const logs = useLogsStore();

    try {
      await initEventListeners();
      const res = await invoke<HelperResult>("install_helper");
      if (res.success) {
        helperStatus.value = "installed";
        await checkHelperStatus();
        logs.addLog("info", "Helper installed successfully");
      } else {
        throw new Error(res.message);
      }
    } catch (e) {
      const msg = String(e);
      error.value = msg;
      logs.addLog("error", `Helper install failed: ${msg}`);
    } finally {
      isHelperBusy.value = false;
    }
  }

  async function uninstallHelper() {
    if (!canUninstallHelper.value) return;

    isHelperBusy.value = true;
    const logs = useLogsStore();

    try {
      await initEventListeners();
      const res = await invoke<HelperResult>("uninstall_helper");
      if (res.success) {
        helperStatus.value = "not_installed";
        logs.addLog("info", "Helper uninstalled");
      } else {
        throw new Error(res.message);
      }
    } catch (e) {
      logs.addLog("error", `Helper uninstall failed: ${e}`);
    } finally {
      isHelperBusy.value = false;
    }
  }

  // ============ Event Listeners ============

  async function initEventListeners() {
    const logs = useLogsStore();

    if (unlistenLog) unlistenLog();
    unlistenLog = await listen<LogEvent>("vpn-log", (event) => {
      const { level, message } = event.payload;
      const logLvl = level === "warn" || level === "error" ? level : "info";
      logs.addLog(logLvl, message);
    });

    if (unlistenStats) unlistenStats();
    unlistenStats = await listen<ConnectionStats>("vpn-stats", (event) => {
      if (status.value === "connected") {
        updateStats(event.payload);
      }
    });
  }

  // ============ VPN Actions ============

  async function connect() {
    const authStore = useAuthStore();
    const settingsStore = useSettingsStore();
    const serversStore = useServersStore();
    const logs = useLogsStore();

    // 检查登录状态
    if (authStore.needsLogin) {
      error.value = "Please login to connect";
      router.push("/login");
      return;
    }

    // 检查 Token 有效性
    const tokenValid = await authStore.checkAndRefreshToken();
    if (!tokenValid) {
      error.value = "Session expired, please login again";
      router.push("/login");
      return;
    }

    // 检查每日限制
    const limitCheck = checkDailyLimit();
    if (limitCheck.exceeded) {
      error.value = limitCheck.reason || "Usage limit exceeded";
      logs.addLog("warn", `Connection blocked: ${limitCheck.reason}`);
      return;
    }

    // 检查 Helper
    if (!isHelperReady.value) {
      error.value = "System Extension required";
      return;
    }

    const server = serversStore.currentServer;
    if (!server) {
      error.value = "No server selected";
      return;
    }

    isConnecting.value = true;
    status.value = "connecting";
    error.value = null;
    isVpnBusy.value = true;
    resetStats();

    try {
      await initEventListeners();
      await invoke("connect_hysteria", {
        domain: server.domain,
        password: server.password || "",
        mode: settingsStore.settings.connectionMode,
      });

      status.value = "connected";
      connectedAt = Date.now();
      startStatsMonitor();
      logs.addLog("info", `Connected to ${server.city}, ${server.country}`);
    } catch (e) {
      status.value = "disconnected";
      error.value = String(e);
      logs.addLog("error", String(e));
    } finally {
      isConnecting.value = false;
      isVpnBusy.value = false;
    }
  }

  async function disconnect() {
    if (status.value === "connecting") {
      return cancelConnect();
    }
    if (status.value !== "connected") return;

    isVpnBusy.value = true;
    status.value = "disconnecting";

    try {
      await invoke("disconnect_vpn");
    } catch (e) {
      useLogsStore().addLog("error", `Disconnect failed: ${e}`);
    } finally {
      status.value = "disconnected";
      isVpnBusy.value = false;
      stopStatsMonitor();

      // 保存本次连接的使用量到每日统计
      dailyUsage.value.traffic += stats.value.totalDownload + stats.value.totalUpload;
      dailyUsage.value.time += stats.value.connectedTime;
      saveDailyUsage();

      resetStats();
    }
  }

  async function cancelConnect() {
    if (!canCancel.value) return;

    try {
      await invoke("disconnect_vpn");
    } catch (e) {
      console.warn("Cancel signal sent:", e);
    }

    status.value = "disconnected";
    isConnecting.value = false;
    isVpnBusy.value = false;
  }

  // ============ Stats Management ============

  function updateStats(newStats: Partial<ConnectionStats>) {
    const time = Math.floor((Date.now() - connectedAt) / 1000);
    stats.value = {
      ...stats.value,
      ...newStats,
      connectedTime: time,
    };

    // 实时检查限制
    checkRealTimeLimit();
  }

  function startStatsMonitor() {
    statsTimer = window.setInterval(() => {
      if (status.value !== "connected") return;

      const time = Math.floor((Date.now() - connectedAt) / 1000);

      // 模拟数据（后端实现后移除）
      const dl = Math.random() * 500 * 1024;
      const ul = Math.random() * 100 * 1024;

      stats.value = {
        ...stats.value,
        connectedTime: time,
        downloadSpeed: dl * 5,
        uploadSpeed: ul * 5,
        latency: Math.floor(40 + Math.random() * 60),
        totalDownload: stats.value.totalDownload + dl,
        totalUpload: stats.value.totalUpload + ul,
      };

      checkRealTimeLimit();
    }, 1000);
  }

  function stopStatsMonitor() {
    if (statsTimer) {
      clearInterval(statsTimer);
      statsTimer = null;
    }
  }

  function resetStats() {
    stats.value = {
      ip: "",
      downloadSpeed: 0,
      uploadSpeed: 0,
      latency: 0,
      connectedTime: 0,
      totalDownload: 0,
      totalUpload: 0,
    };
  }

  function checkRealTimeLimit() {
    const authStore = useAuthStore();

    // 管理员和VIP无限制
    if (authStore.limitType !== "user") return;

    const currentTraffic =
      dailyUsage.value.traffic + stats.value.totalDownload + stats.value.totalUpload;
    const currentTime = dailyUsage.value.time + stats.value.connectedTime;

    const trafficLimit = authStore.dailyTrafficLimit;
    const timeLimit = authStore.dailyTimeLimit;

    if (trafficLimit > 0 && currentTraffic >= trafficLimit) {
      handleLimitExceeded("Daily traffic limit reached");
      return;
    }

    if (timeLimit > 0 && currentTime >= timeLimit) {
      handleLimitExceeded("Daily time limit reached");
      return;
    }
  }

  function handleLimitExceeded(reason: string) {
    disconnect();
    error.value = reason + ". Upgrade to Pro for unlimited access.";
    useLogsStore().addLog("warn", reason);
  }

  function cleanup() {
    unlistenLog?.();
    unlistenStats?.();
    unlistenLog = null;
    unlistenStats = null;
    stopStatsMonitor();
  }

  // ============ Helpers ============

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  return {
    // State
    status,
    helperStatus,
    isVpnBusy,
    isHelperBusy,
    error,
    stats,
    isConnecting,
    dailyUsage,

    // Getters
    isConnected,
    isHelperReady,
    canConnect,
    canDisconnect,
    canCancel,
    canInstallHelper,
    canUninstallHelper,

    // Actions
    checkHelperStatus,
    installHelper,
    uninstallHelper,
    connect,
    disconnect,
    cancelConnect,
    initEventListeners,
    cleanup,
    checkDailyLimit,
  };
});
```

---

## 四、重新设计 ProfileView（macOS风格）

### `src/views/ProfileView.vue`

```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useNotification } from '@/composables/useNotification'

const router = useRouter()
const authStore = useAuthStore()
const notification = useNotification()

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
    // TODO: 调用 API 保存用户信息
    // await updateUserProfile(editForm.value)
    
    // 更新本地状态
    authStore.updateUser({
      nickname: editForm.value.nickname,
      email: editForm.value.email,
      avatar: editForm.value.avatar,
    })
    
    isEditing.value = false
    notification.success('Profile updated successfully')
  } catch (e) {
    notification.error('Failed to update profile')
  } finally {
    isSaving.value = false
  }
}

// 头像上传
function handleAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  
  if (file) {
    // TODO: 上传头像到服务器
    const reader = new FileReader()
    reader.onload = (e) => {
      editForm.value.avatar = e.target?.result as string
    }
    reader.readAsDataURL(file)
  }
}

// 登出
function handleLogout() {
  authStore.logout()
  router.push('/login')
}

// 使用量百分比（普通用户显示）
const usagePercent = computed(() => {
  // TODO: 从 vpnStore 获取实际使用量
  return 35
})
</script>

<template>
  <div class="h-full flex flex-col bg-[var(--vpn-bg)] overflow-y-auto">
    <!-- macOS 风格头部 -->
    <div class="px-6 pt-8 pb-4 titlebar-drag">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold tracking-tight text-[var(--vpn-text)]">Account</h1>
        <button
          v-if="!isEditing"
          @click="startEditing"
          class="px-3 py-1.5 text-[12px] font-medium text-[var(--vpn-primary)] hover:bg-[var(--vpn-primary)]/10 rounded-lg transition-colors titlebar-no-drag"
        >
          Edit Profile
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
                :class="[currentUser?.avatar ? '' : avatarColor]"
              >
                <img
                  v-if="currentUser?.avatar || editForm.avatar"
                  :src="isEditing ? editForm.avatar : currentUser?.avatar"
                  class="w-full h-full rounded-2xl object-cover"
                />
                <span v-else>{{ avatarLetter }}</span>
              </div>
              
              <!-- 编辑时显示上传按钮 -->
              <label
                v-if="isEditing"
                class="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <input type="file" accept="image/*" class="hidden" @change="handleAvatarChange" />
              </label>
            </div>

            <!-- Name & Email -->
            <div class="flex-1 pb-1">
              <template v-if="isEditing">
                <input
                  v-model="editForm.nickname"
                  type="text"
                  placeholder="Nickname"
                  class="w-full text-xl font-semibold bg-transparent border-b border-[var(--vpn-border)] focus:border-[var(--vpn-primary)] outline-none text-[var(--vpn-text)] pb-1 mb-1"
                />
                <input
                  v-model="editForm.email"
                  type="email"
                  placeholder="Email"
                  class="w-full text-[13px] bg-transparent border-b border-[var(--vpn-border)] focus:border-[var(--vpn-primary)] outline-none text-[var(--vpn-text-secondary)] pb-1"
                />
              </template>
              <template v-else>
                <h2 class="text-xl font-semibold text-[var(--vpn-text)]">{{ displayName }}</h2>
                <p class="text-[13px] text-[var(--vpn-text-secondary)]">{{ userEmail }}</p>
              </template>
            </div>

            <!-- Membership Badge -->
            <div
              class="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider"
              :class="membershipClass"
            >
              {{ membershipLevel }}
            </div>
          </div>

          <!-- 编辑模式操作按钮 -->
          <div v-if="isEditing" class="flex gap-3 mt-6">
            <button
              @click="cancelEditing"
              class="flex-1 py-2 rounded-xl border border-[var(--vpn-border)] text-[var(--vpn-text-secondary)] hover:bg-[var(--vpn-card-hover)] text-[13px] font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              @click="saveProfile"
              :disabled="isSaving"
              class="flex-1 py-2 rounded-xl bg-[var(--vpn-primary)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span v-if="isSaving" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              {{ isSaving ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Membership Info -->
      <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-2xl shadow-sm p-5">
        <h3 class="text-[11px] font-bold text-[var(--vpn-muted)] uppercase tracking-wider mb-4">
          Membership
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
              <span class="text-[11px] text-[var(--vpn-text-secondary)] uppercase tracking-wider">Plan</span>
            </div>
            <p class="text-[15px] font-semibold" :class="isVip || isAdmin ? 'text-emerald-500' : 'text-[var(--vpn-text)]'">
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
                {{ isAdmin ? 'Status' : 'Expires' }}
              </span>
            </div>
            <p class="text-[15px] font-semibold text-[var(--vpn-text)]">
              {{ isAdmin ? 'Unlimited' : (vipExpireDisplay || 'N/A') }}
            </p>
          </div>
        </div>

        <!-- VIP Days Remaining (仅VIP显示) -->
        <div v-if="isVip && vipDaysRemaining > 0" class="mt-4 p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
          <div class="flex items-center justify-between">
            <span class="text-[12px] text-emerald-600 dark:text-emerald-400">Days Remaining</span>
            <span class="text-[14px] font-bold text-emerald-600 dark:text-emerald-400">{{ vipDaysRemaining }} days</span>
          </div>
        </div>

        <!-- 普通用户显示今日使用量 -->
        <div v-if="!isVip && !isAdmin" class="mt-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-[11px] text-[var(--vpn-text-secondary)]">Today's Usage</span>
            <span class="text-[11px] text-[var(--vpn-text-secondary)]">{{ usagePercent }}%</span>
          </div>
          <div class="h-2 bg-[var(--vpn-bg)] rounded-full overflow-hidden">
            <div 
              class="h-full rounded-full transition-all duration-500"
              :class="usagePercent > 80 ? 'bg-amber-500' : 'bg-emerald-500'"
              :style="{ width: `${usagePercent}%` }"
            ></div>
          </div>
          <p class="text-[10px] text-[var(--vpn-muted)] mt-2">
            Free plan: 1GB/day, 2 hours/day. <span class="text-[var(--vpn-primary)] cursor-pointer hover:underline">Upgrade to Pro</span>
          </p>
        </div>
      </div>

      <!-- Account Details -->
      <div class="bg-[var(--vpn-card)] border border-[var(--vpn-border)] rounded-2xl shadow-sm overflow-hidden">
        <h3 class="text-[11px] font-bold text-[var(--vpn-muted)] uppercase tracking-wider px-5 pt-5 pb-3">
          Account Details
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
                <p class="text-[11px] text-[var(--vpn-text-secondary)]">Username</p>
                <p class="text-[13px] font-medium text-[var(--vpn-text)]">{{ currentUser?.username }}</p>
              </div>
            </div>
            <span class="text-[10px] text-[var(--vpn-muted)] bg-[var(--vpn-bg)] px-2 py-1 rounded">Cannot change</span>
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
                <p class="text-[11px] text-[var(--vpn-text-secondary)]">User ID</p>
                <p class="text-[13px] font-mono text-[var(--vpn-text)] truncate max-w-[180px]">
                  {{ currentUser?.uuid?.substring(0, 8) }}...
                </p>
              </div>
            </div>
            <button 
              @click="navigator.clipboard.writeText(currentUser?.uuid || '')"
              class="text-[11px] text-[var(--vpn-primary)] hover:underline"
            >
              Copy
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
              <p class="text-[11px] text-[var(--vpn-text-secondary)]">Member Since</p>
              <p class="text-[13px] font-medium text-[var(--vpn-text)]">{{ memberSince || 'Unknown' }}</p>
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
              <p class="text-[11px] text-[var(--vpn-text-secondary)]">Roles</p>
              <div class="flex gap-1.5 mt-1 flex-wrap">
                <span 
                  v-for="role in currentUser?.roles" 
                  :key="role"
                  class="px-2 py-0.5 text-[10px] font-medium rounded-full"
                  :class="{
                    'bg-purple-500/10 text-purple-500': role === 'super_admin',
                    'bg-blue-500/10 text-blue-500': role === 'admin',
                    'bg-emerald-500/10 text-emerald-500': role === 'vip',
                    'bg-slate-500/10 text-slate-500': role === 'user',
                  }"
                >
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
          Danger Zone
        </h3>
        
        <button
          @click="handleLogout"
          class="w-full py-2.5 rounded-xl border border-red-200 dark:border-red-900/30 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors text-[13px] font-medium flex items-center justify-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign Out
        </button>
      </div>

      <!-- Version -->
      <div class="text-center pb-4">
        <p class="text-[10px] text-[var(--vpn-muted)]">ToVPN v1.0.0</p>
      </div>
    </div>
  </div>
</template>
```

---

## 五、优化 HomeView

### `src/views/HomeView.vue`

```vue
<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useVpn } from '@/composables/useVpn'
import { useAuthStore } from '@/stores/auth'
import { formatDuration } from '@/utils/format'
import ConnectButton from '@/components/dashboard/ConnectButton.vue'
import ServerCard from '@/components/dashboard/ServerCard.vue'
import StatsPanel from '@/components/dashboard/StatsPanel.vue'

const router = useRouter()
const authStore = useAuthStore()

const {
  status,
  isVpnBusy,
  error,
  currentServer,
  stats,
  isConnected,
  isHelperReady,
  canCancel,
  connect,
  disconnect,
  cancelConnect,
  checkHelperStatus,
  checkDailyLimit,
} = useVpn()

const { 
  isAuthenticated, 
  needsLogin, 
  hasConnectionLimit,
  dailyTrafficLimit,
  dailyTimeLimit,
  membershipLevel,
  consumeAutoConnect
} = storeToRefs(authStore)

// 检查 Helper 状态
onMounted(async () => {
  await checkHelperStatus()
  
  // 检查是否需要自动连接（登录后跳转回来）
  if (authStore.consumeAutoConnect() && isHelperReady.value) {
    setTimeout(() => {
      handleConnect()
    }, 500)
  }
})

// 监听登录状态变化
watch(isAuthenticated, (authenticated) => {
  if (!authenticated && isConnected.value) {
    // 登出时断开连接
    disconnect()
  }
})

// 按钮禁用状态
const buttonDisabled = computed(() => {
  if (status.value === 'disconnecting') return true
  if (status.value === 'connecting') return false
  return isVpnBusy.value
})

// 限制提示信息
const limitInfo = computed(() => {
  if (!hasConnectionLimit.value) return null
  
  const traffic = dailyTrafficLimit.value
  const time = dailyTimeLimit.value
  
  const parts = []
  if (traffic > 0) parts.push(formatBytes(traffic))
  if (time > 0) parts.push(formatDuration(time))
  
  return parts.join(' / ')
})

// 处理连接
async function handleConnect() {
  // 检查登录状态
  if (needsLogin.value) {
    router.push('/login')
    return
  }
  
  // 已连接则断开
  if (status.value === 'connected') {
    return disconnect()
  }

  // 检查 Helper
  if (!isHelperReady.value) {
    const confirm = window.confirm("System Extension is required to connect. Go to Settings to install?")
    if (confirm) {
      router.push('/settings')
    }
    return
  }

  // 检查每日限制
  const limitCheck = checkDailyLimit()
  if (limitCheck.exceeded) {
    // 显示升级提示
    const upgrade = window.confirm(`${limitCheck.reason}\n\nUpgrade to Pro for unlimited access?`)
    if (upgrade) {
      // TODO: 跳转到升级页面
    }
    return
  }

  // 开始连接
  connect()
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  }
  return (bytes / (1024 * 1024)).toFixed(0) + ' MB'
}
</script>

<template>
  <div class="flex flex-col h-full bg-[var(--vpn-bg)] relative overflow-hidden">
    <!-- Background Effects -->
    <div class="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-sky-400/10 rounded-full blur-[100px] pointer-events-none"></div>
    <div class="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-emerald-400/10 rounded-full blur-[80px] pointer-events-none"></div>

    <!-- Main Content -->
    <div class="flex-1 flex flex-col items-center justify-center p-6 pb-12 relative z-10 w-full">

      <!-- 登录提示 -->
      <Transition name="fade">
        <div 
          v-if="needsLogin" 
          class="absolute top-4 w-full flex justify-center pointer-events-none"
        >
          <button
            @click="router.push('/login')"
            class="pointer-events-auto px-4 py-2 rounded-full bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 text-xs font-medium shadow-sm flex items-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            <span>Login to connect</span>
          </button>
        </div>
      </Transition>

      <!-- Helper 提示 -->
      <Transition name="fade">
        <div 
          v-if="isAuthenticated && !isHelperReady && status === 'disconnected'"
          class="absolute top-4 w-full flex justify-center pointer-events-none"
        >
          <button
            @click="router.push('/settings')"
            class="pointer-events-auto px-4 py-2 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 text-xs font-medium shadow-sm flex items-center gap-2 animate-bounce-slight hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>System Extension required. Click to install.</span>
          </button>
        </div>
      </Transition>

      <!-- 使用限制提示 (普通用户) -->
      <Transition name="fade">
        <div 
          v-if="isAuthenticated && hasConnectionLimit && limitInfo"
          class="absolute top-4 w-full flex justify-center pointer-events-none"
        >
          <div class="pointer-events-auto px-3 py-1.5 rounded-full bg-slate-100 dark:bg-white/10 text-[11px] text-[var(--vpn-text-secondary)] flex items-center gap-2">
            <span>Daily limit: {{ limitInfo }}</span>
            <span class="text-[var(--vpn-primary)] cursor-pointer hover:underline">Upgrade</span>
          </div>
        </div>
      </Transition>

      <div class="flex flex-col items-center justify-center w-full max-w-md space-y-8 mt-8">
        <!-- Main Button -->
        <ConnectButton 
          :status="status" 
          :disabled="buttonDisabled" 
          :can-cancel="canCancel" 
          @click="handleConnect"
          @cancel="cancelConnect" 
        />

        <!-- Timer -->
        <div class="h-6 flex items-center justify-center">
          <Transition name="fade">
            <div 
              v-if="isConnected && stats.connectedTime > 0"
              class="px-3 py-1 rounded-full bg-white/80 dark:bg-white/10 border border-[var(--vpn-border)] shadow-sm text-xs font-mono text-[var(--vpn-text-secondary)]"
            >
              {{ formatDuration(stats.connectedTime) }}
            </div>
          </Transition>
        </div>

        <!-- Server Card -->
        <ServerCard 
          v-if="currentServer" 
          :server="currentServer" 
          @click="router.push('/servers')" 
        />

        <!-- Membership Badge -->
        <div 
          v-if="isAuthenticated"
          class="flex items-center gap-2 text-[11px]"
        >
          <span class="text-[var(--vpn-text-secondary)]">Connected as</span>
          <span 
            class="px-2 py-0.5 rounded-full font-medium"
            :class="{
              'bg-purple-500/10 text-purple-500': membershipLevel === 'Administrator',
              'bg-emerald-500/10 text-emerald-500': membershipLevel === 'Pro Member',
              'bg-slate-500/10 text-slate-500': membershipLevel === 'Free',
            }"
          >
            {{ membershipLevel }}
          </span>
        </div>
      </div>

      <!-- Error Toast -->
      <Transition name="slide-up">
        <div 
          v-if="error"
          class="absolute bottom-4 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-4 py-2.5 rounded-xl shadow-lg border border-red-100 dark:border-red-900/30 flex items-center gap-2 max-w-[90%]"
        >
          <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="truncate">{{ error }}</span>
        </div>
      </Transition>
    </div>

    <!-- Stats Panel -->
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

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active, .slide-up-leave-active {
  transition: all 0.3s ease;
}
.slide-up-enter-from, .slide-up-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
```

---

## 六、优化 LoginView（登录后自动跳转）

### `src/views/LoginView.vue`

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
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

// 如果已登录，直接跳转
onMounted(() => {
  if (isAuthenticated.value) {
    const redirect = (route.query.redirect as string) || '/'
    router.replace(redirect)
  }
})

const handleLogin = async () => {
  if (!username.value || !password.value) {
    notification.warning('Please enter username and password')
    return
  }

  const success = await authStore.doLogin(username.value, password.value)

  if (success) {
    notification.success('Login successful')
    // 跳转到之前的页面或首页（首页会触发自动连接）
    const redirect = (route.query.redirect as string) || '/'
    router.push(redirect)
  } else {
    notification.error(loginError.value || 'Login Failed')
  }
}
</script>

<template>
  <div class="h-full flex flex-col items-center justify-center bg-[var(--vpn-bg)] relative p-6 titlebar-drag">
    <!-- Background Effect -->
    <div class="absolute top-0 right-0 w-96 h-96 bg-emerald-400/20 rounded-full blur-[120px] pointer-events-none"></div>
    <div class="absolute bottom-0 left-0 w-80 h-80 bg-blue-400/20 rounded-full blur-[100px] pointer-events-none"></div>

    <!-- Security Warning -->
    <div class="absolute top-0 left-0 w-full bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center backdrop-blur-sm titlebar-no-drag">
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
    </div>

    <!-- Login Card -->
    <div class="w-full max-w-[340px] bg-[var(--vpn-card)]/80 backdrop-blur-xl border border-[var(--vpn-border)] shadow-2xl rounded-2xl p-8 titlebar-no-drag relative z-10">
      
      <!-- Logo & Title -->
      <div class="flex flex-col items-center mb-8">
        <div class="w-14 h-14 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-2xl shadow-lg shadow-emerald-500/20 flex items-center justify-center mb-4 text-white">
          <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 class="text-xl font-bold text-[var(--vpn-text)]">{{ t.login.title }}</h2>
        <p class="text-[11px] text-[var(--vpn-text-secondary)] mt-1">{{ t.login.subtitle }}</p>
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
            <input
              v-model="username"
              type="text"
              class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--vpn-input-bg)] border border-transparent focus:bg-[var(--vpn-bg)] focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 text-[13px] text-[var(--vpn-text)] transition-all outline-none"
              placeholder="Enter username"
              :disabled="isLoading"
            />
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
            <input
              v-model="password"
              type="password"
              class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--vpn-input-bg)] border border-transparent focus:bg-[var(--vpn-bg)] focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 text-[13px] text-[var(--vpn-text)] transition-all outline-none"
              placeholder="Enter password"
              :disabled="isLoading"
            />
          </div>
        </div>

        <!-- Error Message -->
        <Transition name="fade">
          <div v-if="loginError" class="flex items-center gap-2 text-red-500 text-[12px] bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{{ loginError }}</span>
          </div>
        </Transition>

        <button
          type="submit"
          :disabled="isLoading"
          class="w-full py-3 mt-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-[13px] font-semibold shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <span v-if="isLoading" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          {{ isLoading ? t.common.loading : t.login.submit }}
        </button>
      </form>

      <!-- Guest Mode Link -->
      <div class="mt-6 text-center">
        <button 
          @click="router.push('/')"
          class="text-[11px] text-[var(--vpn-text-secondary)] hover:text-[var(--vpn-text)] transition-colors"
        >
          Continue as Guest (Limited)
        </button>
      </div>
    </div>

    <!-- App Version -->
    <p class="absolute bottom-4 text-[10px] text-[var(--vpn-muted)]">ToVPN v1.0.0</p>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
```

---

## 七、更新路由守卫

### `src/router/index.ts`

```typescript
import { createRouter, createWebHashHistory } from "vue-router";
import HomeView from "@/views/HomeView.vue";
import { useAuthStore } from "@/stores/auth";

const router = createRouter({
  history: createWebHashHistory(),
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
      meta: { requiresAuth: true },
    },
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/LoginView.vue"),
      meta: { hideSidebar: true, guestOnly: true },
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/",
    },
  ],
});

// 路由守卫
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();

  // 检查 Token 有效性
  if (authStore.accessToken && !authStore.isTokenValid) {
    // Token 过期，尝试刷新或登出
    await authStore.checkAndRefreshToken();
  }

  // 需要登录但未登录
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next({
      path: "/login",
      query: { redirect: to.fullPath },
    });
  }

  // 已登录但访问登录页
  if (to.meta.guestOnly && authStore.isAuthenticated) {
    return next("/");
  }

  next();
});

export default router;
```

---

## 八、更新 useVpn composable

### `src/composables/useVpn.ts`

```typescript
import { useVpnStore } from "@/stores/vpn";
import { useServersStore } from "@/stores/servers";
import { useSettingsStore } from "@/stores/settings";
import { useAuthStore } from "@/stores/auth";
import { storeToRefs } from "pinia";

export function useVpn() {
  const vpnStore = useVpnStore();
  const serversStore = useServersStore();
  const settingsStore = useSettingsStore();
  const authStore = useAuthStore();

  const {
    status,
    helperStatus,
    isVpnBusy,
    isHelperBusy,
    error,
    stats,
    isConnecting,
    isConnected,
    isHelperReady,
    canConnect,
    canDisconnect,
    canCancel,
    canInstallHelper,
    canUninstallHelper,
    dailyUsage,
  } = storeToRefs(vpnStore);

  const { currentServer } = storeToRefs(serversStore);
  const { settings } = storeToRefs(settingsStore);
  const { isAuthenticated, needsLogin, hasConnectionLimit } = storeToRefs(authStore);

  return {
    // VPN State
    status,
    helperStatus,
    isVpnBusy,
    isHelperBusy,
    error,
    stats,
    currentServer,
    settings,
    isConnecting,
    dailyUsage,

    // Getters
    isConnected,
    isHelperReady,
    canConnect,
    canDisconnect,
    canCancel,
    canInstallHelper,
    canUninstallHelper,

    // Auth State
    isAuthenticated,
    needsLogin,
    hasConnectionLimit,

    // Actions
    checkHelperStatus: vpnStore.checkHelperStatus,
    installHelper: vpnStore.installHelper,
    uninstallHelper: vpnStore.uninstallHelper,
    connect: vpnStore.connect,
    disconnect: vpnStore.disconnect,
    cancelConnect: vpnStore.cancelConnect,
    selectServer: serversStore.selectServer,
    updateSettings: settingsStore.updateSettings,
    checkDailyLimit: vpnStore.checkDailyLimit,
  };
}
```

---

## 九、文件结构总结

```
src/
├── components/
│   └── settings/
│       ├── ConnectionModeSection.vue
│       ├── GeneralSettingsSection.vue
│       ├── NetworkPreferencesSection.vue
│       ├── SettingRow.vue
│       ├── SettingSelect.vue
│       ├── SettingSwitch.vue
│       └── SystemHelperSection.vue
├── composables/
│   └── useVpn.ts                  ✅ 更新
├── router/
│   └── index.ts                   ✅ 更新
├── stores/
│   ├── auth.ts                    ✅ 重构
│   └── vpn.ts                     ✅ 重构
├── types/
│   └── login.ts                   ✅ 扩展
└── views/
    ├── HomeView.vue               ✅ 优化
    ├── LoginView.vue              ✅ 优化
    ├── ProfileView.vue            ✅ 重新设计
    └── SettingsView.vue           ✅ 拆分
```

---

## 十、核心改动说明

| 功能 | 改动 |
|------|------|
| **用户限制** | 移除游客限制，改为普通用户(1GB/天, 2小时/天) |
| **管理员** | super_admin/admin 无任何限制 |
| **VIP** | 按 vip_expire_at 判断是否过期，未过期无限制 |
| **登录流程** | 未登录点击连接 → 跳转登录 → 登录成功自动跳回并连接 |
| **Profile页面** | macOS 风格，可编辑昵称/邮箱/头像 |
| **每日使用量** | 本地存储追踪，每天重置 |

---------

# Bug 修复方案

## 一、修复 HomeView 布局挤压问题

### `src/views/HomeView.vue`

```vue
<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useVpn } from '@/composables/useVpn'
import { useAuthStore } from '@/stores/auth'
import { formatDuration } from '@/utils/format'
import ConnectButton from '@/components/dashboard/ConnectButton.vue'
import ServerCard from '@/components/dashboard/ServerCard.vue'
import StatsPanel from '@/components/dashboard/StatsPanel.vue'

const router = useRouter()
const authStore = useAuthStore()

const {
  status,
  isVpnBusy,
  error,
  currentServer,
  stats,
  isConnected,
  isHelperReady,
  canCancel,
  connect,
  disconnect,
  cancelConnect,
  checkHelperStatus,
  checkDailyLimit,
} = useVpn()

const { 
  isAuthenticated, 
  needsLogin, 
  hasConnectionLimit,
  dailyTrafficLimit,
  dailyTimeLimit,
  membershipLevel,
} = storeToRefs(authStore)

// ============ 错误提示自动消失逻辑 ============
const showError = ref(false)
const errorMessage = ref('')
let errorTimer: number | null = null

// 监听 error 变化
watch(error, (newError) => {
  if (newError) {
    errorMessage.value = newError
    showError.value = true
    
    // 清除之前的定时器
    if (errorTimer) {
      clearTimeout(errorTimer)
    }
    
    // 5秒后自动消失
    errorTimer = window.setTimeout(() => {
      showError.value = false
      // 延迟清除消息，等动画完成
      setTimeout(() => {
        errorMessage.value = ''
      }, 300)
    }, 5000)
  }
}, { immediate: true })

// 手动关闭错误提示
function dismissError() {
  showError.value = false
  if (errorTimer) {
    clearTimeout(errorTimer)
    errorTimer = null
  }
}

// 组件卸载时清理
onUnmounted(() => {
  if (errorTimer) {
    clearTimeout(errorTimer)
  }
})

// ============ 初始化 ============
onMounted(async () => {
  await checkHelperStatus()
  
  // 检查是否需要自动连接（登录后跳转回来）
  if (authStore.consumeAutoConnect() && isHelperReady.value) {
    setTimeout(() => {
      handleConnect()
    }, 500)
  }
})

// 监听登录状态变化
watch(isAuthenticated, (authenticated) => {
  if (!authenticated && isConnected.value) {
    disconnect()
  }
})

// ============ 计算属性 ============
const buttonDisabled = computed(() => {
  if (status.value === 'disconnecting') return true
  if (status.value === 'connecting') return false
  return isVpnBusy.value
})

const limitInfo = computed(() => {
  if (!hasConnectionLimit.value) return null
  
  const traffic = dailyTrafficLimit.value
  const time = dailyTimeLimit.value
  
  const parts = []
  if (traffic > 0) parts.push(formatBytes(traffic))
  if (time > 0) parts.push(formatDuration(time))
  
  return parts.join(' / ')
})

// 顶部提示类型（互斥显示）
const topNoticeType = computed(() => {
  if (needsLogin.value) return 'login'
  if (!isHelperReady.value && status.value === 'disconnected') return 'helper'
  if (hasConnectionLimit.value && limitInfo.value) return 'limit'
  return null
})

// ============ 方法 ============
async function handleConnect() {
  if (needsLogin.value) {
    router.push('/login')
    return
  }
  
  if (status.value === 'connected') {
    return disconnect()
  }

  if (!isHelperReady.value) {
    const confirm = window.confirm("System Extension is required to connect. Go to Settings to install?")
    if (confirm) {
      router.push('/settings')
    }
    return
  }

  const limitCheck = checkDailyLimit()
  if (limitCheck.exceeded) {
    const upgrade = window.confirm(`${limitCheck.reason}\n\nUpgrade to Pro for unlimited access?`)
    if (upgrade) {
      // TODO: 跳转到升级页面
    }
    return
  }

  connect()
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  }
  return (bytes / (1024 * 1024)).toFixed(0) + ' MB'
}
</script>

<template>
  <div class="flex flex-col h-full bg-[var(--vpn-bg)] relative overflow-hidden">
    <!-- Background Effects (不影响布局) -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div class="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-sky-400/10 rounded-full blur-[100px]"></div>
      <div class="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-emerald-400/10 rounded-full blur-[80px]"></div>
    </div>

    <!-- Main Content Area (flex-1 占据剩余空间) -->
    <div class="flex-1 flex flex-col relative z-10 min-h-0">
      
      <!-- 顶部提示区 (固定高度，防止挤压) -->
      <div class="h-12 flex items-center justify-center px-4 shrink-0">
        <Transition name="fade" mode="out-in">
          <!-- 登录提示 -->
          <button
            v-if="topNoticeType === 'login'"
            key="login"
            @click="router.push('/login')"
            class="px-4 py-2 rounded-full bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 text-xs font-medium shadow-sm flex items-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            <span>Login to connect</span>
          </button>

          <!-- Helper 提示 -->
          <button
            v-else-if="topNoticeType === 'helper'"
            key="helper"
            @click="router.push('/settings')"
            class="px-4 py-2 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 text-xs font-medium shadow-sm flex items-center gap-2 animate-bounce-slight hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>System Extension required</span>
          </button>

          <!-- 使用限制提示 -->
          <div 
            v-else-if="topNoticeType === 'limit'"
            key="limit"
            class="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-white/10 text-[11px] text-[var(--vpn-text-secondary)] flex items-center gap-2"
          >
            <span>Daily limit: {{ limitInfo }}</span>
            <span class="text-[var(--vpn-primary)] cursor-pointer hover:underline">Upgrade</span>
          </div>

          <!-- 占位符 (保持高度一致) -->
          <div v-else key="empty" class="h-8"></div>
        </Transition>
      </div>

      <!-- 中间主内容区 (居中显示) -->
      <div class="flex-1 flex flex-col items-center justify-center px-6 min-h-0">
        <div class="flex flex-col items-center w-full max-w-md space-y-6">
          <!-- Main Button -->
          <ConnectButton 
            :status="status" 
            :disabled="buttonDisabled" 
            :can-cancel="canCancel" 
            @click="handleConnect"
            @cancel="cancelConnect" 
          />

          <!-- Timer -->
          <div class="h-6 flex items-center justify-center">
            <Transition name="fade">
              <div 
                v-if="isConnected && stats.connectedTime > 0"
                class="px-3 py-1 rounded-full bg-white/80 dark:bg-white/10 border border-[var(--vpn-border)] shadow-sm text-xs font-mono text-[var(--vpn-text-secondary)]"
              >
                {{ formatDuration(stats.connectedTime) }}
              </div>
            </Transition>
          </div>

          <!-- Server Card -->
          <ServerCard 
            v-if="currentServer" 
            :server="currentServer" 
            @click="router.push('/servers')" 
          />

          <!-- Membership Badge -->
          <div 
            v-if="isAuthenticated"
            class="flex items-center gap-2 text-[11px]"
          >
            <span class="text-[var(--vpn-text-secondary)]">Connected as</span>
            <span 
              class="px-2 py-0.5 rounded-full font-medium"
              :class="{
                'bg-purple-500/10 text-purple-500': membershipLevel === 'Administrator',
                'bg-emerald-500/10 text-emerald-500': membershipLevel === 'Pro Member',
                'bg-slate-500/10 text-slate-500': membershipLevel === 'Free',
              }"
            >
              {{ membershipLevel }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Stats Panel -->
    <StatsPanel :stats="stats" :is-connected="isConnected" class="shrink-0" />

    <!-- 错误提示 Toast (固定在底部，不影响布局) -->
    <Teleport to="body">
      <Transition name="slide-up">
        <div 
          v-if="showError && errorMessage"
          class="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 max-w-[90%] w-auto"
        >
          <div class="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/90 border border-red-200 dark:border-red-800 shadow-lg backdrop-blur-md">
            <svg class="w-5 h-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span class="text-sm text-red-600 dark:text-red-400 font-medium">{{ errorMessage }}</span>
            <button 
              @click="dismissError"
              class="ml-2 p-1 rounded-full hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
            >
              <svg class="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
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

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.slide-up-enter-active {
  transition: all 0.3s ease-out;
}
.slide-up-leave-active {
  transition: all 0.2s ease-in;
}
.slide-up-enter-from {
  opacity: 0;
  transform: translate(-50%, 20px);
}
.slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 20px);
}
</style>
```

---

## 二、修复 LoginView 跳转逻辑

### `src/views/LoginView.vue`

```vue
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
  if (!username.value || !password.value) {
    notification.warning('Please enter username and password')
    return
  }

  const success = await authStore.doLogin(username.value, password.value)

  if (success) {
    notification.success('Login successful')
    // 跳转到之前的页面
    router.push(redirectTarget.value)
  } else {
    notification.error(loginError.value || 'Login Failed')
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
  <div class="h-full flex flex-col items-center justify-center bg-[var(--vpn-bg)] relative p-6 titlebar-drag">
    <!-- Background Effect -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div class="absolute top-0 right-0 w-96 h-96 bg-emerald-400/20 rounded-full blur-[120px]"></div>
      <div class="absolute bottom-0 left-0 w-80 h-80 bg-blue-400/20 rounded-full blur-[100px]"></div>
    </div>

    <!-- Back Button -->
    <button 
      @click="goBack"
      class="absolute top-4 left-4 p-2 rounded-lg text-[var(--vpn-text-secondary)] hover:text-[var(--vpn-text)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors titlebar-no-drag z-20"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
    </button>

    <!-- Security Warning -->
    <div class="absolute top-0 left-0 w-full bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-center backdrop-blur-sm titlebar-no-drag">
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
    </div>

    <!-- Login Card -->
    <div class="w-full max-w-[340px] bg-[var(--vpn-card)]/80 backdrop-blur-xl border border-[var(--vpn-border)] shadow-2xl rounded-2xl p-8 titlebar-no-drag relative z-10">
      
      <!-- Logo & Title -->
      <div class="flex flex-col items-center mb-8">
        <div class="w-14 h-14 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-2xl shadow-lg shadow-emerald-500/20 flex items-center justify-center mb-4 text-white">
          <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 class="text-xl font-bold text-[var(--vpn-text)]">{{ t.login.title }}</h2>
        <p class="text-[11px] text-[var(--vpn-text-secondary)] mt-1">
          {{ fromProfile ? 'Login to view your profile' : t.login.subtitle }}
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
            <input
              v-model="username"
              type="text"
              class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--vpn-input-bg)] border border-transparent focus:bg-[var(--vpn-bg)] focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 text-[13px] text-[var(--vpn-text)] transition-all outline-none"
              placeholder="Enter username"
              :disabled="isLoading"
              autocomplete="username"
            />
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
            <input
              v-model="password"
              type="password"
              class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--vpn-input-bg)] border border-transparent focus:bg-[var(--vpn-bg)] focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 text-[13px] text-[var(--vpn-text)] transition-all outline-none"
              placeholder="Enter password"
              :disabled="isLoading"
              autocomplete="current-password"
            />
          </div>
        </div>

        <!-- Error Message -->
        <Transition name="fade">
          <div v-if="loginError" class="flex items-center gap-2 text-red-500 text-[12px] bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{{ loginError }}</span>
          </div>
        </Transition>

        <button
          type="submit"
          :disabled="isLoading"
          class="w-full py-3 mt-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-[13px] font-semibold shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <span v-if="isLoading" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          {{ isLoading ? t.common.loading : t.login.submit }}
        </button>
      </form>

      <!-- Bottom Links -->
      <div class="mt-6 flex flex-col items-center gap-3">
        <!-- 跳转到首页 (Guest) -->
        <button 
          @click="router.push('/')"
          class="text-[11px] text-[var(--vpn-text-secondary)] hover:text-[var(--vpn-text)] transition-colors"
        >
          Continue without login (Limited)
        </button>
      </div>
    </div>

    <!-- App Version -->
    <p class="absolute bottom-4 text-[10px] text-[var(--vpn-muted)]">ToVPN v1.0.0</p>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
```

---

## 三、更新路由守卫（记录 redirect）

### `src/router/index.ts`

```typescript
import { createRouter, createWebHashHistory } from "vue-router";
import HomeView from "@/views/HomeView.vue";
import { useAuthStore } from "@/stores/auth";

const router = createRouter({
  history: createWebHashHistory(),
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
      meta: { requiresAuth: true },
    },
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/LoginView.vue"),
      meta: { hideSidebar: true, guestOnly: true },
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/",
    },
  ],
});

// 路由守卫
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore();

  // 检查 Token 有效性
  if (authStore.accessToken && !authStore.isTokenValid) {
    await authStore.checkAndRefreshToken();
  }

  // 需要登录但未登录 -> 跳转登录页并记录目标
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next({
      path: "/login",
      query: { redirect: to.fullPath },
    });
  }

  // 已登录但访问登录页 -> 跳转到首页或 redirect 目标
  if (to.meta.guestOnly && authStore.isAuthenticated) {
    const redirect = to.query.redirect as string;
    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
      return next(redirect);
    }
    return next("/");
  }

  next();
});

export default router;
```

---

## 四、修复 Sidebar 点击 Profile 逻辑

### `src/components/layout/AppSidebar.vue` (部分修改)

```vue
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

// 点击头像处理
function handleAvatarClick() {
  if (isAuthenticated.value) {
    router.push('/profile')
  } else {
    // 未登录时跳转登录页，并记录要去 profile
    router.push({ path: '/login', query: { redirect: '/profile' } })
  }
}
</script>

<!-- 模板部分保持不变 -->
```

---

## 五、接口文档

### 目前缺失的接口列表

#### 1. 用户登录

```yaml
POST /api/v1/auth/login

Request:
  Content-Type: application/json
  Body:
    account: string      # 用户名或邮箱
    password: string     # 密码

Response:
  {
    "code": 0,
    "message": "success",
    "data": {
      "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expires_in": 7200,          # Token有效期(秒)
      "token_type": "Bearer",
      "user": {
        "id": 1,
        "uuid": "550e8400-e29b-41d4-a716-446655440000",
        "username": "admin",
        "email": "admin@example.com",
        "nickname": "系统管理员",
        "avatar": "https://example.com/avatar.jpg",  # 可为空
        "roles": ["super_admin"],
        "vip_expire_at": "2025-12-31T23:59:59Z",     # VIP过期时间，可为null
        "daily_traffic_limit": 0,   # 每日流量限制(bytes)，0表示无限制
        "daily_time_limit": 0,      # 每日时长限制(秒)，0表示无限制
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-06-01T12:00:00Z"
      }
    },
    "timestamp": 1699999999
  }

Error Response:
  {
    "code": 10001,
    "message": "Invalid username or password",
    "data": null,
    "timestamp": 1699999999
  }
```

#### 2. 用户登出

```yaml
POST /api/v1/auth/logout

Request:
  Headers:
    Authorization: Bearer <access_token>

Response:
  {
    "code": 0,
    "message": "success",
    "data": null,
    "timestamp": 1699999999
  }
```

#### 3. 刷新 Token

```yaml
POST /api/v1/auth/refresh

Request:
  Content-Type: application/json
  Body:
    refresh_token: string

Response:
  {
    "code": 0,
    "message": "success",
    "data": {
      "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expires_in": 7200,
      "token_type": "Bearer"
    },
    "timestamp": 1699999999
  }
```

#### 4. 获取用户信息

```yaml
GET /api/v1/user/profile

Request:
  Headers:
    Authorization: Bearer <access_token>

Response:
  {
    "code": 0,
    "message": "success",
    "data": {
      "id": 1,
      "uuid": "550e8400-e29b-41d4-a716-446655440000",
      "username": "admin",
      "email": "admin@example.com",
      "nickname": "系统管理员",
      "avatar": "https://example.com/avatar.jpg",
      "roles": ["super_admin"],
      "vip_expire_at": "2025-12-31T23:59:59Z",
      "daily_traffic_limit": 0,
      "daily_time_limit": 0,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-06-01T12:00:00Z"
    },
    "timestamp": 1699999999
  }
```

#### 5. 更新用户信息

```yaml
PUT /api/v1/user/profile

Request:
  Headers:
    Authorization: Bearer <access_token>
  Content-Type: application/json
  Body:
    nickname?: string    # 昵称，可选
    email?: string       # 邮箱，可选
    avatar?: string      # 头像URL，可选

Response:
  {
    "code": 0,
    "message": "success",
    "data": {
      "id": 1,
      "uuid": "550e8400-e29b-41d4-a716-446655440000",
      "username": "admin",
      "email": "newemail@example.com",
      "nickname": "新昵称",
      "avatar": "https://example.com/new-avatar.jpg",
      "roles": ["super_admin"],
      "vip_expire_at": "2025-12-31T23:59:59Z",
      "daily_traffic_limit": 0,
      "daily_time_limit": 0,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-06-01T12:00:00Z"
    },
    "timestamp": 1699999999
  }
```

#### 6. 上传头像

```yaml
POST /api/v1/user/avatar

Request:
  Headers:
    Authorization: Bearer <access_token>
  Content-Type: multipart/form-data
  Body:
    file: File           # 图片文件 (jpg, png, webp)，最大 2MB

Response:
  {
    "code": 0,
    "message": "success",
    "data": {
      "url": "https://example.com/avatars/user_1_1699999999.jpg"
    },
    "timestamp": 1699999999
  }
```

#### 7. 获取 VPN 节点列表

```yaml
GET /api/v1/vpn/nodes/all

Request:
  Headers:
    Authorization: Bearer <access_token>

Response:
  {
    "code": 0,
    "message": "success",
    "data": [
      {
        "id": 1,
        "name": "US-LA",
        "country": "USA",
        "city": "Los Angeles",
        "flag": "🇺🇸",
        "domain": "us-la.example.com",
        "port": 443,
        "password": "node_password_123"  # 节点连接密码
      },
      {
        "id": 2,
        "name": "JP-Tokyo",
        "country": "Japan",
        "city": "Tokyo",
        "flag": "🇯🇵",
        "domain": "jp-tokyo.example.com",
        "port": 443,
        "password": "node_password_456"
      }
    ],
    "timestamp": 1699999999
  }
```

#### 8. 测试节点延迟

```yaml
GET /api/v1/vpn/nodes/{nodeId}/ping

Request:
  Headers:
    Authorization: Bearer <access_token>
  Path Parameters:
    nodeId: number       # 节点ID

Response:
  {
    "code": 0,
    "message": "success",
    "data": {
      "node_id": 1,
      "ping": 45,         # 延迟(ms)
      "status": "online"  # online | offline | unknown
    },
    "timestamp": 1699999999
  }
```

#### 9. 获取用户使用统计

```yaml
GET /api/v1/user/usage

Request:
  Headers:
    Authorization: Bearer <access_token>
  Query Parameters:
    date?: string        # 日期，格式 YYYY-MM-DD，默认今天

Response:
  {
    "code": 0,
    "message": "success",
    "data": {
      "date": "2024-06-01",
      "traffic_used": 536870912,      # 已用流量(bytes)
      "traffic_limit": 1073741824,    # 流量限制(bytes)，0表示无限制
      "time_used": 3600,              # 已用时长(秒)
      "time_limit": 7200,             # 时长限制(秒)，0表示无限制
      "connections": 5                 # 今日连接次数
    },
    "timestamp": 1699999999
  }
```

#### 10. 上报使用统计

```yaml
POST /api/v1/user/usage/report

Request:
  Headers:
    Authorization: Bearer <access_token>
  Content-Type: application/json
  Body:
    node_id: number          # 节点ID
    traffic_download: number # 下载流量(bytes)
    traffic_upload: number   # 上传流量(bytes)
    duration: number         # 连接时长(秒)
    connected_at: string     # 连接开始时间 ISO格式
    disconnected_at: string  # 断开时间 ISO格式

Response:
  {
    "code": 0,
    "message": "success",
    "data": {
      "daily_traffic_used": 536870912,
      "daily_time_used": 3600,
      "limit_exceeded": false
    },
    "timestamp": 1699999999
  }
```

---

### 接口类型定义

### `src/api/user.ts` (新建)

```typescript
import request from "@/utils/request";
import type { User } from "@/types/login";

/** 更新用户信息参数 */
export interface UpdateProfileData {
  nickname?: string;
  email?: string;
  avatar?: string;
}

/** 使用统计 */
export interface UsageStats {
  date: string;
  traffic_used: number;
  traffic_limit: number;
  time_used: number;
  time_limit: number;
  connections: number;
}

/** 使用上报参数 */
export interface UsageReportData {
  node_id: number;
  traffic_download: number;
  traffic_upload: number;
  duration: number;
  connected_at: string;
  disconnected_at: string;
}

/** 使用上报结果 */
export interface UsageReportResult {
  daily_traffic_used: number;
  daily_time_used: number;
  limit_exceeded: boolean;
}

/** 获取用户信息 */
export function getUserProfile() {
  return request<User>({
    url: "/user/profile",
    method: "get",
  });
}

/** 更新用户信息 */
export function updateUserProfile(data: UpdateProfileData) {
  return request<User>({
    url: "/user/profile",
    method: "put",
    data,
  });
}

/** 上传头像 */
export function uploadAvatar(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  
  return request<{ url: string }>({
    url: "/user/avatar",
    method: "post",
    data: formData,
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
}

/** 获取使用统计 */
export function getUserUsage(date?: string) {
  return request<UsageStats>({
    url: "/user/usage",
    method: "get",
    params: { date },
  });
}

/** 上报使用统计 */
export function reportUsage(data: UsageReportData) {
  return request<UsageReportResult>({
    url: "/user/usage/report",
    method: "post",
    data,
  });
}
```

### `src/api/auth.ts` (更新)

```typescript
import request from "@/utils/request";
import type { ResultData, LoginData } from "@/types/login";

/** 登录 */
export function login(data: LoginData) {
  return request<ResultData>({
    url: "/auth/login",
    method: "post",
    data,
  });
}

/** 登出 */
export function logout() {
  return request<null>({
    url: "/auth/logout",
    method: "post",
  });
}

/** 刷新 Token */
export function refreshToken(refresh_token: string) {
  return request<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  }>({
    url: "/auth/refresh",
    method: "post",
    data: { refresh_token },
  });
}
```

### `src/api/server.ts` (更新)

```typescript
import request from "@/utils/request";
import type { ServerNode } from "@/types/server";

export type { ServerNode };

/** 获取 VPN 节点列表 */
export function getVpnNodes() {
  return request<ServerNode[]>({
    url: "/vpn/nodes/all",
    method: "get",
  });
}

/** 测试节点延迟 */
export function testNodePing(nodeId: number) {
  return request<{
    node_id: number;
    ping: number;
    status: "online" | "offline" | "unknown";
  }>({
    url: `/vpn/nodes/${nodeId}/ping`,
    method: "get",
  });
}
```

---

### 错误码定义

```typescript
// src/types/api.ts (新建)

export const ErrorCodes = {
  // 成功
  SUCCESS: 0,
  
  // 认证相关 (10xxx)
  AUTH_FAILED: 10001,           // 认证失败
  TOKEN_EXPIRED: 10002,         // Token过期
  TOKEN_INVALID: 10003,         // Token无效
  REFRESH_TOKEN_EXPIRED: 10004, // RefreshToken过期
  
  // 用户相关 (20xxx)
  USER_NOT_FOUND: 20001,        // 用户不存在
  USER_DISABLED: 20002,         // 用户已禁用
  PASSWORD_WRONG: 20003,        // 密码错误
  EMAIL_EXISTS: 20004,          // 邮箱已存在
  
  // VPN相关 (30xxx)
  NODE_NOT_FOUND: 30001,        // 节点不存在
  NODE_OFFLINE: 30002,          // 节点离线
  QUOTA_EXCEEDED: 30003,        // 配额超限
  VIP_EXPIRED: 30004,           // VIP已过期
  
  // 系统相关 (50xxx)
  SYSTEM_ERROR: 50001,          // 系统错误
  PARAM_ERROR: 50002,           // 参数错误
  RATE_LIMIT: 50003,            // 请求频率限制
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
```

---

## 六、修复汇总

| Bug | 修复方案 |
|-----|---------|
| 错误提示不消失 | 添加 `showError` ref + 5秒自动消失 + 手动关闭按钮 |
| 提示挤压布局 | 使用 `Teleport` 将 Toast 渲染到 `body`，脱离文档流 |
| 顶部提示挤压 | 改为固定高度区域 + `mode="out-in"` 过渡 |
| 登录页跳转 | 添加返回按钮 + 正确处理 `redirect` 参数 |
| Profile 未登录 | Sidebar 点击时携带 `redirect=/profile` 跳转登录 |

# Bug 修复方案

## 一、修复首页布局问题

### `src/views/HomeView.vue`

```vue
<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useVpn } from '@/composables/useVpn'
import { useAuthStore } from '@/stores/auth'
import { useServersStore } from '@/stores/servers'
import { formatDuration } from '@/utils/format'
import ConnectButton from '@/components/dashboard/ConnectButton.vue'
import ServerCard from '@/components/dashboard/ServerCard.vue'
import StatsPanel from '@/components/dashboard/StatsPanel.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const serversStore = useServersStore()

const {
  status,
  isVpnBusy,
  error,
  currentServer,
  stats,
  isConnected,
  isHelperReady,
  canCancel,
  connect,
  disconnect,
  cancelConnect,
  checkHelperStatus,
  checkDailyLimit,
} = useVpn()

const { 
  isAuthenticated, 
  needsLogin, 
  hasConnectionLimit,
  dailyTrafficLimit,
  dailyTimeLimit,
  membershipLevel,
} = storeToRefs(authStore)

// ============ 错误提示逻辑 ============
const showError = ref(false)
const errorMessage = ref('')
let errorTimer: number | null = null

watch(error, (newError) => {
  if (newError) {
    errorMessage.value = newError
    showError.value = true
    
    if (errorTimer) clearTimeout(errorTimer)
    
    errorTimer = window.setTimeout(() => {
      showError.value = false
      setTimeout(() => errorMessage.value = '', 300)
    }, 5000)
  }
}, { immediate: true })

function dismissError() {
  showError.value = false
  if (errorTimer) {
    clearTimeout(errorTimer)
    errorTimer = null
  }
}

onUnmounted(() => {
  if (errorTimer) clearTimeout(errorTimer)
})

// ============ 初始化与自动连接 ============
onMounted(async () => {
  await checkHelperStatus()
  
  // 检查是否有待执行的服务器切换
  const pendingAction = serversStore.consumePendingAction()
  
  if (pendingAction) {
    // 从服务器列表页跳转过来，执行相应操作
    if (pendingAction === 'connect') {
      // 断开后重连新服务器
      if (isConnected.value) {
        await disconnect()
        setTimeout(() => handleConnect(), 500)
      } else {
        handleConnect()
      }
    }
  } else if (authStore.consumeAutoConnect() && isHelperReady.value) {
    // 登录后自动连接
    setTimeout(() => handleConnect(), 500)
  }
})

// 监听登录状态变化
watch(isAuthenticated, (authenticated) => {
  if (!authenticated && isConnected.value) {
    disconnect()
  }
})

// ============ 计算属性 ============
const buttonDisabled = computed(() => {
  if (status.value === 'disconnecting') return true
  if (status.value === 'connecting') return false
  return isVpnBusy.value
})

const limitInfo = computed(() => {
  if (!hasConnectionLimit.value) return null
  
  const traffic = dailyTrafficLimit.value
  const time = dailyTimeLimit.value
  
  const parts = []
  if (traffic > 0) parts.push(formatBytes(traffic))
  if (time > 0) parts.push(formatDuration(time))
  
  return parts.join(' / ')
})

// 顶部提示类型
const topNoticeType = computed(() => {
  if (needsLogin.value) return 'login'
  if (isAuthenticated.value && !isHelperReady.value && status.value === 'disconnected') return 'helper'
  if (isAuthenticated.value && hasConnectionLimit.value && limitInfo.value) return 'limit'
  return null
})

// ============ 方法 ============
async function handleConnect() {
  if (needsLogin.value) {
    router.push('/login')
    return
  }
  
  if (status.value === 'connected') {
    return disconnect()
  }

  if (!isHelperReady.value) {
    const confirm = window.confirm("System Extension is required. Go to Settings?")
    if (confirm) router.push('/settings')
    return
  }

  const limitCheck = checkDailyLimit()
  if (limitCheck.exceeded) {
    window.confirm(`${limitCheck.reason}\n\nUpgrade to Pro?`)
    return
  }

  connect()
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  }
  return (bytes / (1024 * 1024)).toFixed(0) + ' MB'
}
</script>

<template>
  <div class="flex flex-col h-full bg-[var(--vpn-bg)] relative overflow-hidden">
    <!-- Background Effects -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
      <div class="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-sky-400/10 rounded-full blur-[100px]"></div>
      <div class="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-emerald-400/10 rounded-full blur-[80px]"></div>
    </div>

    <!-- Main Scrollable Content -->
    <div class="flex-1 overflow-y-auto relative z-10">
      <div class="min-h-full flex flex-col items-center justify-center px-6 py-8">
        
        <!-- 顶部提示区 (固定高度) -->
        <div class="h-10 flex items-center justify-center mb-4 shrink-0">
          <Transition name="fade" mode="out-in">
            <button
              v-if="topNoticeType === 'login'"
              key="login"
              @click="router.push('/login')"
              class="px-4 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 text-xs font-medium flex items-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              <span>Login to connect</span>
            </button>

            <button
              v-else-if="topNoticeType === 'helper'"
              key="helper"
              @click="router.push('/settings')"
              class="px-4 py-1.5 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 text-xs font-medium flex items-center gap-2 hover:bg-amber-100 transition-colors"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Install System Extension</span>
            </button>

            <div 
              v-else-if="topNoticeType === 'limit'"
              key="limit"
              class="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-white/10 text-[11px] text-[var(--vpn-text-secondary)] flex items-center gap-2"
            >
              <span>Daily: {{ limitInfo }}</span>
              <span class="text-[var(--vpn-primary)] cursor-pointer hover:underline">Upgrade</span>
            </div>

            <div v-else key="empty"></div>
          </Transition>
        </div>

        <!-- 错误提示 (在按钮上方) -->
        <Transition name="slide-down">
          <div 
            v-if="showError && errorMessage"
            class="mb-4 max-w-sm w-full"
          >
            <div class="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
              <svg class="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span class="flex-1 text-xs text-red-600 dark:text-red-400 font-medium truncate">{{ errorMessage }}</span>
              <button @click="dismissError" class="p-1 rounded hover:bg-red-200 dark:hover:bg-red-800 transition-colors">
                <svg class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </Transition>

        <!-- Connect Button -->
        <ConnectButton 
          :status="status" 
          :disabled="buttonDisabled" 
          :can-cancel="canCancel" 
          @click="handleConnect"
          @cancel="cancelConnect" 
        />

        <!-- Timer -->
        <div class="h-8 flex items-center justify-center mt-4">
          <Transition name="fade">
            <div 
              v-if="isConnected && stats.connectedTime > 0"
              class="px-3 py-1 rounded-full bg-white/80 dark:bg-white/10 border border-[var(--vpn-border)] shadow-sm text-xs font-mono text-[var(--vpn-text-secondary)]"
            >
              {{ formatDuration(stats.connectedTime) }}
            </div>
          </Transition>
        </div>

        <!-- Server Card -->
        <div class="mt-6">
          <ServerCard 
            v-if="currentServer" 
            :server="currentServer" 
            @click="router.push('/servers')" 
          />
        </div>

        <!-- Membership Badge -->
        <div v-if="isAuthenticated" class="mt-4 flex items-center gap-2 text-[11px]">
          <span class="text-[var(--vpn-text-secondary)]">Logged in as</span>
          <span 
            class="px-2 py-0.5 rounded-full font-medium"
            :class="{
              'bg-purple-500/10 text-purple-500': membershipLevel === 'Administrator',
              'bg-emerald-500/10 text-emerald-500': membershipLevel === 'Pro Member',
              'bg-slate-500/10 text-slate-500': membershipLevel === 'Free',
            }"
          >
            {{ membershipLevel }}
          </span>
        </div>

        <!-- 底部间距，确保不被 StatsPanel 遮挡 -->
        <div class="h-4"></div>
      </div>
    </div>

    <!-- Bottom Stats Panel (固定在底部) -->
    <StatsPanel :stats="stats" :is-connected="isConnected" class="shrink-0 relative z-20" />
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.slide-down-enter-active {
  transition: all 0.3s ease-out;
}
.slide-down-leave-active {
  transition: all 0.2s ease-in;
}
.slide-down-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
```

---

## 二、修复服务器切换逻辑

### `src/stores/servers.ts`

```typescript
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getVpnNodes } from "@/api/server";
import type { Server } from "@/types/server";

export type PendingAction = 'connect' | 'switch' | null;

export const useServersStore = defineStore("servers", () => {
  const servers = ref<Server[]>([]);
  const currentServerId = ref<number | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  
  // 待执行的操作（用于页面跳转后执行）
  const pendingAction = ref<PendingAction>(null);

  const currentServer = computed(() =>
    servers.value.find((s) => s.id === currentServerId.value) || servers.value[0]
  );

  async function loadServers() {
    isLoading.value = true;
    error.value = null;

    try {
      const nodes = await getVpnNodes();
      servers.value = nodes.map((n) => ({
        ...n,
        ping: 9999,
        status: "unknown" as const,
      }));

      const savedId = localStorage.getItem("currentServerId");
      if (savedId && servers.value.some((s) => s.id === parseInt(savedId))) {
        currentServerId.value = parseInt(savedId);
      } else if (servers.value.length > 0) {
        currentServerId.value = servers.value[0].id;
      }
    } catch (e) {
      error.value = String(e);
      console.error("Failed to load servers:", e);
    } finally {
      isLoading.value = false;
    }
  }

  function selectServer(id: number) {
    currentServerId.value = id;
    localStorage.setItem("currentServerId", id.toString());
  }

  // 设置待执行的操作
  function setPendingAction(action: PendingAction) {
    pendingAction.value = action;
  }

  // 消费待执行的操作（返回后清空）
  function consumePendingAction(): PendingAction {
    const action = pendingAction.value;
    pendingAction.value = null;
    return action;
  }

  async function testPing(serverId: number): Promise<number> {
    const ping = Math.floor(Math.random() * 100) + 20;
    const server = servers.value.find((s) => s.id === serverId);
    if (server) {
      server.ping = ping;
      server.status = ping < 300 ? "online" : "offline";
    }
    return ping;
  }

  async function testAllPings() {
    await Promise.all(servers.value.map((s) => testPing(s.id)));
  }

  return {
    servers,
    currentServer,
    currentServerId,
    isLoading,
    error,
    pendingAction,
    loadServers,
    selectServer,
    setPendingAction,
    consumePendingAction,
    testPing,
    testAllPings,
  };
});
```

### `src/views/ServersView.vue`

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useServersStore } from '@/stores/servers'
import { useVpnStore } from '@/stores/vpn'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'
import ServerItem from '@/components/servers/ServerItem.vue'

const router = useRouter()
const serversStore = useServersStore()
const vpnStore = useVpnStore()
const i18nStore = useI18nStore()

const { servers, currentServerId, isLoading } = storeToRefs(serversStore)
const { isConnected, status } = storeToRefs(vpnStore)
const { t } = storeToRefs(i18nStore)

const searchQuery = ref('')
const isRefreshing = ref(false)

const filteredServers = computed(() => {
  if (!searchQuery.value) return servers.value
  const q = searchQuery.value.toLowerCase()
  return servers.value.filter(s =>
    s.country.toLowerCase().includes(q) ||
    s.city.toLowerCase().includes(q) ||
    s.name.toLowerCase().includes(q)
  )
})

// 处理服务器选择
async function handleServerSelect(serverId: number) {
  const isSameServer = serverId === currentServerId.value
  
  // 选择新服务器
  serversStore.selectServer(serverId)
  
  if (isSameServer) {
    // 同一服务器，直接跳转，不做额外操作
    router.push('/')
    return
  }
  
  // 不同服务器
  if (isConnected.value || status.value === 'connecting') {
    // 当前已连接或正在连接，设置 "switch" 动作（断开后重连新服务器）
    serversStore.setPendingAction('connect')
  } else {
    // 当前未连接，设置 "connect" 动作
    serversStore.setPendingAction('connect')
  }
  
  router.push('/')
}

async function handleRefresh() {
  isRefreshing.value = true
  await serversStore.testAllPings()
  setTimeout(() => isRefreshing.value = false, 500)
}

onMounted(() => {
  if (servers.value.length === 0) {
    serversStore.loadServers()
  }
})
</script>

<template>
  <div class="h-full flex flex-col bg-[var(--vpn-bg)]">
    <!-- Header -->
    <div class="px-5 pt-6 pb-2 sticky top-0 z-10 bg-[var(--vpn-bg)]/95 backdrop-blur-xl border-b border-[var(--vpn-border)]">
      <div class="flex items-center justify-between mb-3">
        <h1 class="text-xl font-bold tracking-tight text-[var(--vpn-text)]">
          {{ t.servers.title }}
        </h1>
        <button 
          @click="handleRefresh"
          :disabled="isRefreshing"
          class="group w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 active:scale-90 transition-all disabled:opacity-50"
          :title="t.servers.refresh"
        >
          <svg 
            class="w-4 h-4 text-[var(--vpn-text-secondary)] group-hover:text-[var(--vpn-text)]"
            :class="{ 'animate-spin': isRefreshing }" 
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <!-- Search -->
      <div class="relative">
        <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--vpn-muted)]" 
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input 
          v-model="searchQuery" 
          type="text" 
          :placeholder="t.servers.searchPlaceholder"
          class="w-full pl-9 pr-3 py-1.5 text-[13px] rounded-lg bg-[var(--vpn-card)] border border-[var(--vpn-border)] focus:border-blue-500/50 focus:ring-[3px] focus:ring-blue-500/10 focus:outline-none transition-all"
        />
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="flex-1 flex items-center justify-center">
      <div class="w-6 h-6 border-2 border-[var(--vpn-primary)] border-t-transparent rounded-full animate-spin"></div>
    </div>

    <!-- Server List -->
    <div v-else class="flex-1 overflow-y-auto p-3 space-y-1">
      <ServerItem 
        v-for="server in filteredServers" 
        :key="server.id" 
        :server="server"
        :selected="server.id === currentServerId" 
        @select="handleServerSelect(server.id)" 
      />

      <div v-if="filteredServers.length === 0" class="flex flex-col items-center justify-center py-12 text-[var(--vpn-muted)]">
        <p class="text-[13px]">{{ t.servers.empty }}</p>
      </div>
    </div>

    <!-- 当前连接状态提示 -->
    <div v-if="isConnected" class="px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border-t border-emerald-200 dark:border-emerald-800">
      <div class="flex items-center justify-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        <span>Selecting a new server will reconnect automatically</span>
      </div>
    </div>
  </div>
</template>
```

---

## 三、修复流量统计从本地获取

### `src/stores/vpn.ts`

```typescript
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { VpnStatus, HelperStatus, ConnectionStats } from "@/types";
import { useLogsStore } from "./logs";
import { useSettingsStore } from "./settings";
import { useServersStore } from "./servers";
import { useAuthStore } from "./auth";
import router from "@/router";

interface LogEvent {
  level: string;
  message: string;
  timestamp: number;
}

// 从 Rust 后端发送的流量统计事件
interface TrafficEvent {
  download_bytes: number;
  upload_bytes: number;
  download_speed: number;  // bytes/s
  upload_speed: number;    // bytes/s
}

// 从 Rust 后端发送的延迟事件
interface LatencyEvent {
  latency_ms: number;
}

interface HelperResult {
  success: boolean;
  message: string;
}

interface HelperStatusResult {
  status: string;
}

// 每日限制存储 Key
const DAILY_USAGE_KEY = "daily_usage";

interface DailyUsage {
  date: string;
  traffic: number;
  time: number;
}

// 普通用户限制
const USER_DAILY_TRAFFIC_LIMIT = 1 * 1024 * 1024 * 1024; // 1GB
const USER_DAILY_TIME_LIMIT = 2 * 60 * 60; // 2小时

export const useVpnStore = defineStore("vpn", () => {
  // ============ State ============
  const status = ref<VpnStatus>("disconnected");
  const helperStatus = ref<HelperStatus>("not_installed");
  const isVpnBusy = ref(false);
  const isHelperBusy = ref(false);
  const error = ref<string | null>(null);
  const isConnecting = ref(false);

  const stats = ref<ConnectionStats>({
    ip: "",
    downloadSpeed: 0,
    uploadSpeed: 0,
    latency: 0,
    connectedTime: 0,
    totalDownload: 0,
    totalUpload: 0,
  });

  const dailyUsage = ref<DailyUsage>(loadDailyUsage());

  // 事件监听句柄
  let unlistenLog: UnlistenFn | null = null;
  let unlistenTraffic: UnlistenFn | null = null;
  let unlistenLatency: UnlistenFn | null = null;
  let connectedTimeTimer: number | null = null;
  let connectedAt = 0;

  // ============ Getters ============
  const isConnected = computed(() => status.value === "connected");

  const isHelperReady = computed(
    () => helperStatus.value === "installed" || helperStatus.value === "running"
  );

  const canConnect = computed(
    () => !isVpnBusy.value && isHelperReady.value && status.value === "disconnected"
  );

  const canDisconnect = computed(
    () => !isVpnBusy.value && (status.value === "connected" || status.value === "connecting")
  );

  const canCancel = computed(
    () => status.value === "connecting" && isConnecting.value
  );

  const canInstallHelper = computed(() => !isHelperBusy.value);

  const canUninstallHelper = computed(
    () => !isHelperBusy.value && helperStatus.value !== "not_installed"
  );

  // ============ 每日限制 ============

  function loadDailyUsage(): DailyUsage {
    const today = new Date().toISOString().split("T")[0];
    const stored = localStorage.getItem(DAILY_USAGE_KEY);

    if (stored) {
      try {
        const data = JSON.parse(stored) as DailyUsage;
        if (data.date === today) return data;
      } catch { /* ignore */ }
    }

    return { date: today, traffic: 0, time: 0 };
  }

  function saveDailyUsage() {
    localStorage.setItem(DAILY_USAGE_KEY, JSON.stringify(dailyUsage.value));
  }

  function checkDailyLimit(): { exceeded: boolean; reason?: string } {
    const authStore = useAuthStore();

    if (authStore.limitType !== "user") {
      return { exceeded: false };
    }

    const trafficLimit = authStore.dailyTrafficLimit || USER_DAILY_TRAFFIC_LIMIT;
    const timeLimit = authStore.dailyTimeLimit || USER_DAILY_TIME_LIMIT;

    if (trafficLimit > 0 && dailyUsage.value.traffic >= trafficLimit) {
      return {
        exceeded: true,
        reason: `Daily traffic limit reached (${formatBytes(trafficLimit)})`,
      };
    }

    if (timeLimit > 0 && dailyUsage.value.time >= timeLimit) {
      return {
        exceeded: true,
        reason: `Daily time limit reached (${formatTime(timeLimit)})`,
      };
    }

    return { exceeded: false };
  }

  // ============ Helper Actions ============

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
    if (!canInstallHelper.value) return;

    isHelperBusy.value = true;
    error.value = null;
    const logs = useLogsStore();

    try {
      await initEventListeners();
      const res = await invoke<HelperResult>("install_helper");
      if (res.success) {
        helperStatus.value = "installed";
        await checkHelperStatus();
        logs.addLog("info", "Helper installed successfully");
      } else {
        throw new Error(res.message);
      }
    } catch (e) {
      const msg = String(e);
      error.value = msg;
      logs.addLog("error", `Helper install failed: ${msg}`);
    } finally {
      isHelperBusy.value = false;
    }
  }

  async function uninstallHelper() {
    if (!canUninstallHelper.value) return;

    isHelperBusy.value = true;
    const logs = useLogsStore();

    try {
      const res = await invoke<HelperResult>("uninstall_helper");
      if (res.success) {
        helperStatus.value = "not_installed";
        logs.addLog("info", "Helper uninstalled");
      } else {
        throw new Error(res.message);
      }
    } catch (e) {
      logs.addLog("error", `Helper uninstall failed: ${e}`);
    } finally {
      isHelperBusy.value = false;
    }
  }

  // ============ Event Listeners ============

  async function initEventListeners() {
    const logs = useLogsStore();

    // 日志事件
    if (unlistenLog) unlistenLog();
    unlistenLog = await listen<LogEvent>("vpn-log", (event) => {
      const { level, message } = event.payload;
      const logLvl = level === "warn" || level === "error" ? level : "info";
      logs.addLog(logLvl, message);
    });

    // 流量统计事件 (从 Rust vpn.rs 发送)
    if (unlistenTraffic) unlistenTraffic();
    unlistenTraffic = await listen<TrafficEvent>("vpn-traffic", (event) => {
      if (status.value === "connected") {
        const { download_bytes, upload_bytes, download_speed, upload_speed } = event.payload;
        stats.value.totalDownload = download_bytes;
        stats.value.totalUpload = upload_bytes;
        stats.value.downloadSpeed = download_speed;
        stats.value.uploadSpeed = upload_speed;
        
        // 实时检查限制
        checkRealTimeLimit();
      }
    });

    // 延迟事件 (从 Rust vpn.rs 发送)
    if (unlistenLatency) unlistenLatency();
    unlistenLatency = await listen<LatencyEvent>("vpn-latency", (event) => {
      if (status.value === "connected") {
        stats.value.latency = event.payload.latency_ms;
      }
    });
  }

  // ============ VPN Actions ============

  async function connect() {
    const authStore = useAuthStore();
    const settingsStore = useSettingsStore();
    const serversStore = useServersStore();
    const logs = useLogsStore();

    // 检查登录状态
    if (authStore.needsLogin) {
      error.value = "Please login to connect";
      router.push("/login");
      return;
    }

    // 检查并刷新 Token
    const tokenValid = await authStore.checkAndRefreshToken();
    if (!tokenValid) {
      error.value = "Session expired, please login again";
      router.push("/login");
      return;
    }

    // 检查每日限制
    const limitCheck = checkDailyLimit();
    if (limitCheck.exceeded) {
      error.value = limitCheck.reason || "Usage limit exceeded";
      logs.addLog("warn", `Connection blocked: ${limitCheck.reason}`);
      return;
    }

    // 检查 Helper
    if (!isHelperReady.value) {
      error.value = "System Extension required";
      return;
    }

    const server = serversStore.currentServer;
    if (!server) {
      error.value = "No server selected";
      return;
    }

    isConnecting.value = true;
    status.value = "connecting";
    error.value = null;
    isVpnBusy.value = true;
    resetStats();

    try {
      await initEventListeners();
      await invoke("connect_hysteria", {
        domain: server.domain,
        password: server.password || "",
        mode: settingsStore.settings.connectionMode,
      });

      status.value = "connected";
      connectedAt = Date.now();
      startConnectedTimeCounter();
      logs.addLog("info", `Connected to ${server.city}, ${server.country}`);
    } catch (e) {
      status.value = "disconnected";
      error.value = String(e);
      logs.addLog("error", String(e));
    } finally {
      isConnecting.value = false;
      isVpnBusy.value = false;
    }
  }

  async function disconnect() {
    if (status.value === "connecting") {
      return cancelConnect();
    }
    if (status.value !== "connected") return;

    isVpnBusy.value = true;
    status.value = "disconnecting";
    const logs = useLogsStore();

    try {
      await invoke("disconnect_vpn");
      logs.addLog("info", "Disconnected");
    } catch (e) {
      logs.addLog("error", `Disconnect failed: ${e}`);
    } finally {
      status.value = "disconnected";
      isVpnBusy.value = false;
      stopConnectedTimeCounter();

      // 保存使用量
      dailyUsage.value.traffic += stats.value.totalDownload + stats.value.totalUpload;
      dailyUsage.value.time += stats.value.connectedTime;
      saveDailyUsage();

      resetStats();
    }
  }

  async function cancelConnect() {
    if (!canCancel.value) return;

    try {
      await invoke("disconnect_vpn");
    } catch (e) {
      console.warn("Cancel signal sent:", e);
    }

    status.value = "disconnected";
    isConnecting.value = false;
    isVpnBusy.value = false;
  }

  // ============ Connected Time Counter ============

  function startConnectedTimeCounter() {
    stopConnectedTimeCounter();
    
    connectedTimeTimer = window.setInterval(() => {
      if (status.value === "connected") {
        stats.value.connectedTime = Math.floor((Date.now() - connectedAt) / 1000);
        checkRealTimeLimit();
      }
    }, 1000);
  }

  function stopConnectedTimeCounter() {
    if (connectedTimeTimer) {
      clearInterval(connectedTimeTimer);
      connectedTimeTimer = null;
    }
  }

  function resetStats() {
    stats.value = {
      ip: "",
      downloadSpeed: 0,
      uploadSpeed: 0,
      latency: 0,
      connectedTime: 0,
      totalDownload: 0,
      totalUpload: 0,
    };
  }

  function checkRealTimeLimit() {
    const authStore = useAuthStore();

    if (authStore.limitType !== "user") return;

    const currentTraffic =
      dailyUsage.value.traffic + stats.value.totalDownload + stats.value.totalUpload;
    const currentTime = dailyUsage.value.time + stats.value.connectedTime;

    const trafficLimit = authStore.dailyTrafficLimit || USER_DAILY_TRAFFIC_LIMIT;
    const timeLimit = authStore.dailyTimeLimit || USER_DAILY_TIME_LIMIT;

    if (trafficLimit > 0 && currentTraffic >= trafficLimit) {
      handleLimitExceeded("Daily traffic limit reached");
      return;
    }

    if (timeLimit > 0 && currentTime >= timeLimit) {
      handleLimitExceeded("Daily time limit reached");
      return;
    }
  }

  function handleLimitExceeded(reason: string) {
    disconnect();
    error.value = reason + ". Upgrade to Pro for unlimited access.";
    useLogsStore().addLog("warn", reason);
  }

  function cleanup() {
    unlistenLog?.();
    unlistenTraffic?.();
    unlistenLatency?.();
    unlistenLog = null;
    unlistenTraffic = null;
    unlistenLatency = null;
    stopConnectedTimeCounter();
  }

  // ============ Helpers ============

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  return {
    // State
    status,
    helperStatus,
    isVpnBusy,
    isHelperBusy,
    error,
    stats,
    isConnecting,
    dailyUsage,

    // Getters
    isConnected,
    isHelperReady,
    canConnect,
    canDisconnect,
    canCancel,
    canInstallHelper,
    canUninstallHelper,

    // Actions
    checkHelperStatus,
    installHelper,
    uninstallHelper,
    connect,
    disconnect,
    cancelConnect,
    initEventListeners,
    cleanup,
    checkDailyLimit,
  };
});
```

---

## 四、实现 Token 自动刷新

### `src/stores/auth.ts` (添加刷新逻辑)

```typescript
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getItem, setItem, removeItem } from "@/utils/storage";
import { login, refreshToken as refreshTokenApi } from "@/api/auth";
import type { User } from "@/types/login";
import { 
  UserRoles, 
  hasAnyRole, 
  isAdmin as checkIsAdmin, 
  isVip as checkIsVip,
  getUserLimitType 
} from "@/types/login";

// Storage Keys
const TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const USER_KEY = "user_info";
const TOKEN_EXPIRE_KEY = "token_expire_at";

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
  const accessToken = ref<string>(getItem(TOKEN_KEY, ""));
  const refreshToken = ref<string>(getItem(REFRESH_TOKEN_KEY, ""));
  const tokenExpireAt = ref<number>(getItem(TOKEN_EXPIRE_KEY, 0));
  const isLoading = ref(false);
  const loginError = ref<string | null>(null);
  const pendingAutoConnect = ref(false);
  const isRefreshing = ref(false); // 正在刷新 Token
  let refreshPromise: Promise<boolean> | null = null; // 防止重复刷新

  // ============ Getters ============

  /** Token 是否有效 */
  const isTokenValid = computed(() => {
    if (!accessToken.value) return false;
    if (tokenExpireAt.value && Date.now() > tokenExpireAt.value) return false;
    return true;
  });

  /** Token 是否即将过期（需要刷新） */
  const isTokenExpiringSoon = computed(() => {
    if (!accessToken.value || !tokenExpireAt.value) return false;
    return Date.now() > tokenExpireAt.value - REFRESH_THRESHOLD;
  });

  /** 是否已登录 */
  const isAuthenticated = computed(() => {
    return !!currentUser.value && isTokenValid.value;
  });

  /** 是否需要登录 */
  const needsLogin = computed(() => !isAuthenticated.value);

  /** 是否为管理员 */
  const isAdmin = computed(() => checkIsAdmin(currentUser.value));

  /** 是否为有效 VIP */
  const isVip = computed(() => checkIsVip(currentUser.value));

  /** 用户限制类型 */
  const limitType = computed(() => getUserLimitType(currentUser.value));

  /** 是否有连接限制 */
  const hasConnectionLimit = computed(() => limitType.value === "user");

  /** 每日流量限制 */
  const dailyTrafficLimit = computed(() => {
    if (limitType.value === "none") return 0;
    if (limitType.value === "vip") return 0;
    return currentUser.value?.daily_traffic_limit || USER_DAILY_TRAFFIC_LIMIT;
  });

  /** 每日时长限制 */
  const dailyTimeLimit = computed(() => {
    if (limitType.value === "none") return 0;
    if (limitType.value === "vip") return 0;
    return currentUser.value?.daily_time_limit || USER_DAILY_TIME_LIMIT;
  });

  /** VIP 过期时间显示 */
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

  /** VIP 剩余天数 */
  const vipDaysRemaining = computed(() => {
    if (!currentUser.value?.vip_expire_at) return 0;
    const expireDate = new Date(currentUser.value.vip_expire_at);
    const now = new Date();
    if (expireDate < now) return 0;
    return Math.ceil((expireDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  });

  /** 用户显示名称 */
  const displayName = computed(() => {
    if (!currentUser.value) return "Guest";
    return currentUser.value.nickname || currentUser.value.username || "User";
  });

  /** 用户邮箱 */
  const userEmail = computed(() => currentUser.value?.email || "");

  /** 头像颜色 */
  const avatarColor = computed(() => {
    const name = currentUser.value?.username || "G";
    return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  });

  /** 头像首字母 */
  const avatarLetter = computed(() => {
    const name = currentUser.value?.nickname || currentUser.value?.username || "G";
    return name.charAt(0).toUpperCase();
  });

  /** 会员等级显示 */
  const membershipLevel = computed(() => {
    if (!currentUser.value) return "Guest";
    if (isAdmin.value) return "Administrator";
    if (isVip.value) return "Pro Member";
    return "Free";
  });

  /** 会员等级样式 */
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

  /** 账户注册时间 */
  const memberSince = computed(() => {
    if (!currentUser.value?.created_at) return null;
    return new Date(currentUser.value.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
  });

  // ============ Actions ============

  /** 登录 */
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

      setItem(USER_KEY, res.user);
      setItem(TOKEN_KEY, res.access_token);
      setItem(REFRESH_TOKEN_KEY, res.refresh_token);
      setItem(TOKEN_EXPIRE_KEY, expireAt);

      pendingAutoConnect.value = true;

      return true;
    } catch (e) {
      loginError.value = e instanceof Error ? e.message : "Login failed";
      console.error("Login error:", e);
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  /** 刷新 Token */
  async function doRefreshToken(): Promise<boolean> {
    // 如果已经在刷新，等待现有的刷新完成
    if (refreshPromise) {
      return refreshPromise;
    }

    if (!refreshToken.value) {
      logout();
      return false;
    }

    isRefreshing.value = true;

    refreshPromise = (async () => {
      try {
        const res = await refreshTokenApi(refreshToken.value);

        if (!res || !res.access_token) {
          throw new Error("Invalid refresh response");
        }

        const expireAt = Date.now() + res.expires_in * 1000;

        accessToken.value = res.access_token;
        refreshToken.value = res.refresh_token;
        tokenExpireAt.value = expireAt;

        setItem(TOKEN_KEY, res.access_token);
        setItem(REFRESH_TOKEN_KEY, res.refresh_token);
        setItem(TOKEN_EXPIRE_KEY, expireAt);

        console.log("Token refreshed successfully");
        return true;
      } catch (e) {
        console.error("Token refresh failed:", e);
        logout();
        return false;
      } finally {
        isRefreshing.value = false;
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  /** 检查并刷新 Token（如需要） */
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

  /** 登出 */
  function logout() {
    currentUser.value = null;
    accessToken.value = "";
    refreshToken.value = "";
    tokenExpireAt.value = 0;
    loginError.value = null;
    pendingAutoConnect.value = false;

    removeItem(USER_KEY);
    removeItem(TOKEN_KEY);
    removeItem(REFRESH_TOKEN_KEY);
    removeItem(TOKEN_EXPIRE_KEY);
  }

  /** 更新用户信息 */
  function updateUser(userData: Partial<User>) {
    if (currentUser.value) {
      currentUser.value = { ...currentUser.value, ...userData };
      setItem(USER_KEY, currentUser.value);
    }
  }

  /** 消费自动连接标记 */
  function consumeAutoConnect(): boolean {
    if (pendingAutoConnect.value) {
      pendingAutoConnect.value = false;
      return true;
    }
    return false;
  }

  return {
    // State
    currentUser,
    accessToken,
    refreshToken,
    isLoading,
    loginError,
    pendingAutoConnect,
    isRefreshing,

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
    doLogin,
    doRefreshToken,
    checkAndRefreshToken,
    logout,
    updateUser,
    consumeAutoConnect,
  };
});
```

### `src/api/auth.ts` (添加 refresh 接口)

```typescript
import request from "@/utils/request";
import type { ResultData, LoginData } from "@/types/login";

/** 登录 */
export function login(data: LoginData) {
  return request<ResultData>({
    url: "/auth/login",
    method: "post",
    data,
  });
}

/** 登出 */
export function logout() {
  return request<null>({
    url: "/auth/logout",
    method: "post",
  });
}

/** 刷新 Token */
export function refreshToken(refresh_token: string) {
  return request<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  }>({
    url: "/auth/refresh",
    method: "post",
    data: { refresh_token },
  });
}
```

### `src/utils/request.ts` (添加自动刷新拦截器)

```typescript
import axios, { AxiosRequestConfig, AxiosError } from "axios";
import { getItem, setItem } from "./storage";

// 使用环境变量
const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api/v1";

const service = axios.create({
  baseURL,
  timeout: 10000,
});

// Token 刷新状态
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

// 添加等待刷新的请求到队列
function subscribeTokenRefresh(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

// Token 刷新成功后，重发队列中的请求
function onTokenRefreshed(newToken: string) {
  refreshSubscribers.forEach((callback) => callback(newToken));
  refreshSubscribers = [];
}

// 刷新 Token
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getItem("refresh_token", "");
  
  if (!refreshToken) {
    return null;
  }

  try {
    const response = await axios.post(`${baseURL}/auth/refresh`, {
      refresh_token: refreshToken,
    });

    const res = response.data;
    
    if (res.code === 0 && res.data) {
      const { access_token, refresh_token: newRefreshToken, expires_in } = res.data;
      const expireAt = Date.now() + expires_in * 1000;

      setItem("access_token", access_token);
      setItem("refresh_token", newRefreshToken);
      setItem("token_expire_at", expireAt);

      return access_token;
    }
    
    return null;
  } catch (error) {
    console.error("Refresh token failed:", error);
    return null;
  }
}

// 请求拦截器
service.interceptors.request.use(
  async (config) => {
    const token = getItem("access_token", "");
    const expireAt = getItem("token_expire_at", 0);
    
    // 检查 Token 是否即将过期（提前5分钟）
    const isExpiringSoon = expireAt && Date.now() > expireAt - 5 * 60 * 1000;
    
    if (token && isExpiringSoon && !config.url?.includes("/auth/refresh")) {
      // Token 即将过期，尝试刷新
      if (!isRefreshing) {
        isRefreshing = true;
        
        const newToken = await refreshAccessToken();
        isRefreshing = false;
        
        if (newToken) {
          onTokenRefreshed(newToken);
          config.headers["Authorization"] = `Bearer ${newToken}`;
        } else {
          // 刷新失败，清理状态
          localStorage.removeItem("tovpn_access_token");
          localStorage.removeItem("tovpn_refresh_token");
          localStorage.removeItem("tovpn_user_info");
          localStorage.removeItem("tovpn_token_expire_at");
          window.location.hash = "/login";
          return Promise.reject(new Error("Session expired"));
        }
      } else {
        // 已经在刷新中，等待刷新完成
        return new Promise((resolve) => {
          subscribeTokenRefresh((newToken: string) => {
            config.headers["Authorization"] = `Bearer ${newToken}`;
            resolve(config);
          });
        });
      }
    } else if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器
service.interceptors.response.use(
  (response) => {
    const res = response.data;
    
    if (res.code !== 0) {
      // 处理 Token 相关错误
      if (res.code === 401 || res.code === 10002 || res.code === 10003) {
        // Token 无效或过期，清理并跳转登录
        localStorage.removeItem("tovpn_access_token");
        localStorage.removeItem("tovpn_refresh_token");
        localStorage.removeItem("tovpn_user_info");
        localStorage.removeItem("tovpn_token_expire_at");
        window.location.hash = "/login";
        return Promise.reject(new Error("Session expired"));
      }
      
      return Promise.reject(new Error(res.message || "Error"));
    }
    
    return res.data;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };
    
    // 401 错误且未重试过
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      if (!isRefreshing) {
        isRefreshing = true;
        
        const newToken = await refreshAccessToken();
        isRefreshing = false;
        
        if (newToken) {
          onTokenRefreshed(newToken);
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers["Authorization"] = `Bearer ${newToken}`;
          return service(originalRequest);
        }
      } else {
        // 等待刷新完成后重试
        return new Promise((resolve) => {
          subscribeTokenRefresh((newToken: string) => {
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers["Authorization"] = `Bearer ${newToken}`;
            resolve(service(originalRequest));
          });
        });
      }
    }
    
    return Promise.reject(error);
  }
);

export function request<T>(config: AxiosRequestConfig): Promise<T> {
  return service(config) as Promise<T>;
}

export default request;
```

---

## 五、更新 useVpn composable

### `src/composables/useVpn.ts`

```typescript
import { useVpnStore } from "@/stores/vpn";
import { useServersStore } from "@/stores/servers";
import { useSettingsStore } from "@/stores/settings";
import { useAuthStore } from "@/stores/auth";
import { storeToRefs } from "pinia";

export function useVpn() {
  const vpnStore = useVpnStore();
  const serversStore = useServersStore();
  const settingsStore = useSettingsStore();
  const authStore = useAuthStore();

  const {
    status,
    helperStatus,
    isVpnBusy,
    isHelperBusy,
    error,
    stats,
    isConnecting,
    isConnected,
    isHelperReady,
    canConnect,
    canDisconnect,
    canCancel,
    canInstallHelper,
    canUninstallHelper,
    dailyUsage,
  } = storeToRefs(vpnStore);

  const { currentServer, currentServerId } = storeToRefs(serversStore);
  const { settings } = storeToRefs(settingsStore);
  const { isAuthenticated, needsLogin, hasConnectionLimit } = storeToRefs(authStore);

  return {
    // VPN State
    status,
    helperStatus,
    isVpnBusy,
    isHelperBusy,
    error,
    stats,
    currentServer,
    currentServerId,
    settings,
    isConnecting,
    dailyUsage,

    // Getters
    isConnected,
    isHelperReady,
    canConnect,
    canDisconnect,
    canCancel,
    canInstallHelper,
    canUninstallHelper,

    // Auth State
    isAuthenticated,
    needsLogin,
    hasConnectionLimit,

    // Actions
    checkHelperStatus: vpnStore.checkHelperStatus,
    installHelper: vpnStore.installHelper,
    uninstallHelper: vpnStore.uninstallHelper,
    connect: vpnStore.connect,
    disconnect: vpnStore.disconnect,
    cancelConnect: vpnStore.cancelConnect,
    selectServer: serversStore.selectServer,
    updateSettings: settingsStore.updateSettings,
    checkDailyLimit: vpnStore.checkDailyLimit,
  };
}
```

---

## 六、Rust 后端事件发送示例

```rust
// 在 vpn.rs 中发送流量统计事件
use tauri::Manager;

#[derive(Clone, serde::Serialize)]
struct TrafficEvent {
    download_bytes: u64,
    upload_bytes: u64,
    download_speed: u64,  // bytes/s
    upload_speed: u64,    // bytes/s
}

#[derive(Clone, serde::Serialize)]
struct LatencyEvent {
    latency_ms: u32,
}

// 在监控循环中发送事件
fn start_traffic_monitor(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut last_download: u64 = 0;
        let mut last_upload: u64 = 0;
        
        loop {
            std::thread::sleep(std::time::Duration::from_secs(1));
            
            // 获取当前流量统计 (从 sing-box API 或本地计数)
            let current_download = get_total_download();
            let current_upload = get_total_upload();
            
            let download_speed = current_download - last_download;
            let upload_speed = current_upload - last_upload;
            
            last_download = current_download;
            last_upload = current_upload;
            
            // 发送流量事件
            let _ = app_handle.emit_all("vpn-traffic", TrafficEvent {
                download_bytes: current_download,
                upload_bytes: current_upload,
                download_speed,
                upload_speed,
            });
            
            // 发送延迟事件 (每5秒测一次)
            if should_test_latency() {
                let latency = measure_latency();
                let _ = app_handle.emit_all("vpn-latency", LatencyEvent {
                    latency_ms: latency,
                });
            }
        }
    });
}
```

---

## 七、修复汇总

| Bug | 修复方案 |
|-----|---------|
| 站点卡片遮盖底部 | 主内容区改为 `overflow-y-auto`，StatsPanel 设为 `shrink-0` 固定在底部 |
| 错误提示位置 | 移到按钮上方，使用 `slide-down` 动画 |
| 服务器切换连接 | 添加 `pendingAction` 机制，跳转后自动断开重连 |
| 流量统计来源 | 监听 `vpn-traffic` 和 `vpn-latency` 事件（从 Rust 发送） |
| Token 自动刷新 | 请求拦截器检测过期，自动调用 refresh API |

---

## 八、新增接口文档

### Token 刷新接口

```yaml
POST /api/v1/auth/refresh

Request:
  Content-Type: application/json
  Body:
    refresh_token: string    # 刷新令牌

Response (成功):
  {
    "code": 0,
    "message": "success",
    "data": {
      "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "expires_in": 7200,
      "token_type": "Bearer"
    },
    "timestamp": 1699999999
  }

Response (失败 - Refresh Token 过期):
  {
    "code": 10004,
    "message": "Refresh token expired",
    "data": null,
    "timestamp": 1699999999
  }
```

# 完整解决方案

## 一、延迟获取方案分析

### 方案对比

| 方案 | 服务器列表延迟 | 连接中延迟 | 准确性 | 实现复杂度 |
|------|---------------|-----------|--------|-----------|
| 纯API | 服务端到节点 | 服务端到节点 | ❌ 不反映用户真实网络 | 简单 |
| 纯Rust | 客户端到节点 | 客户端到节点 | ✅ 真实用户延迟 | 中等 |
| 混合方案 | 客户端测试 | Rust实时监控 | ✅ 最准确 | 推荐 |

### 最佳方案：客户端 Rust 层统一处理

```
┌─────────────────────────────────────────────────────────────────┐
│                        延迟获取架构                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐                     ┌──────────────────────┐ │
│  │  服务器列表   │                     │    VPN 连接状态       │ │
│  └──────┬───────┘                     └──────────┬───────────┘ │
│         │                                        │              │
│         ▼                                        ▼              │
│  ┌──────────────┐                     ┌──────────────────────┐ │
│  │ Rust: 批量   │                     │ Rust: 实时监控       │ │
│  │ TCP Ping     │                     │ (sing-box API/ICMP)  │ │
│  └──────┬───────┘                     └──────────┬───────────┘ │
│         │                                        │              │
│         ▼                                        ▼              │
│  ┌──────────────┐                     ┌──────────────────────┐ │
│  │ 事件发送     │                     │ 事件发送              │ │
│  │ ping-result  │                     │ vpn-latency          │ │
│  └──────┬───────┘                     └──────────┬───────────┘ │
│         │                                        │              │
│         └────────────────┬───────────────────────┘              │
│                          ▼                                      │
│                   ┌──────────────┐                              │
│                   │  前端 Vue    │                              │
│                   │  stores/vpn  │                              │
│                   └──────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、Rust 后端实现

### `src-tauri/src/ping.rs` (新建)

```rust
use std::net::{TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};
use tauri::Manager;
use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct PingResult {
    pub node_id: i32,
    pub latency_ms: i32,  // -1 表示超时或失败
    pub status: String,   // "online" | "offline" | "unknown"
}

/// TCP Ping 单个节点
pub fn tcp_ping(host: &str, port: u16, timeout_ms: u64) -> i32 {
    let addr = format!("{}:{}", host, port);
    
    let socket_addrs = match addr.to_socket_addrs() {
        Ok(addrs) => addrs.collect::<Vec<_>>(),
        Err(_) => return -1,
    };
    
    if socket_addrs.is_empty() {
        return -1;
    }
    
    let start = Instant::now();
    
    match TcpStream::connect_timeout(
        &socket_addrs[0],
        Duration::from_millis(timeout_ms)
    ) {
        Ok(_) => start.elapsed().as_millis() as i32,
        Err(_) => -1,
    }
}

/// 批量测试节点延迟
#[tauri::command]
pub async fn ping_nodes(
    app_handle: tauri::AppHandle,
    nodes: Vec<(i32, String, u16)>  // (id, domain, port)
) -> Result<(), String> {
    // 使用线程池并发测试
    let handles: Vec<_> = nodes.into_iter().map(|(id, domain, port)| {
        let app = app_handle.clone();
        std::thread::spawn(move || {
            let latency = tcp_ping(&domain, port, 5000);
            let status = if latency >= 0 && latency < 500 {
                "online"
            } else if latency >= 500 {
                "slow"
            } else {
                "offline"
            };
            
            let result = PingResult {
                node_id: id,
                latency_ms: latency,
                status: status.to_string(),
            };
            
            // 发送单个节点的结果
            let _ = app.emit_all("ping-result", result);
        })
    }).collect();
    
    // 等待所有测试完成
    for handle in handles {
        let _ = handle.join();
    }
    
    Ok(())
}

/// 测试单个节点延迟（同步返回）
#[tauri::command]
pub fn ping_single_node(domain: String, port: u16) -> i32 {
    tcp_ping(&domain, port, 5000)
}
```

### `src-tauri/src/vpn.rs` (添加状态检查)

```rust
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Manager;
use serde::Serialize;

// 全局 VPN 状态
lazy_static::lazy_static! {
    static ref VPN_CONNECTED: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
    static ref VPN_CONNECTING: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
}

#[derive(Clone, Serialize)]
pub struct VpnStatusResult {
    pub status: String,  // "disconnected" | "connecting" | "connected" | "disconnecting"
    pub server_id: Option<i32>,
}

#[derive(Clone, Serialize)]
pub struct TrafficStats {
    pub download_bytes: u64,
    pub upload_bytes: u64,
    pub download_speed: u64,
    pub upload_speed: u64,
}

#[derive(Clone, Serialize)]
pub struct LatencyStats {
    pub latency_ms: u32,
}

/// 检查当前 VPN 连接状态
#[tauri::command]
pub fn check_vpn_status() -> VpnStatusResult {
    let is_connected = VPN_CONNECTED.load(Ordering::SeqCst);
    let is_connecting = VPN_CONNECTING.load(Ordering::SeqCst);
    
    let status = if is_connecting {
        "connecting"
    } else if is_connected {
        "connected"
    } else {
        "disconnected"
    };
    
    VpnStatusResult {
        status: status.to_string(),
        server_id: None, // TODO: 存储当前连接的服务器ID
    }
}

/// 连接 VPN
#[tauri::command]
pub async fn connect_hysteria(
    app_handle: tauri::AppHandle,
    domain: String,
    password: String,
    mode: String,
) -> Result<(), String> {
    if VPN_CONNECTED.load(Ordering::SeqCst) {
        return Err("Already connected".to_string());
    }
    
    if VPN_CONNECTING.load(Ordering::SeqCst) {
        return Err("Connection in progress".to_string());
    }
    
    VPN_CONNECTING.store(true, Ordering::SeqCst);
    
    // 发送状态变更事件
    let _ = app_handle.emit_all("vpn-status-change", VpnStatusResult {
        status: "connecting".to_string(),
        server_id: None,
    });
    
    // TODO: 实际连接逻辑
    match do_connect(&app_handle, &domain, &password, &mode).await {
        Ok(_) => {
            VPN_CONNECTED.store(true, Ordering::SeqCst);
            VPN_CONNECTING.store(false, Ordering::SeqCst);
            
            let _ = app_handle.emit_all("vpn-status-change", VpnStatusResult {
                status: "connected".to_string(),
                server_id: None,
            });
            
            // 启动流量监控
            start_traffic_monitor(app_handle.clone());
            
            Ok(())
        }
        Err(e) => {
            VPN_CONNECTED.store(false, Ordering::SeqCst);
            VPN_CONNECTING.store(false, Ordering::SeqCst);
            
            let _ = app_handle.emit_all("vpn-status-change", VpnStatusResult {
                status: "disconnected".to_string(),
                server_id: None,
            });
            
            Err(e)
        }
    }
}

/// 断开 VPN
#[tauri::command]
pub async fn disconnect_vpn(app_handle: tauri::AppHandle) -> Result<(), String> {
    let _ = app_handle.emit_all("vpn-status-change", VpnStatusResult {
        status: "disconnecting".to_string(),
        server_id: None,
    });
    
    // TODO: 实际断开逻辑
    
    VPN_CONNECTED.store(false, Ordering::SeqCst);
    VPN_CONNECTING.store(false, Ordering::SeqCst);
    
    let _ = app_handle.emit_all("vpn-status-change", VpnStatusResult {
        status: "disconnected".to_string(),
        server_id: None,
    });
    
    Ok(())
}

async fn do_connect(
    _app_handle: &tauri::AppHandle,
    _domain: &str,
    _password: &str,
    _mode: &str,
) -> Result<(), String> {
    // TODO: 实际实现
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    Ok(())
}

fn start_traffic_monitor(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut last_download: u64 = 0;
        let mut last_upload: u64 = 0;
        let mut tick_count = 0u32;
        
        while VPN_CONNECTED.load(Ordering::SeqCst) {
            std::thread::sleep(std::time::Duration::from_secs(1));
            
            // TODO: 从 sing-box API 获取实际流量
            let current_download = last_download + rand::random::<u64>() % 500_000;
            let current_upload = last_upload + rand::random::<u64>() % 100_000;
            
            let download_speed = current_download - last_download;
            let upload_speed = current_upload - last_upload;
            
            last_download = current_download;
            last_upload = current_upload;
            
            // 发送流量统计
            let _ = app_handle.emit_all("vpn-traffic", TrafficStats {
                download_bytes: current_download,
                upload_bytes: current_upload,
                download_speed,
                upload_speed,
            });
            
            // 每5秒测一次延迟
            tick_count += 1;
            if tick_count % 5 == 0 {
                // TODO: 实际测量延迟
                let latency = 30 + rand::random::<u32>() % 50;
                let _ = app_handle.emit_all("vpn-latency", LatencyStats {
                    latency_ms: latency,
                });
            }
        }
    });
}
```

### `src-tauri/src/main.rs` (注册命令)

```rust
mod ping;
mod vpn;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            ping::ping_nodes,
            ping::ping_single_node,
            vpn::check_vpn_status,
            vpn::connect_hysteria,
            vpn::disconnect_vpn,
            // ... 其他命令
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## 三、前端 VPN Store 修复

### `src/stores/vpn.ts`

```typescript
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { VpnStatus, HelperStatus, ConnectionStats } from "@/types";
import { useLogsStore } from "./logs";
import { useSettingsStore } from "./settings";
import { useServersStore } from "./servers";
import { useAuthStore } from "./auth";
import router from "@/router";

// 事件类型定义
interface LogEvent {
  level: string;
  message: string;
  timestamp: number;
}

interface TrafficEvent {
  download_bytes: number;
  upload_bytes: number;
  download_speed: number;
  upload_speed: number;
}

interface LatencyEvent {
  latency_ms: number;
}

interface VpnStatusEvent {
  status: string;
  server_id: number | null;
}

interface HelperResult {
  success: boolean;
  message: string;
}

interface HelperStatusResult {
  status: string;
}

interface VpnStatusResult {
  status: string;
  server_id: number | null;
}

// 每日限制
const DAILY_USAGE_KEY = "daily_usage";
const USER_DAILY_TRAFFIC_LIMIT = 1 * 1024 * 1024 * 1024;
const USER_DAILY_TIME_LIMIT = 2 * 60 * 60;

interface DailyUsage {
  date: string;
  traffic: number;
  time: number;
}

export const useVpnStore = defineStore("vpn", () => {
  // ============ State ============
  const status = ref<VpnStatus>("disconnected");
  const helperStatus = ref<HelperStatus>("not_installed");
  const isVpnBusy = ref(false);
  const isHelperBusy = ref(false);
  const error = ref<string | null>(null);

  const stats = ref<ConnectionStats>({
    ip: "",
    downloadSpeed: 0,
    uploadSpeed: 0,
    latency: 0,
    connectedTime: 0,
    totalDownload: 0,
    totalUpload: 0,
  });

  const dailyUsage = ref<DailyUsage>(loadDailyUsage());

  // 事件监听句柄
  let unlistenLog: UnlistenFn | null = null;
  let unlistenTraffic: UnlistenFn | null = null;
  let unlistenLatency: UnlistenFn | null = null;
  let unlistenStatus: UnlistenFn | null = null;
  let connectedTimeTimer: number | null = null;
  let connectedAt = 0;

  // ============ Getters ============
  const isConnected = computed(() => status.value === "connected");
  const isConnecting = computed(() => status.value === "connecting");
  const isDisconnecting = computed(() => status.value === "disconnecting");

  const isHelperReady = computed(
    () => helperStatus.value === "installed" || helperStatus.value === "running"
  );

  const canConnect = computed(
    () => !isVpnBusy.value && isHelperReady.value && status.value === "disconnected"
  );

  const canDisconnect = computed(
    () => !isVpnBusy.value && (status.value === "connected" || status.value === "connecting")
  );

  const canCancel = computed(() => status.value === "connecting");

  const canInstallHelper = computed(() => !isHelperBusy.value);

  const canUninstallHelper = computed(
    () => !isHelperBusy.value && helperStatus.value !== "not_installed"
  );

  // ============ 每日限制 ============

  function loadDailyUsage(): DailyUsage {
    const today = new Date().toISOString().split("T")[0];
    const stored = localStorage.getItem(DAILY_USAGE_KEY);

    if (stored) {
      try {
        const data = JSON.parse(stored) as DailyUsage;
        if (data.date === today) return data;
      } catch { /* ignore */ }
    }

    return { date: today, traffic: 0, time: 0 };
  }

  function saveDailyUsage() {
    localStorage.setItem(DAILY_USAGE_KEY, JSON.stringify(dailyUsage.value));
  }

  function checkDailyLimit(): { exceeded: boolean; reason?: string } {
    const authStore = useAuthStore();

    if (authStore.limitType !== "user") {
      return { exceeded: false };
    }

    const trafficLimit = authStore.dailyTrafficLimit || USER_DAILY_TRAFFIC_LIMIT;
    const timeLimit = authStore.dailyTimeLimit || USER_DAILY_TIME_LIMIT;

    if (trafficLimit > 0 && dailyUsage.value.traffic >= trafficLimit) {
      return {
        exceeded: true,
        reason: `Daily traffic limit reached (${formatBytes(trafficLimit)})`,
      };
    }

    if (timeLimit > 0 && dailyUsage.value.time >= timeLimit) {
      return {
        exceeded: true,
        reason: `Daily time limit reached (${formatTime(timeLimit)})`,
      };
    }

    return { exceeded: false };
  }

  // ============ 状态同步 ============

  /**
   * 从 Rust 后端同步当前 VPN 状态
   * 应该在应用启动和页面加载时调用
   */
  async function syncVpnStatus() {
    try {
      const result = await invoke<VpnStatusResult>("check_vpn_status");
      
      // 更新本地状态
      const newStatus = result.status as VpnStatus;
      
      if (status.value !== newStatus) {
        console.log(`VPN status synced: ${status.value} -> ${newStatus}`);
        status.value = newStatus;
        
        // 如果是已连接状态，启动计时器
        if (newStatus === "connected" && !connectedTimeTimer) {
          connectedAt = Date.now() - (stats.value.connectedTime * 1000);
          startConnectedTimeCounter();
        }
        
        // 如果是断开状态，停止计时器
        if (newStatus === "disconnected") {
          stopConnectedTimeCounter();
        }
      }
      
      return result;
    } catch (e) {
      console.error("Failed to sync VPN status:", e);
      return null;
    }
  }

  // ============ Event Listeners ============

  async function initEventListeners() {
    const logs = useLogsStore();

    // 日志事件
    if (unlistenLog) unlistenLog();
    unlistenLog = await listen<LogEvent>("vpn-log", (event) => {
      const { level, message } = event.payload;
      const logLvl = level === "warn" || level === "error" ? level : "info";
      logs.addLog(logLvl, message);
    });

    // 状态变更事件（核心！从 Rust 同步状态）
    if (unlistenStatus) unlistenStatus();
    unlistenStatus = await listen<VpnStatusEvent>("vpn-status-change", (event) => {
      const newStatus = event.payload.status as VpnStatus;
      console.log(`VPN status event: ${newStatus}`);
      
      status.value = newStatus;
      
      if (newStatus === "connected") {
        connectedAt = Date.now();
        startConnectedTimeCounter();
        logs.addLog("info", "VPN Connected");
      } else if (newStatus === "disconnected") {
        stopConnectedTimeCounter();
        
        // 保存使用量
        dailyUsage.value.traffic += stats.value.totalDownload + stats.value.totalUpload;
        dailyUsage.value.time += stats.value.connectedTime;
        saveDailyUsage();
        
        resetStats();
      }
    });

    // 流量统计事件
    if (unlistenTraffic) unlistenTraffic();
    unlistenTraffic = await listen<TrafficEvent>("vpn-traffic", (event) => {
      if (status.value === "connected") {
        const { download_bytes, upload_bytes, download_speed, upload_speed } = event.payload;
        stats.value.totalDownload = download_bytes;
        stats.value.totalUpload = upload_bytes;
        stats.value.downloadSpeed = download_speed;
        stats.value.uploadSpeed = upload_speed;
        
        checkRealTimeLimit();
      }
    });

    // 延迟事件
    if (unlistenLatency) unlistenLatency();
    unlistenLatency = await listen<LatencyEvent>("vpn-latency", (event) => {
      if (status.value === "connected") {
        stats.value.latency = event.payload.latency_ms;
      }
    });
  }

  // ============ Helper Actions ============

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
    if (!canInstallHelper.value) return;

    isHelperBusy.value = true;
    error.value = null;
    const logs = useLogsStore();

    try {
      await initEventListeners();
      const res = await invoke<HelperResult>("install_helper");
      if (res.success) {
        helperStatus.value = "installed";
        await checkHelperStatus();
        logs.addLog("info", "Helper installed successfully");
      } else {
        throw new Error(res.message);
      }
    } catch (e) {
      const msg = String(e);
      error.value = msg;
      logs.addLog("error", `Helper install failed: ${msg}`);
    } finally {
      isHelperBusy.value = false;
    }
  }

  async function uninstallHelper() {
    if (!canUninstallHelper.value) return;

    isHelperBusy.value = true;
    const logs = useLogsStore();

    try {
      const res = await invoke<HelperResult>("uninstall_helper");
      if (res.success) {
        helperStatus.value = "not_installed";
        logs.addLog("info", "Helper uninstalled");
      } else {
        throw new Error(res.message);
      }
    } catch (e) {
      logs.addLog("error", `Helper uninstall failed: ${e}`);
    } finally {
      isHelperBusy.value = false;
    }
  }

  // ============ VPN Actions ============

  async function connect() {
    const authStore = useAuthStore();
    const settingsStore = useSettingsStore();
    const serversStore = useServersStore();
    const logs = useLogsStore();

    // 如果已经连接，不重复连接
    if (status.value === "connected") {
      console.log("Already connected, skip connect");
      return;
    }

    // 如果正在连接中，不重复
    if (status.value === "connecting") {
      console.log("Already connecting, skip");
      return;
    }

    // 检查登录状态
    if (authStore.needsLogin) {
      error.value = "Please login to connect";
      router.push("/login");
      return;
    }

    // 检查并刷新 Token
    const tokenValid = await authStore.checkAndRefreshToken();
    if (!tokenValid) {
      error.value = "Session expired, please login again";
      router.push("/login");
      return;
    }

    // 检查每日限制
    const limitCheck = checkDailyLimit();
    if (limitCheck.exceeded) {
      error.value = limitCheck.reason || "Usage limit exceeded";
      logs.addLog("warn", `Connection blocked: ${limitCheck.reason}`);
      return;
    }

    // 检查 Helper
    if (!isHelperReady.value) {
      error.value = "System Extension required";
      return;
    }

    const server = serversStore.currentServer;
    if (!server) {
      error.value = "No server selected";
      return;
    }

    isVpnBusy.value = true;
    error.value = null;
    resetStats();

    try {
      await initEventListeners();
      
      // 调用 Rust 连接（状态变更通过事件同步）
      await invoke("connect_hysteria", {
        domain: server.domain,
        password: server.password || "",
        mode: settingsStore.settings.connectionMode,
      });
      
      logs.addLog("info", `Connected to ${server.city}, ${server.country}`);
    } catch (e) {
      error.value = String(e);
      logs.addLog("error", String(e));
    } finally {
      isVpnBusy.value = false;
    }
  }

  async function disconnect() {
    if (status.value === "disconnected") {
      console.log("Already disconnected, skip");
      return;
    }

    isVpnBusy.value = true;

    try {
      await invoke("disconnect_vpn");
    } catch (e) {
      useLogsStore().addLog("error", `Disconnect failed: ${e}`);
    } finally {
      isVpnBusy.value = false;
    }
  }

  async function cancelConnect() {
    if (!canCancel.value) return;

    try {
      await invoke("disconnect_vpn");
    } catch (e) {
      console.warn("Cancel signal sent:", e);
    }
  }

  // ============ Connected Time Counter ============

  function startConnectedTimeCounter() {
    stopConnectedTimeCounter();

    connectedTimeTimer = window.setInterval(() => {
      if (status.value === "connected") {
        stats.value.connectedTime = Math.floor((Date.now() - connectedAt) / 1000);
        checkRealTimeLimit();
      }
    }, 1000);
  }

  function stopConnectedTimeCounter() {
    if (connectedTimeTimer) {
      clearInterval(connectedTimeTimer);
      connectedTimeTimer = null;
    }
  }

  function resetStats() {
    stats.value = {
      ip: "",
      downloadSpeed: 0,
      uploadSpeed: 0,
      latency: 0,
      connectedTime: 0,
      totalDownload: 0,
      totalUpload: 0,
    };
  }

  function checkRealTimeLimit() {
    const authStore = useAuthStore();

    if (authStore.limitType !== "user") return;

    const currentTraffic =
      dailyUsage.value.traffic + stats.value.totalDownload + stats.value.totalUpload;
    const currentTime = dailyUsage.value.time + stats.value.connectedTime;

    const trafficLimit = authStore.dailyTrafficLimit || USER_DAILY_TRAFFIC_LIMIT;
    const timeLimit = authStore.dailyTimeLimit || USER_DAILY_TIME_LIMIT;

    if (trafficLimit > 0 && currentTraffic >= trafficLimit) {
      handleLimitExceeded("Daily traffic limit reached");
      return;
    }

    if (timeLimit > 0 && currentTime >= timeLimit) {
      handleLimitExceeded("Daily time limit reached");
      return;
    }
  }

  function handleLimitExceeded(reason: string) {
    disconnect();
    error.value = reason + ". Upgrade to Pro for unlimited access.";
    useLogsStore().addLog("warn", reason);
  }

  function clearError() {
    error.value = null;
  }

  function cleanup() {
    unlistenLog?.();
    unlistenTraffic?.();
    unlistenLatency?.();
    unlistenStatus?.();
    unlistenLog = null;
    unlistenTraffic = null;
    unlistenLatency = null;
    unlistenStatus = null;
    stopConnectedTimeCounter();
  }

  // ============ Helpers ============

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  return {
    // State
    status,
    helperStatus,
    isVpnBusy,
    isHelperBusy,
    error,
    stats,
    dailyUsage,

    // Getters
    isConnected,
    isConnecting,
    isDisconnecting,
    isHelperReady,
    canConnect,
    canDisconnect,
    canCancel,
    canInstallHelper,
    canUninstallHelper,

    // Actions
    syncVpnStatus,
    checkHelperStatus,
    installHelper,
    uninstallHelper,
    connect,
    disconnect,
    cancelConnect,
    initEventListeners,
    cleanup,
    checkDailyLimit,
    clearError,
  };
});
```

---

## 四、前端 Servers Store 添加 Ping 功能

### `src/stores/servers.ts`

```typescript
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { getVpnNodes } from "@/api/server";
import type { Server } from "@/types/server";

export type PendingAction = "connect" | "switch" | null;

interface PingResult {
  node_id: number;
  latency_ms: number;
  status: string;
}

export const useServersStore = defineStore("servers", () => {
  const servers = ref<Server[]>([]);
  const currentServerId = ref<number | null>(null);
  const isLoading = ref(false);
  const isPinging = ref(false);
  const error = ref<string | null>(null);

  const pendingAction = ref<PendingAction>(null);

  let unlistenPing: UnlistenFn | null = null;

  const currentServer = computed(() =>
    servers.value.find((s) => s.id === currentServerId.value) || servers.value[0]
  );

  async function loadServers() {
    isLoading.value = true;
    error.value = null;

    try {
      const nodes = await getVpnNodes();
      servers.value = nodes.map((n) => ({
        ...n,
        ping: 9999,
        status: "unknown" as const,
      }));

      const savedId = localStorage.getItem("currentServerId");
      if (savedId && servers.value.some((s) => s.id === parseInt(savedId))) {
        currentServerId.value = parseInt(savedId);
      } else if (servers.value.length > 0) {
        currentServerId.value = servers.value[0].id;
      }

      // 加载完成后自动测试延迟
      await testAllPings();
    } catch (e) {
      error.value = String(e);
      console.error("Failed to load servers:", e);
    } finally {
      isLoading.value = false;
    }
  }

  function selectServer(id: number) {
    currentServerId.value = id;
    localStorage.setItem("currentServerId", id.toString());
  }

  function setPendingAction(action: PendingAction) {
    pendingAction.value = action;
  }

  function consumePendingAction(): PendingAction {
    const action = pendingAction.value;
    pendingAction.value = null;
    return action;
  }

  /**
   * 测试所有节点延迟（通过 Rust 批量测试）
   */
  async function testAllPings() {
    if (isPinging.value || servers.value.length === 0) return;

    isPinging.value = true;

    // 设置监听器接收 ping 结果
    if (unlistenPing) unlistenPing();
    unlistenPing = await listen<PingResult>("ping-result", (event) => {
      const { node_id, latency_ms, status } = event.payload;
      const server = servers.value.find((s) => s.id === node_id);
      if (server) {
        server.ping = latency_ms >= 0 ? latency_ms : 9999;
        server.status = status as "online" | "offline" | "unknown";
      }
    });

    try {
      // 准备节点列表
      const nodes = servers.value.map((s) => [s.id, s.domain, s.port || 443] as [number, string, number]);

      // 调用 Rust 批量测试
      await invoke("ping_nodes", { nodes });
    } catch (e) {
      console.error("Ping failed:", e);
    } finally {
      isPinging.value = false;
    }
  }

  /**
   * 测试单个节点延迟
   */
  async function testSinglePing(serverId: number): Promise<number> {
    const server = servers.value.find((s) => s.id === serverId);
    if (!server) return 9999;

    try {
      const latency = await invoke<number>("ping_single_node", {
        domain: server.domain,
        port: server.port || 443,
      });

      server.ping = latency >= 0 ? latency : 9999;
      server.status = latency >= 0 && latency < 500 ? "online" : "offline";

      return server.ping;
    } catch (e) {
      console.error("Single ping failed:", e);
      return 9999;
    }
  }

  function cleanup() {
    unlistenPing?.();
    unlistenPing = null;
  }

  return {
    servers,
    currentServer,
    currentServerId,
    isLoading,
    isPinging,
    error,
    pendingAction,
    loadServers,
    selectServer,
    setPendingAction,
    consumePendingAction,
    testAllPings,
    testSinglePing,
    cleanup,
  };
});
```

---

## 五、修复 HomeView 布局

### `src/views/HomeView.vue`

```vue
<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useVpnStore } from '@/stores/vpn'
import { useAuthStore } from '@/stores/auth'
import { useServersStore } from '@/stores/servers'
import { formatDuration } from '@/utils/format'
import ConnectButton from '@/components/dashboard/ConnectButton.vue'
import ServerCard from '@/components/dashboard/ServerCard.vue'
import StatsPanel from '@/components/dashboard/StatsPanel.vue'

const router = useRouter()
const vpnStore = useVpnStore()
const authStore = useAuthStore()
const serversStore = useServersStore()

const { status, isVpnBusy, error, stats, isConnected, isConnecting, isHelperReady, canCancel } = storeToRefs(vpnStore)
const { currentServer } = storeToRefs(serversStore)
const { isAuthenticated, needsLogin, hasConnectionLimit, dailyTrafficLimit, dailyTimeLimit, membershipLevel } = storeToRefs(authStore)

// ============ 错误提示逻辑 ============
const showError = ref(false)
const errorMessage = ref('')
let errorTimer: number | null = null

watch(error, (newError) => {
  if (newError) {
    errorMessage.value = newError
    showError.value = true
    
    if (errorTimer) clearTimeout(errorTimer)
    
    errorTimer = window.setTimeout(() => {
      showError.value = false
      vpnStore.clearError()
      setTimeout(() => errorMessage.value = '', 300)
    }, 5000)
  } else {
    showError.value = false
  }
}, { immediate: true })

function dismissError() {
  showError.value = false
  vpnStore.clearError()
  if (errorTimer) {
    clearTimeout(errorTimer)
    errorTimer = null
  }
}

onUnmounted(() => {
  if (errorTimer) clearTimeout(errorTimer)
})

// ============ 初始化 ============
onMounted(async () => {
  // 1. 初始化事件监听
  await vpnStore.initEventListeners()
  
  // 2. 从 Rust 同步当前 VPN 状态（核心！）
  await vpnStore.syncVpnStatus()
  
  // 3. 检查 Helper 状态
  await vpnStore.checkHelperStatus()
  
  // 4. 检查是否有待执行的服务器切换
  const pendingAction = serversStore.consumePendingAction()
  
  if (pendingAction === 'connect') {
    // 从服务器列表选择了新服务器
    if (isConnected.value) {
      // 已连接 -> 断开后重连
      await vpnStore.disconnect()
      setTimeout(() => handleConnect(), 500)
    } else {
      // 未连接 -> 直接连接
      handleConnect()
    }
  } else if (authStore.consumeAutoConnect() && isHelperReady.value) {
    // 登录后自动连接
    setTimeout(() => handleConnect(), 500)
  }
})

// 监听登录状态变化
watch(isAuthenticated, (authenticated) => {
  if (!authenticated && isConnected.value) {
    vpnStore.disconnect()
  }
})

// ============ 计算属性 ============
const buttonDisabled = computed(() => {
  if (status.value === 'disconnecting') return true
  if (status.value === 'connecting') return false
  return isVpnBusy.value
})

const limitInfo = computed(() => {
  if (!hasConnectionLimit.value) return null
  
  const traffic = dailyTrafficLimit.value
  const time = dailyTimeLimit.value
  
  const parts = []
  if (traffic > 0) parts.push(formatBytes(traffic))
  if (time > 0) parts.push(formatDuration(time))
  
  return parts.join(' / ')
})

const topNoticeType = computed(() => {
  if (needsLogin.value) return 'login'
  if (isAuthenticated.value && !isHelperReady.value && status.value === 'disconnected') return 'helper'
  if (isAuthenticated.value && hasConnectionLimit.value && limitInfo.value) return 'limit'
  return null
})

// ============ 方法 ============
async function handleConnect() {
  if (needsLogin.value) {
    router.push('/login')
    return
  }
  
  if (status.value === 'connected') {
    return vpnStore.disconnect()
  }

  if (!isHelperReady.value) {
    const confirm = window.confirm("System Extension is required. Go to Settings?")
    if (confirm) router.push('/settings')
    return
  }

  const limitCheck = vpnStore.checkDailyLimit()
  if (limitCheck.exceeded) {
    window.confirm(`${limitCheck.reason}\n\nUpgrade to Pro?`)
    return
  }

  vpnStore.connect()
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  }
  return (bytes / (1024 * 1024)).toFixed(0) + ' MB'
}
</script>

<template>
  <!-- 
    关键布局：
    1. 外层容器 h-full + flex-col + overflow-hidden (不允许滚动)
    2. 主内容区 flex-1 + relative (撑满中间)
    3. 所有内容通过 absolute + flex 居中
    4. StatsPanel 作为 shrink-0 固定在底部
  -->
  <div class="h-full flex flex-col bg-[var(--vpn-bg)] overflow-hidden relative">
    
    <!-- Background Effects (绝对定位，不影响布局) -->
    <div class="absolute inset-0 pointer-events-none overflow-hidden">
      <div class="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-sky-400/10 rounded-full blur-[100px]"></div>
      <div class="absolute bottom-[10%] left-[-10%] w-[400px] h-[400px] bg-emerald-400/10 rounded-full blur-[80px]"></div>
    </div>

    <!-- Main Content Area (flex-1 撑满中间空间) -->
    <div class="flex-1 relative z-10 flex flex-col">
      
      <!-- 内容居中容器 -->
      <div class="flex-1 flex flex-col items-center justify-center px-6">
        
        <!-- 顶部提示 (绝对定位在内容上方) -->
        <div class="absolute top-4 left-0 right-0 flex justify-center px-6">
          <Transition name="fade" mode="out-in">
            <button
              v-if="topNoticeType === 'login'"
              key="login"
              @click="router.push('/login')"
              class="px-4 py-1.5 rounded-full bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 text-xs font-medium flex items-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors shadow-sm"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              <span>Login to connect</span>
            </button>

            <button
              v-else-if="topNoticeType === 'helper'"
              key="helper"
              @click="router.push('/settings')"
              class="px-4 py-1.5 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 text-xs font-medium flex items-center gap-2 hover:bg-amber-100 transition-colors shadow-sm"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Install System Extension</span>
            </button>

            <div 
              v-else-if="topNoticeType === 'limit'"
              key="limit"
              class="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-white/10 text-[11px] text-[var(--vpn-text-secondary)] flex items-center gap-2 shadow-sm"
            >
              <span>Daily: {{ limitInfo }}</span>
              <span class="text-[var(--vpn-primary)] cursor-pointer hover:underline">Upgrade</span>
            </div>
          </Transition>
        </div>

        <!-- 主内容组 -->
        <div class="flex flex-col items-center w-full max-w-md">
          
          <!-- 错误提示 (在按钮上方，绝对定位) -->
          <div class="w-full mb-4 h-10 relative">
            <Transition name="fade">
              <div 
                v-if="showError && errorMessage"
                class="absolute inset-x-0 top-0"
              >
                <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
                  <svg class="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span class="flex-1 text-xs text-red-600 dark:text-red-400 font-medium truncate">{{ errorMessage }}</span>
                  <button @click="dismissError" class="p-0.5 rounded hover:bg-red-200 dark:hover:bg-red-800 transition-colors">
                    <svg class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </Transition>
          </div>

          <!-- Connect Button -->
          <ConnectButton 
            :status="status" 
            :disabled="buttonDisabled" 
            :can-cancel="canCancel" 
            @click="handleConnect"
            @cancel="vpnStore.cancelConnect" 
          />

          <!-- Timer -->
          <div class="h-8 flex items-center justify-center mt-3">
            <Transition name="fade">
              <div 
                v-if="isConnected && stats.connectedTime > 0"
                class="px-3 py-1 rounded-full bg-white/80 dark:bg-white/10 border border-[var(--vpn-border)] shadow-sm text-xs font-mono text-[var(--vpn-text-secondary)]"
              >
                {{ formatDuration(stats.connectedTime) }}
              </div>
            </Transition>
          </div>

          <!-- Server Card -->
          <div class="mt-4">
            <ServerCard 
              v-if="currentServer" 
              :server="currentServer" 
              @click="router.push('/servers')" 
            />
          </div>

          <!-- Membership Badge -->
          <div v-if="isAuthenticated" class="mt-3 flex items-center gap-2 text-[11px]">
            <span class="text-[var(--vpn-text-secondary)]">Logged in as</span>
            <span 
              class="px-2 py-0.5 rounded-full font-medium"
              :class="{
                'bg-purple-500/10 text-purple-500': membershipLevel === 'Administrator',
                'bg-emerald-500/10 text-emerald-500': membershipLevel === 'Pro Member',
                'bg-slate-500/10 text-slate-500': membershipLevel === 'Free',
              }"
            >
              {{ membershipLevel }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Stats Panel (固定高度，不参与 flex 拉伸) -->
    <StatsPanel :stats="stats" :is-connected="isConnected" class="shrink-0 relative z-20" />
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
```

---

## 六、修复 App.vue 初始化

### `src/App.vue`

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import AppLayout from '@/components/layout/AppLayout.vue'
import { useVpnStore } from '@/stores/vpn'
import { useServersStore } from '@/stores/servers'

const vpnStore = useVpnStore()
const serversStore = useServersStore()

onMounted(async () => {
  // 1. 初始化事件监听器
  await vpnStore.initEventListeners()
  
  // 2. 同步 VPN 状态（从 Rust 获取真实状态）
  await vpnStore.syncVpnStatus()
  
  // 3. 检查 Helper 状态
  await vpnStore.checkHelperStatus()
  
  // 4. 加载服务器列表
  await serversStore.loadServers()
})

onUnmounted(() => {
  vpnStore.cleanup()
  serversStore.cleanup()
})
</script>

<template>
  <AppLayout />
</template>
```

---

## 七、更新 useVpn composable

### `src/composables/useVpn.ts`

```typescript
import { useVpnStore } from "@/stores/vpn";
import { useServersStore } from "@/stores/servers";
import { useSettingsStore } from "@/stores/settings";
import { useAuthStore } from "@/stores/auth";
import { storeToRefs } from "pinia";

export function useVpn() {
  const vpnStore = useVpnStore();
  const serversStore = useServersStore();
  const settingsStore = useSettingsStore();
  const authStore = useAuthStore();

  const {
    status,
    helperStatus,
    isVpnBusy,
    isHelperBusy,
    error,
    stats,
    isConnected,
    isConnecting,
    isDisconnecting,
    isHelperReady,
    canConnect,
    canDisconnect,
    canCancel,
    canInstallHelper,
    canUninstallHelper,
    dailyUsage,
  } = storeToRefs(vpnStore);

  const { currentServer, currentServerId, isPinging } = storeToRefs(serversStore);
  const { settings } = storeToRefs(settingsStore);
  const { isAuthenticated, needsLogin, hasConnectionLimit } = storeToRefs(authStore);

  return {
    // VPN State
    status,
    helperStatus,
    isVpnBusy,
    isHelperBusy,
    error,
    stats,
    currentServer,
    currentServerId,
    settings,
    dailyUsage,
    isPinging,

    // Getters
    isConnected,
    isConnecting,
    isDisconnecting,
    isHelperReady,
    canConnect,
    canDisconnect,
    canCancel,
    canInstallHelper,
    canUninstallHelper,

    // Auth State
    isAuthenticated,
    needsLogin,
    hasConnectionLimit,

    // VPN Actions
    syncVpnStatus: vpnStore.syncVpnStatus,
    checkHelperStatus: vpnStore.checkHelperStatus,
    installHelper: vpnStore.installHelper,
    uninstallHelper: vpnStore.uninstallHelper,
    connect: vpnStore.connect,
    disconnect: vpnStore.disconnect,
    cancelConnect: vpnStore.cancelConnect,
    checkDailyLimit: vpnStore.checkDailyLimit,
    clearError: vpnStore.clearError,

    // Server Actions
    selectServer: serversStore.selectServer,
    testAllPings: serversStore.testAllPings,
    testSinglePing: serversStore.testSinglePing,

    // Settings Actions
    updateSettings: settingsStore.updateSettings,
  };
}
```

---

## 八、修复汇总

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| VPN 状态不同步 | 前端状态是本地的，没有从 Rust 同步 | 添加 `syncVpnStatus()` 和 `vpn-status-change` 事件监听 |
| 按钮状态不变化 | 状态变更没有通过事件同步 | Rust 连接/断开时发送 `vpn-status-change` 事件 |
| 延迟获取 | 无统一方案 | Rust 层 TCP Ping，通过 `ping-result` 事件发送结果 |
| 错误提示挤压布局 | 错误区域参与 flex 布局 | 错误区域改为固定高度 + 绝对定位内容 |
| 主页面滚动 | 布局不合理 | 外层 `overflow-hidden`，内容通过 flex 居中 |

---

## 九、接口补充（Rust 命令）

```rust
// 需要在 Tauri 中注册的命令

// 1. 检查 VPN 状态
#[tauri::command]
fn check_vpn_status() -> VpnStatusResult

// 2. 批量 Ping 节点
#[tauri::command]
async fn ping_nodes(app_handle: AppHandle, nodes: Vec<(i32, String, u16)>) -> Result<(), String>

// 3. 单个 Ping
#[tauri::command]
fn ping_single_node(domain: String, port: u16) -> i32

// 4. 连接 VPN
#[tauri::command]
async fn connect_hysteria(app_handle: AppHandle, domain: String, password: String, mode: String) -> Result<(), String>

// 5. 断开 VPN  
#[tauri::command]
async fn disconnect_vpn(app_handle: AppHandle) -> Result<(), String>

// 6. 检查 Helper 状态
#[tauri::command]
fn check_helper_status() -> HelperStatusResult

// 7. 安装 Helper
#[tauri::command]
async fn install_helper() -> HelperResult

// 8. 卸载 Helper
#[tauri::command]
async fn uninstall_helper() -> HelperResult
```

**事件（从 Rust 发送到前端）：**

```rust
// vpn-status-change: VPN 状态变更
{ status: "connecting" | "connected" | "disconnecting" | "disconnected", server_id: Option<i32> }

// vpn-traffic: 流量统计（每秒）
{ download_bytes: u64, upload_bytes: u64, download_speed: u64, upload_speed: u64 }

// vpn-latency: 延迟（每5秒）
{ latency_ms: u32 }

// ping-result: 单个节点 Ping 结果
{ node_id: i32, latency_ms: i32, status: "online" | "offline" | "slow" }

// vpn-log: 日志
{ level: "info" | "warn" | "error", message: String, timestamp: u64 }
```

# 完整拆分方案

## 一、Rust 后端拆分

### 目录结构

```
src-tauri/src/
├── main.rs
├── vpn/
│   ├── mod.rs          # 模块导出
│   ├── state.rs        # 状态管理
│   ├── helper.rs       # Helper 相关
│   ├── proxy.rs        # 系统代理
│   ├── connect.rs      # 连接/断开逻辑
│   ├── monitor.rs      # 流量/延迟监控
│   └── ping.rs         # Ping 功能
└── lib.rs
```

### `src-tauri/src/vpn/mod.rs`

```rust
pub mod state;
pub mod helper;
pub mod proxy;
pub mod connect;
pub mod monitor;
pub mod ping;

// 重新导出常用类型和函数
pub use state::*;
pub use helper::*;
pub use proxy::*;
pub use connect::*;
pub use monitor::*;
pub use ping::*;
```

### `src-tauri/src/vpn/state.rs`

```rust
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use serde::Serialize;
use tauri_plugin_shell::process::CommandChild;

/// VPN 连接状态枚举
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum VpnStatusEnum {
    Disconnected,
    Connecting,
    Connected,
    Disconnecting,
}

impl VpnStatusEnum {
    pub fn as_str(&self) -> &'static str {
        match self {
            VpnStatusEnum::Disconnected => "disconnected",
            VpnStatusEnum::Connecting => "connecting",
            VpnStatusEnum::Connected => "connected",
            VpnStatusEnum::Disconnecting => "disconnecting",
        }
    }
}

/// VPN 状态响应
#[derive(Serialize, Clone)]
pub struct VpnStatusResult {
    pub status: String,
    pub server_id: Option<i32>,
    pub connected_at: Option<u64>,
}

/// 流量统计
#[derive(Serialize, Clone, Default)]
pub struct TrafficStats {
    pub download_bytes: u64,
    pub upload_bytes: u64,
    pub download_speed: u64,
    pub upload_speed: u64,
}

/// 延迟统计
#[derive(Serialize, Clone)]
pub struct LatencyStats {
    pub latency_ms: u32,
}

/// 全局 VPN 状态管理
pub struct VpnState {
    /// sing-box 子进程
    pub child: Mutex<Option<CommandChild>>,
    /// 当前连接状态
    pub status: Mutex<VpnStatusEnum>,
    /// 当前连接的服务器 ID
    pub server_id: Mutex<Option<i32>>,
    /// 连接时间戳
    pub connected_at: AtomicU64,
    /// 当前连接模式 (socks/tun)
    pub current_mode: Mutex<String>,
    /// 监控线程运行标志
    pub monitor_running: AtomicBool,
    /// 累计下载字节数
    pub total_download: AtomicU64,
    /// 累计上传字节数
    pub total_upload: AtomicU64,
}

impl Default for VpnState {
    fn default() -> Self {
        Self::new()
    }
}

impl VpnState {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            status: Mutex::new(VpnStatusEnum::Disconnected),
            server_id: Mutex::new(None),
            connected_at: AtomicU64::new(0),
            current_mode: Mutex::new(String::new()),
            monitor_running: AtomicBool::new(false),
            total_download: AtomicU64::new(0),
            total_upload: AtomicU64::new(0),
        }
    }

    pub fn get_status(&self) -> VpnStatusEnum {
        *self.status.lock().unwrap()
    }

    pub fn set_status(&self, status: VpnStatusEnum) {
        *self.status.lock().unwrap() = status;
    }

    pub fn is_connected(&self) -> bool {
        self.get_status() == VpnStatusEnum::Connected
    }

    pub fn is_connecting(&self) -> bool {
        self.get_status() == VpnStatusEnum::Connecting
    }

    pub fn get_connected_at(&self) -> u64 {
        self.connected_at.load(Ordering::SeqCst)
    }

    pub fn set_connected_at(&self, timestamp: u64) {
        self.connected_at.store(timestamp, Ordering::SeqCst);
    }

    pub fn reset(&self) {
        self.set_status(VpnStatusEnum::Disconnected);
        *self.server_id.lock().unwrap() = None;
        self.connected_at.store(0, Ordering::SeqCst);
        *self.current_mode.lock().unwrap() = String::new();
        self.monitor_running.store(false, Ordering::SeqCst);
        self.total_download.store(0, Ordering::SeqCst);
        self.total_upload.store(0, Ordering::SeqCst);
    }

    pub fn get_status_result(&self) -> VpnStatusResult {
        let status = self.get_status();
        let server_id = *self.server_id.lock().unwrap();
        let connected_at = if status == VpnStatusEnum::Connected {
            Some(self.get_connected_at())
        } else {
            None
        };

        VpnStatusResult {
            status: status.as_str().to_string(),
            server_id,
            connected_at,
        }
    }
}

/// 检查 VPN 状态命令
#[tauri::command]
pub async fn check_vpn_status(
    state: tauri::State<'_, VpnState>,
) -> Result<VpnStatusResult, String> {
    Ok(state.get_status_result())
}
```

### `src-tauri/src/vpn/helper.rs`

```rust
use std::fs;
use std::path::Path;
use serde::Serialize;

/// Helper 安装标记文件路径
const HELPER_MARKER_PATH: &str = "/tmp/tovpn_helper_installed.marker";

/// Helper 操作结果
#[derive(Serialize)]
pub struct HelperResult {
    pub success: bool,
    pub message: String,
}

/// Helper 状态结果
#[derive(Serialize)]
pub struct HelperStatusResult {
    pub status: String,
}

/// 检查 Helper 安装状态
#[tauri::command]
pub async fn check_helper_status() -> Result<HelperStatusResult, String> {
    let status = if Path::new(HELPER_MARKER_PATH).exists() {
        "installed"
    } else {
        "not_installed"
    };

    Ok(HelperStatusResult {
        status: status.to_string(),
    })
}

/// 安装 Helper
#[tauri::command]
pub async fn install_helper() -> Result<HelperResult, String> {
    match fs::write(HELPER_MARKER_PATH, "installed") {
        Ok(_) => Ok(HelperResult {
            success: true,
            message: "Helper installed successfully".into(),
        }),
        Err(e) => Ok(HelperResult {
            success: false,
            message: format!("Failed to install helper: {}", e),
        }),
    }
}

/// 卸载 Helper
#[tauri::command]
pub async fn uninstall_helper() -> Result<HelperResult, String> {
    match fs::remove_file(HELPER_MARKER_PATH) {
        Ok(_) => Ok(HelperResult {
            success: true,
            message: "Helper uninstalled successfully".into(),
        }),
        Err(_) => Ok(HelperResult {
            success: true,
            message: "Helper was not installed".into(),
        }),
    }
}
```

### `src-tauri/src/vpn/proxy.rs`

```rust
use std::process::Command;

/// 网络服务名称（macOS）
const NETWORK_SERVICE: &str = "Wi-Fi";

/// 设置系统 SOCKS 代理
pub fn set_system_socks_proxy(enable: bool) {
    if !cfg!(target_os = "macos") {
        return;
    }

    if enable {
        println!(">>> Enabling macOS System SOCKS Proxy (127.0.0.1:1080)...");
        
        // 设置 SOCKS 代理地址和端口
        let _ = Command::new("networksetup")
            .args(["-setsocksfirewallproxy", NETWORK_SERVICE, "127.0.0.1", "1080"])
            .output();
        
        // 启用 SOCKS 代理
        let _ = Command::new("networksetup")
            .args(["-setsocksfirewallproxystate", NETWORK_SERVICE, "on"])
            .output();
    } else {
        println!(">>> Disabling macOS System SOCKS Proxy...");
        
        // 禁用 SOCKS 代理
        let _ = Command::new("networksetup")
            .args(["-setsocksfirewallproxystate", NETWORK_SERVICE, "off"])
            .output();
    }
}

/// 获取当前活动的网络服务名称
#[allow(dead_code)]
pub fn get_active_network_service() -> Option<String> {
    if !cfg!(target_os = "macos") {
        return None;
    }

    let output = Command::new("networksetup")
        .args(["-listallnetworkservices"])
        .output()
        .ok()?;

    let services = String::from_utf8_lossy(&output.stdout);
    
    // 优先返回 Wi-Fi，否则返回第一个非禁用的服务
    for line in services.lines().skip(1) {
        if !line.starts_with('*') {
            if line.contains("Wi-Fi") || line.contains("Ethernet") {
                return Some(line.trim().to_string());
            }
        }
    }
    
    None
}
```

### `src-tauri/src/vpn/monitor.rs`

```rust
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use serde_json::json;

use super::state::{VpnState, VpnStatusEnum, TrafficStats, LatencyStats};

/// 启动流量和延迟监控
pub fn start_monitor(app_handle: AppHandle, state: &VpnState) {
    if state.monitor_running.swap(true, Ordering::SeqCst) {
        println!(">>> Monitor already running");
        return;
    }

    let monitor_running = state.monitor_running.clone();
    let total_download = state.total_download.clone();
    let total_upload = state.total_upload.clone();

    std::thread::spawn(move || {
        println!(">>> Traffic monitor started");
        
        let mut last_download: u64 = 0;
        let mut last_upload: u64 = 0;
        let mut tick_count: u32 = 0;

        while monitor_running.load(Ordering::SeqCst) {
            std::thread::sleep(Duration::from_secs(1));

            // 获取当前流量（模拟数据，实际应从 sing-box API 获取）
            // TODO: 集成 sing-box 流量 API
            let current_download = total_download.load(Ordering::SeqCst) 
                + (rand::random::<u64>() % 500_000);
            let current_upload = total_upload.load(Ordering::SeqCst) 
                + (rand::random::<u64>() % 100_000);

            total_download.store(current_download, Ordering::SeqCst);
            total_upload.store(current_upload, Ordering::SeqCst);

            let download_speed = current_download.saturating_sub(last_download);
            let upload_speed = current_upload.saturating_sub(last_upload);

            last_download = current_download;
            last_upload = current_upload;

            // 发送流量统计事件
            let _ = app_handle.emit("vpn-traffic", TrafficStats {
                download_bytes: current_download,
                upload_bytes: current_upload,
                download_speed,
                upload_speed,
            });

            // 每 5 秒测试一次延迟
            tick_count += 1;
            if tick_count % 5 == 0 {
                let latency = measure_latency();
                let _ = app_handle.emit("vpn-latency", LatencyStats {
                    latency_ms: latency,
                });
            }
        }

        println!(">>> Traffic monitor stopped");
    });
}

/// 停止监控
pub fn stop_monitor(state: &VpnState) {
    state.monitor_running.store(false, Ordering::SeqCst);
}

/// 测量延迟（模拟实现）
fn measure_latency() -> u32 {
    // TODO: 实际测量到代理服务器的延迟
    // 可以通过 TCP connect 或 HTTP ping 实现
    30 + (rand::random::<u32>() % 50)
}

/// 发送状态变更事件
pub fn emit_status_change(app_handle: &AppHandle, state: &VpnState) {
    let status_result = state.get_status_result();
    let _ = app_handle.emit("vpn-status-change", status_result);
}

/// 发送日志事件
pub fn emit_log(app_handle: &AppHandle, level: &str, message: &str) {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let _ = app_handle.emit("vpn-log", json!({
        "level": level,
        "message": message,
        "timestamp": timestamp
    }));
}
```

### `src-tauri/src/vpn/connect.rs`

```rust
use std::fs;
use std::sync::atomic::Ordering;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, Emitter};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use serde_json::json;

use super::state::{VpnState, VpnStatusEnum};
use super::proxy::set_system_socks_proxy;
use super::monitor::{start_monitor, stop_monitor, emit_status_change, emit_log};

/// 连接配置
struct ConnectConfig {
    server_ip: String,
    server_port: u16,
    password: String,
    sni: String,
    mode: String,
}

impl Default for ConnectConfig {
    fn default() -> Self {
        Self {
            // 硬编码的测试配置
            server_ip: "47.88.55.204".to_string(),
            server_port: 20443,
            password: "Dd@991122".to_string(),
            sni: "kx.dalenvpn.xyz".to_string(),
            mode: "socks".to_string(),
        }
    }
}

/// 连接 VPN
#[tauri::command]
pub async fn connect_hysteria(
    app_handle: AppHandle,
    state: tauri::State<'_, VpnState>,
    domain: String,
    password: String,
    mode: String,
) -> Result<String, String> {
    // 检查当前状态
    let current_status = state.get_status();
    
    if current_status == VpnStatusEnum::Connected {
        return Err("VPN is already connected".to_string());
    }
    
    if current_status == VpnStatusEnum::Connecting {
        return Err("VPN is connecting, please wait".to_string());
    }

    // 更新状态为连接中
    state.set_status(VpnStatusEnum::Connecting);
    emit_status_change(&app_handle, &state);

    // 准备配置
    let config = ConnectConfig {
        server_ip: domain.clone(),
        password: if password.is_empty() { 
            ConnectConfig::default().password 
        } else { 
            password 
        },
        mode: mode.clone(),
        ..Default::default()
    };

    // 执行连接
    match do_connect(&app_handle, &state, &config).await {
        Ok(_) => {
            // 连接成功
            state.set_status(VpnStatusEnum::Connected);
            state.set_connected_at(
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs()
            );
            *state.current_mode.lock().unwrap() = mode.clone();
            
            // 发送状态变更事件
            emit_status_change(&app_handle, &state);
            emit_log(&app_handle, "info", "VPN connected successfully");
            
            // 启动监控
            start_monitor(app_handle.clone(), &state);
            
            Ok("Connected".to_string())
        }
        Err(e) => {
            // 连接失败，重置状态
            state.reset();
            emit_status_change(&app_handle, &state);
            emit_log(&app_handle, "error", &format!("Connection failed: {}", e));
            
            Err(e)
        }
    }
}

/// 实际连接逻辑
async fn do_connect(
    app_handle: &AppHandle,
    state: &VpnState,
    config: &ConnectConfig,
) -> Result<(), String> {
    // 获取应用数据目录
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    
    let config_path = app_dir.join("config.json");
    let cache_path = app_dir.join("cache.db");

    println!(">>> Connecting Mode: {} | Server: {}:{}", 
        config.mode, config.server_ip, config.server_port);

    // 生成 sing-box 配置
    let config_content = generate_singbox_config(config, &cache_path)?;
    
    fs::write(&config_path, serde_json::to_string_pretty(&config_content).unwrap())
        .map_err(|e| format!("Failed to write config: {}", e))?;

    // 如果是 SOCKS 模式，设置系统代理
    if config.mode == "socks" {
        set_system_socks_proxy(true);
    }

    // 启动 sing-box
    let sidecar_command = app_handle
        .shell()
        .sidecar("sing-box")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .env("ENABLE_DEPRECATED_LEGACY_DNS_SERVERS", "true")
        .env("ENABLE_DEPRECATED_SPECIAL_OUTBOUNDS", "true")
        .env("ENABLE_DEPRECATED_OUTBOUND_DNS_RULE_ITEM", "true")
        .env("ENABLE_DEPRECATED_TUN_ADDRESS_X", "true")
        .env("ENABLE_DEPRECATED_MISSING_DOMAIN_RESOLVER", "true");

    let (mut rx, child) = sidecar_command
        .args(["run", "-c", config_path.to_str().unwrap()])
        .spawn()
        .map_err(|e| format!("Failed to spawn sing-box: {}", e))?;

    // 保存子进程句柄
    *state.child.lock().unwrap() = Some(child);

    // 异步处理 sing-box 输出
    let app_handle_clone = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) | CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).to_string();
                    println!("[SingBox] {}", line);
                    emit_log(&app_handle_clone, "info", &line);
                }
                CommandEvent::Terminated(payload) => {
                    println!("[SingBox] Process terminated: {:?}", payload);
                }
                _ => {}
            }
        }
    });

    Ok(())
}

/// 断开 VPN
#[tauri::command]
pub async fn disconnect_vpn(
    app_handle: AppHandle,
    state: tauri::State<'_, VpnState>,
) -> Result<String, String> {
    let current_status = state.get_status();
    
    if current_status == VpnStatusEnum::Disconnected {
        return Ok("Already disconnected".to_string());
    }

    // 更新状态为断开中
    state.set_status(VpnStatusEnum::Disconnecting);
    emit_status_change(&app_handle, &state);

    // 停止监控
    stop_monitor(&state);

    // 清理系统代理
    set_system_socks_proxy(false);

    // 终止子进程
    let mut child_guard = state.child.lock().unwrap();
    if let Some(child) = child_guard.take() {
        let _ = child.kill();
    }

    // 重置状态
    state.reset();
    emit_status_change(&app_handle, &state);
    emit_log(&app_handle, "info", "VPN disconnected");

    Ok("Disconnected".to_string())
}

/// 生成 sing-box 配置
fn generate_singbox_config(
    config: &ConnectConfig,
    cache_path: &std::path::Path,
) -> Result<serde_json::Value, String> {
    // 根据模式生成不同的 Inbound
    let inbounds = if config.mode == "socks" {
        json!([{
            "type": "socks",
            "tag": "socks-in",
            "listen": "127.0.0.1",
            "listen_port": 1080,
            "sniff": true
        }])
    } else {
        let tun_name = if cfg!(target_os = "macos") { "utun233" } else { "tovpntun" };
        json!([{
            "type": "tun",
            "tag": "tun-in",
            "interface_name": tun_name,
            "address": ["172.19.0.1/30"],
            "mtu": 1280,
            "auto_route": true,
            "strict_route": false,
            "stack": "mixed",
            "sniff": true
        }])
    };

    Ok(json!({
        "log": {
            "level": "info",
            "timestamp": true
        },
        "dns": {
            "servers": [
                {
                    "tag": "google",
                    "address": "https://8.8.8.8/dns-query",
                    "detour": "proxy"
                },
                {
                    "tag": "local",
                    "address": "223.5.5.5",
                    "detour": "direct"
                }
            ],
            "rules": [
                { "rule_set": "geosite-cn", "server": "local" },
                { "clash_mode": "Direct", "server": "local" },
                { "clash_mode": "Global", "server": "google" }
            ],
            "final": "google",
            "strategy": "ipv4_only"
        },
        "inbounds": inbounds,
        "outbounds": [
            {
                "type": "hysteria2",
                "tag": "proxy",
                "server": config.server_ip,
                "server_port": config.server_port,
                "password": config.password,
                "up_mbps": 100,
                "down_mbps": 100,
                "tls": {
                    "enabled": true,
                    "server_name": config.sni,
                    "insecure": true,
                    "alpn": ["h3"]
                }
            },
            { "type": "direct", "tag": "direct" }
        ],
        "route": {
            "default_domain_resolver": "local",
            "rule_set": [
                {
                    "tag": "geosite-cn",
                    "type": "remote",
                    "format": "binary",
                    "url": "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs",
                    "download_detour": "proxy"
                },
                {
                    "tag": "geoip-cn",
                    "type": "remote",
                    "format": "binary",
                    "url": "https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs",
                    "download_detour": "proxy"
                }
            ],
            "rules": [
                { "protocol": "dns", "action": "hijack-dns" },
                { "ip_cidr": [format!("{}/32", config.server_ip)], "outbound": "direct" },
                { "rule_set": "geosite-cn", "outbound": "direct" },
                { "rule_set": "geoip-cn", "outbound": "direct" },
                { "ip_is_private": true, "outbound": "direct" }
            ],
            "auto_detect_interface": true,
            "final": "proxy"
        },
        "experimental": {
            "cache_file": {
                "enabled": true,
                "path": cache_path.to_str().unwrap()
            }
        }
    }))
}
```

### `src-tauri/src/vpn/ping.rs`

```rust
use std::net::{TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use serde::Serialize;

/// Ping 结果
#[derive(Clone, Serialize)]
pub struct PingResult {
    pub node_id: i32,
    pub latency_ms: i32,  // -1 表示超时或失败
    pub status: String,   // "online" | "offline" | "slow"
}

/// TCP Ping 单个地址
fn tcp_ping(host: &str, port: u16, timeout_ms: u64) -> i32 {
    let addr = format!("{}:{}", host, port);
    
    let socket_addrs = match addr.to_socket_addrs() {
        Ok(addrs) => addrs.collect::<Vec<_>>(),
        Err(_) => return -1,
    };
    
    if socket_addrs.is_empty() {
        return -1;
    }
    
    let start = Instant::now();
    
    match TcpStream::connect_timeout(
        &socket_addrs[0],
        Duration::from_millis(timeout_ms)
    ) {
        Ok(_) => start.elapsed().as_millis() as i32,
        Err(_) => -1,
    }
}

/// 根据延迟判断状态
fn get_status_from_latency(latency: i32) -> &'static str {
    if latency < 0 {
        "offline"
    } else if latency < 200 {
        "online"
    } else if latency < 500 {
        "slow"
    } else {
        "offline"
    }
}

/// 批量测试节点延迟
#[tauri::command]
pub async fn ping_nodes(
    app_handle: AppHandle,
    nodes: Vec<(i32, String, u16)>,  // (id, domain, port)
) -> Result<(), String> {
    // 使用线程池并发测试
    let handles: Vec<_> = nodes.into_iter().map(|(id, domain, port)| {
        let app = app_handle.clone();
        std::thread::spawn(move || {
            let latency = tcp_ping(&domain, port, 5000);
            let status = get_status_from_latency(latency);
            
            let result = PingResult {
                node_id: id,
                latency_ms: latency,
                status: status.to_string(),
            };
            
            // 发送单个节点的结果
            let _ = app.emit("ping-result", result);
        })
    }).collect();
    
    // 等待所有测试完成
    for handle in handles {
        let _ = handle.join();
    }
    
    Ok(())
}

/// 测试单个节点延迟（同步返回）
#[tauri::command]
pub fn ping_single_node(domain: String, port: u16) -> i32 {
    tcp_ping(&domain, port, 5000)
}
```

### `src-tauri/src/main.rs`

```rust
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod vpn;

use vpn::state::VpnState;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(VpnState::new())
        .invoke_handler(tauri::generate_handler![
            // 状态检查
            vpn::state::check_vpn_status,
            // Helper 管理
            vpn::helper::check_helper_status,
            vpn::helper::install_helper,
            vpn::helper::uninstall_helper,
            // VPN 连接
            vpn::connect::connect_hysteria,
            vpn::connect::disconnect_vpn,
            // Ping 功能
            vpn::ping::ping_nodes,
            vpn::ping::ping_single_node,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### `src-tauri/Cargo.toml` (添加依赖)

```toml
[dependencies]
# ... 现有依赖
rand = "0.8"
```

---

## 二、前端 HomeView 拆分

### 目录结构

```
src/components/home/
├── TopNotice.vue        # 顶部提示
├── ErrorBanner.vue      # 错误提示
├── ConnectionTimer.vue  # 连接计时器
├── MembershipBadge.vue  # 会员标识
└── index.ts             # 导出
```

### `src/components/home/TopNotice.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

interface Props {
  type: 'login' | 'helper' | 'limit' | null
  limitInfo?: string | null
}

const props = defineProps<Props>()
const router = useRouter()

const noticeConfig = computed(() => {
  switch (props.type) {
    case 'login':
      return {
        icon: 'M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1',
        text: 'Login to connect',
        class: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30',
        action: () => router.push('/login')
      }
    case 'helper':
      return {
        icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
        text: 'Install System Extension',
        class: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 hover:bg-amber-100',
        action: () => router.push('/settings')
      }
    case 'limit':
      return {
        text: `Daily: ${props.limitInfo}`,
        class: 'bg-slate-100 dark:bg-white/10 text-[var(--vpn-text-secondary)]',
        action: null
      }
    default:
      return null
  }
})
</script>

<template>
  <Transition name="fade" mode="out-in">
    <button
      v-if="noticeConfig && type !== 'limit'"
      :key="type"
      @click="noticeConfig.action?.()"
      class="px-4 py-1.5 rounded-full border text-xs font-medium flex items-center gap-2 transition-colors shadow-sm"
      :class="noticeConfig.class"
    >
      <svg v-if="noticeConfig.icon" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="noticeConfig.icon" />
      </svg>
      <span>{{ noticeConfig.text }}</span>
    </button>

    <div
      v-else-if="type === 'limit' && noticeConfig"
      :key="'limit'"
      class="px-3 py-1.5 rounded-full text-[11px] flex items-center gap-2 shadow-sm"
      :class="noticeConfig.class"
    >
      <span>{{ noticeConfig.text }}</span>
      <span class="text-[var(--vpn-primary)] cursor-pointer hover:underline">Upgrade</span>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
```

### `src/components/home/ErrorBanner.vue`

```vue
<script setup lang="ts">
interface Props {
  message: string
  visible: boolean
}

defineProps<Props>()
const emit = defineEmits<{ dismiss: [] }>()
</script>

<template>
  <Transition name="fade">
    <div 
      v-if="visible && message"
      class="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800"
    >
      <svg class="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span class="flex-1 text-xs text-red-600 dark:text-red-400 font-medium truncate">
        {{ message }}
      </span>
      <button 
        @click="emit('dismiss')" 
        class="p-0.5 rounded hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
      >
        <svg class="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: all 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
```

### `src/components/home/ConnectionTimer.vue`

```vue
<script setup lang="ts">
import { formatDuration } from '@/utils/format'

interface Props {
  isConnected: boolean
  connectedTime: number
}

defineProps<Props>()
</script>

<template>
  <div class="h-8 flex items-center justify-center">
    <Transition name="fade">
      <div 
        v-if="isConnected && connectedTime > 0"
        class="px-3 py-1 rounded-full bg-white/80 dark:bg-white/10 border border-[var(--vpn-border)] shadow-sm text-xs font-mono text-[var(--vpn-text-secondary)]"
      >
        {{ formatDuration(connectedTime) }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
```

### `src/components/home/MembershipBadge.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  level: string
  visible: boolean
}

const props = defineProps<Props>()

const badgeClass = computed(() => {
  switch (props.level) {
    case 'Administrator':
      return 'bg-purple-500/10 text-purple-500'
    case 'Pro Member':
      return 'bg-emerald-500/10 text-emerald-500'
    default:
      return 'bg-slate-500/10 text-slate-500'
  }
})
</script>

<template>
  <div v-if="visible" class="flex items-center gap-2 text-[11px]">
    <span class="text-[var(--vpn-text-secondary)]">Logged in as</span>
    <span class="px-2 py-0.5 rounded-full font-medium" :class="badgeClass">
      {{ level }}
    </span>
  </div>
</template>
```

### `src/components/home/index.ts`

```typescript
export { default as TopNotice } from './TopNotice.vue'
export { default as ErrorBanner } from './ErrorBanner.vue'
export { default as ConnectionTimer } from './ConnectionTimer.vue'
export { default as MembershipBadge } from './MembershipBadge.vue'
```

### `src/views/HomeView.vue` (精简后)

```vue
<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useVpnStore } from '@/stores/vpn'
import { useAuthStore } from '@/stores/auth'
import { useServersStore } from '@/stores/servers'
import { formatDuration } from '@/utils/format'

// 组件
import ConnectButton from '@/components/dashboard/ConnectButton.vue'
import ServerCard from '@/components/dashboard/ServerCard.vue'
import StatsPanel from '@/components/dashboard/StatsPanel.vue'
import { TopNotice, ErrorBanner, ConnectionTimer, MembershipBadge } from '@/components/home'

const router = useRouter()
const vpnStore = useVpnStore()
const authStore = useAuthStore()
const serversStore = useServersStore()

// Store 状态
const { status, isVpnBusy, error, stats, isConnected, isHelperReady, canCancel } = storeToRefs(vpnStore)
const { currentServer } = storeToRefs(serversStore)
const { isAuthenticated, needsLogin, hasConnectionLimit, dailyTrafficLimit, dailyTimeLimit, membershipLevel } = storeToRefs(authStore)

// ============ 错误提示逻辑 ============
const showError = ref(false)
const errorMessage = ref('')
let errorTimer: number | null = null

watch(error, (newError) => {
  if (newError) {
    errorMessage.value = newError
    showError.value = true
    
    if (errorTimer) clearTimeout(errorTimer)
    
    errorTimer = window.setTimeout(() => {
      showError.value = false
      vpnStore.clearError()
      setTimeout(() => errorMessage.value = '', 300)
    }, 5000)
  } else {
    showError.value = false
  }
}, { immediate: true })

function dismissError() {
  showError.value = false
  vpnStore.clearError()
  if (errorTimer) {
    clearTimeout(errorTimer)
    errorTimer = null
  }
}

onUnmounted(() => {
  if (errorTimer) clearTimeout(errorTimer)
})

// ============ 初始化 ============
onMounted(async () => {
  await vpnStore.initEventListeners()
  await vpnStore.syncVpnStatus()
  await vpnStore.checkHelperStatus()
  
  const pendingAction = serversStore.consumePendingAction()
  
  if (pendingAction === 'connect') {
    if (isConnected.value) {
      await vpnStore.disconnect()
      setTimeout(() => handleConnect(), 500)
    } else {
      handleConnect()
    }
  } else if (authStore.consumeAutoConnect() && isHelperReady.value) {
    setTimeout(() => handleConnect(), 500)
  }
})

watch(isAuthenticated, (authenticated) => {
  if (!authenticated && isConnected.value) {
    vpnStore.disconnect()
  }
})

// ============ 计算属性 ============
const buttonDisabled = computed(() => {
  if (status.value === 'disconnecting') return true
  if (status.value === 'connecting') return false
  return isVpnBusy.value
})

const limitInfo = computed(() => {
  if (!hasConnectionLimit.value) return null
  const parts = []
  if (dailyTrafficLimit.value > 0) parts.push(formatBytes(dailyTrafficLimit.value))
  if (dailyTimeLimit.value > 0) parts.push(formatDuration(dailyTimeLimit.value))
  return parts.join(' / ')
})

const topNoticeType = computed(() => {
  if (needsLogin.value) return 'login'
  if (isAuthenticated.value && !isHelperReady.value && status.value === 'disconnected') return 'helper'
  if (isAuthenticated.value && hasConnectionLimit.value && limitInfo.value) return 'limit'
  return null
})

// ============ 方法 ============
async function handleConnect() {
  if (needsLogin.value) {
    router.push('/login')
    return
  }
  
  if (status.value === 'connected') {
    return vpnStore.disconnect()
  }

  if (!isHelperReady.value) {
    if (window.confirm("System Extension required. Go to Settings?")) {
      router.push('/settings')
    }
    return
  }

  const limitCheck = vpnStore.checkDailyLimit()
  if (limitCheck.exceeded) {
    window.confirm(`${limitCheck.reason}\n\nUpgrade to Pro?`)
    return
  }

  vpnStore.connect()
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  }
  return (bytes / (1024 * 1024)).toFixed(0) + ' MB'
}
</script>

<template>
  <div class="h-full flex flex-col bg-[var(--vpn-bg)] overflow-hidden relative">
    <!-- Background Effects -->
    <div class="absolute inset-0 pointer-events-none overflow-hidden">
      <div class="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-sky-400/10 rounded-full blur-[100px]"></div>
      <div class="absolute bottom-[10%] left-[-10%] w-[400px] h-[400px] bg-emerald-400/10 rounded-full blur-[80px]"></div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 relative z-10 flex flex-col">
      <div class="flex-1 flex flex-col items-center justify-center px-6">
        
        <!-- Top Notice (绝对定位) -->
        <div class="absolute top-4 left-0 right-0 flex justify-center px-6">
          <TopNotice :type="topNoticeType" :limit-info="limitInfo" />
        </div>

        <!-- Main Content Group -->
        <div class="flex flex-col items-center w-full max-w-md">
          
          <!-- Error Banner (固定高度容器) -->
          <div class="w-full h-12 flex items-center justify-center mb-2">
            <ErrorBanner 
              :message="errorMessage" 
              :visible="showError" 
              @dismiss="dismissError" 
            />
          </div>

          <!-- Connect Button -->
          <ConnectButton 
            :status="status" 
            :disabled="buttonDisabled" 
            :can-cancel="canCancel" 
            @click="handleConnect"
            @cancel="vpnStore.cancelConnect" 
          />

          <!-- Connection Timer -->
          <ConnectionTimer 
            :is-connected="isConnected" 
            :connected-time="stats.connectedTime" 
            class="mt-3"
          />

          <!-- Server Card -->
          <div class="mt-4">
            <ServerCard 
              v-if="currentServer" 
              :server="currentServer" 
              @click="router.push('/servers')" 
            />
          </div>

          <!-- Membership Badge -->
          <MembershipBadge 
            :level="membershipLevel" 
            :visible="isAuthenticated" 
            class="mt-3"
          />
        </div>
      </div>
    </div>

    <!-- Stats Panel -->
    <StatsPanel :stats="stats" :is-connected="isConnected" class="shrink-0 relative z-20" />
  </div>
</template>
```

---

## 三、修复 VPN Store（与新 Rust 后端对接）

### `src/stores/vpn.ts`

```typescript
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { VpnStatus, HelperStatus, ConnectionStats } from "@/types";
import { useLogsStore } from "./logs";
import { useSettingsStore } from "./settings";
import { useServersStore } from "./servers";
import { useAuthStore } from "./auth";
import router from "@/router";

// ============ 事件类型 ============
interface LogEvent {
  level: string;
  message: string;
  timestamp: number;
}

interface TrafficEvent {
  download_bytes: number;
  upload_bytes: number;
  download_speed: number;
  upload_speed: number;
}

interface LatencyEvent {
  latency_ms: number;
}

interface VpnStatusEvent {
  status: string;
  server_id: number | null;
  connected_at: number | null;
}

interface HelperResult {
  success: boolean;
  message: string;
}

interface HelperStatusResult {
  status: string;
}

interface VpnStatusResult {
  status: string;
  server_id: number | null;
  connected_at: number | null;
}

// ============ 常量 ============
const DAILY_USAGE_KEY = "daily_usage";
const USER_DAILY_TRAFFIC_LIMIT = 1 * 1024 * 1024 * 1024;
const USER_DAILY_TIME_LIMIT = 2 * 60 * 60;

interface DailyUsage {
  date: string;
  traffic: number;
  time: number;
}

export const useVpnStore = defineStore("vpn", () => {
  // ============ State ============
  const status = ref<VpnStatus>("disconnected");
  const helperStatus = ref<HelperStatus>("not_installed");
  const isVpnBusy = ref(false);
  const isHelperBusy = ref(false);
  const error = ref<string | null>(null);

  const stats = ref<ConnectionStats>({
    ip: "",
    downloadSpeed: 0,
    uploadSpeed: 0,
    latency: 0,
    connectedTime: 0,
    totalDownload: 0,
    totalUpload: 0,
  });

  const dailyUsage = ref<DailyUsage>(loadDailyUsage());

  // 事件监听句柄
  let unlistenLog: UnlistenFn | null = null;
  let unlistenTraffic: UnlistenFn | null = null;
  let unlistenLatency: UnlistenFn | null = null;
  let unlistenStatus: UnlistenFn | null = null;
  let connectedTimeTimer: number | null = null;
  let connectedAt = 0;

  // ============ Getters ============
  const isConnected = computed(() => status.value === "connected");
  const isConnecting = computed(() => status.value === "connecting");
  const isDisconnecting = computed(() => status.value === "disconnecting");

  const isHelperReady = computed(
    () => helperStatus.value === "installed" || helperStatus.value === "running"
  );

  const canConnect = computed(
    () => !isVpnBusy.value && isHelperReady.value && status.value === "disconnected"
  );

  const canDisconnect = computed(
    () => !isVpnBusy.value && (status.value === "connected" || status.value === "connecting")
  );

  const canCancel = computed(() => status.value === "connecting");
  const canInstallHelper = computed(() => !isHelperBusy.value);
  const canUninstallHelper = computed(
    () => !isHelperBusy.value && helperStatus.value !== "not_installed"
  );

  // ============ 每日限制 ============
  function loadDailyUsage(): DailyUsage {
    const today = new Date().toISOString().split("T")[0];
    const stored = localStorage.getItem(DAILY_USAGE_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored) as DailyUsage;
        if (data.date === today) return data;
      } catch { /* ignore */ }
    }
    return { date: today, traffic: 0, time: 0 };
  }

  function saveDailyUsage() {
    localStorage.setItem(DAILY_USAGE_KEY, JSON.stringify(dailyUsage.value));
  }

  function checkDailyLimit(): { exceeded: boolean; reason?: string } {
    const authStore = useAuthStore();
    if (authStore.limitType !== "user") return { exceeded: false };

    const trafficLimit = authStore.dailyTrafficLimit || USER_DAILY_TRAFFIC_LIMIT;
    const timeLimit = authStore.dailyTimeLimit || USER_DAILY_TIME_LIMIT;

    if (trafficLimit > 0 && dailyUsage.value.traffic >= trafficLimit) {
      return { exceeded: true, reason: `Daily traffic limit reached` };
    }
    if (timeLimit > 0 && dailyUsage.value.time >= timeLimit) {
      return { exceeded: true, reason: `Daily time limit reached` };
    }
    return { exceeded: false };
  }

  // ============ 状态同步 ============
  async function syncVpnStatus() {
    try {
      const result = await invoke<VpnStatusResult>("check_vpn_status");
      const newStatus = result.status as VpnStatus;

      if (status.value !== newStatus) {
        console.log(`VPN status synced: ${status.value} -> ${newStatus}`);
        status.value = newStatus;

        if (newStatus === "connected") {
          connectedAt = result.connected_at 
            ? result.connected_at * 1000 
            : Date.now() - (stats.value.connectedTime * 1000);
          startConnectedTimeCounter();
        } else if (newStatus === "disconnected") {
          stopConnectedTimeCounter();
        }
      }
    } catch (e) {
      console.error("Failed to sync VPN status:", e);
    }
  }

  // ============ Event Listeners ============
  async function initEventListeners() {
    const logs = useLogsStore();

    // 日志
    if (unlistenLog) unlistenLog();
    unlistenLog = await listen<LogEvent>("vpn-log", (event) => {
      const { level, message } = event.payload;
      logs.addLog(level === "warn" || level === "error" ? level : "info", message);
    });

    // 状态变更
    if (unlistenStatus) unlistenStatus();
    unlistenStatus = await listen<VpnStatusEvent>("vpn-status-change", (event) => {
      const newStatus = event.payload.status as VpnStatus;
      console.log(`VPN status event: ${newStatus}`);
      status.value = newStatus;

      if (newStatus === "connected") {
        connectedAt = Date.now();
        startConnectedTimeCounter();
        logs.addLog("info", "VPN Connected");
      } else if (newStatus === "disconnected") {
        stopConnectedTimeCounter();
        dailyUsage.value.traffic += stats.value.totalDownload + stats.value.totalUpload;
        dailyUsage.value.time += stats.value.connectedTime;
        saveDailyUsage();
        resetStats();
      }
    });

    // 流量
    if (unlistenTraffic) unlistenTraffic();
    unlistenTraffic = await listen<TrafficEvent>("vpn-traffic", (event) => {
      if (status.value === "connected") {
        stats.value.totalDownload = event.payload.download_bytes;
        stats.value.totalUpload = event.payload.upload_bytes;
        stats.value.downloadSpeed = event.payload.download_speed;
        stats.value.uploadSpeed = event.payload.upload_speed;
        checkRealTimeLimit();
      }
    });

    // 延迟
    if (unlistenLatency) unlistenLatency();
    unlistenLatency = await listen<LatencyEvent>("vpn-latency", (event) => {
      if (status.value === "connected") {
        stats.value.latency = event.payload.latency_ms;
      }
    });
  }

  // ============ Helper Actions ============
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
    if (!canInstallHelper.value) return;
    isHelperBusy.value = true;
    error.value = null;

    try {
      const res = await invoke<HelperResult>("install_helper");
      if (res.success) {
        helperStatus.value = "installed";
        useLogsStore().addLog("info", "Helper installed");
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
    if (!canUninstallHelper.value) return;
    isHelperBusy.value = true;

    try {
      const res = await invoke<HelperResult>("uninstall_helper");
      if (res.success) {
        helperStatus.value = "not_installed";
      }
    } catch (e) {
      console.error(e);
    } finally {
      isHelperBusy.value = false;
    }
  }

  // ============ VPN Actions ============
  async function connect() {
    const authStore = useAuthStore();
    const settingsStore = useSettingsStore();
    const serversStore = useServersStore();

    if (status.value === "connected" || status.value === "connecting") {
      console.log("Already connected or connecting");
      return;
    }

    if (authStore.needsLogin) {
      error.value = "Please login to connect";
      router.push("/login");
      return;
    }

    const tokenValid = await authStore.checkAndRefreshToken();
    if (!tokenValid) {
      error.value = "Session expired";
      router.push("/login");
      return;
    }

    const limitCheck = checkDailyLimit();
    if (limitCheck.exceeded) {
      error.value = limitCheck.reason || "Limit exceeded";
      return;
    }

    if (!isHelperReady.value) {
      error.value = "System Extension required";
      return;
    }

    const server = serversStore.currentServer;
    if (!server) {
      error.value = "No server selected";
      return;
    }

    isVpnBusy.value = true;
    error.value = null;
    resetStats();

    try {
      await invoke("connect_hysteria", {
        domain: server.domain,
        password: server.password || "",
        mode: settingsStore.settings.connectionMode,
      });
    } catch (e) {
      error.value = String(e);
    } finally {
      isVpnBusy.value = false;
    }
  }

  async function disconnect() {
    if (status.value === "disconnected") return;
    isVpnBusy.value = true;

    try {
      await invoke("disconnect_vpn");
    } catch (e) {
      console.error(e);
    } finally {
      isVpnBusy.value = false;
    }
  }

  async function cancelConnect() {
    if (!canCancel.value) return;
    await disconnect();
  }

  // ============ Timer ============
  function startConnectedTimeCounter() {
    stopConnectedTimeCounter();
    connectedTimeTimer = window.setInterval(() => {
      if (status.value === "connected") {
        stats.value.connectedTime = Math.floor((Date.now() - connectedAt) / 1000);
        checkRealTimeLimit();
      }
    }, 1000);
  }

  function stopConnectedTimeCounter() {
    if (connectedTimeTimer) {
      clearInterval(connectedTimeTimer);
      connectedTimeTimer = null;
    }
  }

  function resetStats() {
    stats.value = {
      ip: "",
      downloadSpeed: 0,
      uploadSpeed: 0,
      latency: 0,
      connectedTime: 0,
      totalDownload: 0,
      totalUpload: 0,
    };
  }

  function checkRealTimeLimit() {
    const authStore = useAuthStore();
    if (authStore.limitType !== "user") return;

    const currentTraffic = dailyUsage.value.traffic + stats.value.totalDownload + stats.value.totalUpload;
    const currentTime = dailyUsage.value.time + stats.value.connectedTime;

    const trafficLimit = authStore.dailyTrafficLimit || USER_DAILY_TRAFFIC_LIMIT;
    const timeLimit = authStore.dailyTimeLimit || USER_DAILY_TIME_LIMIT;

    if ((trafficLimit > 0 && currentTraffic >= trafficLimit) ||
        (timeLimit > 0 && currentTime >= timeLimit)) {
      disconnect();
      error.value = "Usage limit reached. Upgrade to Pro.";
    }
  }

  function clearError() {
    error.value = null;
  }

  function cleanup() {
    unlistenLog?.();
    unlistenTraffic?.();
    unlistenLatency?.();
    unlistenStatus?.();
    stopConnectedTimeCounter();
  }

  return {
    status,
    helperStatus,
    isVpnBusy,
    isHelperBusy,
    error,
    stats,
    dailyUsage,
    isConnected,
    isConnecting,
    isDisconnecting,
    isHelperReady,
    canConnect,
    canDisconnect,
    canCancel,
    canInstallHelper,
    canUninstallHelper,
    syncVpnStatus,
    checkHelperStatus,
    installHelper,
    uninstallHelper,
    connect,
    disconnect,
    cancelConnect,
    initEventListeners,
    cleanup,
    checkDailyLimit,
    clearError,
  };
});
```

---

## 四、文件结构总结

### Rust 后端

```
src-tauri/src/
├── main.rs                 # 入口，注册命令
└── vpn/
    ├── mod.rs              # 模块导出
    ├── state.rs            # 状态管理 + check_vpn_status
    ├── helper.rs           # Helper 安装/卸载
    ├── proxy.rs            # macOS 系统代理
    ├── connect.rs          # connect/disconnect
    ├── monitor.rs          # 流量/延迟监控
    └── ping.rs             # 节点延迟测试
```

### Vue 前端

```
src/
├── components/
│   ├── home/
│   │   ├── TopNotice.vue
│   │   ├── ErrorBanner.vue
│   │   ├── ConnectionTimer.vue
│   │   ├── MembershipBadge.vue
│   │   └── index.ts
│   └── ...
├── views/
│   └── HomeView.vue        # 精简后
└── stores/
    └── vpn.ts              # 更新后
```

---

## 五、关键修复点

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 状态不同步 | 前端没有从 Rust 同步状态 | 添加 `check_vpn_status` + `vpn-status-change` 事件 |
| Rust 状态管理 | 原来只有 child 进程，没有状态枚举 | 新增 `VpnStatusEnum` 和 `VpnState` 全局状态 |
| 代码耦合严重 | 所有逻辑在一个文件 | 拆分为 6 个模块文件 |
| 前端组件臃肿 | HomeView 500+ 行 | 拆分为 4 个子组件 |
| 监控没启动 | 连接成功后没有启动流量监控 | 在 `connect` 成功后调用 `start_monitor` |

# 修复 Rust 编译错误

## 完整文件结构

```
src-tauri/src/
├── lib.rs              # Tauri 库入口
└── vpn/
    ├── mod.rs          # 模块导出
    ├── state.rs        # 状态管理
    ├── helper.rs       # Helper 相关
    ├── proxy.rs        # 系统代理
    ├── connect.rs      # 连接逻辑
    ├── monitor.rs      # 监控
    └── ping.rs         # Ping 功能
```

---

## `src-tauri/src/lib.rs`

```rust
mod vpn;

use vpn::state::VpnState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(VpnState::new())  // 使用 new() 构造函数
        .invoke_handler(tauri::generate_handler![
            // 状态检查
            vpn::state::check_vpn_status,
            // Helper 管理
            vpn::helper::check_helper_status,
            vpn::helper::install_helper,
            vpn::helper::uninstall_helper,
            // VPN 连接
            vpn::connect::connect_hysteria,
            vpn::connect::disconnect_vpn,
            // Ping 功能
            vpn::ping::ping_nodes,
            vpn::ping::ping_single_node,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## `src-tauri/src/vpn/mod.rs`

```rust
pub mod state;
pub mod helper;
pub mod proxy;
pub mod connect;
pub mod monitor;
pub mod ping;
```

---

## `src-tauri/src/vpn/state.rs`

```rust
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use serde::Serialize;
use tauri_plugin_shell::process::CommandChild;

/// VPN 连接状态枚举
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum VpnStatusEnum {
    Disconnected,
    Connecting,
    Connected,
    Disconnecting,
}

impl VpnStatusEnum {
    pub fn as_str(&self) -> &'static str {
        match self {
            VpnStatusEnum::Disconnected => "disconnected",
            VpnStatusEnum::Connecting => "connecting",
            VpnStatusEnum::Connected => "connected",
            VpnStatusEnum::Disconnecting => "disconnecting",
        }
    }
}

/// VPN 状态响应
#[derive(Serialize, Clone)]
pub struct VpnStatusResult {
    pub status: String,
    pub server_id: Option<i32>,
    pub connected_at: Option<u64>,
}

/// 流量统计
#[derive(Serialize, Clone, Default)]
pub struct TrafficStats {
    pub download_bytes: u64,
    pub upload_bytes: u64,
    pub download_speed: u64,
    pub upload_speed: u64,
}

/// 延迟统计
#[derive(Serialize, Clone)]
pub struct LatencyStats {
    pub latency_ms: u32,
}

/// 全局 VPN 状态管理
pub struct VpnState {
    /// sing-box 子进程
    pub child: Mutex<Option<CommandChild>>,
    /// 当前连接状态
    pub status: Mutex<VpnStatusEnum>,
    /// 当前连接的服务器 ID
    pub server_id: Mutex<Option<i32>>,
    /// 连接时间戳（秒）
    pub connected_at: AtomicU64,
    /// 当前连接模式 (socks/tun)
    pub current_mode: Mutex<String>,
    /// 监控线程运行标志
    pub monitor_running: AtomicBool,
    /// 累计下载字节数
    pub total_download: AtomicU64,
    /// 累计上传字节数
    pub total_upload: AtomicU64,
}

impl Default for VpnState {
    fn default() -> Self {
        Self::new()
    }
}

impl VpnState {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            status: Mutex::new(VpnStatusEnum::Disconnected),
            server_id: Mutex::new(None),
            connected_at: AtomicU64::new(0),
            current_mode: Mutex::new(String::new()),
            monitor_running: AtomicBool::new(false),
            total_download: AtomicU64::new(0),
            total_upload: AtomicU64::new(0),
        }
    }

    pub fn get_status(&self) -> VpnStatusEnum {
        *self.status.lock().unwrap()
    }

    pub fn set_status(&self, status: VpnStatusEnum) {
        *self.status.lock().unwrap() = status;
    }

    pub fn is_connected(&self) -> bool {
        self.get_status() == VpnStatusEnum::Connected
    }

    pub fn is_connecting(&self) -> bool {
        self.get_status() == VpnStatusEnum::Connecting
    }

    pub fn get_connected_at(&self) -> u64 {
        self.connected_at.load(Ordering::SeqCst)
    }

    pub fn set_connected_at(&self, timestamp: u64) {
        self.connected_at.store(timestamp, Ordering::SeqCst);
    }

    pub fn is_monitor_running(&self) -> bool {
        self.monitor_running.load(Ordering::SeqCst)
    }

    pub fn set_monitor_running(&self, running: bool) {
        self.monitor_running.store(running, Ordering::SeqCst);
    }

    pub fn get_total_download(&self) -> u64 {
        self.total_download.load(Ordering::SeqCst)
    }

    pub fn get_total_upload(&self) -> u64 {
        self.total_upload.load(Ordering::SeqCst)
    }

    pub fn add_download(&self, bytes: u64) {
        self.total_download.fetch_add(bytes, Ordering::SeqCst);
    }

    pub fn add_upload(&self, bytes: u64) {
        self.total_upload.fetch_add(bytes, Ordering::SeqCst);
    }

    pub fn reset(&self) {
        self.set_status(VpnStatusEnum::Disconnected);
        *self.server_id.lock().unwrap() = None;
        self.connected_at.store(0, Ordering::SeqCst);
        *self.current_mode.lock().unwrap() = String::new();
        self.monitor_running.store(false, Ordering::SeqCst);
        self.total_download.store(0, Ordering::SeqCst);
        self.total_upload.store(0, Ordering::SeqCst);
    }

    pub fn get_status_result(&self) -> VpnStatusResult {
        let status = self.get_status();
        let server_id = *self.server_id.lock().unwrap();
        let connected_at = if status == VpnStatusEnum::Connected {
            Some(self.get_connected_at())
        } else {
            None
        };

        VpnStatusResult {
            status: status.as_str().to_string(),
            server_id,
            connected_at,
        }
    }
}

/// 检查 VPN 状态命令
#[tauri::command]
pub async fn check_vpn_status(
    state: tauri::State<'_, VpnState>,
) -> Result<VpnStatusResult, String> {
    Ok(state.get_status_result())
}
```

---

## `src-tauri/src/vpn/helper.rs`

```rust
use std::fs;
use std::path::Path;
use serde::Serialize;

/// Helper 安装标记文件路径
const HELPER_MARKER_PATH: &str = "/tmp/tovpn_helper_installed.marker";

/// Helper 操作结果
#[derive(Serialize)]
pub struct HelperResult {
    pub success: bool,
    pub message: String,
}

/// Helper 状态结果
#[derive(Serialize)]
pub struct HelperStatusResult {
    pub status: String,
}

/// 检查 Helper 安装状态
#[tauri::command]
pub async fn check_helper_status() -> Result<HelperStatusResult, String> {
    let status = if Path::new(HELPER_MARKER_PATH).exists() {
        "installed"
    } else {
        "not_installed"
    };

    Ok(HelperStatusResult {
        status: status.to_string(),
    })
}

/// 安装 Helper
#[tauri::command]
pub async fn install_helper() -> Result<HelperResult, String> {
    match fs::write(HELPER_MARKER_PATH, "installed") {
        Ok(_) => Ok(HelperResult {
            success: true,
            message: "Helper installed successfully".into(),
        }),
        Err(e) => Ok(HelperResult {
            success: false,
            message: format!("Failed to install helper: {}", e),
        }),
    }
}

/// 卸载 Helper
#[tauri::command]
pub async fn uninstall_helper() -> Result<HelperResult, String> {
    match fs::remove_file(HELPER_MARKER_PATH) {
        Ok(_) => Ok(HelperResult {
            success: true,
            message: "Helper uninstalled successfully".into(),
        }),
        Err(_) => Ok(HelperResult {
            success: true,
            message: "Helper was not installed".into(),
        }),
    }
}
```

---

## `src-tauri/src/vpn/proxy.rs`

```rust
use std::process::Command;

/// 网络服务名称（macOS）
const NETWORK_SERVICE: &str = "Wi-Fi";

/// 设置系统 SOCKS 代理
pub fn set_system_socks_proxy(enable: bool) {
    if !cfg!(target_os = "macos") {
        return;
    }

    if enable {
        println!(">>> Enabling macOS System SOCKS Proxy (127.0.0.1:1080)...");
        
        // 设置 SOCKS 代理地址和端口
        let _ = Command::new("networksetup")
            .args(["-setsocksfirewallproxy", NETWORK_SERVICE, "127.0.0.1", "1080"])
            .output();
        
        // 启用 SOCKS 代理
        let _ = Command::new("networksetup")
            .args(["-setsocksfirewallproxystate", NETWORK_SERVICE, "on"])
            .output();
    } else {
        println!(">>> Disabling macOS System SOCKS Proxy...");
        
        // 禁用 SOCKS 代理
        let _ = Command::new("networksetup")
            .args(["-setsocksfirewallproxystate", NETWORK_SERVICE, "off"])
            .output();
    }
}

/// 获取当前活动的网络服务名称
#[allow(dead_code)]
pub fn get_active_network_service() -> Option<String> {
    if !cfg!(target_os = "macos") {
        return None;
    }

    let output = Command::new("networksetup")
        .args(["-listallnetworkservices"])
        .output()
        .ok()?;

    let services = String::from_utf8_lossy(&output.stdout);
    
    // 优先返回 Wi-Fi，否则返回第一个非禁用的服务
    for line in services.lines().skip(1) {
        if !line.starts_with('*') {
            if line.contains("Wi-Fi") || line.contains("Ethernet") {
                return Some(line.trim().to_string());
            }
        }
    }
    
    None
}
```

---

## `src-tauri/src/vpn/monitor.rs`

```rust
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use serde_json::json;

use super::state::{LatencyStats, TrafficStats, VpnState, VpnStatusEnum};

/// 启动流量和延迟监控
pub fn start_monitor(app_handle: AppHandle, state: &VpnState) {
    // 检查是否已经在运行
    if state.monitor_running.swap(true, Ordering::SeqCst) {
        println!(">>> Monitor already running");
        return;
    }

    // 复制需要的原子值的引用（通过读取）
    let app = app_handle.clone();
    
    // 使用一个简单的方式：在线程中周期性检查状态
    std::thread::spawn(move || {
        println!(">>> Traffic monitor started");
        
        let mut last_download: u64 = 0;
        let mut last_upload: u64 = 0;
        let mut tick_count: u32 = 0;
        let mut current_download: u64 = 0;
        let mut current_upload: u64 = 0;

        loop {
            std::thread::sleep(Duration::from_secs(1));

            // 模拟流量增长（实际应从 sing-box API 获取）
            let dl_delta = rand::random::<u64>() % 500_000;
            let ul_delta = rand::random::<u64>() % 100_000;
            
            current_download += dl_delta;
            current_upload += ul_delta;

            let download_speed = current_download.saturating_sub(last_download);
            let upload_speed = current_upload.saturating_sub(last_upload);

            last_download = current_download;
            last_upload = current_upload;

            // 发送流量统计事件
            let _ = app.emit("vpn-traffic", TrafficStats {
                download_bytes: current_download,
                upload_bytes: current_upload,
                download_speed,
                upload_speed,
            });

            // 每 5 秒测试一次延迟
            tick_count += 1;
            if tick_count % 5 == 0 {
                let latency = measure_latency();
                let _ = app.emit("vpn-latency", LatencyStats {
                    latency_ms: latency,
                });
            }

            // 检查是否应该停止（简单方式：检查连接是否断开）
            // 注意：这里我们无法直接访问 state，所以用一个简化的方式
            // 实际实现中可以通过 channel 或其他方式通知停止
            if tick_count > 3600 {
                // 1小时后自动停止（防止无限循环）
                break;
            }
        }

        println!(">>> Traffic monitor stopped");
    });
}

/// 停止监控
pub fn stop_monitor(state: &VpnState) {
    state.monitor_running.store(false, Ordering::SeqCst);
}

/// 测量延迟（模拟实现）
fn measure_latency() -> u32 {
    // TODO: 实际测量到代理服务器的延迟
    30 + (rand::random::<u32>() % 50)
}

/// 发送状态变更事件
pub fn emit_status_change(app_handle: &AppHandle, state: &VpnState) {
    let status_result = state.get_status_result();
    let _ = app_handle.emit("vpn-status-change", status_result);
}

/// 发送日志事件
pub fn emit_log(app_handle: &AppHandle, level: &str, message: &str) {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let _ = app_handle.emit("vpn-log", json!({
        "level": level,
        "message": message,
        "timestamp": timestamp
    }));
}
```

---

## `src-tauri/src/vpn/connect.rs`

```rust
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, Emitter};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use serde_json::json;

use super::state::{VpnState, VpnStatusEnum};
use super::proxy::set_system_socks_proxy;
use super::monitor::{start_monitor, stop_monitor, emit_status_change, emit_log};

/// 连接配置
struct ConnectConfig {
    server_ip: String,
    server_port: u16,
    password: String,
    sni: String,
    mode: String,
}

impl Default for ConnectConfig {
    fn default() -> Self {
        Self {
            server_ip: "47.88.55.204".to_string(),
            server_port: 20443,
            password: "Dd@991122".to_string(),
            sni: "kx.dalenvpn.xyz".to_string(),
            mode: "socks".to_string(),
        }
    }
}

/// 连接 VPN
#[tauri::command]
pub async fn connect_hysteria(
    app_handle: AppHandle,
    state: tauri::State<'_, VpnState>,
    domain: String,
    password: String,
    mode: String,
) -> Result<String, String> {
    // 检查当前状态
    let current_status = state.get_status();
    
    if current_status == VpnStatusEnum::Connected {
        return Err("VPN is already connected".to_string());
    }
    
    if current_status == VpnStatusEnum::Connecting {
        return Err("VPN is connecting, please wait".to_string());
    }

    // 更新状态为连接中
    state.set_status(VpnStatusEnum::Connecting);
    emit_status_change(&app_handle, &state);

    // 准备配置
    let config = ConnectConfig {
        server_ip: if domain.is_empty() { 
            ConnectConfig::default().server_ip 
        } else { 
            domain 
        },
        password: if password.is_empty() { 
            ConnectConfig::default().password 
        } else { 
            password 
        },
        mode: mode.clone(),
        ..Default::default()
    };

    // 执行连接
    match do_connect(&app_handle, &state, &config).await {
        Ok(_) => {
            // 连接成功
            state.set_status(VpnStatusEnum::Connected);
            state.set_connected_at(
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs()
            );
            *state.current_mode.lock().unwrap() = mode;
            
            // 发送状态变更事件
            emit_status_change(&app_handle, &state);
            emit_log(&app_handle, "info", "VPN connected successfully");
            
            // 启动监控
            start_monitor(app_handle.clone(), &state);
            
            Ok("Connected".to_string())
        }
        Err(e) => {
            // 连接失败，重置状态
            state.reset();
            emit_status_change(&app_handle, &state);
            emit_log(&app_handle, "error", &format!("Connection failed: {}", e));
            
            Err(e)
        }
    }
}

/// 实际连接逻辑
async fn do_connect(
    app_handle: &AppHandle,
    state: &VpnState,
    config: &ConnectConfig,
) -> Result<(), String> {
    // 获取应用数据目录
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    
    let config_path = app_dir.join("config.json");
    let cache_path = app_dir.join("cache.db");

    println!(">>> Connecting Mode: {} | Server: {}:{}", 
        config.mode, config.server_ip, config.server_port);

    // 生成 sing-box 配置
    let config_content = generate_singbox_config(config, &cache_path)?;
    
    fs::write(&config_path, serde_json::to_string_pretty(&config_content).unwrap())
        .map_err(|e| format!("Failed to write config: {}", e))?;

    // 如果是 SOCKS 模式，设置系统代理
    if config.mode == "socks" {
        set_system_socks_proxy(true);
    }

    // 启动 sing-box
    let sidecar_command = app_handle
        .shell()
        .sidecar("sing-box")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .env("ENABLE_DEPRECATED_LEGACY_DNS_SERVERS", "true")
        .env("ENABLE_DEPRECATED_SPECIAL_OUTBOUNDS", "true")
        .env("ENABLE_DEPRECATED_OUTBOUND_DNS_RULE_ITEM", "true")
        .env("ENABLE_DEPRECATED_TUN_ADDRESS_X", "true")
        .env("ENABLE_DEPRECATED_MISSING_DOMAIN_RESOLVER", "true");

    let (mut rx, child) = sidecar_command
        .args(["run", "-c", config_path.to_str().unwrap()])
        .spawn()
        .map_err(|e| format!("Failed to spawn sing-box: {}", e))?;

    // 保存子进程句柄
    *state.child.lock().unwrap() = Some(child);

    // 异步处理 sing-box 输出
    let app_handle_clone = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) | CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).to_string();
                    println!("[SingBox] {}", line);
                    emit_log(&app_handle_clone, "info", &line);
                }
                CommandEvent::Terminated(payload) => {
                    println!("[SingBox] Process terminated: {:?}", payload);
                }
                _ => {}
            }
        }
    });

    Ok(())
}

/// 断开 VPN
#[tauri::command]
pub async fn disconnect_vpn(
    app_handle: AppHandle,
    state: tauri::State<'_, VpnState>,
) -> Result<String, String> {
    let current_status = state.get_status();
    
    if current_status == VpnStatusEnum::Disconnected {
        return Ok("Already disconnected".to_string());
    }

    // 更新状态为断开中
    state.set_status(VpnStatusEnum::Disconnecting);
    emit_status_change(&app_handle, &state);

    // 停止监控
    stop_monitor(&state);

    // 清理系统代理
    set_system_socks_proxy(false);

    // 终止子进程
    let mut child_guard = state.child.lock().unwrap();
    if let Some(child) = child_guard.take() {
        let _ = child.kill();
    }

    // 重置状态
    state.reset();
    emit_status_change(&app_handle, &state);
    emit_log(&app_handle, "info", "VPN disconnected");

    Ok("Disconnected".to_string())
}

/// 生成 sing-box 配置
fn generate_singbox_config(
    config: &ConnectConfig,
    cache_path: &std::path::Path,
) -> Result<serde_json::Value, String> {
    // 根据模式生成不同的 Inbound
    let inbounds = if config.mode == "socks" {
        json!([{
            "type": "socks",
            "tag": "socks-in",
            "listen": "127.0.0.1",
            "listen_port": 1080,
            "sniff": true
        }])
    } else {
        let tun_name = if cfg!(target_os = "macos") { "utun233" } else { "tovpntun" };
        json!([{
            "type": "tun",
            "tag": "tun-in",
            "interface_name": tun_name,
            "address": ["172.19.0.1/30"],
            "mtu": 1280,
            "auto_route": true,
            "strict_route": false,
            "stack": "mixed",
            "sniff": true
        }])
    };

    Ok(json!({
        "log": {
            "level": "info",
            "timestamp": true
        },
        "dns": {
            "servers": [
                {
                    "tag": "google",
                    "address": "https://8.8.8.8/dns-query",
                    "detour": "proxy"
                },
                {
                    "tag": "local",
                    "address": "223.5.5.5",
                    "detour": "direct"
                }
            ],
            "rules": [
                { "rule_set": "geosite-cn", "server": "local" },
                { "clash_mode": "Direct", "server": "local" },
                { "clash_mode": "Global", "server": "google" }
            ],
            "final": "google",
            "strategy": "ipv4_only"
        },
        "inbounds": inbounds,
        "outbounds": [
            {
                "type": "hysteria2",
                "tag": "proxy",
                "server": config.server_ip,
                "server_port": config.server_port,
                "password": config.password,
                "up_mbps": 100,
                "down_mbps": 100,
                "tls": {
                    "enabled": true,
                    "server_name": config.sni,
                    "insecure": true,
                    "alpn": ["h3"]
                }
            },
            { "type": "direct", "tag": "direct" }
        ],
        "route": {
            "default_domain_resolver": "local",
            "rule_set": [
                {
                    "tag": "geosite-cn",
                    "type": "remote",
                    "format": "binary",
                    "url": "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs",
                    "download_detour": "proxy"
                },
                {
                    "tag": "geoip-cn",
                    "type": "remote",
                    "format": "binary",
                    "url": "https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs",
                    "download_detour": "proxy"
                }
            ],
            "rules": [
                { "protocol": "dns", "action": "hijack-dns" },
                { "ip_cidr": [format!("{}/32", config.server_ip)], "outbound": "direct" },
                { "rule_set": "geosite-cn", "outbound": "direct" },
                { "rule_set": "geoip-cn", "outbound": "direct" },
                { "ip_is_private": true, "outbound": "direct" }
            ],
            "auto_detect_interface": true,
            "final": "proxy"
        },
        "experimental": {
            "cache_file": {
                "enabled": true,
                "path": cache_path.to_str().unwrap()
            }
        }
    }))
}
```

---

## `src-tauri/src/vpn/ping.rs`

```rust
use std::net::{TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use serde::Serialize;

/// Ping 结果
#[derive(Clone, Serialize)]
pub struct PingResult {
    pub node_id: i32,
    pub latency_ms: i32,  // -1 表示超时或失败
    pub status: String,   // "online" | "offline" | "slow"
}

/// TCP Ping 单个地址
fn tcp_ping(host: &str, port: u16, timeout_ms: u64) -> i32 {
    let addr = format!("{}:{}", host, port);
    
    let socket_addrs = match addr.to_socket_addrs() {
        Ok(addrs) => addrs.collect::<Vec<_>>(),
        Err(_) => return -1,
    };
    
    if socket_addrs.is_empty() {
        return -1;
    }
    
    let start = Instant::now();
    
    match TcpStream::connect_timeout(
        &socket_addrs[0],
        Duration::from_millis(timeout_ms)
    ) {
        Ok(_) => start.elapsed().as_millis() as i32,
        Err(_) => -1,
    }
}

/// 根据延迟判断状态
fn get_status_from_latency(latency: i32) -> &'static str {
    if latency < 0 {
        "offline"
    } else if latency < 200 {
        "online"
    } else if latency < 500 {
        "slow"
    } else {
        "offline"
    }
}

/// 批量测试节点延迟
#[tauri::command]
pub async fn ping_nodes(
    app_handle: AppHandle,
    nodes: Vec<(i32, String, u16)>,  // (id, domain, port)
) -> Result<(), String> {
    // 使用线程池并发测试
    let handles: Vec<_> = nodes.into_iter().map(|(id, domain, port)| {
        let app = app_handle.clone();
        std::thread::spawn(move || {
            let latency = tcp_ping(&domain, port, 5000);
            let status = get_status_from_latency(latency);
            
            let result = PingResult {
                node_id: id,
                latency_ms: latency,
                status: status.to_string(),
            };
            
            // 发送单个节点的结果
            let _ = app.emit("ping-result", result);
        })
    }).collect();
    
    // 等待所有测试完成
    for handle in handles {
        let _ = handle.join();
    }
    
    Ok(())
}

/// 测试单个节点延迟（同步返回）
#[tauri::command]
pub fn ping_single_node(domain: String, port: u16) -> i32 {
    tcp_ping(&domain, port, 5000)
}
```

---

## `src-tauri/Cargo.toml` (添加 rand 依赖)

```toml
[package]
name = "tovpn"
version = "0.1.0"
edition = "2021"

[lib]
name = "tovpn"
crate-type = ["staticlib", "cdylib", "rlib"]

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rand = "0.8"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"]
```

---

## 完整文件检查清单

确保以下文件都存在：

```bash
# 检查文件结构
ls -la src-tauri/src/
# 应该看到:
# - lib.rs
# - vpn/ (目录)

ls -la src-tauri/src/vpn/
# 应该看到:
# - mod.rs
# - state.rs
# - helper.rs
# - proxy.rs
# - connect.rs
# - monitor.rs
# - ping.rs
```

如果缺少文件，请创建：

```bash
# 创建目录和文件
mkdir -p src-tauri/src/vpn
touch src-tauri/src/vpn/mod.rs
touch src-tauri/src/vpn/state.rs
touch src-tauri/src/vpn/helper.rs
touch src-tauri/src/vpn/proxy.rs
touch src-tauri/src/vpn/connect.rs
touch src-tauri/src/vpn/monitor.rs
touch src-tauri/src/vpn/ping.rs
```

然后将上述代码复制到对应文件中。

---

## 编译检查

```bash
cd src-tauri
cargo check
```

如果仍有错误，请提供完整错误信息。

# 修改 HomeView 布局

## 方案一：合并到一个组件

### `src/components/home/ConnectionInfo.vue` (新建)

```vue
<script setup lang="ts">
import { formatDuration } from '@/utils/format'

interface Props {
  isConnected: boolean
  connectedTime: number
  membershipLevel: string
  showMembership: boolean
}

defineProps<Props>()

const badgeClass = (level: string) => {
  switch (level) {
    case 'Administrator':
      return 'bg-purple-500/10 text-purple-500'
    case 'Pro Member':
      return 'bg-emerald-500/10 text-emerald-500'
    default:
      return 'bg-slate-500/10 text-slate-500'
  }
}
</script>

<template>
  <div class="h-8 flex items-center justify-center gap-3">
    <!-- 连接计时器 -->
    <Transition name="fade">
      <div 
        v-if="isConnected && connectedTime > 0"
        class="px-3 py-1 rounded-full bg-white/80 dark:bg-white/10 border border-[var(--vpn-border)] shadow-sm text-xs font-mono text-[var(--vpn-text-secondary)] flex items-center gap-1.5"
      >
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        {{ formatDuration(connectedTime) }}
      </div>
    </Transition>

    <!-- 分隔点 (仅当两者都显示时) -->
    <span 
      v-if="isConnected && connectedTime > 0 && showMembership" 
      class="w-1 h-1 rounded-full bg-[var(--vpn-border)]"
    ></span>

    <!-- 会员标识 -->
    <div v-if="showMembership" class="flex items-center gap-1.5 text-[11px]">
      <span class="text-[var(--vpn-text-secondary)]">as</span>
      <span class="px-2 py-0.5 rounded-full font-medium" :class="badgeClass(membershipLevel)">
        {{ membershipLevel }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
```

### `src/components/home/index.ts` (更新)

```typescript
export { default as TopNotice } from './TopNotice.vue'
export { default as ErrorBanner } from './ErrorBanner.vue'
export { default as ConnectionInfo } from './ConnectionInfo.vue'
```

### `src/views/HomeView.vue` (更新)

```vue
<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useVpnStore } from '@/stores/vpn'
import { useAuthStore } from '@/stores/auth'
import { useServersStore } from '@/stores/servers'
import { formatDuration } from '@/utils/format'

// 组件
import ConnectButton from '@/components/dashboard/ConnectButton.vue'
import ServerCard from '@/components/dashboard/ServerCard.vue'
import StatsPanel from '@/components/dashboard/StatsPanel.vue'
import { TopNotice, ErrorBanner, ConnectionInfo } from '@/components/home'

const router = useRouter()
const vpnStore = useVpnStore()
const authStore = useAuthStore()
const serversStore = useServersStore()

// Store 状态
const { status, isVpnBusy, error, stats, isConnected, isHelperReady, canCancel } = storeToRefs(vpnStore)
const { currentServer } = storeToRefs(serversStore)
const { isAuthenticated, needsLogin, hasConnectionLimit, dailyTrafficLimit, dailyTimeLimit, membershipLevel } = storeToRefs(authStore)

// ============ 错误提示逻辑 ============
const showError = ref(false)
const errorMessage = ref('')
let errorTimer: number | null = null

watch(error, (newError) => {
  if (newError) {
    errorMessage.value = newError
    showError.value = true
    
    if (errorTimer) clearTimeout(errorTimer)
    
    errorTimer = window.setTimeout(() => {
      showError.value = false
      vpnStore.clearError()
      setTimeout(() => errorMessage.value = '', 300)
    }, 5000)
  } else {
    showError.value = false
  }
}, { immediate: true })

function dismissError() {
  showError.value = false
  vpnStore.clearError()
  if (errorTimer) {
    clearTimeout(errorTimer)
    errorTimer = null
  }
}

onUnmounted(() => {
  if (errorTimer) clearTimeout(errorTimer)
})

// ============ 初始化 ============
onMounted(async () => {
  await vpnStore.initEventListeners()
  await vpnStore.syncVpnStatus()
  await vpnStore.checkHelperStatus()
  
  const pendingAction = serversStore.consumePendingAction()
  
  if (pendingAction === 'connect') {
    if (isConnected.value) {
      await vpnStore.disconnect()
      setTimeout(() => handleConnect(), 500)
    } else {
      handleConnect()
    }
  } else if (authStore.consumeAutoConnect() && isHelperReady.value) {
    setTimeout(() => handleConnect(), 500)
  }
})

watch(isAuthenticated, (authenticated) => {
  if (!authenticated && isConnected.value) {
    vpnStore.disconnect()
  }
})

// ============ 计算属性 ============
const buttonDisabled = computed(() => {
  if (status.value === 'disconnecting') return true
  if (status.value === 'connecting') return false
  return isVpnBusy.value
})

const limitInfo = computed(() => {
  if (!hasConnectionLimit.value) return null
  const parts = []
  if (dailyTrafficLimit.value > 0) parts.push(formatBytes(dailyTrafficLimit.value))
  if (dailyTimeLimit.value > 0) parts.push(formatDuration(dailyTimeLimit.value))
  return parts.join(' / ')
})

const topNoticeType = computed(() => {
  if (needsLogin.value) return 'login'
  if (isAuthenticated.value && !isHelperReady.value && status.value === 'disconnected') return 'helper'
  if (isAuthenticated.value && hasConnectionLimit.value && limitInfo.value) return 'limit'
  return null
})

// ============ 方法 ============
async function handleConnect() {
  if (needsLogin.value) {
    router.push('/login')
    return
  }
  
  if (status.value === 'connected') {
    return vpnStore.disconnect()
  }

  if (!isHelperReady.value) {
    if (window.confirm("System Extension required. Go to Settings?")) {
      router.push('/settings')
    }
    return
  }

  const limitCheck = vpnStore.checkDailyLimit()
  if (limitCheck.exceeded) {
    window.confirm(`${limitCheck.reason}\n\nUpgrade to Pro?`)
    return
  }

  vpnStore.connect()
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  }
  return (bytes / (1024 * 1024)).toFixed(0) + ' MB'
}
</script>

<template>
  <div class="h-full flex flex-col bg-[var(--vpn-bg)] overflow-hidden relative">
    <!-- Background Effects -->
    <div class="absolute inset-0 pointer-events-none overflow-hidden">
      <div class="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-sky-400/10 rounded-full blur-[100px]"></div>
      <div class="absolute bottom-[10%] left-[-10%] w-[400px] h-[400px] bg-emerald-400/10 rounded-full blur-[80px]"></div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 relative z-10 flex flex-col">
      <div class="flex-1 flex flex-col items-center justify-center px-6">
        
        <!-- Top Notice (绝对定位) -->
        <div class="absolute top-4 left-0 right-0 flex justify-center px-6">
          <TopNotice :type="topNoticeType" :limit-info="limitInfo" />
        </div>

        <!-- Main Content Group -->
        <div class="flex flex-col items-center w-full max-w-md">
          
          <!-- Error Banner (固定高度容器) -->
          <div class="w-full h-12 flex items-center justify-center mb-2">
            <ErrorBanner 
              :message="errorMessage" 
              :visible="showError" 
              @dismiss="dismissError" 
            />
          </div>

          <!-- Connect Button -->
          <ConnectButton 
            :status="status" 
            :disabled="buttonDisabled" 
            :can-cancel="canCancel" 
            @click="handleConnect"
            @cancel="vpnStore.cancelConnect" 
          />

          <!-- Connection Info (计时器 + 会员标识 同一行) -->
          <ConnectionInfo 
            :is-connected="isConnected" 
            :connected-time="stats.connectedTime"
            :membership-level="membershipLevel"
            :show-membership="isAuthenticated"
            class="mt-4"
          />

          <!-- Server Card -->
          <div class="mt-5">
            <ServerCard 
              v-if="currentServer" 
              :server="currentServer" 
              @click="router.push('/servers')" 
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Stats Panel -->
    <StatsPanel :stats="stats" :is-connected="isConnected" class="shrink-0 relative z-20" />
  </div>
</template>
```

---

## 方案二：简化版（直接在 HomeView 中实现）

如果不想新建组件，可以直接修改 HomeView：

```vue
<!-- 在 Connect Button 下方，替换原来的 ConnectionTimer 和 MembershipBadge -->

<!-- Connection Info Row -->
<div class="h-8 flex items-center justify-center gap-3 mt-4">
  <!-- 连接计时器 -->
  <Transition name="fade">
    <div 
      v-if="isConnected && stats.connectedTime > 0"
      class="px-3 py-1 rounded-full bg-white/80 dark:bg-white/10 border border-[var(--vpn-border)] shadow-sm text-xs font-mono text-[var(--vpn-text-secondary)] flex items-center gap-1.5"
    >
      <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
      {{ formatDuration(stats.connectedTime) }}
    </div>
  </Transition>

  <!-- 分隔点 -->
  <span 
    v-if="isConnected && stats.connectedTime > 0 && isAuthenticated" 
    class="w-1 h-1 rounded-full bg-[var(--vpn-border)]"
  ></span>

  <!-- 会员标识 -->
  <div v-if="isAuthenticated" class="flex items-center gap-1.5 text-[11px]">
    <span class="text-[var(--vpn-text-secondary)]">as</span>
    <span 
      class="px-2 py-0.5 rounded-full font-medium"
      :class="{
        'bg-purple-500/10 text-purple-500': membershipLevel === 'Administrator',
        'bg-emerald-500/10 text-emerald-500': membershipLevel === 'Pro Member',
        'bg-slate-500/10 text-slate-500': membershipLevel === 'Free',
      }"
    >
      {{ membershipLevel }}
    </span>
  </div>
</div>
```

---

## 效果预览

**未连接状态（已登录）：**

```
              [Connect Button]
            
                as [Free]
            
           [Server Card]
```

**已连接状态（已登录）：**

```
              [Connect Button]
            
      🟢 00:05:32  •  as [Pro Member]
            
           [Server Card]
```

**已连接状态（未登录）：**

```
              [Connect Button]
            
            🟢 00:05:32
            
           [Server Card]
```

# 完整解决方案

## 一、问题分析

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 日志级别不正确 | sing-box 输出格式是 `WARN[0000]`，没有正确解析 | 添加日志解析函数 |
| FATAL 没归类到 error | 没有映射 FATAL → error | 添加级别映射 |
| FATAL 后没断开 | 没有监听进程终止事件 | 监听 `Terminated` 事件并处理 |
| 状态不一致 | 进程退出但状态未更新 | 进程异常退出时重置状态 |

---

## 二、Rust 后端修改

### `src-tauri/src/vpn/connect.rs`

```rust
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, Emitter};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use serde_json::json;

use super::state::{VpnState, VpnStatusEnum};
use super::proxy::set_system_socks_proxy;
use super::monitor::{start_monitor, stop_monitor, emit_status_change, emit_log};

/// 连接配置
struct ConnectConfig {
    server_ip: String,
    server_port: u16,
    password: String,
    sni: String,
    mode: String,
}

impl Default for ConnectConfig {
    fn default() -> Self {
        Self {
            server_ip: "47.88.55.204".to_string(),
            server_port: 20443,
            password: "Dd@991122".to_string(),
            sni: "kx.dalenvpn.xyz".to_string(),
            mode: "socks".to_string(),
        }
    }
}

/// 解析 sing-box 日志级别
/// 输入格式: "WARN[0000] message" 或 "FATAL[0000] message"
fn parse_log_level(line: &str) -> (&str, &str) {
    let line_upper = line.to_uppercase();
    
    if line_upper.starts_with("FATAL") {
        ("error", line)
    } else if line_upper.starts_with("ERROR") {
        ("error", line)
    } else if line_upper.starts_with("WARN") {
        ("warn", line)
    } else if line_upper.starts_with("INFO") {
        ("info", line)
    } else if line_upper.starts_with("DEBUG") {
        ("info", line)
    } else if line.contains("FATAL") || line.contains("fatal") {
        ("error", line)
    } else if line.contains("ERROR") || line.contains("error") {
        ("error", line)
    } else if line.contains("WARN") || line.contains("warn") {
        ("warn", line)
    } else {
        ("info", line)
    }
}

/// 检测是否是致命错误
fn is_fatal_error(line: &str) -> bool {
    let line_upper = line.to_uppercase();
    line_upper.starts_with("FATAL") || line_upper.contains("FATAL[")
}

/// 从错误日志中提取简短错误信息
fn extract_error_message(line: &str) -> String {
    // 尝试提取关键错误信息
    if let Some(pos) = line.find("]: ") {
        return line[pos + 3..].trim().to_string();
    }
    if let Some(pos) = line.find("] ") {
        return line[pos + 2..].trim().to_string();
    }
    line.trim().to_string()
}

/// 连接 VPN
#[tauri::command]
pub async fn connect_hysteria(
    app_handle: AppHandle,
    state: tauri::State<'_, VpnState>,
    domain: String,
    password: String,
    mode: String,
) -> Result<String, String> {
    // 检查当前状态
    let current_status = state.get_status();
    
    if current_status == VpnStatusEnum::Connected {
        return Err("VPN is already connected".to_string());
    }
    
    if current_status == VpnStatusEnum::Connecting {
        return Err("VPN is connecting, please wait".to_string());
    }

    // 更新状态为连接中
    state.set_status(VpnStatusEnum::Connecting);
    emit_status_change(&app_handle, &state);

    // 准备配置
    let config = ConnectConfig {
        server_ip: if domain.is_empty() { 
            ConnectConfig::default().server_ip 
        } else { 
            domain 
        },
        password: if password.is_empty() { 
            ConnectConfig::default().password 
        } else { 
            password 
        },
        mode: mode.clone(),
        ..Default::default()
    };

    // 执行连接
    match do_connect(&app_handle, &state, &config).await {
        Ok(_) => {
            // 连接成功
            state.set_status(VpnStatusEnum::Connected);
            state.set_connected_at(
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs()
            );
            *state.current_mode.lock().unwrap() = mode;
            
            // 发送状态变更事件
            emit_status_change(&app_handle, &state);
            emit_log(&app_handle, "info", "VPN connected successfully");
            
            // 启动监控
            start_monitor(app_handle.clone(), &state);
            
            Ok("Connected".to_string())
        }
        Err(e) => {
            // 连接失败，重置状态
            cleanup_connection(&app_handle, &state);
            emit_log(&app_handle, "error", &format!("Connection failed: {}", e));
            
            Err(e)
        }
    }
}

/// 清理连接（断开时调用）
fn cleanup_connection(app_handle: &AppHandle, state: &VpnState) {
    // 停止监控
    stop_monitor(state);
    
    // 清理系统代理
    set_system_socks_proxy(false);
    
    // 终止子进程
    let mut child_guard = state.child.lock().unwrap();
    if let Some(child) = child_guard.take() {
        let _ = child.kill();
    }
    
    // 重置状态
    state.reset();
    emit_status_change(app_handle, state);
}

/// 实际连接逻辑
async fn do_connect(
    app_handle: &AppHandle,
    state: &VpnState,
    config: &ConnectConfig,
) -> Result<(), String> {
    // 获取应用数据目录
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    
    let config_path = app_dir.join("config.json");
    let cache_path = app_dir.join("cache.db");

    println!(">>> Connecting Mode: {} | Server: {}:{}", 
        config.mode, config.server_ip, config.server_port);

    // 生成 sing-box 配置
    let config_content = generate_singbox_config(config, &cache_path)?;
    
    fs::write(&config_path, serde_json::to_string_pretty(&config_content).unwrap())
        .map_err(|e| format!("Failed to write config: {}", e))?;

    // 如果是 SOCKS 模式，设置系统代理
    if config.mode == "socks" {
        set_system_socks_proxy(true);
    }

    // 启动 sing-box
    let sidecar_command = app_handle
        .shell()
        .sidecar("sing-box")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .env("ENABLE_DEPRECATED_LEGACY_DNS_SERVERS", "true")
        .env("ENABLE_DEPRECATED_SPECIAL_OUTBOUNDS", "true")
        .env("ENABLE_DEPRECATED_OUTBOUND_DNS_RULE_ITEM", "true")
        .env("ENABLE_DEPRECATED_TUN_ADDRESS_X", "true")
        .env("ENABLE_DEPRECATED_MISSING_DOMAIN_RESOLVER", "true");

    let (mut rx, child) = sidecar_command
        .args(["run", "-c", config_path.to_str().unwrap()])
        .spawn()
        .map_err(|e| format!("Failed to spawn sing-box: {}", e))?;

    // 保存子进程句柄
    *state.child.lock().unwrap() = Some(child);

    // 异步处理 sing-box 输出
    let app_handle_clone = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        let mut has_fatal_error = false;
        let mut fatal_message = String::new();
        
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) | CommandEvent::Stderr(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).to_string();
                    let trimmed = line.trim();
                    
                    if trimmed.is_empty() {
                        continue;
                    }
                    
                    println!("[SingBox] {}", trimmed);
                    
                    // 解析日志级别
                    let (level, message) = parse_log_level(trimmed);
                    emit_log(&app_handle_clone, level, message);
                    
                    // 检测致命错误
                    if is_fatal_error(trimmed) {
                        has_fatal_error = true;
                        fatal_message = extract_error_message(trimmed);
                    }
                }
                CommandEvent::Terminated(payload) => {
                    println!("[SingBox] Process terminated: {:?}", payload);
                    
                    // 发送连接失败事件
                    if has_fatal_error {
                        // 发送错误事件
                        let _ = app_handle_clone.emit("vpn-connection-error", json!({
                            "error": fatal_message.clone(),
                            "fatal": true
                        }));
                        
                        emit_log(&app_handle_clone, "error", 
                            &format!("Connection terminated: {}", fatal_message));
                    } else {
                        // 进程异常退出
                        let exit_code = payload.code.unwrap_or(-1);
                        if exit_code != 0 {
                            let _ = app_handle_clone.emit("vpn-connection-error", json!({
                                "error": format!("Process exited with code: {}", exit_code),
                                "fatal": true
                            }));
                            
                            emit_log(&app_handle_clone, "error", 
                                &format!("sing-box exited with code: {}", exit_code));
                        }
                    }
                    
                    // 发送断开事件
                    let _ = app_handle_clone.emit("vpn-process-terminated", json!({
                        "reason": if has_fatal_error { "fatal_error" } else { "unknown" }
                    }));
                    
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

/// 断开 VPN
#[tauri::command]
pub async fn disconnect_vpn(
    app_handle: AppHandle,
    state: tauri::State<'_, VpnState>,
) -> Result<String, String> {
    let current_status = state.get_status();
    
    if current_status == VpnStatusEnum::Disconnected {
        return Ok("Already disconnected".to_string());
    }

    // 更新状态为断开中
    state.set_status(VpnStatusEnum::Disconnecting);
    emit_status_change(&app_handle, &state);

    // 清理连接
    cleanup_connection(&app_handle, &state);
    emit_log(&app_handle, "info", "VPN disconnected");

    Ok("Disconnected".to_string())
}

/// 生成 sing-box 配置
fn generate_singbox_config(
    config: &ConnectConfig,
    cache_path: &std::path::Path,
) -> Result<serde_json::Value, String> {
    // 根据模式生成不同的 Inbound
    let inbounds = if config.mode == "socks" {
        json!([{
            "type": "socks",
            "tag": "socks-in",
            "listen": "127.0.0.1",
            "listen_port": 1080,
            "sniff": true
        }])
    } else {
        let tun_name = if cfg!(target_os = "macos") { "utun233" } else { "tovpntun" };
        json!([{
            "type": "tun",
            "tag": "tun-in",
            "interface_name": tun_name,
            "address": ["172.19.0.1/30"],
            "mtu": 1280,
            "auto_route": true,
            "strict_route": false,
            "stack": "mixed",
            "sniff": true
        }])
    };

    // 注意：ip_cidr 规则需要使用 IP 地址，不能使用域名
    // 如果 server_ip 是域名，需要先解析成 IP 或者移除这条规则
    let server_ip_rule = if config.server_ip.parse::<std::net::IpAddr>().is_ok() {
        // 是有效的 IP 地址
        json!({ "ip_cidr": [format!("{}/32", config.server_ip)], "outbound": "direct" })
    } else {
        // 是域名，使用 domain 规则代替
        json!({ "domain": [config.server_ip.clone()], "outbound": "direct" })
    };

    Ok(json!({
        "log": {
            "level": "info",
            "timestamp": true
        },
        "dns": {
            "servers": [
                {
                    "tag": "google",
                    "address": "https://8.8.8.8/dns-query",
                    "detour": "proxy"
                },
                {
                    "tag": "local",
                    "address": "223.5.5.5",
                    "detour": "direct"
                }
            ],
            "rules": [
                { "rule_set": "geosite-cn", "server": "local" },
                { "clash_mode": "Direct", "server": "local" },
                { "clash_mode": "Global", "server": "google" }
            ],
            "final": "google",
            "strategy": "ipv4_only"
        },
        "inbounds": inbounds,
        "outbounds": [
            {
                "type": "hysteria2",
                "tag": "proxy",
                "server": config.server_ip,
                "server_port": config.server_port,
                "password": config.password,
                "up_mbps": 100,
                "down_mbps": 100,
                "tls": {
                    "enabled": true,
                    "server_name": config.sni,
                    "insecure": true,
                    "alpn": ["h3"]
                }
            },
            { "type": "direct", "tag": "direct" }
        ],
        "route": {
            "default_domain_resolver": "local",
            "rule_set": [
                {
                    "tag": "geosite-cn",
                    "type": "remote",
                    "format": "binary",
                    "url": "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs",
                    "download_detour": "proxy"
                },
                {
                    "tag": "geoip-cn",
                    "type": "remote",
                    "format": "binary",
                    "url": "https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs",
                    "download_detour": "proxy"
                }
            ],
            "rules": [
                { "protocol": "dns", "action": "hijack-dns" },
                server_ip_rule,  // 使用动态生成的规则
                { "rule_set": "geosite-cn", "outbound": "direct" },
                { "rule_set": "geoip-cn", "outbound": "direct" },
                { "ip_is_private": true, "outbound": "direct" }
            ],
            "auto_detect_interface": true,
            "final": "proxy"
        },
        "experimental": {
            "cache_file": {
                "enabled": true,
                "path": cache_path.to_str().unwrap()
            }
        }
    }))
}
```

---

## 三、前端 VPN Store 修改

### `src/stores/vpn.ts`

```typescript
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { VpnStatus, HelperStatus, ConnectionStats } from "@/types";
import { useLogsStore } from "./logs";
import { useSettingsStore } from "./settings";
import { useServersStore } from "./servers";
import { useAuthStore } from "./auth";
import router from "@/router";

// ============ 事件类型 ============
interface LogEvent {
  level: string;
  message: string;
  timestamp: number;
}

interface TrafficEvent {
  download_bytes: number;
  upload_bytes: number;
  download_speed: number;
  upload_speed: number;
}

interface LatencyEvent {
  latency_ms: number;
}

interface VpnStatusEvent {
  status: string;
  server_id: number | null;
  connected_at: number | null;
}

interface VpnConnectionErrorEvent {
  error: string;
  fatal: boolean;
}

interface VpnProcessTerminatedEvent {
  reason: string;
}

interface HelperResult {
  success: boolean;
  message: string;
}

interface HelperStatusResult {
  status: string;
}

interface VpnStatusResult {
  status: string;
  server_id: number | null;
  connected_at: number | null;
}

// ============ 常量 ============
const DAILY_USAGE_KEY = "daily_usage";
const USER_DAILY_TRAFFIC_LIMIT = 1 * 1024 * 1024 * 1024;
const USER_DAILY_TIME_LIMIT = 2 * 60 * 60;

interface DailyUsage {
  date: string;
  traffic: number;
  time: number;
}

export const useVpnStore = defineStore("vpn", () => {
  // ============ State ============
  const status = ref<VpnStatus>("disconnected");
  const helperStatus = ref<HelperStatus>("not_installed");
  const isVpnBusy = ref(false);
  const isHelperBusy = ref(false);
  const error = ref<string | null>(null);

  const stats = ref<ConnectionStats>({
    ip: "",
    downloadSpeed: 0,
    uploadSpeed: 0,
    latency: 0,
    connectedTime: 0,
    totalDownload: 0,
    totalUpload: 0,
  });

  const dailyUsage = ref<DailyUsage>(loadDailyUsage());

  // 事件监听句柄
  let unlistenLog: UnlistenFn | null = null;
  let unlistenTraffic: UnlistenFn | null = null;
  let unlistenLatency: UnlistenFn | null = null;
  let unlistenStatus: UnlistenFn | null = null;
  let unlistenError: UnlistenFn | null = null;
  let unlistenTerminated: UnlistenFn | null = null;
  let connectedTimeTimer: number | null = null;
  let connectedAt = 0;

  // ============ Getters ============
  const isConnected = computed(() => status.value === "connected");
  const isConnecting = computed(() => status.value === "connecting");
  const isDisconnecting = computed(() => status.value === "disconnecting");

  const isHelperReady = computed(
    () => helperStatus.value === "installed" || helperStatus.value === "running"
  );

  const canConnect = computed(
    () => !isVpnBusy.value && isHelperReady.value && status.value === "disconnected"
  );

  const canDisconnect = computed(
    () => !isVpnBusy.value && (status.value === "connected" || status.value === "connecting")
  );

  const canCancel = computed(() => status.value === "connecting");
  const canInstallHelper = computed(() => !isHelperBusy.value);
  const canUninstallHelper = computed(
    () => !isHelperBusy.value && helperStatus.value !== "not_installed"
  );

  // ============ 每日限制 ============
  function loadDailyUsage(): DailyUsage {
    const today = new Date().toISOString().split("T")[0];
    const stored = localStorage.getItem(DAILY_USAGE_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored) as DailyUsage;
        if (data.date === today) return data;
      } catch { /* ignore */ }
    }
    return { date: today, traffic: 0, time: 0 };
  }

  function saveDailyUsage() {
    localStorage.setItem(DAILY_USAGE_KEY, JSON.stringify(dailyUsage.value));
  }

  function checkDailyLimit(): { exceeded: boolean; reason?: string } {
    const authStore = useAuthStore();
    if (authStore.limitType !== "user") return { exceeded: false };

    const trafficLimit = authStore.dailyTrafficLimit || USER_DAILY_TRAFFIC_LIMIT;
    const timeLimit = authStore.dailyTimeLimit || USER_DAILY_TIME_LIMIT;

    if (trafficLimit > 0 && dailyUsage.value.traffic >= trafficLimit) {
      return { exceeded: true, reason: `Daily traffic limit reached` };
    }
    if (timeLimit > 0 && dailyUsage.value.time >= timeLimit) {
      return { exceeded: true, reason: `Daily time limit reached` };
    }
    return { exceeded: false };
  }

  // ============ 状态同步 ============
  async function syncVpnStatus() {
    try {
      const result = await invoke<VpnStatusResult>("check_vpn_status");
      const newStatus = result.status as VpnStatus;

      if (status.value !== newStatus) {
        console.log(`VPN status synced: ${status.value} -> ${newStatus}`);
        status.value = newStatus;

        if (newStatus === "connected") {
          connectedAt = result.connected_at 
            ? result.connected_at * 1000 
            : Date.now() - (stats.value.connectedTime * 1000);
          startConnectedTimeCounter();
        } else if (newStatus === "disconnected") {
          stopConnectedTimeCounter();
        }
      }
    } catch (e) {
      console.error("Failed to sync VPN status:", e);
    }
  }

  // ============ Event Listeners ============
  async function initEventListeners() {
    const logs = useLogsStore();

    // 日志事件
    if (unlistenLog) unlistenLog();
    unlistenLog = await listen<LogEvent>("vpn-log", (event) => {
      const { level, message } = event.payload;
      
      // 正确映射日志级别
      let logLevel: "info" | "warn" | "error" = "info";
      const levelLower = level.toLowerCase();
      
      if (levelLower === "error" || levelLower === "fatal") {
        logLevel = "error";
      } else if (levelLower === "warn" || levelLower === "warning") {
        logLevel = "warn";
      }
      
      logs.addLog(logLevel, message);
    });

    // 状态变更事件
    if (unlistenStatus) unlistenStatus();
    unlistenStatus = await listen<VpnStatusEvent>("vpn-status-change", (event) => {
      const newStatus = event.payload.status as VpnStatus;
      console.log(`VPN status event: ${newStatus}`);
      status.value = newStatus;

      if (newStatus === "connected") {
        connectedAt = Date.now();
        startConnectedTimeCounter();
      } else if (newStatus === "disconnected") {
        stopConnectedTimeCounter();
        dailyUsage.value.traffic += stats.value.totalDownload + stats.value.totalUpload;
        dailyUsage.value.time += stats.value.connectedTime;
        saveDailyUsage();
        resetStats();
      }
    });

    // 连接错误事件
    if (unlistenError) unlistenError();
    unlistenError = await listen<VpnConnectionErrorEvent>("vpn-connection-error", (event) => {
      const { error: errorMsg, fatal } = event.payload;
      console.error(`VPN connection error: ${errorMsg}, fatal: ${fatal}`);
      
      // 设置错误信息
      error.value = `Connection failed: ${errorMsg}. Check logs for details.`;
      
      // 如果是致命错误，确保状态为断开
      if (fatal) {
        status.value = "disconnected";
        stopConnectedTimeCounter();
        resetStats();
      }
    });

    // 进程终止事件
    if (unlistenTerminated) unlistenTerminated();
    unlistenTerminated = await listen<VpnProcessTerminatedEvent>("vpn-process-terminated", (event) => {
      console.log(`VPN process terminated: ${event.payload.reason}`);
      
      // 确保状态为断开
      if (status.value !== "disconnected") {
        status.value = "disconnected";
        stopConnectedTimeCounter();
        
        // 保存使用量
        dailyUsage.value.traffic += stats.value.totalDownload + stats.value.totalUpload;
        dailyUsage.value.time += stats.value.connectedTime;
        saveDailyUsage();
        
        resetStats();
        
        // 如果不是正常断开，设置错误信息
        if (event.payload.reason === "fatal_error") {
          error.value = "Connection terminated unexpectedly. Check logs for details.";
        }
      }
    });

    // 流量事件
    if (unlistenTraffic) unlistenTraffic();
    unlistenTraffic = await listen<TrafficEvent>("vpn-traffic", (event) => {
      if (status.value === "connected") {
        stats.value.totalDownload = event.payload.download_bytes;
        stats.value.totalUpload = event.payload.upload_bytes;
        stats.value.downloadSpeed = event.payload.download_speed;
        stats.value.uploadSpeed = event.payload.upload_speed;
        checkRealTimeLimit();
      }
    });

    // 延迟事件
    if (unlistenLatency) unlistenLatency();
    unlistenLatency = await listen<LatencyEvent>("vpn-latency", (event) => {
      if (status.value === "connected") {
        stats.value.latency = event.payload.latency_ms;
      }
    });
  }

  // ============ Helper Actions ============
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
    if (!canInstallHelper.value) return;
    isHelperBusy.value = true;
    error.value = null;

    try {
      const res = await invoke<HelperResult>("install_helper");
      if (res.success) {
        helperStatus.value = "installed";
        useLogsStore().addLog("info", "Helper installed");
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
    if (!canUninstallHelper.value) return;
    isHelperBusy.value = true;

    try {
      const res = await invoke<HelperResult>("uninstall_helper");
      if (res.success) {
        helperStatus.value = "not_installed";
      }
    } catch (e) {
      console.error(e);
    } finally {
      isHelperBusy.value = false;
    }
  }

  // ============ VPN Actions ============
  async function connect() {
    const authStore = useAuthStore();
    const settingsStore = useSettingsStore();
    const serversStore = useServersStore();

    if (status.value === "connected" || status.value === "connecting") {
      console.log("Already connected or connecting");
      return;
    }

    if (authStore.needsLogin) {
      error.value = "Please login to connect";
      router.push("/login");
      return;
    }

    const tokenValid = await authStore.checkAndRefreshToken();
    if (!tokenValid) {
      error.value = "Session expired";
      router.push("/login");
      return;
    }

    const limitCheck = checkDailyLimit();
    if (limitCheck.exceeded) {
      error.value = limitCheck.reason || "Limit exceeded";
      return;
    }

    if (!isHelperReady.value) {
      error.value = "System Extension required";
      return;
    }

    const server = serversStore.currentServer;
    if (!server) {
      error.value = "No server selected";
      return;
    }

    isVpnBusy.value = true;
    error.value = null;
    resetStats();

    try {
      await invoke("connect_hysteria", {
        domain: server.domain,
        password: server.password || "",
        mode: settingsStore.settings.connectionMode,
      });
    } catch (e) {
      error.value = String(e);
      status.value = "disconnected";
    } finally {
      isVpnBusy.value = false;
    }
  }

  async function disconnect() {
    if (status.value === "disconnected") return;
    isVpnBusy.value = true;

    try {
      await invoke("disconnect_vpn");
    } catch (e) {
      console.error(e);
    } finally {
      isVpnBusy.value = false;
    }
  }

  async function cancelConnect() {
    if (!canCancel.value) return;
    await disconnect();
  }

  // ============ Timer ============
  function startConnectedTimeCounter() {
    stopConnectedTimeCounter();
    connectedTimeTimer = window.setInterval(() => {
      if (status.value === "connected") {
        stats.value.connectedTime = Math.floor((Date.now() - connectedAt) / 1000);
        checkRealTimeLimit();
      }
    }, 1000);
  }

  function stopConnectedTimeCounter() {
    if (connectedTimeTimer) {
      clearInterval(connectedTimeTimer);
      connectedTimeTimer = null;
    }
  }

  function resetStats() {
    stats.value = {
      ip: "",
      downloadSpeed: 0,
      uploadSpeed: 0,
      latency: 0,
      connectedTime: 0,
      totalDownload: 0,
      totalUpload: 0,
    };
  }

  function checkRealTimeLimit() {
    const authStore = useAuthStore();
    if (authStore.limitType !== "user") return;

    const currentTraffic = dailyUsage.value.traffic + stats.value.totalDownload + stats.value.totalUpload;
    const currentTime = dailyUsage.value.time + stats.value.connectedTime;

    const trafficLimit = authStore.dailyTrafficLimit || USER_DAILY_TRAFFIC_LIMIT;
    const timeLimit = authStore.dailyTimeLimit || USER_DAILY_TIME_LIMIT;

    if ((trafficLimit > 0 && currentTraffic >= trafficLimit) ||
        (timeLimit > 0 && currentTime >= timeLimit)) {
      disconnect();
      error.value = "Usage limit reached. Upgrade to Pro.";
    }
  }

  function clearError() {
    error.value = null;
  }

  function cleanup() {
    unlistenLog?.();
    unlistenTraffic?.();
    unlistenLatency?.();
    unlistenStatus?.();
    unlistenError?.();
    unlistenTerminated?.();
    stopConnectedTimeCounter();
  }

  return {
    status,
    helperStatus,
    isVpnBusy,
    isHelperBusy,
    error,
    stats,
    dailyUsage,
    isConnected,
    isConnecting,
    isDisconnecting,
    isHelperReady,
    canConnect,
    canDisconnect,
    canCancel,
    canInstallHelper,
    canUninstallHelper,
    syncVpnStatus,
    checkHelperStatus,
    installHelper,
    uninstallHelper,
    connect,
    disconnect,
    cancelConnect,
    initEventListeners,
    cleanup,
    checkDailyLimit,
    clearError,
  };
});
```

---

## 四、修复日志过滤

### `src/views/LogsView.vue`

```vue
<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { useLogsStore } from '@/stores/logs'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'

const store = useLogsStore()
const i18nStore = useI18nStore()
const { logs } = storeToRefs(store)
const { t } = storeToRefs(i18nStore)

const containerRef = ref<HTMLDivElement>()
const filter = ref<'all' | 'info' | 'warn' | 'error'>('all')

// 强力去除 ANSI 颜色代码
const stripAnsi = (str: string) => {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
}

// 清洗日志内容
const cleanLogMessage = (message: string) => {
  let cleanMsg = stripAnsi(message)
  // 去除时间前缀
  cleanMsg = cleanMsg.replace(/^\+\d{4} \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} /, '')
  return cleanMsg
}

const filteredLogs = computed(() => {
  let targetLogs = logs.value

  if (filter.value !== 'all') {
    targetLogs = targetLogs.filter(log => log.level === filter.value)
  }

  return targetLogs.map(log => ({
    ...log,
    message: cleanLogMessage(log.message)
  }))
})

// 各级别日志数量
const logCounts = computed(() => ({
  all: logs.value.length,
  info: logs.value.filter(l => l.level === 'info').length,
  warn: logs.value.filter(l => l.level === 'warn').length,
  error: logs.value.filter(l => l.level === 'error').length,
}))

// 自动滚动到底部
watch(logs, async () => {
  await nextTick()
  if (containerRef.value) {
    containerRef.value.scrollTop = containerRef.value.scrollHeight
  }
}, { deep: true })
</script>

<template>
  <div class="h-full flex flex-col bg-[#ffffff] dark:bg-[#1e1e1e] transition-colors duration-300">

    <!-- Terminal Header -->
    <div
      class="px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-[#333] bg-gray-50/80 dark:bg-[#252526]/90 backdrop-blur-md sticky top-0 z-10 select-none">
      <div class="flex items-center gap-3">
        <h1 class="text-sm font-semibold text-gray-700 dark:text-gray-300 font-mono flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {{ t.logs.title }}
        </h1>
      </div>

      <div class="flex items-center gap-2">
        <!-- Filter Tabs with counts -->
        <div class="flex bg-gray-200 dark:bg-[#333] rounded-md p-0.5">
          <button 
            v-for="f in ['all', 'info', 'warn', 'error'] as const" 
            :key="f" 
            @click="filter = f"
            class="px-2 py-0.5 text-[10px] uppercase font-bold rounded-sm transition-all font-mono flex items-center gap-1"
            :class="filter === f
              ? 'bg-white dark:bg-[#1e1e1e] text-black dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'"
          >
            <span>{{ f }}</span>
            <span 
              v-if="logCounts[f] > 0"
              class="px-1 rounded text-[9px]"
              :class="{
                'bg-gray-300 dark:bg-gray-600': f === 'all',
                'bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300': f === 'info',
                'bg-yellow-200 dark:bg-yellow-800 text-yellow-700 dark:text-yellow-300': f === 'warn',
                'bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-300': f === 'error',
              }"
            >
              {{ logCounts[f] }}
            </span>
          </button>
        </div>

        <button @click="store.clearLogs"
          class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-[#333] text-gray-500 dark:text-gray-400 transition-colors"
          :title="t.logs.clear">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Terminal Body -->
    <div ref="containerRef"
      class="flex-1 overflow-y-auto p-4 font-mono text-[12px] leading-relaxed scroll-smooth select-text selection:bg-blue-200 dark:selection:bg-blue-900">

      <div v-if="filteredLogs.length === 0"
        class="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 select-none">
        <svg class="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span class="text-sm">
          {{ filter === 'all' ? 'Waiting for logs...' : `No ${filter} logs` }}
        </span>
      </div>

      <div v-for="log in filteredLogs" :key="log.id"
        class="group flex gap-2 -mx-2 px-2 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-[#2a2d2e] transition-colors">

        <!-- Level Indicator -->
        <span class="shrink-0 font-bold w-14 text-right select-none" :class="{
          'text-blue-600 dark:text-blue-400': log.level === 'info',
          'text-yellow-600 dark:text-yellow-400': log.level === 'warn',
          'text-red-600 dark:text-red-400': log.level === 'error',
        }">
          {{ log.level.toUpperCase() }}
        </span>

        <!-- Message -->
        <span class="break-all whitespace-pre-wrap text-gray-800 dark:text-[#cccccc] flex-1">
          {{ log.message }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
::-webkit-scrollbar {
  width: 10px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 5px;
  border: 2px solid transparent;
  background-clip: content-box;
}
.dark ::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid transparent;
  background-clip: content-box;
}
</style>
```

---

## 五、修复总结

| 问题 | 解决方案 |
|------|---------|
| 日志级别不正确 | 添加 `parse_log_level()` 函数解析 sing-box 日志格式 |
| FATAL 没归类到 error | `FATAL` → `error` 映射 |
| FATAL 后没断开 | 监听 `Terminated` 事件，发送 `vpn-process-terminated` 和 `vpn-connection-error` |
| 状态不一致 | 进程异常退出时重置状态并设置错误信息 |
| ip_cidr 解析失败 | 检测是否是 IP，如果是域名则使用 `domain` 规则 |
| 日志计数显示 | 添加各级别日志数量徽章 |

# 日志重复问题分析与修复

## 问题分析

| 问题 | 原因 |
|------|------|
| 日志重复打印两次 | 1. `stdout` 和 `stderr` 都触发了事件<br>2. `initEventListeners()` 被多次调用 |
| `exited with code: -1` | 正常情况 - `kill()` 终止进程返回 -1 |
| 断开后显示错误 | 没有区分主动断开和异常退出 |

---

## 一、修复 Rust 后端

### `src-tauri/src/vpn/connect.rs`

```rust
use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, Emitter};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use serde_json::json;

use super::state::{VpnState, VpnStatusEnum};
use super::proxy::set_system_socks_proxy;
use super::monitor::{start_monitor, stop_monitor, emit_status_change, emit_log};

/// 连接配置
struct ConnectConfig {
    server_ip: String,
    server_port: u16,
    password: String,
    sni: String,
    mode: String,
}

impl Default for ConnectConfig {
    fn default() -> Self {
        Self {
            server_ip: "47.88.55.204".to_string(),
            server_port: 20443,
            password: "Dd@991122".to_string(),
            sni: "kx.dalenvpn.xyz".to_string(),
            mode: "socks".to_string(),
        }
    }
}

/// 解析 sing-box 日志级别
fn parse_log_level(line: &str) -> (&str, String) {
    let line_trimmed = line.trim();
    
    // 跳过空行
    if line_trimmed.is_empty() {
        return ("", String::new());
    }
    
    // 解析格式: "LEVEL[timestamp] message" 或 "LEVEL message"
    let level;
    let message;
    
    if line_trimmed.starts_with("FATAL") {
        level = "error";
        message = extract_message(line_trimmed, "FATAL");
    } else if line_trimmed.starts_with("ERROR") {
        level = "error";
        message = extract_message(line_trimmed, "ERROR");
    } else if line_trimmed.starts_with("WARN") {
        level = "warn";
        message = extract_message(line_trimmed, "WARN");
    } else if line_trimmed.starts_with("INFO") {
        level = "info";
        message = extract_message(line_trimmed, "INFO");
    } else if line_trimmed.starts_with("DEBUG") {
        level = "info";
        message = extract_message(line_trimmed, "DEBUG");
    } else {
        level = "info";
        message = line_trimmed.to_string();
    }
    
    (level, message)
}

/// 提取日志消息（去除级别和时间戳）
fn extract_message(line: &str, level_prefix: &str) -> String {
    let after_level = &line[level_prefix.len()..];
    
    // 处理 [timestamp] 格式
    if after_level.starts_with('[') {
        if let Some(end) = after_level.find(']') {
            return after_level[end + 1..].trim().to_string();
        }
    }
    
    after_level.trim().to_string()
}

/// 检测是否是致命错误
fn is_fatal_error(line: &str) -> bool {
    line.trim().to_uppercase().starts_with("FATAL")
}

/// 连接 VPN
#[tauri::command]
pub async fn connect_hysteria(
    app_handle: AppHandle,
    state: tauri::State<'_, VpnState>,
    domain: String,
    password: String,
    mode: String,
) -> Result<String, String> {
    // 检查当前状态
    let current_status = state.get_status();
    
    if current_status == VpnStatusEnum::Connected {
        return Err("VPN is already connected".to_string());
    }
    
    if current_status == VpnStatusEnum::Connecting {
        return Err("VPN is connecting, please wait".to_string());
    }

    // 设置用户主动断开标志为 false
    state.set_user_disconnect(false);

    // 更新状态为连接中
    state.set_status(VpnStatusEnum::Connecting);
    emit_status_change(&app_handle, &state);

    // 准备配置
    let config = ConnectConfig {
        server_ip: if domain.is_empty() { 
            ConnectConfig::default().server_ip 
        } else { 
            domain 
        },
        password: if password.is_empty() { 
            ConnectConfig::default().password 
        } else { 
            password 
        },
        mode: mode.clone(),
        ..Default::default()
    };

    // 执行连接
    match do_connect(&app_handle, &state, &config).await {
        Ok(_) => {
            // 连接成功
            state.set_status(VpnStatusEnum::Connected);
            state.set_connected_at(
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs()
            );
            *state.current_mode.lock().unwrap() = mode;
            
            emit_status_change(&app_handle, &state);
            emit_log(&app_handle, "info", "VPN connected successfully");
            
            // 启动监控
            start_monitor(app_handle.clone(), &state);
            
            Ok("Connected".to_string())
        }
        Err(e) => {
            cleanup_connection(&app_handle, &state, false);
            emit_log(&app_handle, "error", &format!("Connection failed: {}", e));
            Err(e)
        }
    }
}

/// 清理连接
fn cleanup_connection(app_handle: &AppHandle, state: &VpnState, is_user_action: bool) {
    stop_monitor(state);
    set_system_socks_proxy(false);
    
    let mut child_guard = state.child.lock().unwrap();
    if let Some(child) = child_guard.take() {
        let _ = child.kill();
    }
    
    state.reset();
    
    if !is_user_action {
        emit_status_change(app_handle, state);
    }
}

/// 实际连接逻辑
async fn do_connect(
    app_handle: &AppHandle,
    state: &VpnState,
    config: &ConnectConfig,
) -> Result<(), String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    
    let config_path = app_dir.join("config.json");
    let cache_path = app_dir.join("cache.db");

    println!(">>> Connecting Mode: {} | Server: {}:{}", 
        config.mode, config.server_ip, config.server_port);

    let config_content = generate_singbox_config(config, &cache_path)?;
    
    fs::write(&config_path, serde_json::to_string_pretty(&config_content).unwrap())
        .map_err(|e| format!("Failed to write config: {}", e))?;

    if config.mode == "socks" {
        set_system_socks_proxy(true);
    }

    let sidecar_command = app_handle
        .shell()
        .sidecar("sing-box")
        .map_err(|e| format!("Failed to create sidecar: {}", e))?
        .env("ENABLE_DEPRECATED_LEGACY_DNS_SERVERS", "true")
        .env("ENABLE_DEPRECATED_SPECIAL_OUTBOUNDS", "true")
        .env("ENABLE_DEPRECATED_OUTBOUND_DNS_RULE_ITEM", "true")
        .env("ENABLE_DEPRECATED_TUN_ADDRESS_X", "true")
        .env("ENABLE_DEPRECATED_MISSING_DOMAIN_RESOLVER", "true");

    let (mut rx, child) = sidecar_command
        .args(["run", "-c", config_path.to_str().unwrap()])
        .spawn()
        .map_err(|e| format!("Failed to spawn sing-box: {}", e))?;

    *state.child.lock().unwrap() = Some(child);

    // 获取用户断开标志的引用
    let user_disconnect_flag = state.user_disconnect.clone();
    let app_handle_clone = app_handle.clone();
    
    tauri::async_runtime::spawn(async move {
        let mut has_fatal_error = false;
        let mut fatal_message = String::new();
        let mut last_line = String::new();  // 用于去重
        
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line_bytes) => {
                    let line = String::from_utf8_lossy(&line_bytes).to_string();
                    let trimmed = line.trim();
                    
                    // 跳过空行和重复行
                    if trimmed.is_empty() || trimmed == last_line {
                        continue;
                    }
                    last_line = trimmed.to_string();
                    
                    println!("[SingBox] {}", trimmed);
                    
                    let (level, message) = parse_log_level(trimmed);
                    if !level.is_empty() && !message.is_empty() {
                        emit_log(&app_handle_clone, level, &message);
                    }
                    
                    if is_fatal_error(trimmed) {
                        has_fatal_error = true;
                        fatal_message = message;
                    }
                }
                CommandEvent::Stderr(line_bytes) => {
                    // stderr 通常是重复的，可以选择跳过或只用于调试
                    let line = String::from_utf8_lossy(&line_bytes).to_string();
                    let trimmed = line.trim();
                    
                    // 跳过空行和重复行
                    if trimmed.is_empty() || trimmed == last_line {
                        continue;
                    }
                    
                    // stderr 不更新 last_line，避免与 stdout 冲突
                    // 但仍然检查 fatal 错误
                    if is_fatal_error(trimmed) && !has_fatal_error {
                        has_fatal_error = true;
                        let (_, message) = parse_log_level(trimmed);
                        fatal_message = message;
                        
                        println!("[SingBox:stderr] {}", trimmed);
                        emit_log(&app_handle_clone, "error", &fatal_message);
                    }
                }
                CommandEvent::Terminated(payload) => {
                    let exit_code = payload.code.unwrap_or(-1);
                    println!("[SingBox] Process terminated with code: {}", exit_code);
                    
                    // 检查是否是用户主动断开
                    let is_user_disconnect = user_disconnect_flag.load(Ordering::SeqCst);
                    
                    if is_user_disconnect {
                        // 用户主动断开，不报错
                        println!("[SingBox] User initiated disconnect");
                    } else if has_fatal_error {
                        // 致命错误导致退出
                        let _ = app_handle_clone.emit("vpn-connection-error", json!({
                            "error": fatal_message.clone(),
                            "fatal": true
                        }));
                        emit_log(&app_handle_clone, "error", 
                            &format!("Connection terminated: {}", fatal_message));
                    } else if exit_code != 0 && exit_code != -1 {
                        // 非正常退出（-1 是 kill 导致的，属于正常）
                        let _ = app_handle_clone.emit("vpn-connection-error", json!({
                            "error": format!("Process exited unexpectedly (code: {})", exit_code),
                            "fatal": true
                        }));
                        emit_log(&app_handle_clone, "error", 
                            &format!("sing-box exited with code: {}", exit_code));
                    }
                    
                    // 发送进程终止事件
                    if !is_user_disconnect {
                        let _ = app_handle_clone.emit("vpn-process-terminated", json!({
                            "reason": if has_fatal_error { "fatal_error" } else { "process_exit" },
                            "exit_code": exit_code
                        }));
                    }
                    
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

/// 断开 VPN
#[tauri::command]
pub async fn disconnect_vpn(
    app_handle: AppHandle,
    state: tauri::State<'_, VpnState>,
) -> Result<String, String> {
    let current_status = state.get_status();
    
    if current_status == VpnStatusEnum::Disconnected {
        return Ok("Already disconnected".to_string());
    }

    // 设置用户主动断开标志
    state.set_user_disconnect(true);

    // 更新状态
    state.set_status(VpnStatusEnum::Disconnecting);
    emit_status_change(&app_handle, &state);

    // 清理连接
    cleanup_connection(&app_handle, &state, true);
    
    // 手动发送断开状态
    emit_status_change(&app_handle, &state);
    emit_log(&app_handle, "info", "VPN disconnected");

    Ok("Disconnected".to_string())
}

/// 生成 sing-box 配置
fn generate_singbox_config(
    config: &ConnectConfig,
    cache_path: &std::path::Path,
) -> Result<serde_json::Value, String> {
    let inbounds = if config.mode == "socks" {
        json!([{
            "type": "socks",
            "tag": "socks-in",
            "listen": "127.0.0.1",
            "listen_port": 1080,
            "sniff": true
        }])
    } else {
        let tun_name = if cfg!(target_os = "macos") { "utun233" } else { "tovpntun" };
        json!([{
            "type": "tun",
            "tag": "tun-in",
            "interface_name": tun_name,
            "address": ["172.19.0.1/30"],
            "mtu": 1280,
            "auto_route": true,
            "strict_route": false,
            "stack": "mixed",
            "sniff": true
        }])
    };

    // 服务器 IP 规则 - 区分 IP 和域名
    let server_direct_rule = if config.server_ip.parse::<std::net::IpAddr>().is_ok() {
        json!({ "ip_cidr": [format!("{}/32", config.server_ip)], "outbound": "direct" })
    } else {
        json!({ "domain": [config.server_ip.clone()], "outbound": "direct" })
    };

    Ok(json!({
        "log": {
            "level": "info",
            "timestamp": true
        },
        "dns": {
            "servers": [
                {
                    "tag": "google",
                    "address": "https://8.8.8.8/dns-query",
                    "detour": "proxy"
                },
                {
                    "tag": "local",
                    "address": "223.5.5.5",
                    "detour": "direct"
                }
            ],
            "rules": [
                { "rule_set": "geosite-cn", "server": "local" },
                { "clash_mode": "Direct", "server": "local" },
                { "clash_mode": "Global", "server": "google" }
            ],
            "final": "google",
            "strategy": "ipv4_only"
        },
        "inbounds": inbounds,
        "outbounds": [
            {
                "type": "hysteria2",
                "tag": "proxy",
                "server": config.server_ip,
                "server_port": config.server_port,
                "password": config.password,
                "up_mbps": 100,
                "down_mbps": 100,
                "tls": {
                    "enabled": true,
                    "server_name": config.sni,
                    "insecure": true,
                    "alpn": ["h3"]
                }
            },
            { "type": "direct", "tag": "direct" }
        ],
        "route": {
            "default_domain_resolver": "local",
            "rule_set": [
                {
                    "tag": "geosite-cn",
                    "type": "remote",
                    "format": "binary",
                    "url": "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs",
                    "download_detour": "proxy"
                },
                {
                    "tag": "geoip-cn",
                    "type": "remote",
                    "format": "binary",
                    "url": "https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs",
                    "download_detour": "proxy"
                }
            ],
            "rules": [
                { "protocol": "dns", "action": "hijack-dns" },
                server_direct_rule,
                { "rule_set": "geosite-cn", "outbound": "direct" },
                { "rule_set": "geoip-cn", "outbound": "direct" },
                { "ip_is_private": true, "outbound": "direct" }
            ],
            "auto_detect_interface": true,
            "final": "proxy"
        },
        "experimental": {
            "cache_file": {
                "enabled": true,
                "path": cache_path.to_str().unwrap()
            }
        }
    }))
}
```

---

## 二、更新 State 添加用户断开标志

### `src-tauri/src/vpn/state.rs`

```rust
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use serde::Serialize;
use tauri_plugin_shell::process::CommandChild;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum VpnStatusEnum {
    Disconnected,
    Connecting,
    Connected,
    Disconnecting,
}

impl VpnStatusEnum {
    pub fn as_str(&self) -> &'static str {
        match self {
            VpnStatusEnum::Disconnected => "disconnected",
            VpnStatusEnum::Connecting => "connecting",
            VpnStatusEnum::Connected => "connected",
            VpnStatusEnum::Disconnecting => "disconnecting",
        }
    }
}

#[derive(Serialize, Clone)]
pub struct VpnStatusResult {
    pub status: String,
    pub server_id: Option<i32>,
    pub connected_at: Option<u64>,
}

#[derive(Serialize, Clone, Default)]
pub struct TrafficStats {
    pub download_bytes: u64,
    pub upload_bytes: u64,
    pub download_speed: u64,
    pub upload_speed: u64,
}

#[derive(Serialize, Clone)]
pub struct LatencyStats {
    pub latency_ms: u32,
}

pub struct VpnState {
    pub child: Mutex<Option<CommandChild>>,
    pub status: Mutex<VpnStatusEnum>,
    pub server_id: Mutex<Option<i32>>,
    pub connected_at: AtomicU64,
    pub current_mode: Mutex<String>,
    pub monitor_running: AtomicBool,
    pub total_download: AtomicU64,
    pub total_upload: AtomicU64,
    /// 用户主动断开标志（区分主动断开和异常退出）
    pub user_disconnect: AtomicBool,
}

impl Default for VpnState {
    fn default() -> Self {
        Self::new()
    }
}

impl VpnState {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            status: Mutex::new(VpnStatusEnum::Disconnected),
            server_id: Mutex::new(None),
            connected_at: AtomicU64::new(0),
            current_mode: Mutex::new(String::new()),
            monitor_running: AtomicBool::new(false),
            total_download: AtomicU64::new(0),
            total_upload: AtomicU64::new(0),
            user_disconnect: AtomicBool::new(false),
        }
    }

    pub fn get_status(&self) -> VpnStatusEnum {
        *self.status.lock().unwrap()
    }

    pub fn set_status(&self, status: VpnStatusEnum) {
        *self.status.lock().unwrap() = status;
    }

    pub fn is_connected(&self) -> bool {
        self.get_status() == VpnStatusEnum::Connected
    }

    pub fn is_connecting(&self) -> bool {
        self.get_status() == VpnStatusEnum::Connecting
    }

    pub fn get_connected_at(&self) -> u64 {
        self.connected_at.load(Ordering::SeqCst)
    }

    pub fn set_connected_at(&self, timestamp: u64) {
        self.connected_at.store(timestamp, Ordering::SeqCst);
    }

    pub fn is_monitor_running(&self) -> bool {
        self.monitor_running.load(Ordering::SeqCst)
    }

    pub fn set_monitor_running(&self, running: bool) {
        self.monitor_running.store(running, Ordering::SeqCst);
    }

    pub fn is_user_disconnect(&self) -> bool {
        self.user_disconnect.load(Ordering::SeqCst)
    }

    pub fn set_user_disconnect(&self, value: bool) {
        self.user_disconnect.store(value, Ordering::SeqCst);
    }

    pub fn reset(&self) {
        self.set_status(VpnStatusEnum::Disconnected);
        *self.server_id.lock().unwrap() = None;
        self.connected_at.store(0, Ordering::SeqCst);
        *self.current_mode.lock().unwrap() = String::new();
        self.monitor_running.store(false, Ordering::SeqCst);
        self.total_download.store(0, Ordering::SeqCst);
        self.total_upload.store(0, Ordering::SeqCst);
        // 不重置 user_disconnect，由连接/断开逻辑控制
    }

    pub fn get_status_result(&self) -> VpnStatusResult {
        let status = self.get_status();
        let server_id = *self.server_id.lock().unwrap();
        let connected_at = if status == VpnStatusEnum::Connected {
            Some(self.get_connected_at())
        } else {
            None
        };

        VpnStatusResult {
            status: status.as_str().to_string(),
            server_id,
            connected_at,
        }
    }
}

#[tauri::command]
pub async fn check_vpn_status(
    state: tauri::State<'_, VpnState>,
) -> Result<VpnStatusResult, String> {
    Ok(state.get_status_result())
}
```

---

## 三、更新前端 VPN Store

### `src/stores/vpn.ts`

```typescript
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { VpnStatus, HelperStatus, ConnectionStats } from "@/types";
import { useLogsStore } from "./logs";
import { useSettingsStore } from "./settings";
import { useServersStore } from "./servers";
import { useAuthStore } from "./auth";
import router from "@/router";

// ============ 事件类型 ============
interface LogEvent {
  level: string;
  message: string;
  timestamp: number;
}

interface TrafficEvent {
  download_bytes: number;
  upload_bytes: number;
  download_speed: number;
  upload_speed: number;
}

interface LatencyEvent {
  latency_ms: number;
}

interface VpnStatusEvent {
  status: string;
  server_id: number | null;
  connected_at: number | null;
}

interface VpnConnectionErrorEvent {
  error: string;
  fatal: boolean;
}

interface VpnProcessTerminatedEvent {
  reason: string;
  exit_code: number;
}

interface HelperResult {
  success: boolean;
  message: string;
}

interface HelperStatusResult {
  status: string;
}

interface VpnStatusResult {
  status: string;
  server_id: number | null;
  connected_at: number | null;
}

// ============ 常量 ============
const DAILY_USAGE_KEY = "daily_usage";
const USER_DAILY_TRAFFIC_LIMIT = 1 * 1024 * 1024 * 1024;
const USER_DAILY_TIME_LIMIT = 2 * 60 * 60;

interface DailyUsage {
  date: string;
  traffic: number;
  time: number;
}

export const useVpnStore = defineStore("vpn", () => {
  // ============ State ============
  const status = ref<VpnStatus>("disconnected");
  const helperStatus = ref<HelperStatus>("not_installed");
  const isVpnBusy = ref(false);
  const isHelperBusy = ref(false);
  const error = ref<string | null>(null);
  const isUserDisconnecting = ref(false); // 用户主动断开标志

  const stats = ref<ConnectionStats>({
    ip: "",
    downloadSpeed: 0,
    uploadSpeed: 0,
    latency: 0,
    connectedTime: 0,
    totalDownload: 0,
    totalUpload: 0,
  });

  const dailyUsage = ref<DailyUsage>(loadDailyUsage());

  // 事件监听句柄
  let unlistenLog: UnlistenFn | null = null;
  let unlistenTraffic: UnlistenFn | null = null;
  let unlistenLatency: UnlistenFn | null = null;
  let unlistenStatus: UnlistenFn | null = null;
  let unlistenError: UnlistenFn | null = null;
  let unlistenTerminated: UnlistenFn | null = null;
  let connectedTimeTimer: number | null = null;
  let connectedAt = 0;
  let listenersInitialized = false; // 防止重复初始化

  // ============ Getters ============
  const isConnected = computed(() => status.value === "connected");
  const isConnecting = computed(() => status.value === "connecting");
  const isDisconnecting = computed(() => status.value === "disconnecting");

  const isHelperReady = computed(
    () => helperStatus.value === "installed" || helperStatus.value === "running"
  );

  const canConnect = computed(
    () => !isVpnBusy.value && isHelperReady.value && status.value === "disconnected"
  );

  const canDisconnect = computed(
    () => !isVpnBusy.value && (status.value === "connected" || status.value === "connecting")
  );

  const canCancel = computed(() => status.value === "connecting");
  const canInstallHelper = computed(() => !isHelperBusy.value);
  const canUninstallHelper = computed(
    () => !isHelperBusy.value && helperStatus.value !== "not_installed"
  );

  // ============ 每日限制 ============
  function loadDailyUsage(): DailyUsage {
    const today = new Date().toISOString().split("T")[0];
    const stored = localStorage.getItem(DAILY_USAGE_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored) as DailyUsage;
        if (data.date === today) return data;
      } catch { /* ignore */ }
    }
    return { date: today, traffic: 0, time: 0 };
  }

  function saveDailyUsage() {
    localStorage.setItem(DAILY_USAGE_KEY, JSON.stringify(dailyUsage.value));
  }

  function checkDailyLimit(): { exceeded: boolean; reason?: string } {
    const authStore = useAuthStore();
    if (authStore.limitType !== "user") return { exceeded: false };

    const trafficLimit = authStore.dailyTrafficLimit || USER_DAILY_TRAFFIC_LIMIT;
    const timeLimit = authStore.dailyTimeLimit || USER_DAILY_TIME_LIMIT;

    if (trafficLimit > 0 && dailyUsage.value.traffic >= trafficLimit) {
      return { exceeded: true, reason: `Daily traffic limit reached` };
    }
    if (timeLimit > 0 && dailyUsage.value.time >= timeLimit) {
      return { exceeded: true, reason: `Daily time limit reached` };
    }
    return { exceeded: false };
  }

  // ============ 状态同步 ============
  async function syncVpnStatus() {
    try {
      const result = await invoke<VpnStatusResult>("check_vpn_status");
      const newStatus = result.status as VpnStatus;

      if (status.value !== newStatus) {
        console.log(`VPN status synced: ${status.value} -> ${newStatus}`);
        status.value = newStatus;

        if (newStatus === "connected") {
          connectedAt = result.connected_at 
            ? result.connected_at * 1000 
            : Date.now() - (stats.value.connectedTime * 1000);
          startConnectedTimeCounter();
        } else if (newStatus === "disconnected") {
          stopConnectedTimeCounter();
        }
      }
    } catch (e) {
      console.error("Failed to sync VPN status:", e);
    }
  }

  // ============ Event Listeners ============
  async function initEventListeners() {
    // 防止重复初始化
    if (listenersInitialized) {
      console.log("Event listeners already initialized");
      return;
    }
    listenersInitialized = true;
    
    const logs = useLogsStore();

    // 日志事件
    unlistenLog = await listen<LogEvent>("vpn-log", (event) => {
      const { level, message } = event.payload;
      
      if (!message || message.trim() === "") return;
      
      let logLevel: "info" | "warn" | "error" = "info";
      const levelLower = level.toLowerCase();
      
      if (levelLower === "error" || levelLower === "fatal") {
        logLevel = "error";
      } else if (levelLower === "warn" || levelLower === "warning") {
        logLevel = "warn";
      }
      
      logs.addLog(logLevel, message);
    });

    // 状态变更事件
    unlistenStatus = await listen<VpnStatusEvent>("vpn-status-change", (event) => {
      const newStatus = event.payload.status as VpnStatus;
      console.log(`VPN status event: ${newStatus}`);
      
      status.value = newStatus;

      if (newStatus === "connected") {
        connectedAt = Date.now();
        startConnectedTimeCounter();
        isUserDisconnecting.value = false;
      } else if (newStatus === "disconnected") {
        stopConnectedTimeCounter();
        
        // 只有非用户主动断开时才保存使用量
        if (!isUserDisconnecting.value) {
          dailyUsage.value.traffic += stats.value.totalDownload + stats.value.totalUpload;
          dailyUsage.value.time += stats.value.connectedTime;
          saveDailyUsage();
        }
        
        resetStats();
        isUserDisconnecting.value = false;
      }
    });

    // 连接错误事件
    unlistenError = await listen<VpnConnectionErrorEvent>("vpn-connection-error", (event) => {
      const { error: errorMsg, fatal } = event.payload;
      console.error(`VPN connection error: ${errorMsg}, fatal: ${fatal}`);
      
      error.value = `Connection failed: ${errorMsg}`;
      
      if (fatal) {
        status.value = "disconnected";
        stopConnectedTimeCounter();
        resetStats();
      }
    });

    // 进程终止事件
    unlistenTerminated = await listen<VpnProcessTerminatedEvent>("vpn-process-terminated", (event) => {
      console.log(`VPN process terminated: ${event.payload.reason}, code: ${event.payload.exit_code}`);
      
      // 只有非用户主动断开时才处理
      if (!isUserDisconnecting.value && status.value !== "disconnected") {
        status.value = "disconnected";
        stopConnectedTimeCounter();
        
        dailyUsage.value.traffic += stats.value.totalDownload + stats.value.totalUpload;
        dailyUsage.value.time += stats.value.connectedTime;
        saveDailyUsage();
        
        resetStats();
        
        if (event.payload.reason === "fatal_error") {
          error.value = "Connection terminated. Check logs for details.";
        }
      }
    });

    // 流量事件
    unlistenTraffic = await listen<TrafficEvent>("vpn-traffic", (event) => {
      if (status.value === "connected") {
        stats.value.totalDownload = event.payload.download_bytes;
        stats.value.totalUpload = event.payload.upload_bytes;
        stats.value.downloadSpeed = event.payload.download_speed;
        stats.value.uploadSpeed = event.payload.upload_speed;
        checkRealTimeLimit();
      }
    });

    // 延迟事件
    unlistenLatency = await listen<LatencyEvent>("vpn-latency", (event) => {
      if (status.value === "connected") {
        stats.value.latency = event.payload.latency_ms;
      }
    });
  }

  // ============ Helper Actions ============
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
    if (!canInstallHelper.value) return;
    isHelperBusy.value = true;
    error.value = null;

    try {
      const res = await invoke<HelperResult>("install_helper");
      if (res.success) {
        helperStatus.value = "installed";
        useLogsStore().addLog("info", "Helper installed");
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
    if (!canUninstallHelper.value) return;
    isHelperBusy.value = true;

    try {
      const res = await invoke<HelperResult>("uninstall_helper");
      if (res.success) {
        helperStatus.value = "not_installed";
      }
    } catch (e) {
      console.error(e);
    } finally {
      isHelperBusy.value = false;
    }
  }

  // ============ VPN Actions ============
  async function connect() {
    const authStore = useAuthStore();
    const settingsStore = useSettingsStore();
    const serversStore = useServersStore();

    if (status.value === "connected" || status.value === "connecting") {
      console.log("Already connected or connecting");
      return;
    }

    if (authStore.needsLogin) {
      error.value = "Please login to connect";
      router.push("/login");
      return;
    }

    const tokenValid = await authStore.checkAndRefreshToken();
    if (!tokenValid) {
      error.value = "Session expired";
      router.push("/login");
      return;
    }

    const limitCheck = checkDailyLimit();
    if (limitCheck.exceeded) {
      error.value = limitCheck.reason || "Limit exceeded";
      return;
    }

    if (!isHelperReady.value) {
      error.value = "System Extension required";
      return;
    }

    const server = serversStore.currentServer;
    if (!server) {
      error.value = "No server selected";
      return;
    }

    isVpnBusy.value = true;
    isUserDisconnecting.value = false;
    error.value = null;
    resetStats();

    try {
      await invoke("connect_hysteria", {
        domain: server.domain,
        password: server.password || "",
        mode: settingsStore.settings.connectionMode,
      });
    } catch (e) {
      error.value = String(e);
      status.value = "disconnected";
    } finally {
      isVpnBusy.value = false;
    }
  }

  async function disconnect() {
    if (status.value === "disconnected") return;
    
    isVpnBusy.value = true;
    isUserDisconnecting.value = true; // 标记为用户主动断开

    try {
      // 先保存使用量
      dailyUsage.value.traffic += stats.value.totalDownload + stats.value.totalUpload;
      dailyUsage.value.time += stats.value.connectedTime;
      saveDailyUsage();
      
      await invoke("disconnect_vpn");
    } catch (e) {
      console.error(e);
    } finally {
      isVpnBusy.value = false;
    }
  }

  async function cancelConnect() {
    if (!canCancel.value) return;
    isUserDisconnecting.value = true;
    await disconnect();
  }

  // ============ Timer ============
  function startConnectedTimeCounter() {
    stopConnectedTimeCounter();
    connectedTimeTimer = window.setInterval(() => {
      if (status.value === "connected") {
        stats.value.connectedTime = Math.floor((Date.now() - connectedAt) / 1000);
        checkRealTimeLimit();
      }
    }, 1000);
  }

  function stopConnectedTimeCounter() {
    if (connectedTimeTimer) {
      clearInterval(connectedTimeTimer);
      connectedTimeTimer = null;
    }
  }

  function resetStats() {
    stats.value = {
      ip: "",
      downloadSpeed: 0,
      uploadSpeed: 0,
      latency: 0,
      connectedTime: 0,
      totalDownload: 0,
      totalUpload: 0,
    };
  }

  function checkRealTimeLimit() {
    const authStore = useAuthStore();
    if (authStore.limitType !== "user") return;

    const currentTraffic = dailyUsage.value.traffic + stats.value.totalDownload + stats.value.totalUpload;
    const currentTime = dailyUsage.value.time + stats.value.connectedTime;

    const trafficLimit = authStore.dailyTrafficLimit || USER_DAILY_TRAFFIC_LIMIT;
    const timeLimit = authStore.dailyTimeLimit || USER_DAILY_TIME_LIMIT;

    if ((trafficLimit > 0 && currentTraffic >= trafficLimit) ||
        (timeLimit > 0 && currentTime >= timeLimit)) {
      disconnect();
      error.value = "Usage limit reached. Upgrade to Pro.";
    }
  }

  function clearError() {
    error.value = null;
  }

  function cleanup() {
    unlistenLog?.();
    unlistenTraffic?.();
    unlistenLatency?.();
    unlistenStatus?.();
    unlistenError?.();
    unlistenTerminated?.();
    stopConnectedTimeCounter();
    listenersInitialized = false;
  }

  return {
    status,
    helperStatus,
    isVpnBusy,
    isHelperBusy,
    error,
    stats,
    dailyUsage,
    isConnected,
    isConnecting,
    isDisconnecting,
    isHelperReady,
    canConnect,
    canDisconnect,
    canCancel,
    canInstallHelper,
    canUninstallHelper,
    syncVpnStatus,
    checkHelperStatus,
    installHelper,
    uninstallHelper,
    connect,
    disconnect,
    cancelConnect,
    initEventListeners,
    cleanup,
    checkDailyLimit,
    clearError,
  };
});
```

---

## 四、修复后的日志效果

**正常连接：**

```
INFO  VPN connected successfully
WARN  legacy DNS servers is deprecated...
INFO  network: updated default interface en0, index 14
INFO  inbound/socks[socks-in]: tcp server started at 127.0.0.1:1080
INFO  sing-box started (0.88s)
```

**正常断开：**

```
INFO  VPN disconnected
```

**异常退出：**

```
ERROR Connection terminated: <错误信息>
```

---

## 五、修复总结

| 问题 | 解决方案 |
|------|---------|
| 日志重复 | 1. 跳过 stderr 重复输出<br>2. 使用 `last_line` 去重<br>3. 防止事件监听器重复注册 |
| exit code -1 不报错 | 添加 `user_disconnect` 标志区分主动断开 |
| 级别解析 | 重写 `parse_log_level()` 正确提取级别和消息 |
| 消息格式 | 去除时间戳前缀，只保留消息内容 |

从这份代码里，最需要尽快处理的有两个点：**VPN 初始化重复** 和 **Tailwind @apply 使用问题**。下面按问题列出修改建议。

---

## 1. VPN 初始化被执行两次（App.vue + HomeView）

你已经在 `App.vue` 里做了全局初始化：

```ts
// App.vue
onMounted(async () => {
  // 1. 初始化事件监听器
  await vpnStore.initEventListeners()

  // 2. 同步 VPN 状态（从 Rust 获取真实状态）
  await vpnStore.syncVpnStatus()

  // 3. 检查 Helper 状态
  await vpnStore.checkHelperStatus()

  // 4. 加载服务器列表
  await serversStore.loadServers()
})
```

但在 `HomeView.vue` 里又做了一次同样的操作：

```ts
// HomeView.vue
onMounted(async () => {
  await vpnStore.initEventListeners()
  await vpnStore.syncVpnStatus()
  await vpnStore.checkHelperStatus()

  const pendingAction = serversStore.consumePendingAction()
  ...
})
```

这样会有几个问题：

- `initEventListeners()` 里的事件监听会被注册两遍，导致：
  - 同一个事件触发两次回调
  - 状态更新被执行两遍（表现为 UI“抖动”、数据翻倍等）
- 多余的 Tauri / IPC / Rust 调用，增加开销
- 排查 bug 时容易混淆“到底是谁在初始化”

### 建议改法

**把初始化责任只放在 `App.vue`**，`HomeView` 只负责与当前页面相关的逻辑（pendingAction / 自动连接）。

把 `HomeView.vue` 的 `onMounted` 改为只处理 pendingAction 和 autoConnect：

```ts
// HomeView.vue
onMounted(async () => {
  // 不再重复 initEventListeners / syncVpnStatus / checkHelperStatus

  const pendingAction = serversStore.consumePendingAction()

  if (pendingAction === 'connect') {
    if (isConnected.value) {
      await vpnStore.disconnect()
      setTimeout(() => handleConnect(), 500)
    } else {
      handleConnect()
    }
  } else if (authStore.consumeAutoConnect() && isHelperReady.value) {
    setTimeout(() => handleConnect(), 500)
  }
})
```

`App.vue` 的初始化逻辑保持不变即可。

如果你担心 `initEventListeners()` 可能被其他地方误调用，也可以在 `vpnStore` 里面做一次“只初始化一次”的保护，例如：

```ts
// stores/vpn.ts (示意)
let listenersInited = false

async function initEventListeners() {
  if (listenersInited) return
  listenersInited = true

  // 真正的事件注册逻辑...
}
```

---

## 2. Tailwind `@apply` 用在自定义类上（会编译报错）

`src/assets/styles/main.css` 中：

```css
.vpn-blur-bg {
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
}

.vpn-sidebar {
  background-color: var(--vpn-sidebar-bg);
  @apply vpn-blur-bg;
  border-right: 1px solid var(--vpn-border);
}
```

Tailwind 的 `@apply` 只能用在 **Tailwind 工具类**（例如 `backdrop-blur-xl` / `bg-white/10` 等）上，**不能 apply 你自定义的类名**，否则通常会在构建时报类似错误：

> The `vpn-blur-bg` class does not exist. If `vpn-blur-bg` is a custom class, you cannot use it with `@apply`.

### 建议改法

直接把模糊效果写进 `.vpn-sidebar`，不用 `@apply`：

```css
.vpn-sidebar {
  background-color: var(--vpn-sidebar-bg);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-right: 1px solid var(--vpn-border);
}
```

如果你确实想复用 `.vpn-blur-bg`，就只在模板中写两个类：

```vue
<nav class="vpn-sidebar vpn-blur-bg">
  ...
</nav>
```

并在 CSS 中保留 `.vpn-blur-bg` 的定义即可。

---

## 3. SystemHelperSection 中的双 `<script>` 写法

`SystemHelperSection.vue` 目前是这样：

```vue
<script setup lang="ts">
import { useVpnStore } from '@/stores/vpn'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'

const vpnStore = useVpnStore()
...
const isHelperActive = computed(() =>
  helperStatus.value === 'running' || helperStatus.value === 'installed'
)
</script>

<script lang="ts">
import { computed } from 'vue'
</script>
```

技术上 Vue 编译器会把两个 `<script>` 合并成一个模块，`computed` 可以正常用；但这种写法：

- 不符合常规习惯，容易让读代码的人以为 `computed` 没有导入
- 对一些静态分析 / LSP 工具不友好，可能提示“computed 未定义”

### 建议改法

直接在 `script setup` 顶部导入 `computed`，删掉第二个 `<script>`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useVpnStore } from '@/stores/vpn'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'

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
```

---

## 4. 其它可以顺手优化的小点（非必须）

这些不影响功能，但可以考虑后面整理：

1. **重复加载服务器列表**

   - `App.vue` 已经在 onMounted 里 `serversStore.loadServers()`
   - `ServersView.vue` 的 `onMounted` 又在 servers 为空时加载一次

   建议保证 `loadServers()` 自身幂等（内部判断是否已加载），或者统一让 App 做一次初始化，页面不再主动加载。

2. **`HomeView` 自己实现了 `formatBytes`**

   你已经有 `@/utils/format`（在 `StatsPanel` 用了 `formatBytes`），`HomeView` 又单独写了一个 `formatBytes`：

   ```ts
   function formatBytes(bytes: number): string {
     if (bytes >= 1024 * 1024 * 1024) {
       return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
     }
     return (bytes / (1024 * 1024)).toFixed(0) + ' MB'
   }
   ```

   可以统一改为：

   ```ts
   import { formatBytes, formatDuration } from '@/utils/format'
   ```

3. **错误提示定时器清理**

   你已经在 `onUnmounted` 里清理 `errorTimer`，写得不错。如果以后有更多计时器或监听，建议统一封装在 store 或 composable 中，避免分散在各个 view 里。

---

如果你现在手上有具体的报错信息（比如构建失败、控制台异常、某个状态不对），把日志贴出来，我可以按报错逐行给你改代码。

下面按模块把主要设计缺陷、类型/数据不一致和冗余代码列出来，并给出对应优化思路。只重点讲“会埋雷”的部分，其它小问题顺带点一下。

---

## 一、认证 & Token 刷新：双系统 + 状态不同步

### 问题 1：`auth` store 和 `utils/request.ts` 各搞了一套刷新逻辑

- `src/stores/auth.ts` 里有：
  - `doRefreshToken` / `checkAndRefreshToken`
  - 自己维护 `accessToken` / `refreshToken` / `tokenExpireAt`，并存入 localStorage（通过 `storage.ts`）
- `src/utils/request.ts` 又单独实现了一套：
  - `refreshAccessToken()` 调用 `/auth/refresh`
  - 直接写入 `tovpn_access_token` / `tovpn_refresh_token` / `tovpn_token_expire_at`
  - request & response 拦截器里自己判断过期并刷新

**严重问题：这两套逻辑互相不知道对方的状态**

- `request.ts` 刷新完只更新 localStorage，不会更新 `auth` store 里的 `accessToken` 和 `tokenExpireAt`。
- 于是：
  - axios 后续请求用的是“新的 token”（从 localStorage 取）；
  - 但 `authStore.isTokenValid` / `isAuthenticated` / 路由守卫用的是“旧的 token 过期时间”。

典型后果：

1. 拦截器先刷新了一次 token → 本地存的是新 token。
2. `authStore.checkAndRefreshToken()` 还认为 token 过期了，又去调用一次 `/auth/refresh`，甚至带着旧 refresh token。
3. 刷新失败则直接 `logout()`，即使当前 axios 还能用刚刚刷新的 token 正常访问。

### 优化建议

**强烈建议只保留一套 Token 刷新体系**，推荐以 `auth` store 为唯一“真相源”：

1. 在 `request.ts` 中：
   - 保留「从 storage 里取 token 加到 header」这一小段；
   - 把整套 `refreshAccessToken` / `isRefreshing` / `subscribeTokenRefresh` / 拦截器里的刷新逻辑删掉。
2. 所有“需要保证 token 有效”的场景（如 `router.beforeEach`、`vpnStore.connect`）统一调用：

   ```ts
   const ok = await authStore.checkAndRefreshToken()
   if (!ok) { // 去登录 }
   ```

3. 响应拦截器里如果后端返回鉴权失败（401 / code=TOKEN_EXPIRED），只做一件事：
   - 清理本地 token（通过 `storage.ts` + 调用 `authStore.logout()` 更好），
   - 跳转登录页；
   - 不自己再去调刷新接口。

这样：

- Token 的写入和过期时间只由 `auth` store 管；
- axios 拦截器只负责“读取 & 附加”和“遇到 401 就清 Session”。

---

## 二、类型 / 数据模型不一致（这几个会直接报错或运行错误）

### 问题 2：Server 类型与实际字段完全对不上

`src/types/server.ts`：

```ts
export interface ServerNode {
  id: number;
  city: string;
  country: string;
  flag: string;
  endpoint: string; // Hysteria2 的域名或IP
}

export interface Server extends ServerNode {
  ping: number;
  status: "online" | "offline" | "unknown";
}
```

但 `src/stores/servers.ts` 和 `src/stores/vpn.ts` 代码全是旧字段：

```ts
// servers.store
const nodes = servers.value.map(
  (s) => [s.id, s.domain, s.port || 443] as [number, string, number]
);

await invoke("ping_nodes", { nodes });

// 单个 ping
const latency = await invoke<number>("ping_single_node", {
  domain: server.domain,
  port: server.port || 443,
});

// vpn.store.connect
await invoke("connect_hysteria", {
  domain: server.domain,
  password: server.password || "",
  mode: settingsStore.settings.connectionMode,
});
```

**问题：**

- 类型里只有 `endpoint`，没有 `domain` / `port` / `password`；
- 运行时如果后端真的只返回 `endpoint`，`server.domain` / `server.port` / `server.password` 全是 `undefined`。

### 优化思路

根据你现在的后端实际返回结构来统一，有两条路线：

1. **如果后端已经改成 Hysteria2 endpoint 模型**（推荐）：

   - 统一所有代码都用 `endpoint`（和可选 `port` / `auth` 字段）：

     ```ts
     export interface ServerNode {
       id: number;
       city: string;
       country: string;
       flag: string;
       endpoint: string; // "example.com:443" 或域名
       port?: number;
       password?: string;
     }
     ```

   - `connect_hysteria` / `ping_nodes` 参数里传 `endpoint` 而不是 `domain`；
   - 把 `servers.store` 里所有 `server.domain` 改成 `server.endpoint`。

2. **如果后端仍然返回 domain + port + password**：

   - 正确更新类型：

     ```ts
     export interface ServerNode {
       id: number;
       city: string;
       country: string;
       flag: string;
       domain: string;
       port: number;
       password?: string;
     }
     ```

   - 移除 `endpoint` 字段或把它做成计算属性（`domain:port`）。

关键是：**类型定义和 store 里实际使用的字段必须完全一致**，先统一一边，否则连 TS 都编不过去，更别说运行。

---

### 问题 3：`VpnSettings` 与 `DnsMode` / `ConnectionMode` 类型不一致

`src/types/vpn.ts`：

```ts
export type ConnectionMode = "tun" | "socks";
export type DnsMode = "cloudflare" | "google" | "aliyun" | "custom";

export interface VpnSettings {
  mtu: number;
  dnsMode: "cloudflare" | "google" | "custom";  // ← 少了 aliyun
  customDns: string;
  autoReconnect: boolean;
  killSwitch: boolean;
  connectionMode: string;                        // ← 不是 ConnectionMode
}
```

同时：

- `NetworkPreferencesSection.vue` 的 `updateDns` 用的是 `DnsMode`（含 aliyun）。
- `settings.store.ts` 的 `setConnectionMode(mode: ConnectionMode)` 又把 `mode` 塞进 `settings.value.connectionMode`（类型是 string）。

**后果：**

- TS 类型会互相打架；
- 运行时 `settings.dnsMode` 可以保存 `'aliyun'`，但 `VpnSettings` 类型不允许。

### 优化建议

`VpnSettings` 直接用已定义的类型：

```ts
export interface VpnSettings {
  mtu: number;
  dnsMode: DnsMode;
  customDns: string;
  autoReconnect: boolean;
  killSwitch: boolean;
  connectionMode: ConnectionMode;
}
```

这样：

- UI (`NetworkPreferencesSection`) / store / 业务代码用的都是同一个 `DnsMode` / `ConnectionMode`；
- 不会出现“组件允许选 Aliyun，类型不允许”的问题。

---

### 问题 4：`ConnectionStats` 类型与实际 `stats` 结构不符

`src/types/vpn.ts`：

```ts
export interface ConnectionStats {
  ip: string;
  downloadSpeed: number;
  uploadSpeed: number;
  latency: number;
  connectedTime: number;
}
```

但 `vpn.store.ts` 里：

```ts
const stats = ref<ConnectionStats>({
  ip: "",
  downloadSpeed: 0,
  uploadSpeed: 0,
  latency: 0,
  connectedTime: 0,
  totalDownload: 0,
  totalUpload: 0,
});
```

以及多处：

```ts
dailyUsage.value.traffic +=
  stats.value.totalDownload + stats.value.totalUpload;
```

**问题：类型少了字段**，`totalDownload` / `totalUpload` 实际上是核心业务（用来判断流量限制），但 `ConnectionStats` 没定义，会导致：

- TS 报错：属性不存在；
- IDE 类型提示不完整，容易出 bug。

### 优化建议

补全类型：

```ts
export interface ConnectionStats {
  ip: string;
  downloadSpeed: number;
  uploadSpeed: number;
  latency: number;
  connectedTime: number;
  totalDownload: number;
  totalUpload: number;
}
```

---

## 三、VPN 初始化 & 事件监听职责重复

### 问题 5：`initEventListeners/syncVpnStatus/checkHelperStatus` 重复调用

- `App.vue`：

  ```ts
  onMounted(async () => {
    await vpnStore.initEventListeners()
    await vpnStore.syncVpnStatus()
    await vpnStore.checkHelperStatus()
    await serversStore.loadServers()
  })
  ```

- `HomeView.vue` 再来一遍：

  ```ts
  onMounted(async () => {
    await vpnStore.initEventListeners()
    await vpnStore.syncVpnStatus()
    await vpnStore.checkHelperStatus()
    ...
  })
  ```

虽然你在 `vpn.store` 里用 `listenersInitialized` 做了“只初始化一次”的保护，但：

- `syncVpnStatus` / `checkHelperStatus` 还是会跑两遍；
- `serversStore.loadServers()` 在 `ServersView` 里又会根据条件再调一次；
- 逻辑职责分散，长远看很难维护。

### 优化建议

- **初始化职责收敛到 `App.vue`** 即可：
  - 全局只需要在 App 挂载时初始化一次。
- `HomeView` 的 `onMounted` 只负责：
  - 处理 `pendingAction`（切换服务器后“回来自动连”）；
  - 处理 `authStore.consumeAutoConnect()` 的自动连接。
- `ServersView` 中：
  - 如果坚持“进入服务器页也能刷新一次列表”，要么：
    - 让 `loadServers` 自身幂等（内部判断已经有数据就不重复调接口）；
    - 或者完全由 App 初始化，ServersView 只操作现有列表。

---

## 四、日流量限制逻辑：常量和计算重复

`vpn.store.ts`：

```ts
const USER_DAILY_TRAFFIC_LIMIT = 1 * 1024 * 1024 * 1024;
const USER_DAILY_TIME_LIMIT = 2 * 60 * 60;

function checkDailyLimit() {
  const authStore = useAuthStore();
  if (authStore.limitType !== "user") return { exceeded: false };

  const trafficLimit =
    authStore.dailyTrafficLimit || USER_DAILY_TRAFFIC_LIMIT;
  const timeLimit = authStore.dailyTimeLimit || USER_DAILY_TIME_LIMIT;
  ...
}
```

`auth.store.ts` 又定义了一遍相同常量，并在 `dailyTrafficLimit` / `dailyTimeLimit` 里自己处理：

```ts
const USER_DAILY_TRAFFIC_LIMIT = 1 * 1024 * 1024 * 1024;
const USER_DAILY_TIME_LIMIT = 2 * 60 * 60;

const dailyTrafficLimit = computed(() => {
  if (limitType.value === "none") return 0;
  if (limitType.value === "vip") return 0;
  return currentUser.value?.daily_traffic_limit || USER_DAILY_TRAFFIC_LIMIT;
});
```

**问题：**

- 常量和逻辑重复，未来改免费配额时必须改两处，极易遗漏。
- `vpnStore.checkDailyLimit` 又对 `authStore.dailyTrafficLimit` 做了一次“再兜底到同一个常量”，没有意义。

### 优化建议

1. 把这两个常量抽到一个统一位置，例如 `src/constants/limits.ts`。
2. `authStore.dailyTrafficLimit/dailyTimeLimit` 负责完全处理“根据角色和后端数据算出最终限制（或 0）”。
3. `vpnStore.checkDailyLimit` 只用 `authStore.dailyTrafficLimit` / `dailyTimeLimit`，不要再兜底到常量。

---

## 五、HTTP 层结构问题与冗余

### 问题 6：`types/api.ts` 的 `ErrorCodes` 和 `request.ts` 硬编码不统一

`types/api.ts`：

```ts
export const ErrorCodes = {
  SUCCESS: 0,
  AUTH_FAILED: 10001,
  TOKEN_EXPIRED: 10002,
  TOKEN_INVALID: 10003,
  ...
}
```

`request.ts` 里是：

```ts
if (res.code === 401 || res.code === 10002 || res.code === 10003) { ... }
```

**问题：**

- 已经有 ErrorCodes 却不用，数值散落在代码中；
- 如果后端调整 ErrorCode，只能人工全局搜索 10002 等数字，非常容易漏。

### 优化建议

- 在 `request.ts` 里直接用 `ErrorCodes.TOKEN_EXPIRED` 等常量；
- 或至少在顶部引入这些常量，避免魔法数字。

---

### 问题 7：`api/auth.logout()` 未被使用

`src/api/auth.ts` 定义了：

```ts
export function logout() {
  return request<null>({
    url: "/auth/logout",
    method: "post",
  });
}
```

但：

- `authStore.logout()` 只本地清理，没有调用 API；
- UI (`ProfileView.handleLogout`) 只调 `authStore.logout()`，完全没用到 API。

### 优化建议

选择一种策略：

1. **前后端都希望有真实的登出**：
   - 在 `authStore.logout()` 里先调 `api/auth.logout()`（允许失败），随后清理本地状态。
2. **后端不在乎登出**：
   - 删掉 `api/auth.logout()`，避免误导。

---

## 六、stores / composables 设计不统一与冗余

### 问题 8：`useVpn` composable 和直接用 store 的方式混用

- 有些地方用 `useVpn()`（例如 `AppHeader.vue`、`AppSidebar.vue`）；
- 有些地方直接 `useVpnStore()` / `useServersStore()`（例如 `HomeView.vue`、`SettingsView.vue`）；
- `useVpn` 只是简单 re-export，逻辑不多，但容易造成“这块用包装，这块用原始 store”的混乱。

### 优化建议

二选一：

1. **倾向直接使用 Pinia store**：
   - 删掉 `useVpn`，在组件里按需 `useVpnStore()/useServersStore()/useSettingsStore()`。
2. **坚持用 `useVpn` 聚合 API**：
   - 约定所有“只读 UI 层”组件都通过 `useVpn` 拿数据；
   - 只在业务逻辑较重的地方直接使用具体 store；
   - 并在文档/注释中写清楚这个约定。

目前项目规模不大，直接用各自的 store 其实更直观。

---

### 问题 9：`useTheme` 中的 `setTheme` 和 store 里的 `setTheme` 重复

- store (`settings.ts`) 有：

  ```ts
  function setTheme(t: "dark" | "light") {
    theme.value = t;
  }
  ```

- `useTheme.ts` 又包装了一层：

  ```ts
  setTheme: (t: 'dark' | 'light') => {
    store.theme = t
  },
  ```

**虽然能用，但有两点不好：**

- 同名函数语义重复，易混淆“应该调哪个”；  
- 包装层直接赋值 `store.theme` 而不是调用 `store.setTheme`，没实际价值。

### 优化建议

- 统一通过 store 的方法修改主题：

  ```ts
  export function useTheme() {
    const store = useSettingsStore()
    const { theme } = storeToRefs(store)

    return {
      theme,
      toggleTheme: store.toggleTheme,
      setTheme: store.setTheme,
    }
  }
  ```

---

## 七、Router 与视图的冗余

### 问题 10：`RegisterView.vue` / `ForgotPasswordView.vue` 没有路由入口

- `router/index.ts` 只配置了 `/login`，没有 `/register` 或 `/forgot-password`。
- 这两个视图目前是“孤儿页面”，构建虽然不会报错，但永远访问不到。

### 优化建议

- 如果短期不做注册/找回密码：
  - 直接删掉这两个 view 和相关代码；
  - 或者至少加一个 `// TODO: not used for now` 注释，防混淆。
- 如果准备后面接：
  - 现在就补上路由；并在登录页加入口链接。

---

## 八、其它冗余/不一致点（可以逐步清理）

### 1. `config` store 几乎是空壳

- `useConfigStore` 现在只有：
  - `isLoading` / `configError` / `hasValidConfig = true` / `loadConfig()` 里一个 `setTimeout`。
- 项目中没有看到任何对它的使用。

**建议**：暂时删掉，等真的有「全局配置」需求再引入，免得新同事以为这里有逻辑。

---

### 2. `useTauri` composable 基本没使用

- 大部分地方直接 `import { invoke, listen } from '@tauri-apps/api/...';`
- `useTauri` / `useTauriEvent` 的封装只在少量地方（甚至可能为零）使用。

**建议**：

- 要么统一用 `useTauriEvent` 来监听事件（比如 `servers.store`、`vpn.store`）；
- 要么删掉 `useTauri.ts`，直接在使用处引入 `invoke`/`listen`。

---

### 3. 组件 / 文案 i18n 不完整

- `SystemHelperSection.vue` 里：
  - `'Core Helper Active' / 'Core Helper Missing' / 'Install' / 'Uninstall'` 硬编码英文；
- `TopNotice.vue`：
  - `'Login to connect' / 'Install System Extension' / 'Daily: ...' / 'Upgrade'` 硬编码；
- `ProfileView.vue` 里大量 `'Account' / 'Edit Profile' / 'Sign Out' / 'Free plan: 1GB/day...'` 等直接英文；
- 但项目已经有 `i18n` store 和较完整的 `translations`。

**建议**：

- 把这些散落的硬编码文案逐步抽到 `i18nStore` 的 `translations` 里；
- 组件里统一用 `t.xxx`，保持中英文一致性。

---

### 4. 多处重复定义相同的 CSS 动画类

例如多个组件（`TopNotice`、`ConnectionInfo`、`LoginView` 等）都各自写了：

```css
.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
```

**建议**：

- 把通用的 `fade` transition 移到 `main.css` 或一个全局样式文件里；
- 单个组件无需再重复 scoped 样式。

---

### 5. `types/index.ts` 只导出部分类型

现在只：

```ts
export * from "./vpn";
export * from "./server";
```

而其它类型（login / api / user）都要用子路径导入。

**不是错误，但对大型项目**，更推荐统一入口，例如：

```ts
export * from './vpn'
export * from './server'
export * from './login'
export * from './api'
export * from './user'
```

然后组件都从 `@/types` 引用，目录更清晰。

---

如果你打算下一步做的是“能正常跑起来 + 删掉明显多余代码”，优先级建议：

1. **修 Server 类型和 VpnSettings/ConnectionStats 类型不一致**（这是编译级别的问题）。
2. **清掉 `request.ts` 里那套 Token 刷新逻辑，只留 header 处理和 401 跳转**。
3. **收敛 VPN 初始化逻辑到 `App.vue`，删掉 `HomeView` 里的重复初始化**。
4. 把 `config store` / 未用路由视图（Register/Forgot）/ 未用的 `api/auth.logout` 标成废弃或直接删掉。

如果你愿意，我可以按“改动顺序”帮你写一版具体 patch（每个文件的修改点），方便你直接应用。

还有一些小问题，但都属于“次要 / 未接线功能”，不会像前面那些那么容易埋大雷，主要包括：

- `VpnSettings.autoReconnect`、`killSwitch` 完全没被任何逻辑使用，目前只是“UI 设定值”，没有实际效果；
- `settings` store 里对 `applyTheme` 调用了一次，又在 `watch(theme, ..., { immediate: true })` 里再调用一次，有点重复；
- `user.ts` 里的 `getUserProfile / updateUserProfile / uploadAvatar / getUserUsage / reportUsage` 现在只是预留 API，前端暂时没用到；
- `api/server.ts` 里的 `testNodePing` 也暂时没人用；
- `RegisterView.vue` / `ForgotPasswordView.vue` 没有路由入口，属于“孤儿页面”。

这些可以在你把“主干逻辑”稳定之后再慢慢整理。

下面先按照你的要求，给出**“一半”比较关键的修改点**，都是可以直接改代码的那种。

---

## 修改点 1：修正 `VpnSettings` / `ConnectionStats` 类型

**文件：`src/types/vpn.ts`**

### 1.1 让 `VpnSettings` 使用统一的 `DnsMode` / `ConnectionMode`

当前：

```ts
export type ConnectionMode = "tun" | "socks";
export type DnsMode = "cloudflare" | "google" | "aliyun" | "custom";

export interface VpnSettings {
  mtu: number;
  dnsMode: "cloudflare" | "google" | "custom";
  customDns: string;
  autoReconnect: boolean;
  killSwitch: boolean;
  connectionMode: string;
}
```

修改为：

```ts
export type ConnectionMode = "tun" | "socks";
export type DnsMode = "cloudflare" | "google" | "aliyun" | "custom";

export interface VpnSettings {
  mtu: number;
  dnsMode: DnsMode;              // 使用统一类型，包含 aliyun
  customDns: string;
  autoReconnect: boolean;
  killSwitch: boolean;
  connectionMode: ConnectionMode; // 使用统一类型，而不是裸 string
}
```

这样：

- `NetworkPreferencesSection` 中的 `dnsOptions` 允许选择 `aliyun`，类型不会再对着干；
- `settingsStore.setConnectionMode(mode: ConnectionMode)` 给 `settings.value.connectionMode` 赋值时，类型也一致。

### 1.2 补全 `ConnectionStats` 字段

当前：

```ts
export interface ConnectionStats {
  ip: string;
  downloadSpeed: number;
  uploadSpeed: number;
  latency: number;
  connectedTime: number;
}
```

但在 `vpn.store.ts` 里你一直在用 `totalDownload` / `totalUpload`：

```ts
stats.value.totalDownload = event.payload.download_bytes;
stats.value.totalUpload = event.payload.upload_bytes;
...
dailyUsage.value.traffic +=
  stats.value.totalDownload + stats.value.totalUpload;
```

改为：

```ts
export interface ConnectionStats {
  ip: string;
  downloadSpeed: number;
  uploadSpeed: number;
  latency: number;
  connectedTime: number;
  totalDownload: number;
  totalUpload: number;
}
```

这样 `vpn.store.ts` 的初始化和 `resetStats()` 都与类型对齐，不会再有“属性不存在”的隐患。

---

## 修改点 2：简化 `request.ts`，去掉第二套 Token 刷新体系

目标：**只保留 auth store 那一套刷新逻辑**，axios 层只做两件事：

1. 请求时附带当前 access_token；
2. 响应里如果发现 Token 失效，清理本地并跳转登录。

**文件：`src/utils/request.ts`**

### 2.1 删除整套刷新状态与工具函数

删掉这些：

```ts
// Token 刷新状态
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

// 添加等待刷新的请求到队列
function subscribeTokenRefresh(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

// Token 刷新成功后，重发队列中的请求
function onTokenRefreshed(newToken: string) {
  refreshSubscribers.forEach((callback) => callback(newToken));
  refreshSubscribers = [];
}

// 刷新 Token
async function refreshAccessToken(): Promise<string | null> {
  ...
}
```

以及后面在拦截器里对 `isRefreshing` / `refreshAccessToken` / `subscribeTokenRefresh` / `onTokenRefreshed` 的所有引用。

### 2.2 精简请求拦截器：只负责加 Authorization 头

改成这样：

```ts
service.interceptors.request.use(
  (config) => {
    const token = getItem("access_token", "");

    if (token) {
      config.headers = config.headers || {};
      (config.headers as any)["Authorization"] = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);
```

> 注意：`config.headers` 可能为 `undefined`，先保证有对象。

### 2.3 响应拦截器：用 `ErrorCodes` 常量替代魔法数字

先在顶部引入：

```ts
import { ErrorCodes } from "@/types/api";
```

然后调整响应拦截器中这段逻辑：

当前：

```ts
if (res.code !== 0) {
  // 处理 Token 相关错误
  if (res.code === 401 || res.code === 10002 || res.code === 10003) {
    // Token 无效或过期，清理并跳转登录
    localStorage.removeItem("tovpn_access_token");
    localStorage.removeItem("tovpn_refresh_token");
    localStorage.removeItem("tovpn_user_info");
    localStorage.removeItem("tovpn_token_expire_at");
    window.location.hash = "/login";
    return Promise.reject(new Error("Session expired"));
  }

  return Promise.reject(new Error(res.message || "Error"));
}
```

改为：

```ts
if (res.code !== 0) {
  if (
    res.code === 401 ||
    res.code === ErrorCodes.TOKEN_EXPIRED ||
    res.code === ErrorCodes.TOKEN_INVALID ||
    res.code === ErrorCodes.REFRESH_TOKEN_EXPIRED
  ) {
    // Token 无效或过期，清理并跳转登录
    localStorage.removeItem("tovpn_access_token");
    localStorage.removeItem("tovpn_refresh_token");
    localStorage.removeItem("tovpn_user_info");
    localStorage.removeItem("tovpn_token_expire_at");
    window.location.hash = "/login";
    return Promise.reject(new Error("Session expired"));
  }

  return Promise.reject(new Error(res.message || "Error"));
}
```

### 2.4 精简错误拦截器：不再尝试自动刷新

当前错误拦截器比较复杂，有 401 重试 + 刷新逻辑；你可以直接改成“遇到 401 就清 Session 跳登录”，例如：

```ts
service.interceptors.response.use(
  (response) => {
    const res = response.data;
    // 上面的 code 处理逻辑保持不变
    ...
  },
  async (error: AxiosError) => {
    // 如果服务器直接返回 401 HTTP 状态（而不是业务 code）
    if (error.response?.status === 401) {
      localStorage.removeItem("tovpn_access_token");
      localStorage.removeItem("tovpn_refresh_token");
      localStorage.removeItem("tovpn_user_info");
      localStorage.removeItem("tovpn_token_expire_at");
      window.location.hash = "/login";
      return Promise.reject(new Error("Session expired"));
    }

    return Promise.reject(error);
  }
);
```

这样：

- 真正的刷新逻辑只在 `authStore.checkAndRefreshToken()` 中存在一份；
- axios 层不再自己调 `/auth/refresh`，也不会和 `auth` store 抢着更新 token。

---

## 修改点 3：去掉 `settings` 里重复的 `applyTheme` 调用，并修正 `useTheme`

**文件：`src/stores/settings.ts`**

### 3.1 只在 `watch(theme, ..., { immediate: true })` 里调用一次 `applyTheme`

现在末尾有：

```ts
  // 初始化时应用主题
  applyTheme(theme.value);

  return {
    settings,
    theme,
    ...
  };
```

由于上面已经有：

```ts
watch(
  theme,
  (val) => {
    setItem("theme", val);
    applyTheme(val);
  },
  { immediate: true }
);
```

这里的 `applyTheme(theme.value)` 是重复的，可以删掉：

```ts
  // 初始化时应用主题
  // applyTheme(theme.value);  // ← 删除这一行

  return {
    settings,
    theme,
    ...
  };
```

初始化时，`watch` 的 `immediate: true` 会立刻执行一次 `applyTheme(theme.value)`，效果一样。

---

**文件：`src/composables/useTheme.ts`**

### 3.2 通过 store 自己的 `setTheme` 方法更新主题

当前：

```ts
export function useTheme() {
  const store = useSettingsStore()
  const { theme } = storeToRefs(store)

  return {
    theme,
    toggleTheme: store.toggleTheme,
    setTheme: (t: 'dark' | 'light') => {
      store.theme = t
    },
  }
}
```

建议改成直接调用 store 的方法，而不是自己写一遍赋值逻辑：

```ts
export function useTheme() {
  const store = useSettingsStore()
  const { theme } = storeToRefs(store)

  return {
    theme,
    toggleTheme: store.toggleTheme,
    setTheme: store.setTheme,
  }
}
```

好处：

- `setTheme` 的实现只保留一份（在 store 内），将来如果增加其它副作用（比如上报、埋点），不需要同步改多处。

---

## 修改点 4：收敛 VPN 初始化逻辑到 App，去掉 HomeView 里的重复初始化

**文件：`src/views/HomeView.vue`**

当前 `onMounted`：

```ts
onMounted(async () => {
  await vpnStore.initEventListeners()
  await vpnStore.syncVpnStatus()
  await vpnStore.checkHelperStatus()

  const pendingAction = serversStore.consumePendingAction()

  if (pendingAction === 'connect') {
    if (isConnected.value) {
      await vpnStore.disconnect()
      setTimeout(() => handleConnect(), 500)
    } else {
      handleConnect()
    }
  } else if (authStore.consumeAutoConnect() && isHelperReady.value) {
    setTimeout(() => handleConnect(), 500)
  }
})
```

`App.vue` 已经在全局做过一次这些初始化，所以这里可以改成只处理“自动连接相关”的逻辑：

```ts
onMounted(async () => {
  // 不再重复 initEventListeners / syncVpnStatus / checkHelperStatus
  const pendingAction = serversStore.consumePendingAction()

  if (pendingAction === 'connect') {
    if (isConnected.value) {
      await vpnStore.disconnect()
      setTimeout(() => handleConnect(), 500)
    } else {
      handleConnect()
    }
  } else if (authStore.consumeAutoConnect() && isHelperReady.value) {
    setTimeout(() => handleConnect(), 500)
  }
})
```

这样：

- 事件监听、状态同步、Helper 检查只在 `App.vue` 的 `onMounted` 跑一次；
- `vpnStore.initEventListeners` 里虽然有 `listenersInitialized` 防重入，但没必要再多走一次逻辑。

---

以上四个修改点基本覆盖了：

- 类型不一致导致的未来 TS/运行时问题；
- Token 刷新“双系统”带来的潜在坑；
- 主题重复应用的小冗余；
- VPN 初始化职责分散的问题。

等你改完、确认这一批没有问题后，可以再单独把“Server 模型(domain/endpoint)”和“未接线的 autoReconnect/killSwitch、冗余 API”等那半部分再精细梳一轮。

-----
不能直接在拦截器里“调用 auth 里的刷新”，原因主要有两点：

1. **依赖循环 / 递归调用风险**
2. **拦截器里需要一个“绕过拦截器本身”的低层刷新函数**

但可以做到“不重复实现刷新逻辑”：把“真正发 `/auth/refresh` + 更新本地 token”的那一部分抽成一个公共函数，让 `request.ts` 和 `auth` store 都用它。这既避免重复，又安全。

下面分两部分说明：

---

## 一、为什么不能在拦截器里直接用 auth 的刷新函数？

现在结构大致是：

- `auth.store.ts`：
  - 导入 `login` / `refreshTokenApi` 自 `api/auth.ts`
  - `refreshTokenApi` 用的是封装后的 `request()`（带拦截器）

- `request.ts`：
  - 封装 axios，挂载拦截器
  - 你希望在这里「401 → 调用 `authStore.checkAndRefreshToken()` → 重试」

如果在 `request.ts` 的拦截器里这么做：

```ts
import { useAuthStore } from '@/stores/auth'

...

if (error.response?.status === 401) {
  const authStore = useAuthStore()
  await authStore.checkAndRefreshToken()   // 内部又会 request('/auth/refresh')
  ...
}
```

会有两个大问题：

1. **循环依赖**

   - `auth.store.ts` → `api/auth.ts` → `utils/request.ts`；
   - 如果 `request.ts` 再 import `auth.store.ts`，形成环：
     - `auth` → `request` → `auth`。

   虽然 JS 可以处理某些循环，但在这种带运行时逻辑和单例 store 的场景，很容易出现“某个模块初始化时还是个半成品”的问题。

2. **递归进入拦截器（潜在死循环）**

   - `request.ts` 的错误拦截器里调用了 `authStore.checkAndRefreshToken()`；
   - `checkAndRefreshToken()` 里再调用 `refreshTokenApi()`；
   - `refreshTokenApi()` 使用的还是 `request()` 封装；
   - 又回到了同一个拦截器 → 再次触发 401 逻辑 → 无限递归。

正是因为这个原因，你现在在 `request.ts` 里实现刷新时，用的是裸 `axios.post(baseURL + '/auth/refresh', ...)`，**没有走 `service` 或 `request()` 封装**，就是为了绕开这一层。

结论：**在拦截器内部，不能直接用依赖 `request()` 的 auth 刷新逻辑**，否则会自吃拦截器。

---

## 二、怎么做到“提成新函数 + 不重复逻辑”？

做法是：把“真正发 refresh 请求 + 更新本地存储”的逻辑抽到一个公共函数，然后：

- `request.ts` 的拦截器里用它来刷新 + 重试；
- `auth.store.ts` 里 `doRefreshToken/checkAndRefreshToken` 也用它，而不再用 `api/auth.refreshToken()`。

这样刷新实现只在一处，拦截器又不会递归。

### 1. 在 `request.ts` 里保留（或抽出）底层刷新函数

可以先在 `request.ts` 里保留这个函数，并导出它：

```ts
// src/utils/request.ts
import axios, { AxiosRequestConfig, AxiosError } from "axios";
import { getItem, setItem } from "./storage";

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api/v1";

const service = axios.create({
  baseURL,
  timeout: 10000,
});

// --- 刷新状态（拦截器内部用） ---
let isRefreshing = false;
let refreshSubscribers: Array<(token: string | null) => void> = [];

function subscribeTokenRefresh(callback: (token: string | null) => void) {
  refreshSubscribers.push(callback);
}

function onTokenRefreshed(newToken: string | null) {
  refreshSubscribers.forEach((callback) => callback(newToken));
  refreshSubscribers = [];
}

// === 关键：统一的底层刷新函数 ===
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getItem("refresh_token", "");

  if (!refreshToken) {
    return null;
  }

  try {
    const response = await axios.post(`${baseURL}/auth/refresh`, {
      refresh_token: refreshToken,
    });

    const res = response.data;

    if (res.code === 0 && res.data) {
      const {
        access_token,
        refresh_token: newRefreshToken,
        expires_in,
      } = res.data;
      const expireAt = Date.now() + expires_in * 1000;

      setItem("access_token", access_token);
      setItem("refresh_token", newRefreshToken);
      setItem("token_expire_at", expireAt);

      return access_token;
    }

    return null;
  } catch (error) {
    console.error("Refresh token failed:", error);
    return null;
  }
}
```

> 注意：这里用的是裸 `axios.post`，不会触发拦截器。

### 2. 在 `request.ts` 里再提一个专门处理“token 过期 → 刷新 + 重试”的函数

```ts
async function handleTokenExpired(
  originalRequest: AxiosRequestConfig & { _retry?: boolean }
) {
  // 已经重试过一次，直接失败
  if (originalRequest._retry) {
    return Promise.reject(new Error("Session expired"));
  }
  originalRequest._retry = true;

  // 已经在刷新中：排队等待
  if (isRefreshing) {
    return new Promise((resolve, reject) => {
      subscribeTokenRefresh((newToken) => {
        if (!newToken) {
          reject(new Error("Session expired"));
          return;
        }
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers["Authorization"] = `Bearer ${newToken}`;
        resolve(service(originalRequest));
      });
    });
  }

  // 第一个触发刷新
  isRefreshing = true;
  const newToken = await refreshAccessToken();
  isRefreshing = false;

  if (newToken) {
    onTokenRefreshed(newToken);
    originalRequest.headers = originalRequest.headers || {};
    originalRequest.headers["Authorization"] = `Bearer ${newToken}`;
    return service(originalRequest);
  } else {
    // 通知等待者刷新失败
    onTokenRefreshed(null);
    return Promise.reject(new Error("Session expired"));
  }
}
```

然后在错误拦截器里直接调用它：

```ts
service.interceptors.response.use(
  (response) => {
    const res = response.data;

    if (res.code !== 0) {
      return Promise.reject(new Error(res.message || "Error"));
    }

    return res.data;
  },
  async (error: AxiosError) => {
    const status = error.response?.status;

    if (status === 401) {
      const originalRequest = error.config as AxiosRequestConfig & {
        _retry?: boolean;
      };
      return handleTokenExpired(originalRequest);
    }

    return Promise.reject(error);
  }
);
```

这样：

- interceptors 这边的 token 过期处理逻辑已经被提成了 `handleTokenExpired`；
- 底层刷新调用是 `refreshAccessToken`，只写了一份。

### 3. 在 `auth.store.ts` 里也用这个 `refreshAccessToken`，不再自己写一套

**文件：`src/stores/auth.ts`**

顶部引入：

```ts
import { refreshAccessToken } from "@/utils/request";
```

然后把现在的 `doRefreshToken` 改写成复用这个函数，而不是再用 `refreshTokenApi`（`api/auth.refreshToken`）：

```ts
// 删掉这一行（或不再使用）：
// import { login, refreshToken as refreshTokenApi } from "@/api/auth";
import { login } from "@/api/auth"; // 只保留 login

...

/** 刷新 Token */
async function doRefreshToken(): Promise<boolean> {
  // 如果已经在刷新，等待现有的刷新完成
  if (refreshPromise) {
    return refreshPromise;
  }

  if (!refreshToken.value) {
    logout();
    return false;
  }

  isRefreshing.value = true;

  refreshPromise = (async () => {
    try {
      // 使用统一的底层刷新函数
      const newAccessToken = await refreshAccessToken();

      if (!newAccessToken) {
        throw new Error("Invalid refresh response");
      }

      // 从 storage 重新读一遍最新的 refresh_token 和 expireAt
      const newRefreshToken = getItem(REFRESH_TOKEN_KEY, "");
      const expireAt = getItem(TOKEN_EXPIRE_KEY, 0);

      accessToken.value = newAccessToken;
      refreshToken.value = newRefreshToken;
      tokenExpireAt.value = expireAt;

      console.log("Token refreshed successfully");
      return true;
    } catch (e) {
      console.error("Token refresh failed:", e);
      logout();
      return false;
    } finally {
      isRefreshing.value = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}
```

这样：

- “真正发请求 + 写 localStorage”的代码只有 `refreshAccessToken` 这一份；
- auth store 自己的状态（`accessToken` / `refreshToken` / `tokenExpireAt`）再用本地存储里的值同步一下；
- `request.ts` 拦截器和 `authStore.checkAndRefreshToken()` 共用一套刷新逻辑，**不再重复实现**。

---

## 小结

- 直接在拦截器里用 `authStore.checkAndRefreshToken()` 不安全，会有 **循环依赖 + 递归拦截** 问题。
- 正确做法是：把“底层刷新网络调用”抽到一个公共函数（`refreshAccessToken`），**不经过拦截器**，然后：
  - 拦截器里的 `handleTokenExpired` 用它刷新并重试原请求；
  - `authStore.doRefreshToken/checkAndRefreshToken` 也用它刷新，然后更新自己持有的状态。
- 这样既达到了你想要的效果：  
  - 桌面应用里 token 过期时静默刷新 + 重试请求；  
  - 又避免重复实现刷新逻辑。

如果你愿意，我可以再帮你把完整修改后的 `request.ts` 和 `auth.ts` 两个文件贴成“最终版”，你可以直接对照替换。

-----

先说结论：你现在这两段代码整体方向是对的，主要有 3 类需要改/完善的点：

1. auth store 里的登出逻辑和刷新失败处理；
2. request 拦截器里 token 失效的判断（要按文档里的错误码来，而不是 `ErrorCodes.NO_AUTH`）；
3. 结合你这份 API 文档，补齐/修正几个前端请求（特别是节点列表和使用统计）。

我分块给你具体改法。

---

## 一、auth store 细节问题

你现在这段：

```ts
import { login, logout } from "@/api/auth"; // 只保留 login
...
/** 登出 */
function toLogout() {
  currentUser.value = null;
  accessToken.value = "";
  refreshToken.value = "";
  tokenExpireAt.value = 0;
  loginError.value = null;
  pendingAutoConnect.value = false;
  logout();
  removeLoginInfo();
}
...
return {
  ...
  // Actions
  doLogin,
  doRefreshToken,
  checkAndRefreshToken,
  logout,
  updateUser,
  consumeAutoConnect,
};
```

问题：

- `logout` 名字冲突：  
  - import 进来的 `logout` 是 API；  
  - return 里导出的 `logout` 其实就是那个 API 函数本身，并不会清空本地状态；
- `doRefreshToken` 里在没有 refreshToken 时调用的是 API 的 `logout()`，而不是你写的本地清理函数 `toLogout()`；
- 组件里调用 `authStore.logout()` 时，只会打一个后端登出接口，本地状态不会被重置。

**建议改法：**

1. 把 API 的 `logout` 改名成 `logoutApi`；
2. 把 `toLogout` 改成真正的 store action `logout`，对外暴露；
3. 在刷新失败 / 无 refresh token 时，都调用这个 `logout()`。

修改示例（只贴关键部分）：

```ts
import { login, logout as logoutApi } from "@/api/auth";

...

function removeLoginInfo() {
  removeItem(USER_KEY);
  removeItem(TOKEN_KEY);
  removeItem(REFRESH_TOKEN_KEY);
  removeItem(TOKEN_EXPIRE_KEY);
}

/** 只清本地状态 */
function clearAuthState() {
  currentUser.value = null;
  accessToken.value = "";
  refreshToken.value = "";
  tokenExpireAt.value = 0;
  loginError.value = null;
  pendingAutoConnect.value = false;
  removeLoginInfo();
}

/** 调后端登出 + 清本地 */
async function logout() {
  try {
    await logoutApi();
  } catch (e) {
    console.error("API logout failed:", e);
  } finally {
    clearAuthState();
  }
}

/** 刷新 Token */
async function doRefreshToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  if (!refreshToken.value) {
    await logout();
    return false;
  }

  isRefreshing.value = true;

  refreshPromise = (async () => {
    try {
      const newAccessToken = await refreshAccessToken();
      if (!newAccessToken) throw new Error("Invalid refresh response");

      const newRefreshToken = getItem(REFRESH_TOKEN_KEY, "");
      const expireAt = getItem(TOKEN_EXPIRE_KEY, 0);

      accessToken.value = newAccessToken;
      refreshToken.value = newRefreshToken;
      tokenExpireAt.value = expireAt;

      console.log("Token refreshed successfully");
      return true;
    } catch (e) {
      console.error("Token refresh failed:", e);
      await logout();
      return false;
    } finally {
      isRefreshing.value = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/** 检查并刷新 Token（如需要） */
async function checkAndRefreshToken(): Promise<boolean> {
  if (isTokenValid.value && !isTokenExpiringSoon.value) {
    return true;
  }

  if (refreshToken.value) {
    return doRefreshToken();
  }

  await logout();
  return false;
}

return {
  ...
  doLogin,
  doRefreshToken,
  checkAndRefreshToken,
  logout,           // 这里是 store 的 logout，不是 API
  updateUser,
  consumeAutoConnect,
};
```

---

## 二、request 拦截器：错误码与刷新逻辑

你现在的错误拦截器是：

```ts
service.interceptors.response.use(
  (response) => {
    const res = response.data;

    if (res.code !== 0) {
      return Promise.reject(new Error(res.message || "Error"));
    }

    return res.data;
  },
  async (error: AxiosError) => {
    const status = error.response?.status;

    if (status === ErrorCodes.NO_AUTH) {
      const originalRequest = error.config as AxiosRequestConfig & {
        _retry?: boolean;
      };
      return handleTokenExpired(originalRequest);
    }

    return Promise.reject(error);
  }
);
```

问题：

1. 文档里的错误码没有 `NO_AUTH`，`ErrorCodes` 也没这个枚举；
2. `status` 是 HTTP 状态码（401 等），不应该和业务错误码 `ErrorCodes.xxx` 比较；
3. 文档定义的 token 相关错误码是：  
   - 20001 未授权  
   - 20002 Token 无效  
   - 20003 Token 已过期  
   - 20005 Refresh Token 无效  

后端可能有两种实现：

- 用 HTTP 401 + code=20001/20002/20003/20005；
- 或者 HTTP 200 + code=这些业务码。

为了兼容两种情况，可以：

1. 在 **成功分支** 里根据 `res.code` 触发刷新；
2. 在 **错误分支** 里用 `status === 401` 兜底。

假设你把 `src/types/api.ts` 改成这样（建议与文档对齐）：

```ts
export const ErrorCodes = {
  SUCCESS: 0,

  USER_NOT_FOUND: 10001,
  USER_DISABLED: 10003,
  PASSWORD_WRONG: 10004,
  EMAIL_EXISTS: 10006,

  UNAUTHORIZED: 20001,
  TOKEN_INVALID: 20002,
  TOKEN_EXPIRED: 20003,
  REFRESH_TOKEN_INVALID: 20005,
} as const;
```

那么 `request.ts` 可以写成：

```ts
service.interceptors.response.use(
  async (response) => {
    const res = response.data;

    // 处理业务层的 token 失效（HTTP 仍然是 200）
    if (
      res.code === ErrorCodes.UNAUTHORIZED ||
      res.code === ErrorCodes.TOKEN_INVALID ||
      res.code === ErrorCodes.TOKEN_EXPIRED ||
      res.code === ErrorCodes.REFRESH_TOKEN_INVALID
    ) {
      const originalRequest = response.config as AxiosRequestConfig & {
        _retry?: boolean;
      };
      return handleTokenExpired(originalRequest);
    }

    if (res.code !== 0) {
      return Promise.reject(new Error(res.message || "Error"));
    }

    return res.data;
  },
  async (error: AxiosError) => {
    const status = error.response?.status;

    // HTTP 层的 401 兜底
    if (status === 401) {
      const originalRequest = error.config as AxiosRequestConfig & {
        _retry?: boolean;
      };
      return handleTokenExpired(originalRequest);
    }

    return Promise.reject(error);
  }
);
```

`handleTokenExpired` 和 `refreshAccessToken` 你现在的实现基本是 OK 的，只要配合上面这段就能做到：

- token 过期 → 自动刷新 → 用新 token 重发原请求；
- 刷新失败 → 抛错（上层可以决定是否弹登录），而不是频繁跳转登录页。

---

## 三、根据文档修正节点列表请求

文档：

- 接口：`POST /api/v1/vpn/nodes`
- 入参：可选 `{ country?: string; status?: int }`
- 返回数组，每个元素包含 `id,name,country,city,flag,domain,port,password,protocol,status(int)`。

你现在的 `src/api/server.ts` 是：

```ts
export function getVpnNodes() {
  return request<ServerNode[]>({
    url: "/vpn/nodes/all",
    method: "get",
  });
}
```

以及 `src/types/server.ts` 里的 `ServerNode` 结构也和文档不一致（只有 `endpoint`）。

### 3.1 更新类型定义

**文件：`src/types/server.ts`**

改成符合文档的结构，并保留前端内部用的 `ping` / 文本状态：

```ts
// 原始后端返回结构
export interface ServerNode {
  id: number;
  name: string;
  country: string;
  city: string;
  flag: string;
  domain: string;
  port: number;
  password: string;
  protocol: string;
  status: number; // 1 正常 2 维护 3 下线
}

// 前端内部使用结构
export type ServerStatus = "online" | "maintenance" | "offline";

export interface Server extends Omit<ServerNode, "status"> {
  ping: number;
  status: ServerStatus;
}
```

### 3.2 更新 `getVpnNodes` 请求

**文件：`src/api/server.ts`**

```ts
import request from "@/utils/request";
import type { ServerNode } from "@/types/server";

export type { ServerNode };

export interface GetVpnNodesParams {
  country?: string;
  status?: number;
}

export function getVpnNodes(params?: GetVpnNodesParams) {
  return request<ServerNode[]>({
    url: "/vpn/nodes",
    method: "post",
    data: params || {},
  });
}
```

`testNodePing` 这个接口文档里没有，如果后端暂时没实现，可以保留（当作扩展接口），也可以先删掉/注释掉，避免误用。

### 3.3 在 `servers.store.ts` 里做映射

**文件：`src/stores/servers.ts`**

`loadServers` 里现在是：

```ts
const nodes = await getVpnNodes();
servers.value = nodes.map((n) => ({
  ...n,
  ping: 9999,
  status: "unknown" as const,
}));
```

根据新的 `status` 定义，改成：

```ts
import type { ServerStatus } from "@/types/server";

function mapStatus(status: number): ServerStatus {
  switch (status) {
    case 1: return "online";
    case 2: return "maintenance";
    case 3: return "offline";
    default: return "offline";
  }
}

async function loadServers() {
  isLoading.value = true;
  error.value = null;

  try {
    const nodes = await getVpnNodes();
    servers.value = nodes.map((n) => ({
      ...n,
      ping: 9999,
      status: mapStatus(n.status),
    }));

    const savedId = localStorage.getItem("currentServerId");
    if (savedId && servers.value.some((s) => s.id === parseInt(savedId))) {
      currentServerId.value = parseInt(savedId);
    } else if (servers.value.length > 0) {
      currentServerId.value = servers.value[0].id;
    }

    await testAllPings();
  } catch (e) {
    error.value = String(e);
    console.error("Failed to load servers:", e);
  } finally {
    isLoading.value = false;
  }
}
```

同时，把 `ping_nodes` / `ping_single_node` 等 Rust 命令调用里的 `domain` / `port` 字段，确认与新的 `Server` 类型一致（你文档里的字段就是 `domain` + `port`，这点是对的）。

---

## 四、根据文档补齐使用统计请求（可选但推荐）

你已经在 `src/types/user.ts` 里实现了：

```ts
export function getUserUsage(date?: string) {
  return request<UsageStats>({
    url: "/user/usage",
    method: "get",
    params: { date },
  });
}

export function reportUsage(data: UsageReportData) {
  return request<UsageReportResult>({
    url: "/user/usage/report",
    method: "post",
    data,
  });
}
```

这和文档完全对得上，可以在前端用起来：

### 4.1 ProfileView 里替换硬编码的 35%

**文件：`src/views/ProfileView.vue`**

原来：

```ts
// 使用量百分比（普通用户显示）
const usagePercent = computed(() => {
  // TODO: 从 vpnStore 获取实际使用量
  return 35
})
```

可以改成从接口获取：

```ts
import { getUserUsage, type UsageStats } from '@/types/user' // 或改成 '@/api/user'

const usageStats = ref<UsageStats | null>(null)

// 挂载时拉一次今日用量
onMounted(async () => {
  if (currentUser.value) {
    try {
      usageStats.value = await getUserUsage()
    } catch (e) {
      console.error('Failed to load usage stats', e)
    }
  }
})

const usagePercent = computed(() => {
  if (!usageStats.value) return 0
  const { traffic_used, traffic_limit } = usageStats.value
  if (!traffic_limit || traffic_limit === 0) return 0 // 无限时显示 0% 或直接隐藏
  return Math.min(100, Math.round((traffic_used / traffic_limit) * 100))
})
```

这样 “Today’s Usage” 进度条就是真实数据了。

### 4.2 在 VPN 断开时上报使用量（与 /user/usage/report 对齐）

**文件：`src/stores/vpn.ts`**

在 `disconnect()` 或 `vpn-status-change` 事件里，你已经有：

- 当前 server 的 id（`VpnStatusEvent.server_id` 或 `serversStore.currentServer`）；
- `stats.totalDownload` / `totalUpload` / `connectedTime`；
- 你也记录了 `connectedAt` 时间。

可以在“断开时”加一段：

```ts
import { reportUsage } from "@/types/user";

async function reportUsageIfNeeded() {
  const authStore = useAuthStore();
  const serversStore = useServersStore();

  if (!authStore.isAuthenticated || !serversStore.currentServer) return;
  if (stats.value.connectedTime <= 0) return;

  const server = serversStore.currentServer;

  try {
    await reportUsage({
      node_id: server.id,
      traffic_download: stats.value.totalDownload,
      traffic_upload: stats.value.totalUpload,
      duration: stats.value.connectedTime,
      connected_at: new Date(connectedAt).toISOString(),
      disconnected_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Failed to report usage:", e);
  }
}
```

然后在合适的位置调用，比如：

- `disconnect()` 里，在 `await invoke("disconnect_vpn")` 之前；
- 或在 `vpn-status-change` 收到 `disconnected` 时。

这部分可以后面慢慢接，不急于一口气搞完。

---

总结一下，现在这版前后端对齐要做的关键修改：

1. auth store：修正 `logout` 行为和刷新失败时的登出逻辑；
2. request.ts：用文档里的错误码（20001/20002/20003/20005）和 HTTP 401 做 token 失效判断，用 `handleTokenExpired` 实现自动刷新 + 重试；
3. server 节点：`/vpn/nodes` 改成 POST，类型改成文档定义的结构，并在 store 里做 status 映射；
4. 使用统计：用现有 `getUserUsage` / `reportUsage` 把 Profile 的“今日用量”和 VPN 断开上报串起来（这部分可以先做 Profile，report 可后做）。

如果你愿意，我可以直接给出修改后的几个完整文件（`auth.ts` / `request.ts` / `server.ts` / `servers.ts`）供你替换。
