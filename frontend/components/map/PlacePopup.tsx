import React, { useState } from 'react';
import { View, Text, Pressable, Image, Linking, Platform, TextInput } from 'react-native';
import { X, ExternalLink, Plus, MapPin, Clock, DollarSign, Sparkles } from 'lucide-react-native';

export interface PlaceItem {
  id: string;
  name: string;
  category: 'dining' | 'cafe' | 'hotel' | 'attraction' | string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  price_level?: number;
  estimated_cost?: number;
  opening_hours?: string;
  social_review_quote?: string;
  social_review_url?: string;
  google_map_url?: string;
  image_url?: string;
}

interface PlacePopupProps {
  place: PlaceItem | null;
  onClose: () => void;
  onAddToCart: (place: PlaceItem, option: 'auto' | 'manual', customCost?: number) => void;
}

export default function PlacePopup({ place, onClose, onAddToCart }: PlacePopupProps) {
  const [pricingOption, setPricingOption] = useState<'auto' | 'manual'>('auto');
  const [customCost, setCustomCost] = useState<string>('');

  if (!place) return null;

  const costValue = place.estimated_cost || (place.price_level ? place.price_level * 50000 : 50000);

  const handleOpenGoogleMaps = () => {
    const url = place.google_map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + ' ' + place.address)}`;
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url);
    }
  };

  const handleOpenSocialReview = () => {
    if (place.social_review_url) {
      if (Platform.OS === 'web') {
        window.open(place.social_review_url, '_blank');
      } else {
        Linking.openURL(place.social_review_url);
      }
    }
  };

  const handleConfirmAdd = () => {
    const finalCost = pricingOption === 'manual' ? (parseInt(customCost.replace(/\D/g, ''), 10) || costValue) : costValue;
    onAddToCart(place, pricingOption, finalCost);
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'dining': return '#B23B3B'; // 🔴 Đỏ (Ăn uống)
      case 'cafe': return '#F0B255';   // 🟡 Vàng (Cafe)
      case 'hotel': return '#2563EB';  // 🔵 Xanh (Khách sạn)
      case 'attraction': return '#8B5CF6'; // 🟣 Tím (Vui chơi)
      default: return '#1F6F54';
    }
  };

  const catColor = getCategoryColor(place.category);

  return (
    <View
      style={{
        position: 'absolute',
        bottom: 20,
        left: 20,
        right: 20,
        maxWidth: 420,
        alignSelf: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 18,
        borderWidth: 1,
        borderColor: 'rgba(27,36,32,0.12)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
        zIndex: 1000,
        gap: 12,
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, backgroundColor: `${catColor}15` }}>
              <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 11, color: catColor, textTransform: 'uppercase' }}>
                {place.category === 'dining' ? '🔴 Ăn uống' : place.category === 'cafe' ? '🟡 Cafe' : place.category === 'hotel' ? '🔵 Khách sạn' : '🟣 Vui chơi'}
              </Text>
            </View>
          </View>
          <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 17, color: '#1B2420' }}>
            {place.name}
          </Text>
        </View>

        <Pressable onPress={onClose} style={{ padding: 4 }}>
          <X size={18} color="#6E7B70" />
        </Pressable>
      </View>

      {/* Address & Hours */}
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <MapPin size={14} color="#6E7B70" />
          <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 12, color: '#6E7B70', flex: 1 }}>
            {place.address}
          </Text>
        </View>

        {place.opening_hours && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Clock size={14} color="#6E7B70" />
            <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 12, color: '#6E7B70' }}>
              Giờ mở cửa: {place.opening_hours}
            </Text>
          </View>
        )}
      </View>

      {/* TikTok / Social Review Quote */}
      {place.social_review_quote && (
        <Pressable
          onPress={handleOpenSocialReview}
          style={({ pressed }) => [{
            padding: 10,
            borderRadius: 12,
            backgroundColor: '#F3ECDC',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            opacity: pressed ? 0.8 : 1,
          }]}
        >
          <Sparkles size={14} color="#E2703A" />
          <Text style={{ fontFamily: 'BeVietnamPro_400Regular_Italic', fontSize: 12, color: '#1B2420', flex: 1 }}>
            "{place.social_review_quote}"
          </Text>
          <ExternalLink size={14} color="#E2703A" />
        </Pressable>
      )}

      {/* Price & Google Maps Action */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(27,36,32,0.08)' }}>
        <View>
          <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 11, color: '#6E7B70' }}>Giá ước tính</Text>
          <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 15, color: '#1F6F54' }}>
            {costValue.toLocaleString('vi-VN')} đ
          </Text>
        </View>

        <Pressable
          onPress={handleOpenGoogleMaps}
          style={({ pressed }) => [{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: 100,
            backgroundColor: 'rgba(31,111,84,0.1)',
            opacity: pressed ? 0.8 : 1,
          }]}
        >
          <ExternalLink size={13} color="#1F6F54" />
          <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 12, color: '#1F6F54' }}>
            Xem Google Maps
          </Text>
        </Pressable>
      </View>

      {/* Pricing Option Selector */}
      <View style={{ gap: 8, paddingTop: 6 }}>
        <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 12, color: '#1B2420' }}>
          Tùy chọn giá khi thêm giỏ:
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => setPricingOption('auto')}
            style={{
              flex: 1,
              paddingVertical: 7,
              borderRadius: 8,
              alignItems: 'center',
              backgroundColor: pricingOption === 'auto' ? '#1F6F54' : 'rgba(27,36,32,0.06)',
            }}
          >
            <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 12, color: pricingOption === 'auto' ? '#FFFFFF' : '#1B2420' }}>
              Giá quán ({costValue.toLocaleString('vi-VN')}đ)
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setPricingOption('manual')}
            style={{
              flex: 1,
              paddingVertical: 7,
              borderRadius: 8,
              alignItems: 'center',
              backgroundColor: pricingOption === 'manual' ? '#1F6F54' : 'rgba(27,36,32,0.06)',
            }}
          >
            <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 12, color: pricingOption === 'manual' ? '#FFFFFF' : '#1B2420' }}>
              Tự nhập tiền
            </Text>
          </Pressable>
        </View>

        {pricingOption === 'manual' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 12, color: '#6E7B70' }}>Số tiền dự kiến:</Text>
            <TextInput
              value={customCost}
              onChangeText={setCustomCost}
              placeholder={`${costValue}`}
              keyboardType="numeric"
              style={{
                flex: 1,
                backgroundColor: '#F3ECDC',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 4,
                fontFamily: 'BeVietnamPro_600SemiBold',
                fontSize: 13,
                color: '#1B2420',
              }}
            />
            <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 12, color: '#6E7B70' }}>đ</Text>
          </View>
        )}
      </View>

      {/* Add To Cart Button */}
      <Pressable
        onPress={handleConfirmAdd}
        style={({ pressed }) => [{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 11,
          borderRadius: 100,
          backgroundColor: '#E2703A',
          opacity: pressed ? 0.9 : 1,
        }]}
      >
        <Plus size={16} color="#FFFFFF" />
        <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 14, color: '#FFFFFF' }}>
          Thêm vào giỏ chuyến đi
        </Text>
      </Pressable>
    </View>
  );
}
