"""Text extraction with garble detection, OCR fallback, text cleaning, and caching."""

import io
import re
import logging
from pathlib import Path
from typing import Dict, List, Tuple
import fitz  # PyMuPDF
from PIL import Image
import pytesseract

from ingest.config import CACHE_DIR

logger = logging.getLogger("ingest.pdf_extractor")

# Regex patterns for junk removal
PRINTER_PATH_PATTERN = re.compile(r"^[A-Za-z]:\\[^\n]+", re.IGNORECASE)
REPRINT_PATTERN = re.compile(r".*(?:reprint|rationalised|edition)\s+\d{4}[-\s–]\d{2,4}.*", re.IGNORECASE)
NCERT_COPYRIGHT_PATTERN = re.compile(r".*(?:©|\(c\)|copyright)?\s*ncert\s+not\s+to\s+be\s+republished.*", re.IGNORECASE)
ISBN_PATTERN = re.compile(r".*isbn\s*[\d\-X]+.*", re.IGNORECASE)
HYPHEN_BREAK_PATTERN = re.compile(r"(\b[A-Za-z]{2,})-\s*\n\s*([A-Za-z]{2,}\b)")


def calculate_quality_score(text: str) -> float:
    """
    Quality score = share of characters that belong to normal words (letters, 3+ length)
    out of all non-space characters.
    If under 0.5, the page is GARBLED.
    """
    non_space_chars = [c for c in text if not c.isspace()]
    if not non_space_chars:
        return 0.0

    normal_words = re.findall(r"\b[A-Za-z]{3,}\b", text)
    normal_word_chars = sum(len(w) for w in normal_words)

    return normal_word_chars / len(non_space_chars)


def ocr_page(page: fitz.Page, dpi: int = 250) -> str:
    """Render a garbled page at 250 DPI and OCR with pytesseract (lang='eng', --psm 3)."""
    pix = page.get_pixmap(dpi=dpi)
    img_bytes = pix.tobytes("png")
    image = Image.open(io.BytesIO(img_bytes))
    ocr_text = pytesseract.image_to_string(image, lang="eng", config="--psm 3")
    return ocr_text


def detect_repeated_headers_footers(pages_text: List[str]) -> Tuple[set, set]:
    """Identify repeated running header and footer lines that occur across multiple pages."""
    top_counts: Dict[str, int] = {}
    bottom_counts: Dict[str, int] = {}
    total_pages = len(pages_text)

    for text in pages_text:
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        if len(lines) >= 2:
            top_line = re.sub(r"\d+", "", lines[0]).strip().lower()
            if len(top_line) > 3:
                top_counts[top_line] = top_counts.get(top_line, 0) + 1

            bottom_line = re.sub(r"\d+", "", lines[-1]).strip().lower()
            if len(bottom_line) > 3:
                bottom_counts[bottom_line] = bottom_counts.get(bottom_line, 0) + 1

    # Lines repeated on >= 25% of pages or >= 3 pages
    threshold = max(3, int(total_pages * 0.25))
    repeated_top = {k for k, v in top_counts.items() if v >= threshold}
    repeated_bottom = {k for k, v in bottom_counts.items() if v >= threshold}

    return repeated_top, repeated_bottom


def clean_page_text(
    text: str,
    repeated_top: set | None = None,
    repeated_bottom: set | None = None,
) -> str:
    """
    Clean extracted text:
    - remove repeated running headers/footers
    - fix hyphenated line breaks
    - drop printer junk lines
    - collapse whitespace
    """
    # Strip null bytes that Postgres rejects
    text = text.replace("\x00", "").replace("\u0000", "")

    # Fix hyphenated line breaks across lines: e.g. "com-\nputer" -> "computer"
    text = HYPHEN_BREAK_PATTERN.sub(r"\1\2", text)

    raw_lines = text.splitlines()
    cleaned_lines = []

    for idx, line in enumerate(raw_lines):
        trimmed = line.strip()
        if not trimmed:
            continue

        # Drop printer junk
        if PRINTER_PATH_PATTERN.match(trimmed):
            continue
        if REPRINT_PATTERN.match(trimmed):
            continue
        if NCERT_COPYRIGHT_PATTERN.match(trimmed):
            continue
        if ISBN_PATTERN.match(trimmed):
            continue

        # Check running headers/footers
        normalized = re.sub(r"\d+", "", trimmed).strip().lower()
        if idx <= 2 and repeated_top and normalized in repeated_top:
            continue
        if idx >= len(raw_lines) - 3 and repeated_bottom and normalized in repeated_bottom:
            continue

        # Collapse intra-line whitespace
        collapsed = re.sub(r"[ \t]+", " ", trimmed)
        cleaned_lines.append(collapsed)

    # Reconstruct text preserving paragraph breaks where appropriate
    result = "\n".join(cleaned_lines)

    # Strip stray decorative quote glyphs like 'v' before capital letters: "vWith" -> "With", "vIn" -> "In"
    result = re.sub(r"(?:^|(?<=\s))v([A-Z])", r"\1", result)
    result = re.sub(r"(?m)^v\s+(?=[A-Za-z0-9])", "", result)
    # Strip stray trailing 'v' at line ends: e.g. "BELLv" -> "BELL", "-- DEDEKIND v" -> "-- DEDEKIND"
    result = re.sub(r"(?<=\S)\s*v(?=\n|$)", "", result)

    # Collapse 3+ newlines to 2
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result.strip()


