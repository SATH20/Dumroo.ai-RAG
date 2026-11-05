"""Main CLI ingestion orchestrator for NCERT textbooks into Supabase."""

import sys
import json
import logging
import argparse
from pathlib import Path
from typing import Any, Dict, List, Optional
import fitz

from ingest.config import (
    DATA_DIR,
    LOGS_DIR,
    get_tesseract_version,
)
from ingest.pdf_extractor import (
    extract_pages_from_pdf,
    is_page_empty_or_junk,
)
from ingest.page_mapping import build_page_mapping
from ingest.chapters import (
    get_or_create_meta,
    load_chapters_override,
    extract_chapter_number_from_filename,
    extract_chapter_title_from_pdf,
    extract_section_headings_from_doc,
    detect_chapters_full_book,
    segment_text_into_sections,
    ChapterInfo,
    IGNORE_FILE_SUFFIXES,
)
from ingest.chunker import (
    split_into_sentences,
    chunk_section,
    merge_small_chunks,
    Chunk,
)
from ingest.images import (
    find_decorative_image_hashes,
    extract_images_from_page,
    upload_image_to_storage,
    render_page_to_jpeg,
    upload_page_image_to_storage,
    ExtractedImage,
    RenderedPageImage,
)
from ingest.embeddings import embed_chunks
from ingest.db import (
    check_subject_exists,
    delete_subject_data,
    insert_subject,
    insert_book,
    insert_chapter,
    insert_chunks_batch,
    insert_images_batch,
    insert_page_images_batch,
)
from ingest.report import generate_verification_report

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("ingest")

VALID_SUBJECTS = ["maths", "physics", "chemistry", "biology", "history"]


def verify_environment():
    """Verify system prerequisites (tesseract)."""
    tess_ver = get_tesseract_version()
    if not tess_ver:
        msg = (
            "ERROR: Tesseract OCR binary is not installed or not found on PATH.\n\n"
            "Install Steps for Windows:\n"
            "1. Download the Windows installer from: https://github.com/UB-Mannheim/tesseract/wiki\n"
            "2. Run the installer (default path: C:\\Program Files\\Tesseract-OCR)\n"
            "3. Add 'C:\\Program Files\\Tesseract-OCR' to your system PATH environment variable.\n"
            "4. Verify in PowerShell by running: tesseract --version\n"
        )
        print(msg, file=sys.stderr)
        sys.exit(1)


def get_subject_pdf_files(subject_dir: Path) -> List[Path]:
    """Find valid textbook PDFs in data/<subject>/, filtering out preliminary/answer files."""
    if not subject_dir.exists():
        return []

    all_pdfs = list(subject_dir.glob("*.pdf"))
    valid_pdfs = []
    for p in all_pdfs:
        name_lower = p.name.lower()
        if any(name_lower.endswith(sfx) for sfx in IGNORE_FILE_SUFFIXES):
            logger.info(f"Ignoring preliminary/answer file: {p.name}")
            continue
        valid_pdfs.append(p)

    return sorted(valid_pdfs, key=lambda x: x.name)


