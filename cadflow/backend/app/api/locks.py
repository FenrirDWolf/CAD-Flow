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

import os
from fastapi import Header, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer(auto_error=False)

def get_current_user(
    auth_header: Optional[HTTPAuthorizationCredentials] = Depends(security),
    x_api_key: Optional[str] = Header(None, alias="X-CADFlow-API-Key")
) -> dict:
    """Secure Dependency: Verifies API Key or JWT Bearer Token before granting lock operations."""
    expected_api_key = os.getenv("CADFLOW_API_KEY", "dev-cadflow-secret-key-123")
    
    # 1. Check API Key
    if x_api_key and x_api_key == expected_api_key:
        return {
            "email": "workstation@cadflow.internal",
            "name": "CADFlow Workstation",
            "org_id": os.getenv("DEFAULT_ORG_ID", "cadflow-prod-org"),
            "role": "BIM_MANAGER",
            "office_location": "Global",
            "machine_hostname": "CADFlowClient"
        }
        
    # 2. Check Bearer Token
    if auth_header and auth_header.credentials:
        try:
            import jwt
            jwt_secret = os.getenv("JWT_SECRET_KEY", "cadflow-jwt-secure-default")
            payload = jwt.decode(auth_header.credentials, jwt_secret, algorithms=["HS256", "RS256"], options={"verify_signature": True})
            return {
                "email": payload.get("email", "user@firm.com"),
                "name": payload.get("name", "Architect"),
                "org_id": payload.get("org_id", "default"),
                "role": payload.get("role", "MEMBER"),
                "office_location": payload.get("office", "UK"),
                "machine_hostname": payload.get("hostname", "Workstation")
            }
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid or expired authorization token: {str(e)}")
            
    # 3. Reject if in production without valid credentials
    if os.getenv("ENV") == "production":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Authentication required: Please provide a valid Bearer token or X-CADFlow-API-Key header."
        )
        
    # Local developer fallback
    return {
        "email": "dev@cadflow.local",
        "name": "Local Developer",
        "org_id": "dev-org-001",
        "role": "ADMIN",
        "office_location": "Local",
        "machine_hostname": "Localhost"
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
    return {"message": "Lock released and file checked in successfully"}


class LockBreakRequest(BaseModel):
    sharepoint_item_id: str
    reason: Optional[str] = "BIM Manager override: Abandoned/Stale lock"


@router.post("/break")
async def break_lock(
    req: LockBreakRequest,
    db=Depends(get_db_client),
    user=Depends(get_current_user)
):
    """
    Administrative Break Lock endpoint for BIM Managers.
    Forces release of an abandoned, orphaned, or stale lock.
    """
    logger.info(f"Lock broken for item {req.sharepoint_item_id} by {user.get('email')} - Reason: {req.reason}")
    # In real Supabase integration:
    # db.table('file_locks').delete().eq("sharepoint_item_id", req.sharepoint_item_id).execute()
    return {
        "status": "success",
        "message": f"Lock broken successfully for item {req.sharepoint_item_id}",
        "broken_by": user.get("email"),
        "reason": req.reason,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
