/**
 * 路由模式配置生成属性测试
 * 测试不同路由模式下 sing-box 配置的正确性
 *
 * **Feature: vpn-pure-mode, Property 2: Route Mode Configuration Generation**
 * **Validates: Requirements 3.2, 3.3, 3.4**
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============ 类型定义 ============

type RouteMode = "rule" | "global" | "direct";

interface RouteRule {
  type?: string;
  domain_suffix?: string[];
  rule_set?: string;
  ip_is_private?: boolean;
  ip_cidr?: string[];
  port?: number;
  network?: string;
  protocol?: string;
  action?: string;
  outbound?: "direct" | "proxy" | "block";
}

interface RuleSet {
  tag: string;
  type: string;
  format: string;
  path: string;
}

interface RouteConfig {
  auto_detect_interface: boolean;
  final: string;
  rules: RouteRule[];
  rule_set?: RuleSet[];
}

interface SingBoxConfig {
  route: RouteConfig;
  outbounds: { type: string; tag: string }[];
}

// ============ 纯函数版本（模拟 Rust 配置生成逻辑）============

/**
 * 生成路由规则（模拟 Rust 端逻辑）
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 3.2, 3.3, 3.4**
 */
function generateRouteRules(
  routeMode: RouteMode,
  serverIps: string[],
  blockQuic: boolean
): RouteRule[] {
  const rules: RouteRule[] = [];

  // A. 强制绕过 VPS 服务器 IP (防止环路) - 所有模式都需要
  if (serverIps.length > 0) {
    const cidrs = serverIps.map((ip) => `${ip}/32`);
    rules.push({ ip_cidr: cidrs, outbound: "direct" });
  }

  rules.push({ protocol: "dns", action: "hijack-dns" });
  rules.push({
    domain_suffix: [".lan", ".local", ".home", ".internal"],
    outbound: "direct",
  });

  // 屏蔽 QUIC (UDP 443)
  if (blockQuic) {
    rules.push({ port: 443, network: "udp", action: "reject" });
  }

  // B. 根据路由模式生成不同的规则
  switch (routeMode) {
    case "global":
      // 全局模式：只保留基本规则，所有流量走代理
      // 私有 IP 仍然直连（局域网访问）
      rules.push({ ip_is_private: true, outbound: "direct" });
      break;

    case "direct":
      // 直连模式：所有流量直连，不走代理
      // 注意：这种模式下 VPN 基本不起作用，仅用于测试
      break;

    case "rule":
    default:
      // 规则模式：根据 geo 规则分流（中国直连，其他代理）
      rules.push({
        domain_suffix: [".aliyuncs.com", ".qq.com", ".baidu.com"],
        outbound: "direct",
      });
      rules.push({ rule_set: "geosite-cn", outbound: "direct" });
      rules.push({ rule_set: "geoip-cn", outbound: "direct" });
      rules.push({ ip_is_private: true, outbound: "direct" });
      break;
  }

  return rules;
}

/**
 * 生成完整的 sing-box 配置（模拟 Rust 端逻辑）
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 3.2, 3.3, 3.4**
 */
function generateSingBoxConfig(
  routeMode: RouteMode,
  serverIps: string[],
  blockQuic: boolean
): SingBoxConfig {
  const rules = generateRouteRules(routeMode, serverIps, blockQuic);

  // 确定最终出站
  const finalOutbound = routeMode === "direct" ? "direct" : "proxy";

  // 根据路由模式决定是否需要规则集
  const routeConfig: RouteConfig = {
    auto_detect_interface: true,
    final: finalOutbound,
    rules,
  };

  if (routeMode === "rule") {
    routeConfig.rule_set = [
      {
        tag: "geosite-cn",
        type: "local",
        format: "binary",
        path: "/path/to/geosite-cn.srs",
      },
      {
        tag: "geoip-cn",
        type: "local",
        format: "binary",
        path: "/path/to/geoip-cn.srs",
      },
    ];
  }

  return {
    route: routeConfig,
    outbounds: [
      { type: "hysteria2", tag: "proxy" },
      { type: "direct", tag: "direct" },
      { type: "block", tag: "block" },
    ],
  };
}

// ============ 验证函数 ============

