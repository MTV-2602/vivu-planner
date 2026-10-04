-- =============================================================================
-- Migration: 20261004b_upgrade_trip_to_pro.sql
-- Hàm SQL atomic: nâng cấp chuyến đi lên Pro trong một transaction duy nhất
-- và hàm hoàn lại lượt Pro an toàn.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.upgrade_trip_to_pro(
  p_trip_id uuid,
  p_user_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_user_id uuid;
  v_preferences jsonb;
  v_pro_credits int;
  v_monthly_credits int;
  v_premium_until timestamptz;
  v_remaining int;
  v_updated_prefs jsonb;
BEGIN
  -- 1. Kiểm tra chuyến đi và khóa dòng trip
  SELECT user_id, preferences
  INTO v_trip_user_id, v_preferences
  FROM public.trips
  WHERE id = p_trip_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRIP_NOT_FOUND';
  END IF;

  -- 2. Kiểm tra quyền sở hữu
  IF v_trip_user_id <> p_user_id THEN
    RAISE EXCEPTION 'NOT_OWNER';
  END IF;

  -- 3. Kiểm tra chuyến đi đã là Pro chưa
  IF (v_preferences->>'is_ai_pro') = 'true' OR (v_preferences->>'ai_tier') = 'pro' THEN
    RAISE EXCEPTION 'ALREADY_PRO';
  END IF;

  -- 4. Khóa dòng profile FOR UPDATE để kiểm tra và trừ lượt
  SELECT pro_credits, monthly_credits, premium_until
  INTO v_pro_credits, v_monthly_credits, v_premium_until
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  v_pro_credits := COALESCE(v_pro_credits, 0);
  v_monthly_credits := COALESCE(v_monthly_credits, 0);

  -- 5. Trừ lượt (monthly_credits trước nếu còn hạn, sau đó pro_credits)
  IF v_premium_until IS NOT NULL AND v_premium_until > now() AND v_monthly_credits > 0 THEN
    v_monthly_credits := v_monthly_credits - 1;
    UPDATE public.profiles
    SET monthly_credits = v_monthly_credits,
        updated_at = now()
    WHERE id = p_user_id;
  ELSIF v_pro_credits > 0 THEN
    v_pro_credits := v_pro_credits - 1;
    UPDATE public.profiles
    SET pro_credits = v_pro_credits,
        updated_at = now()
    WHERE id = p_user_id;
  ELSE
    RAISE EXCEPTION 'NO_PRO_CREDIT';
  END IF;

  -- 6. Tính số lượt còn lại
  v_remaining := v_pro_credits + (CASE WHEN v_premium_until IS NOT NULL AND v_premium_until > now() THEN v_monthly_credits ELSE 0 END);

  IF v_remaining <= 0 THEN
    UPDATE public.profiles
    SET is_premium = false
    WHERE id = p_user_id AND role <> 'admin';
  END IF;

  -- 7. Cập nhật preferences của chuyến đi
  v_updated_prefs := (
    CASE WHEN jsonb_typeof(v_preferences) = 'object' THEN v_preferences ELSE '{}'::jsonb END
  ) || jsonb_build_object(
    'is_ai_pro', true,
    'ai_tier', 'pro',
    'pro_credit_consumed', true
  );

  UPDATE public.trips
  SET preferences = v_updated_prefs,
      updated_at = now()
  WHERE id = p_trip_id;

  RETURN v_remaining;
END;
$$;

-- Hàm SQL hoàn lại lượt Pro an toàn
CREATE OR REPLACE FUNCTION public.refund_pro_credit(
  p_user_id uuid,
  p_to_monthly boolean DEFAULT false
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pro_credits int;
  v_monthly_credits int;
  v_premium_until timestamptz;
  v_remaining int;
BEGIN
  SELECT pro_credits, monthly_credits, premium_until
  INTO v_pro_credits, v_monthly_credits, v_premium_until
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  v_pro_credits := COALESCE(v_pro_credits, 0);
  v_monthly_credits := COALESCE(v_monthly_credits, 0);

  IF p_to_monthly AND v_premium_until IS NOT NULL AND v_premium_until > now() THEN
    v_monthly_credits := v_monthly_credits + 1;
    UPDATE public.profiles
    SET monthly_credits = v_monthly_credits,
        is_premium = true,
        updated_at = now()
    WHERE id = p_user_id;
  ELSE
    v_pro_credits := v_pro_credits + 1;
    UPDATE public.profiles
    SET pro_credits = v_pro_credits,
        is_premium = true,
        updated_at = now()
    WHERE id = p_user_id;
  END IF;

  v_remaining := v_pro_credits + (CASE WHEN v_premium_until IS NOT NULL AND v_premium_until > now() THEN v_monthly_credits ELSE 0 END);
  RETURN v_remaining;
END;
$$;

-- Phân quyền: chỉ service_role được thực thi
REVOKE EXECUTE ON FUNCTION public.upgrade_trip_to_pro(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upgrade_trip_to_pro(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.refund_pro_credit(uuid, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_pro_credit(uuid, boolean) TO service_role;
