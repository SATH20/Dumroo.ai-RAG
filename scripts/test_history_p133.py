import sys
import fitz

sys.stdout.reconfigure(encoding="utf-8")
doc = fitz.open("data/history/NCERT-Class-11-History.pdf")
print("History PDF page count:", len(doc))

for i in range(len(doc)):
    text = doc[i].get_text()
    # Check if this page has printed page 133
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    if any(line == "133" or "133" in line for line in lines):
        images = doc[i].get_images()
        print(f"Page index {i}: images={len(images)}, sample text: {lines[:3]} ... {lines[-2:]}")
        for img in images:
            xref = img[0]
            rects = doc[i].get_image_rects(xref)
            base = doc.extract_image(xref)
            print(f"  xref={xref}, base size={base['width']}x{base['height']}, rects={rects}")
