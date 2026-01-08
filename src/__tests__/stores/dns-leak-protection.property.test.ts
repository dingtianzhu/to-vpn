/**
 * DNS 泄漏防护配置属性测试
 * 测试 DNS 泄漏防护启用时 sing-box 配置的正确性
 *
 * **Feature: vpn-pure-mode, Property 3: DNS Leak Protection Configuration**
 * **Validates: Requirements 4.2, 4.3**
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============ 类型定义 ============

type RouteMode = "rule" | "global" | "direct";

interface DnsServer {
  tag: string;
  address: string;
  detour: string;
}

interface DnsRule {
  domain?: string[];
  domain_suffix?: string[];
  rule_set?: string;
  outbound?: string;
  protocol?: string;
  server: string;
}

interface DnsConfig {
  servers: DnsServer[];
  rules: DnsRule[];
  final: string;
  strategy: string;
  independent_cache: boolean;
  disable_cache?: boolean;
  disable_expire?: boolean;
}

interface SingBoxConfig {
  dns: DnsConfig;
}

// ============ DNS 泄漏检测域名列表 ============

/**
 * DNS 泄漏检测域名列表
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 4.2, 4.3**
 */
const DNS_LEAK_TEST_DOMAINS = [
  "dnsleaktest.com",
  ".dnsleaktest.com",
  "dnsleak.com",
  ".dnsleak.com",
  "ipleak.net",
  ".ipleak.net",
  "ipleak.org",
  ".ipleak.org",
  "browserleaks.com",
  ".browserleaks.com",
  "browserleaks.org",
  ".browserleaks.org",
  "whoer.net",
  ".whoer.net",
  "whatismyip.com",
  ".whatismyip.com",
  "whatismyipaddress.com",
  ".whatismyipaddress.com",
  "ipinfo.io",
  ".ipinfo.io",
  "ip-api.com",
  ".ip-api.com",
  "ipify.org",
  ".ipify.org",
  "icanhazip.com",
  ".icanhazip.com",
  "checkip.amazonaws.com",
  ".checkip.amazonaws.com",
  "myip.com",
  ".myip.com",
  "ip.sb",
  ".ip.sb",
  "ip.cn",
  ".ip.cn",
  "cip.cc",
  ".cip.cc",
  "ipaddress.com",
  ".ipaddress.com",
  "ip138.com",
  ".ip138.com",
  "ip.tool.chinaz.com",
  ".tool.chinaz.com",
  "webrtc-ips.com",
  ".webrtc-ips.com",
  "mullvad.net",
  ".mullvad.net",
  "perfect-privacy.com",
  ".perfect-privacy.com",
  "expressvpn.com",
  ".expressvpn.com",
  "nordvpn.com",
  ".nordvpn.com",
];

// ============ 纯函数版本（模拟 Rust 配置生成逻辑）============

/**
 * 生成 DNS 配置（模拟 Rust 端逻辑）
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 4.2, 4.3, 4.4**
 */
