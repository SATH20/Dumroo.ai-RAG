"""
Standalone script: re-extract figures at high resolution (300 DPI clip rendering).
Preserves vector labels, maps, and diagrams sharp.
"""

import argparse
import hashlib
import io
import logging
import os
import re
import sys
from typing import Dict, List, Optional, Set, Tuple

import fitz
from PIL import Image

sys.path.insert(0, ".")
from ingest.config import STORAGE_BUCKET, get_supabase_client
from ingest.page_mapping import build_page_mapping
from ingest.images import find_decorative_image_hashes

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("reextract_figures")

import cv2
import numpy as np

BOOK_TITLE_TO_SUBJECT = {
    "history": "history",
    "themes in world history": "history",
    "physics": "physics",
    "physics part 1": "physics",
    "physics part 2": "physics",
    "maths": "maths",
    "mathematics": "maths",
    "chemistry": "chemistry",
    "chemistry part 1": "chemistry",
    "biology": "biology",
}

# Mapping from DB chapter numbers to official high-res NCERT split PDFs in ncert_split_backup
# Format: (relative_pdf_path, pdf_page_offset, start_printed_page)
HISTORY_CHAPTER_SPLIT_MAP = {
    2: ("data/history/ncert_split_backup/kehs101.pdf", 8, 29),
    3: ("data/history/ncert_split_backup/kehs102.pdf", 9, 38),
    5: ("data/history/ncert_split_backup/kehs102.pdf", 29, 58),
    6: ("data/history/ncert_split_backup/kehs104.pdf", 0, 86),
    7: ("data/history/ncert_split_backup/kehs105.pdf", 0, 106),
    10: ("data/history/ncert_split_backup/kehs106.pdf", 0, 213),
    11: ("data/history/ncert_split_backup/kehs107.pdf", 0, 231),
}

def get_pdf_for_subject_and_chapter(subject: str, ch_num: int) -> Optional[str]:
    subj_dir = os.path.join("data", subject)
    if subject == "history":
        if ch_num in HISTORY_CHAPTER_SPLIT_MAP:
            split_path = HISTORY_CHAPTER_SPLIT_MAP[ch_num][0]
            if os.path.exists(split_path):
                return split_path
        return os.path.join(subj_dir, "NCERT-Class-11-History.pdf")
    elif subject == "physics":
        return os.path.join(subj_dir, f"keph10{ch_num}.pdf" if ch_num <= 7 else f"keph20{ch_num - 7}.pdf")
    elif subject == "maths":
        return os.path.join(subj_dir, f"kemh1{ch_num:02d}.pdf")
    elif subject == "chemistry":
        return os.path.join(subj_dir, f"kech1{ch_num:02d}.pdf")
    elif subject == "biology":
        return os.path.join(subj_dir, f"kebo1{ch_num:02d}.pdf")
    return None


