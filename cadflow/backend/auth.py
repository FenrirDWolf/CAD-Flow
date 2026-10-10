from fastapi import HTTPException, Depends
from fastapi.security import APIKeyHeader
import os

API_KEY_NAME = "X-CADFlow-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

async def verify_api_key(api_key: str = Depends(api_key_header)):
    if not api_key or api_key != os.getenv("CADFLOW_API_KEY", "dev-cadflow-secret-key-123"):
        raise HTTPException(status_code=403, detail="Could not validate credentials - Invalid API Key")
    return api_key
