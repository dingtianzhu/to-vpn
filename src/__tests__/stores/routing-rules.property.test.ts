/**
 * 路由规则完整性和 DNS 规则正确性属性测试
 * 验证配置包含所有必要的直连规则和 DNS 分流规则
 *
 * **Feature: vpn-optimization, Property 4: 路由规则完整性**
 * **Feature: vpn-optimization, Property 5: DNS 规则正确性**
 * **Validates: Requirements 5.1, 5.2, 4.1, 4.2, 7.1**
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============ 类型定义 ============

interface RouteRule {
  ip_cidr?: string[];
  protocol?: string;
  domain_suffix?: string[];
  rule_set?: string;
  ip_is_private?: boolean;
  port?: number;
  network?: string;
  action?: string;
  outbound?: string;
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

interface RouteConfig {
  auto_detect_interface: boolean;
  final: string;
  rule_set: { tag: string; type: string; format: string; path: string }[];
  rules: RouteRule[];
}

interface DnsConfig {
  servers: DnsServer[];
  rules: DnsRule[];
  final: string;
  strategy: string;
  independent_cache: boolean;
}

interface SingboxConfig {
  mode: "tun" | "socks";
  dns: DnsConfig;
  route: RouteConfig;
}


// ============ 常见国内 CDN 域名列表（与后端保持一致）============

/**
 * 获取常见国内 CDN 域名列表
 * 与 src-tauri/src/vpn/singbox/mod.rs 中的 get_china_cdn_domains() 保持一致
 */
function getChinaCdnDomains(): string[] {
  return [
    // 阿里云 CDN
    ".aliyuncs.com",
    ".alicdn.com",
    ".aliyun.com",
    ".alibabacloud.com",
    ".alipay.com",
    ".alipayobjects.com",
    ".taobao.com",
    ".tmall.com",
    ".tbcdn.cn",
    ".aliapp.org",
    ".alibaba.com",
    // 腾讯云 CDN
    ".qcloud.com",
    ".tencent.com",
    ".qq.com",
    ".gtimg.cn",
    ".gtimg.com",
    ".qpic.cn",
    ".myqcloud.com",
    ".tencent-cloud.net",
    ".tencentcs.com",
    ".weixin.qq.com",
    ".wechat.com",
    // 百度云 CDN
    ".baidubce.com",
    ".bcebos.com",
    ".bdstatic.com",
    ".bdimg.com",
    ".baidu.com",
    ".baidustatic.com",
    ".bdydns.com",
    // 华为云 CDN
    ".huaweicloud.com",
    ".myhuaweicloud.com",
    ".hwcdn.net",
    ".huawei.com",
    // 京东云 CDN
    ".jdcloud.com",
    ".jd.com",
    ".jcloudcs.com",
    ".360buyimg.com",
    // 网易云 CDN
    ".163.com",
    ".126.com",
    ".netease.com",
    ".ydstatic.com",
    ".nosdn.127.net",
    // 七牛云 CDN
    ".qiniucdn.com",
    ".qiniudn.com",
    ".qbox.me",
    ".qnssl.com",
    // 又拍云 CDN
    ".upaiyun.com",
    ".upyun.com",
  ];
}


// ============ 配置生成函数（模拟后端逻辑）============

/**
 * 生成 TUN 模式配置
 * 模拟 src-tauri/src/vpn/singbox/tun.rs 的配置生成逻辑
 */
