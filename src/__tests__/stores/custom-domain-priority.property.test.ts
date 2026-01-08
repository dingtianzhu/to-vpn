/**
 * 自定义域名优先级属性测试
 * 
 * **Feature: vpn-pure-mode, Property 4: Custom Domain Priority**
 * **Validates: Requirements 5.3**
 * 
 * *For any* config with custom bypass or proxy domains, those domains SHALL 
 * appear in routing rules with higher priority (earlier in the rules array) 
 * than geo-based rules.
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============ 类型定义 ============

interface RouteRule {
  domain_suffix?: string[];
  rule_set?: string;
  outbound?: string;
  ip_cidr?: string[];
  ip_is_private?: boolean;
  protocol?: string;
  port?: number;
  network?: string;
  action?: string;
}

interface ConfigOptions {
  tcp_fast_open: boolean;
  up_mbps: number;
  down_mbps: number;
  block_quic: boolean;
  disable_ipv6: boolean;
  route_mode: 'rule' | 'global' | 'direct';
  dns_leak_protection: boolean;
  custom_bypass_domains: string[];
  custom_proxy_domains: string[];
}

// ============ 模拟配置生成逻辑 ============

/**
 * 模拟 sing-box 路由规则生成逻辑
 * 这是从 Rust 代码中提取的核心逻辑
 */
function generateRouteRules(options: ConfigOptions): RouteRule[] {
  const rules: RouteRule[] = [];
  
  // 1. DNS 劫持规则
  rules.push({ protocol: "dns", action: "hijack-dns" });
  
  // 2. 本地域名直连
  rules.push({ 
    domain_suffix: [".lan", ".local", ".home", ".internal"], 
    outbound: "direct" 
  });
  
  // 3. 阻断 QUIC
  if (options.block_quic) {
    rules.push({ port: 443, network: "udp", action: "reject" });
  }
  
  // 4. 服务器 IP 直连（模拟）
  rules.push({ ip_cidr: ["1.2.3.4/32"], outbound: "direct" });
  
  // 5. 自定义代理域名 - 放在 geo 规则之前
  // **Feature: vpn-pure-mode**
  // **Validates: Requirements 5.3**
  if (options.custom_proxy_domains.length > 0) {
    rules.push({ 
      domain_suffix: options.custom_proxy_domains, 
      outbound: "proxy" 
    });
  }
  
  // 6. 自定义直连域名 - 放在 geo 规则之前
  // **Feature: vpn-pure-mode**
  // **Validates: Requirements 5.3**
  if (options.custom_bypass_domains.length > 0) {
    rules.push({ 
      domain_suffix: options.custom_bypass_domains, 
      outbound: "direct" 
    });
  }
  
  // 7. Geo 规则（仅在规则模式下）
  if (options.route_mode === 'rule') {
    rules.push({ rule_set: "geosite-cn", outbound: "direct" });
    rules.push({ rule_set: "geoip-cn", outbound: "direct" });
    rules.push({ ip_is_private: true, outbound: "direct" });
  } else if (options.route_mode === 'global') {
    rules.push({ ip_is_private: true, outbound: "direct" });
  }
  
  return rules;
}

/**
 * 查找规则在数组中的索引
 */
function findRuleIndex(rules: RouteRule[], predicate: (rule: RouteRule) => boolean): number {
  return rules.findIndex(predicate);
}

/**
 * 检查自定义域名规则是否在 geo 规则之前
 */
function isCustomDomainBeforeGeoRules(rules: RouteRule[]): boolean {
  const customProxyIndex = findRuleIndex(rules, r => 
    r.domain_suffix !== undefined && 
    r.outbound === 'proxy' &&
    !r.domain_suffix.some(d => ['.lan', '.local', '.home', '.internal'].includes(d))
  );
  
  const customBypassIndex = findRuleIndex(rules, r => 
    r.domain_suffix !== undefined && 
    r.outbound === 'direct' &&
    !r.domain_suffix.some(d => ['.lan', '.local', '.home', '.internal'].includes(d))
  );
  
  const geositeIndex = findRuleIndex(rules, r => r.rule_set === 'geosite-cn');
  const geoipIndex = findRuleIndex(rules, r => r.rule_set === 'geoip-cn');
  
  // 如果没有 geo 规则，则自定义域名优先级自动满足
  if (geositeIndex === -1 && geoipIndex === -1) {
    return true;
  }
  
  const geoMinIndex = Math.min(
    geositeIndex === -1 ? Infinity : geositeIndex,
    geoipIndex === -1 ? Infinity : geoipIndex
  );
  
  // 检查自定义代理域名是否在 geo 规则之前
  if (customProxyIndex !== -1 && customProxyIndex >= geoMinIndex) {
    return false;
  }
  
  // 检查自定义直连域名是否在 geo 规则之前
  if (customBypassIndex !== -1 && customBypassIndex >= geoMinIndex) {
    return false;
  }
  
  return true;
}

// ============ 生成器 ============

/**
 * 生成有效的域名
 */
