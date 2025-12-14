use std::process::Command;

/// 网络服务名称（macOS）
const DEFAULT_NETWORK_SERVICE: &str = "Wi-Fi";

/// 设置系统 SOCKS 代理
pub fn set_system_socks_proxy(enable: bool) {
    if !cfg!(target_os = "macos") {
        return;
    }

    // 动态获取当前网络服务名，找不到就用默认 "Wi‑Fi"
    let service_name =
        get_active_network_service().unwrap_or_else(|| DEFAULT_NETWORK_SERVICE.to_string());

    if enable {
        println!(">>> Enabling macOS System SOCKS Proxy (127.0.0.1:1080)...");

        // 设置 SOCKS 代理地址和端口
        let _ = Command::new("networksetup")
            .args(["-setsocksfirewallproxy", &service_name, "127.0.0.1", "1080"])
            .output();

        // 启用 SOCKS 代理
        let _ = Command::new("networksetup")
            .args(["-setsocksfirewallproxystate", &service_name, "on"])
            .output();
    } else {
        println!(">>> Disabling macOS System SOCKS Proxy...");

        // 禁用 SOCKS 代理
        let _ = Command::new("networksetup")
            .args(["-setsocksfirewallproxystate", &service_name, "off"])
            .output();
    }
}

/// 获取当前活动的网络服务名称
pub fn get_active_network_service() -> Option<String> {
    if !cfg!(target_os = "macos") {
        return None;
    }

    let output = Command::new("networksetup")
        .args(["-listallnetworkservices"])
        .output()
        .ok()?;

    let services = String::from_utf8_lossy(&output.stdout);

    // 优先 Wi‑Fi / Ethernet；否则返回第一个非禁用服务
    for line in services.lines().skip(1) {
        if line.starts_with('*') {
            continue; // 禁用服务
        }
        let name = line.trim();
        if name.contains("Wi-Fi") || name.contains("Ethernet") {
            return Some(name.to_string());
        }
    }
    // 如果没匹配到，退回第一个非禁用服务
    for line in services.lines().skip(1) {
        if !line.starts_with('*') {
            return Some(line.trim().to_string());
        }
    }

    None
}
