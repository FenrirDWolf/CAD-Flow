# End-to-End Implementation Plan: CADFlow
**Version:** 1.0 (Phase 1 MVP)  
**Status:** Approved for Development  
**Timeline:** 6 Weeks from Scaffold to Production Pilot  

This document outlines the chronological execution pipeline for building, testing, and deploying CADFlow. It organizes the stack (Tauri/Rust, FastAPI, Supabase, Microsoft 365) into modular, testable sprints.

---

## Phase 1: Environment & Scaffolding (Week 1)
**Goal:** Establish the monorepo, configure cloud environments, and register the Microsoft Entra ID application.

* **Step 1.1: Microsoft 365 App Registration**
  * Create an App Registration in Microsoft Entra ID.
  * Configure API Permissions (Application & Delegated): `Files.ReadWrite.All`, `Sites.ReadWrite.All`, `User.Read`.
  * Set up the Redirect URI for the FastAPI `/adminconsent` callback.
  * Generate the Client ID and Client Secret.
* **Step 1.2: Supabase Initialization**
  * Create a new Supabase project.
  * Execute the SQL schema from `Backend Schema.md` to create tables, Enums, triggers, and RLS policies.
  * Enable WebSockets for the `file_locks` table in the Supabase Dashboard.
* **Step 1.3: Monorepo Setup**
  * Initialize the frontend/desktop: `npm create tauri-app@latest cadflow-desktop` (Select React, TypeScript, Tailwind).
  * Initialize the backend: `mkdir cadflow-backend && cd cadflow-backend && python -m venv venv`.
  * Scaffold FastAPI with `httpx` (for Graph API), `supabase-py`, and `pydantic`.

---

## Phase 2: Cloud Orchestrator & Graph API (Week 2)
**Goal:** Build the FastAPI endpoints that control the Microsoft Graph API and update Supabase state.

* **Step 2.1: Admin Consent & Provisioning Flow**
  * Build `GET /auth/login` to redirect to Microsoft OAuth.
  * Build `GET /auth/callback` to capture the `tid`, generate the `CADFlow_Projects` SharePoint Document Library, and insert the organization into Supabase.
* **Step 2.2: Atomic Lock Endpoints**
  * Build `POST /locks/acquire`: Insert `PENDING` to Supabase → Call Graph `POST /checkout` → Update to `ACTIVE`.
  * Build `POST /locks/release`: Call Graph `POST /checkin` with comment → Delete from Supabase → Write to `checkin_history`.
* **Step 2.3: Upload Session Proxy**
  * Build `POST /storage/upload` to request a Graph `createUploadSession` URL and return it securely to the Rust client.
* **Step 2.4: Zombie Reaper Task**
  * Implement the APScheduler/Cron background task to flag locks as `STALE` if the heartbeat is older than 15 minutes.

---

## Phase 3: Rust Desktop Core & OS Integration (Week 3)
**Goal:** Build the low-level Windows interactions (virtual drives, file watching, and chunked uploads) bypassing the WebView.

* **Step 3.1: OS Auto-Discovery & Virtual Drive**
  * Write `src-tauri/src/detector.rs` to parse `HKCR\.dwg` and `HKCR\.rvt` via the `winreg` crate.
  * Write the `subst X: [CachePath]` command execution in Rust.
* **Step 3.2: File Monitor & Heartbeat**
  * Implement the `.dwl2` existence checker and OS exclusive-handle probe (`std::fs::OpenOptions`).
  * Hook up the `tokio` 60-second heartbeat loop to ping FastAPI while the file is held open.
* **Step 3.3: Background Chunked Uploader**
  * Implement the `notify` crate to watch for `.tmp` to `.dwg` rename events (`Ctrl+S`).
  * Write the 10 MiB chunked stream uploader using `tokio::fs::File` and `reqwest` to upload to the Graph session URL.
* **Step 3.4: Mock CAD Simulator (Test Harness)**
  * Compile `mock_cad.rs` to simulate file locks and binary diffs locally without installing AutoCAD.

---

## Phase 4: React "Traffic Police" UI (Week 4)
**Goal:** Build the user-facing dashboard, connect WebSockets, and wire up the Tauri IPC (Inter-Process Communication).

* **Step 4.1: UI Framework Setup**
  * Install Shadcn UI components: `data-table`, `badge`, `dialog`, `toast`.
  * Implement the dark-mode (Zinc) theme.
* **Step 4.2: Supabase Realtime Integration**
  * Connect `@supabase/supabase-js`.
  * Subscribe to `file_locks` channel: update the React state instantly when coworkers lock/unlock files.
* **Step 4.3: Tauri IPC Wiring**
  * Map React buttons to Rust commands using `@tauri-apps/api/invoke`.
  * Wire `[ Open ]` -> `acquire_lock_and_launch()`.
* **Step 4.4: Intercept Modals**
  * Build the Read-Only warning modal for 🔴 Locked files.
  * Build the Shift Handover modal triggered when Rust emits the `file_closed` event.

---

## Phase 5: Hardening, Edge Cases & Pre-Flight (Week 5)
**Goal:** Ensure the system survives network drops, API throttling, and unexpected CAD crashes.

* **Step 5.1: Graph API Throttling (429 Handling)**
  * Implement exponential backoff + jitter in the Rust `reqwest` client. Ensure it explicitly respects the `Retry-After` header.
* **Step 5.2: Dependency Extraction Engine**
  * Integrate the `cfb` crate to parse `.rvt` `TransmissionData`.
  * Test Xref pre-hydration (comparing local SHA-256 against Graph `eTag` and downloading deltas).
* **Step 5.3: End-to-End Simulation**
  * Run 5 instances of `mock_cad.exe` simultaneously across 2 different test machines.
  * Force-kill a process to test the 15-minute STALE lock transition and Admin Force-Unlock flow.

---

## Phase 6: Deployment, CI/CD, & Code Signing (Week 6)
**Goal:** Package the application for enterprise Windows distribution and deploy the backend.

* **Step 6.1: Backend Production Deployment**
  * Containerize the FastAPI application using Docker.
  * Deploy to a scalable host (e.g., AWS App Runner, Vercel, or Render).
  * Configure production environment variables (Microsoft Client Secrets, Supabase Service Keys).
* **Step 6.2: Windows EV Code Signing**
  * Procure an EV (Extended Validation) Code Signing Certificate (e.g., via DigiCert or Sectigo). *Critical to prevent Windows SmartScreen from blocking the `.exe`.*
  * Configure `tauri.conf.json` to sign the MSI/NSIS installer during the build step.
* **Step 6.3: CI/CD Pipeline (GitHub Actions)**
  * Create `.github/workflows/release.yml` to trigger `tauri build` on version tags.
  * Configure the Tauri Auto-Updater to point to GitHub Releases or a dedicated S3 bucket, ensuring the 30-person pilot firm always runs the latest patch.
* **Step 6.4: Pilot Launch**
  * Deploy to the 25-India / 5-UK pilot client.
  * Monitor FastAPI logs and Supabase connections for initial week metrics.