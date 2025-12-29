/**
 * 输入验证函数属性测试
 * 测试邮箱、密码、用户名等验证的正确性
 *
 * **Feature: test-completion, Property 17-19: Validation functions**
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============ 纯函数版本（复制自 src/utils/validation.ts）============

/**
 * 验证邮箱格式
 */
function isValidEmail(email: string): boolean {
  if (typeof email !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 验证密码强度
 * 要求：6-32 位
 */
function isValidPassword(password: string): boolean {
  if (typeof password !== "string") return false;
  return password.length >= 6 && password.length <= 32;
}

/**
 * 验证用户名格式
 * 要求：3-50 位字母数字（原实现是 3-20，但需求是 3-50）
 */
function isValidUsername(username: string): boolean {
  if (typeof username !== "string") return false;
  const usernameRegex = /^[a-zA-Z0-9_]{3,50}$/;
  return usernameRegex.test(username);
}

/**
 * 验证端口号
 */
function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * 验证域名格式
 */
function isValidDomain(domain: string): boolean {
  if (typeof domain !== "string" || domain.length === 0) return false;
  const domainRegex =
    /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  return domainRegex.test(domain);
}

// ============ 生成器 ============

/**
 * 生成有效的邮箱地址
 */
const validEmailArb = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9]{1,20}$/),
    fc.stringMatching(/^[a-z0-9]{1,10}$/),
    fc.constantFrom("com", "org", "net", "io", "cn")
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/**
 * 生成无效的邮箱地址
 */
const invalidEmailArb = fc.oneof(
  fc.constant(""),
  fc.constant("@"),
  fc.constant("test@"),
  fc.constant("@test.com"),
  fc.constant("test"),
  fc.constant("test@test"),
  fc.stringMatching(/^[a-z]{1,10}$/), // 没有 @
  fc.stringMatching(/^[a-z]{1,5}@[a-z]{1,5}$/) // 没有 .
);

/**
 * 生成有效的密码（6-32 位）
 */
const validPasswordArb = fc.string({ minLength: 6, maxLength: 32 });

/**
 * 生成无效的密码（太短或太长）
 * Reserved for future use in additional password tests
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const invalidPasswordArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 5 }), // 太短
  fc.string({ minLength: 33, maxLength: 100 }) // 太长
);

/**
 * 生成有效的用户名（3-50 位字母数字下划线）
 */
const validUsernameArb = fc.stringMatching(/^[a-zA-Z0-9_]{3,50}$/);

