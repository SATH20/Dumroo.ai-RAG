"""Document chunker: ~500 tokens with 50-token overlap, paragraph/sentence splitting."""

import re
import logging
from dataclasses import dataclass
from typing import List, Tuple
import tiktoken

logger = logging.getLogger("ingest.chunker")

# Initialize tiktoken encoder
try:
    _tokenizer = tiktoken.get_encoding("cl100k_base")
except Exception:
    _tokenizer = None


def count_tokens(text: str) -> int:
    """Accurately count tokens using cl100k_base or fallback word-ratio."""
    if _tokenizer is not None:
        return len(_tokenizer.encode(text, disallowed_special=()))
    # Fallback approximation: 1 token ~ 0.75 words / 4 chars
    return max(1, int(len(text) / 4))


@dataclass
class TextSegment:
    text: str
    page: int
    token_count: int


@dataclass
class Chunk:
    chunk_index: int
    page_number: int
    page_end: int
    section_title: str
    content: str
    token_count: int


def split_into_sentences(text: str, page: int) -> List[TextSegment]:
    """Split text into sentences/paragraphs while keeping page attribution."""
    # Split by double newline first (paragraphs)
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    segments: List[TextSegment] = []

    # Regex to split on sentence ends without cutting abbreviations like i.e., e.g., Fig.
    sentence_splitter = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9])")

    for para in paragraphs:
        sentences = sentence_splitter.split(para)
        for s in sentences:
            s_clean = s.strip()
            if s_clean:
                segments.append(
                    TextSegment(
                        text=s_clean,
                        page=page,
                        token_count=count_tokens(s_clean),
                    )
                )

    return segments


def chunk_section(
    section_title: str,
    segments: List[TextSegment],
    starting_chunk_index: int,
    target_tokens: int = 500,
    overlap_tokens: int = 50,
) -> Tuple[List[Chunk], int]:
    """
    Chunk a sequence of text segments belonging to one section.
    Respects paragraph and sentence boundaries, never splitting mid-word.
    Never crosses section boundaries.
    Returns (chunks, next_chunk_index).
    """
    if not segments:
        return [], starting_chunk_index

    chunks: List[Chunk] = []
    current_segments: List[TextSegment] = []
    current_tokens = 0
    chunk_idx = starting_chunk_index

    i = 0
    while i < len(segments):
        seg = segments[i]

        # Handle extraordinarily long segment (e.g. single giant paragraph without periods)
        if seg.token_count > target_tokens + 50:
            words = seg.text.split()
            sub_chunk_words: List[str] = []
            sub_tokens = 0
            for w in words:
                sub_chunk_words.append(w)
                sub_tokens += max(1, int(len(w) / 4))
                if sub_tokens >= target_tokens:
                    chunk_text = " ".join(sub_chunk_words)
                    c_tokens = count_tokens(chunk_text)
                    chunks.append(
                        Chunk(
                            chunk_index=chunk_idx,
                            page_number=seg.page,
                            page_end=seg.page,
                            section_title=section_title,
                            content=chunk_text,
                            token_count=c_tokens,
                        )
                    )
                    chunk_idx += 1
                    # Overlap with last few words
                    sub_chunk_words = sub_chunk_words[-15:]
                    sub_tokens = max(1, int(len(" ".join(sub_chunk_words)) / 4))

            if sub_chunk_words:
                remaining_text = " ".join(sub_chunk_words)
                current_segments.append(
                    TextSegment(
                        text=remaining_text,
                        page=seg.page,
                        token_count=count_tokens(remaining_text),
                    )
                )
                current_tokens += count_tokens(remaining_text)
            i += 1
            continue

        if current_tokens + seg.token_count <= target_tokens or current_tokens < 350:
            current_segments.append(seg)
            current_tokens += seg.token_count
            i += 1
        else:
            # Finalize current chunk
            chunk_content = " ".join(s.text for s in current_segments)
            page_start = min(s.page for s in current_segments)
            page_end = max(s.page for s in current_segments)
            c_tokens = count_tokens(chunk_content)

            chunks.append(
                Chunk(
                    chunk_index=chunk_idx,
                    page_number=page_start,
                    page_end=page_end,
                    section_title=section_title,
                    content=chunk_content,
                    token_count=c_tokens,
                )
            )
            chunk_idx += 1

            # Prepare overlap
            overlap_segments: List[TextSegment] = []
            ov_tokens = 0
            for s in reversed(current_segments):
                overlap_segments.insert(0, s)
                ov_tokens += s.token_count
                if ov_tokens >= overlap_tokens:
                    break

            current_segments = list(overlap_segments)
            current_tokens = sum(s.token_count for s in current_segments)
            # Add the current segment
            current_segments.append(seg)
            current_tokens += seg.token_count
            i += 1

    # Finalize remaining segments
    if current_segments:
        chunk_content = " ".join(s.text for s in current_segments)
        page_start = min(s.page for s in current_segments)
        page_end = max(s.page for s in current_segments)
        c_tokens = count_tokens(chunk_content)

        chunks.append(
            Chunk(
                chunk_index=chunk_idx,
                page_number=page_start,
                page_end=page_end,
                section_title=section_title,
                content=chunk_content,
                token_count=c_tokens,
            )
        )
        chunk_idx += 1

    return chunks, chunk_idx


def merge_small_chunks(chunks: List[Chunk], min_tokens: int = 60) -> List[Chunk]:
    """
    Merge chunks under min_tokens (e.g. chapter-opening quotes or small stubs)
    into the following chunk instead of storing them alone.
    If the last chunk in a chapter is under min_tokens, merges into previous chunk.
    Re-indexes chunk_index starting strictly at 0.
    """
    if not chunks:
        return []

    merged: List[Chunk] = []
    i = 0
    while i < len(chunks):
        c = chunks[i]
        if c.token_count < min_tokens and i + 1 < len(chunks):
            next_c = chunks[i + 1]
            combined = f"{c.content}\n\n{next_c.content}".strip()
            chunks[i + 1] = Chunk(
                chunk_index=next_c.chunk_index,
                page_number=min(c.page_number, next_c.page_number),
                page_end=max(c.page_end, next_c.page_end),
                section_title=next_c.section_title if next_c.section_title else c.section_title,
                content=combined,
                token_count=count_tokens(combined),
            )
            i += 1
        elif c.token_count < min_tokens and merged:
            prev_c = merged[-1]
            combined = f"{prev_c.content}\n\n{c.content}".strip()
            merged[-1] = Chunk(
                chunk_index=prev_c.chunk_index,
                page_number=min(prev_c.page_number, c.page_number),
                page_end=max(prev_c.page_end, c.page_end),
                section_title=prev_c.section_title,
                content=combined,
                token_count=count_tokens(combined),
            )
            i += 1
        else:
            merged.append(c)
            i += 1

    # Re-index strictly starting at 0 for the chapter
    for idx, c in enumerate(merged):
        c.chunk_index = idx

    return merged
