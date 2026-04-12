-- Migration 008: Create Notification table
-- Requirements: 25.1

CREATE TABLE notification (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID NOT NULL REFERENCES parent(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL CHECK (type IN ('task_completion', 'alert', 'report')),
    content JSONB NOT NULL DEFAULT '{}',
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_parent ON notification(parent_id);
CREATE INDEX idx_notification_read ON notification(parent_id, read);
CREATE INDEX idx_notification_created ON notification(created_at);
