import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, Platform, Pressable, ScrollView } from 'react-native';
import { Plus, Check, MapPin, Sparkles } from 'lucide-react-native';
import PlaceFilter, { CategoryFilter } from './PlaceFilter';
import PlacePopup, { PlaceItem } from './PlacePopup';

interface CuratedMapProps {
  places: PlaceItem[];
  centerLat?: number;
  centerLng?: number;
  cityName?: string;
  addedPlaceIds?: string[];
  existingTripPlaceNames?: string[];
  onAddToCart: (place: PlaceItem, option: 'auto' | 'manual', customCost?: number) => void;
}

function buildCuratedLeafletHTML(
  places: PlaceItem[],
  centerLat: number,
  centerLng: number,
  cityName: string
): string {
  const jsonPlaces = JSON.stringify(places);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; }
    .custom-pin {
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: 50%;
      color: #fff; font-size: 14px; font-weight: bold;
      border: 2px solid #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.25);
      cursor: pointer; transition: transform 0.2s ease;
    }
    .custom-pin:hover { transform: scale(1.2); }
    .leaflet-popup-content-wrapper { border-radius: 12px; font-family: sans-serif; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const map = L.map('map').setView([${centerLat}, ${centerLng}], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const places = ${jsonPlaces};

    const getColor = (cat) => {
      switch (cat) {
        case 'dining': return '#B23B3B';
        case 'cafe': return '#F0B255';
        case 'hotel': return '#2563EB';
        case 'attraction': return '#8B5CF6';
        default: return '#1F6F54';
      }
    };

    const getEmoji = (cat) => {
      switch (cat) {
        case 'dining': return '🍽️';
        case 'cafe': return '☕';
        case 'hotel': return '🏨';
        case 'attraction': return '🏔️';
        default: return '📍';
      }
    };

    places.forEach((p) => {
      if (!p.lat || !p.lng) return;

      const color = getColor(p.category);
      const emoji = getEmoji(p.category);

      const icon = L.divIcon({
        className: '',
        html: \`<div class="custom-pin" style="background-color: \${color}">\${emoji}</div>\`,
        iconSize: [32, 32],
        iconAnchor: [16, 32]
      });

      const marker = L.marker([p.lat, p.lng], { icon }).addTo(map);
      marker.on('click', () => {
        if (window.parent) {
          window.parent.postMessage(JSON.stringify({ type: 'PLACE_CLICK', placeId: p.id }), '*');
        }
      });
    });
  </script>
</body>
</html>
  `;
}

export default function CuratedMap({
  places,
  centerLat = 11.9404,
  centerLng = 108.4583,
  cityName = 'Đà Lạt',
  addedPlaceIds = [],
  existingTripPlaceNames = [],
  onAddToCart,
}: CuratedMapProps) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [maxPrice, setMaxPrice] = useState<number>(2000000);
  const [activePlace, setActivePlace] = useState<PlaceItem | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleMessage = (event: MessageEvent) => {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (data && data.type === 'PLACE_CLICK' && data.placeId) {
            const found = places.find(p => p.id === data.placeId);
            if (found) {
              setActivePlace(found);
            }
          }
        } catch (e) {
          // ignore
        }
      };
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }
  }, [places]);

  const filteredPlaces = useMemo(() => {
    return places.filter((p) => {
      const matchCat = selectedCategory === 'all' || p.category === selectedCategory;
      const cost = p.estimated_cost || (p.price_level ? p.price_level * 50000 : 50000);
      const matchPrice = cost <= maxPrice;
      return matchCat && matchPrice;
    });
  }, [places, selectedCategory, maxPrice]);

  const htmlContent = useMemo(() => {
    return buildCuratedLeafletHTML(filteredPlaces, centerLat, centerLng, cityName);
  }, [filteredPlaces, centerLat, centerLng, cityName]);

  return (
    <View style={{ flex: 1, gap: 14 }}>
      <View style={{ height: 360, position: 'relative', overflow: 'hidden', borderRadius: 16, borderWidth: 1, borderColor: '#f0ebe0' }}>
        {/* Top Filter Bar */}
        <View style={{ position: 'absolute', top: 12, left: 12, right: 12, zIndex: 500 }}>
          <PlaceFilter
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            maxPrice={maxPrice}
            onChangeMaxPrice={setMaxPrice}
          />
        </View>

        {/* Map Display */}
        {Platform.OS === 'web' ? (
          <iframe
            srcDoc={htmlContent}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="Curated Map"
          />
        ) : (
          <View style={{ flex: 1, backgroundColor: '#F3ECDC', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', color: '#1B2420' }}>
              Bản đồ đang hiển thị {filteredPlaces.length} địa điểm tại {cityName}
            </Text>
          </View>
        )}
      </View>

      {/* Recommended Places Cards List */}
      <View style={{ gap: 10 }}>
        <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 14, color: '#1B2420' }}>
          📍 Gợi ý địa điểm nổi bật tại {cityName} ({filteredPlaces.length} địa điểm)
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 10 }}>
          {filteredPlaces.map((place) => {
            const costValue = place.estimated_cost || (place.price_level ? place.price_level * 50000 : 50000);
            const isAddedInCart = addedPlaceIds.includes(place.id);
            const placeNameNorm = place.name.toLowerCase().trim();
            const isAlreadyInTrip = (existingTripPlaceNames || []).some(
              n => n && (n.toLowerCase().trim().includes(placeNameNorm) || placeNameNorm.includes(n.toLowerCase().trim()))
            );

            const isAdded = isAddedInCart || isAlreadyInTrip;
            const addedLabel = isAlreadyInTrip ? '✓ Đã có trong lịch trình' : '✓ Đã thêm vào giỏ';

            return (
              <View
                key={place.id}
                style={{
                  width: 260,
                  backgroundColor: '#FFFFFF',
                  borderRadius: 16,
                  padding: 14,
                  borderWidth: isAdded ? 1.5 : 1,
                  borderColor: isAlreadyInTrip ? '#134A37' : (isAddedInCart ? '#1F6F54' : 'rgba(27,36,32,0.1)'),
                  gap: 8,
                  justifyContent: 'space-between',
                }}
              >
                <View style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#1F6F54', backgroundColor: 'rgba(31,111,84,0.1)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                      {place.category === 'dining' ? '🔴 Ăn uống' : place.category === 'cafe' ? '🟡 Cafe' : place.category === 'hotel' ? '🔵 Khách sạn' : '🟣 Vui chơi'}
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#E2703A' }}>
                      {costValue.toLocaleString('vi-VN')} đ
                    </Text>
                  </View>

                  <Text numberOfLines={1} style={{ fontFamily: 'Lora_700Bold', fontSize: 14, color: '#1B2420' }}>
                    {place.name}
                  </Text>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MapPin size={12} color="#6E7B70" />
                    <Text numberOfLines={1} style={{ fontSize: 11, color: '#6E7B70', flex: 1 }}>
                      {place.address}
                    </Text>
                  </View>

                  {place.social_review_quote && (
                    <Text numberOfLines={2} style={{ fontSize: 11, fontStyle: 'italic', color: '#3F4F45', backgroundColor: '#FBF5EA', padding: 6, borderRadius: 8, marginTop: 2 }}>
                      💬 "{place.social_review_quote}"
                    </Text>
                  )}
                </View>

                {/* Add / Added Button */}
                <Pressable
                  onPress={() => {
                    if (!isAlreadyInTrip) {
                      setActivePlace(place);
                    }
                  }}
                  style={({ pressed }) => [{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 8,
                    borderRadius: 10,
                    backgroundColor: isAlreadyInTrip ? '#134A37' : (isAddedInCart ? '#1F6F54' : '#E2703A'),
                    opacity: (pressed && !isAlreadyInTrip) ? 0.85 : 1,
                    marginTop: 4,
                  }]}
                >
                  {isAdded ? (
                    <>
                      <Check size={14} color="#FFFFFF" />
                      <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 12, color: '#FFFFFF' }}>
                        {addedLabel}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Plus size={14} color="#FFFFFF" />
                      <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 12, color: '#FFFFFF' }}>
                        Thêm vào giỏ chuyến đi
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* Place Active Popup */}
      {activePlace && (
        <PlacePopup
          place={activePlace}
          onClose={() => setActivePlace(null)}
          onAddToCart={(p, opt, cost) => {
            onAddToCart(p, opt, cost);
            setActivePlace(null);
          }}
        />
      )}
    </View>
  );
}
