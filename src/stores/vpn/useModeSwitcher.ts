// src/stores/vpn/useModeSwitcher.ts
// 模式切换器模块 - 实现 SOCKS/TUN 模式平滑切换

import { ref, computed, type Ref, type ComputedRef } from "vue";
import type { VpnStatus } from "./types";
import type { ConnectionMode } from "@/types";
import { useSettingsStore } from "@/stores/settings";
import { useServersStore } from "@/stores/servers";

/**
 * 模式切换进度状态
 */
export type ModeSwitchProgress = 
  | 'idle'           // 空闲状态
  | 'saving'         // 保存当前服务器信息
  | 'disconnecting'  // 断开当前连接
  | 'switching'      // 切换模式设置
  | 'connecting'     // 使用新模式重新连接
  | 'done'           // 切换完成
  | 'failed'         // 切换失败
  | 'rolling_back';  // 回退中

/**
 * 模式切换状态
 */
export interface ModeSwitchState {
  isSwitching: boolean;
  previousMode: ConnectionMode | null;
  targetMode: ConnectionMode | null;
  progress: ModeSwitchProgress;
  error: string | null;
  savedServerId: number | null;
}

/**
 * 模式切换结果
 */
export interface ModeSwitchResult {
  success: boolean;
  error: string | null;
  finalMode: ConnectionMode;
}

/**
 * 默认模式切换状态
 */
export const DEFAULT_MODE_SWITCH_STATE: ModeSwitchState = {
  isSwitching: false,
  previousMode: null,
  targetMode: null,
  progress: 'idle',
  error: null,
  savedServerId: null,
};

/**
 * 验证连接模式是否有效
 */
export function isValidConnectionMode(mode: unknown): mode is ConnectionMode {
  return mode === 'tun' || mode === 'socks';
}

/**
 * 获取模式切换的下一个进度状态
 */
export function getNextProgress(current: ModeSwitchProgress, isConnected: boolean): ModeSwitchProgress {
  switch (current) {
    case 'idle':
      return isConnected ? 'saving' : 'switching';
    case 'saving':
      return 'disconnecting';
    case 'disconnecting':
      return 'switching';
    case 'switching':
      return 'connecting';
    case 'connecting':
      return 'done';
    case 'rolling_back':
      return 'done';
    default:
      return current;
  }
}

/**
 * 检查是否可以开始模式切换
 */
export function canStartSwitch(
  currentMode: ConnectionMode,
  targetMode: ConnectionMode,
  isSwitching: boolean
): { canSwitch: boolean; reason: string | null } {
  if (isSwitching) {
    return { canSwitch: false, reason: 'Mode switch already in progress' };
  }
  
  if (!isValidConnectionMode(targetMode)) {
    return { canSwitch: false, reason: 'Invalid target mode' };
  }
  
  if (currentMode === targetMode) {
    return { canSwitch: false, reason: 'Already in target mode' };
  }
  
  return { canSwitch: true, reason: null };
}

/**
 * 模式切换器 Composable
 * 管理 SOCKS/TUN 模式之间的平滑切换
 */
