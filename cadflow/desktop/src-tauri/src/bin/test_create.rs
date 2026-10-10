use std::fs::File;
use std::path::PathBuf;

fn main() {
    let path = PathBuf::from("C:\\Users\\Public\\CADFlow_Cache\\Project\\DRAINAGE SERVICES LAYOUT --------- 27-07-2023.dwg");
    match File::create(&path) {
        Ok(_) => println!("Success!"),
        Err(e) => println!("Failed: {}", e),
    }
}
