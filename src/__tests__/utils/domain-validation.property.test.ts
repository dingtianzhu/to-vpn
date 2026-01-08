/**
 * 域名格式验证属性测试
 * 
 * **Feature: vpn-pure-mode, Property 5: Domain Format Validation**
 * **Validates: Requirements 5.4, 5.5**
 * 
 * *For any* domain string, it SHALL be accepted only if it matches a valid 
 * domain format (including wildcards like *.example.com).
 */
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============ 纯函数版本（复制自 src/utils/validation.ts）============

/**
 * 验证自定义域名格式（支持通配符）
 */
function isValidCustomDomain(domain: string): boolean {
  if (typeof domain !== 'string' || domain.length === 0) {
    return false;
  }
  
  const trimmed = domain.trim();
  if (trimmed.length === 0) {
    return false;
  }
  
  if (trimmed.length > 253) {
    return false;
  }
  
  // 后缀匹配格式: .example.com
  if (trimmed.startsWith('.')) {
    const withoutDot = trimmed.slice(1);
    return isValidDomainPart(withoutDot);
  }
  
  // 通配符格式: *.example.com
  if (trimmed.startsWith('*.')) {
    const withoutWildcard = trimmed.slice(2);
    return isValidDomainPart(withoutWildcard);
  }
  
  // 普通域名格式
  return isValidDomainPart(trimmed);
}

function isValidDomainPart(domain: string): boolean {
  if (!domain || domain.length === 0) {
    return false;
  }
  
  const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
  
  if (!domain.includes('.')) {
    const singleLabelRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
    return singleLabelRegex.test(domain);
  }
  
  return domainRegex.test(domain);
}

/**
 * 规范化域名格式
 */
function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

/**
 * 规范化域名列表
 */
function normalizeDomainList(domains: string[]): string[] {
  const normalized = domains
    .map(d => normalizeDomain(d))
    .filter(d => d.length > 0);
  
  return [...new Set(normalized)];
}

// ============ 生成器 ============

/**
 * 生成有效的域名标签（单个部分）
 * 标签规则：1-63 字符，字母数字开头结尾，中间可以有连字符
 */
const validLabelArb = fc.stringMatching(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/)
  .filter(s => s.length >= 1 && s.length <= 63);

/**
 * 生成有效的顶级域名
 */
const validTldArb = fc.constantFrom('com', 'org', 'net', 'io', 'cn', 'co', 'app', 'dev');

/**
 * 生成有效的普通域名
 */
const validDomainArb = fc.tuple(
  fc.array(validLabelArb, { minLength: 0, maxLength: 2 }),
  validLabelArb,
  validTldArb
).map(([subdomains, domain, tld]) => {
  const parts = [...subdomains, domain, tld];
  return parts.join('.');
}).filter(d => d.length <= 253);

/**
 * 生成有效的通配符域名 (*.example.com)
 */
const validWildcardDomainArb = validDomainArb.map(d => `*.${d}`);

/**
 * 生成有效的后缀匹配域名 (.example.com)
 */
const validSuffixDomainArb = validDomainArb.map(d => `.${d}`);

/**
 * 生成所有有效的自定义域名格式
 */
const validCustomDomainArb = fc.oneof(
  validDomainArb,
  validWildcardDomainArb,
  validSuffixDomainArb
);

/**
 * 生成无效的域名
 */
const invalidDomainArb = fc.oneof(
  fc.constant(''),
  fc.constant('   '),
  fc.constant('-example.com'),      // 以连字符开头
  fc.constant('example-.com'),      // 标签以连字符结尾
  fc.constant('.'),                 // 只有点
  fc.constant('..'),                // 连续的点
  fc.constant('example..com'),      // 连续的点
  fc.constant('*.'),                // 不完整的通配符
  fc.constant('*'),                 // 只有星号
  fc.constant('**.example.com'),    // 双星号
  fc.constant('example.com/path'),  // 包含路径
  fc.constant('http://example.com'),// 包含协议
  fc.constant('example.com:8080'),  // 包含端口
  fc.constant('example com'),       // 包含空格
  fc.string({ minLength: 254, maxLength: 300 }) // 太长
);

// ============ 属性测试 ============

