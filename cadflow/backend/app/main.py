from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.api import auth, locks, storage, bcf, sync, links, workflows, entra_sync
from app.services.reaper import start_reaper_scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: start reaper scheduler
    logger.info("Starting CADFlow backend services...")
    start_reaper_scheduler()
    yield
    # Shutdown logic
    logger.info("Shutting down CADFlow backend services...")

app = FastAPI(title="CADFlow Orchestrator API", lifespan=lifespan)

# Configure CORS for local development UI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:1420", "http://localhost:5173", "tauri://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth.router)
app.include_router(locks.router)
app.include_router(storage.router)
app.include_router(bcf.router)
app.include_router(sync.router)
app.include_router(links.router)
app.include_router(workflows.router)
app.include_router(entra_sync.router)

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "CADFlow Orchestrator"}
