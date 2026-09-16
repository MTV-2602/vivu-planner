import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Alert, Platform,
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
import { BRAND_COLORS, APP_ROUTES } from '../../../constants';
import PremiumModal from '../../../components/PremiumModal';
import ConfirmModal from '../../../components/ConfirmModal';
import ProfileModal from '../../../components/ProfileModal';

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
      textClass: 'text-brand-textSoft'
    };
  }
  
  if (startDateStr && startDateStr <= todayStr && endDateStr && todayStr <= endDateStr) {
    return {
      label: 'Đang diễn ra',
      bgClass: 'bg-emerald-100 border border-emerald-300/40',
      textClass: 'text-emerald-700'
    };
  }

  return {
    label: 'Đang lập kế hoạch',
    bgClass: 'bg-brand-gold/25 border border-brand-gold/45',
    textClass: 'text-brand-primaryStrong'
  };
}

export default function Dashboard() {
  const router = useRouter();
  const { user, isAdmin, signOut } = useAuth();
  const { openChatbot } = useChatbot();
  const userEmail = user?.email || '';

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

  if (isAdmin) {
    return (
      <View className="flex-1 bg-brand-bg items-center justify-center p-6 gap-3">
        <ActivityIndicator size="large" color={BRAND_COLORS.primary} />
        <Text className="text-sm font-bold text-brand-text">Tài khoản Quản trị viên (Admin)</Text>
        <Text className="text-xs text-brand-textSoft text-center">
          Quản trị viên chỉ quản lý nghiệp vụ hệ thống và không tạo chuyến đi cá nhân. Đang chuyển hướng về Bảng Quản Trị...
        </Text>
      </View>
    );
  }

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const search = window.location.search;
      if (search && (search.includes('payment=success') || search.includes('resultCode=0') || search.includes('code=00'))) {
        // Clean the URL immediately so user doesn't see ugly query params
        window.history.replaceState({}, document.title, window.location.pathname);
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

  const { data: paymentStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['payment-status'],
    queryFn: async () => {
      const r = await api.get('/payment/status');
      return r.data;
    },
    enabled: !!user?.id,
  });

  // ─── LẮNG NGHE SUPABASE REALTIME ĐỒNG BỘ GÓI CƯỚC THỜI GIAN THỰC ───────
  useEffect(() => {
    if (!user?.id) return;

    // 1. Kênh Broadcast trực tiếp từ Admin
    const userChannel = supabase.channel(`user_channel_${user.id}`);
    userChannel
      .on('broadcast', { event: 'user_updated' }, () => {
        refetchStatus();
      })
      .subscribe();

    // 2. Kênh PostgreSQL Changes lắng nghe thay đổi trên bảng profiles
    const profileChannel = supabase
      .channel(`profile_realtime_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        () => {
          refetchStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(userChannel);
      supabase.removeChannel(profileChannel);
    };
  }, [user?.id]);

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
      <ScrollView className="flex-1 bg-brand-bg" contentContainerStyle={{ flexGrow: 1 }}>
      {/* Navbar */}
      <View className="bg-brand-bg border-b border-brand-line px-6 py-4">
        <View className="flex-row justify-between items-center">
          <Pressable onPress={() => router.push(APP_ROUTES.LANDING as any)} className="flex-row items-center gap-2">
            <Compass size={28} color={BRAND_COLORS.primary} />
            <Text className="font-display font-bold text-xl text-brand-primary">ViVu Planner</Text>
          </Pressable>

          <View className="flex-row items-center gap-2">
            <SystemClock />
            {(() => {
              const getRemainingDays = (dateStr: string) => {
                if (!dateStr) return 0;
                const diff = new Date(dateStr).getTime() - Date.now();
                return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
              };

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
                    backgroundColor: paymentStatus?.isPremium ? '#D4A017' : '#059669',
                    cursor: 'pointer' as any,
                  }}
                >
                  {paymentStatus?.isPremium ? (
                    <>
                      <Crown size={14} color="#fff" />
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
                        {paymentStatus?.planName || 'ViVu Pro'} ({paymentStatus?.premiumUntil ? `Còn ${getRemainingDays(paymentStatus.premiumUntil)} ngày` : 'Vô hạn'}) ✨
                      </Text>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} color="#fff" />
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
                        Nâng cấp Gói Pro 👑
                      </Text>
                    </>
                  )}
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
              onPress={() => setShowProfileModal(true)}
              className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border border-brand-line bg-brand-bgAlt/50 hover:border-brand-primary"
              style={{ cursor: 'pointer' as any }}
            >
              <User size={13} color={BRAND_COLORS.primary} />
              <Text className="text-brand-textSoft text-xs font-semibold" numberOfLines={1}>
                {userEmail}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleLogout}
              className="flex-row items-center gap-1 px-3 py-2 rounded-lg bg-brand-danger/10"
            >
              <LogOut size={14} color={BRAND_COLORS.danger} />
              <Text className="text-brand-danger text-xs font-bold">Đăng xuất</Text>
            </Pressable>
          </View>
        </View>
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
      <View className="px-6 py-10 gap-8">
        {/* Page header */}
        <View className="flex-row justify-between items-start flex-wrap gap-4">
          <View className="gap-1">
            <Text className="font-display font-extrabold text-3xl text-brand-text">
              Hành Trình Của Bạn
            </Text>
            <Text className="text-sm text-brand-textSoft">
              Quản lý và tạo lịch trình du lịch cá nhân hóa bằng AI
            </Text>
          </View>

          <View className="flex-row gap-3 flex-wrap">
            <Pressable
              onPress={() => router.push(APP_ROUTES.NEW_TRIP as any)}
              className="flex-row items-center gap-2 px-5 py-3 rounded-xl bg-brand-accent"
            >
              <Plus size={16} color="white" />
              <Text className="text-white font-bold text-sm">Tạo chuyến đi mới</Text>
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
          <View className="flex-row flex-wrap gap-6">
            {[1, 2, 3].map(i => (
              <View
                key={i}
                className="bg-brand-bgAlt border border-brand-line rounded-2xl h-56 flex-1"
                style={{ minWidth: 280 }}
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
            <View className="bg-brand-bgAlt border border-brand-line/60 rounded-3xl p-8 md:p-12 shadow-sm items-center text-center gap-6">
              {/* Compass AI Icon */}
              <View className="w-16 h-16 rounded-3xl bg-brand-primary/10 items-center justify-center border border-brand-primary/20 shadow-sm">
                <Compass size={32} color={BRAND_COLORS.primary} />
              </View>

              <View className="items-center gap-2 max-w-xl">
                <View className="flex-row items-center gap-1.5 px-3 py-1 rounded-full bg-brand-primary/10 border border-brand-primary/20">
                  <Sparkles size={12} color={BRAND_COLORS.primary} />
                  <Text className="text-brand-primary font-bold text-[11px] uppercase tracking-wider">
                    Trợ Lý Du Lịch AI Thông Minh
                  </Text>
                </View>

                <Text className="font-display font-black text-2xl md:text-3xl text-brand-text text-center">
                  Bắt Đầu Hành Trình Của Bạn
                </Text>

                <Text className="text-xs md:text-sm text-brand-textSoft text-center leading-relaxed">
                  Bạn chưa có chuyến đi nào được lưu. Hãy lên kế hoạch chuyến đi mới theo sở thích cá nhân, hoặc trò chuyện trực tiếp với trợ lý ViVu AI để được tư vấn lộ trình và tạo lịch trình tự động!
                </Text>
              </View>

              {/* Dual Action Buttons: Tạo chuyến đi mới & Trò chuyện cùng Chatbot AI */}
              <View className="flex-row flex-wrap items-center justify-center gap-3.5 w-full max-w-md">
                {/* Button 1: Tạo chuyến đi mới */}
                <Pressable
                  testID="create-new-trip-btn"
                  onPress={() => router.push(APP_ROUTES.NEW_TRIP as any)}
                  className="flex-1 flex-row items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-brand-primary shadow-md hover:bg-brand-primaryStrong"
                  style={{ minWidth: 200, cursor: 'pointer' as any }}
                >
                  <Plus size={18} color="white" />
                  <Text className="text-white font-bold text-sm">Lên Kế Hoạch Ngay</Text>
                </Pressable>

                {/* Button 2: Mở Chatbot Trợ Lý AI */}
                <Pressable
                  testID="open-ai-chat-btn"
                  onPress={openChatbot}
                  className="flex-1 flex-row items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-white border border-brand-primary/30 shadow-sm hover:bg-brand-primary/5"
                  style={{ minWidth: 200, cursor: 'pointer' as any }}
                >
                  <MessageSquare size={17} color={BRAND_COLORS.primary} />
                  <Text className="text-brand-primary font-extrabold text-sm">Chat Với ViVu AI</Text>
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
          <View className="flex-row flex-wrap gap-6">
            {trips?.map((trip, idx) => (
              <Reveal key={trip.id} delay={idx * 60}>
                <Pressable
                  onPress={() => router.push(APP_ROUTES.TRIP_DETAIL(trip.id) as any)}
                  className="bg-brand-bgAlt border border-brand-line/50 rounded-2xl p-6 shadow-sm"
                  style={{ minWidth: 280 }}
                >
                  <View className="gap-6">
                    <View className="gap-3">
                      <View className="flex-row justify-between items-start">
                        <View className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-brand-primary/10">
                          <MapPin size={12} color={BRAND_COLORS.primary} />
                          <Text className="text-brand-primary font-bold text-[10px] uppercase tracking-wider">
                            {trip.destination_city}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {(() => {
                            const statusInfo = getTripStatusInfo(trip.start_date, trip.end_date, trip.status);
                            return (
                              <View className={`px-2 py-1 rounded-md ${statusInfo.bgClass}`}>
                                <Text className={`text-[10px] font-bold uppercase tracking-wider ${statusInfo.textClass}`}>
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
                            style={{ padding: 6, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 8 }}
                          >
                            <Trash2 size={14} color={BRAND_COLORS.danger} />
                          </Pressable>
                        </View>
                      </View>
                      <Text className="text-xl font-bold text-brand-text">{trip.title}</Text>
                    </View>

                    <View className="gap-2.5 pt-3 border-t border-brand-line/40">
                      <View className="flex-row items-center gap-2">
                        <Calendar size={16} color={BRAND_COLORS.primary} />
                        <Text className="text-xs text-brand-textSoft">
                          {formatDate(trip.start_date)} — {formatDate(trip.end_date)}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-2">
                        <Wallet size={16} color={BRAND_COLORS.primary} />
                        <Text className="text-xs text-brand-textSoft">
                          Ngân sách:{' '}
                          <Text className="font-bold text-brand-text">
                            {formatCurrency(trip.budget_total)}
                          </Text>
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-2">
                        <DollarSign size={16} color={BRAND_COLORS.primary} />
                        <Text className="text-xs text-brand-textSoft">
                          Đoàn:{' '}
                          <Text className="font-bold text-brand-text">
                            {trip.traveler_count} khách
                          </Text>{' '}
                          ({trip.traveler_type})
                        </Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              </Reveal>
            ))}
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

