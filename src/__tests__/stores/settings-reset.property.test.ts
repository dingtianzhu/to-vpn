/**
 * 设置重置属性测试
 * 
 * **Feature: vpn-pure-mode, Property 10: Settings Reset**
 * **Validates: Requirements 10.4**
 * 
 * *For any* settings section, calling reset SHALL restore all values in that section to their default values.
 */
import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";
import { setActivePinia, createPinia } from "pinia";
import { useSettingsStore } from "@/stores/settings";
import type { RouteMode, TunStack } from "@/types";

// ============ 默认值常量 ============

const DEFAULT_VALUES = {
  // 代理端口默认值
  socksPort: 1080,
  httpPort: 1087,
  
  // 安全设置默认值
  killSwitch: false,
  dnsLeakProtection: true,
  blockWebRTC: false,  // 默认关闭，避免视频通话等问题
  
  // 路由设置默认值
  routeMode: 'rule' as RouteMode,
  customBypassDomains: [] as string[],
  customProxyDomains: [] as string[],
  excludedApps: [] as string[],
  forcedProxyApps: [] as string[],
  bypassLan: true,
  
  // 高级网络设置默认值
  tunStack: 'gvisor' as TunStack,
  mtu: 1400,
  upMbps: 500,
  downMbps: 1000,
  blockQuic: false,    // 默认关闭，避免 Google 等网站加载问题
  disableIpv6: true,
};

// ============ 生成器 ============

// 有效端口生成器
const validPortArb = fc.integer({ min: 1024, max: 65535 });

// 布尔值生成器
const boolArb = fc.boolean();

// 路由模式生成器
const routeModeArb = fc.constantFrom('rule', 'global', 'direct') as fc.Arbitrary<RouteMode>;

// TUN 网络栈生成器
const tunStackArb = fc.constantFrom('gvisor', 'system', 'lwip') as fc.Arbitrary<TunStack>;

// 域名列表生成器
const domainListArb = fc.array(
  fc.string({ minLength: 3, maxLength: 15 })
    .filter(s => /^[a-z0-9-]+$/.test(s))
    .map(s => s + '.com'),
  { minLength: 0, maxLength: 5 }
);

// 应用名称列表生成器
const appListArb = fc.array(
  fc.string({ minLength: 2, maxLength: 15 }),
  { minLength: 0, maxLength: 5 }
);

// 带宽值生成器
const bandwidthArb = fc.integer({ min: 1, max: 10000 });

// MTU 值生成器
const mtuArb = fc.constantFrom(0, 1400, 1450, 1500);

// ============ 属性测试 ============

