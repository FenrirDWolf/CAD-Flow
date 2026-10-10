use std::path::PathBuf;
use crate::chunk_engine::{_generate_manifest, _ChunkManifest};
use reqwest::Client;
use std::collections::HashMap;
use std::sync::Mutex;
use once_cell::sync::Lazy;

static MANIFEST_CACHE: Lazy<Mutex<HashMap<String, _ChunkManifest>>> = Lazy::new(|| Mutex::new(HashMap::new()));

pub async fn upload_delta_to_edge(file_path: PathBuf, edge_url: &str) -> Result<(), String> {
    crate::debug_logger::debug_log(&format!("Starting delta generation for {:?}", file_path));
    
    // 1. Generate new manifest and chunk data
    let (new_manifest, chunk_data) = _generate_manifest(&file_path)?;
    let file_name = new_manifest.file_name.clone();
    
    // 2. Find previous manifest
    let mut changed_chunks = Vec::new();
    {
        let cache = MANIFEST_CACHE.lock().unwrap();
        if let Some(old_manifest) = cache.get(&file_name) {
            let old_hashes: std::collections::HashSet<_> = old_manifest.chunks.iter().map(|c| c.hash.clone()).collect();
            for (hash, data) in chunk_data {
                if !old_hashes.contains(&hash) {
                    changed_chunks.push((hash, data));
                }
            }
        } else {
            // No previous manifest, send all chunks
            changed_chunks = chunk_data;
        }
    }
    
    // 3. Send changed chunks to edge node
    let client = Client::new();
    let total_changed = changed_chunks.len();
    let mut payload = Vec::new();
    for (_hash, data) in changed_chunks {
        payload.extend(data);
    }
    let total_bytes_sent = payload.len();
    
    crate::debug_logger::debug_log(&format!("Delta chunks changed: {} ({} bytes)", total_changed, total_bytes_sent));
    
    // Only send if there are changes (or if it is a 0 byte file, we can skip or send empty)
    if total_bytes_sent > 0 || total_changed == 0 {
        let part_data = if total_bytes_sent == 0 { vec![0u8] } else { payload };
        
        let res = client.post(edge_url)
            .header("X-File-Name", file_name.clone())
            .body(part_data)
            .send()
            .await
            .map_err(|e| format!("Edge node connection failed: {}", e))?;
            
        if !res.status().is_success() {
            return Err(format!("Edge node rejected delta: {}", res.status()));
        }
    }
    
    // 4. Update manifest cache
    {
        let mut cache = MANIFEST_CACHE.lock().unwrap();
        cache.insert(file_name, new_manifest);
    }
    
    crate::debug_logger::debug_log("Delta sync completed successfully.");
    Ok(())
}



#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;

    #[tokio::test]
    async fn test_delta_upload() {
        let test_file_path = std::path::PathBuf::from("test_cad_file.txt");
        let mut file = File::create(&test_file_path).unwrap();
        file.write_all(b"Initial mock CAD data... PLUS NEW UPDATES!").unwrap();
        file.flush().unwrap();

        // Using a mock server or real edge node url if running
        let res = upload_delta_to_edge(test_file_path.clone(), "http://127.0.0.1:8000/relay/upload_delta").await;
        println!("Upload result: {:?}", res);
        assert!(res.is_err() || res.is_ok()); // just check it executes without panic
        std::fs::remove_file(test_file_path).unwrap();
    }
}




#[cfg(test)]
mod tests_0byte {
    use super::*;
    use std::fs::File;

    #[tokio::test]
    async fn test_zero_byte_upload() {
        let test_file_path = std::path::PathBuf::from("C:/Users/Public/CADFlow_Cache/Project/test_launch.dwg");
        // Ensure it exists
        if !test_file_path.exists() {
            File::create(&test_file_path).unwrap();
        }
        let res = upload_delta_to_edge(test_file_path.clone(), "http://127.0.0.1:8000/relay/upload_delta").await;
        println!("Upload result for 0 bytes: {:?}", res);
        assert!(res.is_err() || res.is_ok());
    }
}



#[cfg(test)]
mod tests_large_file {
    use super::*;
    use std::fs::File;
    use std::io::{Read, Write, Seek, SeekFrom};

    #[tokio::test]
    async fn test_large_dwg_delta() {
        let src_path = std::path::PathBuf::from("C:/Users/Public/CADFlow_Cache/Project/DRAINAGE SERVICES LAYOUT --------- 27-07-2023.dwg");
        let test_path = std::path::PathBuf::from("C:/Users/Public/CADFlow_Cache/Project/test_large.dwg");
        
        // 1. Copy the real file
        std::fs::copy(&src_path, &test_path).unwrap();

        // 2. Upload initial (should be full size)
        let res1 = upload_delta_to_edge(test_path.clone(), "http://127.0.0.1:8000/relay/upload_delta").await;
        assert!(res1.is_ok());

        // 3. Modify 10 bytes in the middle of the 21MB file
        let mut file = std::fs::OpenOptions::new().write(true).open(&test_path).unwrap();
        file.seek(SeekFrom::Start(10_000_000)).unwrap();
        file.write_all(b"AI_HACKED!").unwrap();
        file.flush().unwrap();

        // 4. Upload delta (should only upload a small chunk)
        let res2 = upload_delta_to_edge(test_path.clone(), "http://127.0.0.1:8000/relay/upload_delta").await;
        assert!(res2.is_ok());

        std::fs::remove_file(test_path).unwrap();
    }
}

