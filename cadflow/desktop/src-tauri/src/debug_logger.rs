use std::fs::OpenOptions;
use std::io::Write;
pub fn debug_log(msg: &str) {
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open("C:\\Users\\Public\\CADFlow_Cache\\debug.log") {
        let _ = writeln!(file, "{}", msg);
    }
}
