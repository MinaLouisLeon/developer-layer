// Release builds must not spawn a console window behind the shell.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod archive;
mod atlas;
mod commands;
mod mino;
mod platform;

/// Window labels, as `tauri.conf.json` declares them.
const SHELL_WINDOW: &str = "shell";
const MINO_WINDOW: &str = "mino";
const ATLAS_WINDOW: &str = "atlas";

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

    // Validated before the window exists, so a bad accelerator is a startup
    // error naming the setting rather than a hotkey that silently never fires.
    // Refusing to start is right here: one of these two is the route back from
    // a hidden taskbar, and starting without it is starting without a way out.
    let hotkeys = match dl_atlas::hotkey::parse_all(
        &config.atlas.command_bar_hotkey,
        &config.general.panic_restore_hotkey,
    ) {
        Ok(hotkeys) => hotkeys,
        Err(e) => {
            tracing::error!("{e}");
            eprintln!("Developer Layer could not start: {e}");
            eprintln!(
                "Fix `atlas.commandBarHotkey` or `general.panicRestoreHotkey` in the config."
            );
            std::process::exit(1);
        }
    };

    let recents = atlas::load_recents();
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
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(mino::state::AppState::new())
        .setup({
            let metrics = metrics.clone();
            let hotkeys = hotkeys.clone();
            move |app| {
                spawn_sampler(app.handle().clone(), metrics);
                register_hotkeys(app.handle(), &hotkeys);
                Ok(())
            }
        })
        .manage(commands::AppState::new(engine, metrics, apps, recents))
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
            atlas::atlas_search,
            atlas::atlas_run,
            atlas::atlas_toggle,
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

/// Register both global hotkeys.
///
/// Neither is fatal to miss. A hotkey another application already owns fails to
/// register, and there is nothing to be done about that from here — but the
/// shell still works, so it is a loud warning rather than an exit. The two are
/// registered separately for the same reason: whichever one is taken, the
/// other should still work, and the taskbar restore hotkey is the one that
/// matters most.
/// One accelerator, what to call it in a log line, and what it does.
type Binding = (String, &'static str, fn(&tauri::AppHandle));

fn register_hotkeys(app: &tauri::AppHandle, hotkeys: &dl_atlas::Hotkeys) {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

    let bindings: [Binding; 2] = [
        (
            hotkeys.command_bar.accelerator(),
            "command bar",
            atlas::toggle,
        ),
        (
            hotkeys.restore_taskbar.accelerator(),
            "taskbar restore",
            restore_taskbar,
        ),
    ];

    for (accelerator, what, action) in bindings {
        let registered = app.global_shortcut().on_shortcut(
            accelerator.as_str(),
            move |app, _shortcut, event| {
                // Both edges arrive. Acting on the press alone stops a
                // held key repeating the action, and stops the release
                // toggling the bar straight back shut.
                if event.state() == ShortcutState::Pressed {
                    action(app);
                }
            },
        );

        match registered {
            Ok(()) => tracing::info!(%accelerator, what, "hotkey registered"),
            Err(e) => tracing::error!(
                %accelerator, what, %e,
                "hotkey could not be registered; another application probably owns it"
            ),
        }
    }
}

/// Put the native taskbar back, from the hotkey.
///
/// One of the four routes out of a hidden shell, and the only one a user can
/// reach deliberately while everything is still running. The other three cover
/// what this cannot: a panic, an unhandled exception, and a hard kill.
fn restore_taskbar(app: &tauri::AppHandle) {
    use tauri::Manager;

    let Some(state) = app.try_state::<commands::AppState>() else {
        return;
    };
    let Ok(mut engine) = state.engine().lock() else {
        return;
    };

    if let Err(e) = engine.set_taskbar_replacement(false) {
        tracing::error!(%e, "the restore hotkey could not put the taskbar back");
        return;
    }
    if let Err(e) = dl_config::save(engine.config()) {
        // The taskbar is back either way; only the setting failed to stick.
        tracing::warn!(%e, "could not persist the taskbar setting");
    }
    tracing::info!("native taskbar restored by hotkey");
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

#[cfg(test)]
mod tests {
    use tauri_plugin_global_shortcut::Shortcut;

    /// The canonical accelerators `dl-atlas` produces have to be the ones the
    /// registrar accepts.
    ///
    /// `dl-atlas` normalises spelling and case so two ways of writing one
    /// hotkey compare equal, and it cannot test that its output still parses
    /// — it does not depend on Tauri, and should not. This is the other half:
    /// without it a normalisation change would register nothing and the only
    /// symptom would be a hotkey that quietly stopped working.
    #[test]
    fn every_canonical_accelerator_parses_through_the_registrar() {
        let config = dl_core::Config::default();
        let hotkeys = dl_atlas::hotkey::parse_all(
            &config.atlas.command_bar_hotkey,
            &config.general.panic_restore_hotkey,
        )
        .expect("the shipped defaults are valid");

        for accelerator in [
            hotkeys.command_bar.accelerator(),
            hotkeys.restore_taskbar.accelerator(),
        ] {
            accelerator
                .parse::<Shortcut>()
                .unwrap_or_else(|e| panic!("{accelerator} was rejected: {e}"));
        }
    }

    /// Case and spelling are normalised away, so whatever the user wrote comes
    /// out as something the registrar takes.
    #[test]
    fn a_hand_written_setting_still_registers_after_normalisation() {
        for written in ["alt + space", "CTRL+shift+pageup", "win+k", "Ctrl+Alt+F5"] {
            let hotkey = dl_atlas::hotkey::parse(written).expect(written);
            let accelerator = hotkey.accelerator();
            accelerator
                .parse::<Shortcut>()
                .unwrap_or_else(|e| panic!("{written} became {accelerator}, rejected: {e}"));
        }
    }
}
