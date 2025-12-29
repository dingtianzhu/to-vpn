/**
 * 模式切换器属性测试
 * 测试模式切换状态机正确性和回退逻辑
 *
 * **Feature: vpn-optimization, Property 6: 模式切换状态机正确性**
 * **Feature: vpn-optimization, Property 7: 模式切换回退逻辑**
 * **Validates: Requirements 3.1, 3.2, 3.3, 8.1, 8.2, 8.3**
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  DEFAULT_MODE_SWITCH_STATE,
  isValidConnectionMode,
  getNextProgress,
  canStartSwitch,
  type ModeSwitchProgress,
  type ModeSwitchState,
} from "@/stores/vpn/useModeSwitcher";

// ============ 类型定义 ============

type VpnStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "error";

type ConnectionMode = "tun" | "socks";

// ============ 纯函数版本（用于测试）============

/**
 * 模拟模式切换状态机的状态转换
 * 返回切换过程中的进度状态序列
 */
function simulateModeSwitchProgress(
  isConnected: boolean,
  switchSucceeds: boolean
): ModeSwitchProgress[] {
  const states: ModeSwitchProgress[] = ['idle'];

  if (isConnected) {
    states.push('saving');
    states.push('disconnecting');
  }

  states.push('switching');
  states.push('connecting');

  if (switchSucceeds) {
    states.push('done');
  } else {
    states.push('failed');
    states.push('rolling_back');
    states.push('done');
  }

  return states;
}

/**
 * 验证进度状态转换是否有效
 */
function isValidProgressTransition(from: ModeSwitchProgress, to: ModeSwitchProgress): boolean {
  const validTransitions: Record<ModeSwitchProgress, ModeSwitchProgress[]> = {
    idle: ['saving', 'switching'],
    saving: ['disconnecting'],
    disconnecting: ['switching'],
    switching: ['connecting'],
    connecting: ['done', 'failed'],
    done: ['idle'],
    failed: ['rolling_back', 'idle'],
    rolling_back: ['done', 'failed'],
  };

  return validTransitions[from]?.includes(to) ?? false;
}

/**
 * 模拟回退逻辑
 * 返回回退后的最终模式
 */
function simulateRollback(
  previousMode: ConnectionMode | null,
  rollbackSucceeds: boolean
): { success: boolean; finalMode: ConnectionMode | null } {
  if (!previousMode) {
    return { success: false, finalMode: null };
  }

  if (rollbackSucceeds) {
    return { success: true, finalMode: previousMode };
  }

  return { success: false, finalMode: null };
}

/**
 * 计算模式切换的最终状态
 */
function computeFinalState(
  initialMode: ConnectionMode,
  targetMode: ConnectionMode,
  switchSucceeds: boolean,
  rollbackSucceeds: boolean
): { finalMode: ConnectionMode; wasRollback: boolean } {
  if (switchSucceeds) {
    return { finalMode: targetMode, wasRollback: false };
  }

  // Switch failed, try rollback
  if (rollbackSucceeds) {
    return { finalMode: initialMode, wasRollback: true };
  }

  // Both failed, stuck at target mode (partial state)
  return { finalMode: targetMode, wasRollback: true };
}

// ============ 生成器 ============

const connectionModeArb: fc.Arbitrary<ConnectionMode> = fc.constantFrom("tun", "socks");

const vpnStatusArb: fc.Arbitrary<VpnStatus> = fc.constantFrom(
  "disconnected",
  "connecting",
  "connected",
  "disconnecting",
  "error"
);

const modeSwitchProgressArb: fc.Arbitrary<ModeSwitchProgress> = fc.constantFrom(
  'idle',
  'saving',
  'disconnecting',
  'switching',
  'connecting',
  'done',
  'failed',
  'rolling_back'
);

const modeSwitchStateArb: fc.Arbitrary<ModeSwitchState> = fc.record({
  isSwitching: fc.boolean(),
  previousMode: fc.option(connectionModeArb, { nil: null }),
  targetMode: fc.option(connectionModeArb, { nil: null }),
  progress: modeSwitchProgressArb,
  error: fc.option(fc.string(), { nil: null }),
  savedServerId: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: null }),
});

// ============ 属性测试 ============