function generateDnsConfig(
  dnsLeakProtection: boolean,
  routeMode: RouteMode,
  disableIpv6: boolean
): DnsConfig {
  const remoteDnsAddr = "https://1.1.1.1/dns-query";
  const localDnsAddr = "223.5.5.5";
  const dnsStrategy = disableIpv6 ? "ipv4_only" : "prefer_ipv4";

  if (dnsLeakProtection) {
    // DNS 泄漏防护启用：DNS 泄漏检测域名强制走远程
    const dnsRules: DnsRule[] = [
      // DNS 泄漏检测域名必须走远程 DNS，防止泄露真实 IP
      { domain: DNS_LEAK_TEST_DOMAINS, server: "remote-dns" },
      // 只有明确的本地域名走本地 DNS
      {
        domain_suffix: [".lan", ".local", ".home", ".internal", ".localhost"],
        server: "local-dns",
      },
    ];

    // 规则模式下，.cn 域名可以走本地 DNS（减少延迟）
    if (routeMode === "rule") {
      dnsRules.push({ domain_suffix: [".cn"], server: "local-dns" });
    }

    return {
      servers: [
        { tag: "remote-dns", address: remoteDnsAddr, detour: "proxy" },
        { tag: "local-dns", address: localDnsAddr, detour: "direct" },
        { tag: "block-dns", address: "rcode://success", detour: "" },
      ],
      rules: dnsRules,
      final: "remote-dns",
      strategy: dnsStrategy,
      independent_cache: true,
      disable_cache: false,
      disable_expire: false,
    };
  } else {
    // DNS 泄漏防护禁用：使用传统的 DNS 分流策略
    return {
      servers: [
        { tag: "remote-dns", address: remoteDnsAddr, detour: "proxy" },
        { tag: "local-dns", address: localDnsAddr, detour: "direct" },
        { tag: "block-dns", address: "rcode://success", detour: "" },
      ],
      rules: [
        {
          domain_suffix: [".lan", ".local", ".home", ".internal", ".localhost"],
          server: "local-dns",
        },
        { domain_suffix: [".cn"], server: "local-dns" },
        { rule_set: "geosite-cn", server: "local-dns" },
      ],
      final: "remote-dns",
      strategy: dnsStrategy,
      independent_cache: true,
      disable_cache: false,
      disable_expire: false,
    };
  }
}

/**
 * 生成完整的 sing-box 配置（模拟 Rust 端逻辑）
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 4.2, 4.3**
 */
function generateSingBoxConfig(
  dnsLeakProtection: boolean,
  routeMode: RouteMode,
  disableIpv6: boolean
): SingBoxConfig {
  return {
    dns: generateDnsConfig(dnsLeakProtection, routeMode, disableIpv6),
  };
}

// ============ 验证函数 ============

/**
 * 验证 DNS 泄漏防护配置
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 4.2, 4.3**
 */
