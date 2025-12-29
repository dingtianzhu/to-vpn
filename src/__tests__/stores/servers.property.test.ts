/**
 * 服务器节点验证属性测试
 * 测试节点数据验证和状态映射的正确性
 *
 * **Feature: test-completion, Property 1-2: Server node validation**
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============ 类型定义 ============

interface ServerNode {
  id: number;
  domain: string;
  port: number;
  password: string;
  country: string;
  city: string;
  flag: string;
  status: number;
  name?: string;
  tags?: string[];
  region?: string;
  tier?: number;
}

type ServerStatus = "online" | "maintenance" | "offline";

// ============ 纯函数版本（用于测试）============

/**
 * 验证服务器节点数据的完整性
 */
function isValidServerNode(node: Partial<ServerNode>): boolean {
  // 检查 id
  if (typeof node.id !== "number" || node.id <= 0) {
    return false;
  }

  // 检查 domain
  if (typeof node.domain !== "string" || node.domain.trim() === "") {
    return false;
  }

  // 检查 port
  if (typeof node.port !== "number" || node.port < 1 || node.port > 65535) {
    return false;
  }

  // 检查 password
  if (typeof node.password !== "string" || node.password === "") {
    return false;
  }

  // 检查 country
  if (typeof node.country !== "string" || node.country.trim() === "") {
    return false;
  }

  // 检查 city
  if (typeof node.city !== "string" || node.city.trim() === "") {
    return false;
  }

  // 检查 flag
  if (typeof node.flag !== "string" || node.flag.trim() === "") {
    return false;
  }

  // 检查 status
  if (typeof node.status !== "number" || ![1, 2, 3].includes(node.status)) {
    return false;
  }

  return true;
}

/**
 * 将后端数字状态映射为前端字符串状态
 */
function mapStatus(status: number): ServerStatus {
  switch (status) {
    case 1:
      return "online";
    case 2:
      return "maintenance";
    case 3:
      return "offline";
    default:
      return "offline";
  }
}

/**
 * 将前端字符串状态映射回后端数字状态
 */
function reverseMapStatus(status: ServerStatus): number {
  switch (status) {
    case "online":
      return 1;
    case "maintenance":
      return 2;
    case "offline":
      return 3;
    default:
      return 3;
  }
}

/**
 * 过滤有效的服务器节点
 */
function filterValidNodes(nodes: Partial<ServerNode>[]): ServerNode[] {
  return nodes.filter(isValidServerNode) as ServerNode[];
}

// ============ 生成器 ============

/**
 * 生成有效的服务器节点
 */
const validServerNodeArb: fc.Arbitrary<ServerNode> = fc.record({
  id: fc.integer({ min: 1, max: 10000 }),
  domain: fc.oneof(
    fc.stringMatching(/^[a-z0-9][a-z0-9-]*\.[a-z]{2,}$/),
    fc.stringMatching(/^(\d{1,3}\.){3}\d{1,3}$/)
  ),
  port: fc.integer({ min: 1, max: 65535 }),
  password: fc.stringMatching(/^[a-zA-Z0-9]{1,256}$/),
  country: fc.constantFrom("US", "JP", "HK", "SG", "KR", "DE", "UK"),
  city: fc.stringMatching(/^[a-zA-Z][a-zA-Z ]{0,49}$/),
  flag: fc.constantFrom("🇺🇸", "🇯🇵", "🇭🇰", "🇸🇬", "🇰🇷", "🇩🇪", "🇬🇧"),
  status: fc.constantFrom(1, 2, 3),
});

/**
 * 生成无效的服务器节点（缺少必填字段或字段无效）
 */
const invalidServerNodeArb: fc.Arbitrary<Partial<ServerNode>> = fc.oneof(
  // 缺少 id
  fc.record({
    domain: fc.string({ minLength: 1 }),
    port: fc.integer({ min: 1, max: 65535 }),
    password: fc.string({ minLength: 1 }),
    country: fc.string({ minLength: 1 }),
    city: fc.string({ minLength: 1 }),
    flag: fc.string({ minLength: 1 }),
    status: fc.constantFrom(1, 2, 3),
  }),
  // domain 为空
  fc.record({
    id: fc.integer({ min: 1 }),
    domain: fc.constant(""),
    port: fc.integer({ min: 1, max: 65535 }),
    password: fc.string({ minLength: 1 }),
    country: fc.string({ minLength: 1 }),
    city: fc.string({ minLength: 1 }),
    flag: fc.string({ minLength: 1 }),
    status: fc.constantFrom(1, 2, 3),
  }),
  // port 无效
  fc.record({
    id: fc.integer({ min: 1 }),
    domain: fc.string({ minLength: 1 }),
    port: fc.oneof(fc.constant(0), fc.integer({ min: 65536, max: 100000 })),
    password: fc.string({ minLength: 1 }),
    country: fc.string({ minLength: 1 }),
    city: fc.string({ minLength: 1 }),
    flag: fc.string({ minLength: 1 }),
    status: fc.constantFrom(1, 2, 3),
  }),
  // password 为空
  fc.record({
    id: fc.integer({ min: 1 }),
    domain: fc.string({ minLength: 1 }),
    port: fc.integer({ min: 1, max: 65535 }),
    password: fc.constant(""),
    country: fc.string({ minLength: 1 }),
    city: fc.string({ minLength: 1 }),
    flag: fc.string({ minLength: 1 }),
    status: fc.constantFrom(1, 2, 3),
  })
);

