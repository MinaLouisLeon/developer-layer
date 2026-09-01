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
    tracing::info!(
        monitors = shell.monitors().map(|m| m.len()).unwrap_or(0),
        "starting Developer Layer"
    );

    tauri::Builder::default()
        .manage(commands::AppState::new(shell))
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::list_monitors,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start the Tauri application");
}
