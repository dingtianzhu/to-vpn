/**
 * 分应用代理（进程路由规则）属性测试
 * 测试 TUN 模式下进程路由规则的正确性
 *
 * **Feature: vpn-pure-mode, Property 7: Process-Based Routing Rules**
 * **Validates: Requirements 7.3, 7.5**
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============ 类型定义 ============

type RouteMode = "rule" | "global" | "direct";

interface RouteRule {
  process_name?: string[];
  domain_suffix?: string[];
  port?: number | number[];
  network?: string;
  action?: string;
  outbound?: string;
  ip_cidr?: string[];
  rule_set?: string;
  ip_is_private?: boolean;
  protocol?: string;
}

interface RouteConfig {
  rules: RouteRule[];
  final: string;
}

interface SingBoxConfig {
  route: RouteConfig;
}

// ============ 纯函数版本（模拟 Rust 配置生成逻辑）============

/**
 * 生成路由规则（模拟 Rust 端 TUN 模式逻辑）
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 7.3**
 */
function generateRouteRules(
  excludedApps: string[],
  forcedProxyApps: string[],
  customBypassDomains: string[],
  customProxyDomains: string[],
  blockWebRTC: boolean,
  blockQuic: boolean,
  routeMode: RouteMode
): RouteRule[] {
  const rules: RouteRule[] = [];

  // 服务器 IP 直连（防止环路）
  rules.push({ ip_cidr: ["1.2.3.4/32"], outbound: "direct" });

  // DNS 劫持规则
  rules.push({ protocol: "dns", action: "hijack-dns" });

  // 本地域名直连
  rules.push({
    domain_suffix: [".lan", ".local", ".home", ".internal"],
    outbound: "direct",
  });

  // QUIC 阻断
  if (blockQuic) {
    rules.push({ port: 443, network: "udp", action: "reject" });
  }

  // WebRTC 阻断
  if (blockWebRTC) {
    rules.push({ port: [3478, 5349, 19302], network: "udp", action: "reject" });
    rules.push({ domain_suffix: ["stun.l.google.com"], action: "reject" });
  }

  // 自定义代理域名（强制走代理）- 放在 geo 规则之前
  if (customProxyDomains.length > 0) {
    rules.push({ domain_suffix: customProxyDomains, outbound: "proxy" });
  }

  // 自定义直连域名（强制直连）- 放在 geo 规则之前
  if (customBypassDomains.length > 0) {
    rules.push({ domain_suffix: customBypassDomains, outbound: "direct" });
  }

  // **Feature: vpn-pure-mode**
  // **Validates: Requirements 7.3 - 分应用代理（进程路由规则）**
  // 强制代理的应用 - 放在 geo 规则之前
  if (forcedProxyApps.length > 0) {
    rules.push({ process_name: forcedProxyApps, outbound: "proxy" });
  }

  // 排除的应用（绕过 VPN）- 放在 geo 规则之前
  if (excludedApps.length > 0) {
    rules.push({ process_name: excludedApps, outbound: "direct" });
  }

  // 根据路由模式添加规则
  if (routeMode === "rule") {
    rules.push({ rule_set: "geosite-cn", outbound: "direct" });
    rules.push({ rule_set: "geoip-cn", outbound: "direct" });
  }

  // 私有 IP 直连
  rules.push({ ip_is_private: true, outbound: "direct" });

  return rules;
}

/**
 * 生成完整的 sing-box 配置（模拟 Rust 端 TUN 模式逻辑）
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 7.3**
 */
function generateSingBoxConfig(
  excludedApps: string[],
  forcedProxyApps: string[],
  customBypassDomains: string[] = [],
  customProxyDomains: string[] = [],
  blockWebRTC: boolean = true,
  blockQuic: boolean = true,
  routeMode: RouteMode = "rule"
): SingBoxConfig {
  const finalOutbound = routeMode === "direct" ? "direct" : "proxy";

  return {
    route: {
      rules: generateRouteRules(
        excludedApps,
        forcedProxyApps,
        customBypassDomains,
        customProxyDomains,
        blockWebRTC,
        blockQuic,
        routeMode
      ),
      final: finalOutbound,
    },
  };
}

