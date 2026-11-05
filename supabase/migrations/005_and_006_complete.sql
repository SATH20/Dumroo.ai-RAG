-- 005_and_006_complete.sql
-- Combined Migration for Phase 1 (Auth, Roles, Groups, RLS) and Phase 2 (Multi-Chat, Messages, User Memory)

-- ============================================================================
-- PHASE 1: AUTH, ROLES, GROUPS & RLS
-- ============================================================================

-- 1. Profiles table (links to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Groups table (one per subject)
CREATE TABLE IF NOT EXISTS public.groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. Group Members table
CREATE TABLE IF NOT EXISTS public.group_members (
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (group_id, student_id)
);

-- 4. Add nullable user_id and chat_id to query_logs
ALTER TABLE public.query_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.query_logs ADD COLUMN IF NOT EXISTS chat_id UUID;

CREATE INDEX IF NOT EXISTS idx_query_logs_user_id ON public.query_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_groups_subject_id ON public.groups(subject_id);
CREATE INDEX IF NOT EXISTS idx_group_members_student ON public.group_members(student_id);

-- 5. Helper Functions for Roles & Group-Based Subject Permissions
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'teacher'
  );
$$;

CREATE OR REPLACE FUNCTION public.student_subject_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT CASE 
    WHEN public.is_teacher() THEN (SELECT id FROM public.subjects)
    ELSE (
      SELECT g.subject_id
      FROM public.group_members gm
      JOIN public.groups g ON gm.group_id = g.id
      WHERE gm.student_id = auth.uid()
    )
  END;
$$;

-- 6. Enable Row Level Security (RLS) on all content and auth tables
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.query_logs ENABLE ROW LEVEL SECURITY;

-- Clean existing policies if re-running
DROP POLICY IF EXISTS subjects_select ON public.subjects;
DROP POLICY IF EXISTS books_select ON public.books;
DROP POLICY IF EXISTS chapters_select ON public.chapters;
DROP POLICY IF EXISTS chunks_select ON public.chunks;
DROP POLICY IF EXISTS images_select ON public.images;
DROP POLICY IF EXISTS page_images_select ON public.page_images;
DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_insert ON public.profiles;
DROP POLICY IF EXISTS profiles_update ON public.profiles;
DROP POLICY IF EXISTS groups_select ON public.groups;
DROP POLICY IF EXISTS groups_manage ON public.groups;
DROP POLICY IF EXISTS group_members_select ON public.group_members;
DROP POLICY IF EXISTS group_members_manage ON public.group_members;
DROP POLICY IF EXISTS query_logs_select ON public.query_logs;
DROP POLICY IF EXISTS query_logs_insert ON public.query_logs;

-- Policies: Authenticated users only, anon has 0 access (anon denied on every content table)
CREATE POLICY subjects_select ON public.subjects
  FOR SELECT TO authenticated
  USING (public.is_teacher() OR id IN (SELECT public.student_subject_ids()));

CREATE POLICY books_select ON public.books
  FOR SELECT TO authenticated
  USING (public.is_teacher() OR subject_id IN (SELECT public.student_subject_ids()));

CREATE POLICY chapters_select ON public.chapters
  FOR SELECT TO authenticated
  USING (public.is_teacher() OR book_id IN (SELECT id FROM public.books WHERE subject_id IN (SELECT public.student_subject_ids())));

CREATE POLICY chunks_select ON public.chunks
  FOR SELECT TO authenticated
  USING (public.is_teacher() OR book_id IN (SELECT id FROM public.books WHERE subject_id IN (SELECT public.student_subject_ids())));

CREATE POLICY images_select ON public.images
  FOR SELECT TO authenticated
  USING (public.is_teacher() OR book_id IN (SELECT id FROM public.books WHERE subject_id IN (SELECT public.student_subject_ids())));

CREATE POLICY page_images_select ON public.page_images
  FOR SELECT TO authenticated
  USING (public.is_teacher() OR book_id IN (SELECT id FROM public.books WHERE subject_id IN (SELECT public.student_subject_ids())));

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_teacher());

CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.is_teacher());

CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY groups_select ON public.groups
  FOR SELECT TO authenticated
  USING (public.is_teacher() OR subject_id IN (SELECT public.student_subject_ids()));

CREATE POLICY groups_manage ON public.groups
  FOR ALL TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

CREATE POLICY group_members_select ON public.group_members
  FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.is_teacher());

CREATE POLICY group_members_manage ON public.group_members
  FOR ALL TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

CREATE POLICY query_logs_select ON public.query_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_teacher());

CREATE POLICY query_logs_insert ON public.query_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- PHASE 2: MULTI-CHAT, MESSAGES & USER MEMORY
-- ============================================================================

-- 1. Chats table
CREATE TABLE IF NOT EXISTS public.chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    summary TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Messages table (persisting sources, images, page_images, sections for identical card re-rendering)
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    sources JSONB DEFAULT '[]'::jsonb,
    images JSONB DEFAULT '[]'::jsonb,
    page_images JSONB DEFAULT '[]'::jsonb,
    sections JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. User Memory table (cross-chat durable student facts)
CREATE TABLE IF NOT EXISTS public.user_memory (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    facts JSONB DEFAULT '[]'::jsonb NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chats_user_updated ON public.chats(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON public.messages(chat_id, created_at ASC);

-- Row Level Security (Owner-only)
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chats_owner ON public.chats;
DROP POLICY IF EXISTS messages_owner ON public.messages;
DROP POLICY IF EXISTS user_memory_owner ON public.user_memory;

CREATE POLICY chats_owner ON public.chats
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY messages_owner ON public.messages
  FOR ALL TO authenticated
  USING (chat_id IN (SELECT id FROM public.chats WHERE user_id = auth.uid()))
  WITH CHECK (chat_id IN (SELECT id FROM public.chats WHERE user_id = auth.uid()));

CREATE POLICY user_memory_owner ON public.user_memory
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
