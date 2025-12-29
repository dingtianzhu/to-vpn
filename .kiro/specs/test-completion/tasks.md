# Implementation Plan

## 1. 工具函数属性测试

- [x] 1.1 创建格式化函数属性测试文件
  - 创建 `src/__tests__/utils/format.property.test.ts`
  - 实现字节格式化、时间格式化、速度格式化的纯函数版本
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 1.2 编写 Property 12: 字节格式化单位选择正确性
  - **Property 12: 字节格式化单位选择正确性**
  - **Validates: Requirements 7.1**

- [x] 1.3 编写 Property 13: 时间格式化格式正确性
  - **Property 13: 时间格式化格式正确性**
  - **Validates: Requirements 7.2**

- [x] 1.4 编写 Property 14: 速度格式化正确性
  - **Property 14: 速度格式化正确性**
  - **Validates: Requirements 7.3**

- [x] 1.5 创建输入验证属性测试文件
  - 创建 `src/__tests__/utils/validation.property.test.ts`
  - 实现邮箱、密码、用户名验证的纯函数版本
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 1.6 编写 Property 17: 邮箱验证正确性
  - **Property 17: 邮箱验证正确性**
  - **Validates: Requirements 9.1**

- [x] 1.7 编写 Property 18: 密码长度验证正确性
  - **Property 18: 密码长度验证正确性**
  - **Validates: Requirements 9.2**

- [x] 1.8 编写 Property 19: 用户名验证正确性
  - **Property 19: 用户名验证正确性**
  - **Validates: Requirements 9.3**

- [x] 1.9 创建错误处理属性测试文件
  - 创建 `src/__tests__/utils/error.property.test.ts`
  - 实现错误对象创建和消息提取的纯函数版本
  - _Requirements: 8.1, 8.2, 8.4_

- [x] 1.10 编写 Property 15: 错误对象结构完整性
  - **Property 15: 错误对象结构完整性**
  - **Validates: Requirements 8.1**

- [x] 1.11 编写 Property 16: 错误消息提取健壮性
  - **Property 16: 错误消息提取健壮性**
  - **Validates: Requirements 8.2, 8.4**

## 2. 缓存和防抖属性测试

- [x] 2.1 扩展缓存测试文件
  - 更新 `src/__tests__/utils/cache.test.ts` 添加属性测试
  - 实现缓存行为的纯函数版本用于测试
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 2.2 编写 Property 8: 缓存 TTL 行为正确性
  - **Property 8: 缓存 TTL 行为正确性**
  - **Validates: Requirements 5.1, 5.2**

- [x] 2.3 编写 Property 9: 缓存更新重置 TTL
  - **Property 9: 缓存更新重置 TTL**
  - **Validates: Requirements 5.4**

- [x] 2.4 扩展防抖测试文件
  - 更新 `src/__tests__/utils/debounce.test.ts` 添加属性测试
  - 实现请求锁行为的纯函数版本用于测试
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 2.5 编写 Property 10: 请求锁互斥性
  - **Property 10: 请求锁互斥性**
  - **Validates: Requirements 6.1, 6.2**

- [x] 2.6 编写 Property 11: 防抖函数只执行最后一次
  - **Property 11: 防抖函数只执行最后一次**
  - **Validates: Requirements 6.3**

## 3. Checkpoint - 确保工具函数测试通过

- [x] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## 4. 服务器节点验证属性测试

- [x] 4.1 创建服务器节点验证属性测试文件
  - 创建 `src/__tests__/stores/servers.property.test.ts`
  - 实现节点验证和状态映射的纯函数版本
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 4.2 编写 Property 1: 服务器节点验证完整性
  - **Property 1: 服务器节点验证完整性**
  - **Validates: Requirements 1.1, 1.2, 1.3**

- [x] 4.3 编写 Property 2: 状态映射双向一致性
  - **Property 2: 状态映射双向一致性**
  - **Validates: Requirements 1.4**

## 5. 认证状态管理属性测试

- [x] 5.1 创建认证状态属性测试文件
  - 创建 `src/__tests__/stores/auth.property.test.ts`
  - 实现 Token 过期检测和状态清除的纯函数版本
  - _Requirements: 4.1, 4.5_

- [x] 5.2 编写 Property 6: Token 过期检测正确性
  - **Property 6: Token 过期检测正确性**
  - **Validates: Requirements 4.1**

- [x] 5.3 编写 Property 7: 登出状态清除完整性
  - **Property 7: 登出状态清除完整性**
  - **Validates: Requirements 4.5**

## 6. 连接模式和状态同步属性测试

- [x] 6.1 创建连接模式属性测试文件
  - 创建 `src/__tests__/stores/connection-mode.property.test.ts`
  - 实现模式切换状态机和设置持久化的纯函数版本
  - _Requirements: 2.1, 2.2, 2.4_

- [x] 6.2 编写 Property 3: 模式切换状态机正确性
  - **Property 3: 模式切换状态机正确性**
  - **Validates: Requirements 2.1, 2.2**

- [x] 6.3 编写 Property 4: 设置持久化往返一致性
  - **Property 4: 设置持久化往返一致性**
  - **Validates: Requirements 2.4**

- [x] 6.4 编写 Property 20: 状态同步纠正逻辑
  - **Property 20: 状态同步纠正逻辑**
  - **Validates: Requirements 10.2, 10.4**

## 7. 分流配置验证属性测试

- [x] 7.1 创建分流配置属性测试文件
  - 创建 `src/__tests__/stores/routing-config.property.test.ts`
  - 实现配置验证的纯函数版本
  - _Requirements: 3.1, 3.5_

- [x] 7.2 编写 Property 5: 分流配置包含必要规则
  - **Property 5: 分流配置包含必要规则**
  - **Validates: Requirements 3.1, 3.5**

## 8. Final Checkpoint - 确保所有测试通过

- [x] 8. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.
