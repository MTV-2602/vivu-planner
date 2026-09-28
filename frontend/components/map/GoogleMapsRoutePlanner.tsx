import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, Pressable, Platform, ScrollView, Linking } from 'react-native';
import {
  Car,
  Bike,
  Footprints,
  Bus,
  GripVertical,
  Plus,
  X,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  Share2,
  Smartphone,
  Check,
  Clock,
  MapPin,
  RotateCcw,
  Sparkles
} from 'lucide-react-native';
import { BRAND_COLORS } from '../../constants';
import { getCityCenterCoords } from './CuratedMap';

export interface RouteWaypoint {
  id: string;
  title: string;
  address?: string;
  lat?: number;
  lng?: number;
  item_type?: string;
  start_time?: string;
  end_time?: string;
  estimated_cost?: number | null;
  day_number?: number;
  google_place_id?: string | null;
}

export interface GoogleMapsRoutePlannerProps {
  waypoints: RouteWaypoint[];
  cityName?: string;
  dayNumber?: number;
  dayTitle?: string;
  onReorder?: (newWaypoints: RouteWaypoint[]) => void;
  onAddWaypoint?: () => void;
  onRemoveWaypoint?: (id: string) => void;
  onSaveOrder?: (newWaypoints: RouteWaypoint[]) => Promise<void> | void;
  readOnly?: boolean;
  mapHeight?: number;
}

type TransitMode = 'driving' | 'motorcycle' | 'walking' | 'transit';

