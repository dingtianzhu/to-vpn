# Design Document: VPN Pure Mode (工业级纯净版)

## Overview

本设计文档描述了 VPN 客户端工业级纯净版的技术实现方案。该功能将现有 VPN 客户端升级为具备完整隐私保护、灵活配置和专业安全功能的工业级产品。

核心设计原则：
1. **安全优先**：所有可能影响隐私的功能默认开启保护
2. **性能可配**：影响性能的安全功能可由用户选择关闭
3. **向后兼容**：新配置项使用合理默认值，不影响现有用户
4. **模块化设计**：各功能模块独立，便于维护和测试

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Vue 3)                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Settings    │  │ Security    │  │ Routing     │              │
│  │ Store       │  │ Section     │  │ Section     │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│         └────────────────┼────────────────┘                      │
│                          │                                       │
│                    ┌─────▼─────┐                                 │
│                    │  VPN      │                                 │
│                    │  Store    │                                 │
│                    └─────┬─────┘                                 │
└──────────────────────────┼──────────────────────────────────────┘
                           │ Tauri IPC
┌──────────────────────────┼──────────────────────────────────────┐
│                    Backend (Rust)                                │
├──────────────────────────┼──────────────────────────────────────┤
│                    ┌─────▼─────┐                                 │
│                    │  Connect  │                                 │
│                    │  Module   │                                 │
│                    └─────┬─────┘                                 │
│         ┌────────────────┼────────────────┐                      │
│   ┌─────▼─────┐    ┌─────▼─────┐    ┌─────▼─────┐               │
│   │ Config    │    │ Kill      │    │ Platform  │               │
│   │ Generator │    │ Switch    │    │ (macOS)   │               │
│   └─────┬─────┘    └─────┬─────┘    └─────┬─────┘               │
│         │                │                │                      │
│   ┌─────▼─────┐    ┌─────▼─────┐    ┌─────▼─────┐               │
│   │ sing-box  │    │ pf        │    │ Network   │               │
│   │ Config    │    │ Firewall  │    │ Restore   │               │
│   └───────────┘    └───────────┘    └───────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Settings Store 扩展 (TypeScript)

```typescript
// src/types/vpn.ts
export interface VpnSettings {
  // 现有配置
  mtu: number;
  dnsMode: DnsMode;
  customDns: string;
  autoReconnect: boolean;
  connectionMode: ConnectionMode;
  enableTcpFastOpen: boolean;
  upMbps: number;
  downMbps: number;
  blockQuic: boolean;
  disableIpv6: boolean;
  
  // P0: 代理端口配置
  socksPort: number;        // 默认 1080
  httpPort: number;         // 默认 1087
  
  // P0: Kill Switch
  killSwitch: boolean;      // 默认 false
  
  // P0: 路由模式
  routeMode: RouteMode;     // 默认 'rule'
  
  // P1: DNS 泄漏防护
  dnsLeakProtection: boolean;  // 默认 true
  
  // P1: 自定义域名
  customBypassDomains: string[];  // 直连域名列表
  customProxyDomains: string[];   // 强制代理域名列表
  
  // P2: WebRTC 阻断
  blockWebRTC: boolean;     // 默认 true
  
  // P2: 分应用代理
  excludedApps: string[];   // 排除的应用
  forcedProxyApps: string[]; // 强制代理的应用
  
  // P3: TUN 网络栈
  tunStack: TunStack;       // 默认 'gvisor'
  
  // 绕过局域网
  bypassLan: boolean;       // 默认 true
}

export type RouteMode = 'rule' | 'global' | 'direct';
export type TunStack = 'gvisor' | 'system' | 'lwip';
```

### 2. Rust 配置选项扩展

```rust
// src-tauri/src/vpn/config.rs
pub struct AdvancedOptions {
    // 代理端口
    pub socks_port: u16,
    pub http_port: u16,
    
    // 路由模式
    pub route_mode: RouteMode,
    
    // DNS 泄漏防护
    pub dns_leak_protection: bool,
    
    // 自定义域名
    pub custom_bypass_domains: Vec<String>,
    pub custom_proxy_domains: Vec<String>,
    
    // WebRTC 阻断
    pub block_webrtc: bool,
    
    // 分应用代理
    pub excluded_apps: Vec<String>,
    pub forced_proxy_apps: Vec<String>,
    
    // TUN 网络栈
    pub tun_stack: TunStack,
    
    // 绕过局域网
    pub bypass_lan: bool,
}

pub enum RouteMode {
    Rule,    // 规则模式（默认）
    Global,  // 全局代理
    Direct,  // 全部直连
}

pub enum TunStack {
    Gvisor,  // 用户态网络栈（默认，平衡）
    System,  // 系统网络栈（高性能）
    Lwip,    // 轻量级网络栈
}
```

### 3. Kill Switch 模块 (macOS)

```rust
// src-tauri/src/vpn/killswitch.rs
pub struct KillSwitch {
    enabled: bool,
    rules_file: PathBuf,
}

impl KillSwitch {
    /// 启用 Kill Switch
    pub fn enable(&mut self) -> Result<()>;
    
    /// 禁用 Kill Switch
    pub fn disable(&mut self) -> Result<()>;
    
    /// 检查状态
    pub fn is_enabled(&self) -> bool;
    
    /// 生成 pf 防火墙规则
    fn generate_rules(&self) -> String;
}
```

### 4. sing-box 配置生成器扩展

```rust
// src-tauri/src/vpn/singbox/mod.rs
pub fn generate_config_with_advanced_options(
    config: &ConnectConfig,
    cache_path: &Path,
    options: &ConfigOptions,
    advanced: &AdvancedOptions,
) -> Result<Value>;
```

## Data Models

### 默认配置值

