# Implementation Plan

本计划按照依赖关系科学排序，确保每个任务都建立在前置任务的基础上。

---

## Phase 1: 基础设施层（后端 Rust）

### 1. TUN 模式授权问题修复

- [x] 1.1 检查 Helper 安装逻辑中的 sudoers 规则
  - 查看 `src-tauri/src/helper/` 目录下的安装逻辑
  - 确认 sudoers 规则是否包含 pkill 和 kill 命令
  - 内联脚本 (manager.rs) 已包含完整的 kill 权限规则
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 1.2 修复外部 sudoers 规则配置脚本
  - 更新 `src-tauri/resources/scripts/install_helper.sh`
  - 添加 `/bin/kill -TERM *`, `/bin/kill -KILL *`, `/bin/kill -9 *` 到 sudoers 规则
  - 添加 `/bin/rm -f /tmp/tovpn-*` 到 sudoers 规则
  - 保持与内联脚本 (manager.rs) 一致
  - _Requirements: 4.4_

- [x] 1.3 优化断开连接逻辑
  - 已实现：优先使用 PID 文件中的进程 ID
  - 已实现：添加详细日志记录授权尝试结果
  - 代码位于 `src-tauri/src/vpn/platform/macos.rs` 的 `stop_singbox_tun_as_root` 函数
  - _Requirements: 4.1_

### 2. TUN 模式连通性诊断（已完成）

- [x] 2.1 添加 TUN 模式连通性诊断
  - 已实现：连接成功后自动测试外网连通性 (`testConnectivity`)
  - 已实现：失败时记录详细诊断信息
  - 代码位于 `src/stores/vpn.ts` 的 `connect` 方法
  - _Requirements: 5.1, 5.2_

- [x] 2.2 改进错误提示
  - 已实现：TUN 模式连接失败时显示有意义的错误信息
  - 已实现：日志中记录连通性测试结果
  - _Requirements: 5.3_

## Phase 1 Checkpoint
- [x] 3. 确保 Rust 后端编译通过
  - 运行 `cargo check` 验证代码
  - Ensure all tests pass, ask the user if questions arise.

---

## Phase 2: 数据层（TypeScript Types & API）

### 4. 定义类型和接口

- [x] 4.1 添加 UsageLimitCheckResult 类型
  - 在 `src/types/vpn.ts` 中添加限制检查结果类型
  - 包含 canConnect, trafficExceeded, timeExceeded, remainingTraffic, remainingTime, reason 字段
  - _Requirements: 2.1, 2.2_

- [x] 4.2 添加购买相关类型
  - 在 `src/types/plan.ts` 中确认 Plan 类型完整
  - 添加 PurchaseState 接口（isProcessing, selectedPlan, paymentUrl, orderId）
  - _Requirements: 3.1_

### 5. 确认 API 接口

- [x] 5.1 确认套餐和订单 API
  - 检查 `src/api/plan.ts` 中的 getPlans、createOrder、getOrderStatus API
  - API 已完整：getPlans, createOrder, getOrderStatus 均已实现
  - _Requirements: 3.1, 3.2_

---

## Phase 3: 状态管理层（Pinia Stores）

### 6. 扩展 Auth Store

- [x] 6.1 添加 setPendingConnect 和 refreshUserInfo 方法
  - 在 `src/stores/auth.ts` 中添加 `setPendingConnect(value: boolean)` 方法
  - 添加 `refreshUserInfo()` 方法调用 getUserProfile API 并更新用户状态
  - _Requirements: 1.1, 3.2_

### 7. 扩展 VPN Store

- [x] 7.1 添加 checkUsageLimitsBeforeConnect 方法
  - 检查用户剩余流量和时间
  - Admin 用户直接返回 canConnect=true
  - 返回 UsageLimitCheckResult 结构
  - _Requirements: 2.1, 2.2, 2.5_

- [x] 7.2 添加购买相关状态和方法
  - 添加 `showPurchaseModal` 和 `pendingConnectAfterPurchase` 状态
  - 添加 `handlePurchaseSuccess()` 方法
  - 添加 `connectWithLimitCheck()` 方法整合限制检查逻辑
  - _Requirements: 2.3, 2.4, 3.3_

- [x]* 7.3 编写 VPN Store 属性测试
  - **Property 4: Traffic limit check before connect** ✓
  - **Property 5: Time limit check before connect** ✓
  - **Property 6: Admin users bypass limit checks** ✓
  - **Property 7: Limits satisfied allows connection** ✓
  - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

---

## Phase 4: UI 组件层

### 8. 创建 PurchaseModal 组件

- [x] 8.1 创建 PurchaseModal.vue 组件
  - 显示套餐列表（调用 getPlans API）
  - 支持选择套餐和支付方式
  - 处理支付流程（调用 createOrder API）
  - 设置 persistent 模式防止点击外部关闭
  - _Requirements: 3.1, 3.4, 3.5_

- [x] 8.2 添加支付状态轮询和成功回调
  - 轮询订单状态（调用 getOrderStatus API）
  - 支付成功后触发 onSuccess 回调
  - _Requirements: 3.2, 3.3_

- [x]* 8.3 编写 PurchaseModal 组件测试
  - **Property 9: Purchase modal persistence** ✓
  - **Validates: Requirements 3.4, 3.5**

---

## Phase 5: 视图集成层

### 9. 修改 HomeView 连接逻辑

- [x] 9.1 修改 handleConnect 方法
  - 未登录时跳转 `/login?pendingConnect=true`
  - 调用 `connectWithLimitCheck()` 替代直接 `connect()`
  - 限制超出时显示 PurchaseModal
  - _Requirements: 1.1, 2.3_

- [x] 9.2 集成 PurchaseModal 到 HomeView
  - 添加 PurchaseModal 组件引用
  - 处理购买成功后的自动重连
  - _Requirements: 3.3_

- [x]* 9.3 编写 HomeView 属性测试
  - **Property 1: Unauthenticated connect redirects to login with pending flag** ✓
  - **Validates: Requirements 1.1**

### 10. 修改 LoginView 支持自动连接

- [x] 10.1 修改登录成功后的处理逻辑
  - 检查 query 参数 `pendingConnect`
  - 如果为 'true'，登录成功后设置 auth store 的 pendingAutoConnect 并跳转首页
  - 如果不存在，正常跳转首页
  - _Requirements: 1.2, 1.3_

- [x]* 10.2 编写 LoginView 属性测试
  - **Property 2: Login with pending flag triggers auto-connect** ✓
  - **Property 3: Login without pending flag shows home without connecting** ✓
  - **Validates: Requirements 1.2, 1.3**

---

## Phase 6: 最终验证

- [x] 11. Final Checkpoint - 确保所有测试通过
  - 运行 `pnpm test --run` 确保所有测试通过 ✓ (44 tests passed)
  - 运行 `cargo check` 确保 Rust 代码编译通过 ✓
  - 运行 `pnpm vue-tsc --noEmit` 确保 TypeScript 类型检查通过 ✓
  - Ensure all tests pass, ask the user if questions arise.
