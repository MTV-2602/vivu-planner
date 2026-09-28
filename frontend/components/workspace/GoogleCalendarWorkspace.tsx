import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, Pressable, Platform, ScrollView, TextInput, useWindowDimensions } from 'react-native';
import {
  Calendar,
  Clock,
  MapPin,
  GripVertical,
  Plus,
  Trash2,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ShoppingBag,
  X,
  ChevronRight,
  ArrowDown,
  Navigation,
  Car,
  Utensils,
  Hotel,
  Camera,
  Coffee,
  RotateCcw
} from 'lucide-react-native';
import { BRAND_COLORS } from '../../constants';
import { getCityCenterCoords } from '../map/CuratedMap';

export interface CalendarEventItem {
  id: string;
  placeId: string;
  title: string;
  category: 'dining' | 'accommodation' | 'attraction' | 'rental' | 'cafe' | 'transport' | string;
  address?: string;
  lat?: number;
  lng?: number;
  cost: number;
  dayNumber: number;
  startHour: number; // 7, 8, 9 ... 21
  startMinute: number; // 0, 15, 30, 45
  durationMinutes: number; // 60, 90, 120...
  notes?: string;
}

export interface StandbyPlaceItem {
  id: string;
  name: string;
  category: string;
  address?: string;
  lat?: number;
  lng?: number;
  cost: number;
  suggestedDuration?: number;
}

export interface GoogleCalendarWorkspaceProps {
  cityName?: string;
  totalBudget?: number;
  daysCount?: number;
  initialEvents?: CalendarEventItem[];
  standbyPlaces?: StandbyPlaceItem[];
  onSave?: (events: CalendarEventItem[], totalCost: number) => void;
  readOnly?: boolean;
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7:00 to 21:00

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; lightBg: string }> = {
  dining: { bg: '#E6F4EA', border: '#137333', text: '#137333', lightBg: '#CEEAD6' },
  accommodation: { bg: '#F3E8FD', border: '#8430CE', text: '#8430CE', lightBg: '#E9D2FD' },
  attraction: { bg: '#E8F0FE', border: '#1A73E8', text: '#1A73E8', lightBg: '#D2E3FC' },
  cafe: { bg: '#FEF7E0', border: '#B06000', text: '#B06000', lightBg: '#FEEFC3' },
  rental: { bg: '#FCE8E6', border: '#C5221F', text: '#C5221F', lightBg: '#FAD2CF' },
  transport: { bg: '#F1F3F4', border: '#5F6368', text: '#3C4043', lightBg: '#E8EAED' },
  default: { bg: '#E8F0FE', border: '#1A73E8', text: '#1A73E8', lightBg: '#D2E3FC' },
};

