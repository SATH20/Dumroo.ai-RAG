# Deployment Guide for Dumroo RAG

This document outlines the deployment instructions for Vercel, Supabase, and required environment variables.

---

## 1. Environment Variables (Vercel Project Settings)

Add the following environment variables in the **Vercel Project Settings -> Environment Variables**.
> **Security Note:** Do not expose secret keys with `NEXT_PUBLIC_`. Only the Supabase URL and Anon Key are public.

### Client & Server Variables (Public)
| Variable Name | Required | Scope | Description |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Client & Server | Supabase project URL (`https://<project-ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | Client & Server | Supabase public anonymous API key (protected by RLS) |

### Server-Only Variables (Secret)
| Variable Name | Required | Scope | Description |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Server-only | Supabase service role secret key (bypasses RLS for teacher user creation & query logging) |
| `GEMINI_API_KEY` | **Yes** | Server-only | Google Gemini API primary key |
| `GEMINI_API_KEY_BACKUP` | Optional | Server-only | Google Gemini API backup key 1 |
| `GEMINI_API_KEY_BACKUP_2` | Optional | Server-only | Google Gemini API backup key 2 |
| `GEMINI_CHAT_MODELS` | Optional | Server-only | Comma-separated model order (default: `gemini-3.5-flash,gemini-flash-lite-latest,gemini-3.1-flash-lite`) |
| `EMBED_MODEL` | Optional | Server-only | Embedding model name (default: `gemini-embedding-2`) |
| `EMBED_DIM` | Optional | Server-only | Embedding dimensionality (default: `768`) |
| `TAVILY_API_KEY` | Optional | Server-only | Tavily Web Search API key (enables real-time web search toggle in Teacher Ask mode) |
| `MIN_SIM` | Optional | Server-only | Minimum vector similarity threshold for NCERT textbook retrieval (default: `0.60`) |

---

## 2. Vercel Configuration Settings

When importing the repository in Vercel:

| Setting | Value | Notes |
|---|---|---|
| **Framework Preset** | `Next.js` | Automatically detected |
| **Root Directory** | `web` | **Crucial:** Next.js application lives inside `web/` |
| **Build Command** | `npm run build` | Default `next build` |
| **Output Directory** | `.next` | Automatically handled |
| **Install Command** | `npm install` | Default |
| **Node.js Version** | `20.x` or `22.x` | Set in Project Settings -> General -> Node.js Version |

---

## 3. Supabase Auth & Storage Settings (After Deploy)

Once your Vercel deployment URL is generated (e.g., `https://dumroo-rag.vercel.app`):

### A. Authentication -> URL Configuration
Navigate to **Authentication -> URL Configuration** in your Supabase project dashboard:
1. **Site URL**:
   - Set to your primary production URL:
     `https://<your-vercel-domain>.vercel.app`
2. **Redirect URLs**:
   - Add your production URL and wildcard paths:
     - `https://<your-vercel-domain>.vercel.app/**`
     - `https://<your-vercel-domain>.vercel.app/login`
     - `https://<your-vercel-domain>.vercel.app/student`
     - `https://<your-vercel-domain>.vercel.app/teacher`
   - Retain `http://localhost:3000/**` for local development.

### B. Storage Verification
- Ensure the bucket `textbook-images` is set to **Public** so that page images and figures load across student and teacher interfaces without expiring signed URLs.

### C. Serverless Runtime & Memory Resilience
- The in-memory rate limiter (sliding 10-minute window) and model 10-minute cooldown maps operate safely in Node.js serverless functions. They maintain state for the lifetime of warm containers and reset cleanly without throwing exceptions.
- All figures and textbook page scans are served directly from Supabase Storage HTTP endpoints (`STORAGE_BASE_URL`), requiring zero runtime access to the local filesystem.
