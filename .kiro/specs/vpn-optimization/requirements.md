# VPN 模式优化需求文档

## 简介

本文档分析 ToVPN 项目当前存在的问题和潜在风险，并提出 SOCKS 和 TUN 模式的优化方案，重点关注节点纯净度保证和模式切换的平滑性。

## 术语表

- **TUN 模式**: 系统级虚拟网卡代理，所有流量经过 VPN 隧道
- **SOCKS 模式**: 应用级代理，仅支持 SOCKS5 协议的应用流量经过代理
- **节点纯净度**: 确保国内流量不经过海外节点，避免节点被污染或封禁
- **分流规则**: 基于 geosite-cn 和 geoip-cn 规则集区分国内外流量
- **sing-box**: 底层代理核心，支持 Hysteria2 协议

---

## 当前问题分析

### 问题 1: TUN 模式网卡绑定硬编码

**用户故事:** 作为开发者，我希望 TUN 模式能自动检测网络接口，以便在不同设备上正常工作。

#### 问题描述
当前 `tun.rs` 中 direct outbound 硬编码了 `bind_interface: "en0"`，这在非 Wi-Fi 主网卡的设备上会导致直连流量失败。

```rust
// 当前代码 (tun.rs:89)
let direct_ob = json!({
    "type": "direct",
    "tag": "direct",
    "bind_interface": "en0" // 硬编码问题
});
```

#### 验收标准
1. WHEN 系统启动 TUN 模式 THEN 系统 SHALL 自动检测当前活动的网络接口
2. WHEN 网络接口为以太网 THEN 系统 SHALL 使用正确的接口名称（如 en1, en2）
3. WHEN 无法检测到活动接口 THEN 系统 SHALL 回退到 auto_detect_interface 模式

---

### 问题 2: SOCKS 模式仅代理系统级应用

**用户故事:** 作为用户，我希望 SOCKS 模式能代理更多应用，而不仅仅是支持系统代理的应用。

#### 问题描述
当前 SOCKS 模式仅设置系统 SOCKS 代理，很多应用（如终端、部分浏览器）不会自动使用系统代理。

#### 验收标准
1. WHEN 用户启用 SOCKS 模式 THEN 系统 SHALL 提供代理配置说明
2. WHEN 用户需要终端代理 THEN 系统 SHALL 提供环境变量配置指南
3. WHERE 用户选择增强模式 THEN 系统 SHALL 支持 HTTP 代理端口（可选功能）

---

### 问题 3: 模式切换时连接中断

**用户故事:** 作为用户，我希望在 SOCKS 和 TUN 模式之间切换时不会断开连接。

#### 问题描述
当前切换模式需要先断开再重连，用户体验不佳。

#### 验收标准
1. WHEN 用户在已连接状态下切换模式 THEN 系统 SHALL 自动完成断开-重连流程
2. WHEN 模式切换进行中 THEN 系统 SHALL 显示切换进度状态
3. IF 模式切换失败 THEN 系统 SHALL 回退到原模式并通知用户

---

### 问题 4: DNS 泄漏风险

**用户故事:** 作为用户，我希望我的 DNS 查询不会泄漏到本地 ISP。

#### 问题描述
当前配置中，部分 DNS 查询可能绕过代理直接发送到本地 DNS 服务器。

#### 验收标准
1. WHEN 使用 TUN 模式 THEN 系统 SHALL 劫持所有 DNS 查询
2. WHEN 查询国外域名 THEN 系统 SHALL 使用远程加密 DNS
3. WHEN 用户启用 DNS 泄漏检测 THEN 系统 SHALL 报告 DNS 查询路径

---

### 问题 5: 节点纯净度保护不足

**用户故事:** 作为服务提供商，我希望确保国内流量不经过海外节点，保护节点不被封禁。

#### 问题描述
当前分流规则依赖 geosite-cn 和 geoip-cn，但存在以下风险：
- 规则集更新不及时
- 部分国内 CDN 域名未被收录
- IP 地址变更后规则失效

