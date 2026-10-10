import os
from msal import ConfidentialClientApplication

# We are switching from Delegated Permissions to Application Permissions (Service Account).
# This allows us to access all 4TB of the Dummy Accounts' storage in the background,
# without requiring the architects to log in with a Microsoft account.

def get_master_graph_token() -> str:
    """
    Acquires an app-only access token for Microsoft Graph using the Client Secret.
    This grants backend-level access to read/write across the entire SharePoint 
    tenant (including all dummy accounts) to manage CAD chunks.
    """
    client_id = os.environ.get("ENTRA_CLIENT_ID")
    client_secret = os.environ.get("ENTRA_CLIENT_SECRET")
    tenant_id = os.environ.get("ENTRA_TENANT_ID")
    
    authority = f"https://login.microsoftonline.com/{tenant_id}"
    
    app = ConfidentialClientApplication(
        client_id,
        authority=authority,
        client_credential=client_secret
    )
    
    # Notice we use .default scope for Application Permissions
    scopes = ["https://graph.microsoft.com/.default"]
    
    result = app.acquire_token_for_client(scopes=scopes)
    
    if "access_token" in result:
        return result["access_token"]
    else:
        raise Exception(f"Failed to acquire Microsoft Master Token: {result.get('error_description')}")

# Usage: 
# master_token = get_master_graph_token()
# requests.get("https://graph.microsoft.com/v1.0/sites/{dummy_site_id}/drive/root", headers={"Authorization": f"Bearer {master_token}"})