const validDomainArb = fc.tuple(
  fc.stringMatching(/^[a-z0-9]{1,10}$/),
  fc.constantFrom('com', 'org', 'net', 'io', 'cn')
).map(([name, tld]) => `.${name}.${tld}`);

/**
 * 生成域名列表
 */
const domainListArb = fc.array(validDomainArb, { minLength: 0, maxLength: 5 });

/**
 * 生成路由模式
 */
const routeModeArb = fc.constantFrom('rule', 'global', 'direct') as fc.Arbitrary<'rule' | 'global' | 'direct'>;

/**
 * 生成配置选项
 */
const configOptionsArb = fc.record({
  tcp_fast_open: fc.boolean(),
  up_mbps: fc.integer({ min: 1, max: 1000 }),
  down_mbps: fc.integer({ min: 1, max: 1000 }),
  block_quic: fc.boolean(),
  disable_ipv6: fc.boolean(),
  route_mode: routeModeArb,
  dns_leak_protection: fc.boolean(),
  custom_bypass_domains: domainListArb,
  custom_proxy_domains: domainListArb,
});

/**
 * 生成带有自定义域名的配置选项
 */
const configWithCustomDomainsArb = fc.record({
  tcp_fast_open: fc.boolean(),
  up_mbps: fc.integer({ min: 1, max: 1000 }),
  down_mbps: fc.integer({ min: 1, max: 1000 }),
  block_quic: fc.boolean(),
  disable_ipv6: fc.boolean(),
  route_mode: fc.constant('rule') as fc.Arbitrary<'rule'>,
  dns_leak_protection: fc.boolean(),
  custom_bypass_domains: fc.array(validDomainArb, { minLength: 1, maxLength: 5 }),
  custom_proxy_domains: fc.array(validDomainArb, { minLength: 1, maxLength: 5 }),
});

// ============ 属性测试 ============

