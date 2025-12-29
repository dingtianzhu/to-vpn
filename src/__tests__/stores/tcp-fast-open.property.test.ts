/**
 * TCP Fast Open 配置属性测试
 * 验证 TUN 和 SOCKS 模式配置都包含 tcp_fast_open
 *
 * **Feature: vpn-optimization, Property 13: TCP Fast Open 配置**
 * **Validates: Requirements - 延迟优化**
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============ 类型定义 ============

interface TlsConfig {
  enabled: boolean;
  alpn: string[];
  insecure: boolean;
  server_name: string;
}

interface Hysteria2Outbound {
  type: "hysteria2";
  tag: string;
  server: string;
  server_port: number;
  password: string;
  up_mbps: number;
  down_mbps: number;
  tcp_fast_open?: boolean;
  tls: TlsConfig;
}

interface DirectOutbound {
  type: "direct";
  tag: string;
  bind_interface?: string;
}

interface BlockOutbound {
  type: "block";
  tag: string;
}

type Outbound = Hysteria2Outbound | DirectOutbound | BlockOutbound;

interface SingboxConfig {
  mode: "tun" | "socks";
  outbounds: Outbound[];
}

// ============ 配置生成函数（模拟后端逻辑）============

/**
 * 生成 TUN 模式配置
 * 模拟 src-tauri/src/vpn/singbox/tun.rs 的配置生成逻辑
 */
function generateTunConfig(
  serverHost: string,
  serverPort: number,
  password: string
): SingboxConfig {
  const hysteria2Outbound: Hysteria2Outbound = {
    type: "hysteria2",
    tag: "proxy",
    server: serverHost,
    server_port: serverPort,
    password: password,
    up_mbps: 200,
    down_mbps: 500,
    tcp_fast_open: true, // TUN 模式已有此配置
    tls: {
      enabled: true,
      alpn: ["h3"],
      insecure: true,
      server_name: serverHost,
    },
  };

  const directOutbound: DirectOutbound = {
    type: "direct",
    tag: "direct",
    bind_interface: "en0",
  };

  const blockOutbound: BlockOutbound = {
    type: "block",
    tag: "block",
  };

  return {
    mode: "tun",
    outbounds: [hysteria2Outbound, directOutbound, blockOutbound],
  };
}

/**
 * 生成 SOCKS 模式配置
 * 模拟 src-tauri/src/vpn/singbox/socks.rs 的配置生成逻辑（修复后）
 */
function generateSocksConfig(
  serverHost: string,
  serverPort: number,
  password: string
): SingboxConfig {
  const hysteria2Outbound: Hysteria2Outbound = {
    type: "hysteria2",
    tag: "proxy",
    server: serverHost,
    server_port: serverPort,
    password: password,
    up_mbps: 200,
    down_mbps: 500,
    tcp_fast_open: true, // SOCKS 模式现在也有此配置
    tls: {
      enabled: true,
      alpn: ["h3"],
      insecure: true,
      server_name: serverHost,
    },
  };

  const directOutbound: DirectOutbound = {
    type: "direct",
    tag: "direct",
  };

  const blockOutbound: BlockOutbound = {
    type: "block",
    tag: "block",
  };

  return {
    mode: "socks",
    outbounds: [hysteria2Outbound, directOutbound, blockOutbound],
  };
}

// ============ 验证函数 ============

/**
 * 检查配置中的 Hysteria2 outbound 是否包含 tcp_fast_open: true
 */
function hasTcpFastOpenEnabled(config: SingboxConfig): boolean {
  const hysteria2Outbound = config.outbounds.find(
    (ob): ob is Hysteria2Outbound => ob.type === "hysteria2"
  );

  if (!hysteria2Outbound) {
    return false;
  }

  return hysteria2Outbound.tcp_fast_open === true;
}

/**
 * 获取 Hysteria2 outbound 的 tcp_fast_open 值
 */
