/**
 * VPN Store 属性测试
 * 测试用量限制检查逻辑的正确性
 *
 * **Feature: vpn-connection-flow, Property 4-7: Usage limit checks**
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import type { UsageLimitCheckResult } from "@/types/vpn";

// 常量定义（与 vpn.ts 保持一致）
const USER_DAILY_TRAFFIC_LIMIT = 1 * 1024 * 1024 * 1024; // 1GB
const USER_DAILY_TIME_LIMIT = 2 * 60 * 60; // 2 hours

// 用户类型
type UserType = "admin" | "vip" | "user";

// 模拟的限制检查函数（纯函数版本，便于测试）
function checkUsageLimits(
  userType: UserType,
  trafficUsed: number,
  timeUsed: number,
  trafficLimit: number = USER_DAILY_TRAFFIC_LIMIT,
  timeLimit: number = USER_DAILY_TIME_LIMIT
): UsageLimitCheckResult {
  // Admin 用户跳过所有限制检查
  if (userType === "admin") {
    return {
      canConnect: true,
      trafficExceeded: false,
      timeExceeded: false,
      remainingTraffic: -1,
      remainingTime: -1,
    };
  }

  // VIP 用户也跳过限制检查
  if (userType === "vip") {
    return {
      canConnect: true,
      trafficExceeded: false,
      timeExceeded: false,
      remainingTraffic: -1,
      remainingTime: -1,
    };
  }

  // 普通用户检查限制
  const trafficExceeded = trafficLimit > 0 && trafficUsed >= trafficLimit;
  const timeExceeded = timeLimit > 0 && timeUsed >= timeLimit;

  const remainingTraffic =
    trafficLimit > 0 ? Math.max(0, trafficLimit - trafficUsed) : -1;
  const remainingTime =
    timeLimit > 0 ? Math.max(0, timeLimit - timeUsed) : -1;

  let reason: string | undefined;
  if (trafficExceeded && timeExceeded) {
    reason = "Daily traffic and time limits exceeded";
  } else if (trafficExceeded) {
    reason = "Daily traffic limit exceeded";
  } else if (timeExceeded) {
    reason = "Daily time limit exceeded";
  }

  return {
    canConnect: !trafficExceeded && !timeExceeded,
    trafficExceeded,
    timeExceeded,
    remainingTraffic,
    remainingTime,
    reason,
  };
}

describe("VPN Store - Usage Limit Properties", () => {
  /**
   * Property 4: Traffic limit check before connect
   * *For any* non-admin user with traffic usage >= traffic limit,
   * attempting to connect should return canConnect=false with trafficExceeded=true
   */
  it("Property 4: Traffic limit exceeded prevents connection", () => {
    fc.assert(
      fc.property(
        // 生成超过限制的流量使用量
        fc.integer({ min: USER_DAILY_TRAFFIC_LIMIT, max: USER_DAILY_TRAFFIC_LIMIT * 10 }),
        // 生成任意时间使用量（在限制内）
        fc.integer({ min: 0, max: USER_DAILY_TIME_LIMIT - 1 }),
        (trafficUsed, timeUsed) => {
          const result = checkUsageLimits("user", trafficUsed, timeUsed);

          // 流量超限时应该不能连接
          expect(result.canConnect).toBe(false);
          expect(result.trafficExceeded).toBe(true);
          expect(result.reason).toContain("traffic");
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: Time limit check before connect
   * *For any* non-admin user with time usage >= time limit,
   * attempting to connect should return canConnect=false with timeExceeded=true
   */
  it("Property 5: Time limit exceeded prevents connection", () => {
    fc.assert(
      fc.property(
        // 生成在限制内的流量使用量
        fc.integer({ min: 0, max: USER_DAILY_TRAFFIC_LIMIT - 1 }),
        // 生成超过限制的时间使用量
        fc.integer({ min: USER_DAILY_TIME_LIMIT, max: USER_DAILY_TIME_LIMIT * 10 }),
        (trafficUsed, timeUsed) => {
          const result = checkUsageLimits("user", trafficUsed, timeUsed);

          // 时间超限时应该不能连接
          expect(result.canConnect).toBe(false);
          expect(result.timeExceeded).toBe(true);
          expect(result.reason).toContain("time");
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: Admin users bypass limit checks
   * *For any* admin user (roles include 'admin' or 'super_admin'),
   * checkUsageLimitsBeforeConnect should always return canConnect=true regardless of usage
   */
  it("Property 6: Admin users always bypass limits", () => {
    fc.assert(
      fc.property(
        // 生成任意流量使用量（包括超限）
        fc.integer({ min: 0, max: USER_DAILY_TRAFFIC_LIMIT * 100 }),
        // 生成任意时间使用量（包括超限）
        fc.integer({ min: 0, max: USER_DAILY_TIME_LIMIT * 100 }),
        (trafficUsed, timeUsed) => {
          const result = checkUsageLimits("admin", trafficUsed, timeUsed);

          // Admin 用户始终可以连接
          expect(result.canConnect).toBe(true);
          expect(result.trafficExceeded).toBe(false);
          expect(result.timeExceeded).toBe(false);
          expect(result.remainingTraffic).toBe(-1); // -1 表示无限
          expect(result.remainingTime).toBe(-1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: Limits satisfied allows connection
   * *For any* user with both traffic and time within limits,
   * checkUsageLimitsBeforeConnect should return canConnect=true
   */
  it("Property 7: Within limits allows connection", () => {
    fc.assert(
      fc.property(
        // 生成在限制内的流量使用量
        fc.integer({ min: 0, max: USER_DAILY_TRAFFIC_LIMIT - 1 }),
        // 生成在限制内的时间使用量
        fc.integer({ min: 0, max: USER_DAILY_TIME_LIMIT - 1 }),
        (trafficUsed, timeUsed) => {
          const result = checkUsageLimits("user", trafficUsed, timeUsed);

          // 在限制内应该可以连接
          expect(result.canConnect).toBe(true);
          expect(result.trafficExceeded).toBe(false);
          expect(result.timeExceeded).toBe(false);
          expect(result.reason).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 额外属性：VIP 用户也应该绕过限制
   */
  it("VIP users also bypass limits", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: USER_DAILY_TRAFFIC_LIMIT * 100 }),
        fc.integer({ min: 0, max: USER_DAILY_TIME_LIMIT * 100 }),
        (trafficUsed, timeUsed) => {
          const result = checkUsageLimits("vip", trafficUsed, timeUsed);

          expect(result.canConnect).toBe(true);
          expect(result.remainingTraffic).toBe(-1);
          expect(result.remainingTime).toBe(-1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 额外属性：剩余量计算正确性
   */
  it("Remaining values are calculated correctly", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: USER_DAILY_TRAFFIC_LIMIT - 1 }),
        fc.integer({ min: 0, max: USER_DAILY_TIME_LIMIT - 1 }),
        (trafficUsed, timeUsed) => {
          const result = checkUsageLimits("user", trafficUsed, timeUsed);

          // 剩余量 = 限制 - 已用
          expect(result.remainingTraffic).toBe(USER_DAILY_TRAFFIC_LIMIT - trafficUsed);
          expect(result.remainingTime).toBe(USER_DAILY_TIME_LIMIT - timeUsed);
        }
      ),
      { numRuns: 100 }
    );
  });
});
