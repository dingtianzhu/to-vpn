mod vpn;
mod error;
mod constants;
mod logging;
mod tray;
mod helper;

use tauri::Manager;
use vpn::state::VpnState;
use vpn::platform;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 初始化结构化日志
    logging::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(VpnState::new())
        .invoke_handler(tauri::generate_handler![
            // 状态检查
            vpn::state::check_vpn_status,
            // Helper 管理（新模块）
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
            vpn::stats::ping_server,
            // 连通性测试
            vpn::connectivity::test_connectivity,
            vpn::connectivity::test_dns_resolution,
            // 托盘功能
            tray::hide_tray_popup,
            tray::show_main_window,
            tray::minimize_to_tray,
        ])
        .setup(|app| {
            // 创建系统托盘
            let _ = tray::create_tray(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                // 窗口失去焦点时隐藏托盘弹窗
                tauri::WindowEvent::Focused(false) => {
                    if window.label() == "tray_popup" {
                        let _ = window.hide();
                    }
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // 应用退出时清理
            if let tauri::RunEvent::Exit = event {
                tracing::info!("Application exiting, final cleanup...");
                cleanup_on_exit(app_handle);
            }
        });
}

/// 应用退出时清理 VPN 连接
fn cleanup_on_exit(app_handle: &tauri::AppHandle) {
    // 强制清理所有 TUN 相关资源
    platform::force_cleanup();
    
    // 清理系统代理
    vpn::proxy::set_system_socks_proxy(false);
    
    // 重置状态
    if let Some(state) = app_handle.try_state::<VpnState>() {
        state.reset();
    }
}
