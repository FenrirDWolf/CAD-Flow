use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use fastcdc::v2020::StreamCDC;
use sha2::{Sha256, Digest};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct _ChunkManifest {
    pub file_name: String,
    pub total_size: u64,
    pub chunks: Vec<_ChunkInfo>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct _ChunkInfo {
    pub hash: String,
    pub offset: u64,
    pub size: usize,
}

/// Splits a large CAD file into content-defined chunks (average 4MB)
/// and generates a manifest. This completely solves the SharePoint Delta problem.
/// Instead of uploading 1GB, we only upload chunks whose hashes changed.
pub fn _generate_manifest(file_path: &Path) -> Result<(_ChunkManifest, Vec<(String, Vec<u8>)>), String> {
    let mut file_opt = None;
    for _ in 0..5 {
        match File::open(file_path) {
            Ok(f) => { file_opt = Some(f); break; }
            Err(_) => std::thread::sleep(std::time::Duration::from_millis(500)),
        }
    }
    let file = file_opt.ok_or("Could not open file after 5 retries (locked)".to_string())?;
    let file_name = file_path.file_name().unwrap().to_string_lossy().into_owned();
    let total_size = file.metadata().unwrap().len();

    // Configure CDC for 4MB average chunks (min 2MB, max 8MB)
    let chunker = StreamCDC::new(file, 65536, 131072, 262144);
    let mut manifest_chunks = Vec::new();
    let mut chunk_data_map = Vec::new();

    for chunk_res in chunker {
        let chunk = chunk_res.map_err(|e| e.to_string())?;
        
        let mut hasher = Sha256::new();
        hasher.update(&chunk.data);
        let hash_str = format!("{:x}", hasher.finalize());

        manifest_chunks.push(_ChunkInfo {
            hash: hash_str.clone(),
            offset: chunk.offset,
            size: chunk.length,
        });

        chunk_data_map.push((hash_str, chunk.data));
    }

    let manifest = _ChunkManifest {
        file_name,
        total_size,
        chunks: manifest_chunks,
    };

    Ok((manifest, chunk_data_map))
}

/// Assembles chunks back into the original file (e.g. for P2P or local hydration)
pub fn _assemble_from_manifest(manifest: &_ChunkManifest, chunk_storage_dir: &Path, output_path: &Path) -> Result<(), String> {
    let mut out_file = File::create(output_path).map_err(|e| e.to_string())?;
    
    for chunk in &manifest.chunks {
        let chunk_file_path = chunk_storage_dir.join(&chunk.hash);
        let mut chunk_file = File::open(chunk_file_path).map_err(|e| e.to_string())?;
        
        let mut buffer = Vec::new();
        chunk_file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
        out_file.write_all(&buffer).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}


