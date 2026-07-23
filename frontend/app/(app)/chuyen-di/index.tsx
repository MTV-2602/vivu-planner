import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Compass, Plus, LogOut, Calendar, MapPin, Wallet, DollarSign,
  RefreshCw, User, GitFork, Shield, WifiOff, Crown, Trash2, Sparkles, X,
} from 'lucide-react-native';
import { supabase } from '../../../lib/supabaseClient';
import { apiClient } from '../../../lib/apiClient';
import { getCache, setCache, clearCache } from '../../../lib/cache';
import Reveal from '../../../components/Reveal';
import SystemClock from '../../../components/SystemClock';
import { BRAND_COLORS } from '../../../constants';
import PremiumModal from '../../../components/PremiumModal';

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

const canUseLocalStorage = Platform.OS === 'web' && typeof localStorage !== 'undefined';

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
  const [userEmail, setUserEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [cachedTrips, setCachedTrips] = useState<Trip[] | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  useEffect(() => {
    getCache<Trip[]>('trips').then(data => {
      if (data) { setCachedTrips(data); setFromCache(true); }
    });
  }, []);

  const [paymentSuccessMsg, setPaymentSuccessMsg] = useState('');

  useEffect(() => {
    if (canUseLocalStorage && localStorage.getItem('vivu_admin_token')) {
      router.replace('/admin' as any);
      return;
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace('/dang-nhap');
      } else {
        setUserEmail(user.email || '');
        if (canUseLocalStorage) {
          setIsAdmin(!!localStorage.getItem('vivu_admin_token'));
        }
      }
    });

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const search = window.location.search;
      if (search && (search.includes('payment=success') || search.includes('resultCode=0') || search.includes('code=00'))) {
        // Clean the URL immediately so user doesn't see ugly query params
        window.history.replaceState({}, document.title, window.location.pathname);
        apiClient.get(`/payment/verify-return${search}`).then(res => {
          if (res.data?.success) {
            setPaymentSuccessMsg('🎉 Thanh toán thành công! Hệ thống đã tự động cộng dồn lượt tạo chuyến đi AI mới vào tài khoản của bạn.');
            refetchStatus();
          }
        }).catch(() => {});
      }
    }
  }, []);

  const { data: trips, isLoading, isError, refetch } = useQuery<Trip[]>({
    queryKey: ['trips'],
    queryFn: async () => {
      const res = await apiClient.get('/trips');
      await setCache('trips', res.data);
      setFromCache(false);
      return res.data;
    },
    placeholderData: cachedTrips ?? undefined,
  });

  const { data: paymentStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['payment-status'],
    queryFn: async () => {
      const r = await apiClient.get('/payment/status');
      return r.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (tripId: string) => {
      await apiClient.delete(`/trips/${tripId}`);
    },
    onSuccess: () => {
      refetch();
      refetchStatus();
    },
    onError: (err: any) => Alert.alert('Lỗi xóa chuyến đi', err.response?.data?.error || err.message),
  });

  const handleDeleteTrip = (tripId: string, title: string) => {
    if (Platform.OS === 'web') {
      if (confirm(`Bạn có chắc chắn muốn xóa chuyến đi "${title}"?`)) {
        deleteMutation.mutate(tripId);
      }
    } else {
      Alert.alert('Xác nhận xóa', `Bạn có chắc chắn muốn xóa chuyến đi "${title}"?`, [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Xóa', style: 'destructive', onPress: () => deleteMutation.mutate(tripId) },
      ]);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    if (canUseLocalStorage) {
      localStorage.removeItem('vivu_admin_token');
      localStorage.removeItem('vivu_mock_user');
      localStorage.removeItem('vivu_mock_token');
    }
    await clearCache();
    router.replace('/dang-nhap');
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await apiClient.post('/dev/sync-repositories');
      Alert.alert('Thành công', res.data.message);
    } catch (err: any) {
      const msg = err.response?.data?.details || err.response?.data?.error || err.message;
      Alert.alert('Lỗi đồng bộ', msg);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
    <ScrollView className="flex-1 bg-brand-bg" contentContainerStyle={{ flexGrow: 1 }}>
      {/* Navbar */}
      <View className="bg-brand-bg border-b border-brand-line px-6 py-4">
        <View className="flex-row justify-between items-center">
          <Pressable onPress={() => router.push('/landing')} className="flex-row items-center gap-2">
            <Compass size={28} color={BRAND_COLORS.primary} />
            <Text className="font-display font-bold text-xl text-brand-primary">ViVu Planner</Text>
          </Pressable>

          <View className="flex-row items-center gap-2">
            <SystemClock />
            <Pressable
              onPress={() => setShowPremiumModal(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 20,
                backgroundColor: '#059669',
                cursor: 'pointer' as any,
              }}
            >
              <Sparkles size={14} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
                Còn {paymentStatus?.remainingTrips ?? '...'} lượt AI (+ Nạp)
              </Text>
            </Pressable>
            {isAdmin && (
              <Pressable
                onPress={() => router.push('/admin' as any)}
                className="flex-row items-center gap-1 px-3 py-2 rounded-lg bg-brand-accent/10"
              >
                <Shield size={14} color={BRAND_COLORS.accent} />
                <Text className="text-brand-accent text-xs font-bold">Quản trị</Text>
              </Pressable>
            )}
            <View className="flex-row items-center gap-1 px-3 py-1.5 rounded-full border border-brand-line">
              <User size={13} color={BRAND_COLORS.textSoft} />
              <Text className="text-brand-textSoft text-xs font-semibold" numberOfLines={1}>
                {userEmail}
              </Text>
            </View>
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
            {__DEV__ && (
              <Pressable
                onPress={handleSync}
                disabled={syncing}
                className="flex-row items-center gap-2 px-5 py-3 rounded-xl bg-brand-primary"
                style={syncing ? { opacity: 0.5 } : undefined}
              >
                {syncing
                  ? <ActivityIndicator size="small" color="white" />
                  : <GitFork size={16} color="white" />
                }
                <Text className="text-white font-bold text-sm">
                  {syncing ? 'Đang đồng bộ...' : 'Đồng bộ Git'}
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => router.push('/chuyen-di/moi' as any)}
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
            <View className="bg-brand-bgAlt border border-brand-line/50 rounded-2xl p-12 items-center gap-4">
              <Compass size={48} color={BRAND_COLORS.primary} />
              <View className="items-center gap-1">
                <Text className="text-lg font-bold text-brand-text">Bạn chưa tạo chuyến đi nào</Text>
                <Text className="text-xs text-brand-textSoft text-center px-4">
                  Hãy để ViVu Planner thiết kế lịch trình du lịch đầu tiên của bạn!
                </Text>
              </View>
              <Pressable
                onPress={() => router.push('/chuyen-di/moi' as any)}
                className="flex-row items-center gap-2 px-5 py-3 rounded-xl bg-brand-primary"
              >
                <Plus size={16} color="white" />
                <Text className="text-white font-bold">Lên lịch trình ngay</Text>
              </Pressable>
            </View>
          </Reveal>
        ) : (
          <View className="flex-row flex-wrap gap-6">
            {trips?.map((trip, idx) => (
              <Reveal key={trip.id} delay={idx * 60}>
                <Pressable
                  onPress={() => router.push(`/chuyen-di/${trip.id}` as any)}
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
        setShowPremiumModal(false);
        refetchStatus();
      }}
    />
  </View>
  );
}
