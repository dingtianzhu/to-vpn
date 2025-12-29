import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { VpnSettings, ConnectionMode, DnsMode } from "@/types";
import { getItem, setItem } from "@/utils/storage";

const DEFAULT_SETTINGS: VpnSettings = {
  mtu: 1400, // 默认 MTU 值
  dnsMode: "cloudflare",
  customDns: "",
  autoReconnect: false,
  connectionMode: "socks",
  // 高级网络设置
  enableTcpFastOpen: true,  // 默认启用 TCP Fast Open
  upMbps: 500,              // 默认上行带宽限制
  downMbps: 1000,           // 默认下行带宽限制
  blockQuic: true,          // 默认阻断 QUIC
  disableIpv6: true,        // 默认禁用 IPv6（防止泄漏）
};

// 迁移旧配置，确保向后兼容
function migrateSettings(stored: Partial<VpnSettings>): VpnSettings {
  const migrated = { ...DEFAULT_SETTINGS, ...stored };
  // 移除已废弃的 killSwitch 字段
  if ('killSwitch' in migrated) {
    delete (migrated as Record<string, unknown>).killSwitch;
  }
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
  function toggleTheme() {
    theme.value = theme.value === "dark" ? "light" : "dark";
  }

  function setTheme(t: "dark" | "light") {
    theme.value = t;
  }

  function resetSettings() {
    settings.value = { ...DEFAULT_SETTINGS };
  }

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
