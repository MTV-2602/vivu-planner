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
  ExternalLink,
  Crown,
  Lock
} from 'lucide-react-native';
import { BRAND_COLORS } from '../../constants';
import { api } from '../../lib/api';
import { supabase } from '../../lib/supabase';
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

export interface ExpenseLogEditHistoryEntry {
  editedAt: string;
  previousAmount?: number;
  previousNote?: string;
  previousPlaceName?: string;
}

export interface ExpenseLogItem {
  id: string;
  timestamp: string;
  dayNumber: number;
  placeId?: string;
  placeName: string;
  category: 'dining' | 'cafe' | 'hotel' | 'attraction' | 'other';
  categoryLabel: string;
  amount: number;
  note: string;
  editHistory?: ExpenseLogEditHistoryEntry[];
  isPendingLocal?: boolean;
  isEdited?: boolean;
}

export function autoClassifyCategory(category?: string, name?: string): {
  key: 'dining' | 'cafe' | 'hotel' | 'attraction' | 'other';
  label: string;
  emoji: string;
} {
  const c = ((category || '') + ' ' + (name || '')).toLowerCase();
  if (
    c.includes('cafe') ||
    c.includes('cà phê') ||
    c.includes('coffee') ||
    c.includes('cf') ||
    c.includes('trà') ||
    c.includes('tea') ||
    c.includes('milktea') ||
    c.includes('trà sữa')
  ) {
    return { key: 'cafe', label: 'Cà phê', emoji: '☕' };
  }
  if (
    c.includes('dining') ||
    c.includes('ăn') ||
    c.includes('food') ||
    c.includes('nhà hàng') ||
    c.includes('quán ăn') ||
    c.includes('phở') ||
    c.includes('bún') ||
    c.includes('chả') ||
    c.includes('lẩu') ||
    c.includes('nướng') ||
    c.includes('bánh') ||
    c.includes('cơm') ||
    c.includes('bữa') ||
    c.includes('ẩm thực') ||
    c.includes('hải sản')
  ) {
    return { key: 'dining', label: 'Ăn uống', emoji: '🍽️' };
  }
  if (
    c.includes('hotel') ||
    c.includes('accommodation') ||
    c.includes('khách sạn') ||
    c.includes('nghỉ') ||
    c.includes('homestay') ||
    c.includes('resort') ||
    c.includes('hostel') ||
    c.includes('dorm') ||
    c.includes('phòng')
  ) {
    return { key: 'hotel', label: 'Nghỉ ngơi', emoji: '🛏️' };
  }
  if (
    c.includes('attraction') ||
    c.includes('experience') ||
    c.includes('chơi') ||
    c.includes('tham quan') ||
    c.includes('vé') ||
    c.includes('tour') ||
    c.includes('di tích') ||
    c.includes('bảo tàng') ||
    c.includes('vui chơi') ||
    c.includes('công viên') ||
    c.includes('phố đi bộ') ||
    c.includes('biển') ||
    c.includes('hồ') ||
    c.includes('cáp treo')
  ) {
    return { key: 'attraction', label: 'Vui chơi', emoji: '🎡' };
  }
  return { key: 'other', label: 'Khác', emoji: '📦' };
}

export const catLabelsMap: Record<string, string> = {
  dining: 'Ăn uống',
  cafe: 'Cà phê',
  hotel: 'Nghỉ ngơi',
  attraction: 'Vui chơi',
  other: 'Khác',
};

export function normalizeExpenseLogItem(raw: any): ExpenseLogItem {
  if (!raw) return raw;
  const category = (raw.category as 'dining' | 'cafe' | 'hotel' | 'attraction' | 'other') || 'other';
  const editHistory = raw.editHistory || (raw.updated_at ? [{ editedAt: raw.updated_at }] : undefined);
  const isEdited = Boolean(raw.isEdited || raw.updated_at || (editHistory && editHistory.length > 0));

  return {
    id: String(raw.id),
    dayNumber: Number(raw.dayNumber || raw.day_number || 1),
    placeName: raw.placeName || raw.place_name || 'Chi phí',
    placeId: raw.placeId || raw.place_id || undefined,
    category,
    categoryLabel: raw.categoryLabel || catLabelsMap[raw.category] || 'Chi tiêu',
    timestamp: raw.timestamp || (raw.created_at ? new Date(raw.created_at).toLocaleString('vi-VN') : new Date().toLocaleString('vi-VN')),
    amount: Number(raw.amount) || 0,
    note: raw.note || '',
    editHistory,
    isEdited,
    isPendingLocal: raw.isPendingLocal,
  };
}

export type CalendarDeltaAction =
  | {
      type: 'move_event';
      eventId: string;
      placeId?: string;
      dayNumber: number;
      startHour: number;
      startMinute: number;
      durationMinutes?: number;
      updated_by?: string;
      timestamp: number;
    }
  | {
      type: 'assign_standby';
      event: CalendarEventItem;
      placeId: string;
      updated_by?: string;
      timestamp: number;
    }
  | {
      type: 'return_standby';
      eventId: string;
      placeId?: string;
      standbyItem: StandbyPlaceItem;
      updated_by?: string;
      timestamp: number;
    }
  | {
      type: 'delete_event';
      eventId: string;
      placeId?: string;
      updated_by?: string;
      timestamp: number;
    };

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
    expense_logs?: any[];
  };
  daysCount?: number;
  initialEvents?: CalendarEventItem[];
  standbyPlaces?: StandbyPlaceItem[];
  onEventsChange?: (events: CalendarEventItem[]) => void;
  onStandbyChange?: (standby: StandbyPlaceItem[]) => void;
  onSave?: (events: CalendarEventItem[], totalCost: number) => void;
  readOnly?: boolean;
  isDetailPage?: boolean;
  isUserPro?: boolean;
  tripId?: string;
  creationMode?: string;
  onUpgradePro?: () => void;
  onOpenManualAdd?: () => void;
  onOpenAiAssistant?: () => void;
  travelerCount?: number;
  isOwner?: boolean;
  canEditBudget?: boolean;
  onlineMembers?: any[];
  onUserAction?: (actionLabel: string, actionType: string, itemTitle?: string, itemId?: string) => void;
  externalPatch?: CalendarEventItem[];
  patchTimestamp?: number;
  lockedItems?: Record<string, string>;
  onBackToCollecting?: () => void;
  onEventDelta?: (delta: CalendarDeltaAction) => void;
  externalDelta?: CalendarDeltaAction | null;
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

