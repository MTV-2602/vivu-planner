import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Platform, Animated, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Compass, Sparkles, AlertTriangle, MapPin, ShieldAlert, Check,
  ArrowRight, CalendarDays, Wallet, Star, ChevronUp,
} from 'lucide-react-native';
import { supabase } from '../lib/supabaseClient';
import Reveal from '../components/Reveal';
import { BRAND_COLORS, VIETNAMESE_CITIES } from '../constants';

const canUseLocalStorage = Platform.OS === 'web' && typeof localStorage !== 'undefined';
const isWeb = Platform.OS === 'web';

const F = {
  loraRegular: 'Lora_400Regular' as const,
  loraBold: 'Lora_700Bold' as const,
  regular: 'BeVietnamPro_400Regular' as const,
  semiBold: 'BeVietnamPro_600SemiBold' as const,
  bold: 'BeVietnamPro_700Bold' as const,
  xbold: 'BeVietnamPro_800ExtraBold' as const,
};

const CITY_EMOJIS: Record<string, string> = {
  'Hà Nội': '🏛️', 'Đà Nẵng': '🌊', 'TP. Hồ Chí Minh': '🌆',
  'Hội An': '🏮', 'Huế': '👑', 'Nha Trang': '🏖️',
  'Đà Lạt': '🌸', 'Phú Quốc': '🌴', 'Sa Pa': '⛰️',
  'Ninh Bình': '🗺️', 'Vũng Tàu': '⛵',
};

const STEPS = [
  { num: '01', icon: <MapPin size={20} color={BRAND_COLORS.primary} />, title: 'Chọn điểm đến', desc: 'Chọn thành phố mục tiêu và địa điểm khởi hành từ 11 thành phố được hỗ trợ.', dark: false },
  { num: '02', icon: <CalendarDays size={20} color={BRAND_COLORS.primary} />, title: 'Ngày đi & Người đi', desc: 'Xác định ngày xuất phát, số ngày, số lượng và loại người đi cùng.', dark: false },
  { num: '03', icon: <Wallet size={20} color={BRAND_COLORS.primary} />, title: 'Ngân sách & Sở thích', desc: 'Khai báo mức ngân sách, phong cách du lịch và lưu ý sức khỏe nếu có.', dark: false },
  { num: '04', icon: <Sparkles size={20} color="#fff" />, title: 'AI tạo lịch trình', desc: 'Gemini AI tổng hợp thời tiết, địa điểm thật từ Google Places và sinh hành trình hoàn chỉnh.', dark: true },
];

const FEATURES = [
  { num: '01', icon: <Sparkles size={22} color={BRAND_COLORS.primary} />, iconBg: `${BRAND_COLORS.primary}15`, title: 'AI sinh lịch trình thật', desc: 'Gemini AI phân tích thời tiết dự báo, sở thích cá nhân, sức khỏe và ngân sách để tạo hành trình tối ưu nhất cho bạn.', tag: 'Powered by Gemini' },
  { num: '02', icon: <MapPin size={22} color={BRAND_COLORS.primary} />, iconBg: `${BRAND_COLORS.primary}15`, title: 'Dữ liệu địa điểm thực', desc: 'Không gợi ý địa điểm bịa đặt. Chỗ nghỉ, quán ăn, điểm check-in đều được lấy trực tiếp từ Google Places API.', tag: 'Google Places API' },
  { num: '03', icon: <ShieldAlert size={22} color={BRAND_COLORS.danger} />, iconBg: 'rgba(178,59,59,0.08)', title: 'Thích ứng khi có sự cố', desc: 'Trễ chuyến bay? Trời đổ bão? Bấm báo sự cố, AI lập tức tính toán lại toàn bộ lịch trình phù hợp tức thì.', tag: 'Disruption AI' },
];

const TESTIMONIALS = [
  { initial: 'NL', name: 'Ngọc Linh', location: 'TP. Hồ Chí Minh', quote: 'Chuyến đi Hội An bất ngờ gặp mưa to, nhờ ViVu Planner đổi sang học làm đèn lồng và cà phê phố cổ — tụi mình vẫn có một kỷ niệm tuyệt vời.', tag: 'Hội An · 3N2Đ' },
  { initial: 'TM', name: 'Tuấn Minh', location: 'Hà Nội', quote: 'Lần đầu đi một mình ra Đà Lạt, AI lên được lịch trình hợp lý từng giờ. Tiết kiệm cả buổi tối ngồi mày mò hội nhóm du lịch.', tag: 'Đà Lạt · 4N3Đ' },
  { initial: 'PH', name: 'Phương Hà', location: 'Đà Nẵng', quote: 'Gia đình 5 người, 2 cháu nhỏ, AI hiểu ngay cần điểm thân thiện trẻ em. Lịch trình rất thực tế, không bị nhồi nhét.', tag: 'Phú Quốc · 5N4Đ' },
];

