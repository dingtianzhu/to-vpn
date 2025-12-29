/**
 * 错误处理函数属性测试
 * 测试错误对象创建和消息提取的正确性
 *
 * **Feature: test-completion, Property 15-16: Error handling**
 * **Validates: Requirements 8.1, 8.2, 8.4**
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============ 类型定义 ============

interface AppError {
  code: number;
  message: string;
  details?: unknown;
}

// ============ 纯函数版本（用于测试）============

/** API 错误码映射表 */
const API_ERROR_CODES: Record<number, string> = {
  // 通用错误
  0: "操作成功",
  1: "未知错误，请稍后重试",
  2: "参数无效",
  3: "资源不存在",

  // 用户相关 (10xxx)
  10001: "用户不存在",
  10002: "用户已存在",
  10003: "账号已被禁用",
  10004: "密码错误",
  10008: "验证码错误",
  10009: "验证码已过期",
  10010: "验证码发送过于频繁",

  // 认证相关 (20xxx)
  20001: "请先登录",
  20002: "登录已失效",
  20003: "登录已过期",
  20005: "刷新令牌无效",
  20006: "权限不足",

  // 订单相关 (30xxx)
  30001: "订单不存在",
  30002: "订单已支付",
  30003: "订单已取消",
  30004: "订单已过期",
  30005: "支付失败",

  // 授权相关 (40xxx)
  40003: "授权已过期",
  40005: "设备数量已达上限",
  40006: "设备不存在",
};

/** 字符串错误消息映射 */
const ERROR_MESSAGES: Record<string, string> = {
  HELPER_NOT_INSTALLED: "助手未安装，请先安装助手",
  HELPER_NOT_RUNNING: "助手未运行，请检查助手状态",
  CONNECTION_TIMEOUT: "连接超时，请重试",
  CONNECTION_FAILED: "连接失败",
  NETWORK_UNREACHABLE: "网络不可达，已自动回滚",
  CONFIG_INVALID: "配置无效",
  PERMISSION_DENIED: "权限不足",
  UNKNOWN: "未知错误",
};

/**
 * 创建标准化错误对象
 */
function createError(code: number, message: string, details?: unknown): AppError {
  return {
    code,
    message,
    ...(details !== undefined && { details }),
  };
}

/**
 * 根据错误码获取用户友好的错误消息
 */
function getErrorMessageByCode(code: number): string {
  return API_ERROR_CODES[code] || `错误 (${code})`;
}

/**
 * 从任意输入提取错误消息
 */
function formatError(error: unknown): string {
  if (typeof error === "string") {
    return ERROR_MESSAGES[error] || error || ERROR_MESSAGES.UNKNOWN;
  }

  if (error && typeof error === "object") {
    const err = error as { code?: string | number; message?: string };

    // 处理数字错误码
    if (typeof err.code === "number" && API_ERROR_CODES[err.code]) {
      return API_ERROR_CODES[err.code];
    }

    // 处理字符串错误码
    if (typeof err.code === "string" && ERROR_MESSAGES[err.code]) {
      return ERROR_MESSAGES[err.code];
    }

    if (err.message) {
      return err.message;
    }
  }

  return ERROR_MESSAGES.UNKNOWN;
}

/**
 * 从任意输入提取错误消息（健壮版本）
 */
function extractErrorMessage(error: unknown): string {
  // null 或 undefined
  if (error === null || error === undefined) {
    return ERROR_MESSAGES.UNKNOWN;
  }

  // 字符串
  if (typeof error === "string") {
    return error.trim() || ERROR_MESSAGES.UNKNOWN;
  }

  // Error 对象
  if (error instanceof Error) {
    return error.message || ERROR_MESSAGES.UNKNOWN;
  }

  // 普通对象
  if (typeof error === "object") {
    const obj = error as Record<string, unknown>;

    // 尝试获取 message 字段
    if (typeof obj.message === "string" && obj.message.trim()) {
      return obj.message.trim();
    }

    // 尝试获取 error 字段
    if (typeof obj.error === "string" && obj.error.trim()) {
      return obj.error.trim();
    }

    // 尝试获取 msg 字段
    if (typeof obj.msg === "string" && obj.msg.trim()) {
      return obj.msg.trim();
    }
  }

  // 其他类型，尝试转换为字符串
  try {
    const str = String(error);
    if (str && str !== "[object Object]") {
      return str;
    }
  } catch {
    // 忽略转换错误
  }

  return ERROR_MESSAGES.UNKNOWN;
}

// ============ 属性测试 ============

