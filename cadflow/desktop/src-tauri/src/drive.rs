use std::path::Path;
use std::process::Command;
use std::os::windows::process::CommandExt;

/// Mounts the local disk cache to the virtual drive `X:\` using `subst`.
/// 
/// Note: On Windows, `subst` requires the target to be a string path.
pub fn mount_virtual_drive(cache_path: &Path) -> Result<(), String> {
    let path_str = cache_path.to_str().ok_or("Invalid path encoding for cache_path")?;
    
    // Unmount first in case it's already mounted (ignore failure if it's not)
    let _ = unmount_virtual_drive();

    let output = Command::new("subst")
        .arg("X:")
        .arg(path_str)
        // CREATE_NO_WINDOW flag to prevent console flashing (0x08000000)
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("Failed to execute subst command: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to mount virtual drive X:. Error: {}", err_msg))
    }
}

/// Unmounts the virtual drive `X:\`
pub fn unmount_virtual_drive() -> Result<(), String> {
    let output = Command::new("subst")
        .arg("X:")
        .arg("/D")
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("Failed to execute subst command: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to unmount virtual drive X:. Error: {}", err_msg))
    }
}
