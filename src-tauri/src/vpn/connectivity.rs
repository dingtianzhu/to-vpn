//! 网络连通性测试模块

use serde::Serialize;
use std::time::Duration;
use tracing::{info, warn};

/// 连通性测试结果
#[derive(Debug, Clone, Serialize)]
pub struct ConnectivityResult {
    pub success: bool,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,
    pub test_url: String,
}

/// 测试外网连通性
///
/// TUN 模式：直接测试（流量自动通过 TUN 接口）
/// SOCKS 模式：通过 SOCKS 代理测试
#[tauri::command]
pub async fn test_connectivity(
    state: tauri::State<'_, crate::vpn::state::VpnState>,
    use_proxy: bool,
) -> Result<ConnectivityResult, String> {
    let test_url = "http://www.gstatic.com/generate_204";
    let socks_port = state.socks_port.load(std::sync::atomic::Ordering::SeqCst);

    info!(use_proxy = use_proxy, "Testing connectivity");

    let client_result = if use_proxy {
        let proxy = match reqwest::Proxy::all(format!("socks5://127.0.0.1:{}", socks_port))
        {
            Ok(p) => p,
            Err(e) => {
                return Ok(ConnectivityResult {
                    success: false,
                    latency_ms: None,
                    error: Some(format!("Invalid proxy config: {}", e)),
                    test_url: test_url.to_string(),
                });
            }
        };

        reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .proxy(proxy)
            .build()
    } else {
        // TUN 模式：直接测试，让系统路由决定流量走向
        reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
    };

    let client = match client_result {
        Ok(c) => c,
        Err(e) => {
            warn!("Failed to create HTTP client: {}", e);
            return Ok(ConnectivityResult {
                success: false,
                latency_ms: None,
                error: Some(format!("Failed to create client: {}", e)),
                test_url: test_url.to_string(),
            });
        }
    };

    let start = std::time::Instant::now();

    match client.get(test_url).send().await {
        Ok(response) => {
            let latency = start.elapsed().as_millis() as u64;
            let status = response.status();

            // 204 No Content 或 200 OK 都表示成功
            if status.is_success() || status.as_u16() == 204 {
                info!(latency_ms = latency, "Connectivity test passed");
                Ok(ConnectivityResult {
                    success: true,
                    latency_ms: Some(latency),
                    error: None,
                    test_url: test_url.to_string(),
                })
            } else {
                warn!(status = %status, "Connectivity test failed with status");
                Ok(ConnectivityResult {
                    success: false,
                    latency_ms: Some(latency),
                    error: Some(format!("HTTP status: {}", status)),
                    test_url: test_url.to_string(),
                })
            }
        }
        Err(e) => {
            let latency = start.elapsed().as_millis() as u64;
            warn!(error = %e, "Connectivity test failed");
            Ok(ConnectivityResult {
                success: false,
                latency_ms: if latency > 0 { Some(latency) } else { None },
                error: Some(e.to_string()),
                test_url: test_url.to_string(),
            })
        }
    }
}

/// 获取公网 IP 地址
/// 
/// 通过 SOCKS 代理获取当前的公网 IP
/// **Feature: vpn-pure-mode**
#[tauri::command]
pub async fn get_public_ip(
    state: tauri::State<'_, crate::vpn::state::VpnState>,
    use_proxy: bool,
) -> Result<String, String> {
    // 使用多个 IP 查询服务作为备选
    let ip_services = [
        "https://api.ipify.org",
        "https://icanhazip.com",
        "https://ifconfig.me/ip",
    ];
    let socks_port = state.socks_port.load(std::sync::atomic::Ordering::SeqCst);

    let client_result = if use_proxy {
        let proxy = reqwest::Proxy::all(format!("socks5://127.0.0.1:{}", socks_port))
            .map_err(|e| format!("Invalid proxy config: {}", e))?;

        reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .proxy(proxy)
            .build()
    } else {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
    };

    let client = client_result.map_err(|e| format!("Failed to create client: {}", e))?;

    for url in ip_services {
        match client.get(url).send().await {
            Ok(response) => {
                if response.status().is_success() {
                    if let Ok(ip) = response.text().await {
                        let ip = ip.trim().to_string();
                        // 验证是否为有效 IP 格式
                        if ip.parse::<std::net::IpAddr>().is_ok() {
                            info!(ip = %ip, service = %url, "Got public IP");
                            return Ok(ip);
                        }
                    }
                }
            }
            Err(e) => {
                warn!(error = %e, service = %url, "Failed to get IP from service");
            }
        }
    }

    Err("Failed to get public IP from all services".to_string())
}

/// 测试 DNS 解析
#[tauri::command]
pub async fn test_dns_resolution(domain: String) -> ConnectivityResult {
    info!(domain = %domain, "Testing DNS resolution");

    let start = std::time::Instant::now();

    match tokio::net::lookup_host(format!("{}:80", domain)).await {
        Ok(addrs) => {
            let latency = start.elapsed().as_millis() as u64;
            let addrs: Vec<_> = addrs.collect();

            if addrs.is_empty() {
                ConnectivityResult {
                    success: false,
                    latency_ms: Some(latency),
                    error: Some("No addresses resolved".to_string()),
                    test_url: domain,
                }
            } else {
                info!(latency_ms = latency, count = addrs.len(), "DNS resolution succeeded");
                ConnectivityResult {
                    success: true,
                    latency_ms: Some(latency),
                    error: None,
                    test_url: domain,
                }
            }
        }
        Err(e) => {
            let latency = start.elapsed().as_millis() as u64;
            warn!(error = %e, "DNS resolution failed");
            ConnectivityResult {
                success: false,
                latency_ms: Some(latency),
                error: Some(e.to_string()),
                test_url: domain,
            }
        }
    }
}