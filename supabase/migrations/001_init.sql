-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Subjects table
CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE
);

-- 2. Books table
CREATE TABLE IF NOT EXISTS books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    part TEXT NULL,
    source TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Chapters table
CREATE TABLE IF NOT EXISTS chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    number INT NOT NULL,
    title TEXT NOT NULL,
    start_page INT NOT NULL,
    end_page INT NOT NULL
);

-- 4. Chunks table
CREATE TABLE IF NOT EXISTS chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    page_number INT NOT NULL,
    page_end INT NOT NULL,
    section_title TEXT NOT NULL,
    content TEXT NOT NULL,
    chunk_index INT NOT NULL,
    token_count INT NOT NULL,
    embedding vector(768),
    CONSTRAINT unique_chapter_chunk_index UNIQUE (chapter_id, chunk_index)
);

-- 5. Images table (embedded diagrams)
CREATE TABLE IF NOT EXISTS images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    page_number INT NOT NULL,
    storage_path TEXT NOT NULL,
    width INT NOT NULL,
    height INT NOT NULL
);

-- 6. Page images table (rendered full pages for vector drawings / formulas)
CREATE TABLE IF NOT EXISTS page_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    page_number INT NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT unique_book_page_image UNIQUE (book_id, page_number)
);

-- Indexes
-- HNSW index on chunk embeddings using cosine distance
CREATE INDEX IF NOT EXISTS idx_chunks_embedding 
ON chunks USING hnsw (embedding vector_cosine_ops);

-- BTree index on chunks for section and page queries
CREATE INDEX IF NOT EXISTS idx_chunks_chapter_section_page 
ON chunks (chapter_id, section_title, page_number);

-- BTree index on images for book and page queries
CREATE INDEX IF NOT EXISTS idx_images_book_page 
ON images (book_id, page_number);

-- BTree index on page_images for book and page queries
CREATE INDEX IF NOT EXISTS idx_page_images_book_page 
ON page_images (book_id, page_number);

-- Auxiliary indexes for foreign keys
CREATE INDEX IF NOT EXISTS idx_books_subject_id ON books(subject_id);
CREATE INDEX IF NOT EXISTS idx_chapters_book_id ON chapters(book_id);
CREATE INDEX IF NOT EXISTS idx_chunks_book_id ON chunks(book_id);
CREATE INDEX IF NOT EXISTS idx_images_chapter_id ON images(chapter_id);

-- Functions

-- 1. match_chunks
-- Searches chunks matching query embedding, filtered by subjects (if given), ordered by cosine distance
CREATE OR REPLACE FUNCTION match_chunks (
    query_embedding vector(768),
    subject_ids uuid[] DEFAULT NULL,
    k int DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    book_id uuid,
    chapter_id uuid,
    page_number int,
    page_end int,
    section_title text,
    content text,
    chunk_index int,
    token_count int,
    chapter_number int,
    chapter_title text,
    book_title text,
    book_part text,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.book_id,
        c.chapter_id,
        c.page_number,
        c.page_end,
        c.section_title,
        c.content,
        c.chunk_index,
        c.token_count,
        ch.number AS chapter_number,
        ch.title AS chapter_title,
        b.title AS book_title,
        b.part AS book_part,
        (1 - (c.embedding <=> query_embedding))::float AS similarity
    FROM chunks c
    JOIN chapters ch ON c.chapter_id = ch.id
    JOIN books b ON c.book_id = b.id
    WHERE (subject_ids IS NULL OR array_length(subject_ids, 1) IS NULL OR b.subject_id = ANY(subject_ids))
    ORDER BY c.embedding <=> query_embedding
    LIMIT k;
END;
$$;

-- 2. get_section
-- Returns all chunks of a specific section in order of page_number and chunk_index
CREATE OR REPLACE FUNCTION get_section(
    p_chapter_id uuid,
    p_section_title text
)
RETURNS TABLE (
    id uuid,
    book_id uuid,
    chapter_id uuid,
    page_number int,
    page_end int,
    section_title text,
    content text,
    chunk_index int,
    token_count int
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.book_id,
        c.chapter_id,
        c.page_number,
        c.page_end,
        c.section_title,
        c.content,
        c.chunk_index,
        c.token_count
    FROM chunks c
    WHERE c.chapter_id = p_chapter_id
      AND c.section_title = p_section_title
    ORDER BY c.page_number ASC, c.chunk_index ASC;
END;
$$;

-- 3. get_chapter_pages
-- Returns chunks within a page range in order
CREATE OR REPLACE FUNCTION get_chapter_pages(
    p_chapter_id uuid,
    p_from int,
    p_to int
)
RETURNS TABLE (
    id uuid,
    book_id uuid,
    chapter_id uuid,
    page_number int,
    page_end int,
    section_title text,
    content text,
    chunk_index int,
    token_count int
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.book_id,
        c.chapter_id,
        c.page_number,
        c.page_end,
        c.section_title,
        c.content,
        c.chunk_index,
        c.token_count
    FROM chunks c
    WHERE c.chapter_id = p_chapter_id
      AND c.page_number >= p_from
      AND c.page_number <= p_to
    ORDER BY c.page_number ASC, c.chunk_index ASC;
END;
$$;
