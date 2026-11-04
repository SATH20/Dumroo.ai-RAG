"""Split Physics into Part 1 and Part 2 books in Supabase."""

import sys
import os
sys.path.insert(0, os.path.abspath("."))
from ingest.config import get_supabase_client

client = get_supabase_client()

# 1. Fetch physics subject
sub_res = client.table("subjects").select("id").eq("name", "physics").execute()
if not sub_res.data:
    print("Error: Physics subject not found!")
    sys.exit(1)
sub_id = sub_res.data[0]["id"]

# 2. Fetch existing physics books
books = client.table("books").select("*").eq("subject_id", sub_id).execute().data
print(f"Existing physics books: {len(books)}")

part1_book = None
part2_book = None

for b in books:
    if b.get("part") == "Part 1":
        part1_book = b
    elif b.get("part") == "Part 2":
        part2_book = b
    elif b.get("part") is None:
        part1_book = b

if part1_book is None:
    print("Error: Could not find base physics book!")
    sys.exit(1)

# Ensure Part 1 book is named and tagged properly
part1_id = part1_book["id"]
client.table("books").update({"title": "Physics", "part": "Part 1"}).eq("id", part1_id).execute()
print(f"Part 1 Book ID: {part1_id}")

# If Part 2 book does not exist, create it
if part2_book is None:
    res = client.table("books").insert({
        "subject_id": sub_id,
        "title": "Physics",
        "part": "Part 2",
        "source": "7 chapter files (Part 2)"
    }).execute()
    part2_book = res.data[0]
    print(f"Created Part 2 Book ID: {part2_book['id']}")
else:
    print(f"Existing Part 2 Book ID: {part2_book['id']}")

part2_id = part2_book["id"]

# 3. Move chapters 8-14 to Part 2
chaps = client.table("chapters").select("id, number, title").order("number").execute().data

# Filter chapters belonging to physics (either under part1_id or part2_id)
physics_chaps = []
for ch in chaps:
    # Check if chapter belongs to part 1 or part 2
    ch_full = client.table("chapters").select("id, book_id, number, title").eq("id", ch["id"]).execute().data[0]
    if ch_full["book_id"] in (part1_id, part2_id):
        physics_chaps.append(ch_full)

print(f"Total physics chapters found: {len(physics_chaps)}")

for ch in physics_chaps:
    target_book_id = part1_id if ch["number"] <= 7 else part2_id
    target_part = "Part 1" if ch["number"] <= 7 else "Part 2"
    
    if ch["book_id"] != target_book_id:
        print(f"Moving Chapter {ch['number']} ({ch['title']}) -> {target_part} ({target_book_id})...")
        client.table("chapters").update({"book_id": target_book_id}).eq("id", ch["id"]).execute()
        
        # Update chunks
        c_res = client.table("chunks").update({"book_id": target_book_id}).eq("chapter_id", ch["id"]).execute()
        print(f"  Updated chunks for Ch {ch['number']}")
        
        # Update images
        i_res = client.table("images").update({"book_id": target_book_id}).eq("chapter_id", ch["id"]).execute()
        print(f"  Updated images for Ch {ch['number']}")
        
        # Update page_images
        pi_res = client.table("page_images").update({"book_id": target_book_id}).eq("chapter_id", ch["id"]).execute()
        print(f"  Updated page_images for Ch {ch['number']}")
    else:
        print(f"Chapter {ch['number']} ({ch['title']}) already in {target_part}")

print("\nPhysics books split completed successfully!")