export function useModeSwitcher(
  status: Ref<VpnStatus>,
  connect: () => Promise<void>,
  disconnect: () => Promise<void>
) {
  // ============ 响应式状态 ============
  const state = ref<ModeSwitchState>({ ...DEFAULT_MODE_SWITCH_STATE });

  // ============ 计算属性 ============
  
  /**
   * 是否正在切换模式
   */
  const isSwitching: ComputedRef<boolean> = computed(() => state.value.isSwitching);

  /**
   * 当前切换进度
   */
  const progress: ComputedRef<ModeSwitchProgress> = computed(() => state.value.progress);

  /**
   * 切换错误信息
   */
  const switchError: ComputedRef<string | null> = computed(() => state.value.error);

  // ============ 核心方法 ============

  /**
   * 重置状态到初始值
   */
  function resetState(): void {
    state.value = { ...DEFAULT_MODE_SWITCH_STATE };
  }

  /**
   * 更新进度状态
   */
  function updateProgress(progress: ModeSwitchProgress, error: string | null = null): void {
    state.value.progress = progress;
    if (error) {
      state.value.error = error;
    }
  }

  /**
   * 等待 VPN 状态变为指定值
   */
  async function waitForStatus(
    targetStatus: VpnStatus,
    timeoutMs: number = 10000
  ): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      if (status.value === targetStatus) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return false;
  }

  /**
   * 切换连接模式
   * 自动处理断开-重连流程
   * 
   * @param targetMode 目标模式 ('tun' | 'socks')
   * @returns 切换结果
   */
  async function switchMode(targetMode: ConnectionMode): Promise<ModeSwitchResult> {
    const settingsStore = useSettingsStore();
    const serversStore = useServersStore();
    const currentMode = settingsStore.settings.connectionMode;
    
    // 检查是否可以切换
    const { canSwitch, reason } = canStartSwitch(currentMode, targetMode, state.value.isSwitching);
    if (!canSwitch) {
      return {
        success: false,
        error: reason,
        finalMode: currentMode,
      };
    }

    // 初始化切换状态
    state.value = {
      isSwitching: true,
      previousMode: currentMode,
      targetMode: targetMode,
      progress: 'idle',
      error: null,
      savedServerId: serversStore.currentServerId,
    };

    const wasConnected = status.value === 'connected' || status.value === 'connecting';

    try {
      // 步骤 1: 如果已连接，保存服务器信息并断开
      if (wasConnected) {
        updateProgress('saving');
        state.value.savedServerId = serversStore.currentServerId;
        
        updateProgress('disconnecting');
        await disconnect();
        
        // 等待断开完成
        const disconnected = await waitForStatus('disconnected', 10000);
        if (!disconnected) {
          throw new Error('Failed to disconnect: timeout');
        }
      }

      // 步骤 2: 切换模式设置
      updateProgress('switching');
      settingsStore.setConnectionMode(targetMode);
      
      // 短暂等待设置生效
      await new Promise(resolve => setTimeout(resolve, 100));

      // 步骤 3: 如果之前已连接，使用新模式重新连接
      if (wasConnected && state.value.savedServerId) {
        updateProgress('connecting');
        
        // 确保使用之前的服务器
        serversStore.currentServerId = state.value.savedServerId;
        
        await connect();
        
        // 等待连接完成 (最多等待 15 秒)
        const connected = await waitForStatus('connected', 15000);
        if (!connected && status.value !== 'connecting') {
          throw new Error('Failed to reconnect with new mode');
        }
      }

      // 切换成功
      updateProgress('done');
      state.value.isSwitching = false;
      
      return {
        success: true,
        error: null,
        finalMode: targetMode,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      updateProgress('failed', errorMessage);
      
      // 尝试回退
      const rollbackResult = await rollback();
      
      return {
        success: false,
        error: errorMessage,
        finalMode: rollbackResult.success ? currentMode : targetMode,
      };
    }
  }

  /**
   * 回退到原模式
   * 在切换失败时调用
   */
  async function rollback(): Promise<ModeSwitchResult> {
    const settingsStore = useSettingsStore();
    const serversStore = useServersStore();
    const previousMode = state.value.previousMode;
    
    if (!previousMode) {
      state.value.isSwitching = false;
      return {
        success: false,
        error: 'No previous mode to rollback to',
        finalMode: settingsStore.settings.connectionMode,
      };
    }

    updateProgress('rolling_back');

    try {
      // 确保先断开当前连接
      if (status.value === 'connected' || status.value === 'connecting') {
        await disconnect();
        await waitForStatus('disconnected', 5000);
      }

      // 恢复原模式
      settingsStore.setConnectionMode(previousMode);
      
      // 如果之前有保存的服务器，尝试重新连接
      if (state.value.savedServerId) {
        serversStore.currentServerId = state.value.savedServerId;
        
        await connect();
        await waitForStatus('connected', 15000);
      }

      updateProgress('done');
      state.value.isSwitching = false;
      
      return {
        success: true,
        error: null,
        finalMode: previousMode,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      state.value.error = `Rollback failed: ${errorMessage}`;
      state.value.isSwitching = false;
      updateProgress('failed', state.value.error);
      
      return {
        success: false,
        error: state.value.error,
        finalMode: settingsStore.settings.connectionMode,
      };
    }
  }

  /**
   * 取消切换 (如果可能)
   */
  function cancelSwitch(): void {
    if (!state.value.isSwitching) return;
    
    // 只有在某些阶段可以取消
    if (state.value.progress === 'idle' || state.value.progress === 'saving') {
      resetState();
    }
    // 其他阶段无法安全取消，需要等待完成或回退
  }

  /**
   * 获取当前状态快照
   */
  function getStateSnapshot(): ModeSwitchState {
    return { ...state.value };
  }

  /**
   * 清理资源
   */
  function cleanup(): void {
    resetState();
  }

  return {
    // 状态
    state,
    
    // 计算属性
    isSwitching,
    progress,
    switchError,
    
    // 方法
    switchMode,
    rollback,
    cancelSwitch,
    resetState,
    getStateSnapshot,
    cleanup,
  };
}
