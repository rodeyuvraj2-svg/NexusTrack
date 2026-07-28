-- Add manga to media_type enum
ALTER TYPE public.media_type ADD VALUE IF NOT EXISTS 'manga';

-- Add manga-specific columns to media table
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS chapter_count int;
ALTER TABLE public.media ADD COLUMN IF NOT EXISTS volume_count int;
