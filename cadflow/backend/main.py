from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from datetime import datetime
from models import AsyncSessionLocal, User, FolderAccess, FileLock
from schemas import LockAcquireRequest, LockReleaseRequest, LockStatusResponse

# Dependency to get DB session
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
import os
from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import APIKeyHeader
from auth import verify_api_key

from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
from msal_service import get_master_graph_token
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="CADFlow Backend")

# Allow the Tauri desktop app (usually running on localhost:1420 during dev)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "CADFlow Backend is running."}

@app.get("/api/v1/sharepoint/drives")
async def get_sharepoint_drives():
    """
    Test endpoint: Uses our Master Application Permission Token
    to fetch all SharePoint Drives (the 4TB dummy accounts) visible to the App.
    """
    try:
        # 1. Get the Master Token silently
        master_token = get_master_graph_token()
        
        # 2. Query Microsoft Graph for all drives in the tenant
        # Since we have Sites.ReadWrite.All, we can search for drives.
        # Note: A real app might need the specific Site ID to filter.
        headers = {
            "Authorization": f"Bearer {master_token}",
            "Accept": "application/json"
        }
        
        # Fetching root site drives as a test
        async with httpx.AsyncClient() as client:
            # Let's search for the default site's drives first
            response = await client.get(
                "https://graph.microsoft.com/v1.0/sites/root/drives",
                headers=headers
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail=response.text)
                
            data = response.json()
            return {"drives": data.get("value", [])}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

import base64

def encode_sharing_url(url: str) -> str:
    base64_value = base64.b64encode(url.encode('utf-8')).decode('utf-8')
    encoded_url = "u!" + base64_value.rstrip('=').replace('/', '_').replace('+', '-')
    return encoded_url


import asyncio
import time

# Global cache for tree
_tree_cache = {"data": None, "timestamp": 0}
CACHE_TTL = 300  # 5 minutes


async def _fetch_raw_tree():
    global _tree_cache
    if _tree_cache["data"] and time.time() - _tree_cache["timestamp"] < CACHE_TTL:
        return _tree_cache["data"]
        
    master_token = get_master_graph_token()
    headers = {
        "Authorization": f"Bearer {master_token}",
        "Accept": "application/json"
    }
    
    transport = httpx.AsyncHTTPTransport(retries=3)
    async with httpx.AsyncClient(transport=transport, follow_redirects=True, limits=httpx.Limits(max_connections=5, max_keepalive_connections=5)) as client:
        drives_resp = await client.get(
            "https://graph.microsoft.com/v1.0/sites/root/drives",
            headers=headers
        )
        if drives_resp.status_code != 200:
            raise HTTPException(status_code=drives_resp.status_code, detail=drives_resp.text)
            
        drives = drives_resp.json().get("value", [])
        
        async def fetch_children(drive_id):
            resp = await client.get(
                f"https://graph.microsoft.com/v1.0/drives/{drive_id}/root/children",
                headers=headers
            )
            if resp.status_code == 200:
                return drive_id, resp.json().get("value", [])
            return drive_id, []

        children_results = await asyncio.gather(*(fetch_children(d["id"]) for d in drives))
        
        async def resolve_url(drive_id, item):
            resp = await client.get(
                f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item['id']}/content",
                headers=headers
            )
            if resp.status_code == 200:
                content_text = resp.text
                for line in content_text.splitlines():
                    if line.startswith("URL="):
                        shared_url = line[4:].strip()
                        encoded = encode_sharing_url(shared_url)
                        shared_resp = await client.get(
                            f"https://graph.microsoft.com/v1.0/shares/{encoded}/driveItem",
                            headers=headers
                        )
                        if shared_resp.status_code == 200:
                            shared_item = shared_resp.json()
                            return {
                                "drive_id": shared_item["parentReference"]["driveId"],
                                "drive_name": item["name"].replace(".url", ""),
                                "type": "drive",
                                "root_item_id": shared_item["id"]
                            }
            return None

        tasks = []
        for drive_id, children in children_results:
            for item in children:
                if item.get("name", "").endswith(".url"):
                    tasks.append(resolve_url(drive_id, item))
        
        resolved = await asyncio.gather(*tasks)
        tree = [r for r in resolved if r]
        
        # Add the native standard drives too
        for d in drives:
            tree.append({
                "drive_id": d["id"],
                "drive_name": d["name"],
                "type": "drive",
                "root_item_id": "root"
            })
            
        _tree_cache["data"] = {"tree": tree}
        _tree_cache["timestamp"] = time.time()
        
        return {"tree": tree}

