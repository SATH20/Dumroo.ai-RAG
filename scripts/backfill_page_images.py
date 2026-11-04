"""Backfill missing page images for Biology, Chemistry, and History."""

import sys
import os
sys.path.insert(0, os.path.abspath("."))
import fitz
from ingest.config import get_supabase_client
from ingest.images import render_page_to_jpeg, upload_page_image_to_storage

client = get_supabase_client()

def backfill():
    print("Starting page image backfill...")
    
    # Target pages to backfill:
    # 1. Biology:
    #   p. 31: kebo103.pdf (ch 3, start_page=23). idx = 31 - 23 = 8
    #   p. 252: kebo119.pdf (ch 19, start_page=239). idx = 252 - 239 = 13
    # 2. Chemistry:
    #   p. 114: kech104.pdf (ch 4, start_page=100). idx = 114 - 100 = 14
    #   p. 219: kech106.pdf (ch 6, start_page=168). idx = 219 - 168 = 51
    #   p. 220: kech106.pdf (ch 6, start_page=168). idx = 220 - 168 = 52
    # 3. History:
    #   In NCERT-Class-11-History.pdf, printed page N is PDF index N + 1.
    #   p. 49: idx = 50 (Ch 2)
    #   p. 123: idx = 124 (Ch 5)
    #   p. 185: idx = 186 (Ch 8)

    targets = [
        # Biology
        {
            "subject": "biology",
            "pdf_path": "data/biology/kebo103.pdf",
            "pdf_idx": 8,
            "printed_page": 31,
            "chapter_num": 3,
            "reason": "Diagram page (Figure 3.3 Pteridophytes)"
        },
        {
            "subject": "biology",
            "pdf_path": "data/biology/kebo119.pdf",
            "pdf_idx": 13,
            "printed_page": 252,
            "chapter_num": 19,
            "reason": "End notes page"
        },
        # Chemistry
        {
            "subject": "chemistry",
            "pdf_path": "data/chemistry/kech104.pdf",
            "pdf_idx": 14,
            "printed_page": 114,
            "chapter_num": 4,
            "reason": "Diagram/Table page (Table 4.6 Geometry of Molecules)"
        },
        {
            "subject": "chemistry",
            "pdf_path": "data/chemistry/kech106.pdf",
            "pdf_idx": 51,
            "printed_page": 219,
            "chapter_num": 6,
            "reason": "End notes page 1"
        },
        {
            "subject": "chemistry",
            "pdf_path": "data/chemistry/kech106.pdf",
            "pdf_idx": 52,
            "printed_page": 220,
            "chapter_num": 6,
            "reason": "End notes page 2"
        },
        # History
        {
            "subject": "history",
            "pdf_path": "data/history/NCERT-Class-11-History.pdf",
            "pdf_idx": 50,
            "printed_page": 49,
            "chapter_num": 2,
            "reason": "Section II Unit Divider Page"
        },
        {
            "subject": "history",
            "pdf_path": "data/history/NCERT-Class-11-History.pdf",
            "pdf_idx": 124,
            "printed_page": 123,
            "chapter_num": 5,
            "reason": "Section III Unit Divider Page"
        },
        {
            "subject": "history",
            "pdf_path": "data/history/NCERT-Class-11-History.pdf",
            "pdf_idx": 186,
            "printed_page": 185,
            "chapter_num": 8,
            "reason": "Section IV Unit Divider Page"
        },
    ]

    for item in targets:
        subj = item["subject"]
        doc = fitz.open(item["pdf_path"])
        p_img = render_page_to_jpeg(
            doc=doc,
            page_idx=item["pdf_idx"],
            printed_page=item["printed_page"],
            chapter_num=item["chapter_num"],
            subject=subj,
            dpi=110,
            quality=75
        )
        doc.close()

        print(f"Uploading {p_img.storage_path} ({item['reason']})...")
        ok = upload_page_image_to_storage(p_img, client)
        if not ok:
            print(f"  FAILED to upload {p_img.storage_path}")
            continue

        # Find book_id and chapter_id
        sub_data = client.table("subjects").select("id").eq("name", subj).execute().data
        sub_id = sub_data[0]["id"]
        
        # Get chapter
        # Find chapter matching subject and chapter number
        ch_res = client.table("chapters").select("id, book_id").eq("number", item["chapter_num"]).execute().data
        # Filter by book in subject
        matched_ch = None
        for ch in ch_res:
            b_info = client.table("books").select("id, subject_id").eq("id", ch["book_id"]).execute().data
            if b_info and b_info[0]["subject_id"] == sub_id:
                matched_ch = ch
                break

        if not matched_ch:
            print(f"  Error: Chapter {item['chapter_num']} not found for {subj}!")
            continue

        book_id = matched_ch["book_id"]
        ch_id = matched_ch["id"]

        row = {
            "book_id": book_id,
            "chapter_id": ch_id,
            "page_number": item["printed_page"],
            "storage_path": p_img.storage_path,
        }
        client.table("page_images").upsert([row], on_conflict="book_id,page_number").execute()
        print(f"  Upserted DB row for page {item['printed_page']} ({subj})")

    print("\nBackfill completed!")

if __name__ == "__main__":
    backfill()
