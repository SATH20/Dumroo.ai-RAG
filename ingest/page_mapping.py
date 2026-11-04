"""Printed page number detection and PDF-to-printed-page mapping."""

import re
import logging
from collections import Counter
from typing import Dict, List, Optional

logger = logging.getLogger("ingest.page_mapping")

PAGE_NUM_STANDALONE = re.compile(r"^\s*(\d{1,4})\s*$")
PAGE_NUM_TRAILING = re.compile(r"^[A-Za-z\s\.\-•·/]+\s+(\d{1,4})\s*$")
PAGE_NUM_LEADING = re.compile(r"^\s*(\d{1,4})\s+[A-Za-z\s\.\-•·/]+$")
PAGE_NUM_WITH_SEP = re.compile(r"(?:[A-Za-z\s]+)[|\-•·/]\s*(\d{1,4})\s*$")
PAGE_NUM_PREFIXED = re.compile(r"^\s*(?:page|p\.)\s*(\d{1,4})\s*$", re.IGNORECASE)


def extract_page_number_from_lines(lines: List[str]) -> Optional[int]:
    """Inspect lines (e.g. header or footer lines) for a printed page number."""
    for line in lines:
        cleaned = line.strip()
        if not cleaned:
            continue

        lowered = cleaned.lower()
        # Skip lines that are clearly not page headers/footers
        if any(skip_word in lowered for skip_word in ["unit", "chapter", "reprint", "rationalised", "isbn", "exercise"]):
            continue

        # Pattern 1: Standalone digits
        m = PAGE_NUM_STANDALONE.match(cleaned)
        if m:
            val = int(m.group(1))
            if 1 <= val <= 1500:
                return val

        # Pattern 2: Digits then text (e.g. "2       MATHEMATICS")
        m = PAGE_NUM_LEADING.match(cleaned)
        if m:
            val = int(m.group(1))
            if 1 <= val <= 1500:
                return val

        # Pattern 3: Text then digits (e.g. "SETS        3")
        m = PAGE_NUM_TRAILING.match(cleaned)
        if m:
            val = int(m.group(1))
            if 1 <= val <= 1500:
                return val

        # Pattern 4: With separator
        m = PAGE_NUM_WITH_SEP.match(cleaned)
        if m:
            val = int(m.group(1))
            if 1 <= val <= 1500:
                return val

        # Pattern 5: "Page 12" or "p. 12"
        m = PAGE_NUM_PREFIXED.match(cleaned)
        if m:
            val = int(m.group(1))
            if 1 <= val <= 1500:
                return val

    return None


def detect_page_number_on_page(text: str) -> Optional[int]:
    """Check the top 3 and bottom 3 non-empty lines of a page for a printed page number."""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return None

    top_lines = lines[:3]
    bottom_lines = lines[-3:]

    # Check top lines first, then bottom lines
    num = extract_page_number_from_lines(top_lines)
    if num is not None:
        return num

    return extract_page_number_from_lines(bottom_lines)


def build_page_mapping(
    pages_raw_text: List[str],
    file_name: str,
    pages_clean_text: Optional[List[str]] = None,
) -> Dict[int, int]:
    """
    Build a mapping of pdf_index (0-based) -> printed_page_number (int).
    Checks raw text first (prior to header stripping) then cleaned text.
    Interpolates gaps from neighbors and falls back to PDF index (1-based) if nothing detected.
    Logs the detected offset per file.
    """
    total_pages = len(pages_raw_text)
    if total_pages == 0:
        return {}

    detected: Dict[int, int] = {}
    offsets: List[int] = []

    for idx in range(total_pages):
        raw_text = pages_raw_text[idx]
        p_num = detect_page_number_on_page(raw_text)
        if p_num is None and pages_clean_text and idx < len(pages_clean_text):
            p_num = detect_page_number_on_page(pages_clean_text[idx])

        if p_num is not None:
            detected[idx] = p_num
            offsets.append(p_num - idx)

    # Determine dominant offset
    dominant_offset: Optional[int] = None
    if offsets:
        offset_counts = Counter(offsets)
        dominant_offset, dominant_freq = offset_counts.most_common(1)[0]

    result: Dict[int, int] = {}

    if dominant_offset is not None:
        logger.info(
            f"{file_name}: Detected page offset {dominant_offset:+d} "
            f"({len(detected)}/{total_pages} pages detected, dominant in {dominant_freq} pages)"
        )
        # Purge outliers from detected map before any interpolation
        clean_detected = {
            i: p for i, p in detected.items()
            if abs(p - (i + dominant_offset)) <= 2
        }

        for idx in range(total_pages):
            if idx in clean_detected:
                result[idx] = clean_detected[idx]
            else:
                prev_idx = max([i for i in clean_detected if i < idx], default=None)
                next_idx = min([i for i in clean_detected if i > idx], default=None)

                if prev_idx is not None and next_idx is not None:
                    step = (clean_detected[next_idx] - clean_detected[prev_idx]) / (next_idx - prev_idx)
                    interp_val = round(clean_detected[prev_idx] + step * (idx - prev_idx))
                    result[idx] = interp_val
                elif prev_idx is not None:
                    result[idx] = clean_detected[prev_idx] + (idx - prev_idx)
                elif next_idx is not None:
                    result[idx] = clean_detected[next_idx] - (next_idx - idx)
                else:
                    result[idx] = idx + dominant_offset
    else:
        # Fallback to 1-based PDF index (-1 for full history book where PDF idx 10 = printed page 9)
        fallback_offset = -1 if "history" in file_name.lower() else 1
        logger.warning(
            f"{file_name}: No printed page numbers detected. Falling back to 1-based PDF index (offset +{fallback_offset})."
        )
        for idx in range(total_pages):
            result[idx] = idx + fallback_offset

    # Ensure page numbers are positive
    for idx in range(total_pages):
        if result[idx] < 1:
            result[idx] = idx + 1

    return result
