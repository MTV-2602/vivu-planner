-- Migration: Add missing columns to profiles table for AI quota and Premium features
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS premium_until timestamptz,
ADD COLUMN IF NOT EXISTS custom_quota int DEFAULT 3,
ADD COLUMN IF NOT EXISTS trips_used int DEFAULT 0;
