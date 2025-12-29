/**
 * 网络接口检测属性测试
 * 测试动态网络接口检测和 TUN 配置生成的正确性
 *
 * **Feature: vpn-optimization, Property 1-3: 网络接口检测**
 * **Validates: Requirements 1.1, 1.2, 1.3, 6.1, 6.2, 6.3**
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============ 类型定义 ============

type InterfaceType = "wifi" | "ethernet" | "other";

interface InterfaceInfo {
  name: string;
  interfaceType: InterfaceType;
  isActive: boolean;
  ipv4Address: string | null;
}

interface DirectOutbound {
  type: "direct";
  tag: string;
  bind_interface?: string;
}

interface RouteConfig {
  auto_detect_interface: boolean;
  final: string;
  rule_set: unknown[];
  rules: unknown[];
}

interface TunConfig {
  outbounds: Array<{ type: string; tag: string; bind_interface?: string }>;
  route: RouteConfig;
}

// ============ 模拟后端逻辑的纯函数 ============

/**
 * 模拟 detect_active_interface() 函数
 * 根据系统网络状态返回活动接口信息
 * 
 * **Feature: vpn-optimization, Property 1: 网络接口检测正确性**
 */
function detectActiveInterface(
  interfaces: InterfaceInfo[]
): InterfaceInfo | null {
  // 查找第一个活跃且有 IPv4 地址的接口
  const activeInterface = interfaces.find(
    (iface) => iface.isActive && iface.ipv4Address !== null
  );
  return activeInterface || null;
}

/**
 * 模拟 list_all_interfaces() 函数
 * 返回所有可用网络接口
 */
function listAllInterfaces(interfaces: InterfaceInfo[]): InterfaceInfo[] {
  // 过滤掉 loopback 和虚拟接口
  return interfaces.filter(
    (iface) =>
      !iface.name.startsWith("lo") &&
      !iface.name.startsWith("utun") &&
      !iface.name.startsWith("bridge") &&
      !iface.name.startsWith("docker")
  );
}

/**
 * 生成 direct outbound 配置
 * 
 * **Feature: vpn-optimization, Property 2 & 3: 接口检测回退逻辑和 TUN 配置接口绑定**
 */
function generateDirectOutbound(
  detectedInterface: InterfaceInfo | null
): DirectOutbound {
  if (detectedInterface) {
    return {
      type: "direct",
      tag: "direct",
      bind_interface: detectedInterface.name,
    };
  } else {
    // 回退：不指定 bind_interface，依赖 auto_detect_interface
    return {
      type: "direct",
      tag: "direct",
    };
  }
}

/**
 * 生成完整的 TUN 配置
 */
function generateTunConfig(
  interfaces: InterfaceInfo[]
): TunConfig {
  const detectedInterface = detectActiveInterface(interfaces);
  const directOutbound = generateDirectOutbound(detectedInterface);

  return {
    outbounds: [
      { type: "hysteria2", tag: "proxy" },
      directOutbound,
      { type: "block", tag: "block" },
    ],
    route: {
      auto_detect_interface: true,
      final: "proxy",
      rule_set: [],
      rules: [],
    },
  };
}

/**
 * 验证接口名称是否有效
 */
function isValidInterfaceName(name: string): boolean {
  // 接口名称应该是非空的字母数字字符串
  return /^[a-zA-Z][a-zA-Z0-9]*$/.test(name);
}

/**
 * 验证 IPv4 地址格式
 */
function isValidIpv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    const num = parseInt(part, 10);
    return !isNaN(num) && num >= 0 && num <= 255;
  });
}

// ============ 生成器 ============

// macOS 风格的接口名称生成器
const macosInterfaceNameArb = fc.oneof(
  fc.constantFrom("en0", "en1", "en2", "en3", "en4", "en5"),
  fc.constantFrom("bridge0", "bridge1"),
  fc.constantFrom("utun0", "utun1", "utun2"),
  fc.constantFrom("lo0")
);

// Linux 风格的接口名称生成器
const linuxInterfaceNameArb = fc.oneof(
  fc.constantFrom("eth0", "eth1", "enp0s3", "enp0s8"),
  fc.constantFrom("wlan0", "wlp2s0"),
  fc.constantFrom("docker0", "virbr0"),
  fc.constantFrom("lo")
);

// 有效的物理接口名称（排除虚拟接口）
const validPhysicalInterfaceNameArb = fc.oneof(
  fc.constantFrom("en0", "en1", "en2", "en3"),
  fc.constantFrom("eth0", "eth1", "enp0s3"),
  fc.constantFrom("wlan0", "wlp2s0")
);

// 接口类型生成器
const interfaceTypeArb: fc.Arbitrary<InterfaceType> = fc.constantFrom(
  "wifi",
  "ethernet",
  "other"
);

