import React, { useState } from 'react';
import { View, Text, Pressable, Image, Linking, Platform } from 'react-native';
import { X, ExternalLink, Tag } from 'lucide-react-native';

interface AffiliateBannerProps {
  partnerName?: string;
  discountCode?: string;
  discountPercent?: string;
  affiliateUrl?: string;
}

export default function AffiliateBanner({
  partnerName = 'Traveloka',
  discountCode = 'VIVU15',
  discountPercent = '15%',
  affiliateUrl = 'https://www.traveloka.com/vi-vn/',
}: AffiliateBannerProps) {
  const [closed, setClosed] = useState(false);

  if (closed) return null;

  const handleOpenAffiliate = () => {
    if (Platform.OS === 'web') {
      window.open(affiliateUrl, '_blank');
    } else {
      Linking.openURL(affiliateUrl);
    }
  };

  return (
    <View
      style={{
        position: 'absolute',
        bottom: 24,
        right: 24,
        width: 320,
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: 'rgba(226,112,58,0.3)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        zIndex: 999,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, backgroundColor: 'rgba(226,112,58,0.12)', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Tag size={12} color="#E2703A" />
            <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 10, color: '#E2703A' }}>
              ƯU ĐÃI ĐỐI TÁC
            </Text>
          </View>
        </View>

        <Pressable onPress={() => setClosed(true)} style={{ padding: 4 }}>
          <X size={16} color="#6E7B70" />
        </Pressable>
      </View>

      <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 13, color: '#1B2420' }}>
        Đặt phòng & Khách sạn qua {partnerName}
      </Text>

      <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 12, color: '#6E7B70' }}>
        Nhập mã <Text style={{ fontFamily: 'BeVietnamPro_700Bold', color: '#E2703A' }}>{discountCode}</Text> để được giảm ngay {discountPercent} khi thanh toán.
      </Text>

      <Pressable
        onPress={handleOpenAffiliate}
        style={({ pressed }) => [{
          flexDirection: 'row',
          alignItems: 'center',
          justify: 'center',
          gap: 6,
          paddingVertical: 8,
          borderRadius: 100,
          backgroundColor: '#E2703A',
          opacity: pressed ? 0.85 : 1,
          marginTop: 2,
        }]}
      >
        <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 12, color: '#FFFFFF' }}>
          Nhận Voucher Ngay
        </Text>
        <ExternalLink size={13} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}
