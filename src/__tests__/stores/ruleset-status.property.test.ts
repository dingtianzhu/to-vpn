/**
 * 规则集版本检查属性测试
 * 验证超过 7 天的规则集返回 needs_update = true
 *
 * **Feature: vpn-optimization, Property 8: 规则集版本检查**
 * **Validates: Requirements 5.3, 7.3**
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============ 类型定义 ============

/**
 * 规则集信息类型（与后端 RulesetInfo 结构对应）
 */
interface RulesetInfo {
  name: string;
  path: string;
  exists: boolean;
  size: number;
  last_modified: number | null;
  last_modified_formatted: string | null;
  needs_update: boolean;
  days_since_update: number | null;
}

/**
 * 规则集状态汇总类型（与后端 RulesetStatus 结构对应）
 */
interface RulesetStatus {
  geosite_cn: RulesetInfo;
  geoip_cn: RulesetInfo;
  any_needs_update: boolean;
  checked_at: number;
}

// ============ 常量 ============

/**
 * 规则集更新检查阈值（7 天）
 * 与后端 RULESET_UPDATE_THRESHOLD_DAYS 保持一致
 */
const RULESET_UPDATE_THRESHOLD_DAYS = 7;

/**
 * 一天的秒数
 */
const SECONDS_PER_DAY = 24 * 60 * 60;

// ============ 模拟后端逻辑的函数 ============

/**
 * 计算距离上次更新的天数
 * 模拟后端 get_ruleset_info 中的计算逻辑
 */
function calculateDaysSinceUpdate(lastModifiedTimestamp: number, nowTimestamp: number): number {
  const elapsedSecs = Math.max(0, nowTimestamp - lastModifiedTimestamp);
  return Math.floor(elapsedSecs / SECONDS_PER_DAY);
}

/**
 * 检查规则集是否需要更新
 * 模拟后端 needs_update 函数的逻辑
 * 
 * **Feature: vpn-optimization, Property 8: 规则集版本检查**
 * **Validates: Requirements 5.3, 7.3**
 */
function needsUpdate(daysSinceUpdate: number | null, exists: boolean): boolean {
  // 文件不存在，需要下载
  if (!exists) {
    return true;
  }
  
  // 无法获取修改时间，视为需要更新
  if (daysSinceUpdate === null) {
    return true;
  }
  
  // 超过 7 天需要更新
  return daysSinceUpdate >= RULESET_UPDATE_THRESHOLD_DAYS;
}

/**
 * 生成规则集信息
 * 模拟后端 get_ruleset_info 函数的逻辑
 */
function generateRulesetInfo(
  name: string,
  path: string,
  exists: boolean,
  size: number,
  lastModifiedTimestamp: number | null,
  nowTimestamp: number
): RulesetInfo {
  let daysSinceUpdate: number | null = null;
  let lastModifiedFormatted: string | null = null;
  
  if (exists && lastModifiedTimestamp !== null) {
    daysSinceUpdate = calculateDaysSinceUpdate(lastModifiedTimestamp, nowTimestamp);
    lastModifiedFormatted = formatTimestamp(lastModifiedTimestamp);
  }
  
  return {
    name,
    path,
    exists,
    size: exists ? size : 0,
    last_modified: lastModifiedTimestamp,
    last_modified_formatted: lastModifiedFormatted,
    needs_update: needsUpdate(daysSinceUpdate, exists),
    days_since_update: daysSinceUpdate,
  };
}

/**
 * 格式化时间戳为 YYYY-MM-DD 格式
 * 简化版本，用于测试
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 生成规则集状态汇总
 */
function generateRulesetStatus(
  geositeCn: RulesetInfo,
  geoipCn: RulesetInfo,
  checkedAt: number
): RulesetStatus {
  return {
    geosite_cn: geositeCn,
    geoip_cn: geoipCn,
    any_needs_update: geositeCn.needs_update || geoipCn.needs_update,
    checked_at: checkedAt,
  };
}

// ============ 生成器 ============

// 当前时间戳生成器（2020-2030 年范围内的合理时间戳）
const nowTimestampArb = fc.integer({
  min: 1577836800, // 2020-01-01
  max: 1893456000, // 2030-01-01
});

// 规则集名称生成器
const rulesetNameArb = fc.constantFrom("geosite-cn", "geoip-cn");

// 文件路径生成器
const filePathArb = fc.stringMatching(/^\/[a-z]+\/[a-z]+\/[a-z-]+\.srs$/);

// 文件大小生成器（1KB - 10MB）
const fileSizeArb = fc.integer({ min: 1024, max: 10 * 1024 * 1024 });

// 文件存在状态生成器
const existsArb = fc.boolean();

// 距离上次更新的天数生成器
const daysSinceUpdateArb = fc.integer({ min: 0, max: 365 });

// ============ 属性测试 ============