const PRICING_PACKAGES = [
  {
    title: 'Gói Cơ bản',
    price: '0 VNĐ',
    priceSub: 'Mặc định',
    isPremium: false,
    tag: 'Hiện tại',
    tagBg: '#1F6F5415',
    tagText: '#1F6F54',
    desc: 'Cung cấp các tính năng tạo lịch trình bằng AI chuyên sâu, tích hợp bản đồ và công cụ quản lý ngân sách.',
    features: [
      'Tạo lịch trình tự động chuyên sâu',
      'Gợi ý các điểm đến phổ biến',
      'Tích hợp bản đồ trực tuyến',
      'Công cụ quản lý ngân sách chuyến đi',
      'Tiếp thị liên kết với các OTA'
    ]
  },
  {
    title: 'Gói Cao cấp theo lượt',
    price: '10K - 30K',
    priceSub: 'VNĐ / lịch trình',
    isPremium: true,
    tag: 'Dự kiến',
    tagBg: '#E2703A15',
    tagText: '#E2703A',
    desc: 'Gợi ý các địa danh độc bản "Hidden Gems" và tối ưu hóa lộ trình di chuyển chi tiết.',
    features: [
      'Gói 10K (Discovery): 3+ Hidden Gems (Rating ≥4.0, <200 reviews)',
      'Gói 20K (Explorer): 6+ Hidden Gems & cá nhân hóa sở thích',
      'Gói 30K (Insider): 9+ Hidden Gems độc quyền từ người bản địa',
      'Lộ trình tối ưu kết nối các Hidden Gems',
      'Tối ưu cách di chuyển và thời gian tham quan',
      'Đánh giá chất lượng bằng chỉ số Scenic Score',
    ]
  },
  {
    title: 'Gói Cao cấp mở rộng',
    price: '40K',
    priceSub: 'VNĐ / lịch trình',
    isPremium: false,
    tag: 'Dự kiến',
    tagBg: '#E2703A15',
    tagText: '#E2703A',
    desc: 'Toàn bộ tính năng cao cấp cộng thêm các công cụ định hướng du lịch xanh, bền vững.',
    features: [
      'Bao gồm toàn bộ tính năng Cao cấp',
      'Tính toán dấu chân carbon của chuyến đi',
      'Đề xuất du lịch bền vững & giảm khí thải',
      'Scenic Score ưu tiên chất lượng >85/100',
    ]
  }
];

