use std::path::PathBuf;

#[cfg(not(target_os = "android"))]
use std::sync::Mutex;

use tauri::Manager;

#[cfg(not(target_os = "android"))]
use serde::Serialize;

// ─── Steam state (desktop only) ───────────────────────────────────────────────

/// Steam state kept alive for the lifetime of the app (identity, achievements, etc.).
/// Client is Send + Sync in steamworks 0.12.
#[cfg(not(target_os = "android"))]
struct SteamApp {
    client: steamworks::Client,
    user_name: String,
    steam_id: u64,
    app_id: u32,
    /// Keeps Remote Play callback registrations alive for the app lifetime.
    #[allow(dead_code)]
    _remote_play_cbs: Vec<steamworks::CallbackHandle>,
}

#[cfg(not(target_os = "android"))]
type SteamState = Mutex<Option<SteamApp>>;

// ─── Gilrs state (desktop only) ───────────────────────────────────────────────

/// gilrs gamepad polling state.  Initialised lazily on first poll.
#[cfg(not(target_os = "android"))]
struct GilrsState {
    gilrs: Mutex<Option<gilrs::Gilrs>>,
}

/// Serialisable per-gamepad snapshot returned to JS.
#[cfg(not(target_os = "android"))]
#[derive(Serialize)]
struct GamepadSnapshot {
    /// Opaque numeric id (gilrs GamepadId as usize)
    id: usize,
    /// Human-readable name from the driver
    name: String,
    /// 16 bools in W3C Standard Gamepad order (indices 0-15)
    buttons: Vec<bool>,
    /// 4 floats: LeftStickX, LeftStickY, RightStickX, RightStickY
    axes: [f32; 4],
    /// W3C button indices that fired a ButtonPressed event since the last poll.
    /// Guarantees detection of brief presses even if the button was already
    /// released by the time this snapshot is read.
    pressed_events: Vec<usize>,
}

