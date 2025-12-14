use tracing::debug;
use crate::constants::SINGBOX_API_PORT;

/// 测试延迟
/// 
/// 当 VPN 连接时，使用 sing-box API 获取真实延迟
/// 未连接时使用直接 TCP 连接测试
#[tauri::command]
pub async fn ping_server(host: String, port: u16) -> Result<i32, String> {
    // 首先尝试通过 sing-box API 获取延迟（VPN 连接时有效）
    if let Some(latency) = get_latency_via_api().await {
        return Ok(latency);
    }

    // 备用方案：直接 TCP 连接测试（VPN 未连接时）
    let addr_str = format!("{}:{}", host, port);
    let start = std::time::Instant::now();
    
    match tokio::net::TcpStream::connect(&addr_str).await {
        Ok(_) => {
            let duration = start.elapsed();
            Ok(duration.as_millis() as i32)
        }
        Err(e) => {
            debug!("Ping failed for {}: {}", addr_str, e);
            Ok(999)
        }
    }
}

/// 通过 sing-box API 获取延迟
async fn get_latency_via_api() -> Option<i32> {
    let url = format!(
        "http://127.0.0.1:{}/proxies/proxy/delay?timeout=5000&url=http://www.gstatic.com/generate_204",
        SINGBOX_API_PORT
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
