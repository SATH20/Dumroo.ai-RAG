"""Verification report generation: metrics, sample inspection, test search, and section integrity."""

import sys
import random
import logging
from typing import Any, Dict, List, Optional
from ingest.config import EMBED_MODEL, EMBED_DIM
from ingest.pdf_extractor import calculate_quality_score
from ingest.embeddings import embed_query
from ingest.db import call_match_chunks, call_get_section

logger = logging.getLogger("ingest.report")


def generate_verification_report(
    subject: str,
    stats: Dict[str, Any],
    all_chunks: List[Dict[str, Any]],
    chapters: List[Dict[str, Any]],
    dry_run: bool = False,
    subject_id: Optional[str] = None,
) -> str:
    """Generate and print the Step 9 Verification Report."""
    lines = []
    separator = "=" * 70
    lines.append("\n" + separator)
    lines.append(f"  VERIFICATION REPORT: {subject.upper()} {'(DRY-RUN)' if dry_run else '(LIVE INGESTION)'}")
    lines.append(separator)

    # 1. Processing metrics
    pages_read = stats.get("pages_read", 0)
    pages_skipped = stats.get("pages_skipped", 0)
    pages_ocr = stats.get("pages_ocr", 0)
    chunk_count = len(all_chunks)
    avg_tokens = (
        round(sum(c.get("token_count", 0) for c in all_chunks) / max(1, chunk_count), 1)
        if chunk_count > 0
        else 0
    )
    image_count = stats.get("image_count", 0)
    page_images_count = stats.get("page_images_count", 0)

    lines.append(f"Pages Read:       {pages_read}")
    lines.append(f"Pages Skipped:    {pages_skipped}")
    lines.append(f"Pages OCR'd:      {pages_ocr}")
    lines.append(f"Total Chunks:     {chunk_count}")
    lines.append(f"Average Tokens:   {avg_tokens}")
    lines.append(f"Embedded Images:  {image_count}")
    lines.append(f"Full Page Images: {page_images_count}")
    lines.append(f"Embedding Model:  {EMBED_MODEL}")
    lines.append(f"Vector Dimension: {EMBED_DIM}")
    lines.append("-" * 70)

    # 2. Chapters summary
    lines.append("CHAPTERS DETECTED:")
    for ch in chapters:
        ch_num = ch.get("number")
        ch_title = ch.get("title")
        p_start = ch.get("start_page")
        p_end = ch.get("end_page")
        lines.append(f"  • Chapter {ch_num:02d}: \"{ch_title}\" (Pages {p_start} - {p_end})")
    lines.append("-" * 70)

    # 3. 5 Random Chunks Inspection
    lines.append("5 RANDOM CHUNKS SAMPLE (Garble Inspection):")
    if all_chunks:
        sample_size = min(5, len(all_chunks))
        sample_chunks = random.sample(all_chunks, sample_size)
        for i, c in enumerate(sample_chunks, 1):
            content = c.get("content", "")
            preview = content[:200].replace("\n", " ") + ("..." if len(content) > 200 else "")
            q_score = calculate_quality_score(content)
            garble_flag = " [FLAG: GARBLED TEXT DETECTED]" if q_score < 0.5 else " [OK: Clean]"

            lines.append(f"  [{i}] Ch {c.get('chapter_number', '?')} | Sec: \"{c.get('section_title', '?')}\" | Page {c.get('page_number', '?')}{garble_flag}")
            lines.append(f"      \"{preview}\"")
    else:
        lines.append("  (No chunks available)")
    lines.append("-" * 70)

    # 4. Section Retrieval Integrity Check
    lines.append("SECTION INTEGRITY TEST (get_section):")
    target_sec_title = None
    target_chapter_id = None
    target_ch_num = None

    # Prefer '6.4 Combinations' if Chapter 6 exists
    for ch in chapters:
        if ch.get("number") == 6:
            for c in all_chunks:
                if c.get("chapter_number") == 6 and "Combinations" in c.get("section_title", ""):
                    target_sec_title = c.get("section_title")
                    target_chapter_id = ch.get("id")
                    target_ch_num = 6
                    break
        if target_sec_title:
            break

    # Otherwise choose section with most chunks
    if not target_sec_title:
        from collections import Counter
        sec_counts = Counter(c.get("section_title") for c in all_chunks if c.get("section_title"))
        if sec_counts:
            target_sec_title, _ = sec_counts.most_common(1)[0]
            for c in all_chunks:
                if c.get("section_title") == target_sec_title:
                    target_ch_num = c.get("chapter_number")
                    break
            for ch in chapters:
                if ch.get("number") == target_ch_num:
                    target_chapter_id = ch.get("id")
                    break

    if target_sec_title:
        if not dry_run and target_chapter_id:
            try:
                retrieved_chunks = call_get_section(target_chapter_id, target_sec_title)
                lines.append(f"  Target Section: \"{target_sec_title}\" (Chapter {target_ch_num})")
                lines.append(f"  Retrieved {len(retrieved_chunks)} chunk(s) in order:")
                for r in retrieved_chunks:
                    snippet = r.get("content", "")[:90].replace("\n", " ") + "..."
                    lines.append(f"    • Chunk idx {r.get('chunk_index')} | Page {r.get('page_number')} | Tokens {r.get('token_count')}")
                    lines.append(f"      \"{snippet}\"")
            except Exception as e:
                lines.append(f"  Error calling get_section in DB: {e}")
        else:
            in_mem = [c for c in all_chunks if c.get("section_title") == target_sec_title]
            in_mem.sort(key=lambda x: (x.get("page_number", 0), x.get("chunk_index", 0)))
            lines.append(f"  Simulated get_section for \"{target_sec_title}\":")
            lines.append(f"  Found {len(in_mem)} chunk(s) in order:")
            for r in in_mem:
                snippet = r.get("content", "")[:90].replace("\n", " ") + "..."
                lines.append(f"    • Chunk idx {r.get('chunk_index')} | Page {r.get('page_number')} | Tokens {r.get('token_count')}")
                lines.append(f"      \"{snippet}\"")
    else:
        lines.append("  (No sections found for testing)")
    lines.append("-" * 70)

    # 5. Targeted Semantic Search Verification Tests
    lines.append("SEMANTIC SEARCH VERIFICATION TESTS:")
    subject_tests_map = {
        "maths": [
            {"query": "what is a set", "expected": 1, "label": "Expected: Chapter 1"},
            {"query": "binomial theorem for positive integers", "expected": 7, "label": "Expected: Chapter 7"},
            {"query": "probability of an event", "expected": 14, "label": "Expected: Chapter 14"},
        ],
        "physics": [
            {"query": "Newton's second law", "expected": 4, "label": "Expected: Chapter 4 (Laws of Motion)"},
            {"query": "kinetic energy", "expected": 5, "label": "Expected: Chapter 5 (Work, Energy and Power)"},
            {"query": "projectile motion", "expected": 3, "label": "Expected: Chapter 3 (Motion in a Plane)"},
        ],
        "chemistry": [
            {"query": "mole concept", "expected": 1, "label": "Expected: Chapter 1 (Some Basic Concepts of Chemistry)"},
            {"query": "hybridisation", "expected": 4, "label": "Expected: Chapter 4 (Chemical Bonding and Molecular Structure)"},
            {"query": "ideal gas equation", "expected": 5, "label": "Expected: Chapter 5 or Chapter 1"},
        ],
        "biology": [
            {"query": "photosynthesis", "expected": 11, "label": "Expected: Chapter 11 (Photosynthesis in Higher Plants)"},
            {"query": "cell cycle", "expected": 10, "label": "Expected: Chapter 10 (Cell Cycle and Cell Division)"},
            {"query": "digestion", "expected": 14, "label": "Expected: Chapter 14 or 15"},
        ],
        "history": [
            {"query": "writing and city life mesopotamia", "expected": 2, "label": "Expected: Chapter 2 (Writing and City Life)"},
            {"query": "Roman empire across three continents", "expected": 3, "label": "Expected: Chapter 3 (An Empire Across Three Continents)"},
            {"query": "nomadic empires Genghis Khan", "expected": 5, "label": "Expected: Chapter 5 (Nomadic Empires)"},
        ],
    }

    test_queries = subject_tests_map.get(
        subject.lower(),
        [{"query": "main idea of chapter 1", "expected": 1, "label": "Expected: Chapter 1"}]
    )

    if not dry_run and subject_id:
        for tq in test_queries:
            query = tq["query"]
            expected_ch = tq["expected"]
            label = tq["label"]
            lines.append(f"  Query: \"{query}\" ({label})")
            try:
                q_emb = embed_query(query)
                matches = call_match_chunks(q_emb, subject_ids=[subject_id], k=5)
                if matches:
                    # Check for duplicate chunks in top 5
                    seen_c_ids = set()
                    has_dups = False
                    for m in matches:
                        cid = m.get("id") or m.get("content")
                        if cid in seen_c_ids:
                            has_dups = True
                            break
                        seen_c_ids.add(cid)
                    dup_status = "[FAIL: Duplicates Found]" if has_dups else "[PASS: 0 Duplicates in Top-5]"
                    lines.append(f"    Status: {dup_status}")

                    for rank, m in enumerate(matches[:3], 1):
                        sim = m.get("similarity", 0.0)
                        ch_num = m.get("chapter_number")
                        p_num = m.get("page_number")
                        snippet = m.get("content", "")[:110].replace("\n", " ") + "..."
                        match_flag = " (MATCH)" if ch_num == expected_ch else ""
                        lines.append(f"    [{rank}] Sim: {sim:.4f} | Ch {ch_num}{match_flag} | Page {p_num}")
                        lines.append(f"        \"{snippet}\"")
                else:
                    lines.append("    No matches returned.")
            except Exception as e:
                lines.append(f"    Error querying '{query}': {e}")
            lines.append("")
    else:
        lines.append("  (Dry-run mode: semantic search queries will run on live ingestion)")

    lines.append(separator + "\n")
    report_text = "\n".join(lines)
    
    # Safe terminal print for Windows consoles
    try:
        print(report_text)
    except UnicodeEncodeError:
        try:
            sys.stdout.buffer.write(report_text.encode("utf-8", errors="replace") + b"\n")
            sys.stdout.flush()
        except Exception:
            print(report_text.encode("ascii", errors="replace").decode("ascii"))

    return report_text
