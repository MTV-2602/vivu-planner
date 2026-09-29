import React, { useState, useMemo, useEffect, useRef } from 'react';
// @ts-ignore
import ReactDOM from 'react-dom';
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
  RotateCcw,
  ExternalLink
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
  budgetBreakdown?: {
    food?: number;
    hotel?: number;
    transport?: number;
    entertainment?: number;
    cafe?: number;
    other?: number;
  };
  daysCount?: number;
  initialEvents?: CalendarEventItem[];
  standbyPlaces?: StandbyPlaceItem[];
  onEventsChange?: (events: CalendarEventItem[]) => void;
  onStandbyChange?: (standby: StandbyPlaceItem[]) => void;
  onSave?: (events: CalendarEventItem[], totalCost: number) => void;
  readOnly?: boolean;
  isDetailPage?: boolean;
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 07:00 -> 21:00

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; lightBg: string; emoji: string }> = {
  dining: { bg: '#E6F4EA', border: '#137333', text: '#137333', lightBg: '#CEEAD6', emoji: '🍽️' },
  accommodation: { bg: '#F3E8FD', border: '#8430CE', text: '#8430CE', lightBg: '#E9D2FD', emoji: '🏨' },
  hotel: { bg: '#F3E8FD', border: '#8430CE', text: '#8430CE', lightBg: '#E9D2FD', emoji: '🏨' },
  attraction: { bg: '#E8F0FE', border: '#1A73E8', text: '#1A73E8', lightBg: '#D2E3FC', emoji: '🏔️' },
  cafe: { bg: '#FEF7E0', border: '#B06000', text: '#B06000', lightBg: '#FEEFC3', emoji: '☕' },
  rental: { bg: '#FCE8E6', border: '#C5221F', text: '#C5221F', lightBg: '#FAD2CF', emoji: '🛵' },
  transport: { bg: '#F1F3F4', border: '#5F6368', text: '#3C4043', lightBg: '#E8EAED', emoji: '🚌' },
  default: { bg: '#E8F0FE', border: '#1A73E8', text: '#1A73E8', lightBg: '#D2E3FC', emoji: '📍' },
};

