use tauri::{AppHandle, Manager};
use tracing::debug;
use crate::constants::{SINGBOX_API_PORT_TUN, SINGBOX_API_PORT_SOCKS};
use crate::vpn::state::VpnState;

/// 测试延迟
/// 
/// 当 VPN 连接时，使用 sing-box API 获取真实延迟
/// 未连接时使用直接 TCP 连接测试
#[tauri::command]
pub async fn ping_server(app: AppHandle, host: String, port: u16) -> Result<i32, String> {
    // 获取 VPN 状态
    let state = app.state::<VpnState>();
    
    // 如果已连接，尝试通过 API 获取延迟
    if state.is_connected() {
        // 根据当前模式选择对应的 API 端口
        let api_port = if state.get_current_mode() == "tun" {
            SINGBOX_API_PORT_TUN
        } else {
            SINGBOX_API_PORT_SOCKS
        };

        if let Some(latency) = get_latency_via_api(api_port).await {
            return Ok(latency);
        }
    }

    // 备用方案：直接 TCP 连接测试（VPN 未连接时，或 API 获取失败时）
    let addr_str = format!("{}:{}", host, port);
    let start = std::time::Instant::now();
    
    match tokio::net::TcpStream::connect(&addr_str).await {
        Ok(_) => {
            let duration = start.elapsed();
            Ok(duration.as_millis() as i32)
        }
        Err(e) => {
            debug!("Ping failed for {}: {}", addr_str, e);
            // 连接失败返回 -1 或 9999 表示超时
            Ok(9999)
        }
    }
}

/// 通过 sing-box API 获取延迟
async fn get_latency_via_api(port: u16) -> Option<i32> {
    let url = format!(
        "http://127.0.0.1:{}/proxies/proxy/delay?timeout=5000&url=http://www.gstatic.com/generate_204",
        port
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .ok()?;

    let response = client.get(&url).send().await.ok()?;
    
    if !response.status().is_success() {
        return None;
    }

    // 响应格式: {"delay": 100}
    let json: serde_json::Value = response.json().await.ok()?;
    let delay = json.get("delay")?.as_i64()?;
    
    Some(delay as i32)
}