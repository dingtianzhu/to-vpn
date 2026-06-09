use std::net::{TcpStream, ToSocketAddrs, UdpSocket};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use serde::Serialize;
use tracing::{debug, info};
use std::process::Command;

use crate::constants::DEFAULT_SOCKS_PORT;

/// Ping 结果
#[derive(Clone, Serialize)]
pub struct PingResult {
    pub node_id: i32,
    pub latency_ms: i32,  // -1 表示超时或失败
    pub status: String,   // "online" | "offline" | "slow"
}

/// ICMP Ping（使用系统 ping 命令）
/// 这是最可靠的方式，因为 Hysteria2 使用 UDP/QUIC 协议
fn icmp_ping(host: &str, timeout_ms: u64) -> i32 {
    let timeout_sec = (timeout_ms / 1000).max(1);
    
    #[cfg(target_os = "macos")]
    let output = Command::new("ping")
        .args(["-c", "1", "-t", &timeout_sec.to_string(), host])
        .output();
    
    #[cfg(target_os = "linux")]
    let output = Command::new("ping")
        .args(["-c", "1", "-W", &timeout_sec.to_string(), host])
        .output();
    
    #[cfg(target_os = "windows")]
    let output = {
        let mut cmd = Command::new("ping");
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        cmd.args(["-n", "1", "-w", &(timeout_ms).to_string(), host]).output()
    };
    
    match output {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            // 解析延迟值
            // macOS/Linux: "time=XX.X ms" 或 "time=XX ms"
            // Windows: "time=XXms" 或 "时间=XXms"
            if let Some(time_pos) = stdout.find("time=").or_else(|| stdout.find("时间=")) {
                let after_time = &stdout[time_pos + 5..];
                let ms_str: String = after_time
                    .chars()
                    .take_while(|c| c.is_ascii_digit() || *c == '.')
                    .collect();
                if let Ok(ms) = ms_str.parse::<f64>() {
                    return ms.round() as i32;
                }
            }
            // 如果解析失败但 ping 成功，返回一个默认值
            50
        }
        _ => -1,
    }
}

/// UDP 探测（备用方案）
/// 发送一个 UDP 包并等待响应或超时
#[allow(dead_code)]
fn udp_probe(host: &str, port: u16, timeout_ms: u64) -> i32 {
    let addr = format!("{}:{}", host, port);
    
    let socket_addrs = match addr.to_socket_addrs() {
        Ok(addrs) => addrs.collect::<Vec<_>>(),
        Err(_) => return -1,
    };
    
    if socket_addrs.is_empty() {
        return -1;
    }
    
    let socket = match UdpSocket::bind("0.0.0.0:0") {
        Ok(s) => s,
        Err(_) => return -1,
    };
    
    if socket.set_read_timeout(Some(Duration::from_millis(timeout_ms))).is_err() {
        return -1;
    }
    
    let start = Instant::now();
    
    // 发送一个空包
    if socket.send_to(&[0u8; 1], &socket_addrs[0]).is_err() {
        return -1;
    }
    
    // 等待响应（可能收到 ICMP 不可达，也算响应）
    let mut buf = [0u8; 64];
    match socket.recv_from(&mut buf) {
        Ok(_) => start.elapsed().as_millis() as i32,
        Err(_) => {
            // UDP 超时不一定意味着服务器不可达
            // 返回发送时间作为估计值
            start.elapsed().as_millis() as i32
        }
    }
}

/// TCP Ping 单个地址（保留用于 HTTP 端口测试）
#[allow(dead_code)]
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
/// 使用 ICMP ping 测试服务器可达性和延迟
#[tauri::command]
pub async fn ping_nodes(
    app_handle: AppHandle,
    nodes: Vec<(i32, String, u16)>,  // (id, domain, port)
) -> Result<(), String> {
    info!(count = nodes.len(), "Starting batch ping (ICMP mode)");
    
    // 使用线程池并发测试
    let handles: Vec<_> = nodes.into_iter().map(|(id, domain, _port)| {
        let app = app_handle.clone();
        std::thread::spawn(move || {
            // 使用 ICMP ping 而不是 TCP，因为 Hysteria2 使用 UDP/QUIC
            let latency = icmp_ping(&domain, 3000);
            let status = get_status_from_latency(latency);
            
            debug!("Ping result: node={}, domain={}, latency={}ms, status={}", 
                   id, domain, latency, status);
            
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
/// 使用 ICMP ping
#[tauri::command]
pub fn ping_single_node(domain: String, _port: u16) -> i32 {
    icmp_ping(&domain, 3000)
}

/// 通过 SOCKS 代理测试节点延迟
/// 用于 VPN 已连接时测试服务器延迟
/// 注意：通过代理时使用 TCP 连接到 HTTP 端口（80）来测试
async fn tcp_ping_via_proxy(host: &str, timeout_ms: u64) -> i32 {
    use tokio::time::timeout;
    use tokio_socks::tcp::Socks5Stream;
    
    let proxy_addr = format!("127.0.0.1:{}", DEFAULT_SOCKS_PORT);
    // 通过代理连接到目标服务器的 HTTP 端口来测试延迟
    let target_addr = format!("{}:80", host);
    
    let start = Instant::now();
    
    let connect_future = async {
        Socks5Stream::connect(proxy_addr.as_str(), target_addr.as_str()).await
    };
    
    match timeout(Duration::from_millis(timeout_ms), connect_future).await {
        Ok(Ok(_)) => start.elapsed().as_millis() as i32,
        Ok(Err(e)) => {
            debug!("Proxy ping failed for {}: {}", host, e);
            // 如果 80 端口失败，尝试 443
            let target_addr_443 = format!("{}:443", host);
            let start2 = Instant::now();
            let connect_future2 = async {
                Socks5Stream::connect(proxy_addr.as_str(), target_addr_443.as_str()).await
            };
            match timeout(Duration::from_millis(timeout_ms), connect_future2).await {
                Ok(Ok(_)) => start2.elapsed().as_millis() as i32,
                _ => -1,
            }
        }
        Err(_) => {
            debug!("Proxy ping timeout for {}", host);
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
    let handles: Vec<_> = nodes.into_iter().map(|(id, domain, _port)| {
        let app = app_handle.clone();
        tokio::spawn(async move {
            let latency = tcp_ping_via_proxy(&domain, 5000).await;
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
pub async fn ping_single_node_via_proxy(domain: String, _port: u16) -> i32 {
    tcp_ping_via_proxy(&domain, 5000).await
}