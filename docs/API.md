# API Reference

## Tauri Commands

### VPN Connection

#### `precheck_tun_permission`

Checks TUN mode prerequisites before connecting.

```typescript
const result = await invoke<TunPrecheckResult>('precheck_tun_permission')
```

**Returns**:
```typescript
interface TunPrecheckResult {
  singbox_installed: boolean  // Whether sing-box is installed
  sudo_cached: boolean        // Whether admin permission is cached
  will_prompt: boolean        // Whether auth dialog will appear
  platform: string            // Current OS (macos/linux/windows)
}
```

**Usage**: Call before `connect_hysteria` with TUN mode to warn users about upcoming authorization prompt.

#### `connect_hysteria`

Establishes VPN connection to specified server.

```typescript
await invoke('connect_hysteria', {
  serverId: number,      // Server ID
  domain: string,        // Server hostname
  port: number,          // Server port (1-65535)
  password: string,      // Authentication password
  mode: 'tun' | 'socks', // Connection mode
  serverMtu: number,     // MTU (576-1500, 0 for default)
  serverDns: string,     // DNS: 'google' | 'aliyun' | 'cloudflare'
})
```

**Returns**: `string` - "Connected" on success

**Errors**:
- `Already connected` - VPN already connected
- `Connection in progress` - Connection already in progress
- `Invalid server: *` - Validation failed
- `Connection failed: *` - Connection error

#### `disconnect_vpn`

Disconnects current VPN connection.

```typescript
await invoke('disconnect_vpn')
```

**Returns**: `string` - "Disconnected" on success

#### `check_vpn_status`

Gets current VPN status.

```typescript
const status = await invoke<VpnStatusResult>('check_vpn_status')
```

**Returns**:
```typescript
interface VpnStatusResult {
  status: 'disconnected' | 'connecting' | 'connected' | 'disconnecting'
  server_id: number | null
  connected_at: number | null  // Unix timestamp (seconds)
}
```

### Helper Management

#### `check_helper_status`

Checks system extension status.

```typescript
const result = await invoke<HelperStatusResult>('check_helper_status')
```

**Returns**:
```typescript
interface HelperStatusResult {
  status: 'not_installed' | 'installed' | 'running' | 'error'
}
```

#### `install_helper`

Installs system extension (requires admin).

```typescript
const result = await invoke<HelperResult>('install_helper')
```

#### `uninstall_helper`

Removes system extension.

```typescript
const result = await invoke<HelperResult>('uninstall_helper')
```

### Server Operations

#### `ping_server`

Tests latency to a server.

```typescript
const latency = await invoke<number>('ping_server', {
  host: string,
  port: number,
})
```

**Returns**: `number` - Latency in milliseconds, -1 if unreachable

---

## Frontend Events

### `vpn-status-change`

Emitted when VPN status changes.

```typescript
interface VpnStatusEvent {
  status: string
  server_id: number | null
  connected_at: number | null
}

await listen<VpnStatusEvent>('vpn-status-change', (event) => {
  console.log('Status:', event.payload.status)
})
```

### `vpn-traffic`

Emitted every second with traffic statistics.

```typescript
interface TrafficEvent {
  download_bytes: number   // Total downloaded
  upload_bytes: number     // Total uploaded
  download_speed: number   // Bytes/second
  upload_speed: number     // Bytes/second
}

await listen<TrafficEvent>('vpn-traffic', (event) => {
  console.log('Speed:', event.payload.download_speed)
})
```

### `vpn-latency`

Emitted every 5 seconds with latency measurement.

```typescript
interface LatencyEvent {
  latency_ms: number
}

await listen<LatencyEvent>('vpn-latency', (event) => {
  console.log('Latency:', event.payload.latency_ms, 'ms')
})
```

### `vpn-log`

Emitted for VPN-related log messages.

```typescript
interface LogEvent {
  level: 'info' | 'warn' | 'error'
  message: string
  timestamp: number  // Unix timestamp (ms)
}

await listen<LogEvent>('vpn-log', (event) => {
  console.log(`[${event.payload.level}] ${event.payload.message}`)
})
```

### `vpn-connection-error`

Emitted on connection errors.

```typescript
interface VpnConnectionErrorEvent {
  error: string
  fatal: boolean
}
```

### `vpn-process-terminated`

Emitted when sing-box process terminates unexpectedly.

```typescript
interface VpnProcessTerminatedEvent {
  reason: 'fatal_error' | 'process_exit'
  exit_code: number
}
```

### `vpn-process-crashed`

Emitted when process watchdog detects crash.

```typescript
interface VpnProcessCrashedEvent {
  reason: 'process_died'
  consecutive_failures: number
}
```

---

## REST API (Backend Server)

### Authentication

#### POST `/api/auth/login`

```typescript
// Request
{ email: string, password: string }

// Response
{
  access_token: string,
  refresh_token: string,
  expires_in: number,
  user: UserProfile
}
```

#### POST `/api/auth/refresh`

```typescript
// Request
{ refresh_token: string }

// Response
{ access_token: string, expires_in: number }
```

### Servers

#### GET `/api/servers`

Returns available VPN servers.

```typescript
// Response
{
  servers: Array<{
    id: number,
    name: string,
    domain: string,
    port: number,
    password: string,
    country: string,
    city: string,
    status: 'online' | 'offline' | 'maintenance'
  }>
}
```

### Usage

#### POST `/api/usage/report`

Reports connection usage.

```typescript
// Request
{
  node_id: number,
  traffic_download: number,
  traffic_upload: number,
  duration: number,
  connected_at: string,    // ISO 8601
  disconnected_at: string  // ISO 8601
}
```
