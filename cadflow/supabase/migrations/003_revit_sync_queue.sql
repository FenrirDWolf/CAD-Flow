-- Migration: Revit Sync Queue
-- Tracks multi-user synchronization for Revit Central Models to prevent corruption.

CREATE TABLE revit_sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sharepoint_item_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'WAITING', -- 'WAITING', 'SYNCING', 'COMPLETED'
    estimated_duration_seconds INT DEFAULT 45,
    started_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for quick lookup of active queues per file
CREATE INDEX idx_sync_queue_item ON revit_sync_queue(sharepoint_item_id) WHERE status != 'COMPLETED';
