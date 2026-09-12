import { Request, Response } from 'express';
import { supabaseAuth, supabaseAdmin, isDbMocked } from '../../config/supabase';

/**
 * Tiện ích nội bộ / Admin utility: Tạo nhanh tài khoản người dùng đã xác thực (auto-confirmed).
 * Lưu ý: Luồng đăng ký công khai chính của người dùng diễn ra ở client-side (AuthScreen.tsx)
 * với cơ chế gửi link xác thực email tiêu chuẩn của Supabase.
 */
export const signup = async (req: Request, res: Response) => {
  const { email, password, fullName } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email và mật khẩu là bắt buộc' });
  
  if (isDbMocked) {
    return res.json({ success: true, message: 'Đăng ký thành công', user: { id: '00000', email } });
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: email.trim(),
    password: password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName.trim() } : {}
  });

  if (error) {
    if (error.message.includes('already') || error.message.includes('exists')) {
      return res.status(400).json({ error: 'Email này đã được sử dụng!' });
    }
    return res.status(400).json({ error: error.message });
  }
  return res.json({ success: true, message: 'Đăng ký thành công!', user: data.user });
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email và mật khẩu là bắt buộc' });

  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email: email.trim(),
    password: password
  });

  if (error || !data.session) return res.status(400).json({ error: error?.message || 'Thông tin đăng nhập không chính xác' });
  
  return res.json({ session: data.session, user: data.user });
};

export const getMe = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', req.user.id)
    .maybeSingle();
    
  return res.json({
    user: {
      ...req.user,
      role: profile?.role || req.user.role || 'user'
    }
  });
};

export const logout = async (_req: Request, res: Response) => {
  await supabaseAuth.auth.signOut();
  return res.json({ success: true });
};