export default function Landing() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 640;
  const px = isMobile ? 16 : 40;
  const scrollRef = useRef<any>(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  const P = (out: number) => scrollY.interpolate({
    inputRange: [0, 500],
    outputRange: [0, isWeb ? out : 0],
    extrapolate: 'clamp',
  });
  const badgeY    = P(-50);
  const titleY    = P(-38);
  const subtitleY = P(-28);
  const citiesY   = P(-20);
  const ctaY      = P(-14);
  const cardY     = P(-8);
  const heroAlpha = scrollY.interpolate({
    inputRange: [0, 350],
    outputRange: [1, isWeb ? 0.72 : 1],
    extrapolate: 'clamp',
  });

  const [featuresSectionY, setFeaturesSectionY] = useState(0);
  const [howItWorksSectionY, setHowItWorksSectionY] = useState(0);
  const [pricingSectionY, setPricingSectionY] = useState(0);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    if (canUseLocalStorage && localStorage.getItem('vivu_admin_token')) {
      setIsLoggedIn(true);
      setIsAdmin(true);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      if (session) setIsLoggedIn(true);
    });
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    if (canUseLocalStorage) {
      localStorage.removeItem('vivu_admin_token');
      localStorage.removeItem('vivu_mock_user');
      localStorage.removeItem('vivu_mock_token');
    }
    setIsLoggedIn(false);
    setIsAdmin(false);
  };

  const dashPath = isAdmin ? '/admin' : '/chuyen-di';

  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      setScrolled(value > 32);
      setShowBackToTop(value > 480);
    });
    return () => scrollY.removeListener(id);
  }, [scrollY]);

  const renderStep = (step: typeof STEPS[0], delay: number) => (
    <View style={{
      flexDirection: 'row', gap: 16, alignItems: 'flex-start',
      padding: 22, borderRadius: 16,
      backgroundColor: step.dark ? BRAND_COLORS.primary : '#fff',
      borderWidth: step.dark ? 0 : 0.5,
      borderColor: 'rgba(27,36,32,0.08)',
    }}>
      <View style={{
        width: 46, height: 46, borderRadius: 13,
        backgroundColor: step.dark ? 'rgba(255,255,255,0.15)' : `${BRAND_COLORS.primary}12`,
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {step.dark ? <Sparkles size={20} color="#fff" /> : step.icon}
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={{ fontFamily: F.semiBold, fontSize: 10, letterSpacing: 1.2, color: step.dark ? 'rgba(255,255,255,0.4)' : BRAND_COLORS.textMuted }}>
          BƯỚC {step.num}
        </Text>
        <Text style={{ fontFamily: F.bold, fontSize: 15, color: step.dark ? '#fff' : '#1B2420' }}>
          {step.title}
        </Text>
        <Text style={{ fontFamily: F.regular, fontSize: 13, lineHeight: 21, color: step.dark ? 'rgba(255,255,255,0.65)' : BRAND_COLORS.textSoft }}>
          {step.desc}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#FBF5EA' }}>

      {/* ── NAVBAR ──────────────────────────────────────────────────────────── */}
      <View style={{
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: px, paddingVertical: isMobile ? 12 : 14, zIndex: 100,
        backgroundColor: scrolled ? 'rgba(251,245,234,0.97)' : '#FBF5EA',
        borderBottomWidth: scrolled ? 0.5 : 0,
        borderBottomColor: 'rgba(27,36,32,0.1)',
      }}>
        <Pressable
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <View style={{
            width: isMobile ? 30 : 34, height: isMobile ? 30 : 34, borderRadius: 9,
            backgroundColor: BRAND_COLORS.primary, alignItems: 'center', justifyContent: 'center',
          }}>
            <Compass size={isMobile ? 15 : 18} color="#fff" />
          </View>
          <Text style={{ fontFamily: F.loraBold, fontSize: isMobile ? 15 : 17, color: BRAND_COLORS.primary }}>
            ViVu Planner
          </Text>
        </Pressable>

        {isWeb && !isMobile && (
          <View style={{ flexDirection: 'row', gap: 32, alignItems: 'center' }}>
            <Pressable onPress={() => scrollRef.current?.scrollTo({ y: featuresSectionY, animated: true })}>
              <Text style={{ fontFamily: F.regular, fontSize: 14, color: BRAND_COLORS.textSoft }}>Tính năng</Text>
            </Pressable>
            <Pressable onPress={() => scrollRef.current?.scrollTo({ y: howItWorksSectionY, animated: true })}>
              <Text style={{ fontFamily: F.regular, fontSize: 14, color: BRAND_COLORS.textSoft }}>Cách dùng</Text>
            </Pressable>
            <Pressable onPress={() => scrollRef.current?.scrollTo({ y: pricingSectionY, animated: true })}>
              <Text style={{ fontFamily: F.regular, fontSize: 14, color: BRAND_COLORS.textSoft }}>Bảng giá</Text>
            </Pressable>
          </View>
        )}

        {isLoggedIn ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={() => router.push(dashPath as any)}
              style={{ paddingHorizontal: isMobile ? 12 : 16, paddingVertical: 9, borderRadius: 8, backgroundColor: BRAND_COLORS.primary }}
            >
              <Text style={{ fontFamily: F.semiBold, fontSize: 13, color: '#fff' }}>
                {isAdmin ? 'Quản trị' : isMobile ? 'Dashboard' : 'Bảng điều khiển'}
              </Text>
            </Pressable>
            {!isMobile && (
              <Pressable
                onPress={handleSignOut}
                style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(27,36,32,0.2)' }}
              >
                <Text style={{ fontFamily: F.regular, fontSize: 13, color: BRAND_COLORS.textSoft }}>Đăng xuất</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {!isMobile && (
              <Pressable
                onPress={() => router.push('/(auth)/dang-nhap')}
                style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5, borderColor: BRAND_COLORS.primary }}
              >
                <Text style={{ fontFamily: F.semiBold, fontSize: 13, color: BRAND_COLORS.primary }}>Đăng Nhập</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => router.push(isMobile ? '/(auth)/dang-nhap' : '/(auth)/dang-ky')}
              style={{ paddingHorizontal: isMobile ? 14 : 16, paddingVertical: 9, borderRadius: 8, backgroundColor: BRAND_COLORS.primary }}
            >
              <Text style={{ fontFamily: F.semiBold, fontSize: 13, color: '#fff' }}>
                {isMobile ? 'Đăng Nhập' : 'Đăng Ký'}
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >

        {/* ── HERO ──────────────────────────────────────────────────────────── */}
        <Animated.View style={{ opacity: heroAlpha }}>
          <View style={{
            paddingHorizontal: px,
            paddingTop: isMobile ? 40 : 80,
            paddingBottom: isMobile ? 44 : 88,
            backgroundColor: '#FBF5EA',
          }}>
            <View style={{
              flexDirection: isMobile ? 'column' : 'row',
              gap: isMobile ? 24 : 64,
              alignItems: isMobile ? 'stretch' : 'center',
            }}>

              {/* Left: content */}
              <View style={{ flex: isMobile ? undefined : 1, gap: isMobile ? 20 : 28 }}>

                <Animated.View style={{ transform: [{ translateY: badgeY }] }}>
                  <Reveal delay={0}>
                    <View style={{
                      alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center',
                      gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100,
                      backgroundColor: `${BRAND_COLORS.primary}12`,
                      borderWidth: 1, borderColor: `${BRAND_COLORS.primary}30`,
                    }}>
                      <Sparkles size={12} color={BRAND_COLORS.primary} />
                      <Text style={{ fontFamily: F.semiBold, fontSize: 11, color: BRAND_COLORS.primary, letterSpacing: 0.9, textTransform: 'uppercase' }}>
                        AI thật · Địa điểm thật · Thích ứng thật
                      </Text>
                    </View>
                  </Reveal>
                </Animated.View>

                <Animated.View style={{ transform: [{ translateY: titleY }] }}>
                  <Reveal delay={80}>
                    <Text style={{ fontFamily: F.loraBold, fontSize: isMobile ? 36 : 52, lineHeight: isMobile ? 46 : 66, color: '#1B2420' }}>
                      Du lịch Việt Nam{'\n'}
                      <Text style={{ color: BRAND_COLORS.primary }}>Trọn Vẹn,</Text>{'\n'}Không Lo Nghĩ
                    </Text>
                  </Reveal>
                </Animated.View>

                <Animated.View style={{ transform: [{ translateY: subtitleY }] }}>
                  <Reveal delay={160}>
                    <Text style={{ fontFamily: F.regular, fontSize: isMobile ? 15 : 16, lineHeight: isMobile ? 26 : 28, color: BRAND_COLORS.textSoft, maxWidth: 460 }}>
                      Điền 4 bước, nhận lịch trình cá nhân hóa hoàn chỉnh — từ thời tiết thực, địa điểm thật, đến tự động xử lý sự cố bất ngờ.
                    </Text>
                  </Reveal>
                </Animated.View>

                <Animated.View style={{ transform: [{ translateY: citiesY }] }}>
                  <Reveal delay={200}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {VIETNAMESE_CITIES.map((city) => (
                        <View key={city} style={{
                          flexDirection: 'row', alignItems: 'center', gap: 5,
                          paddingHorizontal: 11, paddingVertical: 6, borderRadius: 100,
                          backgroundColor: '#fff',
                          borderWidth: 0.5, borderColor: 'rgba(27,36,32,0.12)',
                        }}>
                          <Text style={{ fontSize: 11 }}>{CITY_EMOJIS[city]}</Text>
                          <Text style={{ fontFamily: F.regular, fontSize: 11, color: BRAND_COLORS.textSoft }}>{city}</Text>
                        </View>
                      ))}
                    </View>
                  </Reveal>
                </Animated.View>

                <Animated.View style={{ transform: [{ translateY: ctaY }] }}>
                  <Reveal delay={240}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                      <Pressable
                        onPress={() => router.push(isLoggedIn ? (dashPath as any) : '/(auth)/dang-ky')}
                        style={{
                          flex: isMobile ? 1 : undefined, minWidth: isMobile ? 140 : undefined,
                          paddingVertical: 16, paddingHorizontal: 28,
                          borderRadius: 12, backgroundColor: BRAND_COLORS.accent,
                          alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                        }}
                      >
                        <Text style={{ fontFamily: F.bold, fontSize: 14, color: '#fff' }}>
                          {isLoggedIn ? 'Đến bảng điều khiển' : 'Bắt đầu miễn phí'}
                        </Text>
                        <ArrowRight size={15} color="#fff" />
                      </Pressable>
                      <Pressable
                        onPress={() => scrollRef.current?.scrollTo({ y: howItWorksSectionY, animated: true })}
                        style={{
                          flex: isMobile ? 1 : undefined, minWidth: isMobile ? 120 : undefined,
                          paddingVertical: 16, paddingHorizontal: 28,
                          borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(27,36,32,0.18)',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ fontFamily: F.semiBold, fontSize: 14, color: BRAND_COLORS.textSoft }}>Cách dùng</Text>
                      </Pressable>
                    </View>
                  </Reveal>
                </Animated.View>

              </View>

              {/* Right: AI preview card */}
              <Animated.View style={{ transform: [{ translateY: cardY }], width: isMobile ? '100%' : 420, flexShrink: 0 }}>
                <Reveal delay={isMobile ? 300 : 160}>
                  <View style={{
                    backgroundColor: '#fff', borderRadius: 22, borderWidth: 0.5,
                    borderColor: 'rgba(27,36,32,0.08)', padding: 20, gap: 10,
                    shadowColor: '#1B2420',
                    shadowOffset: { width: 0, height: isMobile ? 8 : 20 },
                    shadowOpacity: isMobile ? 0.07 : 0.1,
                    shadowRadius: isMobile ? 24 : 48,
                    elevation: isMobile ? 6 : 14,
                  }}>
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: 'rgba(27,36,32,0.07)',
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{
                          width: 36, height: 36, borderRadius: 10,
                          backgroundColor: `${BRAND_COLORS.primary}15`, alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Sparkles size={16} color={BRAND_COLORS.primary} />
                        </View>
                        <View>
                          <Text style={{ fontFamily: F.bold, fontSize: 13, color: '#1B2420' }}>Lịch trình từ ViVu AI</Text>
                          <Text style={{ fontFamily: F.regular, fontSize: 11, color: BRAND_COLORS.textMuted, marginTop: 1 }}>
                            Hà Nội · 3 ngày 2 đêm · 2 người
                          </Text>
                        </View>
                      </View>
                      <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7, backgroundColor: `${BRAND_COLORS.primary}12` }}>
                        <Text style={{ fontFamily: F.semiBold, fontSize: 10, color: BRAND_COLORS.primary }}>Ngày 1</Text>
                      </View>
                    </View>

                    <View style={{
                      flexDirection: 'row', gap: 12, padding: 12, borderRadius: 10,
                      backgroundColor: '#FBF5EA', borderWidth: 0.5, borderColor: 'rgba(27,36,32,0.06)',
                    }}>
                      <View style={{ width: 44, height: 30, borderRadius: 7, backgroundColor: `${BRAND_COLORS.primary}15`, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontFamily: F.bold, fontSize: 9, color: BRAND_COLORS.primary }}>09:00</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: F.bold, fontSize: 12, color: '#1B2420' }}>Đền Ngọc Sơn & Hồ Hoàn Kiếm</Text>
                        <Text style={{ fontFamily: F.regular, fontSize: 11, color: BRAND_COLORS.textMuted, marginTop: 2, lineHeight: 16 }}>
                          Đi bộ quanh hồ, chụp cầu Thê Húc lúc bình minh sớm.
                        </Text>
                      </View>
                    </View>

                    <View style={{
                      flexDirection: 'row', gap: 10, padding: 12, borderRadius: 10,
                      backgroundColor: 'rgba(178,59,59,0.05)', borderWidth: 0.5, borderColor: 'rgba(178,59,59,0.18)',
                    }}>
                      <AlertTriangle size={14} color="#B23B3B" style={{ marginTop: 1 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: F.bold, fontSize: 11, color: '#B23B3B' }}>Phát hiện: Mưa dự báo 13:00–17:00</Text>
                        <Text style={{ fontFamily: F.regular, fontSize: 11, color: 'rgba(178,59,59,0.75)', marginTop: 2, lineHeight: 16 }}>
                          AI tự đổi sang Bảo Tàng Lịch Sử Quốc Gia & cà phê trứng phố cổ.
                        </Text>
                      </View>
                    </View>

                    <View style={{
                      flexDirection: 'row', gap: 12, padding: 12, borderRadius: 10,
                      backgroundColor: '#FBF5EA', borderWidth: 0.5, borderColor: 'rgba(27,36,32,0.06)', opacity: 0.4,
                    }}>
                      <View style={{ width: 44, height: 30, borderRadius: 7, backgroundColor: `${BRAND_COLORS.primary}15`, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontFamily: F.bold, fontSize: 9, color: BRAND_COLORS.primary }}>19:00</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: F.bold, fontSize: 12, color: '#1B2420' }}>Bún Chả Hương Liên</Text>
                        <Text style={{ fontFamily: F.regular, fontSize: 11, color: BRAND_COLORS.textMuted, marginTop: 2 }}>
                          Món bún chả nổi tiếng thế giới, đặt trước để có bàn.
                        </Text>
                      </View>
                    </View>
                  </View>
                </Reveal>
              </Animated.View>

            </View>
          </View>
        </Animated.View>

        {/* ── STATS BAR ──────────────────────────────────────────────────────── */}
        {(() => {
          const stats = [
            { num: '11', label: 'Thành phố\nhỗ trợ' },
            { num: '4', label: 'Bước tạo\nlịch trình' },
            { num: '100%', label: 'Địa điểm\ncó thật' },
            { num: '24/7', label: 'AI thích ứng\nsự cố' },
          ];
          return (
            <View style={{ borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: 'rgba(27,36,32,0.1)', backgroundColor: '#fff' }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {stats.map((stat, i) => (
                  <View
                    key={i}
                    style={{
                      width: isMobile ? '50%' : '25%',
                      paddingVertical: isMobile ? 24 : 36,
                      paddingHorizontal: 8,
                      alignItems: 'center',
                      borderRightWidth: isMobile ? (i % 2 === 0 ? 0.5 : 0) : (i < 3 ? 0.5 : 0),
                      borderRightColor: 'rgba(27,36,32,0.1)',
                      borderBottomWidth: isMobile && i < 2 ? 0.5 : 0,
                      borderBottomColor: 'rgba(27,36,32,0.1)',
                    }}
                  >
                    <Text style={{ fontFamily: F.loraBold, fontSize: isMobile ? 32 : 42, color: BRAND_COLORS.primary, marginBottom: 6 }}>
                      {stat.num}
                    </Text>
                    <Text style={{ fontFamily: F.regular, fontSize: isMobile ? 11 : 12, color: BRAND_COLORS.textMuted, textAlign: 'center', lineHeight: 18 }}>
                      {stat.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })()}

        {/* ── HOW IT WORKS ──────────────────────────────────────────────────── */}
        <View
          style={{ paddingHorizontal: px, paddingVertical: isMobile ? 56 : 80, gap: isMobile ? 32 : 52, backgroundColor: '#FBF5EA' }}
          onLayout={(e) => setHowItWorksSectionY(e.nativeEvent.layout.y)}
        >
          <View style={{ gap: 14 }}>
            <Reveal>
              <View style={{
                alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100,
                backgroundColor: `${BRAND_COLORS.primary}12`,
                borderWidth: 1, borderColor: `${BRAND_COLORS.primary}28`,
              }}>
                <Text style={{ fontFamily: F.semiBold, fontSize: 11, color: BRAND_COLORS.primary, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  Cách hoạt động
                </Text>
              </View>
            </Reveal>
            <Reveal delay={80}>
              <Text style={{ fontFamily: F.loraBold, fontSize: isMobile ? 28 : 38, lineHeight: isMobile ? 38 : 50, color: '#1B2420' }}>
                4 bước đơn giản,{'\n'}lịch trình hoàn hảo
              </Text>
            </Reveal>
            <Reveal delay={140}>
              <Text style={{ fontFamily: F.regular, fontSize: 14, lineHeight: 24, color: BRAND_COLORS.textSoft, maxWidth: 420 }}>
                Không cần kinh nghiệm lên kế hoạch. ViVu Planner làm mọi thứ từ A đến Z cho bạn.
              </Text>
            </Reveal>
          </View>

          {isMobile ? (
            <View style={{ gap: 12 }}>
              {STEPS.map((step, i) => (
                <Reveal key={i} delay={i * 80}>
                  {renderStep(step, i * 80)}
                </Reveal>
              ))}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <View style={{ flex: 1, gap: 16 }}>
                {STEPS.slice(0, 2).map((step, i) => (
                  <Reveal key={i} delay={i * 100}>
                    {renderStep(step, i * 100)}
                  </Reveal>
                ))}
              </View>
              <View style={{ flex: 1, gap: 16 }}>
                {STEPS.slice(2).map((step, i) => (
                  <Reveal key={i} delay={(i + 2) * 100}>
                    {renderStep(step, (i + 2) * 100)}
                  </Reveal>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* ── FEATURES ──────────────────────────────────────────────────────── */}
        <View
          style={{ paddingHorizontal: px, paddingVertical: isMobile ? 56 : 80, gap: isMobile ? 32 : 52, backgroundColor: '#F3ECDC' }}
          onLayout={(e) => setFeaturesSectionY(e.nativeEvent.layout.y)}
        >
          <View style={{ gap: 14 }}>
            <Reveal>
              <View style={{
                alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100,
                backgroundColor: `${BRAND_COLORS.primary}12`,
                borderWidth: 1, borderColor: `${BRAND_COLORS.primary}28`,
              }}>
                <Text style={{ fontFamily: F.semiBold, fontSize: 11, color: BRAND_COLORS.primary, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  Tính năng
                </Text>
              </View>
            </Reveal>
            <Reveal delay={80}>
              <Text style={{ fontFamily: F.loraBold, fontSize: isMobile ? 28 : 38, lineHeight: isMobile ? 38 : 50, color: '#1B2420' }}>
                Giải quyết mọi nỗi lo{'\n'}khi xê dịch
              </Text>
            </Reveal>
            <Reveal delay={140}>
              <Text style={{ fontFamily: F.regular, fontSize: 14, lineHeight: 24, color: BRAND_COLORS.textSoft, maxWidth: 460 }}>
                Được thiết kế xoay quanh nhu cầu thực tế của du khách Việt Nam, xử lý cả phát sinh ngoài ý muốn.
              </Text>
            </Reveal>
          </View>

          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
            {FEATURES.map((feat, i) => (
              <Reveal key={i} delay={i * 100} style={isMobile ? undefined : { flex: 1 }}>
                <View style={{
                  flex: isMobile ? undefined : 1,
                  backgroundColor: '#FBF5EA', borderWidth: 0.5, borderColor: 'rgba(27,36,32,0.08)',
                  borderRadius: 20, padding: 28, gap: 16,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontFamily: F.regular, fontSize: 11, color: BRAND_COLORS.textMuted }}>{feat.num}</Text>
                    <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7, backgroundColor: 'rgba(27,36,32,0.06)' }}>
                      <Text style={{ fontFamily: F.regular, fontSize: 9.5, color: BRAND_COLORS.textMuted, letterSpacing: 0.3 }}>
                        {feat.tag}
                      </Text>
                    </View>
                  </View>
                  <View style={{ width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: feat.iconBg }}>
                    {feat.icon}
                  </View>
                  <Text style={{ fontFamily: F.bold, fontSize: 17, lineHeight: 24, color: '#1B2420' }}>{feat.title}</Text>
                  <Text style={{ fontFamily: F.regular, fontSize: 13, lineHeight: 22, color: BRAND_COLORS.textSoft }}>{feat.desc}</Text>
                </View>
              </Reveal>
            ))}
          </View>
        </View>

        {/* ── PRICING SECTION (COMING SOON / ROADMAP) ───────────────────────── */}
        <View
          style={{ paddingHorizontal: px, paddingVertical: isMobile ? 56 : 80, gap: isMobile ? 32 : 52, backgroundColor: '#FBF5EA' }}
          onLayout={(e) => setPricingSectionY(e.nativeEvent.layout.y)}
        >
          <View style={{ gap: 14 }}>
            <Reveal>
              <View style={{
                alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100,
                backgroundColor: `${BRAND_COLORS.primary}12`,
                borderWidth: 1, borderColor: `${BRAND_COLORS.primary}28`,
              }}>
                <Text style={{ fontFamily: F.semiBold, fontSize: 11, color: BRAND_COLORS.primary, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  Bảng giá & Định hướng
                </Text>
              </View>
            </Reveal>
            <Reveal delay={80}>
              <Text style={{ fontFamily: F.loraBold, fontSize: isMobile ? 28 : 38, lineHeight: isMobile ? 38 : 50, color: '#1B2420' }}>
                Kế hoạch phát triển{'\n'}và Thương mại hóa
              </Text>
            </Reveal>
            <Reveal delay={140}>
              <Text style={{ fontFamily: F.regular, fontSize: 14, lineHeight: 24, color: BRAND_COLORS.textSoft, maxWidth: 500 }}>
                Dựa trên chiến lược Freemium và kết quả khảo sát người dùng. Các tính năng cao cấp dưới đây nằm trong định hướng phát triển và thương mại hóa trong tương lai của ViVu Planner.
              </Text>
            </Reveal>
          </View>

          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
            {PRICING_PACKAGES.map((pkg, i) => (
              <Reveal key={i} delay={i * 100} style={isMobile ? undefined : { flex: 1 }}>
                <View style={{
                  flex: isMobile ? undefined : 1,
                  backgroundColor: '#fff',
                  borderWidth: pkg.isPremium ? 2 : 0.5,
                  borderColor: pkg.isPremium ? BRAND_COLORS.primary : 'rgba(27,36,32,0.08)',
                  borderRadius: 20,
                  padding: 28,
                  gap: 16,
                  shadowColor: '#1B2420',
                  shadowOffset: { width: 0, height: pkg.isPremium ? 8 : 4 },
                  shadowOpacity: pkg.isPremium ? 0.06 : 0.03,
                  shadowRadius: pkg.isPremium ? 16 : 8,
                  elevation: pkg.isPremium ? 4 : 2,
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: pkg.tagBg }}>
                      <Text style={{ fontFamily: F.bold, fontSize: 10, color: pkg.tagText, letterSpacing: 0.5 }}>
                        {pkg.tag}
                      </Text>
                    </View>
                    {pkg.isPremium && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Star size={12} color={BRAND_COLORS.gold} fill={BRAND_COLORS.gold} />
                        <Text style={{ fontFamily: F.bold, fontSize: 10, color: BRAND_COLORS.gold, textTransform: 'uppercase' }}>Phổ biến nhất</Text>
                      </View>
                    )}
                  </View>

                  <View style={{ gap: 4 }}>
                    <Text style={{ fontFamily: F.bold, fontSize: 18, color: '#1B2420' }}>{pkg.title}</Text>
                    <Text style={{ fontFamily: F.regular, fontSize: 12, color: BRAND_COLORS.textSoft, lineHeight: 18 }}>
                      {pkg.desc}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: 'rgba(27,36,32,0.08)' }}>
                    <Text style={{ fontFamily: F.loraBold, fontSize: 26, color: BRAND_COLORS.primary }}>
                      {pkg.price}
                    </Text>
                    <Text style={{ fontFamily: F.regular, fontSize: 12, color: BRAND_COLORS.textMuted }}>
                      {pkg.priceSub}
                    </Text>
                  </View>

                  <View style={{ gap: 10, flex: 1 }}>
                    {pkg.features.map((feat, fi) => (
                      <View key={fi} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: `${BRAND_COLORS.primary}15`, alignItems: 'center', justifyContent: 'center', marginTop: 3, flexShrink: 0 }}>
                          <Check size={8} color={BRAND_COLORS.primary} strokeWidth={4} />
                        </View>
                        <Text style={{ fontFamily: F.regular, fontSize: 12, lineHeight: 18, color: BRAND_COLORS.textSoft, flex: 1 }}>
                          {feat}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              </Reveal>
            ))}
          </View>
        </View>

        {/* ── DARK — TESTIMONIALS + CTA ──────────────────────────────────────── */}
        <View style={{ paddingHorizontal: px, paddingVertical: isMobile ? 56 : 80, gap: isMobile ? 32 : 52, backgroundColor: '#14201B' }}>
          <View style={{ gap: 14 }}>
            <Reveal>
              <View style={{ alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.12)' }}>
                <Text style={{ fontFamily: F.semiBold, fontSize: 11, color: 'rgba(243,236,220,0.55)', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  Đánh giá
                </Text>
              </View>
            </Reveal>
            <Reveal delay={80}>
              <Text style={{ fontFamily: F.loraBold, fontSize: isMobile ? 28 : 38, lineHeight: isMobile ? 38 : 50, color: '#F3ECDC' }}>
                Khách hàng nói gì{'\n'}về ViVu Planner?
              </Text>
            </Reveal>
          </View>

          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 14 }}>
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={i} delay={i * 90} style={isMobile ? undefined : { flex: 1 }}>
                <View style={{
                  flex: isMobile ? undefined : 1,
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.09)',
                  borderRadius: 20, padding: 24, gap: 16,
                }}>
                  <View style={{ flexDirection: 'row', gap: 3 }}>
                    {[...Array(5)].map((_, si) => (
                      <Star key={si} size={13} color={BRAND_COLORS.gold} fill={BRAND_COLORS.gold} />
                    ))}
                  </View>
                  <Text style={{ fontFamily: F.loraRegular, fontSize: 14, lineHeight: 26, color: 'rgba(243,236,220,0.82)', flex: 1 }}>
                    "{t.quote}"
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: BRAND_COLORS.primary, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontFamily: F.bold, fontSize: 12, color: '#F3ECDC' }}>{t.initial}</Text>
                      </View>
                      <View>
                        <Text style={{ fontFamily: F.bold, fontSize: 13, color: '#F3ECDC' }}>{t.name}</Text>
                        <Text style={{ fontFamily: F.regular, fontSize: 11, color: 'rgba(243,236,220,0.4)', marginTop: 1 }}>{t.location}</Text>
                      </View>
                    </View>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.07)' }}>
                      <Text style={{ fontFamily: F.regular, fontSize: 10, color: 'rgba(243,236,220,0.45)' }}>{t.tag}</Text>
                    </View>
                  </View>
                </View>
              </Reveal>
            ))}
          </View>

          <Reveal delay={200}>
            <View style={{ gap: 14 }}>
              {[
                'Đi một mình, đôi, gia đình hoặc nhóm bạn',
                'Tự động cập nhật theo thời tiết thực tế',
                'Ngân sách luôn trong tầm kiểm soát',
                'Địa điểm từ Google Places, không bịa đặt',
              ].map((item, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: BRAND_COLORS.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Check size={11} color="#fff" strokeWidth={3} />
                  </View>
                  <Text style={{ fontFamily: F.regular, fontSize: 14, color: 'rgba(243,236,220,0.82)', flex: 1 }}>{item}</Text>
                </View>
              ))}
            </View>
          </Reveal>

          <Reveal delay={280}>
            <Pressable
              onPress={() => router.push(isLoggedIn ? (dashPath as any) : '/(auth)/dang-ky')}
              style={{
                alignItems: 'center', paddingVertical: 18, borderRadius: 14,
                backgroundColor: BRAND_COLORS.accent,
                flexDirection: 'row', justifyContent: 'center', gap: 8,
              }}
            >
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: '#fff' }}>
                {isLoggedIn ? 'Đến bảng điều khiển' : 'Bắt đầu miễn phí ngay hôm nay'}
              </Text>
              <ArrowRight size={16} color="#fff" />
            </Pressable>
          </Reveal>
        </View>

        {/* ── FOOTER ────────────────────────────────────────────────────────── */}
        <View style={{
          backgroundColor: '#FBF5EA', borderTopWidth: 0.5, borderTopColor: 'rgba(27,36,32,0.1)',
          paddingHorizontal: px, paddingVertical: isMobile ? 36 : 52,
        }}>
          <View style={{
            flexDirection: isMobile ? 'column' : 'row',
            justifyContent: 'space-between',
            gap: isMobile ? 24 : 40,
            marginBottom: 32,
          }}>
            <View style={{ gap: 12, maxWidth: 280 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: BRAND_COLORS.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <Compass size={16} color="#fff" />
                </View>
                <Text style={{ fontFamily: F.loraBold, fontSize: 17, color: BRAND_COLORS.primary }}>ViVu Planner</Text>
              </View>
              <Text style={{ fontFamily: F.regular, fontSize: 13, lineHeight: 21, color: BRAND_COLORS.textMuted }}>
                Lên kế hoạch du lịch Việt Nam thông minh hơn với sức mạnh của AI và dữ liệu thực.
              </Text>
            </View>

            {!isMobile && (
              <View style={{ flexDirection: 'row', gap: 56 }}>
                <View style={{ gap: 14 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 11, color: '#1B2420', textTransform: 'uppercase', letterSpacing: 1 }}>
                    Sản phẩm
                  </Text>
                  {['Tính năng', 'Cách dùng', 'Thành phố hỗ trợ'].map((l) => (
                    <Text key={l} style={{ fontFamily: F.regular, fontSize: 13, color: BRAND_COLORS.textMuted }}>{l}</Text>
                  ))}
                </View>
                <View style={{ gap: 14 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 11, color: '#1B2420', textTransform: 'uppercase', letterSpacing: 1 }}>
                    Tài khoản
                  </Text>
                  {['Đăng nhập', 'Đăng ký miễn phí', 'Bảng điều khiển'].map((l) => (
                    <Text key={l} style={{ fontFamily: F.regular, fontSize: 13, color: BRAND_COLORS.textMuted }}>{l}</Text>
                  ))}
                </View>
              </View>
            )}
          </View>

          <View style={{ borderTopWidth: 0.5, borderTopColor: 'rgba(27,36,32,0.1)', paddingTop: 20 }}>
            <Text style={{ fontFamily: F.regular, fontSize: 12, color: BRAND_COLORS.textMuted }}>
              © 2026 ViVu Planner · Dự án du lịch thông minh Việt Nam
            </Text>
          </View>
        </View>

      </Animated.ScrollView>

      {/* ── BACK TO TOP ──────────────────────────────────────────────────────── */}
      {showBackToTop && (
        <Pressable
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
          style={{
            position: 'absolute', bottom: 24, right: 24,
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: BRAND_COLORS.primary,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.18, shadowRadius: 12, elevation: 8,
          }}
        >
          <ChevronUp size={20} color="#fff" />
        </Pressable>
      )}

    </View>
  );
}
