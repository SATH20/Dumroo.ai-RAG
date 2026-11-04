import sys, os
sys.path.insert(0, os.path.abspath("."))
from ingest.config import get_supabase_client

client = get_supabase_client()

sub_res = client.table('subjects').select('*').execute()
print('Subjects:', sub_res.data)

for sub in sub_res.data:
    books = client.table('books').select('*').eq('subject_id', sub['id']).execute().data
    print(f"\n=== Subject: {sub['name']} ({len(books)} books) ===")
    for b in books:
        chaps = client.table('chapters').select('id, number, title, start_page, end_page').eq('book_id', b['id']).order('number').execute().data
        print(f"  Book: {b['title']} | Part: {b.get('part')} | ID: {b['id']} | Chapters: {len(chaps)}")
        for ch in chaps:
            print(f"    Ch {ch['number']}: {ch['title']} (pp. {ch['start_page']}-{ch['end_page']})")
