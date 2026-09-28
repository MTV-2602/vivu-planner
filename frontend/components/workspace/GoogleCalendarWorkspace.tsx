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
  ArrowDown,
  ArrowUp,
  Car,
  Check,
  RotateCcw
} from 'lucide-react-native';
import { BRAND_COLORS } from '../../constants';
import { getCityCenterCoords } from '../map/CuratedMap';
import { getCuratedPlacesForCity } from '../../constants/curatedPlaces';

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
  startHour: number; // 7..21
  startMinute: number; // 0, 15, 30...
  durationMinutes: number; // 60, 90...
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
  cityName: string;
  totalBudget?: number;
  daysCount?: number;
  initialEvents?: CalendarEventItem[];
  standbyPlaces?: StandbyPlaceItem[];
  onEventsChange?: (events: CalendarEventItem[]) => void;
  onStandbyChange?: (standby: StandbyPlaceItem[]) => void;
  onSave?: (events: CalendarEventItem[], totalCost: number) => void;
  readOnly?: boolean;
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 07:00 -> 21:00

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
  cityName = 'Hà Nội',
  totalBudget = 5000000,
  daysCount: propDaysCount = 3,
  initialEvents,
  standbyPlaces: propStandbyPlaces,
  onEventsChange,
  onStandbyChange,
  onSave,
  readOnly = false,
}: GoogleCalendarWorkspaceProps) {
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && windowWidth >= 960;

  const [activeDay, setActiveDay] = useState(1);
  const [daysCount, setDaysCount] = useState(propDaysCount);

  // Lấy dữ liệu thực tế từ props hoặc curated places của chính thành phố đó (KHÔNG HARD-CODE)
  const initialData = useMemo(() => {
    // 1. Nếu có initialEvents từ props
    if (initialEvents && initialEvents.length > 0) {
      return {
        evs: initialEvents,
        stb: propStandbyPlaces || [],
      };
    }

    // 2. Nếu có propStandbyPlaces từ props
    if (propStandbyPlaces && propStandbyPlaces.length > 0) {
      // Phân bổ thông minh các điểm vào các ngày theo thứ tự
      const generatedEvs: CalendarEventItem[] = [];
      const remainingStb: StandbyPlaceItem[] = [];

      propStandbyPlaces.forEach((p, idx) => {
        const assignedDay = (idx % propDaysCount) + 1;
        const hour = 8 + (Math.floor(idx / propDaysCount) % 6) * 2;

        if (idx < propDaysCount * 3) {
          generatedEvs.push({
            id: `ev-${p.id}`,
            placeId: p.id,
            title: p.name,
            category: p.category,
            address: p.address,
            lat: p.lat,
            lng: p.lng,
            cost: p.cost,
            dayNumber: assignedDay,
            startHour: Math.min(20, hour),
            startMinute: 0,
            durationMinutes: p.suggestedDuration || 90,
          });
        } else {
          remainingStb.push(p);
        }
      });

      return { evs: generatedEvs, stb: remainingStb };
    }

    // 3. Fallback lấy danh sách thật từ Curated Places của CHÍNH THÀNH PHỐ ĐÓ
    const cityPlaces = getCuratedPlacesForCity(cityName);
    const evs: CalendarEventItem[] = [];
    const stb: StandbyPlaceItem[] = [];

    cityPlaces.forEach((p, idx) => {
      const assignedDay = (idx % propDaysCount) + 1;
      const hour = 8 + (Math.floor(idx / propDaysCount) % 6) * 2;

      if (idx < propDaysCount * 2) {
        evs.push({
          id: `ev-${p.id}`,
          placeId: p.id,
          title: p.name,
          category: p.category,
          address: p.address,
          lat: p.lat,
          lng: p.lng,
          cost: p.estimated_cost || 50000,
          dayNumber: assignedDay,
          startHour: Math.min(20, hour),
          startMinute: 0,
          durationMinutes: 90,
        });
      } else {
        stb.push({
          id: p.id,
          name: p.name,
          category: p.category,
          address: p.address,
          lat: p.lat,
          lng: p.lng,
          cost: p.estimated_cost || 50000,
          suggestedDuration: 90,
        });
      }
    });

    return { evs, stb };
  }, [cityName, propDaysCount, initialEvents, propStandbyPlaces]);

  // State sự kiện và giỏ chờ
  const [events, setEvents] = useState<CalendarEventItem[]>(initialData.evs);
  const [standbyList, setStandbyList] = useState<StandbyPlaceItem[]>(initialData.stb);

  // Đồng bộ khi props thay đổi
  useEffect(() => {
    setDaysCount(propDaysCount);
  }, [propDaysCount]);

  useEffect(() => {
    setEvents(initialData.evs);
    setStandbyList(initialData.stb);
  }, [initialData]);

  // Báo thay đổi ra ngoài component cha
  const notifyChanges = (newEvents: CalendarEventItem[], newStandby: StandbyPlaceItem[]) => {
    if (onEventsChange) onEventsChange(newEvents);
    if (onStandbyChange) onStandbyChange(newStandby);
  };

  // State chọn điểm để gán nhanh (Click-to-place)
  const [selectedPlaceToPlace, setSelectedPlaceToPlace] = useState<StandbyPlaceItem | null>(null);

  // Kéo thả trạng thái
  const [draggedData, setDraggedData] = useState<{
    type: 'standby' | 'event';
    id: string;
    item: StandbyPlaceItem | CalendarEventItem;
  } | null>(null);
  const [hoveredHourSlot, setHoveredHourSlot] = useState<number | null>(null);
  const [hoveredCartZone, setHoveredCartZone] = useState(false);

  // Sự kiện của ngày đang kích hoạt
  const currentDayEvents = useMemo(() => {
    return events
      .filter((ev) => Number(ev.dayNumber) === Number(activeDay))
      .sort((a, b) => a.startHour * 60 + a.startMinute - (b.startHour * 60 + b.startMinute));
  }, [events, activeDay]);

  // Tính toán ngân sách
  const budgetStats = useMemo(() => {
    const totalScheduled = events.reduce((sum, ev) => sum + (Number(ev.cost) || 0), 0);
    const dayScheduled = currentDayEvents.reduce((sum, ev) => sum + (Number(ev.cost) || 0), 0);
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
      byCategory[cat] += Number(ev.cost) || 0;
    });

    return {
      totalScheduled,
      dayScheduled,
      remaining,
      percentUsed: Math.min(100, Math.round((totalScheduled / (totalBudget || 1)) * 100)),
      byCategory,
    };
  }, [events, currentDayEvents, totalBudget]);

  // Tọa độ trung tâm thành phố thực tế
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

  // Thêm một địa điểm vào lịch
  const addPlaceToCalendar = (place: StandbyPlaceItem, targetHour?: number) => {
    const hour =
      targetHour ||
      (currentDayEvents.length > 0
        ? Math.min(21, currentDayEvents[currentDayEvents.length - 1].startHour + 2)
        : 8);

    const newEvent: CalendarEventItem = {
      id: `ev-${place.id}-${Date.now()}`,
      placeId: place.id,
      title: place.name,
      category: place.category,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      cost: place.cost,
      dayNumber: activeDay,
      startHour: hour,
      startMinute: 0,
      durationMinutes: place.suggestedDuration || 90,
    };

    const nextEvents = [...events, newEvent];
    const nextStandby = standbyList.filter((s) => s.id !== place.id);

    setEvents(nextEvents);
    setStandbyList(nextStandby);
    setSelectedPlaceToPlace(null);
    notifyChanges(nextEvents, nextStandby);
  };

  // Trả sự kiện từ lịch về giỏ chờ
  const removeEventToStandby = (eventId: string) => {
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return;

    const returnItem: StandbyPlaceItem = {
      id: ev.placeId || `p-${Date.now()}`,
      name: ev.title,
      category: ev.category,
      address: ev.address,
      lat: ev.lat,
      lng: ev.lng,
      cost: ev.cost,
      suggestedDuration: ev.durationMinutes,
    };

    const nextEvents = events.filter((e) => e.id !== eventId);
    const nextStandby = [...standbyList, returnItem];

    setEvents(nextEvents);
    setStandbyList(nextStandby);
    notifyChanges(nextEvents, nextStandby);
  };

  // Đổi giờ bắt đầu của sự kiện
  const moveEventHour = (eventId: string, deltaHours: number) => {
    const nextEvents = events.map((ev) => {
      if (ev.id === eventId) {
        const newHour = Math.max(7, Math.min(21, ev.startHour + deltaHours));
        return { ...ev, startHour: newHour };
      }
      return ev;
    });
    setEvents(nextEvents);
    notifyChanges(nextEvents, standbyList);
  };

  // Drag and drop handlers
  const handleDragStartStandby = (item: StandbyPlaceItem, e: any) => {
    if (readOnly) return;
    setDraggedData({ type: 'standby', id: item.id, item });
    if (e?.dataTransfer) {
      e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'standby', id: item.id }));
      e.dataTransfer.effectAllowed = 'copyMove';
    }
  };

  const handleDragStartEvent = (event: CalendarEventItem, e: any) => {
    if (readOnly) return;
    setDraggedData({ type: 'event', id: event.id, item: event });
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

    // 1. Thả từ Giỏ chờ vào giờ
    if (draggedData && draggedData.type === 'standby') {
      const standbyItem = standbyList.find((s) => s.id === draggedData.id) || (draggedData.item as StandbyPlaceItem);
      if (standbyItem) {
        addPlaceToCalendar(standbyItem, hour);
      }
    } else if (draggedData && draggedData.type === 'event') {
      // 2. Thả đổi giờ sự kiện
      const nextEvents = events.map((ev) =>
        ev.id === draggedData.id ? { ...ev, startHour: hour, dayNumber: activeDay } : ev
      );
      setEvents(nextEvents);
      notifyChanges(nextEvents, standbyList);
    }

    setDraggedData(null);
  };

  const handleDropOnCart = (e: any) => {
    if (readOnly) return;
    if (e?.preventDefault) e.preventDefault();
    setHoveredCartZone(false);

    if (draggedData && draggedData.type === 'event') {
      removeEventToStandby(draggedData.id);
    }
    setDraggedData(null);
  };

  // Quản lý số ngày
  const handleRemoveDay = (dNum: number) => {
    if (daysCount <= 1) return;
    // Chuyển toàn bộ hoạt động của ngày đó về giỏ chờ
    const dayEvs = events.filter((e) => e.dayNumber === dNum);
    dayEvs.forEach((e) => removeEventToStandby(e.id));

    const nextEvents = events
      .filter((e) => e.dayNumber !== dNum)
      .map((e) => (e.dayNumber > dNum ? { ...e, dayNumber: e.dayNumber - 1 } : e));

    setEvents(nextEvents);
    setDaysCount((prev) => prev - 1);
    if (activeDay >= daysCount) setActiveDay(Math.max(1, daysCount - 1));
    notifyChanges(nextEvents, standbyList);
  };

  const handleAddDay = () => {
    const nextCount = daysCount + 1;
    setDaysCount(nextCount);
    setActiveDay(nextCount);
  };

  // HTML bản đồ Google Maps & OSRM
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
    
    .day-marker-pin {
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
    .day-marker-pin:hover { transform: scale(1.2); }

    .standby-marker-pin {
      width: 26px;
      height: 26px;
      background: #FBBC04;
      border: 2.5px solid #FFFFFF;
      border-radius: 50%;
      box-shadow: 0 3px 8px rgba(0,0,0,0.3);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 11px;
      color: #202124;
      transition: transform 0.15s ease;
    }
    .standby-marker-pin:hover { transform: scale(1.22); border-color: #EA4335; }

    .gmap-bubble {
      background: #FFFFFF;
      border: 2px solid #FF5252;
      border-radius: 14px;
      padding: 12px;
      min-width: 220px;
      box-shadow: 0 8px 24px rgba(255,82,82,0.22);
    }
    .gmap-bubble-title { font-size: 14px; font-weight: 800; color: #202124; margin-bottom: 3px; }
    .gmap-bubble-price { font-size: 12px; font-weight: 700; color: #0F9D58; margin-bottom: 6px; }
    .gmap-bubble-btn {
      width: 100%;
      padding: 7px;
      background: #1A73E8;
      color: #FFFFFF;
      border: none;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      margin-top: 6px;
    }
    .gmap-bubble-btn:hover { background: #1557B0; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    const map = L.map('map', { zoomControl: true }).setView([${centerLat}, ${centerLng}], 13);

    // Google Maps Roadmap Tiles
    const gLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '&copy; Google Maps'
    }).addTo(map);

    gLayer.on('tileerror', function() {
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '&copy; Esri World Street Map'
      }).addTo(map);
    });

    const dayPlaces = ${JSON.stringify(dayPlaces)};
    const standbyList = ${JSON.stringify(standbyCoords)};
    const bounds = L.latLngBounds([]);

    // 1. Cắm Markers các điểm của Ngày ${activeDay}
    dayPlaces.forEach((dp, idx) => {
      const lat = Number(dp.lat);
      const lng = Number(dp.lng);
      bounds.extend([lat, lng]);

      const icon = L.divIcon({
        className: '',
        html: '<div class="day-marker-pin">' + (idx + 1) + '</div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });

      const m = L.marker([lat, lng], { icon: icon }).addTo(map);
      m.bindPopup(
        '<div class="gmap-bubble">' +
          '<div style="font-size:10px;font-weight:800;color:#1A73E8;text-transform:uppercase;">Hoạt động #' + (idx + 1) + ' · Ngày ${activeDay}</div>' +
          '<div class="gmap-bubble-title">' + dp.title + '</div>' +
          '<div class="gmap-bubble-price">' + (dp.cost ? Number(dp.cost).toLocaleString("vi-VN") + ' đ' : 'Miễn phí') + '</div>' +
          '<div style="font-size:11px;color:#5F6368;">' + (dp.address || '${cityName}') + '</div>' +
        '</div>'
      );
    });

    // 2. Cắm Markers các điểm trong Giỏ chờ
    standbyList.forEach((sp, idx) => {
      const lat = Number(sp.lat);
      const lng = Number(sp.lng);
      bounds.extend([lat, lng]);

      const icon = L.divIcon({
        className: '',
        html: '<div class="standby-marker-pin">' + String.fromCharCode(65 + (idx % 26)) + '</div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });

      const m = L.marker([lat, lng], { icon: icon }).addTo(map);
      m.bindPopup(
        '<div class="gmap-bubble">' +
          '<div style="font-size:10px;font-weight:800;color:#EA4335;text-transform:uppercase;">Điểm trong kho chờ</div>' +
          '<div class="gmap-bubble-title">' + sp.name + '</div>' +
          '<div class="gmap-bubble-price">' + (sp.cost ? Number(sp.cost).toLocaleString("vi-VN") + ' đ' : 'Miễn phí') + '</div>' +
          '<div style="font-size:11px;color:#5F6368;">' + (sp.address || '${cityName}') + '</div>' +
          '<button class="gmap-bubble-btn" onclick="window.parent.postMessage(JSON.stringify({ type: \\'MAP_ADD_PLACE\\', placeId: \\'' + sp.id + '\\' }), \\'*\\')">➕ Đặt vào Lịch Ngày ${activeDay}</button>' +
        '</div>'
      );
    });

    // 3. OSRM Real Street Routing cho Ngày hiện tại
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

  // Lắng nghe postMessage từ bản đồ khi bấm nút "➕ Đặt vào Lịch Ngày này"
  useEffect(() => {
    if (Platform.OS === 'web') {
      const listener = (evt: MessageEvent) => {
        try {
          const d = typeof evt.data === 'string' ? JSON.parse(evt.data) : evt.data;
          if (d && d.type === 'MAP_ADD_PLACE' && d.placeId) {
            const item = standbyList.find((s) => s.id === d.placeId);
            if (item) {
              addPlaceToCalendar(item);
            }
          }
        } catch (e) {}
      };
      window.addEventListener('message', listener);
      return () => window.removeEventListener('message', listener);
    }
  }, [standbyList, events, activeDay]);

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
      {/* ── TOP BAR: TIÊU ĐỀ & NÚT LƯU LỊCH TRÌNH ── */}
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
              {cityName} · Kéo thả hoặc bấm gán trực tiếp giữa Bản đồ, Lịch theo giờ và Giỏ ngân sách
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

      {/* ── KHUNG CHÍNH SPLIT-VIEW (2 CỘT CHUẨN THEO BẢN VẼ TAY) ── */}
      <View
        style={{
          flexDirection: isDesktop ? 'row' : 'column',
          minHeight: 760,
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
          {/* Tabs Ngày 1, Ngày 2, Ngày 3 (kèm nút xóa ngày X như ảnh vẽ tay) */}
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
                const countInDay = events.filter((e) => Number(e.dayNumber) === Number(dNum)).length;

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

          {/* Bản đồ MAP chiếm trọn chiều cao cột trái */}
          <View style={{ flex: 1, minHeight: 500, position: 'relative' }}>
            {Platform.OS === 'web' ? (
              <iframe
                title="calendar-workspace-map"
                srcDoc={mapIframeHTML}
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: 500,
                  border: 'none',
                }}
              />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#888', fontSize: 12 }}>Bản đồ Google Maps hỗ trợ trên Web</Text>
              </View>
            )}

            {/* Chú thích bản đồ */}
            <View
              style={{
                position: 'absolute',
                bottom: 12,
                left: 12,
                backgroundColor: 'rgba(255,255,255,0.92)',
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
              minHeight: 400,
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

              {selectedPlaceToPlace && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E8F0FE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#1A73E8' }}>
                    Đang chọn: "{selectedPlaceToPlace.name}" → Bấm vào slot giờ để đặt
                  </Text>
                  <Pressable onPress={() => setSelectedPlaceToPlace(null)} style={{ padding: 2 }}>
                    <X size={12} color="#1A73E8" />
                  </Pressable>
                </View>
              )}
            </View>

            {/* Time Grid Google Calendar */}
            <ScrollView style={{ flex: 1, maxHeight: 380, paddingHorizontal: 14 }} showsVerticalScrollIndicator={true}>
              <View style={{ paddingVertical: 8 }}>
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
                        minHeight: 54,
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
                      {/* Cột mốc giờ bên trái */}
                      <View style={{ width: 50, paddingRight: 8, paddingTop: 4 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#5F6368', textAlign: 'right' }}>
                          {hour < 10 ? `0${hour}:00` : `${hour}:00`}
                        </Text>
                      </View>

                      {/* Vùng nhận thả sự kiện */}
                      <View style={{ flex: 1, paddingLeft: 8, gap: 6 }}>
                        {selectedPlaceToPlace && (
                          <Pressable
                            testID={`btn-place-to-hour-${hour}`}
                            onPress={() => addPlaceToCalendar(selectedPlaceToPlace, hour)}
                            style={{
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 8,
                              backgroundColor: '#E8F0FE',
                              borderWidth: 1,
                              borderStyle: 'dashed',
                              borderColor: '#1A73E8',
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6,
                              cursor: 'pointer' as any,
                            }}
                          >
                            <Plus size={13} color="#1A73E8" />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#1A73E8' }}>
                              + Đặt "{selectedPlaceToPlace.name}" vào {hour < 10 ? `0${hour}:00` : `${hour}:00`}
                            </Text>
                          </Pressable>
                        )}

                        {hourEvents.length === 0 && !selectedPlaceToPlace ? (
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
                              {isSlotHovered ? 'Thả vào khung giờ này' : '+ Trống (kéo thả địa điểm vào đây)'}
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
                                  {ev.address && (
                                    <Text numberOfLines={1} style={{ fontSize: 10, color: '#5F6368', marginTop: 1 }}>
                                      {ev.address}
                                    </Text>
                                  )}
                                </View>

                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#137333' }}>
                                    {ev.cost ? `${Number(ev.cost).toLocaleString('vi-VN')} đ` : 'Miễn phí'}
                                  </Text>

                                  {!readOnly && (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                      {/* Đổi giờ lên / xuống */}
                                      <Pressable
                                        onPress={() => moveEventHour(ev.id, -1)}
                                        style={{ padding: 3, cursor: 'pointer' as any }}
                                      >
                                        <ArrowUp size={12} color="#5F6368" />
                                      </Pressable>
                                      <Pressable
                                        onPress={() => moveEventHour(ev.id, 1)}
                                        style={{ padding: 3, cursor: 'pointer' as any }}
                                      >
                                        <ArrowDown size={12} color="#5F6368" />
                                      </Pressable>

                                      {/* Trả về giỏ chờ bên dưới */}
                                      <Pressable
                                        testID={`btn-remove-event-${ev.id}`}
                                        onPress={() => removeEventToStandby(ev.id)}
                                        style={{ padding: 4, cursor: 'pointer' as any }}
                                      >
                                        <Trash2 size={13} color="#D93025" />
                                      </Pressable>
                                    </View>
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

            {/* BỐ CỤC 3 CỘT CHUẨN CỦA BUDGET TOOL */}
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

              {/* CỘT 2: GIỎ ĐỊA ĐIỂM CHỜ XẾP LỊCH (KÉO THẢ HOẶC BẤM ĐỂ ĐẶT VÀO LỊCH) */}
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
                      {standbyList.map((item) => {
                        const isSelected = selectedPlaceToPlace?.id === item.id;
                        return (
                          <View
                            key={item.id}
                            testID={`standby-chip-${item.id}`}
                            style={{
                              backgroundColor: isSelected ? '#E8F0FE' : '#F8F9FA',
                              borderRadius: 8,
                              paddingHorizontal: 8,
                              paddingVertical: 5,
                              borderWidth: 1,
                              borderColor: isSelected ? '#1A73E8' : 'rgba(27,36,32,0.08)',
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
                            <Pressable
                              onPress={() => setSelectedPlaceToPlace(isSelected ? null : item)}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, paddingRight: 4, cursor: 'pointer' as any }}
                            >
                              <GripVertical size={12} color="#9AA0A6" />
                              <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', color: isSelected ? '#1A73E8' : '#202124' }}>
                                {item.name}
                              </Text>
                            </Pressable>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#137333' }}>
                                {item.cost ? `${Number(item.cost).toLocaleString('vi-VN')} đ` : '0 đ'}
                              </Text>
                              {!readOnly && (
                                <Pressable
                                  testID={`btn-add-standby-${item.id}`}
                                  onPress={() => addPlaceToCalendar(item)}
                                  style={{ padding: 2, cursor: 'pointer' as any }}
                                >
                                  <Plus size={13} color="#1A73E8" />
                                </Pressable>
                              )}
                            </View>
                          </View>
                        );
                      })}
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

                  {/* Thanh tiến độ */}
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
