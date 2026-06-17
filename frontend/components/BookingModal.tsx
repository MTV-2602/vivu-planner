import { useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { X, User, Mail, Phone, Users, Check, ShoppingBag } from 'lucide-react-native';
import { apiClient } from '../lib/apiClient';
import { BRAND_COLORS } from '../constants';

export interface BookableItem {
  id: string;
  title: string;
  item_type: string;
  start_time?: string;
  estimated_cost?: number | null;
  day_number?: number;
}

interface BookingModalProps {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  tripTitle: string;
  destinationCity: string;
  startDate: string;
  endDate: string;
  travelerCount?: number;
  selectedItems: BookableItem[];
}

const TYPE_EMOJI: Record<string, string> = {
  accommodation: '🏨', dining: '🍽️', attraction: '🏔️', rental: '🛵', experience: '✨', transport: '🚌',
};

function formatCost(cost?: number | null): string {
  if (cost == null) return 'Liên hệ';
  if (cost === 0) return 'Miễn phí';
  return `${Number(cost).toLocaleString('vi-VN')}đ`;
}

export default function BookingModal({
  visible, onClose, tripId, tripTitle, destinationCity, startDate, endDate,
  travelerCount = 1, selectedItems
}: BookingModalProps) {
  const [step, setStep] = useState<'form' | 'sending' | 'email'>('form');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestCount, setGuestCount] = useState(String(travelerCount));
  const [bookingResult, setBookingResult] = useState<any>(null);
  const [emailConfirmed, setEmailConfirmed] = useState(false);

  const totalCost = selectedItems.reduce((sum, item) => sum + (item.estimated_cost || 0), 0);
  const bookableItems = selectedItems.filter(i => ['accommodation', 'dining', 'attraction', 'rental'].includes(i.item_type));

  const handleSubmit = async () => {
    if (!guestName.trim() || !guestEmail.trim()) {
      alert('Vui lòng nhập họ tên và email để nhận email xác nhận.');
      return;
    }
    setStep('sending');
    try {
      const { data } = await apiClient.post('/payment/bookings', {
        tripId, tripTitle, destinationCity, startDate, endDate,
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim(),
        guestPhone: guestPhone.trim(),
        guestCount: parseInt(guestCount) || travelerCount,
        selectedItems: bookableItems.map(item => ({
          title: item.title,
          item_type: item.item_type,
          start_time: item.start_time,
          estimated_cost: item.estimated_cost,
        })),
        totalCost,
      });
      setBookingResult(data);
      setStep('email');
    } catch (err: any) {
      setStep('form');
      alert('Lỗi đặt dịch vụ: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleConfirmBooking = async () => {
    // Simulate clicking the confirm link (demo mode)
    setEmailConfirmed(true);
    onClose();
    setTimeout(() => {
      setStep('form');
      setEmailConfirmed(false);
      setBookingResult(null);
    }, 500);
  };

  const handleClose = () => {
    setStep('form');
    setBookingResult(null);
    setEmailConfirmed(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '95%' }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f0ebe0' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ShoppingBag size={20} color={BRAND_COLORS.primary} />
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#1B3A2D' }}>
                {step === 'email' ? '📧 Email Xác Nhận (Demo)' : '⚡ Đặt Trọn Gói 1-Click'}
              </Text>
            </View>
            <Pressable onPress={handleClose}><X size={22} color="#888" /></Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
            {step === 'form' && (
              <>
                {/* Selected Items Summary */}
                <View style={{ backgroundColor: '#f8f4ec', borderRadius: 14, padding: 16, marginBottom: 20 }}>
                  <Text style={{ fontWeight: '700', color: '#1B3A2D', marginBottom: 10, fontSize: 14 }}>
                    📋 {bookableItems.length} dịch vụ đã chọn
                  </Text>
                  {bookableItems.map((item, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: idx < bookableItems.length - 1 ? 1 : 0, borderBottomColor: '#ede8da' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <Text style={{ fontSize: 16 }}>{TYPE_EMOJI[item.item_type] || '📍'}</Text>
                        <Text style={{ color: '#333', fontSize: 13, flex: 1 }} numberOfLines={1}>{item.title}</Text>
                      </View>
                      <Text style={{ color: BRAND_COLORS.primary, fontSize: 12, fontWeight: '700' }}>{formatCost(item.estimated_cost)}</Text>
                    </View>
                  ))}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#ede8da' }}>
                    <Text style={{ fontWeight: '700', color: '#1B3A2D' }}>Tổng ước tính</Text>
                    <Text style={{ fontWeight: '800', color: BRAND_COLORS.primary, fontSize: 16 }}>{totalCost.toLocaleString('vi-VN')}đ</Text>
                  </View>
                </View>

                {/* Form */}
                <Text style={{ fontWeight: '700', color: '#888', fontSize: 13, marginBottom: 14, textTransform: 'uppercase', letterSpacing: 1 }}>Thông tin liên lạc</Text>
                {[
                  { icon: User, label: 'Họ và tên *', value: guestName, setter: setGuestName, placeholder: 'Nguyễn Văn A', keyboard: 'default' as const },
                  { icon: Mail, label: 'Email nhận xác nhận *', value: guestEmail, setter: setGuestEmail, placeholder: 'email@gmail.com', keyboard: 'email-address' as const },
                  { icon: Phone, label: 'Số điện thoại', value: guestPhone, setter: setGuestPhone, placeholder: '0912345678', keyboard: 'phone-pad' as const },
                  { icon: Users, label: 'Số lượng khách', value: guestCount, setter: setGuestCount, placeholder: '2', keyboard: 'numeric' as const },
                ].map(({ icon: Icon, label, value, setter, placeholder, keyboard }) => (
                  <View key={label} style={{ marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Icon size={14} color="#888" />
                      <Text style={{ fontSize: 13, color: '#555', fontWeight: '600' }}>{label}</Text>
                    </View>
                    <TextInput
                      value={value}
                      onChangeText={setter}
                      placeholder={placeholder}
                      keyboardType={keyboard}
                      autoCapitalize="none"
                      style={{
                        borderWidth: 1.5, borderColor: '#f0ebe0', borderRadius: 12,
                        padding: 14, fontSize: 14, backgroundColor: '#fafaf8', color: '#1B3A2D',
                        ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                      }}
                    />
                  </View>
                ))}

                <Pressable
                  onPress={handleSubmit}
                  style={{ backgroundColor: BRAND_COLORS.primary, borderRadius: 16, padding: 18, alignItems: 'center', marginTop: 8 }}
                >
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>⚡ Gửi yêu cầu đặt trọn gói</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 4 }}>Email xác nhận sẽ được gửi đến hộp thư của bạn</Text>
                </Pressable>
              </>
            )}

            {step === 'sending' && (
              <View style={{ alignItems: 'center', padding: 40, gap: 16 }}>
                <ActivityIndicator size="large" color={BRAND_COLORS.primary} />
                <Text style={{ fontWeight: '700', color: '#1B3A2D', fontSize: 16 }}>Đang gửi yêu cầu đặt dịch vụ...</Text>
                <Text style={{ color: '#888', textAlign: 'center' }}>Hệ thống đang tổng hợp thông tin và tạo email xác nhận</Text>
              </View>
            )}

            {step === 'email' && bookingResult && (
              <>
                {/* Success Banner */}
                <View style={{ backgroundColor: '#e8f5f0', borderRadius: 14, padding: 16, marginBottom: 20, alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 32 }}>📧</Text>
                  <Text style={{ fontWeight: '800', color: '#1B3A2D', fontSize: 16 }}>Yêu cầu đã được gửi!</Text>
                  <Text style={{ color: '#555', fontSize: 13, textAlign: 'center' }}>
                    Email xác nhận đã được gửi đến <Text style={{ fontWeight: '700', color: BRAND_COLORS.primary }}>{guestEmail}</Text>
                  </Text>
                  <Text style={{ color: '#888', fontSize: 12 }}>Mã đặt dịch vụ: <Text style={{ fontWeight: '700' }}>{bookingResult.bookingCode}</Text></Text>
                </View>

                {/* Demo Email Inbox */}
                <View style={{ borderWidth: 2, borderColor: '#f0ebe0', borderRadius: 14, overflow: 'hidden', marginBottom: 20 }}>
                  <View style={{ backgroundColor: '#f8f4ec', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: '#f0ebe0' }}>
                    <Text style={{ fontSize: 16 }}>📨</Text>
                    <View>
                      <Text style={{ fontWeight: '700', color: '#1B3A2D', fontSize: 13 }}>Hộp thư Demo (Preview)</Text>
                      <Text style={{ color: '#888', fontSize: 11 }}>Đây là email khách hàng nhận được</Text>
                    </View>
                  </View>
                  {Platform.OS === 'web' && bookingResult.emailHTML ? (
                    // @ts-ignore
                    <iframe
                      srcDoc={bookingResult.emailHTML}
                      style={{ width: '100%', height: 380, border: 'none' }}
                      title="Email Preview"
                    />
                  ) : (
                    <View style={{ padding: 20, alignItems: 'center' }}>
                      <Text style={{ color: '#888', fontSize: 13, textAlign: 'center' }}>
                        Mở vivu-planner.vercel.app để xem email preview đầy đủ
                      </Text>
                    </View>
                  )}
                </View>

                {/* Confirm Button */}
                <Pressable
                  onPress={handleConfirmBooking}
                  style={{ backgroundColor: '#16A34A', borderRadius: 16, padding: 18, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                >
                  <Check size={20} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>✅ Xác nhận đặt trọn gói</Text>
                </Pressable>
                <Text style={{ color: '#bbb', fontSize: 12, textAlign: 'center', marginTop: 8 }}>
                  Nhấn để mô phỏng người dùng click nút xác nhận trong email
                </Text>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