```typescript
const DEFAULT_ADVANCED_SETTINGS = {
  // P0: 代理端口
  socksPort: 1080,
  httpPort: 1087,
  
  // P0: Kill Switch
  killSwitch: false,
  
  // P0: 路由模式
  routeMode: 'rule' as RouteMode,
  
  // P1: DNS 泄漏防护
  dnsLeakProtection: true,
  
  // P1: 自定义域名
  customBypassDomains: [],
  customProxyDomains: [],
  
  // P2: WebRTC 阻断
  blockWebRTC: true,
  
  // P2: 分应用代理
  excludedApps: [],
  forcedProxyApps: [],
  
  // P3: TUN 网络栈
  tunStack: 'gvisor' as TunStack,
  
  // 绕过局域网
  bypassLan: true,
};
```

### 预设应用组

```typescript
const APP_PRESETS = {
  chineseApps: ['WeChat', 'QQ', '钉钉', '企业微信', '飞书', '腾讯会议'],
  gaming: ['Steam', 'Epic Games', 'Battle.net', 'Origin'],
  streaming: ['Netflix', 'Spotify', 'YouTube Music'],
  development: ['Docker', 'Postman', 'Insomnia'],
};
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Port Configuration Defaults and Validation

*For any* VpnSettings object, the default SOCKS port SHALL be 1080 and HTTP port SHALL be 1087, and *for any* port value, it SHALL be accepted only if it is in the range 1024-65535.

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Route Mode Configuration Generation

*For any* route mode setting, the generated sing-box config SHALL have the correct final outbound: "proxy" for global mode, "direct" for direct mode, and geo-based rules for rule mode.

**Validates: Requirements 3.2, 3.3, 3.4**

### Property 3: DNS Leak Protection Configuration

*For any* config with DNS leak protection enabled, the generated sing-box config SHALL route DNS leak test domains (dnsleaktest, ipleak, browserleaks) through remote DNS server.

**Validates: Requirements 4.2, 4.3**

### Property 4: Custom Domain Priority

*For any* config with custom bypass or proxy domains, those domains SHALL appear in routing rules with higher priority (earlier in the rules array) than geo-based rules.

**Validates: Requirements 5.3**

### Property 5: Domain Format Validation

*For any* domain string, it SHALL be accepted only if it matches a valid domain format (including wildcards like *.example.com).

**Validates: Requirements 5.4, 5.5**

### Property 6: WebRTC Blocking Rules

*For any* config with WebRTC blocking enabled, the generated sing-box config SHALL contain reject rules for ports 3478, 5349, and 19302.

**Validates: Requirements 6.2**

### Property 7: Process-Based Routing Rules

*For any* config with excluded or forced proxy apps in TUN mode, the generated sing-box config SHALL contain process_name routing rules for those applications.

**Validates: Requirements 7.3, 7.5**

### Property 8: TUN Stack Configuration

*For any* TUN stack selection (gvisor, system, lwip), the generated sing-box config SHALL use the selected stack value in the inbound TUN configuration.

**Validates: Requirements 8.1, 8.2**

### Property 9: LAN Bypass Rules

*For any* config with bypass LAN enabled, the generated sing-box config SHALL contain direct routing rules for all RFC1918 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) and link-local addresses (169.254.0.0/16).

**Validates: Requirements 9.2, 9.3, 9.4**

### Property 10: Settings Reset

*For any* settings section, calling reset SHALL restore all values in that section to their default values.

**Validates: Requirements 10.4**

## Error Handling

### 端口冲突处理

```typescript
async function validatePort(port: number): Promise<ValidationResult> {
  // 1. 检查端口范围
  if (port < 1024 || port > 65535) {
    return { valid: false, error: 'Port must be between 1024 and 65535' };
  }
  
  // 2. 检查端口是否被占用
  const inUse = await invoke<boolean>('check_port_in_use', { port });
  if (inUse) {
    return { valid: false, error: `Port ${port} is already in use` };
  }
  
  return { valid: true };
}
```

### Kill Switch 故障恢复

```rust
impl Drop for KillSwitch {
    fn drop(&mut self) {
        // 确保应用退出时禁用 Kill Switch
        if self.enabled {
            let _ = self.disable();
        }
    }
}
```

### 配置生成错误处理

```rust
fn generate_config_safe(options: &AdvancedOptions) -> Result<Value> {
    // 验证所有配置项
    validate_options(options)?;
    
    // 生成配置，失败时回退到默认配置
    match generate_config_with_advanced_options(options) {
        Ok(config) => Ok(config),
        Err(e) => {
            warn!("Failed to generate config with advanced options: {}", e);
            generate_default_config()
        }
    }
}
```

## Testing Strategy

### 单元测试

1. **端口验证测试**：测试端口范围验证逻辑
2. **域名格式验证测试**：测试域名格式和通配符验证
3. **配置生成测试**：测试各种配置组合的 sing-box 配置生成
4. **默认值测试**：测试所有配置项的默认值

### 属性测试

使用 `fast-check` (TypeScript) 和 `proptest` (Rust) 进行属性测试：

1. **Property 1**: 端口配置默认值和验证
2. **Property 2**: 路由模式配置生成
3. **Property 3**: DNS 泄漏防护配置
4. **Property 4**: 自定义域名优先级
5. **Property 5**: 域名格式验证
6. **Property 6**: WebRTC 阻断规则
7. **Property 7**: 进程路由规则
8. **Property 8**: TUN 网络栈配置
9. **Property 9**: 局域网绕过规则
10. **Property 10**: 设置重置

### 集成测试

1. **Kill Switch 测试**：测试防火墙规则的启用和禁用
2. **VPN 连接测试**：测试各种配置下的 VPN 连接
3. **网络恢复测试**：测试断开连接后的网络状态恢复