describe("Ruleset Status Properties", () => {
  /**
   * Property 8: 规则集版本检查
   * *For any* 规则集文件，如果最后修改时间超过 7 天，needs_update() 应返回 true
   */
  describe("Property 8: 规则集版本检查", () => {
    it("规则集超过 7 天应返回 needs_update = true", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: RULESET_UPDATE_THRESHOLD_DAYS, max: 365 }), // 7-365 天
          (daysSinceUpdate) => {
            const result = needsUpdate(daysSinceUpdate, true);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("规则集不超过 7 天应返回 needs_update = false", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: RULESET_UPDATE_THRESHOLD_DAYS - 1 }), // 0-6 天
          (daysSinceUpdate) => {
            const result = needsUpdate(daysSinceUpdate, true);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("规则集恰好 7 天应返回 needs_update = true", () => {
      const result = needsUpdate(7, true);
      expect(result).toBe(true);
    });

    it("规则集恰好 6 天应返回 needs_update = false", () => {
      const result = needsUpdate(6, true);
      expect(result).toBe(false);
    });

    it("规则集文件不存在应返回 needs_update = true", () => {
      fc.assert(
        fc.property(
          fc.option(daysSinceUpdateArb, { nil: null }),
          (daysSinceUpdate) => {
            const result = needsUpdate(daysSinceUpdate, false);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("无法获取修改时间应返回 needs_update = true", () => {
      const result = needsUpdate(null, true);
      expect(result).toBe(true);
    });
  });

  describe("天数计算正确性", () => {
    it("相同时间戳应返回 0 天", () => {
      fc.assert(
        fc.property(nowTimestampArb, (timestamp) => {
          const days = calculateDaysSinceUpdate(timestamp, timestamp);
          expect(days).toBe(0);
        }),
        { numRuns: 100 }
      );
    });

    it("相差 N 天的时间戳应返回 N 天", () => {
      fc.assert(
        fc.property(
          nowTimestampArb,
          fc.integer({ min: 0, max: 365 }),
          (baseTimestamp, daysToAdd) => {
            const laterTimestamp = baseTimestamp + daysToAdd * SECONDS_PER_DAY;
            const days = calculateDaysSinceUpdate(baseTimestamp, laterTimestamp);
            expect(days).toBe(daysToAdd);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("未来时间戳应返回 0 天（不为负数）", () => {
      fc.assert(
        fc.property(
          nowTimestampArb,
          fc.integer({ min: 1, max: 365 }),
          (baseTimestamp, daysInFuture) => {
            const futureTimestamp = baseTimestamp + daysInFuture * SECONDS_PER_DAY;
            const days = calculateDaysSinceUpdate(futureTimestamp, baseTimestamp);
            expect(days).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("部分天数应向下取整", () => {
      fc.assert(
        fc.property(
          nowTimestampArb,
          fc.integer({ min: 0, max: 364 }),
          fc.integer({ min: 1, max: SECONDS_PER_DAY - 1 }),
          (baseTimestamp, fullDays, extraSeconds) => {
            const laterTimestamp = baseTimestamp + fullDays * SECONDS_PER_DAY + extraSeconds;
            const days = calculateDaysSinceUpdate(baseTimestamp, laterTimestamp);
            expect(days).toBe(fullDays);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("RulesetInfo 生成正确性", () => {
    it("存在的文件应包含所有必要字段", () => {
      fc.assert(
        fc.property(
          rulesetNameArb,
          filePathArb,
          fileSizeArb,
          nowTimestampArb,
          daysSinceUpdateArb,
          (name, path, size, now, daysAgo) => {
            const lastModified = now - daysAgo * SECONDS_PER_DAY;
            const info = generateRulesetInfo(name, path, true, size, lastModified, now);
            
            expect(info.name).toBe(name);
            expect(info.path).toBe(path);
            expect(info.exists).toBe(true);
            expect(info.size).toBe(size);
            expect(info.last_modified).toBe(lastModified);
            expect(info.last_modified_formatted).not.toBeNull();
            expect(info.days_since_update).toBe(daysAgo);
            expect(typeof info.needs_update).toBe("boolean");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("不存在的文件应设置 needs_update = true", () => {
      fc.assert(
        fc.property(
          rulesetNameArb,
          filePathArb,
          nowTimestampArb,
          (name, path, now) => {
            const info = generateRulesetInfo(name, path, false, 0, null, now);
            
            expect(info.exists).toBe(false);
            expect(info.size).toBe(0);
            expect(info.last_modified).toBeNull();
            expect(info.last_modified_formatted).toBeNull();
            expect(info.days_since_update).toBeNull();
            expect(info.needs_update).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("needs_update 应与 days_since_update >= 7 一致", () => {
      fc.assert(
        fc.property(
          rulesetNameArb,
          filePathArb,
          fileSizeArb,
          nowTimestampArb,
          daysSinceUpdateArb,
          (name, path, size, now, daysAgo) => {
            const lastModified = now - daysAgo * SECONDS_PER_DAY;
            const info = generateRulesetInfo(name, path, true, size, lastModified, now);
            
            const expectedNeedsUpdate = daysAgo >= RULESET_UPDATE_THRESHOLD_DAYS;
            expect(info.needs_update).toBe(expectedNeedsUpdate);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("RulesetStatus 汇总正确性", () => {
    it("any_needs_update 应为两个规则集 needs_update 的逻辑或", () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.boolean(),
          nowTimestampArb,
          (geositeNeedsUpdate, geoipNeedsUpdate, checkedAt) => {
            const geositeCn: RulesetInfo = {
              name: "geosite-cn",
              path: "/path/to/geosite-cn.srs",
              exists: true,
              size: 1024,
              last_modified: checkedAt - (geositeNeedsUpdate ? 8 : 1) * SECONDS_PER_DAY,
              last_modified_formatted: "2024-01-01",
              needs_update: geositeNeedsUpdate,
              days_since_update: geositeNeedsUpdate ? 8 : 1,
            };
            
            const geoipCn: RulesetInfo = {
              name: "geoip-cn",
              path: "/path/to/geoip-cn.srs",
              exists: true,
              size: 2048,
              last_modified: checkedAt - (geoipNeedsUpdate ? 10 : 2) * SECONDS_PER_DAY,
              last_modified_formatted: "2024-01-01",
              needs_update: geoipNeedsUpdate,
              days_since_update: geoipNeedsUpdate ? 10 : 2,
            };
            
            const status = generateRulesetStatus(geositeCn, geoipCn, checkedAt);
            
            expect(status.any_needs_update).toBe(geositeNeedsUpdate || geoipNeedsUpdate);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("两个规则集都不需要更新时 any_needs_update 应为 false", () => {
      fc.assert(
        fc.property(nowTimestampArb, (checkedAt) => {
          const geositeCn: RulesetInfo = {
            name: "geosite-cn",
            path: "/path/to/geosite-cn.srs",
            exists: true,
            size: 1024,
            last_modified: checkedAt - 1 * SECONDS_PER_DAY,
            last_modified_formatted: "2024-01-01",
            needs_update: false,
            days_since_update: 1,
          };
          
          const geoipCn: RulesetInfo = {
            name: "geoip-cn",
            path: "/path/to/geoip-cn.srs",
            exists: true,
            size: 2048,
            last_modified: checkedAt - 2 * SECONDS_PER_DAY,
            last_modified_formatted: "2024-01-01",
            needs_update: false,
            days_since_update: 2,
          };
          
          const status = generateRulesetStatus(geositeCn, geoipCn, checkedAt);
          
          expect(status.any_needs_update).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it("任一规则集需要更新时 any_needs_update 应为 true", () => {
      fc.assert(
        fc.property(
          nowTimestampArb,
          fc.constantFrom("geosite", "geoip", "both"),
          (checkedAt, whichNeedsUpdate) => {
            const geositeNeedsUpdate = whichNeedsUpdate === "geosite" || whichNeedsUpdate === "both";
            const geoipNeedsUpdate = whichNeedsUpdate === "geoip" || whichNeedsUpdate === "both";
            
            const geositeCn: RulesetInfo = {
              name: "geosite-cn",
              path: "/path/to/geosite-cn.srs",
              exists: true,
              size: 1024,
              last_modified: checkedAt - (geositeNeedsUpdate ? 8 : 1) * SECONDS_PER_DAY,
              last_modified_formatted: "2024-01-01",
              needs_update: geositeNeedsUpdate,
              days_since_update: geositeNeedsUpdate ? 8 : 1,
            };
            
            const geoipCn: RulesetInfo = {
              name: "geoip-cn",
              path: "/path/to/geoip-cn.srs",
              exists: true,
              size: 2048,
              last_modified: checkedAt - (geoipNeedsUpdate ? 10 : 2) * SECONDS_PER_DAY,
              last_modified_formatted: "2024-01-01",
              needs_update: geoipNeedsUpdate,
              days_since_update: geoipNeedsUpdate ? 10 : 2,
            };
            
            const status = generateRulesetStatus(geositeCn, geoipCn, checkedAt);
            
            expect(status.any_needs_update).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("时间戳格式化", () => {
    it("格式化结果应为 YYYY-MM-DD 格式", () => {
      fc.assert(
        fc.property(nowTimestampArb, (timestamp) => {
          const formatted = formatTimestamp(timestamp);
          expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }),
        { numRuns: 100 }
      );
    });

    it("已知时间戳应格式化为正确日期", () => {
      // 2024-01-01 00:00:00 UTC
      const timestamp = 1704067200;
      const formatted = formatTimestamp(timestamp);
      expect(formatted).toBe("2024-01-01");
    });

    it("2020-06-15 应格式化正确", () => {
      // 2020-06-15 00:00:00 UTC
      const timestamp = 1592179200;
      const formatted = formatTimestamp(timestamp);
      expect(formatted).toBe("2020-06-15");
    });
  });
});
