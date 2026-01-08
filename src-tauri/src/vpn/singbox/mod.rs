//! sing-box 配置生成模块入口
//! 提供公共工具函数和分发逻辑

pub mod socks;
pub mod tun;

use serde_json::Value;
use std::{
    fs,
    net::{IpAddr, ToSocketAddrs},
    path::{Path, PathBuf},
};
use tracing::info;

use crate::constants;
use crate::error::Result;
use crate::vpn::config::{ConfigOptions, ConnectConfig};

// Re-export ProxyPorts for external use
pub use socks::ProxyPorts;

// 嵌入资源文件
static GEOSITE_CN_SRS: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/resources/rulesets/geosite-cn.srs"
));
static GEOIP_CN_SRS: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/resources/rulesets/geoip-cn.srs"
));

/// 规则集路径结构体
pub struct RuleSetPaths {
    pub geosite_cn: PathBuf,
    pub geoip_cn: PathBuf,
}

/// 统一入口函数
#[allow(dead_code)]
pub fn generate_config(config: &ConnectConfig, cache_path: &Path) -> Result<Value> {
    // 使用默认配置选项
    generate_config_with_options(config, cache_path, &ConfigOptions::default())
}

/// 统一入口函数（带高级选项）
/// 
/// **Feature: vpn-optimization**
/// **Validates: Requirements - 配置参数分析**
pub fn generate_config_with_options(
    config: &ConnectConfig,
    cache_path: &Path,
    options: &ConfigOptions,
) -> Result<Value> {
    // 使用默认端口
    generate_config_with_ports(config, cache_path, options, &ProxyPorts::default())
}

/// 统一入口函数（带高级选项和自定义端口）
/// 
/// **Feature: vpn-pure-mode**
/// **Validates: Requirements 1.5**
pub fn generate_config_with_ports(
    config: &ConnectConfig,
    cache_path: &Path,
    options: &ConfigOptions,
    ports: &ProxyPorts,
) -> Result<Value> {
    info!(">>> generate_config_with_ports (Split Module Mode) <<<");

    // 确保规则集存在 (公共逻辑)
    let base_dir = cache_path.parent().unwrap_or(Path::new(".")).to_path_buf();
    let ruleset_paths = ensure_local_rulesets(&base_dir)?;

    if config.mode == "tun" {
        tun::generate_with_options(config, cache_path, ruleset_paths, options)
    } else {
        socks::generate_with_ports(config, cache_path, ruleset_paths, options, ports)
    }
}

/// 确保本地规则集文件存在
pub fn ensure_local_rulesets(base_dir: &Path) -> Result<RuleSetPaths> {
    let rules_dir = base_dir.join("rulesets");
    let geosite_cn = rules_dir.join("geosite-cn.srs");
    let geoip_cn = rules_dir.join("geoip-cn.srs");

    if !geosite_cn.exists() || geosite_cn.metadata().map(|m| m.len()).unwrap_or(0) == 0 {
        write_atomic(&geosite_cn, GEOSITE_CN_SRS)?;
    }
    if !geoip_cn.exists() || geoip_cn.metadata().map(|m| m.len()).unwrap_or(0) == 0 {
        write_atomic(&geoip_cn, GEOIP_CN_SRS)?;
    }

    Ok(RuleSetPaths {
        geosite_cn,
        geoip_cn,
    })
}

/// 原子写入文件 helper
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o644));
    }
    Ok(())
}

/// 解析域名 IP helper
pub fn resolve_ipv4(host: &str, port: u16) -> Vec<IpAddr> {
    let mut out = Vec::new();
    if let Ok(iter) = (host, port).to_socket_addrs() {
        for sa in iter {
            let ip = sa.ip();
            if ip.is_ipv4() && !out.contains(&ip) {
                out.push(ip);
            }
        }
    }
    out
}

