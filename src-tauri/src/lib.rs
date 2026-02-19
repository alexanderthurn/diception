use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;

// ─── State types ─────────────────────────────────────────────────────────────

/// Cached action handles for Steam Input.
struct InputHandles {
    action_set_game: u64,
    digital: HashMap<String, u64>,
    analog: HashMap<String, u64>,
}

/// Full Steam state kept alive for the lifetime of the app.
/// Client is Send + Sync in steamworks 0.12 (static_assert_send/sync in Client::init).
struct SteamApp {
    client: steamworks::Client,
    user_name: String,
    steam_id: u64,
    input_handles: Option<InputHandles>,
}

type AppState = Mutex<Option<SteamApp>>;

// ─── Serialisable output types ────────────────────────────────────────────────

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

// ─── Helper ───────────────────────────────────────────────────────────────────

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

// ─── Existing commands ────────────────────────────────────────────────────────

#[tauri::command]
fn steam_get_user_name(state: tauri::State<AppState>) -> Result<String, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    guard.as_ref()
        .map(|s| s.user_name.clone())
        .ok_or_else(|| "Steam not initialized".to_string())
}

#[tauri::command]
fn steam_get_steam_id(state: tauri::State<AppState>) -> Result<u64, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    guard.as_ref()
        .map(|s| s.steam_id)
        .ok_or_else(|| "Steam not initialized".to_string())
}

#[tauri::command]
fn steam_is_dev() -> bool {
    cfg!(debug_assertions)
}

#[tauri::command]
fn steam_quit(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

// ─── Steam Input commands ─────────────────────────────────────────────────────

/// Initialise the Steam Input API and cache action handles.
/// Call once from JS after the page loads (window.steam.inputInit()).
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
/// Returns a JSON array of ControllerState, one entry per controller.
/// Call this every frame from JS (window.steam.inputPoll()).
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

        // Keep the correct action set active (cheap to call repeatedly)
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

/// Return the controller type string for a Steam Input handle.
/// Use this to override navigator.getGamepads() id-string detection when Steam is active.
#[tauri::command]
fn steam_input_get_controller_type(
    state: tauri::State<AppState>,
    controller_handle: u64,
) -> Result<String, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    let app   = guard.as_ref().ok_or("Steam not available")?;
    Ok(input_type_str(&app.client.input().get_input_type_for_handle(controller_handle)).to_string())
}

/// Return Steam-provided glyph file paths for every digital action on one controller.
/// The paths point to PNG files inside the Steam installation — load them via the
/// `asset://` protocol or convert to a data-URL on the Rust side if needed.
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

/// Open the Steam overlay binding panel for the given controller.
#[tauri::command]
fn steam_input_show_binding_panel(
    state: tauri::State<AppState>,
    controller_handle: u64,
) -> Result<bool, String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    let app   = guard.as_ref().ok_or("Steam not available")?;
    Ok(app.client.input().show_binding_panel(controller_handle))
}

// ─── JS init script injected before the page runs ────────────────────────────

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

// ─── Entry point ──────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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

    let mut builder = tauri::Builder::default()
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
        ]);

    if steam_available {
        builder = builder.plugin(
            tauri::plugin::Builder::<tauri::Wry, ()>::new("steam-bridge")
                .js_init_script(STEAM_INIT_SCRIPT.to_string())
                .build(),
        );
    }

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
