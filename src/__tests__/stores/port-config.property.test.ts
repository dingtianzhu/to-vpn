/**
 * 端口配置默认值和验证属性测试
 * 
 * **Feature: vpn-pure-mode, Property 1: Port Configuration Defaults and Validation**
 * **Validates: Requirements 1.1, 1.2, 1.3**
 */
import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";
import { setActivePinia, createPinia } from "pinia";
import { useSettingsStore } from "@/stores/settings";
import { isValidUserPort } from "@/utils/validation";

// ============ 常量定义 ============

const DEFAULT_SOCKS_PORT = 1080;
const DEFAULT_HTTP_PORT = 1087;
const MIN_USER_PORT = 1024;
const MAX_USER_PORT = 65535;

// ============ 生成器 ============

// 有效端口生成器 (1024-65535)
const validPortArb = fc.integer({ min: MIN_USER_PORT, max: MAX_USER_PORT });

// 无效端口生成器 - 低于最小值
const invalidLowPortArb = fc.integer({ min: -1000, max: MIN_USER_PORT - 1 });

// 无效端口生成器 - 高于最大值
const invalidHighPortArb = fc.integer({ min: MAX_USER_PORT + 1, max: 100000 });

// 非整数端口生成器
const nonIntegerPortArb = fc.double({ min: 1024, max: 65535, noInteger: true });

// ============ 属性测试 ============

describe("Port Configuration Properties", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  /**
   * Property 1.1: Default SOCKS port is 1080
   * *For any* new settings store instance, the default SOCKS port SHALL be 1080
   */
  describe("Property 1.1: Default SOCKS port is 1080", () => {
    it("should have default SOCKS port of 1080", () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const store = useSettingsStore();
          expect(store.settings.socksPort).toBe(DEFAULT_SOCKS_PORT);
        }),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 1.2: Default HTTP port is 1087
   * *For any* new settings store instance, the default HTTP port SHALL be 1087
   */
  describe("Property 1.2: Default HTTP port is 1087", () => {
    it("should have default HTTP port of 1087", () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const store = useSettingsStore();
          expect(store.settings.httpPort).toBe(DEFAULT_HTTP_PORT);
        }),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 1.3: Port validation accepts only valid range (1024-65535)
   * *For any* port value, it SHALL be accepted only if it is in the range 1024-65535
   */
  describe("Property 1.3: Port validation accepts only valid range", () => {
    it("should accept ports in valid range (1024-65535)", () => {
      fc.assert(
        fc.property(validPortArb, (port) => {
          expect(isValidUserPort(port)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should reject ports below minimum (< 1024)", () => {
      fc.assert(
        fc.property(invalidLowPortArb, (port) => {
          expect(isValidUserPort(port)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it("should reject ports above maximum (> 65535)", () => {
      fc.assert(
        fc.property(invalidHighPortArb, (port) => {
          expect(isValidUserPort(port)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it("should reject non-integer ports", () => {
      fc.assert(
        fc.property(nonIntegerPortArb, (port) => {
          expect(isValidUserPort(port)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property: Default ports are within valid range
   * *For any* default port configuration, both SOCKS and HTTP ports SHALL be in valid range
   */
  describe("Default ports are within valid range", () => {
    it("should have default ports within valid range", () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const store = useSettingsStore();
          expect(isValidUserPort(store.settings.socksPort)).toBe(true);
          expect(isValidUserPort(store.settings.httpPort)).toBe(true);
        }),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property: Port update preserves validity
   * *For any* valid port value, updating settings SHALL preserve the port value
   */
  describe("Port update preserves validity", () => {
    it("should preserve valid SOCKS port after update", () => {
      fc.assert(
        fc.property(validPortArb, (port) => {
          const store = useSettingsStore();
          store.updateSettings({ socksPort: port });
          expect(store.settings.socksPort).toBe(port);
          expect(isValidUserPort(store.settings.socksPort)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should preserve valid HTTP port after update", () => {
      fc.assert(
        fc.property(validPortArb, (port) => {
          const store = useSettingsStore();
          store.updateSettings({ httpPort: port });
          expect(store.settings.httpPort).toBe(port);
          expect(isValidUserPort(store.settings.httpPort)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property: Reset restores default ports
   * *For any* modified port configuration, reset SHALL restore default values
   */
  describe("Reset restores default ports", () => {
    it("should restore default ports after reset", () => {
      fc.assert(
        fc.property(validPortArb, validPortArb, (socksPort, httpPort) => {
          const store = useSettingsStore();
          
          // Modify ports
          store.updateSettings({ socksPort, httpPort });
          
          // Reset proxy port settings
          store.resetProxyPortSettings();
          
          // Verify defaults restored
          expect(store.settings.socksPort).toBe(DEFAULT_SOCKS_PORT);
          expect(store.settings.httpPort).toBe(DEFAULT_HTTP_PORT);
        }),
        { numRuns: 100 }
      );
    });
  });
});
