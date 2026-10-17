use std::path::PathBuf;
use winreg::enums::*;
use winreg::RegKey;
use std::os::windows::fs::MetadataExt;

/// Discover all mapped OneDrive and SharePoint local sync paths from the Registry
pub fn discover_onedrive_paths() -> Vec<String> {
    let mut paths = Vec::new();
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    
    // Check standard OneDrive and OneDrive for Business keys
    let accounts_key = "Software\\Microsoft\\OneDrive\\Accounts";
    if let Ok(key) = hkcu.open_subkey(accounts_key) {
        for subkey_name_res in key.enum_keys() {
            if let Ok(subkey_name) = subkey_name_res {
                if let Ok(subkey) = key.open_subkey(&subkey_name) {
                    if let Ok(path) = subkey.get_value::<String, _>("UserFolder") {
                        if !paths.contains(&path) {
                            paths.push(path);
                        }
                    }
                }
            }
        }
    }
    
    // Check Tenant folders (often under Software\\SyncEngines\\Providers\\OneDrive)
    if let Ok(sync_engines) = hkcu.open_subkey("Software\\SyncEngines\\Providers\\OneDrive") {
        for subkey_name_res in sync_engines.enum_keys() {
            if let Ok(subkey_name) = subkey_name_res {
                if let Ok(subkey) = sync_engines.open_subkey(&subkey_name) {
                    if let Ok(path) = subkey.get_value::<String, _>("MountPoint") {
                        if !paths.contains(&path) {
                            paths.push(path);
                        }
                    }
                }
            }
        }
    }

    paths
}

/// Check if a file is offline/cloud-only and needs hydration
/// 0x00400000 is FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS in Windows
pub fn is_file_cloud_only(path: &str) -> bool {
    let p = PathBuf::from(path);
    if let Ok(metadata) = std::fs::metadata(&p) {
        let attrs = metadata.file_attributes();
        return (attrs & 0x00400000) != 0 || (attrs & 0x00001000) != 0; // RECALL_ON_DATA_ACCESS or OFFLINE
    }
    false
}

/// Automatically configures RSN.ini across all Revit versions (2020 through 2026)
/// so client workstations can seamlessly discover and connect to the central Revit Server.
pub fn auto_configure_revit_server(server_ips: &[&str]) -> Result<(), String> {
    let program_data = std::env::var("ProgramData").unwrap_or_else(|_| "C:\\ProgramData".to_string());
    
    for year in 2020..=2026 {
        let config_dir = PathBuf::from(&program_data)
            .join("Autodesk")
            .join(format!("Revit Server {}", year))
            .join("Config");
        
        let _ = std::fs::create_dir_all(&config_dir);
        let rsn_path = config_dir.join("RSN.ini");
        
        let mut existing_lines: Vec<String> = if rsn_path.exists() {
            std::fs::read_to_string(&rsn_path)
                .unwrap_or_default()
                .lines()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        } else {
            Vec::new()
        };
        
        let mut modified = false;
        for ip in server_ips {
            let ip_str = ip.trim().to_string();
            if !existing_lines.contains(&ip_str) {
                existing_lines.push(ip_str);
                modified = true;
            }
        }
        
        if modified || !rsn_path.exists() {
            let content = existing_lines.join("\r\n");
            let _ = std::fs::write(&rsn_path, content);
            crate::debug_logger::debug_log(&format!("Configured Revit Server {} RSN.ini with hosts", year));
        }
    }
    
    Ok(())
}

/// Reveals a file in Windows File Explorer (equivalent to right-click -> Open in Explorer)
pub fn reveal_in_explorer(path: &str) -> Result<(), String> {
    use std::process::Command;
    let path_obj = std::path::Path::new(path);
    if path_obj.exists() {
        Command::new("explorer.exe")
            .arg(format!("/select,{}", path))
            .spawn()
            .map_err(|e| format!("Failed to reveal in explorer: {}", e))?;
    } else {
        // Fall back to opening the folder or X:\ drive
        if let Some(parent) = path_obj.parent() {
            if parent.exists() {
                Command::new("explorer.exe")
                    .arg(parent)
                    .spawn()
                    .map_err(|e| format!("Failed to open folder: {}", e))?;
                return Ok(());
            }
        }
        Command::new("explorer.exe")
            .arg("X:\\")
            .spawn()
            .map_err(|e| format!("Failed to open X:\\ drive: {}", e))?;
    }
    Ok(())
}

