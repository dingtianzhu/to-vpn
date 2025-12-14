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
    pub monitor_running: Arc<AtomicBool>,
    /// 用户主动断开标志（使用 Arc 以便在线程间共享）
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
            user_disconnect: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn get_status(&self) -> VpnStatusEnum {
        self.status.lock().map(|s| *s).unwrap_or(VpnStatusEnum::Disconnected)
    }

    pub fn set_status(&self, new_status: VpnStatusEnum) {
        if let Ok(mut status) = self.status.lock() {
            *status = new_status;
        }
    }

    #[allow(dead_code)]
    pub fn is_connected(&self) -> bool {
        self.get_status() == VpnStatusEnum::Connected
    }

    #[allow(dead_code)]
    pub fn is_connecting(&self) -> bool {
        self.get_status() == VpnStatusEnum::Connecting
    }

    pub fn get_connected_at(&self) -> u64 {
        self.connected_at.load(Ordering::SeqCst)
    }

    pub fn set_connected_at(&self, timestamp: u64) {
        self.connected_at.store(timestamp, Ordering::SeqCst);
    }

    #[allow(dead_code)]
    pub fn is_monitor_running(&self) -> bool {
        self.monitor_running.load(Ordering::SeqCst)
    }

    #[allow(dead_code)]
    pub fn set_monitor_running(&self, running: bool) {
        self.monitor_running.store(running, Ordering::SeqCst);
    }

    #[allow(dead_code)]
    pub fn is_user_disconnect(&self) -> bool {
        self.user_disconnect.load(Ordering::SeqCst)
    }

    pub fn set_user_disconnect(&self, value: bool) {
        self.user_disconnect.store(value, Ordering::SeqCst);
    }

    /// 获取用户断开标志的 Arc 克隆（用于传递给其他线程）
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
        self.monitor_running.store(false, Ordering::SeqCst);
        // 不重置 user_disconnect
    }

    pub fn get_status_result(&self) -> VpnStatusResult {
        let status = self.get_status();
        let server_id = self.server_id.lock().ok().and_then(|s| *s);
        let connected_at = if status == VpnStatusEnum::Connected {
            Some(self.get_connected_at())
        } else {
            None
        };

        VpnStatusResult {
            status: status.as_str().to_string(),
            server_id,
            connected_at,
        }
    }

    /// 获取当前连接模式
    pub fn get_current_mode(&self) -> String {
        self.current_mode.lock().ok().map(|m| m.clone()).unwrap_or_default()
    }

    /// 设置当前连接模式
    pub fn set_current_mode(&self, mode: &str) {
        if let Ok(mut current_mode) = self.current_mode.lock() {
            *current_mode = mode.to_string();
        }
    }

    /// 设置服务器 ID
    pub fn set_server_id(&self, id: Option<i32>) {
        if let Ok(mut server_id) = self.server_id.lock() {
            *server_id = id;
        }
    }

    /// 获取子进程
    pub fn take_child(&self) -> Option<CommandChild> {
        self.child.lock().ok().and_then(|mut c| c.take())
    }

    /// 设置子进程
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