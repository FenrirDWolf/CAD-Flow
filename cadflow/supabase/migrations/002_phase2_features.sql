-- RBAC mapping
CREATE TABLE rbac_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entra_group_id TEXT UNIQUE NOT NULL,
    group_name TEXT NOT NULL,
    organization_id UUID REFERENCES organizations(id)
);

CREATE TABLE folder_permissions (
    folder_path TEXT NOT NULL,
    group_id UUID REFERENCES rbac_groups(id),
    can_write BOOLEAN DEFAULT false,
    PRIMARY KEY(folder_path, group_id)
);

-- ISO 19650 Metadata
ALTER TABLE checkin_history 
ADD COLUMN iso_status_code VARCHAR(2),
ADD COLUMN iso_revision VARCHAR(10);

-- BCF Issue Tracking
CREATE TABLE bcf_issues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'Open',
    assigned_to UUID,
    viewpoint_camera JSONB,
    sharepoint_item_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
