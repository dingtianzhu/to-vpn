//! VPN 连接核心模块
//! 版本：v2025-12-22-Final

use std::fs;
use std::net::TcpStream;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tracing::{error, info, warn};

use crate::constants::{self, get_cache_dir};
use crate::error::{Result, VpnError};

use super::config::{ConfigOptions, ConnectConfig, RouteMode, TunStack};
use super::monitor::{
    emit_log, emit_status_change, start_monitor, start_process_watchdog, stop_monitor,
    stop_watchdog,
};
use super::platform;
use super::security;
use super::singbox;
use super::singbox::{generate_config_with_ports, is_fatal_error, parse_log_level};
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

/// Tauri 命令：连接 VPN
/// 
/// **Feature: vpn-pure-mode**
/// **Validates: Requirements 1.5, 3.2, 3.3, 3.4, 4.2, 5.3, 6.2, 7.3, 8.2, 9.2**
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
    // 高级配置选项
    up_mbps: Option<u32>,
    down_mbps: Option<u32>,
    block_quic: Option<bool>,
    disable_ipv6: Option<bool>,
    // P0: 代理端口配置
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 1.5**
    socks_port: Option<u16>,
    http_port: Option<u16>,
    // P0: 路由模式
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 3.2, 3.3, 3.4**
    route_mode: Option<String>,
    // P1: DNS 泄漏防护
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 4.2**
    dns_leak_protection: Option<bool>,
    // P1: 自定义域名
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 5.3**
    custom_bypass_domains: Option<Vec<String>>,
    custom_proxy_domains: Option<Vec<String>>,
    // P2: WebRTC 阻断
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 6.2**
    block_webrtc: Option<bool>,
    // P2: 分应用代理
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 7.3**
    excluded_apps: Option<Vec<String>>,
    forced_proxy_apps: Option<Vec<String>>,
    // P3: TUN 网络栈
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 8.2**
    tun_stack: Option<String>,
    // 绕过局域网
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 9.2**
    bypass_lan: Option<bool>,
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

    // 创建高级配置选项
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 1.5, 3.2, 3.3, 3.4, 4.2, 5.3, 6.2, 7.3, 8.2, 9.2**
    let mut options = ConfigOptions::new(
        up_mbps.unwrap_or(200),
        down_mbps.unwrap_or(500),
        block_quic.unwrap_or(true),
        disable_ipv6.unwrap_or(true),
    );
    
    // P0: 路由模式
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 3.2, 3.3, 3.4**
    if let Some(rm) = route_mode {
        options.route_mode = RouteMode::from_str(&rm);
    }
    
    // P1: DNS 泄漏防护
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 4.2**
    options.dns_leak_protection = dns_leak_protection.unwrap_or(true);
    
    // P1: 自定义域名
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 5.3**
    if let Some(domains) = custom_bypass_domains {
        options.custom_bypass_domains = domains;
    }
    if let Some(domains) = custom_proxy_domains {
        options.custom_proxy_domains = domains;
    }
    
    // P2: WebRTC 阻断（默认启用）
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 6.2**
    options.block_webrtc = block_webrtc.unwrap_or(true);
    
    // P2: 分应用代理
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 7.3**
    if let Some(apps) = excluded_apps {
        options.excluded_apps = apps;
    }
    if let Some(apps) = forced_proxy_apps {
        options.forced_proxy_apps = apps;
    }
    
    // P3: TUN 网络栈
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 8.2**
    if let Some(stack) = tun_stack {
        options.tun_stack = TunStack::from_str(&stack);
    }
    
    // 绕过局域网
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 9.2**
    options.bypass_lan = bypass_lan.unwrap_or(true);
    
    if let Err(e) = options.validate() {
        return Err(e.user_message());
    }
    
    // P0: 代理端口配置
    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 1.5**
    let proxy_ports = singbox::ProxyPorts {
        socks_port: socks_port.unwrap_or(constants::DEFAULT_SOCKS_PORT),
        http_port: http_port.unwrap_or(constants::DEFAULT_HTTP_PORT),
    };

    state.set_user_disconnect(false);
    state.set_status(VpnStatusEnum::Connecting);
    emit_status_change(&app_handle, &state);
    state.set_server_id(Some(server_id));

    // 保存当前的端口号到全局状态
    let socks_port_u16 = socks_port.unwrap_or(constants::DEFAULT_SOCKS_PORT);
    let http_port_u16 = http_port.unwrap_or(constants::DEFAULT_HTTP_PORT);
    state.socks_port.store(socks_port_u16, Ordering::SeqCst);
    state.http_port.store(http_port_u16, Ordering::SeqCst);

    match do_connect(&app_handle, &state, &config, &options, &proxy_ports).await {
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

fn fast_cleanup_before_connect(_app_handle: &AppHandle, state: &VpnState) {
    info!("=== Cleanup before connect ===");

    stop_watchdog(state);
    stop_monitor(state);
    
    let prev_socks_port = state.socks_port.load(Ordering::SeqCst);
    let prev_http_port = state.http_port.load(Ordering::SeqCst);

    // **Feature: vpn-enhancement**
    // **Validates: Requirements 1.2, 1.4 - 同时清除 SOCKS 和 HTTP 代理**
    platform::set_system_proxy(false, prev_socks_port, prev_http_port);
    platform::force_cleanup();
    state.reset();

    std::thread::sleep(Duration::from_millis(500));

    if !is_port_free(prev_socks_port) {
        warn!(
            "Port {} still occupied after cleanup",
            prev_socks_port
        );
    }

    info!("=== Cleanup completed ===");
}

fn fast_cleanup_connection(app_handle: &AppHandle, state: &VpnState, is_user_action: bool) {
    info!("=== Cleaning up connection ===");

    stop_watchdog(state);
    stop_monitor(state);
    
    let current_socks_port = state.socks_port.load(Ordering::SeqCst);
    let current_http_port = state.http_port.load(Ordering::SeqCst);

    // **Feature: vpn-enhancement**
    // **Validates: Requirements 1.2, 1.4 - 同时清除 SOCKS 和 HTTP 代理**
    platform::set_system_proxy(false, current_socks_port, current_http_port);
    
    // 恢复系统网络状态（DNS、路由、IPv6）
    #[cfg(target_os = "macos")]
    platform::restore_network_state();

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
    options: &ConfigOptions,
    ports: &singbox::ProxyPorts,
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

    // **Feature: vpn-pure-mode**
    // **Validates: Requirements 1.5 - 使用配置的端口**
    let config_content = generate_config_with_ports(config, &cache_path, options, ports)?;

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

        // **Feature: vpn-enhancement**
        // **Validates: Requirements 1.2, 1.4 - TUN 模式不需要系统代理**
        platform::set_system_proxy(false, ports.socks_port, ports.http_port);
        
        // 根据用户设置禁用系统 IPv6 以防止泄漏
        #[cfg(target_os = "macos")]
        if options.disable_ipv6 {
            platform::set_system_ipv6(false);
        }
        
        state.set_current_mode("tun");

        let log_path = get_cache_dir()
            .join("tovpn-tun.log")
            .to_string_lossy()
            .to_string();

        platform::run_singbox_tun_as_root(&config_path_str, &log_path)
            .map_err(VpnError::Connection)?;

        return Ok(());
    }

    // === SOCKS 模式 ===
    info!("Starting SOCKS mode...");
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
    if !wait_for_port_ready(ports.socks_port, 8000) {
        error!("SOCKS port not ready");
        if let Some(child) = state.take_child() {
            let _ = child.kill();
        }
        return Err(VpnError::Connection("SOCKS port not ready".to_string()));
    }

    info!("Verifying SOCKS proxy...");
    std::thread::sleep(Duration::from_millis(200));
    if !verify_socks_proxy_working(ports.socks_port) {
        warn!("SOCKS proxy verification failed, but process seems running");
    }

    // **Feature: vpn-enhancement**
    // **Validates: Requirements 1.2, 1.4 - 同时设置 SOCKS 和 HTTP 代理**
    platform::set_system_proxy(true, ports.socks_port, ports.http_port);

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