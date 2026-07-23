import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Platform, Linking } from 'react-native';
import { Map, MapPin } from 'lucide-react-native';
import { BRAND_COLORS } from '../constants';

export interface MapItem {
  id: string;
  title: string;
  item_type: string;
  start_time?: string;
  estimated_cost?: number | null;
  location_lat?: number;
  location_lng?: number;
  day_number: number;
  google_place_id?: string | null;
}

interface InteractiveMapProps {
  items: MapItem[];
  centerLat?: number;
  centerLng?: number;
  cityName?: string;
}

const TYPE_COLORS: Record<string, string> = {
  accommodation: '#2563EB',
  dining: '#EA580C',
  attraction: '#16A34A',
  rental: '#7C3AED',
  experience: '#DB2777',
  transport: '#0891B2',
};

const TYPE_EMOJI: Record<string, string> = {
  accommodation: '🏨',
  dining: '🍽️',
  attraction: '🏔️',
  rental: '🛵',
  experience: '✨',
  transport: '🚌',
};

const TYPE_LABELS: Record<string, string> = {
  accommodation: 'Lưu trú',
  dining: 'Ẩm thực',
  attraction: 'Tham quan',
  rental: 'Thuê xe',
  experience: 'Trải nghiệm',
  transport: 'Di chuyển',
};

function formatCost(cost?: number | null): string {
  if (cost == null) return 'Liên hệ';
  if (cost === 0) return 'Miễn phí';
  return `${Number(cost).toLocaleString('vi-VN')}đ`;
}

// Leaflet Map with Google Maps Roadmap Tiles
function buildLeafletHTML(items: MapItem[], centerLat: number, centerLng: number, cityName: string): string {
  const markers = items
    .filter(item => item.location_lat && item.location_lng)
    .map(item => {
      const color = TYPE_COLORS[item.item_type] || '#1F6F54';
      const emoji = TYPE_EMOJI[item.item_type] || '📍';
      const label = TYPE_LABELS[item.item_type] || item.item_type;
      const cost = formatCost(item.estimated_cost);
      const time = item.start_time || '';
      const safeTitle = item.title.replace(/'/g, "\\'").replace(/"/g, '\\"');
      const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.title + ' ' + cityName)}`;

      return `
        L.circleMarker([${item.location_lat}, ${item.location_lng}], {
          radius: 12, fillColor: '${color}', color: '#fff',
          weight: 2.5, opacity: 1, fillOpacity: 0.9
        }).addTo(map)
        .bindPopup(\`
          <div style="font-family:system-ui,-apple-system,sans-serif;min-width:200px;padding:4px;">
            <div style="font-size:20px;margin-bottom:4px;">${emoji}</div>
            <div style="font-size:11px;color:${color};font-weight:700;text-transform:uppercase;margin-bottom:4px;">${label}</div>
            <div style="font-size:14px;font-weight:700;color:#1B3A2D;margin-bottom:6px;">${safeTitle}</div>
            ${time ? `<div style="font-size:12px;color:#666;margin-bottom:4px;">🕐 ${time}</div>` : ''}
            <div style="font-size:12px;color:#1F6F54;font-weight:600;margin-bottom:8px;">💰 ${cost}</div>
            <a href="${googleMapsUrl}" target="_blank" style="display:block;text-align:center;background:#1F6F54;color:#ffffff;text-decoration:none;padding:8px 12px;border-radius:8px;font-size:12px;font-weight:bold;box-shadow:0 2px 8px rgba(31,111,84,0.3);">
              📍 Mở Google Maps chỉ đường ↗
            </a>
          </div>
        \`, { maxWidth: 260 });
      `;
    }).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { height: 100%; width: 100%; }
    .leaflet-popup-content-wrapper { border-radius: 14px; box-shadow: 0 4px 24px rgba(0,0,0,0.18); padding: 4px; }
    .leaflet-popup-tip { background: white; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map', { zoomControl: true, scrollWheelZoom: true }).setView([${centerLat}, ${centerLng}], 13);
    
    // Official Google Maps Roadmap Tiles (100% Vietnamese labels & millimeter accurate)
    L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      attribution: '© Google Maps',
      maxZoom: 20
    }).addTo(map);

    ${markers}

    // Auto fit map bounds
    const points = [${items.filter(i => i.location_lat && i.location_lng).map(i => `[${i.location_lat}, ${i.location_lng}]`).join(',')}];
    if (points.length > 0) {
      try { map.fitBounds(points, { padding: [50, 50] }); } catch(e) {}
    }
  </script>