#### 验收标准
1. WHEN 流量目标为中国大陆 IP THEN 系统 SHALL 直连不经过代理
2. WHEN 流量目标为 .cn 域名 THEN 系统 SHALL 直连不经过代理
3. WHEN 规则集版本过旧 THEN 系统 SHALL 提示用户更新
4. WHEN 检测到异常流量模式 THEN 系统 SHALL 记录日志供分析

---

### 问题 6: IPv6 不支持导致连接问题

**用户故事:** 作为用户，我希望 VPN 在 IPv6 不可用时仍能正常工作。

#### 问题描述
当前 TUN 配置包含 IPv6 地址 (`fdfe::1/126`)，但 VPS 服务器不支持 IPv6，可能导致部分流量路由失败。

#### 验收标准
1. WHEN 生成 TUN 配置 THEN 系统 SHALL 仅配置 IPv4 地址
2. WHEN DNS 解析 THEN 系统 SHALL 使用 `ipv4_only` 策略
3. WHEN 路由规则生成 THEN 系统 SHALL 不包含 IPv6 相关规则

---

### 问题 7: 网络延迟优化不足

**用户故事:** 作为用户，我希望 VPN 连接延迟尽可能低。

#### 问题描述
当前配置未充分利用延迟优化技术，如 TCP Fast Open、连接复用等。

#### 验收标准
1. WHEN 配置 Hysteria2 outbound THEN 系统 SHALL 启用 TCP Fast Open
2. WHEN 监控延迟 THEN 系统 SHALL 记录 min/max/avg/jitter 指标
3. WHERE 用户启用自动选择 THEN 系统 SHALL 根据延迟和丢包率选择最优服务器
4. WHEN 检测到延迟异常 THEN 系统 SHALL 提示用户切换服务器

---

## SOCKS vs TUN 模式对比

### 当前实现差异

| 特性 | SOCKS 模式 | TUN 模式 |
|------|-----------|----------|
| 代理范围 | 仅支持 SOCKS5 的应用 | 系统全局流量 |
| 权限要求 | 无需 root | 需要 root/管理员 |
| 分流支持 | ✅ geosite-cn + geoip-cn | ✅ geosite-cn + geoip-cn |
| DNS 处理 | 应用自行解析 | 系统级 DNS 劫持 |
| 性能开销 | 低 | 中等（虚拟网卡） |
| 稳定性 | 高 | 中等（依赖系统扩展） |

### 节点纯净度对比

| 风险点 | SOCKS 模式 | TUN 模式 |
|--------|-----------|----------|
| DNS 泄漏 | 高风险（应用自行解析） | 低风险（DNS 劫持） |
| 规则绕过 | 低风险（仅代理配置的应用） | 中风险（全局流量） |
| 国内流量误代理 | 低风险 | 中风险（规则不全时） |

---

## 优化方案

### 方案 1: 动态网络接口检测

**目标:** 解决 TUN 模式硬编码网卡问题

#### 验收标准
1. WHEN 生成 TUN 配置 THEN 系统 SHALL 调用 `detect_default_interface()` 获取当前接口
2. WHEN 接口检测成功 THEN 系统 SHALL 使用检测到的接口名
3. WHEN 接口检测失败 THEN 系统 SHALL 移除 `bind_interface` 配置，依赖 `auto_detect_interface`

---

### 方案 2: 增强分流规则

**目标:** 提高节点纯净度，减少国内流量误代理

#### 验收标准
1. WHEN 生成路由配置 THEN 系统 SHALL 包含以下直连规则（按优先级）：
   - VPN 服务器 IP 直连（防环路）
   - 私有 IP 地址直连
   - .cn 域名后缀直连
   - geosite-cn 规则集直连
   - geoip-cn 规则集直连
   - 常见国内 CDN 域名直连
2. WHEN 规则集文件不存在 THEN 系统 SHALL 自动下载最新版本
3. WHEN 规则集超过 7 天未更新 THEN 系统 SHALL 提示用户更新

---

### 方案 3: 平滑模式切换

