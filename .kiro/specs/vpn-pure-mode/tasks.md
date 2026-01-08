# Implementation Plan: VPN Pure Mode (工业级纯净版)

## Overview

本实现计划将 VPN 客户端升级为工业级纯净版，按优先级分阶段实现。使用 TypeScript (前端) 和 Rust (后端) 技术栈。

## Tasks

- [x] 1. 扩展类型定义和设置存储
  - [x] 1.1 更新 VpnSettings 类型定义
    - 在 `src/types/vpn.ts` 中添加新的配置字段
    - 添加 RouteMode 和 TunStack 类型
    - _Requirements: 1.1, 1.2, 2.1, 3.1, 4.1, 5.1, 5.2, 6.1, 7.1, 7.2, 8.1, 9.1_
  - [x] 1.2 更新 Settings Store 默认值
    - 在 `src/stores/settings.ts` 中添加新配置的默认值
    - 实现配置迁移逻辑确保向后兼容
    - _Requirements: 1.1, 1.2, 2.1, 3.1, 4.1, 6.1, 8.1, 9.1_
  - [x] 1.3 编写属性测试：端口配置默认值和验证
    - **Property 1: Port Configuration Defaults and Validation**
    - **Validates: Requirements 1.1, 1.2, 1.3**

- [x] 2. P0: 代理端口配置
  - [x] 2.1 创建 Rust 端口验证模块
    - 在 `src-tauri/src/vpn/` 中创建端口验证函数
    - 实现端口占用检查
    - _Requirements: 1.3, 1.6_
  - [x] 2.2 更新 sing-box 配置生成器使用动态端口
    - 修改 `src-tauri/src/vpn/singbox/` 中的配置生成
    - 使用传入的端口参数替代硬编码值
    - _Requirements: 1.5_
  - [x] 2.3 创建代理端口设置组件
    - 创建 `src/components/settings/ProxyPortsSection.vue`
    - 实现端口输入和验证 UI
    - _Requirements: 1.3, 1.4, 1.6_
  - [x] 2.4 编写属性测试：端口验证
    - 测试端口范围验证 (1024-65535)
    - **Property 1: Port Configuration Defaults and Validation**
    - **Validates: Requirements 1.3**

- [x] 3. Checkpoint - 端口配置完成
  - 确保所有测试通过，如有问题请询问用户

- [x] 4. P0: Kill Switch 实现
  - [x] 4.1 创建 Kill Switch Rust 模块
    - 创建 `src-tauri/src/vpn/killswitch.rs`
    - 实现 pf 防火墙规则生成
    - 实现启用/禁用逻辑
    - _Requirements: 2.2, 2.3, 2.4, 2.6, 2.7_
  - [x] 4.2 集成 Kill Switch 到 VPN 连接流程
    - 修改 `src-tauri/src/vpn/connect.rs`
    - 在连接时启用，断开时根据设置决定是否保持
    - _Requirements: 2.2, 2.3_
  - [x] 4.3 实现应用退出时的 Kill Switch 清理
    - 修改 `src-tauri/src/lib.rs` 中的退出清理逻辑
    - _Requirements: 2.5_
  - [x] 4.4 创建 Kill Switch 设置组件
    - 在 `src/components/settings/SecuritySection.vue` 中添加 Kill Switch 开关
    - _Requirements: 2.1_

- [x] 5. P0: 路由模式选择
  - [x] 5.1 更新 sing-box 配置生成器支持路由模式
    - 修改 `src-tauri/src/vpn/singbox/tuns.rs` 和 `socks.rs`
    - 实现 rule/global/direct 三种模式的配置生成
    - _Requirements: 3.2, 3.3, 3.4_
  - [x] 5.2 创建路由模式设置组件
    - 创建 `src/components/settings/RoutingSection.vue`
    - 实现路由模式选择 UI
    - _Requirements: 3.1, 3.5, 3.6_
  - [x] 5.3 编写属性测试：路由模式配置生成
    - **Property 2: Route Mode Configuration Generation**
    - **Validates: Requirements 3.2, 3.3, 3.4**

- [x] 6. Checkpoint - P0 功能完成
  - 确保所有测试通过，如有问题请询问用户

- [x] 7. P1: DNS 泄漏防护增强
  - [x] 7.1 更新 DNS 配置生成逻辑
    - 修改 `src-tauri/src/vpn/singbox/` 中的 DNS 配置
    - 添加 DNS 泄漏检测域名的特殊处理
    - _Requirements: 4.2, 4.3, 4.4_
  - [x] 7.2 添加 DNS 泄漏防护设置
    - 在 SecuritySection.vue 中添加 DNS 泄漏防护开关
    - _Requirements: 4.1_
  - [x] 7.3 编写属性测试：DNS 泄漏防护配置
    - **Property 3: DNS Leak Protection Configuration**
    - **Validates: Requirements 4.2, 4.3**

