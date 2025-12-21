mod constants;
mod error;
mod helper;
mod logging;
mod tray;
mod vpn;

use tauri::Manager;
use vpn::platform;
use vpn::state::VpnState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logging::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
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
            vpn::stats::ping_server,
            // 连通性测试
            vpn::connectivity::test_connectivity,
            vpn::connectivity::test_dns_resolution,
            // 🔧 新增: DNS泄漏检测
            vpn::dns_leak_test::check_dns_leak,
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
    platform::force_cleanup();
    vpn::proxy::set_system_socks_proxy(false);

    if let Some(state) = app_handle.try_state::<VpnState>() {
        state.reset();
    }
}