// ─── Steam commands (desktop only) ────────────────────────────────────────────

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn steam_get_user_name(state: tauri::State<SteamState>) -> Result<String, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    guard.as_ref()
        .map(|s| s.user_name.clone())
        .ok_or_else(|| "Steam not initialized".to_string())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn steam_get_steam_id(state: tauri::State<SteamState>) -> Result<u64, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    guard.as_ref()
        .map(|s| s.steam_id)
        .ok_or_else(|| "Steam not initialized".to_string())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn steam_get_app_id(state: tauri::State<SteamState>) -> Result<u32, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    guard.as_ref()
        .map(|s| s.app_id)
        .ok_or_else(|| "Steam not initialized".to_string())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn steam_is_dev() -> bool {
    cfg!(debug_assertions)
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn steam_quit(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn steam_activate_overlay(state: tauri::State<SteamState>, dialog: String) -> Result<(), String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    guard.as_ref()
        .map(|s| { s.client.friends().activate_game_overlay(&dialog); })
        .ok_or_else(|| "Steam not initialized".to_string())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn steam_activate_overlay_to_store(state: tauri::State<SteamState>) -> Result<(), String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    guard.as_ref()
        .map(|s| {
            s.client.friends().activate_game_overlay_to_store(
                steamworks::AppId(4429000),
                steamworks::OverlayToStoreFlag::None,
            );
        })
        .ok_or_else(|| "Steam not initialized".to_string())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn steam_unlock_achievement(state: tauri::State<SteamState>, achievement_id: String) -> Result<(), String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    guard.as_ref()
        .map(|s| {
            s.client.user_stats().achievement(&achievement_id).set().ok();
            s.client.user_stats().store_stats().ok();
        })
        .ok_or_else(|| "Steam not initialized".to_string())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn open_devtools(window: tauri::WebviewWindow) {
    window.open_devtools();
}

#[tauri::command]
fn open_url(url: String) {
    #[cfg(target_os = "macos")]
    { std::process::Command::new("open").arg(&url).spawn().ok(); }
    #[cfg(target_os = "windows")]
    { std::process::Command::new("cmd").args(["/C", "start", "", &url]).spawn().ok(); }
    #[cfg(target_os = "linux")]
    { std::process::Command::new("xdg-open").arg(&url).spawn().ok(); }
    #[cfg(target_os = "android")]
    { let _ = url; }
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn steam_get_stat_i32(state: tauri::State<SteamState>, stat_name: String) -> Result<i32, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    guard.as_ref()
        .map(|s| s.client.user_stats().get_stat_i32(&stat_name).unwrap_or(0))
        .ok_or_else(|| "Steam not initialized".to_string())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn steam_get_unlocked_achievements(state: tauri::State<SteamState>, ids: Vec<String>) -> Result<Vec<String>, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    guard.as_ref()
        .map(|s| {
            ids.into_iter()
                .filter(|id| s.client.user_stats().achievement(id).get().unwrap_or(false))
                .collect()
        })
        .ok_or_else(|| "Steam not initialized".to_string())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn steam_set_stat(state: tauri::State<SteamState>, stat_name: String, value: i32) -> Result<(), String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    guard.as_ref()
        .map(|s| {
            s.client.user_stats().set_stat_i32(&stat_name, value).ok();
            s.client.user_stats().store_stats().ok();
        })
        .ok_or_else(|| "Steam not initialized".to_string())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn steam_clear_achievement(state: tauri::State<SteamState>, achievement_id: String) -> Result<(), String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    guard.as_ref()
        .map(|s| {
            s.client.user_stats().achievement(&achievement_id).clear().ok();
            s.client.user_stats().store_stats().ok();
        })
        .ok_or_else(|| "Steam not initialized".to_string())
}

// ─── Gilrs commands (desktop only) ────────────────────────────────────────────

/// Map a gilrs Button to W3C Standard Gamepad button index (0-15).
#[cfg(not(target_os = "android"))]
fn gilrs_button_to_w3c(btn: gilrs::Button) -> Option<usize> {
    use gilrs::Button::*;
    match btn {
        South        => Some(0),
        East         => Some(1),
        West         => Some(2),
        North        => Some(3),
        LeftTrigger  => Some(4),
        RightTrigger => Some(5),
        LeftTrigger2 => Some(6),
        RightTrigger2=> Some(7),
        Select       => Some(8),
        Start        => Some(9),
        LeftThumb    => Some(10),
        RightThumb   => Some(11),
        DPadUp       => Some(12),
        DPadDown     => Some(13),
        DPadLeft     => Some(14),
        DPadRight    => Some(15),
        _            => None,
    }
}

/// All gilrs buttons we care about, in probe order.
#[cfg(not(target_os = "android"))]
const GILRS_BUTTONS: [gilrs::Button; 16] = [
    gilrs::Button::South,
    gilrs::Button::East,
    gilrs::Button::West,
    gilrs::Button::North,
    gilrs::Button::LeftTrigger,
    gilrs::Button::RightTrigger,
    gilrs::Button::LeftTrigger2,
    gilrs::Button::RightTrigger2,
    gilrs::Button::Select,
    gilrs::Button::Start,
    gilrs::Button::LeftThumb,
    gilrs::Button::RightThumb,
    gilrs::Button::DPadUp,
    gilrs::Button::DPadDown,
    gilrs::Button::DPadLeft,
    gilrs::Button::DPadRight,
];

/// Poll all connected gamepads via gilrs.
/// Returns an array of GamepadSnapshot objects compatible with W3C Standard Gamepad layout.
#[cfg(not(target_os = "android"))]
#[tauri::command]
fn gilrs_poll(state: tauri::State<GilrsState>) -> Result<Vec<GamepadSnapshot>, String> {
    let mut guard = state.gilrs.lock().map_err(|e| e.to_string())?;

    // Lazy-init gilrs on first call
    if guard.is_none() {
        match gilrs::Gilrs::new() {
            Ok(g) => {
                eprintln!("[gilrs] Initialized");
                *guard = Some(g);
            }
            Err(e) => return Err(format!("gilrs init failed: {:?}", e)),
        }
    }

    let gilrs = guard.as_mut().unwrap();

    // Drain events, collecting ButtonPressed events so brief taps are never lost.
    // If we only drained and then read is_pressed(), a button pressed-and-released
    // between two polls would be completely invisible to JS.
    let mut pressed_events_map: std::collections::HashMap<usize, Vec<usize>> =
        std::collections::HashMap::new();
    while let Some(event) = gilrs.next_event() {
        if let gilrs::EventType::ButtonPressed(btn, _) = event.event {
            if let Some(idx) = gilrs_button_to_w3c(btn) {
                let pad_id: usize = event.id.into();
                pressed_events_map.entry(pad_id).or_default().push(idx);
            }
        }
    }

    let mut result = Vec::new();

    for (id, gamepad) in gilrs.gamepads() {
        if !gamepad.is_connected() {
            continue;
        }

        // Build 16-element button array in W3C order
        let mut buttons = vec![false; 16];
        for &btn in &GILRS_BUTTONS {
            if let Some(idx) = gilrs_button_to_w3c(btn) {
                buttons[idx] = gamepad.is_pressed(btn);
            }
        }

        // Read stick axes
        use gilrs::Axis;
        let axes = [
            gamepad.value(Axis::LeftStickX),
            -gamepad.value(Axis::LeftStickY),   // gilrs: +up, W3C: +down
            gamepad.value(Axis::RightStickX),
            -gamepad.value(Axis::RightStickY),  // gilrs: +up, W3C: +down
        ];

        let pad_id: usize = id.into();
        let pressed_events = pressed_events_map.remove(&pad_id).unwrap_or_default();

        result.push(GamepadSnapshot {
            id: pad_id,
            name: gamepad.name().to_string(),
            buttons,
            axes,
            pressed_events,
        });
    }

    Ok(result)
}

// ─── Storage helpers (all platforms) ─────────────────────────────────────────

const SAVE_FILENAME: &str = "diception_save.sav";

fn get_save_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir error: {e}"))?;
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("mkdir error: {e}"))?;
    Ok(data_dir.join(SAVE_FILENAME))
}