describe("Property 5: Domain Format Validation", () => {
  /**
   * **Feature: vpn-pure-mode, Property 5**
   * **Validates: Requirements 5.4, 5.5**
   * 
   * *For any* valid domain string, isValidCustomDomain SHALL return true
   */
  describe("Valid domain acceptance", () => {
    it("should accept valid regular domains", () => {
      fc.assert(
        fc.property(validDomainArb, (domain) => {
          expect(isValidCustomDomain(domain)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should accept valid wildcard domains (*.example.com)", () => {
      fc.assert(
        fc.property(validWildcardDomainArb, (domain) => {
          expect(isValidCustomDomain(domain)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should accept valid suffix domains (.example.com)", () => {
      fc.assert(
        fc.property(validSuffixDomainArb, (domain) => {
          expect(isValidCustomDomain(domain)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it("should accept all valid custom domain formats", () => {
      fc.assert(
        fc.property(validCustomDomainArb, (domain) => {
          expect(isValidCustomDomain(domain)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: vpn-pure-mode, Property 5**
   * **Validates: Requirements 5.4**
   * 
   * *For any* invalid domain string, isValidCustomDomain SHALL return false
   */
  describe("Invalid domain rejection", () => {
    it("should reject invalid domains", () => {
      fc.assert(
        fc.property(invalidDomainArb, (domain) => {
          expect(isValidCustomDomain(domain)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it("should reject empty strings", () => {
      expect(isValidCustomDomain('')).toBe(false);
      expect(isValidCustomDomain('   ')).toBe(false);
    });

    it("should reject domains with invalid characters", () => {
      const invalidChars = ['!', '@', '#', '$', '%', '^', '&', '(', ')', '+', '=', '[', ']', '{', '}', '|', '\\', '/', '?', '<', '>'];
      
      invalidChars.forEach(char => {
        expect(isValidCustomDomain(`example${char}domain.com`)).toBe(false);
      });
    });

    it("should reject domains exceeding 253 characters", () => {
      const longDomain = 'a'.repeat(250) + '.com';
      expect(isValidCustomDomain(longDomain)).toBe(false);
    });
  });

  /**
   * **Feature: vpn-pure-mode, Property 5**
   * **Validates: Requirements 5.5**
   * 
   * Wildcard domain format validation
   */
  describe("Wildcard domain format", () => {
    it("should accept *.domain.tld format", () => {
      expect(isValidCustomDomain('*.example.com')).toBe(true);
      expect(isValidCustomDomain('*.sub.example.com')).toBe(true);
      expect(isValidCustomDomain('*.a.b.c.example.com')).toBe(true);
    });

    it("should accept .domain.tld suffix format", () => {
      expect(isValidCustomDomain('.example.com')).toBe(true);
      expect(isValidCustomDomain('.sub.example.com')).toBe(true);
    });

    it("should reject invalid wildcard formats", () => {
      expect(isValidCustomDomain('*example.com')).toBe(false);  // 缺少点
      expect(isValidCustomDomain('**.example.com')).toBe(false); // 双星号
      expect(isValidCustomDomain('*.')).toBe(false);             // 不完整
    });
  });

  /**
   * 域名规范化测试
   */
  describe("Domain normalization", () => {
    it("should normalize domains to lowercase", () => {
      fc.assert(
        fc.property(validDomainArb, (domain) => {
          const upper = domain.toUpperCase();
          const normalized = normalizeDomain(upper);
          expect(normalized).toBe(domain.toLowerCase());
        }),
        { numRuns: 100 }
      );
    });

    it("should trim whitespace", () => {
      fc.assert(
        fc.property(
          validDomainArb,
          fc.stringMatching(/^\s{0,5}$/),
          fc.stringMatching(/^\s{0,5}$/),
          (domain, prefix, suffix) => {
            const padded = prefix + domain + suffix;
            const normalized = normalizeDomain(padded);
            expect(normalized).toBe(domain.toLowerCase());
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 域名列表规范化测试
   */
  describe("Domain list normalization", () => {
    it("should remove duplicates", () => {
      fc.assert(
        fc.property(
          fc.array(validDomainArb, { minLength: 1, maxLength: 10 }),
          (domains) => {
            // 添加重复项
            const withDuplicates = [...domains, ...domains];
            const normalized = normalizeDomainList(withDuplicates);
            
            // 结果应该没有重复
            const uniqueSet = new Set(normalized);
            expect(normalized.length).toBe(uniqueSet.size);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should filter out empty strings", () => {
      const domains = ['example.com', '', '  ', 'test.org', ''];
      const normalized = normalizeDomainList(domains);
      
      expect(normalized).not.toContain('');
      expect(normalized.length).toBe(2);
    });

    it("should preserve order of first occurrence", () => {
      const domains = ['b.com', 'a.com', 'B.COM', 'c.com', 'A.COM'];
      const normalized = normalizeDomainList(domains);
      
      expect(normalized).toEqual(['b.com', 'a.com', 'c.com']);
    });
  });

  /**
   * 确定性测试
   */
  describe("Determinism", () => {
    it("should be deterministic for any input", () => {
      fc.assert(
        fc.property(fc.string(), (domain) => {
          const result1 = isValidCustomDomain(domain);
          const result2 = isValidCustomDomain(domain);
          expect(result1).toBe(result2);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * 边界情况测试
   */
  describe("Edge cases", () => {
    it("should handle single-label domains", () => {
      expect(isValidCustomDomain('localhost')).toBe(true);
      expect(isValidCustomDomain('myserver')).toBe(true);
    });

    it("should handle minimum valid domain", () => {
      expect(isValidCustomDomain('a.co')).toBe(true);
      expect(isValidCustomDomain('1.cn')).toBe(true);
    });

    it("should handle domains with numbers", () => {
      expect(isValidCustomDomain('123.com')).toBe(true);
      expect(isValidCustomDomain('test123.org')).toBe(true);
      expect(isValidCustomDomain('1-2-3.net')).toBe(true);
    });

    it("should handle domains with hyphens", () => {
      expect(isValidCustomDomain('my-domain.com')).toBe(true);
      expect(isValidCustomDomain('a-b-c.org')).toBe(true);
      // 但不能以连字符开头或结尾
      expect(isValidCustomDomain('-domain.com')).toBe(false);
      expect(isValidCustomDomain('domain-.com')).toBe(false);
    });
  });
});
