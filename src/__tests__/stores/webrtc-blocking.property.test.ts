/**
 * WebRTC 阻断规则属性测试
 * 测试 WebRTC 阻断启用时 sing-box 配置的正确性
 *
 * **Feature: vpn-pure-mode, Property 6: WebRTC Blocking Rules**
 * **Validates: Requirements 6.2**
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============ 类型定义 ============

type RouteMode = "rule" | "global" | "direct";

interface RouteRule {
  port?: number | number[];
  network?: string;
  action?: string;
  domain_suffix?: string[];
  outbound?: string;
}

interface RouteConfig {
  rules: RouteRule[];
  final: string;
}

interface SingBoxConfig {
  route: RouteConfig;
}

// ============ WebRTC 相关常量 ============

/**
 * WebRTC STUN/TURN 端口列表
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 6.2**
 * 
 * 标准 STUN/TURN 端口：
 * - 3478: STUN/TURN 标准端口
 * - 5349: STUN/TURN over TLS
 * - 19302: Google STUN 服务器端口
 */
const WEBRTC_PORTS = [3478, 5349, 19302];

/**
 * WebRTC 相关域名列表
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 6.3**
 */
const WEBRTC_DOMAINS = [
  // Google STUN/TURN 服务器
  "stun.l.google.com",
  ".stun.l.google.com",
  "stun1.l.google.com",
  "stun2.l.google.com",
  "stun3.l.google.com",
  "stun4.l.google.com",
  "stun.services.mozilla.com",
  ".stun.services.mozilla.com",
  // Twilio STUN/TURN
  "global.stun.twilio.com",
  ".stun.twilio.com",
  ".turn.twilio.com",
  // 其他常见 STUN 服务器
  "stun.stunprotocol.org",
  "stun.voip.eutelia.it",
  "stun.sipgate.net",
  "stun.ekiga.net",
  "stun.ideasip.com",
  "stun.schlund.de",
  "stun.voiparound.com",
  "stun.voipbuster.com",
  "stun.voipstunt.com",
  "stun.counterpath.com",
  "stun.1und1.de",
  "stun.gmx.net",
  "stun.callwithus.com",
  "stun.internetcalls.com",
  // WebRTC 泄漏检测网站
  "webrtc-ips.com",
  ".webrtc-ips.com",
];

// ============ 纯函数版本（模拟 Rust 配置生成逻辑）============

/**
 * 生成路由规则（模拟 Rust 端逻辑）
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 6.2, 6.3**
 */
function generateRouteRules(
  blockWebRTC: boolean,
  blockQuic: boolean,
  routeMode: RouteMode
): RouteRule[] {
  const rules: RouteRule[] = [];

  // DNS 劫持规则
  rules.push({ action: "hijack-dns" });

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
  // **Feature: vpn-pure-mode**
  // **Validates: Requirements 6.2, 6.3**
  if (blockWebRTC) {
    // 阻断 STUN/TURN 端口 (3478, 5349, 19302)
    rules.push({ port: WEBRTC_PORTS, network: "udp", action: "reject" });
    // 阻断 WebRTC 相关域名
    rules.push({ domain_suffix: WEBRTC_DOMAINS, action: "reject" });
  }

  // 根据路由模式添加规则
  if (routeMode === "rule") {
    rules.push({ outbound: "direct" }); // geosite-cn placeholder
    rules.push({ outbound: "direct" }); // geoip-cn placeholder
  }

  // 私有 IP 直连
  rules.push({ outbound: "direct" }); // ip_is_private placeholder

  return rules;
}

/**
 * 生成完整的 sing-box 配置（模拟 Rust 端逻辑）
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 6.2**
 */
function generateSingBoxConfig(
  blockWebRTC: boolean,
  blockQuic: boolean,
  routeMode: RouteMode
): SingBoxConfig {
  const finalOutbound = routeMode === "direct" ? "direct" : "proxy";

  return {
    route: {
      rules: generateRouteRules(blockWebRTC, blockQuic, routeMode),
      final: finalOutbound,
    },
  };
}

// ============ 验证函数 ============

/**
 * 验证 WebRTC 阻断配置
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 6.2**
 */
