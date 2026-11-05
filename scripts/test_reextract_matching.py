import sys
sys.path.insert(0, ".")
from ingest.config import get_supabase_client
from ingest.images import find_decorative_image_hashes
from ingest.page_mapping import build_page_mapping
import fitz

sp = get_supabase_client()
res = sp.table("images").select("*").like("storage_path", "history/ch06/%").execute()
db_images = {img["storage_path"]: img for img in res.data}
print(f"History Ch 6 has {len(db_images)} images in DB:")
for path in sorted(db_images.keys()):
    print(f"  {path}: {db_images[path]['width']}x{db_images[path]['height']} px (page {db_images[path]['page_number']})")

doc = fitz.open("data/history/NCERT-Class-11-History.pdf")
dec_hashes = find_decorative_image_hashes(doc)
texts = [doc[i].get_text() for i in range(len(doc))]
pm = build_page_mapping(texts, "history")

# Re-simulate page mapping & image extraction on Ch 6 pages (132 to 151)
seen_hashes = set()
matched = 0
for p_idx in range(len(doc)):
    printed_page = pm[p_idx]
    if not (132 <= printed_page <= 151):
        continue
    page = doc[p_idx]
    image_list = page.get_images(full=True)
    img_idx = 0
    for img_info in image_list:
        xref = img_info[0]
        base_img = doc.extract_image(xref)
        if not base_img:
            continue
        w, h = base_img.get("width", 0), base_img.get("height", 0)
        if w < 100 or h < 100:
            continue
        if max(w, h) / max(1, min(w, h)) > 8.0:
            continue
        raw_bytes = base_img["image"]
        import hashlib
        md5 = hashlib.md5(raw_bytes).hexdigest()
        if md5 in dec_hashes or md5 in seen_hashes:
            continue
        seen_hashes.add(md5)

        expected_path = f"history/ch06/p{printed_page}_{img_idx}.png"
        img_idx += 1
        if expected_path in db_images:
            rects = page.get_image_rects(xref)
            print(f"Matched {expected_path}: xref={xref}, rects={rects}")
            matched += 1
        else:
            print(f"Found {expected_path} not in db?")

print(f"Total matched in Ch 6: {matched} / {len(db_images)}")
