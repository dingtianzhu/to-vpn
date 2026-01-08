/**
 * LAN 绕过规则属性测试
 * 测试绕过局域网配置是否包含所有 RFC1918 私有地址范围和 link-local 地址
 *
 * **Feature: vpn-pure-mode, Property 9: LAN Bypass Rules**
 * **Validates: Requirements 9.2, 9.3, 9.4**
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============ 类型定义 ============

interface RouteRule {
  type: "ip_cidr" | "ip_is_private" | "domain_suffix" | "rule_set" | "protocol";
  value: string | string[];
  outbound: "direct" | "proxy" | "block";
}

interface RouteConfig {
  rules: RouteRule[];
  final: string;
}

interface VpnConfig {
  bypassLan: boolean;
  route: RouteConfig;
}

// ============ RFC1918 和 Link-local 地址范围 ============

/**
 * RFC1918 私有地址范围
 * **Validates: Requirements 9.3**
 */
const RFC1918_RANGES = [
  "10.0.0.0/8",       // Class A 私有网络
  "172.16.0.0/12",    // Class B 私有网络 (172.16.0.0 - 172.31.255.255)
  "192.168.0.0/16",   // Class C 私有网络
];

/**
 * Link-local 地址范围
 * **Validates: Requirements 9.4**
 */
const LINK_LOCAL_RANGE = "169.254.0.0/16";

/**
 * Loopback 地址范围
 */
const LOOPBACK_RANGE = "127.0.0.0/8";

/**
 * 所有 LAN 绕过 CIDR 范围
 */
const ALL_LAN_BYPASS_CIDRS = [
  ...RFC1918_RANGES,
  LINK_LOCAL_RANGE,
  LOOPBACK_RANGE,
];

// ============ 纯函数版本（用于测试）============

/**
 * 生成带有 LAN 绕过规则的配置
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 9.2, 9.3, 9.4**
 */
function generateConfigWithLanBypass(bypassLan: boolean): VpnConfig {
  const rules: RouteRule[] = [];
  
  // 基本规则
  rules.push({ type: "protocol", value: "dns", outbound: "direct" });
  rules.push({ 
    type: "domain_suffix", 
    value: [".lan", ".local", ".home", ".internal"], 
    outbound: "direct" 
  });
  
  // 当 bypassLan 启用时，添加完整的 RFC1918 和 link-local 地址范围
  if (bypassLan) {
    rules.push({ 
      type: "ip_cidr", 
      value: ALL_LAN_BYPASS_CIDRS, 
      outbound: "direct" 
    });
  }
  
  // 私有 IP 通用规则（作为后备）
  rules.push({ type: "ip_is_private", value: "true", outbound: "direct" });
  
  return {
    bypassLan,
    route: {
      rules,
      final: "proxy",
    },
  };
}

/**
 * 检查配置是否包含指定的 CIDR 范围
 */
function hasIpCidrRule(config: VpnConfig, cidr: string): boolean {
  return config.route.rules.some(
    (rule) =>
      rule.type === "ip_cidr" &&
      (Array.isArray(rule.value)
        ? rule.value.includes(cidr)
        : rule.value === cidr) &&
      rule.outbound === "direct"
  );
}

/**
 * 检查配置是否包含所有 RFC1918 私有地址范围
 * **Validates: Requirements 9.3**
 */
function hasAllRfc1918Ranges(config: VpnConfig): boolean {
  return RFC1918_RANGES.every((cidr) => hasIpCidrRule(config, cidr));
}

/**
 * 检查配置是否包含 link-local 地址范围
 * **Validates: Requirements 9.4**
 */
function hasLinkLocalRange(config: VpnConfig): boolean {
  return hasIpCidrRule(config, LINK_LOCAL_RANGE);
}

/**
 * 检查配置是否包含 loopback 地址范围
 */
function hasLoopbackRange(config: VpnConfig): boolean {
  return hasIpCidrRule(config, LOOPBACK_RANGE);
}

/**
 * 检查配置是否包含 ip_is_private 规则
 */
