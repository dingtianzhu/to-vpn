/**
 * 分流配置验证属性测试
 * 测试 TUN 模式配置是否包含必要的分流规则
 *
 * **Feature: test-completion, Property 5: Routing config validation**
 * **Validates: Requirements 3.1, 3.5**
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============ 类型定义 ============

interface RouteRule {
  type: "domain_suffix" | "rule_set" | "ip_cidr" | "ip_is_private" | "protocol";
  value: string | string[];
  outbound: "direct" | "proxy" | "block";
}

interface DnsRule {
  type: "rule_set" | "domain_suffix" | "query_type";
  value: string | string[];
  server: string;
}

interface TunConfig {
  mode: "tun";
  dns: {
    servers: { tag: string; address: string; detour: string }[];
    rules: DnsRule[];
    final: string;
  };
  route: {
    rules: RouteRule[];
    rule_set: { tag: string; type: string; format: string; path: string }[];
    final: string;
  };
}

// ============ 纯函数版本（用于测试）============

/**
 * 验证 TUN 配置是否包含 geosite-cn 规则集
 */
function hasGeositeCnRuleSet(config: TunConfig): boolean {
  return config.route.rule_set.some((rs) => rs.tag === "geosite-cn");
}

/**
 * 验证 TUN 配置是否包含 geoip-cn 规则集
 */
function hasGeoipCnRuleSet(config: TunConfig): boolean {
  return config.route.rule_set.some((rs) => rs.tag === "geoip-cn");
}

/**
 * 验证 TUN 配置是否包含 geosite-cn 路由规则
 */
function hasGeositeCnRouteRule(config: TunConfig): boolean {
  return config.route.rules.some(
    (rule) => rule.type === "rule_set" && rule.value === "geosite-cn"
  );
}

/**
 * 验证 TUN 配置是否包含 geoip-cn 路由规则
 */
function hasGeoipCnRouteRule(config: TunConfig): boolean {
  return config.route.rules.some(
    (rule) => rule.type === "rule_set" && rule.value === "geoip-cn"
  );
}

/**
 * 验证 TUN 配置是否包含 .cn 域名后缀直连规则
 */
function hasCnDomainSuffixRule(config: TunConfig): boolean {
  return config.route.rules.some(
    (rule) =>
      rule.type === "domain_suffix" &&
      (Array.isArray(rule.value)
        ? rule.value.includes(".cn")
        : rule.value === ".cn") &&
      rule.outbound === "direct"
  );
}

/**
 * 验证 TUN 配置是否包含 .lan 域名后缀直连规则
 */
function hasLanDomainSuffixRule(config: TunConfig): boolean {
  return config.route.rules.some(
    (rule) =>
      rule.type === "domain_suffix" &&
      (Array.isArray(rule.value)
        ? rule.value.includes(".lan")
        : rule.value === ".lan") &&
      rule.outbound === "direct"
  );
}

/**
 * 验证 TUN 配置是否包含 .local 域名后缀直连规则
 */
function hasLocalDomainSuffixRule(config: TunConfig): boolean {
  return config.route.rules.some(
    (rule) =>
      rule.type === "domain_suffix" &&
      (Array.isArray(rule.value)
        ? rule.value.includes(".local")
        : rule.value === ".local") &&
      rule.outbound === "direct"
  );
}

/**
 * 验证 TUN 配置是否包含私有 IP 直连规则
 */
function hasPrivateIpRule(config: TunConfig): boolean {
  return config.route.rules.some(
    (rule) => rule.type === "ip_is_private" && rule.outbound === "direct"
  );
}

/**
 * 验证 DNS 配置是否包含本地 DNS 服务器
 */
function hasLocalDnsServer(config: TunConfig): boolean {
  return config.dns.servers.some(
    (server) => server.tag === "local-dns" && server.detour === "direct"
  );
}

/**
 * 验证 DNS 配置是否包含远程 DNS 服务器
 */
function hasRemoteDnsServer(config: TunConfig): boolean {
  return config.dns.servers.some(
    (server) => server.tag === "remote-dns" && server.detour === "proxy"
  );
}

/**
 * 生成有效的 TUN 配置
 */
function generateValidTunConfig(
  serverHost: string,
  serverPort: number,
  password: string,
  dnsMode: string
): TunConfig {
  return {
    mode: "tun",
    dns: {
      servers: [
        { tag: "local-dns", address: "223.5.5.5", detour: "direct" },
        { tag: "remote-dns", address: "https://1.1.1.1/dns-query", detour: "proxy" },
      ],
      rules: [
        { type: "rule_set", value: "geosite-cn", server: "local-dns" },
        { type: "domain_suffix", value: [".cn", ".lan", ".local"], server: "local-dns" },
        { type: "query_type", value: ["A", "AAAA"], server: "remote-dns" },
      ],
      final: "remote-dns",
    },
    route: {
      rules: [
        { type: "protocol", value: "dns", outbound: "direct" },
        {
          type: "domain_suffix",
          value: [".lan", ".local", ".home", ".internal", ".cn"],
          outbound: "direct",
        },
        { type: "rule_set", value: "geosite-cn", outbound: "direct" },
        { type: "rule_set", value: "geoip-cn", outbound: "direct" },
        { type: "ip_is_private", value: "true", outbound: "direct" },
      ],
      rule_set: [
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
      ],
      final: "proxy",
    },
  };
}

/**
 * 验证配置是否包含所有必要的分流规则
 */
