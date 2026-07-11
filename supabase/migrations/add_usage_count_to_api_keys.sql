-- Migration: Add usage_count to gemini_api_keys

ALTER TABLE public.gemini_api_keys ADD COLUMN IF NOT EXISTS usage_count integer DEFAULT 0;
