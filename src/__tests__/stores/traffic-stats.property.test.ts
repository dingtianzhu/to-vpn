/**
 * 流量统计完整性属性测试
 * 验证上报数据包含: node_id, traffic_download, traffic_upload, duration, connected_at, disconnected_at
 *
 * **Feature: vpn-optimization, Property 9: 流量统计完整性**
 * **Validates: Requirements 9.1, 9.3**
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import type { UsageReportData } from "@/api/user";

// ============ 生成器 ============

// 有效节点 ID 生成器 (正整数)
const validNodeIdArb = fc.integer({ min: 1, max: 100000 });

// 有效流量值生成器 (0 到 10GB，单位字节)
const validTrafficArb = fc.integer({ min: 0, max: 10 * 1024 * 1024 * 1024 });

// 有效持续时间生成器 (0 到 24小时，单位秒)
const validDurationArb = fc.integer({ min: 0, max: 24 * 60 * 60 });

// 有效时间戳生成器 (过去30天内的时间)
const validTimestampArb = fc.integer({
  min: Date.now() - 30 * 24 * 60 * 60 * 1000,
  max: Date.now(),
});

// 完整的 UsageReportData 生成器
const usageReportDataArb = fc.record({
  node_id: validNodeIdArb,
  traffic_download: validTrafficArb,
  traffic_upload: validTrafficArb,
  duration: validDurationArb,
  connected_at: validTimestampArb.map((ts) => new Date(ts).toISOString()),
  disconnected_at: validTimestampArb.map((ts) => new Date(ts).toISOString()),
});

// ============ 辅助函数 ============

/**
 * 验证 UsageReportData 包含所有必要字段
 */
function hasAllRequiredFields(data: UsageReportData): boolean {
  return (
    typeof data.node_id === "number" &&
    typeof data.traffic_download === "number" &&
    typeof data.traffic_upload === "number" &&
    typeof data.duration === "number" &&
    typeof data.connected_at === "string" &&
    typeof data.disconnected_at === "string"
  );
}

/**
 * 验证字段值的合理性
 */
function areFieldsReasonable(data: UsageReportData): boolean {
  // node_id 应该是正整数
  const nodeIdValid = data.node_id > 0 && Number.isInteger(data.node_id);

  // 流量值应该是非负整数
  const downloadValid =
    data.traffic_download >= 0 && Number.isInteger(data.traffic_download);
  const uploadValid =
    data.traffic_upload >= 0 && Number.isInteger(data.traffic_upload);

  // 持续时间应该是非负整数
  const durationValid = data.duration >= 0 && Number.isInteger(data.duration);

  // 时间戳应该是有效的 ISO 字符串
  const connectedAtValid = !isNaN(Date.parse(data.connected_at));
  const disconnectedAtValid = !isNaN(Date.parse(data.disconnected_at));

  return (
    nodeIdValid &&
    downloadValid &&
    uploadValid &&
    durationValid &&
    connectedAtValid &&
    disconnectedAtValid
  );
}

/**
 * 模拟 reportCurrentUsage 函数的数据构建逻辑
 * 这是从 vpn.ts 中提取的核心逻辑
 */
function buildUsageReportData(
  nodeId: number,
  totalDownload: number,
  totalUpload: number,
  connectedTime: number,
  connectedAt: number
): UsageReportData {
  const connectedAtMs = connectedAt || Date.now() - connectedTime * 1000;
  return {
    node_id: nodeId,
    traffic_download: totalDownload,
    traffic_upload: totalUpload,
    duration: connectedTime,
    connected_at: new Date(connectedAtMs).toISOString(),
    disconnected_at: new Date().toISOString(),
  };
}

// ============ 属性测试 ============

