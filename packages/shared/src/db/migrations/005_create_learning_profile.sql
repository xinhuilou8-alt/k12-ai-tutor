-- Migration 005: Create LearningProfile and MasteryRecord tables
-- Requirements: 25.1

CREATE TABLE learning_profile (
    child_id UUID PRIMARY KEY REFERENCES child(id) ON DELETE CASCADE,
    subject_profiles JSONB NOT NULL DEFAULT '{}',
    learning_habits JSONB NOT NULL DEFAULT '{
        "averageSessionDuration": 0,
        "preferredStudyTime": "",
        "consistencyScore": 0,
        "helpRequestFrequency": 0
    }',
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mastery_record (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id UUID NOT NULL REFERENCES child(id) ON DELETE CASCADE,
    knowledge_point_id VARCHAR(100) NOT NULL,
    mastery_level REAL NOT NULL DEFAULT 0 CHECK (mastery_level BETWEEN 0 AND 100),
    bloom_mastery JSONB NOT NULL DEFAULT '{
        "remember": 0,
        "understand": 0,
        "apply": 0,
        "analyze": 0,
        "evaluate": 0,
        "create": 0
    }',
    total_attempts INTEGER NOT NULL DEFAULT 0,
    correct_attempts INTEGER NOT NULL DEFAULT 0,
    recent_accuracy_trend REAL[] NOT NULL DEFAULT '{}',
    last_practice_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(child_id, knowledge_point_id)
);

CREATE INDEX idx_mastery_record_child ON mastery_record(child_id);
CREATE INDEX idx_mastery_record_kp ON mastery_record(knowledge_point_id);
CREATE INDEX idx_mastery_record_level ON mastery_record(mastery_level);
