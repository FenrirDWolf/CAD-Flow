mod debug_logger;
mod drive;
mod watcher;
mod detector;
mod uploader;
mod cache_manager;
mod dependency_parser;
mod sync_queue;
mod p2p;
mod chunk_engine;
mod auth;
mod pruner;
mod iso_validator;
mod dependency_graph;
mod windows_utils;
mod delta_uploader;
mod prefetcher;

use tauri::{State, Emitter};
use std::path::PathBuf;
use std::sync::Mutex;
use reqwest::Client;
use serde::Serialize;
use serde_json::json;

struct MountState {
    mounted_path: Mutex<Option<PathBuf>>,
}

#[derive(Clone, Serialize)]
struct FileClosedPayload {
    sharepoint_item_id: String,
    file_name: String,
}

#[tauri::command]
async fn get_cad_installations() -> Result<detector::CadInstallations, String> {
    Ok(detector::find_cad_installations())
}

#[tauri::command]
async fn mount_drive(state: State<'_, MountState>, path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err(format!("Cache path does not exist: {}", path));
    }
    
    drive::mount_virtual_drive(&target)?;
    
    let mut current_mount = state.mounted_path.lock().unwrap();
    *current_mount = Some(target);
    
    Ok(())
}

#[tauri::command]
async fn unmount_drive(state: State<'_, MountState>) -> Result<(), String> {
    drive::unmount_virtual_drive()?;
    
    let mut current_mount = state.mounted_path.lock().unwrap();
    *current_mount = None;
    
    Ok(())
}

#[tauri::command]
async fn check_file_in_use(path: String) -> Result<bool, String> {
    let p = PathBuf::from(path);
    Ok(watcher::is_cad_file_in_use(&p))
}

#[tauri::command]
async fn upload_file(upload_url: String, file_path: String) -> Result<(), String> {
    uploader::stream_upload_to_sharepoint(&upload_url, &PathBuf::from(file_path)).await
}

#[tauri::command]
async fn acquire_lock(item_id: String) -> Result<(), String> {
    let client = Client::builder().default_headers({
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("X-CADFlow-API-Key", reqwest::header::HeaderValue::from_static("dev-cadflow-secret-key-123"));
        headers
    }).build().unwrap();
    let username = std::env::var("USERNAME").unwrap_or_else(|_| "Unknown".to_string());
    let payload = json!({
        "sharepoint_item_id": item_id,
        "file_path": "mock",
        "file_type": "dwg",
        "machine_hostname": "local",
        "windows_username": username
    });

    let res = client.post("https://cadflow-api.onrender.com/api/v1/locks/acquire")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if res.status() == reqwest::StatusCode::CONFLICT {
        return Err("Conflict: File is already locked.".into());
    } else if !res.status().is_success() {
        return Err(format!("Failed to acquire lock: {}", res.status()));
    }

    Ok(())
}

#[tauri::command]
async fn release_lock(item_id: String, comment: String) -> Result<(), String> {
    let _ = comment; // Silence unused variable warning
    let client = Client::builder().default_headers({
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("X-CADFlow-API-Key", reqwest::header::HeaderValue::from_static("dev-cadflow-secret-key-123"));
        headers
    }).build().unwrap();
    let username = std::env::var("USERNAME").unwrap_or_else(|_| "Unknown".to_string());
    let payload = json!({
        "sharepoint_item_id": item_id,
        "file_path": "mock",
        "file_type": "dwg",
        "machine_hostname": "local",
        "windows_username": username
    });

    let res = client.post("https://cadflow-api.onrender.com/api/v1/locks/release")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Failed to release lock: {}", res.status()));
    }

    Ok(())
}

#[tauri::command]
async fn watch_file_closure(item_id: String, file_name: String, file_path: String, app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn(async move {
        let path = std::path::PathBuf::from(file_path);
        crate::debug_logger::debug_log(&format!("Watching for file closure: {:?}", path));
        
        // Phase 1: Wait for CAD program to actually lock the file (give it up to 60 seconds to boot)
        let mut locked = false;
        for i in 0..30 {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            if crate::watcher::is_cad_file_in_use(&path) {
                crate::debug_logger::debug_log(&format!("File is now LOCKED by CAD (took {}s)", i * 2));
                locked = true;
                break;
            }
        }
        
        if !locked {
            crate::debug_logger::debug_log("Warning: File was never locked by CAD within 60 seconds.");
        }
        
        // Phase 2: Wait for CAD program to release the file
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            if !crate::watcher::is_cad_file_in_use(&path) {
                crate::debug_logger::debug_log("File has been UNLOCKED by CAD. Emitting cad_file_closed event.");
                let _ = app.emit("cad_file_closed", FileClosedPayload {
                    sharepoint_item_id: item_id.clone(),
                    file_name: file_name.clone(),
                });

                // [NEW] Automatically push binary delta to Edge Node in real-time!
                crate::debug_logger::debug_log("Auto-triggering Delta Upload to Edge Node...");
                let edge_url = "http://127.0.0.1:8000/relay/upload_delta";
                match crate::delta_uploader::upload_delta_to_edge(path.clone(), edge_url).await {
                    Ok(_) => crate::debug_logger::debug_log("Real-time Delta Sync successful."),
                    Err(e) => crate::debug_logger::debug_log(&format!("Delta Sync failed: {}", e)),
                }
                break;
            }
        }
    });
    Ok(())
}

