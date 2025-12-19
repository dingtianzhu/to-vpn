//! VPN 状态管理模块

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri_plugin_shell::process::CommandChild;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum VpnStatusEnum {
    Disconnected,
    Connecting,
    Connected,
    Disconnecting,
}

impl VpnStatusEnum {
    pub fn as_str(&self) -> &'static str {
        match self {
            VpnStatusEnum::Disconnected => "disconnected",
            VpnStatusEnum::Connecting => "connecting",
            VpnStatusEnum::Connected => "connected",
            VpnStatusEnum::Disconnecting => "disconnecting",
        }
    }
}

#[derive(Serialize, Clone)]
pub struct VpnStatusResult {
    pub status: String,
    pub server_id: Option<i32>,
    pub connected_at: Option<u64>,
    pub mode: String,
}

#[derive(Serialize, Clone, Default)]
pub struct TrafficStats {
    pub download_bytes: u64,
    pub upload_bytes: u64,
    pub download_speed: u64,
    pub upload_speed: u64,
}

#[derive(Serialize, Clone)]
pub struct LatencyStats {
    pub latency_ms: u32,
}

pub struct VpnState {
    pub child: Mutex<Option<CommandChild>>,
    pub status: Mutex<VpnStatusEnum>,
    pub server_id: Mutex<Option<i32>>,
    pub connected_at: AtomicU64,
    pub current_mode: Mutex<String>,

    /// 仅用于 traffic/latency monitor 线程
    pub monitor_running: Arc<AtomicBool>,

    /// 仅用于进程看门狗 watchdog 线程（与 monitor 解耦）
    pub watchdog_running: Arc<AtomicBool>,

    /// 用户主动断开标志（用于避免“正常断开”被当成崩溃）
    pub user_disconnect: Arc<AtomicBool>,
}

impl Default for VpnState {
    fn default() -> Self {
        Self::new()
    }
}

impl VpnState {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            status: Mutex::new(VpnStatusEnum::Disconnected),
            server_id: Mutex::new(None),
            connected_at: AtomicU64::new(0),
            current_mode: Mutex::new(String::new()),
            monitor_running: Arc::new(AtomicBool::new(false)),
            watchdog_running: Arc::new(AtomicBool::new(false)),
            user_disconnect: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn get_status(&self) -> VpnStatusEnum {
        self.status
            .lock()
            .map(|s| *s)
            .unwrap_or(VpnStatusEnum::Disconnected)
    }

    pub fn set_status(&self, new_status: VpnStatusEnum) {
        if let Ok(mut status) = self.status.lock() {
            *status = new_status;
        }
    }

    pub fn is_connected(&self) -> bool {
        self.get_status() == VpnStatusEnum::Connected
    }

    pub fn get_connected_at(&self) -> u64 {
        self.connected_at.load(Ordering::SeqCst)
    }

    pub fn set_connected_at(&self, timestamp: u64) {
        self.connected_at.store(timestamp, Ordering::SeqCst);
    }

    pub fn set_user_disconnect(&self, value: bool) {
        self.user_disconnect.store(value, Ordering::SeqCst);
    }

    pub fn get_user_disconnect_flag(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.user_disconnect)
    }

    pub fn reset(&self) {
        self.set_status(VpnStatusEnum::Disconnected);

        if let Ok(mut server_id) = self.server_id.lock() {
            *server_id = None;
        }

        self.connected_at.store(0, Ordering::SeqCst);

        if let Ok(mut mode) = self.current_mode.lock() {
            *mode = String::new();
        }

        // 注意：不要在这里重置 user_disconnect。
        // SOCKS 模式后台日志线程用它来判断 Terminated 是否为用户主动断开。
        self.monitor_running.store(false, Ordering::SeqCst);
        self.watchdog_running.store(false, Ordering::SeqCst);
    }

    pub fn get_status_result(&self) -> VpnStatusResult {
        let status = self.get_status();
        let server_id = self.server_id.lock().ok().and_then(|s| *s);

        let connected_at = if status == VpnStatusEnum::Connected {
            Some(self.get_connected_at())
        } else {
            None
        };

        let mode = self.get_current_mode();

        VpnStatusResult {
            status: status.as_str().to_string(),
            server_id,
            connected_at,
            mode,
        }
    }

    pub fn get_current_mode(&self) -> String {
        self.current_mode
            .lock()
            .ok()
            .map(|m| m.clone())
            .unwrap_or_default()
    }

    pub fn set_current_mode(&self, mode: &str) {
        if let Ok(mut current_mode) = self.current_mode.lock() {
            *current_mode = mode.to_string();
        }
    }

    pub fn set_server_id(&self, id: Option<i32>) {
        if let Ok(mut server_id) = self.server_id.lock() {
            *server_id = id;
        }
    }

    pub fn take_child(&self) -> Option<CommandChild> {
        self.child.lock().ok().and_then(|mut c| c.take())
    }

    pub fn set_child(&self, child: CommandChild) {
        if let Ok(mut c) = self.child.lock() {
            *c = Some(child);
        }
    }
}

#[tauri::command]
pub async fn check_vpn_status(
    state: tauri::State<'_, VpnState>,
) -> Result<VpnStatusResult, String> {
    Ok(state.get_status_result())
}
