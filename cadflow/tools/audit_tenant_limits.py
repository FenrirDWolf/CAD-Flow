import os, json
from dotenv import load_dotenv
load_dotenv('cadflow/backend/.env')
from msal import ConfidentialClientApplication
import httpx

app = ConfidentialClientApplication(
    os.environ['ENTRA_CLIENT_ID'],
    authority=f"https://login.microsoftonline.com/{os.environ['ENTRA_TENANT_ID']}",
    client_credential=os.environ['ENTRA_CLIENT_SECRET']
)
token = app.acquire_token_for_client(scopes=['https://graph.microsoft.com/.default'])['access_token']
headers = {'Authorization': f'Bearer {token}'}

print("==================================================")
print("MICROSOFT 365 TENANT & LICENSE AUDIT")
print("==================================================")

# 1. Organization info
r_org = httpx.get('https://graph.microsoft.com/v1.0/organization', headers=headers)
print("Organization Query:", r_org.status_code)
if r_org.status_code == 200:
    for o in r_org.json().get('value', []):
        print("  Organization Name:", o.get('displayName'))
        print("  Tenant ID:", o.get('id'))

# 2. Subscribed SKUs
r_skus = httpx.get('https://graph.microsoft.com/v1.0/subscribedSkus', headers=headers)
print("\nSubscribed SKUs (Licenses):", r_skus.status_code)
if r_skus.status_code == 200:
    for s in r_skus.json().get('value', []):
        plan = s.get('skuPartNumber')
        enabled = s.get('prepaidUnits', {}).get('enabled')
        consumed = s.get('consumedUnits')
        print(f"  Plan: {plan} | Total Licenses: {enabled} | Assigned: {consumed}")
else:
    print("  Failed to query SKUs:", r_skus.text)

# 3. Check SharePoint Site Quota details
r_site = httpx.get('https://graph.microsoft.com/v1.0/sites/root', headers=headers)
print("\nRoot Site Info:", r_site.status_code)
if r_site.status_code == 200:
    site_json = r_site.json()
    print("  Root Site Name:", site_json.get('displayName'))
    print("  Web URL:", site_json.get('webUrl'))

# 4. Check Root Drive Quota details
r_drive = httpx.get('https://graph.microsoft.com/v1.0/sites/root/drive', headers=headers)
if r_drive.status_code == 200:
    d = r_drive.json()
    q = d.get('quota', {})
    print("\nRoot Drive Quota Object:")
    print("  raw total:", q.get('total'))
    print("  raw used:", q.get('used'))
    print("  raw remaining:", q.get('remaining'))
    print("  raw state:", q.get('state'))