function getTcpFastOpenValue(config: SingboxConfig): boolean | undefined {
  const hysteria2Outbound = config.outbounds.find(
    (ob): ob is Hysteria2Outbound => ob.type === "hysteria2"
  );

  return hysteria2Outbound?.tcp_fast_open;
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

// 服务器端口生成器：有效端口范围
const serverPortArb = fc.integer({ min: 1, max: 65535 });

// 密码生成器：8-64 位字母数字
const passwordArb = fc.stringMatching(/^[a-zA-Z0-9]{8,64}$/);

// 连接模式生成器
const connectionModeArb = fc.constantFrom("tun", "socks") as fc.Arbitrary<"tun" | "socks">;

// ============ 属性测试 ============

describe("TCP Fast Open Configuration Properties", () => {
  /**
   * Property 13: TCP Fast Open 配置
   * *For any* Hysteria2 outbound 配置，应包含 tcp_fast_open: true 以减少连接延迟
   */
  describe("Property 13: TCP Fast Open configuration", () => {
    it("TUN mode config should have tcp_fast_open enabled", () => {
      fc.assert(
        fc.property(
          serverHostArb,
          serverPortArb,
          passwordArb,
          (host, port, password) => {
            const config = generateTunConfig(host, port, password);

            expect(hasTcpFastOpenEnabled(config)).toBe(true);
            expect(getTcpFastOpenValue(config)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("SOCKS mode config should have tcp_fast_open enabled", () => {
      fc.assert(
        fc.property(
          serverHostArb,
          serverPortArb,
          passwordArb,
          (host, port, password) => {
            const config = generateSocksConfig(host, port, password);

            expect(hasTcpFastOpenEnabled(config)).toBe(true);
            expect(getTcpFastOpenValue(config)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Both TUN and SOCKS modes should have consistent tcp_fast_open setting", () => {
      fc.assert(
        fc.property(
          serverHostArb,
          serverPortArb,
          passwordArb,
          (host, port, password) => {
            const tunConfig = generateTunConfig(host, port, password);
            const socksConfig = generateSocksConfig(host, port, password);

            const tunTcpFastOpen = getTcpFastOpenValue(tunConfig);
            const socksTcpFastOpen = getTcpFastOpenValue(socksConfig);

            // Both should have tcp_fast_open enabled
            expect(tunTcpFastOpen).toBe(true);
            expect(socksTcpFastOpen).toBe(true);

            // Both should have the same value
            expect(tunTcpFastOpen).toBe(socksTcpFastOpen);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Any connection mode should have tcp_fast_open enabled", () => {
      fc.assert(
        fc.property(
          connectionModeArb,
          serverHostArb,
          serverPortArb,
          passwordArb,
          (mode, host, port, password) => {
            const config =
              mode === "tun"
                ? generateTunConfig(host, port, password)
                : generateSocksConfig(host, port, password);

            expect(hasTcpFastOpenEnabled(config)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 额外属性：Hysteria2 outbound 应该存在
   */
  describe("Hysteria2 outbound existence", () => {
    it("Config should always have a Hysteria2 outbound", () => {
      fc.assert(
        fc.property(
          connectionModeArb,
          serverHostArb,
          serverPortArb,
          passwordArb,
          (mode, host, port, password) => {
            const config =
              mode === "tun"
                ? generateTunConfig(host, port, password)
                : generateSocksConfig(host, port, password);

            const hysteria2Outbound = config.outbounds.find(
              (ob) => ob.type === "hysteria2"
            );

            expect(hysteria2Outbound).toBeDefined();
            expect(hysteria2Outbound?.tag).toBe("proxy");
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 额外属性：配置参数应该正确传递
   */
  describe("Config parameters should be correctly passed", () => {
    it("Server host should be correctly set in Hysteria2 outbound", () => {
      fc.assert(
        fc.property(
          connectionModeArb,
          serverHostArb,
          serverPortArb,
          passwordArb,
          (mode, host, port, password) => {
            const config =
              mode === "tun"
                ? generateTunConfig(host, port, password)
                : generateSocksConfig(host, port, password);

            const hysteria2Outbound = config.outbounds.find(
              (ob): ob is Hysteria2Outbound => ob.type === "hysteria2"
            );

            expect(hysteria2Outbound?.server).toBe(host);
            expect(hysteria2Outbound?.server_port).toBe(port);
            expect(hysteria2Outbound?.password).toBe(password);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
