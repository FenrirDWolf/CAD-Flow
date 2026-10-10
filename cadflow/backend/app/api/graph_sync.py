import os
import msal
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from fastapi import APIRouter, Depends, HTTPException

router = APIRouter(prefix="/api/v1/graph", tags=["graph"])

# Entra ID App Credentials
CLIENT_ID = os.getenv("ENTRA_CLIENT_ID", "mock_client_id")
CLIENT_SECRET = os.getenv("ENTRA_CLIENT_SECRET", "mock_client_secret")
TENANT_ID = os.getenv("ENTRA_TENANT_ID", "mock_tenant_id")
AUTHORITY = f"https://login.microsoftonline.com/{TENANT_ID}"
SCOPES = ["https://graph.microsoft.com/.default"]

app = msal.ConfidentialClientApplication(
    CLIENT_ID, authority=AUTHORITY, client_credential=CLIENT_SECRET
)

async def get_graph_token() -> str:
    """Acquires OAuth token from Microsoft Entra ID silently."""
    result = app.acquire_token_silent(SCOPES, account=None)
    if not result:
        result = app.acquire_token_for_client(scopes=SCOPES)
    if "access_token" in result:
        return result["access_token"]
    raise HTTPException(status_code=401, detail="Could not authenticate with Entra ID")


class MicrosoftRateLimitError(Exception):
    pass

# EXPONENTIAL BACKOFF: If we get a 429 from Microsoft, wait 2^x * 1 second (up to 5 tries)
@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(MicrosoftRateLimitError)
)
async def upload_chunk_to_sharepoint(token: str, site_id: str, file_name: str, chunk_hash: str, raw_bytes: bytes):
    endpoint = f"https://graph.microsoft.com/v1.0/sites/{site_id}/drive/root:/.cadflow_chunks/{file_name}/{chunk_hash}:/content"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/octet-stream"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.put(endpoint, headers=headers, content=raw_bytes)
        
        # 429 Too Many Requests -> Trigger Tenacity Backoff
        if response.status_code == 429:
            print(f"⚠️ Microsoft Throttling (429) hit for {chunk_hash}. Retrying with exponential backoff...")
            raise MicrosoftRateLimitError("SharePoint rate limit exceeded")
            
        if response.status_code not in (200, 201):
            raise Exception(f"Failed to upload: {response.text}")
            
    return response.json()
