# App Flow Specification: CADFlow
**Version:** 1.0 (Phase 1 MVP)  
**Status:** Approved for Implementation  
**Purpose:** Defines the step-by-step logical sequence and system states for every core user action from installation to file handover.

---

## 1. Flow: Zero-Touch Onboarding & Provisioning
*Separates the one-time IT setup from the frictionless daily employee login.*

### 1.A Admin Setup Flow (One-Time per Company)
1. **Initiation:** Company IT Admin installs CADFlow and clicks **"Connect Company Microsoft 365"**.
2. **OAuth Request:** Tauri opens an external browser window to the Microsoft Entra ID `/adminconsent` endpoint requesting `Files.ReadWrite.All` and `Sites.ReadWrite.All`.
3. **Consent & Routing:** Admin clicks "Accept". Microsoft redirects back to the FastAPI backend with an authorization code and JWT.
4. **Backend Provisioning (FastAPI):**
   * Extracts the `tid` (Tenant ID) from the JWT.
   * Calls Graph API: `GET /sites/{site-id}/drive` to locate the target SharePoint site.
   * Calls Graph API: `POST /sites/{site-id}/lists` to create a new Document Library named `CADFlow_Projects` (if it doesn't exist).
   * Configures the library's `MajorVersionLimit` to 25 to prevent storage bloat.
   * Inserts the tenant mapping into the Supabase `organizations` table.
5. **Completion:** UI routes the Admin to the main dashboard.

### 1.B Employee Login Flow (Daily/Device Setup)
1. **Initiation:** Drafter (e.g., in Hyderabad) installs CADFlow and clicks **"Sign in with Microsoft"**.
2. **Authentication:** User logs in with their standard Microsoft 365 work email (`kasi@twilightgrp.com`).
3. **Auto-Mapping:** FastAPI decodes the JWT, extracts the `tid`, and matches it to the `organizations` table.
4. **Completion:** User is instantly routed to their company’s workspace with RLS (Row Level Security) safely applied. No manual configuration required.

---

## 2. Flow: Local Auto-Discovery & Virtual Workspace (App Launch)
*Executes automatically in the background (< 500ms) every time the desktop app starts.*

1. **CAD Detection (Rust):**
   * Queries Windows Registry `HKCR\.dwg\shell\open\command` and `HKCR\.rvt`.
   * Maps the exact local paths for `acad.exe` and `Revit.exe`.
2. **Storage Allocation (Rust):**
   * Evaluates local disk space. Chooses `D:\CADFlow_Cache` if >20GB is free, otherwise `%LOCALAPPDATA%\CADFlow_Cache`.
3. **Drive Mounting (Rust):**
   * Executes `subst X: [Cache_Path]` via Win32 API.
   * Mounts the directory as Virtual Drive `X:\` to ensure Xref paths are globally identical.
4. **State Synchronization (Tauri/React):**
   * Establishes WebSocket connection to Supabase Realtime (`file_locks` channel).
   * Renders the dashboard tree and current Lock Badges.

---

## 3. Flow: File Checkout & Launch (The "Traffic Police" Intercept)
*The critical path preventing binary file corruption and conflicted copies.*

1. **User Action:** User double-clicks `Ground_Floor.dwg` (marked as 🟢 **Available**) in the CADFlow dashboard.
2. **Optimistic UI:** Dashboard badge instantly changes to 🟡 **Pending** (disables double-clicks for other users).
3. **Lock Acquisition (FastAPI -> Graph):**
   * FastAPI inserts `PENDING` row in Supabase `file_locks`.
   * FastAPI calls Microsoft Graph: `POST /drives/{driveId}/items/{itemId}/checkout`.
   * *If Graph Success (200):* FastAPI promotes Supabase row to `ACTIVE`. WebSocket broadcasts 🔴 **Locked by [User]** to all global clients.
   * *If Graph Failure (409 Conflict):* FastAPI deletes `PENDING` row. UI reverts and shows error toast.
4. **Dependency Staging (Rust):**
   * Rust identifies Xrefs via `dependencies.json` (or OLE2 parser for `.rvt`).
   * Rust compares SharePoint `eTag` with local file hashes.
   * Downloads missing/modified Xrefs directly into `X:\Project\`.
5. **Execution (Rust):**
   * Rust executes standard OS shell command: `cmd /C start "" "X:\Project\Ground_Floor.dwg"`.
   * AutoCAD launches. File opens.
6. **Monitoring Starts (Rust):**
   * Rust verifies the creation of `Ground_Floor.dwl2`.
   * Rust begins emitting a 60-second heartbeat to FastAPI.

---

## 4. Flow: Background Sync & Dependency Pre-Hydration
*Secures data against crashes without locking up the user's CAD workflow.*

1. **Atomic Save Trigger:** User presses `Ctrl+S` in AutoCAD.
2. **File System Event (Rust):**
   * The `notify` crate detects AutoCAD writing to `Ground_Floor.tmp` and renaming it to `Ground_Floor.dwg`.
   * Rust verifies the OS exclusive handle is still held by AutoCAD.
3. **Delta Upload (Rust -> Graph):**
   * Rust requests a `createUploadSession` URL from FastAPI.
   * Rust streams the updated binary file from `X:\` to Microsoft Graph in 10 MiB chunks (`327,680 bytes * 32`).
   * *Crucial:* The Graph checkout lock remains active.
4. **WebSocket Alert (Supabase):**
   * Supabase broadcasts a "Checkpoint Synced" event.
   * Coworkers see a toast: *"Kasi just saved an update to Ground_Floor.dwg"* (Badge briefly flashes 🟡 **Syncing**, then back to 🔴 **Locked**).

---

## 5. Flow: Shift Handover & File Check-In
*Releases the lock and formally hands the drawing back to the global team.*

1. **User Action:** Drafter closes the drawing tab or exits AutoCAD.
2. **Watcher Trigger (Rust):**
   * Rust detects the deletion of `Ground_Floor.dwl2`.
   * Rust verifies the Windows OS exclusive write handle has been released.
3. **Handover UI (React):**
   * CADFlow brings itself to the foreground and pops the "Shift Handover" modal.
   * User types a comment: *"Completed MEP routing for Floor 1."* and clicks Submit.
4. **Final Sync & Release (Rust & FastAPI):**
   * Rust computes a final SHA-256 hash. If changed since the last background sync, it performs one final chunked upload.
   * Rust calls FastAPI `/locks/release` with the handover comment.
   * FastAPI calls Graph: `POST /drives/{driveId}/items/{itemId}/checkin`.
   * FastAPI deletes the row from Supabase `file_locks` and logs the event to `checkin_history`.
5. **Global Update:** UI badge returns to 🟢 **Available**. UK Project Manager sees the file is ready for review.

---

## 6. Flow: Zombie Lock Recovery (Exception Handling)
*Handles power outages, blue screens, or disconnected internet.*

1. **Failure Event:** Drafter's laptop battery dies at 3:00 PM while editing `Structure.rvt`. The `.dwl2` file is left stranded on the dead local drive, and the OS handle drops.
2. **Heartbeat Timeout:** The Tauri app stops sending 60-second heartbeats.
3. **Reaper Job (Backend):**
   * A FastAPI background task (running every 5 mins) detects `last_heartbeat_at` is >15 minutes old.
   * Transitions Supabase lock status to 🟣 **STALE**.
4. **Admin Intervention:**
   * A Lead Engineer sees the purple badge and clicks **"Force Unlock"**.
   * FastAPI calls Graph: `POST /drives/{driveId}/items/{itemId}/discardCheckout` (or checks in the last successfully background-synced version).
   * Supabase lock is deleted. File becomes 🟢 **Available** for another drafter to take over.
5. **Local Recovery (Upon Reboot):**
   * When the dead laptop restarts, CADFlow detects the stranded `.dwl2` file but notes the server lock is gone.
   * Rust safely copies the local `Structure.rvt` to `Structure_Recovered_[Timestamp].rvt` inside `X:\`, preventing local data loss without overwriting the server.