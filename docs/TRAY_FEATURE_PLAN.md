# ToVPN 托盘功能方案文档

> 更新时间：2025-12-09
> 状态：P0 问题已修复

## 一、当前问题分析（已修复）

### 1. 窗口关闭直接断开连接（严重 Bug）

**问题描述**：点击窗口关闭按钮后，VPN 连接被断开，而不是最小化到托盘。

**根本原因**：
- `src/App.vue` 中的 `onCloseRequested` 监听器会在窗口关闭时调用 `performCleanup()`，该函数会主动断开 VPN
- `src-tauri/src/lib.rs` 中的 `WindowEvent::Destroyed` 事件也会触发 `cleanup_on_exit()`

**代码位置**：
```typescript
// src/App.vue - 第 50-57 行
unlistenCloseRequested = await appWindow.onCloseRequested(async (event) => {
  event.preventDefault()
  await performCleanup()  // ← 这里会断开 VPN
  await appWindow.destroy()
})
```

```rust
// src-tauri/src/lib.rs - 第 48-53 行
tauri::WindowEvent::Destroyed => {
    if window.label() == "main" {
        cleanup_on_exit(window.app_handle());  // ← 这里也会清理 VPN
    }
}
```

### 2. 托盘弹窗位置不正确

**问题描述**：点击托盘图标后，弹窗没有显示在托盘图标正下方。

**根本原因**：
- 当前代码使用屏幕中央位置计算，而不是托盘图标的实际位置
- Tauri 2.0 的 `TrayIconEvent::Click` 事件包含 `position` 字段，但未被使用

**代码位置**：
```rust
// src-tauri/src/tray.rs - 第 68-76 行
#[cfg(target_os = "macos")]
{
    // macOS: 窗口显示在屏幕顶部中央 ← 错误的定位方式
    if let Ok(monitor) = popup.current_monitor() {
        if let Some(monitor) = monitor {
            let size = monitor.size();
            let scale = monitor.scale_factor();
            let x = (size.width as f64 / scale / 2.0 - 100.0) as i32;
            let _ = popup.set_position(...);
        }
    }
}
```

### 3. 其他潜在问题

#### 3.1 托盘弹窗状态同步
- `TrayView.vue` 中的 Pinia store 是独立实例，与主窗口不共享状态
- 需要通过事件或 IPC 同步状态

#### 3.2 窗口焦点丢失处理
- 当前 `Focused(false)` 事件会隐藏托盘弹窗，但 `TRAY_POPUP_VISIBLE` 状态可能不同步

#### 3.3 macOS 特有问题
- macOS 菜单栏应用通常使用 `NSPopover` 或类似机制
- 当前实现使用普通窗口，可能有视觉和行为差异

---

## 二、修复方案

### 修复 1：窗口关闭改为最小化到托盘 ✅ 已完成

**修改文件**：`src/App.vue`

```typescript
// 修改 onCloseRequested 处理逻辑
unlistenCloseRequested = await appWindow.onCloseRequested(async (event) => {
  event.preventDefault()
  // 不再清理 VPN，而是隐藏窗口（最小化到托盘）
  await appWindow.hide()
})
```

**修改文件**：`src-tauri/src/lib.rs`

```rust
// 移除 WindowEvent::Destroyed 中的 VPN 清理逻辑
// 只在应用真正退出时（RunEvent::Exit）清理
.on_window_event(|window, event| {
    match event {
        // 窗口失去焦点时隐藏托盘弹窗
        tauri::WindowEvent::Focused(false) => {
            if window.label() == "tray_popup" {
                let _ = window.hide();
            }
        }
        _ => {}
    }
})
```

### 修复 2：托盘弹窗定位到托盘图标下方 ✅ 已完成

**修改文件**：`src-tauri/src/tray.rs`

