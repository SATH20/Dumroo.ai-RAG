"""Gemini embeddings generation with batching, retries, exponential backoff, disk caching, and jitter."""

import re
import json
import time
import random
import logging
from pathlib import Path
from typing import List, Optional
from google.genai import types
from tqdm import tqdm

from ingest.config import EMBEDDING_MODEL, EMBEDDING_DIM, CACHE_DIR, get_gemini_client, rotate_gemini_key

logger = logging.getLogger("ingest.embeddings")


def parse_retry_delay(error_message: str) -> Optional[float]:
    """Extract recommended retry delay in seconds from Gemini quota error message."""
    m = re.search(r"retry(?:\s+in|delay['\":\s]+)\s*(\d+(?:\.\d+)?)s?", error_message, re.IGNORECASE)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            return None
    return None


def generate_embeddings_batch(
    texts: List[str],
    task_type: str = "RETRIEVAL_DOCUMENT",
    max_retries: int = 8,
    base_delay: float = 5.0,
) -> List[List[float]]:
    """
    Generate embeddings for a batch of texts using Google GenAI SDK.
    Uses rate-limit backoff that guarantees rolling-window reset on 429.
    """
    if not texts:
        return []

    client = get_gemini_client()
    config = types.EmbedContentConfig(
        task_type=task_type,
        output_dimensionality=EMBEDDING_DIM,
    )

    for attempt in range(max_retries):
        try:
            response = client.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=texts,
                config=config,
            )
            if not response.embeddings:
                raise ValueError("Received empty embeddings response from Gemini API")
            return [emb.values for emb in response.embeddings]
        except Exception as e:
            err_msg = str(e)
            err_lower = err_msg.lower()

            is_quota_or_rate = "429" in err_lower or "resource exhausted" in err_lower or "quota" in err_lower
            if is_quota_or_rate and rotate_gemini_key():
                logger.warning("Primary Gemini key exhausted. Automatically rotated to backup key!")
                client = get_gemini_client()
                time.sleep(2.0)
                continue

            is_transient = is_quota_or_rate or any(
                code in err_lower
                for code in ["500", "502", "503", "504", "timeout"]
            )
            if not is_transient and attempt == 0 and "api_key" in err_lower:
                raise

            if attempt == max_retries - 1:
                logger.error(f"Failed to generate embeddings after {max_retries} attempts: {e}")
                raise

            # On quota exhaustion (30k TPM Free Tier), the rolling window is 60s.
            # We must wait at least 65s for the window to reset completely.
            suggested = parse_retry_delay(err_msg)
            if is_quota_or_rate:
                delay = max(65.0, (suggested + 5.0) if suggested else 65.0) + random.uniform(1.0, 3.0)
            else:
                delay = base_delay * (2 ** attempt) + random.uniform(1.0, 3.0)

            logger.warning(
                f"Gemini API rate limit/quota reached. Pausing {delay:.1f}s for quota window reset (attempt {attempt + 1}/{max_retries})..."
            )
            time.sleep(delay)

    return []


def embed_chunks(
    chunk_items: List[dict],
    book_title: str,
    chapter_number: int,
    chapter_title: str,
    subject: str = "maths",
    batch_size: int = 20,
) -> List[List[float]]:
    """
    Embed list of chunks prefixed with:
    'Book: X | Chapter N: Title | Section: S\n\n<content>'
    Caches results per chapter in ingest/cache/<subject>/emb_<model>_ch<NN>.json.
    """
    if not chunk_items:
        return []

    # Check disk cache first (namespaced by model to avoid cross-model contamination)
    cache_dir = CACHE_DIR / subject
    cache_dir.mkdir(parents=True, exist_ok=True)
    clean_model_name = EMBEDDING_MODEL.replace("-", "_").replace(".", "_")
    emb_cache_file = cache_dir / f"emb_{clean_model_name}_ch{chapter_number:02d}.json"

    if emb_cache_file.exists():
        try:
            cached_data = json.loads(emb_cache_file.read_text(encoding="utf-8"))
            if len(cached_data) == len(chunk_items):
                logger.info(f"Loaded {len(cached_data)} cached {EMBEDDING_MODEL} embeddings for Chapter {chapter_number}")
                return cached_data
        except Exception:
            pass

    prefixed_texts = []
    for c in chunk_items:
        section_title = c.get("section_title", chapter_title)
        content = c["content"]
        prefixed = f"Book: {book_title} | Chapter {chapter_number}: {chapter_title} | Section: {section_title}\n\n{content}"
        prefixed_texts.append(prefixed)

    all_embeddings: List[List[float]] = []
    total = len(prefixed_texts)

    with tqdm(total=total, desc=f"Embedding Ch {chapter_number:02d}", unit="chunk") as pbar:
        for i in range(0, total, batch_size):
            batch = prefixed_texts[i : i + batch_size]
            embeddings = generate_embeddings_batch(batch, task_type="RETRIEVAL_DOCUMENT")
            all_embeddings.extend(embeddings)
            pbar.update(len(batch))

            # Pacing: ~8,800 tokens per 20-chunk batch. Waiting 20s keeps token consumption at ~26k TPM (well below 30k limit)
            if i + batch_size < total:
                time.sleep(20.0)

    # Save to disk cache
    try:
        emb_cache_file.write_text(json.dumps(all_embeddings), encoding="utf-8")
    except Exception as e:
        logger.warning(f"Failed to cache embeddings for ch {chapter_number}: {e}")

    return all_embeddings


def embed_query(query: str) -> List[float]:
    """Embed a single search query using RETRIEVAL_QUERY task type."""
    res = generate_embeddings_batch([query], task_type="RETRIEVAL_QUERY")
    if not res:
        raise ValueError("Failed to generate query embedding")
    return res[0]
