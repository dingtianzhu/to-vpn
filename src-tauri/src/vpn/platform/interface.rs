//! 网络接口检测模块
//! 
//! 提供跨平台的网络接口检测功能，用于动态获取活动网络接口名称。
//! 
//! **Feature: vpn-optimization**
//! **Validates: Requirements 1.1, 1.2, 6.1**

use serde::{Deserialize, Serialize};

/// 网络接口信息
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InterfaceInfo {
    /// 接口名称 (en0, en1, eth0, etc.)
    pub name: String,
    /// 接口类型 (wifi, ethernet, other)
    pub interface_type: InterfaceType,
    /// 是否活跃
    pub is_active: bool,
    /// IPv4 地址
    pub ipv4_address: Option<String>,
}

/// 网络接口类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum InterfaceType {
    Wifi,
    Ethernet,
    Other,
}

impl Default for InterfaceType {
    fn default() -> Self {
        InterfaceType::Other
    }
}

/// 检测当前活动的网络接口
/// 
/// 返回当前用于默认路由的网络接口信息。
/// 如果检测失败，返回 None。
/// 
/// # Example
/// ```
/// let interface = detect_active_interface();
/// if let Some(info) = interface {
///     println!("Active interface: {}", info.name);
/// }
/// ```
#[cfg(target_os = "macos")]
pub fn detect_active_interface() -> Option<InterfaceInfo> {
    use std::process::Command;
    
    // 使用 route -n get default 获取默认路由接口
    let output = Command::new("/sbin/route")
        .args(["-n", "get", "default"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let interface_name = parse_interface_from_route_output(&stdout)?;
    
    // 获取接口详细信息
    let interface_type = detect_interface_type(&interface_name);
    let ipv4_address = get_interface_ipv4(&interface_name);
    
    Some(InterfaceInfo {
        name: interface_name,
        interface_type,
        is_active: true,
        ipv4_address,
    })
}

#[cfg(target_os = "linux")]
pub fn detect_active_interface() -> Option<InterfaceInfo> {
    use std::process::Command;
    
    // 使用 ip route 获取默认路由接口
    let output = Command::new("ip")
        .args(["route", "show", "default"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let interface_name = parse_interface_from_ip_route(&stdout)?;
    
    let interface_type = detect_interface_type_linux(&interface_name);
    let ipv4_address = get_interface_ipv4_linux(&interface_name);
    
    Some(InterfaceInfo {
        name: interface_name,
        interface_type,
        is_active: true,
        ipv4_address,
    })
}

#[cfg(target_os = "windows")]
pub fn detect_active_interface() -> Option<InterfaceInfo> {
    // Windows 不需要 bind_interface，返回 None
    // sing-box 在 Windows 上使用 auto_detect_interface
    None
}

/// 获取所有可用网络接口
#[cfg(target_os = "macos")]
#[allow(dead_code)]
pub fn list_all_interfaces() -> Vec<InterfaceInfo> {
    use std::process::Command;
    
    let output = match Command::new("/sbin/ifconfig")
        .args(["-l"])
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return Vec::new(),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let interface_names: Vec<&str> = stdout.split_whitespace().collect();
    
    interface_names
        .into_iter()
        .filter(|name| !name.starts_with("lo") && !name.starts_with("utun") && !name.starts_with("bridge"))
        .filter_map(|name| {
            let ipv4 = get_interface_ipv4(name);
            let is_active = ipv4.is_some();
            
            Some(InterfaceInfo {
                name: name.to_string(),
                interface_type: detect_interface_type(name),
                is_active,
                ipv4_address: ipv4,
            })
        })
        .collect()
}

#[cfg(target_os = "linux")]
#[allow(dead_code)]
pub fn list_all_interfaces() -> Vec<InterfaceInfo> {
    use std::process::Command;
    
    let output = match Command::new("ip")
        .args(["link", "show"])
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return Vec::new(),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut interfaces = Vec::new();
    
    for line in stdout.lines() {
        if let Some(name) = parse_interface_name_from_ip_link(line) {
            if name != "lo" && !name.starts_with("tun") && !name.starts_with("docker") {
                let ipv4 = get_interface_ipv4_linux(&name);
                let is_active = ipv4.is_some();
                
                interfaces.push(InterfaceInfo {
                    name: name.clone(),
                    interface_type: detect_interface_type_linux(&name),
                    is_active,
                    ipv4_address: ipv4,
                });
            }
        }
    }
    
    interfaces
}

#[cfg(target_os = "windows")]
#[allow(dead_code)]
pub fn list_all_interfaces() -> Vec<InterfaceInfo> {
    // Windows 使用 auto_detect_interface，返回空列表
    Vec::new()
}

// ============ macOS Helper Functions ============

#[cfg(target_os = "macos")]
fn parse_interface_from_route_output(output: &str) -> Option<String> {
    for line in output.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("interface:") {
            return Some(rest.trim().to_string());
        }
    }
    None
}

#[cfg(target_os = "macos")]
fn detect_interface_type(name: &str) -> InterfaceType {
    // macOS 接口命名规则:
    // en0 通常是 Wi-Fi (在 MacBook 上)
    // en1, en2 等可能是以太网或其他接口
    // 但这不是绝对的，需要通过 networksetup 确认
    
    use std::process::Command;
    
    let output = Command::new("/usr/sbin/networksetup")
        .args(["-listallhardwareports"])
        .output();
    
    if let Ok(o) = output {
        if o.status.success() {
            let stdout = String::from_utf8_lossy(&o.stdout);
            let mut current_type = InterfaceType::Other;
            
            for line in stdout.lines() {
                let line = line.trim();
                if line.starts_with("Hardware Port:") {
                    let port_name = line.strip_prefix("Hardware Port:").unwrap_or("").trim().to_lowercase();
                    if port_name.contains("wi-fi") || port_name.contains("wifi") || port_name.contains("airport") {
                        current_type = InterfaceType::Wifi;
                    } else if port_name.contains("ethernet") || port_name.contains("thunderbolt") {
                        current_type = InterfaceType::Ethernet;
                    } else {
                        current_type = InterfaceType::Other;
                    }
                } else if line.starts_with("Device:") {
                    let device = line.strip_prefix("Device:").unwrap_or("").trim();
                    if device == name {
                        return current_type;
                    }
                }
            }
        }
    }
    
    // 回退到基于名称的猜测
    if name.starts_with("en") {
        InterfaceType::Ethernet // 默认假设为以太网
    } else {
        InterfaceType::Other
    }
}

#[cfg(target_os = "macos")]
fn get_interface_ipv4(name: &str) -> Option<String> {
    use std::process::Command;
    
    let output = Command::new("/sbin/ifconfig")
        .arg(name)
        .output()
        .ok()?;
    
    if !output.status.success() {
        return None;
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let line = line.trim();
        if line.starts_with("inet ") {
            // 格式: inet 192.168.1.100 netmask 0xffffff00 broadcast 192.168.1.255
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                return Some(parts[1].to_string());
            }
        }
    }
    None
}

// ============ Linux Helper Functions ============

#[cfg(target_os = "linux")]
fn parse_interface_from_ip_route(output: &str) -> Option<String> {
    // 格式: default via 192.168.1.1 dev eth0 proto dhcp metric 100
    for line in output.lines() {
        if line.starts_with("default") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(dev_idx) = parts.iter().position(|&p| p == "dev") {
                if dev_idx + 1 < parts.len() {
                    return Some(parts[dev_idx + 1].to_string());
                }
            }
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn detect_interface_type_linux(name: &str) -> InterfaceType {
    if name.starts_with("wl") || name.starts_with("wlan") {
        InterfaceType::Wifi
    } else if name.starts_with("eth") || name.starts_with("en") {
        InterfaceType::Ethernet
    } else {
        InterfaceType::Other
    }
}

#[cfg(target_os = "linux")]
fn get_interface_ipv4_linux(name: &str) -> Option<String> {
    use std::process::Command;
    
    let output = Command::new("ip")
        .args(["addr", "show", name])
        .output()
        .ok()?;
    
    if !output.status.success() {
        return None;
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let line = line.trim();
        if line.starts_with("inet ") {
            // 格式: inet 192.168.1.100/24 brd 192.168.1.255 scope global dynamic eth0
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                // 移除 CIDR 后缀
                let ip = parts[1].split('/').next()?;
                return Some(ip.to_string());
            }
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn parse_interface_name_from_ip_link(line: &str) -> Option<String> {
    // 格式: 2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 ...
    if line.contains(": <") {
        let parts: Vec<&str> = line.split(':').collect();
        if parts.len() >= 2 {
            return Some(parts[1].trim().to_string());
        }
    }
    None
}

// ============ Tests ============

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interface_type_default() {
        assert_eq!(InterfaceType::default(), InterfaceType::Other);
    }

    #[test]
    fn test_interface_info_clone() {
        let info = InterfaceInfo {
            name: "en0".to_string(),
            interface_type: InterfaceType::Wifi,
            is_active: true,
            ipv4_address: Some("192.168.1.100".to_string()),
        };
        let cloned = info.clone();
        assert_eq!(info, cloned);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn test_parse_interface_from_route_output() {
        let output = r#"
   route to: default
destination: default
       mask: default
    gateway: 192.168.1.1
  interface: en0
      flags: <UP,GATEWAY,DONE,STATIC,PRCLONING,GLOBAL>
 recvpipe  sendpipe  ssthresh  rtt,msec    rttvar  hopcount      mtu     expire
       0         0         0         0         0         0      1500         0
"#;
        let result = parse_interface_from_route_output(output);
        assert_eq!(result, Some("en0".to_string()));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn test_parse_interface_from_route_output_empty() {
        let output = "";
        let result = parse_interface_from_route_output(output);
        assert_eq!(result, None);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn test_parse_interface_from_ip_route() {
        let output = "default via 192.168.1.1 dev eth0 proto dhcp metric 100";
        let result = parse_interface_from_ip_route(output);
        assert_eq!(result, Some("eth0".to_string()));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn test_detect_interface_type_linux() {
        assert_eq!(detect_interface_type_linux("wlan0"), InterfaceType::Wifi);
        assert_eq!(detect_interface_type_linux("wlp2s0"), InterfaceType::Wifi);
        assert_eq!(detect_interface_type_linux("eth0"), InterfaceType::Ethernet);
        assert_eq!(detect_interface_type_linux("enp0s3"), InterfaceType::Ethernet);
        assert_eq!(detect_interface_type_linux("virbr0"), InterfaceType::Other);
    }
}