- [x] 8. P1: 自定义直连/代理域名
  - [x] 8.1 实现域名验证逻辑
    - 在 `src/utils/` 中创建域名验证函数
    - 支持通配符域名格式
    - _Requirements: 5.4, 5.5_
  - [x] 8.2 更新 sing-box 配置生成器支持自定义域名
    - 修改路由规则生成，将自定义域名放在 geo 规则之前
    - _Requirements: 5.3_
  - [x] 8.3 创建自定义域名设置组件
    - 在 RoutingSection.vue 中添加域名列表编辑 UI
    - _Requirements: 5.1, 5.2, 5.6_
  - [x] 8.4 编写属性测试：域名格式验证
    - **Property 5: Domain Format Validation**
    - **Validates: Requirements 5.4, 5.5**
  - [x] 8.5 编写属性测试：自定义域名优先级
    - **Property 4: Custom Domain Priority**
    - **Validates: Requirements 5.3**

- [x] 9. Checkpoint - P1 功能完成
  - 确保所有测试通过，如有问题请询问用户

- [x] 10. P2: WebRTC 阻断
  - [x] 10.1 更新 sing-box 配置生成器添加 WebRTC 阻断规则
    - 添加 STUN/TURN 端口阻断规则
    - 添加 WebRTC 相关域名阻断
    - _Requirements: 6.2, 6.3_
  - [x] 10.2 添加 WebRTC 阻断设置
    - 在 SecuritySection.vue 中添加 WebRTC 阻断开关
    - _Requirements: 6.1, 6.4_
  - [x] 10.3 编写属性测试：WebRTC 阻断规则
    - **Property 6: WebRTC Blocking Rules**
    - **Validates: Requirements 6.2**

- [x] 11. P2: 分应用代理
  - [x] 11.1 创建应用预设数据
    - 在 `src/constants/` 中创建应用预设组
    - 包含中国应用、游戏、流媒体、开发工具等分组
    - _Requirements: 7.7_
  - [x] 11.2 更新 sing-box 配置生成器支持进程规则
    - 在 TUN 模式配置中添加 process_name 路由规则
    - _Requirements: 7.3_
  - [x] 11.3 创建分应用代理设置组件
    - 创建 `src/components/settings/PerAppProxySection.vue`
    - 实现应用列表编辑和预设选择 UI
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 7.6_
  - [x] 11.4 编写属性测试：进程路由规则
    - **Property 7: Process-Based Routing Rules**
    - **Validates: Requirements 7.3, 7.5**

- [x] 12. Checkpoint - P2 功能完成
  - 确保所有测试通过，如有问题请询问用户

- [x] 13. P3: TUN 网络栈选择
  - [x] 13.1 更新 sing-box TUN 配置支持网络栈选择
    - 修改 `src-tauri/src/vpn/singbox/tuns.rs`
    - 支持 gvisor/system/lwip 三种网络栈
    - _Requirements: 8.2_
  - [x] 13.2 添加 TUN 网络栈设置
    - 在 AdvancedNetworkSection.vue 中添加网络栈选择
    - 显示各选项的描述
    - _Requirements: 8.1, 8.3, 8.4_
  - [x] 13.3 编写属性测试：TUN 网络栈配置
    - **Property 8: TUN Stack Configuration**
    - **Validates: Requirements 8.1, 8.2**

- [x] 14. 绕过局域网配置
  - [x] 14.1 更新 sing-box 配置生成器完善 LAN 绕过规则
    - 确保包含所有 RFC1918 私有地址范围
    - 添加 link-local 地址范围
    - _Requirements: 9.2, 9.3, 9.4_
  - [x] 14.2 添加绕过局域网设置
    - 在 RoutingSection.vue 中添加绕过局域网开关
    - _Requirements: 9.1_
  - [x] 14.3 编写属性测试：LAN 绕过规则
    - **Property 9: LAN Bypass Rules**
    - **Validates: Requirements 9.2, 9.3, 9.4**

- [x] 15. 设置界面整合
  - [x] 15.1 重组设置页面布局
    - 将设置组织为：代理端口、安全、路由、高级 四个部分
    - _Requirements: 10.1_
  - [x] 15.2 添加设置描述和提示
    - 为每个设置项添加描述文字
    - 标记需要重连的设置项
    - _Requirements: 10.2, 10.3_
  - [x] 15.3 实现分区重置功能
    - 为每个设置区域添加"重置为默认"按钮
    - _Requirements: 10.4_
  - [x] 15.4 编写属性测试：设置重置
    - **Property 10: Settings Reset**
    - **Validates: Requirements 10.4**

- [x] 16. 更新 VPN 连接流程
  - [x] 16.1 更新 connect_hysteria 命令参数
    - 添加新的高级配置参数传递
    - _Requirements: 1.5, 3.2, 3.3, 3.4, 4.2, 5.3, 6.2, 7.3, 8.2, 9.2_
  - [x] 16.2 更新前端 VPN Store 连接逻辑
    - 传递所有新配置参数到后端
    - _Requirements: 1.5_

- [x] 17. Final Checkpoint - 全部功能完成
  - 确保所有测试通过
  - 验证各功能模块正常工作
  - 如有问题请询问用户

## Notes

- All tasks including property-based tests are required
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- 实现顺序按优先级 P0 → P1 → P2 → P3 进行
- 每个 Checkpoint 后应进行功能验证
