//! VPN 连接核心模块
//! 版本：v2025-12-17-PortSeparation-Clean

use std::fs;
use std::net::TcpStream;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tracing::{error, info, warn};

use crate::constants;
use crate::error::{Result, VpnError};

use super::config::ConnectConfig;
use super::monitor::{
    emit_log, emit_status_change, start_monitor, start_process_watchdog, stop_monitor,
    stop_watchdog,
};
use super::platform;
use super::proxy::set_system_socks_proxy;
use super::security;
use super::singbox::{is_fatal_error, parse_log_level};
use super::state::{VpnState, VpnStatusEnum};

#[derive(serde::Serialize)]
pub struct TunPrecheckResult {
    pub singbox_installed: bool,
    pub sudo_cached: bool,
    pub will_prompt: bool,
    pub platform: String,
}

#[tauri::command]
pub fn precheck_tun_permission() -> TunPrecheckResult {
    let precheck = platform::precheck_tun_permission();
    TunPrecheckResult {
        singbox_installed: precheck.singbox_installed,
        sudo_cached: precheck.sudo_cached,
        will_prompt: precheck.will_prompt,
        platform: std::env::consts::OS.to_string(),
    }
}

#[tauri::command]
pub async fn connect_hysteria(
    app_handle: AppHandle,
    state: tauri::State<'_, VpnState>,
    server_id: i32,
    domain: String,
    port: u16,
    password: String,
    mode: String,
    server_mtu: u16,
    server_dns: String,
) -> std::result::Result<String, String> {
    let current_status = state.get_status();
    if current_status == VpnStatusEnum::Connected {
        return Err(VpnError::AlreadyConnected.user_message());
    }
    if current_status == VpnStatusEnum::Connecting {
        return Err(VpnError::AlreadyConnecting.user_message());
    }

    info!("Pre-connection cleanup...");
    fast_cleanup_before_connect(&app_handle, &state);

    let config = ConnectConfig::new(domain, port, password, mode.clone(), server_mtu, server_dns);
    if let Err(e) = config.validate() {
        return Err(e.user_message());
    }

    state.set_user_disconnect(false);
    state.set_status(VpnStatusEnum::Connecting);
    emit_status_change(&app_handle, &state);
    state.set_server_id(Some(server_id));

    match do_connect(&app_handle, &state, &config).await {
        Ok(_) => {
            state.set_status(VpnStatusEnum::Connected);
            state.set_connected_at(
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs(),
            );
            state.set_current_mode(&mode);
            emit_status_change(&app_handle, &state);
            emit_log(&app_handle, "info", "VPN connected successfully");

            start_monitor(app_handle.clone(), &state);
            if mode == "tun" {
                start_process_watchdog(app_handle.clone(), &state);
            }

            Ok("Connected".to_string())
        }
        Err(e) => {
            error!("Connection failed: {}", e);
            fast_cleanup_connection(&app_handle, &state, false);
            let msg = e.user_message();
            emit_log(&app_handle, "error", &format!("Connection failed: {}", msg));
            Err(msg)
        }
    }
}

#[tauri::command]
pub fn restart_vpn_monitor(
    app_handle: AppHandle,
    state: tauri::State<'_, VpnState>,
) -> std::result::Result<String, String> {
    if state.get_status() != VpnStatusEnum::Connected {
        return Ok("Not connected".into());
    }
    if state.monitor_running.load(Ordering::SeqCst) {
        return Ok("Monitor running".into());
    }

    start_monitor(app_handle.clone(), &state);

    if state.get_current_mode() == "tun" {
        start_process_watchdog(app_handle.clone(), &state);
    }

    Ok("Monitor restarted".into())
}

#[tauri::command]
pub async fn disconnect_vpn(
    app_handle: AppHandle,
    state: tauri::State<'_, VpnState>,
) -> std::result::Result<String, String> {
    if state.get_status() == VpnStatusEnum::Disconnected {
        return Ok("Already disconnected".into());
    }

    state.set_user_disconnect(true);
    state.set_status(VpnStatusEnum::Disconnecting);
    emit_status_change(&app_handle, &state);

    fast_cleanup_connection(&app_handle, &state, true);

    emit_status_change(&app_handle, &state);
    emit_log(&app_handle, "info", "VPN disconnected");
    Ok("Disconnected".into())
}

// [修改] 将 app_handle 改为 _app_handle，避免未使用警告
fn fast_cleanup_before_connect(_app_handle: &AppHandle, state: &VpnState) {
    info!("=== Cleanup before connect ===");

    stop_watchdog(state);
    stop_monitor(state);
    set_system_socks_proxy(false);
    platform::force_cleanup();
    state.reset();

    std::thread::sleep(Duration::from_millis(500));

    if !is_port_free(constants::DEFAULT_SOCKS_PORT) {
        warn!(
            "Port {} still occupied after cleanup",
            constants::DEFAULT_SOCKS_PORT
        );
    }

    info!("=== Cleanup completed ===");
}

fn fast_cleanup_connection(app_handle: &AppHandle, state: &VpnState, is_user_action: bool) {
    info!("=== Cleaning up connection ===");

    stop_watchdog(state);
    stop_monitor(state);
    set_system_socks_proxy(false);

    let mode = state.get_current_mode();

    if mode == "tun" {
        info!("Stopping TUN mode...");
        if let Err(e) = platform::stop_singbox_tun_as_root() {
            warn!("TUN stop error: {}", e);
            platform::force_cleanup();
        }
    } else {
        info!("Stopping SOCKS mode...");
        if let Some(child) = state.take_child() {
            let _ = child.kill();
        }
        platform::force_cleanup();
    }

    state.reset();

    if !is_user_action {
        emit_status_change(app_handle, state);
    }
}

