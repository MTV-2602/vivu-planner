import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, ActivityIndicator, ScrollView } from 'react-native';
import { X, MapPin, Sparkles, Send } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

interface SuggestPlaceModalProps {
  visible: boolean;
  onClose: () => void;
  cityName?: string;
}

export default function SuggestPlaceModal({ visible, onClose, cityName = 'Đà Lạt' }: SuggestPlaceModalProps) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'dining' | 'cafe' | 'hotel' | 'attraction'>('cafe');
  const [address, setAddress] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [openingHours, setOpeningHours] = useState('');
  const [userReview, setUserReview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setSuccess(false);

    try {
      const payload = {
        user_id: user?.id || null,
        name: name.trim(),
        category: category,
        city: cityName,
        address: address.trim(),
        estimated_cost: parseInt(estimatedCost.replace(/\D/g, ''), 10) || 0,
        opening_hours: openingHours.trim(),
        user_review: userReview.trim(),
        status: 'pending',
      };

      await supabase.from('place_suggestions').insert([payload]);

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
        setName('');
        setAddress('');
        setEstimatedCost('');
        setOpeningHours('');
        setUserReview('');
      }, 1500);
    } catch (err) {
      console.error('Lỗi khi gửi đóng góp địa điểm:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View
          style={{
            width: '100%',
            maxWidth: 480,
            backgroundColor: '#FFFFFF',
            borderRadius: 24,
            padding: 24,
            gap: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.2,
            shadowRadius: 24,
          }}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Sparkles size={20} color="#E2703A" />
              <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 18, color: '#1B2420' }}>
                Đóng Góp Quán Mới (UGC)
              </Text>
            </View>
            <Pressable onPress={onClose} style={{ padding: 4 }}>
              <X size={20} color="#6E7B70" />
            </Pressable>
          </View>

          <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 13, color: '#6E7B70' }}>
            Chia sẻ quán ăn, quán cafe hoặc địa điểm ngách chuẩn bản địa tại <Text style={{ fontFamily: 'BeVietnamPro_700Bold', color: '#1B2420' }}>{cityName}</Text> để Admin duyệt lên bản đồ!
          </Text>

          <ScrollView contentContainerStyle={{ gap: 12 }} style={{ maxHeight: 400 }}>
            {/* Tên địa điểm */}
            <View style={{ gap: 4 }}>
              <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 12, color: '#1B2420' }}>Tên địa điểm *</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="VD: Tiệm Cà Phê Túi Mơ To"
                style={{ backgroundColor: '#F3ECDC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontFamily: 'BeVietnamPro_400Regular', fontSize: 13, color: '#1B2420' }}
              />
            </View>

            {/* Category Selector */}
            <View style={{ gap: 4 }}>
              <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 12, color: '#1B2420' }}>Phân loại</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { key: 'cafe', label: '🟡 Cafe' },
                  { key: 'dining', label: '🔴 Ăn uống' },
                  { key: 'hotel', label: '🔵 Khách sạn' },
                  { key: 'attraction', label: '🟣 Vui chơi' },
                ].map((c) => (
                  <Pressable
                    key={c.key}
                    onPress={() => setCategory(c.key as any)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 100,
                      backgroundColor: category === c.key ? '#1F6F54' : '#F3ECDC',
                    }}
                  >
                    <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 12, color: category === c.key ? '#FFFFFF' : '#1B2420' }}>
                      {c.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Địa chỉ */}
            <View style={{ gap: 4 }}>
              <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 12, color: '#1B2420' }}>Địa chỉ cụ thể</Text>
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="VD: Hẻm 31 Sào Nam, Phường 11, Đà Lạt"
                style={{ backgroundColor: '#F3ECDC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontFamily: 'BeVietnamPro_400Regular', fontSize: 13, color: '#1B2420' }}
              />
            </View>

            {/* Giá ước tính & Giờ mở cửa */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 12, color: '#1B2420' }}>Giá trung bình (đ)</Text>
                <TextInput
                  value={estimatedCost}
                  onChangeText={setEstimatedCost}
                  placeholder="50.000"
                  keyboardType="numeric"
                  style={{ backgroundColor: '#F3ECDC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontFamily: 'BeVietnamPro_400Regular', fontSize: 13, color: '#1B2420' }}
                />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 12, color: '#1B2420' }}>Giờ mở cửa</Text>
                <TextInput
                  value={openingHours}
                  onChangeText={setOpeningHours}
                  placeholder="07:00 - 22:00"
                  style={{ backgroundColor: '#F3ECDC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontFamily: 'BeVietnamPro_400Regular', fontSize: 13, color: '#1B2420' }}
                />
              </View>
            </View>

            {/* Review người dùng */}
            <View style={{ gap: 4 }}>
              <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 12, color: '#1B2420' }}>Đánh giá / Review ngắn của bạn</Text>
              <TextInput
                value={userReview}
                onChangeText={setUserReview}
                placeholder="VD: Quán view ngắm hoàng hôn đỉnh nhất Đà Lạt, bánh ngọt ngon giá hợp lý..."
                multiline
                numberOfLines={3}
                style={{ backgroundColor: '#F3ECDC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontFamily: 'BeVietnamPro_400Regular', fontSize: 13, color: '#1B2420' }}
              />
            </View>
          </ScrollView>

          {/* Success Message */}
          {success && (
            <View style={{ padding: 10, borderRadius: 10, backgroundColor: 'rgba(31,111,84,0.1)', alignItems: 'center' }}>
              <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 13, color: '#1F6F54' }}>
                🎉 Đã gửi đóng góp thành công! Đang chờ Admin duyệt.
              </Text>
            </View>
          )}

          {/* Submit Button */}
          <Pressable
            onPress={handleSubmit}
            disabled={submitting || !name.trim()}
            style={({ pressed }) => [{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 12,
              borderRadius: 100,
              backgroundColor: '#1F6F54',
              opacity: pressed || submitting || !name.trim() ? 0.7 : 1,
            }]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Send size={16} color="#FFFFFF" />
                <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 14, color: '#FFFFFF' }}>
                  Gửi Đóng Góp
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
