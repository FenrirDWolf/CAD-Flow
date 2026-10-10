# Product Requirements Document (PRD): CADFlow
**Version:** 1.0 (Phase 1 MVP)  
**Status:** Approved for Technical Design  
**Target Market:** Small-to-Midsize AEC Firms (10–100 seats) operating cross-border distributed teams (e.g., Hyderabad drafting hubs & UK/US front offices)  
**Primary Tech Stack:** Tauri v2 (Rust/React), FastAPI, Supabase, Microsoft Graph API  

---

## 1. Executive Summary & Product Vision
CADFlow is a lightweight, zero-configuration desktop cloud orchestrator that transforms a firm’s existing Microsoft 365 SharePoint tenant into a high-performance Common Data Environment (CDE) for AutoCAD (`.dwg`) and Revit (`.rvt`). 

Mid-sized AEC outsourcing firms face a structural margin problem: enterprise CAD clouds (Autodesk, LucidLink) cost between $10,800 and $28,500+ annually for a 30-person team, eroding the financial advantage of distributed engineering. Conversely, relying on standard OneDrive sync causes binary file corruption, broken Xref paths, and severe version bloat. 

CADFlow acts as a strict "Traffic Police" launcher. It intercepts CAD file access, enforces atomic Microsoft Graph lock checkouts, normalizes local drive paths, and streams background delta updates—delivering enterprise-grade CAD collaboration with zero proprietary cloud storage fees.

---

## 2. Target Personas & Use Cases

| Persona | Role & Location | Core Pain Point | How CADFlow Solves It |
| :--- | :--- | :--- | :--- |
| **The Production Drafter** | 25-Seat Hub (e.g., Hyderabad, India) | Waiting 45 seconds for OneDrive locks; opening drawings to find broken Xrefs because a coworker's local `C:\Users\Name\` path is hardcoded. | Provides a 1-click dashboard. Mounts a universal `X:\` virtual drive automatically so Xrefs never break. Pre-downloads linked files. |
| **The Project Director** | 5-Seat Front Office (e.g., London, UK) | Blind spots in production progress; receiving conflicting `Drawing-Copy(1).dwg` files; waiting for evening zip-file handovers. | Views a real-time dashboard showing exactly who is editing what. Sees published updates instantly in SharePoint. |
| **The IT Administrator** | Internal / Managed Service Provider | Setting up VPNs, managing cloud storage quota overages, recovering files when a drafter's laptop crashes mid-save. | 1-click Entra ID setup. Auto-caps SharePoint versions to prevent storage bloat. 1-click "Force Unlock" for crashed sessions. |

---

## 3. Core Business Problems Addressed

1. **The "Conflicted Copy" Paradigm:** Simultaneous access to binary CAD databases over asynchronous sync engines corrupts data. 
2. **Xref & Linked Model Pathing:** Autodesk products rely on absolute or relative local file paths. Syncing to `C:\Users\JohnDoe\OneDrive` breaks these links on `C:\Users\JaneSmith\OneDrive`.
3. **Data Loss Between Saves:** Relying on end-of-day file uploads risks hours of lost work if a workstation loses power.
4. **SharePoint Quota Exhaustion:** Saving a 500 MB `.rvt` file 20 times a day generates 10 GB of version history daily, rapidly breaching the 1TB base Microsoft 365 quota and triggering expensive overages.

---

## 4. Functional Requirements (FR)

### FR-1: Zero-Touch Onboarding & Organization Provisioning
* **FR-1.1 (Admin Consent):** The platform must support Microsoft Entra ID Tenant-Wide Admin Consent (`/adminconsent`), requesting `Files.ReadWrite.All` and `Sites.ReadWrite.All`.
* **FR-1.2 (SharePoint Initialization):** Upon consent, the backend must automatically provision a dedicated `CADFlow_Projects` Document Library in the client's SharePoint tenant.
* **FR-1.3 (Version Control Policy):** The backend must automatically configure the `CADFlow_Projects` library to a `MajorVersionLimit` of 25 (or activate Auto-Trimming) to prevent storage bloat.
* **FR-1.4 (User Auto-Routing):** Users authenticating via OAuth must be automatically routed to their company's workspace using the `tid` (Tenant ID) JWT claim. No manual URLs or invite codes permitted.