#[tauri::command]
async fn launch_file(file_path: String) -> Result<(), String> {
    use std::process::Command;
    use std::path::Path;

    if !Path::new(&file_path).exists() {
        return Err(format!("File not found locally at: {}. Please check your Local Sync Path in Settings.", file_path));
    }

    // Launch directly via Windows shell association (cmd /c start "")
    let _ = Command::new("explorer.exe").arg(&file_path)
        .spawn()
        .map_err(|e| format!("Failed to spawn CAD application: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn sync_and_launch(file_name: String, download_url: String) -> Result<(), String> {
    use std::fs::File;
    use std::io::Write;
    use std::path::PathBuf;
    use std::process::Command;
    
    crate::debug_logger::debug_log(&format!("Starting sync_and_launch for file: {}, url: {}", file_name, download_url));
    
    let cache_dir = PathBuf::from("C:\\Users\\Public\\CADFlow_Cache");
    if !cache_dir.exists() {
        crate::debug_logger::debug_log("Creating cache dir");
        std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }
    
    crate::debug_logger::debug_log("Mounting virtual drive");
    let mount_result = crate::drive::mount_virtual_drive(&cache_dir);
    crate::debug_logger::debug_log(&format!("Mount result: {:?}", mount_result));
    
    let project_dir = cache_dir.join("Project");
    if !project_dir.exists() {
        crate::debug_logger::debug_log("Creating project dir");
        std::fs::create_dir_all(&project_dir).map_err(|e| e.to_string())?;
    }
    
        let local_file_path = project_dir.join(&file_name);
    crate::debug_logger::debug_log(&format!("Local path: {:?}", local_file_path));
    
    if !local_file_path.exists() {
        match File::create(&local_file_path) {
            Ok(mut file) => {
                crate::debug_logger::debug_log("File created, starting download");
                if download_url.is_empty() {
                    crate::debug_logger::debug_log("Download URL is EMPTY!");
                } else {
                    match reqwest::get(&download_url).await {
                        Ok(response) => {
                            crate::debug_logger::debug_log("Reqwest get OK");
                            match response.bytes().await {
                                Ok(bytes) => {
                                    crate::debug_logger::debug_log(&format!("Got {} bytes", bytes.len()));
                                    let _ = file.write_all(&bytes);
                                },
                                Err(e) => crate::debug_logger::debug_log(&format!("Bytes err: {}", e)),
                            }
                        },
                        Err(e) => crate::debug_logger::debug_log(&format!("Reqwest get err: {}", e)),
                    }
                }
            },
            Err(e) => {
                crate::debug_logger::debug_log(&format!("File create err: {}", e));
                if !local_file_path.exists() {
                    return Err("Failed to create file and it does not exist.".into());
                }
            }
        }
    } else {
        crate::debug_logger::debug_log("File already exists locally, skipping download for speed");
    }
    let virtual_path = format!("X:\\Project\\{}", file_name);
    crate::debug_logger::debug_log(&format!("Launching via cmd: {}", virtual_path));
    
    // Use native cmd start for instantaneous execution and flawless quote handling
    let status = Command::new("explorer.exe").arg(&virtual_path)
        .status()
        .map_err(|e| format!("Failed to run cmd: {}", e))?;
        
    crate::debug_logger::debug_log(&format!("Launch status success: {}", status.success()));
    
    Ok(())
}

#[tauri::command]
async fn get_onedrive_paths() -> Result<Vec<String>, String> {
    Ok(windows_utils::discover_onedrive_paths())
}

#[tauri::command]
async fn check_cloud_only(file_path: String) -> Result<bool, String> {
    Ok(windows_utils::is_file_cloud_only(&file_path))
}

#[tauri::command]
async fn parse_and_hydrate_xrefs(file_path: String) -> Result<Vec<String>, String> {
    let mut hydrated = Vec::new();
    let xrefs = dependency_parser::scan_for_xrefs(&file_path);
    for xref in xrefs {
        if windows_utils::is_file_cloud_only(&xref) {
            // Mock hydration: returning files that were hydrated
            hydrated.push(xref);
        }
    }
    Ok(hydrated)
}

#[tauri::command]
async fn prefetch_project(files: Vec<(String, String)>) -> Result<(), String> {
    prefetcher::prefetch_project_files(files).await
}

#[tauri::command]
async fn upload_delta(file_path: String, edge_url: String) -> Result<(), String> {
    delta_uploader::upload_delta_to_edge(PathBuf::from(file_path), &edge_url).await
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Start Overnight Prefetch Background Worker
    tauri::async_runtime::spawn(async move {
        loop {
            let _now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
            // Mock check for 4:00 AM (for demo, just fires once on boot, then waits 24h)
            crate::debug_logger::debug_log("Running scheduled overnight prefetch task...");
            // In production, fetch URL list from Supabase/FastAPI
            let mock_files = vec![("central_model.rvt".to_string(), "http://mock-sharepoint.com/download".to_string())];
            let _ = crate::prefetcher::prefetch_project_files(mock_files).await;
            tokio::time::sleep(tokio::time::Duration::from_secs(86400)).await; // Sleep 24 hours
        }
    });

    tauri::Builder::default().plugin(tauri_plugin_updater::Builder::new().build()).plugin(tauri_plugin_process::init())
        .manage(MountState {
            mounted_path: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            get_cad_installations,
            mount_drive,
            unmount_drive,
            check_file_in_use,
            upload_file,
            acquire_lock,
            release_lock,
            watch_file_closure,
            launch_file,
            sync_and_launch,
            get_onedrive_paths,
            check_cloud_only,
            parse_and_hydrate_xrefs, prefetch_project, upload_delta
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}














