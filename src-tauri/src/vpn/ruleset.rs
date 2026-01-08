//! 规则集管理模块
//!
//! **Feature: vpn-optimization**
//! **Validates: Requirements 5.3, 7.2, 7.3**
//!
//! 提供规则集状态检查、版本管理和更新功能

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{info, error};

/// 规则集更新检查阈值（7 天）
const RULESET_UPDATE_THRESHOLD_DAYS: u64 = 7;

/// 规则集下载 URL
/// 注意：sing-box 1.8+ 使用 rule_set 格式（.srs），需要从 rule-set 分支下载
const GEOSITE_CN_URL: &str = "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-cn.srs";
const GEOIP_CN_URL: &str = "https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs";

/// 规则集信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RulesetInfo {
    /// 规则集名称 (geosite-cn, geoip-cn)
    pub name: String,
    /// 本地文件路径
    pub path: String,
    /// 文件是否存在
    pub exists: bool,
    /// 文件大小（字节）
    pub size: u64,
    /// 最后修改时间（Unix 时间戳，秒）
    pub last_modified: Option<u64>,
    /// 最后修改时间（人类可读格式）
    pub last_modified_formatted: Option<String>,
    /// 是否需要更新（超过 7 天）
    pub needs_update: bool,
    /// 距离上次更新的天数
    pub days_since_update: Option<u64>,
}

/// 规则集状态汇总
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RulesetStatus {
    /// geosite-cn 规则集信息
    pub geosite_cn: RulesetInfo,
    /// geoip-cn 规则集信息
    pub geoip_cn: RulesetInfo,
    /// 是否有任何规则集需要更新
    pub any_needs_update: bool,
    /// 检查时间（Unix 时间戳）
    pub checked_at: u64,
}