### FR-2: Local Workstation Auto-Discovery & Virtual Staging (Rust Client)
* **FR-2.1 (CAD Binary Detection):** On startup, the desktop client must query the Windows Registry (`HKCR\.dwg`, `HKCR\.rvt`, `HKLM\SOFTWARE\Autodesk`) to locate executable paths, adapting seamlessly to custom `D:\` or `E:\` installations.
* **FR-2.2 (Dynamic Cache Allocation):** The client must evaluate disk space, defaulting the file cache to `D:\CADFlow_Cache` if >20GB is free, otherwise falling back to `%LOCALAPPDATA%\CADFlow_Cache`.
* **FR-2.3 (Universal Drive Mount):** The client must execute user-space commands (`subst X:` or `DefineDosDeviceW`) to mount the cache as Virtual Drive `X:\`, normalizing all absolute file paths across the organization.

### FR-3: The "Traffic Police" Dashboard & Lock Orchestration
* **FR-3.1 (Live State Badges):** The dashboard must display real-time file statuses via WebSockets (<150ms latency). States include: `AVAILABLE` (Green), `LOCKED` (Red, with user info), and `SYNCING` (Yellow).
* **FR-3.2 (Atomic Graph Checkout):** Initiating an "Open" action must trigger a single request that creates a `PENDING` state, executes Microsoft Graph `POST /checkout`, and transitions to `ACTIVE`. Failures (409 Conflict) must rollback instantly.
* **FR-3.3 (Read-Only Interception):** Clicking a locked file must prompt a modal offering a "Read-Only" mode. If accepted, the client must apply the `FILE_ATTRIBUTE_READONLY` OS flag to the local staged file before launching the CAD application.

### FR-4: Dependency Parsing & Pre-Hydration
* **FR-4.1 (OLE2 Revit Parsing):** The Rust backend must parse the `TransmissionData` XML stream inside `.rvt` containers using the `cfb` crate to map linked models without invoking heavy Revit APIs.
* **FR-4.2 (AutoCAD Manifests):** The system must generate and maintain a `dependencies.json` manifest mapping parent `.dwg` files to their child Xrefs.
* **FR-4.3 (Smart Delta Staging):** The client must compare local SHA-256 hashes against SharePoint `eTag` values, downloading only modified dependencies prior to launching the host file.

### FR-5: Background Sync & Atomic Check-In
* **FR-5.1 (Handle & `.dwl2` Monitoring):** The client must monitor companion `.dwl`/`.dwl2` lock files and probe OS-level exclusive write handles to determine if a file is actively being edited, bypassing brittle PID tracking.
* **FR-5.2 (Background Checkpoint Streaming):** The client must detect atomic saves (`Ctrl+S` temp-file renaming) and stream 10 MiB chunks to SharePoint via `createUploadSession` without releasing the checkout lock.
* **FR-5.3 (Shift Handover Modal):** Upon handle release (tab close), the client must trigger a modal for an optional check-in comment, upload the final byte diff, and execute Graph `POST /checkin`.

### FR-6: Disaster Recovery & Simulator Harness
* **FR-6.1 (Heartbeat & TTL):** Active clients must emit a 60-second heartbeat. The backend must transition locks to `STALE` if the heartbeat is lost for >15 minutes.
* **FR-6.2 (Admin Force-Release):** Workspace admins must have a 1-click action to execute Graph `POST /discardCheckout` on `STALE` locks.
* **FR-6.3 (Internal Mock Simulator):** The desktop app must include a `mock_cad.exe` dev mode to simulate OS-level file locking, `.dwl2` generation, and `Ctrl+S` binary mutations for rapid internal testing without full CAD licenses.

---

## 5. Non-Functional Requirements (NFR)

1. **Performance (WebView RAM):** The Tauri desktop client must consume < 60 MB of RAM while idle. Large file streaming (e.g., 1GB Revit models) must be handled entirely in the Rust core, passing only progress events to the React UI to prevent Chromium Out-Of-Memory (OOM) crashes.
2. **Resilience (API Throttling):** The backend and client network layers must implement exponential backoff with jitter and strictly parse Microsoft Graph `429 Retry-After` headers during shift-change traffic spikes.
3. **Security (Zero-Knowledge):** No binary CAD data may be routed through or stored on CADFlow's proprietary servers. All file transit must occur directly between the client's local machine and their Microsoft 365 tenant.
4. **Legal Compliance (Process Agnosticism):** The application must never interfere with, spoof, or modify third-party licensing services (e.g., Autodesk FlexNet). Files must be launched via standard OS shell file associations.

---

## 6. Success Metrics & Phase 1 Launch Criteria

* **Lock Latency:** User B's UI updates to `LOCKED` in < 250ms after User A successfully acquires the lock.
* **File Launch Time:** Cached `.dwg` files launch in < 3 seconds; modified files hydrate Xrefs at maximum available local network bandwidth before launching.
* **Zero Corruption Rate:** 0 instances of SharePoint conflict files (`Filename-PC-Name.dwg`) generated during a 20-user simultaneous load test.
* **Onboarding Velocity:** A completely new tenant can be provisioned and have the first file staged in < 3 minutes.