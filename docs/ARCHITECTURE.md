# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ToVPN Application                       │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Vue 3 Frontend                     │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │   │
│  │  │  Views   │  │Components│  │   Pinia Stores   │  │   │
│  │  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │   │
│  │       └─────────────┴─────────────────┘            │   │
│  │                      │                              │   │
│  │              Tauri IPC (invoke)                     │   │
│  └──────────────────────┼──────────────────────────────┘   │
│                         │                                   │
│  ┌──────────────────────┼──────────────────────────────┐   │
│  │                Rust Backend                          │   │
│  │  ┌───────────────────┴───────────────────────────┐  │   │
│  │  │              VPN Module                        │  │   │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────────────┐  │  │   │
│  │  │  │ connect │ │ monitor │ │     state       │  │  │   │
│  │  │  └────┬────┘ └────┬────┘ └────────┬────────┘  │  │   │
│  │  │       └───────────┴───────────────┘           │  │   │
│  │  └───────────────────┬───────────────────────────┘  │   │
│  │  ┌───────────────────┴───────────────────────────┐  │   │
│  │  │           Helper Module (Privileged)          │  │   │
│  │  │  ┌─────────┐ ┌─────────┐                      │  │   │
│  │  │  │ manager │ │ status  │  sudoers rules       │  │   │
│  │  │  └─────────┘ └─────────┘                      │  │   │
│  │  └───────────────────────────────────────────────┘  │   │
│  └──────────────────────┼──────────────────────────────┘   │
│                         │                                   │
│  ┌──────────────────────┼──────────────────────────────┐   │
│  │              sing-box (Sidecar)                      │   │
│  │  ┌───────────────────┴───────────────────────────┐  │   │
│  │  │  Hysteria2 Protocol  │  TUN/SOCKS Inbound     │  │   │
│  │  └───────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Connection Flow

```
User Click → vpn.connect() → invoke("connect_hysteria")
                                    │
                                    ▼
                          ConnectConfig.validate()
                                    │
                                    ▼
                          generate_singbox_config()
                                    │
                                    ▼
                    ┌───────────────┴───────────────┐
                    │                               │
                TUN Mode                       SOCKS Mode
                    │                               │
            run_singbox_tun_as_root()      spawn sidecar
            (requires admin)                set_system_proxy()
                    │                               │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                            start_monitor()
                            start_process_watchdog()
                                    │
                                    ▼
                          emit("vpn-status-change")
```

### Event System

| Event | Direction | Payload |
|-------|-----------|---------|
| `vpn-status-change` | Backend → Frontend | `{ status, server_id, connected_at }` |
| `vpn-traffic` | Backend → Frontend | `{ download_bytes, upload_bytes, download_speed, upload_speed }` |
| `vpn-latency` | Backend → Frontend | `{ latency_ms }` |
| `vpn-log` | Backend → Frontend | `{ level, message, timestamp }` |
| `vpn-process-crashed` | Backend → Frontend | `{ reason, consecutive_failures }` |

## State Management

### Frontend (Pinia)

```typescript
// vpn.ts - VPN connection state
status: VpnStatus           // disconnected | connecting | connected | disconnecting
stats: ConnectionStats      // traffic, latency, connected time
dailyUsage: DailyUsage     // traffic/time limits

// auth.ts - Authentication
accessToken: string
refreshToken: string
user: UserProfile

// servers.ts - Server list
servers: Server[]
currentServer: Server | null
```

### Backend (Rust)

```rust
// VpnState - Thread-safe state
pub struct VpnState {
    child: Mutex<Option<CommandChild>>,    // sing-box process
    status: Mutex<VpnStatusEnum>,          // connection status
    server_id: Mutex<Option<i32>>,         // current server
    connected_at: AtomicU64,               // connection timestamp
    current_mode: Mutex<String>,           // tun | socks
    monitor_running: Arc<AtomicBool>,      // monitor thread flag
    user_disconnect: Arc<AtomicBool>,      // user-initiated disconnect
}
```

## Security

### Token Storage

- Tokens stored in Tauri secure store (not localStorage)
- Auto-refresh before expiration
- Memory cache for sync access

### Config Validation

All connection parameters validated before use:
- Server host: non-empty, valid characters, max 253 chars
- Port: 1-65535
- Password: non-empty, max 256 chars
- Mode: tun | socks
- MTU: 576-1500
- DNS: google | aliyun | cloudflare

## Error Handling

```rust
pub enum VpnError {
    Config(String),        // Configuration errors
    Connection(String),    // Connection failures
    AlreadyConnected,      // State errors
    AlreadyConnecting,
    InvalidServer(String), // Validation errors
    Network(String),       // Network errors
    Io(String),           // IO errors
}
```


## Backend Module Structure

```
src-tauri/src/
├── lib.rs              # 应用入口，注册 Tauri commands
├── main.rs             # 主函数
├── constants.rs        # 全局常量
├── error.rs            # 错误类型定义
├── logging.rs          # 日志配置
├── tray.rs             # 系统托盘功能
│
├── helper/             # Privileged Helper 模块
│   ├── mod.rs          # 模块入口
│   ├── manager.rs      # Helper 安装/卸载管理
│   └── status.rs       # Helper 状态检查
│
├── vpn/                # VPN 核心模块
│   ├── mod.rs          # 模块入口
│   ├── config.rs       # 连接配置
│   ├── connect.rs      # 连接/断开逻辑
│   ├── connectivity.rs # 连通性测试
│   ├── monitor.rs      # 流量/延迟监控
│   ├── ping.rs         # 节点 ping 测试
│   ├── proxy.rs        # 系统代理设置
│   ├── singbox.rs      # sing-box 配置生成
│   ├── state.rs        # VPN 状态管理
│   └── platform/       # 平台特定实现
│       ├── mod.rs
│       └── macos.rs    # macOS 实现
│
└── utils/              # 工具模块
    ├── mod.rs
    ├── network.rs      # 网络工具
    ├── platform.rs     # 平台检测
    └── process.rs      # 进程管理
```

## Privileged Helper

ToVPN 使用 Privileged Helper 实现无密码启动 TUN 模式：

### 工作原理

1. 首次安装时，通过 `osascript` 请求管理员权限
2. 创建 `/etc/sudoers.d/tovpn` 规则文件
3. 后续启动 sing-box 时使用 `sudo -n` 无密码执行

### sudoers 规则

```
%admin ALL=(root) NOPASSWD: /opt/homebrew/bin/sing-box run -c *
%admin ALL=(root) NOPASSWD: /usr/local/bin/sing-box run -c *
%admin ALL=(root) NOPASSWD: /usr/bin/pkill -TERM sing-box
%admin ALL=(root) NOPASSWD: /usr/bin/pkill -KILL sing-box
%admin ALL=(root) NOPASSWD: /sbin/route -n delete *
%admin ALL=(root) NOPASSWD: /sbin/route -n add *
```

### 安全考虑

- 只允许特定命令，不是通用 sudo 权限
- 规则文件权限 440，只有 root 可写
- 使用 `visudo -c` 验证语法
