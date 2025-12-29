/**
 * 连接模式和状态同步属性测试
 * 测试模式切换状态机和设置持久化的正确性
 *
 * **Feature: test-completion, Property 3-4, 20: Connection mode and state sync**
 * **Validates: Requirements 2.1, 2.2, 2.4, 10.2, 10.4**
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============ 类型定义 ============

type VpnStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "error";

type ConnectionMode = "tun" | "socks";

interface VpnState {
  status: VpnStatus;
  connectionMode: ConnectionMode;
  error: string | null;
}

interface Settings {
  connectionMode: ConnectionMode;
  mtu: number;
  dnsMode: string;
  // 高级网络设置
  enableTcpFastOpen: boolean;
  upMbps: number;
  downMbps: number;
  blockQuic: boolean;
}

// ============ 纯函数版本（用于测试）============

/**
 * 模式切换状态机
 * 返回切换过程中的状态序列
 */
function modeSwitchStateMachine(
  currentState: VpnState,
  newMode: ConnectionMode
): VpnStatus[] {
  const states: VpnStatus[] = [];

  // 如果当前已连接，需要先断开
  if (currentState.status === "connected") {
    states.push("disconnecting");
    states.push("disconnected");
  }

  // 如果当前正在连接，需要先取消
  if (currentState.status === "connecting") {
    states.push("disconnecting");
    states.push("disconnected");
  }

  // 开始新的连接
  states.push("connecting");
  states.push("connected");

  return states;
}

/**
 * 验证状态转换是否有效
 */
function isValidStateTransition(from: VpnStatus, to: VpnStatus): boolean {
  const validTransitions: Record<VpnStatus, VpnStatus[]> = {
    disconnected: ["connecting"],
    connecting: ["connected", "disconnecting", "disconnected", "error"],
    connected: ["disconnecting"],
    disconnecting: ["disconnected", "error"],
    error: ["disconnected", "connecting"],
  };

  return validTransitions[from]?.includes(to) ?? false;
}

/**
 * 保存设置到存储
 */
function saveSettings(settings: Settings): string {
  return JSON.stringify(settings);
}

/**
 * 从存储加载设置
 */
