//! 结构化日志模块
//! 使用 tracing 提供结构化、可过滤的日志

use tracing_subscriber::{
    fmt::{self, format::FmtSpan},
    layer::SubscriberExt,
    util::SubscriberInitExt,
    EnvFilter,
};

/// 初始化日志系统
pub fn init() {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| {
            // 默认日志级别
            // - tovpn: debug (本项目详细日志)
            // - 其他: warn (减少噪音)
            EnvFilter::new("warn,tovpn=debug")
        });

    let fmt_layer = fmt::layer()
        .with_target(true)
        .with_thread_ids(false)
        .with_thread_names(false)
        .with_file(true)
        .with_line_number(true)
        .with_span_events(FmtSpan::CLOSE)
        .compact();

    tracing_subscriber::registry()
        .with(filter)
        .with(fmt_layer)
        .init();

    tracing::info!("Logging initialized");
}
