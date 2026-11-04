"""Image extraction, filtering, PNG conversion, and Supabase storage upload."""

import io
import hashlib
import logging
from dataclasses import dataclass
from typing import Dict, List, Optional, Set, Tuple
import fitz
from PIL import Image

from ingest.config import STORAGE_BUCKET, get_supabase_client

logger = logging.getLogger("ingest.images")


@dataclass
class ExtractedImage:
    page_number: int  # printed page
    chapter_number: int
    image_index: int
    storage_path: str
    width: int
    height: int
    png_bytes: bytes
    md5_hash: str


@dataclass
class RenderedPageImage:
    page_number: int
    chapter_number: int
    storage_path: str
    jpeg_bytes: bytes


def render_page_to_jpeg(
    doc: fitz.Document,
    page_idx: int,
    printed_page: int,
    chapter_num: int,
    subject: str,
    dpi: int = 110,
    quality: int = 75,
) -> RenderedPageImage:
    """Render full PDF page to JPEG at ~110 DPI (quality 75)."""
    page = doc[page_idx]
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    jpeg_bytes = pix.tobytes(output="jpeg", jpg_quality=quality)
    storage_path = f"{subject}/pages/p{printed_page}.jpg"
    return RenderedPageImage(
        page_number=printed_page,
        chapter_number=chapter_num,
        storage_path=storage_path,
        jpeg_bytes=jpeg_bytes,
    )


def upload_page_image_to_storage(rendered: RenderedPageImage, sp_client=None) -> bool:
    """Upload rendered full page JPEG to textbook-images Supabase Storage."""
    client = sp_client or get_supabase_client()
    try:
        bucket = client.storage.from_(STORAGE_BUCKET)
        bucket.upload(
            path=rendered.storage_path,
            file=rendered.jpeg_bytes,
            file_options={"content-type": "image/jpeg", "upsert": "true"},
        )
        return True
    except Exception as e:
        logger.error(f"Failed to upload page image {rendered.storage_path}: {e}")
        return False


def find_decorative_image_hashes(doc: fitz.Document) -> Set[str]:
    """Scan the entire document to detect decorative images that appear on > 3 pages."""
    hash_to_pages: Dict[str, Set[int]] = {}

    for p_idx, page in enumerate(doc):
        image_list = page.get_images(full=True)
        for img_info in image_list:
            xref = img_info[0]
            try:
                base_img = doc.extract_image(xref)
                if not base_img:
                    continue
                img_data = base_img["image"]
                h = hashlib.md5(img_data).hexdigest()
                if h not in hash_to_pages:
                    hash_to_pages[h] = set()
                hash_to_pages[h].add(p_idx)
            except Exception:
                continue

    decorative_hashes = {h for h, pages in hash_to_pages.items() if len(pages) > 3}
    if decorative_hashes:
        logger.debug(f"Detected {len(decorative_hashes)} recurring decorative images (appearing on >3 pages)")
    return decorative_hashes


def extract_images_from_page(
    doc: fitz.Document,
    page_idx: int,
    printed_page: int,
    chapter_num: int,
    subject: str,
    decorative_hashes: Set[str],
    seen_hashes: Set[str],
    max_images_per_page: int = 40,
) -> List[ExtractedImage]:
    """
    Extract embedded images from a single page:
    - skips under 100x100
    - skips aspect ratio > 8:1
    - skips exact duplicates & decorative repeats
    - max 40 per page
    - converts to PNG
    """
    page = doc[page_idx]
    image_list = page.get_images(full=True)
    images: List[ExtractedImage] = []
    ch_str = f"ch{chapter_num:02d}"

    for img_info in image_list:
        if len(images) >= max_images_per_page:
            break

        xref = img_info[0]
        try:
            base_img = doc.extract_image(xref)
            if not base_img:
                continue

            width = base_img.get("width", 0)
            height = base_img.get("height", 0)

            # Skip small images
            if width < 100 or height < 100:
                continue

            # Skip aspect ratio over 8:1
            aspect_ratio = max(width, height) / max(1, min(width, height))
            if aspect_ratio > 8.0:
                continue

            raw_bytes = base_img["image"]
            h = hashlib.md5(raw_bytes).hexdigest()

            # Skip decorative images appearing on multiple pages
            if h in decorative_hashes:
                continue

            # Skip exact duplicates
            if h in seen_hashes:
                continue
            seen_hashes.add(h)

            # Convert to PNG
            pil_img = Image.open(io.BytesIO(raw_bytes))
            # Convert CMYK/RGBA/P to RGB if needed, or keep RGBA
            if pil_img.mode in ("CMYK", "P"):
                pil_img = pil_img.convert("RGB")

            out_buf = io.BytesIO()
            pil_img.save(out_buf, format="PNG")
            png_bytes = out_buf.getvalue()

            img_idx = len(images)
            storage_path = f"{subject}/{ch_str}/p{printed_page}_{img_idx}.png"

            images.append(
                ExtractedImage(
                    page_number=printed_page,
                    chapter_number=chapter_num,
                    image_index=img_idx,
                    storage_path=storage_path,
                    width=width,
                    height=height,
                    png_bytes=png_bytes,
                    md5_hash=h,
                )
            )
        except Exception as e:
            logger.debug(f"Failed to process image xref {xref} on page {page_idx}: {e}")
            continue

    return images


def upload_image_to_storage(supabase_client, image: ExtractedImage) -> bool:
    """Upload extracted PNG image to Supabase Storage textbook-images bucket."""
    try:
        supabase_client.storage.from_(STORAGE_BUCKET).upload(
            path=image.storage_path,
            file=image.png_bytes,
            file_options={"content-type": "image/png", "upsert": "true"},
        )
        return True
    except Exception as e:
        logger.error(f"Failed to upload {image.storage_path} to storage: {e}")
        return False
