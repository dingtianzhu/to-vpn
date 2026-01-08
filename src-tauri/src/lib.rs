mod constants;
mod error;
mod helper;
mod logging;
mod tray;
mod vpn;

use tauri::Manager;
use vpn::killswitch::KillSwitch;
use vpn::platform;
use vpn::ruleset::{check_ruleset_status, update_rulesets, RulesetStatus, RulesetUpdateResult};
use vpn::state::VpnState;

/// Tauri 命令：检查规则集状态
///
/// **Feature: vpn-optimization**
/// **Validates: Requirements 5.3, 7.2, 7.3**
#[tauri::command]
fn get_ruleset_status() -> RulesetStatus {
    check_ruleset_status()
}

/// Tauri 命令：更新规则集
///
/// **Feature: vpn-optimization**
/// **Validates: Requirements 5.3, 7.2, 7.3**
#[tauri::command]
async fn update_ruleset() -> RulesetUpdateResult {
    update_rulesets().await
}

/// Tauri 命令：检查端口是否可用
///
/// **Feature: vpn-pure-mode**
/// **Validates: Requirements 1.6**
#[tauri::command]
fn check_port_available(port: u16) -> Result<bool, String> {
    // First validate the port range
    if let Err(e) = vpn::port::validate_port_range(port) {
        return Err(e.to_string());
    }
    Ok(vpn::port::is_port_available(port))
}

/// Tauri 命令：验证代理端口配置
///
/// **Feature: vpn-pure-mode**
/// **Validates: Requirements 1.3, 1.6**
#[tauri::command]
fn validate_proxy_ports(socks_port: u16, http_port: u16) -> Result<(), String> {
    vpn::port::validate_proxy_ports(socks_port, http_port).map_err(|e| e.to_string())
}

/// Tauri 命令：启用 Kill Switch
///
/// **Feature: vpn-pure-mode**
/// **Validates: Requirements 2.2**
#[tauri::command]
fn enable_kill_switch() -> Result<(), String> {
    KillSwitch::enable()
}

/// Tauri 命令：禁用 Kill Switch
///
/// **Feature: vpn-pure-mode**
/// **Validates: Requirements 2.4**
#[tauri::command]
fn disable_kill_switch() -> Result<(), String> {
    KillSwitch::disable()
}

/// Tauri 命令：检查 Kill Switch 状态
///
/// **Feature: vpn-pure-mode**
/// **Validates: Requirements 2.1**
#[tauri::command]
fn is_kill_switch_enabled() -> bool {
    KillSwitch::is_enabled()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logging::init();
    tracing::info!("Performing startup cleanup...");
    platform::force_cleanup();
    // 清除所有系统代理（SOCKS + HTTP），防止异常退出后代理残留
    vpn::proxy::set_system_proxy(false);
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init()) // 必须添加这一行
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(VpnState::new())
        .invoke_handler(tauri::generate_handler![
            // 状态检查
            vpn::state::check_vpn_status,
            // Helper 管理
            helper::status::check_helper_status,
            helper::manager::install_helper,
            helper::manager::uninstall_helper,
            // VPN 连接
            vpn::connect::precheck_tun_permission,
            vpn::connect::connect_hysteria,
            vpn::connect::disconnect_vpn,
            vpn::connect::restart_vpn_monitor,
            // Ping 功能
            vpn::ping::ping_nodes,
            vpn::ping::ping_single_node,
            vpn::ping::ping_nodes_via_proxy,
            vpn::ping::ping_single_node_via_proxy,
            vpn::stats::ping_server,
            // 连通性测试
            vpn::connectivity::test_connectivity,
            vpn::connectivity::test_dns_resolution,
            vpn::connectivity::get_public_ip,
            // 🔧 新增: DNS泄漏检测
            vpn::dns_leak_test::check_dns_leak,
            // 🔧 新增: 规则集状态检查和更新
            get_ruleset_status,
            update_ruleset,
            // 🔧 新增: 端口验证
            check_port_available,
            validate_proxy_ports,
            // 🔧 新增: Kill Switch
            enable_kill_switch,
            disable_kill_switch,
            is_kill_switch_enabled,
            // 托盘功能
            tray::hide_tray_popup,
            tray::show_main_window,
            tray::minimize_to_tray,
        ])
        .setup(|app| {
            // 初始化托盘
            let _ = tray::create_tray(app.handle());
            Ok(())
        })
        // ▼▼▼ 修改了这里：窗口事件监听 ▼▼▼
        .on_window_event(|window, event| match event {
            // 1. 拦截主窗口的关闭请求 (点击 X)
            tauri::WindowEvent::CloseRequested { api, .. } => {
                if window.label() == "main" {
                    // 阻止默认的退出程序行为
                    api.prevent_close();
                    // 调用 tray 模块的逻辑：隐藏窗口 + (macOS)隐藏 Dock 图标
                    tray::minimize_to_tray(window.app_handle().clone());
                }
            }
            // 2. 托盘弹窗失去焦点时自动隐藏
            tauri::WindowEvent::Focused(false) => {
                if window.label() == "tray_popup" {
                    // 调用 tray 模块的 hide 方法，确保状态(IS_PINNED)被正确重置
                    // 这样可以避免"下次点击需要点两次"的问题
                    tray::hide_tray_popup(window.app_handle().clone());
                }
            }
            _ => {}
        })
        // ▲▲▲ 修改结束 ▲▲▲
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                tracing::info!("Application exiting, final cleanup...");
                cleanup_on_exit(app_handle);
            }
        });
}

fn cleanup_on_exit(app_handle: &tauri::AppHandle) {
    // 清理 Kill Switch（应用退出时必须禁用）
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 2.5 - 应用退出时禁用 Kill Switch 并恢复网络**
    KillSwitch::force_cleanup();
    
    platform::force_cleanup();
    // 清除所有系统代理（SOCKS + HTTP）
    vpn::proxy::set_system_proxy(false);
    
    // 恢复网络状态（DNS、路由、IPv6）
    #[cfg(target_os = "macos")]
    platform::restore_network_state();

    if let Some(state) = app_handle.try_state::<VpnState>() {
        state.reset();
    }
}