</body>
</html>`;
}

export default function InteractiveMap({ items, centerLat = 10.8231, centerLng = 106.6297, cityName = 'Điểm đến' }: InteractiveMapProps) {
  const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');
  const iframeRef = useRef<any>(null);

  const days = [...new Set(items.map(i => i.day_number))].sort((a, b) => a - b);
  const filteredItems = selectedDay === 'all' ? items : items.filter(i => i.day_number === selectedDay);
  const mappableItems = filteredItems.filter(i => i.location_lat && i.location_lng);

  const openGoogleMaps = (item: MapItem) => {
    const mapsUrl = item.location_lat && item.location_lng
      ? `https://www.google.com/maps/dir/?api=1&destination=${item.location_lat},${item.location_lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.title + ' ' + cityName)}`;
    if (Platform.OS === 'web') window.open(mapsUrl, '_blank');
    else Linking.openURL(mapsUrl);
  };

  if (Platform.OS !== 'web') {
    return (
      <View style={{ backgroundColor: '#f8f4ec', borderRadius: 16, padding: 24, alignItems: 'center', gap: 8 }}>
        <Map size={32} color={BRAND_COLORS.primary} />
        <Text style={{ fontWeight: '700', color: '#1B3A2D', textAlign: 'center' }}>Bản đồ Google Maps tương tác</Text>
        <Text style={{ color: '#888', fontSize: 13, textAlign: 'center' }}>Mở vivu-planner.vercel.app để xem bản đồ Google Maps đầy đủ.</Text>
      </View>
    );
  }

  const leafletHTML = buildLeafletHTML(filteredItems, centerLat, centerLng, cityName);

  return (
    <View style={{ gap: 14 }}>
      {/* Legend */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {Object.entries(TYPE_EMOJI).map(([type, emoji]) => {
          const count = filteredItems.filter(i => i.item_type === type).length;
          if (count === 0) return null;
          return (
            <View key={type} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f8f4ec', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: TYPE_COLORS[type] }} />
              <Text style={{ fontSize: 12, color: '#444', fontWeight: '600' }}>{emoji} {TYPE_LABELS[type]} ({count})</Text>
            </View>
          );
        })}
      </View>

      {/* Day Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[{ id: 'all', label: 'Tất cả ngày' }, ...days.map(d => ({ id: d, label: `Ngày ${d}` }))].map(day => (
            <Pressable
              key={day.id}
              onPress={() => setSelectedDay(day.id as any)}
              style={{
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                backgroundColor: selectedDay === day.id ? BRAND_COLORS.primary : '#f0ebe0',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: selectedDay === day.id ? '#fff' : '#555' }}>
                {day.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Map Display with Google Maps Tiles */}
      {mappableItems.length > 0 ? (
        Platform.OS === 'web' ? (
          // @ts-ignore
          <iframe
            ref={iframeRef}
            srcDoc={leafletHTML}
            style={{ width: '100%', height: 420, border: 'none', borderRadius: 18, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}
            title="Google Maps ViVu Planner"
          />
        ) : null
      ) : (
        <View style={{ backgroundColor: '#f8f4ec', borderRadius: 16, padding: 32, alignItems: 'center' }}>
          <MapPin size={28} color="#bbb" />
          <Text style={{ color: '#888', marginTop: 8, fontSize: 14 }}>Không có địa điểm nào có tọa độ cho ngày này</Text>
        </View>
      )}

      {/* Interactive Location List with Google Maps Directions Buttons */}
      {mappableItems.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text style={{ fontWeight: '800', color: '#1B3A2D', fontSize: 14 }}>
            🗺️ {mappableItems.length} địa điểm trên Google Maps (Nhấp để mở chỉ đường)
          </Text>
          {mappableItems.map(item => (
            <View key={item.id} style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: '#fafaf8', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#f0ebe0',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: TYPE_COLORS[item.item_type] || '#888' }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, color: '#1B3A2D', fontWeight: '700' }} numberOfLines={1}>{item.title}</Text>
                  <Text style={{ fontSize: 11, color: '#888' }}>
                    {TYPE_EMOJI[item.item_type] || '📍'} {TYPE_LABELS[item.item_type] || item.item_type} · {item.start_time || `Ngày ${item.day_number}`}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => openGoogleMaps(item)}
                style={{ backgroundColor: BRAND_COLORS.primary, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 }}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>📍 Chỉ đường Google Maps ↗</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
