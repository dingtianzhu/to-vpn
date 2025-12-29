/**
 * 延迟监控数据完整性属性测试
 * 验证监控数据包含所有必要字段: current, min, max, avg, jitter
 *
 * **Feature: vpn-optimization, Property 12: 延迟监控数据完整性**
 * **Validates: Requirements - 延迟优化**
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  calculateAverage,
  calculateJitter,
  detectLatencyAnomaly,
  updateMetricsFromSamples,
  DEFAULT_LATENCY_METRICS,
  type LatencyMetrics,
  type LatencyAnomalyResult,
} from "@/stores/vpn/useLatencyMonitor";

// ============ 生成器 ============

// 有效延迟值生成器 (1-2000ms 是合理的延迟范围)
const validLatencyArb = fc.integer({ min: 1, max: 2000 });

// 延迟样本数组生成器 (1-30 个样本)
const latencySamplesArb = fc.array(validLatencyArb, { minLength: 1, maxLength: 30 });

// 空或少量样本生成器 (用于测试边界情况)
const fewSamplesArb = fc.array(validLatencyArb, { minLength: 0, maxLength: 4 });

// ============ 辅助函数 ============

/**
 * 验证 LatencyMetrics 包含所有必要字段
 */
function hasAllRequiredFields(metrics: LatencyMetrics): boolean {
  return (
    typeof metrics.current === "number" &&
    typeof metrics.min === "number" &&
    typeof metrics.max === "number" &&
    typeof metrics.avg === "number" &&
    typeof metrics.jitter === "number" &&
    Array.isArray(metrics.samples) &&
    typeof metrics.lastUpdated === "number"
  );
}

/**
 * 验证指标值的合理性
 */
function areMetricsReasonable(metrics: LatencyMetrics): boolean {
  if (metrics.samples.length === 0) {
    return true; // 空样本时不做验证
  }
  
  // min 应该 <= avg <= max
  const minLeqAvg = metrics.min <= metrics.avg;
  const avgLeqMax = metrics.avg <= metrics.max;
  
  // min 和 max 应该在样本范围内
  const minInRange = metrics.min >= 0;
  const maxInRange = metrics.max >= metrics.min;
  
  // jitter 应该 >= 0
  const jitterNonNegative = metrics.jitter >= 0;
  
  return minLeqAvg && avgLeqMax && minInRange && maxInRange && jitterNonNegative;
}

// ============ 属性测试 ============

