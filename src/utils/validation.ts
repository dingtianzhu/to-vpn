/**
 * 验证工具函数
 * 提供常用的表单验证和数据校验功能
 */

/**
 * 验证邮箱格式
 * @param email 邮箱地址
 * @returns 是否有效
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * 验证密码强度
 * @param password 密码
 * @returns 是否符合要求 (至少6位)
 */
export function isValidPassword(password: string): boolean {
  return password.length >= 6
}

/**
 * 验证用户名格式
 * @param username 用户名
 * @returns 是否有效 (3-20位字母数字下划线)
 */
export function isValidUsername(username: string): boolean {
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/
  return usernameRegex.test(username)
}

/**
 * 验证 IP 地址格式
 * @param ip IP 地址
 * @returns 是否有效
 */
export function isValidIP(ip: string): boolean {
  const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
  return ipRegex.test(ip)
}

/**
 * 验证端口号
 * @param port 端口号
 * @returns 是否有效 (1-65535)
 */
export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535
}

/**
 * 验证用户可配置的代理端口号
 * 用户配置的端口应在非特权端口范围内 (1024-65535)
 * @param port 端口号
 * @returns 是否有效
 */
export function isValidUserPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1024 && port <= 65535
}

/**
 * 验证域名格式
 * @param domain 域名
 * @returns 是否有效
 */
export function isValidDomain(domain: string): boolean {
  const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/
  return domainRegex.test(domain)
}

/**
 * 验证自定义域名格式（支持通配符）
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 5.4, 5.5**
 * 
 * 支持的格式：
 * - 普通域名: example.com, sub.example.com
 * - 通配符域名: *.example.com (匹配所有子域名)
 * - 后缀匹配: .example.com (匹配域名及其所有子域名)
 * 
 * @param domain 域名字符串
 * @returns 是否有效
 */
export function isValidCustomDomain(domain: string): boolean {
  if (typeof domain !== 'string' || domain.length === 0) {
    return false
  }
  
  // 去除首尾空格
  const trimmed = domain.trim()
  if (trimmed.length === 0) {
    return false
  }
  
  // 检查长度限制（域名最大 253 字符）
  if (trimmed.length > 253) {
    return false
  }
  
  // 后缀匹配格式: .example.com
  if (trimmed.startsWith('.')) {
    const withoutDot = trimmed.slice(1)
    return isValidDomainPart(withoutDot)
  }
  
  // 通配符格式: *.example.com
  if (trimmed.startsWith('*.')) {
    const withoutWildcard = trimmed.slice(2)
    return isValidDomainPart(withoutWildcard)
  }
  
  // 普通域名格式
  return isValidDomainPart(trimmed)
}

/**
 * 验证域名部分（不含通配符前缀）
 * @param domain 域名部分
 * @returns 是否有效
 */
function isValidDomainPart(domain: string): boolean {
  if (!domain || domain.length === 0) {
    return false
  }
  
  // 域名正则：支持多级域名，每个标签最多 63 字符
  // 标签只能包含字母、数字和连字符，不能以连字符开头或结尾
  const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/
  
  // 必须包含至少一个点（顶级域名）
  if (!domain.includes('.')) {
    // 允许单标签域名（如 localhost），但对于自定义域名规则，通常需要完整域名
    // 这里我们允许单标签，因为用户可能想要匹配特定的主机名
    const singleLabelRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/
    return singleLabelRegex.test(domain)
  }
  
  return domainRegex.test(domain)
}

/**
 * 验证域名列表
 * 
 * **Feature: vpn-pure-mode**
 * **Validates: Requirements 5.4, 5.5**
 * 
 * @param domains 域名数组
 * @returns 验证结果，包含是否有效和无效域名列表
 */
export function validateDomainList(domains: string[]): { valid: boolean; invalidDomains: string[] } {
  const invalidDomains: string[] = []
  
  for (const domain of domains) {
    if (!isValidCustomDomain(domain)) {
      invalidDomains.push(domain)
    }
  }
  
  return {
    valid: invalidDomains.length === 0,
    invalidDomains
  }
}

/**
 * 规范化域名格式
 * 去除空格，转换为小写
 * 
 * @param domain 域名字符串
 * @returns 规范化后的域名
 */
export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase()
}

/**
 * 规范化域名列表
 * 去除空项，规范化每个域名，去重
 * 
 * @param domains 域名数组
 * @returns 规范化后的域名数组
 */
export function normalizeDomainList(domains: string[]): string[] {
  const normalized = domains
    .map(d => normalizeDomain(d))
    .filter(d => d.length > 0)
  
  // 去重
  return [...new Set(normalized)]
}
