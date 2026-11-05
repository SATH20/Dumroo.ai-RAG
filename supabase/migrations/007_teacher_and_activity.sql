-- 007_teacher_and_activity.sql
-- Migration for Task D: Teacher area and query log activity tracking

-- 1. Add mode to chats ('student' or 'teacher')
ALTER TABLE public.chats 
ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'student' CHECK (mode IN ('student', 'teacher'));

-- 2. Add is_demo flag to query_logs
ALTER TABLE public.query_logs 
ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

-- 3. Add web_sources to messages for Tavily teacher search persistence
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS web_sources JSONB DEFAULT '[]'::jsonb;

-- 4. Optimization indexes for fast dashboard queries and range filtering
CREATE INDEX IF NOT EXISTS idx_query_logs_created_at_desc ON public.query_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_logs_answered ON public.query_logs(answered);
CREATE INDEX IF NOT EXISTS idx_query_logs_is_demo ON public.query_logs(is_demo);
CREATE INDEX IF NOT EXISTS idx_chats_mode ON public.chats(mode);
