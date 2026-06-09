use std::process::Command;

/// 网络服务名称（macOS）
const DEFAULT_NETWORK_SERVICE: &str = "Wi-Fi";

/// 设置系统 SOCKS 代理
pub fn set_system_socks_proxy(enable: bool, port: u16) {
    if !cfg!(target_os = "macos") {
        return;
    }

    // 动态获取当前网络服务名，找不到就用默认 "Wi‑Fi"
    let service_name =
        get_active_network_service().unwrap_or_else(|| DEFAULT_NETWORK_SERVICE.to_string());

    if enable {
        println!(">>> Enabling macOS System SOCKS Proxy (127.0.0.1:{})...", port);

        // 设置 SOCKS 代理地址和端口
        let _ = Command::new("/usr/bin/sudo")
            .args(["-n", "-k", "/usr/sbin/networksetup", "-setsocksfirewallproxy", &service_name, "127.0.0.1", &port.to_string()])
            .output();

        // 启用 SOCKS 代理
        let _ = Command::new("/usr/bin/sudo")
            .args(["-n", "-k", "/usr/sbin/networksetup", "-setsocksfirewallproxystate", &service_name, "on"])
            .output();
    } else {
        if is_proxy_enabled("socks", &service_name) {
            println!(">>> Disabling macOS System SOCKS Proxy...");

            // 禁用 SOCKS 代理
            let _ = Command::new("/usr/bin/sudo")
                .args(["-n", "-k", "/usr/sbin/networksetup", "-setsocksfirewallproxystate", &service_name, "off"])
                .output();
        }
    }
}

/// 设置系统 HTTP 代理
/// 
/// **Feature: vpn-enhancement**
/// **Validates: Requirements 1.2, 1.4 - 同时配置 SOCKS 和 HTTP 代理**
pub fn set_system_http_proxy(enable: bool, port: u16) {
    if !cfg!(target_os = "macos") {
        return;
    }

    // 动态获取当前网络服务名，找不到就用默认 "Wi‑Fi"
    let service_name =
        get_active_network_service().unwrap_or_else(|| DEFAULT_NETWORK_SERVICE.to_string());

    if enable {
        println!(">>> Enabling macOS System HTTP Proxy (127.0.0.1:{})...", port);

        // 设置 HTTP 代理地址和端口
        let _ = Command::new("/usr/bin/sudo")
            .args(["-n", "-k", "/usr/sbin/networksetup", "-setwebproxy", &service_name, "127.0.0.1", &port.to_string()])
            .output();

        // 启用 HTTP 代理
        let _ = Command::new("/usr/bin/sudo")
            .args(["-n", "-k", "/usr/sbin/networksetup", "-setwebproxystate", &service_name, "on"])
            .output();

        // 设置 HTTPS 代理地址和端口
        let _ = Command::new("/usr/bin/sudo")
            .args(["-n", "-k", "/usr/sbin/networksetup", "-setsecurewebproxy", &service_name, "127.0.0.1", &port.to_string()])
            .output();

        // 启用 HTTPS 代理
        let _ = Command::new("/usr/bin/sudo")
            .args(["-n", "-k", "/usr/sbin/networksetup", "-setsecurewebproxystate", &service_name, "on"])
            .output();
    } else {
        let has_http = is_proxy_enabled("http", &service_name);
        let has_https = is_proxy_enabled("https", &service_name);
        if has_http || has_https {
            println!(">>> Disabling macOS System HTTP/HTTPS Proxy...");

            if has_http {
                // 禁用 HTTP 代理
                let _ = Command::new("/usr/bin/sudo")
                    .args(["-n", "-k", "/usr/sbin/networksetup", "-setwebproxystate", &service_name, "off"])
                    .output();
            }

            if has_https {
                // 禁用 HTTPS 代理
                let _ = Command::new("/usr/bin/sudo")
                    .args(["-n", "-k", "/usr/sbin/networksetup", "-setsecurewebproxystate", &service_name, "off"])
                    .output();
            }
        }
    }
}

/// 检查代理是否已启用 (仅限 macOS)
fn is_proxy_enabled(proxy_type: &str, service: &str) -> bool {
    let arg = match proxy_type {
        "socks" => "-getsocksfirewallproxy",
        "http" => "-getwebproxy",
        "https" => "-getsecurewebproxy",
        _ => return false,
    };
    if let Ok(output) = Command::new("/usr/sbin/networksetup")
        .args([arg, service])
        .output()
    {
        if output.status.success() {
            let s = String::from_utf8_lossy(&output.stdout);
            return s.contains("Enabled: Yes");
        }
    }
    false
}

/// 设置代理绕过列表（Bypass Domains）
/// 
/// 让 localhost 和本地网络不走代理，解决 VSCode 登录回调等问题
pub fn set_proxy_bypass_domains(enable: bool) {
    if !cfg!(target_os = "macos") {
        return;
    }

    let service_name =
        get_active_network_service().unwrap_or_else(|| DEFAULT_NETWORK_SERVICE.to_string());

    if enable {
        // 设置绕过代理 of 域名列表
        // localhost, 127.0.0.1, 本地网络等不走代理
        let bypass_domains = "localhost,127.0.0.1,*.local,*.lan,10.*,172.16.*,172.17.*,172.18.*,172.19.*,172.20.*,172.21.*,172.22.*,172.23.*,172.24.*,172.25.*,172.26.*,172.27.*,172.28.*,172.29.*,172.30.*,172.31.*,192.168.*";
        
        println!(">>> Setting proxy bypass domains...");
        let _ = Command::new("/usr/bin/sudo")
            .args(["-n", "-k", "/usr/sbin/networksetup", "-setproxybypassdomains", &service_name, bypass_domains])
            .output();
    }
    // 禁用时不需要清除，因为代理本身已经关闭
}

/// 设置所有系统代理（SOCKS + HTTP）
/// 
/// **Feature: vpn-enhancement**
/// **Validates: Requirements 1.2, 1.4 - 同时设置/清除 SOCKS 和 HTTP 代理**
pub fn set_system_proxy(enable: bool, socks_port: u16, http_port: u16) {
    set_system_socks_proxy(enable, socks_port);
    set_system_http_proxy(enable, http_port);
    if enable {
        set_proxy_bypass_domains(true);
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
