# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2024-12-08

### Added

- Initial release
- TUN mode with full system traffic routing
- SOCKS proxy mode for lightweight usage
- Hysteria2 protocol support via sing-box
- Real-time traffic and latency monitoring
- Auto-reconnect on connection loss
- Multi-language support (English, Chinese)
- Secure token storage using Tauri Store
- Process watchdog for crash detection
- Daily usage limits for free users

### Security

- Migrated token storage from localStorage to Tauri secure store
- Added comprehensive config parameter validation
- Input sanitization for server host, password, and other parameters

### Technical

- Vue 3 + TypeScript + Pinia frontend
- Rust + Tauri v2 backend
- sing-box as VPN core (sidecar)
- Structured logging with tracing crate
- Unit tests for frontend utilities and Rust backend