/**
 * 验证全局模式配置
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 3.3**
 */
function validateGlobalModeConfig(config: SingBoxConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 全局模式：final 应该是 proxy
  if (config.route.final !== "proxy") {
    errors.push(`Expected final outbound to be 'proxy', got '${config.route.final}'`);
  }

  // 全局模式不应该有 geo 规则集
  if (config.route.rule_set && config.route.rule_set.length > 0) {
    errors.push("Global mode should not have geo rule sets");
  }

  // 全局模式不应该有 geosite-cn/geoip-cn 路由规则
  const hasGeoRule = config.route.rules.some(
    (rule) => rule.rule_set === "geosite-cn" || rule.rule_set === "geoip-cn"
  );
  if (hasGeoRule) {
    errors.push("Global mode should not have geo routing rules");
  }

  // 全局模式应该有私有 IP 直连规则
  const hasPrivateIpRule = config.route.rules.some(
    (rule) => rule.ip_is_private === true && rule.outbound === "direct"
  );
  if (!hasPrivateIpRule) {
    errors.push("Global mode should have private IP direct rule");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 验证直连模式配置
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 3.4**
 */
function validateDirectModeConfig(config: SingBoxConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 直连模式：final 应该是 direct
  if (config.route.final !== "direct") {
    errors.push(`Expected final outbound to be 'direct', got '${config.route.final}'`);
  }

  // 直连模式不应该有 geo 规则集
  if (config.route.rule_set && config.route.rule_set.length > 0) {
    errors.push("Direct mode should not have geo rule sets");
  }

  // 直连模式不应该有 geosite-cn/geoip-cn 路由规则
  const hasGeoRule = config.route.rules.some(
    (rule) => rule.rule_set === "geosite-cn" || rule.rule_set === "geoip-cn"
  );
  if (hasGeoRule) {
    errors.push("Direct mode should not have geo routing rules");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 验证规则模式配置
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 3.2**
 */
function validateRuleModeConfig(config: SingBoxConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 规则模式：final 应该是 proxy
  if (config.route.final !== "proxy") {
    errors.push(`Expected final outbound to be 'proxy', got '${config.route.final}'`);
  }

  // 规则模式应该有 geo 规则集
  if (!config.route.rule_set || config.route.rule_set.length === 0) {
    errors.push("Rule mode should have geo rule sets");
  } else {
    const hasGeositeCn = config.route.rule_set.some((rs) => rs.tag === "geosite-cn");
    const hasGeoipCn = config.route.rule_set.some((rs) => rs.tag === "geoip-cn");
    if (!hasGeositeCn) {
      errors.push("Rule mode should have geosite-cn rule set");
    }
    if (!hasGeoipCn) {
      errors.push("Rule mode should have geoip-cn rule set");
    }
  }

  // 规则模式应该有 geosite-cn 路由规则
  const hasGeositeCnRule = config.route.rules.some(
    (rule) => rule.rule_set === "geosite-cn" && rule.outbound === "direct"
  );
  if (!hasGeositeCnRule) {
    errors.push("Rule mode should have geosite-cn direct routing rule");
  }

  // 规则模式应该有 geoip-cn 路由规则
  const hasGeoipCnRule = config.route.rules.some(
    (rule) => rule.rule_set === "geoip-cn" && rule.outbound === "direct"
  );
  if (!hasGeoipCnRule) {
    errors.push("Rule mode should have geoip-cn direct routing rule");
  }

  // 规则模式应该有私有 IP 直连规则
  const hasPrivateIpRule = config.route.rules.some(
    (rule) => rule.ip_is_private === true && rule.outbound === "direct"
  );
  if (!hasPrivateIpRule) {
    errors.push("Rule mode should have private IP direct rule");
  }

  return { valid: errors.length === 0, errors };
}

// ============ 生成器 ============

const routeModeArb = fc.constantFrom<RouteMode>("rule", "global", "direct");

const ipv4Arb = fc.tuple(
  fc.integer({ min: 1, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 })
).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

const serverIpsArb = fc.array(ipv4Arb, { minLength: 0, maxLength: 3 });

const blockQuicArb = fc.boolean();

// ============ 属性测试 ============

describe("Route Mode Configuration Generation Properties", () => {
  /**
   * Property 2: 路由模式配置生成
   * *For any* route mode setting, the generated sing-box config SHALL have the correct
   * final outbound: "proxy" for global mode, "direct" for direct mode, and geo-based
   * rules for rule mode.
   * 
   * **Feature: vpn-pure-mode, Property 2: Route Mode Configuration Generation**
   * **Validates: Requirements 3.2, 3.3, 3.4**
   */
  describe("Property 2: Route mode determines correct final outbound", () => {
    it("global mode should have 'proxy' as final outbound", () => {
      fc.assert(
        fc.property(serverIpsArb, blockQuicArb, (serverIps, blockQuic) => {
          const config = generateSingBoxConfig("global", serverIps, blockQuic);
          expect(config.route.final).toBe("proxy");
        }),
        { numRuns: 100 }
      );
    });

    it("direct mode should have 'direct' as final outbound", () => {
      fc.assert(
        fc.property(serverIpsArb, blockQuicArb, (serverIps, blockQuic) => {
          const config = generateSingBoxConfig("direct", serverIps, blockQuic);
          expect(config.route.final).toBe("direct");
        }),
        { numRuns: 100 }
      );
    });

    it("rule mode should have 'proxy' as final outbound", () => {
      fc.assert(
        fc.property(serverIpsArb, blockQuicArb, (serverIps, blockQuic) => {
          const config = generateSingBoxConfig("rule", serverIps, blockQuic);
          expect(config.route.final).toBe("proxy");
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 2: Global mode configuration validation", () => {
    /**
     * **Validates: Requirements 3.3**
     * WHEN route mode is "global", THE Sing_Box_Config SHALL route all traffic through proxy
     */
    it("global mode should pass full validation", () => {
      fc.assert(
        fc.property(serverIpsArb, blockQuicArb, (serverIps, blockQuic) => {
          const config = generateSingBoxConfig("global", serverIps, blockQuic);
          const validation = validateGlobalModeConfig(config);

          expect(validation.valid).toBe(true);
          if (!validation.valid) {
            console.log("Validation errors:", validation.errors);
          }
        }),
        { numRuns: 100 }
      );
    });

    it("global mode should not have geo rule sets", () => {
      fc.assert(
        fc.property(serverIpsArb, blockQuicArb, (serverIps, blockQuic) => {
          const config = generateSingBoxConfig("global", serverIps, blockQuic);

          expect(config.route.rule_set).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 2: Direct mode configuration validation", () => {
    /**
     * **Validates: Requirements 3.4**
     * WHEN route mode is "direct", THE Sing_Box_Config SHALL route all traffic directly without proxy
     */
    it("direct mode should pass full validation", () => {
      fc.assert(
        fc.property(serverIpsArb, blockQuicArb, (serverIps, blockQuic) => {
          const config = generateSingBoxConfig("direct", serverIps, blockQuic);
          const validation = validateDirectModeConfig(config);

          expect(validation.valid).toBe(true);
          if (!validation.valid) {
            console.log("Validation errors:", validation.errors);
          }
        }),
        { numRuns: 100 }
      );
    });

    it("direct mode should not have geo rule sets", () => {
      fc.assert(
        fc.property(serverIpsArb, blockQuicArb, (serverIps, blockQuic) => {
          const config = generateSingBoxConfig("direct", serverIps, blockQuic);

          expect(config.route.rule_set).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 2: Rule mode configuration validation", () => {
    /**
     * **Validates: Requirements 3.2**
     * WHEN route mode is "rule", THE Sing_Box_Config SHALL apply geo-based routing rules
     * (bypass China, proxy others)
     */
    it("rule mode should pass full validation", () => {
      fc.assert(
        fc.property(serverIpsArb, blockQuicArb, (serverIps, blockQuic) => {
          const config = generateSingBoxConfig("rule", serverIps, blockQuic);
          const validation = validateRuleModeConfig(config);

          expect(validation.valid).toBe(true);
          if (!validation.valid) {
            console.log("Validation errors:", validation.errors);
          }
        }),
        { numRuns: 100 }
      );
    });

    it("rule mode should have geo rule sets", () => {
      fc.assert(
        fc.property(serverIpsArb, blockQuicArb, (serverIps, blockQuic) => {
          const config = generateSingBoxConfig("rule", serverIps, blockQuic);

          expect(config.route.rule_set).toBeDefined();
          expect(config.route.rule_set!.length).toBe(2);

          const tags = config.route.rule_set!.map((rs) => rs.tag);
          expect(tags).toContain("geosite-cn");
          expect(tags).toContain("geoip-cn");
        }),
        { numRuns: 100 }
      );
    });

    it("rule mode should have geo routing rules with direct outbound", () => {
      fc.assert(
        fc.property(serverIpsArb, blockQuicArb, (serverIps, blockQuic) => {
          const config = generateSingBoxConfig("rule", serverIps, blockQuic);

          const geositeRule = config.route.rules.find(
            (r) => r.rule_set === "geosite-cn"
          );
          const geoipRule = config.route.rules.find(
            (r) => r.rule_set === "geoip-cn"
          );

          expect(geositeRule).toBeDefined();
          expect(geositeRule!.outbound).toBe("direct");

          expect(geoipRule).toBeDefined();
          expect(geoipRule!.outbound).toBe("direct");
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Common rules across all modes", () => {
    it("all modes should have DNS hijack rule", () => {
      fc.assert(
        fc.property(
          routeModeArb,
          serverIpsArb,
          blockQuicArb,
          (routeMode, serverIps, blockQuic) => {
            const config = generateSingBoxConfig(routeMode, serverIps, blockQuic);

            const dnsHijackRule = config.route.rules.find(
              (r) => r.protocol === "dns" && r.action === "hijack-dns"
            );
            expect(dnsHijackRule).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("all modes should have local domain suffix direct rules", () => {
      fc.assert(
        fc.property(
          routeModeArb,
          serverIpsArb,
          blockQuicArb,
          (routeMode, serverIps, blockQuic) => {
            const config = generateSingBoxConfig(routeMode, serverIps, blockQuic);

            const localDomainRule = config.route.rules.find(
              (r) =>
                r.domain_suffix &&
                r.domain_suffix.includes(".lan") &&
                r.outbound === "direct"
            );
            expect(localDomainRule).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("all modes should bypass server IPs when provided", () => {
      fc.assert(
        fc.property(
          routeModeArb,
          fc.array(ipv4Arb, { minLength: 1, maxLength: 3 }),
          blockQuicArb,
          (routeMode, serverIps, blockQuic) => {
            const config = generateSingBoxConfig(routeMode, serverIps, blockQuic);

            const serverBypassRule = config.route.rules.find(
              (r) => r.ip_cidr && r.outbound === "direct"
            );
            expect(serverBypassRule).toBeDefined();

            // Verify all server IPs are in the bypass rule
            serverIps.forEach((ip) => {
              expect(serverBypassRule!.ip_cidr).toContain(`${ip}/32`);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should block QUIC when blockQuic is true", () => {
      fc.assert(
        fc.property(routeModeArb, serverIpsArb, (routeMode, serverIps) => {
          const config = generateSingBoxConfig(routeMode, serverIps, true);

          const quicBlockRule = config.route.rules.find(
            (r) => r.port === 443 && r.network === "udp" && r.action === "reject"
          );
          expect(quicBlockRule).toBeDefined();
        }),
        { numRuns: 100 }
      );
    });

    it("should not block QUIC when blockQuic is false", () => {
      fc.assert(
        fc.property(routeModeArb, serverIpsArb, (routeMode, serverIps) => {
          const config = generateSingBoxConfig(routeMode, serverIps, false);

          const quicBlockRule = config.route.rules.find(
            (r) => r.port === 443 && r.network === "udp" && r.action === "reject"
          );
          expect(quicBlockRule).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Outbounds configuration", () => {
    it("all modes should have proxy, direct, and block outbounds", () => {
      fc.assert(
        fc.property(
          routeModeArb,
          serverIpsArb,
          blockQuicArb,
          (routeMode, serverIps, blockQuic) => {
            const config = generateSingBoxConfig(routeMode, serverIps, blockQuic);

            const tags = config.outbounds.map((o) => o.tag);
            expect(tags).toContain("proxy");
            expect(tags).toContain("direct");
            expect(tags).toContain("block");
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