describe("Settings Reset Properties", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  /**
   * Property 10.1: Reset proxy port settings restores defaults
   * *For any* modified proxy port configuration, resetProxyPortSettings SHALL restore default values
   */
  describe("Property 10.1: Reset proxy port settings restores defaults", () => {
    it("should restore default proxy ports after reset", () => {
      fc.assert(
        fc.property(validPortArb, validPortArb, (socksPort, httpPort) => {
          const store = useSettingsStore();
          
          // Modify settings
          store.updateSettings({ socksPort, httpPort });
          
          // Reset
          store.resetProxyPortSettings();
          
          // Verify defaults restored
          expect(store.settings.socksPort).toBe(DEFAULT_VALUES.socksPort);
          expect(store.settings.httpPort).toBe(DEFAULT_VALUES.httpPort);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 10.2: Reset security settings restores defaults
   * *For any* modified security configuration, resetSecuritySettings SHALL restore default values
   */
  describe("Property 10.2: Reset security settings restores defaults", () => {
    it("should restore default security settings after reset", () => {
      fc.assert(
        fc.property(boolArb, boolArb, boolArb, (killSwitch, dnsLeakProtection, blockWebRTC) => {
          const store = useSettingsStore();
          
          // Modify settings
          store.updateSettings({ killSwitch, dnsLeakProtection, blockWebRTC });
          
          // Reset
          store.resetSecuritySettings();
          
          // Verify defaults restored
          expect(store.settings.killSwitch).toBe(DEFAULT_VALUES.killSwitch);
          expect(store.settings.dnsLeakProtection).toBe(DEFAULT_VALUES.dnsLeakProtection);
          expect(store.settings.blockWebRTC).toBe(DEFAULT_VALUES.blockWebRTC);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 10.3: Reset routing settings restores defaults
   * *For any* modified routing configuration, resetRoutingSettings SHALL restore default values
   */
  describe("Property 10.3: Reset routing settings restores defaults", () => {
    it("should restore default routing settings after reset", () => {
      fc.assert(
        fc.property(
          routeModeArb, 
          domainListArb, 
          domainListArb, 
          appListArb, 
          appListArb, 
          boolArb,
          (routeMode, customBypassDomains, customProxyDomains, excludedApps, forcedProxyApps, bypassLan) => {
            const store = useSettingsStore();
            
            // Modify settings
            store.updateSettings({ 
              routeMode, 
              customBypassDomains, 
              customProxyDomains, 
              excludedApps, 
              forcedProxyApps, 
              bypassLan 
            });
            
            // Reset
            store.resetRoutingSettings();
            
            // Verify defaults restored
            expect(store.settings.routeMode).toBe(DEFAULT_VALUES.routeMode);
            expect(store.settings.customBypassDomains).toEqual(DEFAULT_VALUES.customBypassDomains);
            expect(store.settings.customProxyDomains).toEqual(DEFAULT_VALUES.customProxyDomains);
            expect(store.settings.excludedApps).toEqual(DEFAULT_VALUES.excludedApps);
            expect(store.settings.forcedProxyApps).toEqual(DEFAULT_VALUES.forcedProxyApps);
            expect(store.settings.bypassLan).toBe(DEFAULT_VALUES.bypassLan);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 10.4: Reset advanced settings restores defaults
   * *For any* modified advanced network configuration, resetAdvancedSettings SHALL restore default values
   */
  describe("Property 10.4: Reset advanced settings restores defaults", () => {
    it("should restore default advanced network settings after reset", () => {
      fc.assert(
        fc.property(
          tunStackArb,
          mtuArb,
          bandwidthArb,
          bandwidthArb,
          boolArb,
          boolArb,
          (tunStack, mtu, upMbps, downMbps, blockQuic, disableIpv6) => {
            const store = useSettingsStore();
            
            // Modify settings
            store.updateSettings({ 
              tunStack, 
              mtu, 
              upMbps, 
              downMbps, 
              blockQuic, 
              disableIpv6 
            });
            
            // Reset
            store.resetAdvancedSettings();
            
            // Verify defaults restored
            expect(store.settings.tunStack).toBe(DEFAULT_VALUES.tunStack);
            expect(store.settings.mtu).toBe(DEFAULT_VALUES.mtu);
            expect(store.settings.upMbps).toBe(DEFAULT_VALUES.upMbps);
            expect(store.settings.downMbps).toBe(DEFAULT_VALUES.downMbps);
            expect(store.settings.blockQuic).toBe(DEFAULT_VALUES.blockQuic);
            expect(store.settings.disableIpv6).toBe(DEFAULT_VALUES.disableIpv6);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 10.5: Section reset is independent
   * *For any* settings modification, resetting one section SHALL NOT affect other sections
   */
  describe("Property 10.5: Section reset is independent", () => {
    it("should not affect other sections when resetting proxy ports", () => {
      fc.assert(
        fc.property(
          validPortArb, 
          validPortArb, 
          boolArb, 
          routeModeArb, 
          tunStackArb,
          (socksPort, httpPort, killSwitch, routeMode, tunStack) => {
            const store = useSettingsStore();
            
            // Modify all sections
            store.updateSettings({ 
              socksPort, 
              httpPort, 
              killSwitch, 
              routeMode, 
              tunStack 
            });
            
            // Reset only proxy ports
            store.resetProxyPortSettings();
            
            // Verify proxy ports reset
            expect(store.settings.socksPort).toBe(DEFAULT_VALUES.socksPort);
            expect(store.settings.httpPort).toBe(DEFAULT_VALUES.httpPort);
            
            // Verify other sections unchanged
            expect(store.settings.killSwitch).toBe(killSwitch);
            expect(store.settings.routeMode).toBe(routeMode);
            expect(store.settings.tunStack).toBe(tunStack);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should not affect other sections when resetting security settings", () => {
      fc.assert(
        fc.property(
          validPortArb, 
          boolArb, 
          boolArb, 
          boolArb, 
          routeModeArb,
          (socksPort, killSwitch, dnsLeakProtection, blockWebRTC, routeMode) => {
            const store = useSettingsStore();
            
            // Modify all sections
            store.updateSettings({ 
              socksPort, 
              killSwitch, 
              dnsLeakProtection, 
              blockWebRTC, 
              routeMode 
            });
            
            // Reset only security settings
            store.resetSecuritySettings();
            
            // Verify security settings reset
            expect(store.settings.killSwitch).toBe(DEFAULT_VALUES.killSwitch);
            expect(store.settings.dnsLeakProtection).toBe(DEFAULT_VALUES.dnsLeakProtection);
            expect(store.settings.blockWebRTC).toBe(DEFAULT_VALUES.blockWebRTC);
            
            // Verify other sections unchanged
            expect(store.settings.socksPort).toBe(socksPort);
            expect(store.settings.routeMode).toBe(routeMode);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 10.6: Reset is idempotent
   * *For any* settings section, calling reset multiple times SHALL produce the same result
   */
  describe("Property 10.6: Reset is idempotent", () => {
    it("should produce same result when reset is called multiple times", () => {
      fc.assert(
        fc.property(
          validPortArb, 
          validPortArb, 
          fc.integer({ min: 1, max: 5 }),
          (socksPort, httpPort, resetCount) => {
            const store = useSettingsStore();
            
            // Modify settings
            store.updateSettings({ socksPort, httpPort });
            
            // Reset multiple times
            for (let i = 0; i < resetCount; i++) {
              store.resetProxyPortSettings();
            }
            
            // Verify defaults restored
            expect(store.settings.socksPort).toBe(DEFAULT_VALUES.socksPort);
            expect(store.settings.httpPort).toBe(DEFAULT_VALUES.httpPort);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
