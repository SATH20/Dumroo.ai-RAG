import sys
import os
import re
sys.path.insert(0, ".")
from ingest.config import get_supabase_client
from ingest.page_mapping import build_page_mapping
from ingest.images import find_decorative_image_hashes
import fitz

sp = get_supabase_client()
res = sp.table("images").select("id, storage_path, width, height, page_number").execute()
all_images = res.data

def get_pdf_for_subject_and_chapter(subject: str, ch_num: int):
    subj_dir = os.path.join("data", subject)
    if subject == "history":
        return os.path.join(subj_dir, "NCERT-Class-11-History.pdf")
    elif subject == "physics":
        return os.path.join(subj_dir, f"keph10{ch_num}.pdf" if ch_num <= 7 else f"keph20{ch_num-7}.pdf")
    elif subject == "maths":
        return os.path.join(subj_dir, f"kemh1{ch_num:02d}.pdf")
    elif subject == "chemistry":
        return os.path.join(subj_dir, f"kech1{ch_num:02d}.pdf")
    elif subject == "biology":
        return os.path.join(subj_dir, f"kebo1{ch_num:02d}.pdf")
    return None

# Test 2 images from each subject
for img in all_images[:5] + all_images[50:55] + all_images[100:105]:
    path = img["storage_path"]
    m = re.match(r"([^/]+)/ch(\d+)/p(\d+)_(\d+)\.png", path)
    if not m:
        continue
    subject, ch_str, p_str, idx_str = m.groups()
    ch_num = int(ch_str)
    printed_page = int(p_str)
    img_idx = int(idx_str)

    pdf_file = get_pdf_for_subject_and_chapter(subject, ch_num)
    if not pdf_file or not os.path.exists(pdf_file):
        print(f"File missing for {path}: {pdf_file}")
        continue

    doc = fitz.open(pdf_file)
    texts = [doc[i].get_text() for i in range(len(doc))]
    pm = build_page_mapping(texts, os.path.basename(pdf_file))
    
    # In history, fallback offset was -1 (p_idx = printed_page + 1)
    if subject == "history":
        target_p_idx = printed_page + 1 if printed_page + 1 < len(doc) else None
    else:
        # find in pm
        target_p_idx = next((i for i, p in pm.items() if p == printed_page), None)

    if target_p_idx is None:
        print(f"Could not map page for {path}")
        continue

    page = doc[target_p_idx]
    page_imgs = page.get_images()
    print(f"{path}: PDF={os.path.basename(pdf_file)}, p_idx={target_p_idx}, images on page={len(page_imgs)}")
    for pi in page_imgs:
        xref = pi[0]
        base = doc.extract_image(xref)
        if base["width"] == img["width"] and base["height"] == img["height"]:
            rects = page.get_image_rects(xref)
            print(f"  -> EXACT MATCH! xref={xref}, rects={rects}")
            break
