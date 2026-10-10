from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import logging
from typing import List, Optional
from datetime import datetime

router = APIRouter(prefix="/api/v1/sync", tags=["sync_queue"])
logger = logging.getLogger(__name__)

class SyncEnqueueRequest(BaseModel):
    sharepoint_item_id: str
    user_name: str

class SyncQueueItem(BaseModel):
    id: str
    sharepoint_item_id: str
    user_name: str
    status: str
    started_at: Optional[datetime] = None

@router.post("/enqueue")
async def enqueue_sync(req: SyncEnqueueRequest):
    """
    Adds a user to the Revit Sync queue for a specific file.
    If they are first, they get SYNCING status. Otherwise, WAITING.
    """
    logger.info(f"User {req.user_name} requesting sync for {req.sharepoint_item_id}")
    
    # In a real app, query Supabase for existing active syncs
    # active_syncs = supabase.table('revit_sync_queue').select('*').eq('sharepoint_item_id', req.sharepoint_item_id).neq('status', 'COMPLETED').execute()
    
    # Mocking logic
    return {
        "message": "Added to sync queue",
        "queue_position": 1,
        "status": "SYNCING", # or WAITING if someone is ahead
        "estimated_wait_seconds": 0
    }

@router.post("/complete/{queue_id}")
async def complete_sync(queue_id: str):
    """
    Marks a sync as COMPLETED and promotes the next user in WAITING to SYNCING.
    """
    logger.info(f"Sync completed for queue_id {queue_id}")
    # In a real app:
    # 1. Update queue_id to COMPLETED
    # 2. Find oldest WAITING record for the same file
    # 3. Update it to SYNCING and set started_at = NOW()
    # 4. Supabase Realtime will automatically notify React UI and the waiting Rust client.
    
    return {"message": "Sync completed, next user notified (if any)"}
