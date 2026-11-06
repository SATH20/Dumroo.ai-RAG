# Textbook RAG for Teachers and Students

Ask a question, get an answer straight from the NCERT Class 11 textbook, with the exact page number and the actual figure from that page. If the book doesn't cover it, the app says so instead of making something up.

Built for the Dumroo AI internship take-home.

**Live demo:** https://dumroo-rag.vercel.app  
**Demo video:** https://www.loom.com/share/f0d51a2f8a784e399a2050233d73ee1b

---

## What it does

### For students
- Answers come only from the textbooks they're enrolled in (Physics, Chemistry, Biology, Maths, History).
- Every answer cites the chapter, section and printed page number, and shows the relevant diagrams from the book. Tap a figure to open it full size.
- Questions the books don't cover (or subjects the student isn't assigned) get a clear "not covered in your textbooks" reply.
- Typos are fine. "solid liquid weight liquid gas" still finds the right section.
- Multiple chats, each saved and restored after a reload.
- Light memory: tell it "I prefer brief answers" and it remembers.

### For teachers
- A dashboard: questions per day, questions per subject, most-asked chapters, and a list of syllabus gaps (questions the books couldn't answer).
- A student roster with each student's activity and the questions they asked.
- Create students and manage subject groups.
- A teacher chat with an optional web search toggle. With it on, the answer is split into the NCERT explanation and a separate "from the web" section with source links. With it off, it stays inside the textbooks.
- Students' private chats and memory are never visible to teachers, only logged question text and cited chapters.

---

## How it works

```text
NCERT PDFs
    │  PyMuPDF text extraction (Tesseract OCR for pages with broken fonts)
    ▼
Clean pages ──► chapters / sections ──► ~500-token chunks (50 overlap)
    │                                          │
    │  figures + page images → Supabase Storage│  Gemini embeddings (768-dim)
    ▼                                          ▼
Supabase Postgres + pgvector
    │
    Question ─► intent check ─► match_chunks (similarity threshold)
    │                           grouped by section
    ─► Gemini answer, streamed
        ├─► COVERED ────► answer + citations + figures
        └─► NOT COVERED ─► polite refusal (students)
```

A few decisions worth knowing about:
- **Real page numbers.** PDF page indexes don't match the numbers printed in the book. The ingestion pipeline finds the printed numbers from headers and footers, so citations match what a student sees in their copy.
- **OCR only where needed.** Each page is checked for garbled font encoding. Bad pages are rendered at 250 DPI and read with Tesseract; clean pages are left alone.
- **Chunks never cross chapters,** and keep their chapter and section context so answers can cite properly.
- **Refusals are deliberate.** Retrieval has a similarity threshold, and the model must mark each answer as covered or not covered. Off-topic questions ("who won the FIFA world cup") are refused for students.
- **Access control lives in the database.** Supabase Row Level Security and server-side role checks, not just hidden buttons.

---

## Tech stack

| Layer | Choice |
| :--- | :--- |
| **Frontend** | Next.js (App Router), TypeScript, Tailwind, Recharts |
| **Backend / DB** | Supabase: Postgres + pgvector, Auth, Storage, RLS |
| **Ingestion** | Python 3.11+, PyMuPDF, Tesseract, tiktoken |
| **Models** | Gemini (embeddings and chat, with a fallback chain across models) |
| **Web search** | Tavily (teacher chat only) |
| **Hosting** | Vercel |

---

## Try it

All demo accounts use the password `Demo@12345`. The login page has one-click buttons that fill them in.

| Role | Email | Can see |
| :--- | :--- | :--- |
| **Teacher** | `teacher@dumroo-demo.test` | Everything |
| **Student 1** | `student1@dumroo-demo.test` | Physics + Maths |
| **Student 2** | `student2@dumroo-demo.test` | Chemistry + Biology |
| **Student 3** | `student3@dumroo-demo.test` | History |
| **Student 4** | `student4@dumroo-demo.test` | All five subjects |
| **Student 5** | `student5@dumroo-demo.test` | Maths |

### Things to try:
- Log in as Student 2 and ask *"Explain the light reaction in photosynthesis"*. You'll get an answer with page citations and the figure.
- Ask that same student *"Who is Genghis Khan?"*. It's a History topic, and Student 2 isn't enrolled in History, so it refuses.
- Log in as the teacher, open Ask, and compare a question with web search on and off.

---

## Run it yourself

### 1. Supabase
- Create a project and enable the vector extension.
- In the SQL Editor, run the migrations in `supabase/migrations/` in order:
  - `001_init.sql`: textbook schema and search functions
  - `005_auth_roles_groups.sql`: profiles, groups, RLS
  - `006_chats_memory.sql`: chats, messages, memory
  - `007_teacher_and_activity.sql`: teacher mode, demo flag, web sources, analytics indexes
  - `008_message_meta.sql`: saved presentation data for reopened chats
- Create a public Storage bucket called `textbook-images`.

### 2. Ingest the textbooks
Put the PDFs in `data/<subject>/` (physics, chemistry, biology, maths, history). Preliminaries, appendices and answer files (`ps.pdf`, `a1.pdf`, `an.pdf`) are skipped automatically. You need [Tesseract](https://github.com/UB-Mannheim/tesseract/wiki) installed for the OCR fallback.

```bash
pip install pymupdf pytesseract supabase google-genai python-dotenv tqdm tiktoken pillow
```

Create `ingest/.env` (see `ingest/.env.example`):
```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_api_key
```

Then, from the repo root:
```bash
python -m ingest.ingest --subject maths --dry-run  # check quality first, touches nothing
python -m ingest.ingest --subject maths            # ingest one subject
python -m ingest.ingest --subject maths --force    # wipe and re-ingest that subject
python -m ingest.ingest --all                      # everything
```

### 3. Run the app
```bash
cd web
npm install
cp .env.example .env.local  # fill in your Supabase, Gemini and Tavily keys
npm run dev
```

Keep secret keys server-side only. Never expose them with a `NEXT_PUBLIC_` prefix. Deployed on Vercel with the project root set to `web`.

### 4. Demo data (optional)
```bash
npx tsx scripts/seed-activity.ts    # fills the teacher dashboard with demo activity
npx tsx scripts/clear-demo-chats.ts  # clears demo chats
```

---

## Checking the data

Run these in the Supabase SQL Editor to confirm ingestion worked:

```sql
-- Chapters, chunks and images per book
SELECT 
    s.name AS subject, 
    b.title AS book, 
    COUNT(DISTINCT c.id) AS chapters, 
    COUNT(DISTINCT ch.id) AS chunks, 
    COUNT(DISTINCT img.id) AS images 
FROM subjects s 
LEFT JOIN books b ON b.subject_id = s.id 
LEFT JOIN chapters c ON c.book_id = b.id 
LEFT JOIN chunks ch ON ch.book_id = b.id 
LEFT JOIN images img ON img.book_id = b.id 
GROUP BY s.name, b.title;

-- Top 5 closest chunks (using an existing chunk as the query vector)
SELECT 
    similarity, 
    chapter_title, 
    section_title, 
    page_number, 
    LEFT(content, 150) AS snippet 
FROM match_chunks( 
    query_embedding := (SELECT embedding FROM chunks LIMIT 1), 
    subject_ids := NULL, 
    k := 5 
);
```

---

## Honest notes and limitations

- **The dashboard is seeded.** The teacher dashboard shows demo activity generated by `scripts/seed-activity.ts` (rows are flagged `is_demo = true`), mixed with whatever real questions get asked. There wasn't a real class to generate real usage.
- **Free-tier limits.** Gemini's free tier can rate-limit, so answers are sometimes slower, and the app falls back across models when that happens.
- **Textbook-only means textbook-only.** With web search off, answers are limited to the Class 11 NCERT books in the database. With it on, web results are clearly separated and their sources can change over time.
- **Web search needs a Tavily key.** Without one, the toggle won't return results.

---

## Repo layout

```text
ingest/               Python ingestion pipeline (extract, OCR, chunk, embed, upload)
supabase/migrations/  SQL schema, search functions, RLS
web/                  Next.js app (student + teacher portals, API routes)
scripts/              Demo seeding and cleanup
data/<subject>/       Textbook PDFs (git-ignored)
```