export default function GoogleCalendarWorkspace({
  cityName = 'Đà Nẵng',
  totalBudget = 5000000,
  daysCount: initialDaysCount = 3,
  initialEvents,
  standbyPlaces: initialStandbyPlaces,
  onSave,
  readOnly = false,
}: GoogleCalendarWorkspaceProps) {
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && windowWidth >= 980;

  const [activeDay, setActiveDay] = useState(1);
  const [daysCount, setDaysCount] = useState(initialDaysCount);

  // Danh sách sự kiện đã xếp vào lịch
  const [events, setEvents] = useState<CalendarEventItem[]>(() => {
    if (initialEvents && initialEvents.length > 0) return initialEvents;
    // Dữ liệu mẫu khởi tạo phong phú
    return [
      {
        id: 'ev-1',
        placeId: 'p-1',
        title: 'Bánh mì Phượng / Bún bò sáng',
        category: 'dining',
        address: 'Hải Châu, ' + cityName,
        lat: 16.068,
        lng: 108.221,
        cost: 45000,
        dayNumber: 1,
        startHour: 8,
        startMinute: 0,
        durationMinutes: 60,
      },
      {
        id: 'ev-2',
        placeId: 'p-2',
        title: 'Check-in Cầu Rồng & Bờ sông Hàn',
        category: 'attraction',
        address: 'Bờ Đông Sông Hàn, ' + cityName,
        lat: 16.061,
        lng: 108.227,
        cost: 0,
        dayNumber: 1,
        startHour: 9,
        startMinute: 30,
        durationMinutes: 90,
      },
      {
        id: 'ev-3',
        placeId: 'p-3',
        title: 'Cà phê trứng & ngắm phố',
        category: 'cafe',
        address: 'Đường Bạch Đằng, ' + cityName,
        lat: 16.064,
        lng: 108.223,
        cost: 55000,
        dayNumber: 1,
        startHour: 11,
        startMinute: 15,
        durationMinutes: 60,
      },
      {
        id: 'ev-4',
        placeId: 'p-4',
        title: 'Thưởng thức Cơm Niêu / Bánh tráng cuốn thịt heo',
        category: 'dining',
        address: 'Đường Lê Duẩn, ' + cityName,
        lat: 16.071,
        lng: 108.219,
        cost: 150000,
        dayNumber: 1,
        startHour: 12,
        startMinute: 30,
        durationMinutes: 75,
      },
      {
        id: 'ev-5',
        placeId: 'p-5',
        title: 'Khách sạn biển nhận phòng',
        category: 'accommodation',
        address: 'Võ Nguyên Giáp, ' + cityName,
        lat: 16.065,
        lng: 108.246,
        cost: 750000,
        dayNumber: 1,
        startHour: 14,
        startMinute: 0,
        durationMinutes: 60,
      },
    ];
  });

  // Giỏ địa điểm chờ xếp lịch (Standby places in Cart)
  const [standbyList, setStandbyList] = useState<StandbyPlaceItem[]>(() => {
    if (initialStandbyPlaces && initialStandbyPlaces.length > 0) return initialStandbyPlaces;
    return [
      { id: 'sb-1', name: 'Bán đảo Sơn Trà & Chùa Linh Ứng', category: 'attraction', cost: 0, lat: 16.104, lng: 108.277, address: 'Sơn Trà, ' + cityName },
      { id: 'sb-2', name: 'Hải sản Năm Đảnh', category: 'dining', cost: 250000, lat: 16.096, lng: 108.243, address: 'Trần Quang Khải, ' + cityName },
      { id: 'sb-3', name: 'Chợ Đêm Sơn Trà ẩm thực', category: 'dining', cost: 120000, lat: 16.062, lng: 108.232, address: 'Mai Hắc Đế, ' + cityName },
      { id: 'sb-4', name: 'Tắm biển Mỹ Khê', category: 'attraction', cost: 30000, lat: 16.060, lng: 108.248, address: 'Mỹ Khê, ' + cityName },
      { id: 'sb-5', name: 'Thuê xe máy tay ga', category: 'rental', cost: 130000, lat: 16.067, lng: 108.225, address: 'Trung tâm ' + cityName },
    ];
  });

  // Điểm được chọn trên bản đồ để hiển thị Popup Callout Bubble (như khung hồng trong bản vẽ)
  const [selectedMapPlace, setSelectedMapPlace] = useState<{
    id: string;
    title: string;
    category: string;
    cost: number;
    address?: string;
    lat: number;
    lng: number;
    source: 'event' | 'standby';
  } | null>(null);

  // Kéo thả trạng thái (Drag & Drop state)
  const [draggedData, setDraggedData] = useState<{
    type: 'standby' | 'event';
    item: StandbyPlaceItem | CalendarEventItem;
  } | null>(null);
  const [hoveredHourSlot, setHoveredHourSlot] = useState<number | null>(null);
  const [hoveredCartZone, setHoveredCartZone] = useState(false);

  // Sự kiện của ngày đang kích hoạt
  const currentDayEvents = useMemo(() => {
    return events
      .filter((ev) => ev.dayNumber === activeDay)
      .sort((a, b) => a.startHour * 60 + a.startMinute - (b.startHour * 60 + b.startMinute));
  }, [events, activeDay]);

  // Tính toán tài chính Budget Tool
  const budgetStats = useMemo(() => {
    const totalScheduled = events.reduce((sum, ev) => sum + (ev.cost || 0), 0);
    const dayScheduled = currentDayEvents.reduce((sum, ev) => sum + (ev.cost || 0), 0);
    const remaining = totalBudget - totalScheduled;

    const byCategory: Record<string, number> = {
      dining: 0,
      accommodation: 0,
      attraction: 0,
      rental: 0,
      cafe: 0,
      other: 0,
    };

    events.forEach((ev) => {
      const cat = ev.category in byCategory ? ev.category : 'other';
      byCategory[cat] += ev.cost || 0;
    });

    return {
      totalScheduled,
      dayScheduled,
      remaining,
      percentUsed: Math.min(100, Math.round((totalScheduled / (totalBudget || 1)) * 100)),
      byCategory,
    };
  }, [events, currentDayEvents, totalBudget]);

  // Tọa độ trung tâm bản đồ
  const { centerLat, centerLng } = useMemo(() => {
    const allCoords = [
      ...currentDayEvents.filter((e) => e.lat && e.lng),
      ...standbyList.filter((s) => s.lat && s.lng),
    ];
    if (allCoords.length > 0) {
      const avgLat = allCoords.reduce((acc, c) => acc + Number(c.lat), 0) / allCoords.length;
      const avgLng = allCoords.reduce((acc, c) => acc + Number(c.lng), 0) / allCoords.length;
      return { centerLat: avgLat, centerLng: avgLng };
    }
    const c = getCityCenterCoords(cityName);
    return { centerLat: c.lat, centerLng: c.lng };
  }, [currentDayEvents, standbyList, cityName]);

  // Leaflet Map HTML với Google Maps Tiles và Popup Bubble
  const mapIframeHTML = useMemo(() => {
    const dayPlaces = currentDayEvents.filter((e) => e.lat && e.lng);
    const standbyCoords = standbyList.filter((s) => s.lat && s.lng);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body, #map { width:100%; height:100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    
    /* Vòng tròn vàng (như nét vẽ của người dùng trong ảnh) */
    .yellow-map-pin {
      width: 26px;
      height: 26px;
      background: #FBBC04;
      border: 3px solid #FFFFFF;
      border-radius: 50%;
      box-shadow: 0 3px 10px rgba(0,0,0,0.3);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 11px;
      color: #202124;
      transition: transform 0.15s ease;
    }
    .yellow-map-pin:hover {
      transform: scale(1.22);
      border-color: #EA4335;
    }

    /* Điểm trong lịch Ngày đang chọn */
    .active-day-pin {
      width: 30px;
      height: 30px;
      background: #1A73E8;
      border: 3px solid #FFFFFF;
      border-radius: 50%;
      box-shadow: 0 4px 12px rgba(26,115,232,0.45);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 12px;
      color: #FFFFFF;
      transition: transform 0.15s ease;
    }
    .active-day-pin:hover {
      transform: scale(1.22);
    }

    /* Popup Callout Bubble chuẩn y chang nét vẽ hồng trong ảnh */
    .pink-callout-bubble {
      background: #FFFFFF;
      border: 2.5px solid #FF5252;
      border-radius: 16px;
      padding: 12px 14px;
      box-shadow: 0 8px 24px rgba(255,82,82,0.22);
      min-width: 220px;
      position: relative;
    }
    .pink-callout-title {
      font-size: 14px;
      font-weight: 800;
      color: #202124;
      margin-bottom: 4px;
    }
    .pink-callout-cost {
      font-size: 12px;
      font-weight: 700;
      color: #0F9D58;
      margin-bottom: 8px;
    }
    .pink-callout-btn {
      display: block;
      width: 100%;
      text-align: center;
      background: #1A73E8;
      color: #FFFFFF;
      padding: 6px 10px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
      border: none;
    }
    .pink-callout-btn:hover {
      background: #1557B0;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const map = L.map('map', { zoomControl: true }).setView([${centerLat}, ${centerLng}], 13);

    // Google Maps Roadmap Tiles Layer
    const gTiles = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '&copy; Google Maps'
    }).addTo(map);

    gTiles.on('tileerror', function() {
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '&copy; Esri World Street Map'
      }).addTo(map);
    });

    const dayPlaces = ${JSON.stringify(dayPlaces)};
    const standbyList = ${JSON.stringify(standbyCoords)};
    const bounds = L.latLngBounds([]);

    // 1. Cắm các điểm trong lịch ngày hiện tại
    dayPlaces.forEach((dp, idx) => {
      const lat = Number(dp.lat);
      const lng = Number(dp.lng);
      bounds.extend([lat, lng]);

      const icon = L.divIcon({
        className: '',
        html: '<div class="active-day-pin">' + (idx + 1) + '</div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });

      const m = L.marker([lat, lng], { icon: icon }).addTo(map);
      m.bindPopup(
        '<div class="pink-callout-bubble">' +
          '<div style="font-size:10px;font-weight:800;color:#1A73E8;text-transform:uppercase;margin-bottom:2px;">Hoạt động #' + (idx + 1) + ' · Ngày ${activeDay}</div>' +
          '<div class="pink-callout-title">' + dp.title + '</div>' +
          '<div class="pink-callout-cost">' + (dp.cost ? Number(dp.cost).toLocaleString("vi-VN") + ' đ' : 'Miễn phí') + '</div>' +
          '<div style="font-size:11px;color:#5F6368;margin-bottom:8px;">' + (dp.address || '${cityName}') + '</div>' +
        '</div>'
      );
    });

    // 2. Cắm các điểm trong giỏ chờ (màu vàng như nét vẽ người dùng)
    standbyList.forEach((sp, idx) => {
      const lat = Number(sp.lat);
      const lng = Number(sp.lng);
      bounds.extend([lat, lng]);

      const icon = L.divIcon({
        className: '',
        html: '<div class="yellow-map-pin">' + String.fromCharCode(65 + (idx % 26)) + '</div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });

      const m = L.marker([lat, lng], { icon: icon }).addTo(map);
      m.bindPopup(
        '<div class="pink-callout-bubble">' +
          '<div style="font-size:10px;font-weight:800;color:#EA4335;text-transform:uppercase;margin-bottom:2px;">Điểm trong kho chờ</div>' +
          '<div class="pink-callout-title">' + sp.name + '</div>' +
          '<div class="pink-callout-cost">' + (sp.cost ? Number(sp.cost).toLocaleString("vi-VN") + ' đ' : 'Miễn phí') + '</div>' +
          '<div style="font-size:11px;color:#5F6368;margin-bottom:8px;">' + (sp.address || '${cityName}') + '</div>' +
          '<button class="pink-callout-btn" onclick="window.parent.postMessage(JSON.stringify({ type: \\'ADD_STANDBY_TO_CALENDAR\\', placeId: \\'' + sp.id + '\\' }), \\'*\\')">➕ Thêm vào Lịch Ngày ${activeDay}</button>' +
        '</div>'
      );
    });

    // 3. Vẽ polyline đường bộ OSRM nối các điểm trong ngày
    if (dayPlaces.length >= 2) {
      const coords = dayPlaces.map(p => Number(p.lng) + ',' + Number(p.lat)).join(';');
      fetch('https://router.project-osrm.org/route/v1/driving/' + coords + '?overview=full&geometries=geojson')
        .then(r => r.json())
        .then(data => {
          if (data.routes && data.routes[0]) {
            const pts = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
            L.polyline(pts, { color: '#0D47A1', weight: 7, opacity: 0.3 }).addTo(map);
            L.polyline(pts, { color: '#1A73E8', weight: 4.5, opacity: 0.95 }).addTo(map);
          }
        })
        .catch(() => {
          const directPts = dayPlaces.map(p => [Number(p.lat), Number(p.lng)]);
          L.polyline(directPts, { color: '#1A73E8', weight: 4, dashArray: '6, 6' }).addTo(map);
        });
    }

    if (bounds.isValid()) {
      setTimeout(() => map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 }), 200);
    }
  </script>
</body>
</html>`;
  }, [currentDayEvents, standbyList, activeDay, centerLat, centerLng, cityName]);

  // Lắng nghe postMessage từ iframe Leaflet khi bấm nút trên Popup Bubble
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handler = (evt: MessageEvent) => {
        try {
          const d = typeof evt.data === 'string' ? JSON.parse(evt.data) : evt.data;
          if (d && d.type === 'ADD_STANDBY_TO_CALENDAR' && d.placeId) {
            handleMoveStandbyToCalendar(d.placeId);
          }
        } catch (e) {}
      };
      window.addEventListener('message', handler);
      return () => window.removeEventListener('message', handler);
    }
  }, [standbyList, events, activeDay]);

  // Chuyển một điểm từ Giỏ chờ (Standby) vào Lịch trình Ngày
  const handleMoveStandbyToCalendar = (standbyId: string, targetHour?: number) => {
    const item = standbyList.find((s) => s.id === standbyId);
    if (!item) return;

    // Tìm khung giờ trống tiếp theo trong ngày
    const hour = targetHour || (currentDayEvents.length > 0
      ? Math.min(20, Math.max(8, currentDayEvents[currentDayEvents.length - 1].startHour + 2))
      : 8);

    const newEvent: CalendarEventItem = {
      id: `ev-${Date.now()}`,
      placeId: item.id,
      title: item.name,
      category: item.category,
      address: item.address,
      lat: item.lat,
      lng: item.lng,
      cost: item.cost,
      dayNumber: activeDay,
      startHour: hour,
      startMinute: 0,
      durationMinutes: item.suggestedDuration || 90,
    };

    setEvents((prev) => [...prev, newEvent]);
    setStandbyList((prev) => prev.filter((s) => s.id !== standbyId));
  };

  // Chuyển một sự kiện từ Lịch trình trở lại Giỏ chờ (Budget Tool Cart)
  const handleRemoveEventToStandby = (eventId: string) => {
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return;

    const standbyItem: StandbyPlaceItem = {
      id: ev.placeId || `p-${Date.now()}`,
      name: ev.title,
      category: ev.category,
      address: ev.address,
      lat: ev.lat,
      lng: ev.lng,
      cost: ev.cost,
      suggestedDuration: ev.durationMinutes,
    };

    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    setStandbyList((prev) => [...prev, standbyItem]);
  };

  // Kéo thả HTML5 Drag and Drop handlers
  const handleDragStartStandby = (item: StandbyPlaceItem, e: any) => {
    if (readOnly) return;
    setDraggedData({ type: 'standby', item });
    if (e?.dataTransfer) {
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'standby', id: item.id }));
      e.dataTransfer.effectAllowed = 'copyMove';
    }
  };

  const handleDragStartEvent = (event: CalendarEventItem, e: any) => {
    if (readOnly) return;
    setDraggedData({ type: 'event', item: event });
    if (e?.dataTransfer) {
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'event', id: event.id }));
      e.dataTransfer.effectAllowed = 'move';
    }
  };

  const handleDragOverHour = (hour: number, e: any) => {
    if (readOnly) return;
    if (e?.preventDefault) e.preventDefault();
    if (hoveredHourSlot !== hour) setHoveredHourSlot(hour);
  };

  const handleDropOnHour = (hour: number, e: any) => {
    if (readOnly) return;
    if (e?.preventDefault) e.preventDefault();
    setHoveredHourSlot(null);

    if (!draggedData) return;

    if (draggedData.type === 'standby') {
      // Kéo từ Giỏ chờ thả vào khung giờ Google Calendar
      handleMoveStandbyToCalendar((draggedData.item as StandbyPlaceItem).id, hour);
    } else if (draggedData.type === 'event') {
      // Đổi giờ bắt đầu của sự kiện trong Google Calendar
      const eventId = (draggedData.item as CalendarEventItem).id;
      setEvents((prev) =>
        prev.map((ev) => (ev.id === eventId ? { ...ev, startHour: hour, dayNumber: activeDay } : ev))
      );
    }
    setDraggedData(null);
  };

  const handleDropOnCart = (e: any) => {
    if (readOnly) return;
    if (e?.preventDefault) e.preventDefault();
    setHoveredCartZone(false);

    if (draggedData && draggedData.type === 'event') {
      handleRemoveEventToStandby((draggedData.item as CalendarEventItem).id);
    }
    setDraggedData(null);
  };

  // Nút xóa ngày (giống các dấu X trên tab ngày trong bản vẽ của người dùng)
  const handleRemoveDay = (dayNum: number) => {
    if (daysCount <= 1) return;
    // Chuyển toàn bộ hoạt động của ngày đó về giỏ chờ
    const dayEvs = events.filter((e) => e.dayNumber === dayNum);
    dayEvs.forEach((e) => handleRemoveEventToStandby(e.id));

    // Cập nhật lại số ngày và số thứ tự ngày
    setEvents((prev) =>
      prev
        .filter((e) => e.dayNumber !== dayNum)
        .map((e) => (e.dayNumber > dayNum ? { ...e, dayNumber: e.dayNumber - 1 } : e))
    );
    setDaysCount((prev) => prev - 1);
    if (activeDay >= daysCount) setActiveDay(Math.max(1, daysCount - 1));
  };

  const handleAddDay = () => {
    setDaysCount((prev) => prev + 1);
    setActiveDay(daysCount + 1);
  };

  return (
    <View
      style={{
        width: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(27,36,32,0.12)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.06)' as any,
      }}
    >
      {/* ── TOP BAR: TIÊU ĐỀ WORKSPACE & NÚT HOÀN TẤT ── */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingVertical: 14,
          backgroundColor: '#FAFAFA',
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(27,36,32,0.08)',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              backgroundColor: '#1A73E8',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Calendar size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#1B2420' }}>
              Không gian Lập lịch & Quản lý Ngân sách (Google Calendar Workspace)
            </Text>
            <Text style={{ fontSize: 11, color: '#5F6368' }}>
              Kéo thả trực tiếp giữa Bản đồ, Lịch trình theo giờ và Giỏ ngân sách
            </Text>
          </View>
        </View>

        {onSave && !readOnly && (
          <Pressable
            testID="btn-save-calendar-workspace"
            onPress={() => onSave(events, budgetStats.totalScheduled)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: '#134A37',
              paddingHorizontal: 16,
              paddingVertical: 9,
              borderRadius: 10,
              cursor: 'pointer' as any,
            }}
          >
            <CheckCircle2 size={16} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
              ✓ Lưu lịch trình & Ngân sách
            </Text>
          </Pressable>
        )}
      </View>

      {/* ── KHUNG CHÍNH SPLIT-VIEW (2 CỘT CHUẨN THEO BẢN VẼ) ── */}
      <View
        style={{
          flexDirection: isDesktop ? 'row' : 'column',
          minHeight: 740,
        }}
      >
        {/* ══════════════════════════════════════════════════════════ */}
        {/* CỘT TRÁI (LEFT PANEL): TABS NGÀY 1, 2, 3 + BẢN ĐỒ MAP     */}
        {/* ══════════════════════════════════════════════════════════ */}
        <View
          style={{
            flex: isDesktop ? 1.05 : undefined,
            width: isDesktop ? undefined : '100%',
            borderRightWidth: isDesktop ? 1 : 0,
            borderBottomWidth: isDesktop ? 0 : 1,
            borderRightColor: 'rgba(27,36,32,0.08)',
            borderBottomColor: 'rgba(27,36,32,0.08)',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#F8F9FA',
          }}
        >
          {/* Header Tabs: Ngày 1, Ngày 2, Ngày 3 (Có dấu X gỡ ngày như ảnh vẽ) */}
          <View
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: '#FFFFFF',
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(27,36,32,0.08)',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              overflow: 'hidden',
            }}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {Array.from({ length: daysCount }, (_, i) => i + 1).map((dNum) => {
                const isActive = activeDay === dNum;
                const countInDay = events.filter((e) => e.dayNumber === dNum).length;

                return (
                  <View
                    key={dNum}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderRadius: 10,
                      backgroundColor: isActive ? '#E8F0FE' : '#F1F3F4',
                      borderWidth: 1.5,
                      borderColor: isActive ? '#1A73E8' : 'rgba(27,36,32,0.1)',
                      overflow: 'hidden',
                    }}
                  >
                    <Pressable
                      testID={`tab-calendar-day-${dNum}`}
                      onPress={() => setActiveDay(dNum)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '800',
                          color: isActive ? '#1A73E8' : '#3C4043',
                        }}
                      >
                        Ngày {dNum} {countInDay > 0 ? `(${countInDay})` : ''}
                      </Text>
                    </Pressable>

                    {/* Dấu X gỡ ngày (tương tự chữ X người dùng gạch trong ảnh vẽ tay) */}
                    {!readOnly && daysCount > 1 && (
                      <Pressable
                        onPress={() => handleRemoveDay(dNum)}
                        style={{
                          paddingHorizontal: 6,
                          paddingVertical: 7,
                          borderLeftWidth: 1,
                          borderLeftColor: isActive ? '#1A73E8' : 'rgba(27,36,32,0.1)',
                          cursor: 'pointer' as any,
                        }}
                      >
                        <X size={12} color={isActive ? '#1A73E8' : '#70757A'} />
                      </Pressable>
                    )}
                  </View>
                );
              })}

              {!readOnly && (
                <Pressable
                  testID="btn-add-calendar-day"
                  onPress={handleAddDay}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    borderRadius: 10,
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: '#1A73E8',
                    cursor: 'pointer' as any,
                  }}
                >
                  <Plus size={13} color="#1A73E8" />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#1A73E8' }}>Thêm ngày</Text>
                </Pressable>
              )}
            </ScrollView>
          </View>

          {/* Bản đồ MAP (Chiếm toàn bộ không gian còn lại của cột trái) */}
          <View style={{ flex: 1, minHeight: 480, position: 'relative' }}>
            {Platform.OS === 'web' ? (
              <iframe
                title="calendar-workspace-map"
                srcDoc={mapIframeHTML}
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: 480,
                  border: 'none',
                }}
              />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#888', fontSize: 12 }}>Bản đồ Google Maps hiển thị trên Web</Text>
              </View>
            )}

            {/* Chú thích bản đồ (Map Legend) */}
            <View
              style={{
                position: 'absolute',
                bottom: 12,
                left: 12,
                backgroundColor: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(8px)' as any,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: 'rgba(27,36,32,0.1)',
                gap: 4,
                zIndex: 10,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#1A73E8' }} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#202124' }}>
                  Điểm Ngày {activeDay} ({currentDayEvents.length} điểm)
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#FBBC04' }} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#5F6368' }}>
                  Điểm trong Giỏ chờ ({standbyList.length} điểm)
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* CỘT PHẢI (RIGHT PANEL): LỊCH TRÌNH TRÊN + BUDGET TOOL DƯỚI */}
        {/* ══════════════════════════════════════════════════════════ */}
        <View
          style={{
            flex: isDesktop ? 1.25 : undefined,
            width: isDesktop ? undefined : '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#FFFFFF',
          }}
        >
          {/* ──────────────────────────────────────────────────────── */}
          {/* Ô TRÊN (TOP BOX): LỊCH TRÌNH (GOOGLE CALENDAR STYLE)     */}
          {/* ──────────────────────────────────────────────────────── */}
          <View
            style={{
              flex: 1,
              borderBottomWidth: 2,
              borderBottomColor: 'rgba(27,36,32,0.12)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 380,
            }}
          >
            {/* Header Lịch trình */}
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                backgroundColor: '#FAFAFA',
                borderBottomWidth: 1,
                borderBottomColor: 'rgba(27,36,32,0.06)',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Clock size={16} color="#1A73E8" />
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#202124' }}>
                  Lịch trình Google Calendar · Ngày {activeDay}
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: '#5F6368', fontWeight: '600' }}>
                Kéo thả đổi giờ hoặc kéo trả về Giỏ bên dưới
              </Text>
            </View>

            {/* Google Calendar Time Grid (Khung giờ dạng lịch Google) */}
            <ScrollView style={{ flex: 1, maxHeight: 360, paddingHorizontal: 14 }} showsVerticalScrollIndicator={true}>
              <View style={{ paddingVertical: 10 }}>
                {HOURS.map((hour) => {
                  const hourEvents = currentDayEvents.filter((ev) => ev.startHour === hour);
                  const isSlotHovered = hoveredHourSlot === hour;

                  return (
                    <View
                      key={hour}
                      testID={`calendar-hour-row-${hour}`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        minHeight: 52,
                        borderTopWidth: 1,
                        borderTopColor: isSlotHovered ? '#1A73E8' : 'rgba(27,36,32,0.08)',
                        backgroundColor: isSlotHovered ? 'rgba(26,115,232,0.08)' : 'transparent',
                        paddingVertical: 4,
                      }}
                      // @ts-ignore
                      onDragOver={(e: any) => handleDragOverHour(hour, e)}
                      // @ts-ignore
                      onDrop={(e: any) => handleDropOnHour(hour, e)}
                    >
                      {/* Cột mốc giờ bên trái (07:00, 08:00...) */}
                      <View style={{ width: 50, paddingRight: 8, paddingTop: 2 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#5F6368', textAlign: 'right' }}>
                          {hour < 10 ? `0${hour}:00` : `${hour}:00`}
                        </Text>
                      </View>

                      {/* Vùng nhận thả sự kiện (Event Card Container) */}
                      <View style={{ flex: 1, paddingLeft: 8, gap: 6 }}>
                        {hourEvents.length === 0 ? (
                          <View
                            style={{
                              height: 38,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderStyle: 'dashed',
                              borderColor: isSlotHovered ? '#1A73E8' : 'rgba(27,36,32,0.06)',
                              justifyContent: 'center',
                              paddingHorizontal: 10,
                            }}
                          >
                            <Text style={{ fontSize: 10, color: isSlotHovered ? '#1A73E8' : 'rgba(27,36,32,0.25)', fontStyle: 'italic' }}>
                              {isSlotHovered ? 'Thả vào khung giờ này' : '+ Trống (thả địa điểm vào đây)'}
                            </Text>
                          </View>
                        ) : (
                          hourEvents.map((ev) => {
                            const colors = CATEGORY_COLORS[ev.category] || CATEGORY_COLORS.default;
                            return (
                              <View
                                key={ev.id}
                                testID={`calendar-event-card-${ev.id}`}
                                style={{
                                  backgroundColor: colors.bg,
                                  borderLeftWidth: 4,
                                  borderLeftColor: colors.border,
                                  borderRadius: 8,
                                  paddingHorizontal: 10,
                                  paddingVertical: 7,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  boxShadow: '0 2px 6px rgba(0,0,0,0.05)' as any,
                                  cursor: readOnly ? 'default' : 'grab' as any,
                                }}
                                // @ts-ignore
                                draggable={!readOnly}
                                // @ts-ignore
                                onDragStart={(e: any) => handleDragStartEvent(ev, e)}
                              >
                                <View style={{ flex: 1, paddingRight: 8 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={{ fontSize: 10, fontWeight: '800', color: colors.text }}>
                                      {ev.startHour < 10 ? `0${ev.startHour}` : ev.startHour}:
                                      {ev.startMinute < 10 ? `0${ev.startMinute}` : ev.startMinute} (
                                      {ev.durationMinutes}p)
                                    </Text>
                                    <View
                                      style={{
                                        paddingHorizontal: 6,
                                        paddingVertical: 1,
                                        borderRadius: 4,
                                        backgroundColor: colors.lightBg,
                                      }}
                                    >
                                      <Text style={{ fontSize: 9, fontWeight: '700', color: colors.text, textTransform: 'uppercase' }}>
                                        {ev.category}
                                      </Text>
                                    </View>
                                  </View>

                                  <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: '#202124', marginTop: 2 }}>
                                    {ev.title}
                                  </Text>
                                </View>

                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#137333' }}>
                                    {ev.cost ? `${Number(ev.cost).toLocaleString('vi-VN')} đ` : 'Miễn phí'}
                                  </Text>

                                  {!readOnly && (
                                    <Pressable
                                      testID={`btn-remove-event-${ev.id}`}
                                      onPress={() => handleRemoveEventToStandby(ev.id)}
                                      style={{ padding: 4, cursor: 'pointer' as any }}
                                    >
                                      <ArrowDown size={14} color="#D93025" />
                                    </Pressable>
                                  )}
                                </View>
                              </View>
                            );
                          })
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>

          {/* ──────────────────────────────────────────────────────── */}
          {/* Ô DƯỚI (BOTTOM BOX): BUDGET TOOL (3 CỘT THEO ĐÚNG BẢN VẼ) */}
          {/* ──────────────────────────────────────────────────────── */}
          <View
            style={{
              padding: 16,
              backgroundColor: '#F8F9FA',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {/* Tiêu đề Budget Tool */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <DollarSign size={16} color="#137333" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#202124' }}>
                  Công cụ Ngân sách & Giỏ chờ (Budget Tool)
                </Text>
              </View>
              <Text style={{ fontSize: 11, fontWeight: '700', color: budgetStats.remaining >= 0 ? '#137333' : '#D93025' }}>
                {budgetStats.remaining >= 0
                  ? `Khả dụng: ${Number(budgetStats.remaining).toLocaleString('vi-VN')} đ`
                  : `⚠️ Vượt: ${Number(Math.abs(budgetStats.remaining)).toLocaleString('vi-VN')} đ`}
              </Text>
            </View>

            {/* BỐ CỤC 3 CỘT CHUẨN CỦA BUDGET TOOL (NHƯ KHUNG 3 CỘT TRONG BẢN VẼ TAY) */}
            <View
              style={{
                flexDirection: isDesktop ? 'row' : 'column',
                gap: 12,
              }}
            >
              {/* CỘT 1: PHÂN BỔ HẠNG MỤC CHI TIÊU */}
              <View
                style={{
                  flex: 1,
                  backgroundColor: '#FFFFFF',
                  borderRadius: 14,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: 'rgba(27,36,32,0.08)',
                  gap: 8,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#5F6368', textTransform: 'uppercase' }}>
                  1. Phân bổ hạng mục
                </Text>

                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, color: '#3C4043' }}>🍽️ Ẩm thực:</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#202124' }}>
                      {Number(budgetStats.byCategory.dining).toLocaleString('vi-VN')} đ
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, color: '#3C4043' }}>🏨 Lưu trú:</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#202124' }}>
                      {Number(budgetStats.byCategory.accommodation).toLocaleString('vi-VN')} đ
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, color: '#3C4043' }}>🏔️ Tham quan:</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#202124' }}>
                      {Number(budgetStats.byCategory.attraction).toLocaleString('vi-VN')} đ
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, color: '#3C4043' }}>🛵 Đi lại & Khác:</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#202124' }}>
                      {Number(budgetStats.byCategory.rental + budgetStats.byCategory.cafe + budgetStats.byCategory.other).toLocaleString('vi-VN')} đ
                    </Text>
                  </View>
                </View>
              </View>

              {/* CỘT 2: GIỎ ĐỊA ĐIỂM CHỜ XẾP LỊCH (KÉO THẢ THẲNG LÊN LỊCH TRÌNH Ở TRÊN!) */}
              <View
                testID="calendar-standby-cart-zone"
                style={{
                  flex: 1.25,
                  backgroundColor: hoveredCartZone ? '#E8F0FE' : '#FFFFFF',
                  borderRadius: 14,
                  padding: 12,
                  borderWidth: 1.5,
                  borderStyle: 'dashed',
                  borderColor: hoveredCartZone ? '#1A73E8' : 'rgba(27,36,32,0.14)',
                  gap: 8,
                }}
                // @ts-ignore
                onDragOver={(e: any) => { if (Platform.OS === 'web') e.preventDefault(); setHoveredCartZone(true); }}
                // @ts-ignore
                onDragLeave={() => setHoveredCartZone(false)}
                // @ts-ignore
                onDrop={handleDropOnCart}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <ShoppingBag size={13} color="#1A73E8" />
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#1A73E8', textTransform: 'uppercase' }}>
                      2. Giỏ chờ ({standbyList.length} điểm)
                    </Text>
                  </View>
                  <Text style={{ fontSize: 10, color: '#5F6368' }}>Kéo thẻ lên Lịch ⬆</Text>
                </View>

                {standbyList.length === 0 ? (
                  <View style={{ paddingVertical: 18, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 11, color: '#137333', fontWeight: '700' }}>
                      ✓ Toàn bộ địa điểm đã vào lịch!
                    </Text>
                  </View>
                ) : (
                  <ScrollView style={{ maxHeight: 110 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    <View style={{ gap: 5 }}>
                      {standbyList.map((item) => (
                        <View
                          key={item.id}
                          testID={`standby-chip-${item.id}`}
                          style={{
                            backgroundColor: '#F8F9FA',
                            borderRadius: 8,
                            paddingHorizontal: 8,
                            paddingVertical: 5,
                            borderWidth: 1,
                            borderColor: 'rgba(27,36,32,0.08)',
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: readOnly ? 'default' : 'grab' as any,
                          }}
                          // @ts-ignore
                          draggable={!readOnly}
                          // @ts-ignore
                          onDragStart={(e: any) => handleDragStartStandby(item, e)}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, paddingRight: 4 }}>
                            <GripVertical size={12} color="#9AA0A6" />
                            <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', color: '#202124' }}>
                              {item.name}
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#137333' }}>
                              {item.cost ? `${Number(item.cost).toLocaleString('vi-VN')} đ` : '0 đ'}
                            </Text>
                            {!readOnly && (
                              <Pressable
                                testID={`btn-add-standby-${item.id}`}
                                onPress={() => handleMoveStandbyToCalendar(item.id)}
                                style={{ padding: 2, cursor: 'pointer' as any }}
                              >
                                <Plus size={13} color="#1A73E8" />
                              </Pressable>
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                )}
              </View>

              {/* CỘT 3: TỔNG QUAN TÀI CHÍNH & THANH TIẾN ĐỘ */}
              <View
                style={{
                  flex: 1,
                  backgroundColor: '#FFFFFF',
                  borderRadius: 14,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: 'rgba(27,36,32,0.08)',
                  gap: 8,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#5F6368', textTransform: 'uppercase' }}>
                  3. Cân đối tài chính
                </Text>

                <View style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 10, color: '#5F6368' }}>Tổng hạn mức:</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#202124' }}>
                      {Number(totalBudget).toLocaleString('vi-VN')} đ
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 10, color: '#5F6368' }}>Đã lên lịch ({events.length}):</Text>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#1A73E8' }}>
                      {Number(budgetStats.totalScheduled).toLocaleString('vi-VN')} đ
                    </Text>
                  </View>

                  {/* Thanh tiến độ phần trăm ngân sách */}
                  <View style={{ marginTop: 4, height: 6, borderRadius: 3, backgroundColor: 'rgba(27,36,32,0.08)', overflow: 'hidden' }}>
                    <View
                      style={{
                        height: '100%',
                        width: `${budgetStats.percentUsed}%`,
                        backgroundColor: budgetStats.percentUsed > 100 ? '#D93025' : '#1A73E8',
                      }}
                    />
                  </View>
                  <Text style={{ fontSize: 9, color: '#5F6368', textAlign: 'right', marginTop: 2 }}>
                    Đã dùng {budgetStats.percentUsed}% ngân sách
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
