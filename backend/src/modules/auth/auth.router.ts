import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';
import { requireAuth } from '../../middleware/requireAuth';
import { generateAndStoreOtp, verifyOtp, clearOtp, sendPasswordResetOtpEmail } from './auth.service';

const router = Router();

/**
 * POST /api/auth/forgot-password
 * Nhận email, tạo mã OTP và gửi email xác nhận qua Gmail SMTP
 */
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Vui lòng cung cấp địa chỉ email hợp lệ.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Kiểm tra xem tài khoản có tồn tại trong hệ thống không
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (error || !profile) {
      // Để bảo mật không tiết lộ email tồn tại hay không, vẫn báo thành công hoặc thông báo thân thiện
      return res.json({
        success: true,
        message: 'Nếu email tồn tại trong hệ thống, mã xác nhận OTP đã được gửi đến hòm thư của bạn.',
      });
    }

    // Tạo mã xác nhận OTP
    const otp = generateAndStoreOtp(normalizedEmail);

    // Kiểm tra cấu hình Gmail SMTP
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      console.log(`\n======================================================`);
      console.log(`[AUTH OTP] CHƯA CẤU HÌNH GMAIL SMTP TRONG backend/.env`);
      console.log(`[AUTH OTP DEV BACKUP] Mã OTP cho ${normalizedEmail}: [ ${otp} ]`);
      console.log(`======================================================\n`);
      return res.status(400).json({
        error: 'Hệ thống chưa cấu hình tài khoản gửi email (thiếu GMAIL_USER hoặc GMAIL_APP_PASSWORD trong file backend/.env). Vui lòng cấu hình để nhận mã OTP qua hòm thư Gmail.',
      });
    }

    // Gửi email thực tế qua Gmail SMTP
    await sendPasswordResetOtpEmail(normalizedEmail, otp);

    return res.json({
      success: true,
      message: 'Mã xác nhận 6 số đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư (cả mục Spam/Rác).',
    });
  } catch (err: any) {
    console.error('[Auth] forgot-password error:', err.message);
    return res.status(500).json({
      error: err.message || 'Lỗi gửi mã OTP. Vui lòng thử lại sau.',
    });
  }
});

/**
 * POST /api/auth/verify-otp
 * Xác thực mã OTP người dùng nhập
 */
router.post('/verify-otp', (req: Request, res: Response) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: 'Vui lòng cung cấp email và mã xác nhận OTP.' });
  }

  const result = verifyOtp(email, otp);
  if (!result.valid) {
    return res.status(400).json({ error: result.message });
  }

  return res.json({ success: true, message: 'Mã xác nhận hợp lệ.' });
});

/**
 * POST /api/auth/reset-password
 * Kiểm tra lại OTP và cập nhật mật khẩu mới thông qua Supabase Admin API
 */
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ email, mã OTP và mật khẩu mới.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
    }

    // 1. Kiểm tra OTP
    const result = verifyOtp(email, otp);
    if (!result.valid) {
      return res.status(400).json({ error: result.message });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 2. Tìm ID tài khoản
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (!profile) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản người dùng.' });
    }

    // 3. Đổi mật khẩu qua Supabase Admin API
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
      password: newPassword,
    });

    if (updateErr) {
      throw updateErr;
    }

    // 4. Xóa OTP sau khi đổi mật khẩu thành công
    clearOtp(normalizedEmail);

    return res.json({
      success: true,
      message: 'Đặt lại mật khẩu thành công! Bạn có thể đăng nhập ngay bằng mật khẩu mới.',
    });
  } catch (err: any) {
    console.error('[Auth] reset-password error:', err.message);
    return res.status(500).json({ error: `Lỗi đặt lại mật khẩu: ${err.message}` });
  }
});

/**
 * PUT /api/auth/profile
 * Cập nhật thông tin hồ sơ: full_name, avatar_url, preferences
 */
router.put('/profile', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const { full_name, avatar_url, preferences } = req.body;
    const profileUpdateData: any = {};

    if (typeof full_name === 'string') profileUpdateData.full_name = full_name.trim();
    if (typeof avatar_url === 'string') profileUpdateData.avatar_url = avatar_url.trim();

    // 1. Cập nhật bảng profiles (full_name, avatar_url)
    let profileData: any = {};
    if (Object.keys(profileUpdateData).length > 0) {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdateData)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        console.warn('[Auth] Update profiles table warning:', error.message);
      } else {
        profileData = data || {};
      }
    } else {
      const { data } = await supabaseAdmin.from('profiles').select('*').eq('id', userId).maybeSingle();
      profileData = data || {};
    }

    // 2. Lưu preferences và metadata vào Supabase Auth user_metadata
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
    const existingMeta = userData?.user?.user_metadata || {};
    const newMeta: any = { ...existingMeta };

    if (typeof full_name === 'string') newMeta.full_name = full_name.trim();
    if (typeof avatar_url === 'string') newMeta.avatar_url = avatar_url.trim();
    if (Array.isArray(preferences)) newMeta.preferences = preferences;

    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: newMeta,
    });

    profileData.preferences = newMeta.preferences || profileData.preferences || [];

    return res.json({
      success: true,
      message: 'Cập nhật thông tin hồ sơ thành công!',
      profile: profileData,
    });
  } catch (err: any) {
    console.error('[Auth] update profile error:', err.message);
    return res.status(500).json({ error: err.message || 'Lỗi cập nhật hồ sơ' });
  }
});

/**
 * POST /api/auth/upload-avatar
 * Tải ảnh đại diện lên Supabase Storage bucket `post-media`
 */
router.post('/upload-avatar', requireAuth, async (req: any, res: Response) => {
  try {
    const { base64, fileName, fileType } = req.body;
    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ error: 'Dữ liệu file tải lên không hợp lệ.' });
    }

    const cleanBase64 = base64.includes('base64,') ? base64.split('base64,')[1] : base64;
    const buffer = Buffer.from(cleanBase64, 'base64');
    const ext = (fileName ? fileName.split('.').pop() : 'jpg').toLowerCase();
    const uniqueName = `avatar_${req.user!.id}_${Date.now()}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('post-media')
      .upload(uniqueName, buffer, {
        contentType: fileType || 'image/jpeg',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('post-media')
      .getPublicUrl(uniqueName);

    return res.json({
      success: true,
      url: publicUrlData.publicUrl,
    });
  } catch (err: any) {
    console.error('[Auth] upload avatar error:', err.message);
    return res.status(500).json({ error: err.message || 'Lỗi tải ảnh đại diện' });
  }
});

export default router;
