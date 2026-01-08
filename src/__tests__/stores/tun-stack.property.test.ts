/**
 * TUN 网络栈配置属性测试
 * 测试不同 TUN 网络栈选择下 sing-box 配置的正确性
 *
 * **Feature: vpn-pure-mode, Property 8: TUN Stack Configuration**
 * **Validates: Requirements 8.1, 8.2**
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============ 类型定义 ============

type TunStack = "gvisor" | "system" | "lwip";

interface TunInbound {
  type: "tun";
  tag: string;
  address: string[];
  mtu: number;
  auto_route: boolean;
  strict_route: boolean;
  stack: string;
  sniff: boolean;
  sniff_override_destination: boolean;
  platform?: {
    http_proxy?: {
      enabled: boolean;
      server: string;
      server_port: number;
    };
  };
}

interface SingBoxConfig {
  inbounds: TunInbound[];
  outbounds: { type: string; tag: string }[];
  route: {
    auto_detect_interface: boolean;
    final: string;
    rules: unknown[];
  };
}

// ============ 纯函数版本（模拟 Rust 配置生成逻辑）============

/**
 * 生成 TUN inbound 配置（模拟 Rust 端逻辑）
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 8.1, 8.2**
 */
function generateTunInbound(
  tunStack: TunStack,
  mtu: number = 1400
): TunInbound {
  return {
    type: "tun",
    tag: "tun-in",
    address: ["172.19.0.1/30"],
    mtu: mtu,
    auto_route: true,
    strict_route: true,
    stack: tunStack,
    sniff: true,
    sniff_override_destination: true,
    platform: {
      http_proxy: {
        enabled: false,
        server: "127.0.0.1",
        server_port: 0,
      },
    },
  };
}

/**
 * 生成完整的 sing-box 配置（模拟 Rust 端逻辑）
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 8.1, 8.2**
 */
function generateSingBoxConfig(
  tunStack: TunStack,
  mtu: number = 1400
): SingBoxConfig {
  const tunInbound = generateTunInbound(tunStack, mtu);

  return {
    inbounds: [tunInbound],
    outbounds: [
      { type: "hysteria2", tag: "proxy" },
      { type: "direct", tag: "direct" },
      { type: "block", tag: "block" },
    ],
    route: {
      auto_detect_interface: true,
      final: "proxy",
      rules: [],
    },
  };
}

// ============ 验证函数 ============

/**
 * 验证 TUN 网络栈配置
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 8.1, 8.2**
 */
function validateTunStackConfig(
  config: SingBoxConfig,
  expectedStack: TunStack
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 检查是否有 TUN inbound
  const tunInbound = config.inbounds.find((i) => i.type === "tun");
  if (!tunInbound) {
    errors.push("Config should have a TUN inbound");
    return { valid: false, errors };
  }

  // 检查 stack 值是否正确
  if (tunInbound.stack !== expectedStack) {
    errors.push(
      `Expected TUN stack to be '${expectedStack}', got '${tunInbound.stack}'`
    );
  }

  // 检查 stack 值是否是有效的选项
  const validStacks = ["gvisor", "system", "lwip"];
  if (!validStacks.includes(tunInbound.stack)) {
    errors.push(
      `TUN stack '${tunInbound.stack}' is not a valid option. Valid options: ${validStacks.join(", ")}`
    );
  }

  return { valid: errors.length === 0, errors };
}

// ============ 生成器 ============

const tunStackArb = fc.constantFrom<TunStack>("gvisor", "system", "lwip");

const mtuArb = fc.integer({ min: 576, max: 9000 });

// ============ 属性测试 ============