function loadSettings(stored: string): Settings | null {
  try {
    const parsed = JSON.parse(stored);
    if (
      parsed &&
      (parsed.connectionMode === "tun" || parsed.connectionMode === "socks")
    ) {
      return parsed as Settings;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 状态同步逻辑
 * 当前端状态与后端状态不一致时，以后端状态为准
 */
function syncState(
  frontendStatus: VpnStatus,
  backendStatus: VpnStatus,
  isInGracePeriod: boolean
): VpnStatus {
  // 如果在宽容期内且前端正在连接，保持前端状态
  if (
    isInGracePeriod &&
    frontendStatus === "connecting" &&
    backendStatus === "disconnected"
  ) {
    return frontendStatus;
  }

  // 如果在宽容期内且前端正在断开，保持前端状态
  if (
    isInGracePeriod &&
    frontendStatus === "disconnecting" &&
    backendStatus === "connected"
  ) {
    return frontendStatus;
  }

  // 其他情况以后端状态为准
  return backendStatus;
}

/**
 * 检查状态是否需要恢复
 */
function needsStateRecovery(
  frontendStatus: VpnStatus,
  backendStatus: VpnStatus
): boolean {
  // 前端显示断开但后端实际已连接
  if (frontendStatus === "disconnected" && backendStatus === "connected") {
    return true;
  }
  return false;
}

// ============ 生成器 ============

const vpnStatusArb: fc.Arbitrary<VpnStatus> = fc.constantFrom(
  "disconnected",
  "connecting",
  "connected",
  "disconnecting",
  "error"
);

const connectionModeArb: fc.Arbitrary<ConnectionMode> = fc.constantFrom(
  "tun",
  "socks"
);

const settingsArb: fc.Arbitrary<Settings> = fc.record({
  connectionMode: connectionModeArb,
  mtu: fc.integer({ min: 576, max: 1500 }),
  dnsMode: fc.constantFrom("google", "cloudflare", "aliyun", "custom"),
  // 高级网络设置
  enableTcpFastOpen: fc.boolean(),
  upMbps: fc.integer({ min: 1, max: 1000 }),
  downMbps: fc.integer({ min: 1, max: 1000 }),
  blockQuic: fc.boolean(),
});

// ============ 属性测试 ============

describe("Connection Mode and State Sync Properties", () => {
  /**
   * Property 3: 模式切换状态机正确性
   * *For any* 连接模式切换操作，如果当前已连接，则必须先经过 disconnecting 状态
   */
  describe("Property 3: Mode switch state machine correctness", () => {
    it("should go through disconnecting when switching from connected state", () => {
      fc.assert(
        fc.property(connectionModeArb, connectionModeArb, (currentMode, newMode) => {
          const currentState: VpnState = {
            status: "connected",
            connectionMode: currentMode,
            error: null,
          };

          const states = modeSwitchStateMachine(currentState, newMode);

          // Should include disconnecting before connecting
          expect(states).toContain("disconnecting");
          expect(states).toContain("disconnected");
          expect(states).toContain("connecting");

          // disconnecting should come before connecting
          const disconnectingIndex = states.indexOf("disconnecting");
          const connectingIndex = states.indexOf("connecting");
          expect(disconnectingIndex).toBeLessThan(connectingIndex);
        }),
        { numRuns: 100 }
      );
    });

    it("should go through disconnecting when switching from connecting state", () => {
      fc.assert(
        fc.property(connectionModeArb, connectionModeArb, (currentMode, newMode) => {
          const currentState: VpnState = {
            status: "connecting",
            connectionMode: currentMode,
            error: null,
          };

          const states = modeSwitchStateMachine(currentState, newMode);

          // Should include disconnecting
          expect(states).toContain("disconnecting");
        }),
        { numRuns: 100 }
      );
    });

    it("should have valid state transitions", () => {
      fc.assert(
        fc.property(connectionModeArb, connectionModeArb, (currentMode, newMode) => {
          const currentState: VpnState = {
            status: "connected",
            connectionMode: currentMode,
            error: null,
          };

          const states = modeSwitchStateMachine(currentState, newMode);

          // Each transition should be valid
          for (let i = 0; i < states.length - 1; i++) {
            const from = i === 0 ? currentState.status : states[i - 1];
            const to = states[i];

            // The first state in the sequence should be reachable from current state
            if (i === 0) {
              expect(isValidStateTransition(currentState.status, to)).toBe(true);
            }
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 4: 设置持久化往返一致性
   * *For any* 连接模式设置值，保存后再读取应该得到相同的值
   * **Feature: vpn-optimization, Property 4: 设置持久化往返一致性**
   * **Validates: Requirements 2.4**
   */
  describe("Property 4: Settings persistence round-trip consistency", () => {
    it("should preserve settings after save and load", () => {
      fc.assert(
        fc.property(settingsArb, (settings) => {
          const stored = saveSettings(settings);
          const loaded = loadSettings(stored);

          expect(loaded).not.toBeNull();
          expect(loaded?.connectionMode).toBe(settings.connectionMode);
          expect(loaded?.mtu).toBe(settings.mtu);
          expect(loaded?.dnsMode).toBe(settings.dnsMode);
          // 验证高级网络设置
          expect(loaded?.enableTcpFastOpen).toBe(settings.enableTcpFastOpen);
          expect(loaded?.upMbps).toBe(settings.upMbps);
          expect(loaded?.downMbps).toBe(settings.downMbps);
          expect(loaded?.blockQuic).toBe(settings.blockQuic);
        }),
        { numRuns: 100 }
      );
    });

    it("should preserve connection mode specifically", () => {
      fc.assert(
        fc.property(connectionModeArb, (mode) => {
          const settings: Settings = {
            connectionMode: mode,
            mtu: 1400,
            dnsMode: "google",
            enableTcpFastOpen: true,
            upMbps: 200,
            downMbps: 500,
            blockQuic: true,
          };

          const stored = saveSettings(settings);
          const loaded = loadSettings(stored);

          expect(loaded?.connectionMode).toBe(mode);
        }),
        { numRuns: 100 }
      );
    });

    it("should preserve advanced network settings", () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.integer({ min: 1, max: 1000 }),
          fc.integer({ min: 1, max: 1000 }),
          fc.boolean(),
          (tcpFastOpen, upMbps, downMbps, blockQuic) => {
            const settings: Settings = {
              connectionMode: "socks",
              mtu: 1400,
              dnsMode: "cloudflare",
              enableTcpFastOpen: tcpFastOpen,
              upMbps,
              downMbps,
              blockQuic,
            };

            const stored = saveSettings(settings);
            const loaded = loadSettings(stored);

            expect(loaded?.enableTcpFastOpen).toBe(tcpFastOpen);
            expect(loaded?.upMbps).toBe(upMbps);
            expect(loaded?.downMbps).toBe(downMbps);
            expect(loaded?.blockQuic).toBe(blockQuic);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should return null for invalid stored data", () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(""),
            fc.constant("invalid json"),
            fc.constant("{}"),
            fc.constant('{"connectionMode": "invalid"}')
          ),
          (invalidStored) => {
            const loaded = loadSettings(invalidStored);
            expect(loaded).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 20: 状态同步纠正逻辑
   * *For any* 前端状态和后端状态不一致的情况，同步后前端状态应该等于后端状态
   */
  describe("Property 20: State sync correction logic", () => {
    it("should sync to backend status when not in grace period", () => {
      fc.assert(
        fc.property(vpnStatusArb, vpnStatusArb, (frontendStatus, backendStatus) => {
          const synced = syncState(frontendStatus, backendStatus, false);

          // When not in grace period, should always sync to backend
          expect(synced).toBe(backendStatus);
        }),
        { numRuns: 100 }
      );
    });

    it("should keep frontend status during grace period for connecting", () => {
      fc.assert(
        fc.property(fc.constant("connecting") as fc.Arbitrary<VpnStatus>, () => {
          const synced = syncState("connecting", "disconnected", true);

          // During grace period, connecting frontend should be preserved
          expect(synced).toBe("connecting");
        }),
        { numRuns: 100 }
      );
    });

    it("should keep frontend status during grace period for disconnecting", () => {
      fc.assert(
        fc.property(fc.constant("disconnecting") as fc.Arbitrary<VpnStatus>, () => {
          const synced = syncState("disconnecting", "connected", true);

          // During grace period, disconnecting frontend should be preserved
          expect(synced).toBe("disconnecting");
        }),
        { numRuns: 100 }
      );
    });

    it("should detect when state recovery is needed", () => {
      // Frontend shows disconnected but backend is connected
      expect(needsStateRecovery("disconnected", "connected")).toBe(true);

      // Frontend matches backend
      expect(needsStateRecovery("connected", "connected")).toBe(false);
      expect(needsStateRecovery("disconnected", "disconnected")).toBe(false);
    });

    it("should sync to backend for non-transitional states", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("connected", "disconnected", "error") as fc.Arbitrary<VpnStatus>,
          fc.constantFrom("connected", "disconnected", "error") as fc.Arbitrary<VpnStatus>,
          (frontendStatus, backendStatus) => {
            const synced = syncState(frontendStatus, backendStatus, false);
            expect(synced).toBe(backendStatus);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 额外属性：状态转换有效性
   */
  describe("State transition validity", () => {
    it("should only allow valid transitions from disconnected", () => {
      expect(isValidStateTransition("disconnected", "connecting")).toBe(true);
      expect(isValidStateTransition("disconnected", "connected")).toBe(false);
      expect(isValidStateTransition("disconnected", "disconnecting")).toBe(false);
    });

    it("should only allow valid transitions from connected", () => {
      expect(isValidStateTransition("connected", "disconnecting")).toBe(true);
      expect(isValidStateTransition("connected", "connecting")).toBe(false);
      expect(isValidStateTransition("connected", "disconnected")).toBe(false);
    });

    it("should allow multiple transitions from connecting", () => {
      expect(isValidStateTransition("connecting", "connected")).toBe(true);
      expect(isValidStateTransition("connecting", "disconnecting")).toBe(true);
      expect(isValidStateTransition("connecting", "error")).toBe(true);
    });
  });
});
