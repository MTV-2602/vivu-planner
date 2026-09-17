import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Platform, Animated, useWindowDimensions, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Compass, Sparkles, AlertTriangle, MapPin, ShieldAlert, Check, Lock,
  ArrowRight, CalendarDays, Wallet, Star, ChevronUp, Search,
} from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import Reveal from '../components/Reveal';
import { BRAND_COLORS, VIETNAMESE_CITIES, APP_ROUTES } from '../constants';

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
    id: 'basis',
    title: 'Gói Basis',
    price: '0 VNĐ',
    priceSub: 'Mặc định',
    isPremium: false,
    tag: 'Basis',
    tagBg: '#1F6F5415',
    tagText: '#1F6F54',
    desc: 'Lập kế hoạch du lịch cơ bản, trực quan và quản lý ngân sách chuyến đi hiệu quả.',
    features: [
      { text: 'Personalized planning (Lên lịch cá nhân hóa)', enabled: true },
      { text: 'Popular destination suggesting (Gợi ý điểm đến phổ biến)', enabled: true },
      { text: 'Budget Managements (Quản lý ngân sách chuyến đi)', enabled: true },
      { text: 'Synchronized directly booking (Đặt dịch vụ đồng bộ trực tiếp)', enabled: true },
      { text: 'Drag-and-drop schedule (Kéo thả sắp xếp lịch trình)', enabled: true },
      { text: 'Shared Iterative Maps (Bản đồ tương tác chia sẻ)', enabled: false },
      { text: 'Download offline schedule (Tải lịch trình xem ngoại tuyến)', enabled: false }
    ]
  },
  {
    id: 'starter',
    title: 'Gói Starter',
    price: '29.000 VNĐ',
    priceSub: '/ tháng',
    isPremium: false,
    tag: 'Starter',
    tagBg: '#E2703A15',
    tagText: '#E2703A',
    desc: 'Tận hưởng trọn vẹn chuyến đi không quảng cáo và khám phá bộ sưu tập Hidden gems độc quyền.',
    features: [
      { text: 'Shared Iterative Maps (Bản đồ tương tác chia sẻ)', enabled: true },
      { text: 'Download offline schedule (Tải lịch trình xem ngoại tuyến)', enabled: true },
      { text: 'Get rid of ads (Loại bỏ hoàn toàn quảng cáo)', enabled: true },
      { text: 'Hidden gems tại 15 tỉnh/thành phố phổ biến nhất', enabled: true },
      { text: 'Exclusive Scenic Score (Điểm số cảnh quan độc quyền)', enabled: true },
      { text: 'Optimal path (Tối ưu hóa lộ trình giữa các điểm ẩn)', enabled: true },
      { text: 'Tối ưu hóa thời gian di chuyển và tham quan', enabled: true },
      { text: 'Exclusive budget management (Quản lý ngân sách nâng cao)', enabled: true }
    ]
  },
  {
    id: 'premium',
    title: 'Gói Premium',
    price: '49.000 VNĐ',
    priceSub: '/ tháng',
    isPremium: true,
    tag: 'Premium',
    tagBg: '#D4A01715',
    tagText: '#D4A017',
    desc: 'Bao gồm toàn bộ tính năng Starter và mở khóa bộ công cụ đồng bộ, du lịch bền vững cao cấp nhất.',
    features: [
      { text: 'Bao gồm toàn bộ tính năng của gói Starter', enabled: true },
      { text: 'Shared Iterative Maps (Bản đồ tương tác chia sẻ)', enabled: true },
      { text: 'Download offline schedule (Tải lịch trình xem ngoại tuyến)', enabled: true },
      { text: '"Carbon footprint" calculation (Tính toán dấu chân carbon)', enabled: true },
      { text: '"Super hidden gems" cho 10+ tỉnh vùng núi & vùng biển độc lạ', enabled: true },
      { text: 'Tuyển chọn Chỗ nghỉ, Thuê xe, và Quán ăn địa phương độc đáo', enabled: true },
      { text: 'Cho phép thành viên nhóm cùng truy cập & sửa đổi lịch trình', enabled: true }
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
  const { session, isAdmin, signOut } = useAuth();
  const isLoggedIn = !!session;

  const { data: plansData, refetch: refetchPlans } = useQuery({
    queryKey: ['publicPlansLanding'],
    queryFn: async () => {
      const res = await api.get('/payment/plans');
      return res.data;
    },
    staleTime: 10000,
  });

  useEffect(() => {
    let channel: any = null;
    try {
      const channelName = `pricing_realtime_landing_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'pricing_plans' },
          () => {
            refetchPlans();
          }
        )
        .on('broadcast', { event: 'plans_updated' }, () => {
          refetchPlans();
        })
        .subscribe();
    } catch (err) {
      console.warn('[Realtime] Landing subscribe failed:', err);
    }

    return () => {
      try {
        if (channel) supabase.removeChannel(channel);
      } catch (err) {}
    };
  }, []);

  const getPlanPrice = (planId: string, defaultPrice: string) => {
    if (!plansData?.plans) return defaultPrice;
    const plan = (planId === 'starter' ? (plansData.plans.starter || plansData.plans.plus) : (plansData.plans.premium || plansData.plans.pro)) || plansData.plans[planId];
    if (plan?.amount != null) {
      return `${plan.amount.toLocaleString('vi-VN')} VNĐ`;
    }
    return defaultPrice;
  };
  const [scrolled, setScrolled] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [quickDestination, setQuickDestination] = useState('');

  const handleQuickSearchSubmit = () => {
    const dest = quickDestination.trim();
    if (isLoggedIn) {
      router.push(`${APP_ROUTES.NEW_TRIP}${dest ? `?destination=${encodeURIComponent(dest)}` : ''}` as any);
    } else {
      router.push(`${APP_ROUTES.SIGN_UP}${dest ? `?destination=${encodeURIComponent(dest)}` : ''}` as any);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const dashPath = isAdmin ? APP_ROUTES.ADMIN : APP_ROUTES.TRIPS;

  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      setScrolled(value > 32);
      setShowBackToTop(value > 480);
    });
    return () => scrollY.removeListener(id);
  }, [scrollY]);

  const renderStep = (step: typeof STEPS[0], _delay?: number) => (
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
    <View style={{ flex: 1, backgroundColor: '#150A16' }}>

      {/* ── NAVBAR ──────────────────────────────────────────────────────────── */}
      <View style={{
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: px, paddingVertical: isMobile ? 14 : 18, zIndex: 100,
        backgroundColor: scrolled ? 'rgba(21, 10, 22, 0.92)' : 'transparent',
        borderBottomWidth: scrolled ? 1 : 0,
        borderBottomColor: 'rgba(255, 255, 255, 0.12)',
        ...(isWeb && scrolled ? { backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } as any : {}),
      }}>
        <Pressable
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
        >
          <View style={{
            width: isMobile ? 32 : 38, height: isMobile ? 32 : 38, borderRadius: 12,
            backgroundColor: 'rgba(255, 255, 255, 0.15)', alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.3)',
          }}>
            <Compass size={isMobile ? 16 : 20} color="#FFF" />
          </View>
          <Text style={{ fontFamily: F.loraBold, fontSize: isMobile ? 16 : 20, color: '#FFFFFF', letterSpacing: -0.3 }}>
            ViVu Planner
          </Text>
        </Pressable>

        {isWeb && !isMobile && (
          <View style={{ flexDirection: 'row', gap: 36, alignItems: 'center' }}>
            <Pressable onPress={() => scrollRef.current?.scrollTo({ y: howItWorksSectionY, animated: true })}>
              <Text style={{ fontFamily: F.semiBold, fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>Cách dùng</Text>
            </Pressable>
            <Pressable onPress={() => scrollRef.current?.scrollTo({ y: featuresSectionY, animated: true })}>
              <Text style={{ fontFamily: F.semiBold, fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>Tính năng</Text>
            </Pressable>
            <Pressable onPress={() => scrollRef.current?.scrollTo({ y: pricingSectionY, animated: true })}>
              <Text style={{ fontFamily: F.semiBold, fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>Bảng giá</Text>
            </Pressable>
            <Pressable onPress={() => scrollRef.current?.scrollTo({ y: pricingSectionY, animated: true })}>
              <Text style={{ fontFamily: F.semiBold, fontSize: 14, color: 'rgba(255,255,255,0.75)' }}>Hỗ trợ</Text>
            </Pressable>
          </View>
        )}

        {isLoggedIn ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => router.push(dashPath as any)}
              style={{
                paddingHorizontal: isMobile ? 14 : 20, paddingVertical: 10, borderRadius: 100,
                backgroundColor: 'rgba(255, 255, 255, 0.15)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.3)',
              }}
            >
              <Text style={{ fontFamily: F.bold, fontSize: 13, color: '#fff' }}>
                {isAdmin ? 'Quản trị' : isMobile ? 'Dashboard' : 'Bảng điều khiển'}
              </Text>
            </Pressable>
            {!isMobile && (
              <Pressable
                onPress={handleSignOut}
                style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }}
              >
                <Text style={{ fontFamily: F.semiBold, fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>Đăng xuất</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            {!isMobile && (
              <Pressable onPress={() => router.push(APP_ROUTES.SIGN_IN as any)}>
                <Text style={{ fontFamily: F.semiBold, fontSize: 14, color: '#FFFFFF' }}>Đăng nhập</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => router.push((isMobile ? APP_ROUTES.SIGN_IN : APP_ROUTES.SIGN_UP) as any)}
              style={{
                paddingHorizontal: isMobile ? 16 : 22, paddingVertical: 10, borderRadius: 100,
                backgroundColor: 'rgba(255, 255, 255, 0.15)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.35)',
              }}
            >
              <Text style={{ fontFamily: F.bold, fontSize: 13, color: '#fff' }}>
                {isMobile ? 'Đăng nhập' : 'Tạo Tài Khoản'}
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

        {/* ── HERO SUNSET TWILIGHT SECTION ───────────────────────────────────── */}
        <Animated.View style={{ opacity: heroAlpha }}>
          <View style={{
            paddingHorizontal: px,
            paddingTop: isMobile ? 36 : 64,
            paddingBottom: isMobile ? 40 : 72,
            alignItems: 'center',
            backgroundColor: '#2E1325',
            ...(isWeb ? {
              background: 'linear-gradient(180deg, #150A16 0%, #351528 35%, #6B293C 70%, #B84C55 100%)',
            } as any : {}),
          }}>
            
            {/* Center Content Container */}
            <View style={{ width: '100%', maxWidth: 840, alignItems: 'center', gap: isMobile ? 20 : 26 }}>

              {/* Pill Badge */}
              <Animated.View style={{ transform: [{ translateY: badgeY }] }}>
                <Reveal delay={0}>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    paddingHorizontal: 18, paddingVertical: 9, borderRadius: 100,
                    backgroundColor: 'rgba(255, 255, 255, 0.12)',
                    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.25)',
                    ...(isWeb ? { backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' } as any : {}),
                  }}>
                    <Sparkles size={14} color="#FFF" />
                    <Text style={{ fontFamily: F.semiBold, fontSize: 12, color: '#FFFFFF', letterSpacing: 0.5 }}>
                      ✨ AI-Powered Travel Planning & Booking
                    </Text>
                  </View>
                </Reveal>
              </Animated.View>

              {/* Main Headline */}
              <Animated.View style={{ transform: [{ translateY: titleY }], width: '100%' }}>
                <Reveal delay={80}>
                  <Text style={{
                    fontFamily: F.loraBold,
                    fontSize: isMobile ? 34 : 56,
                    lineHeight: isMobile ? 44 : 68,
                    color: '#FFFFFF',
                    textAlign: 'center',
                    letterSpacing: -0.5,
                  }}>
                    Lập kế hoạch du lịch Việt Nam{'\n'}
                    thông minh cùng AI
                  </Text>
                </Reveal>
              </Animated.View>

              {/* Subtitle */}
              <Animated.View style={{ transform: [{ translateY: subtitleY }], width: '100%' }}>
                <Reveal delay={160}>
                  <Text style={{
                    fontFamily: F.regular,
                    fontSize: isMobile ? 15 : 17,
                    lineHeight: isMobile ? 26 : 30,
                    color: 'rgba(255, 255, 255, 0.85)',
                    textAlign: 'center',
                    maxWidth: 620,
                    alignSelf: 'center',
                  }}>
                    Tự động xây dựng lịch trình cá nhân hóa dựa trên ngân sách thực tế, dữ liệu thời tiết thực và khả năng thích ứng sự cố tức thì.
                  </Text>
                </Reveal>
              </Animated.View>

              {/* Frosted Glass Pink Glow CTA Button */}
              <Animated.View style={{ transform: [{ translateY: ctaY }] }}>
                <Reveal delay={220}>
                  <Pressable
                    onPress={() => router.push(isLoggedIn ? (dashPath as any) : (APP_ROUTES.SIGN_UP as any))}
                    style={{
                      paddingHorizontal: isMobile ? 32 : 44,
                      paddingVertical: isMobile ? 16 : 20,
                      borderRadius: 100,
                      backgroundColor: 'rgba(224, 116, 134, 0.42)',
                      borderWidth: 1,
                      borderColor: 'rgba(255, 255, 255, 0.5)',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      shadowColor: '#E07486',
                      shadowOffset: { width: 0, height: 8 },
                      shadowOpacity: 0.4,
                      shadowRadius: 24,
                      elevation: 8,
                      ...(isWeb ? { backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', cursor: 'pointer' } as any : {}),
                    }}
                  >
                    <Text style={{ fontFamily: F.bold, fontSize: isMobile ? 15 : 17, color: '#FFFFFF' }}>
                      {isLoggedIn ? 'Bắt Đầu Ngay' : 'Tạo Lịch Trình AI'}
                    </Text>
                    <ArrowRight size={18} color="#FFFFFF" />
                  </Pressable>
                </Reveal>
              </Animated.View>

              {/* Quick Destination Chips */}
              <Animated.View style={{ transform: [{ translateY: citiesY }] }}>
                <Reveal delay={280}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 4 }}>
                    {VIETNAMESE_CITIES.map((city) => (
                      <Pressable
                        key={city}
                        onPress={() => {
                          if (isLoggedIn) {
                            router.push(`${APP_ROUTES.NEW_TRIP}?destination=${encodeURIComponent(city)}` as any);
                          } else {
                            router.push(`${APP_ROUTES.SIGN_UP}?destination=${encodeURIComponent(city)}` as any);
                          }
                        }}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingHorizontal: 13, paddingVertical: 7, borderRadius: 100,
                          backgroundColor: 'rgba(255, 255, 255, 0.12)',
                          borderWidth: 0.5, borderColor: 'rgba(255, 255, 255, 0.2)',
                          ...(isWeb ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } as any : {}),
                        }}
                      >
                        <Text style={{ fontSize: 12 }}>{CITY_EMOJIS[city]}</Text>
                        <Text style={{ fontFamily: F.semiBold, fontSize: 12, color: '#FFFFFF' }}>{city}</Text>
                      </Pressable>
                    ))}
                  </View>
                </Reveal>
              </Animated.View>

            </View>

            {/* ── TABLET MOCKUP DEVICE FRAME ─────────────────────────────────── */}
            <Animated.View style={{ transform: [{ translateY: cardY }], width: '100%', maxWidth: 980, marginTop: isMobile ? 32 : 48 }}>
              <Reveal delay={320}>
                <View style={{
                  backgroundColor: '#11141A',
                  borderRadius: isMobile ? 20 : 36,
                  borderWidth: isMobile ? 4 : 8,
                  borderColor: '#1D212A',
                  padding: isMobile ? 10 : 18,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 24 },
                  shadowOpacity: 0.45,
                  shadowRadius: 48,
                  elevation: 16,
                }}>
                  {/* Tablet Inner Screen */}
                  <View style={{
                    backgroundColor: '#160D19',
                    borderRadius: isMobile ? 14 : 24,
                    padding: isMobile ? 16 : 24,
                    gap: 20,
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                  }}>
                    {/* Tablet Header Tabs */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ fontFamily: F.loraBold, fontSize: 18, color: '#FFF' }}>vivu</Text>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: 'rgba(224, 116, 134, 0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
                            <Text style={{ fontFamily: F.bold, fontSize: 11, color: '#FFF' }}>🤖 AI Chat</Text>
                          </View>
                          {!isMobile && (
                            <>
                              <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.08)' }}>
                                <Text style={{ fontFamily: F.regular, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>🗺️ Chuyến đi</Text>
                              </View>
                              <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.08)' }}>
                                <Text style={{ fontFamily: F.regular, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>🔍 Khám phá</Text>
                              </View>
                            </>
                          )}
                        </View>
                      </View>
                      <View style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.2)' }}>
                        <Text style={{ fontFamily: F.semiBold, fontSize: 11, color: '#FFF' }}>+ Tạo Chuyến Đi</Text>
                      </View>
                    </View>

                    {/* Tablet Main App View */}
                    <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 18, alignItems: 'stretch' }}>
                      
                      {/* Left: AI Companion Orb Box */}
                      <View style={{
                        flex: 1, padding: 24, borderRadius: 20,
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)',
                        justifyContent: 'center', gap: 14, alignItems: 'flex-start',
                      }}>
                        <View style={{
                          width: 56, height: 56, borderRadius: 28,
                          backgroundColor: 'rgba(224, 116, 134, 0.4)',
                          alignItems: 'center', justifyContent: 'center',
                          borderWidth: 2, borderColor: '#FFF',
                          shadowColor: '#E07486', shadowRadius: 16, shadowOpacity: 0.6,
                        }}>
                          <Sparkles size={24} color="#FFF" />
                        </View>
                        <Text style={{ fontFamily: F.loraBold, fontSize: 18, color: '#FFF', lineHeight: 26 }}>
                          Xin chào! Tôi là Trợ lý ViVu AI đồng hành cùng chuyến đi của bạn.
                        </Text>
                        <Text style={{ fontFamily: F.regular, fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 20 }}>
                          Chỉ cần chọn ngày & ngân sách, AI sẽ lập tức thiết kế lịch trình hoàn chỉnh từ thời tiết đến địa điểm thực tế.
                        </Text>
                      </View>

                      {/* Right: Place Recommendation Cards */}
                      <View style={{ flex: isMobile ? undefined : 1.2, flexDirection: 'row', gap: 12 }}>
                        {/* Place 1 */}
                        <View style={{
                          flex: 1, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)',
                          borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.12)', padding: 14, gap: 10,
                        }}>
                          <View style={{ height: 110, borderRadius: 12, backgroundColor: 'rgba(224,116,134,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 32 }}>🏛️</Text>
                          </View>
                          <Text style={{ fontFamily: F.bold, fontSize: 13, color: '#FFF' }}>Hà Nội · Phố Cổ</Text>
                          <Text style={{ fontFamily: F.regular, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>⭐ 4.9 · 3 ngày 2 đêm</Text>
                        </View>

                        {/* Place 2 */}
                        <View style={{
                          flex: 1, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)',
                          borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.12)', padding: 14, gap: 10,
                        }}>
                          <View style={{ height: 110, borderRadius: 12, backgroundColor: 'rgba(139,92,246,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 32 }}>🌊</Text>
                          </View>
                          <Text style={{ fontFamily: F.bold, fontSize: 13, color: '#FFF' }}>Đà Nẵng · Cầu Vàng</Text>
                          <Text style={{ fontFamily: F.regular, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>⭐ 4.9 · 4 ngày 3 đêm</Text>
                        </View>
                      </View>

                    </View>
                  </View>
                </View>
              </Reveal>
            </Animated.View>

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
                      {getPlanPrice(pkg.id, pkg.price)}
                    </Text>
                    <Text style={{ fontFamily: F.regular, fontSize: 12, color: BRAND_COLORS.textMuted }}>
                      {pkg.priceSub}
                    </Text>
                  </View>

                  <View style={{ gap: 10, flex: 1 }}>
                    {pkg.features.map((feat: any, fi) => (
                      <View key={fi} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                        <View style={{ 
                          width: 14, 
                          height: 14, 
                          borderRadius: 7, 
                          backgroundColor: feat.enabled ? `${BRAND_COLORS.primary}15` : '#EF444415', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          marginTop: 3, 
                          flexShrink: 0 
                        }}>
                          {feat.enabled ? (
                            <Check size={8} color={BRAND_COLORS.primary} strokeWidth={4} />
                          ) : (
                            <Lock size={8} color="#EF4444" strokeWidth={3} />
                          )}
                        </View>
                        <Text style={{ 
                          fontFamily: F.regular, 
                          fontSize: 12, 
                          lineHeight: 18, 
                          color: feat.enabled ? BRAND_COLORS.textSoft : BRAND_COLORS.textMuted, 
                          textDecorationLine: feat.enabled ? 'none' : 'line-through',
                          flex: 1 
                        }}>
                          {feat.text}
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
              onPress={() => router.push(isLoggedIn ? (dashPath as any) : (APP_ROUTES.SIGN_UP as any))}
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
