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
            let _ = tray::create_tray(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::Focused(false) => {
                if window.label() == "tray_popup" {
                    let _ = window.hide();
                }
            }
            _ => {}
        })
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
