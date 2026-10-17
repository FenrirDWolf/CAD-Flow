use std::path::Path;
use std::process::Command;
use std::os::windows::process::CommandExt;
use std::sync::Mutex;
use once_cell::sync::Lazy;

static CURRENT_MOUNTED_DRIVE: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

const CANDIDATE_DRIVE_LETTERS: &[char] = &['X', 'Y', 'Z', 'V', 'W', 'U'];

/// Checks if a drive letter is already pointing to our CADFlow cache
fn is_drive_already_cadflow(letter: char, cache_path: &Path) -> bool {
    let _drive_root = format!("{}:\\", letter);
    let project_dir = format!("{}:\\Project", letter);
    
    if Path::new(&project_dir).exists() {
        return true;
    }
    
    // Also check via subst output
    if let Ok(output) = Command::new("subst").creation_flags(0x08000000).output() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let prefix = format!("{}:\\: => ", letter);
        let cache_str = cache_path.to_string_lossy();
        for line in stdout.lines() {
            if line.starts_with(&prefix) && line.contains(&*cache_str) {
                return true;
            }
        }
    }
    false
}

/// Checks if a drive letter is free and available to be mounted
fn is_drive_letter_available(letter: char) -> bool {
    let path = format!("{}:\\", letter);
    !Path::new(&path).exists()
}

/// Mounts the local disk cache to the first available virtual drive letter (X:, Y:, Z:, etc.)
/// Resolves Failure Mode A: Drive Letter Collision
pub fn mount_virtual_drive(cache_path: &Path) -> Result<String, String> {
    let path_str = cache_path.to_str().ok_or("Invalid path encoding for cache_path")?;
    
    // 1. First, check if we already have an active mount for our cache
    for &letter in CANDIDATE_DRIVE_LETTERS {
        if is_drive_already_cadflow(letter, cache_path) {
            let letter_str = letter.to_string();
            let mut current = CURRENT_MOUNTED_DRIVE.lock().unwrap();
            *current = Some(letter_str.clone());
            crate::debug_logger::debug_log(&format!("CADFlow cache already active on {}:\\", letter));
            return Ok(letter_str);
        }
    }

    // 2. Find the first available drive letter
    let mut selected_letter: Option<char> = None;
    for &letter in CANDIDATE_DRIVE_LETTERS {
        if is_drive_letter_available(letter) {
            selected_letter = Some(letter);
            break;
        }
    }

    let letter = selected_letter.ok_or_else(|| {
        "All candidate drive letters (X, Y, Z, V, W, U) are currently in use by other physical or network drives.".to_string()
    })?;

    let drive_arg = format!("{}:", letter);

    // Unmount stale mount if present
    let _ = Command::new("subst")
        .arg(&drive_arg)
        .arg("/D")
        .creation_flags(0x08000000)
        .output();

    let output = Command::new("subst")
        .arg(&drive_arg)
        .arg(path_str)
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("Failed to execute subst command for {}: {}", drive_arg, e))?;

    let root_path = format!("{}:\\", letter);
    if output.status.success() || Path::new(&root_path).exists() {
        let letter_str = letter.to_string();
        let mut current = CURRENT_MOUNTED_DRIVE.lock().unwrap();
        *current = Some(letter_str.clone());
        crate::debug_logger::debug_log(&format!("Successfully mounted CADFlow virtual drive on {}:\\", letter));
        Ok(letter_str)
    } else {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to mount virtual drive {}: Error: {}", drive_arg, err_msg))
    }
}

/// Returns the currently active mounted drive letter (defaulting to "X" if not yet set)
pub fn get_mounted_drive_letter() -> String {
    let current = CURRENT_MOUNTED_DRIVE.lock().unwrap();
    current.clone().unwrap_or_else(|| "X".to_string())
}

/// Unmounts the active virtual drive
pub fn unmount_virtual_drive() -> Result<(), String> {
    let drive_letter = get_mounted_drive_letter();
    let drive_arg = format!("{}:", drive_letter);

    let output = Command::new("subst")
        .arg(&drive_arg)
        .arg("/D")
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("Failed to execute subst /D for {}: {}", drive_arg, e))?;

    let mut current = CURRENT_MOUNTED_DRIVE.lock().unwrap();
    *current = None;

    if output.status.success() {
        Ok(())
    } else {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        Err(format!("Failed to unmount virtual drive {}: Error: {}", drive_arg, err_msg))
    }
}
