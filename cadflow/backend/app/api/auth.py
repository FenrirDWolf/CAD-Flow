from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
import jwt
import logging

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
logger = logging.getLogger(__name__)

class AdminConsentCallback(BaseModel):
    tenant: str
    admin_consent: bool
    
@router.get("/adminconsent")
async def admin_consent_redirect():
    """Redirects to Microsoft Entra ID admin consent URL."""
    # Real app would format URL based on client ID and redirect URI
    consent_url = "https://login.microsoftonline.com/common/adminconsent?client_id=YOUR_CLIENT_ID"
    return {"consent_url": consent_url}

@router.post("/callback")
async def auth_callback(req: Request):
    """
    Callback handling JWT token from Entra ID.
    Decodes JWT, extracts tid, and simulates Graph API provisioning of CADFlow_Projects.
    """
    body = await req.json()
    token = body.get("access_token")
    
    if not token:
        raise HTTPException(status_code=400, detail="Missing access token")
        
    try:
        import os
        jwt_secret = os.getenv("ENTRA_JWT_SECRET")
        if jwt_secret:
            decoded = jwt.decode(token, jwt_secret, algorithms=["RS256", "HS256"], options={"verify_signature": True})
        else:
            # In development fallback only, warn explicitly
            if os.getenv("ENV") == "production":
                raise HTTPException(status_code=401, detail="Production Security: Token verification secret is not configured.")
            decoded = jwt.decode(token, options={"verify_signature": False})
            logger.warning("[SECURITY WARNING] JWT decoded without signature verification in non-production mode.")
            
        tid = decoded.get("tid")
        
        if not tid:
            raise HTTPException(status_code=400, detail="Token missing tid (Tenant ID)")
            
        logger.info(f"Provisioning CADFlow_Projects for tenant {tid}")
        
        # Simulate Graph API provisioning logic
        # 1. Get SharePoint root site
        # 2. Create document library list 'CADFlow_Projects'
        # 3. Set MajorVersionLimit to 25
        
        # Phase 2: RBAC Sync
        logger.info(f"Syncing Entra ID groups for user in tenant {tid} to rbac_groups...")
        # e.g., groups = await graph.get(f"/users/{user_id}/memberOf")
        # insert into rbac_groups ...

        return {
            "message": "Auth successful. SharePoint provisioning triggered and RBAC synced.",
            "tenant_id": tid,
            "document_library": "CADFlow_Projects"
        }
    except jwt.DecodeError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        logger.error(f"Auth error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")