class FigureReextractor:
    def __init__(self, max_dim: int = 1800, thumb_dim: int = 480):
        self.max_dim = max_dim
        self.thumb_dim = thumb_dim
        self.sp = get_supabase_client()
        self.doc_cache: Dict[str, fitz.Document] = {}
        self.page_mapping_cache: Dict[str, Dict[int, int]] = {}
        self.dec_hashes_cache: Dict[str, Set[str]] = {}

    def get_doc(self, pdf_path: str) -> fitz.Document:
        if pdf_path not in self.doc_cache:
            self.doc_cache[pdf_path] = fitz.open(pdf_path)
        return self.doc_cache[pdf_path]

    def get_page_mapping(self, doc: fitz.Document, pdf_path: str, subject: str) -> Dict[int, int]:
        if pdf_path in self.page_mapping_cache:
            return self.page_mapping_cache[pdf_path]

        if subject == "history":
            # Exact mapping: p_idx = printed_page + 1
            pm = {p_idx: max(1, p_idx - 1) for p_idx in range(len(doc))}
        else:
            texts = [doc[i].get_text() for i in range(len(doc))]
            pm = build_page_mapping(texts, os.path.basename(pdf_path))

        self.page_mapping_cache[pdf_path] = pm
        return pm

    def process_record(
        self,
        record: dict,
        dry_run: bool = False,
    ) -> Optional[dict]:
        storage_path = record["storage_path"]
        m = re.match(r"([^/]+)/ch(\d+)/p(\d+)_(\d+)\.png", storage_path)
        if not m:
            logger.warning(f"Could not parse storage_path: {storage_path}")
            return None

        subject, ch_str, p_str, idx_str = m.groups()
        ch_num = int(ch_str)
        printed_page = int(p_str)
        img_idx = int(idx_str)

        pdf_path = get_pdf_for_subject_and_chapter(subject, ch_num)
        if not pdf_path or not os.path.exists(pdf_path):
            logger.error(f"PDF not found for {storage_path}: {pdf_path}")
            return None

        doc = self.get_doc(pdf_path)
        pm = self.get_page_mapping(doc, pdf_path, subject)

        # Locate page index in PDF
        if subject == "history":
            if ch_num in HISTORY_CHAPTER_SPLIT_MAP:
                _, p_offset, start_p = HISTORY_CHAPTER_SPLIT_MAP[ch_num]
                target_p_idx = p_offset + (printed_page - start_p)
                if target_p_idx < 0 or target_p_idx >= len(doc):
                    target_p_idx = None
            else:
                target_p_idx = printed_page + 1 if printed_page + 1 < len(doc) else None
        else:
            target_p_idx = next((i for i, p in pm.items() if p == printed_page), None)

        if target_p_idx is None or target_p_idx >= len(doc):
            logger.warning(f"Could not map printed page {printed_page} for {storage_path}")
            return None

        page = doc[target_p_idx]
        page_imgs = page.get_images(full=True)
        if not page_imgs:
            logger.warning(f"No images on PDF page index {target_p_idx} for {storage_path}")
            return None

        # Find candidate images on this page matching filters
        if pdf_path not in self.dec_hashes_cache:
            self.dec_hashes_cache[pdf_path] = find_decorative_image_hashes(doc)
        dec_hashes = self.dec_hashes_cache[pdf_path]

        candidate_xrefs = []
        for info in page_imgs:
            xref = info[0]
            try:
                base = doc.extract_image(xref)
                if not base:
                    continue
                w, h = base.get("width", 0), base.get("height", 0)
                if w < 100 or h < 100:
                    continue
                if max(w, h) / max(1, min(w, h)) > 8.0:
                    continue
                md5 = hashlib.md5(base["image"]).hexdigest()
                if md5 in dec_hashes:
                    continue
                candidate_xrefs.append((xref, base))
            except Exception:
                continue

        # Target xref: match by stored original dimensions, or by img_idx
        target_xref = None
        target_base = None
        for xref, base in candidate_xrefs:
            if base["width"] == record["width"] and base["height"] == record["height"]:
                target_xref = xref
                target_base = base
                break

        if target_xref is None and candidate_xrefs:
            # Fall back to index if within bounds
            if img_idx < len(candidate_xrefs):
                target_xref, target_base = candidate_xrefs[img_idx]
            else:
                target_xref, target_base = candidate_xrefs[0]

        if target_xref is None:
            # Last fallback: use first raw image on page
            target_xref = page_imgs[0][0]
            target_base = doc.extract_image(target_xref)

        # 1. Render high-res clip using bounding box
        rects = page.get_image_rects(target_xref)
        rendered_clip_img = None
        if rects:
            bbox = rects[0]
            # Add ~8px padding
            padded_bbox = fitz.Rect(bbox.x0 - 8, bbox.y0 - 8, bbox.x1 + 8, bbox.y1 + 8) & page.rect
            zoom = 300.0 / 72.0
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=padded_bbox, alpha=False)
            rendered_clip_img = None
            try:
                rendered_clip_img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
            except Exception as e:
                logger.warning(f"Failed to convert pixmap for {storage_path}: {e}")
                rendered_clip_img = None

        # 2. Native resolution fallback
        native_img = None
        if target_base and "image" in target_base:
            try:
                native_img = Image.open(io.BytesIO(target_base["image"])).convert("RGB")
            except Exception:
                pass

        # Choose whichever is larger or preferred
        if rendered_clip_img and native_img:
            # Pick whichever has more total pixels (or clip if comparable)
            if rendered_clip_img.width * rendered_clip_img.height >= native_img.width * native_img.height:
                chosen_img = rendered_clip_img
                mode = "clip_300dpi"
            else:
                chosen_img = native_img
                mode = "native_extract"
        elif rendered_clip_img:
            chosen_img = rendered_clip_img
            mode = "clip_300dpi"
        elif native_img:
            chosen_img = native_img
            mode = "native_extract"
        else:
            logger.error(f"Failed to produce image for {storage_path}")
            return None

        # 2.5 Apply subtle contrast and unsharp enhancement for razor-sharp diagrams and text
        try:
            rgb_arr = np.array(chosen_img)
            lab = cv2.cvtColor(rgb_arr, cv2.COLOR_RGB2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=1.6, tileGridSize=(8, 8))
            cl = clahe.apply(l)
            enhanced_lab = cv2.merge((cl, a, b))
            enhanced_rgb = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2RGB)

            gaussian = cv2.GaussianBlur(enhanced_rgb, (0, 0), 2.0)
            unsharp = cv2.addWeighted(enhanced_rgb, 1.5, gaussian, -0.5, 0)
            chosen_img = Image.fromarray(unsharp)
        except Exception as e:
            logger.debug(f"Enhancement skipped for {storage_path}: {e}")

        # 3. Create full version (WebP quality 85, capped at max_dim)
        if max(chosen_img.width, chosen_img.height) > self.max_dim:
            scale = self.max_dim / max(chosen_img.width, chosen_img.height)
            full_w = int(round(chosen_img.width * scale))
            full_h = int(round(chosen_img.height * scale))
            full_img = chosen_img.resize((full_w, full_h), Image.Resampling.LANCZOS)
        else:
            full_img = chosen_img

        full_buf = io.BytesIO()
        full_img.save(full_buf, format="WEBP", quality=85)
        full_bytes = full_buf.getvalue()

        # 4. Create thumb version (WebP quality 80, capped at thumb_dim)
        if max(chosen_img.width, chosen_img.height) > self.thumb_dim:
            t_scale = self.thumb_dim / max(chosen_img.width, chosen_img.height)
            thumb_w = int(round(chosen_img.width * t_scale))
            thumb_h = int(round(chosen_img.height * t_scale))
            thumb_img = chosen_img.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        else:
            thumb_img = chosen_img

        thumb_buf = io.BytesIO()
        thumb_img.save(thumb_buf, format="WEBP", quality=80)
        thumb_bytes = thumb_buf.getvalue()

        thumb_path = storage_path.rsplit(".", 1)[0] + "_thumb.webp"

        result = {
            "id": record["id"],
            "storage_path": storage_path,
            "thumb_path": thumb_path,
            "mode": mode,
            "old_dim": (record["width"], record["height"]),
            "new_dim": (full_img.width, full_img.height),
            "thumb_dim": (thumb_img.width, thumb_img.height),
            "full_size_bytes": len(full_bytes),
            "thumb_size_bytes": len(thumb_bytes),
        }

        if not dry_run:
            bucket = self.sp.storage.from_(STORAGE_BUCKET)
            # Upload full (overwrites existing storage_path with sharp WebP)
            bucket.upload(
                path=storage_path,
                file=full_bytes,
                file_options={"content-type": "image/webp", "upsert": "true"},
            )
            # Upload thumb
            bucket.upload(
                path=thumb_path,
                file=thumb_bytes,
                file_options={"content-type": "image/webp", "upsert": "true"},
            )
            # Update DB width and height
            self.sp.table("images").update({
                "width": full_img.width,
                "height": full_img.height,
            }).eq("id", record["id"]).execute()

        return result


