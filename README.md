# ToVPN

A modern VPN client built with Tauri v2, Vue 3, and Rust.

## Features

- **TUN Mode**: Full system traffic routing via virtual network interface
- **SOCKS Mode**: Lightweight proxy mode for specific applications
- **Hysteria2 Protocol**: High-performance UDP-based protocol
- **Auto Reconnect**: Automatic reconnection on connection loss
- **Traffic Monitoring**: Real-time upload/download statistics
- **Multi-language**: English and Chinese support

## Tech Stack

- **Frontend**: Vue 3 + TypeScript + Pinia + Tailwind CSS
- **Backend**: Rust + Tauri v2
- **VPN Core**: sing-box

## Requirements

- Node.js 18+
- Rust 1.70+
- pnpm 8+
- macOS 12+ (currently macOS only)

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm tauri:dev

# Build for production
pnpm tauri:build

# Run tests
pnpm test                    # Frontend tests
cd src-tauri && cargo test   # Backend tests
```

## Project Structure

```
├── src/                    # Frontend source
│   ├── api/               # API clients
│   ├── components/        # Vue components
│   ├── stores/            # Pinia stores
│   ├── utils/             # Utility functions
│   └── views/             # Page views
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── vpn/          # VPN core logic
│   │   │   ├── connect.rs    # Connection management
│   │   │   ├── monitor.rs    # Traffic/latency monitoring
│   │   │   ├── state.rs      # VPN state management
│   │   │   └── proxy.rs      # System proxy settings
│   │   ├── constants.rs  # Configuration constants
│   │   └── error.rs      # Error types
│   └── binaries/         # sing-box sidecar
└── docs/                  # Documentation
```

## Configuration

### Connection Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| TUN | Routes all system traffic | Full VPN protection |
| SOCKS | Local proxy on port 1080 | App-specific routing |

### Environment Variables

Create `.env` file:

```env
VITE_API_BASE_URL=https://api.example.com
```

## License

MIT
