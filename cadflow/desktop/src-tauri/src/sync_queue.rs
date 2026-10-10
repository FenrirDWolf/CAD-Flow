use reqwest::Client;
use serde_json::json;
use std::time::Duration;
use tokio::time::sleep;
use tauri::AppHandle;

/// Intercepts Revit's Sync process by acting as the Queue Coordinator.
/// In reality, this might watch for `.slog` writes and hold the OS handle
/// until FastAPI grants `SYNCING` permission.
pub async fn _request_sync_permission(_app_handle: &AppHandle, item_id: &str, user_name: &str) -> Result<(), String> {
    let client = Client::new();
    let payload = json!({
        "sharepoint_item_id": item_id,
        "user_name": user_name
    });

    let res = client.post("http://localhost:8000/api/v1/sync/enqueue")
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let data: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    
    // In production, if status is 'WAITING', we subscribe to Supabase Realtime 
    // or poll until status == 'SYNCING' before releasing the block on the file.
    if data["status"] == "WAITING" {
        println!("We are waiting in the queue...");
        // Poll for status change (simulated)
        sleep(Duration::from_secs(2)).await;
    }

    Ok(())
}

pub async fn _report_sync_complete(queue_id: &str) -> Result<(), String> {
    let client = Client::new();
    client.post(&format!("http://localhost:8000/api/v1/sync/complete/{}", queue_id))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