// ============ 验证函数 ============

/**
 * 验证进程路由规则配置
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 7.3, 7.5**
 */
function validateProcessRoutingConfig(
  config: SingBoxConfig,
  excludedApps: string[],
  forcedProxyApps: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const rules = config.route.rules;

  // 检查排除的应用规则
  if (excludedApps.length > 0) {
    const excludedRule = rules.find(
      (r) =>
        r.process_name !== undefined &&
        r.outbound === "direct" &&
        excludedApps.every((app) => r.process_name!.includes(app))
    );

    if (!excludedRule) {
      errors.push("Missing excluded apps (bypass VPN) rule");
    }
  }

  // 检查强制代理应用规则
  if (forcedProxyApps.length > 0) {
    const forcedProxyRule = rules.find(
      (r) =>
        r.process_name !== undefined &&
        r.outbound === "proxy" &&
        forcedProxyApps.every((app) => r.process_name!.includes(app))
    );

    if (!forcedProxyRule) {
      errors.push("Missing forced proxy apps rule");
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 验证进程规则优先级（应在 geo 规则之前）
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 7.3**
 */
function validateProcessRulePriority(
  config: SingBoxConfig,
  excludedApps: string[],
  forcedProxyApps: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const rules = config.route.rules;

  // 找到 geo 规则的索引
  const geoRuleIndex = rules.findIndex(
    (r) => r.rule_set === "geosite-cn" || r.rule_set === "geoip-cn"
  );

  // 如果没有 geo 规则，跳过优先级检查
  if (geoRuleIndex === -1) {
    return { valid: true, errors: [] };
  }

  // 检查排除的应用规则是否在 geo 规则之前
  if (excludedApps.length > 0) {
    const excludedRuleIndex = rules.findIndex(
      (r) =>
        r.process_name !== undefined &&
        r.outbound === "direct" &&
        excludedApps.some((app) => r.process_name!.includes(app))
    );

    if (excludedRuleIndex !== -1 && excludedRuleIndex > geoRuleIndex) {
      errors.push("Excluded apps rule should be before geo rules");
    }
  }

  // 检查强制代理应用规则是否在 geo 规则之前
  if (forcedProxyApps.length > 0) {
    const forcedProxyRuleIndex = rules.findIndex(
      (r) =>
        r.process_name !== undefined &&
        r.outbound === "proxy" &&
        forcedProxyApps.some((app) => r.process_name!.includes(app))
    );

    if (forcedProxyRuleIndex !== -1 && forcedProxyRuleIndex > geoRuleIndex) {
      errors.push("Forced proxy apps rule should be before geo rules");
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============ 生成器 ============

// 应用名称生成器（模拟真实应用名称）
const appNameArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_ -]{0,29}$/)
  .filter((s) => s.trim().length > 0);

// 应用列表生成器
const appListArb = fc.array(appNameArb, { minLength: 0, maxLength: 10 });

// 非空应用列表生成器
const nonEmptyAppListArb = fc.array(appNameArb, { minLength: 1, maxLength: 10 });

const routeModeArb = fc.constantFrom<RouteMode>("rule", "global", "direct");
const booleanArb = fc.boolean();

// ============ 属性测试 ============

describe("Process-Based Routing Rules Properties", () => {
  /**
   * Property 7: 进程路由规则
   * *For any* config with excluded or forced proxy apps in TUN mode,
   * the generated sing-box config SHALL contain process_name routing rules
   * for those applications.
   * 
   * **Feature: vpn-pure-mode, Property 7: Process-Based Routing Rules**
   * **Validates: Requirements 7.3, 7.5**
   */
  describe("Property 7: Process routing rules for excluded apps", () => {
    it("should have process_name rule with direct outbound for excluded apps", () => {
      fc.assert(
        fc.property(
          nonEmptyAppListArb,
          appListArb,
          routeModeArb,
          (excludedApps, forcedProxyApps, routeMode) => {
            const config = generateSingBoxConfig(
              excludedApps,
              forcedProxyApps,
              [],
              [],
              true,
              true,
              routeMode
            );

            const excludedRule = config.route.rules.find(
              (r) =>
                r.process_name !== undefined &&
                r.outbound === "direct" &&
                excludedApps.every((app) => r.process_name!.includes(app))
            );

            expect(excludedRule).toBeDefined();
            expect(excludedRule!.outbound).toBe("direct");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should include all excluded app names in the rule", () => {
      fc.assert(
        fc.property(
          nonEmptyAppListArb,
          routeModeArb,
          (excludedApps, routeMode) => {
            const config = generateSingBoxConfig(
              excludedApps,
              [],
              [],
              [],
              true,
              true,
              routeMode
            );

            const excludedRule = config.route.rules.find(
              (r) => r.process_name !== undefined && r.outbound === "direct"
            );

            expect(excludedRule).toBeDefined();
            for (const app of excludedApps) {
              expect(excludedRule!.process_name).toContain(app);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 7: Process routing rules for forced proxy apps", () => {
    it("should have process_name rule with proxy outbound for forced proxy apps", () => {
      fc.assert(
        fc.property(
          appListArb,
          nonEmptyAppListArb,
          routeModeArb,
          (excludedApps, forcedProxyApps, routeMode) => {
            const config = generateSingBoxConfig(
              excludedApps,
              forcedProxyApps,
              [],
              [],
              true,
              true,
              routeMode
            );

            const forcedProxyRule = config.route.rules.find(
              (r) =>
                r.process_name !== undefined &&
                r.outbound === "proxy" &&
                forcedProxyApps.every((app) => r.process_name!.includes(app))
            );

            expect(forcedProxyRule).toBeDefined();
            expect(forcedProxyRule!.outbound).toBe("proxy");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should include all forced proxy app names in the rule", () => {
      fc.assert(
        fc.property(
          nonEmptyAppListArb,
          routeModeArb,
          (forcedProxyApps, routeMode) => {
            const config = generateSingBoxConfig(
              [],
              forcedProxyApps,
              [],
              [],
              true,
              true,
              routeMode
            );

            const forcedProxyRule = config.route.rules.find(
              (r) => r.process_name !== undefined && r.outbound === "proxy"
            );

            expect(forcedProxyRule).toBeDefined();
            for (const app of forcedProxyApps) {
              expect(forcedProxyRule!.process_name).toContain(app);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 7: Process rules priority over geo rules", () => {
    it("should place excluded apps rule before geo rules", () => {
      fc.assert(
        fc.property(nonEmptyAppListArb, (excludedApps) => {
          // Only test with "rule" mode which has geo rules
          const config = generateSingBoxConfig(
            excludedApps,
            [],
            [],
            [],
            true,
            true,
            "rule"
          );

          const validation = validateProcessRulePriority(
            config,
            excludedApps,
            []
          );

          expect(validation.valid).toBe(true);
          if (!validation.valid) {
            console.log("Validation errors:", validation.errors);
          }
        }),
        { numRuns: 100 }
      );
    });

    it("should place forced proxy apps rule before geo rules", () => {
      fc.assert(
        fc.property(nonEmptyAppListArb, (forcedProxyApps) => {
          // Only test with "rule" mode which has geo rules
          const config = generateSingBoxConfig(
            [],
            forcedProxyApps,
            [],
            [],
            true,
            true,
            "rule"
          );

          const validation = validateProcessRulePriority(
            config,
            [],
            forcedProxyApps
          );

          expect(validation.valid).toBe(true);
          if (!validation.valid) {
            console.log("Validation errors:", validation.errors);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 7: Full validation", () => {
    it("should pass full validation when both excluded and forced proxy apps are configured", () => {
      fc.assert(
        fc.property(
          nonEmptyAppListArb,
          nonEmptyAppListArb,
          routeModeArb,
          booleanArb,
          booleanArb,
          (excludedApps, forcedProxyApps, routeMode, blockWebRTC, blockQuic) => {
            const config = generateSingBoxConfig(
              excludedApps,
              forcedProxyApps,
              [],
              [],
              blockWebRTC,
              blockQuic,
              routeMode
            );

            const validation = validateProcessRoutingConfig(
              config,
              excludedApps,
              forcedProxyApps
            );

            expect(validation.valid).toBe(true);
            if (!validation.valid) {
              console.log("Validation errors:", validation.errors);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 7: Empty app lists behavior", () => {
    it("should not have excluded apps rule when list is empty", () => {
      fc.assert(
        fc.property(
          appListArb,
          routeModeArb,
          (forcedProxyApps, routeMode) => {
            const config = generateSingBoxConfig(
              [], // empty excluded apps
              forcedProxyApps,
              [],
              [],
              true,
              true,
              routeMode
            );

            // Should not have a process_name rule with direct outbound
            // (unless it's from forced proxy apps which would have proxy outbound)
            const excludedRule = config.route.rules.find(
              (r) =>
                r.process_name !== undefined &&
                r.outbound === "direct"
            );

            expect(excludedRule).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should not have forced proxy apps rule when list is empty", () => {
      fc.assert(
        fc.property(
          appListArb,
          routeModeArb,
          (excludedApps, routeMode) => {
            const config = generateSingBoxConfig(
              excludedApps,
              [], // empty forced proxy apps
              [],
              [],
              true,
              true,
              routeMode
            );

            // Should not have a process_name rule with proxy outbound
            const forcedProxyRule = config.route.rules.find(
              (r) =>
                r.process_name !== undefined &&
                r.outbound === "proxy"
            );

            expect(forcedProxyRule).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 7: Process rules work with all route modes", () => {
    it("should have process rules regardless of route mode", () => {
      fc.assert(
        fc.property(
          nonEmptyAppListArb,
          nonEmptyAppListArb,
          booleanArb,
          booleanArb,
          (excludedApps, forcedProxyApps, blockWebRTC, blockQuic) => {
            for (const routeMode of ["rule", "global", "direct"] as RouteMode[]) {
              const config = generateSingBoxConfig(
                excludedApps,
                forcedProxyApps,
                [],
                [],
                blockWebRTC,
                blockQuic,
                routeMode
              );

              const validation = validateProcessRoutingConfig(
                config,
                excludedApps,
                forcedProxyApps
              );

              expect(validation.valid).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 7: Process rules are independent of other settings", () => {
    it("should have process rules regardless of WebRTC blocking setting", () => {
      fc.assert(
        fc.property(
          nonEmptyAppListArb,
          nonEmptyAppListArb,
          routeModeArb,
          (excludedApps, forcedProxyApps, routeMode) => {
            // Test with WebRTC blocking enabled
            const config1 = generateSingBoxConfig(
              excludedApps,
              forcedProxyApps,
              [],
              [],
              true, // WebRTC blocking enabled
              true,
              routeMode
            );

            // Test with WebRTC blocking disabled
            const config2 = generateSingBoxConfig(
              excludedApps,
              forcedProxyApps,
              [],
              [],
              false, // WebRTC blocking disabled
              true,
              routeMode
            );

            const validation1 = validateProcessRoutingConfig(
              config1,
              excludedApps,
              forcedProxyApps
            );
            const validation2 = validateProcessRoutingConfig(
              config2,
              excludedApps,
              forcedProxyApps
            );

            expect(validation1.valid).toBe(true);
            expect(validation2.valid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should have process rules regardless of QUIC blocking setting", () => {
      fc.assert(
        fc.property(
          nonEmptyAppListArb,
          nonEmptyAppListArb,
          routeModeArb,
          (excludedApps, forcedProxyApps, routeMode) => {
            // Test with QUIC blocking enabled
            const config1 = generateSingBoxConfig(
              excludedApps,
              forcedProxyApps,
              [],
              [],
              true,
              true, // QUIC blocking enabled
              routeMode
            );

            // Test with QUIC blocking disabled
            const config2 = generateSingBoxConfig(
              excludedApps,
              forcedProxyApps,
              [],
              [],
              true,
              false, // QUIC blocking disabled
              routeMode
            );

            const validation1 = validateProcessRoutingConfig(
              config1,
              excludedApps,
              forcedProxyApps
            );
            const validation2 = validateProcessRoutingConfig(
              config2,
              excludedApps,
              forcedProxyApps
            );

            expect(validation1.valid).toBe(true);
            expect(validation2.valid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
