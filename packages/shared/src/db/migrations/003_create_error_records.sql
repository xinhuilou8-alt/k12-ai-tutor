-- Migration 003: Create ErrorRecord table
-- Requirements: 17.2

CREATE TABLE error_record (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id UUID NOT NULL REFERENCES child(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES homework_session(id) ON DELETE CASCADE,
    question JSONB NOT NULL,
    child_answer TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    error_type VARCHAR(100) NOT NULL,
    surface_knowledge_point_id VARCHAR(100) NOT NULL,
    root_cause_knowledge_point_id VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'mastered')),
    consecutive_correct INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_reviewed_at TIMESTAMPTZ
);

CREATE INDEX idx_error_record_child ON error_record(child_id);
CREATE INDEX idx_error_record_session ON error_record(session_id);
CREATE INDEX idx_error_record_status ON error_record(status);
CREATE INDEX idx_error_record_surface_kp ON error_record(surface_knowledge_point_id);
CREATE INDEX idx_error_record_root_kp ON error_record(root_cause_knowledge_point_id);
CREATE INDEX idx_error_record_created ON error_record(created_at);
