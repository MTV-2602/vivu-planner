import { useState, useEffect } from 'react';
import {
  View, Text, Pressable, Modal, ScrollView,
  ActivityIndicator, Platform, Linking,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  X, Crown, Sparkles, Check, Clock, AlertTriangle,
  History, ArrowRight, ExternalLink, RefreshCw,
  ShieldCheck, CreditCard, ChevronRight,
} from 'lucide-react-native';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { BRAND_COLORS } from '../constants';

interface PremiumModalProps {
  visible: boolean;
  onClose: () => void;
  onActivated?: () => void;
}

const PLANS = [
  {
    id: 'plus',
    label: 'Gói Starter',
    icon: '⚡',
    price: '29.000đ',
    quota: '10 lượt tạo / tháng',
    popular: false,
    badge: 'TIẾT KIỆM',
    features: [
      '10 chuyến đi chi tiết bằng AI',
      'Bản đồ tương tác OpenStreetMap',
      'Dự báo thời tiết thông minh',
      'Đề xuất chi phí dự kiến',
    ],
  },
  {
    id: 'pro',
    label: 'Gói Premium',
    icon: '👑',
    price: '49.000đ',
    quota: 'AI Vô hạn',
    popular: true,
    badge: 'ƯU VIỆT NHẤT',
    features: [
      'Tạo lịch trình AI KHÔNG GIỚI HẠN',
      'Bản đồ tương tác đầy đủ tính năng',
      'Xuất file PDF lịch trình du lịch',
      'Tự động xử lý sự cố & thời tiết xấu',
      'Trợ lý Chatbot AI đồng hành 24/7',
    ],
  },
];

interface OrderHistoryItem {
  id: string;
  amount: number;
  plan: string;
  method: string;
  status: string;
  order_code: string;
  created_at: string;
}