@app.get("/api/v1/sharepoint/tree")
async def get_sharepoint_tree(user_id: str = None, db: AsyncSession = Depends(get_db)):
    try:
        raw_data = await _fetch_raw_tree()
        tree = raw_data["tree"]
        final_tree = tree
        
        if user_id:
            access_result = await db.execute(select(FolderAccess).where(FolderAccess.clerk_id == user_id))
            access_rows = access_result.scalars().all()
            
            user_result = await db.execute(select(User).where(User.clerk_id == user_id))
            user = user_result.scalar_one_or_none()
            is_admin = user and user.role.value == "ADMIN"
            
            if not is_admin:
                user_tree = []
                for row in access_rows:
                    if row.folder_id:
                        base_drive = next((t for t in tree if t["drive_id"] == row.drive_id), None)
                        if base_drive:
                            user_tree.append({
                                "drive_id": row.drive_id,
                                "drive_name": row.folder_name or f"{base_drive['drive_name']} (Subfolder)",
                                "type": "drive",
                                "root_item_id": row.folder_id
                            })
                    else:
                        base_drive = next((t for t in tree if t["drive_id"] == row.drive_id), None)
                        if base_drive:
                            user_tree.append(base_drive)
                final_tree = user_tree
                
        return {"tree": final_tree}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


import asyncio
import time

# Global cache for tree
_tree_cache = {"data": None, "timestamp": 0}
CACHE_TTL = 300  # 5 minutes

