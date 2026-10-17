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
mod queue_manager;

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
async fn mount_drive(state: State<'_, MountState>, path: String) -> Result<String, String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err(format!("Cache path does not exist: {}", path));
    }
    
    let letter = drive::mount_virtual_drive(&target)?;
    
    let mut current_mount = state.mounted_path.lock().unwrap();
    *current_mount = Some(target);
    
    Ok(letter)
}

#[tauri::command]
async fn get_mounted_drive_letter() -> Result<String, String> {
    Ok(drive::get_mounted_drive_letter())
}

#[tauri::command]
async fn get_revit_compatibility() -> Result<detector::RevitCompatibilityReport, String> {
    Ok(detector::check_revit_compatibility())
}

#[tauri::command]
async fn get_pending_offline_syncs() -> Result<Vec<queue_manager::PendingSyncJob>, String> {
    Ok(queue_manager::load_queue_from_disk())
}

#[tauri::command]
async fn break_remote_lock(item_id: String, reason: Option<String>) -> Result<(), String> {
    let client = Client::builder().default_headers({
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("X-CADFlow-API-Key", reqwest::header::HeaderValue::from_static("dev-cadflow-secret-key-123"));
        headers
    }).build().unwrap();
    let payload = json!({
        "sharepoint_item_id": item_id,
        "reason": reason.unwrap_or_else(|| "BIM Manager override: Abandoned/Stale lock".to_string())
    });

    let res = client.post("https://cadflow-api.onrender.com/api/v1/locks/break")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Failed to break lock: {}", res.status()));
    }

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
        let path = std::path::PathBuf::from(&file_path);
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
        
        // Phase 2: Wait for CAD program to release the file, sending periodic heartbeats (Failure Mode C)
        let mut heartbeat_ticker = 0u64;
        let client = Client::builder().default_headers({
            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert("X-CADFlow-API-Key", reqwest::header::HeaderValue::from_static("dev-cadflow-secret-key-123"));
            headers
        }).build().unwrap();

        loop {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            heartbeat_ticker += 2;

            // Send heartbeat every 60 seconds while CAD is actively holding the file
            if heartbeat_ticker >= 60 {
                heartbeat_ticker = 0;
                let hb_payload = json!({ "sharepoint_item_id": item_id.clone() });
                let _ = client.post("https://cadflow-api.onrender.com/api/v1/locks/heartbeat")
                    .json(&hb_payload)
                    .send()
                    .await;
                crate::debug_logger::debug_log(&format!("Sent lock heartbeat for item: {}", item_id));
            }

            if !crate::watcher::is_cad_file_in_use(&path) {
                crate::debug_logger::debug_log("File has been UNLOCKED by CAD. Emitting cad_file_closed event.");
                let _ = app.emit("cad_file_closed", FileClosedPayload {
                    sharepoint_item_id: item_id.clone(),
                    file_name: file_name.clone(),
                });

                // Real-time delta upload to edge node
                crate::debug_logger::debug_log("Auto-triggering Delta Upload to Edge Node...");
                let edge_url = "http://127.0.0.1:8000/relay/upload_delta";
                match crate::delta_uploader::upload_delta_to_edge(path.clone(), edge_url).await {
                    Ok(_) => crate::debug_logger::debug_log("Real-time Delta Sync successful."),
                    Err(e) => crate::debug_logger::debug_log(&format!("Delta Sync failed: {}", e)),
                }

                // Attempt to release remote lock. If offline or network fails, enqueue into persistent dirty queue (Failure Mode B)
                let username = std::env::var("USERNAME").unwrap_or_else(|_| "Unknown".to_string());
                let release_payload = json!({
                    "sharepoint_item_id": item_id.clone(),
                    "file_path": "mock",
                    "file_type": "dwg",
                    "machine_hostname": "local",
                    "windows_username": username
                });
                let release_res = client.post("https://cadflow-api.onrender.com/api/v1/locks/release")
                    .json(&release_payload)
                    .send()
                    .await;

                let released = match release_res {
                    Ok(resp) => resp.status().is_success() || resp.status() == reqwest::StatusCode::NOT_FOUND,
                    Err(_) => false,
                };

                if !released {
                    crate::debug_logger::debug_log("Network or release failed on close! Enqueueing into persistent dirty queue for auto-recovery.");
                    let _ = crate::queue_manager::enqueue_offline_sync(
                        item_id.clone(),
                        file_name.clone(),
                        file_path.clone()
                    );
                    let _ = app.emit("offline_sync_queued", json!({
                        "file_name": file_name,
                        "sharepoint_item_id": item_id
                    }));
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

fn is_path_safe_in_vault(path: &std::path::Path) -> bool {
    let path_str = path.to_string_lossy().to_uppercase();
    path_str.starts_with("C:\\USERS\\PUBLIC\\CADFLOW_CACHE")
        || path_str.starts_with("X:\\")
        || path_str.starts_with("Y:\\")
        || path_str.starts_with("Z:\\")
        || path_str.starts_with("V:\\")
        || path_str.starts_with("W:\\")
        || path_str.starts_with("U:\\")
}

#[tauri::command]
async fn sync_and_launch(file_name: String, download_url: String, read_only: Option<bool>) -> Result<(), String> {
    use std::path::PathBuf;
    use std::process::Command;
    
    // 1. Sanitize file_name to prevent directory traversal attacks
    let safe_name = std::path::Path::new(&file_name)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid file name".to_string())?;

    if safe_name.contains("..") || safe_name.is_empty() {
        return Err("Security Error: Path traversal attempt detected in file name.".to_string());
    }

    crate::debug_logger::debug_log(&format!("Starting sync_and_launch for file: {}, url: {}, read_only: {:?}", safe_name, download_url, read_only));
    
    let cache_dir = PathBuf::from("C:\\Users\\Public\\CADFlow_Cache");
    if !cache_dir.exists() {
        crate::debug_logger::debug_log("Creating cache dir");
        std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }
    
    crate::debug_logger::debug_log("Mounting virtual drive");
    let mounted_letter = crate::drive::mount_virtual_drive(&cache_dir).unwrap_or_else(|_| "X".to_string());
    
    let project_dir = cache_dir.join("Project");
    if !project_dir.exists() {
        crate::debug_logger::debug_log("Creating project dir");
        std::fs::create_dir_all(&project_dir).map_err(|e| e.to_string())?;
    }
    
    let local_file_path = project_dir.join(safe_name);
    crate::debug_logger::debug_log(&format!("Local path: {:?}", local_file_path));
    
    // Download or prepare file with zero-corruption atomic write
    if !local_file_path.exists() {
        if !download_url.is_empty() {
            match reqwest::get(&download_url).await {
                Ok(response) if response.status().is_success() => {
                    if let Ok(bytes) = response.bytes().await {
                        let _ = crate::windows_utils::safe_atomic_write(&local_file_path, &bytes);
                    }
                },
                _ => {
                    // Safe CAD/BIM binary header stub if download url is mock/offline
                    let stub_data = if safe_name.ends_with(".dwg") {
                        b"AC1032\0CADFlow Valid AutoCAD File Stub\0".to_vec()
                    } else {
                        b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1CADFlow Valid Revit OLE Storage Stub".to_vec()
                    };
                    let _ = crate::windows_utils::safe_atomic_write(&local_file_path, &stub_data);
                }
            }
        } else {
            let stub_data = if safe_name.ends_with(".dwg") {
                b"AC1032\0CADFlow Valid AutoCAD File Stub\0".to_vec()
            } else {
                b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1CADFlow Valid Revit OLE Storage Stub".to_vec()
            };
            let _ = crate::windows_utils::safe_atomic_write(&local_file_path, &stub_data);
        }
    }

    // Apply Read-Only protection attribute to prevent accidental overwrite or corruption
    let is_ro = read_only.unwrap_or(false);
    let _ = crate::windows_utils::set_file_readonly(&local_file_path.to_string_lossy(), is_ro);

    let virtual_path = format!("{}:\\Project\\{}", mounted_letter, safe_name);
    crate::debug_logger::debug_log(&format!("Launching via explorer on {}:\\ : {}", mounted_letter, virtual_path));
    
    let _ = Command::new("explorer.exe").arg(&virtual_path)
        .spawn()
        .map_err(|e| format!("Failed to launch file: {}", e))?;
        
    Ok(())
}

#[tauri::command]
async fn reveal_in_explorer(file_path: String) -> Result<(), String> {
    windows_utils::reveal_in_explorer(&file_path)
}

#[tauri::command]
async fn open_folder_in_explorer(folder_path: String) -> Result<(), String> {
    windows_utils::open_folder_in_explorer(&folder_path)
}

#[tauri::command]
async fn set_file_readonly_mode(file_path: String, readonly: bool) -> Result<(), String> {
    windows_utils::set_file_readonly(&file_path, readonly)
}

#[tauri::command]
async fn get_file_system_properties(file_path: String) -> Result<windows_utils::FileMetadataInfo, String> {
    Ok(windows_utils::get_file_metadata_info(&file_path))
}

#[tauri::command]
async fn create_virtual_folder(folder_path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&folder_path);
    if !is_path_safe_in_vault(&p) {
        return Err("Permission denied: Cannot create directory outside CADFlow storage vaults.".into());
    }
    std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn rename_virtual_item(old_path: String, new_path: String) -> Result<(), String> {
    let p_old = std::path::PathBuf::from(&old_path);
    let p_new = std::path::PathBuf::from(&new_path);
    if !is_path_safe_in_vault(&p_old) || !is_path_safe_in_vault(&p_new) {
        return Err("Permission denied: Cannot rename items outside CADFlow storage vaults.".into());
    }
    std::fs::rename(&p_old, &p_new).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn delete_virtual_item(file_path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&file_path);
    if !is_path_safe_in_vault(&p) {
        return Err("Permission denied: Cannot delete items outside CADFlow storage vaults.".into());
    }
    if p.is_dir() {
        std::fs::remove_dir_all(&p).map_err(|e| e.to_string())?;
    } else if p.is_file() {
        std::fs::remove_file(&p).map_err(|e| e.to_string())?;
    }
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



#[derive(Serialize)]
pub struct RevitServerStatus {
    pub configured: bool,
    pub online: bool,
    pub host: String,
    pub machine_name: Option<String>,
}

#[tauri::command]
async fn get_revit_server_status() -> Result<RevitServerStatus, String> {
    let host = "212.86.105.232";
    let _ = windows_utils::auto_configure_revit_server(&[host]);
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;
        
    let url = format!("http://{}/RevitServerAdminRESTService2025/AdminRESTService.svc/serverProperties", host);
    let guid = format!("{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos());
    let res = client.get(&url)
        .header("User-Name", "CADFlowClient")
        .header("User-Machine-Name", "CADFlowWorkstation")
        .header("Operation-GUID", guid)
        .send()
        .await;
        
    match res {
        Ok(resp) if resp.status().is_success() => {
            #[derive(serde::Deserialize)]
            struct ServerProps {
                #[serde(rename = "MachineName")]
                machine_name: Option<String>,
            }
            let props: Option<ServerProps> = resp.json().await.ok();
            Ok(RevitServerStatus {
                configured: true,
                online: true,
                host: host.to_string(),
                machine_name: props.and_then(|p| p.machine_name),
            })
        },
        _ => Ok(RevitServerStatus {
            configured: true,
            online: false,
            host: host.to_string(),
            machine_name: None,
        })
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 1. Auto-configure Revit Server RSN.ini across all installed Revit years on startup
    let _ = crate::windows_utils::auto_configure_revit_server(&["212.86.105.232"]);

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

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let handle = app.handle().clone();
            crate::queue_manager::start_offline_queue_worker(handle);
            Ok(())
        })
        .manage(MountState {
            mounted_path: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            get_cad_installations,
            mount_drive,
            unmount_drive,
            get_mounted_drive_letter,
            get_revit_compatibility,
            get_pending_offline_syncs,
            break_remote_lock,
            check_file_in_use,
            upload_file,
            acquire_lock,
            release_lock,
            watch_file_closure,
            launch_file,
            sync_and_launch,
            get_onedrive_paths,
            check_cloud_only,
            parse_and_hydrate_xrefs, prefetch_project, upload_delta, get_revit_server_status,
            reveal_in_explorer, open_folder_in_explorer, set_file_readonly_mode,
            get_file_system_properties, create_virtual_folder, rename_virtual_item, delete_virtual_item
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}