export default function PremiumModal({ visible, onClose, onActivated }: PremiumModalProps) {
  const [activeTab, setActiveTab] = useState<'upgrade' | 'history'>('upgrade');
  const [selectedPlan, setSelectedPlan] = useState('pro');
  const [paymentMethod, setPaymentMethod] = useState<'payos' | 'momo'>('payos');
  const [loading, setLoading] = useState(false);
  const [orderData, setOrderData] = useState<any>(null);
  const [activated, setActivated] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [timeLeft, setTimeLeft] = useState(600); // 10 phút đếm ngược

  // Lấy trạng thái gói dịch vụ hiện tại
  const { data: statusData, refetch: refetchStatus } = useQuery({
    queryKey: ['paymentStatusModal'],
    queryFn: async () => {
      const res = await api.get('/payment/status');
      return res.data;
    },
    enabled: visible,
  });

  // Lấy giá các gói dịch vụ thời gian thực
  const { data: plansData, refetch: refetchPlans } = useQuery({
    queryKey: ['paymentPlansModal'],
    queryFn: async () => {
      const res = await api.get('/payment/plans');
      return res.data;
    },
    staleTime: 10000,
    enabled: visible,
  });

  // Lắng nghe thay đổi giá từ Supabase Realtime
  useEffect(() => {
    let channel: any = null;
    try {
      const channelName = `pricing_realtime_modal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
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
      console.warn('[Realtime] PremiumModal subscribe failed:', err);
    }

    return () => {
      try {
        if (channel) supabase.removeChannel(channel);
      } catch (err) {}
    };
  }, []);

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
  }, [visible]);

  // Bộ đếm ngược 10 phút khi có đơn hàng
  useEffect(() => {
    if (!orderData || activated) return;
    setTimeLeft(600);
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setErrorMessage('Đơn thanh toán đã hết hạn 10 phút. Vui lòng tạo lại đơn mới.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [orderData, activated]);

  // Polling tự động kiểm tra thanh toán thành công
  useEffect(() => {
    if (!orderData || activated) return;
    const targetCode = orderData.orderId || orderData.orderCode;

    const interval = setInterval(async () => {
      try {
        if (targetCode) {
          const checkRes = await api.get(`/payment/check-order/${targetCode}`);
          if (checkRes.data?.paid) {
            clearInterval(interval);
            setActivated(true);
            onActivated?.();
            return;
          }
        }
        const { data } = await api.get('/payment/status');
        if (data.isPremium && !statusData?.isPremium) {
          clearInterval(interval);
          setActivated(true);
          onActivated?.();
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [orderData, activated, statusData?.isPremium]);

  const handleCreateOrder = async () => {
    setLoading(true);
    setOrderData(null);
    setErrorMessage('');
    try {
      const { data } = await api.post('/payment/create-order', {
        method: paymentMethod,
        plan: selectedPlan,
      });
      setOrderData(data);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.details || err.message;
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = () => {
    setOrderData(null);
    setErrorMessage('');
  };

  const isCurrentPremium = !!statusData?.isPremium;
  const isCurrentStarter = statusData?.planId === 'starter' || (isCurrentPremium && statusData?.tripsQuota <= 10);
  const isCurrentPro = isCurrentPremium && !isCurrentStarter;

  const plusAmount = plansData?.plans?.plus?.amount ?? plansData?.plans?.starter?.amount ?? 29000;
  const proAmount = plansData?.plans?.pro?.amount ?? plansData?.plans?.premium?.amount ?? 49000;

  const formattedPlusPrice = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(plusAmount);
  const formattedProPrice = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(proAmount);

  const dynamicPlans = PLANS.map(plan => {
    const isStarter = plan.id === 'plus' || plan.id === 'starter';
    return {
      ...plan,
      price: isStarter ? formattedPlusPrice : formattedProPrice,
      rawAmount: isStarter ? plusAmount : proAmount,
    };
  });

  // Thành công screen
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

  // Build QR image URL
  let qrImage = '';
  if (orderData) {
    const directQr = orderData.qrCode || orderData.qrCodeUrl;
    const webUrl = orderData.checkoutUrl || orderData.payUrl;
    const momoDeeplink = orderData.deeplink;

    if (directQr) {
      const isImageUrl = directQr.startsWith('data:image/') || (directQr.startsWith('http') && (directQr.includes('vietqr.io') || directQr.includes('.png') || directQr.includes('.jpg')));
      if (isImageUrl) qrImage = directQr;
      else qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(directQr)}`;
    } else if (orderData.accountNumber && orderData.amount) {
      const bin = orderData.bin || 'MB';
      qrImage = `https://img.vietqr.io/image/${bin}-${orderData.accountNumber}-compact2.png?amount=${orderData.amount}&addInfo=VIVU${orderData.orderCode || ''}&accountName=${encodeURIComponent(orderData.accountName || 'VIVU PLANNER')}`;
    } else if (orderData.method === 'momo' && (momoDeeplink || webUrl)) {
      const target = momoDeeplink || webUrl;
      qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(target)}`;
    } else if (webUrl) {
      qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(webUrl)}`;
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
            maxWidth: 680,
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
                {/* Banner trạng thái hiện tại */}
                <View
                  style={{
                    backgroundColor: isCurrentPremium ? '#FEFCE8' : '#F8FAFC',
                    borderColor: isCurrentPremium ? '#FDE047' : '#E2E8F0',
                    borderWidth: 1.5, borderRadius: 16, padding: 14, gap: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {isCurrentPremium ? <Crown size={20} color="#CA8A04" /> : <Sparkles size={20} color="#64748B" />}
                      <Text style={{ fontSize: 13, fontWeight: '800', color: isCurrentPremium ? '#854D0E' : '#334155' }}>
                        Gói hiện tại: {statusData?.planName || (isCurrentPremium ? 'Gói Pro' : 'Gói Miễn Phí')}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: isCurrentPremium ? '#CA8A04' : '#64748B', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 }}>
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
                        {isCurrentPremium ? 'ĐANG HOẠT ĐỘNG' : 'MIỄN PHÍ'}
                      </Text>
                    </View>
                  </View>
                  {isCurrentPremium && statusData?.premiumUntil && (
                    <Text style={{ fontSize: 12, color: '#A16207' }}>
                      📅 Hạn dùng: <Text style={{ fontWeight: '800', color: '#854D0E' }}>{new Date(statusData.premiumUntil).toLocaleDateString('vi-VN')}</Text> (Còn {Math.max(0, Math.ceil((new Date(statusData.premiumUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} ngày) — Nạp tiếp sẽ được <Text style={{ fontWeight: '800', color: '#854D0E' }}>gia hạn cộng dồn thêm 30 ngày</Text>.
                    </Text>
                  )}
                </View>

                {/* Khi Đang Hiển Thị Mã QR Thanh Toán */}
                {orderData ? (
                  <View style={{ backgroundColor: '#F8FAFC', borderRadius: 20, padding: 20, borderWidth: 1.5, borderColor: orderData.method === 'momo' ? '#E879F9' : '#CBD5E1', alignItems: 'center', gap: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Clock size={16} color="#DC2626" />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#DC2626' }}>
                          Mã QR hết hạn sau: {formatTime(timeLeft)}
                        </Text>
                      </View>
                      <Pressable onPress={handleCancelOrder} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#E2E8F0' }}>
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
                        <Text style={{ marginTop: 10, fontSize: 15, fontWeight: '800', color: orderData.method === 'momo' ? '#86198F' : '#065F46' }}>
                          {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(orderData.amount || (selectedPlan === 'plus' ? plusAmount : proAmount))}
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
                          paddingVertical: 12,
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
                          {orderData.method === 'momo' ? 'Mở Cổng / Ứng Dụng MoMo Để Thanh Toán' : 'Mở Trang Thanh Toán Trực Tiếp'}
                        </Text>
                      </Pressable>
                    )}

                    {/* Thông tin chuyển khoản */}
                    <View style={{ width: '100%', backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 12, color: '#64748B' }}>Mã đơn hàng:</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>{orderData.orderId || orderData.orderCode}</Text>
                      </View>
                      {orderData.accountNumber && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 12, color: '#64748B' }}>Số tài khoản:</Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>{orderData.accountNumber} ({orderData.bin || 'MBBank'})</Text>
                        </View>
                      )}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
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

                    {/* Danh sách các gói */}
                    <View style={{ gap: 12 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#1B3A2D', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        1. Chọn Gói Dịch Vụ
                      </Text>

                      <View style={{ flexDirection: 'row', gap: 14 }}>
                        {dynamicPlans.map(plan => {
                          const isSelected = selectedPlan === plan.id;
                          const isStarter = plan.id === 'plus';
                          // Chặn mua Starter nếu user đang là Pro
                          const isDowngradeDisabled = isCurrentPro && isStarter;

                          return (
                            <Pressable
                              key={plan.id}
                              onPress={() => {
                                if (!isDowngradeDisabled) setSelectedPlan(plan.id);
                              }}
                              disabled={isDowngradeDisabled}
                              style={{
                                flex: 1,
                                borderRadius: 18,
                                padding: 16,
                                borderWidth: 2,
                                borderColor: isSelected ? BRAND_COLORS.primary : (isDowngradeDisabled ? '#E2E8F0' : '#CBD5E1'),
                                backgroundColor: isSelected ? '#F0FDF4' : (isDowngradeDisabled ? '#F8FAFC' : '#ffffff'),
                                opacity: isDowngradeDisabled ? 0.55 : 1,
                                gap: 8,
                                shadowColor: isSelected ? '#10B981' : 'transparent',
                                shadowOpacity: 0.1,
                                shadowRadius: 10,
                              }}
                            >
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={{ fontSize: 24 }}>{plan.icon}</Text>
                                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: isSelected ? '#10B981' : '#F1F5F9' }}>
                                  <Text style={{ fontSize: 10, fontWeight: '800', color: isSelected ? '#fff' : '#64748B' }}>
                                    {isDowngradeDisabled ? 'ĐANG DÙNG GÓI CAO HƠN' : plan.badge}
                                  </Text>
                                </View>
                              </View>

                              <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A' }}>{plan.label}</Text>
                              <Text style={{ fontSize: 18, fontWeight: '900', color: BRAND_COLORS.primary }}>{plan.price}</Text>
                              <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>{plan.quota}</Text>

                              <View style={{ borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 8, gap: 4 }}>
                                {plan.features.slice(0, 3).map((f, i) => (
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

                    {/* Nút hành động */}
                    <Pressable
                      onPress={handleCreateOrder}
                      disabled={loading || (isCurrentPro && selectedPlan === 'plus')}
                      style={{
                        backgroundColor: (isCurrentPro && selectedPlan === 'plus') ? '#94A3B8' : BRAND_COLORS.primary,
                        paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                        flexDirection: 'row', gap: 8, shadowColor: BRAND_COLORS.primary, shadowOpacity: 0.25, shadowRadius: 12,
                      }}
                    >
                      {loading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <ShieldCheck size={18} color="#fff" />
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                            {isCurrentPro && selectedPlan === 'pro'
                              ? `Gia Hạn Gói Premium (${formattedProPrice} / +30 ngày)`
                              : isCurrentStarter && selectedPlan === 'plus'
                              ? `Gia Hạn Gói Starter (${formattedPlusPrice} / +30 ngày)`
                              : selectedPlan === 'plus'
                              ? `Thanh Toán Gói Starter (${formattedPlusPrice})`
                              : `Thanh Toán Gói Premium (${formattedProPrice})`}
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
                    {historyData.orders.map(order => {
                      const isCompleted = order.status === 'completed' || order.status === 'success';
                      const isPending = order.status === 'pending';

                      return (
                        <View
                          key={order.id}
                          style={{
                            padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
                            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                          }}
                        >
                          <View style={{ gap: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>
                                {order.id}
                              </Text>
                              <View style={{
                                paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
                                backgroundColor: isCompleted ? '#DCFCE7' : (isPending ? '#FEF9C3' : '#F1F5F9'),
                              }}>
                                <Text style={{
                                  fontSize: 10, fontWeight: '800',
                                  color: isCompleted ? '#166534' : (isPending ? '#854D0E' : '#64748B'),
                                }}>
                                  {isCompleted ? 'THÀNH CÔNG' : (isPending ? 'CHỜ THANH TOÁN' : 'ĐÃ HỦY')}
                                </Text>
                              </View>
                            </View>
                            <Text style={{ fontSize: 12, color: '#64748B' }}>
                              {order.plan === 'plus' || order.plan === 'starter' ? 'Gói Starter' : 'Gói Premium'} • {order.method === 'momo' ? 'MoMo' : 'VietQR'} • {new Date(order.created_at).toLocaleDateString('vi-VN')}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: isCompleted ? '#059669' : '#0F172A' }}>
                            {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(order.amount)}
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
