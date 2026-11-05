import sys
sys.path.insert(0, ".")
from ingest.config import get_supabase_client, STORAGE_BUCKET

sp = get_supabase_client()
res = sp.table("images").select("id, storage_path, width, height, page_number").execute()
images = res.data

# Pick 5 from different books: History Ch 6 p.133, and one from each other subject
samples = [
    "history/ch06/p133_0.png",
    next(x["storage_path"] for x in images if "physics" in x["storage_path"]),
    next(x["storage_path"] for x in images if "maths" in x["storage_path"]),
    next(x["storage_path"] for x in images if "chemistry" in x["storage_path"]),
    next(x["storage_path"] for x in images if "biology" in x["storage_path"]),
]

print("--- 5 SAMPLE STORED FIGURES ---")
for p in samples:
    match = [x for x in images if x["storage_path"] == p]
    if match:
        m = match[0]
        print(f"  {m['storage_path']}: {m['width']} x {m['height']} px")

# Calculate total storage size for figure images
bucket = sp.storage.from_(STORAGE_BUCKET)
total_size_bytes = 0
total_files = 0

subjects = ["maths", "physics", "chemistry", "biology", "history"]
for subj in subjects:
    folders = bucket.list(subj)
    for f in folders:
        name = f["name"]
        if name == "pages":
            continue
        # If directory (e.g. ch01), list files
        ch_files = bucket.list(f"{subj}/{name}")
        for cf in ch_files:
            meta = cf.get("metadata") or {}
            size = meta.get("size")
            if size is not None:
                total_size_bytes += size
                total_files += 1

print("\n--- STORAGE SUMMARY ---")
print(f"Total figure images found in storage: {total_files}")
print(f"Total figure images size: {total_size_bytes / (1024 * 1024):.2f} MB ({total_size_bytes:,} bytes)")
