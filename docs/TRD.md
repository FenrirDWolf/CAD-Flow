# Technical Requirements Document (TRD): CADFlow

**Version:** 2.0 (Oct **2026** Production Stack) **Status:** Approved for Implementation **Architecture Context:** Distributed desktop client (Tauri v2/Rust **2024**) interacting with a centralized stateless coordinator (FastAPI/Python 3.14), real-time state database (Supabase PostgreSQL 16), and external binary storage (Microsoft Graph **API**).

---

## 1. System Architecture Overview

CADFlow operates on a split-plane architecture:
1. **Control Plane (Metadata & Locks):** Handled by FastAPI and Supabase. Tracks *who* is doing *what*, resolving race conditions before they hit SharePoint.
2. **Data Plane (Binary File Transfer):** Handled directly between the Rust desktop client and the Microsoft Graph **API**. Heavy `.dwg` and `.rvt` bytes **never** touch the FastAPI server.

### High-Level Component Stack (Oct 2026 Standards)

- **Frontend (UI):** React 19 (React Compiler enabled), TypeScript 5.6+, Tailwind **CSS** v4 (Oxidized engine).
- **Desktop Core:** Rust (**2024** Edition), Tauri v2, `tokio` (async runtime), `reqwest` (**HTTP**), `notify` (FS watcher), `cfb` (**OLE2** parsing).
- **Cloud Orchestrator:** Python 3.14 (Free-threaded / **GIL**-free optimizations), FastAPI, Pydantic v2 (Rust core), `httpx` (async Graph client).
- **Database & Pub/Sub:** Supabase PostgreSQL 16+, Row Level Security (**RLS**), Supabase Realtime (WebSockets).
- **Storage Backend:** Microsoft **365** SharePoint / Entra ID (Graph **API** v1.0).

---

## 2. Desktop Client (Rust 2024 + Tauri v2) Specification

### 2.1 OS Integration & Virtual Drive Engine

The Rust core is responsible for bypassing WebView memory limits and interacting deeply with the Windows OS.
- **Crates Used:** `windows` (Win32 **API** bindings), `std::process::Command`.
- **Drive Mounting Mechanism:** 
    *   Use `subst X: *D:\CADFlow_Cache*` for user-space session mounts.
    *   Fallback: Win32 `DefineDosDeviceW` if persistent mapping across elevated processes is required.
- ****CAD** Detection:** Use `AssocQueryStringW` or read `**HKCR**\.dwg\shell\open\command` to resolve the absolute path to the local `acad.exe` or `revit.exe`.

### 2.2 File Locking & Process Watcher Engine

Must strictly avoid process-tree monitoring (`child.wait()`) due to **CAD** **IPC** (Inter-Process Communication) handoffs.
- **Lock Indicators:**
    1.  **Companion Files:** Poll for `[filename].dwl` and `[filename].dwl2` in the exact directory.
    2.  **OS Exclusive Handle:** Attempt to open the file with `OpenOptions::new().read(true).write(true)`. A sharing violation (OS error 32) explicitly confirms AutoCAD/Revit holds the lock.
- **Heartbeat Emitter:** `tokio::time::interval(Duration::from_secs(60))` loop active *only* while the file is locked, sending **POST** to FastAPI.

### 2.3 Streaming Engine (Zero WebView RAM Overhead)

- **Mechanism:** When the `notify` crate detects an atomic save (`.tmp` -> `.dwg` rename event):
    *   Rust intercepts the event.
    *   Requests a `createUploadSession` **URL** from FastAPI (which proxies the Graph Auth).
    *   Streams the file from disk using `tokio::fs::File::read` into `reqwest::Body`.
- **Chunking Rule:** Microsoft Graph requires chunk sizes to be a multiple of ****320** KiB** (**327**,**680** bytes).
    *   **Configured Chunk Size:** 10 MiB (`**327**,**680** * 32`).

### 2.4 Dependency Parser (Xrefs & Linked Models)

- **Revit (`.rvt`):** Use the Rust `cfb` (Compound File Binary) crate to extract the `TransmissionData` **XML** stream. Parse **XML** to identify `<ExternalFileReference>` tags.
- **AutoCAD (`.dwg`):** Query the Supabase `file_dependencies` **JSON** manifest table mapped during previous check-ins.

---

## 3. Cloud Orchestrator (FastAPI) Specification

### 3.1 Lock State Machine (Split-Brain Prevention)