@app.get("/api/v1/sharepoint/tree")
async def get_sharepoint_tree():
    """
    Crawls the available drives and resolves .url shortcuts to their shared target folders,
    returning them as independent Workspaces/Drives. Cached for 5 minutes.
    """
    global _tree_cache
    if _tree_cache["data"] and time.time() - _tree_cache["timestamp"] < CACHE_TTL:
        return _tree_cache["data"]

    try:
        master_token = get_master_graph_token()
        headers = {
            "Authorization": f"Bearer {master_token}",
            "Accept": "application/json"
        }
        
        transport = httpx.AsyncHTTPTransport(retries=3)
        async with httpx.AsyncClient(transport=transport, follow_redirects=True, limits=httpx.Limits(max_connections=5, max_keepalive_connections=5)) as client:
            drives_resp = await client.get(
                "https://graph.microsoft.com/v1.0/sites/root/drives",
                headers=headers
            )
            
            if drives_resp.status_code != 200:
                raise HTTPException(status_code=drives_resp.status_code, detail=drives_resp.text)
                
            drives = drives_resp.json().get("value", [])
            
            # Fetch children for all drives concurrently
            async def fetch_children(drive_id):
                resp = await client.get(
                    f"https://graph.microsoft.com/v1.0/drives/{drive_id}/root/children",
                    headers=headers
                )
                if resp.status_code == 200:
                    return drive_id, resp.json().get("value", [])
                return drive_id, []

            children_results = await asyncio.gather(*(fetch_children(d["id"]) for d in drives))
            
            tree = []
            
            async def resolve_url(drive_id, item):
                resp = await client.get(
                    f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item['id']}/content",
                    headers=headers
                )
                if resp.status_code == 200:
                    content_text = resp.text
                    for line in content_text.splitlines():
                        if line.startswith("URL="):
                            shared_url = line[4:].strip()
                            encoded = encode_sharing_url(shared_url)
                            shared_resp = await client.get(
                                f"https://graph.microsoft.com/v1.0/shares/{encoded}/driveItem",
                                headers=headers
                            )
                            if shared_resp.status_code == 200:
                                shared_item = shared_resp.json()
                                return {
                                    "drive_id": shared_item["parentReference"]["driveId"],
                                    "drive_name": shared_item["name"],
                                    "type": "drive",
                                    "root_item_id": shared_item["id"]
                                }
                return None

            tasks = []
            for drive_id, children in children_results:
                for item in children:
                    if item["name"].endswith(".url"):
                        tasks.append(resolve_url(drive_id, item))
            
            resolved = await asyncio.gather(*tasks)
            tree = [r for r in resolved if r]
                
            result = {"tree": tree}
            _tree_cache["data"] = result
            _tree_cache["timestamp"] = time.time()
            return result
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/sharepoint/storage")
async def get_storage_quota():
    try:
        tree_data = await get_sharepoint_tree()
        vaults = tree_data.get("tree", [])
        
        token = get_master_graph_token()
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
        
        dummy_vault_stats = []
        
        async with httpx.AsyncClient() as client:
            # Main SharePoint site drive
            r = await client.get("https://graph.microsoft.com/v1.0/sites/root/drive", headers=headers)
            main_drive = r.json()
            main_quota = main_drive.get("quota", {})
            
            # Fetch for each dummy vault concurrently
            async def fetch_quota(v):
                dr = await client.get(f"https://graph.microsoft.com/v1.0/drives/{v['drive_id']}", headers=headers)
                if dr.status_code == 200:
                    q = dr.json().get("quota", {})
                    return {
                        "name": v["drive_name"],
                        "used": q.get("used", 0),
                        "total": q.get("total", 0)
                    }
                return None

            results = await asyncio.gather(*(fetch_quota(v) for v in vaults))
            dummy_vault_stats = [r for r in results if r]
            
            return {
                "main_sharepoint": {
                    "used": main_quota.get("used", 0),
                    "total": main_quota.get("total", 0),
                    "remaining": main_quota.get("remaining", 0)
                },
                "dummy_vaults": dummy_vault_stats
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/sharepoint/folder/{drive_id}/{item_id}")
async def get_sharepoint_folder(drive_id: str, item_id: str, db: AsyncSession = Depends(get_db)):
    """
    Fetches the children of a specific folder inside a specific drive.
    """
    try:
        master_token = get_master_graph_token()
        headers = {
            "Authorization": f"Bearer {master_token}",
            "Accept": "application/json"
        }
        
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}/children",
                headers=headers
            )
            
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
                
            children_data = resp.json().get("value", [])
            
            # Fetch all active locks from DB
            result = await db.execute(select(FileLock))
            active_locks = {lock.sharepoint_item_id: lock for lock in result.scalars().all()}
            
            formatted_children = []
            for item in children_data:
                child_item_id = item["id"]
                lock_status = "AVAILABLE"
                locked_by = None
                
                if child_item_id in active_locks:
                    lock_status = "LOCKED"
                    locked_by = active_locks[child_item_id].locked_by_user or active_locks[child_item_id].locked_by
                    
                formatted_children.append({
                    "id": child_item_id,
                    "name": item["name"],
                    "is_folder": "folder" in item,
                    "size": item.get("size", 0),
                    "webUrl": item.get("webUrl", ""),
                    "downloadUrl": item.get("@microsoft.graph.downloadUrl", ""),
                    "lastModifiedDateTime": item.get("lastModifiedDateTime", ""),
                    "lock_status": lock_status,
                    "locked_by": locked_by
                })
                
            return {"children": formatted_children}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from datetime import datetime
from models import AsyncSessionLocal, User, FolderAccess, FileLock
from schemas import LockAcquireRequest, LockReleaseRequest, LockStatusResponse

# Dependency to get DB session
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

@app.post("/api/v1/locks/acquire")
async def acquire_lock(request: LockAcquireRequest, db: AsyncSession = Depends(get_db), api_key: str = Depends(verify_api_key)):
    result = await db.execute(select(FileLock).where(FileLock.sharepoint_item_id == request.sharepoint_item_id))
    existing_lock = result.scalar_one_or_none()
    
    if existing_lock:
        if existing_lock.machine_hostname != request.machine_hostname:
            raise HTTPException(status_code=409, detail="File is currently locked by another user.")
        return {"status": "ok", "message": "Lock already held by you."}
        
    new_lock = FileLock(
        sharepoint_item_id=request.sharepoint_item_id,
        file_name=request.file_path,
        locked_by=None,
        locked_by_user=request.windows_username or "SYSTEM",
        locked_at=datetime.utcnow(),
        machine_hostname=request.machine_hostname
    )
    db.add(new_lock)
    await db.commit()
    return {"status": "ok", "message": "Lock acquired."}

