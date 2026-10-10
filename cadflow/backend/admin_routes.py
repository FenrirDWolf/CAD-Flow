from fastapi import APIRouter, Depends, HTTPException
from auth import verify_api_key
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from models import get_db, User, FolderAccess, FileAuditLog

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

@router.get("/users")
async def get_all_users(db: AsyncSession = Depends(get_db), api_key: str = Depends(verify_api_key)):
    result = await db.execute(select(User))
    users = result.scalars().all()
    
    access_result = await db.execute(select(FolderAccess))
    accesses = access_result.scalars().all()
    
    users_data = []
    for u in users:
        u_access = [a.drive_id for a in accesses if a.clerk_id == u.clerk_id]
        users_data.append({
            "clerk_id": u.clerk_id,
            "email": u.email,
            "role": u.role.value,
            "accessible_drives": u_access
        })
    return users_data


@router.get("/locks")
async def get_all_locks(db: AsyncSession = Depends(get_db), api_key: str = Depends(verify_api_key)):
    from models import FileLock
    result = await db.execute(select(FileLock))
    locks = result.scalars().all()
    locks_data = []
    for l in locks:
        locks_data.append({
            "sharepoint_item_id": l.sharepoint_item_id,
            "file_name": l.file_name,
            "locked_by": l.locked_by,
            "locked_at": l.locked_at.isoformat() if l.locked_at else None,
            "machine_hostname": l.machine_hostname
        })
    return locks_data

@router.delete("/locks/{item_id}")
async def force_release_lock(item_id: str, db: AsyncSession = Depends(get_db)):
    from models import FileLock
    result = await db.execute(select(FileLock).where(FileLock.sharepoint_item_id == item_id))
    lock = result.scalar_one_or_none()
    if lock:
        await db.delete(lock)
        await db.commit()
    return {"status": "ok"}

@router.get("/audit-logs")
async def get_audit_logs(db: AsyncSession = Depends(get_db), api_key: str = Depends(verify_api_key)):
    result = await db.execute(
        select(FileAuditLog, User.email)
        .outerjoin(User, FileAuditLog.clerk_id == User.clerk_id)
        .order_by(FileAuditLog.timestamp.desc())
        .limit(100)
    )
    
    logs = []
    for log, email in result.all():
        logs.append({
            "id": log.id,
            "file_name": log.file_name,
            "action": log.action.value,
            "user_email": email or "Unknown",
            "timestamp": log.timestamp.isoformat(),
            "details": log.details
        })
    return logs

from schemas import GrantAccessRequest
import uuid

@router.post("/access")
async def grant_access(request: GrantAccessRequest, db: AsyncSession = Depends(get_db), api_key: str = Depends(verify_api_key)):
    new_access = FolderAccess(
        id=str(uuid.uuid4()),
        clerk_id=request.clerk_id,
        drive_id=request.drive_id,
        folder_id=request.folder_id,
        folder_name=request.folder_name
    )
    db.add(new_access)
    await db.commit()
    return {"status": "ok"}
