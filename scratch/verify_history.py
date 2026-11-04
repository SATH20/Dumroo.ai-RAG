from ingest.config import get_supabase_client
from ingest.embeddings import embed_query
from ingest.db import call_match_chunks

sp = get_supabase_client()
hist_subj = sp.table('subjects').select('id').eq('name', 'history').execute().data[0]['id']

queries = [
    ("writing and city life mesopotamia", 2, "Chapter 2 (Writing and City Life)"),
    ("Roman empire across three continents", 3, "Chapter 3 (An Empire Across Three Continents)"),
    ("nomadic empires Genghis Khan", 5, "Chapter 5 (Nomadic Empires)"),
]

print("=" * 70)
print("  HISTORY SEMANTIC SEARCH VERIFICATION")
print("=" * 70)

for q, expected_ch, label in queries:
    print(f"\nQuery: \"{q}\" (Expected: {label})")
    q_emb = embed_query(q)
    matches = call_match_chunks(q_emb, subject_ids=[hist_subj], k=5)
    
    seen = set()
    has_dup = False
    for m in matches:
        cid = m.get("id") or m.get("content")
        if cid in seen:
            has_dup = True
        seen.add(cid)
    
    status = "[PASS: 0 Duplicates in Top-5]" if not has_dup else "[FAIL: Duplicates]"
    print(f"  Status: {status}")
    for rank, m in enumerate(matches[:3], 1):
        sim = m.get("similarity", 0.0)
        ch_num = m.get("chapter_number")
        p_num = m.get("page_number")
        snip = m.get("content", "")[:100].replace("\n", " ").encode("ascii", errors="replace").decode("ascii")
        match_str = " (MATCH)" if ch_num == expected_ch else ""
        print(f"  [{rank}] Sim: {sim:.4f} | Ch {ch_num}{match_str} | Page {p_num}")
        print(f"      \"{snip}...\"")
print("\n" + "=" * 70)