// IPv4 地址生成器
const ipv4AddressArb = fc
  .tuple(
    fc.integer({ min: 1, max: 254 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 1, max: 254 })
  )
  .map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

// 活跃接口信息生成器
const activeInterfaceArb: fc.Arbitrary<InterfaceInfo> = fc.record({
  name: validPhysicalInterfaceNameArb,
  interfaceType: interfaceTypeArb,
  isActive: fc.constant(true),
  ipv4Address: ipv4AddressArb.map((ip) => ip as string | null),
});

// 非活跃接口信息生成器
const inactiveInterfaceArb: fc.Arbitrary<InterfaceInfo> = fc.record({
  name: validPhysicalInterfaceNameArb,
  interfaceType: interfaceTypeArb,
  isActive: fc.constant(false),
  ipv4Address: fc.constant(null),
});

// 混合接口列表生成器（包含活跃和非活跃接口）
const interfaceListArb = fc.array(
  fc.oneof(activeInterfaceArb, inactiveInterfaceArb),
  { minLength: 0, maxLength: 5 }
);

// 至少有一个活跃接口的列表生成器
const interfaceListWithActiveArb = fc
  .tuple(activeInterfaceArb, interfaceListArb)
  .map(([active, others]) => [active, ...others]);

// 全部非活跃接口的列表生成器
const allInactiveInterfaceListArb = fc.array(inactiveInterfaceArb, {
  minLength: 1,
  maxLength: 5,
});

// ============ 属性测试 ============

