# Requirements Document

## Introduction

本功能旨在将 VPN 客户端升级为工业级纯净版，提供完整的隐私保护、灵活的配置选项和专业级的安全功能。对标 Clash、Surge、Shadowrocket 等成熟工具，实现代理端口配置、Kill Switch、路由模式选择、DNS 泄漏防护、自定义域名规则、WebRTC 阻断、分应用代理和 TUN 网络栈选择等功能。

## Glossary

- **VPN_Client**: VPN 客户端应用程序
- **Kill_Switch**: 网络锁功能，VPN 断开时阻断所有网络流量防止泄漏
- **Route_Mode**: 路由模式，控制流量走向（规则/全局/直连）
- **DNS_Leak_Protection**: DNS 泄漏防护，确保 DNS 查询不泄露真实 IP
- **WebRTC_Blocker**: WebRTC 阻断器，防止浏览器通过 WebRTC 泄露真实 IP
- **Per_App_Proxy**: 分应用代理，允许特定应用绕过或强制使用代理
- **TUN_Stack**: TUN 网络栈，处理虚拟网卡数据的底层实现
- **Settings_Store**: 前端设置存储模块
- **Sing_Box_Config**: sing-box 配置生成器

## Requirements

### Requirement 1: 代理端口配置

**User Story:** As a user, I want to configure proxy ports, so that I can avoid port conflicts with other applications.

#### Acceptance Criteria

1. THE Settings_Store SHALL provide configurable SOCKS proxy port with default value 1080
2. THE Settings_Store SHALL provide configurable HTTP proxy port with default value 1087
3. WHEN a user changes proxy port settings, THE VPN_Client SHALL validate port range (1024-65535)
4. WHEN a user changes proxy port settings while connected, THE VPN_Client SHALL prompt for reconnection
5. THE Sing_Box_Config SHALL use configured ports instead of hardcoded values
6. IF a configured port is already in use, THEN THE VPN_Client SHALL display an error message

### Requirement 2: Kill Switch (网络锁)

**User Story:** As a privacy-conscious user, I want a Kill Switch feature, so that my real IP is never exposed when VPN disconnects unexpectedly.

#### Acceptance Criteria

1. THE Settings_Store SHALL provide a Kill Switch toggle with default value false
2. WHEN Kill Switch is enabled and VPN connects, THE VPN_Client SHALL activate firewall rules to block non-VPN traffic
3. WHEN Kill Switch is enabled and VPN disconnects, THE VPN_Client SHALL maintain firewall rules blocking all traffic
4. WHEN Kill Switch is disabled, THE VPN_Client SHALL remove all firewall rules
5. WHEN the application exits with Kill Switch enabled, THE VPN_Client SHALL disable Kill Switch and restore network
6. THE VPN_Client SHALL allow localhost (127.0.0.1) traffic even when Kill Switch is active
7. THE VPN_Client SHALL allow LAN traffic (192.168.x.x, 10.x.x.x, 172.16-31.x.x) when Kill Switch is active

### Requirement 3: 路由模式选择

**User Story:** As a user, I want to choose routing modes, so that I can control how my traffic is routed.

#### Acceptance Criteria

1. THE Settings_Store SHALL provide route mode selection with options: rule, global, direct
2. WHEN route mode is "rule", THE Sing_Box_Config SHALL apply geo-based routing rules (bypass China, proxy others)
3. WHEN route mode is "global", THE Sing_Box_Config SHALL route all traffic through proxy
4. WHEN route mode is "direct", THE Sing_Box_Config SHALL route all traffic directly without proxy
5. WHEN a user changes route mode while connected, THE VPN_Client SHALL prompt for reconnection
6. THE VPN_Client SHALL display current route mode in the UI

### Requirement 4: DNS 泄漏防护增强

**User Story:** As a privacy-conscious user, I want enhanced DNS leak protection, so that my DNS queries never reveal my real location.

#### Acceptance Criteria

