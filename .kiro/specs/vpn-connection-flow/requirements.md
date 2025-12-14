# Requirements Document

## Introduction

本需求文档定义了 ToVPN 客户端的 VPN 连接流程优化，包括：
1. 未登录时尝试连接自动跳转登录，登录后自动连接
2. 连接前检查用户剩余流量和时间，不满足时弹出购买服务弹框
3. 购买成功后刷新用户信息并自动重连
4. Admin 用户无视限制规则直接连接
5. TUN 模式下断开连接需要授权弹框的问题排查

## Glossary

- **VPN_System**: ToVPN 客户端应用程序
- **User**: 使用 ToVPN 客户端的用户
- **Admin_User**: 拥有 admin 或 super_admin 角色的用户
- **Usage_Limit**: 用户的每日流量限制和时间限制
- **Purchase_Modal**: 购买服务的弹框组件
- **Auto_Connect**: 登录后自动连接 VPN 的功能
- **TUN_Mode**: 使用系统级 TUN 接口的 VPN 连接模式

## Requirements

### Requirement 1

**User Story:** As a user, I want to be redirected to login when I try to connect VPN without being logged in, and automatically connect after successful login, so that I can have a seamless connection experience.

#### Acceptance Criteria

1. WHEN a user clicks the connect button while not logged in THEN the VPN_System SHALL redirect the user to the login page with a pending connect flag
2. WHEN a user successfully logs in with a pending connect flag THEN the VPN_System SHALL automatically initiate VPN connection
3. WHEN a user logs in without a pending connect flag THEN the VPN_System SHALL display the home page without auto-connecting
4. WHEN the auto-connect process starts THEN the VPN_System SHALL verify user credentials and server availability before connecting

### Requirement 2

**User Story:** As a user, I want the system to check my remaining traffic and time before connecting, so that I know if I need to purchase more service.

#### Acceptance Criteria

1. WHEN a user attempts to connect VPN THEN the VPN_System SHALL check the user's remaining daily traffic
2. WHEN a user attempts to connect VPN THEN the VPN_System SHALL check the user's remaining daily time
3. WHEN either traffic or time limit is exceeded THEN the VPN_System SHALL display the Purchase_Modal instead of connecting
4. WHEN both traffic and time limits are satisfied THEN the VPN_System SHALL proceed with the VPN connection
5. WHEN an Admin_User attempts to connect VPN THEN the VPN_System SHALL bypass all usage limit checks and connect directly

### Requirement 3

**User Story:** As a user, I want to purchase service when my limits are exceeded, and have the VPN connect automatically after purchase, so that I can continue using the service without manual reconnection.

#### Acceptance Criteria

1. WHEN the Purchase_Modal is displayed THEN the VPN_System SHALL show available plans and pricing
2. WHEN a user completes a purchase successfully THEN the VPN_System SHALL refresh the user's subscription information
3. WHEN user information is refreshed after purchase THEN the VPN_System SHALL automatically initiate VPN connection
4. WHEN a user dismisses the Purchase_Modal without purchasing THEN the VPN_System SHALL keep the modal visible
5. WHEN a user clicks outside the Purchase_Modal THEN the VPN_System SHALL prevent the modal from closing

### Requirement 4

**User Story:** As a developer, I want to understand why TUN mode disconnect requires authorization prompt while connect does not, so that I can fix the inconsistent behavior.

#### Acceptance Criteria

1. WHEN investigating TUN mode authorization THEN the VPN_System SHALL log all sudo/authorization related events
2. WHEN TUN mode connects THEN the VPN_System SHALL document the authorization flow used
3. WHEN TUN mode disconnects THEN the VPN_System SHALL document the authorization flow used
4. WHEN authorization inconsistency is identified THEN the VPN_System SHALL provide a fix proposal

### Requirement 5

**User Story:** As a user, I want TUN mode to work correctly for accessing external networks, so that I can browse the internet through the VPN.

#### Acceptance Criteria

1. WHEN TUN mode is connected THEN the VPN_System SHALL route traffic through the VPN tunnel
2. WHEN connectivity test fails in TUN mode THEN the VPN_System SHALL log detailed diagnostic information
3. WHEN TUN mode fails to access external networks THEN the VPN_System SHALL display a meaningful error message
