"""Chapter and section detection, metadata loading, and chapter overrides."""

import json
import re
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import fitz

logger = logging.getLogger("ingest.chapters")

# Default book metadata for NCERT Class 11 textbooks
DEFAULT_METAS: Dict[str, dict] = {
    "maths": {"title": "Mathematics", "part": None, "class": 11},
    "physics": {"title": "Physics", "part": "Part 1", "class": 11},
    "chemistry": {"title": "Chemistry", "part": "Part 1", "class": 11},
    "biology": {"title": "Biology", "part": None, "class": 11},
    "history": {"title": "Themes in World History", "part": None, "class": 11},
}

# Regex to detect numbered sections e.g. "5.4 Newton's First Law of Motion"
SECTION_HEADING_REGEX = re.compile(r"^(\d+(?:\.\d+)+)\s+([A-Za-z].*)$", re.MULTILINE)

# Chapter file patterns: kech101.pdf -> chapter 1
# Ignore files ending in ps.pdf, a1.pdf, an.pdf
IGNORE_FILE_SUFFIXES = ("ps.pdf", "a1.pdf", "an.pdf")


@dataclass
class ChapterInfo:
    number: int
    title: str
    start_page: int
    end_page: int
    file_path: Optional[Path] = None


@dataclass
class SectionSpan:
    title: str
    content: str
    page_start: int
    page_end: int
    segments: List[Any] = field(default_factory=list)


def get_or_create_meta(subject_dir: Path, subject: str) -> dict:
    """Load subject meta.json or create default if missing."""
    meta_path = subject_dir / "meta.json"
    if meta_path.exists():
        try:
            return json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning(f"Failed to read {meta_path}: {e}")

    default = DEFAULT_METAS.get(
        subject.lower(),
        {"title": subject.capitalize(), "part": None, "class": 11},
    )
    meta_path.write_text(json.dumps(default, indent=2), encoding="utf-8")
    return default


def load_chapters_override(subject_dir: Path) -> Optional[List[ChapterInfo]]:
    """Check for optional chapters.json override."""
    chapters_path = subject_dir / "chapters.json"
    if chapters_path.exists():
        try:
            data = json.loads(chapters_path.read_text(encoding="utf-8"))
            chapters = []
            for item in data:
                chapters.append(
                    ChapterInfo(
                        number=item["number"],
                        title=item["title"],
                        start_page=item["start_page"],
                        end_page=item["end_page"],
                    )
                )
            logger.info(f"Loaded chapters override from {chapters_path}: {len(chapters)} chapters")
            return chapters
        except Exception as e:
            logger.warning(f"Error parsing chapters override {chapters_path}: {e}")
    return None


def extract_chapter_number_from_filename(filename: str) -> Optional[int]:
    """
    Extract chapter number from filename like kech101.pdf -> 1, keph201.pdf -> 8.
    (chapter number = last 2 digits before .pdf).
    Only matches standard chapter file patterns (e.g. kech101, kemh101, kehs101, etc.).
    Returns None for full book filenames like NCERT-Class-11-History.pdf.
    """
    stem = Path(filename).stem
    if "class" in stem.lower() or "full" in stem.lower() or "book" in stem.lower():
        return None
    m = re.match(r"^[a-z]{4}[12](\d{2})$", stem.lower())
    if m:
        last_2 = int(m.group(1))
        if stem.lower().startswith("keph2"):
            return 7 + last_2
        return last_2

    digits = re.findall(r"\d+", stem)
    if digits and len(stem) <= 8:
        last_num = digits[-1]
        last_2 = int(last_num[-2:]) if len(last_num) >= 2 else int(last_num)
        if stem.lower().startswith("keph2"):
            return 7 + last_2
        return last_2
    return None