describe("Error Handling Properties", () => {
  /**
   * Property 15: 错误对象结构完整性
   * *For any* 创建的错误对象，必须包含 code（数字）和 message（字符串）字段
   */
  describe("Property 15: Error object structure completeness", () => {
    it("should create error objects with required fields", () => {
      fc.assert(
        fc.property(
          fc.integer(),
          fc.string({ minLength: 1, maxLength: 100 }),
          (code, message) => {
            const error = createError(code, message);

            // 必须包含 code 字段且为数字
            expect(error).toHaveProperty("code");
            expect(typeof error.code).toBe("number");

            // 必须包含 message 字段且为字符串
            expect(error).toHaveProperty("message");
            expect(typeof error.message).toBe("string");

            // code 和 message 应该与输入一致
            expect(error.code).toBe(code);
            expect(error.message).toBe(message);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should optionally include details field", () => {
      fc.assert(
        fc.property(
          fc.integer(),
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.anything(),
          (code, message, details) => {
            const error = createError(code, message, details);

            expect(error.code).toBe(code);
            expect(error.message).toBe(message);
            expect(error.details).toEqual(details);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should not include details field when undefined", () => {
      fc.assert(
        fc.property(
          fc.integer(),
          fc.string({ minLength: 1, maxLength: 100 }),
          (code, message) => {
            const error = createError(code, message);

            // 不应该有 details 字段
            expect("details" in error).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should map known error codes to messages", () => {
      const knownCodes = Object.keys(API_ERROR_CODES).map(Number);

      fc.assert(
        fc.property(fc.constantFrom(...knownCodes), (code) => {
          const message = getErrorMessageByCode(code);

          // 已知错误码应该返回对应的消息
          expect(message).toBe(API_ERROR_CODES[code]);
          expect(message.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it("should return fallback message for unknown error codes", () => {
      fc.assert(
        fc.property(
          fc.integer().filter((n) => !(n in API_ERROR_CODES)),
          (code) => {
            const message = getErrorMessageByCode(code);

            // 未知错误码应该返回包含错误码的消息
            expect(message).toContain(String(code));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 16: 错误消息提取健壮性
   * *For any* 输入（包括 Error 对象、字符串、null、undefined），
   * extractErrorMessage 应该返回一个非空字符串
   */
  describe("Property 16: Error message extraction robustness", () => {
    it("should always return a non-empty string for any input", () => {
      fc.assert(
        fc.property(fc.anything(), (input) => {
          const message = extractErrorMessage(input);

          // 应该返回字符串
          expect(typeof message).toBe("string");

          // 应该非空
          expect(message.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it("should extract message from Error objects", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (errorMessage) => {
            const error = new Error(errorMessage);
            const extracted = extractErrorMessage(error);

            expect(extracted).toBe(errorMessage);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should return input string directly", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (input) => {
            const message = extractErrorMessage(input);

            expect(message).toBe(input.trim() || ERROR_MESSAGES.UNKNOWN);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should handle null and undefined", () => {
      expect(extractErrorMessage(null)).toBe(ERROR_MESSAGES.UNKNOWN);
      expect(extractErrorMessage(undefined)).toBe(ERROR_MESSAGES.UNKNOWN);
    });

    it("should extract message from objects with message field", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (msg) => {
            const obj = { message: msg };
            const extracted = extractErrorMessage(obj);

            expect(extracted).toBe(msg.trim() || ERROR_MESSAGES.UNKNOWN);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should extract message from objects with error field", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (errorMsg) => {
            const obj = { error: errorMsg };
            const extracted = extractErrorMessage(obj);

            expect(extracted).toBe(errorMsg.trim() || ERROR_MESSAGES.UNKNOWN);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should be deterministic", () => {
      fc.assert(
        fc.property(fc.anything(), (input) => {
          const result1 = extractErrorMessage(input);
          const result2 = extractErrorMessage(input);

          expect(result1).toBe(result2);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 额外属性：formatError 函数测试
   */
  describe("formatError function", () => {
    it("should map known string error codes", () => {
      const knownCodes = Object.keys(ERROR_MESSAGES);

      fc.assert(
        fc.property(fc.constantFrom(...knownCodes), (code) => {
          const message = formatError(code);

          expect(message).toBe(ERROR_MESSAGES[code]);
        }),
        { numRuns: 100 }
      );
    });

    it("should map known numeric error codes from objects", () => {
      const knownCodes = Object.keys(API_ERROR_CODES).map(Number);

      fc.assert(
        fc.property(fc.constantFrom(...knownCodes), (code) => {
          const obj = { code };
          const message = formatError(obj);

          expect(message).toBe(API_ERROR_CODES[code]);
        }),
        { numRuns: 100 }
      );
    });

    it("should return message field if no code mapping", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (msg) => {
            const obj = { message: msg };
            const result = formatError(obj);

            expect(result).toBe(msg);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should return UNKNOWN for unrecognized inputs", () => {
      expect(formatError({})).toBe(ERROR_MESSAGES.UNKNOWN);
      expect(formatError(null)).toBe(ERROR_MESSAGES.UNKNOWN);
      expect(formatError(undefined)).toBe(ERROR_MESSAGES.UNKNOWN);
    });
  });
});
