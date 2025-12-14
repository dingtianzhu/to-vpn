#!/bin/bash
# ToVPN Privileged Helper 卸载脚本
# 此脚本需要 root 权限执行

set -e

SUDOERS_FILE="/etc/sudoers.d/tovpn"
HELPER_MARKER="/Library/Application Support/ToVPN/.helper_installed"

# 检查是否以 root 运行
if [ "$EUID" -ne 0 ]; then
    echo "ERROR: This script must be run as root"
    exit 1
fi

# 删除 sudoers 规则
remove_sudoers_rule() {
    if [ -f "$SUDOERS_FILE" ]; then
        rm -f "$SUDOERS_FILE"
        echo "Sudoers rule removed"
    else
        echo "Sudoers rule not found"
    fi
}

# 删除标记文件
remove_marker() {
    if [ -f "$HELPER_MARKER" ]; then
        rm -f "$HELPER_MARKER"
        echo "Helper marker removed"
    fi
    
    # 清理目录（如果为空）
    rmdir "/Library/Application Support/ToVPN" 2>/dev/null || true
}

# 主逻辑
main() {
    echo "Uninstalling ToVPN Privileged Helper..."
    
    # 删除 sudoers 规则
    remove_sudoers_rule
    
    # 删除标记文件
    remove_marker
    
    echo "ToVPN Privileged Helper uninstalled successfully"
}

main "$@"
