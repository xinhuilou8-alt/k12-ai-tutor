-- Migration 004: Create ReviewItem table (SM-2 spaced repetition)
-- Requirements: 17.2, 20.1

CREATE TABLE review_item (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id UUID NOT NULL REFERENCES child(id) ON DELETE CASCADE,
    content_type VARCHAR(30) NOT NULL CHECK (content_type IN ('character', 'word', 'poetry', 'formula', 'concept', 'error_variant')),
    content TEXT NOT NULL,
    reference_answer TEXT NOT NULL,
    source_error_id UUID REFERENCES error_record(id) ON DELETE SET NULL,
    knowledge_point_id VARCHAR(100) NOT NULL,
    -- SM-2 algorithm parameters
    repetition_count INTEGER NOT NULL DEFAULT 0,
    ease_factor REAL NOT NULL DEFAULT 2.5,
    interval_days INTEGER NOT NULL DEFAULT 1,
    next_review_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_review_date DATE,
    last_difficulty VARCHAR(10) CHECK (last_difficulty IN ('easy', 'medium', 'hard')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_item_child ON review_item(child_id);
CREATE INDEX idx_review_item_next_review ON review_item(child_id, next_review_date);
CREATE INDEX idx_review_item_knowledge ON review_item(knowledge_point_id);
CREATE INDEX idx_review_item_content_type ON review_item(content_type);
