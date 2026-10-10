# CADFlow Orchestrator

CADFlow is a lightweight, zero-configuration desktop cloud orchestrator that turns a firm's existing Microsoft 365 SharePoint Document Library into a high-speed, conflict-free Common Data Environment (CDE) for AutoCAD (`.dwg`) and Revit (`.rvt`).

## Local Development Boot Sequence

Follow these 4 steps to boot the entire CADFlow system on your local developer machine.

### Step 1: Start the FastAPI Orchestrator
In a new terminal, navigate to the backend directory, install dependencies, and start the uvicorn server.
```bash
cd cadflow/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Step 2: Start the Tauri Desktop App
In a second terminal, start the React 19 / Tauri v2 frontend.
```bash
cd cadflow/desktop
npm install
npm run dev
```

### Step 3: Run the Mock CAD Simulator
If you do not have AutoCAD or Revit installed, you can test the OS lock file detection by running the mock simulator in a third terminal. This mimics the `.dwl2` companion file creation and exclusive file handle locking.
```bash
cd cadflow/desktop/src-tauri
cargo run --bin mock_cad X:\Project\Ground_Floor.dwg
```

### Step 4: Test the Workflow
1. In the Tauri desktop app, double-click a file to lock it. The badge will instantly change to **PENDING** via `useOptimistic`, and then **ACTIVE** once the FastAPI backend acquires the lock.
2. In the `mock_cad` terminal, type `q` to quit and simulate closing the drawing.
3. The Rust watcher will detect the handle release and emit a `cad_file_closed` event to the React UI.
4. The React UI will automatically pop up the **Shift Handover** modal for you to leave a check-in comment.
