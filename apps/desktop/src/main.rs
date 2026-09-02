// Release builds must not spawn a console window behind the shell.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod archive;
mod commands;
mod mino;
mod platform;

/// The workbench window's label, as `tauri.conf.json` declares it.
const MINO_WINDOW: &str = "mino";

fn main() {
    // The guardian branch runs before anything else: it is the same binary
    // re-executed with a flag, and it must not build a whole shell just to
    // wait on a process handle.
    #[cfg(windows)]
    if let Some(parent) = guardian_parent() {
        dl_platform_win::run_guardian(parent);
        return;
    }

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

    let icon_cache = dl_config::config_dir()
        .map(|d| d.join("icons"))
        .unwrap_or_else(|_| std::path::PathBuf::from("icons"));
    let apps = dl_apps::AppService::new(icon_cache);

    let metrics = dl_metrics::shared(&config.telemetry);
    let engine = dl_engine::Engine::new(shell, config);
    tracing::info!(
        monitors = engine.monitors().len(),
        layout = ?engine.layout_source(),
        "starting Developer Layer"
    );

    tauri::Builder::default()
        // The workbench's two plugins. Nothing else in the shell uses them:
        // every filesystem and process call goes through mino's transport
        // commands, and `opener` exists so a github.com address leaves through
        // the operating system's browser rather than by letting a webview be
        // navigated somewhere it was not built for.
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(mino::state::AppState::new())
        .setup({
            let metrics = metrics.clone();
            move |app| {
                spawn_sampler(app.handle().clone(), metrics);
                Ok(())
            }
        })
        .manage(commands::AppState::new(engine, metrics, apps))
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
            commands::latest_metrics,
            commands::metrics_history,
            commands::discover_apps,
            commands::app_icon,
            commands::launch_app,
            commands::refresh_pinned_apps,
            commands::dock_entries,
            commands::set_foreground,
            commands::click_dock_entry,
            commands::window_thumbnail,
            commands::set_taskbar_replacement,
            archive::archive_available,
            archive::archive_supported,
            archive::archive_extract,
            archive::archive_compress,
            // The vendored workbench's forty, under upstream's own names. See
            // `mino.rs` for why they are not prefixed.
            mino::commands::connection::connect,
            mino::commands::connection::disconnect,
            mino::commands::fs::list_dir,
            mino::commands::fs::stat,
            mino::commands::fs::search_files,
            mino::commands::fs::read_file,
            mino::commands::fs::write_file,
            mino::commands::git::git_repository,
            mino::commands::git::git_status,
            mino::commands::git::git_stage,
            mino::commands::git::git_unstage,
            mino::commands::git::git_discard,
            mino::commands::git::git_commit,
            mino::commands::git_history::git_diff,
            mino::commands::git_history::git_log,
            mino::commands::git_history::git_show,
            mino::commands::git_history::git_commit_diff,
            mino::commands::git_history::git_blame,
            mino::commands::git_branches::git_branches,
            mino::commands::git_branches::git_checkout,
            mino::commands::git_branches::git_create_branch,
            mino::commands::git_branches::git_delete_branch,
            mino::commands::git_stash::git_stash_list,
            mino::commands::git_stash::git_stash_push,
            mino::commands::git_stash::git_stash_apply,
            mino::commands::git_stash::git_stash_drop,
            mino::commands::git_remote::git_remotes,
            mino::commands::git_remote::git_fetch,
            mino::commands::git_remote::git_pull,
            mino::commands::git_remote::git_push,
            mino::commands::git_remote::git_conflicts,
            mino::commands::git_remote::git_resolve,
            mino::commands::github::github_probe,
            mino::commands::github::github_query,
            mino::commands::pty::open_pty,
            mino::commands::pty::write_pty,
            mino::commands::pty::resize_pty,
            mino::commands::pty::close_pty,
            mino::commands::shell::run_structured,
            mino::commands::shell::probe_shell,
        ])
        .on_window_event(|window, event| {
            // Closing the workbench must not leave a shell running behind it.
            // The registry also kills sessions on drop; this makes it
            // immediate, and it is scoped to that window so closing the
            // Developer Layer shell does not tear down a workbench the user
            // is still using.
            if window.label() == MINO_WINDOW && matches!(event, tauri::WindowEvent::Destroyed) {
                use tauri::Manager;
                if let Some(transport) = window.state::<mino::state::AppState>().take() {
                    tauri::async_runtime::block_on(async move {
                        let _ = transport.disconnect().await;
                    });
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to start the Tauri application");
}

/// Sample telemetry on its own thread and push each snapshot to the frontend.
///
/// Pushing rather than polling is deliberate: the UI never asks for data it
/// already has, and the ring buffer in Rust keeps history across panel
/// remounts. The thread is detached — it ends with the process.
fn spawn_sampler(app: tauri::AppHandle, metrics: dl_metrics::SharedMetrics) {
    std::thread::Builder::new()
        .name("dl-telemetry".into())
        .spawn(move || {
            use tauri::Emitter;

            loop {
                let (snapshot, interval) = {
                    let Ok(mut service) = metrics.lock() else {
                        // A poisoned lock means a sampler panic; stopping is
                        // better than spinning on a broken service.
                        break;
                    };
                    (service.tick(), service.interval_ms())
                };

                // A closed window is not an error worth logging every second.
                let _ = app.emit("telemetry", &snapshot);

                std::thread::sleep(std::time::Duration::from_millis(interval));
            }
        })
        .expect("failed to spawn the telemetry thread");
}

/// The parent PID when this process was launched as a taskbar guardian.
#[cfg(windows)]
fn guardian_parent() -> Option<u32> {
    let mut args = std::env::args().skip(1);
    if args.next().as_deref() != Some(dl_platform_win::GUARDIAN_FLAG) {
        return None;
    }
    args.next()?.parse().ok()
}
