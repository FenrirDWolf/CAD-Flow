use std::path::PathBuf;
use winreg::enums::HKEY_CLASSES_ROOT;
use winreg::RegKey;
use serde::Serialize;

#[derive(Debug, Default, Serialize, Clone)]
pub struct CadInstallations {
    pub autocad_path: Option<PathBuf>,
    pub revit_path: Option<PathBuf>,
}

#[derive(Debug, Default, Serialize, Clone)]
pub struct RevitVersionDetail {
    pub year: u32,
    pub path: PathBuf,
    pub is_server_compatible: bool,
}

#[derive(Debug, Default, Serialize, Clone)]
pub struct RevitCompatibilityReport {
    pub installed_versions: Vec<RevitVersionDetail>,
    pub has_revit_2025: bool,
    pub server_target_year: u32,
    pub server_host: String,
    pub warning: Option<String>,
}

/// Finds the default installed executable paths for AutoCAD (.dwg) and Revit (.rvt).
pub fn find_cad_installations() -> CadInstallations {
    let mut installs = CadInstallations::default();
    let hkcr = RegKey::predef(HKEY_CLASSES_ROOT);

    installs.autocad_path = extract_exe_path(&hkcr, ".dwg\\shell\\open\\command");
    installs.revit_path = extract_exe_path(&hkcr, ".rvt\\shell\\open\\command");

    installs
}

/// Checks all installed versions of Revit (2020 through 2026) and validates compatibility
/// with the central London Hub Revit Server 2025.
/// Resolves Failure Mode D: Revit Model Version Incompatibility
pub fn check_revit_compatibility() -> RevitCompatibilityReport {
    let mut installed = Vec::new();
    let years = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
    
    for &yr in &years {
        let expected_path = PathBuf::from(format!("C:\\Program Files\\Autodesk\\Revit {}\\Revit.exe", yr));
        if expected_path.exists() {
            installed.push(RevitVersionDetail {
                year: yr,
                path: expected_path,
                is_server_compatible: yr == 2025,
            });
        }
    }

    let has_2025 = installed.iter().any(|v| v.year == 2025);
    let warning = if !has_2025 {
        if installed.is_empty() {
            Some("Autodesk Revit 2025 is not detected. Central models on London Hub (212.86.105.232) require Revit 2025.".to_string())
        } else {
            let found_years: Vec<String> = installed.iter().map(|v| v.year.to_string()).collect();
            Some(format!(
                "Revit Version Warning: London Hub hosts Revit 2025 models. Detected versions: [{}]. Opening with older versions will cause an Autodesk version rejection.",
                found_years.join(", ")
            ))
        }
    } else {
        None
    };

    RevitCompatibilityReport {
        installed_versions: installed,
        has_revit_2025: has_2025,
        server_target_year: 2025,
        server_host: "212.86.105.232".to_string(),
        warning,
    }
}

fn extract_exe_path(hkcr: &RegKey, subkey: &str) -> Option<PathBuf> {
    if let Ok(key) = hkcr.open_subkey(subkey) {
        if let Ok(val) = key.get_value::<String, _>("") {
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
