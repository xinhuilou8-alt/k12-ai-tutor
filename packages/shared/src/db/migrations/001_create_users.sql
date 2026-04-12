-- Migration 001: Create Parent and Child tables
-- Requirements: 1.3, 25.1

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE parent (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    child_ids UUID[] NOT NULL DEFAULT '{}',
    notification_preferences JSONB NOT NULL DEFAULT '{
        "pushEnabled": true,
        "taskCompletionNotify": true,
        "alertNotify": true,
        "weeklyReportNotify": true
    }',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE child (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    grade SMALLINT NOT NULL CHECK (grade BETWEEN 3 AND 6),
    school VARCHAR(200),
    parent_ids UUID[] NOT NULL DEFAULT '{}',
    curriculum_bindings JSONB NOT NULL DEFAULT '[]',
    settings JSONB NOT NULL DEFAULT '{
        "ttsSpeed": "normal",
        "dailyTimeLimitMinutes": 45,
        "studyTimeSlots": [],
        "interactionStyle": "standard"
    }',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_child_grade ON child(grade);
CREATE INDEX idx_child_parent_ids ON child USING GIN(parent_ids);
