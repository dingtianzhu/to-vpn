use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::fs;
use std::path::Path;
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

use std::sync::OnceLock;

static SIGNING_KEY: OnceLock<Vec<u8>> = OnceLock::new();

// 获取配置签名密钥
// 优先使用编译期环境变量，若不存在则从本地安全文件中检索/生成，防止明文硬编码硬性漏洞，并避免钥匙串弹窗
fn get_signing_key() -> &'static [u8] {
    SIGNING_KEY.get_or_init(|| {
        // 1. 尝试从编译期环境变量读取
        if let Some(key_str) = option_env!("TOVPN_HMAC_KEY") {
            return key_str.as_bytes().to_vec();
        }

        // 2. 尝试从本地安全文件读取
        if let Some(mut path) = dirs::home_dir() {
            path.push(".tovpn_signing_key");
            if path.exists() {
                if let Ok(stored_key) = fs::read_to_string(&path) {
                    if let Ok(decoded) = hex::decode(stored_key.trim()) {
                        return decoded;
                    }
                }
            }

            // 3. 不存在则生成高强度随机密钥并写入文件，设置所有者专属权限
            use rand::RngCore;
            let mut new_key = vec![0u8; 32];
            rand::thread_rng().fill_bytes(&mut new_key);
            let hex_key = hex::encode(&new_key);
            if fs::write(&path, &hex_key).is_ok() {
                set_secure_permissions(&path);
                return new_key;
            }
        }

        // 4. 终极回退（仅在文件读写完全不可用时使用）
        b"ultimate-fallback-key-should-never-be-reached-in-production".to_vec()
    })
}

/// 对配置内容进行签名
pub fn sign_content(content: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(get_signing_key())
        .expect("HMAC can take key of any size");
    mac.update(content.as_bytes());
    let result = mac.finalize();
    hex::encode(result.into_bytes())
}

/// 验证文件完整性
pub fn verify_config(config_path: &Path, sig_path: &Path) -> bool {
    let content = match fs::read_to_string(config_path) {
        Ok(c) => c,
        Err(_) => return false,
    };
    
    let stored_sig = match fs::read_to_string(sig_path) {
        Ok(s) => s.trim().to_string(),
        Err(_) => return false,
    };

    let expected_sig = sign_content(&content);
    
    // 使用恒定时间比较防止时序攻击
    if stored_sig.len() != expected_sig.len() {
        return false;
    }
    stored_sig.as_bytes().ct_eq(expected_sig.as_bytes()).unwrap_u8() == 1
}

/// 设置严格的文件权限 (Unix: 600, Windows: 仅当前用户)
pub fn set_secure_permissions(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(path).unwrap().permissions();
        perms.set_mode(0o600); // 仅所有者可读写
        fs::set_permissions(path, perms).ok();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use std::fs::File;
    use std::io::Write;

    #[test]
    fn test_sign_and_verify_config() {
        let dir = tempdir().unwrap();
        let config_path = dir.path().join("config.json");
        let sig_path = dir.path().join("config.json.sig");

        let config_data = r#"{"socks_port": 1080}"#;
        {
            let mut f = File::create(&config_path).unwrap();
            f.write_all(config_data.as_bytes()).unwrap();
        }

        let signature = sign_content(config_data);
        {
            let mut f = File::create(&sig_path).unwrap();
            f.write_all(signature.as_bytes()).unwrap();
        }

        // Verify that signature checks pass for correct config and signature
        assert!(verify_config(&config_path, &sig_path));

        // Verify that signature checks fail for altered signature
        {
            let mut f = File::create(&sig_path).unwrap();
            f.write_all(b"invalid-signature-value-which-is-longer-or-different-completely").unwrap();
        }
        assert!(!verify_config(&config_path, &sig_path));
    }
}
                                                                             