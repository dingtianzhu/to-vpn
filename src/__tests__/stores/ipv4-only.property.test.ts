/**
 * IPv4 Only 策略属性测试
 * 验证配置不包含 IPv6 地址，DNS 策略为 ipv4_only
 *
 * **Feature: vpn-optimization, Property 11: IPv4 Only 策略**
 * **Validates: Requirements - IPv6 禁用**
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============ 类型定义 ============

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
}

interface DnsServer {
  tag: string;
  address: string;
  detour: string;
}

interface DnsRule {
  rule_set?: string;
  domain_suffix?: string[];
  query_type?: string[];
  server: string;
}

interface DnsConfig {
  servers: DnsServer[];
  rules: DnsRule[];
  final: string;
  strategy: string;
  independent_cache: boolean;
}

interface TunConfig {
  mode: "tun";
  inbounds: TunInbound[];
  dns: DnsConfig;
}

// ============ 常量（模拟后端常量）============

const TUN_IPV4_ADDRESS = "172.19.0.1/30";
// IPv6 地址已被移除，不再使用
// const TUN_IPV6_ADDRESS = "fdfe::1/126";

// ============ 配置生成函数（模拟后端逻辑）============

/**
 * 生成 TUN 模式配置
 * 模拟 src-tauri/src/vpn/singbox/tun.rs 的配置生成逻辑
 * 
 * **Feature: vpn-optimization, Property 11: IPv4 Only 策略**
 * **Validates: Requirements - IPv6 禁用**
 */
function generateTunConfig(mtu: number): TunConfig {
  // 验证 MTU 范围
  const validMtu = mtu > 0 && mtu <= 9000 ? mtu : 9000;

  const tunInbound: TunInbound = {
    type: "tun",
    tag: "tun-in",
    // 仅包含 IPv4 地址，不包含 IPv6
    address: [TUN_IPV4_ADDRESS],
    mtu: validMtu,
    auto_route: true,
    strict_route: true,
    stack: "gvisor",
    sniff: true,
    sniff_override_destination: true,
  };

  const dnsConfig: DnsConfig = {
    servers: [
      { tag: "local-dns", address: "223.5.5.5", detour: "direct" },
      { tag: "remote-dns", address: "https://1.1.1.1/dns-query", detour: "proxy" },
    ],
    rules: [
      { rule_set: "geosite-cn", server: "local-dns" },
      { domain_suffix: [".cn", ".lan", ".local"], server: "local-dns" },
      { query_type: ["A", "AAAA"], server: "remote-dns" },
    ],
    final: "remote-dns",
    // 强制只解析 IPv4 地址
    strategy: "ipv4_only",
    independent_cache: true,
  };

  return {
    mode: "tun",
    inbounds: [tunInbound],
    dns: dnsConfig,
  };
}

// ============ 验证函数 ============

/**
 * 检查地址是否为 IPv6 CIDR
 * IPv6 地址包含冒号 (:)
 */
function isIPv6Address(address: string): boolean {
  return address.includes(":");
}

/**
 * 检查地址是否为 IPv4 CIDR
 * IPv4 地址格式: x.x.x.x/prefix
 */
function isIPv4Address(address: string): boolean {
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
  return ipv4Pattern.test(address);
}

/**
 * 检查 TUN 配置是否仅包含 IPv4 地址
 */
function hasOnlyIPv4Addresses(config: TunConfig): boolean {
  const tunInbound = config.inbounds.find((ib) => ib.type === "tun");
  if (!tunInbound) {
    return false;
  }

  // 检查所有地址都是 IPv4
  return tunInbound.address.every((addr) => isIPv4Address(addr) && !isIPv6Address(addr));
}

/**
 * 检查 TUN 配置是否不包含任何 IPv6 地址
 */
function hasNoIPv6Addresses(config: TunConfig): boolean {
  const tunInbound = config.inbounds.find((ib) => ib.type === "tun");
  if (!tunInbound) {
    return true; // 没有 TUN inbound 意味着没有 IPv6
  }

  return !tunInbound.address.some((addr) => isIPv6Address(addr));
}

/**
 * 检查 DNS 策略是否为 ipv4_only
 */
function hasIPv4OnlyDnsStrategy(config: TunConfig): boolean {
  return config.dns.strategy === "ipv4_only";
}

/**
 * 获取 TUN 配置中的地址列表
 */
function getTunAddresses(config: TunConfig): string[] {
  const tunInbound = config.inbounds.find((ib) => ib.type === "tun");
  return tunInbound?.address ?? [];
}

// ============ 生成器 ============

// MTU 值生成器：有效范围 576-9000
const mtuArb = fc.integer({ min: 576, max: 9000 });

// 无效 MTU 值生成器：测试边界情况
const invalidMtuArb = fc.oneof(
  fc.integer({ min: -1000, max: 0 }),
  fc.integer({ min: 9001, max: 20000 })
);