const CATEGORY_NAMES_VI: Record<string, string> = {
  dining: 'Ăn uống',
  cafe: 'Cà phê',
  hotel: 'Nghỉ ngơi',
  accommodation: 'Nghỉ ngơi',
  attraction: 'Vui chơi',
  rental: 'Thuê xe',
  transport: 'Di chuyển',
  other: 'Khác',
  default: 'Địa điểm',
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
  isUserPro = true,
  tripId,
  creationMode = 'manual',
  onUpgradePro,
  onOpenManualAdd,
  onOpenAiAssistant,
  travelerCount = 1,
  isOwner = true,
  canEditBudget = true,
  onlineMembers = [],
  onUserAction,
  externalPatch,
  patchTimestamp,
  lockedItems,
  onBackToCollecting,
  onEventDelta,
  externalDelta,
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
      // Chỉ fallback khi demo độc lập / không truyền propStandbyPlaces VÀ là Pro
      if (isUserPro) {
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
      } else {
        stb = [];
      }
    }

    return { evs: [], stb };
  }, [cityName, propDaysCount, initialEvents, propStandbyPlaces, isUserPro]);

  // State sự kiện và giỏ chờ
  const [events, setEvents] = useState<CalendarEventItem[]>(initialData.evs);
  const [standbyList, setStandbyList] = useState<StandbyPlaceItem[]>(initialData.stb);

  // Refs để luôn đọc giá trị mới nhất trong pointer listeners
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const standbyListRef = useRef(standbyList);
  standbyListRef.current = standbyList;
  const activeDayRef = useRef(activeDay);
  activeDayRef.current = activeDay;
  const lockedItemsRef = useRef(lockedItems);
  lockedItemsRef.current = lockedItems;
  const onlineMembersRef = useRef(onlineMembers);
  onlineMembersRef.current = onlineMembers;

  const eventsChangeDebouncerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedEventsChange = (events: CalendarEventItem[]) => {
    if (eventsChangeDebouncerRef.current) clearTimeout(eventsChangeDebouncerRef.current);
    eventsChangeDebouncerRef.current = setTimeout(() => {
      onEventsChange?.(events);
      eventsChangeDebouncerRef.current = null;
    }, 300);
  };

  useEffect(() => {
    return () => {
      if (eventsChangeDebouncerRef.current) {
        clearTimeout(eventsChangeDebouncerRef.current);
      }
    };
  }, []);

  // Đồng bộ props
  useEffect(() => {
    setDaysCount(propDaysCount);
  }, [propDaysCount]);

  useEffect(() => {
    if (initialEvents !== undefined) {
      setEvents((prev) => {
        const getSig = (list: CalendarEventItem[]) =>
          list
            .map(
              (e) =>
                `${e.placeId || e.id}-${e.dayNumber}-${e.startHour}-${e.startMinute}-${e.durationMinutes}-${e.cost}`
            )
            .sort()
            .join('|');
        const currentSig = getSig(prev);
        const newSig = getSig(initialEvents || []);
        if (currentSig === newSig) return prev;
        return initialEvents || [];
      });
    }
  }, [initialEvents]);

  useEffect(() => {
    if (propStandbyPlaces !== undefined) {
      setStandbyList((prev) => {
        const getSig = (list: StandbyPlaceItem[]) =>
          list
            .map((s) => `${s.id}-${s.cost}`)
            .sort()
            .join('|');
        const currentSig = getSig(prev);
        const newSig = getSig(propStandbyPlaces || []);
        if (currentSig === newSig) return prev;
        return propStandbyPlaces || [];
      });
    }
  }, [propStandbyPlaces]);

  // Thông báo thay đổi
  const notifyChanges = (newEvents: CalendarEventItem[], newStandby: StandbyPlaceItem[]) => {
    if (onStandbyChange) onStandbyChange(newStandby);
  };

  // State chọn điểm để gán nhanh (1-click place)
  const [selectedPlaceToPlace, setSelectedPlaceToPlace] = useState<StandbyPlaceItem | null>(null);

  // State toast thông báo kết quả tối ưu
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // State cho tính năng Khám phá thêm địa điểm (Pro)
  const [isExploringMore, setIsExploringMore] = useState(false);
  const [exploreUserInput, setExploreUserInput] = useState('');
  const [showExplorePrompt, setShowExplorePrompt] = useState(false);

  // ── STATE CHI TIÊU THỰC TẾ & NHẬT KÝ THEO TỪNG NGÀY & ĐỊA ĐIỂM ──
  const [expenseLogs, setExpenseLogs] = useState<ExpenseLogItem[]>(() => {
    // 1. Khởi tạo trực tiếp từ budgetBreakdown?.expense_logs từ Server nếu có
    if (Array.isArray(budgetBreakdown?.expense_logs) && budgetBreakdown.expense_logs.length > 0) {
      return budgetBreakdown.expense_logs.map((d: any) => normalizeExpenseLogItem(d));
    }
    // 2. Fallback chỉ theo tripId (TUYỆT ĐỐI không đọc theo cityName)
    if (typeof window !== 'undefined' && window.localStorage && tripId) {
      try {
        const tripSaved = window.localStorage.getItem(`vivu_budget_logs_trip_${tripId}`);
        if (tripSaved) {
          const parsed = JSON.parse(tripSaved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed.map((d: any) => normalizeExpenseLogItem(d));
        }
      } catch (e) {}
    }
    return [];
  });

  // Đồng bộ expenseLogs khi budgetBreakdown?.expense_logs từ server thay đổi
  useEffect(() => {
    if (Array.isArray(budgetBreakdown?.expense_logs)) {
      const serverMapped: ExpenseLogItem[] = budgetBreakdown.expense_logs.map((d: any) => normalizeExpenseLogItem(d));
      setExpenseLogs((prev) => {
        const serverIds = new Set(serverMapped.map((m) => m.id));
        const localPending = prev.filter((p) => !serverIds.has(p.id) && (p as any).isPendingLocal === true);
        return [...localPending, ...serverMapped];
      });
    }
  }, [budgetBreakdown?.expense_logs]);

  // Broadcast thay đổi chi tiêu tới các thành viên khác trong chuyến đi qua Supabase Realtime
  const broadcastExpenseChange = (
    action: 'add' | 'edit' | 'delete' | 'clear',
    log?: ExpenseLogItem,
    logId?: string
  ) => {
    if (!tripId) return;
    try {
      const channel = supabase.channel(`trip-expenses:${tripId}`);
      channel.send({
        type: 'broadcast',
        event: 'expenses_updated',
        payload: { action, log, logId },
      }).catch(() => {});
    } catch (e) {}
  };

  // Lắng nghe broadcast chi tiêu thời gian thực từ các thành viên khác
  useEffect(() => {
    if (!tripId) return;
    const channel = supabase.channel(`trip-expenses:${tripId}`);
    channel
      .on('broadcast', { event: 'expenses_updated' }, (msg: any) => {
        const payload = msg?.payload;
        if (!payload) return;
        if (payload.action === 'add' && payload.log) {
          const mapped = normalizeExpenseLogItem(payload.log);
          setExpenseLogs((prev) => {
            if (prev.some((l) => l.id === mapped.id)) return prev;
            return [mapped, ...prev];
          });
        } else if (payload.action === 'edit' && payload.log) {
          const mapped = normalizeExpenseLogItem(payload.log);
          setExpenseLogs((prev) => prev.map((l) => (l.id === mapped.id ? { ...l, ...mapped } : l)));
        } else if (payload.action === 'delete' && payload.logId) {
          setExpenseLogs((prev) => prev.filter((l) => l.id !== payload.logId));
        } else if (payload.action === 'clear') {
          setExpenseLogs([]);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId]);

  // Load chi tiêu từ DB API khi tripId có (đồng bộ đa người dùng trong chuyến đi)
  useEffect(() => {
    if (!tripId || !isDetailPage) return;
    const catLabelsMap: Record<string, string> = {
      dining: 'Ăn uống',
      cafe: 'Cà phê',
      hotel: 'Nghỉ ngơi',
      attraction: 'Vui chơi',
      other: 'Khác',
    };

    const mapResponse = (data: any[]) => {
      if (!Array.isArray(data)) return [];
      return data.map((d: any) => normalizeExpenseLogItem(d));
    };

    api.get(`/trips/${tripId}/expenses`)
      .then((r: any) => {
        const raw = Array.isArray(r?.data) ? r.data : (Array.isArray(r) ? r : []);
        const mapped = mapResponse(raw);
        if (mapped.length > 0) {
          setExpenseLogs((prev) => {
            const serverIds = new Set(mapped.map((m) => m.id));
            const localOnly = prev.filter((p) => !serverIds.has(p.id) && (p as any).isPendingLocal === true);
            return [...localOnly, ...mapped];
          });
        }
      })
      .catch(() => {
        fetch(`/api/trips/${tripId}/expenses`)
          .then((r) => (r.ok ? r.json() : []))
          .then((raw: any[]) => {
            const mapped = mapResponse(raw);
            if (mapped.length > 0) {
              setExpenseLogs((prev) => {
                const serverIds = new Set(mapped.map((m) => m.id));
                const localOnly = prev.filter((p) => !serverIds.has(p.id) && (p as any).isPendingLocal === true);
                return [...localOnly, ...mapped];
              });
            }
          })
          .catch(() => {});
      });
  }, [tripId, isDetailPage]);

  // Tự động phân loại 5 hạng mục từ nhật ký chi tiêu
  const actualExpenses = useMemo(() => {
    const acc = { dining: 0, cafe: 0, hotel: 0, attraction: 0, other: 0 };
    expenseLogs.forEach((log) => {
      if (acc[log.category] !== undefined) {
        acc[log.category] += Number(log.amount) || 0;
      } else {
        acc.other += Number(log.amount) || 0;
      }
    });
    return acc;
  }, [expenseLogs]);

  // Map chi phí thực tế vào từng sự kiện lịch trình (để hiển thị badge và nút sửa trực tiếp)
  const eventExpenseMap = useMemo(() => {
    const map: Record<string, { total: number; logs: ExpenseLogItem[] }> = {};
    expenseLogs.forEach((log) => {
      if (log.placeId) {
        if (!map[log.placeId]) {
          map[log.placeId] = { total: 0, logs: [] };
        }
        map[log.placeId].total += Number(log.amount) || 0;
        map[log.placeId].logs.push(log);
      }
    });
    return map;
  }, [expenseLogs]);

  // State modal ghi / sửa chi tiêu theo ngày & địa điểm
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [selectedExpenseDay, setSelectedExpenseDay] = useState<number>(1);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string>(''); // eventId hoặc 'custom'
  const [customPlaceName, setCustomPlaceName] = useState<string>('');
  const [manualCategory, setManualCategory] = useState<'dining' | 'cafe' | 'hotel' | 'attraction' | 'other' | null>(null);
  const [expenseAmountInput, setExpenseAmountInput] = useState<string>('');
  const [expenseNoteInput, setExpenseNoteInput] = useState<string>('');
  const [editingLogId, setEditingLogId] = useState<string | null>(null); // null = tạo mới, string = sửa log này

  // Modal xem nhật ký & sửa sai
  const [showExpenseLogModal, setShowExpenseLogModal] = useState<boolean>(false);
  const [filterLogDay, setFilterLogDay] = useState<number | 'all'>('all');

  // Tự động cache logs theo tripId (TUYỆT ĐỐI không lưu theo cityName để tránh lẫn lộn giữa các chuyến đi)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage && tripId) {
      try {
        window.localStorage.setItem(`vivu_budget_logs_trip_${tripId}`, JSON.stringify(expenseLogs));
        window.localStorage.setItem(`vivu_budget_actual_trip_${tripId}`, JSON.stringify(actualExpenses));
      } catch (e) {}
    }
  }, [expenseLogs, actualExpenses, tripId]);

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

  const pendingPatchRef = useRef<{ events: CalendarEventItem[]; timestamp: number } | null>(null);

  // ── GRANULAR REALTIME DELTA SYNC ──
  useEffect(() => {
    if (!externalDelta) return;
    if (externalDelta.type === 'move_event') {
      const { eventId, placeId, dayNumber, startHour, startMinute, durationMinutes } = externalDelta;
      setEvents((prev) => {
        const next = prev.map((ev) => {
          const match =
            ev.id === eventId ||
            (placeId && (ev.placeId === placeId || ev.id === `ev-${placeId}`));
          if (match) {
            return {
              ...ev,
              dayNumber,
              startHour,
              startMinute: startMinute !== undefined ? startMinute : ev.startMinute,
              durationMinutes: durationMinutes || ev.durationMinutes,
            };
          }
          return ev;
        });
        eventsRef.current = next;
        return next;
      });
    } else if (externalDelta.type === 'assign_standby') {
      const { event, placeId } = externalDelta;
      setEvents((prev) => {
        const exists = prev.some(
          (e) => e.id === event.id || (placeId && (e.placeId === placeId || e.id === `ev-${placeId}`))
        );
        if (exists) return prev;
        const next = [...prev, event];
        eventsRef.current = next;
        return next;
      });
      setStandbyList((prev) => {
        const next = prev.filter((s) => s.id !== placeId && s.id !== event.placeId);
        standbyListRef.current = next;
        return next;
      });
    } else if (externalDelta.type === 'return_standby') {
      const { eventId, placeId, standbyItem } = externalDelta;
      setEvents((prev) => {
        const next = prev.filter((e) => e.id !== eventId && (!placeId || e.placeId !== placeId));
        eventsRef.current = next;
        return next;
      });
      setStandbyList((prev) => {
        const exists = prev.some((s) => s.id === standbyItem.id || (placeId && s.id === placeId));
        if (exists) return prev;
        const next = [...prev, standbyItem];
        standbyListRef.current = next;
        return next;
      });
    } else if (externalDelta.type === 'delete_event') {
      const { eventId, placeId } = externalDelta;
      setEvents((prev) => {
        const next = prev.filter((e) => e.id !== eventId && (!placeId || e.placeId !== placeId));
        eventsRef.current = next;
        return next;
      });
    }
  }, [externalDelta]);

  // ── SMART CONCURRENT RECONCILIATION FOR EXTERNAL FULL PATCH ──
  useEffect(() => {
    if (externalPatch && externalPatch.length > 0 && patchTimestamp) {
      console.log('[ViVu Workspace] Applying externalPatch, events count:', externalPatch.length, 'isDragging:', !!pointerDragRef.current);
      if (!pointerDragRef.current) {
        setEvents((prev) => {
          if (!prev || prev.length === 0) {
            eventsRef.current = externalPatch;
            return externalPatch;
          }
          const incomingMap = new Map(externalPatch.map((e) => [e.placeId || e.id, e]));
          const next = prev.map((ev) => {
            const key = ev.placeId || ev.id;
            const incoming = incomingMap.get(key);
            if (!incoming) return ev;
            incomingMap.delete(key);
            if (
              incoming.dayNumber !== ev.dayNumber ||
              incoming.startHour !== ev.startHour ||
              incoming.startMinute !== ev.startMinute
            ) {
              return {
                ...ev,
                dayNumber: incoming.dayNumber,
                startHour: incoming.startHour,
                startMinute: incoming.startMinute,
                durationMinutes: incoming.durationMinutes || ev.durationMinutes,
              };
            }
            return ev;
          });
          for (const newEv of incomingMap.values()) {
            next.push(newEv);
          }
          eventsRef.current = next;
          return next;
        });
        pendingPatchRef.current = null;
      } else {
        // Lưu lại để apply sau khi thả
        pendingPatchRef.current = { events: externalPatch, timestamp: patchTimestamp };
      }
    }
  }, [patchTimestamp, externalPatch]);

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
      } else if (
        c === 'cafe' || c === 'coffee' ||
        c.includes('cà phê') || c.includes('cafe') || c.includes('coffee') || c.includes('cf') || c.includes('trà') ||
        (ev.title || '').toLowerCase().includes('cà phê') ||
        (ev.title || '').toLowerCase().includes('cafe') ||
        (ev.title || '').toLowerCase().includes('coffee')
      ) {
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

  // Tổng tiền thực tế đã dùng từ 5 hạng mục
  const totalActual = useMemo(() => {
    return (
      (actualExpenses.dining || 0) +
      (actualExpenses.cafe || 0) +
      (actualExpenses.hotel || 0) +
      (actualExpenses.attraction || 0) +
      (actualExpenses.other || 0)
    );
  }, [actualExpenses]);

  // Số tiền còn lại: tính theo số thực tế đã dùng (nếu có chi tiêu thực tế), hoặc theo dự toán ước tính
  const effectiveRemaining = useMemo(() => {
    if (totalActual > 0) {
      return {
        isActual: true,
        dining: plannedBudget.dining - (actualExpenses.dining || 0),
        cafe: plannedBudget.cafe - (actualExpenses.cafe || 0),
        hotel: plannedBudget.hotel - (actualExpenses.hotel || 0),
        attraction: plannedBudget.attraction - (actualExpenses.attraction || 0),
        other: plannedBudget.other - (actualExpenses.other || 0),
        total: plannedBudget.total - totalActual,
      };
    }
    return {
      isActual: false,
      dining: budgetStats.remainingByCategory.dining,
      cafe: budgetStats.remainingByCategory.cafe,
      hotel: budgetStats.remainingByCategory.hotel,
      attraction: budgetStats.remainingByCategory.attraction,
      other: budgetStats.remainingByCategory.other,
      total: budgetStats.remaining,
    };
  }, [totalActual, plannedBudget, actualExpenses, budgetStats]);

  // Mở modal thêm chi tiêu cho một ngày cụ thể (hoặc một sự kiện cụ thể)
  const openAddExpenseModal = (
    day?: number,
    preselectedEventId?: string,
    defaultCategory?: 'dining' | 'cafe' | 'hotel' | 'attraction' | 'other'
  ) => {
    if (canEditBudget === false) return;
    const targetDay = day || activeDay;
    setSelectedExpenseDay(targetDay);
    setEditingLogId(null);

    const dayEvs = events.filter((e) => Number(e.dayNumber) === Number(targetDay));
    if (preselectedEventId) {
      const ev = dayEvs.find((e) => e.id === preselectedEventId);
      if (ev) {
        setSelectedPlaceId(ev.id);
        setCustomPlaceName(ev.title);
        setExpenseAmountInput(ev.cost ? String(ev.cost) : '');
        const autoCat = autoClassifyCategory(ev.category, ev.title);
        setManualCategory(autoCat.key);
      } else {
        setSelectedPlaceId('custom');
        setCustomPlaceName('');
        setExpenseAmountInput('');
        setManualCategory(defaultCategory || 'dining');
      }
    } else if (dayEvs.length > 0) {
      const match = defaultCategory
        ? dayEvs.find((e) => autoClassifyCategory(e.category, e.title).key === defaultCategory) || dayEvs[0]
        : dayEvs[0];
      setSelectedPlaceId(match.id);
      setCustomPlaceName(match.title);
      setExpenseAmountInput(match.cost ? String(match.cost) : '');
      const autoCat = autoClassifyCategory(match.category, match.title);
      setManualCategory(autoCat.key);
    } else {
      setSelectedPlaceId('custom');
      setCustomPlaceName('');
      setExpenseAmountInput('');
      setManualCategory(defaultCategory || 'dining');
    }

    setExpenseNoteInput('');
    setExpenseModalOpen(true);
  };

  // Mở modal sửa một bản ghi chi tiêu đã có (thích sửa lúc nào cũng được!)
  const openEditExpenseLog = (log: ExpenseLogItem) => {
    if (canEditBudget === false) return;
    setEditingLogId(log.id);
    setSelectedExpenseDay(log.dayNumber || 1);
    setSelectedPlaceId(log.placeId || 'custom');
    setCustomPlaceName(log.placeName);
    setManualCategory(log.category);
    setExpenseAmountInput(String(log.amount));
    setExpenseNoteInput(log.note);
    setExpenseModalOpen(true);
    setShowExpenseLogModal(false);
  };

  // Đổi ngày trong modal -> tự động cập nhật danh sách địa điểm của ngày đó
  const handleChangeExpenseDayInModal = (newDay: number) => {
    setSelectedExpenseDay(newDay);
    const dayEvs = events.filter((e) => Number(e.dayNumber) === Number(newDay));
    if (dayEvs.length > 0) {
      const first = dayEvs[0];
      setSelectedPlaceId(first.id);
      setCustomPlaceName(first.title);
      const autoCat = autoClassifyCategory(first.category, first.title);
      setManualCategory(autoCat.key);
      setExpenseAmountInput(first.cost ? String(first.cost) : '');
    } else {
      setSelectedPlaceId('custom');
      setCustomPlaceName('');
      setManualCategory('dining');
      setExpenseAmountInput('');
    }
  };

  // Chọn địa điểm trong ngày đó -> TỰ ĐỘNG PHÂN LOẠI
  const handleSelectPlaceInModal = (placeId: string) => {
    setSelectedPlaceId(placeId);
    if (placeId === 'custom') {
      setCustomPlaceName('');
      setManualCategory('other');
    } else {
      const ev = events.find((e) => e.id === placeId);
      if (ev) {
        setCustomPlaceName(ev.title);
        const autoCat = autoClassifyCategory(ev.category, ev.title);
        setManualCategory(autoCat.key);
        if (!expenseAmountInput && ev.cost) {
          setExpenseAmountInput(String(ev.cost));
        }
      }
    }
  };

  // Lưu chi tiêu (thêm mới hoặc cập nhật bản ghi đang sửa)
  const handleSaveExpense = () => {
    if (canEditBudget === false) return;
    const num = parseInt(expenseAmountInput.replace(/\D/g, ''), 10) || 0;
    if (num <= 0) {
      setToastMsg('Vui lòng nhập số tiền chi tiêu hợp lệ (> 0đ)');
      setTimeout(() => setToastMsg(null), 3000);
      return;
    }

    let placeTitle = '';
    let categoryKey: 'dining' | 'cafe' | 'hotel' | 'attraction' | 'other' = 'dining';

    if (selectedPlaceId && selectedPlaceId !== 'custom') {
      const ev = events.find((e) => e.id === selectedPlaceId);
      if (ev) {
        placeTitle = ev.title;
        categoryKey = manualCategory || autoClassifyCategory(ev.category, ev.title).key;
      } else {
        placeTitle = customPlaceName.trim() || 'Chi phí ngoài lịch';
        categoryKey = manualCategory || 'other';
      }
    } else {
      placeTitle = customPlaceName.trim() || 'Chi phí ngoài lịch';
      categoryKey = manualCategory || autoClassifyCategory(undefined, placeTitle).key;
    }

    const catLabels: Record<string, string> = {
      dining: 'Ăn uống',
      cafe: 'Cà phê',
      hotel: 'Nghỉ ngơi',
      attraction: 'Vui chơi',
      other: 'Khác',
    };

    const now = new Date();
    const timeStr = `${now.getHours() < 10 ? '0' + now.getHours() : now.getHours()}:${now.getMinutes() < 10 ? '0' + now.getMinutes() : now.getMinutes()} ${now.getDate()}/${now.getMonth() + 1}`;

    if (editingLogId) {
      // Cập nhật bản ghi có sẵn (thích sửa lúc nào cũng được)
      const currentEditing = expenseLogs.find((l) => l.id === editingLogId);
      const oldEntry: ExpenseLogEditHistoryEntry = {
        editedAt: new Date().toISOString(),
        previousAmount: currentEditing ? currentEditing.amount : num,
        previousNote: currentEditing ? currentEditing.note : '',
        previousPlaceName: currentEditing ? currentEditing.placeName : placeTitle,
      };
      const updatedLog: ExpenseLogItem = {
        id: editingLogId,
        dayNumber: selectedExpenseDay,
        placeId: selectedPlaceId !== 'custom' ? selectedPlaceId : undefined,
        placeName: placeTitle,
        category: categoryKey,
        categoryLabel: catLabels[categoryKey] || 'Chi tiêu',
        amount: num,
        note: expenseNoteInput.trim() || `Chi tiêu tại ${placeTitle}`,
        timestamp: timeStr,
        editHistory: currentEditing ? [...(currentEditing.editHistory || []), oldEntry] : [oldEntry],
        isEdited: true,
      };

      // 1. CẬP NHẬT OPTIMISTIC STATE NGAY LẬP TỨC
      setExpenseLogs((prev) => prev.map((l) => (l.id === editingLogId ? updatedLog : l)));
      setToastMsg(`✓ Đã cập nhật chi tiêu "${placeTitle}" thành ${(num / 1000).toLocaleString('vi-VN')}k!`);

      // 2. Broadcast realtime tới các thành viên khác trong chuyến đi
      broadcastExpenseChange('edit', updatedLog);

      // 3. Đồng bộ API ngầm nếu đang trong chi tiết chuyến đi
      if (tripId && isDetailPage) {
        api.put(`/trips/${tripId}/expenses/${editingLogId}`, {
          place_name: placeTitle,
          category: categoryKey,
          amount: num,
          note: expenseNoteInput.trim() || `Chi tiêu tại ${placeTitle}`,
          day_number: selectedExpenseDay,
          place_id: selectedPlaceId !== 'custom' ? selectedPlaceId : null,
        }).catch((err) => {
          console.warn('[ViVu Expense] Error updating expense log:', err);
        });
      }
    } else {
      // Thêm mới khoản chi tiêu
      const tempId = `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newLog: ExpenseLogItem = {
        id: tempId,
        timestamp: timeStr,
        dayNumber: selectedExpenseDay,
        placeId: selectedPlaceId !== 'custom' ? selectedPlaceId : undefined,
        placeName: placeTitle,
        category: categoryKey,
        categoryLabel: catLabels[categoryKey] || 'Chi tiêu',
        amount: num,
        note: expenseNoteInput.trim() || `Chi tiêu tại ${placeTitle}`,
      };
      (newLog as any).isPendingLocal = true;

      // 1. CẬP NHẬT OPTIMISTIC STATE NGAY LẬP TỨC — BẢNG & MODAL CẬP NHẬT TỨC THÌ!
      setExpenseLogs((prev) => [newLog, ...prev]);
      setToastMsg(`✓ Đã ghi Ngày ${selectedExpenseDay}: "${placeTitle}" +${(num / 1000).toLocaleString('vi-VN')}k [${catLabels[categoryKey]}]!`);

      // 2. Bắn realtime broadcast qua Supabase channel
      broadcastExpenseChange('add', newLog);
      onUserAction?.('đã ghi chi tiêu', 'record_expense', placeTitle, tempId);

      // 3. Gửi API lưu vào cơ sở dữ liệu ngầm (không chặn giao diện, không làm mất state)
      if (tripId && isDetailPage) {
        const payload = {
          id: tempId,
          place_name: placeTitle,
          category: categoryKey,
          amount: num,
          note: expenseNoteInput.trim() || `Chi tiêu tại ${placeTitle}`,
          day_number: selectedExpenseDay,
          place_id: selectedPlaceId !== 'custom' ? selectedPlaceId : null,
        };

        api.post(`/trips/${tripId}/expenses`, payload)
          .then((res: any) => {
            const serverLog = res?.data;
            if (serverLog?.id) {
              setExpenseLogs((prev) => prev.map((l) => (l.id === tempId ? { ...l, id: String(serverLog.id) } : l)));
            }
          })
          .catch(() => {
            fetch(`/api/trips/${tripId}/expenses`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
              .then((r) => (r.ok ? r.json() : null))
              .then((serverLog) => {
                if (serverLog?.id) {
                  setExpenseLogs((prev) => prev.map((l) => (l.id === tempId ? { ...l, id: String(serverLog.id) } : l)));
                }
              })
              .catch(() => {});
          });
      }
    }

    setTimeout(() => setToastMsg(null), 3500);
    setExpenseModalOpen(false);
    setEditingLogId(null);
  };

  // Hàm xóa một bản ghi chi tiêu khi phát hiện ghi sai
  const handleDeleteLog = (logId: string) => {
    if (canEditBudget === false) return;
    const target = expenseLogs.find((l) => l.id === logId);
    if (!target) return;

    // 1. CẬP NHẬT OPTIMISTIC STATE XÓA NGAY LẬP TỨC
    setExpenseLogs((prev) => prev.filter((l) => l.id !== logId));
    setToastMsg(`✓ Đã xóa ghi chép "${target.placeName}" và hoàn lại ${(target.amount / 1000).toLocaleString('vi-VN')}k!`);
    setTimeout(() => setToastMsg(null), 3500);

    // 2. Broadcast realtime
    broadcastExpenseChange('delete', undefined, logId);

    // 3. API xóa trên database
    if (tripId && isDetailPage) {
      api.delete(`/trips/${tripId}/expenses/${logId}`).catch(() => {
        fetch(`/api/trips/${tripId}/expenses/${logId}`, { method: 'DELETE' }).catch(() => {});
      });
    }
  };

  // Hàm xóa sạch toàn bộ lịch sử chi tiêu
  const handleClearAllLogs = () => {
    if (canEditBudget === false) return;
    setExpenseLogs([]);
    setToastMsg('✓ Đã xóa sạch toàn bộ lịch sử chi tiêu đã dùng!');
    setTimeout(() => setToastMsg(null), 3000);
    broadcastExpenseChange('clear');
    if (tripId && isDetailPage) {
      api.delete(`/trips/${tripId}/expenses`).catch(() => {});
    }
  };

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
      const n = (p.name || '').toLowerCase();
      return (
        c === 'hotel' ||
        c === 'accommodation' ||
        c.includes('khách sạn') ||
        c.includes('nghỉ') ||
        c.includes('homestay') ||
        c.includes('resort') ||
        n.includes('khách sạn') ||
        n.includes('hotel') ||
        n.includes('homestay') ||
        n.includes('resort')
      );
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
    const normalTimeSlots = [
      { hour: 8, minute: 0, dur: 90 },   // 08:00 (Cà phê / Đi dạo)
      { hour: 10, minute: 0, dur: 90 },  // 10:00 (Tham quan / Di tích)
      { hour: 12, minute: 0, dur: 90 },  // 12:00 (Ẩm thực đặc sản)
      { hour: 14, minute: 30, dur: 90 }, // 14:30 (Vui chơi / Trải nghiệm)
      { hour: 16, minute: 30, dur: 90 }, // 16:30 (Check-in / Cafe view)
      { hour: 18, minute: 30, dur: 90 }, // 18:30 (Ăn tối / Phố ẩm thực)
      { hour: 20, minute: 30, dur: 75 }, // 20:30 (Chợ đêm / Dạo phố)
    ];

    // Ngày 1 nếu có accommodation thì slot 14:00 - 15:00 đã có khách sạn, các slot trống còn lại:
    const day1TimeSlotsWithHotel = [
      { hour: 8, minute: 0, dur: 90 },   // 08:00 (Cà phê / Đi dạo)
      { hour: 10, minute: 0, dur: 90 },  // 10:00 (Tham quan / Di tích)
      { hour: 12, minute: 0, dur: 90 },  // 12:00 (Ẩm thực đặc sản)
      { hour: 16, minute: 0, dur: 90 },  // 16:00 (Vui chơi / Chiều sau check-in)
      { hour: 18, minute: 30, dur: 90 }, // 18:30 (Ăn tối / Phố ẩm thực)
      { hour: 20, minute: 30, dur: 75 }, // 20:30 (Chợ đêm / Dạo phố)
    ];

    const newEvents: CalendarEventItem[] = [];
    const totalDays = Math.max(1, daysCount);

    // 1. Luôn xếp accommodation vào slot 14:00 Ngày 1 (dayIndex=0, dayNumber=1) TRƯỚC KHI xếp các hoạt động khác
    const nightsCount = Math.max(1, totalDays - 1);
    if (hotels.length > 0) {
      hotels.forEach((h, hIdx) => {
        newEvents.push({
          id: `ev-hotel-${h.id}-${Date.now()}-${hIdx}`,
          placeId: h.id,
          title: h.name,
          category: 'hotel',
          address: h.address,
          lat: h.lat,
          lng: h.lng,
          cost: (Number(h.cost) || 0) * nightsCount,
          dayNumber: 1,
          startHour: 14,
          startMinute: 0,
          durationMinutes: 60,
          notes: 'Nhận phòng khách sạn & cất hành lý',
        });
      });
    }

    // 2. Sau đó xếp các items còn lại vào các slots còn trống
    ordered.forEach((p, idx) => {
      const targetDay = (idx % totalDays) + 1;
      const dayOrder = Math.floor(idx / totalDays);
      const slotsForDay = (hotels.length > 0 && targetDay === 1) ? day1TimeSlotsWithHotel : normalTimeSlots;
      const slot = slotsForDay[dayOrder % slotsForDay.length] || { hour: 8 + (dayOrder * 2) % 12, minute: 0, dur: 90 };

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
  const addPlaceToCalendar = (place: StandbyPlaceItem, targetHour?: number, immediate: boolean = false) => {
    // Cảnh báo nếu thêm accommodation khi đã có chỗ ở trong lịch
    const isAccommodation = (cat: string) => {
      const c = (cat || '').toLowerCase();
      return c === 'hotel' || c === 'accommodation' || c.includes('khách sạn') || c.includes('nghỉ') || c.includes('homestay') || c.includes('resort');
    };
    if (isAccommodation(place.category)) {
      const existingAccommodation = eventsRef.current.some((ev) => isAccommodation(ev.category));
      if (existingAccommodation) {
        setToastMsg('⚠️ Lịch đã có chỗ ở rồi! Bạn có chắc muốn thêm nơi ở thứ 2?');
        setTimeout(() => setToastMsg(null), 4000);
        // Vẫn tiếp tục thêm nhưng đã cảnh báo user
      }
    }

    let hour = targetHour;
    if (hour === undefined) {
      const usedHours = new Set(
        eventsRef.current
          .filter((ev) => Number(ev.dayNumber) === Number(activeDayRef.current))
          .map((e) => e.startHour)
      );
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
      dayNumber: activeDayRef.current,
      startHour: Number(hour),
      startMinute: 0,
      durationMinutes: place.suggestedDuration || 90,
    };

    const nextEvents = [...eventsRef.current, newEvent];
    const nextStandby = standbyListRef.current.filter((s) => s.id !== place.id);

    setEvents(nextEvents);
    eventsRef.current = nextEvents;
    if (immediate) {
      if (eventsChangeDebouncerRef.current) clearTimeout(eventsChangeDebouncerRef.current);
      eventsChangeDebouncerRef.current = null;
      onEventsChange?.(nextEvents);
    } else {
      debouncedEventsChange(nextEvents);
    }
    setStandbyList(nextStandby);
    standbyListRef.current = nextStandby;
    setSelectedPlaceToPlace(null);
    notifyChanges(nextEvents, nextStandby);
    onEventDelta?.({
      type: 'assign_standby',
      event: newEvent,
      placeId: place.id,
      timestamp: Date.now(),
    });
    onUserAction?.(`đã thêm "${place.name}"`, 'add_item', place.name, place.id);
  };

  // Trả sự kiện từ lịch về giỏ chờ
  const removeEventToStandby = (eventId: string, immediate: boolean = false) => {
    const ev = eventsRef.current.find((e) => e.id === eventId);
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

    const nextEvents = eventsRef.current.filter((e) => e.id !== eventId);
    const nextStandby = [...standbyListRef.current, returnItem];

    setEvents(nextEvents);
    eventsRef.current = nextEvents;
    if (immediate) {
      if (eventsChangeDebouncerRef.current) clearTimeout(eventsChangeDebouncerRef.current);
      eventsChangeDebouncerRef.current = null;
      onEventsChange?.(nextEvents);
    } else {
      debouncedEventsChange(nextEvents);
    }
    setStandbyList(nextStandby);
    standbyListRef.current = nextStandby;
    notifyChanges(nextEvents, nextStandby);
    onEventDelta?.({
      type: 'return_standby',
      eventId,
      placeId: ev.placeId,
      standbyItem: returnItem,
      timestamp: Date.now(),
    });
    onUserAction?.(`đã xóa "${ev.title}"`, 'delete_item', ev.title, ev.id);
  };

  // Thêm nhanh địa điểm từ giỏ chờ vào ngày được chọn
  const handleQuickAddStandbyToDay = (item: StandbyPlaceItem, targetDay: number) => {
    if (readOnly) return;
    const dayEvents = eventsRef.current.filter((e) => e.dayNumber === targetDay);
    const occupiedHours = new Set(dayEvents.map((e) => e.startHour));
    const candidateHours = [8, 10, 12, 14, 16, 18, 20];
    let targetHour = candidateHours.find((h) => !occupiedHours.has(h));
    if (!targetHour) {
      for (let h = 7; h <= 21; h++) {
        if (!occupiedHours.has(h)) {
          targetHour = h;
          break;
        }
      }
    }
    if (!targetHour) targetHour = 8;
    addPlaceToCalendar(item, targetHour, true);
    setToastMsg(`✓ Đã xếp "${item.name}" vào Ngày ${targetDay} lúc ${targetHour < 10 ? '0' + targetHour : targetHour}:00!`);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Đổi giờ bắt đầu của sự kiện
  const moveEventHour = (eventId: string, deltaHours: number) => {
    let movedTitle = 'Hoạt động';
    let changedEvent: CalendarEventItem | undefined;
    const nextEvents = eventsRef.current.map((ev) => {
      if (ev.id === eventId) {
        movedTitle = ev.title;
        const newHour = Math.max(7, Math.min(21, ev.startHour + deltaHours));
        const updated = { ...ev, startHour: newHour };
        changedEvent = updated;
        return updated;
      }
      return ev;
    });
    setEvents(nextEvents);
    eventsRef.current = nextEvents;
    debouncedEventsChange(nextEvents);
    notifyChanges(nextEvents, standbyListRef.current);
    if (changedEvent) {
      onEventDelta?.({
        type: 'move_event',
        eventId: (changedEvent as any).id,
        placeId: (changedEvent as any).placeId,
        dayNumber: (changedEvent as any).dayNumber,
        startHour: (changedEvent as any).startHour,
        startMinute: (changedEvent as any).startMinute,
        durationMinutes: (changedEvent as any).durationMinutes,
        timestamp: Date.now(),
      });
    }
    onUserAction?.(`đang di chuyển "${movedTitle}"`, 'drag_item', movedTitle, eventId);
  };

  // Tải thêm địa điểm gợi ý vào giỏ chờ cho Pro user
  const handleLoadMoreStandbyPlaces = async () => {
    if (!isUserPro) return;
    // Hiện prompt hỏi user muốn gì trước
    setShowExplorePrompt(true);
  };

  const handleExploreMore = async (userRequest?: string) => {
    setShowExplorePrompt(false);
    setIsExploringMore(true);
    try {
      // Gọi AI để lấy gợi ý phù hợp
      const currentStandbyIds = new Set(standbyList.map((s) => s.id));
      const currentEventTitles = new Set(events.map((e) => (e.title || '').toLowerCase().trim()));

      // Build current itinerary snapshot để gửi AI
      const itinerarySnapshot = {
        days: Array.from({ length: daysCount }, (_, i) => ({
          day_number: i + 1,
          items: events
            .filter((e) => e.dayNumber === i + 1)
            .map((e) => ({ title: e.title, item_type: e.category || 'attraction' }))
        }))
      };

      // Thử gọi AI API
      try {
        if (tripId) {
          const resp = await fetch(`/api/trips/${tripId}/explore-more`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              currentItinerary: itinerarySnapshot,
              standbyList: standbyList.map((s) => ({ id: s.id, name: s.name })),
              userRequest: userRequest || 'Gợi ý thêm địa điểm hay'
            })
          });
          if (resp.ok) {
            const data = await resp.json();
            const newPlaces = (data.places || []).filter(
              (p: any) => !currentStandbyIds.has(p.id) && !currentEventTitles.has((p.name || '').toLowerCase().trim())
            );
            if (newPlaces.length > 0) {
              const nextStandby = [...standbyList, ...newPlaces];
              setStandbyList(nextStandby);
              notifyChanges(events, nextStandby);
              setToastMsg(`✓ AI gợi ý thêm ${newPlaces.length} địa điểm vào Giỏ chờ!`);
              setTimeout(() => setToastMsg(null), 3500);
              setIsExploringMore(false);
              return;
            }
          }
        }
      } catch (apiErr) {
        console.warn('[exploreMore] API call failed, fallback to curated', apiErr);
      }

      // Fallback: dùng curated places (logic cũ)
      const cityPlaces = getCuratedPlacesForCity(cityName);
      const more = cityPlaces
        .filter((p) => !currentEventTitles.has((p.name || '').toLowerCase().trim()) && !currentStandbyIds.has(p.id))
        .map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          address: p.address,
          lat: p.lat,
          lng: p.lng,
          cost: p.estimated_cost || 50000,
          suggestedDuration: 90,
        }));
      if (more.length > 0) {
        const nextStandby = [...standbyList, ...more];
        setStandbyList(nextStandby);
        notifyChanges(events, nextStandby);
        setToastMsg(`✓ Đã nạp thêm ${more.length} địa điểm gợi ý vào Giỏ chờ!`);
        setTimeout(() => setToastMsg(null), 3000);
      } else {
        setToastMsg('ℹ️ Tất cả các địa điểm gợi ý đã có trong lịch hoặc giỏ!');
        setTimeout(() => setToastMsg(null), 3000);
      }
    } finally {
      setIsExploringMore(false);
    }
  };

  // ── XỬ LÝ REAL POINTER DRAG & DROP TRÊN WEB ──
  const handleStartPointerDrag = (
    item: StandbyPlaceItem | CalendarEventItem,
    type: 'event' | 'standby',
    e: any
  ) => {
    if (readOnly) return;
    const itemTitle = (item as any).title || (item as any).name || 'Hoạt động';
    const currentLocked = lockedItemsRef.current || lockedItems;
    const lockUserId = currentLocked && (
      currentLocked[item.id] ||
      (item.id ? currentLocked[String(item.id)] : null) ||
      ((item as any).item_id ? currentLocked[(item as any).item_id] : null) ||
      ((item as any).item_id ? currentLocked[String((item as any).item_id)] : null) ||
      currentLocked[itemTitle] ||
      ((item as any).title ? currentLocked[(item as any).title] : null) ||
      ((item as any).name ? currentLocked[(item as any).name] : null)
    );
    if (lockUserId) {
      const members = onlineMembersRef.current || onlineMembers;
      const lockUserName = members?.find((m: any) => m.user_id === lockUserId)?.display_name || 'Thành viên khác';
      setToastMsg(`🔒 "${itemTitle}" đang được ${lockUserName} giữ!`);
      setTimeout(() => setToastMsg(null), 3000);
      return;
    }
    if (type === 'standby' && !isUserPro) {
      if (onUpgradePro) onUpgradePro();
      setToastMsg('🔒 Tính năng Khay Giỏ Hàng dành riêng cho thành viên Gói PRO!');
      setTimeout(() => setToastMsg(null), 3000);
      return;
    }
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

    // Broadcast lock
    onUserAction?.(`đang kéo "${itemTitle}"`, 'drag_item', itemTitle, item.id);

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
    }
  };

  // Global Pointer / Mouse Move & Up Listeners
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const findTargetHourFromPoint = (x: number, y: number): number | null => {
      if (typeof document === 'undefined') return null;
      const elem = document.elementFromPoint(x, y);
      if (!elem) return null;

      const hourEl = elem.closest('[data-hour], [data-hour-row], [data-testid*="calendar-hour-row-"]');
      if (hourEl) {
        const dh = hourEl.getAttribute('data-hour');
        if (dh) {
          const val = parseInt(dh, 10);
          if (!isNaN(val)) return val;
        }
        const tid = hourEl.getAttribute('data-testid') || '';
        const m = tid.match(/calendar-hour-row-(\d+)/);
        if (m) {
          const val = parseInt(m[1], 10);
          if (!isNaN(val)) return val;
        }
      }

      // Fallback: nếu trúng trong vùng khung giờ calendar
      const gridEl = elem.closest('[data-calendar-grid], [data-testid="calendar-time-grid"]');
      if (gridEl) {
        const rows = gridEl.querySelectorAll('[data-testid*="calendar-hour-row-"]');
        for (let i = 0; i < rows.length; i++) {
          const rect = rows[i].getBoundingClientRect();
          if (y >= rect.top && y <= rect.bottom) {
            const tid = rows[i].getAttribute('data-testid') || '';
            const m = tid.match(/calendar-hour-row-(\d+)/);
            if (m) return parseInt(m[1], 10);
          }
        }
      }
      return null;
    };

    const handleGlobalPointerMove = (e: MouseEvent | TouchEvent) => {
      if (!pointerDragRef.current) return;
      const clientX = 'clientX' in e ? e.clientX : e.touches[0]?.clientX || 0;
      const clientY = 'clientY' in e ? e.clientY : e.touches[0]?.clientY || 0;

      setPointerDrag((prev) => (prev ? { ...prev, currentX: clientX, currentY: clientY } : null));

      const elem = document.elementFromPoint(clientX, clientY);
      const targetHour = findTargetHourFromPoint(clientX, clientY);
      setHoveredHourSlot(targetHour);

      const cartEl = elem?.closest('[data-cart-dropzone], [data-testid="cart-dropzone"]');
      setHoveredCartZone(!!cartEl);

      const dayEl = elem?.closest('[data-day-tab], [data-testid*="tab-day-"]');
      if (dayEl) {
        const dStr = dayEl.getAttribute('data-day-tab');
        if (dStr) {
          const d = parseInt(dStr, 10);
          if (!isNaN(d)) setHoveredDayTab(d);
        } else {
          const tid = dayEl.getAttribute('data-testid') || '';
          const m = tid.match(/tab-day-(\d+)/);
          if (m) setHoveredDayTab(parseInt(m[1], 10));
        }
      } else {
        setHoveredDayTab(null);
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
      const targetHour = findTargetHourFromPoint(clientX, clientY);
      const cartEl = elem?.closest('[data-cart-dropzone], [data-testid="cart-dropzone"]');
      const dayEl = elem?.closest('[data-day-tab], [data-testid*="tab-day-"]');

      if (targetHour !== null && !isNaN(targetHour)) {
        if (cur.type === 'standby') {
          const standbyItem =
            standbyListRef.current.find((s) => s.id === cur.id) || (cur.item as StandbyPlaceItem);
          if (standbyItem) {
            addPlaceToCalendar(standbyItem, targetHour, true);
            setToastMsg(`✓ Đã đặt "${standbyItem.name}" vào ${targetHour < 10 ? '0' + targetHour : targetHour}:00!`);
            setTimeout(() => setToastMsg(null), 3000);
          }
        } else if (cur.type === 'event') {
          const nextEvents = eventsRef.current.map((ev) =>
            ev.id === cur.id ? { ...ev, startHour: targetHour, dayNumber: activeDayRef.current } : ev
          );
          setEvents(nextEvents);
          eventsRef.current = nextEvents;
          if (eventsChangeDebouncerRef.current) {
            clearTimeout(eventsChangeDebouncerRef.current);
            eventsChangeDebouncerRef.current = null;
          }
          const movedEv = nextEvents.find((e) => e.id === cur.id);
          onEventsChange?.(nextEvents);
          onEventDelta?.({
            type: 'move_event',
            eventId: cur.id,
            placeId: movedEv?.placeId,
            dayNumber: activeDayRef.current,
            startHour: targetHour,
            startMinute: movedEv?.startMinute || 0,
            durationMinutes: movedEv?.durationMinutes,
            timestamp: Date.now(),
          });
          notifyChanges(nextEvents, standbyListRef.current);
          const evTitle = (cur.item as CalendarEventItem).title || (cur.item as any).name || 'Hoạt động';
          setToastMsg(`✓ Đã chuyển "${evTitle}" sang ${targetHour < 10 ? '0' + targetHour : targetHour}:00!`);
          setTimeout(() => setToastMsg(null), 3000);
        }
      } else if (cartEl) {
        if (!isUserPro) {
          if (onUpgradePro) onUpgradePro();
          setToastMsg('🔒 Tính năng Khay Giỏ Hàng dành riêng cho thành viên Gói PRO!');
          setTimeout(() => setToastMsg(null), 3000);
        } else if (cur.type === 'event') {
          removeEventToStandby(cur.id, true);
          const evTitle = (cur.item as CalendarEventItem).title || (cur.item as any).name || 'Hoạt động';
          setToastMsg(`✓ Đã chuyển "${evTitle}" về Giỏ chờ!`);
          setTimeout(() => setToastMsg(null), 3000);
        }
      } else if (dayEl) {
        let targetDay: number | null = null;
        const dStr = dayEl.getAttribute('data-day-tab');
        if (dStr) targetDay = parseInt(dStr, 10);
        else {
          const tid = dayEl.getAttribute('data-testid') || '';
          const m = tid.match(/tab-day-(\d+)/);
          if (m) targetDay = parseInt(m[1], 10);
        }

        if (targetDay !== null && !isNaN(targetDay) && cur.type === 'event') {
          const nextEvents = eventsRef.current.map((ev) =>
            ev.id === cur.id ? { ...ev, dayNumber: targetDay! } : ev
          );
          setEvents(nextEvents);
          eventsRef.current = nextEvents;
          if (eventsChangeDebouncerRef.current) {
            clearTimeout(eventsChangeDebouncerRef.current);
            eventsChangeDebouncerRef.current = null;
          }
          const movedEv = nextEvents.find((e) => e.id === cur.id);
          onEventsChange?.(nextEvents);
          onEventDelta?.({
            type: 'move_event',
            eventId: cur.id,
            placeId: movedEv?.placeId,
            dayNumber: targetDay!,
            startHour: movedEv?.startHour || 8,
            startMinute: movedEv?.startMinute || 0,
            durationMinutes: movedEv?.durationMinutes,
            timestamp: Date.now(),
          });
          notifyChanges(nextEvents, standbyListRef.current);
          const evTitle = (cur.item as CalendarEventItem).title || (cur.item as any).name || 'Hoạt động';
          setToastMsg(`✓ Đã chuyển "${evTitle}" sang Ngày ${targetDay}!`);
          setTimeout(() => setToastMsg(null), 3000);
        }
      }

      const dragItemTitle = (cur.item as any)?.title || (cur.item as any)?.name;

      setPointerDrag(null);
      pointerDragRef.current = null;
      setHoveredHourSlot(null);
      setHoveredCartZone(false);
      setHoveredDayTab(null);

      // Apply pending patch nếu có (nhận được trong lúc đang kéo) bằng Smart Merge
      if (pendingPatchRef.current) {
        const { events: pendingEvents } = pendingPatchRef.current;
        setEvents((prev) => {
          const incomingMap = new Map(pendingEvents.map((e) => [e.placeId || e.id, e]));
          const next = prev.map((ev) => {
            const key = ev.placeId || ev.id;
            const incoming = incomingMap.get(key);
            if (!incoming) return ev;
            if (
              incoming.dayNumber !== ev.dayNumber ||
              incoming.startHour !== ev.startHour ||
              incoming.startMinute !== ev.startMinute
            ) {
              return {
                ...ev,
                dayNumber: incoming.dayNumber,
                startHour: incoming.startHour,
                startMinute: incoming.startMinute,
                durationMinutes: incoming.durationMinutes || ev.durationMinutes,
              };
            }
            return ev;
          });
          eventsRef.current = next;
          return next;
        });
        pendingPatchRef.current = null;
      }

      if (dragItemTitle) {
        onUserAction?.(`đã thả "${dragItemTitle}"`, 'drag_end', dragItemTitle, cur.id);
      }

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
    eventsRef.current = nextEvents;
    debouncedEventsChange(nextEvents);
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
            const gmapsRouteUrl = 'https://www.google.com/maps/dir/' + dayPlaces.map(p => (p.lat && p.lng ? (p.lat + ',' + p.lng) : encodeURIComponent(p.title + ' ' + '${cityName}'))).join('/');
            if (banner) {
              banner.innerHTML = \`
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="font-size:16px;">🚗</span>
                  <span>Lộ trình Ngày ${activeDay}: <b>\${dayPlaces.length} điểm</b> · <b>~\${distKm} km</b> (~\${durMin} phút đi xe)</span>
                </div>
                <a href="\${gmapsRouteUrl}" target="_blank" style="color:#1A73E8; font-weight:800; text-decoration:none; font-size:11px;">
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
          const gmapsRouteUrl = 'https://www.google.com/maps/dir/' + dayPlaces.map(p => (p.lat && p.lng ? (p.lat + ',' + p.lng) : encodeURIComponent(p.title + ' ' + '${cityName}'))).join('/');
          const banner = document.getElementById('route-banner');
          if (banner) {
            banner.innerHTML = \`
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:16px;">🚗</span>
                <span>Lộ trình Ngày ${activeDay}: <b>\${dayPlaces.length} điểm</b></span>
              </div>
              <a href="\${gmapsRouteUrl}" target="_blank" style="color:#1A73E8; font-weight:800; text-decoration:none; font-size:11px;">
                Mở Google Maps ↗
              </a>
            \`;
            banner.style.display = 'flex';
          }
        });
    } else if (dayPlaces.length === 1) {
      const singleUrl = dayPlaces[0].lat && dayPlaces[0].lng
        ? 'https://www.google.com/maps/search/?api=1&query=' + dayPlaces[0].lat + ',' + dayPlaces[0].lng
        : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(dayPlaces[0].title + ' ' + '${cityName}');
      const banner = document.getElementById('route-banner');
      if (banner) {
        banner.innerHTML = \`
          <div style="display:flex; align-items:center; gap:6px;">
            <span>📍 Ngày ${activeDay} hiện có 1 điểm dừng: <b>\${dayPlaces[0].title}</b>.</span>
          </div>
          <a href="\${singleUrl}" target="_blank" style="color:#1A73E8; font-weight:800; text-decoration:none; font-size:11px;">
            Mở vị trí trên Google Maps ↗
          </a>
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
      testID="google-calendar-workspace"
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
          paddingHorizontal: isDesktop ? 20 : 14,
          paddingVertical: 12,
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              backgroundColor: '#1A73E8',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Calendar size={18} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#1B2420' }}>
              Không gian Lập lịch & Quản lý Ngân sách ViVu
            </Text>
            <Text style={{ fontSize: 11, color: '#5F6368' }}>
              {cityName} · Kéo thả thẻ hoạt động trực tiếp vào từng khung giờ hoặc dùng nút điều chỉnh
            </Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            width: isDesktop ? undefined : '100%',
          }}
        >
          {!readOnly && isOwner && onBackToCollecting && (
            <Pressable
              testID="btn-header-back-collecting"
              onPress={onBackToCollecting}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: 'rgba(27,36,32,0.18)',
                paddingHorizontal: 12,
                paddingVertical: 9,
                borderRadius: 10,
                cursor: 'pointer' as any,
              }}
            >
              <Text style={{ color: '#1B2420', fontSize: 12, fontWeight: '700' }}>
                ← Chọn thêm / bớt địa điểm vào giỏ
              </Text>
            </Pressable>
          )}

          {isUserPro && !readOnly && onOpenManualAdd && (
            <Pressable
              testID="btn-pro-add-activity"
              onPress={onOpenManualAdd}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: '#E6F4EA',
                borderWidth: 1,
                borderColor: '#137333',
                paddingHorizontal: 13,
                paddingVertical: 9,
                borderRadius: 10,
                cursor: 'pointer' as any,
              }}
            >
              <Plus size={14} color="#137333" />
              <Text style={{ color: '#137333', fontSize: 12, fontWeight: '700' }}>
                Thêm hoạt động
              </Text>
            </Pressable>
          )}

          {onSave && (
            (readOnly || !isOwner) ? (
              <View
                testID="btn-save-calendar-member-disabled"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: '#E5E7EB',
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  borderRadius: 10,
                  opacity: 0.85,
                }}
              >
                <Clock size={16} color="#6B7280" />
                <Text style={{ color: '#4B5563', fontSize: 12, fontWeight: '700' }}>
                  ⏳ Chờ trưởng nhóm chốt & lưu chuyến đi
                </Text>
              </View>
            ) : (
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
                  ✓ Hoàn tất & Lưu chuyến đi
                </Text>
              </Pressable>
            )
          )}
        </View>
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
                    testID={`tab-day-${dNum}`}
                    // @ts-ignore
                    data-day-tab={dNum}
                    {...({ dataSet: { dayTab: String(dNum) } } as any)}
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
          <View style={{ height: 320, minHeight: 280, position: 'relative', backgroundColor: '#F8F9FA' }}>
            {Platform.OS === 'web' ? (
              <iframe
                title="Bản đồ lộ trình ViVu"
                srcDoc={mapIframeHTML}
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: 280,
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

          {/* Khối Địa điểm chờ xếp ở Cột Trái */}
          <View
            testID="cart-dropzone-left"
            // @ts-ignore
            data-cart-dropzone="true"
            {...({ dataSet: { cartDropzone: 'true' } } as any)}
            style={{
              padding: 12,
              backgroundColor: hoveredCartZone ? 'rgba(251,188,4,0.15)' : '#FFFFFF',
              borderTopWidth: 1,
              borderTopColor: 'rgba(27,36,32,0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              minHeight: 260,
              maxHeight: isDesktop ? 440 : undefined,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ShoppingBag size={15} color="#B06000" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#1B2420' }}>
                  Địa điểm chờ xếp ({standbyList.length} điểm)
                </Text>
              </View>

              {standbyList.length > 0 && !readOnly && (
                <Pressable
                  testID="btn-ai-optimize-schedule-left"
                  onPress={handleAiOptimizeSchedule}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingVertical: 5,
                    paddingHorizontal: 10,
                    borderRadius: 9,
                    backgroundColor: '#F3E8FD',
                    borderWidth: 1,
                    borderColor: '#8430CE',
                    cursor: 'pointer' as any,
                  }}
                >
                  <Sparkles size={12} color="#8430CE" />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#8430CE' }}>
                    ✨ AI tự động xếp lịch thông minh
                  </Text>
                </Pressable>
              )}
            </View>

            {standbyList.length === 0 ? (
              <View
                style={{
                  paddingVertical: 20,
                  paddingHorizontal: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: 'rgba(27,36,32,0.15)',
                  borderRadius: 12,
                  backgroundColor: '#FAFAFA',
                  gap: 6,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1B2420', textAlign: 'center' }}>
                  🎉 Toàn bộ địa điểm đã được xếp vào Lịch trình!
                </Text>
                <Text style={{ fontSize: 11, color: '#5F6368', textAlign: 'center' }}>
                  Kéo thẻ từ lịch trình thả về đây nếu bạn muốn chuyển lại giỏ chờ.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={{ flex: 1, maxHeight: 350 }}
                showsVerticalScrollIndicator={true}
                contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
              >
                <Text style={{ fontSize: 11, color: '#5F6368', fontStyle: 'italic', marginBottom: 2 }}>
                  👉 Kéo thẻ sang khung giờ bên phải hoặc bấm "+ Ngày {activeDay}" để đưa vào lịch:
                </Text>
                {standbyList.map((item) => {
                  const colors = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.default;
                  return (
                    <View
                      key={`left-standby-${item.id}`}
                      testID={`standby-left-chip-${item.id}`}
                      // @ts-ignore
                      onPointerDown={(e: any) => {
                        if (e?.target?.closest?.('button, [role="button"], a')) return;
                        handleStartPointerDrag(item, 'standby', e);
                      }}
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: 'rgba(27,36,32,0.12)',
                        padding: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        boxShadow: '0 1px 4px rgba(0,0,0,0.04)' as any,
                        cursor: 'grab' as any,
                      }}
                    >
                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View
                            style={{
                              paddingHorizontal: 6,
                              paddingVertical: 1,
                              borderRadius: 5,
                              backgroundColor: colors.bg,
                              borderWidth: 1,
                              borderColor: colors.border,
                            }}
                          >
                            <Text style={{ fontSize: 9, fontWeight: '800', color: colors.text }}>
                              {CATEGORY_NAMES_VI[item.category] || item.category || 'Địa điểm'}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: '#137333' }}>
                            {new Intl.NumberFormat('vi-VN').format(item.cost || 0)} đ
                          </Text>
                        </View>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#1B2420' }} numberOfLines={1}>
                          {item.name}
                        </Text>
                        {item.address && (
                          <Text style={{ fontSize: 10, color: '#5F6368' }} numberOfLines={1}>
                            📍 {item.address}
                          </Text>
                        )}
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {!readOnly && (
                          <Pressable
                            testID={`btn-quick-add-${item.id}`}
                            onPress={() => handleQuickAddStandbyToDay(item, activeDay)}
                            style={{
                              paddingHorizontal: 9,
                              paddingVertical: 6,
                              borderRadius: 8,
                              backgroundColor: '#E8F0FE',
                              borderWidth: 1,
                              borderColor: '#1A73E8',
                              cursor: 'pointer' as any,
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '800', color: '#1A73E8' }}>
                              + Ngày {activeDay}
                            </Text>
                          </Pressable>
                        )}
                        <View
                          // @ts-ignore
                          onPointerDown={(e: any) => {
                            e?.stopPropagation?.();
                            handleStartPointerDrag(item, 'standby', e);
                          }}
                          style={{
                            padding: 4,
                            cursor: 'grab' as any,
                            touchAction: 'none' as any,
                          }}
                        >
                          <GripVertical size={16} color="#80868B" />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* CỘT PHẢI (RIGHT PANEL): LỊCH TRỰC QUAN VIVU + BUDGET     */}
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
          {/* Ô TRÊN (TOP BOX): LỊCH TRÌNH CHI TIẾT VIVU             */}
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
                  Lịch trình chi tiết · Ngày {activeDay}
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
                    Đang chọn: "{selectedPlaceToPlace.name}" → Bấm vào khung giờ bên dưới để đặt
                  </Text>
                  <Pressable onPress={() => setSelectedPlaceToPlace(null)} style={{ padding: 2 }}>
                    <X size={12} color="#1A73E8" />
                  </Pressable>
                </View>
              )}
            </View>

            {/* Lưới thời gian trực quan (07:00 -> 21:00) */}
            <ScrollView
              testID="calendar-time-grid"
              // @ts-ignore
              data-calendar-grid="true"
              {...({ dataSet: { calendarGrid: 'true' } } as any)}
              style={{ flex: 1, maxHeight: 400, paddingHorizontal: 14 }}
              showsVerticalScrollIndicator={true}
            >
              <View
                testID="calendar-grid-container"
                // @ts-ignore
                data-calendar-grid="true"
                {...({ dataSet: { calendarGrid: 'true' } } as any)}
                style={{ paddingVertical: 8 }}
              >
                {HOURS.map((hour) => {
                  const hourEvents = currentDayEvents.filter((ev) => ev.startHour === hour);
                  const isSlotHovered = hoveredHourSlot === hour;

                  return (
                    <View
                      key={hour}
                      testID={`calendar-hour-row-${hour}`}
                      // @ts-ignore
                      data-hour={hour}
                      data-hour-row="true"
                      {...({ dataSet: { hour: String(hour), hourRow: 'true' } } as any)}
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
                                // @ts-ignore
                                onPointerDown={(e: any) => {
                                  if (readOnly) return;
                                  if (e?.target?.closest?.('button, [role="button"], a, [data-no-drag], [data-testid^="btn-"]')) return;
                                  handleStartPointerDrag(ev, 'event', e);
                                }}
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
                                  cursor: readOnly ? 'default' : ('grab' as any),
                                }}
                              >
                                <View style={{ flex: 1, paddingRight: 8 }}>
                                  {(() => {
                                    const currentLocked = lockedItemsRef.current || lockedItems;
                                    const lockUserId = currentLocked
                                      ? (
                                          currentLocked[ev.id] ||
                                          (ev.id ? currentLocked[String(ev.id)] : null) ||
                                          ((ev as any).item_id ? currentLocked[(ev as any).item_id] : null) ||
                                          ((ev as any).item_id ? currentLocked[String((ev as any).item_id)] : null) ||
                                          currentLocked[ev.title]
                                        )
                                      : null;
                                    const members = onlineMembersRef.current || onlineMembers;
                                    const lockUserName = lockUserId
                                      ? (members?.find((m: any) => m.user_id === lockUserId)?.display_name || 'Thành viên')
                                      : null;
                                    return lockUserName ? (
                                      <View
                                        testID={`lock-badge-${ev.id}`}
                                        {...({ 'data-testid': `lock-badge-${ev.id}` } as any)}
                                        style={{
                                          flexDirection: 'row',
                                          alignItems: 'center',
                                          gap: 3,
                                          paddingHorizontal: 6,
                                          paddingVertical: 2,
                                          borderRadius: 6,
                                          backgroundColor: '#FEF3C7',
                                          borderWidth: 1,
                                          borderColor: '#F59E0B',
                                          marginBottom: 4,
                                          alignSelf: 'flex-start',
                                        }}
                                      >
                                        <Lock size={10} color="#D97706" />
                                        <Text
                                          testID={`lock-badge-text-${ev.id}`}
                                          {...({ 'data-testid': `lock-badge-text-${ev.id}` } as any)}
                                          style={{ fontSize: 9, fontWeight: '800', color: '#B45309' }}
                                        >
                                          {lockUserName} đang giữ
                                        </Text>
                                      </View>
                                    ) : null;
                                  })()}
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
                                      {ev.startHour < 10 ? `0${ev.startHour}:00` : `${ev.startHour}:00`} · {ev.durationMinutes} phút
                                    </Text>
                                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text }}>
                                      {Number(ev.cost).toLocaleString('vi-VN')}đ
                                    </Text>

                                     {/* Nút / Badge ghi nhận & sửa chi phí thực tế trực tiếp trên thẻ */}
                                     {eventExpenseMap[ev.id] && eventExpenseMap[ev.id].total > 0 ? (
                                       canEditBudget !== false ? (
                                         <Pressable
                                           testID={`btn-edit-expense-ev-${ev.id}`}
                                           onPress={() => openEditExpenseLog(eventExpenseMap[ev.id].logs[0])}
                                           // @ts-ignore
                                           onPointerDown={(e: any) => e?.stopPropagation?.()}
                                           // @ts-ignore
                                           role="button"
                                           // @ts-ignore
                                           dataSet={{ noDrag: 'true' }}
                                           style={{
                                             flexDirection: 'row',
                                             alignItems: 'center',
                                             gap: 3,
                                             paddingHorizontal: 6,
                                             paddingVertical: 2,
                                             borderRadius: 6,
                                             backgroundColor: '#E6F4EA',
                                             borderWidth: 1,
                                             borderColor: '#A8DAB5',
                                             cursor: 'pointer' as any,
                                           }}
                                           accessibilityLabel="Sửa chi phí thực tế đã ghi nhận"
                                         >
                                           <Check size={10} color="#137333" />
                                           <Text style={{ fontSize: 9, fontWeight: '800', color: '#137333' }}>
                                             Đã chi: {(eventExpenseMap[ev.id].total / 1000).toLocaleString('vi-VN')}k (Sửa)
                                           </Text>
                                         </Pressable>
                                       ) : (
                                         <View
                                           style={{
                                             flexDirection: 'row',
                                             alignItems: 'center',
                                             gap: 3,
                                             paddingHorizontal: 6,
                                             paddingVertical: 2,
                                             borderRadius: 6,
                                             backgroundColor: '#E6F4EA',
                                             borderWidth: 1,
                                             borderColor: '#A8DAB5',
                                           }}
                                         >
                                           <Check size={10} color="#137333" />
                                           <Text style={{ fontSize: 9, fontWeight: '800', color: '#137333' }}>
                                             Đã chi: {(eventExpenseMap[ev.id].total / 1000).toLocaleString('vi-VN')}k
                                           </Text>
                                         </View>
                                       )
                                     ) : (
                                       canEditBudget !== false && (
                                         <Pressable
                                           testID={`btn-record-expense-ev-${ev.id}`}
                                           onPress={() => openAddExpenseModal(ev.dayNumber, ev.id)}
                                           // @ts-ignore
                                           onPointerDown={(e: any) => e?.stopPropagation?.()}
                                           // @ts-ignore
                                           role="button"
                                           // @ts-ignore
                                           dataSet={{ noDrag: 'true' }}
                                           style={{
                                             flexDirection: 'row',
                                             alignItems: 'center',
                                             gap: 3,
                                             paddingHorizontal: 6,
                                             paddingVertical: 2,
                                             borderRadius: 6,
                                             backgroundColor: 'rgba(26,115,232,0.08)',
                                             borderWidth: 1,
                                             borderColor: 'rgba(26,115,232,0.2)',
                                             cursor: 'pointer' as any,
                                           }}
                                           accessibilityLabel="Ghi nhận số tiền thực tế"
                                         >
                                           <DollarSign size={10} color="#1A73E8" />
                                           <Text style={{ fontSize: 9, fontWeight: '700', color: '#1A73E8' }}>
                                             + Ghi tiền
                                           </Text>
                                         </Pressable>
                                       )
                                     )}
                                  </View>
                                </View>

                                {/* Action Buttons: Shift Hour, Delete, Drag Grip */}
                                {!readOnly && (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Pressable
                                      testID={`btn-shift-up-${ev.id}`}
                                      onPress={() => moveEventHour(ev.id, -1)}
                                      // @ts-ignore
                                      onPointerDown={(e: any) => e?.stopPropagation?.()}
                                      // @ts-ignore
                                      role="button"
                                      // @ts-ignore
                                      dataSet={{ noDrag: 'true' }}
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
                                      // @ts-ignore
                                      onPointerDown={(e: any) => e?.stopPropagation?.()}
                                      // @ts-ignore
                                      role="button"
                                      // @ts-ignore
                                      dataSet={{ noDrag: 'true' }}
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
                                      // @ts-ignore
                                      onPointerDown={(e: any) => e?.stopPropagation?.()}
                                      // @ts-ignore
                                      role="button"
                                      // @ts-ignore
                                      dataSet={{ noDrag: 'true' }}
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
                                      onPointerDown={(e: any) => {
                                        e?.stopPropagation?.();
                                        handleStartPointerDrag(ev, 'event', e);
                                      }}
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
            {/* 1. KHAY GIỎ HÀNG CHỜ XẾP LỊCH (STANDBY CART TRAY) */}
            {!isUserPro ? (
              /* KHAY GIỎ HÀNG BỊ KHÓA CHO USER THƯỜNG (GÓI PRO 🔒) */
              <View
                testID="cart-locked-pro-box"
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: '#F5D599',
                  padding: 14,
                  gap: 10,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)' as any,
                }}
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
                        borderRadius: 8,
                        backgroundColor: '#FFF2E0',
                        borderWidth: 1,
                        borderColor: '#D4A017',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      <Lock size={10} color="#B06000" />
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#B06000' }}>
                        GÓI PRO 🔒
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Pressable
                      testID="btn-upgrade-pro-cart"
                      onPress={onUpgradePro}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        backgroundColor: '#D4A017',
                        paddingVertical: 5,
                        paddingHorizontal: 11,
                        borderRadius: 8,
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Crown size={11} color="#FFFFFF" />
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>Mở khóa PRO</Text>
                    </Pressable>
                  </View>
                </View>

                <Text style={{ fontSize: 12, color: '#5F6368', lineHeight: 18 }}>
                  Tính năng Khay Giỏ Hàng và kéo thả địa điểm chờ là đặc quyền của <Text style={{ fontWeight: '700', color: '#B06000' }}>Gói PRO</Text>. Chuyến đi tạo nhanh 1-Click đã được AI tối ưu toàn bộ các hoạt động. Vui lòng nâng cấp lên Gói PRO để tự tay sắp xếp và kéo thả các địa điểm trên bản đồ.
                </Text>
              </View>
            ) : isDetailPage && !showCartInDetail ? (
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
                        Còn {standbyList.length} điểm trong giỏ
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
                      {standbyList.length > 0 ? `Xem khay giỏ chờ (${standbyList.length})` : '🔍 Mở khay giỏ hàng'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              /* 1. KHAY GIỎ HÀNG CHỜ XẾP LỊCH CHO THÀNH VIÊN PRO */
              <View
                testID="cart-dropzone"
                // @ts-ignore
                data-cart-dropzone="true"
                {...({ dataSet: { cartDropzone: 'true' } } as any)}
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
                    {standbyList.length > 0 && (
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
                    )}

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
                      gap: 10,
                      position: 'relative' as any,
                    }}
                  >
                    <Text style={{ fontSize: 11, color: '#5F6368', fontWeight: '500' }}>
                      🎉 Đã xếp toàn bộ địa điểm vào Lịch trình! Kéo sự kiện từ lịch thả vào đây nếu muốn đưa lại giỏ chờ.
                    </Text>
                    <Pressable
                      testID="btn-load-more-standby"
                      onPress={handleLoadMoreStandbyPlaces}
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
                      <Plus size={12} color="#1A73E8" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#1A73E8' }}>
                        {isExploringMore ? '⏳ AI đang tìm...' : '+ Khám phá thêm địa điểm vào giỏ'}
                      </Text>
                    </Pressable>
                    {showExplorePrompt && (
                      <View style={{
                        position: 'absolute' as any, bottom: 60, left: 0, right: 0,
                        backgroundColor: '#FFFFFF', padding: 12, borderRadius: 12,
                        borderWidth: 1, borderColor: 'rgba(27,36,32,0.1)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)' as any, zIndex: 100,
                      }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#1B2420', marginBottom: 8 }}>
                          🤖 AI gợi ý theo yêu cầu của bạn:
                        </Text>
                        <TextInput
                          value={exploreUserInput}
                          onChangeText={setExploreUserInput}
                          placeholder="Ví dụ: quán cafe view đẹp, nhà hàng hải sản..."
                          style={{
                            borderWidth: 1, borderColor: 'rgba(27,36,32,0.15)',
                            borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
                            fontSize: 12, marginBottom: 8,
                          }}
                        />
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <Pressable
                            onPress={() => handleExploreMore(exploreUserInput || undefined)}
                            style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#1F6F54', alignItems: 'center' }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
                              {isExploringMore ? '⏳ Đang tìm...' : '🔍 Tìm ngay'}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setShowExplorePrompt(false)}
                            style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#F1F3F4', alignItems: 'center' }}
                          >
                            <Text style={{ fontSize: 12, color: '#5F6368' }}>Hủy</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
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
                          // @ts-ignore
                          onPointerDown={(e: any) => {
                            if (e?.target?.closest?.('button, [role="button"], a')) return;
                            handleStartPointerDrag(item, 'standby', e);
                          }}
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
                              <Text style={{ fontSize: 9, fontWeight: '800', color: colors.text }}>
                                {CATEGORY_NAMES_VI[item.category] || item.category}
                              </Text>
                            </View>

                            <Text style={{ fontSize: 10, fontWeight: '800', color: '#137333' }}>
                              {Number(item.cost).toLocaleString('vi-VN')}đ
                            </Text>
                          </View>

                          {(() => {
                            const currentLocked = lockedItemsRef.current || lockedItems;
                            const lockUserId = currentLocked
                              ? (
                                  currentLocked[item.id] ||
                                  (item.id ? currentLocked[String(item.id)] : null) ||
                                  ((item as any).item_id ? currentLocked[(item as any).item_id] : null) ||
                                  ((item as any).item_id ? currentLocked[String((item as any).item_id)] : null) ||
                                  currentLocked[item.name] ||
                                  ((item as any).title ? currentLocked[(item as any).title] : null)
                                )
                              : null;
                            const members = onlineMembersRef.current || onlineMembers;
                            const lockUserName = lockUserId
                              ? (members?.find((m: any) => m.user_id === lockUserId)?.display_name || 'Thành viên')
                              : null;
                            return lockUserName ? (
                              <View
                                testID={`lock-badge-${item.id}`}
                                {...({ 'data-testid': `lock-badge-${item.id}` } as any)}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 3,
                                  paddingHorizontal: 6,
                                  paddingVertical: 2,
                                  borderRadius: 6,
                                  backgroundColor: '#FEF3C7',
                                  borderWidth: 1,
                                  borderColor: '#F59E0B',
                                  alignSelf: 'flex-start',
                                }}
                              >
                                <Lock size={10} color="#D97706" />
                                <Text
                                  testID={`lock-badge-text-${item.id}`}
                                  {...({ 'data-testid': `lock-badge-text-${item.id}` } as any)}
                                  style={{ fontSize: 9, fontWeight: '800', color: '#B45309' }}
                                >
                                  {lockUserName} đang giữ
                                </Text>
                              </View>
                            ) : null;
                          })()}

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

            {/* 2. BẢNG NGÂN SÁCH MA TRẬN (5 HẠNG MỤC: ĂN, CF, NGHỈ NGƠI, VUI CHƠI, KHÁC, TỔNG) */}
            <View testID="budget-matrix-container" style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, flexWrap: 'wrap', gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <DollarSign size={15} color="#137333" />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#1B2420' }}>
                    Bảng Quản lý & Đối soát Ngân sách
                  </Text>
                  <View
                    testID="budget-note-travelers"
                    style={{
                      backgroundColor: '#E6F4EA',
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#CEEAD6',
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#137333' }}>
                      👥 {travelerCount || 1} người{travelerCount > 1 ? ` · ${Math.max(1, Math.ceil((travelerCount || 1) / 2))} phòng` : ''}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {canEditBudget !== false && (
                    <Pressable
                      testID="btn-record-expense-header"
                      onPress={() => openAddExpenseModal(activeDay)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 8,
                        backgroundColor: '#137333',
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Plus size={13} color="#FFFFFF" />
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#FFFFFF' }}>
                        Ghi chi tiêu theo ngày
                      </Text>
                    </Pressable>
                  )}

                  <Pressable
                    testID="btn-open-expense-logs-header"
                    onPress={() => setShowExpenseLogModal(true)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 9,
                      paddingVertical: 5,
                      borderRadius: 8,
                      backgroundColor: expenseLogs.length > 0 ? '#E8F0FE' : '#F1F3F4',
                      borderWidth: 1,
                      borderColor: expenseLogs.length > 0 ? '#C2E7FF' : 'rgba(27,36,32,0.08)',
                      cursor: 'pointer' as any,
                    }}
                  >
                    <Clock size={12} color={expenseLogs.length > 0 ? '#1A73E8' : '#5F6368'} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: expenseLogs.length > 0 ? '#1A73E8' : '#5F6368' }}>
                      📋 Nhật ký & Sửa ({expenseLogs.length})
                    </Text>
                  </Pressable>
                </View>
              </View>

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
                    <Text style={{ fontSize: 9, color: '#666', marginTop: 1 }}>
                      👥 {travelerCount || 1} người{travelerCount > 1 ? ` · ${Math.max(1, Math.ceil((travelerCount || 1) / 2))} phòng` : ''}
                    </Text>
                  </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#137333' }}>Ăn uống</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#B06000' }}>Cà phê</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#8430CE' }}>Nghỉ ngơi</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#1A73E8' }}>Vui chơi</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#5F6368' }}>Khác</Text>
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
                  <Text style={{ fontSize: 11, fontWeight: '900', color: '#202124' }}>Tổng</Text>
                </View>
              </View>

              {/* Hàng 1: Dự định */}
              <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(27,36,32,0.06)', paddingVertical: 7, backgroundColor: '#FAFAFA' }}>
                <View style={{ width: 85, paddingHorizontal: 8, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#5F6368' }}>Dự kiến</Text>
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
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#1A73E8' }}>Ước tính</Text>
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

              {/* Hàng 3: Đã dùng (Người dùng nhập chi tiêu thực tế theo từng ngày & địa điểm) */}
              <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(27,36,32,0.06)', paddingVertical: 7, backgroundColor: '#FFFFFF' }}>
                <View style={{ width: 85, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: totalActual > 0 ? '#137333' : '#5F6368' }}>
                    Đã chi
                  </Text>
                  <Pressable
                    testID="btn-open-expense-logs-row"
                    onPress={() => setShowExpenseLogModal(true)}
                    style={{
                      paddingHorizontal: 4,
                      paddingVertical: 2,
                      borderRadius: 4,
                      backgroundColor: expenseLogs.length > 0 ? '#E8F0FE' : '#F1F3F4',
                      cursor: 'pointer' as any,
                    }}
                    accessibilityLabel="Xem lịch sử ghi chép & sửa sai"
                  >
                    <Clock size={10} color={expenseLogs.length > 0 ? '#1A73E8' : '#80868B'} />
                  </Pressable>
                </View>

                {/* Ăn */}
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Pressable
                    testID="btn-expense-dining"
                    disabled={canEditBudget === false}
                    onPress={canEditBudget !== false ? () => openAddExpenseModal(activeDay, undefined, 'dining') : undefined}
                    style={{
                      paddingHorizontal: 6,
                      paddingVertical: 3,
                      borderRadius: 6,
                      backgroundColor: actualExpenses.dining > 0 ? '#E6F4EA' : '#F8F9FA',
                      borderWidth: 1,
                      borderColor: actualExpenses.dining > 0 ? '#A8DAB5' : '#E8EAED',
                      cursor: (canEditBudget !== false ? 'pointer' : 'default') as any,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: actualExpenses.dining > 0 ? '800' : '600',
                        color: actualExpenses.dining > 0 ? '#137333' : '#80868B',
                      }}
                    >
                      {actualExpenses.dining > 0 ? `${(actualExpenses.dining / 1000).toLocaleString('vi-VN')}k` : (canEditBudget !== false ? '+ Ghi' : '-')}
                    </Text>
                  </Pressable>
                </View>

                {/* Cafe */}
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Pressable
                    testID="btn-expense-cafe"
                    disabled={canEditBudget === false}
                    onPress={canEditBudget !== false ? () => openAddExpenseModal(activeDay, undefined, 'cafe') : undefined}
                    style={{
                      paddingHorizontal: 6,
                      paddingVertical: 3,
                      borderRadius: 6,
                      backgroundColor: actualExpenses.cafe > 0 ? '#E6F4EA' : '#F8F9FA',
                      borderWidth: 1,
                      borderColor: actualExpenses.cafe > 0 ? '#A8DAB5' : '#E8EAED',
                      cursor: (canEditBudget !== false ? 'pointer' : 'default') as any,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: actualExpenses.cafe > 0 ? '800' : '600',
                        color: actualExpenses.cafe > 0 ? '#137333' : '#80868B',
                      }}
                    >
                      {actualExpenses.cafe > 0 ? `${(actualExpenses.cafe / 1000).toLocaleString('vi-VN')}k` : (canEditBudget !== false ? '+ Ghi' : '-')}
                    </Text>
                  </Pressable>
                </View>

                {/* Nghỉ ngơi */}
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Pressable
                    testID="btn-expense-hotel"
                    disabled={canEditBudget === false}
                    onPress={canEditBudget !== false ? () => openAddExpenseModal(activeDay, undefined, 'hotel') : undefined}
                    style={{
                      paddingHorizontal: 6,
                      paddingVertical: 3,
                      borderRadius: 6,
                      backgroundColor: actualExpenses.hotel > 0 ? '#E6F4EA' : '#F8F9FA',
                      borderWidth: 1,
                      borderColor: actualExpenses.hotel > 0 ? '#A8DAB5' : '#E8EAED',
                      cursor: (canEditBudget !== false ? 'pointer' : 'default') as any,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: actualExpenses.hotel > 0 ? '800' : '600',
                        color: actualExpenses.hotel > 0 ? '#137333' : '#80868B',
                      }}
                    >
                      {actualExpenses.hotel > 0 ? `${(actualExpenses.hotel / 1000).toLocaleString('vi-VN')}k` : (canEditBudget !== false ? '+ Ghi' : '-')}
                    </Text>
                  </Pressable>
                </View>

                {/* Vui chơi */}
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Pressable
                    testID="btn-expense-attraction"
                    disabled={canEditBudget === false}
                    onPress={canEditBudget !== false ? () => openAddExpenseModal(activeDay, undefined, 'attraction') : undefined}
                    style={{
                      paddingHorizontal: 6,
                      paddingVertical: 3,
                      borderRadius: 6,
                      backgroundColor: actualExpenses.attraction > 0 ? '#E6F4EA' : '#F8F9FA',
                      borderWidth: 1,
                      borderColor: actualExpenses.attraction > 0 ? '#A8DAB5' : '#E8EAED',
                      cursor: (canEditBudget !== false ? 'pointer' : 'default') as any,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: actualExpenses.attraction > 0 ? '800' : '600',
                        color: actualExpenses.attraction > 0 ? '#137333' : '#80868B',
                      }}
                    >
                      {actualExpenses.attraction > 0 ? `${(actualExpenses.attraction / 1000).toLocaleString('vi-VN')}k` : (canEditBudget !== false ? '+ Ghi' : '-')}
                    </Text>
                  </Pressable>
                </View>

                {/* Khác */}
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Pressable
                    testID="btn-expense-other"
                    disabled={canEditBudget === false}
                    onPress={canEditBudget !== false ? () => openAddExpenseModal(activeDay, undefined, 'other') : undefined}
                    style={{
                      paddingHorizontal: 6,
                      paddingVertical: 3,
                      borderRadius: 6,
                      backgroundColor: actualExpenses.other > 0 ? '#E6F4EA' : '#F8F9FA',
                      borderWidth: 1,
                      borderColor: actualExpenses.other > 0 ? '#A8DAB5' : '#E8EAED',
                      cursor: (canEditBudget !== false ? 'pointer' : 'default') as any,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: actualExpenses.other > 0 ? '800' : '600',
                        color: actualExpenses.other > 0 ? '#137333' : '#80868B',
                      }}
                    >
                      {actualExpenses.other > 0 ? `${(actualExpenses.other / 1000).toLocaleString('vi-VN')}k` : (canEditBudget !== false ? '+ Ghi' : '-')}
                    </Text>
                  </Pressable>
                </View>

                {/* Tổng đã dùng */}
                <View style={{ flex: 1.2, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: 'rgba(27,36,32,0.06)', backgroundColor: totalActual > 0 ? '#E6F4EA' : '#FFFFFF' }}>
                  <Text style={{ fontSize: 11, fontWeight: '900', color: totalActual > 0 ? '#137333' : '#80868B' }}>
                    {(totalActual / 1000).toLocaleString('vi-VN')}k
                  </Text>
                </View>
              </View>

              {/* Hàng 4: Còn lại (Chênh lệch Dự kiến - Thực tế đã chi hoặc Ước tính) */}
              <View style={{ flexDirection: 'row', paddingVertical: 7, backgroundColor: '#F8F9FA' }}>
                <View style={{ width: 85, paddingHorizontal: 8, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: effectiveRemaining.total >= 0 ? '#137333' : '#C5221F' }}>
                    Còn lại{effectiveRemaining.isActual ? '*' : ''}
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: effectiveRemaining.dining >= 0 ? '#137333' : '#C5221F',
                    }}
                  >
                    {(effectiveRemaining.dining / 1000).toLocaleString('vi-VN')}k
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: effectiveRemaining.cafe >= 0 ? '#137333' : '#C5221F',
                    }}
                  >
                    {(effectiveRemaining.cafe / 1000).toLocaleString('vi-VN')}k
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: effectiveRemaining.hotel >= 0 ? '#137333' : '#C5221F',
                    }}
                  >
                    {(effectiveRemaining.hotel / 1000).toLocaleString('vi-VN')}k
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: effectiveRemaining.attraction >= 0 ? '#137333' : '#C5221F',
                    }}
                  >
                    {(effectiveRemaining.attraction / 1000).toLocaleString('vi-VN')}k
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: effectiveRemaining.other >= 0 ? '#137333' : '#C5221F',
                    }}
                  >
                    {(effectiveRemaining.other / 1000).toLocaleString('vi-VN')}k
                  </Text>
                </View>
                <View
                  style={{
                    flex: 1.2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderLeftWidth: 1,
                    borderLeftColor: 'rgba(27,36,32,0.06)',
                    backgroundColor: effectiveRemaining.total >= 0 ? '#E6F4EA' : '#FCE8E6',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '900',
                      color: effectiveRemaining.total >= 0 ? '#137333' : '#C5221F',
                    }}
                  >
                    {(effectiveRemaining.total / 1000).toLocaleString('vi-VN')}k
                  </Text>
                </View>
              </View>
            </View>
            {effectiveRemaining.isActual && (
              <Text style={{ fontSize: 9, color: '#137333', fontStyle: 'italic', paddingHorizontal: 4 }}>
                *Số dư còn lại đang được tính theo chi phí thực tế đã dùng bạn đã ghi chép.
              </Text>
            )}
            <Text style={{ fontSize: 9, color: '#5F6368', fontStyle: 'italic', paddingHorizontal: 4, marginTop: 3 }}>
              💡 Ăn uống & vui chơi tính cho {travelerCount} người · Nghỉ ngơi tính theo phòng ({Math.ceil(travelerCount / 2)} phòng)
            </Text>
          </View>

            {/* ── MODAL GHI / SỬA CHI TIÊU THEO TỪNG NGÀY & ĐỊA ĐIỂM (TỰ ĐỘNG PHÂN LOẠI) ── */}
            {expenseModalOpen && (
              <View
                style={{
                  position: 'fixed' as any,
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  zIndex: 99999999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 16,
                }}
              >
                <View
                  style={{
                    width: '100%',
                    maxWidth: 480,
                    maxHeight: '90vh' as any,
                    backgroundColor: '#FFFFFF',
                    borderRadius: 20,
                    padding: 20,
                    gap: 14,
                    boxShadow: '0 20px 40px rgba(0,0,0,0.2)' as any,
                    overflow: 'hidden',
                  }}
                >
                  {/* Modal Header */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <DollarSign size={18} color="#137333" />
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#1B2420' }}>
                        {editingLogId ? '✏️ Chỉnh sửa chi tiêu (Sửa bất cứ lúc nào)' : '💰 Ghi nhận chi tiêu theo ngày'}
                      </Text>
                    </View>
                    <Pressable
                      testID="btn-close-expense-modal"
                      onPress={() => {
                        setExpenseModalOpen(false);
                        setEditingLogId(null);
                      }}
                      style={{ padding: 4, cursor: 'pointer' as any }}
                    >
                      <X size={18} color="#5F6368" />
                    </Pressable>
                  </View>

                  <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={true} contentContainerStyle={{ gap: 14 }}>
                    {/* BƯỚC 1: CLICK VÔ NGÀY NÀO */}
                    <View style={{ gap: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#1B2420' }}>
                        📅 Bước 1: Chọn ngày diễn ra chi tiêu:
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                        {Array.from({ length: daysCount }, (_, i) => i + 1).map((d) => {
                          const isDaySelected = selectedExpenseDay === d;
                          const dayExpenseCount = expenseLogs.filter((l) => l.dayNumber === d).length;
                          return (
                            <Pressable
                              key={d}
                              testID={`btn-select-expense-day-${d}`}
                              onPress={() => handleChangeExpenseDayInModal(d)}
                              style={{
                                paddingHorizontal: 12,
                                paddingVertical: 6,
                                borderRadius: 10,
                                backgroundColor: isDaySelected ? '#1A73E8' : '#F1F3F4',
                                borderWidth: 1,
                                borderColor: isDaySelected ? '#1A73E8' : 'rgba(27,36,32,0.08)',
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                                cursor: 'pointer' as any,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontWeight: '800',
                                  color: isDaySelected ? '#FFFFFF' : '#3C4043',
                                }}
                              >
                                Ngày {d}
                              </Text>
                              {dayExpenseCount > 0 && (
                                <View
                                  style={{
                                    paddingHorizontal: 5,
                                    paddingVertical: 1,
                                    borderRadius: 6,
                                    backgroundColor: isDaySelected ? 'rgba(255,255,255,0.25)' : '#E6F4EA',
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 9,
                                      fontWeight: '800',
                                      color: isDaySelected ? '#FFFFFF' : '#137333',
                                    }}
                                  >
                                    {dayExpenseCount}
                                  </Text>
                                </View>
                              )}
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    {/* BƯỚC 2: CHỌN ĐỊA ĐIỂM CỦA NGÀY ĐÓ */}
                    <View style={{ gap: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#1B2420' }}>
                        📍 Bước 2: Chọn địa điểm trong Ngày {selectedExpenseDay}:
                      </Text>
                      {(() => {
                        const dayEvs = events.filter((e) => Number(e.dayNumber) === Number(selectedExpenseDay));
                        return (
                          <View style={{ gap: 6 }}>
                            {dayEvs.length > 0 ? (
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {dayEvs.map((ev) => {
                                  const isSelected = selectedPlaceId === ev.id;
                                  const autoCat = autoClassifyCategory(ev.category, ev.title);
                                  return (
                                    <Pressable
                                      key={ev.id}
                                      testID={`btn-select-place-${ev.id}`}
                                      onPress={() => handleSelectPlaceInModal(ev.id)}
                                      style={{
                                        paddingHorizontal: 10,
                                        paddingVertical: 7,
                                        borderRadius: 10,
                                        backgroundColor: isSelected ? '#E8F0FE' : '#FAFAFA',
                                        borderWidth: 1.5,
                                        borderColor: isSelected ? '#1A73E8' : 'rgba(27,36,32,0.1)',
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 6,
                                        cursor: 'pointer' as any,
                                      }}
                                    >
                                      <Text style={{ fontSize: 12 }}>{autoCat.emoji}</Text>
                                      <View>
                                        <Text
                                          style={{
                                            fontSize: 11,
                                            fontWeight: '800',
                                            color: isSelected ? '#1A73E8' : '#202124',
                                          }}
                                        >
                                          {ev.title}
                                        </Text>
                                        <Text style={{ fontSize: 10, color: '#5F6368' }}>
                                          {ev.startHour}:00 · Dự kiến: {Number(ev.cost).toLocaleString('vi-VN')}đ
                                        </Text>
                                      </View>
                                      {isSelected && <Check size={14} color="#1A73E8" />}
                                    </Pressable>
                                  );
                                })}
                              </View>
                            ) : (
                              <Text style={{ fontSize: 11, color: '#80868B', fontStyle: 'italic' }}>
                                Ngày này chưa có địa điểm trên lịch trình. Bạn có thể ghi nhận chi phí phát sinh bên dưới:
                              </Text>
                            )}

                            {/* Tùy chọn chi phí phát sinh ngoài lịch */}
                            <Pressable
                              testID="btn-select-place-custom"
                              onPress={() => handleSelectPlaceInModal('custom')}
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 7,
                                borderRadius: 10,
                                backgroundColor: selectedPlaceId === 'custom' ? '#FFF8E1' : '#FAFAFA',
                                borderWidth: 1.5,
                                borderColor: selectedPlaceId === 'custom' ? '#FBBC04' : 'rgba(27,36,32,0.1)',
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                                cursor: 'pointer' as any,
                              }}
                            >
                              <Plus size={14} color="#B06000" />
                              <Text style={{ fontSize: 11, fontWeight: '800', color: '#B06000' }}>
                                + Địa điểm / Chi phí phát sinh khác ngoài lịch
                              </Text>
                              {selectedPlaceId === 'custom' && <Check size={14} color="#B06000" />}
                            </Pressable>

                            {selectedPlaceId === 'custom' && (
                              <TextInput
                                testID="input-custom-place-name"
                                value={customPlaceName}
                                onChangeText={(text) => {
                                  setCustomPlaceName(text);
                                  const autoCat = autoClassifyCategory(undefined, text);
                                  setManualCategory(autoCat.key);
                                }}
                                placeholder="Nhập tên địa điểm hoặc dịch vụ (ví dụ: Chè 4 Mùa, Grab sân bay...)"
                                style={{
                                  borderWidth: 1,
                                  borderColor: '#FBBC04',
                                  borderRadius: 8,
                                  paddingHorizontal: 10,
                                  paddingVertical: 7,
                                  fontSize: 12,
                                  backgroundColor: '#FFFFFF',
                                }}
                              />
                            )}
                          </View>
                        );
                      })()}
                    </View>

                    {/* BƯỚC 3: TỰ ĐỘNG PHÂN LOẠI 5 HẠNG MỤC */}
                    {(() => {
                      let activeCatKey: 'dining' | 'cafe' | 'hotel' | 'attraction' | 'other' = 'dining';
                      if (selectedPlaceId && selectedPlaceId !== 'custom') {
                        const ev = events.find((e) => e.id === selectedPlaceId);
                        if (ev) {
                          activeCatKey = manualCategory || autoClassifyCategory(ev.category, ev.title).key;
                        }
                      } else {
                        activeCatKey = manualCategory || autoClassifyCategory(undefined, customPlaceName).key;
                      }

                      const catMap = {
                        dining: { label: 'Ăn uống', emoji: '🍽️', color: '#137333', bg: '#E6F4EA' },
                        cafe: { label: 'Cà phê', emoji: '☕', color: '#B06000', bg: '#FEF7E0' },
                        hotel: { label: 'Nghỉ ngơi', emoji: '🛏️', color: '#8430CE', bg: '#F3E8FD' },
                        attraction: { label: 'Vui chơi', emoji: '🎡', color: '#1A73E8', bg: '#E8F0FE' },
                        other: { label: 'Khác', emoji: '📦', color: '#5F6368', bg: '#F1F3F4' },
                      };

                      const currentCatInfo = catMap[activeCatKey] || catMap.other;

                      return (
                        <View style={{ gap: 6 }}>
                          <View
                            style={{
                              backgroundColor: currentCatInfo.bg,
                              borderRadius: 10,
                              padding: 8,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Sparkles size={14} color={currentCatInfo.color} />
                              <Text style={{ fontSize: 12, fontWeight: '800', color: currentCatInfo.color }}>
                                ⚡ Tự động phân loại: {currentCatInfo.label} {currentCatInfo.emoji}
                              </Text>
                            </View>
                            <Text style={{ fontSize: 10, color: currentCatInfo.color, fontStyle: 'italic' }}>
                              (Dựa theo tên & địa điểm)
                            </Text>
                          </View>

                          {/* 5 chip đổi hạng mục nhanh nếu muốn */}
                          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                            {(['dining', 'cafe', 'hotel', 'attraction', 'other'] as const).map((catKey) => {
                              const info = catMap[catKey];
                              const isCatActive = activeCatKey === catKey;
                              return (
                                <Pressable
                                  key={catKey}
                                  testID={`btn-category-${catKey}`}
                                  onPress={() => setManualCategory(catKey)}
                                  style={{
                                    paddingHorizontal: 8,
                                    paddingVertical: 4,
                                    borderRadius: 8,
                                    backgroundColor: isCatActive ? info.bg : '#F8F9FA',
                                    borderWidth: 1,
                                    borderColor: isCatActive ? info.color : 'rgba(27,36,32,0.08)',
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 4,
                                    cursor: 'pointer' as any,
                                  }}
                                >
                                  <Text style={{ fontSize: 11 }}>{info.emoji}</Text>
                                  <Text
                                    style={{
                                      fontSize: 11,
                                      fontWeight: isCatActive ? '800' : '600',
                                      color: isCatActive ? info.color : '#5F6368',
                                    }}
                                  >
                                    {info.label}
                                  </Text>
                                  {isCatActive && <Check size={11} color={info.color} />}
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      );
                    })()}

                    {/* BƯỚC 4: NHẬP TIỀN VÔ */}
                    <View style={{ gap: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#1B2420' }}>
                        💵 Bước 4: Nhập số tiền thực tế (VND):
                      </Text>
                      <TextInput
                        testID="input-expense-amount"
                        value={expenseAmountInput}
                        onChangeText={setExpenseAmountInput}
                        placeholder="Ví dụ: 120000"
                        keyboardType="numeric"
                        style={{
                          borderWidth: 1.5,
                          borderColor: '#137333',
                          borderRadius: 10,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          fontSize: 16,
                          fontWeight: '800',
                          color: '#137333',
                          backgroundColor: '#FFFFFF',
                        }}
                      />
                      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                        {[20000, 50000, 100000, 200000, 500000].map((amt) => (
                          <Pressable
                            key={amt}
                            onPress={() => setExpenseAmountInput(String(amt))}
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              borderRadius: 6,
                              backgroundColor: '#F1F3F4',
                              cursor: 'pointer' as any,
                            }}
                          >
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#3C4043' }}>
                              +{amt >= 1000000 ? `${amt / 1000000}tr` : `${amt / 1000}k`}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>

                    {/* BƯỚC 5: GHI CHÚ */}
                    <View style={{ gap: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#202124' }}>
                        📝 Ghi chú chi tiết (tùy chọn, để nhớ khi sửa sai):
                      </Text>
                      <TextInput
                        testID="input-expense-note"
                        value={expenseNoteInput}
                        onChangeText={setExpenseNoteInput}
                        placeholder="Ví dụ: 2 bát phở bò tái nạm + quẩy giòn..."
                        style={{
                          borderWidth: 1,
                          borderColor: '#DADCE0',
                          borderRadius: 10,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          fontSize: 13,
                          color: '#1B2420',
                          backgroundColor: '#FFFFFF',
                        }}
                      />
                    </View>
                  </ScrollView>

                  {/* Actions */}
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                    <Pressable
                      onPress={() => {
                        setExpenseModalOpen(false);
                        setEditingLogId(null);
                      }}
                      style={{
                        flex: 1,
                        paddingVertical: 11,
                        alignItems: 'center',
                        borderRadius: 10,
                        backgroundColor: '#F1F3F4',
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#5F6368' }}>Hủy</Text>
                    </Pressable>
                    <Pressable
                      testID="btn-confirm-save-expense"
                      onPress={handleSaveExpense}
                      style={{
                        flex: 1.5,
                        paddingVertical: 11,
                        alignItems: 'center',
                        borderRadius: 10,
                        backgroundColor: '#137333',
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>
                        {editingLogId ? 'Cập nhật chi tiêu' : 'Lưu chi tiêu'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

            {/* ── MODAL NHẬT KÝ CHI TIÊU & LỊCH SỬ CHỈNH SỬA / SỬA SAI ── */}
            {showExpenseLogModal && (
              <View
                style={{
                  position: 'fixed' as any,
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  zIndex: 99999999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 16,
                }}
              >
                <View
                  style={{
                    width: '100%',
                    maxWidth: 560,
                    maxHeight: '88vh' as any,
                    backgroundColor: '#FFFFFF',
                    borderRadius: 20,
                    padding: 20,
                    gap: 14,
                    boxShadow: '0 20px 40px rgba(0,0,0,0.2)' as any,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Clock size={18} color="#1A73E8" />
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#1B2420' }}>
                        Nhật ký Ghi
                      </Text>
                    </View>
                    <Pressable
                      testID="btn-close-log-modal"
                      onPress={() => setShowExpenseLogModal(false)}
                      style={{ padding: 4, cursor: 'pointer' as any }}
                    >
                      <X size={18} color="#5F6368" />
                    </Pressable>
                  </View>

                  {/* Thanh lọc theo ngày */}
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Pressable
                      testID="filter-log-all"
                      onPress={() => setFilterLogDay('all')}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 8,
                        backgroundColor: filterLogDay === 'all' ? '#1A73E8' : '#F1F3F4',
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: filterLogDay === 'all' ? '#FFFFFF' : '#5F6368' }}>
                        Tất cả ({expenseLogs.length})
                      </Text>
                    </Pressable>
                    {Array.from({ length: daysCount }, (_, i) => i + 1).map((d) => {
                      const count = expenseLogs.filter((l) => l.dayNumber === d).length;
                      const isFilterActive = filterLogDay === d;
                      return (
                        <Pressable
                          key={d}
                          testID={`filter-log-day-${d}`}
                          onPress={() => setFilterLogDay(d)}
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 8,
                            backgroundColor: isFilterActive ? '#1A73E8' : '#F1F3F4',
                            cursor: 'pointer' as any,
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: isFilterActive ? '#FFFFFF' : '#5F6368' }}>
                            Ngày {d} ({count})
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Summary bar */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#E8F0FE', padding: 10, borderRadius: 12 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#1A73E8' }}>
                      Tổng thực tế: {(totalActual / 1000).toLocaleString('vi-VN')}k ({expenseLogs.length} khoản chi)
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {canEditBudget !== false && (
                        <Pressable
                          onPress={() => {
                            setShowExpenseLogModal(false);
                            openAddExpenseModal(filterLogDay === 'all' ? activeDay : filterLogDay);
                          }}
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 6,
                            backgroundColor: '#137333',
                            cursor: 'pointer' as any,
                          }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>+ Ghi thêm</Text>
                        </Pressable>
                      )}
                      {canEditBudget !== false && expenseLogs.length > 0 && (
                        <Pressable
                          onPress={handleClearAllLogs}
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 6,
                            backgroundColor: '#FCE8E6',
                            cursor: 'pointer' as any,
                          }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#C5221F' }}>Xóa tất cả</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>

                  {/* List of items */}
                  <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={true}>
                    {(() => {
                      const displayedLogs = filterLogDay === 'all'
                        ? expenseLogs
                        : expenseLogs.filter((l) => l.dayNumber === filterLogDay);

                      if (displayedLogs.length === 0) {
                        return (
                          <View style={{ paddingVertical: 30, alignItems: 'center', gap: 8 }}>
                            <ShoppingBag size={28} color="#DADCE0" />
                            <Text style={{ fontSize: 13, color: '#80868B', fontWeight: '500' }}>
                              Chưa có khoản chi tiêu nào{filterLogDay !== 'all' ? ` cho Ngày ${filterLogDay}` : ''}.
                            </Text>
                            {canEditBudget !== false && (
                              <Pressable
                                onPress={() => {
                                  setShowExpenseLogModal(false);
                                  openAddExpenseModal(filterLogDay === 'all' ? activeDay : filterLogDay);
                                }}
                                style={{
                                  marginTop: 6,
                                  paddingHorizontal: 12,
                                  paddingVertical: 6,
                                  borderRadius: 8,
                                  backgroundColor: '#137333',
                                  cursor: 'pointer' as any,
                                }}
                              >
                                <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>
                                  + Ghi nhận chi tiêu ngay
                                </Text>
                              </Pressable>
                            )}
                          </View>
                        );
                      }

                      return (
                        <View style={{ gap: 8 }}>
                          {displayedLogs.map((log) => (
                            <View
                              key={log.id}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: 10,
                                borderRadius: 12,
                                backgroundColor: '#F8F9FA',
                                borderWidth: 1,
                                borderColor: 'rgba(27,36,32,0.06)',
                                gap: 10,
                              }}
                            >
                              <View style={{ flex: 1, gap: 3 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <View
                                    style={{
                                      paddingHorizontal: 6,
                                      paddingVertical: 2,
                                      borderRadius: 4,
                                      backgroundColor: '#E8F0FE',
                                    }}
                                  >
                                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#1A73E8' }}>
                                      Ngày {log.dayNumber}
                                    </Text>
                                  </View>
                                  <View
                                    style={{
                                      paddingHorizontal: 6,
                                      paddingVertical: 2,
                                      borderRadius: 4,
                                      backgroundColor: '#E6F4EA',
                                    }}
                                  >
                                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#137333' }}>
                                      {log.categoryLabel}
                                    </Text>
                                  </View>
                                  {(log.isEdited || (log.editHistory && log.editHistory.length > 0)) && (
                                    <View
                                      style={{
                                        paddingHorizontal: 6,
                                        paddingVertical: 2,
                                        borderRadius: 4,
                                        backgroundColor: '#FEF3C7',
                                        borderWidth: 1,
                                        borderColor: '#FDE68A',
                                      }}
                                    >
                                      <Text style={{ fontSize: 9, fontWeight: '700', color: '#B45309' }}>
                                        Đã sửa
                                      </Text>
                                    </View>
                                  )}
                                  <Text style={{ fontSize: 10, color: '#80868B' }}>
                                    {log.timestamp}
                                  </Text>
                                </View>
                                <Text style={{ fontSize: 13, fontWeight: '800', color: '#202124' }}>
                                  {log.placeName}
                                </Text>
                                {log.note ? (
                                  <Text style={{ fontSize: 11, color: '#5F6368' }}>
                                    {log.note}
                                  </Text>
                                ) : null}
                                {(log.editHistory && log.editHistory.length > 0) ? (
                                  <View style={{ marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
                                    <Text style={{ fontSize: 9, color: '#80868B', fontWeight: '700', marginBottom: 2 }}>
                                      Lịch sử sửa ({log.editHistory.length}):
                                    </Text>
                                    {log.editHistory.map((h, idx) => (
                                      <Text key={idx} style={{ fontSize: 9, color: '#9AA0A6' }}>
                                        • {new Date(h.editedAt).toLocaleString('vi-VN')}{h.previousAmount != null ? `: ${(h.previousAmount/1000).toLocaleString('vi-VN')}k` : ''}{h.previousPlaceName ? ` — ${h.previousPlaceName}` : ''}
                                      </Text>
                                    ))}
                                  </View>
                                ) : null}
                              </View>

                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#137333' }}>
                                    +{(log.amount / 1000).toLocaleString('vi-VN')}k
                                  </Text>

                                  {/* Nút SỬA (thích sửa lúc nào cũng được) */}
                                  {canEditBudget !== false && (
                                    <Pressable
                                      testID={`btn-edit-log-${log.id}`}
                                      onPress={() => openEditExpenseLog(log)}
                                      style={{
                                        padding: 6,
                                        borderRadius: 6,
                                        backgroundColor: '#E8F0FE',
                                        cursor: 'pointer' as any,
                                      }}
                                      accessibilityLabel="Sửa bản ghi này"
                                    >
                                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#1A73E8' }}>✏️ Sửa</Text>
                                    </Pressable>
                                  )}

                                  {/* Nút XÓA (để sửa sai) */}
                                  {canEditBudget !== false && (
                                    <Pressable
                                      testID={`btn-delete-log-${log.id}`}
                                      onPress={() => handleDeleteLog(log.id)}
                                      style={{
                                        padding: 6,
                                        borderRadius: 6,
                                        backgroundColor: '#FCE8E6',
                                        cursor: 'pointer' as any,
                                      }}
                                      accessibilityLabel="Xóa bản ghi này"
                                    >
                                      <Trash2 size={13} color="#C5221F" />
                                    </Pressable>
                                  )}
                                </View>
                            </View>
                          ))}
                        </View>
                      );
                    })()}
                  </ScrollView>

                  <Pressable
                    onPress={() => setShowExpenseLogModal(false)}
                    style={{
                      paddingVertical: 10,
                      alignItems: 'center',
                      borderRadius: 10,
                      backgroundColor: '#F1F3F4',
                      cursor: 'pointer' as any,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#3C4043' }}>Đóng</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* ── FLOATING TOAST THÔNG BÁO TỐI ƯU HÓA LỊCH TRÌNH ── */}
      {toastMsg && (
        <View
          testID="workspace-toast"
          {...({ 'data-testid': 'workspace-toast' } as any)}
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
            <Text
              testID="workspace-toast-text"
              {...({ 'data-testid': 'workspace-toast-text' } as any)}
              style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}
            >
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