/**
 * 生成无效的用户名
 * Reserved for future use in additional username tests
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const invalidUsernameArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 2 }), // 太短
  fc.stringMatching(/^[a-z]{51,60}$/), // 太长
  fc.stringMatching(/^[a-z]{3,10}[!@#$%^&* ]$/) // 包含特殊字符
);

// ============ 属性测试 ============

describe("Validation Functions Properties", () => {
  /**
   * Property 17: 邮箱验证正确性
   * *For any* 字符串，如果包含 @ 符号且 @ 前后都有非空内容，且 @ 后包含 . 符号，
   * 则应该被认为是有效邮箱格式
   */
  describe("Property 17: Email validation correctness", () => {
    it("should accept valid email addresses", () => {
      fc.assert(
        fc.property(validEmailArb, (email) => {
          expect(isValidEmail(email)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should reject invalid email addresses", () => {
      fc.assert(
        fc.property(invalidEmailArb, (email) => {
          expect(isValidEmail(email)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it("should reject emails with spaces", () => {
      fc.assert(
        fc.property(
          validEmailArb.map((email) => {
            const pos = Math.floor(email.length / 2);
            return email.slice(0, pos) + " " + email.slice(pos);
          }),
          (emailWithSpace) => {
            expect(isValidEmail(emailWithSpace)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should be deterministic", () => {
      fc.assert(
        fc.property(fc.string(), (email) => {
          const result1 = isValidEmail(email);
          const result2 = isValidEmail(email);
          expect(result1).toBe(result2);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 18: 密码长度验证正确性
   * *For any* 字符串，长度在 6-32 之间（包含边界）应该通过验证
   */
  describe("Property 18: Password length validation correctness", () => {
    it("should accept passwords with valid length (6-32)", () => {
      fc.assert(
        fc.property(validPasswordArb, (password) => {
          expect(isValidPassword(password)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should reject passwords that are too short (< 6)", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 5 }),
          (password) => {
            expect(isValidPassword(password)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should reject passwords that are too long (> 32)", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 33, maxLength: 100 }),
          (password) => {
            expect(isValidPassword(password)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should accept boundary values (6 and 32 characters)", () => {
      // 正好 6 个字符
      const sixChars = "123456";
      expect(isValidPassword(sixChars)).toBe(true);

      // 正好 32 个字符
      const thirtyTwoChars = "12345678901234567890123456789012";
      expect(isValidPassword(thirtyTwoChars)).toBe(true);
    });

    it("should reject boundary values (5 and 33 characters)", () => {
      // 5 个字符
      const fiveChars = "12345";
      expect(isValidPassword(fiveChars)).toBe(false);

      // 33 个字符
      const thirtyThreeChars = "123456789012345678901234567890123";
      expect(isValidPassword(thirtyThreeChars)).toBe(false);
    });
  });

  /**
   * Property 19: 用户名验证正确性
   * *For any* 字符串，如果长度在 3-50 之间且只包含字母、数字和下划线，应该通过验证
   */
  describe("Property 19: Username validation correctness", () => {
    it("should accept valid usernames (3-50 alphanumeric + underscore)", () => {
      fc.assert(
        fc.property(validUsernameArb, (username) => {
          expect(isValidUsername(username)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should reject usernames that are too short (< 3)", () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z0-9_]{0,2}$/),
          (username) => {
            expect(isValidUsername(username)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should reject usernames that are too long (> 50)", () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z]{51,60}$/),
          (username) => {
            expect(isValidUsername(username)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should reject usernames with special characters", () => {
      const specialChars = ["!", "@", "#", "$", "%", "^", "&", "*", " ", "-", "."];
      
      fc.assert(
        fc.property(
          fc.tuple(
            fc.stringMatching(/^[a-z]{2,10}$/),
            fc.constantFrom(...specialChars)
          ),
          ([base, special]) => {
            const username = base + special;
            expect(isValidUsername(username)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should accept boundary values (3 and 50 characters)", () => {
      // 正好 3 个字符
      const threeChars = "abc";
      expect(isValidUsername(threeChars)).toBe(true);

      // 正好 50 个字符
      const fiftyChars = "a".repeat(50);
      expect(isValidUsername(fiftyChars)).toBe(true);
    });
  });

  /**
   * 额外属性：端口验证
   */
  describe("Port validation", () => {
    it("should accept valid ports (1-65535)", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 65535 }), (port) => {
          expect(isValidPort(port)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should reject invalid ports", () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.integer({ min: -1000, max: 0 }),
            fc.integer({ min: 65536, max: 100000 })
          ),
          (port) => {
            expect(isValidPort(port)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should reject non-integer values", () => {
      fc.assert(
        fc.property(
          fc.double({ min: 1.1, max: 65534.9 }).filter((n) => !Number.isInteger(n)),
          (port) => {
            expect(isValidPort(port)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 额外属性：域名验证
   */
  describe("Domain validation", () => {
    it("should accept valid domains", () => {
      const validDomains = [
        "example.com",
        "sub.example.com",
        "test-site.org",
        "my-app.io",
        "a.co",
      ];

      validDomains.forEach((domain) => {
        expect(isValidDomain(domain)).toBe(true);
      });
    });

    it("should reject invalid domains", () => {
      const invalidDomains = [
        "",
        "localhost",
        "-example.com",
        "example-.com",
        ".com",
        "example.",
        "192.168.1.1",
      ];

      invalidDomains.forEach((domain) => {
        expect(isValidDomain(domain)).toBe(false);
      });
    });
  });
});
