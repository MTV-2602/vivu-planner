import React from 'react';
import { View, Text, Platform } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import GoogleCalendarWorkspace from './workspace/GoogleCalendarWorkspace';

export default function TripWorkspaceSplitView() {
  return (
    <View style={{ width: '100%', maxWidth: 1240, alignSelf: 'center', gap: 20 }}>
      {/* Header Info */}
      <View style={{ gap: 6 }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          alignSelf: 'flex-start',
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 100,
          backgroundColor: '#E8F0FE',
          borderWidth: 1,
          borderColor: '#C2E7FF',
        }}>
          <Sparkles size={14} color="#1A73E8" />
          <Text style={{ color: '#1A73E8', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>
            Không gian Lập lịch & Quản trị Toàn diện (Bản đồ & Lịch trình ViVu)
          </Text>
        </View>

        <Text style={{
          fontSize: Platform.OS === 'web' ? 28 : 22,
          fontWeight: '800',
          color: '#202124',
          letterSpacing: -0.5,
        }}>
          Kéo thả giữa Bản đồ thực tế, Lịch trình trực quan và Giỏ ngân sách
        </Text>
      </View>

      {/* Main Interactive ViVu Workspace */}
      <GoogleCalendarWorkspace
        cityName="Đà Nẵng"
        totalBudget={5000000}
        daysCount={3}
      />
    </View>
  );
}
