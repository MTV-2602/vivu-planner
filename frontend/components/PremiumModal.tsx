import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, Pressable, Modal, ScrollView,
  ActivityIndicator, Platform, Linking, Image,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useQuery } from '@tanstack/react-query';
import {
  X, Crown, Sparkles, Check, Clock, AlertTriangle,
  History, ExternalLink, RefreshCw, Copy, CheckCircle2,
  ShieldCheck, CreditCard, Gift,
} from 'lucide-react-native';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { BRAND_COLORS } from '../constants';
import {
  normalizePlans,
  describePlan,
  getPlanBadge,
  getPlanDescription,
  formatVND,
  formatWallet,
  PricingPlan,
} from '../lib/plans';
import { usePaymentStatus } from '../hooks/usePaymentStatus';

interface PremiumModalProps {
  visible: boolean;
  onClose: () => void;
  onActivated?: () => void;
  onSuccess?: () => void;
}

interface OrderHistoryItem {
  id: string;
  amount: number;
  plan: string;
  method: string;
  status: string;
  order_code: string;
  created_at: string;
}

export default function PremiumModal({ visible, onClose, onActivated, onSuccess }: PremiumModalProps) {
  const [activeTab, setActiveTab] = useState<'upgrade' | 'history'>('upgrade');
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'payos' | 'momo'>('payos');
  const [loading, setLoading] = useState(false);
  const [orderData, setOrderData] = useState<any>(null);
  const [activated, setActivated] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [timeLeft, setTimeLeft] = useState(900); // 15 phút đếm ngược (khớp PayOS & MoMo)
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = async (text: string, field: string) => {
    try {
      if (Clipboard && typeof Clipboard.setStringAsync === 'function') {
        await Clipboard.setStringAsync(text);
      } else if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {}
  };

  // Lấy trạng thái gói dịch vụ qua hook chung
  const { data: statusData, refetch: refetchStatus, invalidate: invalidateStatus } = usePaymentStatus(visible);

  const onActivatedRef = useRef(onActivated);
  onActivatedRef.current = onActivated;
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const invalidateStatusRef = useRef(invalidateStatus);
  invalidateStatusRef.current = invalidateStatus;

  // Snapshot credits trước khi tạo đơn để đối soát thay đổi
  const initialSnapshotRef = useRef<{ trips: number; single: number; monthly: number }>({ trips: 0, single: 0, monthly: 0 });

  // Lấy danh sách gói cước động từ backend
  const { data: rawPlansData, isLoading: plansLoading, refetch: refetchPlans } = useQuery({
    queryKey: ['paymentPlansModal'],
    queryFn: async () => {
      const res = await api.get('/payment/plans');
      return res.data;
    },
    staleTime: 0,
    refetchOnMount: 'always',
    enabled: visible,
  });

  const plans = useMemo<PricingPlan[]>(() => {
    return normalizePlans(rawPlansData).filter((p) => p.is_active !== false);
  }, [rawPlansData]);

  // Tự động chọn plan đầu tiên nếu chưa chọn hoặc plan đang chọn không tồn tại trong danh sách
  useEffect(() => {
    if (plans.length > 0) {
      if (!selectedPlan || !plans.some((p) => p.id === selectedPlan)) {
        setSelectedPlan(plans[0].id);
      }
    }
  }, [plans, selectedPlan]);

  const selectedPlanObj = useMemo<PricingPlan | null>(() => {
    if (!plans.length) return null;
    return plans.find((p) => p.id === selectedPlan) || plans[0] || null;
  }, [plans, selectedPlan]);

  // Lắng nghe thay đổi giá từ Supabase Realtime qua broadcast channel pricing_realtime
  useEffect(() => {
    let channel: any = null;
    try {
      channel = supabase
        .channel('pricing_realtime')
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
      console.warn('[Realtime] PremiumModal subscribe failed:', err);
    }

    return () => {
      try {
        if (channel) supabase.removeChannel(channel);
      } catch (err) {}
    };
  }, [refetchPlans]);

  // Lấy lịch sử giao dịch
  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery<{ success: boolean; orders: OrderHistoryItem[] }>({
    queryKey: ['myOrdersModal'],
    queryFn: async () => {
      const res = await api.get('/payment/my-orders');
      return res.data;
    },
    enabled: visible && activeTab === 'history',
  });

  useEffect(() => {
    if (!visible) {
      setOrderData(null);
      setActivated(false);
      setErrorMessage('');
      setActiveTab('upgrade');
    } else {
      refetchStatus();
      refetchPlans();
    }
  }, [visible, refetchStatus, refetchPlans]);

  // Bộ đếm ngược 15 phút khi có đơn hàng (khớp hạn PayOS)
  useEffect(() => {
    if (!orderData || activated) return;
    setTimeLeft(900);
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setErrorMessage('Đơn thanh toán đã hết hạn (15 phút). Vui lòng tạo lại đơn mới.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [orderData, activated]);

  // Polling tự động kiểm tra thanh toán thành công (độc lập hoàn toàn khỏi timer re-render)
  useEffect(() => {
    if (!visible || !orderData || activated) return;
    const targetCode = orderData.orderId || orderData.orderCode;

    let isMounted = true;

    const checkSuccess = async () => {
      try {
        if (targetCode) {
          const checkRes = await api.get(`/payment/check-order/${targetCode}`);
          if (checkRes.data?.paid && isMounted) {
            setActivated(true);
            await invalidateStatusRef.current?.();
            onActivatedRef.current?.();
            onSuccessRef.current?.();
            return true;
          }
        }

        const { data } = await api.get('/payment/status');
        if (isMounted && data) {
          const initial = initialSnapshotRef.current;
          const increased =
            (data.remainingTrips ?? 0) > initial.trips ||
            (data.singleCredits ?? 0) > initial.single ||
            (data.monthlyCredits ?? 0) > initial.monthly ||
            (data.hasActiveMonthly && !statusData?.hasActiveMonthly);

          if (increased) {
            setActivated(true);
            await invalidateStatusRef.current?.();
            onActivatedRef.current?.();
            onSuccessRef.current?.();
            return true;
          }
        }
      } catch {}
      return false;
    };

    // Kiểm tra ngay khi khởi tạo
    checkSuccess();

    const interval = setInterval(async () => {
      const done = await checkSuccess();
      if (done) clearInterval(interval);
    }, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [visible, orderData?.orderId, orderData?.orderCode, activated]);

  // Lắng nghe Realtime Broadcast sự kiện cập nhật tài khoản
  useEffect(() => {
    if (!visible || !orderData || activated) return;

    let channel: any = null;
    try {
      const targetCode = orderData.orderId || orderData.orderCode;
      channel = supabase
        .channel(`payment_order_${targetCode}`)
        .on('broadcast', { event: 'user_updated' }, async () => {
          setActivated(true);
          await invalidateStatusRef.current?.();
          onActivatedRef.current?.();
          onSuccessRef.current?.();
        })
        .subscribe();
    } catch {}

    return () => {
      if (channel) {
        try { supabase.removeChannel(channel); } catch {}
      }
    };
  }, [visible, orderData?.orderId, orderData?.orderCode, activated]);

  const handleCreateOrder = async () => {
    if (!selectedPlanObj) return;
    setLoading(true);
    setOrderData(null);
    setErrorMessage('');
    try {
      initialSnapshotRef.current = {
        trips: statusData?.remainingTrips ?? 0,
        single: statusData?.singleCredits ?? 0,
        monthly: statusData?.monthlyCredits ?? 0,
      };

      const { data } = await api.post('/payment/create-order', {
        method: paymentMethod,
        plan: selectedPlanObj.id,
      });
      setOrderData(data);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.details || err.message || 'Không thể tạo đơn thanh toán';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    const targetCode = orderData?.orderId || orderData?.orderCode;
    if (targetCode) {
      try {
        await api.post('/payment/cancel-order', {
          orderId: orderData?.orderId,
          orderCode: orderData?.orderCode,
        });
      } catch (err: any) {
        console.warn('[PremiumModal] cancel-order error:', err.response?.data?.error || err.message);
      }
    }
    setOrderData(null);
    setErrorMessage('');
  };

  const isCurrentPremium = !!statusData?.isPremium;
  const wallet = formatWallet(statusData);

  // Màn hình thanh toán thành công
  if (activated) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View
          style={(Platform.OS === 'web' ? {
            position: 'fixed' as any,
            top: 0, left: 0, right: 0, bottom: 0,
            width: '100vw' as any, height: '100vh' as any,
            zIndex: 9999, justifyContent: 'center', alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
            padding: 16,
          } : {
            flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
            justifyContent: 'center', alignItems: 'center', padding: 16,
          }) as any}
        >
          <View style={{ backgroundColor: '#fff', borderRadius: 28, padding: 36, alignItems: 'center', width: '100%', maxWidth: 460 }}>
            <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 44 }}>🎉</Text>
            </View>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#1B3A2D', marginBottom: 8, textAlign: 'center' }}>
              Thanh Toán Thành Công!
            </Text>
            <Text style={{ color: '#059669', textAlign: 'center', marginBottom: 12, fontWeight: '700', fontSize: 16 }}>
              Gói dịch vụ đã được kích hoạt thành công! ✨
            </Text>
            <Text style={{ color: '#64748B', textAlign: 'center', marginBottom: 24, lineHeight: 20, fontSize: 13 }}>
              Toàn bộ đặc quyền cao cấp đã được mở khóa ngay trên tài khoản của bạn.
            </Text>
            <Pressable
              onPress={() => {
                onClose();
                refetchStatus();
              }}
              style={{ backgroundColor: BRAND_COLORS.primary, borderRadius: 50, paddingHorizontal: 36, paddingVertical: 14, width: '100%', alignItems: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Bắt đầu trải nghiệm ngay ✨</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  // Nội dung chuyển khoản chuẩn: Ưu tiên description do cổng PayOS cấp (chứa mã định danh CS...)
  const transferContent =
    orderData?.description ||
    orderData?.orderId ||
    (orderData?.orderCode ? `VIVU${orderData.orderCode}` : '');

  // Xây dựng QR image URL
  let qrImage = '';
  if (orderData) {
    const directQr = orderData.qrCode || orderData.qrCodeUrl;
    const webUrl = orderData.checkoutUrl || orderData.payUrl;
    const momoDeeplink = orderData.deeplink;

    if (orderData.method === 'momo') {
      if (directQr) {
        const isImageUrl =
          directQr.startsWith('data:image/') ||
          (directQr.startsWith('http') && (directQr.includes('.png') || directQr.includes('.jpg')));
        if (isImageUrl) qrImage = directQr;
        else qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(directQr)}`;
      } else if (momoDeeplink || webUrl) {
        const target = momoDeeplink || webUrl;
        qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(target)}`;
      }
    } else {
      // PayOS / VietQR: Ưu tiên mã directQr (chuỗi VietQR chuẩn gốc từ PayOS)
      if (directQr) {
        const isImageUrl =
          directQr.startsWith('data:image/') ||
          (directQr.startsWith('http') && (directQr.includes('vietqr.io') || directQr.includes('.png') || directQr.includes('.jpg')));
        if (isImageUrl) {
          qrImage = directQr;
        } else {
          qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(directQr)}`;
        }
      } else if (orderData.accountNumber && orderData.amount) {
        // Fallback sang vietqr.io với đúng bin, accountNumber và transferContent chuẩn PayOS
        const bin = orderData.bin || '970422';
        const addInfo = encodeURIComponent(transferContent);
        const accName = encodeURIComponent(orderData.accountName || 'MAI TUAN VINH');
        qrImage = `https://img.vietqr.io/image/${bin}-${orderData.accountNumber}-compact2.png?amount=${orderData.amount}&addInfo=${addInfo}&accountName=${accName}`;
      } else if (webUrl) {
        qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(webUrl)}`;
      }
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={(Platform.OS === 'web' ? {
          position: 'fixed' as any,
          top: 0, left: 0, right: 0, bottom: 0,
          width: '100vw' as any, height: '100vh' as any,
          zIndex: 9999, justifyContent: 'center', alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
          padding: 16,
        } : {
          flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
          justifyContent: 'center', alignItems: 'center', padding: 16,
        }) as any}
      >
        <View
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 24,
            width: '100%',
            maxWidth: 780,
            maxHeight: '92%',
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: '#E2E8F0',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 16 },
            shadowOpacity: 0.2,
            shadowRadius: 28,
            elevation: 16,
          }}
        >
          {/* Header */}
          <View style={{ backgroundColor: '#1B3A2D', paddingHorizontal: 24, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(110,231,183,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                <Crown size={22} color="#6EE7B7" />
              </View>
              <View>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#ffffff' }}>Gói Dịch Vụ ViVu Pro</Text>
                <Text style={{ fontSize: 12, color: '#A7F3D0' }}>Nâng tầm trải nghiệm du lịch thông minh</Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityLabel="close-modal"
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={18} color="#ffffff" />
            </Pressable>
          </View>

          {/* Navigation Tabs */}
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
            <Pressable
              onPress={() => { setActiveTab('upgrade'); setOrderData(null); }}
              style={{
                flex: 1, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                borderBottomWidth: 2, borderBottomColor: activeTab === 'upgrade' ? BRAND_COLORS.primary : 'transparent',
              }}
            >
              <Sparkles size={16} color={activeTab === 'upgrade' ? BRAND_COLORS.primary : '#64748B'} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: activeTab === 'upgrade' ? BRAND_COLORS.primary : '#64748B' }}>
                Nâng Cấp Gói
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { setActiveTab('history'); setOrderData(null); }}
              style={{
                flex: 1, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                borderBottomWidth: 2, borderBottomColor: activeTab === 'history' ? BRAND_COLORS.primary : 'transparent',
              }}
            >
              <History size={16} color={activeTab === 'history' ? BRAND_COLORS.primary : '#64748B'} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: activeTab === 'history' ? BRAND_COLORS.primary : '#64748B' }}>
                Lịch Sử Giao Dịch
              </Text>
            </Pressable>
          </View>

          {/* Body Content */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24, gap: 18 }}>

            {/* TAB 1: NÂNG CẤP GÓI */}
            {activeTab === 'upgrade' && (
              <>
                {/* Khối "Ví lượt hiện tại" - Tách bạch rõ ràng 2 ví */}
                <View
                  style={{
                    backgroundColor: isCurrentPremium ? '#FEFCE8' : '#F8FAFC',
                    borderColor: isCurrentPremium ? '#FDE047' : '#E2E8F0',
                    borderWidth: 1.5,
                    borderRadius: 16,
                    padding: 16,
                    gap: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {isCurrentPremium ? <Crown size={20} color="#CA8A04" /> : <Sparkles size={20} color="#64748B" />}
                      <Text style={{ fontSize: 13, fontWeight: '800', color: isCurrentPremium ? '#854D0E' : '#334155' }}>
                        Tài khoản: {statusData?.planName || (isCurrentPremium ? 'Gói Pro' : 'Gói Miễn Phí')}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: isCurrentPremium ? '#CA8A04' : '#64748B', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 }}>
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
                        {isCurrentPremium ? 'ĐANG HOẠT ĐỘNG' : 'MIỄN PHÍ'}
                      </Text>
                    </View>
                  </View>

                  {/* 1. Ví Miễn Phí (AI Tiêu Chuẩn) */}
                  <View style={{ backgroundColor: '#F1F5F9', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Gift size={16} color="#059669" />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B' }}>
                          Ví Miễn Phí (AI Tiêu Chuẩn)
                        </Text>
                      </View>
                      <View style={{ backgroundColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F172A' }}>
                          {wallet.freeRemaining}/{wallet.freeTotal} chuyến
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, color: '#64748B', paddingLeft: 22 }}>
                      {wallet.freeLine || `🎁 Lượt miễn phí cơ bản: ${wallet.freeRemaining}/${wallet.freeTotal} chuyến`}
                    </Text>
                  </View>

                  {/* 2. Ví Pro (AI Pro & Live Map) */}
                  <View style={{
                    backgroundColor: (statusData?.remainingTrips ?? 0) > 0 ? '#ECFDF5' : '#FFFBEB',
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: (statusData?.remainingTrips ?? 0) > 0 ? '#A7F3D0' : '#FDE68A',
                    gap: 6,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Crown size={16} color={(statusData?.remainingTrips ?? 0) > 0 ? '#059669' : '#D97706'} />
                        <Text style={{ fontSize: 13, fontWeight: '800', color: (statusData?.remainingTrips ?? 0) > 0 ? '#065F46' : '#92400E' }}>
                          Ví Pro (AI Pro & Live Map)
                        </Text>
                      </View>
                      <View style={{
                        backgroundColor: (statusData?.remainingTrips ?? 0) > 0 ? '#10B981' : '#F59E0B',
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 8,
                      }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>
                          {statusData?.remainingTrips ?? 0} lượt khả dụng
                        </Text>
                      </View>
                    </View>

                    {/* Chi tiết lượt không thời hạn và gói thời hạn */}
                    <View style={{ gap: 3, paddingLeft: 22 }}>
                      {wallet.singleLine ? (
                        <Text style={{ fontSize: 11, color: (statusData?.remainingTrips ?? 0) > 0 ? '#047857' : '#78350F', fontWeight: '600' }}>
                          {wallet.singleLine}
                        </Text>
                      ) : null}
                      {wallet.monthlyLine ? (
                        <Text style={{ fontSize: 11, color: (statusData?.remainingTrips ?? 0) > 0 ? '#047857' : '#78350F', fontWeight: '600' }}>
                          📅 {wallet.monthlyLine}
                        </Text>
                      ) : null}
                      {!wallet.singleLine && !wallet.monthlyLine && (
                        <Text style={{ fontSize: 11, color: '#B45309' }}>
                          Chưa có lượt Pro. Nâng cấp gói bên dưới để dùng AI Pro & Không gian Bản đồ Trực quan!
                        </Text>
                      )}
                    </View>
                  </View>
                </View>

                {/* Khi Đang Hiển Thị Mã QR Thanh Toán */}
                {orderData ? (
                  <View style={{ backgroundColor: '#F8FAFC', borderRadius: 20, padding: 20, borderWidth: 1.5, borderColor: orderData.method === 'momo' ? '#E879F9' : '#CBD5E1', alignItems: 'center', gap: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                      <View style={{ gap: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EAB308' }} />
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#854D0E' }}>Đang chờ thanh toán</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Clock size={14} color="#DC2626" />
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#DC2626' }}>
                            Hết hạn sau: {formatTime(timeLeft)}
                          </Text>
                        </View>
                      </View>
                      <Pressable onPress={handleCancelOrder} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#E2E8F0' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>Hủy / Đổi gói</Text>
                      </Pressable>
                    </View>

                    {/* QR Code Container */}
                    {qrImage ? (
                      <View style={{
                        padding: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 2,
                        borderColor: orderData.method === 'momo' ? '#A21CAF' : '#10B981',
                        alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10,
                      }}>
                        {Platform.OS === 'web' ? (
                          <img src={qrImage} alt="QR Thanh toán" style={{ width: 220, height: 220, borderRadius: 8 }} />
                        ) : (
                          <Text style={{ fontSize: 12, color: '#64748B' }}>Đang nạp mã QR...</Text>
                        )}
                        <Text style={{ marginTop: 10, fontSize: 16, fontWeight: '800', color: orderData.method === 'momo' ? '#86198F' : '#065F46' }}>
                          {formatVND(orderData.amount || selectedPlanObj?.amount || 0)}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                          {orderData.method === 'momo' ? 'Mở MoMo quét QR hoặc bấm nút bên dưới' : 'Quét mã VietQR bằng mọi ứng dụng ngân hàng'}
                        </Text>
                      </View>
                    ) : (
                      <ActivityIndicator size="large" color={BRAND_COLORS.primary} />
                    )}

                    {/* Nút mở trực tiếp cổng thanh toán MoMo / PayOS */}
                    {(orderData.payUrl || orderData.deeplink || orderData.checkoutUrl) && (
                      <View style={{ width: '100%', gap: 6 }}>
                        <Pressable
                          onPress={() => {
                            const targetUrl = orderData.payUrl || orderData.deeplink || orderData.checkoutUrl;
                            if (Platform.OS === 'web' && typeof window !== 'undefined') {
                              window.open(targetUrl, '_blank');
                            } else {
                              Linking.openURL(targetUrl).catch(() => {});
                            }
                          }}
                          style={{
                            backgroundColor: orderData.method === 'momo' ? '#A21CAF' : BRAND_COLORS.primary,
                            paddingVertical: 14,
                            paddingHorizontal: 20,
                            borderRadius: 14,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            width: '100%',
                            shadowColor: orderData.method === 'momo' ? '#A21CAF' : BRAND_COLORS.primary,
                            shadowOpacity: 0.25,
                            shadowRadius: 10,
                          }}
                        >
                          <ExternalLink size={16} color="#fff" />
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                            {orderData.method === 'momo' ? 'Mở Cổng / Ứng Dụng MoMo Để Thanh Toán' : 'Mở Trang Thanh Toán PayOS Trực Tiếp'}
                          </Text>
                        </Pressable>
                        {orderData.method === 'momo' && (
                          <Text style={{ fontSize: 11, color: '#64748B', textAlign: 'center' }}>
                            Khuyên dùng: Bấm nút trên để mở MoMo xác nhận thanh toán tức thì
                          </Text>
                        )}
                      </View>
                    )}

                    {/* Chi tiết thông tin chuyển khoản */}
                    <View style={{ width: '100%', backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#64748B' }}>Mã đơn hàng:</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>{orderData.orderId || orderData.orderCode}</Text>
                      </View>

                      {orderData.method === 'payos' && (
                        <>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontSize: 12, color: '#64748B' }}>Ngân hàng:</Text>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>MBBank (Quân Đội)</Text>
                          </View>

                          {orderData.accountNumber && (
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={{ fontSize: 12, color: '#64748B' }}>Số tài khoản:</Text>
                              <Pressable
                                onPress={() => handleCopy(orderData.accountNumber, 'acc')}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}
                              >
                                <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F172A' }}>{orderData.accountNumber}</Text>
                                {copiedField === 'acc' ? <CheckCircle2 size={13} color="#10B981" /> : <Copy size={13} color="#64748B" />}
                              </Pressable>
                            </View>
                          )}

                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontSize: 12, color: '#64748B' }}>Chủ tài khoản:</Text>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>{orderData.accountName || 'MAI TUAN VINH'}</Text>
                          </View>

                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontSize: 12, color: '#64748B' }}>Số tiền:</Text>
                            <Pressable
                              onPress={() => handleCopy(String(orderData.amount), 'amount')}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '800', color: '#047857' }}>{formatVND(orderData.amount)}</Text>
                              {copiedField === 'amount' ? <CheckCircle2 size={13} color="#10B981" /> : <Copy size={13} color="#047857" />}
                            </Pressable>
                          </View>

                          <View style={{ backgroundColor: '#FEF3C7', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#FDE68A', gap: 4 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E' }}>Nội dung chuyển khoản (bắt buộc):</Text>
                              <Pressable
                                onPress={() => handleCopy(transferContent, 'content')}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FDE68A', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '800', color: '#78350F' }}>Sao chép</Text>
                                {copiedField === 'content' ? <CheckCircle2 size={13} color="#047857" /> : <Copy size={13} color="#78350F" />}
                              </Pressable>
                            </View>
                            <Text style={{ fontSize: 13, fontWeight: '900', color: '#B45309', letterSpacing: 0.5 }}>{transferContent}</Text>
                            <Text style={{ fontSize: 10, color: '#A16207' }}>* Giữ nguyên nội dung này để hệ thống kích hoạt tự động</Text>
                          </View>
                        </>
                      )}

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#64748B' }}>Phương thức:</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: orderData.method === 'momo' ? '#A21CAF' : '#0F172A' }}>
                          {orderData.method === 'momo' ? 'Ví Điện Tử MoMo 💜' : 'VietQR (Chuyển khoản 24/7)'}
                        </Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ActivityIndicator size="small" color={orderData.method === 'momo' ? '#A21CAF' : '#10B981'} />
                      <Text style={{ fontSize: 12, color: orderData.method === 'momo' ? '#86198F' : '#047857', fontWeight: '600' }}>
                        Hệ thống đang tự động lắng nghe giao dịch...
                      </Text>
                    </View>
                  </View>
                ) : (
                  <>
                    {/* Báo lỗi nếu có */}
                    {errorMessage ? (
                      <View style={{ backgroundColor: '#FEF2F2', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#FECACA', flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                        <AlertTriangle size={18} color="#DC2626" />
                        <Text style={{ fontSize: 13, color: '#991B1B', fontWeight: '600', flex: 1 }}>{errorMessage}</Text>
                      </View>
                    ) : null}

                    {/* Danh sách các gói (Render động từ API plans) */}
                    <View style={{ gap: 12 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#1B3A2D', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        1. Chọn Gói Dịch Vụ
                      </Text>

                      {plansLoading ? (
                        <View style={{ paddingVertical: 36, alignItems: 'center', gap: 8 }}>
                          <ActivityIndicator size="small" color={BRAND_COLORS.primary} />
                          <Text style={{ fontSize: 12, color: '#64748B' }}>Đang nạp bảng giá gói cước...</Text>
                        </View>
                      ) : plans.length === 0 ? (
                        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                          <Text style={{ fontSize: 13, color: '#64748B' }}>Hiện chưa có gói cước nào được kích hoạt.</Text>
                        </View>
                      ) : (
                        <View
                          style={{
                            flexDirection: 'row',
                            flexWrap: 'wrap',
                            gap: 12,
                          }}
                        >
                          {plans.map((plan) => {
                            const isSelected = selectedPlan === plan.id;
                            const isDuration = (plan.duration_days ?? 0) > 0;
                            const badge = isDuration ? '👑 THEO THỜI HẠN' : '⚡ THEO LƯỢT';
                            const durationLabel = isDuration
                              ? `Có hạn ${plan.duration_days} ngày`
                              : 'Không giới hạn thời gian';
                            const quotaBenefit = isDuration
                              ? `+${plan.quota_total_grant} lượt Pro trong ${plan.duration_days} ngày`
                              : `+${plan.quota_total_grant} lượt tạo/nâng cấp chuyến đi Pro vĩnh viễn`;
                            const desc = getPlanDescription(plan);
                            const features = plan.features && plan.features.length > 0
                              ? plan.features
                              : [
                                  quotaBenefit,
                                  'Đầy đủ tính năng AI Pro Live Map & Xếp lịch thông minh',
                                  durationLabel,
                                ];

                            return (
                              <Pressable
                                key={plan.id}
                                onPress={() => setSelectedPlan(plan.id)}
                                style={{
                                  flex: 1,
                                  minWidth: 210,
                                  borderRadius: 18,
                                  padding: 16,
                                  borderWidth: 2,
                                  borderColor: isSelected ? BRAND_COLORS.primary : '#CBD5E1',
                                  backgroundColor: isSelected ? '#F0FDF4' : '#ffffff',
                                  gap: 8,
                                  shadowColor: isSelected ? '#10B981' : 'transparent',
                                  shadowOpacity: 0.1,
                                  shadowRadius: 10,
                                }}
                              >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text style={{ fontSize: 24 }}>{plan.icon || (isDuration ? '👑' : '⚡')}</Text>
                                  <View style={{
                                    paddingHorizontal: 8,
                                    paddingVertical: 3,
                                    borderRadius: 10,
                                    backgroundColor: isSelected ? '#10B981' : (isDuration ? '#FEF3C7' : '#E0F2FE'),
                                  }}>
                                    <Text style={{
                                      fontSize: 10,
                                      fontWeight: '800',
                                      color: isSelected ? '#fff' : (isDuration ? '#B45309' : '#0369A1'),
                                    }}>
                                      {badge}
                                    </Text>
                                  </View>
                                </View>

                                <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A' }}>{plan.label}</Text>
                                <Text style={{ fontSize: 18, fontWeight: '900', color: BRAND_COLORS.primary }}>{formatVND(plan.amount)}</Text>

                                <View style={{
                                  backgroundColor: isSelected ? '#DCFCE7' : '#F1F5F9',
                                  paddingHorizontal: 8,
                                  paddingVertical: 4,
                                  borderRadius: 8,
                                  alignSelf: 'flex-start',
                                }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#166534' : '#475569' }}>
                                    ⏳ {durationLabel}
                                  </Text>
                                </View>

                                <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>{desc}</Text>

                                <View style={{ borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 8, gap: 4 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Check size={12} color="#10B981" />
                                    <Text style={{ fontSize: 11, color: '#166534', fontWeight: '700' }} numberOfLines={2}>
                                      {quotaBenefit}
                                    </Text>
                                  </View>
                                  {features.slice(1, 3).map((f, i) => (
                                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                      <Check size={12} color="#10B981" />
                                      <Text style={{ fontSize: 11, color: '#475569' }} numberOfLines={1}>{f}</Text>
                                    </View>
                                  ))}
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      )}

                      {/* Chú thích gia hạn chỉ hiện đúng với gói đang chọn */}
                      {selectedPlanObj && (
                        <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F1F5F9' }}>
                          <Text style={{ fontSize: 11, color: '#475569', fontStyle: 'italic' }}>
                            💡 {selectedPlanObj.duration_days > 0
                              ? `Mua khi còn hạn sẽ cộng dồn lượt và cộng thêm ${selectedPlanObj.duration_days} ngày.`
                              : `Cộng dồn ${selectedPlanObj.quota_total_grant} lượt, không thời hạn.`}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Phương thức thanh toán */}
                    <View style={{ gap: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#1B3A2D', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        2. Chọn Phương Thức Thanh Toán
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 12 }}>
                        {/* PayOS VietQR */}
                        <Pressable
                          onPress={() => setPaymentMethod('payos')}
                          style={{
                            flex: 1, padding: 14, borderRadius: 16, borderWidth: 1.5,
                            borderColor: paymentMethod === 'payos' ? BRAND_COLORS.primary : '#CBD5E1',
                            backgroundColor: paymentMethod === 'payos' ? '#F0FDF4' : '#fff',
                            flexDirection: 'row', alignItems: 'center', gap: 10,
                          }}
                        >
                          <CreditCard size={22} color={paymentMethod === 'payos' ? BRAND_COLORS.primary : '#64748B'} />
                          <View>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>VietQR (Ngân hàng)</Text>
                            <Text style={{ fontSize: 11, color: '#64748B' }}>Quét mã chuyển khoản tức thì</Text>
                          </View>
                        </Pressable>

                        {/* MoMo */}
                        <Pressable
                          onPress={() => setPaymentMethod('momo')}
                          style={{
                            flex: 1, padding: 14, borderRadius: 16, borderWidth: 1.5,
                            borderColor: paymentMethod === 'momo' ? '#A21CAF' : '#CBD5E1',
                            backgroundColor: paymentMethod === 'momo' ? '#FDF4FF' : '#fff',
                            flexDirection: 'row', alignItems: 'center', gap: 10,
                          }}
                        >
                          <Text style={{ fontSize: 20 }}>💜</Text>
                          <View>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>Ví MoMo</Text>
                            <Text style={{ fontSize: 11, color: '#64748B' }}>Cổng thanh toán điện tử MoMo</Text>
                          </View>
                        </Pressable>
                      </View>
                    </View>

                    {/* Nút thanh toán động theo gói đang chọn */}
                    <Pressable
                      onPress={handleCreateOrder}
                      disabled={loading || !selectedPlanObj}
                      style={{
                        backgroundColor: BRAND_COLORS.primary,
                        paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                        flexDirection: 'row', gap: 8, shadowColor: BRAND_COLORS.primary, shadowOpacity: 0.25, shadowRadius: 12,
                        opacity: loading || !selectedPlanObj ? 0.7 : 1,
                      }}
                    >
                      {loading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <ShieldCheck size={18} color="#fff" />
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                            {selectedPlanObj
                              ? `Thanh toán ${selectedPlanObj.label} — ${formatVND(selectedPlanObj.amount)}`
                              : 'Chọn gói cước để tiếp tục'}
                          </Text>
                        </>
                      )}
                    </Pressable>
                  </>
                )}
              </>
            )}

            {/* TAB 2: LỊCH SỬ GIAO DỊCH */}
            {activeTab === 'history' && (
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#1B3A2D' }}>
                    Lịch Sử Đơn Hàng Của Bạn
                  </Text>
                  <Pressable onPress={() => refetchHistory()} style={{ padding: 6, borderRadius: 8, backgroundColor: '#F1F5F9' }}>
                    <RefreshCw size={14} color="#475569" />
                  </Pressable>
                </View>

                {historyLoading ? (
                  <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={BRAND_COLORS.primary} />
                  </View>
                ) : !historyData?.orders || historyData.orders.length === 0 ? (
                  <View style={{ paddingVertical: 40, alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 32 }}>📜</Text>
                    <Text style={{ fontSize: 14, color: '#64748B', fontWeight: '600' }}>Bạn chưa có giao dịch nào.</Text>
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    {historyData.orders.map((order) => {
                      const isCompleted = order.status === 'completed' || order.status === 'success';
                      const isPending = order.status === 'pending';
                      const matchingPlan = plans.find((p) => p.id === order.plan);
                      const orderPlanLabel = matchingPlan?.label || order.plan || 'Gói Pro';
                      const orderCodeLabel = order.order_code ? `#${order.order_code}` : `#${order.id.slice(0, 8)}`;
                      const methodLabel = order.method === 'momo' ? 'MoMo' : (order.method === 'payos' ? 'VietQR' : String(order.method || 'VietQR').toUpperCase());
                      const statusLabel = isCompleted ? 'THÀNH CÔNG' : (isPending ? 'CHỜ THANH TOÁN' : 'ĐÃ HỦY');
                      const statusBg = isCompleted ? '#DCFCE7' : (isPending ? '#FEF9C3' : '#FEE2E2');
                      const statusColor = isCompleted ? '#166534' : (isPending ? '#854D0E' : '#991B1B');
                      const createdDateStr = order.created_at
                        ? new Date(order.created_at).toLocaleString('vi-VN')
                        : 'Vừa xong';

                      return (
                        <View
                          key={order.id}
                          style={{
                            padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
                            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                          }}
                        >
                          <View style={{ gap: 4, flex: 1, marginRight: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>
                                Mã: {orderCodeLabel}
                              </Text>
                              <View style={{
                                paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
                                backgroundColor: statusBg,
                              }}>
                                <Text style={{
                                  fontSize: 10, fontWeight: '800',
                                  color: statusColor,
                                }}>
                                  {statusLabel}
                                </Text>
                              </View>
                            </View>
                            <Text style={{ fontSize: 12, color: '#334155', fontWeight: '600' }}>
                              Gói: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{orderPlanLabel}</Text>
                            </Text>
                            <Text style={{ fontSize: 11, color: '#64748B' }}>
                              Phương thức: {methodLabel} • {createdDateStr}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 15, fontWeight: '900', color: isCompleted ? '#059669' : '#0F172A' }}>
                            {formatVND(order.amount)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