```rust
// 使用点击事件中的位置信息并保存
static LAST_TRAY_POSITION: Mutex<Option<(f64, f64)>> = Mutex::new(None);

TrayIconEvent::Click { 
    button: MouseButton::Left, 
    button_state: MouseButtonState::Up, 
    position,  // ← 使用这个位置
    .. 
} => {
    // 保存点击位置
    if let Ok(mut pos) = LAST_TRAY_POSITION.lock() {
        *pos = Some((position.x, position.y));
    }
    let app = tray.app_handle();
    toggle_tray_popup(app);
}

// 根据平台定位弹窗
#[cfg(target_os = "macos")]
{
    let x = (tray_x - 100.0).max(10.0) as i32;
    let y = (tray_y + 5.0) as i32;
    let _ = popup.set_position(...);
}
```

### 修复 3：状态同步机制

**当前实现**：使用 Tauri 事件同步
- 托盘弹窗显示时发送 `tray-popup-shown` 事件
- `TrayView.vue` 监听事件并调用 `syncVpnStatus()` 同步状态
- 两个窗口共享同一个 Pinia store（通过 Tauri IPC）

---

## 三、完整修改清单

### 3.1 Rust 端修改

| 文件 | 修改内容 |
|------|----------|
| `src-tauri/src/lib.rs` | 修改窗口关闭事件处理，不再清理 VPN |
| `src-tauri/src/tray.rs` | 修复托盘弹窗定位，使用点击位置 |

### 3.2 前端修改

| 文件 | 修改内容 |
|------|----------|
| `src/App.vue` | 窗口关闭改为隐藏而非销毁 |
| `src/views/TrayView.vue` | 优化状态同步机制 |

---

## 四、后续开发计划

### 4.1 托盘功能增强

1. **托盘图标状态显示**
   - 连接时显示绿色图标
   - 断开时显示灰色图标
   - 连接中显示动画图标

2. **托盘右键菜单**
   - 快速连接/断开
   - 显示主窗口
   - 退出应用

3. **托盘弹窗增强**
   - 显示当前服务器信息
   - 显示连接时长
   - 快速切换服务器

### 4.2 窗口管理优化

1. **开机自启动**
   - 添加开机自启动选项
   - 启动时最小化到托盘

2. **窗口状态记忆**
   - 记住窗口位置和大小
   - 下次启动恢复

### 4.3 代码质量改进

1. **类型安全**
   - 修复 TypeScript 类型错误
   - 添加路由 meta 类型定义

2. **错误处理**
   - 统一错误处理机制
   - 用户友好的错误提示

3. **测试覆盖**
   - 添加单元测试
   - 添加 E2E 测试

---

## 五、实现优先级

| 优先级 | 任务 | 预计工时 | 状态 |
|--------|------|----------|------|
| P0 | 修复窗口关闭断开连接 | 0.5h | ✅ 已完成 |
| P0 | 修复托盘弹窗定位 | 1h | ✅ 已完成 |
| P1 | 托盘图标状态显示 | 2h | 待开发 |
| P1 | 托盘右键菜单 | 2h | 待开发 |
| P2 | 开机自启动 | 1h | 待开发 |
| P2 | 窗口状态记忆 | 1h | 待开发 |

---

## 六、技术参考

### Tauri 2.0 托盘 API

```rust
// 获取点击位置
TrayIconEvent::Click { position, .. } => {
    // position: PhysicalPosition<f64>
}

// 设置托盘图标
tray.set_icon(Some(icon))?;

// 设置托盘菜单
tray.set_menu(Some(menu))?;
```

### macOS 特殊处理

```rust
// macOS 菜单栏高度约 22-24px
// 托盘图标通常在菜单栏中
// 弹窗应该显示在菜单栏下方
```

---

## 七、测试用例

### 7.1 窗口关闭测试
- [ ] 连接 VPN 后点击关闭按钮，VPN 保持连接
- [ ] 窗口隐藏后，托盘图标可见
- [ ] 点击托盘图标可以恢复窗口

### 7.2 托盘弹窗测试
- [ ] 点击托盘图标，弹窗显示在图标正下方
- [ ] 弹窗显示正确的连接状态
- [ ] 点击连接/断开按钮功能正常
- [ ] 点击退出按钮，VPN 断开并退出应用

### 7.3 状态同步测试
- [ ] 主窗口连接后，托盘弹窗显示已连接
- [ ] 托盘弹窗断开后，主窗口显示已断开
- [ ] 流量统计在两个窗口同步显示


