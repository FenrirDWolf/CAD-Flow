from sqlalchemy import Column, String, Integer, DateTime, Boolean, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base

class FileLock(Base):
    __tablename__ = "file_locks"

    id = Column(Integer, primary_key=True, index=True)
    sharepoint_item_id = Column(String, unique=True, index=True, nullable=False)
    file_name = Column(String, nullable=False)
    locked_by_user = Column(String, nullable=False)  # User's Entra ID email
    locked_at = Column(DateTime(timezone=True), server_default=func.now())
    
class ChunkManifest(Base):
    __tablename__ = "chunk_manifests"
    
    id = Column(Integer, primary_key=True, index=True)
    sharepoint_item_id = Column(String, index=True, nullable=False)
    chunk_hash = Column(String, index=True, nullable=False)
    byte_offset = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