/// 获取常见国内 CDN 域名列表
/// 
/// **Feature: vpn-optimization**
/// **Validates: Requirements 5.1, 5.2, 7.1**
/// 
/// 这些域名应直连不经过代理，以保护节点纯净度
pub fn get_china_cdn_domains() -> Vec<&'static str> {
    vec![
        // 阿里云 CDN
        ".aliyuncs.com",
        ".alicdn.com",
        ".aliyun.com",
        ".alibabacloud.com",
        ".alipay.com",
        ".alipayobjects.com",
        ".taobao.com",
        ".tmall.com",
        ".tbcdn.cn",
        ".aliapp.org",
        ".alibaba.com",
        // 腾讯云 CDN
        ".qcloud.com",
        ".tencent.com",
        ".qq.com",
        ".gtimg.cn",
        ".gtimg.com",
        ".qpic.cn",
        ".myqcloud.com",
        ".tencent-cloud.net",
        ".tencentcs.com",
        ".weixin.qq.com",
        ".wechat.com",
        // 百度云 CDN
        ".baidubce.com",
        ".bcebos.com",
        ".bdstatic.com",
        ".bdimg.com",
        ".baidu.com",
        ".baidustatic.com",
        ".bdydns.com",
        // 华为云 CDN
        ".huaweicloud.com",
        ".myhuaweicloud.com",
        ".hwcdn.net",
        ".huawei.com",
        // 京东云 CDN
        ".jdcloud.com",
        ".jd.com",
        ".jcloudcs.com",
        ".360buyimg.com",
        // 网易云 CDN
        ".163.com",
        ".126.com",
        ".netease.com",
        ".ydstatic.com",
        ".nosdn.127.net",
        // 七牛云 CDN
        ".qiniucdn.com",
        ".qiniudn.com",
        ".qbox.me",
        ".qnssl.com",
        // 又拍云 CDN
        ".upaiyun.com",
        ".upyun.com",
        // 金山云 CDN
        ".ksyun.com",
        ".ks-cdn.com",
        // 字节跳动/抖音 CDN
        ".bytedance.com",
        ".bytecdn.cn",
        ".bytegoofy.com",
        ".byteimg.com",
        ".toutiao.com",
        ".douyin.com",
        ".douyincdn.com",
        ".pstatp.com",
        ".snssdk.com",
        // 快手 CDN
        ".kuaishou.com",
        ".gifshow.com",
        ".yximgs.com",
        // 哔哩哔哩 CDN
        ".bilibili.com",
        ".bilivideo.com",
        ".biliapi.net",
        ".hdslb.com",
        // 新浪/微博 CDN
        ".sina.com.cn",
        ".sinaimg.cn",
        ".weibo.com",
        ".weibocdn.com",
        // 搜狐 CDN
        ".sohu.com",
        ".sohucs.com",
        ".itc.cn",
        // 优酷/土豆 CDN
        ".youku.com",
        ".ykimg.com",
        ".tudou.com",
        // 爱奇艺 CDN
        ".iqiyi.com",
        ".iqiyipic.com",
        ".qy.net",
        // 其他常见国内服务
        ".cctv.com",
        ".csdn.net",
        ".zhihu.com",
        ".zhimg.com",
        ".jianshu.com",
        ".xiaomi.com",
        ".miui.com",
        ".mi.com",
        ".oppo.com",
        ".vivo.com",
        ".meizu.com",
        ".hupu.com",
        ".meituan.com",
        ".dianping.com",
        ".ele.me",
        ".ctrip.com",
        ".qunar.com",
        ".58.com",
        ".anjuke.com",
        ".lianjia.com",
        ".ke.com",
        ".pinduoduo.com",
        ".yangkeduo.com",
        ".suning.com",
        ".gome.com.cn",
        ".dangdang.com",
        ".vip.com",
        ".kaola.com",
        ".ximalaya.com",
        ".lizhi.fm",
        ".kugou.com",
        ".kuwo.cn",
        ".music.163.com",
        ".y.qq.com",
    ]
}

/// 获取 DNS 泄漏检测域名列表
/// 
/// **Feature: vpn-pure-mode**
/// **Validates: Requirements 4.2, 4.3**
/// 
/// 这些域名用于 DNS 泄漏检测，必须通过远程 DNS 解析
/// 以防止泄露用户真实 IP 地址
pub fn get_dns_leak_test_domains() -> Vec<&'static str> {
    vec![
        // DNS 泄漏检测网站
        "dnsleaktest.com",
        ".dnsleaktest.com",
        "dnsleak.com",
        ".dnsleak.com",
        "ipleak.net",
        ".ipleak.net",
        "ipleak.org",
        ".ipleak.org",
        "browserleaks.com",
        ".browserleaks.com",
        "browserleaks.org",
        ".browserleaks.org",
        "whoer.net",
        ".whoer.net",
        "whatismyip.com",
        ".whatismyip.com",
        "whatismyipaddress.com",
        ".whatismyipaddress.com",
        "ipinfo.io",
        ".ipinfo.io",
        "ip-api.com",
        ".ip-api.com",
        "ipify.org",
        ".ipify.org",
        "icanhazip.com",
        ".icanhazip.com",
        "checkip.amazonaws.com",
        ".checkip.amazonaws.com",
        "myip.com",
        ".myip.com",
        "ip.sb",
        ".ip.sb",
        "ip.cn",
        ".ip.cn",
        "cip.cc",
        ".cip.cc",
        "ipaddress.com",
        ".ipaddress.com",
        "ip138.com",
        ".ip138.com",
        "ip.tool.chinaz.com",
        ".tool.chinaz.com",
        // WebRTC 泄漏检测
        "webrtc-ips.com",
        ".webrtc-ips.com",
        // 其他隐私检测工具
        "mullvad.net",
        ".mullvad.net",
        "perfect-privacy.com",
        ".perfect-privacy.com",
        "expressvpn.com",
        ".expressvpn.com",
        "nordvpn.com",
        ".nordvpn.com",
    ]
}

