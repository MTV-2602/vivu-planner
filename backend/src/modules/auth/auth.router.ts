import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabase';
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

    // Tạo OTP và gửi email
    const otp = generateAndStoreOtp(normalizedEmail);
    await sendPasswordResetOtpEmail(normalizedEmail, otp);

    return res.json({
      success: true,
      message: 'Mã xác nhận 6 số đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư (cả mục Spam/Rác).',
    });
  } catch (err: any) {
    console.error('[Auth] forgot-password error:', err.message);
    return res.status(500).json({
      error: err.message || 'Lỗi gửi mã OTP. Vui lòng kiểm tra cấu hình GMAIL_USER và GMAIL_APP_PASSWORD.',
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

export default router;
