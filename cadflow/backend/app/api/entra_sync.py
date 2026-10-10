import httpx
import os
from fastapi import APIRouter, BackgroundTasks

router = APIRouter()

ENTRA_TENANT_ID = os.getenv("ENTRA_TENANT_ID", "mock-tenant")
ENTRA_CLIENT_ID = os.getenv("ENTRA_CLIENT_ID", "mock-client")
ENTRA_CLIENT_SECRET = os.getenv("ENTRA_CLIENT_SECRET", "mock-secret")

async def get_graph_token() -> str:
    """Gets an access token for Microsoft Graph API using Client Credentials."""
    url = f"https://login.microsoftonline.com/{ENTRA_TENANT_ID}/oauth2/v2.0/token"
    data = {
        "client_id": ENTRA_CLIENT_ID,
        "scope": "https://graph.microsoft.com/.default",
        "client_secret": ENTRA_CLIENT_SECRET,
        "grant_type": "client_credentials"
    }
    
    # async with httpx.AsyncClient() as client:
    #     response = await client.post(url, data=data)
    #     response.raise_for_status()
    #     return response.json()["access_token"]
    
    return "mock_access_token"

async def sync_entra_groups_to_supabase():
    """
    Fetches Groups and their Members from Microsoft Entra ID (Azure AD),
    and mirrors them into CADFlow's Supabase RBAC tables (Row Level Security).
    """
    token = await get_graph_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Fetch AD Groups (e.g. 'Structural Engineers', 'MEP Team')
    print("[Entra Sync] Fetching Microsoft 365 Groups from Graph API...")
    # async with httpx.AsyncClient() as client:
    #     groups_res = await client.get("https://graph.microsoft.com/v1.0/groups", headers=headers)
    #     groups = groups_res.json().get("value", [])
    
    mock_groups = [
        {"id": "g-1", "displayName": "Structural Engineers"},
        {"id": "g-2", "displayName": "MEP Engineers"},
        {"id": "g-3", "displayName": "Architects"}
    ]

    # 2. Upsert into Supabase (Mocked)
    for group in mock_groups:
        print(f"[Entra Sync] Upserting Group to Supabase: {group['displayName']} ({group['id']})")
        
        # 3. Fetch members for each group
        # members_res = await client.get(f"https://graph.microsoft.com/v1.0/groups/{group['id']}/members", headers=headers)
        mock_members = [{"id": "u-1", "userPrincipalName": "jane.doe@firm.com"}]
        
        for member in mock_members:
            print(f"  -> Adding {member['userPrincipalName']} to {group['displayName']} in CADFlow RBAC.")
            # supabase.table("user_roles").upsert({"user_id": member["id"], "role": group["displayName"]}).execute()

@router.post("/api/v1/admin/sync-entra-ad")
async def trigger_entra_sync(background_tasks: BackgroundTasks):
    """
    Endpoint for the BIM Manager to force an Azure AD sync.
    """
    background_tasks.add_task(sync_entra_groups_to_supabase)
    return {"status": "success", "message": "Microsoft Entra ID synchronization started in the background."}
