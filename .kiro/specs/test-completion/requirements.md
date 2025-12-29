# Requirements Document

## Introduction

本文档定义了 ToVPN 桌面客户端测试用例补全的需求规范。ToVPN 是一个基于 Tauri + Vue 3 + Rust 的跨平台 VPN 客户端，支持 Hysteria2 协议，提供 TUN 和 SOCKS 两种代理模式，并实现国内外流量分流。

当前项目已有部分属性测试（Property-Based Tests），但覆盖不完整。本需求旨在补全关键业务逻辑的测试用例，确保核心功能的正确性。

## Glossary

- **ToVPN**: 本项目的 VPN 客户端应用名称
- **TUN 模式**: 系统级虚拟网卡代理模式，接管所有系统流量
- **SOCKS 模式**: 应用级代理模式，仅代理配置了代理的应用流量
- **分流**: 根据规则将国内流量直连、国外流量走代理
- **sing-box**: 底层代理核心引擎
- **Hysteria2**: 基于 QUIC 的高性能代理协议
- **Helper**: macOS 系统扩展，用于 TUN 模式的权限提升
- **Property-Based Testing (PBT)**: 基于属性的测试方法，通过生成随机输入验证程序属性
- **fast-check**: JavaScript/TypeScript 的属性测试库

## Requirements

### Requirement 1: 服务器节点数据验证

**User Story:** As a 开发者, I want to 验证服务器节点数据的完整性和有效性, so that 确保连接时不会因数据问题导致失败。

#### Acceptance Criteria

1. WHEN 服务器节点数据被加载 THEN ToVPN SHALL 验证所有必填字段（id, domain, port, password, country, city, flag, status）存在且有效
2. WHEN 服务器节点的 domain 字段为空或 null THEN ToVPN SHALL 将该节点标记为无效并排除在可选列表之外
3. WHEN 服务器节点的 port 字段不在 1-65535 范围内 THEN ToVPN SHALL 将该节点标记为无效
4. WHEN 服务器节点状态从后端数字格式转换 THEN ToVPN SHALL 正确映射为前端字符串格式（1→online, 2→maintenance, 3→offline）

### Requirement 2: 连接模式切换

**User Story:** As a 用户, I want to 在 TUN 和 SOCKS 模式之间平滑切换, so that 可以根据需要选择合适的代理方式。

#### Acceptance Criteria

1. WHEN 用户从 SOCKS 模式切换到 TUN 模式 THEN ToVPN SHALL 先断开当前连接再以新模式重新连接
2. WHEN 用户从 TUN 模式切换到 SOCKS 模式 THEN ToVPN SHALL 先断开当前连接再以新模式重新连接
3. WHEN 模式切换过程中发生错误 THEN ToVPN SHALL 回滚到切换前的状态并显示错误信息
4. WHEN 连接模式设置被保存 THEN ToVPN SHALL 在下次启动时使用保存的模式

### Requirement 3: 流量分流规则

**User Story:** As a 用户, I want to TUN 模式下国内外流量自动分流, so that 访问国内网站时不经过代理以获得更好的速度。

#### Acceptance Criteria

1. WHEN TUN 模式连接成功 THEN ToVPN SHALL 加载 geosite-cn 和 geoip-cn 规则集
2. WHEN 访问匹配 geosite-cn 规则的域名 THEN ToVPN SHALL 将流量路由到 direct 出口
3. WHEN 访问匹配 geoip-cn 规则的 IP THEN ToVPN SHALL 将流量路由到 direct 出口
4. WHEN 访问不匹配任何国内规则的目标 THEN ToVPN SHALL 将流量路由到 proxy 出口
5. WHEN 访问 .cn/.lan/.local 后缀域名 THEN ToVPN SHALL 将流量路由到 direct 出口

### Requirement 4: 认证状态管理

**User Story:** As a 用户, I want to 认证状态被正确管理, so that 不会因 Token 过期而意外断开连接。

#### Acceptance Criteria