def extract_chapter_title_from_pdf(doc: fitz.Document, first_page_text: str = "") -> str:
    """
    Extract chapter title from largest-font heading on the first page (skip "Chapter"/"Unit").
    """
    if len(doc) == 0:
        return "Introduction"

    page0 = doc[0]
    blocks = page0.get_text("dict").get("blocks", [])

    candidates: List[Tuple[float, str]] = []

    for b in blocks:
        if b.get("type") != 0:  # text block
            continue
        for line in b.get("lines", []):
            line_text = ""
            max_size = 0.0
            for span in line.get("spans", []):
                t = span.get("text", "").strip()
                if t:
                    line_text = f"{line_text} {t}".strip() if line_text else t
                    if span.get("size", 0) > max_size:
                        max_size = span.get("size", 0)
            if line_text and max_size > 0:
                candidates.append((max_size, line_text))

    # Filter out "Chapter", "Unit", numbers, and very short labels
    filtered = []
    for size, text in candidates:
        cleaned = text.strip()
        lowered = cleaned.lower()
        if re.match(r"^(?:chapter|unit)\s*\d*$", lowered):
            continue
        if re.match(r"^\d+$", lowered):
            continue
        if len(cleaned) < 3:
            continue
        filtered.append((size, cleaned))

    if filtered:
        # Group by maximum size (allowing small font variance)
        filtered.sort(key=lambda x: x[0], reverse=True)
        top_size = filtered[0][0]
        title_parts = [t for s, t in filtered if s >= top_size - 1.5]
        # Deduplicate and join
        seen = set()
        unique_parts = []
        for p in title_parts:
            if p.lower() not in seen:
                seen.add(p.lower())
                unique_parts.append(p)
        joined_title = " ".join(unique_parts[:2]).strip()
        if joined_title:
            return joined_title.title()

    # Fallback to scanning lines in first_page_text
    lines = [ln.strip() for ln in first_page_text.splitlines() if ln.strip()]
    for i, line in enumerate(lines[:10]):
        lowered = line.lower()
        if lowered.startswith("chapter") or lowered.startswith("unit"):
            if i + 1 < len(lines):
                next_ln = lines[i + 1].strip()
                if len(next_ln) > 3 and not next_ln.lower().startswith("reprint"):
                    return next_ln.title()

    return "Chapter Content"


def detect_chapters_full_book(
    doc: fitz.Document,
    page_texts: List[str],
    page_mapping: Dict[int, int],
) -> List[ChapterInfo]:
    """
    Detect chapter starts from headings like "Chapter N", "CHAPTER ONE", "UNIT N" + next title line,
    using font size/bold from pymupdf spans or OCR text.
    Also parses contents page if readable.
    If detected chapter count disagrees with contents page, raises an exception to STOP.
    """
    # 1. Look for contents page in the first 15 pages
    contents_chapters = []
    for idx in range(min(15, len(doc))):
        text = page_texts[idx]
        if "content" in text.lower() or "table of contents" in text.lower():
            # Parse contents entries: e.g. "1. Some Basic Concepts ... 1" or "Chapter 1 Title ... 1"
            entries = re.findall(
                r"(?:Chapter\s*(\d+)|(\d+)\.)\s+([A-Za-z\s–\-]+?)\s*(?:\.{2,}|\s{2,})\s*(\d+)",
                text,
                re.IGNORECASE,
            )
            for m in entries:
                ch_num = int(m[0] or m[1])
                title = m[2].strip()
                start_p = int(m[3])
                contents_chapters.append((ch_num, title, start_p))
            if contents_chapters:
                break

    # 2. Scan pages for chapter headings
    detected_chapters: List[Tuple[int, str, int]] = []  # (ch_num, title, pdf_idx)
    chapter_heading_re = re.compile(
        r"^(?:CHAPTER|UNIT)\s+(\d+|[IVXLCDM]+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE|THIRTEEN|FOURTEEN|FIFTEEN)\b",
        re.IGNORECASE,
    )

    word_to_num = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
        "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
        "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
        "fifteen": 15, "sixteen": 16,
    }

    for idx, page in enumerate(doc):
        text = page_texts[idx]
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        for i, line in enumerate(lines[:5]):
            m = chapter_heading_re.match(line)
            if m:
                raw_num = m.group(1).lower()
                ch_num = int(raw_num) if raw_num.isdigit() else word_to_num.get(raw_num, len(detected_chapters) + 1)
                # Next line is title
                title = "Chapter"
                if i + 1 < len(lines):
                    title = lines[i + 1].strip()
                detected_chapters.append((ch_num, title, idx))
                break

    # Validate against contents page if found
    if contents_chapters and len(contents_chapters) != len(detected_chapters):
        msg = (
            f"DISAGREEMENT: Contents page lists {len(contents_chapters)} chapters, "
            f"but detected {len(detected_chapters)} chapter starts across the PDF.\n"
            f"Contents: {contents_chapters}\nDetected: {detected_chapters}"
        )
        logger.error(msg)
        raise ValueError(msg)

    # Build ChapterInfo list
    chapters: List[ChapterInfo] = []
    if not detected_chapters:
        # Single chapter fallback
        start_p = page_mapping.get(0, 1)
        end_p = page_mapping.get(len(doc) - 1, len(doc))
        chapters.append(
            ChapterInfo(
                number=1,
                title="Full Textbook",
                start_page=start_p,
                end_page=end_p,
            )
        )
        return chapters

    for i, (ch_num, title, p_idx) in enumerate(detected_chapters):
        start_p = page_mapping.get(p_idx, p_idx + 1)
        if i + 1 < len(detected_chapters):
            next_p_idx = detected_chapters[i + 1][2] - 1
            end_p = page_mapping.get(next_p_idx, next_p_idx + 1)
        else:
            last_idx = len(doc) - 1
            end_p = page_mapping.get(last_idx, last_idx + 1)

        chapters.append(
            ChapterInfo(
                number=ch_num,
                title=title.title(),
                start_page=start_p,
                end_page=end_p,
            )
        )

    return chapters


