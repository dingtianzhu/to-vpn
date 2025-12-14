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

  const { currentServer, currentServerId, isPinging } =
    storeToRefs(serversStore);
  const { settings } = storeToRefs(settingsStore);
  const { isAuthenticated, needsLogin, hasConnectionLimit } =
    storeToRefs(authStore);

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