def process_subject(
    subject: str,
    force: bool = False,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """Process ingestion pipeline for a single subject."""
    subject = subject.lower()
    subject_dir = DATA_DIR / subject
    if not subject_dir.exists():
        subject_dir.mkdir(parents=True, exist_ok=True)

    logger.info(f"Starting ingestion process for subject: '{subject}' (dry_run={dry_run}, force={force})")

    # 1. Check idempotency
    if not dry_run and not force:
        existing_id = check_subject_exists(subject)
        if existing_id:
            logger.info(
                f"Subject '{subject}' is already ingested in Supabase (ID: {existing_id}). "
                f"Skipping. Use --force to re-ingest."
            )
            return {"status": "skipped", "subject": subject, "message": "Already ingested"}

    if not dry_run and force:
        delete_subject_data(subject)

    # 2. Metadata & Overrides
    meta = get_or_create_meta(subject_dir, subject)
    chapters_override = load_chapters_override(subject_dir)

    # 3. Discover PDF files
    pdf_files = get_subject_pdf_files(subject_dir)
    if not pdf_files:
        logger.warning(
            f"No PDF files found in {subject_dir}. Please place PDF files in {subject_dir} "
            f"as either one full-book PDF or chapter PDFs (e.g. kech101.pdf)."
        )
        return {"status": "no_files", "subject": subject, "pages_read": 0}

    # Determine mode: Single full-book PDF or Multi-chapter PDFs
    is_full_book = len(pdf_files) == 1 and extract_chapter_number_from_filename(pdf_files[0].name) is None

    stats = {
        "pages_read": 0,
        "pages_skipped": 0,
        "pages_ocr": 0,
        "image_count": 0,
        "page_images_count": 0,
    }
    ocr_counter = [0]
    all_chunks_data: List[Dict[str, Any]] = []
    all_images_data: List[ExtractedImage] = []
    all_page_images_data: List[RenderedPageImage] = []
    chapters_summary: List[Dict[str, Any]] = []

    # Map chapter number to its chunks, images, and page images for DB insertion
    chapter_chunks_map: Dict[int, List[Dict[str, Any]]] = {}
    chapter_images_map: Dict[int, List[ExtractedImage]] = {}
    chapter_page_images_map: Dict[int, List[RenderedPageImage]] = {}

    if not is_full_book:
        # Chapter-per-PDF mode
        total_ch_files = len(pdf_files)
        for ch_idx, pdf_path in enumerate(pdf_files, 1):
            ch_num = extract_chapter_number_from_filename(pdf_path.name) or ch_idx
            doc = fitz.open(pdf_path)
            decorative_hashes = find_decorative_image_hashes(doc)
            seen_hashes = set()

            # Text extraction with caching & garble detection
            pages_extracted = extract_pages_from_pdf(
                pdf_path,
                subject=subject,
                file_stem=pdf_path.stem,
                ocr_counter=ocr_counter,
            )
            stats["pages_read"] += len(pages_extracted)

            # Build printed page mapping
            page_mapping = build_page_mapping(
                pages_raw_text=[raw for _, _, _, _, raw in pages_extracted],
                file_name=pdf_path.name,
                pages_clean_text=[text for _, text, _, _, _ in pages_extracted],
            )

            # Determine chapter title
            override_ch = None
            if chapters_override:
                for c in chapters_override:
                    if c.number == ch_num:
                        override_ch = c
                        break

            if override_ch:
                ch_title = override_ch.title
            else:
                first_text = pages_extracted[0][1] if pages_extracted else ""
                ch_title = extract_chapter_title_from_pdf(doc, first_text)

            # Filter valid pages and collect text
            valid_pages: List[Tuple[int, str, int]] = []
            for p_idx, text, was_ocr, q_score, _ in pages_extracted:
                printed_page = page_mapping[p_idx]
                if is_page_empty_or_junk(text):
                    stats["pages_skipped"] += 1
                    continue
                valid_pages.append((p_idx, text, printed_page))

                # 1. Extract embedded images
                img_list = extract_images_from_page(
                    doc=doc,
                    page_idx=p_idx,
                    printed_page=printed_page,
                    chapter_num=ch_num,
                    subject=subject,
                    decorative_hashes=decorative_hashes,
                    seen_hashes=seen_hashes,
                )
                all_images_data.extend(img_list)
                if ch_num not in chapter_images_map:
                    chapter_images_map[ch_num] = []
                chapter_images_map[ch_num].extend(img_list)

                # 2. Render full page to JPEG at 110 DPI (quality 75) for vector drawings & formulas
                page_img = render_page_to_jpeg(
                    doc=doc,
                    page_idx=p_idx,
                    printed_page=printed_page,
                    chapter_num=ch_num,
                    subject=subject,
                    dpi=110,
                    quality=75,
                )
                all_page_images_data.append(page_img)
                if ch_num not in chapter_page_images_map:
                    chapter_page_images_map[ch_num] = []
                chapter_page_images_map[ch_num].append(page_img)

            # Determine actual printed start & end page
            if valid_pages:
                start_page = min(p for _, _, p in valid_pages)
                end_page = max(p for _, _, p in valid_pages)
            else:
                start_page = page_mapping.get(0, 1)
                end_page = page_mapping.get(len(doc) - 1, len(doc))

            if override_ch:
                start_page = override_ch.start_page
                end_page = override_ch.end_page

            # Segment sections and chunk with bold span detection
            headings_map = extract_section_headings_from_doc(doc)
            sections = segment_text_into_sections(valid_pages, chapter_title=ch_title, headings_map=headings_map)
            ch_chunks: List[Chunk] = []
            chunk_idx_counter = 0

            for sec in sections:
                sec_chunks, chunk_idx_counter = chunk_section(
                    section_title=sec.title,
                    segments=sec.segments,
                    starting_chunk_index=chunk_idx_counter,
                )
                ch_chunks.extend(sec_chunks)

            # Merge chunks under 60 tokens (e.g. chapter-opening quotes) into following chunk
            ch_chunks = merge_small_chunks(ch_chunks, min_tokens=60)

            # Format chunks dicts
            formatted_chunks = []
            for c in ch_chunks:
                formatted_chunks.append({
                    "chapter_number": ch_num,
                    "chapter_title": ch_title,
                    "section_title": c.section_title,
                    "page_number": c.page_number,
                    "page_end": c.page_end,
                    "chunk_index": c.chunk_index,
                    "token_count": c.token_count,
                    "content": c.content,
                })

            all_chunks_data.extend(formatted_chunks)
            chapter_chunks_map[ch_num] = formatted_chunks

            chapters_summary.append({
                "number": ch_num,
                "title": ch_title,
                "start_page": start_page,
                "end_page": end_page,
            })

            # Logging format required: chemistry | ch 3/6 | page 76 | OCR pages so far: 12 | chunks: 140
            logger.info(
                f"{subject} | ch {ch_idx}/{total_ch_files} | page {end_page} | "
                f"OCR pages so far: {ocr_counter[0]} | chunks: {len(all_chunks_data)}"
            )

            doc.close()
    else:
        # Single Full-Book PDF mode
        pdf_path = pdf_files[0]
        doc = fitz.open(pdf_path)
        decorative_hashes = find_decorative_image_hashes(doc)
        seen_hashes = set()

        pages_extracted = extract_pages_from_pdf(
            pdf_path,
            subject=subject,
            file_stem=pdf_path.stem,
            ocr_counter=ocr_counter,
        )
        stats["pages_read"] = len(pages_extracted)

        page_mapping = build_page_mapping(
            pages_raw_text=[raw for _, _, _, _, raw in pages_extracted],
            file_name=pdf_path.name,
            pages_clean_text=[text for _, text, _, _, _ in pages_extracted],
        )

        # Detect chapters
        if chapters_override:
            detected_chapters = chapters_override
        else:
            detected_chapters = detect_chapters_full_book(
                doc=doc,
                page_texts=[t for _, t, _, _, _ in pages_extracted],
                page_mapping=page_mapping,
            )

        for ch_idx, ch in enumerate(detected_chapters, 1):
            ch_pages: List[Tuple[int, str, int]] = []
            for p_idx, text, was_ocr, q_score, _ in pages_extracted:
                printed_page = page_mapping[p_idx]
                if ch.start_page <= printed_page <= ch.end_page:
                    if is_page_empty_or_junk(text):
                        stats["pages_skipped"] += 1
                        continue
                    ch_pages.append((p_idx, text, printed_page))

                    # Extract images
                    img_list = extract_images_from_page(
                        doc=doc,
                        page_idx=p_idx,
                        printed_page=printed_page,
                        chapter_num=ch.number,
                        subject=subject,
                        decorative_hashes=decorative_hashes,
                        seen_hashes=seen_hashes,
                    )
                    all_images_data.extend(img_list)
                    if ch.number not in chapter_images_map:
                        chapter_images_map[ch.number] = []
                    chapter_images_map[ch.number].extend(img_list)

                    # Render full page image
                    page_img = render_page_to_jpeg(
                        doc=doc,
                        page_idx=p_idx,
                        printed_page=printed_page,
                        chapter_num=ch.number,
                        subject=subject,
                        dpi=110,
                        quality=75,
                    )
                    all_page_images_data.append(page_img)
                    if ch.number not in chapter_page_images_map:
                        chapter_page_images_map[ch.number] = []
                    chapter_page_images_map[ch.number].append(page_img)

            headings_map = extract_section_headings_from_doc(doc)
            sections = segment_text_into_sections(ch_pages, chapter_title=ch.title, headings_map=headings_map)
            ch_chunks: List[Chunk] = []
            chunk_idx_counter = 0

            for sec in sections:
                sec_chunks, chunk_idx_counter = chunk_section(
                    section_title=sec.title,
                    segments=sec.segments,
                    starting_chunk_index=chunk_idx_counter,
                )
                ch_chunks.extend(sec_chunks)

            # Merge chunks under 60 tokens into following chunk
            ch_chunks = merge_small_chunks(ch_chunks, min_tokens=60)

            formatted_chunks = []
            for c in ch_chunks:
                formatted_chunks.append({
                    "chapter_number": ch.number,
                    "chapter_title": ch.title,
                    "section_title": c.section_title,
                    "page_number": c.page_number,
                    "page_end": c.page_end,
                    "chunk_index": c.chunk_index,
                    "token_count": c.token_count,
                    "content": c.content,
                })

            all_chunks_data.extend(formatted_chunks)
            chapter_chunks_map[ch.number] = formatted_chunks

            chapters_summary.append({
                "number": ch.number,
                "title": ch.title,
                "start_page": ch.start_page,
                "end_page": ch.end_page,
            })

            logger.info(
                f"{subject} | ch {ch_idx}/{len(detected_chapters)} | page {ch.end_page} | "
                f"OCR pages so far: {ocr_counter[0]} | chunks: {len(all_chunks_data)}"
            )

        doc.close()

    stats["pages_ocr"] = ocr_counter[0]
    stats["image_count"] = len(all_images_data)
    stats["page_images_count"] = len(all_page_images_data)

    # 4. Live DB & Storage Inserts (when not in dry-run)
    db_subject_id = None
    if not dry_run:
        logger.info(f"Writing data to Supabase for subject '{subject}'...")
        db_subject_id = insert_subject(subject)
        source_name = pdf_files[0].name if len(pdf_files) == 1 else f"{len(pdf_files)} chapter files"
        book_id = insert_book(
            subject_id=db_subject_id,
            title=meta.get("title", subject.capitalize()),
            part=meta.get("part"),
            source=source_name,
        )

        for ch_info in chapters_summary:
            ch_num = ch_info["number"]
            ch_title = ch_info["title"]
            ch_db_id = insert_chapter(
                book_id=book_id,
                number=ch_num,
                title=ch_title,
                start_page=ch_info["start_page"],
                end_page=ch_info["end_page"],
            )
            ch_info["id"] = ch_db_id

            # Embed & insert chunks for this chapter
            raw_chunks = chapter_chunks_map.get(ch_num, [])
            if raw_chunks:
                logger.info(f"Generating embeddings for Chapter {ch_num} ({len(raw_chunks)} chunks)...")
                embeddings = embed_chunks(
                    chunk_items=raw_chunks,
                    book_title=meta.get("title", subject.capitalize()),
                    chapter_number=ch_num,
                    chapter_title=ch_title,
                    subject=subject,
                    batch_size=20,
                )

                chunk_rows = []
                for idx, c in enumerate(raw_chunks):
                    chunk_rows.append({
                        "book_id": book_id,
                        "chapter_id": ch_db_id,
                        "page_number": c["page_number"],
                        "page_end": c["page_end"],
                        "section_title": c["section_title"].replace("\x00", "").replace("\u0000", "") if c.get("section_title") else None,
                        "content": c["content"].replace("\x00", "").replace("\u0000", ""),
                        "chunk_index": c["chunk_index"],
                        "token_count": c["token_count"],
                        "embedding": embeddings[idx] if idx < len(embeddings) else None,
                    })

                insert_chunks_batch(chunk_rows, batch_size=200)

            # Supabase client for storage uploads
            from ingest.config import get_supabase_client
            sp_client = get_supabase_client()

            # Upload & insert embedded images for this chapter
            raw_images = chapter_images_map.get(ch_num, [])
            if raw_images:
                logger.info(f"Uploading {len(raw_images)} embedded images for Chapter {ch_num}...")
                image_rows = []
                for img in raw_images:
                    upload_ok = upload_image_to_storage(sp_client, img)
                    if upload_ok:
                        image_rows.append({
                            "book_id": book_id,
                            "chapter_id": ch_db_id,
                            "page_number": img.page_number,
                            "storage_path": img.storage_path,
                            "width": img.width,
                            "height": img.height,
                        })

                insert_images_batch(image_rows, batch_size=200)

            # Upload & insert rendered full page images for this chapter
            raw_page_images = chapter_page_images_map.get(ch_num, [])
            if raw_page_images:
                logger.info(f"Uploading {len(raw_page_images)} full-page images for Chapter {ch_num}...")
                page_img_rows = []
                for p_img in raw_page_images:
                    upload_ok = upload_page_image_to_storage(p_img, sp_client=sp_client)
                    if upload_ok:
                        page_img_rows.append({
                            "book_id": book_id,
                            "chapter_id": ch_db_id,
                            "page_number": p_img.page_number,
                            "storage_path": p_img.storage_path,
                        })
                insert_page_images_batch(page_img_rows, batch_size=200)

    # 5. Step 9 Verification Report
    report_text = generate_verification_report(
        subject=subject,
        stats=stats,
        all_chunks=all_chunks_data,
        chapters=chapters_summary,
        dry_run=dry_run,
        subject_id=db_subject_id,
    )

    # 6. Save Run Summary to ingest/logs/<subject>.json
    summary = {
        "subject": subject,
        "dry_run": dry_run,
        "stats": stats,
        "chapters": chapters_summary,
        "total_chunks": len(all_chunks_data),
        "total_images": len(all_images_data),
        "total_page_images": len(all_page_images_data),
    }
    summary_path = LOGS_DIR / f"{subject}.json"
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    logger.info(f"Run summary written to {summary_path}")

    return summary


def main():
    # Ensure Windows console handles UTF-8 (mathematical symbols, Greek letters)
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    parser = argparse.ArgumentParser(description="NCERT Textbook Supabase Ingestion Pipeline")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--subject", choices=VALID_SUBJECTS, help="Subject to ingest (maths, physics, chemistry, biology, history)")
    group.add_argument("--all", action="store_true", help="Ingest all 5 subjects in order")

    parser.add_argument("--force", action="store_true", help="Delete existing subject data before ingestion")
    parser.add_argument("--dry-run", action="store_true", help="Extract, chunk and verify without writing to DB or Storage")

    args = parser.parse_args()

    # Step 0 prerequisite verification
    verify_environment()

    subjects_to_run = VALID_SUBJECTS if args.all else [args.subject]

    for subj in subjects_to_run:
        process_subject(subj, force=args.force, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
