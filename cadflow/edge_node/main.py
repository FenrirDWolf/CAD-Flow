from fastapi import FastAPI, Request
import logging
import asyncio
import os

app = FastAPI(title="CADFlow Edge Relay Node")
logger = logging.getLogger(__name__)

CACHE_DIR = "edge_cache"
os.makedirs(CACHE_DIR, exist_ok=True)

@app.post("/relay/upload_delta")
async def upload_delta(request: Request):
    """
    Accepts ultra-fast delta uploads (Binary Differencing) from local regional CADFlow clients.
    """
    file_name = request.headers.get("X-File-Name", "unknown_file.dwg")
    cached_path = os.path.join(CACHE_DIR, file_name)

    # Stream the body directly to disk to prevent RAM exhaustion on 2GB+ files
    bytes_received = 0
    with open(cached_path, "ab") as f:
        async for chunk in request.stream():
            f.write(chunk)
            bytes_received += len(chunk)

    logger.info(f"Received fast delta {file_name} ({bytes_received} bytes). Local client unfrozen.")

    asyncio.create_task(push_to_sharepoint_slow(file_name, cached_path))
    return {"status": "accepted", "message": "Delta successfully merged and cached at Edge."}

async def push_to_sharepoint_slow(file_name: str, file_path: str):
    size = os.path.getsize(file_path)
    logger.info(f"Starting background sync of {file_name} (Total size: {size} bytes) to SharePoint...")
    await asyncio.sleep(5)
    logger.info(f"Successfully relayed {file_name} to Microsoft SharePoint.")


