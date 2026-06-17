import { Router, Request, Response } from 'express';
import { supabaseAdmin, isDbMocked } from '../services/supabaseAdmin';

const router = Router();

// POST /api/auth/signup - Đăng ký tài khoản mới và tự động xác thực email
router.post('/signup', async (req: Request, res: Response) => {
  const { email, password, fullName } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email và mật khẩu là bắt buộc' });
  }

  if (isDbMocked) {
    return res.json({
      success: true,
      message: 'Đăng ký thành công (Chế độ Mock Auth)',
      user: { id: '00000000-0000-0000-0000-000000000000', email }
    });
  }

  try {
    // 1. Kiểm tra nhanh xem email đã tồn tại trong database chưa (bản ghi đã đăng ký)
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error('[Auth Backend] listUsers error:', listError.message);
      return res.status(500).json({ error: 'Không thể xác thực thông tin tài khoản', details: listError.message });
    }

    const emailExists = (users || []).some(
      (u: any) => u.email?.toLowerCase().trim() === email.toLowerCase().trim()
    );
    
    if (emailExists) {
      return res.status(400).json({ error: 'Email này đã được sử dụng!' });
    }

    // 2. Tạo người dùng mới và tự động xác thực email (email_confirm: true) để bỏ qua SMTP rate limit
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password: password,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName.trim() } : {}
    });

    if (error) {
      console.error('[Auth Backend] createUser error:', error.message);
      let errMsg = error.message;
      // Chuẩn hóa câu thông báo lỗi trùng lặp từ Supabase
      if (
        errMsg.toLowerCase().includes('already exists') || 
        errMsg.toLowerCase().includes('already registered') ||
        errMsg.toLowerCase().includes('duplicate')
      ) {
        errMsg = 'Email này đã được sử dụng!';
      }
      return res.status(400).json({ error: errMsg });
    }

    return res.json({
      success: true,
      message: 'Đăng ký thành công!',
      user: data.user
    });
  } catch (err: any) {
    console.error('[Auth Backend] signup exception:', err);
    return res.status(500).json({ error: 'Có lỗi xảy ra trong quá trình xử lý đăng ký', details: err.message });
  }
});

export default router;