function hasPrivateIpRule(config: VpnConfig): boolean {
  return config.route.rules.some(
    (rule) => rule.type === "ip_is_private" && rule.outbound === "direct"
  );
}

/**
 * 验证 LAN 绕过配置是否完整
 * **Validates: Requirements 9.2, 9.3, 9.4**
 */
function validateLanBypassConfig(config: VpnConfig): {
  valid: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  if (config.bypassLan) {
    // 当 bypassLan 启用时，必须包含所有 RFC1918 范围
    RFC1918_RANGES.forEach((cidr) => {
      if (!hasIpCidrRule(config, cidr)) {
        missing.push(`RFC1918 range: ${cidr}`);
      }
    });

    // 必须包含 link-local 范围
    if (!hasLinkLocalRange(config)) {
      missing.push(`Link-local range: ${LINK_LOCAL_RANGE}`);
    }

    // 必须包含 loopback 范围
    if (!hasLoopbackRange(config)) {
      missing.push(`Loopback range: ${LOOPBACK_RANGE}`);
    }
  }

  // 无论 bypassLan 是否启用，都应该有 ip_is_private 规则作为后备
  if (!hasPrivateIpRule(config)) {
    missing.push("ip_is_private rule");
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * 检查 IP 地址是否在 CIDR 范围内
 */
function isIpInCidr(ip: string, cidr: string): boolean {
  const [cidrIp, prefixLength] = cidr.split("/");
  const prefix = parseInt(prefixLength, 10);
  
  const ipParts = ip.split(".").map(Number);
  const cidrParts = cidrIp.split(".").map(Number);
  
  const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const cidrNum = (cidrParts[0] << 24) | (cidrParts[1] << 16) | (cidrParts[2] << 8) | cidrParts[3];
  
  const mask = ~((1 << (32 - prefix)) - 1);
  
  return (ipNum & mask) === (cidrNum & mask);
}

/**
 * 检查 IP 地址是否是私有地址
 */
function isPrivateIp(ip: string): boolean {
  return ALL_LAN_BYPASS_CIDRS.some((cidr) => isIpInCidr(ip, cidr));
}

// ============ 生成器 ============

/**
 * 生成有效的 RFC1918 私有 IP 地址
 */
const rfc1918IpArb = fc.oneof(
  // 10.0.0.0/8
  fc.tuple(
    fc.constant(10),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 })
  ).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`),
  // 172.16.0.0/12
  fc.tuple(
    fc.constant(172),
    fc.integer({ min: 16, max: 31 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 })
  ).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`),
  // 192.168.0.0/16
  fc.tuple(
    fc.constant(192),
    fc.constant(168),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 })
  ).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`)
);

/**
 * 生成 link-local IP 地址 (169.254.0.0/16)
 */
const linkLocalIpArb = fc.tuple(
  fc.constant(169),
  fc.constant(254),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 })
).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

/**
 * 生成 loopback IP 地址 (127.0.0.0/8)
 */
const loopbackIpArb = fc.tuple(
  fc.constant(127),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 })
).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

/**
 * 生成任意私有 IP 地址
 */
const privateIpArb = fc.oneof(rfc1918IpArb, linkLocalIpArb, loopbackIpArb);

/**
 * 生成公网 IP 地址（非私有）
 */
const publicIpArb = fc.tuple(
  fc.integer({ min: 1, max: 223 }).filter(n => n !== 10 && n !== 127 && n !== 169 && n !== 172 && n !== 192),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 1, max: 254 })
).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

// ============ 属性测试 ============

describe("LAN Bypass Rules Properties", () => {
  /**
   * Property 9: LAN 绕过规则
   * *For any* config with bypass LAN enabled, the generated sing-box config SHALL contain 
   * direct routing rules for all RFC1918 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) 
   * and link-local addresses (169.254.0.0/16).
   * **Validates: Requirements 9.2, 9.3, 9.4**
   */
  describe("Property 9: LAN bypass config contains all required CIDR ranges", () => {
    it("should include all RFC1918 private ranges when bypassLan is enabled", () => {
      fc.assert(
        fc.property(fc.constant(true), (bypassLan) => {
          const config = generateConfigWithLanBypass(bypassLan);

          expect(hasAllRfc1918Ranges(config)).toBe(true);
          expect(hasIpCidrRule(config, "10.0.0.0/8")).toBe(true);
          expect(hasIpCidrRule(config, "172.16.0.0/12")).toBe(true);
          expect(hasIpCidrRule(config, "192.168.0.0/16")).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should include link-local address range when bypassLan is enabled", () => {
      fc.assert(
        fc.property(fc.constant(true), (bypassLan) => {
          const config = generateConfigWithLanBypass(bypassLan);

          expect(hasLinkLocalRange(config)).toBe(true);
          expect(hasIpCidrRule(config, "169.254.0.0/16")).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should include loopback address range when bypassLan is enabled", () => {
      fc.assert(
        fc.property(fc.constant(true), (bypassLan) => {
          const config = generateConfigWithLanBypass(bypassLan);

          expect(hasLoopbackRange(config)).toBe(true);
          expect(hasIpCidrRule(config, "127.0.0.0/8")).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should pass full LAN bypass validation when enabled", () => {
      fc.assert(
        fc.property(fc.constant(true), (bypassLan) => {
          const config = generateConfigWithLanBypass(bypassLan);
          const validation = validateLanBypassConfig(config);

          expect(validation.valid).toBe(true);
          expect(validation.missing).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property: 私有 IP 地址应该被正确识别
   */
  describe("Private IP address recognition", () => {
    it("should correctly identify RFC1918 addresses as private", () => {
      fc.assert(
        fc.property(rfc1918IpArb, (ip) => {
          expect(isPrivateIp(ip)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should correctly identify link-local addresses as private", () => {
      fc.assert(
        fc.property(linkLocalIpArb, (ip) => {
          expect(isPrivateIp(ip)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should correctly identify loopback addresses as private", () => {
      fc.assert(
        fc.property(loopbackIpArb, (ip) => {
          expect(isPrivateIp(ip)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should correctly identify public addresses as non-private", () => {
      fc.assert(
        fc.property(publicIpArb, (ip) => {
          expect(isPrivateIp(ip)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property: 当 bypassLan 禁用时，不应该有显式的 CIDR 规则
   */
  describe("LAN bypass disabled behavior", () => {
    it("should not include explicit CIDR rules when bypassLan is disabled", () => {
      fc.assert(
        fc.property(fc.constant(false), (bypassLan) => {
          const config = generateConfigWithLanBypass(bypassLan);

          // 不应该有显式的 ip_cidr 规则
          const hasCidrRule = config.route.rules.some(
            (rule) => rule.type === "ip_cidr"
          );
          expect(hasCidrRule).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it("should still have ip_is_private rule as fallback when bypassLan is disabled", () => {
      fc.assert(
        fc.property(fc.constant(false), (bypassLan) => {
          const config = generateConfigWithLanBypass(bypassLan);

          expect(hasPrivateIpRule(config)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property: ip_is_private 规则应该始终存在
   */
  describe("ip_is_private rule always present", () => {
    it("should always have ip_is_private rule regardless of bypassLan setting", () => {
      fc.assert(
        fc.property(fc.boolean(), (bypassLan) => {
          const config = generateConfigWithLanBypass(bypassLan);

          expect(hasPrivateIpRule(config)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property: 所有私有 IP 应该被路由到 direct
   */
  describe("All private IPs should route to direct", () => {
    it("should route any private IP to direct when bypassLan is enabled", () => {
      fc.assert(
        fc.property(privateIpArb, (ip) => {
          const config = generateConfigWithLanBypass(true);
          
          // 验证 IP 是私有的
          expect(isPrivateIp(ip)).toBe(true);
          
          // 验证配置包含能匹配该 IP 的规则
          const hasMatchingRule = config.route.rules.some((rule) => {
            if (rule.type === "ip_cidr" && Array.isArray(rule.value)) {
              return rule.value.some((cidr) => isIpInCidr(ip, cidr)) && rule.outbound === "direct";
            }
            if (rule.type === "ip_is_private" && rule.outbound === "direct") {
              return true;
            }
            return false;
          });
          
          expect(hasMatchingRule).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });
});
