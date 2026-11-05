-- 002_fixes.sql: Add unique constraint on chunks, create page_images table, and update get_section

-- 1. Unique constraint on chunks(chapter_id, chunk_index) for idempotency and upserts
ALTER TABLE chunks
  ADD CONSTRAINT unique_chapter_chunk_index UNIQUE (chapter_id, chunk_index);

-- 2. Page images table for rendered 110 DPI full page drawings/formulas
CREATE TABLE IF NOT EXISTS page_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  page_number int NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_book_page_image UNIQUE (book_id, page_number)
);

-- Index on page_images for fast lookup
CREATE INDEX IF NOT EXISTS idx_page_images_book_page ON page_images(book_id, page_number);

-- 3. Resilient get_section matching exact, prefix or substring
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
      AND (
          c.section_title = p_section_title
          OR c.section_title ILIKE p_section_title || '%'
          OR c.section_title ILIKE '%' || p_section_title || '%'
      )
    ORDER BY c.page_number ASC, c.chunk_index ASC;
END;
$$;