1. WHEN Token 即将过期（5分钟内）THEN ToVPN SHALL 自动刷新 Token
2. WHEN Token 刷新成功 THEN ToVPN SHALL 更新内存和安全存储中的 Token
3. WHEN Token 刷新失败 THEN ToVPN SHALL 登出用户并跳转到登录页
4. WHEN 用户登录成功 THEN ToVPN SHALL 启动自动刷新定时器
5. WHEN 用户登出 THEN ToVPN SHALL 清除所有认证状态并停止自动刷新

### Requirement 5: 缓存机制

**User Story:** As a 开发者, I want to 缓存机制正确工作, so that 减少不必要的 API 请求并提升用户体验。

#### Acceptance Criteria

1. WHEN 缓存项被设置 THEN ToVPN SHALL 在指定 TTL 后自动过期
2. WHEN 获取已过期的缓存项 THEN ToVPN SHALL 返回 null 而非过期数据
3. WHEN 缓存被清除 THEN ToVPN SHALL 移除指定键的所有数据
4. WHEN 缓存项被更新 THEN ToVPN SHALL 重置该项的过期时间

### Requirement 6: 防抖和请求锁

**User Story:** As a 开发者, I want to 防止重复请求和操作, so that 避免竞态条件和资源浪费。

#### Acceptance Criteria

1. WHEN 请求锁被获取 THEN ToVPN SHALL 阻止同一操作的并发执行
2. WHEN 请求锁被释放 THEN ToVPN SHALL 允许新的操作执行
3. WHEN 防抖函数被连续调用 THEN ToVPN SHALL 只执行最后一次调用
4. WHEN 防抖等待期间有新调用 THEN ToVPN SHALL 重置等待计时器

### Requirement 7: 数据格式化

**User Story:** As a 用户, I want to 数据以友好的格式显示, so that 可以直观地了解流量使用情况和连接时长。

#### Acceptance Criteria

1. WHEN 格式化字节数 THEN ToVPN SHALL 自动选择合适的单位（B/KB/MB/GB）并保留适当精度
2. WHEN 格式化时间 THEN ToVPN SHALL 显示为 HH:MM:SS 格式
3. WHEN 格式化速度 THEN ToVPN SHALL 显示为带单位的速率（如 1.5 MB/s）
4. WHEN 输入为负数或无效值 THEN ToVPN SHALL 返回默认值或零

### Requirement 8: 错误处理

**User Story:** As a 用户, I want to 错误信息清晰明了, so that 可以了解问题原因并采取相应措施。

#### Acceptance Criteria

1. WHEN API 请求失败 THEN ToVPN SHALL 返回包含错误码和消息的标准化错误对象
2. WHEN 网络错误发生 THEN ToVPN SHALL 显示网络相关的友好提示
3. WHEN 认证错误发生 THEN ToVPN SHALL 引导用户重新登录
4. WHEN 未知错误发生 THEN ToVPN SHALL 记录详细日志并显示通用错误提示

### Requirement 9: 输入验证

**User Story:** As a 开发者, I want to 用户输入被正确验证, so that 防止无效数据进入系统。

#### Acceptance Criteria

1. WHEN 验证邮箱格式 THEN ToVPN SHALL 接受符合 RFC 5322 的邮箱地址
2. WHEN 验证密码强度 THEN ToVPN SHALL 要求长度在 6-32 位之间
3. WHEN 验证用户名 THEN ToVPN SHALL 要求 3-50 位字母数字字符
4. WHEN 输入包含特殊字符 THEN ToVPN SHALL 根据字段类型决定是否接受

### Requirement 10: 状态同步

**User Story:** As a 用户, I want to VPN 状态在前后端保持同步, so that UI 显示的状态与实际状态一致。

#### Acceptance Criteria

1. WHEN 后端状态变更 THEN ToVPN SHALL 通过事件机制通知前端更新
2. WHEN 前端状态与后端不一致 THEN ToVPN SHALL 以后端状态为准进行纠正
3. WHEN 应用从后台恢复 THEN ToVPN SHALL 主动同步一次状态
4. WHEN 心跳检测发现状态不一致 THEN ToVPN SHALL 自动恢复到正确状态