/// Read all saved key-value pairs as a JSON object string.
/// Returns `"{}"` if the save file does not yet exist.
#[tauri::command]
fn storage_read_all(app_handle: tauri::AppHandle) -> Result<String, String> {
    let path = get_save_path(&app_handle)?;
    if !path.exists() {
        return Ok("{}".to_string());
    }
    std::fs::read_to_string(&path).map_err(|e| format!("read error: {e}"))
}

/// Persist all key-value pairs (JSON object string) to the save file.
#[tauri::command]
fn storage_write_all(app_handle: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = get_save_path(&app_handle)?;
    std::fs::write(&path, data).map_err(|e| format!("write error: {e}"))
}

/// Return the absolute path of the save file (for diagnostics).
#[tauri::command]
fn storage_get_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    let path = get_save_path(&app_handle)?;
    Ok(path.to_string_lossy().to_string())
}

// ─── Android commands ─────────────────────────────────────────────────────────

#[tauri::command]
fn android_quit(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

#[tauri::command]
fn android_is_dev() -> bool {
    cfg!(debug_assertions)
}

// ─── JS init scripts ──────────────────────────────────────────────────────────

#[cfg(not(target_os = "android"))]
const STEAM_INIT_SCRIPT: &str = r#"
(function() {
    var ipc = window.__TAURI_INTERNALS__;
    if (!ipc) return;
    window.steam = {
        getUserName:      function()         { return ipc.invoke('steam_get_user_name'); },
        getSteamId:       function()         { return ipc.invoke('steam_get_steam_id'); },
        getAppId:         function()         { return ipc.invoke('steam_get_app_id'); },
        isDev:            function()         { return ipc.invoke('steam_is_dev'); },
        quit:             function()         { return ipc.invoke('steam_quit'); },
        activateOverlay:  function(dialog)   { return ipc.invoke('steam_activate_overlay', { dialog: dialog || 'Friends' }); },
        openStore:        function()         { return ipc.invoke('steam_activate_overlay_to_store'); },
        unlockAchievement:       function(id)    { return ipc.invoke('steam_unlock_achievement', { achievementId: id }); },
        getUnlockedAchievements: function(ids)    { return ipc.invoke('steam_get_unlocked_achievements', { ids: ids }); },
        getStatI32:              function(name)   { return ipc.invoke('steam_get_stat_i32', { statName: name }); },
        setStat:                 function(name, val){ return ipc.invoke('steam_set_stat', { statName: name, value: val }); },
        clearAchievement:        function(id)        { return ipc.invoke('steam_clear_achievement', { achievementId: id }); },
    };
    // Shift+Tab: prevent browser focus cycling and open overlay manually.
    // On macOS, Steam cannot inject into WKWebView's Metal surface, so we
    // must trigger it ourselves rather than relying on Steam's global hook.
    // F12: blocked so Steam can use it for screenshots. F8 opens devtools instead.
    window.addEventListener('keydown', function(e) {
        if (e.shiftKey && e.key === 'Tab') {
            e.preventDefault();
            window.steam.activateOverlay('Friends');
        }
        if (e.key === 'F12') {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
        if (e.key === 'F8' && localStorage.getItem('dicy_gfx_fps') === 'on') {
            ipc.invoke('open_devtools').catch(function() {});
        }
    }, true);
})();
"#;

#[cfg(not(target_os = "android"))]
const GILRS_INIT_SCRIPT: &str = r#"
(function() {
    var ipc = window.__TAURI_INTERNALS__;
    if (!ipc) return;
    window.gilrs = {
        poll: function() { return ipc.invoke('gilrs_poll'); },
    };
})();
"#;

const COMMON_INIT_SCRIPT: &str = r#"
(function() {
    var ipc = window.__TAURI_INTERNALS__;
    if (!ipc) return;
    window.openUrl = function(url) { return ipc.invoke('open_url', { url: url }); };
})();
"#;

const ANDROID_INIT_SCRIPT: &str = r#"
(function() {
    var ipc = window.__TAURI_INTERNALS__;
    if (!ipc) return;
    window.android = {
        quit:  function() { return ipc.invoke('android_quit'); },
        isDev: function() { return ipc.invoke('android_is_dev'); },
    };
})();
"#;

// ─── Entry point ──────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // ── Desktop (Steam) setup ─────────────────────────────────────────────────
    #[cfg(not(target_os = "android"))]
    {
        let steam_result = steamworks::Client::init();

        let (steam_app, steam_available) = match steam_result {
            Ok(client) => {
                let user_name = client.friends().name();
                let steam_id  = client.user().steam_id().raw();
                let app_id    = client.utils().app_id().0;
                eprintln!("[Steam] Initialized OK: {} (ID: {}), AppId: {}", user_name, steam_id, app_id);

                // Pump Steam callbacks on a background thread so the overlay
                // can communicate, render, and respond to Shift+Tab.
                let cb_client = client.clone();
                std::thread::spawn(move || {
                    loop {
                        cb_client.run_callbacks();
                        std::thread::sleep(std::time::Duration::from_millis(100));
                    }
                });

                let app = SteamApp {
                    client,
                    user_name,
                    steam_id,
                    app_id,
                    _remote_play_cbs: Vec::new(),
                };
                (Some(app), true)
            }
            Err(e) => {
                eprintln!("[Steam] Init FAILED: {:?}", e);
                (None, false)
            }
        };

        let steam_state: SteamState = Mutex::new(steam_app);
        let gilrs_state = GilrsState { gilrs: Mutex::new(None) };

        builder = builder
            .manage(steam_state)
            .manage(gilrs_state)
            .invoke_handler(tauri::generate_handler![
                steam_get_user_name,
                steam_get_steam_id,
                steam_get_app_id,
                steam_is_dev,
                steam_quit,
                steam_activate_overlay,
                steam_activate_overlay_to_store,
                open_devtools,
                steam_unlock_achievement,
                steam_get_unlocked_achievements,
                steam_get_stat_i32,
                steam_set_stat,
                steam_clear_achievement,
                gilrs_poll,
                storage_read_all,
                storage_write_all,
                storage_get_path,
                android_quit,
                android_is_dev,
                open_url,
            ]);

        if steam_available {
            builder = builder.plugin(
                tauri::plugin::Builder::<tauri::Wry, ()>::new("steam-bridge")
                    .js_init_script(STEAM_INIT_SCRIPT.to_string())
                    .build(),
            );
        }

        // gilrs is always available on desktop (independent of Steam)
        builder = builder.plugin(
            tauri::plugin::Builder::<tauri::Wry, ()>::new("gilrs-bridge")
                .js_init_script(GILRS_INIT_SCRIPT.to_string())
                .build(),
        );

        // Common init: always inject window.openUrl
        builder = builder.plugin(
            tauri::plugin::Builder::<tauri::Wry, ()>::new("common-bridge")
                .js_init_script(COMMON_INIT_SCRIPT.to_string())
                .build(),
        );
    }

    // ── Android setup ─────────────────────────────────────────────────────────
    #[cfg(target_os = "android")]
    {
        builder = builder
            .invoke_handler(tauri::generate_handler![
                storage_read_all,
                storage_write_all,
                storage_get_path,
                android_quit,
                android_is_dev,
            ])
            .plugin(
                tauri::plugin::Builder::<tauri::Wry, ()>::new("android-bridge")
                    .js_init_script(ANDROID_INIT_SCRIPT.to_string())
                    .build(),
            );
    }

    // ── Common setup ──────────────────────────────────────────────────────────
    builder
        .setup(|app| {
            #[cfg(not(target_os = "android"))]
            {
                use tauri::{Emitter, Manager};
                let handle = app.handle().clone();
                if let Ok(mut guard) = app.state::<SteamState>().lock() {
                    if let Some(sa) = guard.as_mut() {
                        let client = sa.client.clone();
                        let cb_connected = sa.client.register_callback({
                            let handle = handle.clone();
                            let client = client.clone();
                            move |c: steamworks::RemotePlayConnected| {
                                let label = client
                                    .remote_play()
                                    .session(c.session)
                                    .client_name()
                                    .unwrap_or_else(|| format!("Session {}", c.session.raw()));
                                let _ = handle.emit(
                                    "steam-remote-play",
                                    serde_json::json!({
                                        "kind": "connected",
                                        "sessionId": c.session.raw(),
                                        "clientName": label,
                                    }),
                                );
                            }
                        });
                        let cb_disconnected = sa.client.register_callback({
                            let handle = handle.clone();
                            let client = client.clone();
                            move |c: steamworks::RemotePlayDisconnected| {
                                let opt_name = client
                                    .remote_play()
                                    .session(c.session)
                                    .client_name();
                                let _ = handle.emit(
                                    "steam-remote-play",
                                    serde_json::json!({
                                        "kind": "disconnected",
                                        "sessionId": c.session.raw(),
                                        "clientName": opt_name,
                                    }),
                                );
                            }
                        });
                        sa._remote_play_cbs.push(cb_connected);
                        sa._remote_play_cbs.push(cb_disconnected);
                    }
                }
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
