-- Giữ dữ liệu chưa có ghim thật để admin sửa; không xóa dữ liệu hiện có.
ALTER TABLE public.partners ALTER COLUMN lat DROP NOT NULL;
ALTER TABLE public.partners ALTER COLUMN lng DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partners_active_location_verified' AND conrelid = 'public.partners'::regclass) THEN
    ALTER TABLE public.partners ADD CONSTRAINT partners_active_location_verified CHECK (
      NOT active_status OR (
        lat IS NOT NULL AND lng IS NOT NULL AND lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
        AND (lat <> 0 OR lng <> 0)
        AND COALESCE(i18n->>'location_verified', 'false') = 'true'
        AND COALESCE(i18n->>'coordinate_source', '') = 'google_maps_pin'
      )
    ) NOT VALID;
  END IF;
END $$;

COMMENT ON TABLE public.partners IS 'Kho địa điểm bản địa; điểm chưa xác minh được lưu tắt để admin quản lý.';

-- Đóng đường đọc công khai trực tiếp qua Supabase; admin quản lý cả hàng chờ.
DROP POLICY IF EXISTS "partners_public_select" ON public.partners;
DROP POLICY IF EXISTS "partners_pro_select" ON public.partners;
CREATE POLICY "partners_pro_select" ON public.partners FOR SELECT TO authenticated USING (
  public.is_admin() OR (active_status = true AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND (p.pro_credits > 0 OR (p.monthly_credits > 0 AND p.premium_until > now()))
  ))
);