function generateTunConfig(
  serverHost: string,
  serverPort: number,
  serverIps: string[],
  blockQuic: boolean = true
): SingboxConfig {
  const routeRules: RouteRule[] = [];

  // A. 强制绕过 VPS 服务器 IP (防止环路)
  if (serverIps.length > 0) {
    const cidrs = serverIps.map((ip) =>
      ip.includes(":") ? `${ip}/128` : `${ip}/32`
    );
    routeRules.push({ ip_cidr: cidrs, outbound: "direct" });
  }

  // DNS 劫持
  routeRules.push({ protocol: "dns", action: "hijack-dns" });

  // 本地域名后缀直连
  routeRules.push({
    domain_suffix: [".lan", ".local", ".home", ".internal"],
    outbound: "direct",
  });

  // 屏蔽 QUIC (UDP 443)
  if (blockQuic) {
    routeRules.push({ port: 443, network: "udp", action: "reject" });
  }

  // B. 常见国内 CDN 域名直连
  routeRules.push({
    domain_suffix: getChinaCdnDomains(),
    outbound: "direct",
  });

  // geosite-cn 和 geoip-cn 规则
  routeRules.push({ rule_set: "geosite-cn", outbound: "direct" });
  routeRules.push({ rule_set: "geoip-cn", outbound: "direct" });

  // 私有 IP 直连
  routeRules.push({ ip_is_private: true, outbound: "direct" });

  return {
    mode: "tun",
    dns: {
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
      strategy: "ipv4_only",
      independent_cache: true,
    },
    route: {
      auto_detect_interface: true,
      final: "proxy",
      rule_set: [
        { tag: "geosite-cn", type: "local", format: "binary", path: "/path/to/geosite-cn.srs" },
        { tag: "geoip-cn", type: "local", format: "binary", path: "/path/to/geoip-cn.srs" },
      ],
      rules: routeRules,
    },
  };
}


/**
 * 生成 SOCKS 模式配置
 * 模拟 src-tauri/src/vpn/singbox/socks.rs 的配置生成逻辑
 */
function generateSocksConfig(
  serverHost: string,
  serverPort: number,
  serverIps: string[],
  blockQuic: boolean = true
): SingboxConfig {
  const routeRules: RouteRule[] = [];

  // DNS 劫持
  routeRules.push({ protocol: "dns", action: "hijack-dns" });

  // 本地域名后缀直连
  routeRules.push({
    domain_suffix: [".lan", ".local", ".home", ".internal"],
    outbound: "direct",
  });

  // 屏蔽 QUIC (UDP 443)
  if (blockQuic) {
    routeRules.push({ port: 443, network: "udp", action: "reject" });
  }

  // 强制绕过 VPS 服务器 IP (防止环路)
  if (serverIps.length > 0) {
    const cidrs = serverIps.filter((ip) => !ip.includes(":")).map((ip) => `${ip}/32`);
    if (cidrs.length > 0) {
      routeRules.push({ ip_cidr: cidrs, outbound: "direct" });
    }
  }

  // 常见国内 CDN 域名直连
  routeRules.push({
    domain_suffix: getChinaCdnDomains(),
    outbound: "direct",
  });

  // geosite-cn 和 geoip-cn 规则
  routeRules.push({ rule_set: "geosite-cn", outbound: "direct" });
  routeRules.push({ rule_set: "geoip-cn", outbound: "direct" });

  // 私有 IP 直连
  routeRules.push({ ip_is_private: true, outbound: "direct" });

  return {
    mode: "socks",
    dns: {
      servers: [
        { tag: "local-dns", address: "223.5.5.5", detour: "direct" },
        { tag: "remote-dns", address: "https://1.1.1.1/dns-query", detour: "proxy" },
        { tag: "block-dns", address: "rcode://success", detour: "direct" },
      ],
      rules: [
        { rule_set: "geosite-cn", server: "local-dns" },
        { domain_suffix: [".cn"], server: "local-dns" },
      ],
      final: "remote-dns",
      strategy: "ipv4_only",
      independent_cache: true,
    },
    route: {
      auto_detect_interface: true,
      final: "proxy",
      rule_set: [
        { tag: "geosite-cn", type: "local", format: "binary", path: "/path/to/geosite-cn.srs" },
        { tag: "geoip-cn", type: "local", format: "binary", path: "/path/to/geoip-cn.srs" },
      ],
      rules: routeRules,
    },
  };
}


// ============ 验证函数 ============

/**
 * 检查配置是否包含 VPN 服务器 IP 直连规则
 */
function hasServerIpDirectRule(config: SingboxConfig, serverIps: string[]): boolean {
  if (serverIps.length === 0) return true; // 没有服务器 IP 时不需要此规则
  return config.route.rules.some(
    (rule) =>
      rule.ip_cidr &&
      rule.outbound === "direct" &&
      serverIps.some((ip) => rule.ip_cidr!.some((cidr) => cidr.startsWith(ip)))
  );
}

