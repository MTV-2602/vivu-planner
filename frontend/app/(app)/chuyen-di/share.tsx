import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { apiClient } from '../../../lib/apiClient';
import InteractiveMap, { MapItem } from '../../../components/InteractiveMap';
import { BRAND_COLORS } from '../../../constants';

interface ItineraryItem {
  id: string; item_type: string; title: string; description: string;
  start_time?: string; end_time?: string; estimated_cost?: number | null;
  location_lat?: number; location_lng?: number; google_place_id?: string;
}
interface ItineraryDay {
  id: string; day_number: number; date: string;
  weather_summary?: { note?: string }; items: ItineraryItem[];
}
interface TripData {
  id: string; title: string; destination_city: string;
  start_date: string; end_date: string; budget_total: number;
  traveler_count: number; status: string; days: ItineraryDay[];
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  accommodation: '🏨 Lưu trú', dining: '🍽️ Ẩm thực', attraction: '🏔️ Tham quan',
  rental: '🛵 Thuê xe', experience: '✨ Trải nghiệm', transport: '🚌 Di chuyển',
};

function formatDate(s: string) {
  if (!s) return '';
  const p = s.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
}

function formatCost(c?: number | null) {
  if (c == null) return 'Liên hệ';
  if (c === 0) return 'Miễn phí';
  return `${Number(c).toLocaleString('vi-VN')}đ`;
}

export default function ShareTripPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<TripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    apiClient.get(`/trips/${id}/public`)
      .then(({ data }) => setTrip(data))
      .catch(() => setError('Không tìm thấy chuyến đi hoặc chuyến đi này không được chia sẻ công khai.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FBF5EA' }}>
        <ActivityIndicator size="large" color={BRAND_COLORS.primary} />
        <Text style={{ color: '#888', marginTop: 12 }}>Đang tải lịch trình...</Text>
      </View>
    );
  }

  if (error || !trip) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FBF5EA', padding: 32 }}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>🗺️</Text>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#1B3A2D', marginBottom: 8 }}>Không tìm thấy</Text>
        <Text style={{ color: '#888', textAlign: 'center' }}>{error || 'Chuyến đi này không tồn tại.'}</Text>
      </View>
    );
  }

  // Collect all map items
  const allMapItems: MapItem[] = trip.days.flatMap(day =>
    day.items.map(item => ({
      id: item.id,
      title: item.title,
      item_type: item.item_type,
      start_time: item.start_time,
      estimated_cost: item.estimated_cost,
      location_lat: item.location_lat,
      location_lng: item.location_lng,
      day_number: day.day_number,
      google_place_id: item.google_place_id,
    }))
  );

  const totalDays = trip.days.length;
  const numNights = Math.max(totalDays - 1, 0);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#FBF5EA' }}>
      {/* Hero Banner */}
      <View style={{
        backgroundColor: BRAND_COLORS.primary,
        padding: 32, paddingTop: 48,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', letterSpacing: 1.5 }}>✈️ CHIA SẺ TỪ VIVU PLANNER</Text>
        </View>
        <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 8 }}>{trip.title}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15, marginBottom: 20 }}>📍 {trip.destination_city}</Text>

        {/* Quick Stats */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {[
            { emoji: '📅', label: 'Khởi hành', value: formatDate(trip.start_date) },
            { emoji: '🌙', label: 'Thời gian', value: `${totalDays} ngày ${numNights} đêm` },
            { emoji: '👥', label: 'Số khách', value: `${trip.traveler_count} người` },
            { emoji: '💰', label: 'Ngân sách', value: `${Number(trip.budget_total).toLocaleString('vi-VN')}đ` },
          ].map(stat => (
            <View key={stat.label} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 18 }}>{stat.emoji}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 4 }}>{stat.label}</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12, textAlign: 'center' }}>{stat.value}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ padding: 20, gap: 20 }}>
        {/* Interactive Map */}
        <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#1B3A2D', marginBottom: 16 }}>🗺️ Bản đồ lịch trình</Text>
          <InteractiveMap
            items={allMapItems}
            cityName={trip.destination_city}
          />
        </View>

        {/* Itinerary Days */}
        {trip.days.map(day => (
          <View key={day.id} style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: BRAND_COLORS.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{day.day_number}</Text>
              </View>
              <View>
                <Text style={{ fontWeight: '800', color: '#1B3A2D', fontSize: 16 }}>Ngày {day.day_number}</Text>
                <Text style={{ color: '#888', fontSize: 13 }}>{formatDate(day.date)}</Text>
              </View>
              {day.weather_summary?.note && (
                <Text style={{ marginLeft: 'auto', color: '#888', fontSize: 12 }}>🌤️ {day.weather_summary.note}</Text>
              )}
            </View>

            {day.items.map((item, idx) => (
              <View key={item.id} style={{
                flexDirection: 'row', gap: 12, paddingVertical: 10,
                borderBottomWidth: idx < day.items.length - 1 ? 1 : 0,
                borderBottomColor: '#f0ebe0',
              }}>
                <View style={{ alignItems: 'center', gap: 4 }}>
                  {item.start_time && <Text style={{ fontSize: 11, color: '#888', fontWeight: '600' }}>{item.start_time}</Text>}
                  <View style={{ width: 2, flex: 1, backgroundColor: '#f0ebe0', minHeight: 20 }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: BRAND_COLORS.primary, fontWeight: '700', marginBottom: 2 }}>
                    {ITEM_TYPE_LABELS[item.item_type] || item.item_type}
                  </Text>
                  <Text style={{ fontWeight: '700', color: '#1B3A2D', fontSize: 14, marginBottom: 2 }}>{item.title}</Text>
                  {item.description && <Text style={{ color: '#888', fontSize: 12 }}>{item.description}</Text>}
                  {item.estimated_cost != null && (
                    <Text style={{ color: '#1F6F54', fontSize: 12, fontWeight: '600', marginTop: 4 }}>
                      💰 {formatCost(item.estimated_cost)}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        ))}

        {/* Footer */}
        <View style={{ alignItems: 'center', padding: 24, gap: 4 }}>
          <Text style={{ fontSize: 28 }}>🗺️</Text>
          <Text style={{ fontWeight: '800', color: '#1B3A2D', fontSize: 16 }}>ViVu Planner</Text>
          <Text style={{ color: '#888', fontSize: 13, textAlign: 'center' }}>
            Lịch trình được lập kế hoạch bởi AI thông minh
          </Text>
          <Text style={{ color: BRAND_COLORS.primary, fontSize: 13, fontWeight: '600', marginTop: 4 }}>
            vivu-planner.vercel.app
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
