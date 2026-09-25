import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Modal } from 'react-native';
import { ShoppingBag, Trash2, ArrowRight, Sparkles, X } from 'lucide-react-native';
import LiveBudgetBar from './LiveBudgetBar';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { PlaceItem } from '../map/PlacePopup';
import { api } from '../../lib/api';

export interface CartItem {
  id?: string;
  place: PlaceItem;
  pricing_option: 'auto' | 'manual';
  custom_cost: number;
}

export interface TravelCartDrawerProps {
  visible?: boolean;
  tripId?: string;
  totalBudget: number;
  cartItems: CartItem[];
  onRemoveItem: (placeId: string) => void;
  onUpdateItemCost?: (placeId: string, cost: number) => void;
  onClose?: () => void;
  onSavedSuccess?: () => void;
}

export default function TravelCartDrawer({
  visible = true,
  tripId,
  totalBudget,
  cartItems,
  onRemoveItem,
  onClose,
  onSavedSuccess,
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
      if (tripId && cartItems.length > 0) {
        // Save cart items to API or Supabase
        const payload = cartItems.map((item) => ({
          partner_id: item.place.id,
          title: item.place.name,
          category: item.place.category,
          custom_cost: item.custom_cost,
          pricing_option: item.pricing_option,
          notes: item.place.address,
        }));

        try {
          await api.post(`/trips/${tripId}/cart`, { items: payload });
        } catch (e) {
          await supabase.from('trip_cart_items').upsert(
            cartItems.map(item => ({
              trip_id: tripId,
              partner_id: item.place.id,
              custom_cost: item.custom_cost,
              pricing_option: item.pricing_option,
              notes: item.place.name,
            }))
          );
        }
      }

      if (onSavedSuccess) {
        onSavedSuccess();
      }

      if (onClose) {
        onClose();
      }
    } catch (err) {
      console.error('Lỗi khi lưu giỏ chuyến đi:', err);
      if (onClose) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const content = (
    <View
      style={{
        flex: 1,
        backgroundColor: '#FFFFFF',
        padding: 20,
        gap: 16,
        maxWidth: 500,
        alignSelf: 'center',
        width: '100%',
        borderRadius: 20,
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
                justifyContent: 'space-between',
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
          disabled={submitting || cartItems.length === 0}
          style={({ pressed }) => [{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 100,
            backgroundColor: cartItems.length > 0 ? '#1F6F54' : '#CCCCCC',
            opacity: pressed || submitting || cartItems.length === 0 ? 0.85 : 1,
          }]}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Sparkles size={18} color="#FFFFFF" />
              <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 14, color: '#FFFFFF', textAlign: 'center' }}>
                XÁC NHẬN LƯU VÀO LỊCH TRÌNH CHUYẾN ĐI
              </Text>
              <ArrowRight size={18} color="#FFFFFF" />
            </>
          )}
        </Pressable>
      </View>
    </View>
  );

  if (visible && onClose) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 }}>
          {content}
        </View>
      </Modal>
    );
  }

  return content;
}