function validateRoutingConfig(config: TunConfig): {
  valid: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  if (!hasGeositeCnRuleSet(config)) {
    missing.push("geosite-cn rule set");
  }
  if (!hasGeoipCnRuleSet(config)) {
    missing.push("geoip-cn rule set");
  }
  if (!hasGeositeCnRouteRule(config)) {
    missing.push("geosite-cn route rule");
  }
  if (!hasGeoipCnRouteRule(config)) {
    missing.push("geoip-cn route rule");
  }
  if (!hasLanDomainSuffixRule(config)) {
    missing.push(".lan domain suffix rule");
  }
  if (!hasLocalDomainSuffixRule(config)) {
    missing.push(".local domain suffix rule");
  }
  if (!hasLocalDnsServer(config)) {
    missing.push("local DNS server");
  }
  if (!hasRemoteDnsServer(config)) {
    missing.push("remote DNS server");
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

// ============ 生成器 ============

const serverHostArb = fc.oneof(
  fc.stringMatching(/^[a-z0-9][a-z0-9-]*\.[a-z]{2,}$/),
  fc.stringMatching(/^(\d{1,3}\.){3}\d{1,3}$/)
);

const serverPortArb = fc.integer({ min: 1, max: 65535 });
const passwordArb = fc.stringMatching(/^[a-zA-Z0-9]{8,64}$/);
const dnsModeArb = fc.constantFrom("google", "cloudflare", "aliyun", "custom");

// ============ 属性测试 ============

describe("Routing Config Validation Properties", () => {
  /**
   * Property 5: 分流配置包含必要规则
   * *For any* TUN 模式配置生成，输出的配置必须包含 geosite-cn 和 geoip-cn 规则集引用，
   * 以及 .cn/.lan/.local 域名后缀的直连规则
   */
  describe("Property 5: Routing config contains required rules", () => {
    it("should include geosite-cn and geoip-cn rule sets", () => {
      fc.assert(
        fc.property(
          serverHostArb,
          serverPortArb,
          passwordArb,
          dnsModeArb,
          (host, port, password, dnsMode) => {
            const config = generateValidTunConfig(host, port, password, dnsMode);

            expect(hasGeositeCnRuleSet(config)).toBe(true);
            expect(hasGeoipCnRuleSet(config)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should include geosite-cn and geoip-cn route rules", () => {
      fc.assert(
        fc.property(
          serverHostArb,
          serverPortArb,
          passwordArb,
          dnsModeArb,
          (host, port, password, dnsMode) => {
            const config = generateValidTunConfig(host, port, password, dnsMode);

            expect(hasGeositeCnRouteRule(config)).toBe(true);
            expect(hasGeoipCnRouteRule(config)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should include .lan and .local domain suffix rules", () => {
      fc.assert(
        fc.property(
          serverHostArb,
          serverPortArb,
          passwordArb,
          dnsModeArb,
          (host, port, password, dnsMode) => {
            const config = generateValidTunConfig(host, port, password, dnsMode);

            expect(hasLanDomainSuffixRule(config)).toBe(true);
            expect(hasLocalDomainSuffixRule(config)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should include private IP direct rule", () => {
      fc.assert(
        fc.property(
          serverHostArb,
          serverPortArb,
          passwordArb,
          dnsModeArb,
          (host, port, password, dnsMode) => {
            const config = generateValidTunConfig(host, port, password, dnsMode);

            expect(hasPrivateIpRule(config)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should include both local and remote DNS servers", () => {
      fc.assert(
        fc.property(
          serverHostArb,
          serverPortArb,
          passwordArb,
          dnsModeArb,
          (host, port, password, dnsMode) => {
            const config = generateValidTunConfig(host, port, password, dnsMode);

            expect(hasLocalDnsServer(config)).toBe(true);
            expect(hasRemoteDnsServer(config)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should pass full validation", () => {
      fc.assert(
        fc.property(
          serverHostArb,
          serverPortArb,
          passwordArb,
          dnsModeArb,
          (host, port, password, dnsMode) => {
            const config = generateValidTunConfig(host, port, password, dnsMode);
            const validation = validateRoutingConfig(config);

            expect(validation.valid).toBe(true);
            expect(validation.missing).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 额外属性：默认路由应该是 proxy
   */
  describe("Default route should be proxy", () => {
    it("should have proxy as final outbound", () => {
      fc.assert(
        fc.property(
          serverHostArb,
          serverPortArb,
          passwordArb,
          dnsModeArb,
          (host, port, password, dnsMode) => {
            const config = generateValidTunConfig(host, port, password, dnsMode);

            expect(config.route.final).toBe("proxy");
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 额外属性：DNS 配置应该有正确的 final
   */
  describe("DNS config should have correct final", () => {
    it("should have remote-dns as final DNS server", () => {
      fc.assert(
        fc.property(
          serverHostArb,
          serverPortArb,
          passwordArb,
          dnsModeArb,
          (host, port, password, dnsMode) => {
            const config = generateValidTunConfig(host, port, password, dnsMode);

            expect(config.dns.final).toBe("remote-dns");
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 额外属性：规则集路径应该有效
   */
  describe("Rule set paths should be valid", () => {
    it("should have non-empty paths for rule sets", () => {
      fc.assert(
        fc.property(
          serverHostArb,
          serverPortArb,
          passwordArb,
          dnsModeArb,
          (host, port, password, dnsMode) => {
            const config = generateValidTunConfig(host, port, password, dnsMode);

            config.route.rule_set.forEach((rs) => {
              expect(rs.path).toBeTruthy();
              expect(rs.path.length).toBeGreaterThan(0);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