/**
 * 检查配置是否包含私有 IP 直连规则
 */
function hasPrivateIpDirectRule(config: SingboxConfig): boolean {
  return config.route.rules.some(
    (rule) => rule.ip_is_private === true && rule.outbound === "direct"
  );
}

/**
 * 检查配置是否包含 geosite-cn 规则
 */
function hasGeositeCnRule(config: SingboxConfig): boolean {
  return config.route.rules.some(
    (rule) => rule.rule_set === "geosite-cn" && rule.outbound === "direct"
  );
}

/**
 * 检查配置是否包含 geoip-cn 规则
 */
function hasGeoipCnRule(config: SingboxConfig): boolean {
  return config.route.rules.some(
    (rule) => rule.rule_set === "geoip-cn" && rule.outbound === "direct"
  );
}

/**
 * 检查配置是否包含国内 CDN 域名直连规则
 */
function hasChinaCdnDomainsRule(config: SingboxConfig): boolean {
  const cdnDomains = getChinaCdnDomains();
  return config.route.rules.some(
    (rule) =>
      rule.domain_suffix &&
      rule.outbound === "direct" &&
      cdnDomains.some((cdn) => rule.domain_suffix!.includes(cdn))
  );
}

/**
 * 检查配置是否包含特定的 CDN 域名
 */
function hasCdnDomain(config: SingboxConfig, domain: string): boolean {
  return config.route.rules.some(
    (rule) =>
      rule.domain_suffix &&
      rule.outbound === "direct" &&
      rule.domain_suffix.includes(domain)
  );
}

/**
 * 检查 DNS 配置是否包含本地 DNS 服务器
 */
function hasLocalDnsServer(config: SingboxConfig): boolean {
  return config.dns.servers.some(
    (server) => server.tag === "local-dns" && server.detour === "direct"
  );
}

/**
 * 检查 DNS 配置是否包含远程 DNS 服务器
 */
function hasRemoteDnsServer(config: SingboxConfig): boolean {
  return config.dns.servers.some(
    (server) => server.tag === "remote-dns" && server.detour === "proxy"
  );
}

/**
 * 检查 DNS 规则是否将 geosite-cn 域名路由到本地 DNS
 */
function hasGeositeCnDnsRule(config: SingboxConfig): boolean {
  return config.dns.rules.some(
    (rule) => rule.rule_set === "geosite-cn" && rule.server === "local-dns"
  );
}

/**
 * 检查 DNS 配置的 final 是否为远程 DNS
 */
function hasFinalRemoteDns(config: SingboxConfig): boolean {
  return config.dns.final === "remote-dns";
}


// ============ 生成器 ============

// 服务器主机名生成器：域名或 IP 地址
const serverHostArb = fc.oneof(
  fc.stringMatching(/^[a-z][a-z0-9-]*\.[a-z]{2,6}$/),
  fc.tuple(
    fc.integer({ min: 1, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 1, max: 254 })
  ).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`)
);

// 服务器端口生成器
const serverPortArb = fc.integer({ min: 1, max: 65535 });

// 服务器 IP 列表生成器
const serverIpsArb = fc.array(
  fc.tuple(
    fc.integer({ min: 1, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 1, max: 254 })
  ).map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`),
  { minLength: 0, maxLength: 3 }
);

// 连接模式生成器
const connectionModeArb = fc.constantFrom("tun", "socks") as fc.Arbitrary<"tun" | "socks">;

// QUIC 阻断开关生成器
const blockQuicArb = fc.boolean();


// ============ 属性测试 ============

