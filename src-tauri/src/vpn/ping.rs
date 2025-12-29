use std::net::{TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use serde::Serialize;
use tracing::{debug, info};

use crate::constants::DEFAULT_SOCKS_PORT;

/// Ping 结果
#[derive(Clone, Serialize)]
pub struct PingResult {
    pub node_id: i32,
    pub latency_ms: i32,  // -1 表示超时或失败
    pub status: String,   // "online" | "offline" | "slow"
}

/// TCP Ping 单个地址
fn tcp_ping(host: &str, port: u16, timeout_ms: u64) -> i32 {
    let addr = format!("{}:{}", host, port);
    
    let socket_addrs = match addr.to_socket_addrs() {
        Ok(addrs) => addrs.collect::<Vec<_>>(),
        Err(_) => return -1,
    };
    
    if socket_addrs.is_empty() {
        return -1;
    }
    
    let start = Instant::now();
    
    match TcpStream::connect_timeout(
        &socket_addrs[0],
        Duration::from_millis(timeout_ms)
    ) {
        Ok(_) => start.elapsed().as_millis() as i32,
        Err(_) => -1,
    }
}

/// 根据延迟判断状态
fn get_status_from_latency(latency: i32) -> &'static str {
    if latency < 0 {
        "offline"
    } else if latency < 200 {
        "online"
    } else if latency < 500 {
        "slow"
    } else {
        "offline"
    }
}

/// 批量测试节点延迟
#[tauri::command]
pub async fn ping_nodes(
    app_handle: AppHandle,
    nodes: Vec<(i32, String, u16)>,  // (id, domain, port)
) -> Result<(), String> {
    debug!(count = nodes.len(), "Starting batch ping");
    
    // 使用线程池并发测试
    let handles: Vec<_> = nodes.into_iter().map(|(id, domain, port)| {
        let app = app_handle.clone();
        std::thread::spawn(move || {
            let latency = tcp_ping(&domain, port, 5000);
            let status = get_status_from_latency(latency);
            
            let result = PingResult {
                node_id: id,
                latency_ms: latency,
                status: status.to_string(),
            };
            
            // 发送单个节点的结果
            let _ = app.emit("ping-result", result);
        })
    }).collect();
    
    // 等待所有测试完成
    for handle in handles {
        let _ = handle.join();
    }
    
    Ok(())
}

/// 测试单个节点延迟（同步返回）
#[tauri::command]
pub fn ping_single_node(domain: String, port: u16) -> i32 {
    tcp_ping(&domain, port, 5000)
}

/// 通过 SOCKS 代理测试节点延迟
/// 用于 VPN 已连接时测试服务器延迟
async fn tcp_ping_via_proxy(host: &str, port: u16, timeout_ms: u64) -> i32 {
    use tokio::time::timeout;
    use tokio_socks::tcp::Socks5Stream;
    
    let proxy_addr = format!("127.0.0.1:{}", DEFAULT_SOCKS_PORT);
    let target_addr = format!("{}:{}", host, port);
    
    let start = Instant::now();
    
    let connect_future = async {
        Socks5Stream::connect(proxy_addr.as_str(), target_addr.as_str()).await
    };
    
    match timeout(Duration::from_millis(timeout_ms), connect_future).await {
        Ok(Ok(_)) => start.elapsed().as_millis() as i32,
        Ok(Err(e)) => {
            debug!("Proxy ping failed for {}:{}: {}", host, port, e);
            -1
        }
        Err(_) => {
            debug!("Proxy ping timeout for {}:{}", host, port);
            -1
        }
    }
}

/// 批量测试节点延迟（通过代理）
/// 用于 VPN 已连接时测试服务器延迟
#[tauri::command]
pub async fn ping_nodes_via_proxy(
    app_handle: AppHandle,
    nodes: Vec<(i32, String, u16)>,  // (id, domain, port)
) -> Result<(), String> {
    info!(count = nodes.len(), "Starting batch ping via proxy");
    
    // 使用 tokio 并发测试
    let handles: Vec<_> = nodes.into_iter().map(|(id, domain, port)| {
        let app = app_handle.clone();
        tokio::spawn(async move {
            let latency = tcp_ping_via_proxy(&domain, port, 5000).await;
            let status = get_status_from_latency(latency);
            
            let result = PingResult {
                node_id: id,
                latency_ms: latency,
                status: status.to_string(),
            };
            
            // 发送单个节点的结果
            let _ = app.emit("ping-result", result);
        })
    }).collect();
    
    // 等待所有测试完成
    for handle in handles {
        let _ = handle.await;
    }
    
    Ok(())
}

/// 测试单个节点延迟（通过代理）
#[tauri::command]
pub async fn ping_single_node_via_proxy(domain: String, port: u16) -> i32 {
    tcp_ping_via_proxy(&domain, port, 5000).await
}