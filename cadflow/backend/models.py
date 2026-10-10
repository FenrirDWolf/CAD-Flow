from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, Enum, Integer
import enum
import os
import uuid
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()
NEON_DB_URL = os.getenv("NEON_DB_URL")
if "sslmode=require" in NEON_DB_URL:
    NEON_DB_URL = NEON_DB_URL.replace("sslmode=require", "ssl=require")
if "channel_binding=require" in NEON_DB_URL:
    NEON_DB_URL = NEON_DB_URL.replace("&channel_binding=require", "")

engine = create_async_engine(NEON_DB_URL, echo=True)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

class UserRole(enum.Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    VIEWER = "viewer"

class User(Base):
    __tablename__ = "users"
    clerk_id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    role = Column(Enum(UserRole), default=UserRole.VIEWER)

class FolderAccess(Base):
    __tablename__ = "folder_access"
    id = Column(String, primary_key=True)
    clerk_id = Column(String, ForeignKey("users.clerk_id"))
    drive_id = Column(String)
    folder_id = Column(String, nullable=True)
    folder_name = Column(String, nullable=True)

class FileLock(Base):
    __tablename__ = "file_locks"
    id = Column(Integer, primary_key=True, autoincrement=True)
    sharepoint_item_id = Column(String)
    file_name = Column(String)
    locked_by = Column(String, ForeignKey("users.clerk_id"))
    locked_by_user = Column(String)
    locked_at = Column(DateTime)
    machine_hostname = Column(String)

class AuditAction(enum.Enum):
    UPLOAD = "upload"
    DOWNLOAD = "download"
    EDIT = "edit"
    LOCK = "lock"
    UNLOCK = "unlock"
    DELETE = "delete"

class FileAuditLog(Base):
    __tablename__ = "file_audit_logs"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    sharepoint_item_id = Column(String, index=True)
    file_name = Column(String)
    clerk_id = Column(String, ForeignKey("users.clerk_id"))
    action = Column(Enum(AuditAction))
    timestamp = Column(DateTime, default=datetime.utcnow)
    details = Column(String, nullable=True)

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

if __name__ == '__main__':
    import asyncio
    asyncio.run(init_db())
    print("Database schema created successfully.")
