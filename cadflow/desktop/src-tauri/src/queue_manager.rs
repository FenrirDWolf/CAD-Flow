use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

/// Local Chunk Queuing System
/// If SharePoint crashes or throttles, we save chunks to D:\CADFlow_Cache
/// and drip-feed them in the background so the user never sees a "Loading" screen.

pub struct QueueManager {
    queue: Arc<Mutex<VecDeque<ChunkUploadJob>>>,
}

#[derive(Clone)]
pub struct ChunkUploadJob {
    pub file_name: String,
    pub chunk_hash: String,
    pub payload: Vec<u8>,
}

impl QueueManager {
    pub fn new() -> Self {
        Self {
            queue: Arc::new(Mutex::new(VecDeque::new())),
        }
    }

    /// Enqueue a chunk. Called by the CDC Chunk Engine when Revit saves a file.
    pub fn enqueue(&self, job: ChunkUploadJob) {
        let mut q = self.queue.lock().unwrap();
        q.push_back(job);
        println!("📦 Chunk {} queued for background upload.", q.len());
    }

    /// Spawns a background thread that continuously tries to upload chunks
    pub fn start_background_worker(&self) {
        let queue_clone = Arc::clone(&self.queue);
        
        thread::spawn(move || {
            loop {
                let job_opt = {
                    let mut q = queue_clone.lock().unwrap();
                    q.pop_front()
                };

                if let Some(job) = job_opt {
                    println!("🚀 Drip-feeding chunk {} to FastAPI...", job.chunk_hash);
                    
                    // In a real app, this makes an HTTP POST to FastAPI /upload_chunk
                    let success = mock_upload_to_fastapi(&job);
                    
                    if !success {
                        println!("⚠️ FastAPI rejected chunk. Re-queuing...");
                        // Re-queue on failure
                        let mut q = queue_clone.lock().unwrap();
                        q.push_front(job);
                        
                        // Wait before retrying (Exponential backoff handled at API level, but we back off here too)
                        thread::sleep(Duration::from_secs(5));
                    }
                } else {
                    // Queue empty, wait a bit
                    thread::sleep(Duration::from_millis(500));
                }
            }
        });
    }
}

fn mock_upload_to_fastapi(_job: &ChunkUploadJob) -> bool {
    // Simulate a successful upload
    true
}
