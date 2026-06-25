import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Compass, Sparkles, AlertCircle, ArrowRight, Check } from 'lucide-react-native';
import { supabase, isMockAuth } from '../lib/supabaseClient';
import { apiClient } from '../lib/apiClient';
import { BRAND_COLORS } from '../constants';

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
  const isDesktop = Platform.OS === 'web' && width >= 900;

  const [isSignUp, setIsSignUp] = useState(mode === 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/chuyen-di');
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
      const adminEmails = [
        'team89a6@gmail.com',
        'vinhvip4508@gmail.com',
        process.env.EXPO_PUBLIC_ADMIN_EMAIL
      ].filter(Boolean).map(e => e!.toLowerCase().trim());
      const isAdmin = adminEmails.includes(email.toLowerCase().trim());

      if (isSignUp) {
        if (isAdmin) throw new Error('Email này đã được sử dụng!');

        await apiClient.post('/auth/signup', { email, password, fullName });
        const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
        if (loginErr) throw new Error('Đăng ký thành công nhưng đăng nhập thất bại. Vui lòng đăng nhập lại.');
        router.replace('/chuyen-di');
      } else {
        if (isAdmin && Platform.OS === 'web') {
          const res = await apiClient.post('/admin/login', { email, password });
          if (res.data?.token) {
            localStorage.setItem('vivu_admin_token', res.data.token);
            localStorage.setItem('vivu_mock_user', JSON.stringify({ id: '00000000-0000-0000-0000-000000000001', email: res.data.email }));
            router.replace('/admin');
            return;
          }
        }

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error('Email hoặc mật khẩu không chính xác!');
        router.replace('/chuyen-di');
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
    router.replace(isSignUp ? '/dang-nhap' : '/dang-ky');
  };

  const fieldStyle = (name: string) => ({
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: focused === name ? 1.5 : 1,
    borderColor: focused === name ? BRAND_COLORS.primary : 'rgba(27,36,32,0.14)',
    fontFamily: F.regular,
    fontSize: 14,
    color: '#1B2420' as const,
    backgroundColor: focused === name ? '#fff' : '#FDFAF4',
  });

  return (
    <View style={{ flex: 1, flexDirection: isDesktop ? 'row' : 'column', backgroundColor: '#14201B' }}>

      {/* ── LEFT PANEL ─────────────────────────────────────────────────── */}
      {isDesktop && (
        <View style={{ flex: 1, backgroundColor: '#14201B', padding: 52, justifyContent: 'flex-start', gap: 48 }}>

          {/* Logo */}
          <Pressable
            onPress={() => router.push('/landing')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
              <Compass size={18} color="#F3ECDC" />
            </View>
            <Text style={{ fontFamily: F.loraBold, fontSize: 18, color: '#F3ECDC' }}>ViVu Planner</Text>
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
              onPress={() => router.push('/landing')}
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
              <Text style={{ fontFamily: F.semiBold, fontSize: 13, color: '#1B2420' }}>Mật khẩu</Text>
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
              <Pressable onPress={() => router.push('/landing')}>
                <Text style={{ fontFamily: F.regular, fontSize: 12, color: BRAND_COLORS.textMuted }}>
                  ← Quay về trang chủ
                </Text>
              </Pressable>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>

    </View>
  );
}
