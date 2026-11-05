-- 003_physics_parts_and_get_section.sql: Update get_section to return book_title, book_part, chapter_number, chapter_title

DROP FUNCTION IF EXISTS get_section(uuid, text);

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
    token_count int,
    book_title text,
    book_part text,
    chapter_number int,
    chapter_title text
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
        b.title AS book_title,
        b.part AS book_part,
        ch.number AS chapter_number,
        ch.title AS chapter_title
    FROM chunks c
    JOIN chapters ch ON c.chapter_id = ch.id
    JOIN books b ON c.book_id = b.id
    WHERE c.chapter_id = p_chapter_id
      AND (
          c.section_title = p_section_title
          OR c.section_title ILIKE p_section_title || '%'
          OR c.section_title ILIKE '%' || p_section_title || '%'
      )
    ORDER BY c.page_number ASC, c.chunk_index ASC;
END;
$$;