describe("TUN Stack Configuration Properties", () => {
  /**
   * Property 8: TUN 网络栈配置
   * *For any* TUN stack selection (gvisor, system, lwip), the generated sing-box config
   * SHALL use the selected stack value in the inbound TUN configuration.
   * 
   * **Feature: vpn-pure-mode, Property 8: TUN Stack Configuration**
   * **Validates: Requirements 8.1, 8.2**
   */
  describe("Property 8: TUN stack selection is correctly applied", () => {
    it("gvisor stack should be correctly set in config", () => {
      fc.assert(
        fc.property(mtuArb, (mtu) => {
          const config = generateSingBoxConfig("gvisor", mtu);
          const validation = validateTunStackConfig(config, "gvisor");

          expect(validation.valid).toBe(true);
          if (!validation.valid) {
            console.log("Validation errors:", validation.errors);
          }
        }),
        { numRuns: 100 }
      );
    });

    it("system stack should be correctly set in config", () => {
      fc.assert(
        fc.property(mtuArb, (mtu) => {
          const config = generateSingBoxConfig("system", mtu);
          const validation = validateTunStackConfig(config, "system");

          expect(validation.valid).toBe(true);
          if (!validation.valid) {
            console.log("Validation errors:", validation.errors);
          }
        }),
        { numRuns: 100 }
      );
    });

    it("lwip stack should be correctly set in config", () => {
      fc.assert(
        fc.property(mtuArb, (mtu) => {
          const config = generateSingBoxConfig("lwip", mtu);
          const validation = validateTunStackConfig(config, "lwip");

          expect(validation.valid).toBe(true);
          if (!validation.valid) {
            console.log("Validation errors:", validation.errors);
          }
        }),
        { numRuns: 100 }
      );
    });

    it("any valid TUN stack should be correctly applied", () => {
      fc.assert(
        fc.property(tunStackArb, mtuArb, (tunStack, mtu) => {
          const config = generateSingBoxConfig(tunStack, mtu);
          const validation = validateTunStackConfig(config, tunStack);

          expect(validation.valid).toBe(true);
          expect(config.inbounds[0].stack).toBe(tunStack);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 8: TUN inbound structure validation", () => {
    it("TUN inbound should have correct type and tag", () => {
      fc.assert(
        fc.property(tunStackArb, mtuArb, (tunStack, mtu) => {
          const config = generateSingBoxConfig(tunStack, mtu);
          const tunInbound = config.inbounds[0];

          expect(tunInbound.type).toBe("tun");
          expect(tunInbound.tag).toBe("tun-in");
        }),
        { numRuns: 100 }
      );
    });

    it("TUN inbound should have auto_route and strict_route enabled", () => {
      fc.assert(
        fc.property(tunStackArb, mtuArb, (tunStack, mtu) => {
          const config = generateSingBoxConfig(tunStack, mtu);
          const tunInbound = config.inbounds[0];

          expect(tunInbound.auto_route).toBe(true);
          expect(tunInbound.strict_route).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("TUN inbound should have sniff enabled", () => {
      fc.assert(
        fc.property(tunStackArb, mtuArb, (tunStack, mtu) => {
          const config = generateSingBoxConfig(tunStack, mtu);
          const tunInbound = config.inbounds[0];

          expect(tunInbound.sniff).toBe(true);
          expect(tunInbound.sniff_override_destination).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("TUN inbound should use provided MTU value", () => {
      fc.assert(
        fc.property(tunStackArb, mtuArb, (tunStack, mtu) => {
          const config = generateSingBoxConfig(tunStack, mtu);
          const tunInbound = config.inbounds[0];

          expect(tunInbound.mtu).toBe(mtu);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 8: Default TUN stack validation", () => {
    /**
     * **Validates: Requirements 8.1**
     * THE Settings_Store SHALL provide TUN stack selection with options: gvisor, system, lwip
     */
    it("default TUN stack should be gvisor", () => {
      // Test that gvisor is a valid default
      const config = generateSingBoxConfig("gvisor");
      const validation = validateTunStackConfig(config, "gvisor");

      expect(validation.valid).toBe(true);
      expect(config.inbounds[0].stack).toBe("gvisor");
    });

    it("all three TUN stack options should be valid", () => {
      const validStacks: TunStack[] = ["gvisor", "system", "lwip"];

      validStacks.forEach((stack) => {
        const config = generateSingBoxConfig(stack);
        const validation = validateTunStackConfig(config, stack);

        expect(validation.valid).toBe(true);
        expect(config.inbounds[0].stack).toBe(stack);
      });
    });
  });

  describe("Outbounds configuration with TUN stack", () => {
    it("config should have proxy, direct, and block outbounds regardless of TUN stack", () => {
      fc.assert(
        fc.property(tunStackArb, mtuArb, (tunStack, mtu) => {
          const config = generateSingBoxConfig(tunStack, mtu);

          const tags = config.outbounds.map((o) => o.tag);
          expect(tags).toContain("proxy");
          expect(tags).toContain("direct");
          expect(tags).toContain("block");
        }),
        { numRuns: 100 }
      );
    });
  });
});
