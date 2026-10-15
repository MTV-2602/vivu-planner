-- Non-destructive wallet operations on the existing profiles/trips tables.
-- NULL preserves existing orders whose original duration was not recorded.
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS duration_days_granted integer CHECK (duration_days_granted >= 0);
CREATE OR REPLACE FUNCTION public.admin_update_wallets(p_user_id uuid, p_expected jsonb, p_values jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;
  IF p.role = 'admin' THEN RAISE EXCEPTION 'ADMIN_WALLET_PROTECTED'; END IF;
  IF p.quota_total IS DISTINCT FROM (p_expected->>'quota_total')::int
    OR p.quota_used IS DISTINCT FROM (p_expected->>'quota_used')::int
    OR p.pro_credits IS DISTINCT FROM (p_expected->>'pro_credits')::int
    OR p.monthly_credits IS DISTINCT FROM (p_expected->>'monthly_credits')::int
    OR p.premium_until IS DISTINCT FROM (p_expected->>'premium_until')::timestamptz THEN
    RAISE EXCEPTION 'WALLET_CONFLICT';
  END IF;
  UPDATE public.profiles SET quota_total = (p_values->>'quota_total')::int,
    pro_credits = (p_values->>'pro_credits')::int, monthly_credits = (p_values->>'monthly_credits')::int,
    premium_until = (p_values->>'premium_until')::timestamptz,
    is_premium = (p_values->>'is_premium')::boolean, updated_at = now()
  WHERE id = p_user_id RETURNING * INTO p;
  RETURN to_jsonb(p);
END; $$;

CREATE OR REPLACE FUNCTION public.consume_trip_wallet(p_user_id uuid, p_trip_id uuid, p_is_pro boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; t public.trips; prefs jsonb; source text; flag text;
BEGIN
  SELECT * INTO t FROM public.trips WHERE id = p_trip_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRIP_NOT_FOUND'; END IF;
  prefs := CASE WHEN jsonb_typeof(t.preferences) = 'object' THEN t.preferences ELSE '{}'::jsonb END;
  flag := CASE WHEN p_is_pro THEN 'pro_credit_consumed' ELSE 'quota_consumed' END;
  IF COALESCE((prefs->>flag)::boolean, false) THEN RETURN jsonb_build_object('deducted', false); END IF;
  IF COALESCE((prefs->>'wallet_pending')::boolean, false) OR COALESCE((prefs->>'wallet_refunding')::boolean, false) THEN RAISE EXCEPTION 'WALLET_CONFLICT'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;
  IF p_is_pro THEN
    IF p.premium_until > now() AND p.monthly_credits > 0 THEN
      source := 'monthly'; p.monthly_credits := p.monthly_credits - 1;
    ELSIF p.pro_credits > 0 THEN
      source := 'permanent'; p.pro_credits := p.pro_credits - 1;
    ELSE RAISE EXCEPTION 'NO_PRO_CREDIT'; END IF;
  ELSE
    IF p.quota_used >= p.quota_total THEN RAISE EXCEPTION 'NO_FREE_CREDIT'; END IF;
    source := 'free'; p.quota_used := p.quota_used + 1;
  END IF;
  UPDATE public.profiles SET quota_used = p.quota_used, pro_credits = p.pro_credits,
    monthly_credits = p.monthly_credits,
    is_premium = (p.role = 'admin' OR p.pro_credits + CASE WHEN p.premium_until > now() THEN p.monthly_credits ELSE 0 END > 0), updated_at = now()
  WHERE id = p_user_id;
  prefs := prefs || jsonb_build_object(flag, true, 'wallet_source', source,
    'wallet_monthly_until', CASE WHEN source = 'monthly' THEN p.premium_until ELSE NULL END);
  IF p_is_pro THEN prefs := prefs || '{"is_ai_pro":true,"ai_tier":"pro"}'::jsonb; END IF;
  UPDATE public.trips SET preferences = prefs WHERE id = p_trip_id;
  RETURN jsonb_build_object('deducted', true, 'source', source);
END; $$;

CREATE OR REPLACE FUNCTION public.refund_trip_wallet(p_user_id uuid, p_trip_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles; t public.trips; prefs jsonb; source text; flag text;
BEGIN
  SELECT * INTO t FROM public.trips WHERE id = p_trip_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  prefs := CASE WHEN jsonb_typeof(t.preferences) = 'object' THEN t.preferences ELSE '{}'::jsonb END; source := prefs->>'wallet_source';
  IF source IS NULL OR source NOT IN ('free', 'monthly', 'permanent') THEN RETURN; END IF;
  flag := CASE WHEN source = 'free' THEN 'quota_consumed' ELSE 'pro_credit_consumed' END;
  IF NOT COALESCE((prefs->>flag)::boolean, false) THEN RETURN; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;
  IF source = 'free' THEN p.quota_used := GREATEST(0, p.quota_used - 1);
  ELSIF source = 'permanent' THEN p.pro_credits := p.pro_credits + 1;
  ELSIF (prefs->>'wallet_monthly_until')::timestamptz > now() AND p.premium_until >= (prefs->>'wallet_monthly_until')::timestamptz THEN
    p.monthly_credits := p.monthly_credits + 1;
  END IF;
  UPDATE public.profiles SET quota_used = p.quota_used, pro_credits = p.pro_credits,
    monthly_credits = p.monthly_credits,
    is_premium = (p.role = 'admin' OR p.pro_credits + CASE WHEN p.premium_until > now() THEN p.monthly_credits ELSE 0 END > 0), updated_at = now()
  WHERE id = p_user_id;
  UPDATE public.trips SET preferences = prefs || jsonb_build_object(flag, false) WHERE id = p_trip_id;
END; $$;

-- The legacy refund must never convert an expired timed credit to permanent.
CREATE OR REPLACE FUNCTION public.refund_pro_credit(p_user_id uuid, p_to_monthly boolean DEFAULT false)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;
  IF p_to_monthly THEN
    IF p.premium_until > now() THEN p.monthly_credits := p.monthly_credits + 1; END IF;
  ELSE p.pro_credits := p.pro_credits + 1; END IF;
  UPDATE public.profiles SET pro_credits = p.pro_credits, monthly_credits = p.monthly_credits,
    is_premium = (p.role = 'admin' OR p.pro_credits + CASE WHEN p.premium_until > now() THEN p.monthly_credits ELSE 0 END > 0), updated_at = now()
  WHERE id = p_user_id;
  RETURN p.pro_credits + CASE WHEN p.premium_until > now() THEN p.monthly_credits ELSE 0 END;
END; $$;

REVOKE ALL ON FUNCTION public.admin_update_wallets(uuid,jsonb,jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_trip_wallet(uuid,uuid,boolean) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_trip_wallet(uuid,uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_pro_credit(uuid,boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_wallets(uuid,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_trip_wallet(uuid,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_trip_wallet(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_pro_credit(uuid,boolean) TO service_role;
