use std::path::PathBuf;
use winreg::enums::HKEY_CLASSES_ROOT;
use winreg::RegKey;
use serde::Serialize;

#[derive(Debug, Default, Serialize)]
pub struct CadInstallations {
    pub autocad_path: Option<PathBuf>,
    pub revit_path: Option<PathBuf>,
}

/// Finds the installed executable paths for AutoCAD (.dwg) and Revit (.rvt).
/// Queries HKCR\.dwg\shell\open\command and HKCR\.rvt\shell\open\command.
pub fn find_cad_installations() -> CadInstallations {
    let mut installs = CadInstallations::default();
    let hkcr = RegKey::predef(HKEY_CLASSES_ROOT);

    installs.autocad_path = extract_exe_path(&hkcr, ".dwg\\shell\\open\\command");
    installs.revit_path = extract_exe_path(&hkcr, ".rvt\\shell\\open\\command");

    installs
}

fn extract_exe_path(hkcr: &RegKey, subkey: &str) -> Option<PathBuf> {
    if let Ok(key) = hkcr.open_subkey(subkey) {
        if let Ok(val) = key.get_value::<String, _>("") {
            // Value is usually like: "C:\Program Files\Autodesk\AutoCAD 2024\acad.exe" "%1"
            // We need to parse out the executable path.
            let mut exe_path = val;
            
            if exe_path.starts_with('"') {
                if let Some(end_idx) = exe_path[1..].find('"') {
                    exe_path = exe_path[1..=end_idx].to_string();
                }
            } else if let Some(space_idx) = exe_path.find(" -") {
                exe_path = exe_path[..space_idx].to_string();
            } else if let Some(space_idx) = exe_path.find(" %") {
                exe_path = exe_path[..space_idx].to_string();
            }
            
            let path = PathBuf::from(exe_path);
            if path.exists() {
                return Some(path);
            }
        }
    }
    None
}
