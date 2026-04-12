// Neo4j Knowledge Graph Schema Setup
// Requirements: 1.3, 17.2, 20.1

// ===== Constraints =====

// Unique constraint on KnowledgePoint id
CREATE CONSTRAINT knowledge_point_id_unique IF NOT EXISTS
FOR (kp:KnowledgePoint) REQUIRE kp.id IS UNIQUE;

// Unique constraint on Subject name
CREATE CONSTRAINT subject_name_unique IF NOT EXISTS
FOR (s:Subject) REQUIRE s.name IS UNIQUE;

// ===== Indexes =====

// Index for fast lookup by subject
CREATE INDEX knowledge_point_subject_idx IF NOT EXISTS
FOR (kp:KnowledgePoint) ON (kp.subject);

// Index for fast lookup by grade
CREATE INDEX knowledge_point_grade_idx IF NOT EXISTS
FOR (kp:KnowledgePoint) ON (kp.grade);

// Index for fast lookup by category
CREATE INDEX knowledge_point_category_idx IF NOT EXISTS
FOR (kp:KnowledgePoint) ON (kp.category);

// Composite index for subject + grade queries
CREATE INDEX knowledge_point_subject_grade_idx IF NOT EXISTS
FOR (kp:KnowledgePoint) ON (kp.subject, kp.grade);

// Index for difficulty-based queries
CREATE INDEX knowledge_point_difficulty_idx IF NOT EXISTS
FOR (kp:KnowledgePoint) ON (kp.difficulty);