**目标:** 实现 SOCKS/TUN 模式无感切换

#### 验收标准
1. WHEN 用户在已连接状态请求切换模式 THEN 系统 SHALL 执行以下流程：
   - 保存当前服务器信息
   - 断开当前连接
   - 更新模式设置
   - 使用相同服务器重新连接
2. WHEN 切换过程中 THEN 系统 SHALL 显示 "switching" 状态
3. IF 新模式连接失败 THEN 系统 SHALL 尝试恢复原模式连接
4. WHEN 切换完成 THEN 系统 SHALL 发送通知告知用户

---

### 方案 4: DNS 安全增强

**目标:** 防止 DNS 泄漏，保护用户隐私

#### 验收标准
1. WHEN 使用 TUN 模式 THEN 系统 SHALL 配置 DNS 劫持规则
2. WHEN 查询非中国域名 THEN 系统 SHALL 强制使用远程 DoH DNS
3. WHEN 用户启用 DNS 泄漏测试 THEN 系统 SHALL 返回 DNS 查询路径报告
4. WHEN 检测到 DNS 泄漏 THEN 系统 SHALL 警告用户

---

### 方案 5: 流量监控与异常检测

**目标:** 监控流量模式，及时发现节点滥用

#### 验收标准
1. WHEN VPN 连接活跃 THEN 系统 SHALL 记录流量统计（上传/下载/连接时长）
2. WHEN 检测到异常流量模式 THEN 系统 SHALL 记录详细日志
3. WHEN 用户断开连接 THEN 系统 SHALL 上报使用统计到服务端
4. WHERE 服务端检测到节点滥用 THEN 系统 SHALL 支持远程断开连接

---

### 方案 6: IPv6 禁用

**目标:** 确保在 VPS 不支持 IPv6 时正常工作

#### 验收标准
1. WHEN 生成 TUN 配置 THEN 系统 SHALL 仅配置 IPv4 地址 (172.19.0.1/30)
2. WHEN 配置 DNS THEN 系统 SHALL 使用 `strategy: ipv4_only`
3. WHEN 生成路由规则 THEN 系统 SHALL 不包含 IPv6 CIDR

---

### 方案 7: 延迟优化

**目标:** 降低 VPN 连接延迟，提升用户体验

#### 验收标准
1. WHEN 配置 Hysteria2 THEN 系统 SHALL 启用 `tcp_fast_open: true`
2. WHEN 监控延迟 THEN 系统 SHALL 计算并记录 jitter（抖动）
3. WHEN 延迟超过平均值 3 倍 THEN 系统 SHALL 标记为异常
4. WHERE 用户启用自动选择 THEN 系统 SHALL 优先选择低延迟低丢包的服务器
5. WHEN DNS 缓存 THEN 系统 SHALL 启用 `independent_cache: true`

---

## 潜在风险清单

### 高优先级风险

1. **TUN 模式网卡绑定失败** - 影响直连流量
2. **DNS 泄漏** - 暴露用户真实 DNS 查询
3. **规则集过期** - 导致国内流量误代理

### 中优先级风险

4. **模式切换体验差** - 需要手动断开重连
5. **SOCKS 模式覆盖不全** - 部分应用无法代理
6. **Helper 安装失败** - TUN 模式无法使用

### 低优先级风险

7. **~~IPv6 支持不完整~~** - ~~当前策略为 ipv4_only~~ (已确认禁用 IPv6)
8. **QUIC 被阻断** - 可能影响部分应用性能
9. **日志文件增长** - 长期运行可能占用磁盘空间

---

## 实施优先级建议

1. **P0 - 立即修复:** 
   - 动态网络接口检测（方案 1）
   - IPv6 禁用确认（方案 6）
2. **P1 - 短期优化:** 
   - 增强分流规则（方案 2）
   - 延迟优化（方案 7）
3. **P2 - 中期改进:** 
   - 平滑模式切换（方案 3）
4. **P3 - 长期规划:** 
   - DNS 安全增强（方案 4）
   - 流量监控（方案 5）
