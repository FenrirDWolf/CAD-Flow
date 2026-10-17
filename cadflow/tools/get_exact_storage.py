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

print("==================================================")
print("EXACT STORAGE QUOTA AUDIT VIA MICROSOFT GRAPH API")
print("==================================================")

grand_total_bytes = 0
grand_used_bytes = 0
grand_remaining_bytes = 0

# 1. Main Root SharePoint Site Quota
r_root_drive = httpx.get('https://graph.microsoft.com/v1.0/sites/root/drive', headers=headers)
root_data = r_root_drive.json()
print('\n[1] Root SharePoint Site Drive:')
print('Name:', root_data.get('name'))
print('Drive ID:', root_data.get('id'))
print('Web URL:', root_data.get('webUrl'))
quota = root_data.get('quota', {})
print('Quota Data:', json.dumps(quota))
if quota:
    total_gb = quota.get('total', 0) / (1024**3)
    used_gb = quota.get('used', 0) / (1024**3)
    remaining_gb = quota.get('remaining', 0) / (1024**3)
    print(f"Total: {total_gb:.2f} GB ({quota.get('total')} bytes)")
    print(f"Used: {used_gb:.2f} GB ({quota.get('used')} bytes)")
    print(f"Remaining: {remaining_gb:.2f} GB ({quota.get('remaining')} bytes)")
    grand_total_bytes += quota.get('total', 0)
    grand_used_bytes += quota.get('used', 0)
    grand_remaining_bytes += quota.get('remaining', 0)

# 2. Check each shortcut
r_items = httpx.get(f"https://graph.microsoft.com/v1.0/drives/{root_data['id']}/root/children", headers=headers)
idx = 2
for it in r_items.json().get('value', []):
    if it['name'].endswith('.url'):
        dl = it.get('@microsoft.graph.downloadUrl')
        rc = httpx.get(dl) if dl else httpx.get(f"https://graph.microsoft.com/v1.0/drives/{root_data['id']}/items/{it['id']}/content", headers=headers, follow_redirects=True)
        for line in rc.text.splitlines():
            if line.startswith('URL='):
                target_url = line[4:].strip()
                encoded = encode_sharing_url(target_url)
                r_shared = httpx.get(f"https://graph.microsoft.com/v1.0/shares/{encoded}/driveItem", headers=headers)
                if r_shared.status_code == 200:
                    s_item = r_shared.json()
                    s_drive_id = s_item['parentReference']['driveId']
                    r_drv = httpx.get(f"https://graph.microsoft.com/v1.0/drives/{s_drive_id}", headers=headers)
                    drv_data = r_drv.json()
                    print(f"\n[{idx}] {it['name']} (Connected Account Drive: {drv_data.get('name')}):")
                    print("Drive ID:", drv_data.get('id'))
                    print("Web URL:", drv_data.get('webUrl'))
                    q = drv_data.get('quota', {})
                    print("Quota Data:", json.dumps(q))
                    if q:
                        t_gb = q.get('total', 0) / (1024**3)
                        u_gb = q.get('used', 0) / (1024**3)
                        rem_gb = q.get('remaining', 0) / (1024**3)
                        print(f"Total: {t_gb:.2f} GB ({q.get('total')} bytes)")
                        print(f"Used: {u_gb:.2f} GB ({q.get('used')} bytes)")
                        print(f"Remaining: {rem_gb:.2f} GB ({q.get('remaining')} bytes)")
                        grand_total_bytes += q.get('total', 0)
                        grand_used_bytes += q.get('used', 0)
                        grand_remaining_bytes += q.get('remaining', 0)
                    idx += 1

print("\n==================================================")
print("AGGREGATE LIVE TOTALS ACROSS ALL CONNECTED ACCOUNTS:")
print(f"Total Capacity: {grand_total_bytes / (1024**3):.2f} GB ({grand_total_bytes / (1024**4):.3f} TB)")
print(f"Total Used:     {grand_used_bytes / (1024**3):.2f} GB")
print(f"Total Free:     {grand_remaining_bytes / (1024**3):.2f} GB ({grand_remaining_bytes / (1024**4):.3f} TB)")
print("==================================================")
