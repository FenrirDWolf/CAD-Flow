from fastapi import FastAPI, Request, HTTPException
import logging
import asyncio
import os
import httpx
import tempfile

app = FastAPI(title="CADFlow Edge Relay Node")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CACHE_DIR = "edge_cache"
os.makedirs(CACHE_DIR, exist_ok=True)

BACKEND_URL = os.environ.get("CADFLOW_BACKEND_URL", "https://cadflow-api.onrender.com")
API_KEY = os.environ.get("CADFLOW_API_KEY", "dev-cadflow-secret-key-123")

@app.get("/health")
def health():
    return {"status": "ok", "service": "CADFlow Edge Relay"}

@app.post("/relay/upload_delta")
async def upload_delta(request: Request):
    """
    Accepts delta/complete file uploads from local CADFlow clients, writes safely
    to temporary file before atomically swapping, and triggers background SharePoint sync.
    """
    file_name = request.headers.get("X-File-Name", "unknown_file.dwg")
    drive_id = request.headers.get("X-Drive-Id", "")
    final_path = os.path.join(CACHE_DIR, file_name)

    temp_fd, temp_path = tempfile.mkstemp(dir=CACHE_DIR, prefix="relay_tmp_")
    bytes_received = 0
    try:
        with open(temp_fd, "wb") as f:
            async for chunk in request.stream():
                f.write(chunk)
                bytes_received += len(chunk)
        os.replace(temp_path, final_path)
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        logger.error(f"Error buffering upload for {file_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    logger.info(f"Received file {file_name} ({bytes_received} bytes). Local client unfrozen.")

    asyncio.create_task(push_to_sharepoint(file_name, final_path, drive_id))
    return {"status": "accepted", "message": "File successfully cached at Edge and queued for SharePoint sync."}

async def push_to_sharepoint(file_name: str, file_path: str, drive_id: str):
    """
    Uploads the cached file to SharePoint using Graph API Resumable Upload Session.
    """
    if not os.path.exists(file_path):
        return

    size = os.path.getsize(file_path)
    logger.info(f"Relaying {file_name} ({size} bytes) to SharePoint...")

    try:
        headers = {"X-CADFlow-API-Key": API_KEY, "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=30.0) as client:
            target_drive = drive_id
            if not target_drive:
                tree_resp = await client.get(f"{BACKEND_URL}/api/v1/sharepoint/drives", headers=headers)
                if tree_resp.status_code == 200:
                    drives = tree_resp.json().get("drives", [])
                    if drives:
                        target_drive = drives[0].get("id", "")

            if not target_drive:
                logger.warning(f"No SharePoint drive available for {file_name}; keeping cached at edge.")
                return

            session_req = {
                "drive_id": target_drive,
                "parent_item_id": "root",
                "file_name": file_name
            }
            sess_resp = await client.post(f"{BACKEND_URL}/api/v1/sharepoint/upload-session", json=session_req, headers=headers)
            if sess_resp.status_code not in (200, 201):
                logger.error(f"Failed to create upload session: {sess_resp.text}")
                return

            upload_url = sess_resp.json().get("uploadUrl")
            if not upload_url:
                logger.error("No uploadUrl returned from session creation")
                return

            chunk_size = 10 * 1024 * 1024
            with open(file_path, "rb") as f:
                start = 0
                while start < size:
                    end = min(start + chunk_size, size)
                    chunk_data = f.read(end - start)
                    up_headers = {
                        "Content-Length": str(len(chunk_data)),
                        "Content-Range": f"bytes {start}-{end - 1}/{size}"
                    }
                    put_resp = await client.put(upload_url, headers=up_headers, content=chunk_data, timeout=60.0)
                    if put_resp.status_code not in (200, 201, 202):
                        logger.error(f"Chunk upload failed at byte {start}: {put_resp.text}")
                        return
                    start = end

            logger.info(f"Successfully uploaded {file_name} to Microsoft SharePoint.")
    except Exception as e:
        logger.error(f"Exception during SharePoint sync for {file_name}: {e}")
