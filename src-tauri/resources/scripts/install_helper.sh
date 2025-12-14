#!/bin/bash
# ToVPN Privileged Helper 安装脚本
# 此脚本需要 root 权限执行

set -e

SUDOERS_FILE="/etc/sudoers.d/tovpn"
HELPER_MARKER="/Library/Application Support/ToVPN/.helper_installed"

# 检查是否以 root 运行
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: This script must be run as root"
    exit 1
fi

# 创建 sudoers 规则
create_sudoers_rule() {
    cat > "$SUDOERS_FILE" << 'EOF'
# ToVPN Privileged Helper Rules
# Allow admin users to run sing-box and related commands without password

# sing-box 执行权限
%admin ALL=(root) NOPASSWD: /opt/homebrew/bin/sing-box run -c *
%admin ALL=(root) NOPASSWD: /usr/local/bin/sing-box run -c *

# 进程管理权限 (pkill)
%admin ALL=(root) NOPASSWD: /usr/bin/pkill -TERM sing-box
%admin ALL=(root) NOPASSWD: /usr/bin/pkill -KILL sing-box
%admin ALL=(root) NOPASSWD: /usr/bin/pkill -9 sing-box

# 进程管理权限 (kill) - 用于通过 PID 杀死进程
%admin ALL=(root) NOPASSWD: /bin/kill -TERM *
%admin ALL=(root) NOPASSWD: /bin/kill -KILL *
%admin ALL=(root) NOPASSWD: /bin/kill -9 *

# 文件清理权限
%admin ALL=(root) NOPASSWD: /bin/rm -f /tmp/tovpn-*

# 路由管理权限
%admin ALL=(root) NOPASSWD: /sbin/route -n delete *
%admin ALL=(root) NOPASSWD: /sbin/route -n add *
EOF

    # 设置正确的权限
    chmod 440 "$SUDOERS_FILE"
    chown root:wheel "$SUDOERS_FILE"

    # 验证 sudoers 文件语法
    if ! visudo -c -f "$SUDOERS_FILE" > /dev/null 2>&1; then
        echo "ERROR: Invalid sudoers syntax"
        rm -f "$SUDOERS_FILE"
        exit 1
    fi

    echo "Sudoers rule created successfully"
}

# 创建标记文件
create_marker() {
    mkdir -p "$(dirname "$HELPER_MARKER")"
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$HELPER_MARKER"
    chmod 644 "$HELPER_MARKER"
    echo "Helper marker created"
}

# 主逻辑
main() {
    echo "Installing ToVPN Privileged Helper..."
    
    # 创建 sudoers 规则
    create_sudoers_rule
    
    # 创建标记文件
    create_marker
    
    echo "ToVPN Privileged Helper installed successfully"
}

main "$@"
