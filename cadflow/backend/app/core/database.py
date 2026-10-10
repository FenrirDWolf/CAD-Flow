from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
import os

# The Neon DB Connection String (Defaulting to a localhost mock for development if not provided)
# Format: postgresql+asyncpg://user:password@endpoint.neon.tech/dbname
DATABASE_URL = os.getenv("NEON_DB_URL", "sqlite+aiosqlite:///./cadflow_mock.db")

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