def main():
    parser = argparse.ArgumentParser(description="Re-extract figures at high resolution (300 DPI clip rendering)")
    parser.add_argument("--book", "--subject", dest="book", type=str, default=None, help="Subject/Book name (e.g. History, Physics)")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of figures to process")
    parser.add_argument("--dry-run", action="store_true", help="Perform dry run without uploading or modifying DB")
    parser.add_argument("--max-dim", type=int, default=1800, help="Maximum dimension for full image")
    parser.add_argument("--thumb-dim", type=int, default=480, help="Maximum dimension for thumbnail")
    args = parser.parse_args()

    reextractor = FigureReextractor(max_dim=args.max_dim, thumb_dim=args.thumb_dim)
    sp = reextractor.sp

    query = sp.table("images").select("id, storage_path, width, height, page_number, chapter_id, book_id")
    
    if args.book:
        subj = BOOK_TITLE_TO_SUBJECT.get(args.book.lower(), args.book.lower())
        query = query.like("storage_path", f"{subj}/%")

    query = query.order("storage_path")
    if args.limit:
        query = query.limit(args.limit)

    res = query.execute()
    records = res.data or []
    logger.info(f"Loaded {len(records)} figure records to process (dry_run={args.dry_run})")

    results = []
    total_full_bytes = 0
    total_thumb_bytes = 0

    for idx, rec in enumerate(records):
        res = reextractor.process_record(rec, dry_run=args.dry_run)
        if res:
            results.append(res)
            total_full_bytes += res["full_size_bytes"]
            total_thumb_bytes += res["thumb_size_bytes"]
            logger.info(
                f"[{idx+1}/{len(records)}] {res['storage_path']}: "
                f"{res['old_dim'][0]}x{res['old_dim'][1]} -> {res['new_dim'][0]}x{res['new_dim'][1]} ({res['mode']}) "
                f"full={res['full_size_bytes']/1024:.1f}KB, thumb={res['thumb_size_bytes']/1024:.1f}KB"
            )

    print("\n" + "=" * 60)
    print(f"RE-EXTRACTION SUMMARY ({'DRY RUN' if args.dry_run else 'EXECUTED'})")
    print("=" * 60)
    print(f"Total processed: {len(results)} figures")
    print(f"Total Full Size: {total_full_bytes / (1024*1024):.2f} MB")
    print(f"Total Thumb Size: {total_thumb_bytes / (1024*1024):.2f} MB")
    print(f"Combined Size: {(total_full_bytes + total_thumb_bytes) / (1024*1024):.2f} MB")
    if results:
        avg_full = total_full_bytes / len(results) / 1024
        avg_thumb = total_thumb_bytes / len(results) / 1024
        print(f"Average Full: {avg_full:.1f} KB, Average Thumb: {avg_thumb:.1f} KB")


if __name__ == "__main__":
    main()
