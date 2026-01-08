use tauri::{AppHandle, Manager};
use tracing::debug;
use crate::constants::{SINGBOX_API_PORT_TUN, SINGBOX_API_PORT_SOCKS};
use crate::vpn::state::VpnState;

/// 测试延迟
/// 
/// 当 VPN 连接时，使用 sing-box API 获取真实延迟
/// 未连接时返回 -1 表示无法测试（Hysteria2 使用 UDP，TCP 测试无效）
#[tauri::command]
pub async fn ping_server(app: AppHandle, host: String, port: u16) -> Result<i32, String> {
    // 获取 VPN 状态
    let state = app.state::<VpnState>();
    
    // 如果已连接，通过 API 获取延迟
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
        
        // API 调用失败，返回高延迟值表示连接可能有问题
        debug!("API latency check failed, returning high latency");
        return Ok(9999);
    }

    // VPN 未连接时，尝试 TCP 连接测试
    // 注意：Hysteria2 使用 UDP 协议，TCP 测试可能不准确
    // 但对于服务器可达性检测仍有参考价值
    let addr_str = format!("{}:{}", host, port);
    let start = std::time::Instant::now();
    
    // 使用较短的超时时间（3秒）
    let timeout = std::time::Duration::from_secs(3);
    
    match tokio::time::timeout(timeout, tokio::net::TcpStream::connect(&addr_str)).await {
        Ok(Ok(_)) => {
            let duration = start.elapsed();
            Ok(duration.as_millis() as i32)
        }
        Ok(Err(e)) => {
            debug!("TCP ping failed for {} (VPN not connected): {}", addr_str, e);
            // TCP 连接失败，但这对于 UDP 服务器是正常的
            // 返回 -1 表示无法通过 TCP 测试
            Ok(-1)
        }
        Err(_) => {
            debug!("TCP ping timeout for {} (VPN not connected)", addr_str);
            Ok(-1)
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