"""Final Audit and Semantic Search Verification for Dumroo RAG."""

import sys
import os
sys.path.insert(0, os.path.abspath("."))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from ingest.config import get_supabase_client, EMBED_MODEL, EMBED_DIM
from ingest.embeddings import generate_embeddings_batch

def embed_query_text(query: str):
    return generate_embeddings_batch([query], task_type="RETRIEVAL_QUERY")[0]

def run_audit():
    client = get_supabase_client()
    print("=" * 80)
    print("DUMROO RAG: FINAL COMPREHENSIVE AUDIT REPORT")
    print(f"Embedding Model: {EMBED_MODEL} | Dimensions: {EMBED_DIM}")
    print("=" * 80)

    subjects = client.table("subjects").select("*").order("name").execute().data

    total_chapters_all = 0
    total_pages_all = 0
    total_chunks_all = 0
    total_page_images_all = 0
    total_embedded_images_all = 0
    total_duplicate_chunks_all = 0

    print("\n--- PER SUBJECT & BOOK BREAKDOWN ---")
    for sub in subjects:
        sub_name = sub["name"]
        books = client.table("books").select("*").eq("subject_id", sub["id"]).order("part", nullsfirst=False).execute().data

        for b in books:
            book_id = b["id"]
            title = b["title"]
            part = b.get("part") or "N/A"

            # Chapters
            chaps = client.table("chapters").select("id, number, start_page, end_page").eq("book_id", book_id).order("number").execute().data
            ch_count = len(chaps)
            total_chapters_all += ch_count

            # Pages count
            book_pages = sum((ch["end_page"] - ch["start_page"] + 1) for ch in chaps)
            total_pages_all += book_pages

            # Chunks count
            chunk_res = client.table("chunks").select("id", count="exact").eq("book_id", book_id).execute()
            chunk_count = chunk_res.count or 0
            total_chunks_all += chunk_count

            # Page images count
            pi_res = client.table("page_images").select("id", count="exact").eq("book_id", book_id).execute()
            pi_count = pi_res.count or 0
            total_page_images_all += pi_count

            # Embedded images count
            img_res = client.table("images").select("id", count="exact").eq("book_id", book_id).execute()
            img_count = img_res.count or 0
            total_embedded_images_all += img_count

            # Duplicate chunks check (within this book)
            # Fetch all (chapter_id, chunk_index) and (chapter_id, content)
            all_chunks = client.table("chunks").select("chapter_id, chunk_index, content").eq("book_id", book_id).execute().data
            seen_index = set()
            index_dupes = 0
            seen_content = set()
            content_dupes = 0

            for c in all_chunks:
                idx_key = (c["chapter_id"], c["chunk_index"])
                if idx_key in seen_index:
                    index_dupes += 1
                seen_index.add(idx_key)

                cnt_key = (c["chapter_id"], c["content"][:100])
                if cnt_key in seen_content:
                    content_dupes += 1
                seen_content.add(cnt_key)

            total_dupes = max(index_dupes, content_dupes)
            total_duplicate_chunks_all += total_dupes

            print(f"\nSubject: {sub_name.upper()} | Book: '{title}' | Part: {part}")
            print(f"  Book ID:          {book_id}")
            print(f"  Chapters:         {ch_count}")
            print(f"  Total Pages:      {book_pages}")
            print(f"  Chunks:           {chunk_count}")
            print(f"  Page Images:      {pi_count} (Coverage: {pi_count}/{book_pages})")
            print(f"  Embedded Images:  {img_count}")
            print(f"  Duplicate Chunks: {total_dupes} (index dupes: {index_dupes}, content dupes: {content_dupes})")

    print("\n" + "=" * 80)
    print("TOTALS ACROSS ALL SUBJECTS:")
    print(f"  Total Subjects:        {len(subjects)}")
    print(f"  Total Chapters:        {total_chapters_all}")
    print(f"  Total Textbook Pages:  {total_pages_all}")
    print(f"  Total Text Chunks:     {total_chunks_all}")
    print(f"  Total Full-Page JPEGs: {total_page_images_all}")
    print(f"  Total Embedded PNGs:   {total_embedded_images_all}")
    print(f"  Total Duplicates:      {total_duplicate_chunks_all}")
    print("=" * 80)

    # SEMANTIC SEARCH TESTS
    test_queries = [
        {"subject": "physics", "query": "Newton's second law", "expected": "Ch 4 (Laws of Motion, Part 1)"},
        {"subject": "chemistry", "query": "mole concept", "expected": "Ch 1 (Some Basic Concepts of Chemistry, Part 1)"},
        {"subject": "biology", "query": "photosynthesis", "expected": "Ch 11 (Photosynthesis in Higher Plants)"},
        {"subject": "maths", "query": "binomial theorem", "expected": "Ch 7 (Binomial Theorem)"},
        {"subject": "history", "query": "Genghis Khan", "expected": "Ch 5 (Nomadic Empires)"},
    ]

    print("\n" + "=" * 80)
    print("SEMANTIC SEARCH VERIFICATION TESTS (Top 3 Hits per Subject)")
    print("=" * 80)

    for item in test_queries:
        query = item["query"]
        expected = item["expected"]
        subj = item["subject"]
        print(f"\nQuery: \"{query}\" [Expected: {expected}]")
        print("-" * 70)

        # Get subject ID
        sub_info = client.table("subjects").select("id").eq("name", subj).execute().data
        sub_id = sub_info[0]["id"] if sub_info else None

        emb = embed_query_text(query)
        hits = client.rpc("match_chunks", {
            "query_embedding": emb,
            "subject_ids": [sub_id] if sub_id else None,
            "k": 3
        }).execute().data

        for rank, hit in enumerate(hits, start=1):
            sim = hit.get("similarity", 0.0)
            b_title = hit.get("book_title")
            b_part = hit.get("book_part") or "N/A"
            ch_num = hit.get("chapter_number")
            ch_title = hit.get("chapter_title")
            p_start = hit.get("page_number")
            p_end = hit.get("page_end")
            snippet = hit.get("content", "").replace("\n", " ")[:110]
            sec_title = hit.get("section_title", "")

            citation = f"{b_title}"
            if b_part and b_part != "N/A":
                citation += f" {b_part}"
            citation += f", Ch {ch_num} ({ch_title}), p. {p_start}"

            print(f"  Hit {rank} (Sim: {sim:.4f}) | {citation}")
            print(f"    Section: {sec_title}")
            print(f"    Snippet: \"{snippet}...\"")

if __name__ == "__main__":
    run_audit()
