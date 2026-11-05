import sys
sys.path.insert(0, ".")
from ingest.config import get_supabase_client, STORAGE_BUCKET
import fitz
from PIL import Image
import io

sp = get_supabase_client()
bucket = sp.storage.from_(STORAGE_BUCKET)
img_bytes = bucket.download("history/ch06/p133_0.png")
stored_pil = Image.open(io.BytesIO(img_bytes))
print(f"Stored image format={stored_pil.format}, size={stored_pil.size}")

doc = fitz.open("data/history/NCERT-Class-11-History.pdf")
print("Searching in History PDF...")
for p_idx, page in enumerate(doc):
    for img in page.get_images():
        xref = img[0]
        base = doc.extract_image(xref)
        if base["width"] == stored_pil.size[0] and base["height"] == stored_pil.size[1]:
            print(f"MATCH on PDF page_index={p_idx}, xref={xref}")
            rects = page.get_image_rects(xref)
            print(f"  Rects: {rects}")
