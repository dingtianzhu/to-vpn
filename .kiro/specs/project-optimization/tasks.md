# Implementation Plan

## 1. 类型定义完善

- [x] 1.1 创建统计相关类型定义文件
  - 创建 `src/types/stats.ts`
  - 定义 UsageHistoryParams, UsageHistoryItem, UsageHistoryResponse
  - 定义 UsageTrendParams, UsageTrendData
  - _Requirements: 1.2, 6.1_

- [x] 1.2 创建套餐相关类型定义文件
  - 创建 `src/types/plan.ts`
  - 定义 Plan, Subscription, CreateOrderData, OrderResult, OrderStatus
  - _Requirements: 1.2, 6.1_

- [x] 1.3 创建设备、公告、邀请类型定义文件
  - 创建 `src/types/device.ts` - Device 类型
  - 创建 `src/types/announce.ts` - Announcement, AnnouncementListResponse 类型
  - 创建 `src/types/invite.ts` - InviteCodeInfo, InviteRecord, InviteRecordListResponse 类型
  - _Requirements: 1.2, 6.1_

- [x] 1.4 更新类型统一导出文件
  - 更新 `src/types/index.ts` 导出所有新类型
  - 填充空的 `src/types/user.ts` 文件
  - _Requirements: 1.1, 1.2_

- [ ] 1.5 编写属性测试验证类型完整性
  - **Property 1: TypeScript 类型完整性**
  - **Validates: Requirements 1.2, 6.1, 6.4**

## 2. API 模块实现

- [x] 2.1 创建统计 API 模块
  - 创建 `src/api/stats.ts`
  - 实现 getUsageHistory 函数
  - 实现 getUsageTrend 函数
  - _Requirements: 2.1, 2.2_

- [x] 2.2 创建套餐 API 模块
  - 创建 `src/api/plan.ts`
  - 实现 getPlans, getSubscription, createOrder, getOrderStatus 函数
  - _Requirements: 2.3_

- [x] 2.3 创建设备管理 API 模块
  - 创建 `src/api/device.ts`
  - 实现 getDevices, removeDevice 函数
  - _Requirements: 2.4_

- [x] 2.4 创建公告 API 模块
  - 创建 `src/api/announce.ts`
  - 实现 getAnnouncements 函数
  - _Requirements: 2.5_

- [x] 2.5 创建邀请 API 模块
  - 创建 `src/api/invite.ts`
  - 实现 getInviteCode, getInviteRecords 函数
  - _Requirements: 2.6_

- [x] 2.6 更新 API 统一导出文件
  - 更新 `src/api/index.ts` 导出所有新 API 函数
  - _Requirements: 1.1_

- [x] 3. Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

## 4. 错误处理优化

- [x] 4.1 完善错误码映射
  - 更新 `src/utils/error.ts` 添加完整的错误码映射表
  - 实现 getErrorMessage 函数
  - _Requirements: 5.1, 5.3_

- [ ] 4.2 编写属性测试验证错误码映射
  - **Property 4: API 错误码映射**
  - **Validates: Requirements 5.1**

## 5. Stats Store 实现

- [x] 5.1 创建统计状态管理 Store
  - 创建 `src/stores/stats.ts`
  - 实现 todayStats, historyRecords, trendData 状态
  - 实现 loadTodayStats, loadHistory, loadTrend actions
  - 实现错误处理和加载状态
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 5.2 编写属性测试验证时间周期筛选
  - **Property 3: 时间周期筛选触发正确 API 调用**
  - **Validates: Requirements 3.4**

## 6. StatsView 页面重构

- [x] 6.1 重构 StatsView 使用真实数据
  - 移除模拟数据生成逻辑
  - 集成 useStatsStore
  - 在 onMounted 中调用 loadTodayStats, loadHistory, loadTrend
  - 实现加载状态和错误状态 UI
  - _Requirements: 3.1, 3.2, 3.3, 3.5_

- [x] 6.2 实现时间周期筛选功能
  - 监听 selectedPeriod 变化
  - 调用对应的 API 获取数据
  - 更新图表和历史记录显示
  - _Requirements: 3.4_

- [x] 6.3 优化配额显示逻辑
  - 从用户信息获取真实的流量和时长限制
  - 移除硬编码的配额值
  - _Requirements: 4.3_

- [ ] 6.4 编写属性测试验证使用统计显示
  - **Property 2: 使用统计数据正确显示**
  - **Validates: Requirements 3.1**

- [ ] 6.5 编写属性测试验证错误状态显示
  - **Property 7: API 错误时显示错误状态**
  - **Validates: Requirements 3.5**

- [x] 7. Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

## 8. ProfileView 页面优化

- [x] 8.1 集成订阅信息显示
  - 调用 getSubscription API 获取订阅信息
  - 显示套餐名称、到期日期、状态
  - 处理无订阅情况
  - _Requirements: 4.1, 4.2_

- [x] 8.2 优化配额信息显示
  - 根据用户套餐显示正确的配额限制
  - 区分免费用户和付费用户的显示
  - _Requirements: 4.3_

- [ ] 8.3 编写属性测试验证订阅信息显示
  - **Property 5: 订阅信息正确显示**
  - **Validates: Requirements 4.2**

- [ ] 8.4 编写属性测试验证配额信息一致性
  - **Property 6: 配额信息与套餐一致**
  - **Validates: Requirements 4.3**

## 9. 最终验证

- [x] 9.1 TypeScript 编译检查
  - 运行 `vue-tsc --noEmit` 确保无类型错误
  - _Requirements: 6.2, 6.4_

- [x] 9.2 运行所有测试
  - 运行 `pnpm test` 确保所有测试通过
  - _Requirements: 6.4_

- [x] 10. Final Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

