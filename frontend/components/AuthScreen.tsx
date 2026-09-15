import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform, useWindowDimensions,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Compass, Sparkles, AlertCircle, ArrowRight, Check, KeyRound, Mail, X, CheckCircle2, Lock } from 'lucide-react-native';
import { supabase, decodeJwtRole } from '../lib/supabase';
import { api } from '../lib/api';
import { BRAND_COLORS, APP_ROUTES, UI_BREAKPOINTS, UserRole } from '../constants';

const F = {
  loraRegular: 'Lora_400Regular' as const,
  loraBold: 'Lora_700Bold' as const,
  regular: 'BeVietnamPro_400Regular' as const,
  semiBold: 'BeVietnamPro_600SemiBold' as const,
  bold: 'BeVietnamPro_700Bold' as const,
};

interface Props {
  mode: 'signin' | 'signup';
}

export default function AuthScreen({ mode }: Props) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= UI_BREAKPOINTS.DESKTOP;

  const [isSignUp, setIsSignUp] = useState(mode === 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  // Quên mật khẩu state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState<'email' | 'otp' | 'newPassword'>('email');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  const handleSendOtp = async () => {
    if (!forgotEmail || !forgotEmail.includes('@')) {
      setForgotError('Vui lòng nhập địa chỉ email hợp lệ.');
      return;
    }
    setForgotLoading(true);
    setForgotError('');
    setForgotSuccess('');
    try {
      const res = await api.post('/auth/forgot-password', { email: forgotEmail });
      setForgotSuccess(res.data.message || 'Mã OTP đã được gửi đến email của bạn.');
      setForgotStep('otp');
    } catch (err: any) {
      setForgotError(err.response?.data?.error || err.message || 'Không thể gửi mã OTP.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!forgotOtp || forgotOtp.trim().length < 4) {
      setForgotError('Vui lòng nhập mã xác nhận OTP.');
      return;
    }
    setForgotLoading(true);
    setForgotError('');
    try {
      await api.post('/auth/verify-otp', { email: forgotEmail, otp: forgotOtp });
      setForgotSuccess('');
      setForgotStep('newPassword');
    } catch (err: any) {
      setForgotError(err.response?.data?.error || err.message || 'Mã OTP không hợp lệ.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!forgotNewPassword || forgotNewPassword.length < 6) {
      setForgotError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError('Mật khẩu xác nhận không khớp.');
      return;
    }
    setForgotLoading(true);
    setForgotError('');
    try {
      const res = await api.post('/auth/reset-password', {
        email: forgotEmail,
        otp: forgotOtp,
        newPassword: forgotNewPassword,
      });
      setShowForgotModal(false);
      setInfoMsg(res.data.message || 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập.');
      setPassword('');
      setForgotEmail('');
      setForgotOtp('');
      setForgotNewPassword('');
      setForgotConfirmPassword('');
      setForgotStep('email');
    } catch (err: any) {
      setForgotError(err.response?.data?.error || err.message || 'Lỗi đặt lại mật khẩu.');
    } finally {
      setForgotLoading(false);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        let isAdmin = decodeJwtRole(session.access_token) === UserRole.ADMIN;
        if (!isAdmin && session.user?.id) {
          const { data: p } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
          if (p?.role === UserRole.ADMIN) isAdmin = true;
        }
        router.replace(isAdmin ? (APP_ROUTES.ADMIN as any) : (APP_ROUTES.TRIPS as any));
      }
    });
  }, []);

  const handleSubmit = async () => {
    if (!email || !password) {
      setErrorMsg('Vui lòng điền đầy đủ email và mật khẩu');
      return;
    }
    if (isSignUp && !agreed) {
      setErrorMsg('Vui lòng đọc và đồng ý với cam kết bảo mật dữ liệu');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setInfoMsg('');

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } }
        });
        if (error) throw error;

        if (data.session) {
          let isAdmin = decodeJwtRole(data.session.access_token) === UserRole.ADMIN;
          if (!isAdmin && data.user?.id) {
            const { data: p } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
            if (p?.role === UserRole.ADMIN) isAdmin = true;
          }
          router.replace(isAdmin ? (APP_ROUTES.ADMIN as any) : (APP_ROUTES.TRIPS as any));
          return;
        }

        setInfoMsg('Đăng ký thành công! Vui lòng kiểm tra email để xác nhận.');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error('Email hoặc mật khẩu không chính xác!');
        
        // Kiểm tra quyền admin thông qua claim trong JWT hoặc bảng profiles
        let isAdmin = data.session?.access_token
          ? decodeJwtRole(data.session.access_token) === UserRole.ADMIN
          : false;
        
        if (!isAdmin && data.user?.id) {
          const { data: p } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
          if (p?.role === UserRole.ADMIN) isAdmin = true;
        }
        
        router.replace(isAdmin ? (APP_ROUTES.ADMIN as any) : (APP_ROUTES.TRIPS as any));
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Có lỗi xảy ra trong quá trình xử lý');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setErrorMsg('');
    setInfoMsg('');
    router.replace((isSignUp ? APP_ROUTES.SIGN_IN : APP_ROUTES.SIGN_UP) as any);
  };

  const fieldStyle = (name: string) => ({
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: focused === name ? 1.5 : 1,
    borderColor: focused === name ? BRAND_COLORS.primary : 'rgba(27,36,32,0.14)',
    fontFamily: F.regular,
    fontSize: 14,
    color: BRAND_COLORS.text,
    backgroundColor: focused === name ? '#fff' : '#FDFAF4',
  });

  return (
    <View style={{ flex: 1, flexDirection: isDesktop ? 'row' : 'column', backgroundColor: BRAND_COLORS.bgDark }}>

      {/* ── LEFT PANEL ─────────────────────────────────────────────────── */}
      {isDesktop && (
        <View style={{ flex: 1, backgroundColor: BRAND_COLORS.bgDark, padding: 52, justifyContent: 'flex-start', gap: 48 }}>

          {/* Logo */}
          <Pressable
            onPress={() => router.push(APP_ROUTES.LANDING as any)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
              <Compass size={18} color={BRAND_COLORS.textDark} />
            </View>
            <Text style={{ fontFamily: F.loraBold, fontSize: 18, color: BRAND_COLORS.textDark }}>ViVu Planner</Text>
          </Pressable>

          {/* Tagline + benefits */}
          <View style={{ gap: 32 }}>
            <View style={{ gap: 16 }}>
              <View style={{ alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)' }}>
                <Text style={{ fontFamily: F.semiBold, fontSize: 10, letterSpacing: 1.2, color: 'rgba(243,236,220,0.55)', textTransform: 'uppercase' }}>
                  Du lịch thông minh
                </Text>
              </View>
              <Text style={{ fontFamily: F.loraBold, fontSize: 36, lineHeight: 48, color: '#F3ECDC' }}>
                Lên kế hoạch{'\n'}
                <Text style={{ color: BRAND_COLORS.accent }}>trọn vẹn</Text>{'\n'}
                không lo nghĩ
              </Text>
              <Text style={{ fontFamily: F.regular, fontSize: 15, lineHeight: 26, color: 'rgba(243,236,220,0.55)', maxWidth: 380 }}>
                Điền 4 bước đơn giản, nhận lịch trình hoàn chỉnh — từ thời tiết thực, địa điểm thật đến xử lý sự cố tự động.
              </Text>
            </View>

            {/* Feature bullets */}
            <View style={{ gap: 14 }}>
              {[
                'Lịch trình từ Gemini AI, dữ liệu thực tế',
                'Địa điểm từ Google Places, không bịa đặt',
                'Tự động thích ứng sự cố thời tiết 24/7',
                'Hỗ trợ 11 thành phố du lịch Việt Nam',
              ].map((item, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: BRAND_COLORS.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Check size={11} color="#fff" strokeWidth={3} />
                  </View>
                  <Text style={{ fontFamily: F.regular, fontSize: 13, color: 'rgba(243,236,220,0.75)' }}>{item}</Text>
                </View>
              ))}
            </View>

            {/* City tags */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {['🏛️ Hà Nội', '🌊 Đà Nẵng', '🌆 TP. HCM', '🏮 Hội An', '🌸 Đà Lạt', '🌴 Phú Quốc'].map((c) => (
                <View key={c} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.12)' }}>
                  <Text style={{ fontFamily: F.regular, fontSize: 12, color: 'rgba(243,236,220,0.55)' }}>{c}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Copyright */}
          <Text style={{ fontFamily: F.regular, fontSize: 11, color: 'rgba(243,236,220,0.25)', marginTop: 'auto' as any }}>
            © 2026 ViVu Planner
          </Text>
        </View>
      )}

      {/* ── FORM PANEL ─────────────────────────────────────────────────── */}
      <KeyboardAvoidingView
        style={{ width: isDesktop ? 480 : undefined, flex: isDesktop ? undefined : 1, backgroundColor: '#FBF5EA' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: isDesktop ? 48 : 24,
            paddingVertical: isDesktop ? 52 : 56,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Mobile-only logo */}
          {!isDesktop && (
            <Pressable
              onPress={() => router.push(APP_ROUTES.LANDING as any)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 36 }}
            >
              <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: BRAND_COLORS.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Compass size={19} color="#fff" />
              </View>
              <Text style={{ fontFamily: F.loraBold, fontSize: 22, color: BRAND_COLORS.primary }}>ViVu Planner</Text>
            </Pressable>
          )}

          {/* Heading */}
          <View style={{ marginBottom: 28 }}>
            <Text style={{ fontFamily: F.loraBold, fontSize: isDesktop ? 28 : 24, lineHeight: isDesktop ? 38 : 32, color: '#1B2420', marginBottom: 8 }}>
              {isSignUp ? 'Tạo tài khoản mới' : 'Chào mừng trở lại'}
            </Text>
            <Text style={{ fontFamily: F.regular, fontSize: 14, lineHeight: 22, color: BRAND_COLORS.textSoft }}>
              {isSignUp
                ? 'Bắt đầu lên kế hoạch du lịch thông minh của bạn ngay hôm nay.'
                : 'Đăng nhập để tiếp tục với hành trình của bạn.'}
            </Text>
          </View>


          {/* Error alert */}
          {!!errorMsg && (
            <View style={{
              flexDirection: 'row', gap: 10, alignItems: 'flex-start',
              padding: 14, borderRadius: 12, marginBottom: 20,
              backgroundColor: 'rgba(178,59,59,0.07)',
              borderWidth: 1, borderColor: 'rgba(178,59,59,0.2)',
            }}>
              <AlertCircle size={16} color={BRAND_COLORS.danger} style={{ marginTop: 1 }} />
              <Text style={{ fontFamily: F.regular, fontSize: 13, color: BRAND_COLORS.danger, flex: 1, lineHeight: 20 }}>
                {errorMsg}
              </Text>
            </View>
          )}

          {/* Info alert */}
          {!!infoMsg && (
            <View style={{
              flexDirection: 'row', gap: 10, alignItems: 'flex-start',
              padding: 14, borderRadius: 12, marginBottom: 20,
              backgroundColor: `${BRAND_COLORS.primary}0D`,
              borderWidth: 1, borderColor: `${BRAND_COLORS.primary}25`,
            }}>
              <Sparkles size={16} color={BRAND_COLORS.primary} style={{ marginTop: 1 }} />
              <Text style={{ fontFamily: F.regular, fontSize: 13, color: BRAND_COLORS.primary, flex: 1, lineHeight: 20 }}>
                {infoMsg}
              </Text>
            </View>
          )}

          {/* Form fields */}
          <View style={{ gap: 16 }}>
            {isSignUp && (
              <View style={{ gap: 7 }}>
                <Text style={{ fontFamily: F.semiBold, fontSize: 13, color: '#1B2420' }}>Họ và tên</Text>
                <TextInput
                  style={fieldStyle('name')}
                  placeholder="Nguyễn Văn A"
                  placeholderTextColor={BRAND_COLORS.textMuted}
                  value={fullName}
                  onChangeText={setFullName}
                  onFocus={() => setFocused('name')}
                  onBlur={() => setFocused(null)}
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={{ gap: 7 }}>
              <Text style={{ fontFamily: F.semiBold, fontSize: 13, color: '#1B2420' }}>Email</Text>
              <TextInput
                style={fieldStyle('email')}
                placeholder="you@example.com"
                placeholderTextColor={BRAND_COLORS.textMuted}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>

            <View style={{ gap: 7 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontFamily: F.semiBold, fontSize: 13, color: '#1B2420' }}>Mật khẩu</Text>
                {!isSignUp && (
                  <Pressable
                    onPress={() => {
                      setForgotEmail(email);
                      setForgotError('');
                      setForgotSuccess('');
                      setForgotStep('email');
                      setShowForgotModal(true);
                    }}
                    style={{ cursor: 'pointer' as any }}
                  >
                    <Text style={{ fontFamily: F.semiBold, fontSize: 12, color: BRAND_COLORS.primary }}>
                      Quên mật khẩu?
                    </Text>
                  </Pressable>
                )}
              </View>
              <TextInput
                style={fieldStyle('password')}
                placeholder="••••••••"
                placeholderTextColor={BRAND_COLORS.textMuted}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                secureTextEntry
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
              />
            </View>
          </View>

          {isSignUp && (
            <Pressable
              onPress={() => setAgreed(!agreed)}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 10,
                marginTop: 18,
                paddingHorizontal: 2,
              }}
            >
              <View style={{
                width: 18, height: 18, borderRadius: 4,
                borderWidth: 1.5,
                borderColor: agreed ? BRAND_COLORS.primary : 'rgba(27,36,32,0.3)',
                backgroundColor: agreed ? BRAND_COLORS.primary : 'transparent',
                alignItems: 'center', justifyContent: 'center',
                marginTop: 2,
              }}>
                {agreed && <Check size={12} color="#fff" strokeWidth={3} />}
              </View>
              <Text style={{ fontFamily: F.regular, fontSize: 12, lineHeight: 18, color: BRAND_COLORS.textSoft, flex: 1 }}>
                Tôi cam đoan thông tin cung cấp là chính xác và đồng ý cho ViVu Planner sử dụng, phân tích dữ liệu cá nhân theo{' '}
                <Text style={{ fontFamily: F.semiBold, color: BRAND_COLORS.primary, textDecorationLine: 'underline' }}>Chính sách bảo mật</Text>
                {' '}nhằm tối ưu hóa lộ trình du lịch cá nhân hóa.
              </Text>
            </Pressable>
          )}

          {/* Submit */}
          <Pressable
            onPress={handleSubmit}
            disabled={loading}
            style={{
              marginTop: 24,
              paddingVertical: 16, borderRadius: 12,
              backgroundColor: BRAND_COLORS.accent,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: loading ? 0.65 : 1,
            }}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Text style={{ fontFamily: F.bold, fontSize: 15, color: '#fff' }}>
                    {isSignUp ? 'Tạo tài khoản' : 'Đăng nhập'}
                  </Text>
                  <ArrowRight size={16} color="#fff" />
                </>
            }
          </Pressable>

          {/* Toggle */}
          <View style={{ marginTop: 20, paddingTop: 20, borderTopWidth: 0.5, borderTopColor: 'rgba(27,36,32,0.1)', alignItems: 'center' }}>
            <Pressable onPress={toggleMode}>
              <Text style={{ fontFamily: F.regular, fontSize: 13, color: BRAND_COLORS.textSoft }}>
                {isSignUp ? 'Đã có tài khoản? ' : 'Chưa có tài khoản? '}
                <Text style={{ fontFamily: F.semiBold, color: BRAND_COLORS.primary }}>
                  {isSignUp ? 'Đăng nhập ngay' : 'Tạo tài khoản mới'}
                </Text>
              </Text>
            </Pressable>
          </View>

          {/* Back to landing — mobile */}
          {!isDesktop && (
            <View style={{ marginTop: 12, alignItems: 'center' }}>
              <Pressable onPress={() => router.push(APP_ROUTES.LANDING as any)}>
                <Text style={{ fontFamily: F.regular, fontSize: 12, color: BRAND_COLORS.textMuted }}>
                  ← Quay về trang chủ
                </Text>
              </Pressable>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── MODAL QUÊN MẬT KHẨU ────────────────────────────────────────── */}
      {showForgotModal && (
        <Modal visible={showForgotModal} transparent animationType="fade" onRequestClose={() => setShowForgotModal(false)}>
          <View
            style={(Platform.OS === 'web' ? {
              position: 'fixed' as any,
              top: 0, left: 0, right: 0, bottom: 0,
              width: '100vw' as any, height: '100vh' as any,
              zIndex: 9999, justifyContent: 'center', alignItems: 'center',
              backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
              padding: 16,
            } : {
              flex: 1, justifyContent: 'center', alignItems: 'center',
              backgroundColor: 'rgba(0,0,0,0.65)', padding: 16,
            }) as any}
          >
            <View
              style={{
                backgroundColor: '#ffffff',
                borderRadius: 24,
                width: '100%',
                maxWidth: 480,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: '#E2E8F0',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.15,
                shadowRadius: 24,
                elevation: 12,
              }}
            >
              {/* Modal Header */}
              <View style={{ backgroundColor: '#1B3A2D', paddingHorizontal: 24, paddingVertical: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(110,231,183,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                    <KeyRound size={20} color="#6EE7B7" />
                  </View>
                  <View>
                    <Text style={{ fontSize: 17, fontWeight: '800', color: '#ffffff' }}>Quên Mật Khẩu</Text>
                    <Text style={{ fontSize: 12, color: '#A7F3D0' }}>Khôi phục quyền truy cập tài khoản</Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => setShowForgotModal(false)}
                  style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={18} color="#ffffff" />
                </Pressable>
              </View>

              <View style={{ padding: 24, gap: 16 }}>
                {/* Thông báo lỗi / thành công */}
                {forgotError ? (
                  <View style={{ backgroundColor: '#FEF2F2', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <AlertCircle size={16} color="#DC2626" />
                    <Text style={{ fontSize: 12, color: '#991B1B', fontWeight: '600', flex: 1 }}>{forgotError}</Text>
                  </View>
                ) : null}

                {forgotSuccess ? (
                  <View style={{ backgroundColor: '#ECFDF5', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#A7F3D0', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <CheckCircle2 size={16} color="#059669" />
                    <Text style={{ fontSize: 12, color: '#065F46', fontWeight: '600', flex: 1 }}>{forgotSuccess}</Text>
                  </View>
                ) : null}

                {/* BƯỚC 1: NHẬP EMAIL */}
                {forgotStep === 'email' && (
                  <View style={{ gap: 14 }}>
                    <Text style={{ fontSize: 13, color: '#475569', lineHeight: 20 }}>
                      Nhập địa chỉ email tài khoản của bạn. Chúng tôi sẽ gửi mã xác nhận OTP 6 số về hòm thư Gmail để bạn đặt lại mật khẩu.
                    </Text>
                    <View style={{ gap: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155' }}>Email tài khoản</Text>
                      <TextInput
                        style={{
                          backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#CBD5E1',
                          borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#0F172A',
                        }}
                        placeholder="email@example.com"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        value={forgotEmail}
                        onChangeText={setForgotEmail}
                      />
                    </View>
                    <Pressable
                      onPress={handleSendOtp}
                      disabled={forgotLoading}
                      style={{
                        backgroundColor: BRAND_COLORS.primary, paddingVertical: 12, borderRadius: 12,
                        alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 6,
                      }}
                    >
                      {forgotLoading ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <>
                          <Mail size={16} color="#ffffff" />
                          <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14 }}>Gửi mã xác nhận OTP</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                )}

                {/* BƯỚC 2: NHẬP MÃ OTP */}
                {forgotStep === 'otp' && (
                  <View style={{ gap: 14 }}>
                    <Text style={{ fontSize: 13, color: '#475569', lineHeight: 20 }}>
                      Mã xác nhận gồm 6 chữ số đã được gửi đến <strong>{forgotEmail}</strong>. Mã có hiệu lực trong 10 phút.
                    </Text>
                    <View style={{ gap: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155' }}>Mã OTP (6 chữ số)</Text>
                      <TextInput
                        style={{
                          backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#CBD5E1',
                          borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 20,
                          fontWeight: '800', textAlign: 'center', letterSpacing: 6, color: BRAND_COLORS.primary,
                        }}
                        placeholder="123456"
                        keyboardType="number-pad"
                        maxLength={6}
                        value={forgotOtp}
                        onChangeText={setForgotOtp}
                      />
                    </View>
                    <Pressable
                      onPress={handleVerifyOtp}
                      disabled={forgotLoading}
                      style={{
                        backgroundColor: BRAND_COLORS.primary, paddingVertical: 12, borderRadius: 12,
                        alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 6,
                      }}
                    >
                      {forgotLoading ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14 }}>Xác thực mã OTP</Text>
                      )}
                    </Pressable>
                    <Pressable onPress={() => setForgotStep('email')} style={{ alignItems: 'center', paddingVertical: 4 }}>
                      <Text style={{ fontSize: 12, color: '#64748B', textDecorationLine: 'underline' }}>
                        Gửi lại mã hoặc đổi email
                      </Text>
                    </Pressable>
                  </View>
                )}

                {/* BƯỚC 3: ĐẶT MẬT KHẨU MỚI */}
                {forgotStep === 'newPassword' && (
                  <View style={{ gap: 14 }}>
                    <Text style={{ fontSize: 13, color: '#475569', lineHeight: 20 }}>
                      Mã xác thực thành công. Vui lòng nhập mật khẩu mới cho tài khoản của bạn.
                    </Text>
                    <View style={{ gap: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155' }}>Mật khẩu mới</Text>
                      <TextInput
                        style={{
                          backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#CBD5E1',
                          borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#0F172A',
                        }}
                        placeholder="Tối thiểu 6 ký tự..."
                        secureTextEntry
                        value={forgotNewPassword}
                        onChangeText={setForgotNewPassword}
                      />
                    </View>
                    <View style={{ gap: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155' }}>Xác nhận mật khẩu mới</Text>
                      <TextInput
                        style={{
                          backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#CBD5E1',
                          borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#0F172A',
                        }}
                        placeholder="Nhập lại mật khẩu mới..."
                        secureTextEntry
                        value={forgotConfirmPassword}
                        onChangeText={setForgotConfirmPassword}
                      />
                    </View>
                    <Pressable
                      onPress={handleResetPassword}
                      disabled={forgotLoading}
                      style={{
                        backgroundColor: BRAND_COLORS.primary, paddingVertical: 12, borderRadius: 12,
                        alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 6,
                      }}
                    >
                      {forgotLoading ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <>
                          <KeyRound size={16} color="#ffffff" />
                          <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14 }}>Hoàn tất đổi mật khẩu</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          </View>
        </Modal>
      )}

    </View>
  );
}
