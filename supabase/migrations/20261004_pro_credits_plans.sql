-- =============================================================================
-- Migration: 20261004_pro_credits_plans.sql
-- Chuẩn hóa mô hình Quota lượt Pro, gói cước động và các hàm xử lý Atomic
-- =============================================================================

-- 1. Cập nhật bảng profiles: Thêm pro_credits (lượt không hạn) và monthly_credits (lượt có thời hạn)
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS pro_credits int NOT NULL DEFAULT 0 CHECK (pro_credits >= 0),
  ADD COLUMN IF NOT EXISTS monthly_credits int NOT NULL DEFAULT 0 CHECK (monthly_credits >= 0);

COMMENT ON COLUMN public.profiles.pro_credits IS 'Số lượt Pro không thời hạn (mua theo gói chuyến đơn/lượt lẻ)';
COMMENT ON COLUMN public.profiles.monthly_credits IS 'Số lượt Pro có thời hạn (chỉ hợp lệ khi premium_until > now())';

-- 2. Cập nhật bảng pricing_plans:
-- Đổi ràng buộc duration_days > 0 thành >= 0 (duration_days = 0 quy ước là gói không thời hạn)
ALTER TABLE public.pricing_plans DROP CONSTRAINT IF EXISTS pricing_plans_duration_days_check;
ALTER TABLE public.pricing_plans ADD CONSTRAINT pricing_plans_duration_days_check CHECK (duration_days >= 0);
ALTER TABLE public.pricing_plans ALTER COLUMN duration_days SET DEFAULT 0;

-- Đảm bảo các cột phụ trợ tồn tại
ALTER TABLE public.pricing_plans
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS price integer,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- 3. Cập nhật trigger bảo vệ thông tin đặc quyền của profile (người dùng thường không được tự ý sửa)
CREATE OR REPLACE FUNCTION public.protect_profile_privilege_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (auth.jwt() ->> 'role') = 'service_role'
     OR auth.role() = 'service_role'
     OR current_user IN ('postgres', 'service_role', 'supabase_admin')
     OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Tu choi: Nguoi dung khong co quyen thay doi vai tro (role)!';
  END IF;

  IF NEW.is_premium IS DISTINCT FROM OLD.is_premium THEN
    RAISE EXCEPTION 'Tu choi: Nguoi dung khong co quyen thay doi trang thai premium!';
  END IF;

  IF NEW.premium_until IS DISTINCT FROM OLD.premium_until THEN
    RAISE EXCEPTION 'Tu choi: Nguoi dung khong co quyen thay doi thoi han premium (premium_until)!';
  END IF;

  IF NEW.pro_credits IS DISTINCT FROM OLD.pro_credits THEN
    RAISE EXCEPTION 'Tu choi: Nguoi dung khong co quyen thay doi so luot Pro (pro_credits)!';
  END IF;

  IF NEW.monthly_credits IS DISTINCT FROM OLD.monthly_credits THEN
    RAISE EXCEPTION 'Tu choi: Nguoi dung khong co quyen thay doi so luot thang (monthly_credits)!';
  END IF;

  IF NEW.quota_total IS DISTINCT FROM OLD.quota_total THEN
    RAISE EXCEPTION 'Tu choi: Nguoi dung khong co quyen thay doi tong han muc (quota_total)!';
  END IF;

  IF NEW.quota_used < OLD.quota_used THEN
    RAISE EXCEPTION 'Tu choi: Khong the giam so luot da su dung (quota_used)!';
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Hàm SQL atomic: consume_pro_credit
-- Khóa dòng profile FOR UPDATE, trừ monthly_credits trước (nếu còn hạn), hết mới trừ pro_credits.
-- Trả về số lượt Pro khả dụng còn lại sau khi trừ.
CREATE OR REPLACE FUNCTION public.consume_pro_credit(p_user_id uuid)
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

  IF v_premium_until IS NOT NULL AND v_premium_until > now() AND v_monthly_credits > 0 THEN
    -- Trừ monthly_credits trước
    v_monthly_credits := v_monthly_credits - 1;
    UPDATE public.profiles
    SET monthly_credits = v_monthly_credits,
        updated_at = now()
    WHERE id = p_user_id;
  ELSIF v_pro_credits > 0 THEN
    -- Trừ pro_credits không thời hạn
    v_pro_credits := v_pro_credits - 1;
    UPDATE public.profiles
    SET pro_credits = v_pro_credits,
        updated_at = now()
    WHERE id = p_user_id;
  ELSE
    RAISE EXCEPTION 'NO_PRO_CREDIT';
  END IF;

  -- Tính tổng số lượt còn lại
  v_remaining := v_pro_credits + (CASE WHEN v_premium_until IS NOT NULL AND v_premium_until > now() THEN v_monthly_credits ELSE 0 END);
  
  -- Cập nhật cờ is_premium nếu đã hết toàn bộ lượt
  IF v_remaining <= 0 THEN
    UPDATE public.profiles
    SET is_premium = false
    WHERE id = p_user_id AND role <> 'admin';
  END IF;

  RETURN v_remaining;
