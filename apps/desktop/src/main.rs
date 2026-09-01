// Release builds must not spawn a console window behind the shell.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod platform;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "dl_desktop=debug,dl_wm=debug".into()),
        )
        .init();

    let shell = platform::shell();

    // A corrupt config is fatal rather than silently reset: it holds every slot
    // layout, and starting fresh would discard them without telling anyone.
    let config = match dl_config::load() {
        Ok(config) => config,
        Err(e) => {
            tracing::error!("{e}");
            eprintln!("Developer Layer could not start: {e}");
            std::process::exit(1);
        }
    };

    let engine = dl_engine::Engine::new(shell, config);
    tracing::info!(
        monitors = engine.monitors().len(),
        layout = ?engine.layout_source(),
        "starting Developer Layer"
    );

    tauri::Builder::default()
        .manage(commands::AppState::new(engine))
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::list_monitors,
            commands::list_windows,
            commands::get_layout,
            commands::run_pass,
            commands::sync_displays,
            commands::move_border,
            commands::split_slot,
            commands::remove_slot,
            commands::assign_app,
            commands::save_layout,
            commands::is_dirty,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start the Tauri application");
}
