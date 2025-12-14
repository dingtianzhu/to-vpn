# 托盘功能文件参考

> 最后更新: 2025-12-09

## 文件列表

### 1. src-tauri/src/tray.rs
Rust 托盘模块，处理系统托盘图标和弹窗窗口管理。

### 2. src/views/TrayView.vue
托盘弹窗 Vue 组件，田字格布局：
- 左上：上传速度
- 右上：下载速度
- 左下：连接/断开按钮
- 右下：分为上下两部分（主页按钮 + 退出按钮）

### 3. src/stores/i18n.ts
国际化配置，包含 `tray` 命名空间的翻译：
- `tray.upload` / `tray.download`
- `tray.connect` / `tray.disconnect`
- `tray.connecting` / `tray.disconnecting`
- `tray.home` / `tray.exit`

### 4. src/router/index.ts
路由配置，包含 `/tray` 路由。

### 5. src-tauri/tauri.conf.json
Tauri 配置，启用 `macOSPrivateApi` 以支持透明窗口和毛玻璃效果。

### 6. src-tauri/src/lib.rs
注册托盘相关命令：
- `hide_tray_popup`
- `show_main_window`
- `minimize_to_tray`

## 样式特性

- macOS 毛玻璃效果 (`backdrop-filter: blur(20px)`)
- 圆角设计 (`border-radius: 12px`)
- 支持亮色/暗色模式
- 响应式悬停效果

## 使用的 i18n 键

```typescript
t.tray.upload      // "上传" / "Upload"
t.tray.download    // "下载" / "Download"
t.tray.connect     // "连接" / "Connect"
t.tray.disconnect  // "断开" / "Disconnect"
t.tray.connecting  // "连接中..." / "Connecting..."
t.tray.disconnecting // "断开中..." / "Disconnecting..."
t.tray.home        // "主页" / "Home"
t.tray.exit        // "退出" / "Exit"
```
