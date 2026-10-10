# Backend Schema & Database Architecture: CADFlow

**Version:** 1.0 (Phase 1 **MVP**) **Status:** Approved for Implementation **Database:** PostgreSQL (Supabase) ****ORM** / Validation:** Pydantic (FastAPI)

---

## 1. Overview & Architecture Principles

The CADFlow backend relies on **Supabase (PostgreSQL)** for state persistence and real-time WebSockets, while **FastAPI** acts as the transaction coordinator.

- **Multi-Tenancy:** Data is strictly isolated using PostgreSQL Row Level Security (**RLS**). The Microsoft Entra ID **JWT** claim `tid` (Tenant ID) determines which organization's data a user can read or modify.
- **Ephemeral Real-Time State:** The `file_locks` table is highly mutable and powers the WebSocket badges. It is designed for heavy `**UPDATE**` traffic (60-second heartbeats).
- **Append-Only Audit Log:** The `checkin_history` table is append-only, providing a permanent ledger of who edited what and their shift handover notes.

---

## 2. PostgreSQL Schema (Supabase)

Execute the following **SQL** in your Supabase **SQL** Editor to provision the database.

### 2.1 Enums & Triggers

```sql -- Enums for Lock States **CREATE** **TYPE** lock_status AS **ENUM** ('**PENDING**', '**ACTIVE**', '**SYNCING**', '**STALE**');

-- Enum for common outsourced office locations (optional metadata for UI) **CREATE** **TYPE** office_region AS **ENUM** ('IN', 'UK', 'US', 'AE', 'AU', '**OTHER**');

-- Auto-update timestamp function
**CREATE** OR **REPLACE** **FUNCTION** update_modified_column() 
**RETURNS** **TRIGGER** AS $$
**BEGIN**
    **NEW**.updated_at = now();
    **RETURN** **NEW**;
**END**;
$$ language 'plpgsql';
2.2 Core Tables
**SQL**
-- 1. Organizations (The Multi-Tenant Microsoft **365** Mapping)
**CREATE** **TABLE** organizations (
    id **UUID** **PRIMARY** **KEY** **DEFAULT** gen_random_uuid(),
    microsoft_tenant_id **TEXT** **UNIQUE** **NOT** **NULL**, -- The 'tid' from Entra ID
    company_name **TEXT** **NOT** **NULL**,
    sharepoint_site_id **TEXT** **NOT** **NULL**,
    sharepoint_drive_id **TEXT** **NOT** **NULL**,
    version_limit **INT** **DEFAULT** 25,
    created_at **TIMESTAMPTZ** **DEFAULT** now(),
    updated_at **TIMESTAMPTZ** **DEFAULT** now()
);

**CREATE** **TRIGGER** update_org_modtime **BEFORE** **UPDATE** ON organizations **FOR** **EACH** **ROW** **EXECUTE** **PROCEDURE** update_modified_column();

-- 2. File Locks (The Real-Time *Traffic Police* Registry)
**CREATE** **TABLE** file_locks (
    id **UUID** **PRIMARY** **KEY** **DEFAULT** gen_random_uuid(),
    org_id **UUID** **NOT** **NULL** **REFERENCES** organizations(id) ON **DELETE** **CASCADE**,
    sharepoint_item_id **TEXT** **NOT** **NULL**,
    file_path **TEXT** **NOT** **NULL**,             -- e.g., */Project_A/Arch/Ground_Floor.dwg*
    file_type **TEXT** **NOT** **NULL**,             -- *dwg* or *rvt*
    locked_by_email **TEXT** **NOT** **NULL**,
    locked_by_name **TEXT** **NOT** **NULL**,
    office_location office_region **DEFAULT** 'IN',
    machine_hostname **TEXT** **NOT** **NULL**,      -- Crucial for zombie lock recovery mapping
    status lock_status **NOT** **NULL** **DEFAULT** '**PENDING**',
    last_sha256 **TEXT**,
    locked_at **TIMESTAMPTZ** **DEFAULT** now(),
    last_heartbeat_at **TIMESTAMPTZ** **DEFAULT** now(),
    
    -- Ensure only one active lock exists per file per organization
    **UNIQUE**(org_id, sharepoint_item_id)
);

-- 3. Dependency Graph (Xrefs & Revit Linked Models)
**CREATE** **TABLE** file_dependencies (
    id **UUID** **PRIMARY** **KEY** **DEFAULT** gen_random_uuid(),
    org_id **UUID** **NOT** **NULL** **REFERENCES** organizations(id) ON **DELETE** **CASCADE**,
    parent_item_id **TEXT** **NOT** **NULL**,
    child_relative_path **TEXT** **NOT** **NULL**,   -- e.g., *./Xrefs/Structural_Grid.dwg*
    child_item_id **TEXT** **NOT** **NULL**,
    updated_at **TIMESTAMPTZ** **DEFAULT** now(),
    
    **UNIQUE**(org_id, parent_item_id, child_item_id)
);

**CREATE** **TRIGGER** update_dep_modtime **BEFORE** **UPDATE** ON file_dependencies **FOR** **EACH** **ROW** **EXECUTE** **PROCEDURE** update_modified_column();

-- 4. Shift Handover & Audit Log (Append-Only Ledger)
**CREATE** **TABLE** checkin_history (
    id **UUID** **PRIMARY** **KEY** **DEFAULT** gen_random_uuid(),
    org_id **UUID** **NOT** **NULL** **REFERENCES** organizations(id) ON **DELETE** **CASCADE**,
    sharepoint_item_id **TEXT** **NOT** **NULL**,
    file_path **TEXT** **NOT** **NULL**,
    user_name **TEXT** **NOT** **NULL**,
    user_email **TEXT** **NOT** **NULL**,
    office_location office_region,
    checkin_comment **TEXT** **NOT** **NULL**,
    sha256_hash **TEXT** **NOT** **NULL**,
    created_at **TIMESTAMPTZ** **DEFAULT** now()
);
2.3 Row Level Security (**RLS**) Policies
To ensure the 25 drafters in India only see their firm's locks and never another tenant's files, apply these **RLS** policies. They leverage the tid claim injected into the **JWT** by Microsoft OAuth.

**SQL** -- Enable **RLS** on all tables **ALTER** **TABLE** organizations **ENABLE** **ROW** **LEVEL** **SECURITY**; **ALTER** **TABLE** file_locks **ENABLE** **ROW** **LEVEL** **SECURITY**; **ALTER** **TABLE** file_dependencies **ENABLE** **ROW** **LEVEL** **SECURITY**; **ALTER** **TABLE** checkin_history **ENABLE** **ROW** **LEVEL** **SECURITY**;

-- Organizations Policy: Users can only view their own organization
**CREATE** **POLICY** *Users view own org* ON organizations 
**FOR** **SELECT** **USING** (
    microsoft_tenant_id = auth.jwt()->>'tid'
);

-- File Locks Policy: Users can read/write locks linked to their tenant ID
**CREATE** **POLICY** *Users access own org locks* ON file_locks 
**FOR** **ALL** **USING** (
    org_id IN (
    **SELECT** id **FROM** organizations 
    **WHERE** microsoft_tenant_id = auth.jwt()->>'tid'
    )
);

-- Checkin History Policy: Append/Read only for own org
**CREATE** **POLICY** *Users access own org history* ON checkin_history 
**FOR** **ALL** **USING** (
    org_id IN (
    **SELECT** id **FROM** organizations 
    **WHERE** microsoft_tenant_id = auth.jwt()->>'tid'
    )
);
2.4 Enable Real-Time (Supabase WebSockets)
**SQL**
-- Broadcast **INSERT**, **UPDATE**, and **DELETE** events to the React frontend
**ALTER** **PUBLICATION** supabase_realtime **ADD** **TABLE** file_locks;
## FastAPI Pydantic Models (Schemas)
These Python schemas define the exact request/response bodies used between the Tauri Rust client and the FastAPI backend.

Python from pydantic import BaseModel, Field from typing import Optional from datetime import datetime from enum import Enum

class LockStatus(str, Enum):
    **PENDING** = *PENDING*
    **ACTIVE** = *ACTIVE*
    **SYNCING** = *SYNCING*
    **STALE** = *STALE*

# ----------------------------------------

# 1. Tenant Provisioning
# ----------------------------------------
class ProvisionTenantRequest(BaseModel):
    microsoft_tenant_id: str
    company_name: str
    admin_access_token: str  # Short-lived token from Entra ID /adminconsent

# ----------------------------------------

# 2. Lock Acquisition
# ----------------------------------------
class LockAcquireRequest(BaseModel):
    sharepoint_item_id: str
    file_path: str = Field(..., example=*/Project_1/Arch/Ground_Floor.dwg*)
    file_type: str = Field(..., example=*dwg*)
    machine_hostname: str
    last_sha256: Optional[str] = None

class LockAcquireResponse(BaseModel):
    success: bool
    lock_id: Optional[str] = None
    status: LockStatus
    message: str
    # If 409 Conflict, returns the current owner
    locked_by_name: Optional[str] = None 
    locked_by_email: Optional[str] = None

# ----------------------------------------

# 3. Background Sync & Heartbeat
# ----------------------------------------
class LockHeartbeatRequest(BaseModel):
    lock_id: str

class UploadSessionRequest(BaseModel):
    lock_id: str
    sharepoint_item_id: str

class UploadSessionResponse(BaseModel):
    upload_url: str  # Graph **API** resumable upload **URL**
    expiration_datetime: datetime

# ----------------------------------------

# 4. Check-In / Handover
# ----------------------------------------
class LockReleaseRequest(BaseModel):
    lock_id: str
    sharepoint_item_id: str
    checkin_comment: str = Field(..., example=*Updated stair core per UK review.*)
    final_sha256: str
## Key Background Jobs (Cron)
4.1 Zombie Lock Reaper
Defined in FastAPI using APScheduler or a background worker (e.g., Celery/Redis).

Python
# Runs every 5 minutes
async def reap_stale_locks(db: Session):
    """
    Finds locks that haven't emitted a heartbeat in 15 minutes
    and marks them **STALE** so Admins can Force-Unlock them.
    """
    threshold = datetime.utcnow() - timedelta(minutes=15)
    
    db.query(FileLock).filter(
    FileLock.status == LockStatus.**ACTIVE**,
    FileLock.last_heartbeat_at < threshold
    ).update({*status*: LockStatus.**STALE**})
    
    db.commit()