describe("Latency Monitor Data Integrity Properties", () => {
  /**
   * Property 12: 延迟监控数据完整性
   * *For any* 延迟监控会话，记录的指标应包含：current、min、max、avg、jitter
   */
  describe("Property 12: Latency metrics completeness", () => {
    it("Default metrics should have all required fields", () => {
      expect(hasAllRequiredFields(DEFAULT_LATENCY_METRICS)).toBe(true);
    });

    it("Updated metrics should have all required fields for any valid samples", () => {
      fc.assert(
        fc.property(
          latencySamplesArb,
          validLatencyArb,
          (samples, currentLatency) => {
            const metrics = updateMetricsFromSamples(samples, currentLatency);
            
            // 验证所有必要字段存在
            expect(typeof metrics.current).toBe("number");
            expect(typeof metrics.min).toBe("number");
            expect(typeof metrics.max).toBe("number");
            expect(typeof metrics.avg).toBe("number");
            expect(typeof metrics.jitter).toBe("number");
            expect(Array.isArray(metrics.samples)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Metrics should have reasonable values for any valid samples", () => {
      fc.assert(
        fc.property(
          latencySamplesArb,
          validLatencyArb,
          (samples, currentLatency) => {
            const metrics = {
              ...updateMetricsFromSamples(samples, currentLatency),
              lastUpdated: Date.now(),
            };
            
            expect(areMetricsReasonable(metrics)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Average calculation correctness", () => {
    it("Average should be correct for any valid samples", () => {
      fc.assert(
        fc.property(latencySamplesArb, (samples) => {
          const avg = calculateAverage(samples);
          const expectedAvg = Math.round(
            samples.reduce((a, b) => a + b, 0) / samples.length
          );
          
          expect(avg).toBe(expectedAvg);
        }),
        { numRuns: 100 }
      );
    });

    it("Average of empty array should be 0", () => {
      expect(calculateAverage([])).toBe(0);
    });

    it("Average of single element should be that element", () => {
      fc.assert(
        fc.property(validLatencyArb, (latency) => {
          expect(calculateAverage([latency])).toBe(latency);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Jitter calculation correctness", () => {
    it("Jitter should be non-negative for any valid samples", () => {
      fc.assert(
        fc.property(latencySamplesArb, (samples) => {
          const jitter = calculateJitter(samples);
          expect(jitter).toBeGreaterThanOrEqual(0);
        }),
        { numRuns: 100 }
      );
    });

    it("Jitter of empty or single element array should be 0", () => {
      expect(calculateJitter([])).toBe(0);
      
      fc.assert(
        fc.property(validLatencyArb, (latency) => {
          expect(calculateJitter([latency])).toBe(0);
        }),
        { numRuns: 100 }
      );
    });

    it("Jitter of identical values should be 0", () => {
      fc.assert(
        fc.property(
          validLatencyArb,
          fc.integer({ min: 2, max: 30 }),
          (latency, count) => {
            const samples = Array(count).fill(latency);
            expect(calculateJitter(samples)).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Min/Max calculation correctness", () => {
    it("Min should be the smallest value in samples", () => {
      fc.assert(
        fc.property(latencySamplesArb, validLatencyArb, (samples, current) => {
          const metrics = updateMetricsFromSamples(samples, current);
          expect(metrics.min).toBe(Math.min(...samples));
        }),
        { numRuns: 100 }
      );
    });

    it("Max should be the largest value in samples", () => {
      fc.assert(
        fc.property(latencySamplesArb, validLatencyArb, (samples, current) => {
          const metrics = updateMetricsFromSamples(samples, current);
          expect(metrics.max).toBe(Math.max(...samples));
        }),
        { numRuns: 100 }
      );
    });

    it("Min should always be <= Max", () => {
      fc.assert(
        fc.property(latencySamplesArb, validLatencyArb, (samples, current) => {
          const metrics = updateMetricsFromSamples(samples, current);
          expect(metrics.min).toBeLessThanOrEqual(metrics.max);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Anomaly detection correctness", () => {
    it("Should not detect anomaly with insufficient samples", () => {
      fc.assert(
        fc.property(
          fewSamplesArb,
          validLatencyArb,
          (samples, current) => {
            const avg = samples.length > 0 ? calculateAverage(samples) : 0;
            const result = detectLatencyAnomaly(current, avg, samples.length);
            
            // With < 5 samples, should never detect anomaly
            expect(result.isAnomaly).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Should detect anomaly when current > 3x average with sufficient samples", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 100 }), // base average
          fc.integer({ min: 5, max: 30 }),   // sample count
          (baseAvg, sampleCount) => {
            // Current latency is 4x the average (should trigger anomaly)
            const current = baseAvg * 4;
            const result = detectLatencyAnomaly(current, baseAvg, sampleCount);
            
            expect(result.isAnomaly).toBe(true);
            expect(result.threshold).toBe(baseAvg * 3);
            expect(result.currentValue).toBe(current);
            expect(result.reason).not.toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Should not detect anomaly when current <= 3x average", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 100 }), // base average
          fc.integer({ min: 5, max: 30 }),   // sample count
          fc.double({ min: 0.1, max: 3.0 }), // multiplier (0.1x to 3x)
          (baseAvg, sampleCount, multiplier) => {
            const current = Math.floor(baseAvg * multiplier);
            const result = detectLatencyAnomaly(current, baseAvg, sampleCount);
            
            expect(result.isAnomaly).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Anomaly result should always have all required fields", () => {
      fc.assert(
        fc.property(
          validLatencyArb,
          validLatencyArb,
          fc.integer({ min: 0, max: 50 }),
          (current, avg, sampleCount) => {
            const result: LatencyAnomalyResult = detectLatencyAnomaly(
              current,
              avg,
              sampleCount
            );
            
            expect(typeof result.isAnomaly).toBe("boolean");
            expect(typeof result.threshold).toBe("number");
            expect(typeof result.currentValue).toBe("number");
            // reason can be null or string
            expect(
              result.reason === null || typeof result.reason === "string"
            ).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Samples array management", () => {
    it("Samples array should be preserved in metrics", () => {
      fc.assert(
        fc.property(latencySamplesArb, validLatencyArb, (samples, current) => {
          const metrics = updateMetricsFromSamples(samples, current);
          
          expect(metrics.samples).toEqual(samples);
        }),
        { numRuns: 100 }
      );
    });

    it("Empty samples with positive current should create single-element array", () => {
      fc.assert(
        fc.property(validLatencyArb, (current) => {
          const metrics = updateMetricsFromSamples([], current);
          
          expect(metrics.samples).toEqual([current]);
          expect(metrics.current).toBe(current);
          expect(metrics.min).toBe(current);
          expect(metrics.max).toBe(current);
          expect(metrics.avg).toBe(current);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe("Edge cases", () => {
    it("Should handle zero average gracefully in anomaly detection", () => {
      fc.assert(
        fc.property(validLatencyArb, fc.integer({ min: 5, max: 30 }), (current, sampleCount) => {
          const result = detectLatencyAnomaly(current, 0, sampleCount);
          
          // With zero average, should not detect anomaly (avoid division issues)
          expect(result.isAnomaly).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it("Current value should be correctly set in metrics", () => {
      fc.assert(
        fc.property(latencySamplesArb, validLatencyArb, (samples, current) => {
          const metrics = updateMetricsFromSamples(samples, current);
          
          expect(metrics.current).toBe(current);
        }),
        { numRuns: 100 }
      );
    });
  });
});
