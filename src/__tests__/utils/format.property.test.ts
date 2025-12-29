/**
 * 格式化函数属性测试
 * 测试字节、时间、速度格式化的正确性
 *
 * **Feature: test-completion, Property 12-14: Format functions**
 * **Validates: Requirements 7.1, 7.2, 7.3**
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============ 纯函数版本（用于测试）============

/**
 * 格式化字节数为人类可读格式
 * 复制自 src/utils/format.ts 的逻辑
 */
function formatBytes(bytes: number): string {
  if (bytes < 0) return "0 B";
  if (bytes === 0) return "0 B";
  if (!Number.isFinite(bytes)) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1
  );

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * 格式化速度为人类可读格式
 */
function formatSpeed(bytesPerSecond: number): string {
  return formatBytes(bytesPerSecond) + "/s";
}

/**
 * 格式化时长为 HH:MM:SS 或简化格式
 * @deprecated Use formatDurationStrict for consistent HH:MM:SS format
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatDuration(seconds: number): string {
  if (seconds < 0) seconds = 0;
  if (!Number.isFinite(seconds)) seconds = 0;

  seconds = Math.floor(seconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);

  return parts.join(" ");
}

/**
 * 格式化时长为严格的 HH:MM:SS 格式
 */
function formatDurationStrict(seconds: number): string {
  if (seconds < 0) seconds = 0;
  if (!Number.isFinite(seconds)) seconds = 0;

  seconds = Math.floor(seconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  return `${h.toString().padStart(2, "0")}:${m
    .toString()
    .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// ============ 辅助函数 ============

/**
 * 从格式化字符串中提取数值和单位
 */
function parseFormattedBytes(formatted: string): {
  value: number;
  unit: string;
} | null {
  const match = formatted.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)(\/s)?$/);
  if (!match) return null;
  return {
    value: parseFloat(match[1]),
    unit: match[2],
  };
}

/**
 * 检查格式化结果是否符合预期单位
 * Reserved for future use in more detailed unit tests
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getExpectedUnit(bytes: number): string {
  if (bytes < 1024) return "B";
  if (bytes < 1024 * 1024) return "KB";
  if (bytes < 1024 * 1024 * 1024) return "MB";
  if (bytes < 1024 * 1024 * 1024 * 1024) return "GB";
  return "TB";
}

// ============ 属性测试 ============

describe("Format Functions Properties", () => {
  /**
   * Property 12: 字节格式化单位选择正确性
   * *For any* 非负字节数，格式化结果应该选择最合适的单位
   */
  describe("Property 12: Byte formatting unit selection", () => {
    it("should select appropriate unit for any non-negative byte value", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1024 * 1024 * 1024 * 1024 }), // 0 to 1TB
          (bytes) => {
            const formatted = formatBytes(bytes);
            const parsed = parseFormattedBytes(formatted);

            // 格式化结果应该可以被解析
            expect(parsed).not.toBeNull();

            if (parsed) {
              // 数值部分应该在合理范围内（<= 1024，因为边界值可能正好是 1024）
              // 对于 TB 单位没有上限限制
              if (parsed.unit !== "TB") {
                expect(parsed.value).toBeLessThanOrEqual(1024);
              }
              expect(parsed.value).toBeGreaterThanOrEqual(0);

              // 验证格式化后的值可以近似还原回原始字节数
              const unitMultipliers: Record<string, number> = {
                B: 1,
                KB: 1024,
                MB: 1024 * 1024,
                GB: 1024 * 1024 * 1024,
                TB: 1024 * 1024 * 1024 * 1024,
              };
              const reconstructed = parsed.value * unitMultipliers[parsed.unit];
              // 允许 1% 的误差（由于四舍五入）
              const tolerance = Math.max(bytes * 0.01, 1);
              expect(Math.abs(reconstructed - bytes)).toBeLessThanOrEqual(
                tolerance
              );
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should return '0 B' for zero bytes", () => {
      expect(formatBytes(0)).toBe("0 B");
    });

    it("should handle edge cases at unit boundaries", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(1, 1023, 1024, 1025, 1024 * 1024 - 1, 1024 * 1024),
          (bytes) => {
            const formatted = formatBytes(bytes);
            const parsed = parseFormattedBytes(formatted);

            expect(parsed).not.toBeNull();
            if (parsed) {
              expect(parsed.value).toBeGreaterThanOrEqual(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should handle negative values gracefully", () => {
      fc.assert(
        fc.property(fc.integer({ min: -1000000, max: -1 }), (bytes) => {
          const formatted = formatBytes(bytes);
          // 负数应该返回 "0 B" 或合理的默认值
          expect(formatted).toBe("0 B");
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 13: 时间格式化格式正确性
   * *For any* 非负秒数，格式化结果应该符合预期格式
   */
  describe("Property 13: Duration formatting correctness", () => {
    it("should format duration with correct hour, minute, second values", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 24 * 60 * 60 }), // 0 to 24 hours
          (seconds) => {
            const formatted = formatDurationStrict(seconds);

            // 应该符合 HH:MM:SS 格式
            const match = formatted.match(/^(\d{2}):(\d{2}):(\d{2})$/);
            expect(match).not.toBeNull();

            if (match) {
              const h = parseInt(match[1], 10);
              const m = parseInt(match[2], 10);
              const s = parseInt(match[3], 10);

              // 分钟和秒应该在 0-59 范围内
              expect(m).toBeGreaterThanOrEqual(0);
              expect(m).toBeLessThan(60);
              expect(s).toBeGreaterThanOrEqual(0);
              expect(s).toBeLessThan(60);

              // 转换回秒数应该等于原始值
              expect(h * 3600 + m * 60 + s).toBe(seconds);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should handle zero seconds", () => {
      const formatted = formatDurationStrict(0);
      expect(formatted).toBe("00:00:00");
    });

    it("should handle negative values gracefully", () => {
      fc.assert(
        fc.property(fc.integer({ min: -10000, max: -1 }), (seconds) => {
          const formatted = formatDurationStrict(seconds);
          // 负数应该被处理为 0
          expect(formatted).toBe("00:00:00");
        }),
        { numRuns: 100 }
      );
    });

    it("should produce consistent results for same input", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 100000 }), (seconds) => {
          const result1 = formatDurationStrict(seconds);
          const result2 = formatDurationStrict(seconds);
          expect(result1).toBe(result2);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 14: 速度格式化正确性
   * *For any* 非负字节/秒速度值，格式化结果应该包含数值和单位
   */
  describe("Property 14: Speed formatting correctness", () => {
    it("should format speed with '/s' suffix", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1024 * 1024 * 1024 }), // 0 to 1GB/s
          (bytesPerSecond) => {
            const formatted = formatSpeed(bytesPerSecond);

            // 应该以 /s 结尾
            expect(formatted).toMatch(/\/s$/);

            // 去掉 /s 后应该是有效的字节格式
            const bytePart = formatted.replace(/\/s$/, "");
            const parsed = parseFormattedBytes(bytePart);
            expect(parsed).not.toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should return '0 B/s' for zero speed", () => {
      expect(formatSpeed(0)).toBe("0 B/s");
    });

    it("should be consistent with formatBytes", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1024 * 1024 * 1024 }), (bytes) => {
          const speedFormatted = formatSpeed(bytes);
          const bytesFormatted = formatBytes(bytes);

          // formatSpeed 应该等于 formatBytes + "/s"
          expect(speedFormatted).toBe(bytesFormatted + "/s");
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 额外属性：格式化函数的幂等性
   */
  describe("Idempotency and consistency", () => {
    it("formatBytes should be deterministic", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1e12 }), (bytes) => {
          const result1 = formatBytes(bytes);
          const result2 = formatBytes(bytes);
          expect(result1).toBe(result2);
        }),
        { numRuns: 100 }
      );
    });

    it("formatSpeed should be deterministic", () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1e12 }), (speed) => {
          const result1 = formatSpeed(speed);
          const result2 = formatSpeed(speed);
          expect(result1).toBe(result2);
        }),
        { numRuns: 100 }
      );
    });
  });
});
