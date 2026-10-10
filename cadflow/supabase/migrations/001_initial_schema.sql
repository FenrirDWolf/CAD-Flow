-- Migration: 001_initial_schema
-- Description: Provision the PostgreSQL schema for CADFlow organizations, file_locks, and checkin_history.

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Organizations Table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    microsoft_tenant_id UUID NOT NULL UNIQUE,
    company_name VARCHAR(255) NOT NULL,
    sharepoint_site_id VARCHAR(255) NOT NULL,
    sharepoint_drive_id VARCHAR(255) NOT NULL,
    version_limit INT NOT NULL DEFAULT 25,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. File Locks Table
CREATE TYPE lock_status AS ENUM ('PENDING', 'ACTIVE', 'SYNCING', 'STALE');

CREATE TABLE IF NOT EXISTS file_locks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    sharepoint_item_id VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    locked_by_email VARCHAR(255) NOT NULL,
    locked_by_name VARCHAR(255) NOT NULL,
    office_location VARCHAR(100),
    machine_hostname VARCHAR(255) NOT NULL,
    status lock_status NOT NULL DEFAULT 'PENDING',
    last_sha256 VARCHAR(64),
    last_heartbeat_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (org_id, sharepoint_item_id)
);

-- 3. Checkin History Table for shift handover audit trails
CREATE TABLE IF NOT EXISTS checkin_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    sharepoint_item_id VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    checked_in_by_email VARCHAR(255) NOT NULL,
    checked_in_by_name VARCHAR(255) NOT NULL,
    handover_comment TEXT,
    sha256_hash VARCHAR(64),
    checkin_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indices for performance
CREATE INDEX idx_file_locks_org_item ON file_locks(org_id, sharepoint_item_id);
CREATE INDEX idx_file_locks_status ON file_locks(status);
CREATE INDEX idx_checkin_history_org_item ON checkin_history(org_id, sharepoint_item_id);

-- Enable Row Level Security (RLS)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkin_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Enforce Row Level Security (RLS) using auth.jwt() ->> 'tid' = organizations.microsoft_tenant_id

-- Policies for Organizations
CREATE POLICY "Users can view their own organization"
ON organizations
FOR SELECT
USING (microsoft_tenant_id::text = (auth.jwt() ->> 'tid'));

-- Policies for File Locks
CREATE POLICY "Users can view locks for their organization"
ON file_locks
FOR SELECT
USING (org_id IN (
    SELECT id FROM organizations WHERE microsoft_tenant_id::text = (auth.jwt() ->> 'tid')
));

-- Policies for Checkin History
CREATE POLICY "Users can view history for their organization"
ON checkin_history
FOR SELECT
USING (org_id IN (
    SELECT id FROM organizations WHERE microsoft_tenant_id::text = (auth.jwt() ->> 'tid')
));

-- Enable Supabase Realtime publication on file_locks
ALTER PUBLICATION supabase_realtime ADD TABLE file_locks;
