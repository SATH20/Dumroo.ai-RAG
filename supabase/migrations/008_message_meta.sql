-- Preserve presentation state so reopened chats render exactly like live replies.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;
