use std::path::PathBuf;
use reqwest::Client;
use std::sync::Arc;
use tokio::sync::Semaphore;

/// Pre-fetches project files in the background.
/// URLs should be Graph API download links.
pub async fn prefetch_project_files(files: Vec<(String, String)>) -> Result<(), String> {
    let cache_dir = PathBuf::from("C:\\Users\\Public\\CADFlow_Cache\\Project");
    if !cache_dir.exists() {
        std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }
    
    let client = Client::new();
    // Limit to 4 concurrent downloads to avoid overwhelming the network/disk
    let semaphore = Arc::new(Semaphore::new(4));
    let mut tasks = Vec::new();

    for (file_name, download_url) in files {
        let local_path = cache_dir.join(&file_name);
        
        // Skip if already downloaded
        if local_path.exists() {
            crate::debug_logger::debug_log(&format!("Prefetch skipped (already exists): {}", file_name));
            continue;
        }

        let permit = semaphore.clone().acquire_owned().await.unwrap();
        let client_cloned = client.clone();
        
        crate::debug_logger::debug_log(&format!("Prefetch started: {}", file_name));

        tasks.push(tokio::spawn(async move {
            match client_cloned.get(&download_url).send().await {
                Ok(response) => {
                    if response.status().is_success() {
                        match response.bytes().await {
                            Ok(bytes) => {
                                let _ = crate::windows_utils::safe_atomic_write(&local_path, &bytes);
                                crate::debug_logger::debug_log(&format!("Prefetch finished: {}", file_name));
                            }
                            Err(e) => crate::debug_logger::debug_log(&format!("Prefetch bytes err for {}: {}", file_name, e)),
                        }
                    } else {
                        crate::debug_logger::debug_log(&format!("Prefetch failed HTTP {} for {}", response.status(), file_name));
                    }
                }
                Err(e) => crate::debug_logger::debug_log(&format!("Prefetch network err for {}: {}", file_name, e)),
            }
            drop(permit);
        }));
    }

    // Await all background tasks
    for task in tasks {
        let _ = task.await;
    }

    Ok(())
}