/// 获取 WebRTC 相关域名列表
/// 
/// **Feature: vpn-pure-mode**
/// **Validates: Requirements 6.2, 6.3**
/// 
/// 这些域名是 WebRTC STUN/TURN 服务器域名，阻断它们可以防止 WebRTC 泄露真实 IP
pub fn get_webrtc_domains() -> Vec<&'static str> {
    vec![
        // Google STUN/TURN 服务器
        "stun.l.google.com",
        ".stun.l.google.com",
        "stun1.l.google.com",
        "stun2.l.google.com",
        "stun3.l.google.com",
        "stun4.l.google.com",
        "stun.services.mozilla.com",
        ".stun.services.mozilla.com",
        // Twilio STUN/TURN
        "global.stun.twilio.com",
        ".stun.twilio.com",
        ".turn.twilio.com",
        // 其他常见 STUN 服务器
        "stun.stunprotocol.org",
        "stun.voip.eutelia.it",
        "stun.sipgate.net",
        "stun.ekiga.net",
        "stun.ideasip.com",
        "stun.schlund.de",
        "stun.voiparound.com",
        "stun.voipbuster.com",
        "stun.voipstunt.com",
        "stun.counterpath.com",
        "stun.1und1.de",
        "stun.gmx.net",
        "stun.callwithus.com",
        "stun.internetcalls.com",
        // WebRTC 泄漏检测网站
        "webrtc-ips.com",
        ".webrtc-ips.com",
    ]
}

/// 获取 WebRTC STUN/TURN 端口列表
/// 
/// **Feature: vpn-pure-mode**
/// **Validates: Requirements 6.2**
/// 
/// 标准 STUN/TURN 端口：
/// - 3478: STUN/TURN 标准端口
/// - 5349: STUN/TURN over TLS
/// - 19302: Google STUN 服务器端口
pub fn get_webrtc_ports() -> Vec<u16> {
    vec![3478, 5349, 19302]
}

/// 获取 LAN 绕过 CIDR 范围列表
/// 
/// **Feature: vpn-pure-mode**
/// **Validates: Requirements 9.2, 9.3, 9.4**
/// 
/// 包含所有 RFC1918 私有地址范围和 link-local 地址：
/// - 10.0.0.0/8: Class A 私有网络
/// - 172.16.0.0/12: Class B 私有网络 (172.16.0.0 - 172.31.255.255)
/// - 192.168.0.0/16: Class C 私有网络
/// - 169.254.0.0/16: Link-local 地址 (APIPA)
/// - 127.0.0.0/8: Loopback 地址
pub fn get_lan_bypass_cidrs() -> Vec<&'static str> {
    vec![
        // RFC1918 私有地址范围
        "10.0.0.0/8",       // Class A 私有网络
        "172.16.0.0/12",    // Class B 私有网络
        "192.168.0.0/16",   // Class C 私有网络
        // Link-local 地址
        "169.254.0.0/16",   // APIPA (Automatic Private IP Addressing)
        // Loopback 地址
        "127.0.0.0/8",      // Localhost
    ]
}

/// 选择 DNS helper
pub fn pick_remote_dns_address(choice: &str) -> String {
    match choice {
        "google" => constants::dns::GOOGLE_DOH.to_string(),
        "cloudflare" => constants::dns::CLOUDFLARE_DOH.to_string(),
        "quad9" => constants::dns::QUAD9_UDP.to_string(),
        "aliyun" => constants::dns::ALIYUN_UDP.to_string(),
        "" => constants::dns::CLOUDFLARE_DOH.to_string(),
        _ if choice.starts_with("custom:") => choice
            .strip_prefix("custom:")
            .unwrap_or("")
            .trim()
            .to_string(),
        _ => constants::dns::CLOUDFLARE_DOH.to_string(),
    }
}

/// 日志解析 helper
pub fn parse_log_level(line: &str) -> (&str, String) {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return ("", String::new());
    }
    let (level, message) = if trimmed.starts_with("FATAL") {
        ("error", extract_message(trimmed, "FATAL"))
    } else if trimmed.starts_with("ERROR") {
        ("error", extract_message(trimmed, "ERROR"))
    } else if trimmed.starts_with("WARN") {
        ("warn", extract_message(trimmed, "WARN"))
    } else if trimmed.starts_with("INFO") {
        ("info", extract_message(trimmed, "INFO"))
    } else if trimmed.starts_with("DEBUG") {
        ("debug", extract_message(trimmed, "DEBUG"))
    } else {
        ("info", trimmed.to_string())
    };
    (level, message)
}

fn extract_message(line: &str, prefix: &str) -> String {
    let after = &line[prefix.len()..];
    if after.starts_with('[') {
        if let Some(end) = after.find(']') {
            return after[end + 1..].trim().to_string();
        }
    }
    after.trim().to_string()
}

pub fn is_fatal_error(line: &str) -> bool {
    let u = line.trim().to_uppercase();
    u.starts_with("FATAL") || u.contains("PANIC") || u.contains("bind: address already in use")
}
