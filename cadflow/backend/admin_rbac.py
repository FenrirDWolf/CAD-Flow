import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from models import User, FolderAccess, UserRole
import os
from dotenv import load_dotenv

load_dotenv()
NEON_DB_URL = os.getenv("NEON_DB_URL")
if "sslmode=require" in NEON_DB_URL:
    NEON_DB_URL = NEON_DB_URL.replace("sslmode=require", "ssl=require")
if "channel_binding=require" in NEON_DB_URL:
    NEON_DB_URL = NEON_DB_URL.replace("&channel_binding=require", "")

engine = create_async_engine(NEON_DB_URL, echo=True)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def grant_access(clerk_id: str, email: str, drive_id: str):
    async with AsyncSessionLocal() as db:
        # Create user if not exists
        user = await db.get(User, clerk_id)
        if not user:
            user = User(clerk_id=clerk_id, email=email, role=UserRole.MANAGER)
            db.add(user)
            await db.commit()
            print(f"Created user {email}")
            
        # Grant access
        access_id = f"{clerk_id}_{drive_id}"
        access = await db.get(FolderAccess, access_id)
        if not access:
            access = FolderAccess(id=access_id, clerk_id=clerk_id, drive_id=drive_id)
            db.add(access)
            await db.commit()
            print(f"Granted user {email} access to Drive ID: {drive_id}")
        else:
            print("Access already granted.")

if __name__ == '__main__':
    print("Example RBAC Usage:")
    print("Run this to map a Clerk User to a SharePoint Dummy Drive.")
    # asyncio.run(grant_access('user_2n3...', 'manager@example.com', 'b!IdX3...'))
