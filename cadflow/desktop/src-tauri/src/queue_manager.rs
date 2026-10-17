use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};
use once_cell::sync::Lazy;
use tauri::{AppHandle, Emitter};

static QUEUE_MUTEX: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct PendingSyncJob {
    pub id: String,
    pub sharepoint_item_id: String,
    pub file_name: String,
    pub file_path: String,
    pub queued_at: u64,
    pub attempts: u32,
    pub last_error: Option<String>,
}

fn get_queue_file_path() -> PathBuf {
    PathBuf::from("C:\\Users\\Public\\CADFlow_Cache\\pending_sync_queue.json")
}

/// Reads the persistent pending upload queue from disk
pub fn load_queue_from_disk() -> Vec<PendingSyncJob> {
    let _lock = QUEUE_MUTEX.lock().unwrap();
    let path = get_queue_file_path();
    if !path.exists() {
        return Vec::new();
    }

    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

/// Saves the pending upload queue to disk (atomically)
pub fn save_queue_to_disk(jobs: &[PendingSyncJob]) -> Result<(), String> {
    let _lock = QUEUE_MUTEX.lock().unwrap();
    let path = get_queue_file_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let json_bytes = serde_json::to_vec_pretty(jobs).map_err(|e| e.to_string())?;
    crate::windows_utils::safe_atomic_write(&path, &json_bytes)
}

/// Enqueues an unsynced file closure operation when offline
pub fn enqueue_offline_sync(item_id: String, file_name: String, file_path: String) -> Result<PendingSyncJob, String> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    let job = PendingSyncJob {
        id: format!("job_{}_{}", now, item_id),
        sharepoint_item_id: item_id,
        file_name,
        file_path,
        queued_at: now,
        attempts: 0,
        last_error: None,
    };

    let mut jobs = load_queue_from_disk();
    // Avoid duplicate enqueues for the same item
    jobs.retain(|j| j.sharepoint_item_id != job.sharepoint_item_id);
    jobs.push(job.clone());
    save_queue_to_disk(&jobs)?;

    crate::debug_logger::debug_log(&format!("Enqueued offline sync job for: {}", job.file_name));
    Ok(job)
}

/// Removes a completed job from the queue
pub fn remove_job_from_queue(job_id: &str) -> Result<(), String> {
    let mut jobs = load_queue_from_disk();
    jobs.retain(|j| j.id != job_id);
    save_queue_to_disk(&jobs)
}

/// Background worker that drains the offline queue as soon as internet connectivity returns
pub fn start_offline_queue_worker(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(15)).await;

            let jobs = load_queue_from_disk();
            if jobs.is_empty() {
                continue;
            }

            crate::debug_logger::debug_log(&format!("Offline queue worker checking {} pending jobs...", jobs.len()));

            // Test network reachability
            let client = reqwest::Client::builder()
                .timeout(Duration::from_secs(4))
                .build();
            
            let client = match client {
                Ok(c) => c,
                Err(_) => continue,
            };

            let api_base = crate::config::api_base_url();
            let health_url = format!("{}/health", api_base);
            let is_online = client.get(&health_url)
                .send()
                .await
                .map(|r| r.status().is_success())
                .unwrap_or(false);

            if !is_online {
                crate::debug_logger::debug_log("Network still unreachable. Backing off...");
                continue;
            }

            crate::debug_logger::debug_log("Network restored! Draining offline dirty queue...");

            for mut job in jobs {
                let file_path = PathBuf::from(&job.file_path);
                if !file_path.exists() {
                    // File no longer exists, prune job
                    let _ = remove_job_from_queue(&job.id);
                    continue;
                }

                // 1. Push Delta to Edge Node / Cloud
                let edge_url = "http://127.0.0.1:8000/relay/upload_delta";
                let _upload_res = crate::delta_uploader::upload_delta_to_edge(file_path.clone(), edge_url).await;
                
                // 2. Release Remote Lock
                let release_payload = serde_json::json!({
                    "sharepoint_item_id": job.sharepoint_item_id,
                    "comment": "Auto-synced via offline dirty queue recovery"
                });

                let release_url = format!("{}/api/v1/locks/release", api_base);
                let lock_res = client.post(&release_url)
                    .header("X-CADFlow-API-Key", crate::config::api_key())
                    .json(&release_payload)
                    .send()
                    .await;

                let success = match lock_res {
                    Ok(resp) => resp.status().is_success() || resp.status() == reqwest::StatusCode::NOT_FOUND,
                    Err(_) => false,
                };

                if success {
                    crate::debug_logger::debug_log(&format!("Successfully synced and unlocked offline file: {}", job.file_name));
                    let _ = remove_job_from_queue(&job.id);
                    
                    // Notify UI that a file was recovered
                    let _ = app_handle.emit("offline_sync_recovered", serde_json::json!({
                        "file_name": job.file_name,
                        "sharepoint_item_id": job.sharepoint_item_id
                    }));
                } else {
                    job.attempts += 1;
                    job.last_error = Some("Failed to reach lock release service".to_string());
                    let mut current_jobs = load_queue_from_disk();
                    if let Some(pos) = current_jobs.iter().position(|j| j.id == job.id) {
                        current_jobs[pos] = job;
                        let _ = save_queue_to_disk(&current_jobs);
                    }
                }
            }
        }
    });
}