@app.post("/api/v1/locks/release")
async def release_lock(request: LockReleaseRequest, db: AsyncSession = Depends(get_db), api_key: str = Depends(verify_api_key)):
    result = await db.execute(select(FileLock).where(FileLock.sharepoint_item_id == request.sharepoint_item_id))
    existing_lock = result.scalar_one_or_none()
    
    if existing_lock:
        await db.delete(existing_lock)
        await db.commit()
        
    return {"status": "ok", "message": "Lock released."}

@app.get("/api/v1/locks/status/{item_id}", response_model=LockStatusResponse)
async def get_lock_status(item_id: str, db: AsyncSession = Depends(get_db), api_key: str = Depends(verify_api_key)):
    result = await db.execute(select(FileLock).where(FileLock.sharepoint_item_id == item_id))
    existing_lock = result.scalar_one_or_none()
    
    if existing_lock:
        return {
            "sharepoint_item_id": item_id,
            "locked_by": existing_lock.locked_by_user or existing_lock.locked_by,
            "locked_at": existing_lock.locked_at,
            "machine_hostname": existing_lock.machine_hostname
        }
    return {
        "sharepoint_item_id": item_id,
        "locked_by": None,
        "locked_at": None,
        "machine_hostname": None
    }

from pydantic import BaseModel

class AuditLogRequest(BaseModel):
    sharepoint_item_id: str
    file_name: str
    clerk_id: str
    action: str
    details: str = None

@app.post("/api/v1/audit/log")
async def log_audit_action(request: AuditLogRequest, db: AsyncSession = Depends(get_db), api_key: str = Depends(verify_api_key)):
    from models import FileAuditLog, AuditAction
    try:
        action_enum = AuditAction(request.action.lower())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid action type")
        
    new_log = FileAuditLog(
        sharepoint_item_id=request.sharepoint_item_id,
        file_name=request.file_name,
        clerk_id=request.clerk_id,
        action=action_enum,
        details=request.details
    )
    db.add(new_log)
    await db.commit()
    return {"status": "ok"}

@app.get("/api/v1/files/{item_id}/versions")
async def get_file_versions(item_id: str):
    return {
        "versions": [
            {"id": "v3", "timestamp": "2026-10-06T10:00:00Z", "author": "Alice", "comment": "Latest changes"},
            {"id": "v2", "timestamp": "2026-10-05T14:30:00Z", "author": "Bob", "comment": "Fixed piping issue"},
            {"id": "v1", "timestamp": "2026-10-04T09:15:00Z", "author": "Alice", "comment": "Initial upload"}
        ]
    }

@app.post("/api/v1/files/{item_id}/restore/{version_id}")
async def restore_file_version(item_id: str, version_id: str):
    return {"status": "success", "message": f"Restored item {item_id} to version {version_id}"}

@app.post("/api/v1/files/{item_id}/approve")
async def approve_file(item_id: str, user_id: str = None, db: AsyncSession = Depends(get_db)):
    if user_id:
        user_result = await db.execute(select(User).where(User.clerk_id == user_id))
        user = user_result.scalar_one_or_none()
        if not user or user.role.value != "BIM_MANAGER":
            raise HTTPException(status_code=403, detail="Only BIM_MANAGER can approve files")
    return {"status": "success", "message": f"File {item_id} approved"}

@app.post("/api/v1/sync/ghost-locks")
async def sync_ghost_locks(db: AsyncSession = Depends(get_db)):
    # Mocking checking SharePoint for native locks and updating file_locks table
    return {"status": "success", "message": "Ghost locks synced"}

from admin_routes import router as admin_router
app.include_router(admin_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8080)






