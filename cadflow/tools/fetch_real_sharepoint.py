import os, json
from dotenv import load_dotenv
load_dotenv('cadflow/backend/.env')
from msal import ConfidentialClientApplication
import httpx
import base64

def encode_sharing_url(url: str) -> str:
    base64_value = base64.b64encode(url.encode('utf-8')).decode('utf-8')
    return "u!" + base64_value.rstrip('=').replace('/', '_').replace('+', '-')

app = ConfidentialClientApplication(
    os.environ['ENTRA_CLIENT_ID'],
    authority=f"https://login.microsoftonline.com/{os.environ['ENTRA_TENANT_ID']}",
    client_credential=os.environ['ENTRA_CLIENT_SECRET']
)
token = app.acquire_token_for_client(scopes=['https://graph.microsoft.com/.default'])['access_token']
headers = {'Authorization': f'Bearer {token}'}

url_a = "https://admintwilightgrp-my.sharepoint.com/:f:/g/personal/twilighta_twilightgrp_com/IgBKfA8Li94wT6cZZoVPlzHVAei5SEUGOKF-S4FTy_hYn_w?e=fdVGB0"
encoded = encode_sharing_url(url_a)
r_shared = httpx.get(f"https://graph.microsoft.com/v1.0/shares/{encoded}/driveItem", headers=headers)
s_item = r_shared.json()
d_id = s_item["parentReference"]["driveId"]
print(f"Archive_Vault_A Drive ID: {d_id}")

# 1. Check REVIT
revit_id = "01SZIGEDADZXYTGGRH3NHIA7RYJGFT3JBI"
r_ch = httpx.get(f"https://graph.microsoft.com/v1.0/drives/{d_id}/items/{revit_id}/children", headers=headers)
print("\nFiles in REVIT:")
for f in r_ch.json().get('value', []):
    print(f"  - {'[DIR]' if 'folder' in f else '[FILE]'} {f['name']} ({f.get('size', 0)} bytes)")

# 2. Check Krish Villa_CAD
kv_id = "01SZIGEDBFXIELJN2B7RBLD2SCFDIWSJ6B"
r_kv = httpx.get(f"https://graph.microsoft.com/v1.0/drives/{d_id}/items/{kv_id}/children", headers=headers)
print("\nFiles in Krish Villa_CAD:")
for f in r_kv.json().get('value', [])[:10]:
    print(f"  - {'[DIR]' if 'folder' in f else '[FILE]'} {f['name']} ({f.get('size', 0)} bytes)")
