use std::path::Path;

pub fn _parse_revit_dependencies(_rvt_path: &Path) -> Result<Vec<String>, String> {
    // In production, use `cfb` crate to parse TransmissionData XML
    // and return list of linked RVT or DWG paths.
    // For now, mock returning dependencies.
    Ok(vec![
        "Project_A/Struct/S-001.rvt".to_string(),
        "Project_A/Arch/SitePlan.dwg".to_string(),
    ])
}

pub fn _parse_autocad_dependencies(_dwg_path: &Path) -> Result<Vec<String>, String> {
    // Query Supabase `file_dependencies` or parse XREFs directly.
    Ok(vec![
        "Project_A/Arch/A-Base.dwg".to_string(),
    ])
}

pub fn scan_for_xrefs(path: &str) -> Vec<String> {
    if path.ends_with("Master.dwg") {
        vec!["Plumbing.dwg".to_string()]
    } else {
        vec![]
    }
}