/// Opens a folder in native Windows File Explorer
pub fn open_folder_in_explorer(path: &str) -> Result<(), String> {
    use std::process::Command;
    let target = if std::path::Path::new(path).exists() { path } else { "X:\\" };
    Command::new("explorer.exe")
        .arg(target)
        .spawn()
        .map_err(|e| format!("Failed to open folder in explorer: {}", e))?;
    Ok(())
}

/// Sets or unsets the Windows FILE_ATTRIBUTE_READONLY flag
/// Crucial for preventing AutoCAD from corrupting locked or read-only files
pub fn set_file_readonly(path: &str, readonly: bool) -> Result<(), String> {
    let p = std::path::Path::new(path);
    if !p.exists() {
        return Ok(());
    }
    let mut perms = std::fs::metadata(p).map_err(|e| e.to_string())?.permissions();
    perms.set_readonly(readonly);
    std::fs::set_permissions(p, perms).map_err(|e| format!("Failed to set readonly permission: {}", e))?;
    Ok(())
}

/// Computes SHA-256 hash of a file for zero-corruption validation
pub fn compute_file_sha256(path: &std::path::Path) -> Result<String, String> {
    use sha2::{Sha256, Digest};
    use std::io::Read;
    let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 { break; }
        hasher.update(&buffer[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Safely writes bytes to disk using atomic temp-file write + rename + rolling backup
/// Prevents file corruption if process crashes, power is lost, or network drops
pub fn safe_atomic_write(dest_path: &std::path::Path, data: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let parent = dest_path.parent().unwrap_or(std::path::Path::new("."));
    if !parent.exists() {
        let _ = std::fs::create_dir_all(parent);
    }
    
    let temp_name = format!("{}.part_{}", 
        dest_path.file_name().unwrap_or_default().to_string_lossy(),
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()
    );
    let temp_path = parent.join(temp_name);

    // 1. Write full content to temp file & flush
    {
        let mut f = std::fs::File::create(&temp_path).map_err(|e| format!("Failed to create temp file: {}", e))?;
        f.write_all(data).map_err(|e| format!("Failed to write temp file: {}", e))?;
        f.sync_all().map_err(|e| format!("Failed to flush temp file: {}", e))?;
    }

    // 2. Rolling backup of previous version if it already exists
    if dest_path.exists() {
        let bak_path = dest_path.with_extension("cadflow_bak");
        let _ = std::fs::copy(dest_path, &bak_path);
    }

    // 3. Atomic rename (Windows atomic file replacement)
    std::fs::rename(&temp_path, dest_path).map_err(|e| {
        let _ = std::fs::remove_file(&temp_path);
        format!("Atomic file swap failed: {}", e)
    })?;

    Ok(())
}

#[derive(serde::Serialize)]
pub struct FileMetadataInfo {
    pub exists: bool,
    pub size_bytes: u64,
    pub is_readonly: bool,
    pub sha256: Option<String>,
    pub modified_time: Option<String>,
}

pub fn get_file_metadata_info(path: &str) -> FileMetadataInfo {
    let p = std::path::Path::new(path);
    if !p.exists() {
        return FileMetadataInfo {
            exists: false,
            size_bytes: 0,
            is_readonly: false,
            sha256: None,
            modified_time: None,
        };
    }

    let meta = std::fs::metadata(p).ok();
    let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
    let is_readonly = meta.as_ref().map(|m| m.permissions().readonly()).unwrap_or(false);
    let sha256 = compute_file_sha256(p).ok();
    
    let modified_time = meta.and_then(|m| m.modified().ok()).map(|time| {
        let datetime: ChronoFreeDisplay = time.into();
        datetime.0
    });

    FileMetadataInfo {
        exists: true,
        size_bytes: size,
        is_readonly,
        sha256,
        modified_time,
    }
}

struct ChronoFreeDisplay(String);
impl From<std::time::SystemTime> for ChronoFreeDisplay {
    fn from(t: std::time::SystemTime) -> Self {
        let dur = t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
        let secs = dur.as_secs();
        ChronoFreeDisplay(format!("Unix-{}", secs))
    }
}