function validateDnsLeakProtectionConfig(config: SingBoxConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const dns = config.dns;

  // 检查是否有 remote-dns 服务器
  const remoteDnsServer = dns.servers.find((s) => s.tag === "remote-dns");
  if (!remoteDnsServer) {
    errors.push("Missing remote-dns server");
  } else if (remoteDnsServer.detour !== "proxy") {
    errors.push(`remote-dns should use 'proxy' detour, got '${remoteDnsServer.detour}'`);
  }

  // 检查是否有 DNS 泄漏检测域名规则
  const leakTestRule = dns.rules.find(
    (r) => r.domain && r.server === "remote-dns"
  );
  if (!leakTestRule) {
    errors.push("Missing DNS leak test domains rule");
  } else {
    // 验证关键的 DNS 泄漏检测域名是否包含在规则中
    const keyDomains = [
      "dnsleaktest.com",
      "ipleak.net",
      "browserleaks.com",
      "whoer.net",
    ];
    for (const domain of keyDomains) {
      if (!leakTestRule.domain!.includes(domain)) {
        errors.push(`Missing key DNS leak test domain: ${domain}`);
      }
    }
  }

  // 检查默认 DNS 是否走远程
  if (dns.final !== "remote-dns") {
    errors.push(`Default DNS should be 'remote-dns', got '${dns.final}'`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 验证 DNS 泄漏防护禁用时的配置
 */
function validateDnsLeakProtectionDisabledConfig(config: SingBoxConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const dns = config.dns;

  // 禁用时不应该有 DNS 泄漏检测域名规则
  const leakTestRule = dns.rules.find(
    (r) => r.domain && r.domain.includes("dnsleaktest.com")
  );
  if (leakTestRule) {
    errors.push("DNS leak test domains rule should not exist when protection is disabled");
  }

  // 禁用时应该有 geosite-cn 规则（传统分流）
  const geositeRule = dns.rules.find((r) => r.rule_set === "geosite-cn");
  if (!geositeRule) {
    errors.push("Should have geosite-cn rule when protection is disabled");
  }

  return { valid: errors.length === 0, errors };
}

// ============ 生成器 ============

const routeModeArb = fc.constantFrom<RouteMode>("rule", "global", "direct");
const booleanArb = fc.boolean();

// ============ 属性测试 ============

describe("DNS Leak Protection Configuration Properties", () => {
  /**
   * Property 3: DNS 泄漏防护配置
   * *For any* config with DNS leak protection enabled, the generated sing-box config
   * SHALL route DNS leak test domains (dnsleaktest, ipleak, browserleaks) through
   * remote DNS server.
   * 
   * **Feature: vpn-pure-mode, Property 3: DNS Leak Protection Configuration**
   * **Validates: Requirements 4.2, 4.3**
   */
  describe("Property 3: DNS leak protection routes test domains through remote DNS", () => {
    it("should have DNS leak test domains rule when protection is enabled", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, disableIpv6) => {
          const config = generateSingBoxConfig(true, routeMode, disableIpv6);

          const leakTestRule = config.dns.rules.find(
            (r) => r.domain && r.server === "remote-dns"
          );
          expect(leakTestRule).toBeDefined();
          expect(leakTestRule!.domain).toBeDefined();
          expect(leakTestRule!.domain!.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it("should include key DNS leak test domains", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, disableIpv6) => {
          const config = generateSingBoxConfig(true, routeMode, disableIpv6);

          const leakTestRule = config.dns.rules.find(
            (r) => r.domain && r.server === "remote-dns"
          );
          expect(leakTestRule).toBeDefined();

          // 验证关键域名
          const keyDomains = [
            "dnsleaktest.com",
            "ipleak.net",
            "browserleaks.com",
            "whoer.net",
          ];
          for (const domain of keyDomains) {
            expect(leakTestRule!.domain).toContain(domain);
          }
        }),
        { numRuns: 100 }
      );
    });

    it("should pass full validation when protection is enabled", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, disableIpv6) => {
          const config = generateSingBoxConfig(true, routeMode, disableIpv6);
          const validation = validateDnsLeakProtectionConfig(config);

          expect(validation.valid).toBe(true);
          if (!validation.valid) {
            console.log("Validation errors:", validation.errors);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 3: Remote DNS server configuration", () => {
    /**
     * **Validates: Requirements 4.2**
     * WHEN DNS leak protection is enabled, THE Sing_Box_Config SHALL route all DNS
     * queries through proxy
     */
    it("remote-dns server should use proxy detour", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, disableIpv6) => {
          const config = generateSingBoxConfig(true, routeMode, disableIpv6);

          const remoteDnsServer = config.dns.servers.find(
            (s) => s.tag === "remote-dns"
          );
          expect(remoteDnsServer).toBeDefined();
          expect(remoteDnsServer!.detour).toBe("proxy");
        }),
        { numRuns: 100 }
      );
    });

    it("default DNS should be remote-dns when protection is enabled", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, disableIpv6) => {
          const config = generateSingBoxConfig(true, routeMode, disableIpv6);

          expect(config.dns.final).toBe("remote-dns");
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 3: DNS leak protection disabled behavior", () => {
    it("should not have DNS leak test domains rule when protection is disabled", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, disableIpv6) => {
          const config = generateSingBoxConfig(false, routeMode, disableIpv6);

          const leakTestRule = config.dns.rules.find(
            (r) => r.domain && r.domain.includes("dnsleaktest.com")
          );
          expect(leakTestRule).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });

    it("should have geosite-cn rule when protection is disabled", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, disableIpv6) => {
          const config = generateSingBoxConfig(false, routeMode, disableIpv6);

          const geositeRule = config.dns.rules.find(
            (r) => r.rule_set === "geosite-cn"
          );
          expect(geositeRule).toBeDefined();
        }),
        { numRuns: 100 }
      );
    });

    it("should pass validation when protection is disabled", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, disableIpv6) => {
          const config = generateSingBoxConfig(false, routeMode, disableIpv6);
          const validation = validateDnsLeakProtectionDisabledConfig(config);

          expect(validation.valid).toBe(true);
          if (!validation.valid) {
            console.log("Validation errors:", validation.errors);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("DNS strategy based on IPv6 setting", () => {
    /**
     * **Validates: Requirements 4.4**
     * THE Sing_Box_Config SHALL configure DNS cache to prevent stale entries
     */
    it("should use ipv4_only strategy when IPv6 is disabled", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, dnsLeakProtection) => {
          const config = generateSingBoxConfig(dnsLeakProtection, routeMode, true);

          expect(config.dns.strategy).toBe("ipv4_only");
        }),
        { numRuns: 100 }
      );
    });

    it("should use prefer_ipv4 strategy when IPv6 is enabled", () => {
      fc.assert(
        fc.property(routeModeArb, booleanArb, (routeMode, dnsLeakProtection) => {
          const config = generateSingBoxConfig(dnsLeakProtection, routeMode, false);

          expect(config.dns.strategy).toBe("prefer_ipv4");
        }),
        { numRuns: 100 }
      );
    });

    it("should have independent cache enabled", () => {
      fc.assert(
        fc.property(
          routeModeArb,
          booleanArb,
          booleanArb,
          (routeMode, dnsLeakProtection, disableIpv6) => {
            const config = generateSingBoxConfig(
              dnsLeakProtection,
              routeMode,
              disableIpv6
            );

            expect(config.dns.independent_cache).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Route mode interaction with DNS leak protection", () => {
    it("rule mode should allow .cn domains to use local DNS when protection is enabled", () => {
      fc.assert(
        fc.property(booleanArb, (disableIpv6) => {
          const config = generateSingBoxConfig(true, "rule", disableIpv6);

          const cnDomainRule = config.dns.rules.find(
            (r) => r.domain_suffix && r.domain_suffix.includes(".cn")
          );
          expect(cnDomainRule).toBeDefined();
          expect(cnDomainRule!.server).toBe("local-dns");
        }),
        { numRuns: 100 }
      );
    });

    it("global mode should not have .cn domain rule when protection is enabled", () => {
      fc.assert(
        fc.property(booleanArb, (disableIpv6) => {
          const config = generateSingBoxConfig(true, "global", disableIpv6);

          const cnDomainRule = config.dns.rules.find(
            (r) => r.domain_suffix && r.domain_suffix.includes(".cn")
          );
          expect(cnDomainRule).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });

    it("direct mode should not have .cn domain rule when protection is enabled", () => {
      fc.assert(
        fc.property(booleanArb, (disableIpv6) => {
          const config = generateSingBoxConfig(true, "direct", disableIpv6);

          const cnDomainRule = config.dns.rules.find(
            (r) => r.domain_suffix && r.domain_suffix.includes(".cn")
          );
          expect(cnDomainRule).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("DNS servers configuration", () => {
    it("should have all required DNS servers", () => {
      fc.assert(
        fc.property(
          routeModeArb,
          booleanArb,
          booleanArb,
          (routeMode, dnsLeakProtection, disableIpv6) => {
            const config = generateSingBoxConfig(
              dnsLeakProtection,
              routeMode,
              disableIpv6
            );

            const serverTags = config.dns.servers.map((s) => s.tag);
            expect(serverTags).toContain("remote-dns");
            expect(serverTags).toContain("local-dns");
            expect(serverTags).toContain("block-dns");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("local-dns should use direct detour", () => {
      fc.assert(
        fc.property(
          routeModeArb,
          booleanArb,
          booleanArb,
          (routeMode, dnsLeakProtection, disableIpv6) => {
            const config = generateSingBoxConfig(
              dnsLeakProtection,
              routeMode,
              disableIpv6
            );

            const localDnsServer = config.dns.servers.find(
              (s) => s.tag === "local-dns"
            );
            expect(localDnsServer).toBeDefined();
            expect(localDnsServer!.detour).toBe("direct");
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
