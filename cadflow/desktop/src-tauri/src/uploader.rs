use reqwest::Client;
use std::path::Path;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt, SeekFrom};

// 10 MiB strictly as multiple of 320 KiB
const CHUNK_SIZE: u64 = 327_680 * 32;

/// Uploads a file to a resumable SharePoint upload session URL in 10 MiB chunks.
pub async fn stream_upload_to_sharepoint(upload_url: &str, file_path: &Path) -> Result<(), String> {
    let client = Client::new();
    let mut file = File::open(file_path).await.map_err(|e| format!("Failed to open file: {}", e))?;
    
    let file_size = file.metadata().await.map_err(|e| format!("Failed to read metadata: {}", e))?.len();
    
    if file_size == 0 {
        return Err("Cannot upload empty file".to_string());
    }

    let mut start = 0u64;

    while start < file_size {
        let end = std::cmp::min(start + CHUNK_SIZE, file_size);
        let current_chunk_size = end - start;
        
        let mut buffer = vec![0u8; current_chunk_size as usize];
        
        file.seek(SeekFrom::Start(start)).await.map_err(|e| format!("Seek failed: {}", e))?;
        file.read_exact(&mut buffer).await.map_err(|e| format!("Read failed: {}", e))?;

        let content_range = format!("bytes {}-{}/{}", start, end - 1, file_size);
        
        let response = client.put(upload_url)
            .header("Content-Length", current_chunk_size.to_string())
            .header("Content-Range", content_range)
            .body(buffer)
            .send()
            .await
            .map_err(|e| format!("Upload request failed: {}", e))?;
            
        let status = response.status();
        
        // 202 Accepted means chunk was successful, but more is expected.
        // 201 Created or 200 OK means the upload is completely finished.
        if !status.is_success() {
            let err_body = response.text().await.unwrap_or_default();
            return Err(format!("Chunk upload failed: HTTP {} - {}", status, err_body));
        }

        start = end;
    }

    Ok(())
}
