# macOS Privileged Helper 设计文档

> 更新时间: 2025-12-09
> 状态: ✅ 已实现

## 概述

实现一个 macOS Privileged Helper Tool，用于优雅地管理 TUN 模式所需的 root 权限。

## 实现方案

采用 **sudoers 规则方案**，通过一次性安装 sudoers 规则，实现后续 TUN 操作无需密码。

## 工作流程

```
┌─────────────────────────────────────────────────────────────┐
│                      首次安装 Helper                         │
├─────────────────────────────────────────────────────────────┤
│  1. 用户点击"安装系统扩展"按钮                               │
│  2. 系统弹出授权对话框（仅此一次）                           │
│  3. 创建 /etc/sudoers.d/tovpn 规则文件                      │
│  4. 创建标记文件 /Library/Application Support/ToVPN/        │
│  5. Helper 安装完成                                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      后续 TUN 操作                           │
├─────────────────────────────────────────────────────────────┤
│  1. 检测 Helper 已安装                                       │
│  2. 使用 sudo -n 执行命令（无密码）                          │
│  3. 启动/停止 sing-box 无需用户交互                          │
└─────────────────────────────────────────────────────────────┘
```

## 文件结构

```
src-tauri/
├── src/vpn/
│   ├── helper.rs              # Helper 管理（安装/卸载/状态检查）
│   └── platform/macos.rs      # macOS 平台实现（优先使用 sudo -n）
└── resources/scripts/
    ├── install_helper.sh      # 安装脚本
    └── uninstall_helper.sh    # 卸载脚本
```

## sudoers 规则

安装后创建 `/etc/sudoers.d/tovpn`：

```sudoers
# ToVPN Privileged Helper Rules
%admin ALL=(root) NOPASSWD: /opt/homebrew/bin/sing-box run -c *
%admin ALL=(root) NOPASSWD: /usr/local/bin/sing-box run -c *
%admin ALL=(root) NOPASSWD: /usr/bin/pkill -TERM sing-box
%admin ALL=(root) NOPASSWD: /usr/bin/pkill -KILL sing-box
%admin ALL=(root) NOPASSWD: /usr/bin/pkill -9 sing-box
%admin ALL=(root) NOPASSWD: /sbin/route -n delete *
%admin ALL=(root) NOPASSWD: /sbin/route -n add *
```

## 关键代码

### helper.rs

- `check_helper_status()` - 检查 Helper 安装状态
- `install_helper()` - 安装 Helper（需要一次授权）
- `uninstall_helper()` - 卸载 Helper

### platform/macos.rs

- `run_singbox_tun_as_root()` - 启动 TUN 模式
  - 优先使用 `sudo -n`（无密码）
  - 回退到 `osascript`（需要密码）
- `stop_singbox_tun_as_root()` - 停止 TUN 模式
  - 同样优先使用 `sudo -n`

## 安全考虑

1. **最小权限原则**：sudoers 规则只允许特定命令
2. **绝对路径**：所有命令使用绝对路径，防止 PATH 注入
3. **参数限制**：只允许必要的参数模式
4. **用户组限制**：只有 admin 组用户可以执行
5. **文件权限**：sudoers 文件权限 440，属主 root:wheel

## 用户体验

| 场景 | 安装前 | 安装后 |
|------|--------|--------|
| 启动 TUN | 每次弹出密码框 | 无需密码 |
| 停止 TUN | 每次弹出密码框 | 无需密码 |
| 切换服务器 | 两次密码框 | 无需密码 |

## 测试

```bash
# 检查 Helper 状态
ls -la /etc/sudoers.d/tovpn
ls -la "/Library/Application Support/ToVPN/.helper_installed"

# 验证 sudo 无密码
sudo -n true && echo "OK" || echo "FAIL"

# 测试 sing-box 启动
sudo -n sing-box version
```
