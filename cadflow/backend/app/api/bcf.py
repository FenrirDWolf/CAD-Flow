from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import logging
from typing import List, Optional

router = APIRouter(prefix="/api/v1/issues", tags=["bcf_issues"])
logger = logging.getLogger(__name__)

class BCFIssue(BaseModel):
    title: str
    description: Optional[str] = None
    sharepoint_item_id: str
    viewpoint_camera: Optional[dict] = None
    assigned_to: Optional[str] = None

@router.post("/")
async def create_issue(issue: BCFIssue):
    """
    Creates a new BCF issue linked to a file and viewpoint.
    """
    logger.info(f"Creating BCF issue: {issue.title}")
    # In a real implementation, insert into Supabase `bcf_issues`
    return {"message": "Issue created", "issue": issue.dict()}

@router.get("/{sharepoint_item_id}")
async def get_issues(sharepoint_item_id: str):
    """
    Retrieves BCF issues for a specific file.
    """
    # Query Supabase `bcf_issues`
    return {"issues": []}
