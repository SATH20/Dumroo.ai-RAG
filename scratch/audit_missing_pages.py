import sys, os
sys.path.insert(0, os.path.abspath("."))
from ingest.config import get_supabase_client

client = get_supabase_client()

subjects = client.table("subjects").select("*").execute().data

for s in subjects:
    sub_name = s["name"]
    books = client.table("books").select("*").eq("subject_id", s["id"]).execute().data
    print(f"\n==================== SUBJECT: {sub_name.upper()} ====================")
    for b in books:
        chaps = client.table("chapters").select("*").eq("book_id", b["id"]).order("number").execute().data
        all_expected_pages = set()
        chap_map = {}
        for ch in chaps:
            for p in range(ch["start_page"], ch["end_page"] + 1):
                all_expected_pages.add(p)
                chap_map[p] = ch

        page_imgs = client.table("page_images").select("page_number, storage_path").eq("book_id", b["id"]).execute().data
        stored_pages = {pi["page_number"] for pi in page_imgs}
        
        missing = sorted(list(all_expected_pages - stored_pages))
        print(f"Book '{b['title']}' (part={b.get('part')}):")
        print(f"  Total expected pages across {len(chaps)} chapters: {len(all_expected_pages)}")
        print(f"  Stored page_images: {len(stored_pages)}")
        print(f"  Missing count: {len(missing)}")
        if missing:
            print(f"  Missing page numbers: {missing}")
            for p in missing:
                ch = chap_map[p]
                print(f"    Page {p} in Ch {ch['number']} ({ch['title']})")