def is_page_empty_or_junk(text: str) -> bool:
    """Skip pages with under 100 normal characters (covers, blank, image-only pages)."""
    normal_chars = re.findall(r"[A-Za-z0-9]", text)
    return len(normal_chars) < 100


def extract_pages_from_pdf(
    pdf_path: Path,
    subject: str,
    file_stem: str,
    ocr_counter: list | None = None,
) -> List[Tuple[int, str, bool, float, str]]:
    """
    Extract text for every page of a PDF:
    - checks cache first
    - calculates quality score
    - falls back to OCR if score < 0.5
    - cleans text
    - caches result to ingest/cache/<subject>/<file_stem>_p<idx>.txt

    Returns list of tuples: (pdf_page_index, final_cleaned_text, was_ocr, quality_score, raw_text)
    """
    cache_dir = CACHE_DIR / subject
    cache_dir.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    raw_texts: List[str] = []
    ocr_flags: List[bool] = []
    scores: List[float] = []

    # First pass: collect raw text (using raw cache or direct extraction / OCR)
    for idx in range(total_pages):
        cache_raw = cache_dir / f"{file_stem}_p{idx}_raw.txt"

        page = doc[idx]
        extracted_text = page.get_text()
        score = calculate_quality_score(extracted_text)

        if score < 0.5:
            # Garbled page: check OCR cache or perform OCR
            if cache_raw.exists():
                ocr_text = cache_raw.read_text(encoding="utf-8")
                raw_texts.append(ocr_text)
                ocr_flags.append(True)
                scores.append(calculate_quality_score(ocr_text))
            else:
                logger.info(
                    f"{file_stem} | page {idx + 1}/{total_pages} garbled (quality score {score:.2f}) -> rendering at 250 DPI and OCR-ing"
                )
                ocr_text = ocr_page(page, dpi=250)
                try:
                    cache_raw.write_text(ocr_text, encoding="utf-8")
                except Exception:
                    pass
                raw_texts.append(ocr_text)
                ocr_flags.append(True)
                scores.append(calculate_quality_score(ocr_text))
                if ocr_counter is not None:
                    ocr_counter[0] += 1
        else:
            raw_texts.append(extracted_text)
            ocr_flags.append(False)
            scores.append(score)

    # Detect repeated headers/footers across the document
    rep_top, rep_bottom = detect_repeated_headers_footers(raw_texts)

    results: List[Tuple[int, str, bool, float, str]] = []

    for idx in range(total_pages):
        cache_file = cache_dir / f"{file_stem}_p{idx}.txt"
        raw = raw_texts[idx]

        if cache_file.exists():
            try:
                cached_text = cache_file.read_text(encoding="utf-8")
                cleaned = clean_page_text(cached_text, rep_top, rep_bottom)
            except Exception:
                cleaned = clean_page_text(raw, rep_top, rep_bottom)
        else:
            cleaned = clean_page_text(raw, rep_top, rep_bottom)
            try:
                cache_file.write_text(cleaned, encoding="utf-8")
            except Exception as e:
                logger.warning(f"Failed to write cache {cache_file}: {e}")

        results.append((idx, cleaned, ocr_flags[idx], scores[idx], raw))

    doc.close()
    return results