---

## 八、本次修改汇总

### 8.1 已修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/App.vue` | 窗口关闭改为隐藏（最小化到托盘），不再断开 VPN |
| `src-tauri/src/lib.rs` | 移除窗口销毁时的 VPN 清理逻辑 |
| `src-tauri/src/tray.rs` | 使用托盘点击位置定位弹窗，支持多平台 |

### 8.2 修复的 Bug

1. **窗口关闭断开连接**
   - 原因：`onCloseRequested` 调用了 `performCleanup()` 断开 VPN
   - 修复：改为调用 `appWindow.hide()` 隐藏窗口

2. **托盘弹窗位置不正确**
   - 原因：使用屏幕中央位置，未使用托盘图标位置
   - 修复：保存 `TrayIconEvent::Click` 中的 `position`，根据平台定位

### 8.3 验证步骤

```bash
# 1. 编译 Rust 代码
cd src-tauri && cargo check

# 2. 构建前端
pnpm build

# 3. 运行开发模式测试
pnpm tauri:dev
```

### 8.4 测试清单

- [ ] 连接 VPN 后点击窗口关闭按钮，VPN 保持连接
- [ ] 窗口关闭后可通过托盘图标恢复
- [ ] 托盘弹窗显示在托盘图标正下方（macOS）
- [ ] 托盘弹窗中的连接/断开按钮正常工作
- [ ] 退出按钮可以正确断开 VPN 并退出应用

---

## 九、2025-12-09 第二次更新

### 9.1 新增功能

#### 1. 托盘弹窗田字格布局修复 ✅

**问题**：托盘弹窗没有正确显示田字格布局

**原因分析**：
- Tailwind CSS 类可能在托盘窗口中没有正确加载
- 需要使用内联样式确保布局正确

**解决方案**：
- 使用 scoped CSS 替代 Tailwind 类
- 明确定义 grid 布局和每个单元格样式
- 支持暗色模式

**修改文件**：`src/views/TrayView.vue`

#### 2. 网络连通性自动测试 ✅

**功能**：连接成功后自动测试外网连通性

**实现**：
- 新增 `src-tauri/src/vpn/connectivity.rs` 模块
- 提供 `test_connectivity` 命令，通过 SOCKS 代理测试
- 提供 `test_dns_resolution` 命令，测试 DNS 解析
- 连接成功后自动调用测试，结果显示在日志中

**新增文件**：
- `src-tauri/src/vpn/connectivity.rs`

**修改文件**：
- `src-tauri/src/vpn/mod.rs` - 添加模块
- `src-tauri/src/lib.rs` - 注册命令
- `src-tauri/Cargo.toml` - 添加 tokio 和 socks 依赖
- `src/stores/vpn.ts` - 添加测试函数和自动测试逻辑

### 9.2 TUN 模式连接问题排查

**可能原因**：
1. DNS 配置问题 - 使用 DoH 可能被阻断
2. 路由规则问题 - 某些流量可能没有正确路由
3. TUN 设备配置问题

**排查步骤**：
1. 检查 sing-box 日志 (`/tmp/tovpn-tun.log`)
2. 使用 `test_connectivity` 测试连通性
3. 检查系统路由表 (`netstat -rn`)
4. 检查 DNS 解析 (`nslookup google.com`)

**建议优化**：
1. 添加更详细的连接日志
2. 在连接失败时自动收集诊断信息
3. 提供手动测试连通性的 UI 按钮

### 9.3 本次修改文件汇总

| 文件 | 修改内容 |
|------|----------|
| `src/views/TrayView.vue` | 使用 scoped CSS 重写田字格布局 |
| `src-tauri/src/vpn/connectivity.rs` | 新增连通性测试模块 |
| `src-tauri/src/vpn/mod.rs` | 添加 connectivity 模块 |
| `src-tauri/src/lib.rs` | 注册测试命令 |
| `src-tauri/Cargo.toml` | 添加 tokio、socks 依赖 |
| `src/stores/vpn.ts` | 添加测试函数，连接后自动测试 |
