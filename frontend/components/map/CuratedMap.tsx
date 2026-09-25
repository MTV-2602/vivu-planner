import React, { useState, useMemo } from 'react';
import { View, Text, Platform } from 'react-native';
import PlaceFilter, { CategoryFilter } from './PlaceFilter';
import PlacePopup, { PlaceItem } from './PlacePopup';

interface CuratedMapProps {
  places: PlaceItem[];
  centerLat?: number;
  centerLng?: number;
  cityName?: string;
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
  onAddToCart,
}: CuratedMapProps) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [maxPrice, setMaxPrice] = useState<number>(2000000);
  const [activePlace, setActivePlace] = useState<PlaceItem | null>(null);

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
    <View style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      {/* Top Filter Bar */}
      <View style={{ position: 'absolute', top: 16, left: 16, right: 16, zIndex: 500 }}>
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