function validateWebRTCBlockingConfig(config: SingBoxConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const rules = config.route.rules;

  // 检查是否有 WebRTC 端口阻断规则
  const portBlockRule = rules.find(
    (r) =>
      r.port !== undefined &&
      r.network === "udp" &&
      r.action === "reject" &&
      Array.isArray(r.port)
  );

  if (!portBlockRule) {
    errors.push("Missing WebRTC port blocking rule");
  } else {
    // 验证关键端口是否被阻断
    const blockedPorts = portBlockRule.port as number[];
    for (const port of WEBRTC_PORTS) {
      if (!blockedPorts.includes(port)) {
        errors.push(`Missing WebRTC port: ${port}`);
      }
    }
  }

  // 检查是否有 WebRTC 域名阻断规则
  const domainBlockRule = rules.find(
    (r) =>
      r.domain_suffix !== undefined &&
      r.action === "reject" &&
      r.domain_suffix.some((d) => d.includes("stun"))
  );

  if (!domainBlockRule) {
    errors.push("Missing WebRTC domain blocking rule");
  } else {
    // 验证关键域名是否被阻断
    const keyDomains = [
      "stun.l.google.com",
      "stun.services.mozilla.com",
      "webrtc-ips.com",
    ];
    for (const domain of keyDomains) {
      if (!domainBlockRule.domain_suffix!.includes(domain)) {
        errors.push(`Missing key WebRTC domain: ${domain}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 验证 WebRTC 阻断禁用时的配置
 */
function validateWebRTCBlockingDisabledConfig(config: SingBoxConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const rules = config.route.rules;

  // 禁用时不应该有 WebRTC 端口阻断规则
  const portBlockRule = rules.find(
    (r) =>
      r.port !== undefined &&
      r.network === "udp" &&
      r.action === "reject" &&
      Array.isArray(r.port) &&
      (r.port as number[]).includes(3478)
  );

  if (portBlockRule) {
    errors.push("WebRTC port blocking rule should not exist when disabled");
  }

  // 禁用时不应该有 WebRTC 域名阻断规则
  const domainBlockRule = rules.find(
    (r) =>
      r.domain_suffix !== undefined &&
      r.action === "reject" &&
      r.domain_suffix.some((d) => d.includes("stun"))
  );

  if (domainBlockRule) {
    errors.push("WebRTC domain blocking rule should not exist when disabled");
  }

  return { valid: errors.length === 0, errors };
}

// ============ 生成器 ============

const routeModeArb = fc.constantFrom<RouteMode>("rule", "global", "direct");
const booleanArb = fc.boolean();

// ============ 属性测试 ============

describe("WebRTC Blocking Rules Properties", () => {
  /**
   * Property 6: WebRTC 阻断规则
   * *For any* config with WebRTC blocking enabled, the generated sing-box config
   * SHALL contain reject rules for ports 3478, 5349, and 19302.
   * 
   * **Feature: vpn-pure-mode, Property 6: WebRTC Blocking Rules**
   * **Validates: Requirements 6.2**
   */
  describe("Property 6: WebRTC blocking contains required port rules", () => {
    it("should have WebRTC port blocking rule when enabled", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, blockQuic) => {
          const config = generateSingBoxConfig(true, blockQuic, routeMode);

          const portBlockRule = config.route.rules.find(
            (r) =>
              r.port !== undefined &&
              r.network === "udp" &&
              r.action === "reject" &&
              Array.isArray(r.port)
          );
          expect(portBlockRule).toBeDefined();
        }),
        { numRuns: 100 }
      );
    });

    it("should block all required WebRTC ports (3478, 5349, 19302)", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, blockQuic) => {
          const config = generateSingBoxConfig(true, blockQuic, routeMode);

          const portBlockRule = config.route.rules.find(
            (r) =>
              r.port !== undefined &&
              r.network === "udp" &&
              r.action === "reject" &&
              Array.isArray(r.port)
          );
          expect(portBlockRule).toBeDefined();

          const blockedPorts = portBlockRule!.port as number[];
          expect(blockedPorts).toContain(3478);
          expect(blockedPorts).toContain(5349);
          expect(blockedPorts).toContain(19302);
        }),
        { numRuns: 100 }
      );
    });

    it("should use UDP network for port blocking", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, blockQuic) => {
          const config = generateSingBoxConfig(true, blockQuic, routeMode);

          const portBlockRule = config.route.rules.find(
            (r) =>
              r.port !== undefined &&
              Array.isArray(r.port) &&
              (r.port as number[]).includes(3478)
          );
          expect(portBlockRule).toBeDefined();
          expect(portBlockRule!.network).toBe("udp");
        }),
        { numRuns: 100 }
      );
    });

    it("should use reject action for port blocking", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, blockQuic) => {
          const config = generateSingBoxConfig(true, blockQuic, routeMode);

          const portBlockRule = config.route.rules.find(
            (r) =>
              r.port !== undefined &&
              Array.isArray(r.port) &&
              (r.port as number[]).includes(3478)
          );
          expect(portBlockRule).toBeDefined();
          expect(portBlockRule!.action).toBe("reject");
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 6: WebRTC blocking contains domain rules", () => {
    it("should have WebRTC domain blocking rule when enabled", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, blockQuic) => {
          const config = generateSingBoxConfig(true, blockQuic, routeMode);

          const domainBlockRule = config.route.rules.find(
            (r) =>
              r.domain_suffix !== undefined &&
              r.action === "reject" &&
              r.domain_suffix.some((d) => d.includes("stun"))
          );
          expect(domainBlockRule).toBeDefined();
        }),
        { numRuns: 100 }
      );
    });

    it("should block key WebRTC domains", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, blockQuic) => {
          const config = generateSingBoxConfig(true, blockQuic, routeMode);

          const domainBlockRule = config.route.rules.find(
            (r) =>
              r.domain_suffix !== undefined &&
              r.action === "reject" &&
              r.domain_suffix.some((d) => d.includes("stun"))
          );
          expect(domainBlockRule).toBeDefined();

          // 验证关键域名
          expect(domainBlockRule!.domain_suffix).toContain("stun.l.google.com");
          expect(domainBlockRule!.domain_suffix).toContain("stun.services.mozilla.com");
          expect(domainBlockRule!.domain_suffix).toContain("webrtc-ips.com");
        }),
        { numRuns: 100 }
      );
    });

    it("should use reject action for domain blocking", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, blockQuic) => {
          const config = generateSingBoxConfig(true, blockQuic, routeMode);

          const domainBlockRule = config.route.rules.find(
            (r) =>
              r.domain_suffix !== undefined &&
              r.domain_suffix.some((d) => d.includes("stun"))
          );
          expect(domainBlockRule).toBeDefined();
          expect(domainBlockRule!.action).toBe("reject");
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 6: Full validation when WebRTC blocking is enabled", () => {
    it("should pass full validation when WebRTC blocking is enabled", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, blockQuic) => {
          const config = generateSingBoxConfig(true, blockQuic, routeMode);
          const validation = validateWebRTCBlockingConfig(config);

          expect(validation.valid).toBe(true);
          if (!validation.valid) {
            console.log("Validation errors:", validation.errors);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 6: WebRTC blocking disabled behavior", () => {
    it("should not have WebRTC port blocking rule when disabled", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, blockQuic) => {
          const config = generateSingBoxConfig(false, blockQuic, routeMode);

          const portBlockRule = config.route.rules.find(
            (r) =>
              r.port !== undefined &&
              Array.isArray(r.port) &&
              (r.port as number[]).includes(3478)
          );
          expect(portBlockRule).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });

    it("should not have WebRTC domain blocking rule when disabled", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, blockQuic) => {
          const config = generateSingBoxConfig(false, blockQuic, routeMode);

          const domainBlockRule = config.route.rules.find(
            (r) =>
              r.domain_suffix !== undefined &&
              r.action === "reject" &&
              r.domain_suffix.some((d) => d.includes("stun"))
          );
          expect(domainBlockRule).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });

    it("should pass validation when WebRTC blocking is disabled", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, blockQuic) => {
          const config = generateSingBoxConfig(false, blockQuic, routeMode);
          const validation = validateWebRTCBlockingDisabledConfig(config);

          expect(validation.valid).toBe(true);
          if (!validation.valid) {
            console.log("Validation errors:", validation.errors);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("WebRTC blocking interaction with other settings", () => {
    it("WebRTC blocking should be independent of QUIC blocking", () => {
      fc.assert(
        fc.property(routeModeArb, (routeMode) => {
          // WebRTC enabled, QUIC disabled
          const config1 = generateSingBoxConfig(true, false, routeMode);
          const webrtcRule1 = config1.route.rules.find(
            (r) =>
              r.port !== undefined &&
              Array.isArray(r.port) &&
              (r.port as number[]).includes(3478)
          );
          expect(webrtcRule1).toBeDefined();

          // WebRTC enabled, QUIC enabled
          const config2 = generateSingBoxConfig(true, true, routeMode);
          const webrtcRule2 = config2.route.rules.find(
            (r) =>
              r.port !== undefined &&
              Array.isArray(r.port) &&
              (r.port as number[]).includes(3478)
          );
          expect(webrtcRule2).toBeDefined();
        }),
        { numRuns: 100 }
      );
    });

    it("WebRTC blocking should work with all route modes", () => {
      fc.assert(
        fc.property(booleanArb, (blockQuic) => {
          for (const routeMode of ["rule", "global", "direct"] as RouteMode[]) {
            const config = generateSingBoxConfig(true, blockQuic, routeMode);
            const validation = validateWebRTCBlockingConfig(config);
            expect(validation.valid).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("WebRTC port coverage", () => {
    it("should block standard STUN port (3478)", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, blockQuic) => {
          const config = generateSingBoxConfig(true, blockQuic, routeMode);

          const portBlockRule = config.route.rules.find(
            (r) =>
              r.port !== undefined &&
              Array.isArray(r.port) &&
              r.action === "reject"
          );
          expect(portBlockRule).toBeDefined();
          expect((portBlockRule!.port as number[])).toContain(3478);
        }),
        { numRuns: 100 }
      );
    });

    it("should block STUN over TLS port (5349)", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, blockQuic) => {
          const config = generateSingBoxConfig(true, blockQuic, routeMode);

          const portBlockRule = config.route.rules.find(
            (r) =>
              r.port !== undefined &&
              Array.isArray(r.port) &&
              r.action === "reject"
          );
          expect(portBlockRule).toBeDefined();
          expect((portBlockRule!.port as number[])).toContain(5349);
        }),
        { numRuns: 100 }
      );
    });

    it("should block Google STUN port (19302)", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, blockQuic) => {
          const config = generateSingBoxConfig(true, blockQuic, routeMode);

          const portBlockRule = config.route.rules.find(
            (r) =>
              r.port !== undefined &&
              Array.isArray(r.port) &&
              r.action === "reject"
          );
          expect(portBlockRule).toBeDefined();
          expect((portBlockRule!.port as number[])).toContain(19302);
        }),
        { numRuns: 100 }
      );
    });
  });
});