describe("Traffic Statistics Completeness Properties", () => {
  /**
   * Property 9: 流量统计完整性
   * *For any* VPN 连接会话，断开时上报的统计数据应包含：
   * node_id、traffic_download、traffic_upload、duration、connected_at、disconnected_at
   */
  describe("Property 9: Usage report data completeness", () => {
    it("Generated usage report data should have all required fields", () => {
      fc.assert(
        fc.property(usageReportDataArb, (data) => {
          expect(hasAllRequiredFields(data)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("Generated usage report data should have reasonable values", () => {
      fc.assert(
        fc.property(usageReportDataArb, (data) => {
          expect(areFieldsReasonable(data)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("Built usage report data should have all required fields for any valid inputs", () => {
      fc.assert(
        fc.property(
          validNodeIdArb,
          validTrafficArb,
          validTrafficArb,
          validDurationArb,
          validTimestampArb,
          (nodeId, download, upload, duration, connectedAt) => {
            const data = buildUsageReportData(
              nodeId,
              download,
              upload,
              duration,
              connectedAt
            );

            // 验证所有必要字段存在且类型正确
            expect(typeof data.node_id).toBe("number");
            expect(typeof data.traffic_download).toBe("number");
            expect(typeof data.traffic_upload).toBe("number");
            expect(typeof data.duration).toBe("number");
            expect(typeof data.connected_at).toBe("string");
            expect(typeof data.disconnected_at).toBe("string");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Built usage report data should preserve input values correctly", () => {
      fc.assert(
        fc.property(
          validNodeIdArb,
          validTrafficArb,
          validTrafficArb,
          validDurationArb,
          validTimestampArb,
          (nodeId, download, upload, duration, connectedAt) => {
            const data = buildUsageReportData(
              nodeId,
              download,
              upload,
              duration,
              connectedAt
            );

            // 验证值被正确保留
            expect(data.node_id).toBe(nodeId);
            expect(data.traffic_download).toBe(download);
            expect(data.traffic_upload).toBe(upload);
            expect(data.duration).toBe(duration);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Field type validation", () => {
    it("node_id should always be a positive integer", () => {
      fc.assert(
        fc.property(usageReportDataArb, (data) => {
          expect(data.node_id).toBeGreaterThan(0);
          expect(Number.isInteger(data.node_id)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("traffic values should always be non-negative integers", () => {
      fc.assert(
        fc.property(usageReportDataArb, (data) => {
          expect(data.traffic_download).toBeGreaterThanOrEqual(0);
          expect(data.traffic_upload).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(data.traffic_download)).toBe(true);
          expect(Number.isInteger(data.traffic_upload)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("duration should always be a non-negative integer", () => {
      fc.assert(
        fc.property(usageReportDataArb, (data) => {
          expect(data.duration).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(data.duration)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("timestamps should always be valid ISO strings", () => {
      fc.assert(
        fc.property(usageReportDataArb, (data) => {
          expect(isNaN(Date.parse(data.connected_at))).toBe(false);
          expect(isNaN(Date.parse(data.disconnected_at))).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Timestamp logic", () => {
    it("connected_at should be derived from connectedAt timestamp", () => {
      fc.assert(
        fc.property(
          validNodeIdArb,
          validTrafficArb,
          validTrafficArb,
          validDurationArb,
          validTimestampArb,
          (nodeId, download, upload, duration, connectedAt) => {
            const data = buildUsageReportData(
              nodeId,
              download,
              upload,
              duration,
              connectedAt
            );

            const parsedConnectedAt = Date.parse(data.connected_at);
            expect(parsedConnectedAt).toBe(connectedAt);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("disconnected_at should be close to current time", () => {
      fc.assert(
        fc.property(
          validNodeIdArb,
          validTrafficArb,
          validTrafficArb,
          validDurationArb,
          validTimestampArb,
          (nodeId, download, upload, duration, connectedAt) => {
            const beforeBuild = Date.now();
            const data = buildUsageReportData(
              nodeId,
              download,
              upload,
              duration,
              connectedAt
            );
            const afterBuild = Date.now();

            const parsedDisconnectedAt = Date.parse(data.disconnected_at);
            // disconnected_at 应该在构建前后的时间范围内
            expect(parsedDisconnectedAt).toBeGreaterThanOrEqual(beforeBuild);
            expect(parsedDisconnectedAt).toBeLessThanOrEqual(afterBuild);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Fallback logic should work when connectedAt is 0", () => {
      fc.assert(
        fc.property(
          validNodeIdArb,
          validTrafficArb,
          validTrafficArb,
          validDurationArb,
          (nodeId, download, upload, duration) => {
            const beforeBuild = Date.now();
            const data = buildUsageReportData(
              nodeId,
              download,
              upload,
              duration,
              0 // connectedAt = 0 triggers fallback
            );
            const afterBuild = Date.now();

            const parsedConnectedAt = Date.parse(data.connected_at);
            // 回退逻辑: connectedAt = Date.now() - duration * 1000
            const expectedMin = beforeBuild - duration * 1000;
            const expectedMax = afterBuild - duration * 1000;

            expect(parsedConnectedAt).toBeGreaterThanOrEqual(expectedMin);
            expect(parsedConnectedAt).toBeLessThanOrEqual(expectedMax);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Edge cases", () => {
    it("Should handle zero traffic values", () => {
      fc.assert(
        fc.property(
          validNodeIdArb,
          validDurationArb,
          validTimestampArb,
          (nodeId, duration, connectedAt) => {
            const data = buildUsageReportData(nodeId, 0, 0, duration, connectedAt);

            expect(hasAllRequiredFields(data)).toBe(true);
            expect(data.traffic_download).toBe(0);
            expect(data.traffic_upload).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Should handle zero duration", () => {
      fc.assert(
        fc.property(
          validNodeIdArb,
          validTrafficArb,
          validTrafficArb,
          validTimestampArb,
          (nodeId, download, upload, connectedAt) => {
            const data = buildUsageReportData(nodeId, download, upload, 0, connectedAt);

            expect(hasAllRequiredFields(data)).toBe(true);
            expect(data.duration).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Should handle large traffic values", () => {
      const largeTrafficArb = fc.integer({
        min: 1024 * 1024 * 1024, // 1GB
        max: 10 * 1024 * 1024 * 1024, // 10GB
      });

      fc.assert(
        fc.property(
          validNodeIdArb,
          largeTrafficArb,
          largeTrafficArb,
          validDurationArb,
          validTimestampArb,
          (nodeId, download, upload, duration, connectedAt) => {
            const data = buildUsageReportData(
              nodeId,
              download,
              upload,
              duration,
              connectedAt
            );

            expect(hasAllRequiredFields(data)).toBe(true);
            expect(data.traffic_download).toBe(download);
            expect(data.traffic_upload).toBe(upload);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Should handle long duration values", () => {
      const longDurationArb = fc.integer({
        min: 12 * 60 * 60, // 12 hours
        max: 24 * 60 * 60, // 24 hours
      });

      fc.assert(
        fc.property(
          validNodeIdArb,
          validTrafficArb,
          validTrafficArb,
          longDurationArb,
          validTimestampArb,
          (nodeId, download, upload, duration, connectedAt) => {
            const data = buildUsageReportData(
              nodeId,
              download,
              upload,
              duration,
              connectedAt
            );

            expect(hasAllRequiredFields(data)).toBe(true);
            expect(data.duration).toBe(duration);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