describe("Network Interface Detection Properties", () => {
  /**
   * Property 1: 网络接口检测正确性
   * *For any* 系统网络状态，如果存在活动的网络接口，则 detect_active_interface() 应返回有效的接口信息
   * 
   * **Feature: vpn-optimization, Property 1: 网络接口检测正确性**
   * **Validates: Requirements 1.1, 1.2**
   */
  describe("Property 1: Network interface detection correctness", () => {
    it("should return valid interface info when active interface exists", () => {
      fc.assert(
        fc.property(interfaceListWithActiveArb, (interfaces) => {
          const detected = detectActiveInterface(interfaces);

          // 应该检测到接口
          expect(detected).not.toBeNull();

          if (detected) {
            // 检测到的接口应该是活跃的
            expect(detected.isActive).toBe(true);

            // 检测到的接口应该有有效的 IPv4 地址
            expect(detected.ipv4Address).not.toBeNull();
            if (detected.ipv4Address) {
              expect(isValidIpv4(detected.ipv4Address)).toBe(true);
            }

            // 接口名称应该有效
            expect(isValidInterfaceName(detected.name)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it("should return null when no active interface exists", () => {
      fc.assert(
        fc.property(allInactiveInterfaceListArb, (interfaces) => {
          const detected = detectActiveInterface(interfaces);

          // 没有活跃接口时应该返回 null
          expect(detected).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    it("should return null for empty interface list", () => {
      const detected = detectActiveInterface([]);
      expect(detected).toBeNull();
    });

    it("should detect interface with valid IPv4 address", () => {
      fc.assert(
        fc.property(activeInterfaceArb, (activeInterface) => {
          const interfaces = [activeInterface];
          const detected = detectActiveInterface(interfaces);

          expect(detected).not.toBeNull();
          expect(detected?.name).toBe(activeInterface.name);
          expect(detected?.ipv4Address).toBe(activeInterface.ipv4Address);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2: 接口检测回退逻辑
   * *For any* 网络接口检测失败的情况，生成的 TUN 配置应不包含 bind_interface 字段
   * 
   * **Feature: vpn-optimization, Property 2: 接口检测回退逻辑**
   * **Validates: Requirements 1.3, 6.3**
   */
  describe("Property 2: Interface detection fallback logic", () => {
    it("should not include bind_interface when no active interface detected", () => {
      fc.assert(
        fc.property(allInactiveInterfaceListArb, (interfaces) => {
          const config = generateTunConfig(interfaces);
          const directOutbound = config.outbounds.find(
            (ob) => ob.type === "direct"
          );

          // 应该存在 direct outbound
          expect(directOutbound).toBeDefined();

          // 不应该包含 bind_interface
          expect(directOutbound?.bind_interface).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });

    it("should not include bind_interface for empty interface list", () => {
      const config = generateTunConfig([]);
      const directOutbound = config.outbounds.find(
        (ob) => ob.type === "direct"
      );

      expect(directOutbound).toBeDefined();
      expect(directOutbound?.bind_interface).toBeUndefined();
    });

    it("should always have auto_detect_interface enabled in route config", () => {
      fc.assert(
        fc.property(interfaceListArb, (interfaces) => {
          const config = generateTunConfig(interfaces);

          // auto_detect_interface 应该始终为 true
          expect(config.route.auto_detect_interface).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should fallback gracefully when detection returns null", () => {
      const directOutbound = generateDirectOutbound(null);

      expect(directOutbound.type).toBe("direct");
      expect(directOutbound.tag).toBe("direct");
      expect(directOutbound.bind_interface).toBeUndefined();
    });
  });

  /**
   * Property 3: TUN 配置接口绑定
   * *For any* 成功检测到的网络接口，生成的 TUN 配置中 direct outbound 的 bind_interface 应等于检测到的接口名
   * 
   * **Feature: vpn-optimization, Property 3: TUN 配置接口绑定**
   * **Validates: Requirements 6.1, 6.2**
   */
  describe("Property 3: TUN config interface binding", () => {
    it("should bind to detected interface name", () => {
      fc.assert(
        fc.property(interfaceListWithActiveArb, (interfaces) => {
          const detected = detectActiveInterface(interfaces);
          const config = generateTunConfig(interfaces);
          const directOutbound = config.outbounds.find(
            (ob) => ob.type === "direct"
          );

          // 应该检测到接口
          expect(detected).not.toBeNull();

          // direct outbound 应该绑定到检测到的接口
          expect(directOutbound?.bind_interface).toBe(detected?.name);
        }),
        { numRuns: 100 }
      );
    });

    it("should use exact interface name from detection", () => {
      fc.assert(
        fc.property(activeInterfaceArb, (activeInterface) => {
          const directOutbound = generateDirectOutbound(activeInterface);

          // bind_interface 应该完全匹配检测到的接口名
          expect(directOutbound.bind_interface).toBe(activeInterface.name);
        }),
        { numRuns: 100 }
      );
    });

    it("should preserve interface type information", () => {
      fc.assert(
        fc.property(activeInterfaceArb, (activeInterface) => {
          const detected = detectActiveInterface([activeInterface]);

          expect(detected).not.toBeNull();
          expect(detected?.interfaceType).toBe(activeInterface.interfaceType);
        }),
        { numRuns: 100 }
      );
    });

    it("should handle different interface types correctly", () => {
      fc.assert(
        fc.property(
          interfaceTypeArb,
          validPhysicalInterfaceNameArb,
          ipv4AddressArb,
          (interfaceType, name, ip) => {
            const activeInterface: InterfaceInfo = {
              name,
              interfaceType,
              isActive: true,
              ipv4Address: ip,
            };

            const directOutbound = generateDirectOutbound(activeInterface);

            // 无论接口类型如何，都应该正确绑定
            expect(directOutbound.bind_interface).toBe(name);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 额外属性：接口列表过滤
   */
  describe("Interface list filtering", () => {
    it("should filter out loopback interfaces", () => {
      const interfaces: InterfaceInfo[] = [
        { name: "lo0", interfaceType: "other", isActive: true, ipv4Address: "127.0.0.1" },
        { name: "en0", interfaceType: "wifi", isActive: true, ipv4Address: "192.168.1.100" },
      ];

      const filtered = listAllInterfaces(interfaces);

      expect(filtered.some((i) => i.name === "lo0")).toBe(false);
      expect(filtered.some((i) => i.name === "en0")).toBe(true);
    });

    it("should filter out virtual interfaces", () => {
      const interfaces: InterfaceInfo[] = [
        { name: "utun0", interfaceType: "other", isActive: true, ipv4Address: "10.0.0.1" },
        { name: "bridge0", interfaceType: "other", isActive: true, ipv4Address: "10.0.1.1" },
        { name: "docker0", interfaceType: "other", isActive: true, ipv4Address: "172.17.0.1" },
        { name: "en0", interfaceType: "wifi", isActive: true, ipv4Address: "192.168.1.100" },
      ];

      const filtered = listAllInterfaces(interfaces);

      expect(filtered.some((i) => i.name === "utun0")).toBe(false);
      expect(filtered.some((i) => i.name === "bridge0")).toBe(false);
      expect(filtered.some((i) => i.name === "docker0")).toBe(false);
      expect(filtered.some((i) => i.name === "en0")).toBe(true);
    });
  });

  /**
   * 额外属性：配置一致性
   */
  describe("Configuration consistency", () => {
    it("should always have required outbound types", () => {
      fc.assert(
        fc.property(interfaceListArb, (interfaces) => {
          const config = generateTunConfig(interfaces);

          const outboundTypes = config.outbounds.map((ob) => ob.type);

          expect(outboundTypes).toContain("hysteria2");
          expect(outboundTypes).toContain("direct");
          expect(outboundTypes).toContain("block");
        }),
        { numRuns: 100 }
      );
    });

    it("should have correct outbound tags", () => {
      fc.assert(
        fc.property(interfaceListArb, (interfaces) => {
          const config = generateTunConfig(interfaces);

          const directOutbound = config.outbounds.find(
            (ob) => ob.type === "direct"
          );

          expect(directOutbound?.tag).toBe("direct");
        }),
        { numRuns: 100 }
      );
    });
  });
});