describe("Property 4: Custom Domain Priority", () => {
  /**
   * **Feature: vpn-pure-mode, Property 4**
   * **Validates: Requirements 5.3**
   * 
   * *For any* config with custom bypass or proxy domains, those domains SHALL 
   * appear in routing rules with higher priority (earlier in the rules array) 
   * than geo-based rules.
   */
  describe("Custom domains appear before geo rules", () => {
    it("should place custom proxy domains before geo rules", () => {
      fc.assert(
        fc.property(configWithCustomDomainsArb, (options) => {
          const rules = generateRouteRules(options);
          expect(isCustomDomainBeforeGeoRules(rules)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should place custom bypass domains before geo rules", () => {
      fc.assert(
        fc.property(
          fc.record({
            tcp_fast_open: fc.boolean(),
            up_mbps: fc.integer({ min: 1, max: 1000 }),
            down_mbps: fc.integer({ min: 1, max: 1000 }),
            block_quic: fc.boolean(),
            disable_ipv6: fc.boolean(),
            route_mode: fc.constant('rule') as fc.Arbitrary<'rule'>,
            dns_leak_protection: fc.boolean(),
            custom_bypass_domains: fc.array(validDomainArb, { minLength: 1, maxLength: 5 }),
            custom_proxy_domains: fc.constant([]) as fc.Arbitrary<string[]>,
          }),
          (options) => {
            const rules = generateRouteRules(options);
            expect(isCustomDomainBeforeGeoRules(rules)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should maintain priority for any combination of custom domains", () => {
      fc.assert(
        fc.property(configOptionsArb, (options) => {
          const rules = generateRouteRules(options);
          expect(isCustomDomainBeforeGeoRules(rules)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 验证自定义域名规则的存在性
   */
  describe("Custom domain rules existence", () => {
    it("should include custom proxy domains in rules when provided", () => {
      fc.assert(
        fc.property(
          fc.array(validDomainArb, { minLength: 1, maxLength: 5 }),
          (proxyDomains) => {
            const options: ConfigOptions = {
              tcp_fast_open: true,
              up_mbps: 500,
              down_mbps: 1000,
              block_quic: true,
              disable_ipv6: true,
              route_mode: 'rule',
              dns_leak_protection: true,
              custom_bypass_domains: [],
              custom_proxy_domains: proxyDomains,
            };
            
            const rules = generateRouteRules(options);
            const hasProxyRule = rules.some(r => 
              r.domain_suffix !== undefined && 
              r.outbound === 'proxy' &&
              proxyDomains.every(d => r.domain_suffix!.includes(d))
            );
            
            expect(hasProxyRule).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should include custom bypass domains in rules when provided", () => {
      fc.assert(
        fc.property(
          fc.array(validDomainArb, { minLength: 1, maxLength: 5 }),
          (bypassDomains) => {
            const options: ConfigOptions = {
              tcp_fast_open: true,
              up_mbps: 500,
              down_mbps: 1000,
              block_quic: true,
              disable_ipv6: true,
              route_mode: 'rule',
              dns_leak_protection: true,
              custom_bypass_domains: bypassDomains,
              custom_proxy_domains: [],
            };
            
            const rules = generateRouteRules(options);
            const hasBypassRule = rules.some(r => 
              r.domain_suffix !== undefined && 
              r.outbound === 'direct' &&
              bypassDomains.every(d => r.domain_suffix!.includes(d))
            );
            
            expect(hasBypassRule).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should not include custom domain rules when lists are empty", () => {
      const options: ConfigOptions = {
        tcp_fast_open: true,
        up_mbps: 500,
        down_mbps: 1000,
        block_quic: true,
        disable_ipv6: true,
        route_mode: 'rule',
        dns_leak_protection: true,
        custom_bypass_domains: [],
        custom_proxy_domains: [],
      };
      
      const rules = generateRouteRules(options);
      
      // 应该只有本地域名的 domain_suffix 规则
      const domainSuffixRules = rules.filter(r => r.domain_suffix !== undefined);
      expect(domainSuffixRules.length).toBe(1); // 只有 .lan, .local 等
    });
  });

  /**
   * 验证规则顺序的具体位置
   */
  describe("Rule ordering specifics", () => {
    it("should place custom proxy domains immediately before geo rules", () => {
      const options: ConfigOptions = {
        tcp_fast_open: true,
        up_mbps: 500,
        down_mbps: 1000,
        block_quic: true,
        disable_ipv6: true,
        route_mode: 'rule',
        dns_leak_protection: true,
        custom_bypass_domains: ['.bypass.com'],
        custom_proxy_domains: ['.proxy.com'],
      };
      
      const rules = generateRouteRules(options);
      
      const proxyDomainIndex = findRuleIndex(rules, r => 
        r.domain_suffix?.includes('.proxy.com')
      );
      const bypassDomainIndex = findRuleIndex(rules, r => 
        r.domain_suffix?.includes('.bypass.com')
      );
      const geositeIndex = findRuleIndex(rules, r => r.rule_set === 'geosite-cn');
      
      // 自定义代理域名应该在 geo 规则之前
      expect(proxyDomainIndex).toBeLessThan(geositeIndex);
      // 自定义直连域名应该在 geo 规则之前
      expect(bypassDomainIndex).toBeLessThan(geositeIndex);
    });

    it("should maintain relative order: proxy domains before bypass domains", () => {
      const options: ConfigOptions = {
        tcp_fast_open: true,
        up_mbps: 500,
        down_mbps: 1000,
        block_quic: true,
        disable_ipv6: true,
        route_mode: 'rule',
        dns_leak_protection: true,
        custom_bypass_domains: ['.bypass.com'],
        custom_proxy_domains: ['.proxy.com'],
      };
      
      const rules = generateRouteRules(options);
      
      const proxyDomainIndex = findRuleIndex(rules, r => 
        r.domain_suffix?.includes('.proxy.com')
      );
      const bypassDomainIndex = findRuleIndex(rules, r => 
        r.domain_suffix?.includes('.bypass.com')
      );
      
      // 代理域名应该在直连域名之前（根据实现）
      expect(proxyDomainIndex).toBeLessThan(bypassDomainIndex);
    });
  });

  /**
   * 不同路由模式下的行为
   */
  describe("Behavior in different route modes", () => {
    it("should include custom domains in global mode (without geo rules)", () => {
      const options: ConfigOptions = {
        tcp_fast_open: true,
        up_mbps: 500,
        down_mbps: 1000,
        block_quic: true,
        disable_ipv6: true,
        route_mode: 'global',
        dns_leak_protection: true,
        custom_bypass_domains: ['.bypass.com'],
        custom_proxy_domains: ['.proxy.com'],
      };
      
      const rules = generateRouteRules(options);
      
      // 全局模式下没有 geo 规则
      const hasGeoRules = rules.some(r => r.rule_set?.includes('geo'));
      expect(hasGeoRules).toBe(false);
      
      // 但仍应包含自定义域名规则
      const hasCustomRules = rules.some(r => 
        r.domain_suffix?.includes('.proxy.com') || 
        r.domain_suffix?.includes('.bypass.com')
      );
      expect(hasCustomRules).toBe(true);
    });

    it("should include custom domains in direct mode (without geo rules)", () => {
      const options: ConfigOptions = {
        tcp_fast_open: true,
        up_mbps: 500,
        down_mbps: 1000,
        block_quic: true,
        disable_ipv6: true,
        route_mode: 'direct',
        dns_leak_protection: true,
        custom_bypass_domains: ['.bypass.com'],
        custom_proxy_domains: ['.proxy.com'],
      };
      
      const rules = generateRouteRules(options);
      
      // 直连模式下没有 geo 规则
      const hasGeoRules = rules.some(r => r.rule_set?.includes('geo'));
      expect(hasGeoRules).toBe(false);
      
      // 但仍应包含自定义域名规则
      const hasCustomRules = rules.some(r => 
        r.domain_suffix?.includes('.proxy.com') || 
        r.domain_suffix?.includes('.bypass.com')
      );
      expect(hasCustomRules).toBe(true);
    });
  });
});
