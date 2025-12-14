use tauri::{
    tray::{TrayIcon, TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
    Manager, Runtime, Emitter, PhysicalPosition,
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

static TRAY_POPUP_VISIBLE: AtomicBool = AtomicBool::new(false);
// 存储最后一次点击的托盘位置
static LAST_TRAY_POSITION: Mutex<Option<(f64, f64)>> = Mutex::new(None);

pub fn create_tray<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<TrayIcon<R>> {
    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("ToVPN")
        .on_tray_icon_event(|tray, event| {
            match event {
                TrayIconEvent::Click { 
                    button: MouseButton::Left, 
                    button_state: MouseButtonState::Up, 
                    position,
                    .. 
                } => {
                    // 保存点击位置
                    if let Ok(mut pos) = LAST_TRAY_POSITION.lock() {
                        *pos = Some((position.x, position.y));
                    }
                    let app = tray.app_handle();
                    toggle_tray_popup(app);
                }
                _ => {}
            }
        })
        .build(app)
}

fn toggle_tray_popup<R: Runtime>(app: &tauri::AppHandle<R>) {
    let is_visible = TRAY_POPUP_VISIBLE.load(Ordering::SeqCst);
    
    if is_visible {
        // 隐藏弹窗
        if let Some(popup) = app.get_webview_window("tray_popup") {
            let _ = popup.hide();
        }
        TRAY_POPUP_VISIBLE.store(false, Ordering::SeqCst);
    } else {
        // 显示弹窗
        show_tray_popup(app);
    }
}

fn show_tray_popup<R: Runtime>(app: &tauri::AppHandle<R>) {
    // 获取保存的托盘点击位置
    let tray_pos = LAST_TRAY_POSITION.lock().ok().and_then(|p| *p);
    
    // 获取或创建弹窗
    let popup = if let Some(existing) = app.get_webview_window("tray_popup") {
        existing
    } else {
        // 创建新窗口 - 使用 Hash 路由格式
        // macOS 毛玻璃效果需要 transparent + macOSPrivateApi
        let mut builder = tauri::WebviewWindowBuilder::new(
            app,
            "tray_popup",
            tauri::WebviewUrl::App("/#/tray".into()),
        )
        .title("ToVPN Tray")
        .inner_size(200.0, 200.0)
        .min_inner_size(200.0, 200.0)
        .max_inner_size(200.0, 200.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .transparent(true);  // 启用透明以支持毛玻璃效果
        
        // macOS 特定：设置窗口为面板类型，类似系统弹窗
        #[cfg(target_os = "macos")]
        {
            builder = builder
                .title_bar_style(tauri::TitleBarStyle::Overlay)
                .hidden_title(true);
        }
        
        let popup = builder.build();
        
        match popup {
            Ok(w) => {
                tracing::info!("Tray popup window created successfully");
                w
            },
            Err(e) => {
                tracing::error!("Failed to create tray popup: {}", e);
                return;
            }
        }
    };
    
    // 根据托盘图标位置定位窗口
    if let Some((tray_x, tray_y)) = tray_pos {
        #[cfg(target_os = "macos")]
        {
            // macOS: 托盘在顶部菜单栏，弹窗显示在托盘图标正下方
            // 窗口宽度 200，居中对齐托盘图标
            let x = (tray_x - 100.0).max(10.0) as i32;
            // 菜单栏高度约 24px，弹窗显示在其下方
            let y = (tray_y + 5.0) as i32;
            let _ = popup.set_position(tauri::Position::Physical(
                PhysicalPosition::new(x, y)
            ));
        }
        
        #[cfg(target_os = "windows")]
        {
            // Windows: 托盘在右下角，弹窗显示在托盘图标上方
            let x = (tray_x - 100.0).max(10.0) as i32;
            let y = (tray_y - 210.0).max(10.0) as i32;  // 窗口高度 200 + 间距
            let _ = popup.set_position(tauri::Position::Physical(
                PhysicalPosition::new(x, y)
            ));
        }
        
        #[cfg(target_os = "linux")]
        {
            // Linux: 根据托盘位置判断
            let x = (tray_x - 100.0).max(10.0) as i32;
            let y = if tray_y < 100.0 {
                // 托盘在顶部
                (tray_y + 30.0) as i32
            } else {
                // 托盘在底部
                (tray_y - 210.0).max(10.0) as i32
            };
            let _ = popup.set_position(tauri::Position::Physical(
                PhysicalPosition::new(x, y)
            ));
        }
    } else {
        // 没有位置信息时，使用屏幕中央顶部作为备选
        if let Ok(Some(monitor)) = popup.current_monitor() {
            let size = monitor.size();
            let scale = monitor.scale_factor();
            let x = (size.width as f64 / scale / 2.0 - 100.0) as i32;
            let _ = popup.set_position(tauri::Position::Physical(
                PhysicalPosition::new(x, 30)
            ));
        }
    }
    
    let _ = popup.show();
    let _ = popup.set_focus();
    TRAY_POPUP_VISIBLE.store(true, Ordering::SeqCst);
    
    // 发送事件通知前端更新数据
    let _ = app.emit("tray-popup-shown", ());
}

/// 隐藏托盘弹窗（供前端调用）
#[tauri::command]
pub fn hide_tray_popup(app: tauri::AppHandle) {
    if let Some(popup) = app.get_webview_window("tray_popup") {
        let _ = popup.hide();
    }
    TRAY_POPUP_VISIBLE.store(false, Ordering::SeqCst);
}

/// 显示主窗口
#[tauri::command]
pub fn show_main_window(app: tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
        let _ = main.unminimize();
    }
    // 同时隐藏托盘弹窗
    hide_tray_popup(app);
}

/// 最小化到托盘
#[tauri::command]
pub fn minimize_to_tray(app: tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }
}
