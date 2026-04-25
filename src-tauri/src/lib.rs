use tauri::Manager;
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(not(debug_assertions))]
            {
                let app_data_dir = app
                    .path()
                    .app_data_dir()
                    .expect("app data dir bulunamadı")
                    .to_string_lossy()
                    .to_string();

                let resource_dir = app
                    .path()
                    .resource_dir()
                    .expect("resource dir bulunamadı");

                let env_file_path = resource_dir
                    .join("backend.env")
                    .to_string_lossy()
                    .to_string();

                let sidecar = app
                    .shell()
                    .sidecar("backend")
                    .expect("backend sidecar bulunamadı")
                    .env("APP_DATA_DIR", &app_data_dir)
                    .env("ENV_FILE_PATH", &env_file_path)
                    .env("NODE_ENV", "production");

                let (_rx, _child) = sidecar.spawn().expect("backend başlatılamadı");
                println!("Backend started, data dir: {}", app_data_dir);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("tauri uygulaması başlatılamadı");
}
