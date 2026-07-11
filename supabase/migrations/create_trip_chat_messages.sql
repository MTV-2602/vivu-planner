-- Migration: Create trip_chat_messages table for chatbot history

CREATE TABLE IF NOT EXISTS public.trip_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'model')),
  content text NOT NULL,
  adapted_itinerary jsonb,
  diff text,
  previous_snapshot jsonb,
  is_create_trip boolean,
  create_trip_params jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.trip_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_messages_owner_all" ON public.trip_chat_messages
  FOR ALL USING (
    auth.uid() = user_id
  ) WITH CHECK (
    auth.uid() = user_id
  );