To prevent a state where Supabase claims a lock but SharePoint doesn't (or vice versa), the FastAPI `**POST** /locks/acquire` route must follow a strict atomic transaction:
1. **Stage 1 (Reserve):** Insert row in Supabase `file_locks` with `status = '**PENDING**'`. (Fails if another row exists due to **UNIQUE** constraint).
2. **Stage 2 (Acquire):** Call Microsoft Graph `**POST** /drives/{id}/items/{id}/checkout`.
3. **Stage 3 (Confirm):** 
    *   If Graph returns `**200** OK`: Update Supabase row to `status = '**ACTIVE**'`.
    *   If Graph returns `**409** Conflict` or network times out: Execute Supabase `**DELETE**` on the `**PENDING**` row and return `**423** Locked` to the client.

### 3.2 Endpoint Definitions

| Method | Route | Payload | Action |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/provision` | `{ tenant_id, admin_token }` | Executes Graph site creation, sets version limits, inserts into `organizations`. |
| `POST` | `/api/v1/locks/acquire` | `{ item_id, file_path, machine_id }` | Atomic 3-step Graph checkout and Supabase lock registration. |
| `POST` | `/api/v1/locks/heartbeat`| `{ lock_id }` | Updates `last_heartbeat_at` timestamp. |
| `POST` | `/api/v1/locks/release` | `{ lock_id, checkin_comment }`| Executes Graph check-in, deletes lock, logs to `checkin_history`. |
| `GET`  | `/api/v1/storage/upload` | `{ item_id }` | Generates and returns Graph Resumable Upload URL to Rust client. |

---

## 4. Supabase Database & Realtime Specification

### 4.1 Row Level Security (RLS)

The database operates in a multi-tenant environment. **RLS** policies must be strictly enforced using the **JWT** `tid` claim.
- **Policy Rule:** `auth.jwt() ->> 'tid' = organizations.microsoft_tenant_id`
- All queries to `file_locks`, `organizations`, and `checkin_history` must automatically filter based on this **RLS** rule.

### 4.2 WebSocket Payload Structure

The React 19 frontend subscribes to the `file_locks` channel. The payload shape transmitted by Supabase Realtime upon `**INSERT**`, `**UPDATE**`, or `**DELETE**`:
```json
{
    *type*: *UPDATE*,
    *table*: *file_locks*,
    *record*: {
    *sharepoint_item_id*: *01ABCDEFGH23456*,
    *file_path*: */Project_A/Arch/Ground_Floor.dwg*,
    *status*: *ACTIVE*,
    *locked_by_name*: *Kasi (India)*,
    *machine_hostname*: ***DESKTOP**-IN-01*
    }
}
## Security & Edge Case Handlers
5.1 Graph **API** **429** Throttling (Exponential Backoff)
When 30 users initialize morning downloads, Microsoft Graph will issue **HTTP** **429** Too Many Requests.

Requirement: Rust reqwest client **MUST** implement a middleware that parses the Retry-After header.

Behavior: Suspend the current thread for Retry-After seconds + rand(0..**500**)ms jitter before re-attempting the download chunk.

5.2 Zombie Lock Reaper (Cron Job) Trigger: FastAPI Background Task running every 5 minutes.

Logic: **UPDATE** file_locks **SET** status = '**STALE**' **WHERE** last_heartbeat_at < **NOW**() - **INTERVAL** '15 minutes' **AND** status = '**ACTIVE**';

Client Response: The UI will display **STALE** locks in purple/orange and expose the *Force Unlock* action to users with Admin roles.

5.3 Local Cache Eviction Policy To prevent D:\CADFlow_Cache from filling up over time:

Rule: Upon application startup, Rust scans the cache directory. Any file not accessed (LastAccessTime) in the past 14 days is deleted from the local disk.

## Development & Deployment Pipeline

6.1 Build Targets Windows (.msi / .exe): Primary target via tauri build --target x86_64-pc-windows-msvc.

Code Signing: Application must be signed using an EV (Extended Validation) Code Signing Certificate to bypass Windows SmartScreen warnings, given its requirement to execute subst and monitor file handles.

6.2 Environments Local/Dev: Uses mock_cad.exe and Microsoft **365** Developer Sandbox Tenant.

Staging: Isolated Supabase project + Production FastAPI connected to a test **M365** tenant.

Production: Auto-updater enabled via Tauri Updater, pulling release binaries from GitHub Releases / S3.