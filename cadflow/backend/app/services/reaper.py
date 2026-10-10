import logging
from datetime import datetime, timedelta, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler

logger = logging.getLogger(__name__)

# Pseudo-dependency for DB
def get_db_client():
    return None

async def reap_stale_locks():
    """
    Queries Supabase for locks with last_heartbeat_at older than 15 minutes,
    and updates their status to STALE.
    """
    db = get_db_client()
    if not db:
        logger.warning("DB client not available for reaper task (Mock mode).")
        return
        
    cutoff_time = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    
    try:
        # Pseudo-code for Supabase update
        # result = db.table('file_locks') \
        #     .update({"status": "STALE"}) \
        #     .lt("last_heartbeat_at", cutoff_time) \
        #     .neq("status", "STALE") \
        #     .execute()
        
        # count = len(result.data) if result.data else 0
        count = 0 # Mock count
        logger.info(f"Reaper executed: Marked {count} locks as STALE.")
    except Exception as e:
        logger.error(f"Failed to reap stale locks: {str(e)}")

def start_reaper_scheduler():
    """Initialize and start the apscheduler background task"""
    scheduler = AsyncIOScheduler()
    scheduler.add_job(reap_stale_locks, 'interval', minutes=5)
    scheduler.start()
    logger.info("Reaper scheduler started. Running every 5 minutes.")
