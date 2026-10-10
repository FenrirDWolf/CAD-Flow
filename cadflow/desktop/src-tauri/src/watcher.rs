use std::fs::OpenOptions;
use std::path::{Path, PathBuf};
use notify::{Watcher, RecursiveMode, Event, Config, RecommendedWatcher};
use std::sync::mpsc::channel;
use std::time::Duration;
use std::thread;

/// Checks if a CAD file is in use.
/// 
/// 1. Checks for the existence of companion `.dwl` or `.dwl2` files.
/// 2. Attempts an exclusive read/write handle test on the file itself.
pub fn is_cad_file_in_use(path: &Path) -> bool {
    // 1. Check companion files
    if let Some(ext) = path.extension() {
        if ext.eq_ignore_ascii_case("dwg") || ext.eq_ignore_ascii_case("rvt") {
            let dwl_path = path.with_extension("dwl");
            let dwl2_path = path.with_extension("dwl2");

            if dwl_path.exists() || dwl2_path.exists() {
                return true;
            }
        }
    }

    // 2. Attempt exclusive read/write handle test
    // If we cannot get exclusive access (e.g., sharing violation OS Error 32),
    // it implies another process (CAD program) has it open.
    match OpenOptions::new().read(true).write(true).open(path) {
        Ok(_) => false, // We got the lock, so it's not in use
        Err(e) => {
            // OS Error 32 is ERROR_SHARING_VIOLATION on Windows
            if let Some(os_err) = e.raw_os_error() {
                if os_err == 32 {
                    return true;
                }
            }
            // If it's another error (like Permission Denied or File Not Found),
            // consider it in use or inaccessible to be safe.
            true
        }
    }
}

use regex::Regex;
use tauri::AppHandle;
use tauri::Emitter;

use once_cell::sync::Lazy;

static ISO_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[A-Z0-9]{2,6}-[A-Z0-9]{2,6}-[A-Z0-9]{2}-[A-Z0-9]{2}-[A-Z0-9]{2}-[A-Z]-[0-9]{4}(\.dwg|\.rvt)$").unwrap()
});

pub fn is_valid_iso_19650(filename: &str) -> bool {
    ISO_REGEX.is_match(filename)
}

#[derive(Clone, serde::Serialize)]
struct IsoValidationFailedPayload {
    file_path: String,
}

/// Spawns a background thread to watch for atomic saves (Ctrl+S).
/// AutoCAD and Revit often perform atomic saves by writing to a temporary file
/// and then swapping it with the original.
#[allow(dead_code)]
pub fn start_cad_save_watcher(app_handle: AppHandle, cache_dir: PathBuf, on_save_callback: impl Fn(PathBuf) + Send + 'static) -> Result<(), notify::Error> {
    thread::spawn(move || {
        let (tx, rx) = channel();
        
        let mut watcher = match RecommendedWatcher::new(tx, Config::default().with_poll_interval(Duration::from_secs(2))) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("Failed to create watcher: {}", e);
                return;
            }
        };

        if let Err(e) = watcher.watch(&cache_dir, RecursiveMode::Recursive) {
            eprintln!("Failed to watch directory: {}", e);
            return;
        }

        for res in rx {
            match res {
                Ok(Event { kind, paths, .. }) => {
                    // Detect atomic save operations
                    if kind.is_modify() || kind.is_create() {
                        for path in paths {
                            if let Some(ext) = path.extension() {
                                if ext.eq_ignore_ascii_case("dwg") || ext.eq_ignore_ascii_case("rvt") {
                                    // A save likely happened to this CAD file
                                    if let Some(file_name_os) = path.file_name() {
                                        if let Some(file_name) = file_name_os.to_str() {
                                            if !is_valid_iso_19650(file_name) {
                                                // 1. Mark as quarantined locally (pseudo)
                                                // 2. Emit Tauri event to React UI
                                                let payload = IsoValidationFailedPayload {
                                                    file_path: path.to_string_lossy().into_owned(),
                                                };
                                                let _ = app_handle.emit("iso_validation_failed", payload);
                                                continue;
                                            }
                                        }
                                    }
                                    // Branch divergence logic
                                    let local_hash = "mock_local_hash";
                                    let remote_hash = "mock_remote_hash";
                                    if local_hash != remote_hash {
                                        let _ = app_handle.emit("branch_created", serde_json::json!({
                                            "file": path.file_name().unwrap().to_string_lossy().into_owned(),
                                            "branch_name": format!("{}_OfflineBranch_Alex", path.file_name().unwrap().to_string_lossy())
                                        }));
                                        continue; // Prevent overwrite
                                    }

                                    on_save_callback(path);
                                }
                            }
                        }
                    }
                },
                Err(e) => println!("Watch error: {:?}", e),
            }
        }
    });
    
    Ok(())
}
