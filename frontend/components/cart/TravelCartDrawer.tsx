import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { ShoppingBag, Trash2, ArrowRight, Sparkles, X } from 'lucide-react-native';
import LiveBudgetBar from './LiveBudgetBar';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { PlaceItem } from '../map/PlacePopup';

export interface CartItem {
  place: PlaceItem;
  pricing_option: 'auto' | 'manual';
  custom_cost: number;
}

interface TravelCartDrawerProps {
  tripId: string;
  totalBudget: number;
  cartItems: CartItem[];
  onRemoveItem: (placeId: string) => void;
  onClose?: () => void;
}

export default function TravelCartDrawer({
  tripId,
  totalBudget,
  cartItems,
  onRemoveItem,
  onClose,
}: TravelCartDrawerProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const cartTotal = cartItems.reduce((acc, item) => acc + item.custom_cost, 0);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN').format(val) + ' đ';
  };

  const handleConfirmAndCreateItinerary = async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      // 1. Save cart items into trip_cart_items table in Supabase
      if (tripId && cartItems.length > 0) {
        const payload = cartItems.map((item) => ({
          trip_id: tripId,
          partner_id: item.place.id,
          custom_cost: item.custom_cost,
          pricing_option: item.pricing_option,
          notes: item.place.name,
        }));

        await supabase.from('trip_cart_items').upsert(payload);
      }

      // 2. Handoff navigation: router.push('/(app)/chuyen-di/' + tripId)
      router.push(`/(app)/chuyen-di/${tripId || 'new'}` as any);
    } catch (err) {
      console.error('Lỗi khi lưu giỏ chuyến đi:', err);
      // Fallback router push
      router.push(`/(app)/chuyen-di/${tripId || 'new'}` as any);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderLeftWidth: 1,
        borderLeftColor: 'rgba(27,36,32,0.08)',
        padding: 20,
        gap: 16,
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ShoppingBag size={20} color="#1F6F54" />
          <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 17, color: '#1B2420' }}>
            Giỏ Chuyến Đi ({cartItems.length})
          </Text>
        </View>

        {onClose && (
          <Pressable onPress={onClose} style={{ padding: 4 }}>
            <X size={20} color="#6E7B70" />
          </Pressable>
        )}
      </View>

      {/* Live Budget Progress Bar */}
      <LiveBudgetBar totalBudget={totalBudget} currentCartTotal={cartTotal} />

      {/* Cart Items List */}
      <ScrollView contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
        {cartItems.length === 0 ? (
          <View style={{ padding: 32, alignItems: 'center', gap: 8 }}>
            <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 13, color: '#6E7B70', textAlign: 'center' }}>
              Giỏ hàng đang trống. Hãy chọn các địa điểm ngon - đẹp - chuẩn trên bản đồ để thêm vào chuyến đi!
            </Text>
          </View>
        ) : (
          cartItems.map((item) => (
            <View
              key={item.place.id}
              style={{
                flexDirection: 'row',
                justify: 'space-between',
                alignItems: 'center',
                padding: 12,
                borderRadius: 12,
                backgroundColor: '#F3ECDC',
                borderWidth: 1,
                borderColor: 'rgba(27,36,32,0.06)',
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 14, color: '#1B2420' }}>
                  {item.place.name}
                </Text>
                <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 12, color: '#6E7B70' }}>
                  {item.pricing_option === 'auto' ? 'Giá tự động' : 'Tự nhập'}: {formatCurrency(item.custom_cost)}
                </Text>
              </View>

              <Pressable
                onPress={() => onRemoveItem(item.place.id)}
                style={({ pressed }) => [{ padding: 6, opacity: pressed ? 0.7 : 1 }]}
              >
                <Trash2 size={16} color="#B23B3B" />
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>

      {/* Handoff Bottom Button */}
      <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(27,36,32,0.08)' }}>
        <Pressable
          onPress={handleConfirmAndCreateItinerary}
          disabled={submitting}
          style={({ pressed }) => [{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 100,
            backgroundColor: '#1F6F54',
            opacity: pressed || submitting ? 0.85 : 1,
            shadowColor: '#1F6F54',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 12,
          }]}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Sparkles size={18} color="#FFFFFF" />
              <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 14, color: '#FFFFFF', textAlign: 'center' }}>
                XÁC NHẬN HOÀN TẤT & BẮT ĐẦU TẠO LỊCH TRÌNH
              </Text>
              <ArrowRight size={18} color="#FFFFFF" />
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}