fn is_port_free(port: u16) -> bool {
    TcpStream::connect_timeout(
        &format!("127.0.0.1:{}", port).parse().unwrap(),
        Duration::from_millis(constants::PORT_CHECK_TIMEOUT_MS),
    )
    .is_err()
}

fn wait_for_port_ready(port: u16, timeout_ms: u64) -> bool {
    let start = Instant::now();
    let timeout = Duration::from_millis(timeout_ms);

    while start.elapsed() < timeout {
        if TcpStream::connect_timeout(
            &format!("127.0.0.1:{}", port).parse().unwrap(),
            Duration::from_millis(100),
        )
        .is_ok()
        {
            info!("Port {} is ready", port);
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }

    warn!("Port {} not ready after {}ms", port, timeout_ms);
    false
}

fn verify_socks_proxy_working(port: u16) -> bool {
    use std::io::{Read, Write};

    if let Ok(mut stream) = TcpStream::connect(format!("127.0.0.1:{}", port)) {
        stream
            .set_read_timeout(Some(Duration::from_millis(500)))
            .ok();
        stream
            .set_write_timeout(Some(Duration::from_millis(500)))
            .ok();

        let handshake = [0x05, 0x01, 0x00];
        if stream.write_all(&handshake).is_ok() {
            let mut response = [0u8; 2];
            if stream.read_exact(&mut response).is_ok() {
                return response[0] == 0x05 && response[1] == 0x00;
            }
        }
    }
    false
}

async fn do_connect(
    app_handle: &AppHandle,
    state: &VpnState,
    config: &ConnectConfig,
) -> Result<()> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| VpnError::Io(e.to_string()))?;
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)?;
    }

    let config_filename = if config.mode == "tun" {
        "config-tun.json"
    } else {
        "config-socks.json"
    };
    let mut config_path = app_dir.join(config_filename);

    let cache_filename = if config.mode == "tun" {
        "cache-tun.db"
    } else {
        "cache-socks.db"
    };
    let cache_path = app_dir.join(cache_filename);

    let bind_interface = if config.mode == "tun" {
        platform::detect_default_interface()
    } else {
        None
    };

    info!(
        "Generating config - mode: {}, interface detected: {:?}",
        config.mode, bind_interface
    );

    let config_content = super::singbox::generate_config(config, &cache_path)?;

    let config_json = serde_json::to_string_pretty(&config_content)
        .map_err(|e| VpnError::Config(format!("Serialize failed: {}", e)))?;

    if fs::write(&config_path, &config_json).is_err() {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        config_path = app_dir.join(format!("config-{}-{}.json", config.mode, ts));
        fs::write(&config_path, &config_json)?;
    }

    let signature = security::sign_content(&config_json);
    let sig_path = config_path.with_extension("json.sig");
    fs::write(&sig_path, signature)?;
    security::set_secure_permissions(&config_path);
    security::set_secure_permissions(&sig_path);

    if !security::verify_config(&config_path, &sig_path) {
        return Err(VpnError::Config("Security check failed".into()));
    }

    let config_path_str = config_path
        .to_str()
        .ok_or(VpnError::Config("Invalid path".into()))?
        .to_string();

    // === TUN 模式 ===
    if config.mode == "tun" {
        info!("Starting TUN mode...");

        set_system_socks_proxy(false);
        state.set_current_mode("tun");

        platform::run_singbox_tun_as_root(&config_path_str, "/tmp/tovpn-tun.log")
            .map_err(VpnError::Connection)?;

        return Ok(());
    }

    // === SOCKS 模式 ===
    info!("Starting SOCKS mode...");
    // 端口分离后，不再需要等待 API 端口 9090

    state.set_current_mode("socks");

    let sidecar = app_handle
        .shell()
        .sidecar("sing-box")
        .map_err(|e| VpnError::Config(format!("Sidecar error: {}", e)))?;

    let (mut rx, child) = sidecar
        .args(["run", "-c", &config_path_str])
        .spawn()
        .map_err(|e| VpnError::Connection(format!("Spawn error: {}", e)))?;

    state.set_child(child);

    info!("Waiting for SOCKS port...");
    if !wait_for_port_ready(constants::DEFAULT_SOCKS_PORT, 8000) {
        error!("SOCKS port not ready");
        if let Some(child) = state.take_child() {
            let _ = child.kill();
        }
        return Err(VpnError::Connection("SOCKS port not ready".to_string()));
    }

    info!("Verifying SOCKS proxy...");
    std::thread::sleep(Duration::from_millis(200));
    if !verify_socks_proxy_working(constants::DEFAULT_SOCKS_PORT) {
        warn!("SOCKS proxy verification failed, but process seems running");
    }

    set_system_socks_proxy(true);

    let user_disconnect = state.get_user_disconnect_flag();
    let app = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        let mut has_fatal = false;
        let mut fatal_msg = String::new();

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                    let line = String::from_utf8_lossy(&bytes);
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    let (level, msg) = parse_log_level(trimmed);
                    if !msg.is_empty() && level != "debug" {
                        emit_log(&app, level, &msg);
                    }
                    if is_fatal_error(trimmed) {
                        has_fatal = true;
                        fatal_msg = msg;
                    }
                }
                CommandEvent::Terminated(payload) => {
                    if !user_disconnect.load(Ordering::SeqCst) {
                        if has_fatal {
                            let _ = app.emit(
                                "vpn-connection-error",
                                json!({ "error": fatal_msg, "fatal": true }),
                            );
                        }
                        fast_cleanup_connection(&app, app.state::<VpnState>().inner(), false);
                        let _ = app.emit(
                            "vpn-process-terminated",
                            json!({
                                "reason": if has_fatal { "fatal" } else { "exit" },
                                "exit_code": payload.code
                            }),
                        );
                    }
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}
