import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Compass, Sparkles, AlertCircle, ArrowRight } from 'lucide-react';
import { supabase, isMockAuth } from '../lib/supabaseClient';
import { apiClient } from '../lib/apiClient';

export function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSignUp, setIsSignUp] = useState(location.pathname === '/dang-ky');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  useEffect(() => {
    setIsSignUp(location.pathname === '/dang-ky');
  }, [location.pathname]);

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      if (session) {
        navigate('/chuyen-di');
      }
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Vui lòng điền đầy đủ email và mật khẩu');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setInfoMsg('');

    try {
      const adminEmails = ['team89a6@gmail.com', 'vinhvip4508@gmail.com', 'mockuser@vivu.vn'];
      const isTargetAdmin = adminEmails.includes(email.toLowerCase().trim());

      if (isSignUp) {
        if (isTargetAdmin) {
          throw new Error('Email này đã được sử dụng!');
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: fullName ? { data: { full_name: fullName } } : undefined
        });

        if (error) throw error;

        // Nếu email đã tồn tại trong Supabase và đã bật xác thực email, identities sẽ rỗng
        if (data?.user && data.user.identities && data.user.identities.length === 0) {
          throw new Error('Email này đã được sử dụng!');
        }
        
        if (data?.session) {
          navigate('/chuyen-di');
        } else {
          setInfoMsg('Đăng ký thành công! Vui lòng kiểm tra email để xác nhận tài khoản.');
        }
      } else {
        if (isTargetAdmin) {
          // 1. Admin login flow
          try {
            const res = await apiClient.post('/admin/login', { email, password });
            if (res.data && res.data.token) {
              localStorage.setItem('vivu_admin_token', res.data.token);
              localStorage.setItem('vivu_mock_user', JSON.stringify({ id: '00000000-0000-0000-0000-000000000001', email: res.data.email }));
              localStorage.setItem('vivu_mock_token', res.data.token);
              navigate('/chuyen-di');
              return;
            }
          } catch (adminErr: any) {
            console.log('[Auth] Admin login failed:', adminErr);
            throw new Error('Email hoặc mật khẩu không chính xác!');
          }
        } else {
          // 2. Regular Supabase login flow
          const { error } = await supabase.auth.signInWithPassword({
            email,
            password
          });

          if (error) {
            throw new Error('Email hoặc mật khẩu không chính xác!');
          }
          localStorage.removeItem('vivu_admin_token');
          navigate('/chuyen-di');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Có lỗi xảy ra trong quá trình xử lý');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen neon-glow-bg flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative">
      <div className="noise-overlay" aria-hidden="true" />
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10 text-center space-y-4">
        <Link to="/" className="inline-flex items-center gap-2">
          <Compass className="w-10 h-10 text-brand-primary" />
          <span className="font-display font-extrabold text-3xl text-brand-primary">ViVu Planner</span>
        </Link>
        
        {isMockAuth && (
          <div className="inline-flex items-center gap-1 bg-brand-gold/10 border border-brand-gold/30 text-brand-textSoft px-3 py-1.5 rounded-full text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-brand-gold shrink-0" />
            Đang chạy chế độ Demo (Mock Auth) - Nhập bất kỳ email/pass để tiếp tục
          </div>
        )}
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10 px-4">
        <div className="glass-panel py-8 px-6 sm:px-10 rounded-3xl shadow-xl border border-white/40">
          <h2 className="text-2xl font-display font-bold text-brand-text mb-6 text-center">
            {isSignUp ? 'Tạo tài khoản mới' : 'Đăng nhập vào tài khoản'}
          </h2>

          {errorMsg && (
            <div className="mb-4 p-4 rounded-xl bg-brand-danger/10 border border-brand-danger/30 text-brand-danger text-sm flex gap-2.5 items-start">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {infoMsg && (
            <div className="mb-4 p-4 rounded-xl bg-brand-primary/10 border border-brand-primary/30 text-brand-primary text-sm flex gap-2.5 items-start">
              <Sparkles className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{infoMsg}</span>
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            {isSignUp && (
              <div>
                <label htmlFor="name" className="block text-sm font-semibold text-brand-textSoft mb-1.5">
                  Họ và tên
                </label>
                <input
                  id="name"
                  type="text"
                  placeholder="Nguyễn Văn A"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm"
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-brand-textSoft mb-1.5">
                Địa chỉ Email
              </label>
              <input
                id="email"
                type="email"
                required
                placeholder="example@vivu.vn"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-brand-textSoft mb-1.5">
                Mật khẩu
              </label>
              <input
                id="password"
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl bg-brand-accent hover:bg-brand-accentStrong text-white font-bold text-sm transition shadow-md hover:shadow-brand-accent/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? 'Đang xử lý...' : isSignUp ? 'Đăng Ký' : 'Đăng Nhập'}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </form>

          <div className="mt-6 border-t border-brand-line/50 pt-5 text-center">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setErrorMsg('');
                setInfoMsg('');
              }}
              className="text-sm font-semibold text-brand-primary hover:text-brand-primaryStrong transition"
            >
              {isSignUp ? 'Đã có tài khoản? Đăng nhập ngay' : 'Chưa có tài khoản? Tạo tài khoản mới'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
export default Auth;
