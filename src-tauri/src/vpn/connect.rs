// src-tauri/src/vpn/connect.rs
//! VPN 连接核心模块 (修复：错误传播与逻辑阻断)

use std::fs;
use std::sync::atomic::Ordering;
use std::time::{SystemTime, UNIX_EPOCH, Duration};
use std::net::TcpStream;

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tracing::info;

use crate::error::{Result, VpnError};
use super::config::ConnectConfig;
use super::monitor::{emit_log, emit_status_change, start_monitor, start_process_watchdog, stop_monitor};
use super::platform;
use super::proxy::set_system_socks_proxy;
use super::singbox::{is_fatal_error, parse_log_level};
use super::state::{VpnState, VpnStatusEnum};
use super::security; 

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
    if current_status == VpnStatusEnum::Connected { return Err(VpnError::AlreadyConnected.user_message()); }
    if current_status == VpnStatusEnum::Connecting { return Err(VpnError::AlreadyConnecting.user_message()); }

    let config = ConnectConfig::new(domain, port, password, mode.clone(), server_mtu, server_dns);
    if let Err(e) = config.validate() { return Err(e.user_message()); }

    state.set_user_disconnect(false);
    state.set_status(VpnStatusEnum::Connecting);
    emit_status_change(&app_handle, &state);
    state.set_server_id(Some(server_id));

    match do_connect(&app_handle, &state, &config).await {
        Ok(_) => {
            state.set_status(VpnStatusEnum::Connected);
            state.set_connected_at(SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs());
            state.set_current_mode(&mode);
            emit_status_change(&app_handle, &state);
            emit_log(&app_handle, "info", "VPN connected successfully");
            start_monitor(app_handle.clone(), &state);
            if mode == "tun" { start_process_watchdog(app_handle.clone(), &state); }
            Ok("Connected".to_string())
        }
        Err(e) => {
            cleanup_connection(&app_handle, &state, false);
            let msg = e.user_message();
            emit_log(&app_handle, "error", &format!("Connection failed: {}", msg));
            Err(msg)
        }
    }
}

#[tauri::command]
pub fn restart_vpn_monitor(app_handle: AppHandle, state: tauri::State<'_, VpnState>) -> std::result::Result<String, String> {
    if state.get_status() != VpnStatusEnum::Connected { return Ok("Not connected".into()); }
    if state.monitor_running.load(Ordering::SeqCst) { return Ok("Monitor running".into()); }
    start_monitor(app_handle.clone(), &state);
    if state.get_current_mode() == "tun" { start_process_watchdog(app_handle.clone(), &state); }
    Ok("Monitor restarted".into())
}

#[tauri::command]
pub async fn disconnect_vpn(app_handle: AppHandle, state: tauri::State<'_, VpnState>) -> std::result::Result<String, String> {
    if state.get_status() == VpnStatusEnum::Disconnected { return Ok("Already disconnected".into()); }
    state.set_user_disconnect(true);
    state.set_status(VpnStatusEnum::Disconnecting);
    emit_status_change(&app_handle, &state);
    
    // 清理连接
    cleanup_connection(&app_handle, &state, true);
    
    emit_status_change(&app_handle, &state);
    emit_log(&app_handle, "info", "VPN disconnected");
    Ok("Disconnected".into())
}

fn cleanup_connection(app_handle: &AppHandle, state: &VpnState, is_user_action: bool) {
    stop_monitor(state);
    let mode = state.get_current_mode();

    if mode == "tun" {
        match platform::stop_singbox_tun_as_root() {
            Ok(_) => {
                emit_log(app_handle, "info", "TUN stopped and routes cleaned");
            }
            Err(e) => {
                emit_log(app_handle, "error", &format!("Failed to stop TUN gracefully: {}", e));
            }
        }
    } else if mode == "socks" {
        set_system_socks_proxy(false);
        if let Some(child) = state.take_child() {
            let _ = child.kill();
        }
    }

    state.reset();
    if !is_user_action {
        emit_status_change(app_handle, state);
    }
}

