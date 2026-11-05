-- 004_query_logs.sql: Create query_logs table for logging search queries and answers

CREATE TABLE IF NOT EXISTS query_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    query TEXT NOT NULL,
    chapter_ids UUID[] DEFAULT '{}',
    section_titles TEXT[] DEFAULT '{}',
    answered BOOLEAN NOT NULL DEFAULT false,
    top_similarity FLOAT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_query_logs_created_at ON query_logs(created_at DESC);
