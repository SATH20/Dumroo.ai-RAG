import sys
import os
import re
sys.path.insert(0, ".")
from ingest.config import get_supabase_client
from ingest.page_mapping import build_page_mapping
from ingest.images import find_decorative_image_hashes
import fitz

sp = get_supabase_client()
res = sp.table("images").select("id, storage_path, width, height, page_number, chapter_id, book_id").execute()
all_images = res.data
print(f"Total images in DB: {len(all_images)}")

# Helper to find chapter file
def get_pdf_for_subject_and_chapter(subject: str, ch_num: int):
    subj_dir = os.path.join("data", subject)
    if subject == "history":
        return os.path.join(subj_dir, "NCERT-Class-11-History.pdf")
    elif subject == "physics":
        if ch_num <= 7:
            return os.path.join(subj_dir, f"keph10{ch_num}.pdf")
        else:
            return os.path.join(subj_dir, f"keph20{ch_num - 7}.pdf")
    elif subject == "maths":
        return os.path.join(subj_dir, f"kemh1{ch_num:02d}.pdf")
    elif subject == "chemistry":
        return os.path.join(subj_dir, f"kech1{ch_num:02d}.pdf")
    elif subject == "biology":
        return os.path.join(subj_dir, f"kebo1{ch_num:02d}.pdf")
    return None

# Test mapping for 10 images from different subjects
sample_subjects = ["history", "physics", "maths", "chemistry", "biology"]
for subj in sample_subjects:
    subj_imgs = [img for img in all_images if img["storage_path"].startswith(subj)]
    print(f"\n--- Testing {subj.upper()} ({len(subj_imgs)} images) ---")
    if not subj_imgs:
        continue
    sample = subj_imgs[0]
    # parse storage_path e.g. maths/ch01/p1_0.png
    m = re.match(r"([^/]+)/ch(\d+)/p(\d+)_(\d+)\.png", sample["storage_path"])
    if not m:
        print("Regex failed for", sample["storage_path"])
        continue
    s, ch_str, p_str, idx_str = m.groups()
    ch_num = int(ch_str)
    printed_p = int(p_str)
    img_idx = int(idx_str)
    pdf_path = get_pdf_for_subject_and_chapter(subj, ch_num)
    print(f"Sample: {sample['storage_path']} -> PDF: {pdf_path}")
    if not os.path.exists(pdf_path):
        print(f"ERROR: PDF not found: {pdf_path}")
        continue
    doc = fitz.open(pdf_path)
    print(f"PDF opened successfully with {len(doc)} pages.")
