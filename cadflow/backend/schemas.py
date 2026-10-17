from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class LockAcquireRequest(BaseModel):
    sharepoint_item_id: str
    file_path: str
    file_type: str
    machine_hostname: str
    windows_username: Optional[str] = None

class LockReleaseRequest(BaseModel):
    sharepoint_item_id: str
    comment: Optional[str] = None
    machine_hostname: Optional[str] = None
    windows_username: Optional[str] = None

class LockHeartbeatRequest(BaseModel):
    sharepoint_item_id: str
    machine_hostname: Optional[str] = None
    windows_username: Optional[str] = None

class LockStatusResponse(BaseModel):
    sharepoint_item_id: str
    locked_by: Optional[str]
    locked_at: Optional[datetime]
    machine_hostname: Optional[str]

class CreateFolderRequest(BaseModel):
    drive_id: str
    parent_item_id: str
    folder_name: str

class RenameItemRequest(BaseModel):
    drive_id: str
    item_id: str
    new_name: str

class DeleteItemRequest(BaseModel):
    drive_id: str
    item_id: str

class CreateUploadSessionRequest(BaseModel):
    drive_id: str
    parent_item_id: Optional[str] = "root"
    file_name: str

class UserCreate(BaseModel):
    clerk_id: str
    email: str
    role: str

class GrantAccessRequest(BaseModel):
    clerk_id: str
    drive_id: str
    folder_id: Optional[str] = None
    folder_name: Optional[str] = None

class RoleUpdateRequest(BaseModel):
    clerk_id: str
    role: str
