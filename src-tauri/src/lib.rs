use std::path::PathBuf;

#[cfg(not(target_os = "android"))]
use std::sync::Mutex;

use tauri::Manager;

// ─── Steam state (desktop only) ───────────────────────────────────────────────

#[cfg(not(target_os = "android"))]
use std::collections::HashMap;

#[cfg(not(target_os = "android"))]
use serde::Serialize;

/// Cached action handles for Steam Input.
#[cfg(not(target_os = "android"))]
struct InputHandles {
    action_set_game: u64,
    digital: HashMap<String, u64>,
    analog: HashMap<String, u64>,
}

/// Full Steam state kept alive for the lifetime of the app.
/// Client is Send + Sync in steamworks 0.12 (static_assert_send/sync in Client::init).
#[cfg(not(target_os = "android"))]
struct SteamApp {
    client: steamworks::Client,
    user_name: String,
    steam_id: u64,
    input_handles: Option<InputHandles>,
}

#[cfg(not(target_os = "android"))]
type AppState = Mutex<Option<SteamApp>>;

// ─── Serialisable output types (desktop only) ─────────────────────────────────

#[cfg(not(target_os = "android"))]
#[derive(Serialize)]
struct ControllerState {
    handle: u64,
    /// "ps4" | "ps5" | "xbox360" | "xbox" | "switch" | "deck" | "steam" | "unknown"
    input_type: String,
    /// digital action name → pressed
    actions: HashMap<String, bool>,
    /// analog action name → [x, y]
    analogs: HashMap<String, [f32; 2]>,
}

// ─── Helper (desktop only) ────────────────────────────────────────────────────

#[cfg(not(target_os = "android"))]
fn input_type_str(t: &steamworks::InputType) -> &'static str {
    match t {
        steamworks::InputType::PS4Controller      => "ps4",
        steamworks::InputType::PS5Controller      => "ps5",
        steamworks::InputType::XBox360Controller  => "xbox360",
        steamworks::InputType::XBoxOneController  => "xbox",
        steamworks::InputType::SwitchProController
        | steamworks::InputType::SwitchJoyConPair
        | steamworks::InputType::SwitchJoyConSingle => "switch",
        steamworks::InputType::SteamDeckController => "deck",
        steamworks::InputType::SteamController    => "steam",
        _ => "unknown",
    }
}

// ─── Steam commands (desktop only) ────────────────────────────────────────────

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn steam_get_user_name(state: tauri::State<AppState>) -> Result<String, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    guard.as_ref()
        .map(|s| s.user_name.clone())
        .ok_or_else(|| "Steam not initialized".to_string())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn steam_get_steam_id(state: tauri::State<AppState>) -> Result<u64, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    guard.as_ref()
        .map(|s| s.steam_id)
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

/// Initialise the Steam Input API and cache action handles.
/// Call once from JS after the page loads (window.steam.inputInit()).
#[cfg(not(target_os = "android"))]
#[tauri::command]
fn steam_input_init(state: tauri::State<AppState>) -> Result<bool, String> {
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    let app = guard.as_mut().ok_or("Steam not available")?;

    let input = app.client.input();
    if !input.init(false) {
        return Err("SteamAPI_ISteamInput_Init returned false".to_string());
    }

    // Explicitly point Steam at the action manifest so it is found regardless
    // of working directory.  The VDF is copied next to the executable by the
    // build scripts (Contents/MacOS/ on macOS, same dir as .exe on Windows).
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(dir) = exe_path.parent() {
            let vdf = dir.join("game_actions_X.vdf");
            let vdf_str = vdf.to_string_lossy();
            eprintln!("[Steam Input] action manifest path: {}", vdf_str);
            input.set_input_action_manifest_file_path(&vdf_str);
        }
    }

    // RunFrame once so handles are valid before the first poll
    input.run_frame();

    let action_set_game = input.get_action_set_handle("GameControls");

    let digital_names = [
        "confirm", "cancel", "end_turn", "menu",
        "move_up", "move_down", "move_left", "move_right",
        "zoom_in", "zoom_out", "gamepad_drag",
        "cursor_speed_down", "cursor_speed_up",
    ];
    let mut digital = HashMap::new();
    for name in &digital_names {
        digital.insert(name.to_string(), input.get_digital_action_handle(name));
    }

    let mut analog = HashMap::new();
    analog.insert("cursor_move".to_string(), input.get_analog_action_handle("cursor_move"));
    analog.insert("map_pan".to_string(),     input.get_analog_action_handle("map_pan"));

    app.input_handles = Some(InputHandles { action_set_game, digital, analog });

    eprintln!("[Steam Input] Initialized. action_set_game={}", action_set_game);
    Ok(true)
}