def extract_section_headings_from_doc(doc: fitz.Document) -> Dict[str, str]:
    """
    Scan pages in doc and extract clean section titles for section numbers (e.g. '13.4.2').
    Uses bold/larger font spans when available, truncates at end of heading line (max ~80 chars).
    """
    headings: Dict[str, str] = {}
    for page in doc:
        blocks = page.get_text("dict").get("blocks", [])
        for b in blocks:
            if "lines" not in b:
                continue
            for l in b["lines"]:
                spans = l.get("spans", [])
                if not spans:
                    continue
                line_str = " ".join(s["text"].strip() for s in spans if s["text"].strip())
                m = re.match(r"^(\d+(?:\.\d+)+)\s+([A-Za-z].*)$", line_str)
                if not m:
                    continue
                sec_num = m.group(1)
                is_bold = ("bold" in spans[0]["font"].lower()) or (spans[0]["flags"] & 16 != 0)
                title_spans = []
                collecting = True
                for s in spans:
                    t = s["text"].strip()
                    if not t:
                        continue
                    s_bold = ("bold" in s["font"].lower()) or (s["flags"] & 16 != 0)
                    if collecting:
                        if is_bold and not s_bold and title_spans:
                            collecting = False
                        else:
                            title_spans.append(t)
                clean_title = " ".join(title_spans).strip()
                clean_title = re.sub(r"\s+", " ", clean_title)
                if len(clean_title) > 80:
                    clean_title = clean_title[:80].rsplit(" ", 1)[0]
                if sec_num not in headings:
                    headings[sec_num] = clean_title
    return headings


def segment_text_into_sections(
    pages_data: List[Tuple[int, str, int]],  # (pdf_idx, cleaned_text, printed_page)
    chapter_title: str,
    headings_map: Optional[Dict[str, str]] = None,
) -> List[SectionSpan]:
    """
    Split chapter pages into sections matching ^\\d+(\\.\\d+)+\\s+[A-Za-z] at line start.
    Keep section title on every chunk until the next heading.
    Text before the first section uses the chapter title.
    Every sentence belongs to strictly one section (zero duplication).
    """
    from ingest.chunker import split_into_sentences

    headings_map = headings_map or {}
    sections: List[SectionSpan] = []
    current_section_title = chapter_title
    current_content: List[str] = []
    current_segments: List[Any] = []
    current_start_page: Optional[int] = None
    current_end_page: Optional[int] = None

    for pdf_idx, text, printed_page in pages_data:
        lines = text.splitlines()
        for line in lines:
            trimmed = line.strip()
            if not trimmed:
                continue

            # Check if this line is a section heading
            m = re.match(r"^(\d+(?:\.\d+)+)\s+([A-Za-z].*)$", trimmed)
            if m:
                sec_num = m.group(1)
                # Flush previous section if it has content
                if current_segments or current_content:
                    sections.append(
                        SectionSpan(
                            title=current_section_title,
                            content="\n".join(current_content).strip(),
                            page_start=current_start_page if current_start_page is not None else printed_page,
                            page_end=current_end_page if current_end_page is not None else printed_page,
                            segments=current_segments,
                        )
                    )
                    current_content = []
                    current_segments = []

                # Determine clean section title
                if sec_num in headings_map:
                    clean_title = headings_map[sec_num]
                else:
                    clean_title = trimmed
                    if len(clean_title) > 80:
                        clean_title = clean_title[:80].rsplit(" ", 1)[0]

                current_section_title = clean_title
                current_start_page = printed_page
                current_end_page = printed_page

                # Check if there is run-in body text after the title on the same line
                remainder = ""
                if trimmed.startswith(clean_title):
                    remainder = trimmed[len(clean_title):].strip()
                elif len(trimmed) > len(clean_title):
                    remainder = trimmed[len(sec_num):].strip()
                    for word in clean_title.split()[1:]:
                        if remainder.startswith(word):
                            remainder = remainder[len(word):].strip()

                if remainder and len(remainder) > 3:
                    current_content.append(remainder)
                    current_segments.extend(split_into_sentences(remainder, printed_page))
            else:
                if current_start_page is None:
                    current_start_page = printed_page
                current_end_page = printed_page
                current_content.append(trimmed)
                current_segments.extend(split_into_sentences(trimmed, printed_page))

    # Flush final section
    if current_segments or current_content:
        sections.append(
            SectionSpan(
                title=current_section_title,
                content="\n".join(current_content).strip(),
                page_start=current_start_page if current_start_page is not None else printed_page,
                page_end=current_end_page if current_end_page is not None else printed_page,
                segments=current_segments,
            )
        )

    return sections