// ============ 属性测试 ============

describe("Server Node Validation Properties", () => {
  /**
   * Property 1: 服务器节点验证完整性
   * *For any* 服务器节点数据，如果所有必填字段都有效，则验证函数应返回 true
   */
  describe("Property 1: Server node validation completeness", () => {
    it("should return true for valid server nodes", () => {
      fc.assert(
        fc.property(validServerNodeArb, (node) => {
          expect(isValidServerNode(node)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should return false for invalid server nodes", () => {
      fc.assert(
        fc.property(invalidServerNodeArb, (node) => {
          expect(isValidServerNode(node)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it("should reject nodes with empty domain", () => {
      fc.assert(
        fc.property(
          validServerNodeArb.map((node) => ({ ...node, domain: "" })),
          (node) => {
            expect(isValidServerNode(node)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should reject nodes with null domain", () => {
      fc.assert(
        fc.property(
          validServerNodeArb.map((node) => ({
            ...node,
            domain: null as unknown as string,
          })),
          (node) => {
            expect(isValidServerNode(node)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should reject nodes with port out of range", () => {
      fc.assert(
        fc.property(
          validServerNodeArb,
          fc.oneof(
            fc.integer({ min: -1000, max: 0 }),
            fc.integer({ min: 65536, max: 100000 })
          ),
          (node, invalidPort) => {
            const invalidNode = { ...node, port: invalidPort };
            expect(isValidServerNode(invalidNode)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should accept boundary port values (1 and 65535)", () => {
      fc.assert(
        fc.property(validServerNodeArb, (node) => {
          const nodeWithPort1 = { ...node, port: 1 };
          const nodeWithPort65535 = { ...node, port: 65535 };

          expect(isValidServerNode(nodeWithPort1)).toBe(true);
          expect(isValidServerNode(nodeWithPort65535)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should reject nodes with invalid status", () => {
      fc.assert(
        fc.property(
          validServerNodeArb,
          fc.integer().filter((n) => ![1, 2, 3].includes(n)),
          (node, invalidStatus) => {
            const invalidNode = { ...node, status: invalidStatus };
            expect(isValidServerNode(invalidNode)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2: 状态映射双向一致性
   * *For any* 有效的后端状态值，映射到前端状态后应该正确表示节点的可用性
   */
  describe("Property 2: Status mapping bidirectional consistency", () => {
    it("should correctly map backend status to frontend status", () => {
      expect(mapStatus(1)).toBe("online");
      expect(mapStatus(2)).toBe("maintenance");
      expect(mapStatus(3)).toBe("offline");
    });

    it("should return offline for unknown status values", () => {
      fc.assert(
        fc.property(
          fc.integer().filter((n) => ![1, 2, 3].includes(n)),
          (unknownStatus) => {
            expect(mapStatus(unknownStatus)).toBe("offline");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should be reversible for valid status values", () => {
      fc.assert(
        fc.property(fc.constantFrom(1, 2, 3), (backendStatus) => {
          const frontendStatus = mapStatus(backendStatus);
          const reversedStatus = reverseMapStatus(frontendStatus);

          expect(reversedStatus).toBe(backendStatus);
        }),
        { numRuns: 100 }
      );
    });

    it("should map all frontend statuses correctly", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("online", "maintenance", "offline") as fc.Arbitrary<ServerStatus>,
          (frontendStatus) => {
            const backendStatus = reverseMapStatus(frontendStatus);
            const mappedBack = mapStatus(backendStatus);

            expect(mappedBack).toBe(frontendStatus);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should indicate connectivity based on status", () => {
      // online (1) means connectable
      expect(mapStatus(1)).toBe("online");

      // maintenance (2) means temporarily unavailable
      expect(mapStatus(2)).toBe("maintenance");

      // offline (3) means not available
      expect(mapStatus(3)).toBe("offline");
    });
  });

  /**
   * 额外属性：过滤有效节点
   */
  describe("Filter valid nodes", () => {
    it("should filter out invalid nodes from mixed array", () => {
      fc.assert(
        fc.property(
          fc.array(validServerNodeArb, { minLength: 0, maxLength: 5 }),
          fc.array(invalidServerNodeArb, { minLength: 0, maxLength: 5 }),
          (validNodes, invalidNodes) => {
            const mixed = [...validNodes, ...invalidNodes];
            const filtered = filterValidNodes(mixed);

            // All filtered nodes should be valid
            filtered.forEach((node) => {
              expect(isValidServerNode(node)).toBe(true);
            });

            // Should have at most the number of valid nodes
            expect(filtered.length).toBeLessThanOrEqual(validNodes.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should preserve all valid nodes", () => {
      fc.assert(
        fc.property(
          fc.array(validServerNodeArb, { minLength: 1, maxLength: 10 }),
          (validNodes) => {
            const filtered = filterValidNodes(validNodes);

            // All valid nodes should be preserved
            expect(filtered.length).toBe(validNodes.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
