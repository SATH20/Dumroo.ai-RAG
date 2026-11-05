"""Database operations with Supabase: idempotent subject upsert/delete, batch inserts, RPC calls."""

import logging
from typing import Any, Dict, List, Optional
from ingest.config import STORAGE_BUCKET, get_supabase_client

logger = logging.getLogger("ingest.db")


def check_subject_exists(subject_name: str) -> Optional[str]:
    """Check if subject already exists in Supabase. Returns subject UUID if found, else None."""
    client = get_supabase_client()
    res = client.table("subjects").select("id").eq("name", subject_name.lower()).execute()
    if res.data and len(res.data) > 0:
        return res.data[0]["id"]
    return None


def delete_subject_data(subject_name: str) -> None:
    """
    Delete a subject and all associated books, chapters, chunks, images via CASCADE.
    Also deletes any images in the textbook-images storage bucket for this subject.
    """
    client = get_supabase_client()
    subject_id = check_subject_exists(subject_name)
    if subject_id:
        logger.info(f"Deleting existing database records for subject '{subject_name}' (ID: {subject_id})...")
        client.table("subjects").delete().eq("id", subject_id).execute()

    # Clean up Storage bucket files
    try:
        bucket = client.storage.from_(STORAGE_BUCKET)
        files = bucket.list(subject_name)
        if files:
            paths_to_remove = []
            for item in files:
                name = item.get("name")
                if not name:
                    continue
                # If directory (e.g. ch01), list its files
                if item.get("id") is None:  # folder
                    sub_files = bucket.list(f"{subject_name}/{name}")
                    for sf in sub_files:
                        if sf.get("name"):
                            paths_to_remove.append(f"{subject_name}/{name}/{sf['name']}")
                else:
                    paths_to_remove.append(f"{subject_name}/{name}")

            if paths_to_remove:
                logger.info(f"Removing {len(paths_to_remove)} existing images from Storage bucket for '{subject_name}'...")
                bucket.remove(paths_to_remove)
    except Exception as e:
        logger.warning(f"Error while cleaning up storage bucket for {subject_name}: {e}")


def insert_subject(subject_name: str) -> str:
    """Insert subject or retrieve existing subject ID."""
    client = get_supabase_client()
    existing_id = check_subject_exists(subject_name)
    if existing_id:
        return existing_id

    res = client.table("subjects").insert({"name": subject_name.lower()}).execute()
    if not res.data:
        raise ValueError(f"Failed to insert subject '{subject_name}'")
    return res.data[0]["id"]


def insert_book(subject_id: str, title: str, part: Optional[str], source: Optional[str] = None) -> str:
    """Insert book row and return its ID."""
    client = get_supabase_client()
    data = {
        "subject_id": subject_id,
        "title": title,
        "part": part,
        "source": source,
    }
    res = client.table("books").insert(data).execute()
    if not res.data:
        raise ValueError(f"Failed to insert book '{title}'")
    return res.data[0]["id"]


def insert_chapter(book_id: str, number: int, title: str, start_page: int, end_page: int) -> str:
    """Insert chapter row and return its ID."""
    client = get_supabase_client()
    data = {
        "book_id": book_id,
        "number": number,
        "title": title,
        "start_page": start_page,
        "end_page": end_page,
    }
    res = client.table("chapters").insert(data).execute()
    if not res.data:
        raise ValueError(f"Failed to insert chapter {number}: '{title}'")
    return res.data[0]["id"]


def insert_chunks_batch(chunk_rows: List[Dict[str, Any]], batch_size: int = 200) -> None:
    """Insert or upsert chunks in batches of up to 200, keyed on (chapter_id, chunk_index)."""
    if not chunk_rows:
        return

    client = get_supabase_client()
    total = len(chunk_rows)

    # Sanitize null bytes that Postgres rejects (error 22P05)
    for row in chunk_rows:
        for k, v in row.items():
            if isinstance(v, str):
                row[k] = v.replace("\x00", "").replace("\u0000", "")

    for i in range(0, total, batch_size):
        batch = chunk_rows[i : i + batch_size]
        client.table("chunks").upsert(batch, on_conflict="chapter_id,chunk_index").execute()


def insert_images_batch(image_rows: List[Dict[str, Any]], batch_size: int = 200) -> None:
    """Insert images in batches of up to 200."""
    if not image_rows:
        return

    client = get_supabase_client()
    total = len(image_rows)

    for i in range(0, total, batch_size):
        batch = image_rows[i : i + batch_size]
        client.table("images").insert(batch).execute()


def insert_page_images_batch(page_image_rows: List[Dict[str, Any]], batch_size: int = 200) -> None:
    """Insert or upsert full-page rendered images in batches of up to 200."""
    if not page_image_rows:
        return

    client = get_supabase_client()
    total = len(page_image_rows)

    for i in range(0, total, batch_size):
        batch = page_image_rows[i : i + batch_size]
        client.table("page_images").upsert(batch, on_conflict="book_id,page_number").execute()


def call_match_chunks(query_embedding: List[float], subject_ids: Optional[List[str]] = None, k: int = 3) -> List[dict]:
    """Call the match_chunks stored procedure."""
    client = get_supabase_client()
    params = {
        "query_embedding": query_embedding,
        "subject_ids": subject_ids if subject_ids else None,
        "k": k,
    }
    res = client.rpc("match_chunks", params).execute()
    return res.data or []


def call_get_section(chapter_id: str, section_title: str) -> List[dict]:
    """Call the get_section stored procedure."""
    client = get_supabase_client()
    params = {
        "p_chapter_id": chapter_id,
        "p_section_title": section_title,
    }
    res = client.rpc("get_section", params).execute()
    return res.data or []


def call_get_chapter_pages(chapter_id: str, p_from: int, p_to: int) -> List[dict]:
    """Call the get_chapter_pages stored procedure."""
    client = get_supabase_client()
    params = {
        "p_chapter_id": chapter_id,
        "p_from": p_from,
        "p_to": p_to,
    }
    res = client.rpc("get_chapter_pages", params).execute()
    return res.data or []
