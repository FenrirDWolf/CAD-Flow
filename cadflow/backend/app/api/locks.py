from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import Optional, Any
from uuid import UUID
from datetime import datetime, timezone
import logging

# Pseudo-dependencies for injection
def get_db_client() -> Any:
    """Dependency to get Supabase DB client"""
    return None

def get_graph_client() -> Any:
    """Dependency to get Microsoft Graph API client wrapper"""
    return None

def get_current_user() -> dict:
    """Dependency for JWT verification and Entra ID Auth"""
    return {
        "email": "user@example.com",
        "name": "Jane Doe",
        "org_id": "00000000-0000-0000-0000-000000000000",
        "tid": "tenant-uuid-1234",
        "office_location": "US",
        "machine_hostname": "DESKTOP-DEV"
    }

router = APIRouter(prefix="/api/v1/locks", tags=["locks"])
logger = logging.getLogger(__name__)

class LockAcquireRequest(BaseModel):
    sharepoint_item_id: str
    file_path: str
    file_type: str
    last_sha256: Optional[str] = None

class LockHeartbeatRequest(BaseModel):
    sharepoint_item_id: str

class LockReleaseRequest(BaseModel):
    sharepoint_item_id: str
    comment: Optional[str] = "Shift handover complete"
    sha256_hash: Optional[str] = None

@router.post("/acquire", status_code=status.HTTP_201_CREATED)
async def acquire_lock(
    req: LockAcquireRequest,
    db=Depends(get_db_client),
    graph=Depends(get_graph_client),
    user=Depends(get_current_user)
):
    """
    Atomic transaction:
    Insert PENDING in Supabase -> Call Graph POST /checkout -> Update Supabase to ACTIVE.
    If Graph yields 409 Conflict, roll back and return lock holder details.
    """
    org_id = user["org_id"]
    
    # 1. Insert PENDING lock in Supabase
    try:
        # Pseudo-code for DB insert
        # pending_lock = db.table('file_locks').insert({
        #     "org_id": org_id,
        #     "sharepoint_item_id": req.sharepoint_item_id,
        #     "file_path": req.file_path,
        #     "file_type": req.file_type,
        #     "locked_by_email": user["email"],
        #     "locked_by_name": user["name"],
        #     "office_location": user["office_location"],
        #     "machine_hostname": user["machine_hostname"],
        #     "status": "PENDING",
        #     "last_sha256": req.last_sha256
        # }).execute()
        pass
    except Exception as e:
        logger.warning(f"Lock already exists for item {req.sharepoint_item_id}")
        # Fetch current lock holder to return in 409 response
        # current_lock = db.table('file_locks').select("*").eq("sharepoint_item_id", req.sharepoint_item_id).execute()
        current_lock = {"locked_by_name": "John Doe", "status": "ACTIVE"} # Mock data
        
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "File is currently locked",
                "lock_info": current_lock
            }
        )

    # 2. Call Graph API POST /checkout
    try:
        # Pseudo-code for Graph API call
        # response = await graph.post(f"/drives/{org_drive_id}/items/{req.sharepoint_item_id}/checkout")
        # if response.status_code == 409:
        #     raise Exception("SharePoint Checkout Conflict")
        pass
    except Exception as e:
        # 3a. Roll back PENDING lock on failure
        # db.table('file_locks').delete().eq("sharepoint_item_id", req.sharepoint_item_id).eq("locked_by_email", user["email"]).execute()
        
        logger.error(f"Graph checkout failed, rolling back PENDING lock. Error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"message": "Failed to checkout in SharePoint. File may be locked by another user or system."}
        )

    # 3b. Update Supabase lock to ACTIVE
    # db.table('file_locks').update({"status": "ACTIVE"}).eq("sharepoint_item_id", req.sharepoint_item_id).execute()
    
    return {"message": "Lock acquired successfully", "status": "ACTIVE"}


@router.post("/heartbeat")
async def heartbeat_lock(
    req: LockHeartbeatRequest,
    db=Depends(get_db_client),
    user=Depends(get_current_user)
):
    """Update last_heartbeat_at for an active lock."""
    # current_time = datetime.now(timezone.utc).isoformat()
    # result = db.table('file_locks').update({"last_heartbeat_at": current_time, "status": "ACTIVE"}).eq("sharepoint_item_id", req.sharepoint_item_id).eq("locked_by_email", user["email"]).execute()
    
    # if not result.data:
    #    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active lock not found for user")
        
    return {"message": "Heartbeat updated"}


@router.post("/release")
async def release_lock(
    req: LockReleaseRequest,
    db=Depends(get_db_client),
    graph=Depends(get_graph_client),
    user=Depends(get_current_user)
):
    """
    Call Graph POST /checkin with user comment -> Delete Supabase lock -> Append to checkin_history.
    """
    
    # 1. Fetch the existing lock to get file_path
    # lock_data = db.table('file_locks').select("file_path").eq("sharepoint_item_id", req.sharepoint_item_id).eq("locked_by_email", user["email"]).execute()
    # if not lock_data.data:
    #     raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lock not found or you don't own it")
    file_path = "/mock/path.dwg" # lock_data.data[0]["file_path"]
    
    # 2. Call Graph POST /checkin
    try:
        # payload = {"checkInAs": "published", "comment": req.comment}
        # await graph.post(f"/drives/{org_drive_id}/items/{req.sharepoint_item_id}/checkin", json=payload)
        pass
    except Exception as e:
        logger.error(f"Graph checkin failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to check in file in SharePoint"
        )
        
    # 3. Delete Supabase lock
    # db.table('file_locks').delete().eq("sharepoint_item_id", req.sharepoint_item_id).execute()
    
    # 4. Append to checkin_history
    # db.table('checkin_history').insert({
    #     "org_id": user["org_id"],
    #     "sharepoint_item_id": req.sharepoint_item_id,
    #     "file_path": file_path,
    #     "checked_in_by_email": user["email"],
    #     "checked_in_by_name": user["name"],
    #     "handover_comment": req.comment,
    #     "sha256_hash": req.sha256_hash
    # }).execute()
    
    return {"message": "Lock released and file checked in successfully"}
