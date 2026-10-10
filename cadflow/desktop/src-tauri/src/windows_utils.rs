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
