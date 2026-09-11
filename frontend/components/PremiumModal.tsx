import { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, ScrollView, ActivityIndicator, Platform, Linking } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { X, Crown, Sparkles } from 'lucide-react-native';
import { api } from '../lib/api';
import { BRAND_COLORS } from '../constants';

interface PremiumModalProps {
  visible: boolean;
  onClose: () => void;
  onActivated?: () => void;
}

const PLANS = [
  { id: 'plus', label: 'Gói Starter', icon: '⚡', price: '29.000đ', quota: 'AI Vô hạn', popular: false, badge: 'ĐỀ XUẤT' },
  { id: 'pro', label: 'Gói Premium', icon: '👑', price: '49.000đ', quota: 'AI Vô hạn', popular: true, badge: 'ƯU VIỆT' },
];

export default function PremiumModal({ visible, onClose, onActivated }: PremiumModalProps) {
  const [selectedPlan, setSelectedPlan] = useState('pro');
  const [paymentMethod, setPaymentMethod] = useState<'payos' | 'momo'>('payos');
  const [loading, setLoading] = useState(false);
  const [orderData, setOrderData] = useState<any>(null);
  const [activated, setActivated] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const { data: statusData } = useQuery({
    queryKey: ['paymentStatusModal'],
    queryFn: async () => {
      const res = await api.get('/payment/status');
      return res.data;
    },
    enabled: visible,
  });

  const { data: plansData } = useQuery({
    queryKey: ['publicPlansModal'],
    queryFn: async () => {
      const res = await api.get('/payment/plans');
      return res.data;
    },
    enabled: visible,
  });

  const getPlanPrice = (planId: string, defaultPrice: string) => {
    if (!plansData?.plans) return defaultPrice;
    if (planId === 'plus' && plansData.plans.starter?.amount != null) {
      return `${plansData.plans.starter.amount.toLocaleString('vi-VN')}đ`;
    }
    if (planId === 'pro' && plansData.plans.premium?.amount != null) {
      return `${plansData.plans.premium.amount.toLocaleString('vi-VN')}đ`;
    }
    return defaultPrice;
  };

  useEffect(() => {
    if (!visible) {
      setOrderData(null);
      setActivated(false);
      setErrorMessage('');
    }
  }, [visible]);

  // 100% automatic server-side polling — no manual button
  useEffect(() => {
    if (!orderData || activated) return;
    // Always use orderId (VIVU-prefixed) — backend check-order normalizes both formats
    const targetCode = orderData.orderId || orderData.orderCode;
    let lastQuota = statusData?.tripsQuota ?? 0;

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
        } else if (data.tripsQuota > lastQuota) {
          clearInterval(interval);
          lastQuota = data.tripsQuota;
          setActivated(true);
          onActivated?.();
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [orderData, activated, statusData?.tripsQuota, statusData?.isPremium]);

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

  // Success screen
  if (activated) {
    const currentPlan = PLANS.find(p => p.id === selectedPlan) || PLANS[1];
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 28, padding: 36, alignItems: 'center', width: '100%', maxWidth: 420 }}>
            <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: '#e8f5f0', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 44 }}>🎉</Text>
            </View>
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#1B3A2D', marginBottom: 8, textAlign: 'center' }}>Thanh toán thành công!</Text>
            <Text style={{ color: '#047857', textAlign: 'center', marginBottom: 6, lineHeight: 20, fontWeight: '700', fontSize: 16 }}>
              Kích hoạt thành công {currentPlan.label}! ✨
            </Text>
            <Text style={{ color: '#666', textAlign: 'center', marginBottom: 24, lineHeight: 20, fontSize: 13 }}>
              Toàn bộ tính năng Bản đồ tương tác & Tải PDF của gói đã <Text style={{ fontWeight: '700', color: BRAND_COLORS.primary }}>sẵn sàng hoạt động</Text> trên tài khoản của bạn.
            </Text>
            <Pressable onPress={onClose} style={{ backgroundColor: BRAND_COLORS.primary, borderRadius: 50, paddingHorizontal: 36, paddingVertical: 14, width: '100%', alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Bắt đầu tạo chuyến đi ngay ✨</Text>
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
      // Check if it's a real image URL (png/jpg/vietqr) or a QR payload
      const isImageUrl = directQr.startsWith('data:image/') ||
        (directQr.startsWith('http') && (
          directQr.includes('vietqr.io') ||
          directQr.includes('.png') ||
          directQr.includes('.jpg')
        ));
      if (isImageUrl) {
        qrImage = directQr;
      } else {
        // EMVCo bank payload (000201...) or MoMo/PayOS web links → generate clean scannable QR
        qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(directQr)}`;
      }
    } else if (orderData.accountNumber && orderData.amount) {
      const bin = orderData.bin || 'MB';
      qrImage = `https://img.vietqr.io/image/${bin}-${orderData.accountNumber}-compact2.png?amount=${orderData.amount}&addInfo=VIVU${orderData.orderCode || ''}&accountName=${encodeURIComponent(orderData.accountName || 'VIVU PLANNER')}`;
    } else if (webUrl) {
      qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(webUrl)}`;
    }

    // For MoMo: prefer deeplink (opens MoMo app directly) over web URL for QR
    if (orderData.method === 'momo' && momoDeeplink && !directQr) {
      qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(momoDeeplink)}`;
    }
  }

  const externalUrl = orderData?.checkoutUrl || orderData?.payUrl;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 28, width: '100%', maxWidth: 680, maxHeight: '90%', overflow: 'hidden' }}>

          {/* Header */}
          <View style={{ backgroundColor: '#064E3B', padding: 24, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(16,185,129,0.25)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Sparkles size={24} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff' }}>👑 Kích Hoạt Tài Khoản ViVu Pro</Text>
                <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2, fontWeight: '500' }}>
                  Mở khóa trọn bộ đặc quyền cao cấp (Bản đồ tương tác & Tải PDF)
                </Text>
              </View>
            </View>
            <Pressable onPress={onClose} style={{ padding: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20 }}>
              <X size={20} color="#fff" />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24, gap: 20 }}>

            {/* Active Subscription Status */}
            {(() => {
              const getRemainingDays = (dateStr: string) => {
                if (!dateStr) return 0;
                const diff = new Date(dateStr).getTime() - Date.now();
                return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
              };

              return (
                <View style={{ backgroundColor: statusData?.isPremium ? '#FFFDF0' : '#F8FAFC', borderColor: statusData?.isPremium ? '#F59E0B' : '#E2E8F0', borderWidth: 1.5, borderRadius: 16, padding: 16, gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {statusData?.isPremium ? <Crown size={24} color="#D97706" /> : <Sparkles size={24} color="#64748B" />}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: statusData?.isPremium ? '#78350F' : '#334155' }}>
                        Gói dịch vụ hiện tại:
                      </Text>
                      <Text style={{ fontSize: 13, color: statusData?.isPremium ? '#B45309' : '#475569', fontWeight: '700', marginTop: 2 }}>
                        {statusData?.planName || 'Gói Miễn Phí (Basis)'}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: statusData?.isPremium ? '#F59E0B' : '#64748B', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
                        {statusData?.isPremium ? 'ĐANG HOẠT ĐỘNG' : 'MIỄN PHÍ'}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={{ borderTopWidth: 1, borderTopColor: statusData?.isPremium ? '#FEF3C7' : '#E2E8F0', paddingTop: 8, marginTop: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: statusData?.isPremium ? '#B45309' : '#64748B', fontWeight: '500' }}>
                      Hạn sử dụng:
                    </Text>
                    <Text style={{ fontSize: 12, color: statusData?.isPremium ? '#78350F' : '#334155', fontWeight: '800' }}>
                      {statusData?.isPremium 
                        ? (statusData.premiumUntil ? `${new Date(statusData.premiumUntil).toLocaleDateString('vi-VN')} (Còn ${getRemainingDays(statusData.premiumUntil)} ngày)` : 'Vô hạn')
                        : 'Không giới hạn tạo AI (Bản đồ & PDF bị khóa)'
                      }
                    </Text>
                  </View>
                </View>
              );
            })()}

            {/* Package Grid */}
            <View>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#064E3B', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                1. Chọn gói dịch vụ nâng cấp (Theo tháng)
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {PLANS.map(plan => {
                  const isSelected = selectedPlan === plan.id;
                  return (
                    <Pressable
                      key={plan.id}
                      onPress={() => { setSelectedPlan(plan.id); setOrderData(null); setErrorMessage(''); }}
                      style={{
                        flex: 1, minWidth: 180, borderRadius: 16, borderWidth: isSelected ? 2.5 : 1.5,
                        borderColor: isSelected ? '#059669' : '#e2e8f0',
                        backgroundColor: isSelected ? '#F0FDF4' : '#ffffff',
                        padding: 16, position: 'relative', cursor: 'pointer' as any,
                      }}
                    >
                      {plan.badge && (
                        <View style={{ position: 'absolute', top: -10, right: 12, backgroundColor: plan.popular ? '#D4A017' : '#059669', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{plan.badge}</Text>
                        </View>
                      )}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 16 }}>{plan.icon}</Text>
                        <Text style={{ fontWeight: '800', color: isSelected ? '#064E3B' : '#1e293b', fontSize: 15 }}>{plan.label}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginVertical: 6 }}>
                        <Text style={{ fontWeight: '800', color: '#059669', fontSize: 20 }}>{getPlanPrice(plan.id, plan.price)}</Text>
                      </View>
                      <View style={{ backgroundColor: isSelected ? '#DCFCE7' : '#f1f5f9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: isSelected ? '#047857' : '#475569' }}>✨ {plan.quota}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Selected Plan Features */}
            {(() => {
              const currentPlan = PLANS.find(p => p.id === selectedPlan) || PLANS[1];
              return (
                <View style={{ backgroundColor: '#ECFDF5', borderColor: '#059669', borderWidth: 1.5, borderRadius: 16, padding: 18, gap: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#A7F3D0', paddingBottom: 8 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#064E3B' }}>✨ Mở khóa trọn bộ đặc quyền {currentPlan.label} ({currentPlan.price})</Text>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#059669', backgroundColor: '#DCFCE7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>{currentPlan.quota}</Text>
                  </View>
                  <View style={{ gap: 6 }}>
                    {selectedPlan === 'plus' ? (
                      <>
                        <Text style={{ fontSize: 13, color: '#047857', fontWeight: '700', lineHeight: 18 }}>🚀 Tạo lịch trình du lịch bằng AI không giới hạn</Text>
                        <Text style={{ fontSize: 13, color: '#047857', fontWeight: '600', lineHeight: 18 }}>🚫 Get rid of ads (Loại bỏ hoàn toàn quảng cáo)</Text>
                        <Text style={{ fontSize: 13, color: '#047857', fontWeight: '600', lineHeight: 18 }}>🗺️ Hidden gems tại 15 tỉnh/thành phố phổ biến nhất</Text>
                        <Text style={{ fontSize: 13, color: '#047857', fontWeight: '600', lineHeight: 18 }}>📈 Scenic Score cảnh quan & Tối ưu hóa lộ trình qua điểm ẩn</Text>
                        <Text style={{ fontSize: 13, color: '#047857', fontWeight: '600', lineHeight: 18 }}>⏱️ Tối ưu hóa thời gian di chuyển & thời gian tham quan</Text>
                        <Text style={{ fontSize: 13, color: '#047857', fontWeight: '600', lineHeight: 18 }}>📊 Công cụ quản lý ngân sách độc quyền</Text>
                      </>
                    ) : (
                      <>
                        <Text style={{ fontSize: 13, color: '#047857', fontWeight: '700', lineHeight: 18 }}>🚀 Tạo lịch trình du lịch bằng AI không giới hạn</Text>
                        <Text style={{ fontSize: 13, color: '#047857', fontWeight: '700', lineHeight: 18 }}>⚡ Bao gồm tất cả tính năng của gói Starter</Text>
                        <Text style={{ fontSize: 13, color: '#047857', fontWeight: '600', lineHeight: 18 }}>🏔️ "Super hidden gems" cho 10+ tỉnh vùng núi & vùng biển độc lạ</Text>
                        <Text style={{ fontSize: 13, color: '#047857', fontWeight: '600', lineHeight: 18 }}>🏨 Chỗ nghỉ, quán ăn bản địa và dịch vụ thuê xe được tuyển chọn kỹ</Text>
                        <Text style={{ fontSize: 13, color: '#047857', fontWeight: '600', lineHeight: 18 }}>👥 Cho phép thành viên nhóm cùng truy cập & sửa đổi lịch trình</Text>
                        <Text style={{ fontSize: 13, color: '#047857', fontWeight: '600', lineHeight: 18 }}>🍀 Đo lường và tính toán lượng dấu chân carbon (Carbon Footprint)</Text>
                      </>
                    )}
                  </View>
                </View>
              );
            })()}

            {/* Payment Method Selector — only show when no active order */}
            {!orderData && (
              <View>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#064E3B', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  2. Phương thức thanh toán
                </Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  {(['payos', 'momo'] as const).map(method => {
                    const isSel = paymentMethod === method;
                    return (
                      <Pressable
                        key={method}
                        onPress={() => { setPaymentMethod(method); setErrorMessage(''); }}
                        style={{
                          flex: 1, borderRadius: 14, borderWidth: isSel ? 2.5 : 1.5,
                          borderColor: isSel ? '#059669' : '#e2e8f0',
                          backgroundColor: isSel ? '#F0FDF4' : '#ffffff',
                          padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
                          cursor: 'pointer' as any,
                        }}
                      >
                        <Text style={{ fontSize: 26 }}>{method === 'payos' ? '🏦' : '💜'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontWeight: '800', color: isSel ? '#064E3B' : '#1e293b', fontSize: 14 }}>
                            {method === 'payos' ? 'PayOS (Ngân hàng)' : 'Ví MoMo'}
                          </Text>
                          <Text style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                            {method === 'payos' ? 'Cổng thanh toán PayOS' : 'Cổng thanh toán Ví MoMo'}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* QR Code Display */}
            {orderData && (
              <View style={{ backgroundColor: '#f8f4ec', borderRadius: 20, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#e0dbd0' }}>
                <Text style={{ fontWeight: '800', color: '#1B3A2D', fontSize: 16, marginBottom: 4 }}>
                  {orderData.method === 'payos' ? '🏦 Cổng thanh toán PayOS' : '💜 Cổng thanh toán MoMo'}
                </Text>
                <Text style={{ color: '#888', fontSize: 12, marginBottom: 16, textAlign: 'center' }}>
                  Quét mã QR bên dưới hoặc nhấn nút để mở trang thanh toán chính thức
                </Text>

                {qrImage ? (
                  Platform.OS === 'web' ? (
                    // @ts-ignore
                    <img
                      src={qrImage}
                      alt="Payment QR"
                      style={{ width: 220, height: 220, borderRadius: 16, border: '3px solid #1F6F54', padding: 8, backgroundColor: '#fff' }}
                    />
                  ) : (
                    <View style={{ width: 200, height: 200, backgroundColor: '#fff', borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: BRAND_COLORS.primary }}>
                      <Text style={{ fontSize: 32 }}>📱</Text>
                      <Text style={{ color: '#888', fontSize: 12, marginTop: 8 }}>Mở trên trình duyệt web</Text>
                    </View>
                  )
                ) : null}

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 }}>
                  <ActivityIndicator size="small" color={BRAND_COLORS.primary} />
                  <Text style={{ color: '#666', fontSize: 12, fontWeight: '600' }}>Tự động kiểm tra giao dịch...</Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, width: '100%' }}>
                  {externalUrl && (
                    <Pressable
                      onPress={() => {
                        if (Platform.OS === 'web') window.open(externalUrl, '_blank');
                        else Linking.openURL(externalUrl);
                      }}
                      style={{ flex: 1, backgroundColor: orderData.method === 'momo' ? '#a50064' : '#334155', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                        {orderData.method === 'momo' ? '💜 Mở MoMo ↗' : '🏦 Mở PayOS ↗'}
                      </Text>
                    </Pressable>
                  )}
                  {/* Cancel button — switch payment method */}
                  <Pressable
                    onPress={handleCancelOrder}
                    style={{ flex: 1, backgroundColor: '#f1f5f9', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' }}
                  >
                    <Text style={{ color: '#64748b', fontWeight: '700', fontSize: 13 }}>✕ Đổi phương thức</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Error Display */}
            {errorMessage ? (
              <View style={{ backgroundColor: '#fee2e2', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#fca5a5' }}>
                <Text style={{ color: '#991b1b', fontWeight: '700', fontSize: 13, marginBottom: 4 }}>❌ Khởi tạo thanh toán chưa thành công:</Text>
                <Text style={{ color: '#7f1d1d', fontSize: 12 }}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* Main Action Button */}
            {!orderData && (() => {
              const currentPlan = PLANS.find(p => p.id === selectedPlan) || PLANS[1];
              return (
                <Pressable
                  onPress={handleCreateOrder}
                  disabled={loading}
                  style={{ backgroundColor: '#059669', borderRadius: 16, padding: 18, alignItems: 'center', cursor: 'pointer' as any }}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                      {paymentMethod === 'payos'
                        ? `🏦 Tạo mã VietQR nạp ${currentPlan.label} (${currentPlan.price})`
                        : `💜 Thanh toán MoMo ${currentPlan.label} (${currentPlan.price})`}
                    </Text>
                  )}
                </Pressable>
              );
            })()}

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
