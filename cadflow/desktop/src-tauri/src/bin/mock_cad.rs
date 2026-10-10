use std::env;
use std::fs::{File, OpenOptions};
use std::io::{self, Write};
use std::path::PathBuf;
use std::process;

fn print_usage(prog_name: &str) {
    println!("Usage: {} <path-to-dwg-or-rvt-file>", prog_name);
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() != 2 {
        print_usage(&args[0]);
        process::exit(1);
    }

    let target_path = PathBuf::from(&args[1]);
    
    if !target_path.exists() {
        if let Ok(mut f) = File::create(&target_path) {
            let _ = f.write_all(b"MOCK CAD FILE CONTENT");
        }
    }

    // 1. Open an exclusive write handle to simulate OS lock (OS Error 32 for others)
    let _exclusive_handle = match OpenOptions::new()
        .read(true)
        .write(true)
        .open(&target_path) {
            Ok(file) => file,
            Err(e) => {
                eprintln!("Error: Could not acquire exclusive handle on {:?}: {}", target_path, e);
                process::exit(1);
            }
        };

    println!("Acquired exclusive OS handle on: {:?}", target_path);

    // 2. Write companion .dwl and .dwl2 files
    let dwl_path = target_path.with_extension("dwl");
    let dwl2_path = target_path.with_extension("dwl2");

    let mut dwl = File::create(&dwl_path).expect("Failed to create .dwl file");
    dwl.write_all(b"mock_user\nmock_machine").unwrap();
    
    let mut dwl2 = File::create(&dwl2_path).expect("Failed to create .dwl2 file");
    dwl2.write_all(b"mock_user\nmock_machine\nadditional info").unwrap();

    println!("Created companion lock files: {:?} and {:?}", dwl_path, dwl2_path);
    println!("CAD Simulator is running. Commands:");
    println!("  s - Simulate Ctrl+S save (atomic write)");
    println!("  q - Clean close (remove locks and exit)");
    println!("  k - Force kill to test crash recovery (exit without removing locks)");

    // Interactive loop
    loop {
        print!("> ");
        io::stdout().flush().unwrap();

        let mut input = String::new();
        if io::stdin().read_line(&mut input).is_err() {
            break;
        }

        let cmd = input.trim();
        match cmd {
            "s" => {
                println!("Simulating Ctrl+S atomic save...");
                // Append some bytes to trigger notify watcher events
                let mut temp_handle = OpenOptions::new().append(true).open(&target_path).unwrap();
                writeln!(temp_handle, "save tick").unwrap();
                println!("Save completed.");
            },
            "q" => {
                println!("Performing clean close...");
                drop(_exclusive_handle);
                let _ = std::fs::remove_file(&dwl_path);
                let _ = std::fs::remove_file(&dwl2_path);
                println!("Locks removed. Exiting.");
                process::exit(0);
            },
            "k" => {
                println!("Force killing process (locks remain)...");
                process::exit(9); // Unclean exit
            },
            _ => {
                if !cmd.is_empty() {
                    println!("Unknown command: {}", cmd);
                }
            }
        }
    }
}
