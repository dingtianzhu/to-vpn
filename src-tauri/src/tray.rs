use std::sync::Mutex;
use tauri::{
    image::Image,
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, PhysicalPosition, Runtime, WebviewWindow,
};

// 存储最后一次交互的托盘位置
static LAST_TRAY_POSITION: Mutex<Option<(f64, f64)>> = Mutex::new(None);

pub fn create_tray<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<TrayIcon<R>> {
    // === 修复问题 4: 托盘图标不生效 ===
    // 使用 include_bytes! 直接将图片编译进程序，路径相对于当前 rs 文件
    // 假设 tray.rs 在 src-tauri/src/tray.rs，图片在 src-tauri/icons/tray.png
    // 所以路径是 "../icons/tray.png"
    let icon_data = include_bytes!("../icons/tray.png");

    // 从字节转换图片，这需要 Cargo.toml 里有 "image-png" feature
    let icon = Image::from_bytes(icon_data).unwrap_or_else(|e| {
        tracing::error!("Failed to parse tray icon: {}", e);
        // 如果解析失败，回退到默认图标
        app.default_window_icon().unwrap().clone()
    });

    TrayIconBuilder::new()
        .icon(icon)
        // macOS 设为 true：自动变黑白适应系统主题
        // 如果你的图标是有颜色的且想保留颜色，设为 false
        .icon_as_template(true)
        .tooltip("ToVPN")
        .on_tray_icon_event(|tray, event| {
            // ... 保持原有逻辑不变
            let app = tray.app_handle();
            match event {
                TrayIconEvent::Click {
                    button: MouseButton::Left | MouseButton::Right,
                    button_state: MouseButtonState::Up,
                    position,
                    ..
                } => {
                    if let Ok(mut pos) = LAST_TRAY_POSITION.lock() {
                        *pos = Some((position.x, position.y));
                    }
                    handle_tray_click(app);
                }
                _ => {}
            }
        })
        .build(app)
}
fn handle_tray_click<R: Runtime>(app: &tauri::AppHandle<R>) {
    let popup = ensure_tray_window(app);

    if popup.is_visible().unwrap_or(false) {
        let _ = popup.hide();
        // 这里可以在关闭时切换回"未选中"图标（如果有需求）
    } else {
        show_tray_popup_internal(app, &popup);
        // 这里可以在打开时切换为"选中"图标（如果有需求）
    }
}

fn ensure_tray_window<R: Runtime>(app: &tauri::AppHandle<R>) -> WebviewWindow<R> {
    if let Some(existing) = app.get_webview_window("tray_popup") {
        return existing;
    }

    // 设置一个固定尺寸，比如 240x280
    let width = 240.0;
    let height = 280.0;

    let mut builder = tauri::WebviewWindowBuilder::new(
        app,
        "tray_popup",
        tauri::WebviewUrl::App("/#/tray".into()),
    )
    .inner_size(width, height)
    .resizable(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .transparent(true) // 必须
    .shadow(false); // 必须：关闭系统阴影，否则系统会强行加个矩形底框

    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true);
    }

    builder.build().expect("Failed to create tray window")
}

fn show_tray_popup_internal<R: Runtime>(app: &tauri::AppHandle<R>, popup: &WebviewWindow<R>) {
    let tray_pos = LAST_TRAY_POSITION.lock().ok().and_then(|p| *p);

    if let Some((tray_x, tray_y)) = tray_pos {
        #[cfg(target_os = "macos")]
        {
            // 居中对齐图标
            let x = (tray_x - 110.0).max(10.0) as i32; // 220的一半是110
            let y = (tray_y + 10.0) as i32;
            let _ = popup.set_position(tauri::Position::Physical(PhysicalPosition::new(x, y)));
        }
        #[cfg(target_os = "windows")]
        {
            let x = (tray_x - 110.0).max(10.0) as i32;
            let y = (tray_y - 230.0).max(10.0) as i32;
            let _ = popup.set_position(tauri::Position::Physical(PhysicalPosition::new(x, y)));
        }
        // Linux...
    } else {
        if let Ok(Some(monitor)) = popup.current_monitor() {
            let size = monitor.size();
            let x = (size.width as i32 - 220) / 2;
            let y = (size.height as i32 - 220) / 2;
            let _ = popup.set_position(tauri::Position::Physical(PhysicalPosition::new(x, y)));
        }
    }

    let _ = popup.show();
    let _ = popup.set_focus();
    let _ = app.emit("tray-popup-shown", ());
}

// ... hide_tray_popup, show_main_window, minimize_to_tray 保持不变 ...
// 注意：记得补全这三个函数的原有代码
#[tauri::command]
pub fn hide_tray_popup(app: tauri::AppHandle) {
    if let Some(popup) = app.get_webview_window("tray_popup") {
        let _ = popup.hide();
    }
}

#[tauri::command]
pub fn show_main_window(app: tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        #[cfg(target_os = "macos")]
        app.set_activation_policy(tauri::ActivationPolicy::Regular)
            .unwrap();
        let _ = main.show();
        let _ = main.set_focus();
        let _ = main.unminimize();
    }
    hide_tray_popup(app);
}

#[tauri::command]
pub fn minimize_to_tray(app: tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
        #[cfg(target_os = "macos")]
        app.set_activation_policy(tauri::ActivationPolicy::Accessory)
            .unwrap();
        #[cfg(not(target_os = "macos"))]
        let _ = main.set_skip_taskbar(true);
    }
}
