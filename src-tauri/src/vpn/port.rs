//! Port validation and availability checking module
//!
//! **Feature: vpn-pure-mode**
//! **Validates: Requirements 1.3, 1.6**

use std::net::{TcpListener, UdpSocket};
use crate::error::{Result, VpnError};

/// Minimum allowed port number (non-privileged ports)
pub const PORT_MIN: u16 = 1024;

/// Maximum allowed port number
pub const PORT_MAX: u16 = 65535;

/// Validates that a port number is within the allowed range (1024-65535)
///
/// **Feature: vpn-pure-mode**
/// **Validates: Requirements 1.3**
///
/// # Arguments
/// * `port` - The port number to validate
///
/// # Returns
/// * `Ok(())` if the port is valid
/// * `Err(VpnError::Config)` if the port is out of range
pub fn validate_port_range(port: u16) -> Result<()> {
    if !(PORT_MIN..=PORT_MAX).contains(&port) {
        return Err(VpnError::Config(format!(
            "Port {} is out of valid range ({}-{})",
            port, PORT_MIN, PORT_MAX
        )));
    }
    Ok(())
}

/// Checks if a TCP port is available (not in use)
///
/// **Feature: vpn-pure-mode**
/// **Validates: Requirements 1.6**
///
/// # Arguments
/// * `port` - The port number to check
///
/// # Returns
/// * `true` if the port is available
/// * `false` if the port is in use
pub fn is_tcp_port_available(port: u16) -> bool {
    TcpListener::bind(format!("127.0.0.1:{}", port)).is_ok()
}

/// Checks if a UDP port is available (not in use)
///
/// # Arguments
/// * `port` - The port number to check
///
/// # Returns
/// * `true` if the port is available
/// * `false` if the port is in use
pub fn is_udp_port_available(port: u16) -> bool {
    UdpSocket::bind(format!("127.0.0.1:{}", port)).is_ok()
}

/// Checks if a port is available for both TCP and UDP
///
/// **Feature: vpn-pure-mode**
/// **Validates: Requirements 1.6**
///
/// # Arguments
/// * `port` - The port number to check
///
/// # Returns
/// * `true` if the port is available for both protocols
/// * `false` if the port is in use by either protocol
pub fn is_port_available(port: u16) -> bool {
    is_tcp_port_available(port) && is_udp_port_available(port)
}

/// Validates a port number and checks if it's available
///
/// **Feature: vpn-pure-mode**
/// **Validates: Requirements 1.3, 1.6**
///
/// # Arguments
/// * `port` - The port number to validate and check
///
/// # Returns
/// * `Ok(())` if the port is valid and available
/// * `Err(VpnError::Config)` if the port is invalid or in use
#[allow(dead_code)]
pub fn validate_and_check_port(port: u16) -> Result<()> {
    // First validate the range
    validate_port_range(port)?;
    
    // Then check availability
    if !is_port_available(port) {
        return Err(VpnError::Config(format!(
            "Port {} is already in use",
            port
        )));
    }
    
    Ok(())
}

/// Validates SOCKS and HTTP ports ensuring they are different and both available
///
/// **Feature: vpn-pure-mode**
/// **Validates: Requirements 1.3, 1.6**
///
/// # Arguments
/// * `socks_port` - The SOCKS proxy port
/// * `http_port` - The HTTP proxy port
///
/// # Returns
/// * `Ok(())` if both ports are valid, different, and available
/// * `Err(VpnError::Config)` if validation fails
pub fn validate_proxy_ports(socks_port: u16, http_port: u16) -> Result<()> {
    // Validate ranges
    validate_port_range(socks_port)?;
    validate_port_range(http_port)?;
    
    // Ensure ports are different
    if socks_port == http_port {
        return Err(VpnError::Config(
            "SOCKS and HTTP ports must be different".to_string()
        ));
    }
    
    // Check availability
    if !is_port_available(socks_port) {
        return Err(VpnError::Config(format!(
            "SOCKS port {} is already in use",
            socks_port
        )));
    }
    
    if !is_port_available(http_port) {
        return Err(VpnError::Config(format!(
            "HTTP port {} is already in use",
            http_port
        )));
    }
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_port_range_valid() {
        assert!(validate_port_range(1024).is_ok());
        assert!(validate_port_range(8080).is_ok());
        assert!(validate_port_range(65535).is_ok());
    }

    #[test]
    fn test_validate_port_range_invalid() {
        assert!(validate_port_range(0).is_err());
        assert!(validate_port_range(80).is_err());
        assert!(validate_port_range(1023).is_err());
    }

    #[test]
    fn test_port_availability() {
        // Port 0 should always fail range validation
        assert!(validate_port_range(0).is_err());
        
        // High ports should generally be available
        // Note: This test may fail if the port is actually in use
        let test_port = 59999;
        if is_port_available(test_port) {
            assert!(validate_and_check_port(test_port).is_ok());
        }
    }
}