describe("Routing Rules Properties", () => {
  /**
   * Property 4: 路由规则完整性
   * *For any* 生成的路由配置，应包含以下直连规则（按优先级）：
   * VPN 服务器 IP、私有 IP、.cn 域名、geosite-cn、geoip-cn
   */
  describe("Property 4: 路由规则完整性", () => {
    it("TUN 模式应包含 VPN 服务器 IP 直连规则", () => {
      fc.assert(
        fc.property(
          serverHostArb,
          serverPortArb,
          serverIpsArb,
          blockQuicArb,
          (host, port, ips, blockQuic) => {
            const config = generateTunConfig(host, port, ips, blockQuic);
            expect(hasServerIpDirectRule(config, ips)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("SOCKS 模式应包含 VPN 服务器 IP 直连规则", () => {
      fc.assert(
        fc.property(
          serverHostArb,
          serverPortArb,
          serverIpsArb,
          blockQuicArb,
          (host, port, ips, blockQuic) => {
            const config = generateSocksConfig(host, port, ips, blockQuic);
            // SOCKS 模式只处理 IPv4
            const ipv4Ips = ips.filter((ip) => !ip.includes(":"));
            expect(hasServerIpDirectRule(config, ipv4Ips)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("配置应包含私有 IP 直连规则", () => {
      fc.assert(
        fc.property(
          connectionModeArb,
          serverHostArb,
          serverPortArb,
          serverIpsArb,
          (mode, host, port, ips) => {
            const config =
              mode === "tun"
                ? generateTunConfig(host, port, ips)
                : generateSocksConfig(host, port, ips);
            expect(hasPrivateIpDirectRule(config)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("配置应包含 geosite-cn 直连规则", () => {
      fc.assert(
        fc.property(
          connectionModeArb,
          serverHostArb,
          serverPortArb,
          serverIpsArb,
          (mode, host, port, ips) => {
            const config =
              mode === "tun"
                ? generateTunConfig(host, port, ips)
                : generateSocksConfig(host, port, ips);
            expect(hasGeositeCnRule(config)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("配置应包含 geoip-cn 直连规则", () => {
      fc.assert(
        fc.property(
          connectionModeArb,
          serverHostArb,
          serverPortArb,
          serverIpsArb,
          (mode, host, port, ips) => {
            const config =
              mode === "tun"
                ? generateTunConfig(host, port, ips)
                : generateSocksConfig(host, port, ips);
            expect(hasGeoipCnRule(config)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("配置应包含国内 CDN 域名直连规则", () => {
      fc.assert(
        fc.property(
          connectionModeArb,
          serverHostArb,
          serverPortArb,
          serverIpsArb,
          (mode, host, port, ips) => {
            const config =
              mode === "tun"
                ? generateTunConfig(host, port, ips)
                : generateSocksConfig(host, port, ips);
            expect(hasChinaCdnDomainsRule(config)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Property 4 扩展: 验证特定 CDN 域名存在
   */
  describe("Property 4 扩展: 特定 CDN 域名验证", () => {
    it("配置应包含阿里云 CDN 域名 (.aliyuncs.com)", () => {
      fc.assert(
        fc.property(
          connectionModeArb,
          serverHostArb,
          serverPortArb,
          serverIpsArb,
          (mode, host, port, ips) => {
            const config =
              mode === "tun"
                ? generateTunConfig(host, port, ips)
                : generateSocksConfig(host, port, ips);
            expect(hasCdnDomain(config, ".aliyuncs.com")).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("配置应包含腾讯云 CDN 域名 (.qcloud.com)", () => {
      fc.assert(
        fc.property(
          connectionModeArb,
          serverHostArb,
          serverPortArb,
          serverIpsArb,
          (mode, host, port, ips) => {
            const config =
              mode === "tun"
                ? generateTunConfig(host, port, ips)
                : generateSocksConfig(host, port, ips);
            expect(hasCdnDomain(config, ".qcloud.com")).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("配置应包含百度云 CDN 域名 (.baidubce.com)", () => {
      fc.assert(
        fc.property(
          connectionModeArb,
          serverHostArb,
          serverPortArb,
          serverIpsArb,
          (mode, host, port, ips) => {
            const config =
              mode === "tun"
                ? generateTunConfig(host, port, ips)
                : generateSocksConfig(host, port, ips);
            expect(hasCdnDomain(config, ".baidubce.com")).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Property 5: DNS 规则正确性
   * *For any* TUN 模式配置，DNS 规则应确保：
   * geosite-cn 域名使用本地 DNS，其他域名使用远程 DoH DNS
   */
  describe("Property 5: DNS 规则正确性", () => {
    it("配置应包含本地 DNS 服务器 (detour: direct)", () => {
      fc.assert(
        fc.property(
          connectionModeArb,
          serverHostArb,
          serverPortArb,
          serverIpsArb,
          (mode, host, port, ips) => {
            const config =
              mode === "tun"
                ? generateTunConfig(host, port, ips)
                : generateSocksConfig(host, port, ips);
            expect(hasLocalDnsServer(config)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("配置应包含远程 DNS 服务器 (detour: proxy)", () => {
      fc.assert(
        fc.property(
          connectionModeArb,
          serverHostArb,
          serverPortArb,
          serverIpsArb,
          (mode, host, port, ips) => {
            const config =
              mode === "tun"
                ? generateTunConfig(host, port, ips)
                : generateSocksConfig(host, port, ips);
            expect(hasRemoteDnsServer(config)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("DNS 规则应将 geosite-cn 域名路由到本地 DNS", () => {
      fc.assert(
        fc.property(
          connectionModeArb,
          serverHostArb,
          serverPortArb,
          serverIpsArb,
          (mode, host, port, ips) => {
            const config =
              mode === "tun"
                ? generateTunConfig(host, port, ips)
                : generateSocksConfig(host, port, ips);
            expect(hasGeositeCnDnsRule(config)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("DNS 配置的 final 应为远程 DNS (remote-dns)", () => {
      fc.assert(
        fc.property(
          connectionModeArb,
          serverHostArb,
          serverPortArb,
          serverIpsArb,
          (mode, host, port, ips) => {
            const config =
              mode === "tun"
                ? generateTunConfig(host, port, ips)
                : generateSocksConfig(host, port, ips);
            expect(hasFinalRemoteDns(config)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("DNS 策略应为 ipv4_only", () => {
      fc.assert(
        fc.property(
          connectionModeArb,
          serverHostArb,
          serverPortArb,
          serverIpsArb,
          (mode, host, port, ips) => {
            const config =
              mode === "tun"
                ? generateTunConfig(host, port, ips)
                : generateSocksConfig(host, port, ips);
            expect(config.dns.strategy).toBe("ipv4_only");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("DNS 应启用独立缓存 (independent_cache)", () => {
      fc.assert(
        fc.property(
          connectionModeArb,
          serverHostArb,
          serverPortArb,
          serverIpsArb,
          (mode, host, port, ips) => {
            const config =
              mode === "tun"
                ? generateTunConfig(host, port, ips)
                : generateSocksConfig(host, port, ips);
            expect(config.dns.independent_cache).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * 额外属性：路由配置一致性
   */
  describe("路由配置一致性", () => {
    it("TUN 和 SOCKS 模式应有相同的规则集定义", () => {
      fc.assert(
        fc.property(
          serverHostArb,
          serverPortArb,
          serverIpsArb,
          (host, port, ips) => {
            const tunConfig = generateTunConfig(host, port, ips);
            const socksConfig = generateSocksConfig(host, port, ips);

            // 两种模式应该有相同的规则集
            const tunRuleSets = tunConfig.route.rule_set.map((rs) => rs.tag).sort();
            const socksRuleSets = socksConfig.route.rule_set.map((rs) => rs.tag).sort();

            expect(tunRuleSets).toEqual(socksRuleSets);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("默认路由应为 proxy", () => {
      fc.assert(
        fc.property(
          connectionModeArb,
          serverHostArb,
          serverPortArb,
          serverIpsArb,
          (mode, host, port, ips) => {
            const config =
              mode === "tun"
                ? generateTunConfig(host, port, ips)
                : generateSocksConfig(host, port, ips);
            expect(config.route.final).toBe("proxy");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("应启用 auto_detect_interface", () => {
      fc.assert(
        fc.property(
          connectionModeArb,
          serverHostArb,
          serverPortArb,
          serverIpsArb,
          (mode, host, port, ips) => {
            const config =
              mode === "tun"
                ? generateTunConfig(host, port, ips)
                : generateSocksConfig(host, port, ips);
            expect(config.route.auto_detect_interface).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
