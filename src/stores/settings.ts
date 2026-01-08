import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { VpnSettings, ConnectionMode, DnsMode, RouteMode, TunStack } from "@/types";
import { getItem, setItem } from "@/utils/storage";

const DEFAULT_SETTINGS: VpnSettings = {
  mtu: 1400, // 默认 MTU 值
  dnsMode: "cloudflare",
  customDns: "",
  autoReconnect: false,
  connectionMode: "socks",
  // 高级网络设置
  upMbps: 500,              // 默认上行带宽限制
  downMbps: 1000,           // 默认下行带宽限制
  blockQuic: true,          // 默认阻断 QUIC
  disableIpv6: true,        // 默认禁用 IPv6（防止泄漏）
  
  // P0: 代理端口配置
  socksPort: 1080,          // 默认 SOCKS 代理端口
  httpPort: 1087,           // 默认 HTTP 代理端口
  
  // P0: Kill Switch (网络锁)
  killSwitch: false,        // 默认关闭 Kill Switch
  
  // P0: 路由模式
  routeMode: "rule",        // 默认规则模式
  
  // P1: DNS 泄漏防护
  dnsLeakProtection: true,  // 默认启用 DNS 泄漏防护
  
  // P1: 自定义域名
  customBypassDomains: [],  // 直连域名列表
  customProxyDomains: [],   // 强制代理域名列表
  
  // P2: WebRTC 阻断
  blockWebRTC: true,        // 默认启用 WebRTC 阻断
  
  // P2: 分应用代理
  excludedApps: [],         // 排除的应用
  forcedProxyApps: [],      // 强制代理的应用
  
  // P3: TUN 网络栈
  tunStack: "gvisor",       // 默认 gvisor 网络栈
  
  // 绕过局域网
  bypassLan: true,          // 默认绕过局域网
};

// 迁移旧配置，确保向后兼容
function migrateSettings(stored: Partial<VpnSettings>): VpnSettings {
  const migrated = { ...DEFAULT_SETTINGS, ...stored };
  
  // 确保新字段有默认值（向后兼容）
  if (migrated.socksPort === undefined) migrated.socksPort = DEFAULT_SETTINGS.socksPort;
  if (migrated.httpPort === undefined) migrated.httpPort = DEFAULT_SETTINGS.httpPort;
  if (migrated.killSwitch === undefined) migrated.killSwitch = DEFAULT_SETTINGS.killSwitch;
  if (migrated.routeMode === undefined) migrated.routeMode = DEFAULT_SETTINGS.routeMode;
  if (migrated.dnsLeakProtection === undefined) migrated.dnsLeakProtection = DEFAULT_SETTINGS.dnsLeakProtection;
  if (migrated.customBypassDomains === undefined) migrated.customBypassDomains = DEFAULT_SETTINGS.customBypassDomains;
  if (migrated.customProxyDomains === undefined) migrated.customProxyDomains = DEFAULT_SETTINGS.customProxyDomains;
  if (migrated.blockWebRTC === undefined) migrated.blockWebRTC = DEFAULT_SETTINGS.blockWebRTC;
  if (migrated.excludedApps === undefined) migrated.excludedApps = DEFAULT_SETTINGS.excludedApps;
  if (migrated.forcedProxyApps === undefined) migrated.forcedProxyApps = DEFAULT_SETTINGS.forcedProxyApps;
  if (migrated.tunStack === undefined) migrated.tunStack = DEFAULT_SETTINGS.tunStack;
  if (migrated.bypassLan === undefined) migrated.bypassLan = DEFAULT_SETTINGS.bypassLan;
  
  return migrated;
}

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<VpnSettings>(migrateSettings(getItem("settings", DEFAULT_SETTINGS)));
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

  // 应用主题到 DOM
  function applyTheme(t: "dark" | "light") {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(t);
    // 同时更新 body 背景色确保无闪烁
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

  function setRouteMode(mode: RouteMode) {
    settings.value.routeMode = mode;
  }

  function setTunStack(stack: TunStack) {
    settings.value.tunStack = stack;
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

  // 分区重置功能
  function resetProxyPortSettings() {
    settings.value.socksPort = DEFAULT_SETTINGS.socksPort;
    settings.value.httpPort = DEFAULT_SETTINGS.httpPort;
  }

  function resetSecuritySettings() {
    settings.value.killSwitch = DEFAULT_SETTINGS.killSwitch;
    settings.value.dnsLeakProtection = DEFAULT_SETTINGS.dnsLeakProtection;
    settings.value.blockWebRTC = DEFAULT_SETTINGS.blockWebRTC;
  }

  function resetRoutingSettings() {
    settings.value.routeMode = DEFAULT_SETTINGS.routeMode;
    settings.value.customBypassDomains = [...DEFAULT_SETTINGS.customBypassDomains];
    settings.value.customProxyDomains = [...DEFAULT_SETTINGS.customProxyDomains];
    settings.value.excludedApps = [...DEFAULT_SETTINGS.excludedApps];
    settings.value.forcedProxyApps = [...DEFAULT_SETTINGS.forcedProxyApps];
    settings.value.bypassLan = DEFAULT_SETTINGS.bypassLan;
  }

  function resetAdvancedSettings() {
    settings.value.tunStack = DEFAULT_SETTINGS.tunStack;
    settings.value.mtu = DEFAULT_SETTINGS.mtu;
    settings.value.upMbps = DEFAULT_SETTINGS.upMbps;
    settings.value.downMbps = DEFAULT_SETTINGS.downMbps;
    settings.value.blockQuic = DEFAULT_SETTINGS.blockQuic;
    settings.value.disableIpv6 = DEFAULT_SETTINGS.disableIpv6;
  }

  return {
    settings,
    theme,
    updateSettings,
    setConnectionMode,
    setDnsMode,
    setRouteMode,
    setTunStack,
    toggleTheme,
    setTheme,
    resetSettings,
    resetProxyPortSettings,
    resetSecuritySettings,
    resetRoutingSettings,
    resetAdvancedSettings,
  };
});
