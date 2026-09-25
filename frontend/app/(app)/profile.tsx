import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
  RefreshControl,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { User, MapPin, Calendar, Heart, ArrowLeft, LogOut, Sparkles, ChevronRight } from 'lucide-react-native';

interface TripItem {
  id: string;
  title: string;
  destination_city: string;
  start_date: string;
  end_date: string;
  budget_total: number;
  status: string;
  preferences?: any;
}

export default function ProfileScreen() {
  const router = Router();
  const { session, user, profile, signOut, refreshProfile } = useAuth();
  const [trips, setTrips] = useState<TripItem[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isWeb = Platform.OS === 'web';

  const loadProfileData = async () => {
    if (!user?.id) return;
    try {
      setLoadingTrips(true);
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setTrips(data);
      }
    } catch (err) {
      console.error('Lỗi lấy danh sách chuyến đi:', err);
    } finally {
      setLoadingTrips(false);
    }
  };

  useEffect(() => {
    loadProfileData();
  }, [user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshProfile();
    await loadProfileData();
    setRefreshing(false);
  };

  const preferencesList: string[] = (profile as any)?.preferences || [
    '🌿 Du lịch chữa lành',
    '☕ Cà phê view đẹp',
    '🍜 Khám phá ẩm thực',
    '📸 Check-in sống ảo',
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#FBF5EA' }}>
      {/* Header Bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justify: 'space-between',
          paddingHorizontal: 20,
          paddingTop: isWeb ? 20 : 48,
          paddingBottom: 16,
          backgroundColor: '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(27,36,32,0.08)',
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={20} color="#1B2420" />
            <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 14, color: '#1B2420' }}>
              Quay lại
            </Text>
          </View>
        </Pressable>

        <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 17, color: '#1B2420' }}>
          Hồ Sơ Cá Nhân
        </Text>

        <Pressable
          onPress={signOut}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <LogOut size={20} color="#B23B3B" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 24, maxWidth: 800, alignSelf: 'center', width: '100%' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1F6F54']} />}
      >
        {/* Profile Card */}
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            padding: 24,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: 'rgba(27,36,32,0.08)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.04,
            shadowRadius: 12,
            marginBottom: 24,
          }}
        >
          {profile?.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={{ width: 88, height: 88, borderRadius: 44, marginBottom: 14, borderWidth: 3, borderColor: '#1F6F54' }}
            />
          ) : (
            <View
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                backgroundColor: 'rgba(31,111,84,0.1)',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 14,
                borderWidth: 2,
                borderColor: '#1F6F54',
              }}
            >
              <User size={40} color="#1F6F54" />
            </View>
          )}

          <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 22, color: '#1B2420', marginBottom: 4 }}>
            {profile?.full_name || 'Người dùng ViVu'}
          </Text>
          <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 13, color: '#6E7B70', marginBottom: 12 }}>
            {user?.email || 'Chưa cập nhật email'}
          </Text>

          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: 'rgba(31,111,84,0.1)' }}>
              <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 12, color: '#1F6F54' }}>
                {profile?.is_premium ? '⭐ Thành viên Premium' : '🌱 Thành viên Miễn phí'}
              </Text>
            </View>
          </View>
        </View>

        {/* Preferences Section */}
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            padding: 20,
            borderWidth: 1,
            borderColor: 'rgba(27,36,32,0.08)',
            marginBottom: 24,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Heart size={18} color="#E2703A" />
            <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 16, color: '#1B2420' }}>
              Sở Thích Du Lịch
            </Text>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {preferencesList.map((pref, idx) => (
              <View
                key={idx}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 100,
                  backgroundColor: '#F3ECDC',
                  borderWidth: 1,
                  borderColor: 'rgba(27,36,32,0.08)',
                }}
              >
                <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 12, color: '#1B2420' }}>
                  {pref}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Trips Created Section */}
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MapPin size={18} color="#1F6F54" />
              <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 16, color: '#1B2420' }}>
                Danh Sách Chuyến Đi ({trips.length})
              </Text>
            </View>

            <Pressable
              onPress={() => router.push('/(app)/chuyen-di/moi' as any)}
              style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: '#1F6F54' }}>
                <Sparkles size={13} color="#FFFFFF" />
                <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 12, color: '#FFFFFF' }}>Tạo Mới</Text>
              </View>
            </Pressable>
          </View>

          {loadingTrips ? (
            <ActivityIndicator size="small" color="#1F6F54" style={{ marginVertical: 20 }} />
          ) : trips.length === 0 ? (
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                padding: 24,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: 'rgba(27,36,32,0.08)',
              }}
            >
              <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 14, color: '#6E7B70', textAlign: 'center', marginBottom: 12 }}>
                Bạn chưa khởi tạo chuyến đi nào. Hãy bắt đầu lên kế hoạch ngay!
              </Text>
              <Pressable
                onPress={() => router.push('/(app)/chuyen-di/moi' as any)}
                style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 100, backgroundColor: '#1F6F54' }}
              >
                <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 13, color: '#FFFFFF' }}>Tạo chuyến đi đầu tiên</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {trips.map((trip) => (
                <Pressable
                  key={trip.id}
                  onPress={() => router.push(`/(app)/chuyen-di/${trip.id}` as any)}
                  style={({ pressed }) => [{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 16,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: 'rgba(27,36,32,0.08)',
                    opacity: pressed ? 0.9 : 1,
                    transform: [{ scale: pressed ? 0.99 : 1 }],
                  }]}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 15, color: '#1B2420' }}>
                        {trip.title || `Chuyến đi ${trip.destination_city}`}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <MapPin size={13} color="#6E7B70" />
                          <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 12, color: '#6E7B70' }}>
                            {trip.destination_city}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Calendar size={13} color="#6E7B70" />
                          <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 12, color: '#6E7B70' }}>
                            {trip.start_date} - {trip.end_date}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <ChevronRight size={18} color="#6E7B70" />
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