export default function GoogleCalendarWorkspace({
  cityName = 'Hà Nội',
  totalBudget = 5000000,
  budgetBreakdown,
  daysCount: propDaysCount = 3,
  initialEvents,
  standbyPlaces: propStandbyPlaces,
  onEventsChange,
  onStandbyChange,
  onSave,
  readOnly = false,
  isDetailPage = false,
}: GoogleCalendarWorkspaceProps) {
  const { width: windowWidth } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && windowWidth >= 960;

  const [activeDay, setActiveDay] = useState(1);
  const [daysCount, setDaysCount] = useState(propDaysCount);
  const [showCartInDetail, setShowCartInDetail] = useState(false);

  // Khởi tạo dữ liệu
  const initialData = useMemo(() => {
    // 1. Nếu có initialEvents từ props
    if (initialEvents && initialEvents.length > 0) {
      return {
        evs: initialEvents,
        stb: propStandbyPlaces !== undefined ? propStandbyPlaces : [],
      };
    }

    // 2. Mới vào: nếu có propStandbyPlaces (kể cả rỗng []), tôn trọng propStandbyPlaces!
    let stb: StandbyPlaceItem[] = [];
    if (propStandbyPlaces !== undefined) {
      stb = propStandbyPlaces;
    } else {
      // Chỉ fallback khi chạy độc lập / demo không truyền propStandbyPlaces
      const cityPlaces = getCuratedPlacesForCity(cityName);
      stb = cityPlaces.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        cost: p.estimated_cost || 50000,
        suggestedDuration: 90,
      }));
    }

    return { evs: [], stb };
  }, [cityName, propDaysCount, initialEvents, propStandbyPlaces]);

  // State sự kiện và giỏ chờ
  const [events, setEvents] = useState<CalendarEventItem[]>(initialData.evs);
  const [standbyList, setStandbyList] = useState<StandbyPlaceItem[]>(initialData.stb);
  const isInitializedRef = useRef(false);

  // Refs để luôn đọc giá trị mới nhất trong pointer listeners
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const standbyListRef = useRef(standbyList);
  standbyListRef.current = standbyList;
  const activeDayRef = useRef(activeDay);
  activeDayRef.current = activeDay;

  // Đồng bộ props
  useEffect(() => {
    setDaysCount(propDaysCount);
  }, [propDaysCount]);

  useEffect(() => {
    if (!isInitializedRef.current) {
      if (initialEvents && initialEvents.length > 0) {
        setEvents(initialEvents);
      }
      if (propStandbyPlaces !== undefined) {
        setStandbyList(propStandbyPlaces);
      }
      isInitializedRef.current = true;
    }
  }, [initialEvents, propStandbyPlaces]);

  // Thông báo thay đổi
  const notifyChanges = (newEvents: CalendarEventItem[], newStandby: StandbyPlaceItem[]) => {
    if (onEventsChange) onEventsChange(newEvents);
    if (onStandbyChange) onStandbyChange(newStandby);
  };

  // State chọn điểm để gán nhanh (1-click place)
  const [selectedPlaceToPlace, setSelectedPlaceToPlace] = useState<StandbyPlaceItem | null>(null);

  // State toast thông báo kết quả tối ưu
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // ── REAL POINTER DRAG & DROP STATE ──
  const [pointerDrag, setPointerDrag] = useState<{
    type: 'event' | 'standby';
    id: string;
    item: StandbyPlaceItem | CalendarEventItem;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const pointerDragRef = useRef(pointerDrag);
  pointerDragRef.current = pointerDrag;

  const [hoveredHourSlot, setHoveredHourSlot] = useState<number | null>(null);
  const [hoveredCartZone, setHoveredCartZone] = useState(false);
  const [hoveredDayTab, setHoveredDayTab] = useState<number | null>(null);
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);

  // Sự kiện của ngày đang kích hoạt (sắp xếp theo thời gian)
  const currentDayEvents = useMemo(() => {
    return events
      .filter((ev) => Number(ev.dayNumber) === Number(activeDay))
      .sort((a, b) => a.startHour * 60 + a.startMinute - (b.startHour * 60 + b.startMinute));
  }, [events, activeDay]);

  // Kế hoạch ngân sách phân bổ theo danh mục: ăn, cf, nghỉ ngơi, vui chơi, khác, tổng
  const plannedBudget = useMemo(() => {
    const total = Number(totalBudget) || 5000000;
    if (budgetBreakdown) {
      const food = Number(budgetBreakdown.food) || Math.round(total * 0.25);
      const cafe = Number(budgetBreakdown.cafe) || Math.round(total * 0.10);
      const hotel = Number(budgetBreakdown.hotel) || Math.round(total * 0.30);
      const attraction = Number(budgetBreakdown.entertainment) || Math.round(total * 0.15);
      const other = Number(budgetBreakdown.transport) || Math.round(total * 0.20);
      return {
        dining: food,
        cafe: cafe,
        hotel: hotel,
        attraction: attraction,
        other: other,
        total: total,
      };
    }
    return {
      dining: Math.round(total * 0.25),
      cafe: Math.round(total * 0.10),
      hotel: Math.round(total * 0.30),
      attraction: Math.round(total * 0.15),
      other: Math.round(total * 0.20),
      total: total,
    };
  }, [totalBudget, budgetBreakdown]);

  // Bảng ngân sách ma trận Excel theo chuẩn 5 hạng mục: ăn, cf, nghỉ ngơi, vui chơi, khác, tổng
  const budgetStats = useMemo(() => {
    const totalScheduled = events.reduce((sum, ev) => sum + (Number(ev.cost) || 0), 0);
    const dayScheduled = currentDayEvents.reduce((sum, ev) => sum + (Number(ev.cost) || 0), 0);
    const remaining = (Number(totalBudget) || 0) - totalScheduled;

    const estimated = {
      dining: 0,
      cafe: 0,
      hotel: 0,
      attraction: 0,
      other: 0,
      total: totalScheduled,
    };

    events.forEach((ev) => {
      const c = (ev.category || '').toLowerCase();
      if (c === 'dining' || c.includes('ăn') || c.includes('food')) {
        estimated.dining += Number(ev.cost) || 0;
      } else if (c === 'cafe' || c.includes('cà phê') || c.includes('coffee') || c.includes('cf')) {
        estimated.cafe += Number(ev.cost) || 0;
      } else if (c === 'hotel' || c === 'accommodation' || c.includes('khách sạn') || c.includes('nghỉ') || c.includes('homestay') || c.includes('resort')) {
        estimated.hotel += Number(ev.cost) || 0;
      } else if (c === 'attraction' || c === 'experience' || c.includes('chơi') || c.includes('tham quan') || c.includes('vé')) {
        estimated.attraction += Number(ev.cost) || 0;
      } else {
        estimated.other += Number(ev.cost) || 0;
      }
    });

    const remainingByCategory = {
      dining: plannedBudget.dining - estimated.dining,
      cafe: plannedBudget.cafe - estimated.cafe,
      hotel: plannedBudget.hotel - estimated.hotel,
      attraction: plannedBudget.attraction - estimated.attraction,
      other: plannedBudget.other - estimated.other,
      total: remaining,
    };

    return {
      totalScheduled,
      dayScheduled,
      remaining,
      percentUsed: Math.min(100, Math.round((totalScheduled / (Number(totalBudget) || 1)) * 100)),
      estimated,
      remainingByCategory,
    };
  }, [events, currentDayEvents, totalBudget, plannedBudget]);

  // ── AI TỰ ĐỘNG TỐI ƯU LỘ TRÌNH VÀ PHÂN BỔ LỊCH TRÌNH TỪ GIỎ HÀNG ──
  const handleAiOptimizeSchedule = () => {
    if (standbyList.length === 0 && events.length === 0) return;

    // Gom tất cả địa điểm hiện có (cả trong giỏ chờ và đã có trong lịch)
    const allPlaces: StandbyPlaceItem[] = [
      ...events.map((e) => ({
        id: e.placeId || e.id,
        name: e.title,
        category: e.category,
        address: e.address,
        lat: e.lat,
        lng: e.lng,
        cost: e.cost,
        suggestedDuration: e.durationMinutes,
      })),
      ...standbyList,
    ];

    // Loại bỏ trùng lặp
    const uniquePlaces: StandbyPlaceItem[] = [];
    const seen = new Set<string>();
    allPlaces.forEach((p) => {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        uniquePlaces.push(p);
      }
    });

    // Tách riêng khách sạn nếu có
    const hotels = uniquePlaces.filter((p) => {
      const c = (p.category || '').toLowerCase();
      return c === 'hotel' || c === 'accommodation' || c.includes('khách sạn') || c.includes('nghỉ');
    });
    const nonHotels = uniquePlaces.filter((p) => !hotels.includes(p));

    // Sắp xếp các địa điểm theo khoảng cách địa lý (Nearest Neighbor) để tối ưu đường đi
    const ordered: StandbyPlaceItem[] = [];
    if (nonHotels.length > 0) {
      const remainingPool = [...nonHotels];
      let current = remainingPool.shift()!;
      ordered.push(current);

      while (remainingPool.length > 0) {
        let nearestIdx = 0;
        let minDist = Infinity;
        for (let i = 0; i < remainingPool.length; i++) {
          const cand = remainingPool[i];
          const dist = Math.hypot(
            (Number(cand.lat) || 0) - (Number(current.lat) || 0),
            (Number(cand.lng) || 0) - (Number(current.lng) || 0)
          );
          if (dist < minDist) {
            minDist = dist;
            nearestIdx = i;
          }
        }
        current = remainingPool.splice(nearestIdx, 1)[0];
        ordered.push(current);
      }
    }

    // Các khung giờ khoa học cho từng ngày (Sáng, Trưa, Chiều, Tối)
    const timeSlots = [
      { hour: 8, minute: 0, dur: 90 },   // 08:00 (Cà phê / Đi dạo)
      { hour: 10, minute: 0, dur: 90 },  // 10:00 (Tham quan / Di tích)
      { hour: 12, minute: 0, dur: 90 },  // 12:00 (Ẩm thực đặc sản)
      { hour: 14, minute: 30, dur: 90 }, // 14:30 (Vui chơi / Trải nghiệm)
      { hour: 16, minute: 30, dur: 90 }, // 16:30 (Check-in / Cafe view)
      { hour: 18, minute: 30, dur: 90 }, // 18:30 (Ăn tối / Phố ẩm thực)
      { hour: 20, minute: 30, dur: 75 }, // 20:30 (Chợ đêm / Dạo phố)
    ];

    const newEvents: CalendarEventItem[] = [];
    const totalDays = Math.max(1, daysCount);

    // Nếu có khách sạn, đặt vào Ngày 1 lúc 14:00 (check-in)
    if (hotels.length > 0) {
      hotels.forEach((h, hIdx) => {
        newEvents.push({
          id: `ev-hotel-${h.id}-${Date.now()}`,
          placeId: h.id,
          title: h.name,
          category: 'hotel',
          address: h.address,
          lat: h.lat,
          lng: h.lng,
          cost: h.cost,
          dayNumber: (hIdx % totalDays) + 1,
          startHour: 14,
          startMinute: 0,
          durationMinutes: 60,
          notes: 'Nhận phòng khách sạn & cất hành lý',
        });
      });
    }

    // Phân bổ đều các địa điểm vào từng ngày
    ordered.forEach((p, idx) => {
      const targetDay = (idx % totalDays) + 1;
      const dayOrder = Math.floor(idx / totalDays);
      const slot = timeSlots[dayOrder % timeSlots.length] || { hour: 8 + (dayOrder * 2) % 12, minute: 0, dur: 90 };

      newEvents.push({
        id: `ev-opt-${p.id}-${Date.now()}-${idx}`,
        placeId: p.id,
        title: p.name,
        category: p.category,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        cost: p.cost,
        dayNumber: targetDay,
        startHour: slot.hour,
        startMinute: slot.minute,
        durationMinutes: p.suggestedDuration || slot.dur,
        notes: `AI tối ưu lộ trình ngày ${targetDay}`,
      });
    });

    setEvents(newEvents);
    setStandbyList([]);
    notifyChanges(newEvents, []);
    setToastMsg('✓ AI đã tối ưu hóa lộ trình và phân bổ lịch trình thông minh!');
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Tọa độ trung tâm thành phố
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
    let hour = targetHour;
    if (hour === undefined) {
      const usedHours = new Set(currentDayEvents.map((e) => e.startHour));
      for (let h = 8; h <= 21; h++) {
        if (!usedHours.has(h)) {
          hour = h;
          break;
        }
      }
      if (hour === undefined) hour = 8;
    }

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
      startHour: Number(hour),
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

  // ── XỬ LÝ REAL POINTER DRAG & DROP TRÊN WEB ──
  const handleStartPointerDrag = (
    item: StandbyPlaceItem | CalendarEventItem,
    type: 'event' | 'standby',
    e: any
  ) => {
    if (readOnly) return;
    if (e?.button !== undefined && e.button !== 0) return; // Chỉ chuột trái

    const clientX = e?.clientX ?? (e?.touches && e.touches[0]?.clientX) ?? 0;
    const clientY = e?.clientY ?? (e?.touches && e.touches[0]?.clientY) ?? 0;

    const dragObj = {
      type,
      id: item.id,
      item,
      startX: clientX,
      startY: clientY,
      currentX: clientX,
      currentY: clientY,
    };
    setPointerDrag(dragObj);
    pointerDragRef.current = dragObj;

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
    }
  };

  // Global Pointer / Mouse Move & Up Listeners
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleGlobalPointerMove = (e: MouseEvent | TouchEvent) => {
      if (!pointerDragRef.current) return;
      const clientX = 'clientX' in e ? e.clientX : e.touches[0]?.clientX || 0;
      const clientY = 'clientY' in e ? e.clientY : e.touches[0]?.clientY || 0;

      setPointerDrag((prev) => (prev ? { ...prev, currentX: clientX, currentY: clientY } : null));

      const elem = document.elementFromPoint(clientX, clientY);
      if (elem) {
        const hourEl = elem.closest('[data-hour]');
        if (hourEl) {
          const h = parseInt(hourEl.getAttribute('data-hour') || '', 10);
          if (!isNaN(h)) setHoveredHourSlot(h);
        } else {
          setHoveredHourSlot(null);
        }

        const cartEl = elem.closest('[data-cart-dropzone]');
        setHoveredCartZone(!!cartEl);

        const dayEl = elem.closest('[data-day-tab]');
        if (dayEl) {
          const d = parseInt(dayEl.getAttribute('data-day-tab') || '', 10);
          if (!isNaN(d)) setHoveredDayTab(d);
        } else {
          setHoveredDayTab(null);
        }
      }
    };

    const handleGlobalPointerUp = (e: MouseEvent | TouchEvent) => {
      const cur = pointerDragRef.current;
      if (!cur) return;

      const clientX =
        'clientX' in e
          ? e.clientX
          : ('changedTouches' in e && e.changedTouches[0]?.clientX) || cur.currentX;
      const clientY =
        'clientY' in e
          ? e.clientY
          : ('changedTouches' in e && e.changedTouches[0]?.clientY) || cur.currentY;

      const elem = document.elementFromPoint(clientX, clientY);
      const hourEl = elem?.closest('[data-hour]');
      const cartEl = elem?.closest('[data-cart-dropzone]');
      const dayEl = elem?.closest('[data-day-tab]');

      if (hourEl) {
        const targetHour = parseInt(hourEl.getAttribute('data-hour') || '', 10);
        if (!isNaN(targetHour)) {
          if (cur.type === 'standby') {
            const standbyItem =
              standbyListRef.current.find((s) => s.id === cur.id) || (cur.item as StandbyPlaceItem);
            if (standbyItem) {
              addPlaceToCalendar(standbyItem, targetHour);
            }
          } else if (cur.type === 'event') {
            const nextEvents = eventsRef.current.map((ev) =>
              ev.id === cur.id ? { ...ev, startHour: targetHour, dayNumber: activeDayRef.current } : ev
            );
            setEvents(nextEvents);
            notifyChanges(nextEvents, standbyListRef.current);
          }
        }
      } else if (cartEl) {
        if (cur.type === 'event') {
          removeEventToStandby(cur.id);
        }
      } else if (dayEl) {
        const targetDay = parseInt(dayEl.getAttribute('data-day-tab') || '', 10);
        if (!isNaN(targetDay) && cur.type === 'event') {
          const nextEvents = eventsRef.current.map((ev) =>
            ev.id === cur.id ? { ...ev, dayNumber: targetDay } : ev
          );
          setEvents(nextEvents);
          notifyChanges(nextEvents, standbyListRef.current);
        }
      }

      setPointerDrag(null);
      pointerDragRef.current = null;
      setHoveredHourSlot(null);
      setHoveredCartZone(false);
      setHoveredDayTab(null);

      if (typeof document !== 'undefined') {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
    };

    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('mousemove', handleGlobalPointerMove);
    window.addEventListener('mouseup', handleGlobalPointerUp);
    window.addEventListener('touchmove', handleGlobalPointerMove);
    window.addEventListener('touchend', handleGlobalPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('mousemove', handleGlobalPointerMove);
      window.removeEventListener('mouseup', handleGlobalPointerUp);
      window.removeEventListener('touchmove', handleGlobalPointerMove);
      window.removeEventListener('touchend', handleGlobalPointerUp);
      if (typeof document !== 'undefined') {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
    };
  }, []);

  // Quản lý số ngày
  const handleRemoveDay = (dNum: number) => {
    if (daysCount <= 1) return;
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

  // ── HTML GOOGLE MAPS ROUTE PLANNER VIEW ──
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
    
    /* Modern Google Maps Pins */
    .gmap-pin-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
    }
    .gmap-pin-time {
      background: #FFFFFF;
      color: #1A73E8;
      font-weight: 800;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 6px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
      margin-bottom: 2px;
      white-space: nowrap;
      border: 1px solid #1A73E8;
    }
    .gmap-pin-circle {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #1A73E8 0%, #1557B0 100%);
      border: 2.5px solid #FFFFFF;
      border-radius: 50%;
      box-shadow: 0 4px 14px rgba(26,115,232,0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 13px;
      color: #FFFFFF;
      transition: transform 0.15s ease;
    }
    .gmap-pin-circle:hover {
      transform: scale(1.2);
    }
    .gmap-pin-pulse {
      position: absolute;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: rgba(26,115,232,0.3);
      animation: pulse 1.8s infinite;
      z-index: -1;
    }
    @keyframes pulse {
      0% { transform: scale(0.8); opacity: 1; }
      100% { transform: scale(1.6); opacity: 0; }
    }

    .standby-pin {
      width: 24px;
      height: 24px;
      background: #FBBC04;
      border: 2px solid #FFFFFF;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      transition: transform 0.15s ease;
    }
    .standby-pin:hover {
      transform: scale(1.25);
    }

    /* Route info overlay banner */
    .route-banner {
      position: absolute;
      top: 12px;
      left: 12px;
      right: 12px;
      z-index: 1000;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(26, 115, 232, 0.25);
      border-radius: 12px;
      padding: 10px 14px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 12px;
      color: #202124;
    }

    .popup-box {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-width: 200px;
      padding: 4px;
    }
    .popup-title { font-size: 14px; font-weight: 800; color: #1B2420; margin-bottom: 2px; }
    .popup-meta { font-size: 11px; color: #5F6368; margin-bottom: 6px; }
    .popup-cost { font-size: 12px; font-weight: 800; color: #0F9D58; margin-bottom: 8px; }
    .popup-btn {
      width: 100%;
      padding: 6px 10px;
      background: #1A73E8;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div id="route-banner" class="route-banner" style="display: none;"></div>
  <div id="map"></div>
  <script>
    const map = L.map('map', { zoomControl: false }).setView([${centerLat}, ${centerLng}], 13);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

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

    // 1. Cắm Markers các điểm của Ngày ${activeDay} theo thứ tự 1, 2, 3...
    dayPlaces.forEach((p, idx) => {
      bounds.extend([p.lat, p.lng]);
      const orderNum = idx + 1;
      const timeStr = (p.startHour < 10 ? '0' + p.startHour : p.startHour) + ':00';

      const pinHtml = \`
        <div class="gmap-pin-container" onclick="parent.postMessage({ type: 'MAP_SELECT_EVENT', eventId: '\${p.id}' }, '*')">
          <div class="gmap-pin-time">\${timeStr}</div>
          <div class="gmap-pin-circle">
            \${orderNum === 1 ? '<div class="gmap-pin-pulse"></div>' : ''}
            <span>\${orderNum}</span>
          </div>
        </div>
      \`;

      const icon = L.divIcon({
        className: 'custom-gmap-pin',
        html: pinHtml,
        iconSize: [44, 56],
        iconAnchor: [22, 56],
        popupAnchor: [0, -50]
      });

      const costStr = Number(p.cost || 0).toLocaleString('vi-VN') + 'đ';
      L.marker([p.lat, p.lng], { icon })
        .addTo(map)
        .bindPopup(\`
          <div class="popup-box">
            <div class="popup-title">#\${orderNum} · \${p.title}</div>
            <div class="popup-meta">Khung giờ: \${timeStr} · Ngày ${activeDay}</div>
            <div class="popup-cost">Chi phí: \${costStr}</div>
            <div style="font-size:10px; color:#5F6368; line-height:1.3; margin-bottom:8px;">\${p.address || ''}</div>
            <button class="popup-btn" onclick="parent.postMessage({ type: 'MAP_SELECT_EVENT', eventId: '\${p.id}' }, '*')">
              🔍 Xem trên Lịch trình
            </button>
          </div>
        \`);
    });

    // 2. Cắm Markers các điểm trong Giỏ chờ (Standby)
    standbyList.forEach((s) => {
      bounds.extend([s.lat, s.lng]);
      const standbyHtml = \`
        <div class="standby-pin" title="\${s.name} (Giỏ chờ)">
          <span>🛍️</span>
        </div>
      \`;
      const icon = L.divIcon({
        className: 'custom-standby-pin',
        html: standbyHtml,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        popupAnchor: [0, -14]
      });

      const costStr = Number(s.cost || 0).toLocaleString('vi-VN') + 'đ';
      L.marker([s.lat, s.lng], { icon })
        .addTo(map)
        .bindPopup(\`
          <div class="popup-box">
            <div style="font-size:10px; font-weight:800; color:#B06000; text-transform:uppercase;">🛒 ĐANG TRONG GIỎ CHỜ</div>
            <div class="popup-title">\${s.name}</div>
            <div class="popup-cost">\${costStr}</div>
            <button class="popup-btn" style="background:#FBBC04; color:#202124;" onclick="parent.postMessage({ type: 'MAP_ADD_PLACE', placeId: '\${s.id}' }, '*')">
              ➕ Đặt vào Lịch Ngày ${activeDay}
            </button>
          </div>
        \`);
    });

    // 3. Vẽ Polyline Lộ trình OSRM kết nối các điểm 1 -> 2 -> 3...
    if (dayPlaces.length >= 2) {
      const coords = dayPlaces.map(p => p.lng + ',' + p.lat).join(';');
      fetch('https://router.project-osrm.org/route/v1/driving/' + coords + '?overview=full&geometries=geojson')
        .then(res => res.json())
        .then(data => {
          if (data && data.routes && data.routes[0]) {
            const route = data.routes[0];
            L.geoJSON(route.geometry, {
              style: { color: '#1A73E8', weight: 5, opacity: 0.85, lineJoin: 'round' }
            }).addTo(map);

            const distKm = (route.distance / 1000).toFixed(1);
            const durMin = Math.round(route.duration / 60);
            const banner = document.getElementById('route-banner');
            if (banner) {
              banner.innerHTML = \`
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-size:16px;">🚗</span>
                  <span>Lộ trình Ngày ${activeDay}: <b>\${dayPlaces.length} điểm</b> · <b>~\${distKm} km</b> (~\${durMin} phút đi xe)</span>
                </div>
                <a href="https://www.google.com/maps/dir/\${dayPlaces.map(p => encodeURIComponent(p.title + ' ' + '${cityName}')).join('/')}" target="_blank" style="color:#1A73E8; font-weight:800; text-decoration:none; font-size:11px;">
                  Mở Google Maps ↗
                </a>
              \`;
              banner.style.display = 'flex';
            }
          }
        })
        .catch(() => {
          const latlngs = dayPlaces.map(p => [p.lat, p.lng]);
          L.polyline(latlngs, { color: '#1A73E8', weight: 4, dashArray: '6, 8', opacity: 0.8 }).addTo(map);
        });
    } else if (dayPlaces.length === 1) {
      const banner = document.getElementById('route-banner');
      if (banner) {
        banner.innerHTML = \`
          <div style="display:flex; align-items:center; gap:6px;">
            <span>📍 Ngày ${activeDay} hiện có 1 điểm dừng. Hãy kéo thêm điểm từ Giỏ chờ vào lịch!</span>
          </div>
        \`;
        banner.style.display = 'flex';
      }
    }

    if (bounds.isValid()) {
      setTimeout(() => map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 }), 200);
    }
  </script>
</body>
</html>`;
  }, [currentDayEvents, standbyList, activeDay, centerLat, centerLng, cityName]);

  // Lắng nghe postMessage từ iframe map
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
          } else if (d && d.type === 'MAP_SELECT_EVENT' && d.eventId) {
            setHighlightedEventId(d.eventId);
            setTimeout(() => setHighlightedEventId(null), 3000);
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
              {cityName} · Kéo thả thẻ hoạt động trực tiếp vào từng khung giờ hoặc dùng nút điều chỉnh
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

      {/* ── KHUNG CHÍNH SPLIT-VIEW (2 CỘT) ── */}
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
          }}
        >
          {/* Day Tabs Bar */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 10,
              backgroundColor: '#FFFFFF',
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(27,36,32,0.06)',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {Array.from({ length: daysCount }, (_, i) => i + 1).map((dNum) => {
                const isActive = activeDay === dNum;
                const isHoveredTab = hoveredDayTab === dNum;
                const dayEvCount = events.filter((e) => e.dayNumber === dNum).length;

                return (
                  <View
                    key={dNum}
                    // @ts-ignore
                    data-day-tab={dNum}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: isHoveredTab
                        ? 'rgba(26,115,232,0.2)'
                        : isActive
                        ? '#1A73E8'
                        : '#F1F3F4',
                      borderRadius: 10,
                      borderWidth: isHoveredTab ? 2 : 1,
                      borderStyle: isHoveredTab ? 'dashed' : 'solid',
                      borderColor: isHoveredTab ? '#1A73E8' : isActive ? '#1A73E8' : 'rgba(27,36,32,0.08)',
                      paddingLeft: 12,
                      paddingRight: daysCount > 1 && !readOnly ? 6 : 12,
                      paddingVertical: 7,
                    }}
                  >
                    <Pressable
                      testID={`tab-day-${dNum}`}
                      onPress={() => setActiveDay(dNum)}
                      style={{ cursor: 'pointer' as any }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '800',
                          color: isActive ? '#FFFFFF' : '#3C4043',
                        }}
                      >
                        Ngày {dNum} ({dayEvCount})
                      </Text>
                    </Pressable>

                    {daysCount > 1 && !readOnly && (
                      <Pressable
                        onPress={() => handleRemoveDay(dNum)}
                        style={{
                          marginLeft: 6,
                          padding: 2,
                          borderRadius: 4,
                          backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
                          cursor: 'pointer' as any,
                        }}
                      >
                        <X size={11} color={isActive ? '#FFFFFF' : '#5F6368'} />
                      </Pressable>
                    )}
                  </View>
                );
              })}

              {!readOnly && (
                <Pressable
                  testID="btn-add-day-workspace"
                  onPress={handleAddDay}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 10,
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1,
                    borderColor: '#1A73E8',
                    borderStyle: 'dashed',
                    cursor: 'pointer' as any,
                  }}
                >
                  <Plus size={12} color="#1A73E8" />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#1A73E8' }}>Thêm ngày</Text>
                </Pressable>
              )}
            </ScrollView>
          </View>

          {/* Bản đồ Map View */}
          <View style={{ flex: 1, minHeight: 480, position: 'relative', backgroundColor: '#F8F9FA' }}>
            {Platform.OS === 'web' ? (
              <iframe
                title="Google Maps Live Route"
                srcDoc={mapIframeHTML}
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: 480,
                  border: 'none',
                  display: 'block',
                }}
              />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <MapPin size={32} color={BRAND_COLORS.primary} />
                <Text style={{ fontSize: 13, color: '#5F6368', marginTop: 8 }}>
                  Bản đồ trực tuyến hiển thị tốt nhất trên trình duyệt Web.
                </Text>
              </View>
            )}

            {/* Map Legend Overlay */}
            <View
              style={{
                position: 'absolute',
                bottom: 12,
                left: 12,
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: 'rgba(0,0,0,0.1)',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)' as any,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#1A73E8' }} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#202124' }}>
                  Điểm Ngày {activeDay} ({currentDayEvents.length})
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#FBBC04' }} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#202124' }}>
                  Giỏ chờ ({standbyList.length})
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* CỘT PHẢI (RIGHT PANEL): LỊCH GOOGLE CALENDAR + BUDGET     */}
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
          {/* Ô TRÊN (TOP BOX): LỊCH TRÌNH GOOGLE CALENDAR             */}
          {/* ──────────────────────────────────────────────────────── */}
          <View
            style={{
              flex: 1,
              borderBottomWidth: 2,
              borderBottomColor: 'rgba(27,36,32,0.12)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 410,
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
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: '#E8F0FE',
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#1A73E8' }}>
                    Đang chọn: "{selectedPlaceToPlace.name}" → Bấm vào slot giờ bên dưới để đặt
                  </Text>
                  <Pressable onPress={() => setSelectedPlaceToPlace(null)} style={{ padding: 2 }}>
                    <X size={12} color="#1A73E8" />
                  </Pressable>
                </View>
              )}
            </View>

            {/* Time Grid Google Calendar (07:00 -> 21:00) */}
            <ScrollView
              style={{ flex: 1, maxHeight: 400, paddingHorizontal: 14 }}
              showsVerticalScrollIndicator={true}
            >
              <View style={{ paddingVertical: 8 }}>
                {HOURS.map((hour) => {
                  const hourEvents = currentDayEvents.filter((ev) => ev.startHour === hour);
                  const isSlotHovered = hoveredHourSlot === hour;

                  return (
                    <View
                      key={hour}
                      testID={`calendar-hour-row-${hour}`}
                      // @ts-ignore
                      data-hour={hour}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        minHeight: 56,
                        borderTopWidth: 1,
                        borderTopColor: isSlotHovered ? '#1A73E8' : 'rgba(27,36,32,0.08)',
                        backgroundColor: isSlotHovered ? 'rgba(26,115,232,0.12)' : 'transparent',
                        paddingVertical: 4,
                        transition: 'background-color 0.15s ease',
                      } as any}
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
                          <Pressable
                            onPress={() => {
                              if (standbyList.length > 0) {
                                addPlaceToCalendar(standbyList[0], hour);
                              }
                            }}
                            style={{
                              height: 40,
                              borderRadius: 8,
                              borderWidth: isSlotHovered ? 2 : 1,
                              borderStyle: 'dashed',
                              borderColor: isSlotHovered ? '#1A73E8' : 'rgba(27,36,32,0.06)',
                              backgroundColor: isSlotHovered ? 'rgba(26,115,232,0.15)' : 'transparent',
                              justifyContent: 'center',
                              paddingHorizontal: 10,
                              cursor: isSlotHovered ? 'copy' : 'default' as any,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 10,
                                color: isSlotHovered ? '#1A73E8' : 'rgba(27,36,32,0.3)',
                                fontStyle: 'italic',
                                fontWeight: isSlotHovered ? '800' : '400',
                              }}
                            >
                              {isSlotHovered
                                ? `👉 Thả vào đây để xếp lịch lúc ${hour < 10 ? '0' + hour : hour}:00`
                                : '+ Trống (kéo thả địa điểm từ Giỏ chờ vào đây)'}
                            </Text>
                          </Pressable>
                        ) : (
                          hourEvents.map((ev) => {
                            const colors = CATEGORY_COLORS[ev.category] || CATEGORY_COLORS.default;
                            const isCardHighlighted = highlightedEventId === ev.id;

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
                                  boxShadow: isCardHighlighted
                                    ? '0 0 0 2px #1A73E8, 0 4px 12px rgba(26,115,232,0.35)'
                                    : ('0 2px 6px rgba(0,0,0,0.05)' as any),
                                  borderWidth: isCardHighlighted ? 1 : 0,
                                  borderColor: isCardHighlighted ? '#1A73E8' : 'transparent',
                                }}
                              >
                                <View style={{ flex: 1, paddingRight: 8 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={{ fontSize: 12 }}>{colors.emoji}</Text>
                                    <Text
                                      style={{
                                        fontSize: 12,
                                        fontWeight: '800',
                                        color: '#1B2420',
                                        flex: 1,
                                      }}
                                      numberOfLines={1}
                                    >
                                      {ev.title}
                                    </Text>
                                  </View>

                                  <View
                                    style={{
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      gap: 8,
                                      marginTop: 3,
                                      flexWrap: 'wrap',
                                    }}
                                  >
                                    <Text style={{ fontSize: 10, color: '#5F6368' }}>
                                      {ev.startHour < 10 ? `0${ev.startHour}:00` : `${ev.startHour}:00`} · {ev.durationMinutes}p
                                    </Text>
                                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text }}>
                                      {Number(ev.cost).toLocaleString('vi-VN')}đ
                                    </Text>
                                  </View>
                                </View>

                                {/* Action Buttons: Shift Hour, Delete, Drag Grip */}
                                {!readOnly && (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Pressable
                                      testID={`btn-shift-up-${ev.id}`}
                                      onPress={() => moveEventHour(ev.id, -1)}
                                      style={{
                                        padding: 3,
                                        borderRadius: 4,
                                        backgroundColor: 'rgba(0,0,0,0.05)',
                                        cursor: 'pointer' as any,
                                      }}
                                    >
                                      <ArrowUp size={12} color="#5F6368" />
                                    </Pressable>

                                    <Pressable
                                      testID={`btn-shift-down-${ev.id}`}
                                      onPress={() => moveEventHour(ev.id, 1)}
                                      style={{
                                        padding: 3,
                                        borderRadius: 4,
                                        backgroundColor: 'rgba(0,0,0,0.05)',
                                        cursor: 'pointer' as any,
                                      }}
                                    >
                                      <ArrowDown size={12} color="#5F6368" />
                                    </Pressable>

                                    <Pressable
                                      testID={`btn-remove-to-cart-${ev.id}`}
                                      onPress={() => removeEventToStandby(ev.id)}
                                      style={{
                                        padding: 3,
                                        borderRadius: 4,
                                        backgroundColor: 'rgba(197,34,31,0.08)',
                                        cursor: 'pointer' as any,
                                      }}
                                    >
                                      <Trash2 size={12} color="#C5221F" />
                                    </Pressable>

                                    {/* Grip Handle for Pointer Drag */}
                                    <View
                                      // @ts-ignore
                                      onPointerDown={(e: any) => handleStartPointerDrag(ev, 'event', e)}
                                      style={{
                                        padding: 4,
                                        cursor: 'grab' as any,
                                        touchAction: 'none' as any,
                                      }}
                                    >
                                      <GripVertical size={14} color="#80868B" />
                                    </View>
                                  </View>
                                )}
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
          {/* Ô DƯỚI (BOTTOM BOX): STANDBY CART TRAY + BẢNG NGÂN SÁCH   */}
          {/* ──────────────────────────────────────────────────────── */}
          <View
            style={{
              padding: 16,
              backgroundColor: '#FAFAFA',
              gap: 14,
            }}
          >
            {/* NẾU LÀ TRANG CHI TIẾT VÀ CHƯA BẤM MỞ GIỎ: HIỂN THỊ THANH TINH GỌN */}
            {isDetailPage && !showCartInDetail ? (
              <View
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: 'rgba(27,36,32,0.1)',
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.03)' as any,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 14 }}>🗺️</Text>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#1B2420' }}>
                    Lịch trình hoàn chỉnh · {events.length} hoạt động
                  </Text>
                  {standbyList.length > 0 && (
                    <View
                      style={{
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 8,
                        backgroundColor: '#FEF7E0',
                        borderWidth: 1,
                        borderColor: '#B06000',
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#B06000' }}>
                        Còn {standbyList.length} điểm chờ
                      </Text>
                    </View>
                  )}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Pressable
                    testID="btn-open-standby-detail"
                    onPress={() => setShowCartInDetail(true)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      backgroundColor: '#E8F0FE',
                      borderWidth: 1,
                      borderColor: '#1A73E8',
                      cursor: 'pointer' as any,
                    }}
                  >
                    <ShoppingBag size={13} color="#1A73E8" />
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#1A73E8' }}>
                      {standbyList.length > 0 ? `Xem khay giỏ chờ (${standbyList.length})` : '🔍 Thêm / Thay thế địa điểm'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              /* 1. KHAY GIỎ HÀNG CHỜ XẾP LỊCH (STANDBY CART TRAY) */
              <View
                // @ts-ignore
                data-cart-dropzone="true"
                style={{
                  backgroundColor: hoveredCartZone ? 'rgba(251,188,4,0.15)' : '#FFFFFF',
                  borderRadius: 16,
                  borderWidth: hoveredCartZone ? 2 : 1,
                  borderStyle: hoveredCartZone ? 'dashed' : 'solid',
                  borderColor: hoveredCartZone ? '#FBBC04' : 'rgba(27,36,32,0.12)',
                  padding: 12,
                  gap: 10,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)' as any,
                  transition: 'background-color 0.15s ease',
                } as any}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <ShoppingBag size={15} color="#B06000" />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#1B2420' }}>
                      Khay Giỏ Hàng Chờ Xếp Lịch
                    </Text>
                    <View
                      style={{
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        borderRadius: 10,
                        backgroundColor: '#FEF7E0',
                        borderWidth: 1,
                        borderColor: '#B06000',
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#B06000' }}>
                        {standbyList.length} địa điểm
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {/* Nút AI Tối ưu lịch trình tự động từ giỏ hàng */}
                    <Pressable
                      testID="btn-ai-optimize-schedule"
                      onPress={handleAiOptimizeSchedule}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        paddingVertical: 5,
                        paddingHorizontal: 11,
                        borderRadius: 10,
                        backgroundColor: '#F3E8FD',
                        borderWidth: 1,
                        borderColor: '#8430CE',
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Sparkles size={12} color="#8430CE" />
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#8430CE' }}>
                        ⚡ AI Tối ưu lịch trình
                      </Text>
                    </Pressable>

                    {isDetailPage && (
                      <Pressable
                        onPress={() => setShowCartInDetail(false)}
                        style={{
                          paddingVertical: 4,
                          paddingHorizontal: 8,
                          borderRadius: 8,
                          backgroundColor: '#F1F3F4',
                          cursor: 'pointer' as any,
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#5F6368' }}>Thu gọn</Text>
                      </Pressable>
                    )}
                  </View>
                </View>

                {standbyList.length === 0 ? (
                  <View
                    style={{
                      paddingVertical: 18,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderStyle: 'dashed',
                      borderColor: 'rgba(27,36,32,0.1)',
                      borderRadius: 12,
                      backgroundColor: '#FAFAFA',
                    }}
                  >
                    <Text style={{ fontSize: 11, color: '#5F6368', fontWeight: '500' }}>
                      🎉 Đã xếp toàn bộ địa điểm vào Lịch trình! Kéo sự kiện từ lịch thả vào đây nếu muốn đưa lại giỏ chờ.
                    </Text>
                  </View>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
                  >
                    {standbyList.map((item) => {
                      const colors = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.default;
                      const isSelected = selectedPlaceToPlace?.id === item.id;

                      return (
                        <View
                          key={item.id}
                          testID={`standby-chip-${item.id}`}
                          style={{
                            width: 195,
                            backgroundColor: isSelected ? '#E8F0FE' : '#FFFFFF',
                            borderRadius: 12,
                            borderWidth: 1.5,
                            borderColor: isSelected ? '#1A73E8' : 'rgba(27,36,32,0.12)',
                            padding: 10,
                            gap: 6,
                            boxShadow: '0 2px 6px rgba(0,0,0,0.04)' as any,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                                backgroundColor: colors.lightBg,
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 6,
                              }}
                            >
                              <Text style={{ fontSize: 10 }}>{colors.emoji}</Text>
                              <Text style={{ fontSize: 9, fontWeight: '800', color: colors.text, textTransform: 'uppercase' }}>
                                {item.category}
                              </Text>
                            </View>

                            <Text style={{ fontSize: 10, fontWeight: '800', color: '#137333' }}>
                              {Number(item.cost).toLocaleString('vi-VN')}đ
                            </Text>
                          </View>

                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#202124' }} numberOfLines={1}>
                            {item.name}
                          </Text>

                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                            {/* Grip Handle for Pointer Drag */}
                            <View
                              // @ts-ignore
                              onPointerDown={(e: any) => handleStartPointerDrag(item, 'standby', e)}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 2,
                                paddingVertical: 3,
                                paddingHorizontal: 6,
                                borderRadius: 6,
                                backgroundColor: '#F1F3F4',
                                cursor: 'grab' as any,
                                touchAction: 'none' as any,
                              }}
                            >
                              <GripVertical size={12} color="#5F6368" />
                              <Text style={{ fontSize: 9, color: '#5F6368', fontWeight: '700' }}>Kéo thẻ</Text>
                            </View>

                            <Pressable
                              testID={`btn-quick-place-${item.id}`}
                              onPress={() => {
                                if (isSelected) {
                                  setSelectedPlaceToPlace(null);
                                } else {
                                  setSelectedPlaceToPlace(item);
                                }
                              }}
                              style={{
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                                borderRadius: 6,
                                backgroundColor: isSelected ? '#1A73E8' : 'rgba(26,115,232,0.08)',
                                cursor: 'pointer' as any,
                              }}
                            >
                              <Text style={{ fontSize: 10, fontWeight: '800', color: isSelected ? '#FFFFFF' : '#1A73E8' }}>
                                {isSelected ? '✓ Đang chọn' : '+ Đặt giờ'}
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            )}

            {/* 2. BẢNG NGÂN SÁCH MA TRẬN EXCEL (5 HẠNG MỤC: ĂN, CF, NGHỈ NGƠI, VUI CHƠI, KHÁC, TỔNG) */}
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: 'rgba(27,36,32,0.12)',
                overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)' as any,
              }}
            >
              {/* Header Excel Bar (Yellow #FFF275) */}
              <View
                style={{
                  backgroundColor: '#FFF275',
                  flexDirection: 'row',
                  borderBottomWidth: 1,
                  borderBottomColor: '#E6D759',
                  paddingVertical: 8,
                }}
              >
                <View style={{ width: 85, paddingHorizontal: 8, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '900', color: '#333333', textTransform: 'uppercase' }}>
                    Chỉ số
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#137333' }}>ăn</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#B06000' }}>cf</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#8430CE' }}>nghỉ ngơi</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#1A73E8' }}>vui chơi</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#5F6368' }}>khác</Text>
                </View>
                <View
                  style={{
                    flex: 1.2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#FDE24F',
                    borderLeftWidth: 1,
                    borderLeftColor: '#E6D759',
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '900', color: '#202124' }}>tổng</Text>
                </View>
              </View>

              {/* Hàng 1: Dự định */}
              <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(27,36,32,0.06)', paddingVertical: 7, backgroundColor: '#FAFAFA' }}>
                <View style={{ width: 85, paddingHorizontal: 8, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#5F6368' }}>dự định</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, color: '#3C4043' }}>{(plannedBudget.dining / 1000).toLocaleString('vi-VN')}k</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, color: '#3C4043' }}>{(plannedBudget.cafe / 1000).toLocaleString('vi-VN')}k</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, color: '#3C4043' }}>{(plannedBudget.hotel / 1000).toLocaleString('vi-VN')}k</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, color: '#3C4043' }}>{(plannedBudget.attraction / 1000).toLocaleString('vi-VN')}k</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, color: '#3C4043' }}>{(plannedBudget.other / 1000).toLocaleString('vi-VN')}k</Text>
                </View>
                <View style={{ flex: 1.2, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: 'rgba(27,36,32,0.06)' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#202124' }}>
                    {(plannedBudget.total / 1000).toLocaleString('vi-VN')}k
                  </Text>
                </View>
              </View>

              {/* Hàng 2: Ước tính lịch trình */}
              <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(27,36,32,0.06)', paddingVertical: 7, backgroundColor: '#FFFFFF' }}>
                <View style={{ width: 85, paddingHorizontal: 8, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#1A73E8' }}>ước tính</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: '#202124' }}>
                    {(budgetStats.estimated.dining / 1000).toLocaleString('vi-VN')}k
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: '#202124' }}>
                    {(budgetStats.estimated.cafe / 1000).toLocaleString('vi-VN')}k
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: '#202124' }}>
                    {(budgetStats.estimated.hotel / 1000).toLocaleString('vi-VN')}k
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: '#202124' }}>
                    {(budgetStats.estimated.attraction / 1000).toLocaleString('vi-VN')}k
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: '#202124' }}>
                    {(budgetStats.estimated.other / 1000).toLocaleString('vi-VN')}k
                  </Text>
                </View>
                <View style={{ flex: 1.2, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: 'rgba(27,36,32,0.06)', backgroundColor: '#E8F0FE' }}>
                  <Text style={{ fontSize: 11, fontWeight: '900', color: '#1A73E8' }}>
                    {(budgetStats.estimated.total / 1000).toLocaleString('vi-VN')}k
                  </Text>
                </View>
              </View>

              {/* Hàng 3: Đã dùng (Khách ghi nhận sau khi đi - lúc xếp lịch để trống) */}
              <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(27,36,32,0.06)', paddingVertical: 7, backgroundColor: '#FFFFFF' }}>
                <View style={{ width: 85, paddingHorizontal: 8, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: '#80868B' }}>
                    đã dùng
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, color: '#9AA0A6' }}>-</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, color: '#9AA0A6' }}>-</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, color: '#9AA0A6' }}>-</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, color: '#9AA0A6' }}>-</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 10, color: '#9AA0A6' }}>-</Text>
                </View>
                <View style={{ flex: 1.2, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: 'rgba(27,36,32,0.06)' }}>
                  <Text style={{ fontSize: 9, fontStyle: 'italic', color: '#9AA0A6' }}>
                    Ghi khi đi
                  </Text>
                </View>
              </View>

              {/* Hàng 4: Còn lại (Chênh lệch Dự định - Ước tính) */}
              <View style={{ flexDirection: 'row', paddingVertical: 7, backgroundColor: '#F8F9FA' }}>
                <View style={{ width: 85, paddingHorizontal: 8, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: budgetStats.remaining >= 0 ? '#137333' : '#C5221F' }}>
                    còn lại
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: budgetStats.remainingByCategory.dining >= 0 ? '#137333' : '#C5221F',
                    }}
                  >
                    {(budgetStats.remainingByCategory.dining / 1000).toLocaleString('vi-VN')}k
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: budgetStats.remainingByCategory.cafe >= 0 ? '#137333' : '#C5221F',
                    }}
                  >
                    {(budgetStats.remainingByCategory.cafe / 1000).toLocaleString('vi-VN')}k
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: budgetStats.remainingByCategory.hotel >= 0 ? '#137333' : '#C5221F',
                    }}
                  >
                    {(budgetStats.remainingByCategory.hotel / 1000).toLocaleString('vi-VN')}k
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: budgetStats.remainingByCategory.attraction >= 0 ? '#137333' : '#C5221F',
                    }}
                  >
                    {(budgetStats.remainingByCategory.attraction / 1000).toLocaleString('vi-VN')}k
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: budgetStats.remainingByCategory.other >= 0 ? '#137333' : '#C5221F',
                    }}
                  >
                    {(budgetStats.remainingByCategory.other / 1000).toLocaleString('vi-VN')}k
                  </Text>
                </View>
                <View
                  style={{
                    flex: 1.2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderLeftWidth: 1,
                    borderLeftColor: 'rgba(27,36,32,0.06)',
                    backgroundColor: budgetStats.remaining >= 0 ? '#E6F4EA' : '#FCE8E6',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '900',
                      color: budgetStats.remaining >= 0 ? '#137333' : '#C5221F',
                    }}
                  >
                    {(budgetStats.remaining / 1000).toLocaleString('vi-VN')}k
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* ── FLOATING TOAST THÔNG BÁO TỐI ƯU HÓA LỊCH TRÌNH ── */}
      {toastMsg && (
        <View
          style={{
            position: 'absolute',
            bottom: 28,
            left: 20,
            right: 20,
            alignItems: 'center',
            zIndex: 999999,
            pointerEvents: 'none' as any,
          }}
        >
          <View
            style={{
              backgroundColor: '#1E293B',
              borderRadius: 30,
              paddingVertical: 10,
              paddingHorizontal: 22,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.35,
              shadowRadius: 12,
              elevation: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.15)',
            }}
          >
            <Sparkles size={16} color="#C084FC" />
            <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
              {toastMsg}
            </Text>
          </View>
        </View>
      )}

      {/* ── FLOATING GHOST PREVIEW CARD KHI KÉO THẢ TRÊN WEB DÙNG PORTAL TRÁNH LỆCH TOẠ ĐỘ ── */}
      {Platform.OS === 'web' && pointerDrag && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          style={{
            position: 'fixed',
            left: pointerDrag.currentX - 105,
            top: pointerDrag.currentY - 30,
            width: 210,
            zIndex: 9999999,
            pointerEvents: 'none',
            backgroundColor: '#FFFFFF',
            border: '2px solid #1A73E8',
            borderRadius: 12,
            padding: '8px 12px',
            boxShadow: '0 14px 32px rgba(26,115,232,0.45)',
            transform: 'rotate(2.5deg) scale(1.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            transformOrigin: 'center center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13 }}>📍</span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: '#1B2420',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {pointerDrag.type === 'standby'
                ? (pointerDrag.item as StandbyPlaceItem).name
                : (pointerDrag.item as CalendarEventItem).title}
            </span>
          </div>
          <div style={{ fontSize: 10, color: '#1A73E8', fontWeight: 700 }}>
            {hoveredHourSlot
              ? `👉 Thả vào ${hoveredHourSlot < 10 ? '0' + hoveredHourSlot : hoveredHourSlot}:00`
              : hoveredCartZone
              ? '👉 Thả về Giỏ chờ'
              : hoveredDayTab
              ? `👉 Chuyển sang Ngày ${hoveredDayTab}`
              : 'Kéo đến khung giờ muốn đặt'}
          </div>
        </div>,
        document.body
      )}
    </View>
  );
}
