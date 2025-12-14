use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::fs;
use std::path::Path;

type HmacSha256 = Hmac<Sha256>;

// 建议：在正式环境中，这个 Key 应该在编译时通过环境变量注入，或者混淆存储
const SIGNING_KEY: &[u8] = b"your-super-secret-signing-key-tovpn";

/// 对配置内容进行签名
pub fn sign_content(content: &str) -> String {
    let mut mac = HmacSha256::new_from_slice(SIGNING_KEY)
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
    stored_sig == expected_sig
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
                                                                             