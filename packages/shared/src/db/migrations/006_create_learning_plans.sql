-- Migration 006: Create LearningPlan and PlannedTask tables
-- Requirements: 20.1

CREATE TABLE learning_plan (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id UUID NOT NULL REFERENCES child(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    estimated_duration INTEGER NOT NULL CHECK (estimated_duration <= 45),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(child_id, date)
);

CREATE TABLE planned_task (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID NOT NULL REFERENCES learning_plan(id) ON DELETE CASCADE,
    task_type VARCHAR(30) NOT NULL CHECK (task_type IN ('review', 'new_learning', 'error_correction', 'deliberate_practice', 'feynman', 'pbl')),
    subject VARCHAR(20) NOT NULL,
    knowledge_point_ids TEXT[] NOT NULL DEFAULT '{}',
    estimated_duration INTEGER NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    bloom_target_level VARCHAR(20) NOT NULL CHECK (bloom_target_level IN ('remember', 'understand', 'apply', 'analyze', 'evaluate', 'create')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_learning_plan_child ON learning_plan(child_id);
CREATE INDEX idx_learning_plan_date ON learning_plan(child_id, date);
CREATE INDEX idx_learning_plan_status ON learning_plan(status);
CREATE INDEX idx_planned_task_plan ON planned_task(plan_id);
