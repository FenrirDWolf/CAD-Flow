```markdown # UI/UX Design Specification: CADFlow **Version:** 2.0 (Oct **2026** Production Stack) **Status:** Approved for Implementation **Design System:** Tailwind **CSS** v4 + Shadcn UI (React 19 Server/Client boundaries) **Target Environment:** Desktop (Tauri v2 WebView) — Windows 10/11

---

## 1. Design Principles & Aesthetic

CADFlow is a mission-critical *Traffic Police* application for engineering teams. The UI must be highly legible, information-dense without clutter, and instantly communicate file safety to prevent accidental overwrites.

- **The *Linear / Vercel* Aesthetic:** Clean, high-contrast, minimal borders, utilizing subtle depths and ghost buttons. 
- **Dark Mode Default:** Engineering and **CAD** drafters work in dark environments (AutoCAD/Revit are dark-themed). CADFlow will use a dark-first Slate/Zinc palette to reduce eye strain.
- **Instant State Recognition:** File lock status must be identifiable within **200** milliseconds using distinct color coding and iconography. Utilizing React 19's native `useTransition`, UI status badges update optimistically with zero jank.

### 1.1 Color Palette & Typography

- **Base Theme:** Zinc/Slate (Backgrounds: `#09090b` for app base, `#18181b` for active panels).
- **Typography:** *Geist* or *Inter* for crisp, monolinear legibility of long file paths and UUIDs.
- **Status Colors (Crucial for UX):**
    * 🟢 **Available (Safe):** Emerald (`text-emerald-**400**`, `bg-emerald-**400**/10`)
    * 🔴 **Locked (Danger):** Rose (`text-rose-**500**`, `bg-rose-**500**/10`)
    * 🟡 **Syncing (Warning):** Amber (`text-amber-**400**`, `bg-amber-**400**/10`)
    * 🟣 **Stale/Crashed (Alert):** Purple (`text-purple-**400**`, `bg-purple-**400**/10`)

---

## 2. Component Architecture (React 19 + Shadcn UI)

To ensure enterprise-grade accessibility, keyboard navigation, and a native-desktop feel, CADFlow relies on the following standard components compiled by the React 19 Compiler:

| Component Type | UI Implementation & Behavior |
| :--- | :--- |
| **Data Tables** | `TanStack Table v8`. Sticky headers, sortable columns (Name, Status, Modified), and right-click context menus (`ContextMenu`). |
| **Status Badges** | Shadcn `Badge` with soft backgrounds and pulsing SVG indicators for active network syncs. |
| **Modals / Dialogs** | Shadcn `Dialog` (Radix) with background blur (`backdrop-blur-sm`). Used for Shift Handover and Read-Only warnings. Focus traps natively managed. |
| **Toast Notifications** | `Sonner` API. Renders at bottom-right. Used for passive background alerts (e.g., **Kasi checked in Level1.dwg**). |
| **Context Menus** | Right-clicking a row opens native-feeling menus: *Open, Open Read-Only, Copy Path, View History.* |

---

## 3. Core Screen Layouts & User Journeys

### 3.1 Zero-Touch Authentication (Onboarding)

- **Visual Layout:** A centered, minimalist glass-morphism card on a dark background. 
- **UX Flow:**
    1. A single button: ***Sign in with Microsoft **365***** (using the official Microsoft **SVG** logo).
    2. Upon click, a Tauri window opens the Entra ID OAuth flow.
    3. *Transition:* The card morphs into a loading spinner with text: **Locating AutoCAD & Revit...** → **Mounting X:\ Workspace...** → Drops user into the Dashboard.

### 3.2 The *Traffic Police* Main Dashboard

This is the primary workspace where engineers spend 99% of their time.

**A. Left Sidebar (Navigation & Hierarchy)**
- **Top:** User Profile & Company Tenant Name (e.g., *Twilight Group*).
- **Middle:** Accordion tree of SharePoint Document Libraries and active Project Folders.
- **Bottom:** System Health indicator. A green dot showing: `X:\ Mounted` and `Latency: 45ms`.

**B. Top Action Bar (Contextual)**
- Breadcrumb navigation (`Projects / Tower_A / Arch /`).
- Search bar (Ctrl+K shortcut) for instant fuzzy-finding `.dwg` files across the project.
- *Check for Xref Updates* manual refresh button (though WebSockets handle this automatically).

**C. Center Data Table (The File Roster)** Rows representing **CAD** files. Clicking the row highlights it; double-clicking executes the *Open* action.

| File Name & Icon | Lock Status Badge | Last Modified | Actions (Hover) |
| :--- | :--- | :--- | :--- |
| 📄 `Level_1_Floorplan.dwg` | 🟢 **Available** | Today, 10:42 AM by John | `[ Open ]` |
| 📄 `MEP_HVAC_Master.dwg` | 🔴 **Locked by Kasi (India)** | 14 mins ago | `[ Read-Only ]` |
| 📦 `Structural_Core.rvt` | 🟡 **Syncing Checkpoint...** | Just now | `[ View Log ]` |

### 3.3 Interactive UX Modals

**Modal A: The Read-Only Intercept (Conflict Prevention)**
- **Trigger:** User double-clicks a 🔴 **Locked** file.
- **UI:** A danger-themed dialog box.
- **Copy:** *"Level_1_Floorplan.dwg is currently locked by Kasi (Editing for 45 mins). Opening this file with write access will cause a SharePoint conflict."*
- **Actions:** `[ Cancel ]` (Primary/Ghost), `[ Open as Read-Only ]` (Secondary/Outline).

**Modal B: Shift Handover & Check-In**
- **Trigger:** User closes the AutoCAD/Revit tab, releasing the OS handle. Tauri pops this modal to the foreground.
- **UI:** A success-themed dialog box leveraging React 19 `useActionState` for seamless form submission.
- **Copy:** **You are checking in Level_1_Floorplan.dwg.**
- **Inputs:** A text area for the commit message. Placeholder: *"e.g., Updated stair core dimensions for London review."*
- **Actions:** `[ Submit & Unlock ]` (Primary), `[ Auto-Fill *Saved* ]` (Secondary).

**Modal C: Admin Force Unlock (Zombie Recovery)**
- **Trigger:** Admin right-clicks a 🟣 **Stale** file.
- **UI:** Destructive dialog box.
- **Copy:** *"This lock hasn't emitted a heartbeat in 15+ minutes. Force unlocking will discard the checkout on SharePoint. Only do this if the drafter's PC crashed."*
- **Actions:** `[ Force Unlock ]` (Destructive Red), `[ Cancel ]` (Default).

---

## 4. Micro-Interactions & Desktop Integrations

To ensure CADFlow feels like a native enterprise C++ app rather than a web wrapper:

1. **System Tray Integration:** When minimized, CADFlow lives in the Windows System Tray. Right-clicking the tray icon shows recent projects and a *Sync Status* quick view.
2. **Toast Notifications (Cross-Border Awareness):** 
   * When Kasi in India checks in `Level_1.dwg`, a native Windows toast slides in for the UK team: *"🟢 Level_1.dwg is now available. (Note: Stair core updated)."*
3. **Optimistic UI Updates (React 19 Native):** When a user clicks *Open,* the UI badge instantly turns 🟡 *Pending* via `useOptimistic` before the Graph **API** responds, preventing a double-click race condition. If Graph fails (**409**), the UI snaps back to 🔴 *Locked* without jarring layout shifts.
4. **Keyboard Shortcuts:**
    * `Ctrl + K`: Global search.
    * `Ctrl + R`: Force dependency re-check.
    * `Enter`: Open selected file.
    * `Esc`: Close modals / Clear selection.