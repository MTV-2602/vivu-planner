import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Platform, Animated, useWindowDimensions, TextInput, ImageBackground } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Compass, Sparkles, AlertTriangle, MapPin, ShieldAlert, Check, Lock,
  ArrowRight, CalendarDays, Wallet, Star, ChevronUp, Search, Sun, Moon,
} from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import Reveal from '../components/Reveal';
import HeroAISearch from '../components/HeroAISearch';
import LocalizedBentoGrid from '../components/LocalizedBentoGrid';
import TripWorkspaceSplitView from '../components/TripWorkspaceSplitView';
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

const NAV_ITEMS = [
  { id: 0, label: 'Cách dùng' },
  { id: 1, label: 'Tính năng' },
  { id: 2, label: 'Bảng giá' },
  { id: 3, label: 'Hỗ trợ' },
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

  const [activeNavIndex, setActiveNavIndex] = useState<number>(0);
  const underlineLeft = useRef(new Animated.Value(0)).current;
  const underlineWidth = useRef(new Animated.Value(0)).current;
  const [navLayouts, setNavLayouts] = useState<Record<number, { x: number; width: number }>>({});

  const animateUnderline = (x: number, width: number) => {
    Animated.parallel([
      Animated.spring(underlineLeft, {
        toValue: x,
        useNativeDriver: false,
        friction: 18,
        tension: 140,
      }),
      Animated.spring(underlineWidth, {
        toValue: width,
        useNativeDriver: false,
        friction: 18,
        tension: 140,
      }),
    ]).start();
  };

  const isInitialUnderlineSet = useRef(false);

  useEffect(() => {
    const layout = navLayouts[activeNavIndex];
    if (layout && layout.width > 0) {
      if (!isInitialUnderlineSet.current) {
        underlineLeft.setValue(layout.x);
        underlineWidth.setValue(layout.width);
        isInitialUnderlineSet.current = true;
      } else {
        animateUnderline(layout.x, layout.width);
      }
    }
  }, [activeNavIndex, navLayouts]);

  const handleNavPress = (id: number, targetY: number) => {
    setActiveNavIndex(id);
    scrollRef.current?.scrollTo({ y: targetY, animated: true });
  };

  useEffect(() => {
    const listenerId = scrollY.addListener(({ value }) => {
      const scrollPos = value + 250;
      let newIndex = 0;
      if (pricingSectionY > 0 && scrollPos >= pricingSectionY) {
        newIndex = 2;
      } else if (featuresSectionY > 0 && scrollPos >= featuresSectionY) {
        newIndex = 1;
      } else if (howItWorksSectionY > 0 && scrollPos >= howItWorksSectionY) {
        newIndex = 0;
      } else {
        newIndex = 0;
      }
      setActiveNavIndex((prev) => (prev !== newIndex ? newIndex : prev));
    });

    return () => {
      scrollY.removeListener(listenerId);
    };
  }, [howItWorksSectionY, featuresSectionY, pricingSectionY]);

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

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (isWeb && typeof window !== 'undefined') {
      const saved = localStorage.getItem('vivu_landing_theme');
      if (saved) return saved === 'dark';
    }
    return false; // Default to Light Mode (bright theme)
  });

  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev;
      if (isWeb && typeof window !== 'undefined') {
        localStorage.setItem('vivu_landing_theme', next ? 'dark' : 'light');
      }
      return next;
    });
  };

  const T = {
    bg: isDarkMode ? '#0A0A0C' : '#F4F8FA',
    navBg: isDarkMode
      ? (scrolled ? 'rgba(10, 10, 12, 0.92)' : 'transparent')
      : (scrolled ? 'rgba(244, 248, 250, 0.95)' : 'transparent'),
    navBorder: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : '#D4E3E8',
    logoBg: isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(59, 122, 140, 0.15)',
    logoBorder: isDarkMode ? 'rgba(255, 255, 255, 0.25)' : 'rgba(59, 122, 140, 0.3)',
    logoColor: isDarkMode ? '#FFFFFF' : '#3B7A8C',
    text: isDarkMode ? '#FFFFFF' : '#2D4B54',
    textMuted: isDarkMode ? 'rgba(255, 255, 255, 0.75)' : '#4B6E79',
    textSoft: isDarkMode ? 'rgba(255, 255, 255, 0.55)' : '#769FA9',
    accent: isDarkMode ? '#38BDF8' : '#3B7A8C',
    heroBg: isDarkMode
      ? 'linear-gradient(180deg, #1C323D 0%, #0E1B22 40%, #0A0A0C 100%)'
      : 'linear-gradient(180deg, #4A707D 0%, #6F98A5 30%, #A3C4CE 65%, #F0F6F8 100%)',
    heroBgFallback: isDarkMode ? '#0E1B22' : '#6F98A5',
    heroTitle: '#FFFFFF',
    cardBg: isDarkMode ? 'rgba(255, 255, 255, 0.03)' : '#FFFFFF',
    cardBorder: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#D4E3E8',
    cardShadow: isDarkMode ? 'rgba(0,0,0,0.4)' : 'rgba(74, 112, 125, 0.08)',
    badgeBg: isDarkMode ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.25)',
    badgeBorder: isDarkMode ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.4)',
    badgeText: '#FFFFFF',
    chipBg: isDarkMode ? 'rgba(255, 255, 255, 0.12)' : '#E6F0F3',
    chipBorder: isDarkMode ? 'rgba(255, 255, 255, 0.2)' : '#CBE0E6',
    chipText: isDarkMode ? '#FFFFFF' : '#2D4B54',
    heroCtaBg: isDarkMode ? '#38BDF8' : '#3B7A8C',
    heroCtaBorder: isDarkMode ? '#38BDF8' : '#3B7A8C',
    heroCtaText: '#FFFFFF',
    mockupBg: isDarkMode ? '#11141A' : '#FFFFFF',
    mockupBorder: isDarkMode ? '#1D212A' : '#D4E3E8',
    mockupInnerBg: isDarkMode ? '#160D19' : '#F4F8FA',
    statsBg: isDarkMode ? 'rgba(255, 255, 255, 0.02)' : '#FFFFFF',
    statsBorder: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#D4E3E8',
    howItWorksBg: isDarkMode
      ? 'radial-gradient(ellipse at 15% 10%, rgba(56, 189, 248, 0.1) 0%, #0A0A0C 90%)'
      : 'linear-gradient(180deg, #F0F6F8 0%, #FFFFFF 100%)',
    featuresBg: isDarkMode
      ? 'radial-gradient(ellipse at 88% 50%, rgba(56, 189, 248, 0.14) 0%, #0A0A0C 90%)'
      : 'linear-gradient(180deg, #FFFFFF 0%, #F4F8FA 100%)',
    pricingBg: isDarkMode
      ? 'radial-gradient(ellipse at 50% 20%, rgba(56, 189, 248, 0.09) 0%, #08080A 90%)'
      : 'linear-gradient(180deg, #F4F8FA 0%, #FFFFFF 100%)',
    testimonialsBg: isDarkMode
      ? 'radial-gradient(ellipse at 50% 80%, rgba(56, 189, 248, 0.16) 0%, #0A0A0C 90%)'
      : 'linear-gradient(180deg, #FFFFFF 0%, #F4F8FA 100%)',
    ctaBoxBg: isDarkMode
      ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.16) 0%, rgba(10, 10, 12, 0.6) 100%)'
      : 'linear-gradient(135deg, #2D4B54 0%, #3B7A8C 100%)',
    ctaBoxBorder: isDarkMode ? 'rgba(56, 189, 248, 0.25)' : '#4A707D',
    ctaButtonBg: isDarkMode ? '#38BDF8' : '#FFFFFF',
    ctaButtonText: isDarkMode ? '#0A0A0C' : '#2D4B54',
    footerBg: isDarkMode ? '#050505' : '#1C323D',
    footerBorder: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#2D4B54',
    watermarkColor: isDarkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.06)',
  };

  const renderStep = (step: typeof STEPS[0], _delay?: number) => (
    <View style={{
      flexDirection: 'row', gap: 16, alignItems: 'flex-start',
      padding: 22, borderRadius: 16,
      backgroundColor: step.dark
        ? (isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(224, 122, 95, 0.12)')
        : T.cardBg,
      borderWidth: 1,
      borderColor: step.dark ? T.accent : T.cardBorder,
      ...(isWeb ? { backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } as any : {}),
    }}>
      <View style={{
        width: 46, height: 46, borderRadius: 13,
        backgroundColor: step.dark ? (isDarkMode ? 'rgba(249, 158, 117, 0.2)' : 'rgba(224, 122, 95, 0.2)') : (isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(224, 122, 95, 0.1)'),
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {step.dark ? <Sparkles size={20} color={T.accent} /> : step.icon}
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={{ fontFamily: F.semiBold, fontSize: 10, letterSpacing: 1.2, color: step.dark ? T.accent : T.textSoft }}>
          BƯỚC {step.num}
        </Text>
        <Text style={{ fontFamily: F.bold, fontSize: 15, color: T.text }}>
          {step.title}
        </Text>
        <Text style={{ fontFamily: F.regular, fontSize: 13, lineHeight: 21, color: T.textMuted }}>
          {step.desc}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>

      {/* ── NAVBAR ──────────────────────────────────────────────────────────── */}
      <View style={{
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: px, paddingVertical: isMobile ? 14 : 18, zIndex: 100,
        backgroundColor: T.navBg,
        borderBottomWidth: scrolled ? 1 : 0,
        borderBottomColor: T.navBorder,
        ...(isWeb && scrolled ? { backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } as any : {}),
      }}>
        <Pressable
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
          style={({ pressed }) => [{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            opacity: pressed ? 0.75 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
            ...(isWeb ? { cursor: 'pointer' } as any : {}),
          }]}
        >
          <View style={{
            width: isMobile ? 32 : 38, height: isMobile ? 32 : 38, borderRadius: 12,
            backgroundColor: T.logoBg, alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: T.logoBorder,
          }}>
            <Compass size={isMobile ? 16 : 20} color={T.logoColor} />
          </View>
          <Text style={{ fontFamily: F.loraBold, fontSize: isMobile ? 16 : 20, color: T.text, letterSpacing: -0.3 }}>
            ViVu Planner
          </Text>
        </Pressable>

        {isWeb && !isMobile && (
          <View style={{ position: 'relative', flexDirection: 'row', gap: 28, alignItems: 'center', paddingVertical: 4 }}>
            {NAV_ITEMS.map((item) => {
              const isActive = activeNavIndex === item.id;
              const targetY = item.id === 0 ? howItWorksSectionY : item.id === 1 ? featuresSectionY : pricingSectionY;
              return (
                <Pressable
                  key={item.id}
                  onLayout={(e) => {
                    const { x, width } = e.nativeEvent.layout;
                    setNavLayouts((prev) => {
                      if (prev[item.id]?.x === x && prev[item.id]?.width === width) return prev;
                      return { ...prev, [item.id]: { x, width } };
                    });
                  }}
                  onPress={() => handleNavPress(item.id, targetY)}
                  style={({ pressed }) => [{
                    paddingVertical: 6,
                    paddingHorizontal: 4,
                    opacity: pressed ? 0.75 : 1,
                    transform: [{ scale: pressed ? 0.94 : 1 }],
                    ...(isWeb ? {
                      cursor: 'pointer',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      outline: 'none',
                      outlineStyle: 'none',
                      transition: 'transform 0.15s ease, opacity 0.15s ease'
                    } as any : {}),
                  }]}
                >
                  <Text style={{
                    fontFamily: isActive ? F.bold : F.semiBold,
                    fontSize: 14,
                    color: isActive ? T.accent : T.textMuted,
                    ...(isWeb ? { userSelect: 'none', WebkitUserSelect: 'none' } as any : {}),
                  }}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
            <Animated.View
              style={{
                position: 'absolute',
                bottom: 0,
                left: underlineLeft,
                width: underlineWidth,
                height: 2.5,
                borderRadius: 2,
                backgroundColor: T.accent,
              }}
            />
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          {/* Theme Toggle Button (Sun / Moon Switch) */}
          <Pressable
            onPress={toggleTheme}
            style={({ pressed }) => [{
              width: 38, height: 38, borderRadius: 19,
              backgroundColor: T.chipBg, borderWidth: 1, borderColor: T.chipBorder,
              alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
              transform: [{ scale: pressed ? 0.92 : 1 }],
              ...(isWeb ? { backdropFilter: 'blur(8px)', cursor: 'pointer', transition: 'all 0.2s ease' } as any : {}),
            }]}
          >
            {isDarkMode ? <Sun size={18} color="#F99E75" /> : <Moon size={18} color="#E07A5F" />}
          </Pressable>

          {isLoggedIn ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => router.push(dashPath as any)}
                style={({ pressed }) => [{
                  paddingHorizontal: isMobile ? 14 : 20, paddingVertical: 10, borderRadius: 100,
                  backgroundColor: T.chipBg, borderWidth: 1, borderColor: T.chipBorder,
                  opacity: pressed ? 0.8 : 1,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                  ...(isWeb ? { cursor: 'pointer' } as any : {}),
                }]}
              >
                <Text style={{ fontFamily: F.bold, fontSize: 13, color: T.text }}>
                  {isAdmin ? 'Quản trị' : isMobile ? 'Dashboard' : 'Bảng điều khiển'}
                </Text>
              </Pressable>
              {!isMobile && (
                <Pressable
                  onPress={handleSignOut}
                  style={({ pressed }) => [{
                    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 100, borderWidth: 1, borderColor: T.cardBorder,
                    opacity: pressed ? 0.8 : 1,
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                    ...(isWeb ? { cursor: 'pointer' } as any : {}),
                  }]}
                >
                  <Text style={{ fontFamily: F.semiBold, fontSize: 13, color: T.textMuted }}>Đăng xuất</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              {!isMobile && (
                <Pressable
                  onPress={() => router.push(APP_ROUTES.SIGN_IN as any)}
                  style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1, ...(isWeb ? { cursor: 'pointer' } as any : {}) }]}
                >
                  <Text style={{ fontFamily: F.semiBold, fontSize: 14, color: T.text }}>Đăng nhập</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => router.push((isMobile ? APP_ROUTES.SIGN_IN : APP_ROUTES.SIGN_UP) as any)}
                style={({ pressed }) => [{
                  paddingHorizontal: isMobile ? 16 : 22, paddingVertical: 10, borderRadius: 100,
                  backgroundColor: T.heroCtaBg, borderWidth: 1, borderColor: T.heroCtaBorder,
                  opacity: pressed ? 0.85 : 1,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                  ...(isWeb ? { cursor: 'pointer' } as any : {}),
                }]}
              >
                <Text style={{ fontFamily: F.bold, fontSize: 13, color: '#FFF' }}>
                  {isMobile ? 'Đăng nhập' : 'Tạo Tài Khoản'}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
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

        {/* ── HERO SECTION WITH SCENIC NATURE TRAVEL BACKGROUND (LAYLA AI STYLE) ── */}
        <Animated.View style={{ opacity: heroAlpha }}>
          <ImageBackground
            source={{ uri: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=2000&q=80' }}
            style={{
              width: '100%',
              paddingHorizontal: px,
              paddingTop: isMobile ? 36 : 64,
              paddingBottom: isMobile ? 48 : 80,
              alignItems: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Dark Ocean Slate Overlay Gradient */}
            <View style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(28, 50, 61, 0.75)',
              ...(isWeb ? {
                backgroundImage: 'linear-gradient(180deg, rgba(28, 50, 61, 0.82) 0%, rgba(45, 75, 84, 0.72) 50%, rgba(15, 27, 34, 0.92) 100%)',
              } as any : {}),
            }} />

            {/* Right Floating Preview Card (Layla AI Style) */}
            {!isMobile && (
              <Animated.View style={{
                position: 'absolute',
                top: 48,
                right: px,
                width: 260,
                borderRadius: 22,
                backgroundColor: 'rgba(15, 27, 34, 0.75)',
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.25)',
                padding: 14,
                gap: 10,
                zIndex: 20,
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 16 },
                shadowOpacity: 0.35,
                shadowRadius: 28,
                transform: [{ translateY: cardY }],
                ...(isWeb ? {
                  backdropFilter: 'blur(16px)',
                  boxShadow: '0 16px 40px rgba(0, 0, 0, 0.4)',
                } as any : {}),
              }}>
                <ImageBackground
                  source={{ uri: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80' }}
                  style={{ width: '100%', height: 115, borderRadius: 14, overflow: 'hidden', padding: 8, justifyContent: 'flex-start' }}
                  imageStyle={{ borderRadius: 14 }}
                >
                  <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 100, backgroundColor: 'rgba(0,0,0,0.6)', alignSelf: 'flex-start' }}>
                    <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>✨ Vừa tạo xong</Text>
                  </View>
                </ImageBackground>

                <View style={{ gap: 4 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>Đà Lạt · 3 ngày 2 đêm</Text>
                  <Text style={{ color: 'rgba(255, 255, 255, 0.82)', fontSize: 11, lineHeight: 16 }}>
                    Lịch trình tự động tối ưu bởi AI Gemini trong 2 phút.
                  </Text>
                </View>

                <Pressable
                  onPress={() => router.push(APP_ROUTES.NEW_TRIP as any)}
                  style={({ pressed }) => [{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                    paddingVertical: 8, borderRadius: 100,
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.35)',
                    opacity: pressed ? 0.8 : 1,
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                    ...(isWeb ? { cursor: 'pointer', transition: 'all 0.2s ease' } as any : {}),
                  }]}
                >
                  <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '700' }}>Plan my trip ↗</Text>
                </Pressable>
              </Animated.View>
            )}
            
            {/* Center Content Container */}
            <View style={{ width: '100%', maxWidth: 840, alignItems: 'center', gap: isMobile ? 20 : 26, zIndex: 10 }}>

              {/* Pill Badge */}
              <Animated.View style={{ transform: [{ translateY: badgeY }] }}>
                <Reveal delay={0}>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    paddingHorizontal: 18, paddingVertical: 9, borderRadius: 100,
                    backgroundColor: 'rgba(255, 255, 255, 0.22)',
                    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.4)',
                    ...(isWeb ? { backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } as any : {}),
                  }}>
                    <Sparkles size={14} color="#38BDF8" />
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
                    ...(isWeb ? {
                      textShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
                    } as any : {}),
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
                    color: 'rgba(255, 255, 255, 0.9)',
                    textAlign: 'center',
                    maxWidth: 620,
                    alignSelf: 'center',
                    ...(isWeb ? {
                      textShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
                    } as any : {}),
                  }}>
                    Tự động xây dựng lịch trình cá nhân hóa dựa trên ngân sách thực tế, dữ liệu thời tiết thực và khả năng thích ứng sự cố tức thì.
                  </Text>
                </Reveal>
              </Animated.View>

              {/* Dribbble Standalone Interactive Component: HeroAISearch */}
              <Animated.View style={{ transform: [{ translateY: ctaY }], width: '100%', marginTop: 12 }}>
                <Reveal delay={220}>
                  <HeroAISearch onGenerate={(prompt) => {
                    if (isLoggedIn) {
                      router.push(`${APP_ROUTES.NEW_TRIP}${prompt ? `?prompt=${encodeURIComponent(prompt)}` : ''}` as any);
                    } else {
                      router.push(`${APP_ROUTES.SIGN_UP}${prompt ? `?prompt=${encodeURIComponent(prompt)}` : ''}` as any);
                    }
                  }} />
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
                        style={({ pressed }) => [{
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingHorizontal: 13, paddingVertical: 7, borderRadius: 100,
                          backgroundColor: 'rgba(255, 255, 255, 0.25)',
                          borderWidth: 0.5, borderColor: 'rgba(255, 255, 255, 0.4)',
                          opacity: pressed ? 0.75 : 1,
                          transform: [{ scale: pressed ? 0.95 : 1 }],
                          ...(isWeb ? { backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', cursor: 'pointer' } as any : {}),
                        }]}
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
            <Animated.View style={{ transform: [{ translateY: cardY }], width: '100%', maxWidth: 980, marginTop: isMobile ? 32 : 48, zIndex: 10 }}>
              <Reveal delay={320}>
                <View style={{
                  backgroundColor: T.mockupBg,
                  borderRadius: isMobile ? 20 : 36,
                  borderWidth: isMobile ? 4 : 8,
                  borderColor: T.mockupBorder,
                  padding: isMobile ? 10 : 18,
                  shadowColor: T.cardShadow,
                  shadowOffset: { width: 0, height: 24 },
                  shadowOpacity: 0.25,
                  shadowRadius: 48,
                  elevation: 16,
                }}>
                  {/* Tablet Inner Screen */}
                  <View style={{
                    backgroundColor: T.mockupInnerBg,
                    borderRadius: isMobile ? 14 : 24,
                    padding: isMobile ? 16 : 24,
                    gap: 20,
                    borderWidth: 1,
                    borderColor: T.cardBorder,
                  }}>
                    {/* Tablet Header Tabs */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ fontFamily: F.loraBold, fontSize: 18, color: T.text }}>vivu</Text>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: 'rgba(249, 158, 117, 0.25)', borderWidth: 1, borderColor: T.cardBorder }}>
                            <Text style={{ fontFamily: F.bold, fontSize: 11, color: T.text }}>🤖 AI Chat</Text>
                          </View>
                          {!isMobile && (
                            <>
                              <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: T.statsBg }}>
                                <Text style={{ fontFamily: F.regular, fontSize: 11, color: T.textMuted }}>🗺️ Chuyến đi</Text>
                              </View>
                              <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: T.statsBg }}>
                                <Text style={{ fontFamily: F.regular, fontSize: 11, color: T.textMuted }}>🔍 Khám phá</Text>
                              </View>
                            </>
                          )}
                        </View>
                      </View>
                      <View style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100, backgroundColor: T.statsBg, borderWidth: 0.5, borderColor: T.cardBorder }}>
                        <Text style={{ fontFamily: F.semiBold, fontSize: 11, color: T.text }}>+ Tạo Chuyến Đi</Text>
                      </View>
                    </View>

                    {/* Tablet Main App View */}
                    <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 18, alignItems: 'stretch' }}>
                      
                      {/* Left: AI Companion Orb Box */}
                      <View style={{
                        flex: 1, padding: 24, borderRadius: 20,
                        backgroundColor: T.cardBg,
                        borderWidth: 1, borderColor: T.cardBorder,
                        justifyContent: 'center', gap: 14, alignItems: 'flex-start',
                      }}>
                        <View style={{
                          width: 56, height: 56, borderRadius: 28,
                          backgroundColor: 'rgba(249, 158, 117, 0.3)',
                          alignItems: 'center', justifyContent: 'center',
                          borderWidth: 2, borderColor: T.accent,
                          shadowColor: T.accent, shadowRadius: 16, shadowOpacity: 0.4,
                        }}>
                          <Sparkles size={24} color={T.accent} />
                        </View>
                        <Text style={{ fontFamily: F.loraBold, fontSize: 18, color: T.text, lineHeight: 26 }}>
                          Xin chào! Tôi là Trợ lý ViVu AI đồng hành cùng chuyến đi của bạn.
                        </Text>
                        <Text style={{ fontFamily: F.regular, fontSize: 13, color: T.textMuted, lineHeight: 20 }}>
                          Chỉ cần chọn ngày & ngân sách, AI sẽ lập tức thiết kế lịch trình hoàn chỉnh từ thời tiết đến địa điểm thực tế.
                        </Text>
                      </View>

                      {/* Right: Place Recommendation Cards */}
                      <View style={{ flex: isMobile ? undefined : 1.2, flexDirection: 'row', gap: 12 }}>
                        {/* Place 1 */}
                        <View style={{
                          flex: 1, borderRadius: 16, backgroundColor: T.cardBg,
                          borderWidth: 0.5, borderColor: T.cardBorder, padding: 14, gap: 10,
                        }}>
                          <View style={{ height: 110, borderRadius: 12, backgroundColor: 'rgba(249, 158, 117, 0.15)', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 32 }}>🏛️</Text>
                          </View>
                          <Text style={{ fontFamily: F.bold, fontSize: 13, color: T.text }}>Hà Nội · Phố Cổ</Text>
                          <Text style={{ fontFamily: F.regular, fontSize: 11, color: T.textMuted }}>⭐ 4.9 · 3 ngày 2 đêm</Text>
                        </View>

                        {/* Place 2 */}
                        <View style={{
                          flex: 1, borderRadius: 16, backgroundColor: T.cardBg,
                          borderWidth: 0.5, borderColor: T.cardBorder, padding: 14, gap: 10,
                        }}>
                          <View style={{ height: 110, borderRadius: 12, backgroundColor: 'rgba(139,92,246,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 32 }}>🌊</Text>
                          </View>
                          <Text style={{ fontFamily: F.bold, fontSize: 13, color: T.text }}>Đà Nẵng · Cầu Vàng</Text>
                          <Text style={{ fontFamily: F.regular, fontSize: 11, color: T.textMuted }}>⭐ 4.9 · 4 ngày 3 đêm</Text>
                        </View>
                      </View>

                    </View>
                  </View>
                </View>
              </Reveal>
            </Animated.View>

          </ImageBackground>
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
            <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: T.statsBorder, backgroundColor: T.statsBg }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {stats.map((stat, i) => (
                  <View
                    key={i}
                    style={{
                      width: isMobile ? '50%' : '25%',
                      paddingVertical: isMobile ? 24 : 36,
                      paddingHorizontal: 8,
                      alignItems: 'center',
                      borderRightWidth: isMobile ? (i % 2 === 0 ? 1 : 0) : (i < 3 ? 1 : 0),
                      borderRightColor: T.statsBorder,
                      borderBottomWidth: isMobile && i < 2 ? 1 : 0,
                      borderBottomColor: T.statsBorder,
                    }}
                  >
                    <Text style={{ fontFamily: F.loraBold, fontSize: isMobile ? 32 : 42, color: T.accent, marginBottom: 6 }}>
                      {stat.num}
                    </Text>
                    <Text style={{ fontFamily: F.regular, fontSize: isMobile ? 11 : 12, color: T.textMuted, textAlign: 'center', lineHeight: 18 }}>
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
          style={{
            paddingHorizontal: px, paddingVertical: isMobile ? 56 : 80, gap: isMobile ? 32 : 52,
            backgroundColor: T.bg,
            ...(isWeb ? {
              background: T.howItWorksBg,
            } as any : {}),
          }}
          onLayout={(e) => setHowItWorksSectionY(e.nativeEvent.layout.y)}
        >
          <View style={{ gap: 14 }}>
            <Reveal>
              <View style={{
                alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100,
                backgroundColor: isDarkMode ? 'rgba(249, 158, 117, 0.12)' : 'rgba(224, 122, 95, 0.12)',
                borderWidth: 1, borderColor: isDarkMode ? 'rgba(249, 158, 117, 0.3)' : 'rgba(224, 122, 95, 0.3)',
              }}>
                <Text style={{ fontFamily: F.semiBold, fontSize: 11, color: T.accent, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  Cách hoạt động
                </Text>
              </View>
            </Reveal>
            <Reveal delay={80}>
              <Text style={{ fontFamily: F.loraBold, fontSize: isMobile ? 28 : 38, lineHeight: isMobile ? 38 : 50, color: T.text }}>
                4 bước đơn giản,{'\n'}lịch trình hoàn hảo
              </Text>
            </Reveal>
            <Reveal delay={140}>
              <Text style={{ fontFamily: F.regular, fontSize: 14, lineHeight: 24, color: T.textMuted, maxWidth: 420 }}>
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
          style={{
            paddingHorizontal: px, paddingVertical: isMobile ? 56 : 80, gap: isMobile ? 32 : 52,
            backgroundColor: T.bg,
            ...(isWeb ? {
              background: T.featuresBg,
            } as any : {}),
          }}
          onLayout={(e) => setFeaturesSectionY(e.nativeEvent.layout.y)}
        >
          <View style={{ gap: 14 }}>
            <Reveal>
              <View style={{
                alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100,
                backgroundColor: isDarkMode ? 'rgba(249, 158, 117, 0.12)' : 'rgba(224, 122, 95, 0.12)',
                borderWidth: 1, borderColor: isDarkMode ? 'rgba(249, 158, 117, 0.3)' : 'rgba(224, 122, 95, 0.3)',
              }}>
                <Text style={{ fontFamily: F.semiBold, fontSize: 11, color: T.accent, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  Tính năng
                </Text>
              </View>
            </Reveal>
            <Reveal delay={80}>
              <Text style={{ fontFamily: F.loraBold, fontSize: isMobile ? 28 : 38, lineHeight: isMobile ? 38 : 50, color: T.text }}>
                Giải quyết mọi nỗi lo{'\n'}khi xê dịch
              </Text>
            </Reveal>
            <Reveal delay={140}>
              <Text style={{ fontFamily: F.regular, fontSize: 14, lineHeight: 24, color: T.textMuted, maxWidth: 460 }}>
                Được thiết kế xoay quanh nhu cầu thực tế của du khách Việt Nam, xử lý cả phát sinh ngoài ý muốn.
              </Text>
            </Reveal>
          </View>

          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
            {FEATURES.map((feat, i) => (
              <Reveal key={i} delay={i * 100} style={isMobile ? undefined : { flex: 1 }}>
                <View style={{
                  flex: isMobile ? undefined : 1,
                  backgroundColor: T.cardBg, borderWidth: 1, borderColor: T.cardBorder,
                  borderRadius: 20, padding: 28, gap: 16,
                  shadowColor: T.cardShadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12,
                  ...(isWeb ? { backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } as any : {}),
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontFamily: F.regular, fontSize: 11, color: T.textSoft }}>{feat.num}</Text>
                    <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7, backgroundColor: isDarkMode ? 'rgba(249, 158, 117, 0.15)' : 'rgba(224, 122, 95, 0.12)' }}>
                      <Text style={{ fontFamily: F.regular, fontSize: 9.5, color: T.accent, letterSpacing: 0.3 }}>
                        {feat.tag}
                      </Text>
                    </View>
                  </View>
                  <View style={{ width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(224, 122, 95, 0.1)' }}>
                    {feat.icon}
                  </View>
                  <Text style={{ fontFamily: F.bold, fontSize: 17, lineHeight: 24, color: T.text }}>{feat.title}</Text>
                  <Text style={{ fontFamily: F.regular, fontSize: 13, lineHeight: 22, color: T.textMuted }}>{feat.desc}</Text>
                </View>
              </Reveal>
            ))}
          </View>
        </View>

        {/* ── LOCALIZED BENTO GRID SECTION (KHO ĐỊA ĐIỂM NGÁCH) ─────────────── */}
        <View style={{
          paddingHorizontal: px,
          paddingVertical: isMobile ? 48 : 72,
          backgroundColor: isDarkMode ? '#0A0A0C' : '#F9FAFB',
        }}>
          <Reveal>
            <LocalizedBentoGrid />
          </Reveal>
        </View>

        {/* ── TRIP WORKSPACE SPLIT-VIEW SECTION (WORKSPACE SPLIT-VIEW) ────── */}
        <View style={{
          paddingHorizontal: px,
          paddingVertical: isMobile ? 48 : 72,
          backgroundColor: isDarkMode ? '#050507' : '#FFFFFF',
        }}>
          <Reveal>
            <TripWorkspaceSplitView />
          </Reveal>
        </View>

        {/* ── PRICING SECTION (COMING SOON / ROADMAP) ───────────────────────── */}
        <View
          style={{
            paddingHorizontal: px, paddingVertical: isMobile ? 56 : 80, gap: isMobile ? 32 : 52,
            backgroundColor: T.bg,
            ...(isWeb ? {
              background: T.pricingBg,
            } as any : {}),
          }}
          onLayout={(e) => setPricingSectionY(e.nativeEvent.layout.y)}
        >
          <View style={{ gap: 14 }}>
            <Reveal>
              <View style={{
                alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100,
                backgroundColor: isDarkMode ? 'rgba(249, 158, 117, 0.12)' : 'rgba(224, 122, 95, 0.12)',
                borderWidth: 1, borderColor: isDarkMode ? 'rgba(249, 158, 117, 0.3)' : 'rgba(224, 122, 95, 0.3)',
              }}>
                <Text style={{ fontFamily: F.semiBold, fontSize: 11, color: T.accent, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  Bảng giá & Định hướng
                </Text>
              </View>
            </Reveal>
            <Reveal delay={80}>
              <Text style={{ fontFamily: F.loraBold, fontSize: isMobile ? 28 : 38, lineHeight: isMobile ? 38 : 50, color: T.text }}>
                Kế hoạch phát triển{'\n'}và Thương mại hóa
              </Text>
            </Reveal>
            <Reveal delay={140}>
              <Text style={{ fontFamily: F.regular, fontSize: 14, lineHeight: 24, color: T.textMuted, maxWidth: 500 }}>
                Dựa trên chiến lược Freemium và kết quả khảo sát người dùng. Các tính năng cao cấp dưới đây nằm trong định hướng phát triển và thương mại hóa trong tương lai của ViVu Planner.
              </Text>
            </Reveal>
          </View>

          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 16 }}>
            {PRICING_PACKAGES.map((pkg, i) => (
              <Reveal key={i} delay={i * 100} style={isMobile ? undefined : { flex: 1 }}>
                <View style={{
                  flex: isMobile ? undefined : 1,
                  backgroundColor: pkg.isPremium ? (isDarkMode ? 'rgba(249, 158, 117, 0.08)' : '#FFFBF8') : T.cardBg,
                  borderWidth: pkg.isPremium ? 2 : 1,
                  borderColor: pkg.isPremium ? T.accent : T.cardBorder,
                  borderRadius: 20,
                  padding: 28,
                  gap: 16,
                  shadowColor: T.cardShadow, shadowOffset: { width: 0, height: pkg.isPremium ? 8 : 4 }, shadowOpacity: 0.1, shadowRadius: 16,
                  ...(isWeb ? { backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } as any : {}),
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(224, 122, 95, 0.12)' }}>
                      <Text style={{ fontFamily: F.bold, fontSize: 10, color: T.text, letterSpacing: 0.5 }}>
                        {pkg.tag}
                      </Text>
                    </View>
                    {pkg.isPremium && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Star size={12} color={T.accent} fill={T.accent} />
                        <Text style={{ fontFamily: F.bold, fontSize: 10, color: T.accent, textTransform: 'uppercase' }}>Phổ biến nhất</Text>
                      </View>
                    )}
                  </View>

                  <View style={{ gap: 4 }}>
                    <Text style={{ fontFamily: F.bold, fontSize: 18, color: T.text }}>{pkg.title}</Text>
                    <Text style={{ fontFamily: F.regular, fontSize: 12, color: T.textMuted, lineHeight: 18 }}>
                      {pkg.desc}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.cardBorder }}>
                    <Text style={{ fontFamily: F.loraBold, fontSize: 26, color: T.accent }}>
                      {getPlanPrice(pkg.id, pkg.price)}
                    </Text>
                    <Text style={{ fontFamily: F.regular, fontSize: 12, color: T.textSoft }}>
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
                          backgroundColor: feat.enabled ? (isDarkMode ? 'rgba(249, 158, 117, 0.2)' : 'rgba(224, 122, 95, 0.15)') : 'rgba(239, 68, 68, 0.15)', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          marginTop: 3, 
                          flexShrink: 0 
                        }}>
                          {feat.enabled ? (
                            <Check size={8} color={T.accent} strokeWidth={4} />
                          ) : (
                            <Lock size={8} color="#EF4444" strokeWidth={3} />
                          )}
                        </View>
                        <Text style={{ 
                          fontFamily: F.regular, 
                          fontSize: 12, 
                          lineHeight: 18, 
                          color: feat.enabled ? T.text : T.textSoft, 
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
        <View style={{
          paddingHorizontal: px, paddingVertical: isMobile ? 56 : 80, gap: isMobile ? 32 : 52,
          backgroundColor: T.bg,
          ...(isWeb ? {
            background: T.testimonialsBg,
          } as any : {}),
        }}>
          <View style={{ gap: 14 }}>
            <Reveal>
              <View style={{ alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: isDarkMode ? 'rgba(249, 158, 117, 0.12)' : 'rgba(224, 122, 95, 0.12)', borderWidth: 1, borderColor: isDarkMode ? 'rgba(249, 158, 117, 0.3)' : 'rgba(224, 122, 95, 0.3)' }}>
                <Text style={{ fontFamily: F.semiBold, fontSize: 11, color: T.accent, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  Đánh giá
                </Text>
              </View>
            </Reveal>
            <Reveal delay={80}>
              <Text style={{ fontFamily: F.loraBold, fontSize: isMobile ? 28 : 38, lineHeight: isMobile ? 38 : 50, color: T.text }}>
                Khách hàng nói gì{'\n'}về ViVu Planner?
              </Text>
            </Reveal>
          </View>

          <View style={{ flexDirection: isMobile ? 'column' : 'row', gap: 14 }}>
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={i} delay={i * 90} style={isMobile ? undefined : { flex: 1 }}>
                <View style={{
                  flex: isMobile ? undefined : 1,
                  backgroundColor: T.cardBg,
                  borderWidth: 1, borderColor: T.cardBorder,
                  borderRadius: 20, padding: 24, gap: 16,
                  shadowColor: T.cardShadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12,
                  ...(isWeb ? { backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } as any : {}),
                }}>
                  <View style={{ flexDirection: 'row', gap: 3 }}>
                    {[...Array(5)].map((_, si) => (
                      <Star key={si} size={13} color={T.accent} fill={T.accent} />
                    ))}
                  </View>
                  <Text style={{ fontFamily: F.loraRegular, fontSize: 14, lineHeight: 26, color: T.text, flex: 1 }}>
                    "{t.quote}"
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(224, 122, 95, 0.15)', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontFamily: F.bold, fontSize: 12, color: T.text }}>{t.initial}</Text>
                      </View>
                      <View>
                        <Text style={{ fontFamily: F.bold, fontSize: 13, color: T.text }}>{t.name}</Text>
                        <Text style={{ fontFamily: F.regular, fontSize: 11, color: T.textSoft, marginTop: 1 }}>{t.location}</Text>
                      </View>
                    </View>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(224, 122, 95, 0.1)', borderWidth: 1, borderColor: T.cardBorder }}>
                      <Text style={{ fontFamily: F.regular, fontSize: 10, color: T.textMuted }}>{t.tag}</Text>
                    </View>
                  </View>
                </View>
              </Reveal>
            ))}
          </View>

          {/* Bottom Ambient Sunset Glow Banner Box */}
          <Reveal delay={200}>
            <View style={{
              borderRadius: 24, padding: isMobile ? 24 : 36, gap: 24,
              backgroundColor: T.cardBg,
              borderWidth: 1, borderColor: T.ctaBoxBorder,
              shadowColor: T.cardShadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20,
              ...(isWeb ? {
                background: T.ctaBoxBg,
                backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              } as any : {}),
            }}>
              <View style={{ gap: 14 }}>
                {[
                  'Đi một mình, đôi, gia đình hoặc nhóm bạn',
                  'Tự động cập nhật theo thời tiết thực tế',
                  'Ngân sách luôn trong tầm kiểm soát',
                  'Địa điểm từ Google Places, không bịa đặt',
                ].map((item, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255, 255, 255, 0.2)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Check size={11} color="#FFFFFF" strokeWidth={3} />
                    </View>
                    <Text style={{ fontFamily: F.regular, fontSize: 14, color: '#FFFFFF', flex: 1 }}>{item}</Text>
                  </View>
                ))}
              </View>

              <Pressable
                onPress={() => router.push(isLoggedIn ? (dashPath as any) : (APP_ROUTES.SIGN_UP as any))}
                style={({ pressed }) => [{
                  alignItems: 'center', paddingVertical: 18, borderRadius: 100,
                  backgroundColor: T.ctaButtonBg,
                  flexDirection: 'row', justifyContent: 'center', gap: 8,
                  opacity: pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                  shadowColor: T.ctaButtonBg, shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.35, shadowRadius: 16,
                  ...(isWeb ? { cursor: 'pointer', transition: 'all 0.15s ease' } as any : {}),
                }]}
              >
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: T.ctaButtonText }}>
                  {isLoggedIn ? 'Đến bảng điều khiển' : 'Bắt đầu miễn phí ngay hôm nay'}
                </Text>
                <ArrowRight size={16} color={T.ctaButtonText} />
              </Pressable>
            </View>
          </Reveal>
        </View>

        {/* ── FOOTER ────────────────────────────────────────────────────────── */}
        <View style={{
          backgroundColor: T.footerBg, borderTopWidth: 1, borderTopColor: T.footerBorder,
          paddingHorizontal: px, paddingTop: isMobile ? 36 : 52, paddingBottom: isMobile ? 24 : 36,
          overflow: 'hidden',
        }}>
          <View style={{
            flexDirection: isMobile ? 'column' : 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: isMobile ? 24 : 40,
            marginBottom: 32,
          }}>
            <View style={{ gap: 12, maxWidth: 380 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: 'rgba(255, 255, 255, 0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.25)' }}>
                  <Compass size={16} color="#FFFFFF" />
                </View>
                <Text style={{ fontFamily: F.loraBold, fontSize: 18, color: '#FFFFFF' }}>ViVu Planner</Text>
              </View>
              <Text style={{ fontFamily: F.regular, fontSize: 13, lineHeight: 21, color: 'rgba(255, 255, 255, 0.75)' }}>
                Lên kế hoạch du lịch Việt Nam thông minh hơn với sức mạnh của AI và dữ liệu thực.
              </Text>
            </View>

            {!isMobile && (
              <View style={{ flexDirection: 'row', gap: 24, alignItems: 'center' }}>
                {['Tính năng', 'Cách dùng', 'Thành phố hỗ trợ'].map((l) => (
                  <Text key={l} style={{ fontFamily: F.semiBold, fontSize: 13, color: 'rgba(255, 255, 255, 0.8)' }}>{l}</Text>
                ))}
              </View>
            )}
          </View>

          <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.12)', paddingTop: 20 }}>
            <Text style={{ fontFamily: F.regular, fontSize: 12, color: 'rgba(255, 255, 255, 0.55)' }}>
              © 2026 ViVu Planner · Dự án du lịch thông minh Việt Nam
            </Text>
          </View>

          {/* Huge Brand Watermark at Bottom (Matching Touri reference) */}
          <Text style={{
            fontFamily: F.loraBold,
            fontSize: isMobile ? 48 : 100,
            color: 'rgba(255, 255, 255, 0.08)',
            letterSpacing: isMobile ? 4 : 10,
            textAlign: 'center',
            marginTop: 28,
            marginBottom: -20,
            userSelect: 'none',
          } as any}>
            VIVU PLANNER
          </Text>
        </View>

      </Animated.ScrollView>

      {/* ── BACK TO TOP ──────────────────────────────────────────────────────── */}
      {showBackToTop && (
        <Pressable
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
          style={{
            position: 'absolute', bottom: 24, right: 24,
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: T.chipBg,
            borderWidth: 1, borderColor: T.chipBorder,
            alignItems: 'center', justifyContent: 'center',
            shadowColor: T.cardShadow, shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25, shadowRadius: 12, elevation: 8,
            ...(isWeb ? { backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } as any : {}),
          }}
        >
          <ChevronUp size={20} color={T.text} />
        </Pressable>
      )}

    </View>
  );
}