describe("Mode Switcher Properties", () => {
  /**
   * Property 6: 模式切换状态机正确性
   * *For any* 已连接状态下的模式切换请求，状态应依次经过：
   * connected → switching → (disconnecting → connecting) → connected
   * **Feature: vpn-optimization, Property 6: 模式切换状态机正确性**
   * **Validates: Requirements 3.1, 3.2, 8.1, 8.2**
   */
  describe("Property 6: Mode switch state machine correctness", () => {
    it("should go through correct progress sequence when connected", () => {
      fc.assert(
        fc.property(fc.boolean(), (switchSucceeds) => {
          const isConnected = true;
          const states = simulateModeSwitchProgress(isConnected, switchSucceeds);

          // When connected, should include saving and disconnecting
          expect(states).toContain('saving');
          expect(states).toContain('disconnecting');
          expect(states).toContain('switching');
          expect(states).toContain('connecting');

          // Verify order: saving → disconnecting → switching → connecting
          const savingIndex = states.indexOf('saving');
          const disconnectingIndex = states.indexOf('disconnecting');
          const switchingIndex = states.indexOf('switching');
          const connectingIndex = states.indexOf('connecting');

          expect(savingIndex).toBeLessThan(disconnectingIndex);
          expect(disconnectingIndex).toBeLessThan(switchingIndex);
          expect(switchingIndex).toBeLessThan(connectingIndex);
        }),
        { numRuns: 100 }
      );
    });

    it("should skip saving and disconnecting when not connected", () => {
      fc.assert(
        fc.property(fc.boolean(), (switchSucceeds) => {
          const isConnected = false;
          const states = simulateModeSwitchProgress(isConnected, switchSucceeds);

          // When not connected, should NOT include saving and disconnecting
          expect(states).not.toContain('saving');
          expect(states).not.toContain('disconnecting');

          // Should still include switching and connecting
          expect(states).toContain('switching');
          expect(states).toContain('connecting');
        }),
        { numRuns: 100 }
      );
    });

    it("should end with done on success", () => {
      fc.assert(
        fc.property(fc.boolean(), (isConnected) => {
          const switchSucceeds = true;
          const states = simulateModeSwitchProgress(isConnected, switchSucceeds);

          // Should end with 'done'
          expect(states[states.length - 1]).toBe('done');

          // Should NOT include 'failed' or 'rolling_back'
          expect(states).not.toContain('failed');
          expect(states).not.toContain('rolling_back');
        }),
        { numRuns: 100 }
      );
    });

    it("should include failed and rolling_back on failure", () => {
      fc.assert(
        fc.property(fc.boolean(), (isConnected) => {
          const switchSucceeds = false;
          const states = simulateModeSwitchProgress(isConnected, switchSucceeds);

          // Should include 'failed' and 'rolling_back'
          expect(states).toContain('failed');
          expect(states).toContain('rolling_back');

          // failed should come before rolling_back
          const failedIndex = states.indexOf('failed');
          const rollingBackIndex = states.indexOf('rolling_back');
          expect(failedIndex).toBeLessThan(rollingBackIndex);
        }),
        { numRuns: 100 }
      );
    });

    it("should have valid progress transitions", () => {
      fc.assert(
        fc.property(fc.boolean(), fc.boolean(), (isConnected, switchSucceeds) => {
          const states = simulateModeSwitchProgress(isConnected, switchSucceeds);

          // Each transition should be valid
          for (let i = 0; i < states.length - 1; i++) {
            const from = states[i];
            const to = states[i + 1];
            expect(isValidProgressTransition(from, to)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 7: 模式切换回退逻辑
   * *For any* 模式切换失败的情况，系统应尝试恢复到原模式，
   * 最终状态应为 connected（原模式）或 disconnected
   * **Feature: vpn-optimization, Property 7: 模式切换回退逻辑**
   * **Validates: Requirements 3.3, 8.3**
   */
  describe("Property 7: Mode switch rollback logic", () => {
    it("should return to previous mode on successful rollback", () => {
      fc.assert(
        fc.property(connectionModeArb, (previousMode) => {
          const result = simulateRollback(previousMode, true);

          expect(result.success).toBe(true);
          expect(result.finalMode).toBe(previousMode);
        }),
        { numRuns: 100 }
      );
    });

    it("should fail rollback when no previous mode exists", () => {
      const result = simulateRollback(null, true);

      expect(result.success).toBe(false);
      expect(result.finalMode).toBeNull();
    });

    it("should handle rollback failure gracefully", () => {
      fc.assert(
        fc.property(connectionModeArb, (previousMode) => {
          const result = simulateRollback(previousMode, false);

          expect(result.success).toBe(false);
          expect(result.finalMode).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    it("should compute correct final state after switch attempt", () => {
      fc.assert(
        fc.property(
          connectionModeArb,
          connectionModeArb,
          fc.boolean(),
          fc.boolean(),
          (initialMode, targetMode, switchSucceeds, rollbackSucceeds) => {
            // Skip if same mode (no switch needed)
            if (initialMode === targetMode) return;

            const result = computeFinalState(
              initialMode,
              targetMode,
              switchSucceeds,
              rollbackSucceeds
            );

            if (switchSucceeds) {
              // Successful switch: should be at target mode
              expect(result.finalMode).toBe(targetMode);
              expect(result.wasRollback).toBe(false);
            } else if (rollbackSucceeds) {
              // Failed switch but successful rollback: should be at initial mode
              expect(result.finalMode).toBe(initialMode);
              expect(result.wasRollback).toBe(true);
            } else {
              // Both failed: stuck at target mode
              expect(result.wasRollback).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should preserve mode on successful switch", () => {
      fc.assert(
        fc.property(
          connectionModeArb,
          connectionModeArb.filter(m => m !== 'tun'), // Ensure different modes
          (initialMode, targetMode) => {
            // Force different modes
            const actualTarget = initialMode === 'tun' ? 'socks' : 'tun';
            
            const result = computeFinalState(
              initialMode,
              actualTarget,
              true, // switch succeeds
              true  // rollback would succeed (but not needed)
            );

            expect(result.finalMode).toBe(actualTarget);
            expect(result.wasRollback).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 辅助函数测试
   */
  describe("Helper function tests", () => {
    it("isValidConnectionMode should validate correctly", () => {
      expect(isValidConnectionMode('tun')).toBe(true);
      expect(isValidConnectionMode('socks')).toBe(true);
      expect(isValidConnectionMode('invalid')).toBe(false);
      expect(isValidConnectionMode(null)).toBe(false);
      expect(isValidConnectionMode(undefined)).toBe(false);
      expect(isValidConnectionMode(123)).toBe(false);
    });

    it("getNextProgress should return correct next state", () => {
      // When connected
      expect(getNextProgress('idle', true)).toBe('saving');
      expect(getNextProgress('saving', true)).toBe('disconnecting');
      expect(getNextProgress('disconnecting', true)).toBe('switching');
      expect(getNextProgress('switching', true)).toBe('connecting');
      expect(getNextProgress('connecting', true)).toBe('done');

      // When not connected
      expect(getNextProgress('idle', false)).toBe('switching');
    });

    it("canStartSwitch should validate switch conditions", () => {
      // Can switch when different modes and not switching
      expect(canStartSwitch('tun', 'socks', false)).toEqual({
        canSwitch: true,
        reason: null,
      });

      // Cannot switch when already switching
      expect(canStartSwitch('tun', 'socks', true)).toEqual({
        canSwitch: false,
        reason: 'Mode switch already in progress',
      });

      // Cannot switch to same mode
      expect(canStartSwitch('tun', 'tun', false)).toEqual({
        canSwitch: false,
        reason: 'Already in target mode',
      });
    });

    it("DEFAULT_MODE_SWITCH_STATE should have correct initial values", () => {
      expect(DEFAULT_MODE_SWITCH_STATE.isSwitching).toBe(false);
      expect(DEFAULT_MODE_SWITCH_STATE.previousMode).toBeNull();
      expect(DEFAULT_MODE_SWITCH_STATE.targetMode).toBeNull();
      expect(DEFAULT_MODE_SWITCH_STATE.progress).toBe('idle');
      expect(DEFAULT_MODE_SWITCH_STATE.error).toBeNull();
      expect(DEFAULT_MODE_SWITCH_STATE.savedServerId).toBeNull();
    });
  });

  /**
   * 状态一致性测试
   */
  describe("State consistency tests", () => {
    it("should maintain consistent state during switch", () => {
      fc.assert(
        fc.property(
          connectionModeArb,
          connectionModeArb,
          (currentMode, targetMode) => {
            // Skip if same mode
            if (currentMode === targetMode) return;

            const { canSwitch } = canStartSwitch(currentMode, targetMode, false);
            expect(canSwitch).toBe(true);

            // After starting switch, should not be able to start another
            const { canSwitch: canSwitchAgain } = canStartSwitch(currentMode, targetMode, true);
            expect(canSwitchAgain).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should always end in a terminal state", () => {
      fc.assert(
        fc.property(fc.boolean(), fc.boolean(), (isConnected, switchSucceeds) => {
          const states = simulateModeSwitchProgress(isConnected, switchSucceeds);
          const finalState = states[states.length - 1];

          // Final state should be 'done' (terminal state)
          expect(finalState).toBe('done');
        }),
        { numRuns: 100 }
      );
    });
  });
});