// ============ 属性测试 ============

describe("IPv4 Only Policy Properties", () => {
  /**
   * Property 11: IPv4 Only 策略
   * *For any* 生成的配置，DNS 策略应为 ipv4_only，TUN 网卡地址应仅包含 IPv4 CIDR
   */
  describe("Property 11: IPv4 Only policy", () => {
    it("TUN config should only contain IPv4 addresses", () => {
      fc.assert(
        fc.property(mtuArb, (mtu) => {
          const config = generateTunConfig(mtu);

          // 验证仅包含 IPv4 地址
          expect(hasOnlyIPv4Addresses(config)).toBe(true);
          
          // 验证不包含 IPv6 地址
          expect(hasNoIPv6Addresses(config)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("TUN config should have ipv4_only DNS strategy", () => {
      fc.assert(
        fc.property(mtuArb, (mtu) => {
          const config = generateTunConfig(mtu);

          // 验证 DNS 策略为 ipv4_only
          expect(hasIPv4OnlyDnsStrategy(config)).toBe(true);
          expect(config.dns.strategy).toBe("ipv4_only");
        }),
        { numRuns: 100 }
      );
    });

    it("TUN addresses should not contain IPv6 CIDR patterns", () => {
      fc.assert(
        fc.property(mtuArb, (mtu) => {
          const config = generateTunConfig(mtu);
          const addresses = getTunAddresses(config);

          // 验证没有地址包含冒号（IPv6 特征）
          addresses.forEach((addr) => {
            expect(addr).not.toContain(":");
            expect(isIPv6Address(addr)).toBe(false);
          });
        }),
        { numRuns: 100 }
      );
    });

    it("TUN addresses should match expected IPv4 format", () => {
      fc.assert(
        fc.property(mtuArb, (mtu) => {
          const config = generateTunConfig(mtu);
          const addresses = getTunAddresses(config);

          // 验证所有地址都是有效的 IPv4 CIDR
          addresses.forEach((addr) => {
            expect(isIPv4Address(addr)).toBe(true);
          });

          // 验证包含预期的 IPv4 地址
          expect(addresses).toContain(TUN_IPV4_ADDRESS);
        }),
        { numRuns: 100 }
      );
    });

    it("Invalid MTU should still produce IPv4-only config", () => {
      fc.assert(
        fc.property(invalidMtuArb, (mtu) => {
          const config = generateTunConfig(mtu);

          // 即使 MTU 无效，IPv4 Only 策略仍应生效
          expect(hasOnlyIPv4Addresses(config)).toBe(true);
          expect(hasNoIPv6Addresses(config)).toBe(true);
          expect(hasIPv4OnlyDnsStrategy(config)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 额外属性：TUN inbound 应该存在
   */
  describe("TUN inbound existence", () => {
    it("Config should always have a TUN inbound", () => {
      fc.assert(
        fc.property(mtuArb, (mtu) => {
          const config = generateTunConfig(mtu);

          const tunInbound = config.inbounds.find((ib) => ib.type === "tun");

          expect(tunInbound).toBeDefined();
          expect(tunInbound?.tag).toBe("tun-in");
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 额外属性：DNS 配置完整性
   */
  describe("DNS configuration completeness", () => {
    it("DNS config should have required fields", () => {
      fc.assert(
        fc.property(mtuArb, (mtu) => {
          const config = generateTunConfig(mtu);

          // 验证 DNS 配置包含所有必要字段
          expect(config.dns.servers).toBeDefined();
          expect(config.dns.servers.length).toBeGreaterThan(0);
          expect(config.dns.rules).toBeDefined();
          expect(config.dns.final).toBeDefined();
          expect(config.dns.strategy).toBeDefined();
          expect(config.dns.independent_cache).toBeDefined();
        }),
        { numRuns: 100 }
      );
    });

    it("DNS servers should include both local and remote", () => {
      fc.assert(
        fc.property(mtuArb, (mtu) => {
          const config = generateTunConfig(mtu);

          const localDns = config.dns.servers.find((s) => s.tag === "local-dns");
          const remoteDns = config.dns.servers.find((s) => s.tag === "remote-dns");

          expect(localDns).toBeDefined();
          expect(remoteDns).toBeDefined();
          expect(localDns?.detour).toBe("direct");
          expect(remoteDns?.detour).toBe("proxy");
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 额外属性：地址数量验证
   */
  describe("Address count validation", () => {
    it("TUN should have exactly one address (IPv4 only)", () => {
      fc.assert(
        fc.property(mtuArb, (mtu) => {
          const config = generateTunConfig(mtu);
          const addresses = getTunAddresses(config);

          // 由于移除了 IPv6，应该只有一个 IPv4 地址
          expect(addresses.length).toBe(1);
        }),
        { numRuns: 100 }
      );
    });
  });
});
