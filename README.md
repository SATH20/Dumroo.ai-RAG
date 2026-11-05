# NCERT Textbook Ingestion Pipeline for Supabase RAG

An automated, high-accuracy ingestion pipeline that parses, cleans, OCR-repairs, chunks, embeds, and loads NCERT textbooks into Supabase (PostgreSQL with `pgvector` and Supabase Storage).

---

## 📋 Features

- **Garble Detection & OCR Fallback**: Automatically evaluates font encoding quality on every page. Broken fonts are rendered at 250 DPI and repaired using Tesseract OCR.
- **Printed Page Number Alignment**: Discovers the real printed book page numbers (via header/footer detection and offset interpolation) rather than relying on PDF page indices.
- **Hierarchical Chapter & Section Parsing**: Detects chapters and sections (`^\d+(\.\d+)+\s+[A-Za-z]`), maintaining context metadata across all chunks.
- **Semantic Chunking**: Emits ~500 token chunks with 50-token overlap, respecting paragraph/sentence boundaries and never crossing chapter boundaries.
- **Figure & Diagram Extraction**: Filters noise, icons, and repeated decorative elements while uploading meaningful textbook figures to Supabase Storage (`textbook-images`).
- **Gemini Embeddings**: Generates 768-dimensional document retrieval embeddings with exponential backoff and jitter.
- **Idempotency & Verification**: `--force` clears subject data before re-ingesting; built-in automated reports inspect random chunks and verify RPC retrieval functions.

---

## 🛠️ Step 0: Setup & Prerequisites

