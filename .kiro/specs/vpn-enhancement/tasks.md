# Implementation Plan: VPN 增强优化

## Overview

本实现计划涵盖 SOCKS 模式系统级增强、流量/延迟数据真实性保证、服务器列表刷新优化等功能。

## Tasks

- [x] 1. P0 - 流量/延迟数据真实性修复
- [x] 1.1 移除流量模拟数据生成
  - 修改 `src-tauri/src/vpn/monitor.rs`
  - 删除 `generate_simulated_traffic()` 函数
  - API 失败时保持上次流量值，速度显示为 0
  - _Requirements: 2.2, 2.3_

- [x] 1.2 移除延迟模拟数据生成
  - 修改 `src-tauri/src/vpn/monitor.rs`
  - 删除 `generate_simulated_latency()` 函数
  - 延迟测试失败时返回 -1
  - _Requirements: 3.2, 3.3_

- [x] 1.3 前端显示优化
  - 修改 `src/components/dashboard/StatsPanel.vue`
  - 延迟为 -1 或 9999 时显示 "--"
  - 速度为 0 时显示 "--" 或 "0 B/s"
  - _Requirements: 2.4, 3.4_

- [x] 2. Checkpoint - 确保数据真实性修复测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. P1 - 服务器列表刷新优化
- [x] 3.1 减少服务器列表缓存时间
  - 修改 `src/utils/cache.ts`
  - 将 SERVERS 缓存时间从 5 分钟改为 1 分钟
  - _Requirements: 4.2_

- [x] 3.2 优化刷新按钮逻辑
  - 修改 `src/views/ServersView.vue`
  - 点击刷新时清除缓存并重新获取 API 数据
  - _Requirements: 4.1_

- [x] 3.3 智能延迟测试
  - 修改 `src/stores/servers.ts`
  - VPN 已连接时通过代理测试延迟
  - VPN 未连接时使用直接 TCP 测试
  - _Requirements: 4.3, 4.4_

- [x] 4. Checkpoint - 确保服务器列表优化测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. P2 - SOCKS 模式系统级增强
- [x] 5.1 添加 HTTP 代理 Inbound
  - 修改 `src-tauri/src/vpn/singbox/socks.rs`
  - 在 inbounds 中添加 HTTP 代理 (端口 1087)
  - _Requirements: 1.1_

- [x] 5.2 添加系统 HTTP 代理设置
  - 修改 `src-tauri/src/vpn/proxy.rs`
  - 实现 `set_system_http_proxy()` 函数
  - 修改 `set_system_proxy()` 同时设置 SOCKS 和 HTTP
  - _Requirements: 1.2, 1.4_

- [x] 5.3 更新连接/断开逻辑
  - 修改 `src-tauri/src/vpn/connect.rs`
  - 连接时调用 `set_system_proxy(true)`
  - 断开时调用 `set_system_proxy(false)`
  - _Requirements: 1.2, 1.4_

- [x] 5.4 添加代理配置说明 UI
  - 创建 `src/components/settings/ProxyConfigSection.vue`
  - 显示终端代理环境变量设置说明
  - 添加一键复制功能
  - _Requirements: 1.3_

- [x] 6. Checkpoint - 确保 SOCKS 增强测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. P3 - 带宽限制优化
- [x] 7.1 调整默认带宽限制
  - 修改 `src-tauri/src/vpn/config.rs`
  - 将 up_mbps 默认值从 200 改为 500
  - 将 down_mbps 默认值从 500 改为 1000
  - _Requirements: 5.1_

- [x] 7.2 更新前端默认值
  - 修改 `src/stores/settings.ts`
  - 同步更新前端默认带宽设置
  - _Requirements: 5.1_

- [x] 8. Final Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- 优先级顺序: P0 > P1 > P2 > P3
- P0 (流量/延迟真实性) 是最重要的修复，影响用户信任
- 每个 Checkpoint 后需要运行测试确保功能正常
- SOCKS 增强需要测试 macOS 系统代理设置
