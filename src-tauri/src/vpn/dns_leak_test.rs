//! DNS泄漏检测模块

use reqwest::Proxy;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{info, warn};

#[derive(Debug, Serialize, Deserialize)]
pub struct DnsLeakTestResult {
    pub leaked: bool,
    pub dns_servers: Vec<String>,
    pub isp: Option<String>,
    pub country: Option<String>,
}

/// 通过VPN代理检测DNS泄漏
#[tauri::command]
pub async fn check_dns_leak(use_proxy: bool) -> Result<DnsLeakTestResult, String> {
    info!("Starting DNS leak test (proxy: {})", use_proxy);

    let client = if use_proxy {
        let proxy = Proxy::all("socks5://127.0.0.1:1080")
            .map_err(|e| format!("Proxy error: {}", e))?;
        
        reqwest::Client::builder()
            .proxy(proxy)
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| format!("Client build error: {}", e))?
    } else {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| format!("Client build error: {}", e))?
    };

    // 使用DNSLeakTest.com的API
    let response = client
        .get("https://www.dnsleaktest.com/api/test")
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err("DNS leak test service unavailable".into());
    }

    let leak_data: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|e| format!("Parse error: {}", e))?;

    let dns_servers: Vec<String> = leak_data
        .iter()
        .filter_map(|entry| entry.get("ip").and_then(|v| v.as_str()).map(String::from))
        .collect();

    let isp = leak_data
        .first()
        .and_then(|e| e.get("isp"))
        .and_then(|v| v.as_str())
        .map(String::from);

    let country = leak_data
        .first()
        .and_then(|e| e.get("country_name"))
        .and_then(|v| v.as_str())
        .map(String::from);

    // 判断是否泄漏:如果检测到中国ISP的DNS则可能泄漏
    let leaked = country.as_deref() == Some("China") 
        || isp.as_ref().map_or(false, |s| s.contains("China") || s.contains("中国"));

    if leaked {
        warn!("⚠️ DNS leak detected! ISP: {:?}, Country: {:?}", isp, country);
    } else {
        info!("✅ No DNS leak detected");
    }

    Ok(DnsLeakTestResult {
        leaked,
        dns_servers,
        isp,
        country,
    })
}