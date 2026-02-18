use std::sync::Mutex;

/// Cached Steam data collected at init time.
/// We cache everything upfront because steamworks::Client is !Send + !Sync,
/// so we can't store it in Tauri's managed state directly.
struct SteamData {
    user_name: String,
    steam_id: u64,
}

struct SteamState {
    data: Option<SteamData>,
}

#[tauri::command]
fn steam_get_user_name(state: tauri::State<Mutex<SteamState>>) -> Result<String, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    match &state.data {
        Some(data) => Ok(data.user_name.clone()),
        None => Err("Steam not initialized".to_string()),
    }
}

#[tauri::command]
fn steam_get_steam_id(state: tauri::State<Mutex<SteamState>>) -> Result<u64, String> {
    let state = state.lock().map_err(|e| e.to_string())?;
    match &state.data {
        Some(data) => Ok(data.steam_id),
        None => Err("Steam not initialized".to_string()),
    }
}

#[tauri::command]
fn steam_is_dev() -> bool {
    cfg!(debug_assertions)
}

#[tauri::command]
fn steam_quit(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

/// JavaScript that creates window.steam, bridging to our Tauri commands.
const STEAM_INIT_SCRIPT: &str = r#"
(function() {
    // __TAURI_INTERNALS__ is Tauri 2's core IPC bridge, available at init script time.
    // __TAURI__.core is from the npm package and loads later — not available here.
    var ipc = window.__TAURI_INTERNALS__;
    if (ipc) {
        window.steam = {
            getUserName: function() {
                return ipc.invoke('steam_get_user_name');
            },
            getSteamId: function() {
                return ipc.invoke('steam_get_steam_id');
            },
            isDev: function() {
                return ipc.invoke('steam_is_dev');
            },
            quit: function() {
                return ipc.invoke('steam_quit');
            }
        };
    }
})();
"#;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Try to init Steam on the main thread BEFORE Tauri starts.
    // steamworks::Client must be created on the main thread.
    let steam_data = match steamworks::Client::init() {
        Ok(client) => {
            let user_name = client.friends().name();
            let steam_id = client.user().steam_id().raw();
            eprintln!("[Steam] Initialized OK: {} (ID: {})", user_name, steam_id);
            Some(SteamData {
                user_name,
                steam_id,
            })
        }
        Err(e) => {
            eprintln!("[Steam] Init FAILED: {:?}", e);
            None
        }
    };

    let steam_available = steam_data.is_some();
    let steam_state = Mutex::new(SteamState { data: steam_data });

    let mut builder = tauri::Builder::default()
        .manage(steam_state)
        .invoke_handler(tauri::generate_handler![
            steam_get_user_name,
            steam_get_steam_id,
            steam_is_dev,
            steam_quit,
        ]);

    // Use a plugin with js_init_script to inject window.steam BEFORE page JS runs.
    // This is critical: on_page_load and eval() fire too late (after main.js).
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