1. THE Settings_Store SHALL provide a DNS leak protection toggle with default value true
2. WHEN DNS leak protection is enabled, THE Sing_Box_Config SHALL route all DNS queries through proxy
3. WHEN DNS leak protection is enabled, THE Sing_Box_Config SHALL block DNS leak test domains from using local DNS
4. THE Sing_Box_Config SHALL configure DNS cache to prevent stale entries
5. WHEN VPN disconnects, THE VPN_Client SHALL restore original DNS settings

### Requirement 5: 自定义直连/代理域名

**User Story:** As an advanced user, I want to customize which domains bypass or use proxy, so that I can fine-tune my routing rules.

#### Acceptance Criteria

1. THE Settings_Store SHALL provide a list of custom bypass domains (direct connection)
2. THE Settings_Store SHALL provide a list of custom proxy domains (force proxy)
3. WHEN custom domains are configured, THE Sing_Box_Config SHALL apply them with higher priority than geo rules
4. THE VPN_Client SHALL validate domain format before saving
5. THE VPN_Client SHALL support wildcard domains (e.g., *.example.com)
6. WHEN a user modifies custom domains while connected, THE VPN_Client SHALL prompt for reconnection

### Requirement 6: WebRTC 阻断

**User Story:** As a privacy-conscious user, I want to block WebRTC, so that browsers cannot leak my real IP through WebRTC.

#### Acceptance Criteria

1. THE Settings_Store SHALL provide a WebRTC blocking toggle with default value true
2. WHEN WebRTC blocking is enabled, THE Sing_Box_Config SHALL block STUN/TURN server ports (3478, 5349, 19302)
3. WHEN WebRTC blocking is enabled, THE Sing_Box_Config SHALL block known WebRTC domains
4. THE VPN_Client SHALL display WebRTC blocking status in settings

### Requirement 7: 分应用代理

**User Story:** As a user, I want to exclude specific applications from VPN, so that certain apps can use direct connection.

#### Acceptance Criteria

1. THE Settings_Store SHALL provide a list of excluded applications (bypass VPN)
2. THE Settings_Store SHALL provide a list of forced proxy applications (must use VPN)
3. WHEN in TUN mode, THE Sing_Box_Config SHALL apply process-based routing rules
4. THE VPN_Client SHALL provide a UI to add/remove applications from the list
5. THE VPN_Client SHALL support application names (e.g., "WeChat", "QQ")
6. WHEN a user modifies application lists while connected, THE VPN_Client SHALL prompt for reconnection
7. THE VPN_Client SHALL provide preset application groups (e.g., "Chinese Apps", "Gaming")

### Requirement 8: TUN 网络栈选择

**User Story:** As an advanced user, I want to choose TUN stack implementation, so that I can optimize for performance or compatibility.

#### Acceptance Criteria

1. THE Settings_Store SHALL provide TUN stack selection with options: gvisor, system, lwip
2. THE Sing_Box_Config SHALL use the selected TUN stack in configuration
3. THE VPN_Client SHALL display stack descriptions (gvisor: balanced, system: native performance, lwip: lightweight)
4. WHEN a user changes TUN stack while connected, THE VPN_Client SHALL prompt for reconnection
5. IF selected stack causes connection failure, THEN THE VPN_Client SHALL suggest trying alternative stacks

### Requirement 9: 绕过局域网配置

**User Story:** As a user, I want to configure LAN bypass behavior, so that I can access local network resources.

#### Acceptance Criteria

1. THE Settings_Store SHALL provide a bypass LAN toggle with default value true
2. WHEN bypass LAN is enabled, THE Sing_Box_Config SHALL route private IP ranges directly
3. THE Sing_Box_Config SHALL include all RFC1918 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
4. THE Sing_Box_Config SHALL include link-local addresses (169.254.0.0/16)

### Requirement 10: 设置界面组织

**User Story:** As a user, I want organized settings, so that I can easily find and configure options.

#### Acceptance Criteria

1. THE VPN_Client SHALL organize settings into sections: Proxy Ports, Security, Routing, Advanced
2. THE VPN_Client SHALL display setting descriptions and tooltips
3. THE VPN_Client SHALL highlight settings that require reconnection
4. THE VPN_Client SHALL provide a "Reset to Defaults" option for each section