function buildGoogleMapsRouteHTML(
  waypoints: RouteWaypoint[],
  centerLat: number,
  centerLng: number,
  cityName: string,
  mode: TransitMode
): string {
  const jsonWaypoints = JSON.stringify(waypoints);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    
    /* Marker Styles */
    .gmap-marker {
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      color: #fff;
      font-weight: 800;
      box-shadow: 0 3px 10px rgba(0,0,0,0.35);
      border: 2.5px solid #ffffff;
      cursor: pointer;
      transition: transform 0.18s ease;
    }
    .gmap-marker:hover {
      transform: scale(1.18);
    }
    .gmap-dest-pin {
      width: 32px;
      height: 42px;
      background: radial-gradient(circle at 50% 35%, #EA4335 0%, #C5221F 100%);
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 4px 12px rgba(197,34,31,0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      border: 2px solid #ffffff;
      transition: transform 0.18s ease;
    }
    .gmap-dest-pin::after {
      content: '';
      width: 10px;
      height: 10px;
      background: #ffffff;
      border-radius: 50%;
    }
    .gmap-dest-pin:hover {
      transform: rotate(-45deg) scale(1.15);
    }

    /* Popup Styles */
    .leaflet-popup-content-wrapper {
      border-radius: 12px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.22);
      padding: 4px;
    }
    .gmap-popup {
      padding: 6px;
      min-width: 190px;
    }
    .gmap-popup-title {
      font-size: 14px;
      font-weight: 700;
      color: #202124;
      margin-bottom: 4px;
    }
    .gmap-popup-sub {
      font-size: 11px;
      color: #5f6368;
      margin-bottom: 6px;
    }
    .gmap-popup-badge {
      display: inline-block;
      padding: 3px 8px;
      background: #E8F0FE;
      color: #1A73E8;
      font-size: 11px;
      font-weight: 700;
      border-radius: 6px;
    }

    /* Custom Leaflet Controls */
    .leaflet-control-zoom {
      border: none !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18) !important;
      border-radius: 8px !important;
      overflow: hidden;
    }
    .leaflet-control-zoom a {
      color: #3c4043 !important;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const map = L.map('map', { zoomControl: true }).setView([${centerLat}, ${centerLng}], 13);

    // Google Maps Roadmap Tiles
    const googleTileLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '&copy; Google Maps'
    }).addTo(map);

    googleTileLayer.on('tileerror', function() {
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '&copy; Esri World Street Map'
      }).addTo(map);
    });

    const rawWaypoints = ${jsonWaypoints};
    const validWaypoints = rawWaypoints.filter(w => w.lat && w.lng && !isNaN(Number(w.lat)) && !isNaN(Number(w.lng)));
    const bounds = L.latLngBounds([]);

    // Letter label generator (A, B, C, D...)
    function getLetter(index) {
      return String.fromCharCode(65 + (index % 26));
    }

    // 1. Cắm Markers cho từng Waypoint
    validWaypoints.forEach((wp, idx) => {
      const lat = Number(wp.lat);
      const lng = Number(wp.lng);
      bounds.extend([lat, lng]);

      const isFirst = idx === 0;
      const isLast = idx === validWaypoints.length - 1 && validWaypoints.length > 1;
      const letter = getLetter(idx);

      let markerIcon;
      if (isLast) {
        // Điểm đích cuối: Pin đỏ Google Maps
        markerIcon = L.divIcon({
          className: '',
          html: '<div class="gmap-dest-pin" title="' + wp.title.replace(/"/g, '&quot;') + '"></div>',
          iconSize: [32, 42],
          iconAnchor: [16, 42]
        });
      } else {
        // Điểm đầu hoặc điểm dừng trung gian: Vòng tròn xanh/đen có chữ cái A, B, C...
        const bgColor = isFirst ? '#1A73E8' : '#3C4043';
        markerIcon = L.divIcon({
          className: '',
          html: '<div class="gmap-marker" style="background:' + bgColor + '; width:28px; height:28px; font-size:12px;">' + letter + '</div>',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });
      }

      const marker = L.marker([lat, lng], { icon: markerIcon }).addTo(map);
      marker.bindPopup(
        '<div class="gmap-popup">' +
          '<div class="gmap-popup-badge">' + (isFirst ? 'Điểm xuất phát (' + letter + ')' : (isLast ? 'Điểm kết thúc (' + letter + ')' : 'Điểm dừng ' + letter)) + '</div>' +
          '<div class="gmap-popup-title" style="margin-top:6px;">' + wp.title + '</div>' +
          '<div class="gmap-popup-sub">' + (wp.address || '${cityName}') + '</div>' +
          (wp.estimated_cost ? '<div style="font-size:12px;font-weight:700;color:#1F6F54;">Chi phí: ' + Number(wp.estimated_cost).toLocaleString('vi-VN') + ' đ</div>' : '') +
        '</div>'
      );
    });

    // 2. Fetch OSRM Real Road Routing & Draw Street Polyline
    async function fetchAndDrawRoute() {
      if (validWaypoints.length < 2) return;

      const coords = validWaypoints.map(w => ({ lat: Number(w.lat), lng: Number(w.lng) }));
      const coordStr = coords.map(c => c.lng + ',' + c.lat).join(';');
      
      const currentMode = '${mode}';
      const osrmProfile = currentMode === 'walking' ? 'walking' : (currentMode === 'motorcycle' ? 'driving' : 'driving');
      const url = 'https://router.project-osrm.org/route/v1/' + osrmProfile + '/' + coordStr + '?overview=full&geometries=geojson&steps=true';

      try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes[0]) {
          const route = data.routes[0];
          const linePts = route.geometry.coordinates.map(pt => [pt[1], pt[0]]);

          // Đường viền đổ bóng (Outer glow/border)
          L.polyline(linePts, {
            color: '#0D47A1',
            weight: 8,
            opacity: 0.35,
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(map);

          // Tuyến đường xe chạy chính (Google Maps Route Blue)
          L.polyline(linePts, {
            color: '#1A73E8',
            weight: 5.5,
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(map);

          // Trích xuất tên đường chính từ các bước di chuyển
          let detectedMainRoad = '';
          if (route.legs) {
            for (const leg of route.legs) {
              if (leg.steps) {
                for (const step of leg.steps) {
                  if (step.name && step.name.trim().length > 2 && !detectedMainRoad) {
                    detectedMainRoad = step.name;
                    break;
                  }
                }
              }
              if (detectedMainRoad) break;
            }
          }

          const totalKm = (route.distance / 1000).toFixed(1);
          let durationMinutes = Math.round(route.duration / 60);
          if (currentMode === 'motorcycle') {
            durationMinutes = Math.max(3, Math.round(durationMinutes * 0.85));
          } else if (currentMode === 'transit') {
            durationMinutes = Math.max(5, Math.round(durationMinutes * 1.35) + (coords.length - 1) * 4);
          }

          // Gửi thông tin về cho ứng dụng React Native Web
          if (window.parent) {
            window.parent.postMessage(JSON.stringify({
              type: 'ROUTE_INFO_UPDATE',
              distanceKm: totalKm,
              durationMinutes: durationMinutes,
              mainRoad: detectedMainRoad || 'Tuyến đường nhanh nhất'
            }), '*');
          }
          return;
        }
      } catch (err) {
        console.warn('OSRM routing unavailable, fallback to straight polyline:', err);
      }

      // Tuyến đường dự phòng nét đứt nếu không gọi được OSRM
      const fallbackPts = coords.map(c => [c.lat, c.lng]);
      L.polyline(fallbackPts, {
        color: '#1A73E8',
        weight: 5,
        opacity: 0.85,
        dashArray: '8, 8'
      }).addTo(map);

      let directMeters = 0;
      for (let i = 0; i < coords.length - 1; i++) {
        directMeters += L.latLng(coords[i]).distanceTo(L.latLng(coords[i + 1]));
      }
      const approxKm = ((directMeters * 1.25) / 1000).toFixed(1);
      const approxMin = Math.round((Number(approxKm) / 25) * 60) + (coords.length - 1) * 3;

      if (window.parent) {
        window.parent.postMessage(JSON.stringify({
          type: 'ROUTE_INFO_UPDATE',
          distanceKm: approxKm,
          durationMinutes: approxMin,
          mainRoad: 'Tuyến đường thẳng nối các điểm'
        }), '*');
      }
    }

    fetchAndDrawRoute();

    // Tự động fitBounds để thấy trọn vẹn lộ trình
    setTimeout(() => {
      map.invalidateSize();
      if (bounds.isValid() && validWaypoints.length > 0) {
        map.fitBounds(bounds, { padding: [45, 45], maxZoom: 16 });
      } else {
        map.setView([${centerLat}, ${centerLng}], 13);
      }
    }, 250);

    window.addEventListener('resize', () => map.invalidateSize());
  </script>
</body>
</html>`;
}

export default function GoogleMapsRoutePlanner({
  waypoints: initialWaypoints,
  cityName = 'Đà Nẵng',
  dayNumber,
  dayTitle,
  onReorder,
  onAddWaypoint,
  onRemoveWaypoint,
  onSaveOrder,
  readOnly = false,
  mapHeight = 520,
}: GoogleMapsRoutePlannerProps) {
  const [waypoints, setWaypoints] = useState<RouteWaypoint[]>(initialWaypoints);
  const [selectedTransit, setSelectedTransit] = useState<TransitMode>('driving');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [routeInfo, setRouteInfo] = useState<{
    distanceKm: string;
    durationMinutes: number;
    mainRoad: string;
  }>({
    distanceKm: '0.0',
    durationMinutes: 0,
    mainRoad: 'Đang tính toán tuyến đường...',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Đồng bộ khi prop waypoints thay đổi từ ngoài
  useEffect(() => {
    setWaypoints(initialWaypoints);
  }, [initialWaypoints]);

  // Lắng nghe dữ liệu OSRM từ iframe map
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleMessage = (event: MessageEvent) => {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (data && data.type === 'ROUTE_INFO_UPDATE') {
            setRouteInfo({
              distanceKm: data.distanceKm || '0.0',
              durationMinutes: data.durationMinutes || 0,
              mainRoad: data.mainRoad || 'Tuyến đường nhanh nhất',
            });
          }
        } catch (e) {
          // ignore
        }
      };
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }
  }, []);

  // Tính tọa độ trung tâm thành phố
  const { centerLat, centerLng } = useMemo(() => {
    const valid = waypoints.filter(w => w.lat && w.lng && !isNaN(Number(w.lat)) && !isNaN(Number(w.lng)));
    if (valid.length > 0) {
      const avgLat = valid.reduce((acc, w) => acc + Number(w.lat), 0) / valid.length;
      const avgLng = valid.reduce((acc, w) => acc + Number(w.lng), 0) / valid.length;
      return { centerLat: avgLat, centerLng: avgLng };
    }
    const coords = getCityCenterCoords(cityName);
    return { centerLat: coords.lat, centerLng: coords.lng };
  }, [waypoints, cityName]);

  // HTML cho iframe Leaflet
  const iframeHTML = useMemo(() => {
    return buildGoogleMapsRouteHTML(waypoints, centerLat, centerLng, cityName, selectedTransit);
  }, [waypoints, centerLat, centerLng, cityName, selectedTransit]);

  // Hoán đổi vị trí waypoints khi kéo thả
  const reorderWaypoints = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= waypoints.length || toIdx >= waypoints.length) {
      return;
    }
    const updated = [...waypoints];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    setWaypoints(updated);
    setJustSaved(false);

    if (onReorder) {
      onReorder(updated);
    }
  };

  // Drag and drop handlers (Web)
  const handleDragStart = (idx: number, e: any) => {
    if (readOnly) return;
    setDraggedIndex(idx);
    if (e?.dataTransfer) {
      e.dataTransfer.setData('text/plain', String(idx));
      e.dataTransfer.effectAllowed = 'move';
    }
  };

  const handleDragOver = (idx: number, e: any) => {
    if (readOnly) return;
    if (e?.preventDefault) e.preventDefault();
    if (dragOverIndex !== idx) {
      setDragOverIndex(idx);
    }
  };

  const handleDrop = (idx: number, e: any) => {
    if (readOnly) return;
    if (e?.preventDefault) e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== idx) {
      reorderWaypoints(draggedIndex, idx);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Nút di chuyển lên / xuống cho phím bấm
  const moveUp = (idx: number) => {
    if (idx > 0) reorderWaypoints(idx, idx - 1);
  };
  const moveDown = (idx: number) => {
    if (idx < waypoints.length - 1) reorderWaypoints(idx, idx + 1);
  };

  // Lưu thứ tự mới
  const handleSave = async () => {
    if (!onSaveOrder) return;
    setIsSaving(true);
    try {
      await onSaveOrder(waypoints);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (err) {
      console.error('Save order failed:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Tạo URL Google Maps Directions thật để mở trên thiết bị
  const googleMapsDirectionsUrl = useMemo(() => {
    const valid = waypoints.filter(w => w.lat && w.lng);
    if (valid.length === 0) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cityName)}`;
    if (valid.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(valid[0].title + ' ' + cityName)}`;

    const origin = encodeURIComponent(`${valid[0].lat},${valid[0].lng}`);
    const dest = encodeURIComponent(`${valid[valid.length - 1].lat},${valid[valid.length - 1].lng}`);
    const intermediate = valid.slice(1, valid.length - 1);
    const waypointsParam = intermediate.length > 0
      ? `&waypoints=${intermediate.map(w => encodeURIComponent(`${w.lat},${w.lng}`)).join('|')}`
      : '';

    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${waypointsParam}&travelmode=${selectedTransit === 'motorcycle' ? 'two_wheeler' : (selectedTransit === 'walking' ? 'walking' : 'driving')}`;
  }, [waypoints, cityName, selectedTransit]);

  // Sao chép liên kết lộ trình
  const handleCopyLink = () => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(googleMapsDirectionsUrl).then(() => {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2500);
      });
    } else {
      Linking.openURL(googleMapsDirectionsUrl);
    }
  };

  const getLetter = (index: number) => String.fromCharCode(65 + (index % 26));

  return (
    <View style={{ width: '100%', backgroundColor: '#FFFFFF', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(27,36,32,0.12)', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' as any }}>
      {/* ── TOP HEADER: TIÊU ĐỀ LỘ TRÌNH VÀ THANH CHỌN PHƯƠNG TIỆN ── */}
      <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(27,36,32,0.08)', backgroundColor: '#FAFAFA' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#1A73E8', alignItems: 'center', justifyContent: 'center' }}>
              <MapPin size={18} color="#FFFFFF" />
            </View>
            <View>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#1B2420', fontFamily: 'Lora_700Bold' }}>
                Lộ trình Google Maps {dayNumber ? `· Ngày ${dayNumber}` : ''}
              </Text>
              <Text style={{ fontSize: 11, color: '#5F6368', fontWeight: '500' }}>
                {dayTitle || `Kéo thả để sắp xếp lại thứ tự di chuyển tại ${cityName}`}
              </Text>
            </View>
          </View>

          {/* Nút lưu thứ tự (nếu có callback onSaveOrder) */}
          {onSaveOrder && !readOnly && (
            <Pressable
              testID="btn-save-gmap-order"
              onPress={handleSave}
              disabled={isSaving}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: justSaved ? '#134A37' : '#1A73E8',
                cursor: 'pointer' as any,
              }}
            >
              {justSaved ? (
                <>
                  <Check size={14} color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Đã lưu lộ trình</Text>
                </>
              ) : (
                <>
                  <Sparkles size={14} color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                    {isSaving ? 'Đang lưu...' : 'Lưu thứ tự mới'}
                  </Text>
                </>
              )}
            </Pressable>
          )}
        </View>

        {/* Transit Mode Tabs (Driving, Motorcycle, Transit, Walking) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: 'rgba(27,36,32,0.06)', paddingTop: 10 }}>
          <Pressable
            testID="transit-mode-driving"
            onPress={() => setSelectedTransit('driving')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 8,
              backgroundColor: selectedTransit === 'driving' ? '#E8F0FE' : 'transparent',
              borderWidth: 1,
              borderColor: selectedTransit === 'driving' ? '#1A73E8' : 'transparent',
              cursor: 'pointer' as any,
            }}
          >
            <Car size={16} color={selectedTransit === 'driving' ? '#1A73E8' : '#5F6368'} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: selectedTransit === 'driving' ? '#1A73E8' : '#5F6368' }}>
              Ô tô {selectedTransit === 'driving' && routeInfo.durationMinutes > 0 ? `· ${routeInfo.durationMinutes}p` : ''}
            </Text>
          </Pressable>

          <Pressable
            testID="transit-mode-motorcycle"
            onPress={() => setSelectedTransit('motorcycle')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 8,
              backgroundColor: selectedTransit === 'motorcycle' ? '#E8F0FE' : 'transparent',
              borderWidth: 1,
              borderColor: selectedTransit === 'motorcycle' ? '#1A73E8' : 'transparent',
              cursor: 'pointer' as any,
            }}
          >
            <Bike size={16} color={selectedTransit === 'motorcycle' ? '#1A73E8' : '#5F6368'} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: selectedTransit === 'motorcycle' ? '#1A73E8' : '#5F6368' }}>
              Xe máy {selectedTransit === 'motorcycle' && routeInfo.durationMinutes > 0 ? `· ${routeInfo.durationMinutes}p` : ''}
            </Text>
          </Pressable>

          <Pressable
            testID="transit-mode-walking"
            onPress={() => setSelectedTransit('walking')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 8,
              backgroundColor: selectedTransit === 'walking' ? '#E8F0FE' : 'transparent',
              borderWidth: 1,
              borderColor: selectedTransit === 'walking' ? '#1A73E8' : 'transparent',
              cursor: 'pointer' as any,
            }}
          >
            <Footprints size={16} color={selectedTransit === 'walking' ? '#1A73E8' : '#5F6368'} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: selectedTransit === 'walking' ? '#1A73E8' : '#5F6368' }}>
              Đi bộ
            </Text>
          </Pressable>

          <Pressable
            testID="transit-mode-transit"
            onPress={() => setSelectedTransit('transit')}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 8,
              backgroundColor: selectedTransit === 'transit' ? '#E8F0FE' : 'transparent',
              borderWidth: 1,
              borderColor: selectedTransit === 'transit' ? '#1A73E8' : 'transparent',
              cursor: 'pointer' as any,
            }}
          >
            <Bus size={16} color={selectedTransit === 'transit' ? '#1A73E8' : '#5F6368'} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: selectedTransit === 'transit' ? '#1A73E8' : '#5F6368' }}>
              Xe buýt
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ── MAIN BODY: 2 CỘT SPLIT-VIEW (TRÁI: WAYPOINTS LIST; PHẢI: BẢN ĐỒ) ── */}
      <View style={{ flexDirection: Platform.OS === 'web' && window.innerWidth >= 880 ? 'row' : 'column' }}>
        
        {/* CỘT TRÁI: DANH SÁCH WAYPOINTS KÉO THẢ & TÓM TẮT LỘ TRÌNH */}
        <View style={{
          width: Platform.OS === 'web' && window.innerWidth >= 880 ? 380 : '100%',
          borderRightWidth: 1,
          borderRightColor: 'rgba(27,36,32,0.08)',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <ScrollView style={{ maxHeight: 440, padding: 16 }} showsVerticalScrollIndicator={false}>
            {/* Waypoints List with Google Maps Timeline Indicators */}
            <View style={{ gap: 4 }}>
              {waypoints.map((item, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === waypoints.length - 1 && waypoints.length > 1;
                const isDragging = draggedIndex === idx;
                const isOver = dragOverIndex === idx;
                const letter = getLetter(idx);

                return (
                  <View
                    key={item.id}
                    testID={`gmap-waypoint-row-${item.id}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      opacity: isDragging ? 0.4 : 1,
                    }}
                  >
                    {/* Cột mốc Waypoint (Tròn / 3 chấm / Ghim đỏ) */}
                    <View style={{ alignItems: 'center', width: 24, alignSelf: 'stretch' }}>
                      {/* Biểu tượng điểm */}
                      <View style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: isLast ? '#EA4335' : (isFirst ? '#1A73E8' : '#3C4043'),
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 2,
                        borderColor: '#FFFFFF',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.2)' as any,
                        zIndex: 2,
                      }}>
                        {isLast ? (
                          <MapPin size={11} color="#FFFFFF" />
                        ) : (
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>
                            {letter}
                          </Text>
                        )}
                      </View>

                      {/* Trục nối 3 chấm thẳng đứng giữa các điểm */}
                      {!isLast && (
                        <View style={{
                          flex: 1,
                          width: 2,
                          backgroundColor: 'rgba(27,36,32,0.18)',
                          borderStyle: 'dashed',
                          marginVertical: 2,
                        }} />
                      )}
                    </View>

                    {/* Thẻ ô địa điểm (kéo thả được) */}
                    <View
                      testID={`gmap-waypoint-card-${item.id}`}
                      style={{
                        flex: 1,
                        backgroundColor: isOver ? '#E8F0FE' : '#F8F9FA',
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: isOver ? '#1A73E8' : 'rgba(27,36,32,0.12)',
                        paddingHorizontal: 12,
                        paddingVertical: 9,
                        marginVertical: 4,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: readOnly ? 'default' : 'grab' as any,
                      }}
                      // @ts-ignore
                      draggable={!readOnly}
                      // @ts-ignore
                      onDragStart={(e: any) => handleDragStart(idx, e)}
                      // @ts-ignore
                      onDragOver={(e: any) => handleDragOver(idx, e)}
                      // @ts-ignore
                      onDrop={(e: any) => handleDrop(idx, e)}
                      // @ts-ignore
                      onDragEnd={handleDragEnd}
                    >
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: '#202124' }}>
                          {item.title}
                        </Text>
                        <Text numberOfLines={1} style={{ fontSize: 11, color: '#5F6368', marginTop: 1 }}>
                          {item.address || cityName}
                        </Text>
                      </View>

                      {/* Controls: Up/Down buttons + Drag Handle + Remove */}
                      {!readOnly && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                          {/* Nút đẩy lên */}
                          {idx > 0 && (
                            <Pressable
                              testID={`btn-move-up-${item.id}`}
                              onPress={() => moveUp(idx)}
                              style={{ padding: 4, borderRadius: 4, cursor: 'pointer' as any }}
                            >
                              <ChevronUp size={14} color="#5F6368" />
                            </Pressable>
                          )}

                          {/* Nút đẩy xuống */}
                          {idx < waypoints.length - 1 && (
                            <Pressable
                              testID={`btn-move-down-${item.id}`}
                              onPress={() => moveDown(idx)}
                              style={{ padding: 4, borderRadius: 4, cursor: 'pointer' as any }}
                            >
                              <ChevronDown size={14} color="#5F6368" />
                            </Pressable>
                          )}

                          {/* Biểu tượng Grip kéo thả */}
                          <View style={{ paddingHorizontal: 2 }}>
                            <GripVertical size={16} color="#9AA0A6" />
                          </View>

                          {/* Nút xóa điểm */}
                          {onRemoveWaypoint && waypoints.length > 2 && (
                            <Pressable
                              onPress={() => onRemoveWaypoint(item.id)}
                              style={{ padding: 4, borderRadius: 4, cursor: 'pointer' as any }}
                            >
                              <X size={14} color="#D93025" />
                            </Pressable>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Nút Add destination (+ Thêm điểm đến) */}
            {onAddWaypoint && !readOnly && (
              <Pressable
                testID="btn-add-destination"
                onPress={onAddWaypoint}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 8,
                  marginTop: 6,
                  borderRadius: 10,
                  cursor: 'pointer' as any,
                }}
              >
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#5F6368', alignItems: 'center', justifyContent: 'center' }}>
                  <Plus size={14} color="#5F6368" />
                </View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#1A73E8' }}>
                  + Thêm điểm đến (Add destination)
                </Text>
              </Pressable>
            )}
          </ScrollView>

          {/* ── ROUTE SUMMARY CARD (TƯƠNG TỰ GOOGLE MAPS PANEL TRONG ẢNH) ── */}
          <View style={{
            padding: 16,
            borderTopWidth: 1,
            borderTopColor: 'rgba(27,36,32,0.08)',
            backgroundColor: '#F8F9FA',
            gap: 12,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#E8F0FE', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                <Car size={18} color="#1A73E8" />
              </View>

              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#202124' }}>
                    {routeInfo.durationMinutes > 0 ? `${routeInfo.durationMinutes} phút` : 'Đang tính...'}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#5F6368' }}>
                    {routeInfo.distanceKm} km
                  </Text>
                </View>

                <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: '#1A73E8', marginTop: 2 }}>
                  qua {routeInfo.mainRoad}
                </Text>
                <Text style={{ fontSize: 11, color: '#1E8E3E', fontWeight: '600', marginTop: 1 }}>
                  ✓ Tuyến đường nhanh nhất hiện tại
                </Text>
              </View>
            </View>

            {/* Action Buttons: Gửi tới điện thoại & Sao chép liên kết */}
            <View style={{ flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: 'rgba(27,36,32,0.06)', paddingTop: 10 }}>
              <Pressable
                testID="btn-copy-route-link"
                onPress={handleCopyLink}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 8,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: 'rgba(27,36,32,0.12)',
                  backgroundColor: '#FFFFFF',
                  cursor: 'pointer' as any,
                }}
              >
                {copiedLink ? (
                  <>
                    <Check size={14} color="#1E8E3E" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#1E8E3E' }}>Đã chép link</Text>
                  </>
                ) : (
                  <>
                    <Share2 size={14} color="#5F6368" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#3C4043' }}>Sao chép link</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                testID="btn-open-real-gmaps"
                onPress={() => Linking.openURL(googleMapsDirectionsUrl)}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: '#1A73E8',
                  cursor: 'pointer' as any,
                }}
              >
                <ExternalLink size={14} color="#FFFFFF" />
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>Mở Google Maps</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* CỘT PHẢI: BẢN ĐỒ LEAFLET VỚI TILES GOOGLE MAPS VÀ ROUTE POLYLINE OSRM */}
        <View style={{ flex: 1, minHeight: mapHeight, position: 'relative' }}>
          {Platform.OS === 'web' ? (
            <iframe
              title="google-maps-route"
              srcDoc={iframeHTML}
              style={{
                width: '100%',
                height: '100%',
                minHeight: mapHeight,
                border: 'none',
              }}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <Text style={{ fontSize: 13, color: '#888' }}>
                Bản đồ lộ trình Google Maps hỗ trợ đầy đủ trên trình duyệt Web.
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