/// Poll all connected Steam Input controllers.
#[cfg(not(target_os = "android"))]
#[tauri::command]
fn steam_input_poll(state: tauri::State<AppState>) -> Result<Vec<ControllerState>, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    let app   = guard.as_ref().ok_or("Steam not available")?;
    let hdls  = app.input_handles.as_ref().ok_or("Steam Input not initialized")?;

    app.client.run_callbacks();

    let input = app.client.input();
    input.run_frame();

    let controllers = input.get_connected_controllers();
    let mut result = Vec::with_capacity(controllers.len());

    for handle in controllers {
        if handle == 0 { continue; }

        input.activate_action_set_handle(handle, hdls.action_set_game);

        let input_type = input_type_str(&input.get_input_type_for_handle(handle)).to_string();

        let mut actions = HashMap::new();
        for (name, &action_handle) in &hdls.digital {
            let data = input.get_digital_action_data(handle, action_handle);
            actions.insert(name.clone(), data.bState);
        }

        let mut analogs = HashMap::new();
        for (name, &analog_handle) in &hdls.analog {
            let data = input.get_analog_action_data(handle, analog_handle);
            analogs.insert(name.clone(), [data.x, data.y]);
        }

        result.push(ControllerState { handle, input_type, actions, analogs });
    }

    Ok(result)
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn steam_input_get_controller_type(
    state: tauri::State<AppState>,
    controller_handle: u64,
) -> Result<String, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    let app   = guard.as_ref().ok_or("Steam not available")?;
    Ok(input_type_str(&app.client.input().get_input_type_for_handle(controller_handle)).to_string())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn steam_input_get_glyphs(
    state: tauri::State<AppState>,
    controller_handle: u64,
) -> Result<HashMap<String, String>, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    let app   = guard.as_ref().ok_or("Steam not available")?;
    let hdls  = app.input_handles.as_ref().ok_or("Steam Input not initialized")?;

    let input  = app.client.input();
    let mut glyphs = HashMap::new();

    for (action_name, &action_handle) in &hdls.digital {
        let origins = input.get_digital_action_origins(
            controller_handle,
            hdls.action_set_game,
            action_handle,
        );
        if let Some(&origin) = origins.first() {
            let path = input.get_glyph_for_action_origin(origin);
            if !path.is_empty() {
                glyphs.insert(action_name.clone(), path);
            }
        }
    }

    Ok(glyphs)
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn steam_input_show_binding_panel(
    state: tauri::State<AppState>,
    controller_handle: u64,
) -> Result<bool, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    let app   = guard.as_ref().ok_or("Steam not available")?;
    Ok(app.client.input().show_binding_panel(controller_handle))
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
        // ── identity ──
        getUserName:  function()       { return ipc.invoke('steam_get_user_name'); },
        getSteamId:   function()       { return ipc.invoke('steam_get_steam_id'); },
        isDev:        function()       { return ipc.invoke('steam_is_dev'); },
        quit:         function()       { return ipc.invoke('steam_quit'); },

        // ── Steam Input ──
        // Call inputInit() once after page load, then inputPoll() every frame.
        inputInit:       function()       { return ipc.invoke('steam_input_init'); },
        inputPoll:       function()       { return ipc.invoke('steam_input_poll'); },
        inputGetControllerType: function(handle) {
            return ipc.invoke('steam_input_get_controller_type', { controller_handle: handle });
        },
        inputGetGlyphs:  function(handle) {
            return ipc.invoke('steam_input_get_glyphs', { controller_handle: handle });
        },
        inputShowBindingPanel: function(handle) {
            return ipc.invoke('steam_input_show_binding_panel', { controller_handle: handle });
        },
    };
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
                eprintln!("[Steam] Initialized OK: {} (ID: {})", user_name, steam_id);
                let app = SteamApp { client, user_name, steam_id, input_handles: None };
                (Some(app), true)
            }
            Err(e) => {
                eprintln!("[Steam] Init FAILED: {:?}", e);
                (None, false)
            }
        };

        let app_state: AppState = Mutex::new(steam_app);

        builder = builder
            .manage(app_state)
            .invoke_handler(tauri::generate_handler![
                steam_get_user_name,
                steam_get_steam_id,
                steam_is_dev,
                steam_quit,
                steam_input_init,
                steam_input_poll,
                steam_input_get_controller_type,
                steam_input_get_glyphs,
                steam_input_show_binding_panel,
                storage_read_all,
                storage_write_all,
                storage_get_path,
                android_quit,
                android_is_dev,
            ]);

        if steam_available {
            builder = builder.plugin(
                tauri::plugin::Builder::<tauri::Wry, ()>::new("steam-bridge")
                    .js_init_script(STEAM_INIT_SCRIPT.to_string())
                    .build(),
            );
        }
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