### 1. Environment & Tesseract OCR
- **Python**: 3.11+
- **Tesseract OCR Binary**:
  - **Windows**: Install from [UB-Mannheim Tesseract Releases](https://github.com/UB-Mannheim/tesseract/wiki). The default install path is `C:\Program Files\Tesseract-OCR\tesseract.exe`.
  - Check installation:
    ```powershell
    tesseract --version
    ```

### 2. Python Dependencies
Install required packages:
```bash
pip install pymupdf pytesseract supabase google-genai python-dotenv tqdm tiktoken pillow
```

### 3. Supabase Dashboard Steps
1. **Create Project**: Go to [Supabase](https://supabase.com/) and create a new project.
2. **Enable Vector Extension**:
   - In your project dashboard, navigate to **Database** -> **Extensions**.
   - Search for `vector` and click **Enable** (or run `CREATE EXTENSION IF NOT EXISTS vector;` in SQL Editor).
3. **Run Migration**:
   - Navigate to the **SQL Editor** in your Supabase dashboard.
   - Open `supabase/migrations/001_init.sql`, copy its entire content, paste it into the editor, and click **Run**.
4. **Create Storage Bucket**:
   - Navigate to **Storage** in the sidebar.
   - Click **New bucket**.
   - Set the bucket name to: `textbook-images`.
   - Toggle **Public bucket** to `ON` (so image URLs can be accessed by student clients).
   - Click **Save**.

### 4. Configure Secrets
Create `ingest/.env` (see `ingest/.env.example`):
```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
GEMINI_API_KEY=your_gemini_api_key
```
> [!NOTE]
> Use the **`service_role`** key (from Project Settings -> API) so that the ingestion script can bypass RLS for batch inserts and storage uploads.

---

## 📁 Data Layout

Place textbooks in `data/<subject>/`:
```
data/
├── maths/
│   ├── kemh101.pdf
│   ├── kemh102.pdf
│   ├── meta.json          # (Optional) e.g. {"title": "Mathematics", "part": null, "class": 11}
│   └── chapters.json      # (Optional override) e.g. [{"number":1,"title":"Sets","start_page":1,"end_page":28}]
├── physics/
├── chemistry/
├── biology/
└── history/
```
Files ending in `ps.pdf`, `a1.pdf`, `an.pdf` (preliminaries, appendices, answers) are automatically skipped.

---

## 🚀 Usage

Execute commands from the repository root:

### 1. Dry Run (Quality Check First)
Extract, chunk, check for garbles, and generate verification reports without touching Supabase or writing to storage:
```bash
python -m ingest.ingest --subject maths --dry-run
```

### 2. Live Ingestion
Run live ingestion for a specific subject:
```bash
python -m ingest.ingest --subject maths
```

### 3. Force Re-ingestion
Deletes all existing records and storage images for the subject, then ingests fresh:
```bash
python -m ingest.ingest --subject maths --force
```

### 4. Ingest All Subjects
```bash
python -m ingest.ingest --all
```

---

## 🔍 Verifying Data in Supabase SQL Editor

Run these queries in the **Supabase SQL Editor** to verify the ingested textbook data:

### 1. Count Records per Subject
```sql
SELECT 
    s.name AS subject,
    b.title AS book,
    COUNT(DISTINCT c.id) AS total_chapters,
    COUNT(DISTINCT ch.id) AS total_chunks,
    COUNT(DISTINCT img.id) AS total_images
FROM subjects s
LEFT JOIN books b ON b.subject_id = s.id
LEFT JOIN chapters c ON c.book_id = b.id
LEFT JOIN chunks ch ON ch.book_id = b.id
LEFT JOIN images img ON img.book_id = b.id
GROUP BY s.name, b.title;
```

### 2. Test Semantic Search via `match_chunks`
```sql
-- Retrieve top 5 chunks matching a query vector
SELECT 
    similarity,
    chapter_number,
    chapter_title,
    section_title,
    page_number,
    page_end,
    LEFT(content, 150) AS snippet
FROM match_chunks(
    query_embedding := (SELECT embedding FROM chunks LIMIT 1),
    subject_ids := NULL,
    k := 5
);
```

### 3. Retrieve Entire Section in Order via `get_section`
```sql
SELECT 
    chunk_index,
    page_number,
    token_count,
    LEFT(content, 120) AS content_preview
FROM get_section(
    p_chapter_id := (SELECT id FROM chapters LIMIT 1),
    p_section_title := (SELECT section_title FROM chunks WHERE section_title != '' LIMIT 1)
);
```

### 4. Retrieve Chunks by Page Range via `get_chapter_pages`
```sql
SELECT 
    chunk_index,
    page_number,
    section_title,
    LEFT(content, 100) AS preview
FROM get_chapter_pages(
    p_chapter_id := (SELECT id FROM chapters LIMIT 1),
    p_from := 1,
    p_to := 10
);
```

---

## 👥 Demo Accounts & Roles (Task C)

All accounts share the default password: **`Demo@12345`**.

| Role | Email | Name | Enrolled Subjects / Access |
| :--- | :--- | :--- | :--- |
| **Teacher** | `teacher@dumroo-demo.test` | Prof. Sharma | **All Subjects** (Physics, Maths, Chemistry, Biology, History) |
| **Student 1** | `student1@dumroo-demo.test` | Student 1 | **Physics + Maths** |
| **Student 2** | `student2@dumroo-demo.test` | Student 2 | **Chemistry + Biology** |
| **Student 3** | `student3@dumroo-demo.test` | Student 3 | **History only** |
| **Student 4** | `student4@dumroo-demo.test` | Student 4 | **All Five Subjects** |
| **Student 5** | `student5@dumroo-demo.test` | Student 5 | **Maths only** |

- **Student portal**: `/student`
- **Teacher portal**: `/teacher`
- **Login page**: `/login` (includes 1-click quick-fill buttons for each demo account)

---

## 👩‍🏫 Teacher Side & Analytics (Task D)

The `/teacher` portal provides educators with insights into student engagement, syllabus gaps, real-time web-augmented answers, and group management. Student routes are protected by middleware and server-side role validation.

### 1. Teacher Dashboard (`/teacher` -> Dashboard tab)
- **Filters**: Subject filter (All or specific subject) and time window selector (Last 7, 14, or 30 days).
- **Stat Cards**: Total Enrolled Students, Questions Asked, Answered Rate (%), and Syllabus Gaps (refused/not covered questions).
- **Interactive Visualizations (Recharts)**:
  - *Daily Activity*: Interactive line chart showing question volume trends over time.
  - *Subject Breakdown*: Bar chart showing student inquiry distribution across subjects.
- **Most Asked Chapters**: Ranked table with inline volume indicator bars and click-to-drill-down modal showing the exact student queries asked for that chapter.
- **Syllabus Gaps ("Not Covered by Textbooks")**: Frequency-ranked table of questions outside the NCERT curriculum with last-asked dates.
- **Student Study Activity**: Complete student roster with assigned groups, total questions, last active timestamp, top 3 chapters studied, and click-to-inspect query logs.
  - *Privacy Protection*: Only logged query text and cited chapters are displayed; student memory facts and private chat conversations are strictly hidden from teachers.

### 2. Teacher Chat with Tavily Web Search (`/teacher` -> Ask tab)
- Dedicated chat interface running in `teacher` mode.
- Access to all subjects across the entire curriculum without student group constraints.
- **Tavily Web Search**: Toggleable search button that queries the live web via Tavily API, synthesizing NCERT textbook context with external web citations and source cards.

### 3. Students & Groups Management (`/teacher` -> Students & Groups tab)
- Roster of all subject cohorts and sections.
- Member count and student list per group.
- 1-click Add/Remove student membership controls.

### 4. Realistic Demo Activity Logs (`is_demo = true`)
- `scripts/seed-activity.ts` generates ~150 realistic `query_logs` rows distributed over the last 14 days across the 5 demo students, adhering strictly to each student's enrolled subjects with curriculum-aligned questions and syllabus gaps.
- All seeded records carry `is_demo: true` to distinguish them from live test queries.

---

## 🗄️ Database Migrations

Run these migrations in the **Supabase SQL Editor**:
- `supabase/migrations/001_init.sql` — Core textbook schema (`subjects`, `books`, `chapters`, `chunks`, `images`, `page_images`, `match_chunks`, `get_section`, `get_chapter_pages`).
- `supabase/migrations/005_auth_roles_groups.sql` — Profiles, groups, group members, and RLS policies.
- `supabase/migrations/006_chats_memory.sql` — Chats, messages, student facts, and memories.
- `supabase/migrations/007_teacher_and_activity.sql` — Teacher mode, `is_demo` flag, web sources column, and analytics indexes.