/// 获取规则集目录路径
fn get_ruleset_dir() -> PathBuf {
    // 在开发环境中使用相对路径
    let dev_path = PathBuf::from("resources/rulesets");
    if dev_path.exists() {
        return dev_path;
    }

    // 在生产环境中，规则集位于应用资源目录
    #[cfg(target_os = "macos")]
    {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(bundle_path) = exe_path.parent().and_then(|p| p.parent()) {
                let resources_path = bundle_path.join("Resources/rulesets");
                if resources_path.exists() {
                    return resources_path;
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                let resources_path = exe_dir.join("resources/rulesets");
                if resources_path.exists() {
                    return resources_path;
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                let resources_path = exe_dir.join("resources/rulesets");
                if resources_path.exists() {
                    return resources_path;
                }
            }
        }
    }

    // 默认回退到开发路径
    dev_path
}

/// 获取单个规则集文件的信息
///
/// **Feature: vpn-optimization, Property 8: 规则集版本检查**
/// **Validates: Requirements 5.3, 7.3**
fn get_ruleset_info(name: &str, path: &Path) -> RulesetInfo {
    let exists = path.exists();
    let mut size = 0u64;
    let mut last_modified: Option<u64> = None;
    let mut last_modified_formatted: Option<String> = None;
    let mut needs_update = false;
    let mut days_since_update: Option<u64> = None;

    if exists {
        // 获取文件元数据
        if let Ok(metadata) = fs::metadata(path) {
            size = metadata.len();

            // 获取最后修改时间
            if let Ok(modified) = metadata.modified() {
                if let Ok(duration) = modified.duration_since(UNIX_EPOCH) {
                    let timestamp = duration.as_secs();
                    last_modified = Some(timestamp);

                    // 格式化时间
                    last_modified_formatted = Some(format_timestamp(timestamp));

                    // 计算距离上次更新的天数
                    let now = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();
                    let elapsed_secs = now.saturating_sub(timestamp);
                    let elapsed_days = elapsed_secs / (24 * 60 * 60);
                    days_since_update = Some(elapsed_days);

                    // 检查是否需要更新（超过 7 天）
                    needs_update = elapsed_days >= RULESET_UPDATE_THRESHOLD_DAYS;
                }
            }
        }
    } else {
        // 文件不存在，需要下载
        needs_update = true;
    }

    RulesetInfo {
        name: name.to_string(),
        path: path.to_string_lossy().to_string(),
        exists,
        size,
        last_modified,
        last_modified_formatted,
        needs_update,
        days_since_update,
    }
}

/// 格式化 Unix 时间戳为人类可读格式
fn format_timestamp(timestamp: u64) -> String {
    use std::time::{Duration, UNIX_EPOCH};

    let datetime = UNIX_EPOCH + Duration::from_secs(timestamp);
    if let Ok(duration) = datetime.duration_since(UNIX_EPOCH) {
        // 简单的日期格式化（不依赖外部库）
        let secs = duration.as_secs();
        let days_since_epoch = secs / (24 * 60 * 60);

        // 计算年月日（简化版本）
        let mut year = 1970;
        let mut remaining_days = days_since_epoch;

        loop {
            let days_in_year = if is_leap_year(year) { 366 } else { 365 };
            if remaining_days < days_in_year {
                break;
            }
            remaining_days -= days_in_year;
            year += 1;
        }

        let mut month = 1;
        let days_in_months = if is_leap_year(year) {
            [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        } else {
            [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        };

        for days in days_in_months.iter() {
            if remaining_days < *days {
                break;
            }
            remaining_days -= days;
            month += 1;
        }

        let day = remaining_days + 1;

        format!("{:04}-{:02}-{:02}", year, month, day)
    } else {
        "Unknown".to_string()
    }
}

/// 判断是否为闰年
fn is_leap_year(year: u64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

/// 检查规则集状态
///
/// **Feature: vpn-optimization, Property 8: 规则集版本检查**
/// **Validates: Requirements 5.3, 7.2, 7.3**
///
/// 返回所有规则集的状态信息，包括是否存在、最后更新时间、是否需要更新等
pub fn check_ruleset_status() -> RulesetStatus {
    let ruleset_dir = get_ruleset_dir();
    info!("Checking ruleset status in: {:?}", ruleset_dir);

    let geosite_cn_path = ruleset_dir.join("geosite-cn.srs");
    let geoip_cn_path = ruleset_dir.join("geoip-cn.srs");

    let geosite_cn = get_ruleset_info("geosite-cn", &geosite_cn_path);
    let geoip_cn = get_ruleset_info("geoip-cn", &geoip_cn_path);

    let any_needs_update = geosite_cn.needs_update || geoip_cn.needs_update;

    let checked_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let status = RulesetStatus {
        geosite_cn,
        geoip_cn,
        any_needs_update,
        checked_at,
    };

    info!("Ruleset status: any_needs_update={}", any_needs_update);
    status
}

/// 检查规则集是否需要更新
///
/// **Feature: vpn-optimization, Property 8: 规则集版本检查**
/// **Validates: Requirements 5.3, 7.3**
///
/// 如果规则集文件的最后修改时间超过 7 天，返回 true
#[allow(dead_code)]
pub fn needs_update(info: &RulesetInfo) -> bool {
    info.needs_update
}

/// 验证规则集文件完整性
///
/// 检查文件是否存在且大小合理（大于 1KB）
#[allow(dead_code)]
pub fn validate_ruleset(path: &Path) -> bool {
    if !path.exists() {
        return false;
    }

    if let Ok(metadata) = fs::metadata(path) {
        // 规则集文件应该至少有 1KB
        metadata.len() > 1024
    } else {
        false
    }
}

/// 获取规则集文件路径
#[allow(dead_code)]
pub fn get_ruleset_paths() -> (PathBuf, PathBuf) {
    let ruleset_dir = get_ruleset_dir();
    (
        ruleset_dir.join("geosite-cn.srs"),
        ruleset_dir.join("geoip-cn.srs"),
    )
}

/// 规则集更新结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RulesetUpdateResult {
    /// 是否成功
    pub success: bool,
    /// 更新的规则集数量
    pub updated_count: u32,
    /// 错误信息（如果有）
    pub error: Option<String>,
    /// 更新后的状态
    pub status: Option<RulesetStatus>,
}

/// 下载单个规则集文件
async fn download_ruleset(url: &str, path: &Path) -> Result<(), String> {
    info!("Starting download from: {}", url);
    info!("Target path: {:?}", path);
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    info!("Sending HTTP request...");
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to download: {}", e))?;
    
    let status = response.status();
    info!("HTTP response status: {}", status);
    
    if !status.is_success() {
        return Err(format!("HTTP error: {}", status));
    }
    
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    
    info!("Downloaded {} bytes", bytes.len());
    
    // 验证文件大小（至少 1KB）
    if bytes.len() < 1024 {
        return Err(format!("Downloaded file is too small: {} bytes", bytes.len()));
    }
    
    // 确保目录存在
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }
    
    // 写入临时文件
    let temp_path = path.with_extension("srs.tmp");
    info!("Writing to temp file: {:?}", temp_path);
    
    let mut file = fs::File::create(&temp_path)
        .map_err(|e| format!("Failed to create temp file: {}", e))?;
    
    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write file: {}", e))?;
    
    file.flush()
        .map_err(|e| format!("Failed to flush file: {}", e))?;
    
    // 原子性地替换文件
    info!("Renaming temp file to: {:?}", path);
    fs::rename(&temp_path, path)
        .map_err(|e| format!("Failed to rename file: {}", e))?;
    
    info!("Successfully downloaded ruleset to: {:?} ({} bytes)", path, bytes.len());
    Ok(())
}

/// 更新规则集
/// 
/// 从 GitHub 下载最新的规则集文件
pub async fn update_rulesets() -> RulesetUpdateResult {
    info!("Starting ruleset update...");
    
    let ruleset_dir = get_ruleset_dir();
    info!("Ruleset directory: {:?}", ruleset_dir);
    
    // 确保目录存在
    if let Err(e) = fs::create_dir_all(&ruleset_dir) {
        error!("Failed to create ruleset directory: {}", e);
        return RulesetUpdateResult {
            success: false,
            updated_count: 0,
            error: Some(format!("Failed to create directory: {}", e)),
            status: None,
        };
    }
    
    let geosite_cn_path = ruleset_dir.join("geosite-cn.srs");
    let geoip_cn_path = ruleset_dir.join("geoip-cn.srs");
    
    info!("Will download geosite-cn to: {:?}", geosite_cn_path);
    info!("Will download geoip-cn to: {:?}", geoip_cn_path);
    
    let mut updated_count = 0u32;
    let mut errors = Vec::new();
    
    // 下载 geosite-cn (域名规则集)
    info!("Downloading geosite-cn from: {}", GEOSITE_CN_URL);
    match download_ruleset(GEOSITE_CN_URL, &geosite_cn_path).await {
        Ok(_) => {
            updated_count += 1;
            info!("geosite-cn (domain ruleset) updated successfully");
        }
        Err(e) => {
            error!("Failed to update geosite-cn: {}", e);
            errors.push(format!("geosite-cn: {}", e));
        }
    }
    
    // 下载 geoip-cn (IP 规则集)
    info!("Downloading geoip-cn from: {}", GEOIP_CN_URL);
    match download_ruleset(GEOIP_CN_URL, &geoip_cn_path).await {
        Ok(_) => {
            updated_count += 1;
            info!("geoip-cn (IP ruleset) updated successfully");
        }
        Err(e) => {
            error!("Failed to update geoip-cn: {}", e);
            errors.push(format!("geoip-cn: {}", e));
        }
    }
    
    info!("Ruleset update completed: {} of 2 updated", updated_count);
    
    // 获取更新后的状态
    let status = check_ruleset_status();
    
    if errors.is_empty() {
        RulesetUpdateResult {
            success: true,
            updated_count,
            error: None,
            status: Some(status),
        }
    } else {
        RulesetUpdateResult {
            success: updated_count > 0,
            updated_count,
            error: Some(errors.join("; ")),
            status: Some(status),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn test_needs_update_new_file() {
        let info = RulesetInfo {
            name: "test".to_string(),
            path: "/tmp/test.srs".to_string(),
            exists: true,
            size: 1024,
            last_modified: Some(
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_secs(),
            ),
            last_modified_formatted: Some("2024-01-01".to_string()),
            needs_update: false,
            days_since_update: Some(0),
        };

        assert!(!needs_update(&info));
    }

    #[test]
    fn test_needs_update_old_file() {
        // 8 天前的时间戳
        let eight_days_ago = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            - (8 * 24 * 60 * 60);

        let info = RulesetInfo {
            name: "test".to_string(),
            path: "/tmp/test.srs".to_string(),
            exists: true,
            size: 1024,
            last_modified: Some(eight_days_ago),
            last_modified_formatted: Some("2024-01-01".to_string()),
            needs_update: true,
            days_since_update: Some(8),
        };

        assert!(needs_update(&info));
    }

    #[test]
    fn test_needs_update_missing_file() {
        let info = RulesetInfo {
            name: "test".to_string(),
            path: "/tmp/nonexistent.srs".to_string(),
            exists: false,
            size: 0,
            last_modified: None,
            last_modified_formatted: None,
            needs_update: true,
            days_since_update: None,
        };

        assert!(needs_update(&info));
    }

    #[test]
    fn test_validate_ruleset_valid() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.srs");

        // 创建一个大于 1KB 的文件
        let mut file = File::create(&file_path).unwrap();
        let data = vec![0u8; 2048];
        file.write_all(&data).unwrap();

        assert!(validate_ruleset(&file_path));
    }

    #[test]
    fn test_validate_ruleset_too_small() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.srs");

        // 创建一个小于 1KB 的文件
        let mut file = File::create(&file_path).unwrap();
        let data = vec![0u8; 512];
        file.write_all(&data).unwrap();

        assert!(!validate_ruleset(&file_path));
    }

    #[test]
    fn test_validate_ruleset_nonexistent() {
        let path = Path::new("/tmp/nonexistent_ruleset.srs");
        assert!(!validate_ruleset(path));
    }

    #[test]
    fn test_format_timestamp() {
        // 2024-01-01 00:00:00 UTC
        let timestamp = 1704067200u64;
        let formatted = format_timestamp(timestamp);
        assert_eq!(formatted, "2024-01-01");
    }

    #[test]
    fn test_is_leap_year() {
        assert!(is_leap_year(2024)); // 闰年
        assert!(!is_leap_year(2023)); // 非闰年
        assert!(is_leap_year(2000)); // 能被 400 整除
        assert!(!is_leap_year(1900)); // 能被 100 整除但不能被 400 整除
    }
}
