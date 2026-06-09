# ToVPN

A modern VPN client built with Tauri v2, Vue 3, and Rust.

## Features

- **TUN Mode**: Full system traffic routing via virtual network interface (utun / tun0)
- **SOCKS Mode**: Lightweight proxy mode for specific applications
- **Hysteria2 Protocol**: High-performance UDP-based protocol
- **Auto Reconnect**: Automatic reconnection on connection loss
- **Traffic Monitoring**: Real-time upload/download statistics
- **Multi-language**: English and Chinese support
- **Multi-platform Support**: macOS, Windows, and Linux

## Tech Stack

- **Frontend**: Vue 3 + TypeScript + Pinia + Tailwind CSS
- **Backend**: Rust + Tauri v2
- **VPN Core**: sing-box

---

## 📖 使用指南与平台适配说明 (User Guide & Platform Guide)

为了让 ToVPN 能够在各个操作系统中正常接管网络流量（特别是 TUN 模式），不同系统有不同的安装和使用注意事项。请根据您的系统阅读相应部分：

### 🍎 macOS 平台使用指南与注意事项

1. **首次使用准备 (安装系统特权助手)**
   * 为了接管系统级别流量并启用 **TUN 模式**，客户端需要安装一个轻量级的系统特权助手。
   * **操作步骤**：
     1. 进入 **偏好设置 (Settings)** -> **通用 (General)**。
     2. 找到 **系统助手 (System Extension)**。
     3. 点击 **“安装助手” (Install Helper)**，系统将弹出窗口要求输入一次 macOS 管理员密码（用于授权安装）。
     4. 安装成功后，状态将变为 **“运行中” (Active)**。
   * > [!IMPORTANT]
     > **钥匙串频繁授权的修复**：本版本已将证书凭据以高强度加密存放在用户数据目录（`~/.tovpn_signing_key`）并配置 Unix 权限为 `0o600`（仅所有者可读写），替代了原先调用的系统 Keychain 钥匙串，彻底解决了频繁弹出钥匙串授权窗口的问题。
     >
     > **免密特权白名单**：系统特权助手免密运行基于绝对路径 `/usr/sbin/networksetup`，应用内所有网络配置调用均已适配绝对路径，确保免密顺畅。

2. **常见问题排除**
   * **切换 TUN 模式报错 "System Extension Required"**：说明特权助手未成功激活。请在偏好设置中先点击 **“卸载助手”**，随后再点击 **“安装助手”** 重新授权安装。
   * **断网恢复**：本程序将虚拟网卡生命周期及路由完全托管给 sing-box 内核的 `auto_route` 和 `strict_route` 策略。在应用关闭或异常退出时，系统会自动回收 `utun` 网卡，路由自动恢复，彻底解决断开连接后整机断网的隐患。

---

### 💻 Windows 平台使用指南与注意事项

1. **启动与特权授权 (UAC)**
   * **TUN 模式工作原理**：Windows 系统下运行 `sing-box` 需要管理员权限以创建和配置虚拟网卡。
   * > [!IMPORTANT]
     > **用户账户控制 (UAC) 授权**：在切换到 **TUN 模式** 时，系统会通过 PowerShell `RunAs` 提权运行 `sing-box`，届时会弹出 UAC 提权请求，请选择**“是/允许”**。
     >
     > **网络状态自动恢复**：为防止程序意外退出导致 Windows 代理残留或网络阻塞，应用在启动和退出时会自动执行网络清理逻辑，通过 `netsh winhttp reset proxy` 重置 WinHTTP 代理，并自动执行 `ipconfig /flushdns` 刷新 DNS 缓存。

2. **系统代理设置**
   * **SOCKS / HTTP 模式**：通过修改注册表 `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings` 中的 `ProxyEnable` 和 `ProxyServer` 来实现系统级代理接管。

---

### 🐧 Linux 平台使用指南与注意事项

1. **权限提权与启动**
   * **提权机制**：Linux 下需要 Root 权限以创建 `tun0` 虚拟网卡。
   * > [!IMPORTANT]
     > **Polkit (pkexec) 授权**：在启用 **TUN 模式** 时，应用会通过 `pkexec` 命令调用 `sing-box`。系统会弹出 Polkit 授权对话框，需要您输入当前用户的**密码**以完成授权。
     >
     > 请确保系统已安装 `pkexec`（大多数主流桌面发行版如 Ubuntu、Fedora、Debian 均已默认自带）。

2. **系统代理与网络恢复**
   * **桌面环境适配**：Linux 系统代理配置目前针对 GNOME 桌面环境进行了适配，通过调用 `gsettings` 命令行工具自动配置 `org.gnome.system.proxy` 的代理模式和端口。
   * **DNS 与路由清理**：启用 TUN 模式时，应用会自动备份系统 DNS 配置文件 `/etc/resolv.conf` 为 `/etc/resolv.conf.bak`。如果连接非正常断开，可以通过执行 `ip link del tun0` 并恢复 `/etc/resolv.conf` 手动完成清理。

---

### 📖 通用功能与使用技巧（所有平台适用）

1. **服务器选择与延迟测速**
   * 刚进入服务器列表页时，服务器右侧会显示蓝色闪烁点和 `- ms`，表示正在进行代理通道测速。
   * **测速质量颜色指示**：
     * 🟢 **绿色 (< 100ms)**：延迟极低，适合游戏、高清视频。
     * 🟡 **黄色 (100ms - 200ms)**：普通延迟，适合常规网页浏览。
     * 🔴 **红色 (> 200ms)**：高延迟，不建议连接。
     * 置灰按钮：表示该服务器当前离线或处于维护状态。
   * > [!TIP]
     > **测速准确性优化**：新版本修复了以前版本因 Pinia 状态不同步而测试出物理 ICMP 假延迟（1ms/2ms）的问题。现在测速超时已从 3 秒提升至 6 秒，并确保在 VPN 连接状态下使用代理通道测速，反馈最真实的连接延迟。

2. **分流模式说明**
   * **规则模式 (Rule - 推荐)**：开启“绕过中国大陆”。国内流量直连（速度快且不消耗代理流量），国外流量自动走加速节点。
   * **全局模式 (Global)**：整机所有外网流量全部走代理节点。
   * **直连模式 (Direct)**：所有流量均不走代理。

---

## Requirements

- Node.js 18+
- Rust 1.70+
- pnpm 8+
- Supported OS: macOS 12+, Windows 10+, Linux (with GNOME desktop environment)

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm tauri:dev

# Build for production
pnpm tauri:build

# Run tests
pnpm test                    # Frontend tests
cd src-tauri && cargo test   # Backend tests
```

## Project Structure

```
├── src/                    # Frontend source
│   ├── api/               # API clients
│   ├── components/        # Vue components
│   ├── stores/            # Pinia stores
│   ├── utils/             # Utility functions
│   └── views/             # Page views
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── vpn/          # VPN core logic
│   │   │   ├── platform/ # Platform specific implementations (macOS, Windows, Linux)
│   │   │   ├── connect.rs    # Connection management
│   │   │   ├── monitor.rs    # Traffic/latency monitoring
│   │   │   ├── state.rs      # VPN state management
│   │   │   └── proxy.rs      # System proxy settings
│   │   ├── constants.rs  # Configuration constants
│   │   └── error.rs      # Error types
│   └── binaries/         # sing-box sidecar
└── docs/                  # Documentation
```

## License

MIT