async fn do_connect(app_handle: &AppHandle, state: &VpnState, config: &ConnectConfig) -> Result<()> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| VpnError::Io(e.to_string()))?;
    if !app_dir.exists() { fs::create_dir_all(&app_dir)?; }

    let config_filename = if config.mode == "tun" { "config-tun.json" } else { "config-socks.json" };
    let mut config_path = app_dir.join(config_filename);
    let cache_path = app_dir.join("cache.db");

    let config_content = super::singbox::generate_config(config, &cache_path)?;
    let config_json = serde_json::to_string_pretty(&config_content)
        .map_err(|e| VpnError::Config(format!("Failed to serialize config: {}", e)))?;

    // 写入配置（带回退机制）
    if let Err(_) = fs::write(&config_path, &config_json) {
        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
        let fallback_name = format!("{}-{}.json", config_filename.replace(".json", ""), timestamp);
        config_path = app_dir.join(fallback_name);
        info!("Default config locked, writing to fallback: {:?}", config_path);
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

    let config_path_str = config_path.to_str().ok_or(VpnError::Config("Invalid path".into()))?.to_string();

    // === TUN 模式启动流程 ===
    if config.mode == "tun" {
        if platform::is_singbox_running() {
            info!("Detected existing sing-box process, cleaning up before connect");
            // 关键修复：如果停止失败（用户取消），直接报错返回，不继续
            platform::stop_singbox_tun_as_root().map_err(|e| VpnError::Connection(format!("Failed to stop previous VPN: {}", e)))?;
            std::thread::sleep(Duration::from_millis(500));
        }
        
        state.set_current_mode("tun");
        platform::run_singbox_tun_as_root(&config_path_str, "/tmp/tovpn-tun.log").map_err(VpnError::Connection)?;
        return Ok(());
    }

    // === SOCKS 模式启动流程 ===
    if platform::is_singbox_running() {
         info!("Cleaning up previous process before starting SOCKS mode");
         state.set_user_disconnect(true);
         // 关键修复：如果这是从 TUN 切 SOCKS，必须确保 TUN 停止成功
         // 如果用户取消了授权，这里会报错，整个连接流程终止
         if let Err(e) = platform::stop_singbox_tun_as_root() {
             state.set_user_disconnect(false);
             return Err(VpnError::Connection(format!("Cannot switch mode: Failed to stop previous VPN: {}", e)));
         }
         std::thread::sleep(Duration::from_millis(500));
         state.set_user_disconnect(false);
    }

    state.set_current_mode("socks");
    let sidecar = app_handle.shell().sidecar("sing-box").map_err(|e| VpnError::Config(format!("Sidecar error: {}", e)))?;
    let (mut rx, child) = sidecar.args(["run", "-c", &config_path_str]).spawn().map_err(|e| VpnError::Connection(format!("Spawn error: {}", e)))?;
    state.set_child(child);

    // 等待端口就绪
    let mut port_ready = false;
    for _ in 0..25 {
        if TcpStream::connect_timeout(&"127.0.0.1:1080".parse().unwrap(), Duration::from_millis(200)).is_ok() {
            port_ready = true; break;
        }
        std::thread::sleep(Duration::from_millis(200));
    }

    if port_ready { set_system_socks_proxy(true); } 
    else {
        if let Some(child) = state.take_child() { let _ = child.kill(); }
        return Err(VpnError::Connection("SOCKS sidecar failed to start in time".to_string()));
    }

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
                    if trimmed.is_empty() { continue; }
                    let (level, msg) = parse_log_level(trimmed);
                    if !msg.is_empty() && level != "debug" { emit_log(&app, level, &msg); }
                    if is_fatal_error(trimmed) { has_fatal = true; fatal_msg = msg; }
                }
                CommandEvent::Terminated(payload) => {
                    if !user_disconnect.load(Ordering::SeqCst) {
                        if has_fatal { let _ = app.emit("vpn-connection-error", json!({ "error": fatal_msg, "fatal": true })); }
                        cleanup_connection(&app, app.state::<VpnState>().inner(), false);
                        let _ = app.emit("vpn-process-terminated", json!({ "reason": if has_fatal { "fatal" } else { "exit" }, "exit_code": payload.code }));
                    }
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}
