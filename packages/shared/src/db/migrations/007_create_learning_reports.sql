-- Migration 007: Create LearningReport table
-- Requirements: 25.1

CREATE TABLE learning_report (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id UUID NOT NULL REFERENCES child(id) ON DELETE CASCADE,
    report_type VARCHAR(10) NOT NULL CHECK (report_type IN ('weekly', 'monthly')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    study_time_summary JSONB NOT NULL DEFAULT '{}',
    progress_summary JSONB NOT NULL DEFAULT '{}',
    weak_point_analysis JSONB NOT NULL DEFAULT '{}',
    parent_friendly_narrative TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_learning_report_child ON learning_report(child_id);
CREATE INDEX idx_learning_report_type ON learning_report(report_type);
CREATE INDEX idx_learning_report_period ON learning_report(child_id, period_start, period_end);
