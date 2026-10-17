import asyncio
import os
import httpx
from dotenv import load_dotenv

load_dotenv('.env')
from msal_service import get_master_graph_token

async def test_live_graph_upload():
    token = get_master_graph_token()
    headers = {'Authorization': f'Bearer {token}'}
    
    # 1. Get root drive
    async with httpx.AsyncClient(timeout=30.0) as client:
        r_drive = await client.get('https://graph.microsoft.com/v1.0/sites/root/drive', headers=headers)
        assert r_drive.status_code == 200, f'Failed to get root drive: {r_drive.text}'
        drive_data = r_drive.json()
        drive_id = drive_data['id']
        drive_name = drive_data.get('name', 'Documents')
        print(f"Connected to Live Microsoft SharePoint Drive: {drive_name} (ID: {drive_id})")
        
        # 2. Create upload session for a test CAD chunk upload
        test_filename = 'cadflow_live_verification.dwg'
        session_url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/root:/{test_filename}:/createUploadSession"
        payload = {'item': {'@microsoft.graph.conflictBehavior': 'replace'}}
        r_sess = await client.post(session_url, headers=headers, json=payload)
        assert r_sess.status_code in (200, 201), f'Failed to create upload session: {r_sess.text}'
        upload_url = r_sess.json()['uploadUrl']
        print(f"Live Graph Upload Session created successfully: {upload_url[:60]}...")
        
        # 3. Simulate multi-chunk upload
        # Microsoft Graph requires chunk sizes to be a multiple of 320 KiB (327,680 bytes)
        chunk_size = 327680 # exactly 320 KiB
        part1 = b'A' * chunk_size
        part2 = b'B' * 1024 # final chunk
        total_size = len(part1) + len(part2)
        
        # Upload chunk 1
        h1 = {'Content-Length': str(len(part1)), 'Content-Range': f"bytes 0-{chunk_size-1}/{total_size}"}
        r1 = await client.put(upload_url, headers=h1, content=part1)
        assert r1.status_code in (200, 201, 202), f"Chunk 1 failed: {r1.status_code} {r1.text}"
        print(f"Chunk 1 ({len(part1)} bytes) uploaded to Microsoft Graph - Status {r1.status_code}")
        
        # Upload chunk 2 (final)
        h2 = {'Content-Length': str(len(part2)), 'Content-Range': f"bytes {chunk_size}-{total_size-1}/{total_size}"}
        r2 = await client.put(upload_url, headers=h2, content=part2)
        assert r2.status_code in (200, 201), f"Chunk 2 failed: {r2.status_code} {r2.text}"
        uploaded_item = r2.json()
        item_id = uploaded_item['id']
        print(f"Chunk 2 uploaded! File assembled in SharePoint! Item ID: {item_id}, Size: {uploaded_item.get('size')} bytes")
        
        # 4. Clean up test file
        r_del = await client.delete(f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}", headers=headers)
        assert r_del.status_code in (200, 204), f"Cleanup failed: {r_del.text}"
        print("Cleaned up live verification test file from SharePoint. Live Graph Upload is 100% OPERATIONAL.")

if __name__ == '__main__':
    asyncio.run(test_live_graph_upload())
