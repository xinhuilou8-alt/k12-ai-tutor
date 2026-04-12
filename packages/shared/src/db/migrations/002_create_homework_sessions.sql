-- Migration 002: Create HomeworkSession and SessionStep tables
-- Requirements: 1.3

CREATE TABLE homework_session (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id UUID NOT NULL REFERENCES child(id) ON DELETE CASCADE,
    subject_type VARCHAR(20) NOT NULL CHECK (subject_type IN ('chinese', 'math', 'english')),
    homework_type VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'paused')),
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    summary JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE session_step (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES homework_session(id) ON DELETE CASCADE,
    step_type VARCHAR(20) NOT NULL CHECK (step_type IN ('question', 'guidance', 'correction', 'review')),
    question JSONB,
    child_answer TEXT,
    grade_result JSONB,
    guidance_history JSONB NOT NULL DEFAULT '[]',
    knowledge_point_ids TEXT[] NOT NULL DEFAULT '{}',
    bloom_level VARCHAR(20) NOT NULL CHECK (bloom_level IN ('remember', 'understand', 'apply', 'analyze', 'evaluate', 'create')),
    duration INTEGER NOT NULL DEFAULT 0,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_homework_session_child ON homework_session(child_id);
CREATE INDEX idx_homework_session_status ON homework_session(status);
CREATE INDEX idx_homework_session_subject ON homework_session(subject_type);
CREATE INDEX idx_homework_session_start ON homework_session(start_time);
CREATE INDEX idx_session_step_session ON session_step(session_id);
CREATE INDEX idx_session_step_knowledge ON session_step USING GIN(knowledge_point_ids);
