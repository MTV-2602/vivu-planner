import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Alert, Platform, ActivityIndicator, Image, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Compass, Plus, LogOut, Calendar, MapPin, Wallet, DollarSign,
  RefreshCw, User, Shield, WifiOff, Crown, Trash2, Sparkles, X,
  ArrowRight, Zap, CheckCircle, MessageSquare,
} from 'lucide-react-native';
import { useAuth } from '../../../hooks/useAuth';
import { useChatbot } from '../../../context/ChatbotContext';
import { api } from '../../../lib/api';
import { supabase } from '../../../lib/supabase';
import { getCache, setCache, clearCache } from '../../../lib/cache';
import Reveal from '../../../components/Reveal';
import SystemClock from '../../../components/SystemClock';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND_COLORS, APP_ROUTES } from '../../../constants';
import PremiumModal from '../../../components/PremiumModal';
import ConfirmModal from '../../../components/ConfirmModal';
import ProfileModal from '../../../components/ProfileModal';
import { usePaymentStatus } from '../../../hooks/usePaymentStatus';
import { formatHeaderChip } from '../../../lib/plans';

interface Trip {
  id: string;
  title: string;
  destination_city: string;
  start_date: string;
  end_date: string;
  budget_total: number;
  budget_currency: string;
  traveler_count: number;
  traveler_type: string;
  status: string;
  preferences?: any;
  is_shared?: boolean;
  member_count?: number;
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  if (dateStr.includes('T')) {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(new Date(dateStr));
  }
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

function getTripStatusInfo(startDateStr: string, endDateStr: string, dbStatus: string) {
  // Use Vietnam timezone (UTC+7) for accurate date comparison
  const nowUtc = new Date();
  const vietnamTime = new Date(nowUtc.getTime() + 7 * 60 * 60 * 1000);
  const todayStr = vietnamTime.toISOString().split('T')[0];

  if (dbStatus === 'completed' || (endDateStr && endDateStr < todayStr)) {
    return {
      label: 'Hoàn thành',
      bgClass: 'bg-brand-bgAlt border border-brand-line/40',
      textClass: 'text-brand-textSoft',
      webBg: '#F1F5F9',
      webBorder: '#E2E8F0',
      webColor: '#64748B',
    };
  }
  
  if (startDateStr && startDateStr <= todayStr && endDateStr && todayStr <= endDateStr) {
    return {
      label: 'Đang diễn ra',
      bgClass: 'bg-emerald-100 border border-emerald-300/40',
      textClass: 'text-emerald-700',
      webBg: '#E6F4EA',
      webBorder: '#CEEAD6',
      webColor: '#137333',
    };
  }

  return {
    label: 'Đang lập kế hoạch',
    bgClass: 'bg-brand-gold/25 border border-brand-gold/45',
    textClass: 'text-brand-primaryStrong',
    webBg: '#FFF3E0',
    webBorder: '#FFE0B2',
    webColor: '#D97706',
  };
}

export default function Dashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile, isAdmin, signOut } = useAuth();
  const { openChatbot } = useChatbot();
  const userEmail = user?.email || '';
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [cachedTrips, setCachedTrips] = useState<Trip[] | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
  } | null>(null);

  useEffect(() => {
    if (isAdmin) {
      router.replace(APP_ROUTES.ADMIN as any);
    }
  }, [isAdmin]);

  useEffect(() => {
    getCache<Trip[]>('trips').then(data => {
      if (data) { setCachedTrips(data); setFromCache(true); }
    });
  }, []);

  const [paymentSuccessMsg, setPaymentSuccessMsg] = useState('');


  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.search) {
      const search = window.location.search;
      if (search && (search.includes('payment=success') || search.includes('resultCode=0') || search.includes('code=00'))) {
        // Clean the URL immediately so user doesn't see ugly query params
        if (typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
          window.history.replaceState({}, (typeof document !== 'undefined' ? document.title : ''), window.location?.pathname || '');
        }
        api.get(`/payment/verify-return${search}`).then(() => {
            setPaymentSuccessMsg('🎉 Thanh toán thành công! Gói dịch vụ đã được kích hoạt thành công, mở khóa toàn bộ tính năng Bản đồ & Tải PDF cho tài khoản của bạn.');
            refetchStatus();
        }).catch(() => {});
      }
    }
  }, []);

  const { data: trips, isLoading, isError, refetch } = useQuery<Trip[]>({
    queryKey: ['trips'],
    queryFn: async () => {
      const res = await api.get('/trips');
      await setCache('trips', res.data);
      setFromCache(false);
      return res.data;
    },
    placeholderData: cachedTrips ?? undefined,
    enabled: !!user?.id,
    retry: 1,
  });

  const { paymentStatus, refetch: refetchStatus } = usePaymentStatus();

  useEffect(() => {
    if (paymentStatus?.dbWarning) {
      if (Platform.OS === 'web') {
        alert('⚠️ LỖI CƠ SỞ DỮ LIỆU SUPABASE:\n\n' + paymentStatus.dbWarning);
      } else {
        Alert.alert(
          '⚠️ Lỗi Cơ Sở Dữ Liệu (Supabase)',
          paymentStatus.dbWarning,
          [{ text: 'Đồng ý' }]
        );
      }
    }
  }, [paymentStatus?.dbWarning]);

  const deleteMutation = useMutation({
    mutationFn: async (tripId: string) => {
      await api.delete(`/trips/${tripId}`);
    },
    onSuccess: () => {
      refetch();
      refetchStatus();
    },
    onError: (err: any) => Alert.alert('Lỗi xóa chuyến đi', err.response?.data?.error || err.message),
  });

  const handleDeleteTrip = (tripId: string, title: string) => {
    setConfirmModal({
      visible: true,
      title: 'Xác nhận xóa chuyến đi',
      message: `Bạn có chắc chắn muốn xóa chuyến đi "${title}"? Hành động này không thể hoàn tác.`,
      isDestructive: true,
      onConfirm: () => {
        deleteMutation.mutate(tripId);
        setConfirmModal(null);
      }
    });
  };

  const handleLogout = async () => {
    await signOut();
    await clearCache();
    router.replace(APP_ROUTES.SIGN_IN as any);
  };

  if (isAdmin) {
    return (
      <View className="flex-1 bg-brand-bg items-center justify-center p-6 gap-4">
        <ActivityIndicator size="large" color={BRAND_COLORS.primary} />
        <Text className="text-base font-bold text-brand-text">Tài khoản Quản trị viên (Admin)</Text>
        <Text className="text-xs text-brand-textSoft text-center max-w-sm">
          Quản trị viên chuyên tâm quản lý hệ thống và không tạo chuyến đi cá nhân. Đang chuyển hướng về Bảng Quản Trị...
        </Text>
        <Pressable
          onPress={() => router.replace(APP_ROUTES.ADMIN as any)}
          className="mt-2 px-5 py-2.5 rounded-xl bg-brand-primary flex-row items-center gap-2"
          style={{ cursor: 'pointer' as any }}
        >
          <Text className="text-white text-xs font-bold">Vào Bảng Quản Trị ngay →</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Admin Quick Banner */}
      {isAdmin && (
        <View className="bg-brand-primary px-6 py-2.5 flex-row items-center justify-between border-b border-brand-primaryStrong">
          <View className="flex-row items-center gap-2">
            <Shield size={15} color="#fff" />
            <Text className="text-white text-xs font-bold">
              ⚡ Bạn đang đăng nhập với tư cách Quản Trị Viên (Admin)
            </Text>
          </View>
          <Pressable
            onPress={() => router.push(APP_ROUTES.ADMIN as any)}
            className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg"
            style={{ cursor: 'pointer' as any }}
          >
            <Text className="text-white text-xs font-extrabold">Vào Trang Quản Trị Hệ Thống →</Text>
          </Pressable>
        </View>
      )}
      <ScrollView
        className="flex-1"
        style={Platform.OS === 'web' ? { backgroundColor: '#F8F9F8' } : { backgroundColor: BRAND_COLORS.bg }}
        contentContainerStyle={{ flexGrow: 1 }}
      >
      {/* Navbar */}
      <View
        className={Platform.OS === 'web' ? 'px-3 py-2.5 sm:px-6 sm:py-4 shadow-sm' : 'bg-brand-bg border-b border-brand-line px-3 py-2.5 sm:px-6 sm:py-4'}
        style={{
          backgroundColor: Platform.OS === 'web' ? '#0E3B32' : undefined,
          borderBottomWidth: 1,
          borderBottomColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.08)' : undefined,
          paddingTop: isMobile ? Math.max(insets.top, 12) : undefined,
        }}
      >
        {isMobile ? (
          /* Single-row Navbar trên Mobile */
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* CỤM BÊN TRÁI: Logo ViVu Planner */}
            <Pressable
              onPress={() => router.push(APP_ROUTES.LANDING as any)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 }}
            >
              <Compass size={20} color={Platform.OS === 'web' ? '#FFFFFF' : BRAND_COLORS.primary} />
              <Text
                style={{
                  fontFamily: 'Lora_700Bold',
                  fontWeight: 'bold',
                  fontSize: 15,
                  color: Platform.OS === 'web' ? '#FFFFFF' : BRAND_COLORS.primary,
                }}
              >
                ViVu Planner
              </Text>
            </Pressable>

            {/* CỤM BÊN PHẢI: Bảng tin + Pro + Profile + Đăng xuất */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {/* Nút 🌟 Bảng Tin */}
              <Pressable
                testID="nav-link-feed"
                onPress={() => router.push((APP_ROUTES.FEED || '/(app)/bang-tin') as any)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                  paddingHorizontal: 6,
                  paddingVertical: 4,
                  borderRadius: 10,
                  backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.12)' : '#FFFFFF',
                  borderWidth: 1,
                  borderColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.2)' : '#E8DECC',
                  cursor: 'pointer' as any,
                }}
              >
                <Text style={{ fontSize: 10.5 }}>🌟</Text>
                <Text style={{ color: Platform.OS === 'web' ? '#FFFFFF' : BRAND_COLORS.primary, fontSize: 10.5, fontWeight: '700' }}>
                  Bảng tin
                </Text>
              </Pressable>

              {/* Nút Pro / Nâng cấp */}
              {(() => {
                const chip = formatHeaderChip(paymentStatus);
                const isProUser = !!paymentStatus?.isPremium || (paymentStatus?.pro_credits || 0) > 0 || (paymentStatus?.monthly_credits || 0) > 0;
                const remaining = paymentStatus?.remainingTrips ?? 0;
                let mobileText = '✨ Free';
                if (remaining > 0) {
                  if (remaining >= 1000) {
                    mobileText = `👑 ${(remaining / 1000).toFixed(remaining % 1000 === 0 ? 0 : 1)}k`;
                  } else {
                    mobileText = `👑 ${remaining}`;
                  }
                } else if (isProUser) {
                  mobileText = '👑 Pro';
                }

                return (
                  <Pressable
                    onPress={() => setShowPremiumModal(true)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 2,
                      paddingHorizontal: 6,
                      paddingVertical: 4,
                      borderRadius: 10,
                      backgroundColor: chip.color,
                      cursor: 'pointer' as any,
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '800' }}>
                      {mobileText}
                    </Text>
                  </Pressable>
                );
              })()}

              {isAdmin && (
                <Pressable
                  onPress={() => router.push(APP_ROUTES.ADMIN as any)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 2,
                    paddingHorizontal: 5,
                    paddingVertical: 4,
                    borderRadius: 8,
                    backgroundColor: 'rgba(217, 119, 6, 0.1)',
                  }}
                >
                  <Shield size={10} color={BRAND_COLORS.accent} />
                  <Text style={{ color: BRAND_COLORS.accent, fontSize: 9.5, fontWeight: '700' }}>Admin</Text>
                </Pressable>
              )}

              {/* Nút Profile / Avatar */}
              <Pressable
                onPress={() => router.push('/(app)/profile' as any)}
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer' as any,
                }}
              >
                {profile?.avatar_url ? (
                  <Image
                    source={{ uri: profile.avatar_url }}
                    style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: Platform.OS === 'web' ? '#FFFFFF' : BRAND_COLORS.primary }}
                  />
                ) : (
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.2)' : 'rgba(31,111,84,0.15)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.4)' : 'rgba(31,111,84,0.3)',
                    }}
                  >
                    <User size={12} color={Platform.OS === 'web' ? '#FFFFFF' : BRAND_COLORS.primary} />
                  </View>
                )}
              </Pressable>

              {/* Nút Đăng xuất (Thoát) */}
              <Pressable
                onPress={handleLogout}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 7,
                  backgroundColor: Platform.OS === 'web' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.1)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer' as any,
                }}
              >
                <LogOut size={12} color={Platform.OS === 'web' ? '#FCA5A5' : BRAND_COLORS.danger} />
              </Pressable>
            </View>
          </View>
        ) : (
          <View className="flex-row justify-between items-center">
            <View className="flex-row items-center gap-4">
              <Pressable onPress={() => router.push(APP_ROUTES.LANDING as any)} className="flex-row items-center gap-2">
                <Compass size={28} color={Platform.OS === 'web' ? '#FFFFFF' : BRAND_COLORS.primary} />
                <Text
                  className="font-display font-bold text-xl"
                  style={{ color: Platform.OS === 'web' ? '#FFFFFF' : BRAND_COLORS.primary }}
                >
                  ViVu Planner
                </Text>
              </Pressable>

              <Pressable
                testID="nav-link-feed"
                onPress={() => router.push((APP_ROUTES.FEED || '/(app)/bang-tin') as any)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 10,
                  backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.12)' : '#FAF5EA',
                  borderWidth: 1,
                  borderColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.2)' : '#E8DECC',
                  cursor: 'pointer' as any,
                }}
              >
                <Text style={{ fontSize: 13 }}>🌟</Text>
                <Text style={{ color: Platform.OS === 'web' ? '#FFFFFF' : BRAND_COLORS.primary, fontSize: 12, fontWeight: '800' }}>
                  Bảng Tin Cộng Đồng
                </Text>
              </Pressable>
            </View>

            <View className="flex-row items-center gap-2">
              <SystemClock variant={Platform.OS === 'web' ? 'light' : 'dark'} />
              {(() => {
                const chip = formatHeaderChip(paymentStatus);
                const isProUser = !!paymentStatus?.isPremium || (paymentStatus?.pro_credits || 0) > 0 || (paymentStatus?.monthly_credits || 0) > 0;

                return (
                  <Pressable
                    onPress={() => setShowPremiumModal(true)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 14,
                      paddingVertical: 7,
                      borderRadius: 20,
                      backgroundColor: chip.color,
                      cursor: 'pointer' as any,
                    }}
                  >
                    {isProUser ? (
                      <Crown size={14} color="#fff" />
                    ) : (
                      <Sparkles size={14} color="#fff" />
                    )}
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
                      {chip.text}
                    </Text>
                  </Pressable>
                );
              })()}
              {isAdmin && (
                <Pressable
                  onPress={() => router.push(APP_ROUTES.ADMIN as any)}
                  className="flex-row items-center gap-1 px-3 py-2 rounded-lg bg-brand-accent/10"
                >
                  <Shield size={14} color={BRAND_COLORS.accent} />
                  <Text className="text-brand-accent text-xs font-bold">Quản trị</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => router.push('/(app)/profile' as any)}
                className={`flex-row items-center gap-2 px-3 py-1.5 rounded-full border ${Platform.OS === 'web' ? 'border-white/20 bg-white/10 hover:border-white/40' : 'border-brand-line bg-brand-bgAlt/50 hover:border-brand-primary'}`}
                style={{ cursor: 'pointer' as any }}
              >
                {profile?.avatar_url ? (
                  <Image
                    source={{ uri: profile.avatar_url }}
                    style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: Platform.OS === 'web' ? '#FFFFFF' : BRAND_COLORS.primary }}
                  />
                ) : (
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.2)' : 'rgba(31,111,84,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                    <User size={12} color={Platform.OS === 'web' ? '#FFFFFF' : BRAND_COLORS.primary} />
                  </View>
                )}
                <Text className={`${Platform.OS === 'web' ? 'text-white' : 'text-brand-textSoft'} text-xs font-semibold`} numberOfLines={1}>
                  {profile?.full_name || userEmail}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleLogout}
                className={`flex-row items-center gap-1 px-3 py-2 rounded-lg ${Platform.OS === 'web' ? 'bg-red-500/20 border border-red-500/30' : 'bg-brand-danger/10'}`}
              >
                <LogOut size={14} color={Platform.OS === 'web' ? '#FCA5A5' : BRAND_COLORS.danger} />
                <Text className={`${Platform.OS === 'web' ? 'text-red-200' : 'text-brand-danger'} text-xs font-bold`}>Đăng xuất</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* Payment Success Banner */}
      {paymentSuccessMsg ? (
        <View style={{ backgroundColor: '#D1FAE5', borderColor: '#059669', borderWidth: 1.5, borderRadius: 16, padding: 16, marginHorizontal: 24, marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: '#065F46', fontWeight: '700', flex: 1, fontSize: 14 }}>
            {paymentSuccessMsg}
          </Text>
          <Pressable onPress={() => setPaymentSuccessMsg('')} style={{ padding: 4 }}>
            <X size={18} color="#065F46" />
          </Pressable>
        </View>
      ) : null}

      {/* Main content */}
      <View style={{ paddingHorizontal: isMobile ? 12 : 24, paddingVertical: isMobile ? 20 : 36, gap: isMobile ? 20 : 32 }}>
        {/* Page header */}
        <View className="flex-row justify-between items-start flex-wrap gap-4">
          <View className="gap-1">
            <Text
              className="font-display font-extrabold text-2xl sm:text-3xl"
              style={{ color: Platform.OS === 'web' ? '#0E3B32' : '#1E293B' }}
            >
              Hành Trình Của Bạn
            </Text>
            <Text
              className="text-xs sm:text-sm"
              style={{ color: Platform.OS === 'web' ? '#5A6E65' : '#64748B' }}
            >
              Quản lý và tạo lịch trình du lịch cá nhân hóa bằng AI
            </Text>
          </View>

          <View className="flex-row gap-3 flex-wrap">
            <Pressable
              onPress={() => router.push(APP_ROUTES.NEW_TRIP as any)}
              className="flex-row items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 rounded-xl"
              style={{
                backgroundColor: Platform.OS === 'web' ? '#0E3B32' : BRAND_COLORS.accent,
                boxShadow: Platform.OS === 'web' ? ('0 4px 14px rgba(14,59,50,0.25)' as any) : undefined,
                cursor: 'pointer' as any,
              }}
            >
              <Plus size={16} color="white" />
              <Text className="text-white font-bold text-xs sm:text-sm">Tạo chuyến đi mới</Text>
            </Pressable>
          </View>
        </View>

        {/* Offline cache indicator */}
        {fromCache && !isLoading && (
          <View className="flex-row items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-gold/10 border border-brand-gold/30 self-start">
            <WifiOff size={14} color={BRAND_COLORS.gold} />
            <Text className="text-xs font-semibold" style={{ color: BRAND_COLORS.gold }}>
              Hiển thị dữ liệu đã lưu — đang kết nối lại...
            </Text>
          </View>
        )}

        {/* Trip list */}
        {isLoading && !cachedTrips ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: isMobile ? 10 : 20 }}>
            {[1, 2, 3, 4].map(i => (
              <View
                key={i}
                className="rounded-2xl h-48"
                style={{
                  width: isMobile ? '48.5%' : 320,
                  backgroundColor: Platform.OS === 'web' ? '#FFFFFF' : undefined,
                  borderWidth: 1,
                  borderColor: Platform.OS === 'web' ? 'rgba(14,59,50,0.08)' : undefined,
                }}
              />
            ))}
          </View>
        ) : isError && !cachedTrips ? (
          <View className="p-8 rounded-2xl border border-brand-danger/30 bg-brand-danger/5 items-center gap-4">
            <Text className="text-brand-danger font-semibold">Lỗi tải danh sách chuyến đi</Text>
            <Pressable
              onPress={() => refetch()}
              className="flex-row items-center gap-1.5 bg-brand-primary px-4 py-2 rounded-lg"
            >
              <RefreshCw size={14} color="white" />
              <Text className="text-white text-xs font-bold">Thử lại</Text>
            </Pressable>
          </View>
        ) : !trips || trips.length === 0 ? (
          <Reveal>
            <View
              className={`rounded-3xl p-8 md:p-12 items-center text-center gap-6 ${
                Platform.OS === 'web'
                  ? 'bg-white border border-[#E5EAE7] shadow-sm'
                  : 'bg-brand-bgAlt border border-brand-line/60 shadow-sm'
              }`}
              style={
                Platform.OS === 'web'
                  ? ({ boxShadow: '0 4px 20px rgba(14, 59, 50, 0.05)' } as any)
                  : undefined
              }
            >
              {/* Compass AI Icon */}
              <View
                className="w-16 h-16 rounded-3xl items-center justify-center border shadow-sm"
                style={{
                  backgroundColor: Platform.OS === 'web' ? 'rgba(14, 59, 50, 0.08)' : 'rgba(31,111,84,0.1)',
                  borderColor: Platform.OS === 'web' ? 'rgba(14, 59, 50, 0.2)' : 'rgba(31,111,84,0.2)',
                }}
              >
                <Compass size={32} color={Platform.OS === 'web' ? '#0E3B32' : BRAND_COLORS.primary} />
              </View>

              <View className="items-center gap-2 max-w-xl">
                <View
                  className="flex-row items-center gap-1.5 px-3 py-1 rounded-full border"
                  style={{
                    backgroundColor: Platform.OS === 'web' ? 'rgba(14, 59, 50, 0.08)' : 'rgba(31,111,84,0.1)',
                    borderColor: Platform.OS === 'web' ? 'rgba(14, 59, 50, 0.2)' : 'rgba(31,111,84,0.2)',
                  }}
                >
                  <Sparkles size={12} color={Platform.OS === 'web' ? '#0E3B32' : BRAND_COLORS.primary} />
                  <Text
                    className="font-bold text-[11px] uppercase tracking-wider"
                    style={{ color: Platform.OS === 'web' ? '#0E3B32' : BRAND_COLORS.primary }}
                  >
                    Trợ Lý Du Lịch AI Thông Minh
                  </Text>
                </View>

                <Text
                  className="font-display font-black text-2xl md:text-3xl text-center"
                  style={{ color: Platform.OS === 'web' ? '#0E3B32' : '#1E293B' }}
                >
                  Bắt Đầu Hành Trình Của Bạn
                </Text>

                <Text
                  className="text-xs md:text-sm text-center leading-relaxed"
                  style={{ color: Platform.OS === 'web' ? '#5A6E65' : '#64748B' }}
                >
                  Bạn chưa có chuyến đi nào được lưu. Hãy lên kế hoạch chuyến đi mới theo sở thích cá nhân, hoặc trò chuyện trực tiếp với trợ lý ViVu AI để được tư vấn lộ trình và tạo lịch trình tự động!
                </Text>
              </View>

              {/* Dual Action Buttons: Tạo chuyến đi mới & Trò chuyện cùng Chatbot AI */}
              <View className="flex-row flex-wrap items-center justify-center gap-3.5 w-full max-w-md">
                {/* Button 1: Tạo chuyến đi mới */}
                <Pressable
                  testID="create-new-trip-btn"
                  onPress={() => router.push(APP_ROUTES.NEW_TRIP as any)}
                  className="flex-1 flex-row items-center justify-center gap-2 px-6 py-3.5 rounded-2xl shadow-md"
                  style={{
                    minWidth: 200,
                    cursor: 'pointer' as any,
                    backgroundColor: Platform.OS === 'web' ? '#0E3B32' : BRAND_COLORS.primary,
                  }}
                >
                  <Plus size={18} color="white" />
                  <Text className="text-white font-bold text-sm">Lên Kế Hoạch Ngay</Text>
                </Pressable>

                {/* Button 2: Mở Chatbot Trợ Lý AI */}
                <Pressable
                  testID="open-ai-chat-btn"
                  onPress={openChatbot}
                  className="flex-1 flex-row items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-white shadow-sm"
                  style={{
                    minWidth: 200,
                    cursor: 'pointer' as any,
                    borderWidth: 1,
                    borderColor: Platform.OS === 'web' ? '#0E3B32' : 'rgba(31,111,84,0.3)',
                  }}
                >
                  <MessageSquare size={17} color={Platform.OS === 'web' ? '#0E3B32' : BRAND_COLORS.primary} />
                  <Text
                    className="font-extrabold text-sm"
                    style={{ color: Platform.OS === 'web' ? '#0E3B32' : BRAND_COLORS.primary }}
                  >
                    Chat Với ViVu AI
                  </Text>
                </Pressable>
              </View>

              {/* 3 Core Value Pillars */}
              <View className="flex-row flex-wrap gap-4 pt-6 border-t border-brand-line/40 w-full max-w-2xl justify-around">
                <View className="flex-row items-center gap-2.5">
                  <View className="w-8 h-8 rounded-xl bg-brand-primary/10 items-center justify-center">
                    <Zap size={16} color={BRAND_COLORS.primary} />
                  </View>
                  <View>
                    <Text className="text-xs font-bold text-brand-text">Lịch trình cá nhân hóa</Text>
                    <Text className="text-[10px] text-brand-textSoft">Theo sở thích & thời tiết thực</Text>
                  </View>
                </View>

                <View className="flex-row items-center gap-2.5">
                  <View className="w-8 h-8 rounded-xl bg-amber-500/10 items-center justify-center">
                    <MapPin size={16} color="#D97706" />
                  </View>
                  <View>
                    <Text className="text-xs font-bold text-brand-text">Bản đồ tối ưu lộ trình</Text>
                    <Text className="text-[10px] text-brand-textSoft">Địa điểm xác thực thực tế</Text>
                  </View>
                </View>

                <View className="flex-row items-center gap-2.5">
                  <View className="w-8 h-8 rounded-xl bg-emerald-500/10 items-center justify-center">
                    <CheckCircle size={16} color="#059669" />
                  </View>
                  <View>
                    <Text className="text-xs font-bold text-brand-text">Kiểm soát ngân sách</Text>
                    <Text className="text-[10px] text-brand-textSoft">Rõ ràng từng bữa ăn, lưu trú</Text>
                  </View>
                </View>
              </View>
            </View>
          </Reveal>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: isMobile ? 10 : 16, justifyContent: isMobile ? 'space-between' : 'flex-start' }}>
            {trips?.map((trip, idx) => {
              const isAiPro = Boolean(trip.preferences?.is_ai_pro || (trip as any).is_ai_pro || trip.preferences?.ai_tier === 'pro');
              return (
              <Reveal key={trip.id} delay={idx * 60} style={{ width: isMobile ? '48.5%' : undefined, flex: isMobile ? undefined : 1, minWidth: isMobile ? undefined : 280, maxWidth: isMobile ? undefined : 380 }}>
                <Pressable
                  onPress={() => router.push(APP_ROUTES.TRIP_DETAIL(trip.id) as any)}
                  className={Platform.OS === 'web' ? 'rounded-2xl' : `rounded-2xl shadow-sm ${isAiPro ? 'bg-gradient-to-br from-amber-50/40 via-white to-brand-bgAlt border-2 border-amber-400' : 'bg-brand-bgAlt border border-brand-line/50'}`}
                  style={{
                    padding: isMobile ? 12 : 20,
                    width: '100%',
                    minHeight: isMobile ? 180 : undefined,
                    borderRadius: 18,
                    cursor: 'pointer' as any,
                    ...(Platform.OS === 'web'
                      ? {
                          backgroundColor: '#FFFFFF',
                          borderWidth: 1,
                          borderColor: isAiPro ? '#F59E0B' : 'rgba(14, 59, 50, 0.08)',
                          boxShadow: isAiPro ? ('0 4px 20px rgba(245, 158, 11, 0.15)' as any) : ('0 4px 16px rgba(14, 59, 50, 0.05)' as any),
                        }
                      : isAiPro
                      ? { borderColor: '#F59E0B', shadowColor: '#F59E0B', shadowOpacity: 0.15, shadowRadius: 10 }
                      : {}),
                  }}
                >
                  <View style={{ gap: isMobile ? 10 : 16 }}>
                    <View style={{ gap: isMobile ? 6 : 10 }}>
                      {isMobile ? (
                        <View style={{ gap: 6 }}>
                          {/* Hàng 1 trên Mobile: Badge địa điểm + AI PRO + Nút xóa */}
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', flex: 1, marginRight: 4 }}>
                              <View
                                className="flex-row items-center gap-1 px-2 py-0.5 rounded-full"
                                style={Platform.OS === 'web' ? { backgroundColor: 'rgba(14, 59, 50, 0.08)' } : { backgroundColor: 'rgba(31,111,84,0.1)' }}
                              >
                                <MapPin size={10} color={Platform.OS === 'web' ? '#0E3B32' : BRAND_COLORS.primary} />
                                <Text
                                  className="font-bold text-[9px] uppercase tracking-wider"
                                  style={{ color: Platform.OS === 'web' ? '#0E3B32' : BRAND_COLORS.primary }}
                                  numberOfLines={1}
                                >
                                  {trip.destination_city}
                                </Text>
                              </View>
                              {isAiPro && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 999, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#F59E0B' }}>
                                  <Crown size={9} color="#D97706" />
                                  <Text style={{ fontSize: 8.5, fontWeight: '900', color: '#B45309' }}>PRO</Text>
                                </View>
                              )}
                            </View>
                            <Pressable
                              onPress={(e) => {
                                // @ts-ignore
                                if (e.stopPropagation) e.stopPropagation();
                                handleDeleteTrip(trip.id, trip.title);
                              }}
                              style={{ padding: 4, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 6, cursor: 'pointer' as any }}
                            >
                              <Trash2 size={12} color={BRAND_COLORS.danger} />
                            </Pressable>
                          </View>

                          {/* Hàng 2 trên Mobile: Badge trạng thái rút gọn & nhóm */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                            {(() => {
                              const statusInfo = getTripStatusInfo(trip.start_date, trip.end_date, trip.status);
                              const shortLabel = statusInfo.label === 'Đang lập kế hoạch' ? 'Kế hoạch' : statusInfo.label;
                              return (
                                <View
                                  className={`px-1.5 py-0.5 rounded ${statusInfo.bgClass}`}
                                  style={Platform.OS === 'web' ? { backgroundColor: statusInfo.webBg, borderColor: statusInfo.webBorder, borderWidth: 1 } : undefined}
                                >
                                  <Text
                                    className={`text-[8.5px] font-bold uppercase tracking-wider ${statusInfo.textClass}`}
                                    style={Platform.OS === 'web' ? { color: statusInfo.webColor } : undefined}
                                  >
                                    {shortLabel}
                                  </Text>
                                </View>
                              );
                            })()}
                            {trip.is_shared && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 999, backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: '#A7F3D0' }}>
                                <Text style={{ fontSize: 8.5, fontWeight: '700', color: '#1F6F54' }}>👥 {trip.member_count ? `${trip.member_count}` : 'Nhóm'}</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      ) : (
                        <View className="flex-row justify-between items-start">
                          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginRight: 4 }}>
                            <View
                              className="flex-row items-center gap-1 px-2.5 py-1 rounded-full"
                              style={Platform.OS === 'web' ? { backgroundColor: 'rgba(14, 59, 50, 0.08)' } : { backgroundColor: 'rgba(31,111,84,0.1)' }}
                            >
                              <MapPin size={12} color={Platform.OS === 'web' ? '#0E3B32' : BRAND_COLORS.primary} />
                              <Text
                                className="font-bold text-[10px] uppercase tracking-wider"
                                style={{ color: Platform.OS === 'web' ? '#0E3B32' : BRAND_COLORS.primary }}
                                numberOfLines={1}
                              >
                                {trip.destination_city}
                              </Text>
                            </View>
                            {isAiPro && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#F59E0B' }}>
                                <Crown size={9} color="#D97706" />
                                <Text style={{ fontSize: 9, fontWeight: '900', color: '#B45309' }}>AI PRO</Text>
                              </View>
                            )}
                            {trip.is_shared && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: '#A7F3D0' }}>
                                <Text style={{ fontSize: 9, fontWeight: '700', color: '#1F6F54' }}>👥 {trip.member_count ? `${trip.member_count}` : 'Nhóm'}</Text>
                              </View>
                            )}
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            {(() => {
                              const statusInfo = getTripStatusInfo(trip.start_date, trip.end_date, trip.status);
                              return (
                                <View
                                  className={`px-2 py-0.5 rounded-md ${statusInfo.bgClass}`}
                                  style={Platform.OS === 'web' ? { backgroundColor: statusInfo.webBg, borderColor: statusInfo.webBorder, borderWidth: 1 } : undefined}
                                >
                                  <Text
                                    className={`text-[9px] font-bold uppercase tracking-wider ${statusInfo.textClass}`}
                                    style={Platform.OS === 'web' ? { color: statusInfo.webColor } : undefined}
                                  >
                                    {statusInfo.label}
                                  </Text>
                                </View>
                              );
                            })()}
                            <Pressable
                              onPress={(e) => {
                                // @ts-ignore
                                if (e.stopPropagation) e.stopPropagation();
                                handleDeleteTrip(trip.id, trip.title);
                              }}
                              style={{ padding: 4, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 6, cursor: 'pointer' as any }}
                            >
                              <Trash2 size={14} color={BRAND_COLORS.danger} />
                            </Pressable>
                          </View>
                        </View>
                      )}
                      <View style={{ gap: 2 }}>
                        <Text
                          style={{
                            fontSize: isMobile ? 14 : 18,
                            fontWeight: '700',
                            fontFamily: 'Lora_700Bold',
                            color: Platform.OS === 'web' ? '#0E3B32' : '#1E293B',
                            lineHeight: isMobile ? 19 : 24
                          }}
                          numberOfLines={2}
                        >
                          {trip.title}
                        </Text>
                        {isAiPro && (
                          <View className="flex-row items-center gap-1 mt-0.5">
                            <Sparkles size={9} color="#D97706" />
                            <Text className="text-[10px] font-extrabold text-amber-700" numberOfLines={1}>Tối ưu bởi AI Pro</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={{ gap: isMobile ? 5 : 8, paddingTop: isMobile ? 8 : 12, borderTopWidth: 1, borderTopColor: Platform.OS === 'web' ? 'rgba(14, 59, 50, 0.08)' : 'rgba(226, 232, 240, 0.6)' }}>
                      <View className="flex-row items-center gap-1.5">
                        <Calendar size={isMobile ? 12 : 14} color={Platform.OS === 'web' ? '#0E3B32' : BRAND_COLORS.primary} />
                        <Text style={{ fontSize: isMobile ? 10.5 : 12, color: '#64748B' }} numberOfLines={1}>
                          {formatDate(trip.start_date)} - {formatDate(trip.end_date)}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1.5">
                        <Wallet size={isMobile ? 12 : 14} color={Platform.OS === 'web' ? '#0E3B32' : BRAND_COLORS.primary} />
                        <Text style={{ fontSize: isMobile ? 10.5 : 12, color: '#64748B' }} numberOfLines={1}>
                          <Text style={{ fontWeight: '700', color: Platform.OS === 'web' ? '#0E3B32' : '#1E293B' }}>
                            {formatCurrency(trip.budget_total)}
                          </Text>
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1.5">
                        <DollarSign size={isMobile ? 12 : 14} color={Platform.OS === 'web' ? '#0E3B32' : BRAND_COLORS.primary} />
                        <Text style={{ fontSize: isMobile ? 10.5 : 12, color: '#64748B' }} numberOfLines={1}>
                          <Text style={{ fontWeight: '700', color: Platform.OS === 'web' ? '#0E3B32' : '#1E293B' }}>
                            {trip.traveler_count} khách
                          </Text>{' '}
                          ({trip.traveler_type})
                        </Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              </Reveal>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
    <PremiumModal
      visible={showPremiumModal}
      onClose={() => setShowPremiumModal(false)}
      onActivated={() => {
        refetchStatus();
      }}
    />
    <ProfileModal
      visible={showProfileModal}
      onClose={() => setShowProfileModal(false)}
    />
    <ConfirmModal
      visible={!!confirmModal?.visible}
      title={confirmModal?.title || ''}
      message={confirmModal?.message || ''}
      isDestructive={confirmModal?.isDestructive}
      onConfirm={confirmModal?.onConfirm || (() => {})}
      onCancel={() => setConfirmModal(null)}
    />
  </View>
  );
}

