use regex::Regex;
use std::path::Path;

/// Validates file names against ISO 19650 standards.
/// Example valid: PRJ-ARC-Z01-ZZ-M3-A-0001.dwg
/// Example invalid: final_floorplan_v3_USE_THIS.dwg
pub fn _validate_filename(file_path: &str) -> Result<(), String> {
    let path = Path::new(file_path);
    let file_name = path.file_stem().unwrap_or_default().to_string_lossy();
    
    // ISO 19650 standard regex pattern: Project-Originator-Volume-Level-Type-Role-Number
    // e.g., PRJ-ARC-Z01-ZZ-M3-A-0001
    let iso_pattern = Regex::new(r"^[A-Z0-9]{3,6}-[A-Z0-9]{3}-[A-Z0-9]{2,3}-[A-Z0-9]{2}-[A-Z0-9]{2}-[A-Z]-[0-9]{4,6}$").unwrap();

    if iso_pattern.is_match(&file_name) {
        Ok(())
    } else {
        Err(format!(
            "File name '{}' violates ISO 19650 naming conventions. \nExpected format: Project-Originator-Volume-Level-Type-Role-Number (e.g., PRJ-ARC-Z01-ZZ-M3-A-0001)",
            file_name
        ))
    }
}

pub fn _intercept_save(file_path: &str) -> bool {
    match _validate_filename(file_path) {
        Ok(_) => {
            println!("ISO 19650 Validation Passed: {}", file_path);
            true
        },
        Err(err) => {
            println!("SAVE BLOCKED: {}", err);
            // In a real implementation, we would use native Windows API hooks (MiniFilter driver)
            // or Tauri window dialogs to block the save and alert the user.
            false
        }
    }
}
