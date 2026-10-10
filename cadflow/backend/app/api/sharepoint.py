import httpx
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
import os

router = APIRouter(prefix="/sharepoint", tags=["sharepoint"])

# In a real environment, this gets an OAuth token using MSAL and the Client Secret
async def get_graph_token() -> str:
    # return msal_app.acquire_token_silent(...)
    return os.getenv("GRAPH_API_TOKEN", "mock_graph_token")

class ChunkUploadRequest(BaseModel):
    file_name: str
    chunk_hash: str
    byte_offset: int

@router.put("/upload_chunk")
async def upload_chunk(file_name: str, chunk_hash: str, background_tasks: BackgroundTasks):
    """
    Called by the Rust Desktop App.
    Uploads a 4MB CDC chunk directly into the client's SharePoint.
    """
    token = await get_graph_token()
    site_id = os.getenv("SHAREPOINT_SITE_ID", "mock_site_id_123")
    
    # We store chunks in a hidden folder: /.cadflow_chunks/{file_name}/{chunk_hash}
    endpoint = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/root:/.cadflow_chunks/{file_name}/{chunk_hash}:/content"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/octet-stream"
    }
    
    # In reality, the binary bytes would be streaming through the FastAPI request body
    # async with httpx.AsyncClient() as client:
    #     response = await client.put(endpoint, headers=headers, content=raw_bytes)
    #     if response.status_code not in (200, 201):
    #         raise HTTPException(status_code=502, detail="Microsoft Graph API rejected the upload")
            
    return {
        "status": "success",
        "chunk_hash": chunk_hash,
        "message": "Chunk uploaded to SharePoint successfully"
    }

@router.get("/download_chunk")
async def download_chunk(file_name: str, chunk_hash: str):
    """
    Called by the Rust Desktop App when Windows ProjFS requests bytes that aren't cached locally.
    Downloads the specific 4MB chunk from SharePoint.
    """
    token = await get_graph_token()
    site_id = os.getenv("SHAREPOINT_SITE_ID", "mock_site_id_123")
    
    endpoint = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/root:/.cadflow_chunks/{file_name}/{chunk_hash}:/content"
    
    # async with httpx.AsyncClient() as client:
    #     response = await client.get(endpoint, headers={"Authorization": f"Bearer {token}"})
    #     return Response(content=response.content, media_type="application/octet-stream")
    
    return {"status": "success", "message": "Chunk downloaded from SharePoint"}
