import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  'Hà Nội':         { lat: 21.0285, lng: 105.8542 },
  'Đà Nẵng':        { lat: 16.0544, lng: 108.2022 },
  'TP. Hồ Chí Minh':{ lat: 10.7769, lng: 106.7009 },
  'Hội An':         { lat: 15.8800, lng: 108.3380 },
  'Huế':            { lat: 16.4637, lng: 107.5909 },
  'Nha Trang':      { lat: 12.2388, lng: 109.1967 },
  'Đà Lạt':         { lat: 11.9404, lng: 108.4583 },
  'Phú Quốc':       { lat: 10.2899, lng: 103.9840 },
  'Sa Pa':          { lat: 22.3364, lng: 103.8438 },
  'Ninh Bình':      { lat: 20.2506, lng: 105.9745 },
  'Vũng Tàu':       { lat: 10.3460, lng: 107.0843 },
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface LocationResult {
  distanceKm: number | null;
  loading: boolean;
  error: string | null;
}

export function useDistanceToCity(destinationCity: string): LocationResult {
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const destCoords = CITY_COORDS[destinationCity];
    if (!destCoords) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) setError('Không có quyền truy cập vị trí');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) {
          const km = haversineKm(
            pos.coords.latitude,
            pos.coords.longitude,
            destCoords.lat,
            destCoords.lng,
          );
          setDistanceKm(Math.round(km));
        }
      } catch {
        if (!cancelled) setError('Không lấy được vị trí');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [destinationCity]);

  return { distanceKm, loading, error };
}