END;
$$;

-- 5. Hàm SQL atomic: grant_plan_credits
-- Cấp lượt theo quy tắc:
--   duration_days = 0 => cộng dồn vào pro_credits (không đụng tới premium_until).
--   duration_days > 0:
--     - nếu đang còn hạn => cộng dồn cả monthly_credits VÀ cộng dồn ngày vào premium_until.
--     - nếu chưa có/đã hết hạn => lượt cũ bỏ, monthly_credits = grant, premium_until = now() + duration_days.
CREATE OR REPLACE FUNCTION public.grant_plan_credits(
  p_user_id uuid,
  p_credits int,
  p_duration_days int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pro_credits int;
  v_monthly_credits int;
  v_premium_until timestamptz;
  v_new_pro_credits int;
  v_new_monthly_credits int;
  v_new_premium_until timestamptz;
BEGIN
  IF p_credits <= 0 THEN
    RETURN;
  END IF;

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

  IF p_duration_days <= 0 THEN
    -- Gói không thời hạn: cộng dồn pro_credits
    v_new_pro_credits := v_pro_credits + p_credits;
    v_new_monthly_credits := CASE WHEN v_premium_until IS NOT NULL AND v_premium_until > now() THEN v_monthly_credits ELSE 0 END;
    v_new_premium_until := CASE WHEN v_premium_until IS NOT NULL AND v_premium_until > now() THEN v_premium_until ELSE NULL END;
  ELSE
    -- Gói có thời hạn
    v_new_pro_credits := v_pro_credits;
    IF v_premium_until IS NOT NULL AND v_premium_until > now() THEN
      -- Còn hạn: cộng dồn cả lượt lẫn ngày
      v_new_monthly_credits := v_monthly_credits + p_credits;
      v_new_premium_until := v_premium_until + (p_duration_days || ' days')::interval;
    ELSE
      -- Chưa có hoặc đã hết hạn: reset lượt tháng và tính ngày từ now()
      v_new_monthly_credits := p_credits;
      v_new_premium_until := now() + (p_duration_days || ' days')::interval;
    END IF;
  END IF;

  UPDATE public.profiles
  SET 
    pro_credits = v_new_pro_credits,
    monthly_credits = v_new_monthly_credits,
    premium_until = v_new_premium_until,
    is_premium = true,
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- 6. Phân quyền thực thi: chỉ cho service_role, thu hồi khỏi anon và authenticated
REVOKE EXECUTE ON FUNCTION public.consume_pro_credit(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_pro_credit(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.grant_plan_credits(uuid, int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_plan_credits(uuid, int, int) TO service_role;

-- 7. Chuẩn hóa dữ liệu pricing_plans
-- Deactivate các gói alias cũ
UPDATE public.pricing_plans
SET is_active = false
WHERE id IN ('starter', 'plus', 'premium', 'pro', 'quarterly');

-- Chuẩn hóa single_trip (duration=0, grant=1) và monthly (duration=30, grant=10)
-- Dùng DO UPDATE nhưng KHÔNG ghi đè amount / label nếu admin đã chỉnh sửa trước đó
INSERT INTO public.pricing_plans (
  id, amount, price, label, name, duration_days, quota_total_grant, is_unlimited, features, is_active, description, sort_order
) VALUES (
  'single_trip',
  19000,
  19000,
  'Gói Chuyến Đơn',
  'Gói Chuyến Đơn',
  0,
  1,
  false,
  ARRAY['1 lượt nâng cấp hoặc tạo mới chuyến đi Pro', 'Lượt dùng vĩnh viễn không hết hạn', 'Đầy đủ tính năng AI Pro & Live Map Pro'],
  true,
  '1 lượt nâng cấp hoặc tạo mới chuyến đi Pro (không thời hạn)',
  1
), (
  'monthly',
  49000,
  49000,
  'Gói 1 Tháng',
  'Gói 1 Tháng',
  30,
  10,
  false,
  ARRAY['10 lượt sử dụng trong 30 ngày', 'Cộng dồn lượt và ngày khi gia hạn', 'Đầy đủ tính năng AI Pro & Live Map Pro'],
  true,
  '10 lượt sử dụng trong 30 ngày (hết tháng hết hạn)',
  2
)
ON CONFLICT (id) DO UPDATE SET
  duration_days = EXCLUDED.duration_days,
  quota_total_grant = EXCLUDED.quota_total_grant,
  is_active = true,
  sort_order = EXCLUDED.sort_order;

-- 8. Backfill dữ liệu profiles an toàn:
-- Nhóm 1: Người dùng có premium_until còn hiệu lực -> chuyển quota còn lại sang monthly_credits, trả quota_total về 3
UPDATE public.profiles
SET 
  monthly_credits = GREATEST(0, quota_total - quota_used),
  quota_total = 3
WHERE premium_until > now() AND quota_total > 3 AND monthly_credits = 0;

-- Nhóm 2: Người dùng có premium_until hết hạn hoặc NULL, mà quota_total > 3 (mua gói chuyến đơn cũ) -> chuyển sang pro_credits
UPDATE public.profiles
SET 
  pro_credits = GREATEST(0, quota_total - GREATEST(quota_used, 3)),
  quota_total = 3
WHERE premium_until IS NULL AND quota_total > 3 AND pro_credits = 0;

-- Nhóm 2b: gói có thời hạn đã hết hạn => lượt chưa dùng mất (đúng quy tắc "hết tháng là hết"), chỉ reset về hạn mức free.
UPDATE public.profiles
SET quota_total = 3
WHERE premium_until IS NOT NULL AND premium_until <= now() AND quota_total > 3;

-- Nhóm 3: Khắc phục lỗi hiển thị "Gói 1 Tháng còn 365 ngày": bug cũ gán premium_until = now + 365 ngày
-- cho người mua gói chuyến đơn. Gói đơn KHÔNG có thời hạn => gỡ premium_until, chuyển lượt sang pro_credits.
-- Điều kiện: đơn hoàn tất MỚI NHẤT của user là gói đơn (single_trip/starter/plus) và hạn còn > 340 ngày
-- (gói tháng hợp lệ chỉ cộng 30 ngày/lần nên hiếm khi vượt ngưỡng này).
UPDATE public.profiles p
SET 
  premium_until = NULL,
  pro_credits = p.pro_credits + p.monthly_credits,
  monthly_credits = 0
WHERE p.premium_until > (now() + interval '340 days')
  AND (
    SELECT o.plan
    FROM public.payment_orders o
    WHERE o.user_id = p.id
      AND o.status::text IN ('completed', 'success')
    ORDER BY o.created_at DESC
    LIMIT 1
  ) IN ('single_trip', 'starter', 'plus');
