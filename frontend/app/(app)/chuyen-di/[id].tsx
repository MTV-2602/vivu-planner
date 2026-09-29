import { useState, useEffect, useRef, useContext, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Modal, Alert, ActivityIndicator, Platform, Linking, Share,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Compass, ArrowLeft, AlertTriangle, Calendar, Wallet, MapPin,
  Sparkles, Clock, Map, Utensils, Home, Bike, Check, X,
  HelpCircle, ChevronRight, Activity, ThermometerSun, Trash2, PenLine,
  Shield, Share2, Crown, Plus, Lock,
} from 'lucide-react-native';
import { api } from '../../../lib/api';
import { getCache, setCache } from '../../../lib/cache';
import { useAuth } from '../../../hooks/useAuth';
import { ChatbotContext } from '../../../context/ChatbotContext';
import { useDistanceToCity } from '../../../hooks/useLocation';
import Reveal from '../../../components/Reveal';
import SystemClock from '../../../components/SystemClock';
import BackToTop from '../../../components/BackToTop';
import { BRAND_COLORS, ItineraryItemType, APP_ROUTES } from '../../../constants';
import InteractiveMap, { MapItem } from '../../../components/InteractiveMap';
import GoogleMapsRoutePlanner, { RouteWaypoint } from '../../../components/map/GoogleMapsRoutePlanner';
import GoogleCalendarWorkspace, { CalendarEventItem } from '../../../components/workspace/GoogleCalendarWorkspace';
import { getCuratedPlacesForCity } from '../../../constants/curatedPlaces';
import ShareModal from '../../../components/ShareModal';
import BookingModal, { BookableItem } from '../../../components/BookingModal';
import PremiumModal from '../../../components/PremiumModal';
import ConfirmModal from '../../../components/ConfirmModal';
import AppToast, { AppToastMessage } from '../../../components/AppToast';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ItineraryItem {
  id: string; item_type: string; title: string; description: string;
  start_time?: string; end_time?: string; location_name: string;
  estimated_cost?: number | null; status: string; order_index: number;
  google_place_id?: string | null; booking_url?: string | null;
}
interface ItineraryDay {
  id: string; day_number: number; date: string;
  weather_summary?: { note?: string }; notes?: string; items: ItineraryItem[];
}
interface TripDetailData {
  id: string; title: string; destination_city: string;
  start_date: string; end_date: string; budget_total: number;
  traveler_count: number; traveler_type: string; status: string;
  days: ItineraryDay[]; revisions?: any[]; is_free_tier?: boolean;
  preferences?: any; budget_breakdown?: any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(s: string) {
  if (!s) return '';
  if (s.includes('T')) {
    return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(s));
  }
  const p = s.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}` : s;
}
function hasOfficialCost(c?: number | null) { return c !== undefined && c !== null && Number.isFinite(Number(c)); }
function formatCost(c?: number | null, itemType?: string) {
  if (!hasOfficialCost(c)) {
    if (itemType === ItineraryItemType.ACCOMMODATION || itemType === ItineraryItemType.RENTAL) return 'Cần xác nhận giá';
    return 'Chưa cập nhật';
  }
  let costVal = Number(c);
  if (costVal > 0 && costVal < 10000) {
    costVal = costVal * 1000;
  }
  return costVal === 0 ? 'Miễn phí' : `${costVal.toLocaleString('vi-VN')}đ`;
}
function getItemTypeIcon(type: string) {
  const props = { size: 14, color: BRAND_COLORS.primary };
  switch (type) {
    case ItineraryItemType.ACCOMMODATION: return <Home {...props} />;
    case ItineraryItemType.TRANSPORT: case ItineraryItemType.RENTAL: return <Bike {...props} />;
    case ItineraryItemType.DINING: return <Utensils {...props} />;
    case ItineraryItemType.EXPERIENCE: return <Sparkles {...props} />;
    default: return <Map {...props} />;
  }
}
const ITEM_TYPE_LABELS: Record<string, string> = {
  [ItineraryItemType.ACCOMMODATION]: 'Chỗ nghỉ',
  [ItineraryItemType.TRANSPORT]: 'Di chuyển',
  [ItineraryItemType.DINING]: 'Ăn uống',
  [ItineraryItemType.ATTRACTION]: 'Tham quan',
  [ItineraryItemType.RENTAL]: 'Thuê xe',
  [ItineraryItemType.EXPERIENCE]: 'Trải nghiệm',
};

const TRAVELER_TYPE_LABELS: Record<string, string> = {
  solo: 'Đi một mình',
  couple: 'Cặp đôi',
  family: 'Gia đình',
  friends: 'Nhóm bạn',
  other: 'Khác',
};

// ─── SelectPicker ─────────────────────────────────────────────────────────────
interface SelectOption { value: string; label: string; }
function SelectPicker({ options, value, onChange }: { options: SelectOption[]; value: string; onChange: (v: string) => void }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map(opt => (
        <Pressable
          key={opt.value}
          onPress={() => onChange(opt.value)}
          className={`px-3 py-2 rounded-xl border ${value === opt.value ? 'bg-brand-primary border-brand-primary' : 'bg-brand-bg border-brand-line'}`}
        >
          <Text className={`text-xs font-semibold ${value === opt.value ? 'text-white' : 'text-brand-textSoft'}`}>{opt.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── TimeInput ────────────────────────────────────────────────────────────────
function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  if (Platform.OS === 'web') {
    return (
      // @ts-ignore
      <input type="time" value={value} onChange={(e: any) => onChange(e.target.value)}
        style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(27,36,32,0.12)', fontSize: 14, fontWeight: 600, backgroundColor: '#FBF5EA', outline: 'none', color: '#1B2420' }}
      />
    );
  }
  return (
    <TextInput value={value} onChangeText={onChange} placeholder="HH:MM"
      className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm font-semibold bg-brand-bg text-brand-text"
      placeholderTextColor={BRAND_COLORS.textMuted}
    />
  );
}

// ─── ModalShell ───────────────────────────────────────────────────────────────
function ModalShell({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 bg-brand-bgDark/60 items-center justify-center p-6"
        style={{ backgroundColor: 'rgba(20,32,27,0.6)' }}
        onPress={onClose}
      >
        <Pressable onPress={e => e.stopPropagation()} className="w-full max-w-lg">
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const scrollRef = useRef<ScrollView>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [activeTabId, setActiveTabId] = useState('');
  const [adaptationDiff, setAdaptationDiff] = useState('');
  const [cachedTrip, setCachedTrip] = useState<TripDetailData | null>(null);

  // Disruption modal
  const [disruptionOpen, setDisruptionOpen] = useState(false);
  const [disruptionType, setDisruptionType] = useState('weather_change');
  const [disruptionDesc, setDisruptionDesc] = useState('');
  const [disruptionDayId, setDisruptionDayId] = useState('');

  // Preview modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [proposedItinerary, setProposedItinerary] = useState<any>(null);
  const [proposedDiff, setProposedDiff] = useState('');
  const [previousSnapshot, setPreviousSnapshot] = useState<any>(null);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [displayedItems, setDisplayedItems] = useState<any[]>([]);
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, string>>({});

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [isAddingNewItem, setIsAddingNewItem] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editStatus, setEditStatus] = useState('planned');
  const [editItemType, setEditItemType] = useState('attraction');

  // AI replace modal
  const [aiReplaceOpen, setAiReplaceOpen] = useState(false);
  const [aiReplaceItem, setAiReplaceItem] = useState<any>(null);
  const [replaceTab, setReplaceTab] = useState<'manual' | 'ai'>('manual');
  const [replaceCategory, setReplaceCategory] = useState<string>('all');
  const [replaceSearchQuery, setReplaceSearchQuery] = useState<string>('');
  const [poolPlaces, setPoolPlaces] = useState<any[]>([]);
  const [loadingPool, setLoadingPool] = useState<boolean>(false);
  const [aiAlternatives, setAiAlternatives] = useState<any[]>([]);
  const [aiRequirement, setAiRequirement] = useState('');
  const [fetchingAlts, setFetchingAlts] = useState(false);

  // App Toast state
  const [appToast, setAppToast] = useState<AppToastMessage | null>(null);

  // New features state
  const [showMapView, setShowMapView] = useState(true);
  const [mapMode, setMapMode] = useState<'gmaps' | 'overview'>('gmaps');
  const [showShareModal, setShowShareModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
  } | null>(null);
  const [selectedBookingItems, setSelectedBookingItems] = useState<BookableItem[]>([]);

  useEffect(() => {
    if (id) {
      getCache<TripDetailData>(`trip_${id}`).then(data => { if (data) setCachedTrip(data); });
    }
  }, [id]);

  const { data: trip, isLoading, isError, refetch } = useQuery<TripDetailData>({
    queryKey: ['trip', id],
    queryFn: async () => {
      const r = await api.get(`/trips/${id}`);
      await setCache(`trip_${id}`, r.data);
      return r.data;
    },
    placeholderData: cachedTrip ?? undefined,
  });

  const { data: statusData, refetch: refetchStatus } = useQuery({
    queryKey: ['paymentStatusTripDetail'],
    queryFn: async () => {
      const res = await api.get('/payment/status');
      return res.data;
    }
  });

  const tripData = trip ?? cachedTrip;
  const isLocked = !statusData?.isPremium;
  const isUserPro = Boolean(statusData?.isPremium || isAdmin);
  const { distanceKm, loading: locLoading } = useDistanceToCity(tripData?.destination_city ?? '');

  const { setTripId, registerPreviewTrigger, unregisterPreviewTrigger, openChatbot } = useContext(ChatbotContext);

  useEffect(() => {
    if (id) {
      setTripId(id);
    }
    return () => setTripId(null);
  }, [id, setTripId]);

  useEffect(() => {
    if (aiReplaceOpen && trip?.destination_city && poolPlaces.length === 0) {
      setLoadingPool(true);
      api.post('/trips/pregen-places', {
        destination_city: trip.destination_city,
        days_count: trip.days?.length || 2,
        budget_total: trip.budget_total || 5000000,
        preferences: trip.preferences ? Object.keys(trip.preferences).filter(k => (trip.preferences as any)[k] === true) : ['Ẩm thực', 'Khám phá'],
      }).then(r => {
        if (r.data?.places && Array.isArray(r.data.places)) {
          setPoolPlaces(r.data.places);
        }
      }).catch(err => {
        console.warn('Could not fetch rich pool for replace:', err);
      }).finally(() => {
        setLoadingPool(false);
      });
    }
  }, [aiReplaceOpen, trip?.destination_city, poolPlaces.length]);

  useEffect(() => {
    registerPreviewTrigger((adaptedItinerary, diff, previousSnapshot) => {
      setProposedItinerary(adaptedItinerary);
      setProposedDiff(diff);
      setPreviousSnapshot(previousSnapshot);
      
      const allNew: any[] = [];
      const displayedList: any[] = [];
      
      if (trip?.days?.length) {
        const sorted = [...trip.days].sort((a, b) => a.day_number - b.day_number);
        setDisruptionDayId(sorted[0].id);
      }
      
      const normalizeString = (s: string) => {
        if (!s) return '';
        return s.trim().toLowerCase().replace(/\s+/g, ' ');
      };

      adaptedItinerary.days.forEach((day: any) => {
        // Find corresponding original day and its items
        const origDay = trip?.days?.find((d: any) => Number(d.day_number) === Number(day.day_number));
        const origItems = origDay?.items || [];

        day.items.forEach((item: any, i: number) => {
          const tempId = `temp-${day.day_number}-${i}`;
          const itemWithMeta = { ...item, day_number: day.day_number, temp_id: tempId };
          allNew.push(itemWithMeta);

          // Check if this item is unchanged compared to original day items
          const isUnchanged = origItems.some((orig: any) => 
            normalizeString(orig.title) === normalizeString(item.title)
          );

          if (!isUnchanged) {
            displayedList.push(itemWithMeta);
          }
        });
      });
      
      setSelectedItems(allNew);
      setDisplayedItems(displayedList);
      setDisruptionType('other');
      setDisruptionDesc('AI điều chỉnh lịch trình qua Chatbot');
      setDisruptionOpen(false);
      setPreviewOpen(true);
      setQuestionAnswers({});
    });
    return () => unregisterPreviewTrigger();
  }, [registerPreviewTrigger, unregisterPreviewTrigger, trip]);

  useEffect(() => {
    if (trip?.days?.length && !activeTabId) {
      const sorted = [...trip.days].sort((a, b) => a.day_number - b.day_number);
      setActiveTabId(sorted[0].id);
      setDisruptionDayId(sorted[0].id);
    }
  }, [trip]);

  const previewMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await api.post(`/trips/${id}/disruptions/preview`, payload);
      return r.data;
    },
    onSuccess: (data) => {
      setProposedItinerary(data.adaptedItinerary);
      setProposedDiff(data.diff);
      setPreviousSnapshot(data.previousSnapshot);
      const allNew: any[] = [];
      const affDay = trip?.days.find(d => d.id === disruptionDayId)?.day_number ?? 1;
      data.adaptedItinerary.days.forEach((day: any) => {
        if (Number(day.day_number) >= affDay) {
          day.items.forEach((item: any, i: number) => {
            allNew.push({ ...item, day_number: day.day_number, temp_id: `temp-${day.day_number}-${i}` });
          });
        }
      });
      setSelectedItems(allNew);
      setDisruptionOpen(false);
      setPreviewOpen(true);
      setQuestionAnswers({});
    },
    onError: (err: any) => Alert.alert('Lỗi phân tích sự cố', err.response?.data?.error || err.message),
  });

  const applyMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await api.post(`/trips/${id}/disruptions/apply`, payload);
      return r.data;
    },
    onSuccess: () => {
      setPreviewOpen(false);
      setDisruptionDesc('');
      setProposedItinerary(null);
      setSelectedItems([]);
      setAdaptationDiff('Lịch trình đã được điều chỉnh thành công theo lựa chọn của bạn!');
      refetch();
    },
    onError: (err: any) => Alert.alert('Lỗi áp dụng lịch trình', err.response?.data?.error || err.message),
  });

  const editMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await api.put(`/trips/items/${editingItem.id}`, payload);
      return r.data;
    },
    onSuccess: () => { setEditOpen(false); refetch(); },
    onError: (err: any) => Alert.alert('Lỗi cập nhật', err.response?.data?.error || err.message),
  });

  const addItemMutation = useMutation({
    mutationFn: async (payload: any) => {
      const dayId = activeTabId || sortedDays[0]?.id;
      const r = await api.post(`/trips/days/${dayId}/items`, payload);
      return r.data;
    },
    onSuccess: () => { setEditOpen(false); refetch(); },
    onError: (err: any) => Alert.alert('Lỗi thêm hoạt động', err.response?.data?.error || err.message),
  });

  const aiReplaceMutation = useMutation({
    mutationFn: async ({ itemId, payload }: { itemId: string; payload: any }) => {
      const r = await api.put(`/trips/items/${itemId}`, payload);
      return r.data;
    },
    onSuccess: () => { setAiReplaceOpen(false); setAiReplaceItem(null); setAiAlternatives([]); refetch(); },
    onError: (err: any) => Alert.alert('Lỗi áp dụng gợi ý AI', err.response?.data?.error || err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => { await api.delete(`/trips/items/${itemId}`); },
    onSuccess: () => refetch(),
    onError: (err: any) => Alert.alert('Lỗi xóa hoạt động', err.response?.data?.error || err.message),
  });

  const deleteTripMutation = useMutation({
    mutationFn: async () => { await api.delete(`/trips/${id}`); },
    onSuccess: () => {
      router.replace(isAdmin ? (APP_ROUTES.ADMIN as any) : (APP_ROUTES.TRIPS as any));
    },
    onError: (err: any) => Alert.alert('Lỗi xóa chuyến đi', err.response?.data?.error || err.message),
  });

  const handleConfirmDeleteTrip = () => {
    setConfirmModal({
      visible: true,
      title: 'Xác nhận xóa chuyến đi',
      message: `Bạn có chắc chắn muốn xóa chuyến đi "${tripData?.title}"? Hành động này không thể hoàn tác.`,
      isDestructive: true,
      onConfirm: () => {
        deleteTripMutation.mutate();
        setConfirmModal(null);
      }
    });
  };

  const handleSaveDayRouteOrder = async (dayId: string, newWaypoints: RouteWaypoint[]) => {
    try {
      const itemIds = newWaypoints.map(w => w.id);
      await api.put(`/trips/days/${dayId}/reorder-items`, { item_ids: itemIds });
      refetch();
      setAppToast({ text: 'Đã lưu thứ tự lộ trình Google Maps thành công!', type: 'success' });
    } catch (err: any) {
      console.error('Failed to reorder items:', err);
      setAppToast({ text: 'Không thể lưu thứ tự hoạt động: ' + (err.message || 'Lỗi kết nối'), type: 'error' });
    }
  };

  const openEdit = (item: any) => {
    setIsAddingNewItem(false);
    setEditingItem(item);
    setEditTitle(item.title);
    setEditDesc(item.description || '');
    setEditStartTime(item.start_time ? item.start_time.substring(0, 5) : '');
    setEditEndTime(item.end_time ? item.end_time.substring(0, 5) : '');
    setEditCost(item.estimated_cost == null ? '' : String(item.estimated_cost));
    setEditStatus(item.status);
    setEditItemType(item.item_type);
    setEditOpen(true);
  };

  const openAddItem = () => {
    setIsAddingNewItem(true);
    setEditingItem({ id: 'new' });
    setEditTitle('');
    setEditDesc('');
    setEditStartTime('09:00');
    setEditEndTime('11:00');
    setEditCost('');
    setEditStatus('planned');
    setEditItemType('attraction');
    setEditOpen(true);
  };

  const confirmDelete = (itemId: string, title: string) => {
    setConfirmModal({
      visible: true,
      title: 'Xác nhận xóa hoạt động',
      message: `Bạn có chắc muốn xóa hoạt động "${title}"?`,
      isDestructive: true,
      onConfirm: () => {
        deleteMutation.mutate(itemId);
        setConfirmModal(null);
      }
    });
  };

  const handleResubmitWithAnswers = () => {
    const answersStr = (proposedItinerary?.missing_info_questions || [])
      .map((q: string, i: number) => questionAnswers[i]?.trim() ? `- Q: ${q}\n  A: ${questionAnswers[i].trim()}` : '')
      .filter(Boolean).join('\n');
    if (!answersStr) { Alert.alert('', 'Vui lòng điền câu trả lời trước khi gửi lại.'); return; }
    previewMutation.mutate({
      disruption_type: disruptionType,
      description: `${disruptionDesc}\n\n[Thông tin bổ sung]:\n${answersStr}`,
      day_id: disruptionDayId || null,
    });
  };

  // Chuyển đổi dữ liệu ngày và hoạt động từ Supabase sang CalendarEventItem[] cho Không gian Lập lịch ViVu
  const calendarEvents = useMemo(() => {
    if (!trip?.days) return [];
    const evs: CalendarEventItem[] = [];
    const sorted = [...trip.days].sort((a, b) => a.day_number - b.day_number);

    sorted.forEach((day) => {
      const dayItems = (day.items || [])
        .filter((it: any) => it.status !== 'replaced' && it.status !== 'skipped')
        .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0));

      dayItems.forEach((it: any, idx: number) => {
        let startH = 8 + (idx * 2);
        let startM = 0;
        let dur = 90;

        if (it.start_time) {
          const match = it.start_time.match(/(\d{1,2}):(\d{2})/);
          if (match) {
            startH = parseInt(match[1], 10);
            startM = parseInt(match[2], 10);
          }
        }
        if (it.end_time && it.start_time) {
          const matchEnd = it.end_time.match(/(\d{1,2}):(\d{2})/);
          if (matchEnd) {
            const endH = parseInt(matchEnd[1], 10);
            const endM = parseInt(matchEnd[2], 10);
            const totalEndM = endH * 60 + endM;
            const totalStartM = startH * 60 + startM;
            if (totalEndM > totalStartM) {
              dur = totalEndM - totalStartM;
            }
          }
        }

        let costVal = Number(it.estimated_cost) || 0;
        if (costVal > 0 && costVal < 10000) costVal *= 1000;

        evs.push({
          id: it.id,
          placeId: it.google_place_id || it.id,
          title: it.title,
          category: it.item_type || 'attraction',
          address: it.location_name || '',
          lat: it.location_lat,
          lng: it.location_lng,
          cost: costVal,
          dayNumber: day.day_number,
          startHour: Math.max(7, Math.min(21, startH)),
          startMinute: startM,
          durationMinutes: dur,
          notes: it.description || '',
        });
      });
    });

    return evs;
  }, [trip]);

  // Danh sách địa điểm gợi ý sẵn sàng cho khay chờ nếu người dùng muốn thêm/thay thế
  const standbySuggestions = useMemo(() => {
    // 1. User thường KHÔNG có giỏ hàng chờ xếp lịch (Giỏ hàng khóa cho Pro)
    if (!isUserPro) return [];

    // 2. Chuyến đi tạo nhanh 1-Click (creation_mode === 'ai_auto' hoặc không có giỏ ban đầu)
    const creationMode = trip?.preferences?.creation_mode || 'ai_auto';
    if (creationMode === 'ai_auto') {
      return [];
    }

    // 3. Chuyến đi tạo từ Bản đồ Pro (manual):
    // Chỉ lấy những địa điểm trong giỏ ban đầu mà CHƯA xếp vào lịch trình ("mấy cái chưa hết")
    const candidatePool = (trip?.preferences?.candidate_pool as any[]) || [];
    const existingTitles = new Set(calendarEvents.map((e) => (e.title || '').toLowerCase().trim()));

    if (Array.isArray(candidatePool) && candidatePool.length > 0) {
      return candidatePool
        .filter((p) => !existingTitles.has((p.name || '').toLowerCase().trim()))
        .map((p) => ({
          id: p.id || String(Math.random()),
          name: p.name,
          category: p.category || 'attraction',
          address: p.address || '',
          lat: p.lat,
          lng: p.lng,
          cost: p.estimated_cost || 50000,
          suggestedDuration: 90,
        }));
    }

    return [];
  }, [isUserPro, trip, calendarEvents]);

  const handleSaveCalendarWorkspace = async (newEvents: CalendarEventItem[]) => {
    try {
      await api.put(`/trips/${id}/sync-calendar`, { events: newEvents });
      await refetch();
      setAppToast({ text: '✓ Đã lưu lịch trình và đồng bộ thời gian thành công!', type: 'success' });
    } catch (err: any) {
      console.error('Failed to sync calendar:', err);
      setAppToast({
        text: 'Lỗi lưu lịch trình: ' + (err.response?.data?.error || err.message || 'Lỗi server'),
        type: 'error',
      });
    }
  };

  // ── Loading / Error states ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View className="flex-1 bg-brand-bg items-center justify-center gap-4">
        <ActivityIndicator size="large" color={BRAND_COLORS.primary} />
        <Text className="text-sm font-semibold text-brand-textSoft">Đang tải lịch trình...</Text>
      </View>
    );
  }
  if (isError || !trip) {
    return (
      <View className="flex-1 bg-brand-bg items-center justify-center px-6 gap-6">
        <AlertTriangle size={64} color={BRAND_COLORS.danger} />
        <Text className="text-2xl font-bold text-brand-text">Không tìm thấy chuyến đi</Text>
        <Text className="text-sm text-brand-textSoft text-center">Lịch trình không tồn tại hoặc bạn không có quyền truy cập.</Text>
        <Pressable onPress={() => router.push(isAdmin ? (APP_ROUTES.ADMIN as any) : (APP_ROUTES.TRIPS as any))} className="flex-row items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-primary">
          <ArrowLeft size={16} color="white" />
          <Text className="text-white font-bold">Quay lại {isAdmin ? 'Quản trị' : 'danh sách'}</Text>
        </Pressable>
      </View>
    );
  }

  const sortedDays = [...trip.days].sort((a, b) => a.day_number - b.day_number);
  const activeDay = trip.days.find(d => d.id === activeTabId);
  const activeItems = activeDay ? [...activeDay.items].sort((a, b) => a.order_index - b.order_index) : [];

  // ── Spent/Remaining Budget Calculations ────────────────────────────────────
  const dailySpent: Record<string, number> = {};
  sortedDays.forEach(day => {
    let spent = 0;
    if (day.items) {
      day.items.forEach((item: any) => {
        if (item.status !== 'replaced' && item.status !== 'skipped' && item.estimated_cost) {
          let costVal = Number(item.estimated_cost) || 0;
          if (costVal > 0 && costVal < 10000) {
            costVal = costVal * 1000;
          }
          spent += costVal;
        }
      });
    }
    dailySpent[day.id] = spent;
  });

  const dailyRemaining: Record<string, number> = {};
  let currentRemaining = trip.budget_total;
  sortedDays.forEach(day => {
    const spent = dailySpent[day.id] || 0;
    currentRemaining = currentRemaining - spent;
    dailyRemaining[day.id] = Math.max(0, currentRemaining);
  });

  const formatVND = (num: number) => {
    return `${num.toLocaleString('vi-VN')}đ`;
  };

  const handleExportPDF = async () => {
    if (isLocked) {
      setShowPremiumModal(true);
      return;
    }
    if (Platform.OS === 'web') {
      const runHtml2Pdf = () => {
        const htmlString = `
          <div style="font-family: 'Be Vietnam Pro', 'Helvetica Neue', Arial, sans-serif; padding: 32px; color: #0F172A; background-color: #ffffff; width: 794px; margin: 0 auto; box-sizing: border-box;">
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap');
            </style>
            
            <!-- PDF Header Bar -->
            <div style="border-bottom: 2px solid #059669; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <span style="font-size: 10px; font-weight: 800; color: #059669; background-color: #ECFDF5; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px;">Kế hoạch du lịch</span>
                <h1 style="margin: 8px 0 4px 0; font-size: 24px; font-weight: 800; color: #064E3B; letter-spacing: -0.3px;">${trip.title}</h1>
                <p style="margin: 0; font-size: 13px; font-weight: 500; color: #475569;">📍 Điểm đến: <strong style="color: #0F172A;">${trip.destination_city}</strong></p>
              </div>
              <div style="text-align: right;">
                <h2 style="margin: 0 0 2px 0; font-size: 20px; font-weight: 800; color: #059669;">ViVu Planner</h2>
                <p style="margin: 0; font-size: 11px; font-weight: 500; color: #64748B;">Lịch trình du lịch thông minh</p>
              </div>
            </div>
            
            <!-- Metadata Info Grid -->
            <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px 18px; margin-bottom: 24px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px;">
              <span style="font-size: 12px; color: #334155;">📅 <strong>Thời gian:</strong> ${formatDate(trip.start_date)} — ${formatDate(trip.end_date)}</span>
              <span style="font-size: 12px; color: #334155;">💰 <strong>Ngân sách:</strong> <strong style="color: #059669;">${formatVND(trip.budget_total)}</strong></span>
              <span style="font-size: 12px; color: #334155;">👥 <strong>Thành viên:</strong> ${trip.traveler_count} khách (${trip.traveler_type})</span>
            </div>
            
            ${sortedDays.map(day => {
              const spentVal = dailySpent[day.id] || 0;
              const remainingVal = dailyRemaining[day.id] || 0;
              const items = (day.items || [])
                .sort((a, b) => a.order_index - b.order_index)
                .filter(item => item.status !== 'replaced' && item.status !== 'skipped');

              const itemsHtml = items.length === 0
                ? `<div style="font-size: 12px; color: #777777; font-style: italic; padding: 10px 0;">Chưa có hoạt động nào được lên lịch.</div>`
                : items.map(item => {
                    const timeStr = item.start_time ? `<span style="font-size: 11px; font-weight: bold; color: #666666; margin-left: 8px;">⏱️ ${item.start_time.substring(0, 5)}${item.end_time ? ` - ${item.end_time.substring(0, 5)}` : ''}</span>` : '';
                    const costStr = hasOfficialCost(item.estimated_cost) ? `<span style="font-size: 12px; font-weight: bold; color: #14201B;">${formatCost(item.estimated_cost, item.item_type)}</span>` : '';
                    return `
                      <div style="border: 1px solid #eeeeee; border-radius: 8px; padding: 12px; margin-bottom: 12px; background-color: #ffffff;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                          <div style="display: flex; align-items: center;">
                            <span style="font-size: 9px; font-weight: bold; color: #14201B; background-color: #e2f0ea; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">
                              ${ITEM_TYPE_LABELS[item.item_type] || 'Khác'}
                            </span>
                            ${timeStr}
                          </div>
                          ${costStr}
                        </div>
                        <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: bold; color: #111111;">${item.title}</h4>
                        ${item.description ? `<p style="margin: 0; font-size: 12px; color: #555555; line-height: 1.4;">${item.description}</p>` : ''}
                      </div>
                    `;
                  }).join('');

              const weatherHtml = day.weather_summary?.note
                ? `<div style="background-color: #f9f9f9; padding: 10px; border-radius: 6px; margin-bottom: 12px; border-left: 3px solid #14201B; font-size: 11px; font-style: italic; color: #555555;">☀️ Thời tiết: ${day.weather_summary.note}</div>`
                : '';

              return `
                <div style="margin-bottom: 30px; page-break-inside: avoid;">
                  <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #dddddd; padding-bottom: 6px; margin-bottom: 12px;">
                    <h3 style="margin: 0; font-size: 16px; font-weight: bold; color: #14201B;">Ngày 0${day.day_number}: ${formatDate(day.date)}</h3>
                    <div style="font-size: 11px; color: #555555;">
                      <span>Dự kiến: <strong>${formatVND(spentVal)}</strong></span>
                      <span style="margin: 0 6px;">|</span>
                      <span>Còn lại: <strong>${formatVND(remainingVal)}</strong></span>
                    </div>
                  </div>
                  ${weatherHtml}
                  ${itemsHtml}
                </div>
              `;
            }).join('')}
          </div>
        `;

        const opt = {
          margin:       12,
          filename:     `${trip.title || 'lich-trinh'}.pdf`,
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { 
            scale: 2, 
            useCORS: true, 
            logging: true,
            scrollX: 0,
            scrollY: 0
          },
          jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        // @ts-ignore
        html2pdf().set(opt).from(htmlString).save().catch((err: any) => {
          console.error("PDF generation failed:", err);
          window.print();
        });
      };

      // @ts-ignore
      if (typeof html2pdf !== 'undefined') {
        runHtml2Pdf();
      } else {
        // Load html2pdf from CDN dynamically
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        script.onload = () => {
          runHtml2Pdf();
        };
        script.onerror = () => {
          window.print();
        };
        document.body.appendChild(script);
      }
    } else {
      try {
        const daysText = sortedDays.map(day => {
          const itemsText = (day.items || [])
            .sort((a, b) => a.order_index - b.order_index)
            .filter(item => item.status !== 'replaced' && item.status !== 'skipped')
            .map(item => {
              const timeStr = item.start_time ? `[${item.start_time.substring(0, 5)}${item.end_time ? ` - ${item.end_time.substring(0, 5)}` : ''}] ` : '';
              const costStr = item.estimated_cost != null ? ` (Dự tính: ${formatCost(item.estimated_cost, item.item_type)})` : '';
              return `- ${timeStr}${item.title}: ${item.description || ''}${costStr}`;
            })
            .join('\n');
          
          const spentVal = dailySpent[day.id] || 0;
          const remainingVal = dailyRemaining[day.id] || 0;
          
          return `📅 Ngày 0${day.day_number} (${formatDate(day.date)})\n` +
                 `☀️ Thời tiết: ${day.weather_summary?.note || 'Chưa cập nhật'}\n` +
                 `💰 Chi tiêu ngày: ${formatVND(spentVal)} | Còn lại: ${formatVND(remainingVal)}\n` +
                 `${itemsText || '- Không có hoạt động nào'}\n`;
        }).join('\n');

        const message = `✈️ CẨM NANG DU LỊCH: ${trip.title.toUpperCase()}\n` +
          `📍 Điểm đến: ${trip.destination_city}\n` +
          `📅 Thời gian: ${formatDate(trip.start_date)} - ${formatDate(trip.end_date)}\n` +
          `💰 Tổng ngân sách: ${formatVND(trip.budget_total)}\n` +
          `👥 Thành viên: ${trip.traveler_count} người (${trip.traveler_type})\n\n` +
          `--- CHI TIẾT LỊCH TRÌNH ---\n\n${daysText}\n\nChúc bạn có một chuyến đi vui vẻ! - ViVu Planner`;

        await Share.share({
          message,
          title: `Lịch trình chuyến đi ${trip.title}`,
        });
      } catch (error: any) {
        Alert.alert('Lỗi chia sẻ', error.message);
      }
    }
  };

  // ── Disruption type options ───────────────────────────────────────────────
  const DISRUPTION_TYPES = [
    { value: 'weather_change', label: 'Thay đổi thời tiết' },
    { value: 'budget_shortage', label: 'Hụt ngân sách' },
    { value: 'health_issue', label: 'Vấn đề sức khỏe' },
    { value: 'delay', label: 'Trễ chuyến / Tắc nghẽn' },
    { value: 'other', label: 'Sự cố khác' },
  ];
  const dayOptions = sortedDays.map(d => ({ value: d.id, label: `Ngày 0${d.day_number} (${formatDate(d.date)})` }));
  const STATUS_OPTIONS = [
    { value: 'planned', label: 'Đang lên lịch' }, { value: 'confirmed', label: 'Đã xác nhận' },
    { value: 'skipped', label: 'Bỏ qua' }, { value: 'replaced', label: 'Đã thay thế' },
  ];
  const ITEM_TYPE_OPTIONS = Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => ({ value, label }));

  return (
    <View className="flex-1 bg-brand-bg">
      <View className="no-print flex-1">
        <ScrollView
        ref={scrollRef}
        className="flex-1"
        onScroll={e => setShowBackToTop(e.nativeEvent.contentOffset.y > 400)}
        scrollEventThrottle={200}
      >
        {/* Navbar */}
        <View className="bg-brand-bg border-b border-brand-line px-6 py-4">
          <View className="flex-row justify-between items-center">
            <Pressable onPress={() => router.push(isAdmin ? (APP_ROUTES.ADMIN_TRIPS as any) : (APP_ROUTES.TRIPS as any))} className="flex-row items-center gap-1.5" style={{ cursor: 'pointer' as any }}>
              <ArrowLeft size={16} color={BRAND_COLORS.textSoft} />
              <Text className="text-xs font-bold text-brand-textSoft">{isAdmin ? 'Quản lý Chuyến đi' : 'Bảng điều khiển'}</Text>
            </Pressable>
            <View className="flex-row items-center gap-3">
              <SystemClock />
              {(() => {
                const getRemainingDays = (dateStr: string) => {
                  if (!dateStr) return 0;
                  const diff = new Date(dateStr).getTime() - Date.now();
                  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
                };

                return (
                  <Pressable
                    onPress={() => setShowPremiumModal(true)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 16,
                      backgroundColor: statusData?.isPremium ? '#D4A017' : '#059669',
                      cursor: 'pointer' as any,
                    }}
                  >
                    {statusData?.isPremium ? (
                      <>
                        <Crown size={12} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
                          {statusData?.planName || 'ViVu Pro'} ({statusData?.premiumUntil ? `Còn ${getRemainingDays(statusData.premiumUntil)} ngày` : 'Vô hạn'}) ✨
                        </Text>
                      </>
                    ) : (
                      <>
                        <Sparkles size={12} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
                          Nâng cấp Pro 👑
                        </Text>
                      </>
                    )}
                  </Pressable>
                );
              })()}
              <Compass size={24} color={BRAND_COLORS.primary} />
              <Text className="font-display font-extrabold text-lg text-brand-primary">ViVu Planner</Text>
            </View>
          </View>
        </View>

        <View className="px-6 py-8 gap-8">
          {/* Admin banner */}
          {isAdmin && (
            <View className="p-4 rounded-2xl border border-brand-accent/30 bg-brand-accent/5 flex-row items-center justify-center gap-2">
              <Shield size={16} color={BRAND_COLORS.accent} />
              <Text className="text-brand-accentStrong text-xs font-bold text-center">Bạn đang xem với tư cách Quản trị viên (Chế độ chỉ đọc).</Text>
            </View>
          )}

          {/* AI adjustment notification */}
          {!!adaptationDiff && (
            <Reveal>
              <View className="p-5 rounded-2xl border border-brand-accent/30 bg-brand-accent/5 gap-3">
                <View className="flex-row items-center gap-1.5">
                  <Sparkles size={16} color={BRAND_COLORS.accent} />
                  <Text className="font-extrabold text-sm text-brand-accentStrong">Lịch trình vừa được AI điều chỉnh</Text>
                </View>
                <Text className="text-xs text-brand-textSoft font-serif italic">{adaptationDiff}</Text>
                <Pressable onPress={() => setAdaptationDiff('')} className="self-end px-3 py-1 rounded bg-brand-line/10">
                  <Text className="text-[10px] uppercase font-bold text-brand-textSoft">Đóng</Text>
                </Pressable>
              </View>
            </Reveal>
          )}

          {/* Trip header */}
          <View className="gap-4 border-b border-brand-line/30 pb-6">
            <View className="flex-row justify-between items-start flex-wrap gap-4">
              <View className="gap-3 flex-1">
                <View className="flex-row items-center gap-2 flex-wrap">
                  <View className="flex-row items-center gap-1.5 self-start px-3 py-1 rounded-full bg-brand-primary/10">
                    <MapPin size={14} color={BRAND_COLORS.primary} />
                    <Text className="text-brand-primary font-bold text-xs">{trip.destination_city}</Text>
                  </View>
                  {Boolean(trip.preferences?.is_ai_pro || (trip as any).is_ai_pro || trip.preferences?.ai_tier === 'pro') && (
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 10,
                      paddingVertical: 3.5,
                      borderRadius: 999,
                      backgroundColor: '#FFFBEB',
                      borderWidth: 1.5,
                      borderColor: '#F59E0B',
                      shadowColor: '#F59E0B',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.15,
                      shadowRadius: 4,
                    }}>
                      <Crown size={13} color="#D97706" />
                      <Text style={{ fontSize: 11, fontWeight: '900', color: '#B45309', letterSpacing: 0.5 }}>
                        LỊCH TRÌNH AI PRO 👑
                      </Text>
                    </View>
                  )}
                  {!locLoading && distanceKm !== null && (
                    <View className="flex-row items-center gap-1.5 self-start px-3 py-1 rounded-full bg-brand-bgAlt border border-brand-line/40">
                      <Activity size={12} color={BRAND_COLORS.textSoft} />
                      <Text className="text-brand-textSoft font-semibold text-xs">Cách bạn ~{distanceKm} km</Text>
                    </View>
                  )}
                </View>
                <Text className="font-display font-extrabold text-3xl text-brand-text">{trip.title}</Text>
                <View className="flex-row flex-wrap gap-4">
                  <View className="flex-row items-center gap-1.5">
                    <Calendar size={16} color={BRAND_COLORS.primary} />
                    <Text className="text-xs text-brand-textSoft font-semibold">{formatDate(trip.start_date)} — {formatDate(trip.end_date)}</Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <Wallet size={16} color={BRAND_COLORS.primary} />
                    <Text className="text-xs text-brand-textSoft font-semibold">
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(trip.budget_total)}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <Compass size={16} color={BRAND_COLORS.primary} />
                    <Text className="text-xs text-brand-textSoft font-semibold">
                      {trip.traveler_count} khách ({TRAVELER_TYPE_LABELS[String(trip.traveler_type || '').toLowerCase()] || trip.traveler_type})
                    </Text>
                  </View>
                </View>
              </View>
              <View className="flex-row gap-3 items-center flex-wrap">
                <Pressable onPress={handleExportPDF} className="flex-row items-center gap-2 px-5 py-3.5 rounded-xl bg-brand-primary">
                  <Share2 size={16} color="white" />
                  <Text className="text-white font-bold">
                    {Platform.OS === 'web' ? 'Tải PDF' : 'Chia sẻ'} {isLocked && '🔒'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowShareModal(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: '#f0ebe0', borderWidth: 1, borderColor: '#e0dbd0' }}
                >
                  <Text style={{ fontSize: 15 }}>🔗</Text>
                  <Text style={{ fontWeight: '700', color: '#1B3A2D', fontSize: 13 }}>Chia sẻ</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const allItems: BookableItem[] = trip.days.flatMap(day =>
                      day.items
                        .filter(item => ['accommodation', 'dining', 'attraction', 'rental'].includes(item.item_type))
                        .map(item => ({ ...item, day_number: day.day_number }))
                    );
                    setSelectedBookingItems(allItems);
                    setShowBookingModal(true);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: '#D4A017' }}
                >
                  <Text style={{ fontSize: 15 }}>⚡</Text>
                  <Text style={{ fontWeight: '800', color: '#fff', fontSize: 13 }}>1-Click Booking</Text>
                </Pressable>
                {!isAdmin && (
                  <>
                    <Pressable onPress={() => setDisruptionOpen(true)} className="flex-row items-center gap-2 px-5 py-3.5 rounded-xl bg-brand-danger">
                      <AlertTriangle size={16} color="white" />
                      <Text className="text-white font-bold">Báo sự cố</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleConfirmDeleteTrip}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }}
                    >
                      <Trash2 size={16} color={BRAND_COLORS.danger} />
                      <Text style={{ fontWeight: '700', color: BRAND_COLORS.danger, fontSize: 13 }}>Xóa</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          </View>

          {/* AI Pro VIP Exclusive Callout Banner */}
          {Boolean(trip.preferences?.is_ai_pro || (trip as any).is_ai_pro || trip.preferences?.ai_tier === 'pro') && (
            <View style={{
              backgroundColor: '#FFFDF5',
              borderColor: '#FCD34D',
              borderWidth: 1.5,
              borderRadius: 20,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              shadowColor: '#F59E0B',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 8,
            }}>
              <View style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: '#FEF3C7',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1.5,
                borderColor: '#F59E0B'
              }}>
                <Crown size={22} color="#D97706" />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#92400E' }}>
                    Đặc Quyền Lịch Trình AI Pro Cao Cấp
                  </Text>
                  <View style={{ backgroundColor: '#F59E0B', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1.5 }}>
                    <Text style={{ fontSize: 9, fontWeight: '900', color: '#FFF', letterSpacing: 0.5 }}>EXCLUSIVE</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: '#B45309', lineHeight: 18 }}>
                  Lịch trình này được kiến tạo riêng bằng mô hình AI Pro cao cấp, tối ưu hóa điểm đến độc quyền, định tuyến thời gian khoa học và phân bổ ngân sách chuẩn xác nhất.
                </Text>
              </View>
            </View>
          )}

          {/* ── KHÔNG GIAN LẬP LỊCH VIVU (BẢN ĐỒ + LỊCH KÉO THẢ + BẢNG NGÂN SÁCH) ── */}
          <View className="gap-6">
            <View className="flex-row items-center justify-between flex-wrap gap-3">
              <View className="flex-row items-center gap-2">
                <Calendar size={20} color={BRAND_COLORS.primary} />
                <Text className="text-xl font-extrabold text-brand-text">
                  Lịch trình & Lộ trình di chuyển
                </Text>
              </View>
            </View>

            <GoogleCalendarWorkspace
              cityName={trip.destination_city}
              totalBudget={trip.budget_total}
              budgetBreakdown={trip.budget_breakdown}
              daysCount={sortedDays.length}
              initialEvents={calendarEvents}
              standbyPlaces={standbySuggestions}
              onSave={handleSaveCalendarWorkspace}
              readOnly={isLocked}
              isDetailPage={true}
              isUserPro={isUserPro}
              creationMode={trip?.preferences?.creation_mode || 'ai_auto'}
              onUpgradePro={() => setShowPremiumModal(true)}
              onOpenManualAdd={openAddItem}
              onOpenAiAssistant={() => {
                if (openChatbot) {
                  openChatbot();
                }
              }}
            />

            {/* Weather */}
            {activeDay && (
              <Reveal key={`weather-${activeDay.id}`}>
                <View className="bg-brand-bgAlt p-5 rounded-2xl border border-brand-line/50 gap-3">
                  <View className="flex-row items-center gap-1.5">
                    <ThermometerSun size={16} color={BRAND_COLORS.primary} />
                    <Text className="font-bold text-brand-text text-sm">Dự báo thời tiết ngày</Text>
                  </View>
                  <View className="p-4 rounded-xl bg-brand-bg border border-brand-line/30 flex-row justify-between items-center">
                    <View className="gap-1">
                      <Text className="text-[10px] text-brand-textMuted uppercase font-bold tracking-wider">Trạng thái</Text>
                      <Text className="font-bold text-brand-text text-sm">{activeDay.weather_summary?.note?.split(',')[0] || 'Thời tiết ổn định'}</Text>
                    </View>
                    <View className={`px-3 py-1.5 rounded-lg border ${activeDay.weather_summary?.note?.includes('mưa') || activeDay.weather_summary?.note?.includes('giông') ? 'bg-brand-danger/10 border-brand-danger/30' : 'bg-brand-primary/10 border-brand-primary/30'}`}>
                      <Text className={`text-[10px] font-bold uppercase tracking-wider ${activeDay.weather_summary?.note?.includes('mưa') ? 'text-brand-danger' : 'text-brand-primary'}`}>
                        {activeDay.weather_summary?.note?.includes('mưa') ? 'Mưa bão' : 'Lý tưởng'}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-xs text-brand-textSoft italic font-serif">{activeDay.weather_summary?.note || 'Đang cập nhật dữ liệu thời tiết...'}</Text>
                </View>
              </Reveal>
            )}

            {/* Revision log */}
            {trip.revisions && trip.revisions.length > 0 && (
              <View className="p-5 rounded-2xl bg-brand-bgAlt border border-brand-line/50 gap-4">
                <View className="flex-row items-center gap-1.5">
                  <Activity size={16} color={BRAND_COLORS.primary} />
                  <Text className="font-bold text-brand-text text-sm">Nhật ký điều chỉnh ({trip.revisions.length})</Text>
                </View>
                {trip.revisions.slice(0, 5).map((rev, rIdx) => (
                  <View key={rev.id} className="border-l-2 border-brand-accent pl-3 py-1 gap-1">
                    <Text className="text-[10px] text-brand-textMuted font-bold uppercase">Lần {trip.revisions!.length - rIdx}</Text>
                    <Text className="text-xs text-brand-textSoft font-serif italic" numberOfLines={2}>{rev.new_snapshot?.disruption?.description || 'AI điều chỉnh kế hoạch'}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Back to top */}
      <BackToTop visible={showBackToTop} onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} />

      {/* ── SHARE MODAL ─────────────────────────────────────────────────────── */}
      <ShareModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        tripId={trip.id}
        tripTitle={trip.title}
      />

      {/* ── BOOKING MODAL ───────────────────────────────────────────────────── */}
      <BookingModal
        visible={showBookingModal}
        onClose={() => setShowBookingModal(false)}
        tripId={trip.id}
        tripTitle={trip.title}
        destinationCity={trip.destination_city}
        startDate={trip.start_date}
        endDate={trip.end_date}
        travelerCount={trip.traveler_count}
        selectedItems={selectedBookingItems}
      />

      {/* ── PREMIUM MODAL ───────────────────────────────────────────────────── */}
      <PremiumModal
        visible={showPremiumModal}
        onClose={() => setShowPremiumModal(false)}
        onActivated={() => refetchStatus()}
      />

      {/* ── DISRUPTION MODAL ───────────────────────────────────────────────── */}
      <ModalShell visible={disruptionOpen} onClose={() => setDisruptionOpen(false)}>
        <ScrollView className="bg-brand-bg rounded-3xl border border-brand-line/50" style={{ maxHeight: 600 }}>
          <View className="p-8 gap-6">
            <View className="flex-row justify-between items-center border-b border-brand-line/35 pb-4">
              <View className="flex-row items-center gap-2">
                <AlertTriangle size={20} color={BRAND_COLORS.danger} />
                <Text className="font-display font-extrabold text-lg text-brand-text">Báo sự cố chuyến đi</Text>
              </View>
              <Pressable onPress={() => setDisruptionOpen(false)} className="p-1 rounded bg-brand-line/10">
                <X size={16} color={BRAND_COLORS.textSoft} />
              </Pressable>
            </View>

            <View className="gap-4">
              <View className="gap-1.5">
                <Text className="text-sm font-bold text-brand-textSoft">Loại sự cố</Text>
                <SelectPicker options={DISRUPTION_TYPES} value={disruptionType} onChange={setDisruptionType} />
              </View>
              <View className="gap-1.5">
                <Text className="text-sm font-bold text-brand-textSoft">Điều chỉnh lịch trình từ ngày</Text>
                <SelectPicker options={dayOptions} value={disruptionDayId} onChange={setDisruptionDayId} />
              </View>
              <View className="gap-1.5">
                <Text className="text-sm font-bold text-brand-textSoft">Mô tả chi tiết sự cố</Text>
                <TextInput
                  value={disruptionDesc} onChangeText={setDisruptionDesc} multiline numberOfLines={3}
                  placeholder="Ví dụ: Trời mưa bão to từ chiều hôm nay không đi biển được..."
                  className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm bg-brand-bg text-brand-text"
                  placeholderTextColor={BRAND_COLORS.textMuted}
                  style={{ minHeight: 80, textAlignVertical: 'top' }}
                />
              </View>
            </View>

            <View className="flex-row justify-end gap-3 pt-4 border-t border-brand-line/35">
              <Pressable onPress={() => setDisruptionOpen(false)} className="px-4 py-2.5 rounded-lg border border-brand-line">
                <Text className="text-xs font-bold text-brand-textSoft">Hủy bỏ</Text>
              </Pressable>
              <Pressable
                onPress={() => { if (!disruptionDesc) return; previewMutation.mutate({ disruption_type: disruptionType, description: disruptionDesc, day_id: disruptionDayId || null }); }}
                disabled={previewMutation.isPending}
                className="flex-row items-center gap-1.5 px-5 py-3 rounded-xl bg-brand-danger"
                style={previewMutation.isPending ? { opacity: 0.5 } : undefined}
              >
                {previewMutation.isPending ? <ActivityIndicator size="small" color="white" /> : <Sparkles size={16} color="white" />}
                <Text className="text-white text-xs font-bold">{previewMutation.isPending ? 'AI đang phân tích...' : 'Yêu cầu AI điều chỉnh'}</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </ModalShell>

      {/* ── AI PREVIEW MODAL ───────────────────────────────────────────────── */}
      {proposedItinerary && (
        <ModalShell visible={previewOpen} onClose={() => setPreviewOpen(false)}>
          <ScrollView className="bg-brand-bg rounded-3xl border border-brand-line/50" style={{ maxHeight: 600 }}>
            <View className="p-8 gap-6">
              <View className="flex-row justify-between items-center border-b border-brand-line/35 pb-4">
                <View className="flex-row items-center gap-2">
                  <Sparkles size={20} color={BRAND_COLORS.primary} />
                  <Text className="font-display font-extrabold text-lg text-brand-text">Đề xuất lịch trình từ AI</Text>
                </View>
                <Pressable onPress={() => setPreviewOpen(false)} className="p-1 rounded bg-brand-line/10">
                  <X size={16} color={BRAND_COLORS.textSoft} />
                </Pressable>
              </View>

              {!!proposedDiff && (
                <View className="p-4 rounded-xl bg-brand-primary/5 border border-brand-primary/20">
                  <Text className="text-xs font-bold text-brand-text mb-1">Các thay đổi dự kiến:</Text>
                  <Text className="text-xs text-brand-textSoft font-serif italic">{proposedDiff}</Text>
                </View>
              )}
              {proposedItinerary.expert_advice && (
                <View className="p-4 rounded-2xl bg-brand-primary/10 border border-brand-primary/30 flex-row gap-3 items-start">
                  <Sparkles size={18} color={BRAND_COLORS.primary} />
                  <View className="flex-1">
                    <Text className="text-[10px] font-extrabold text-brand-primary uppercase tracking-wider mb-1">Tư vấn chuyên gia:</Text>
                    <Text className="text-xs text-brand-textSoft font-serif italic">{proposedItinerary.expert_advice}</Text>
                  </View>
                </View>
              )}
              {proposedItinerary.warning_notes?.length > 0 && (
                <View className="p-4 rounded-2xl bg-brand-danger/10 border border-brand-danger/30 flex-row gap-3 items-start">
                  <AlertTriangle size={18} color={BRAND_COLORS.danger} />
                  <View className="flex-1 gap-1">
                    <Text className="text-[10px] font-extrabold text-brand-danger uppercase tracking-wider">Cảnh báo an toàn:</Text>
                    {proposedItinerary.warning_notes.map((note: string, i: number) => (
                      <Text key={i} className="text-xs font-semibold text-brand-danger">• {note}</Text>
                    ))}
                  </View>
                </View>
              )}
              {proposedItinerary.missing_info_questions?.length > 0 && (
                <View className="p-4 rounded-2xl bg-brand-gold/15 border border-brand-gold/40 gap-3">
                  <View className="flex-row items-center gap-2">
                    <HelpCircle size={18} color={BRAND_COLORS.gold} />
                    <Text className="text-[10px] font-extrabold text-brand-primaryStrong uppercase tracking-wider">Thông tin cần bổ sung:</Text>
                  </View>
                  {proposedItinerary.missing_info_questions.map((q: string, i: number) => (
                    <View key={i} className="gap-1.5">
                      <Text className="text-xs font-semibold text-brand-text">{i + 1}. {q}</Text>
                      <TextInput
                        value={questionAnswers[i] || ''} onChangeText={v => setQuestionAnswers(prev => ({ ...prev, [i]: v }))}
                        placeholder="Nhập câu trả lời..." multiline
                        className="w-full px-3.5 py-2 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text"
                        placeholderTextColor={BRAND_COLORS.textMuted}
                        style={{ minHeight: 60, textAlignVertical: 'top' }}
                      />
                    </View>
                  ))}
                  <Pressable onPress={handleResubmitWithAnswers} disabled={previewMutation.isPending} className="self-end flex-row items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-primary" style={previewMutation.isPending ? { opacity: 0.5 } : undefined}>
                    <Sparkles size={14} color="white" />
                    <Text className="text-white text-[11px] font-bold">{previewMutation.isPending ? 'Đang gửi lại...' : 'Gửi lại cho AI'}</Text>
                  </Pressable>
                </View>
              )}

              {/* Proposed items checklist */}
              <View className="gap-2">
                <Text className="text-sm font-bold text-brand-textSoft">Chọn hoạt động thay thế muốn áp dụng:</Text>
                {proposedItinerary.days.map((day: any) => {
                  const affDay = trip.days.find(d => d.id === disruptionDayId)?.day_number ?? 1;
                  if (Number(day.day_number) < affDay) return null;

                  // Filter out items that are not in displayedItems
                  const itemsToShow = day.items.filter((_: any, i: number) => {
                    const tempId = `temp-${day.day_number}-${i}`;
                    return displayedItems.some(d => d.temp_id === tempId);
                  });

                  if (itemsToShow.length === 0) return null;

                  return (
                    <View key={day.day_number} className="gap-2">
                      <Text className="text-xs font-bold text-brand-primary uppercase tracking-wider">Ngày {day.day_number} ({formatDate(day.date)})</Text>
                      {day.items.map((item: any, i: number) => {
                        const tempId = `temp-${day.day_number}-${i}`;
                        const isDisplayed = displayedItems.some(d => d.temp_id === tempId);
                        if (!isDisplayed) return null;

                        const checked = selectedItems.some(s => s.temp_id === tempId);
                        return (
                          <Pressable
                            key={tempId}
                            onPress={() => setSelectedItems(prev => checked ? prev.filter(s => s.temp_id !== tempId) : [...prev, { ...item, day_number: day.day_number, temp_id: tempId }])}
                            className={`flex-row items-start gap-3 p-3.5 rounded-xl border ${checked ? 'bg-brand-primary/5 border-brand-primary/45' : 'bg-brand-bgAlt/50 border-brand-line/30'}`}
                          >
                            <View className={`w-4 h-4 rounded border mt-0.5 items-center justify-center ${checked ? 'bg-brand-primary border-brand-primary' : 'border-brand-line bg-brand-bg'}`}>
                              {checked && <Check size={10} color="white" />}
                            </View>
                            <View className="flex-1 gap-1">
                              <View className="flex-row items-center gap-2">
                                <Text className="text-xs font-bold text-brand-text">{item.title}</Text>
                                <View className="bg-brand-primary/10 px-1.5 py-0.5 rounded">
                                  <Text className="text-[9px] font-bold text-brand-primary uppercase">{item.item_type}</Text>
                                </View>
                              </View>
                              <Text className="text-xs text-brand-textSoft font-serif" numberOfLines={2}>{item.description}</Text>
                              <Text className="text-[10px] font-bold text-brand-textMuted">Chi phí: {formatCost(item.estimated_cost, item.item_type)}</Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  );
                })}
              </View>

              <View className="flex-row justify-end gap-3 pt-4 border-t border-brand-line/35">
                <Pressable onPress={() => setPreviewOpen(false)} className="px-4 py-2.5 rounded-lg border border-brand-line">
                  <Text className="text-xs font-bold text-brand-textSoft">Hủy bỏ</Text>
                </Pressable>
                <Pressable
                  onPress={() => applyMutation.mutate({ disruption_type: disruptionType, description: disruptionDesc, day_id: disruptionDayId || null, selected_items: selectedItems.map(i => ({ item_type: i.item_type, title: i.title, description: i.description, start_time: i.start_time, end_time: i.end_time, estimated_cost: i.estimated_cost ?? null, order_index: i.order_index, day_number: i.day_number })), previous_snapshot: previousSnapshot })}
                  disabled={applyMutation.isPending}
                  className="flex-row items-center gap-1.5 px-5 py-3 rounded-xl bg-brand-primary"
                  style={applyMutation.isPending ? { opacity: 0.5 } : undefined}
                >
                  {applyMutation.isPending ? <ActivityIndicator size="small" color="white" /> : <Check size={16} color="white" />}
                  <Text className="text-white text-xs font-bold">{applyMutation.isPending ? 'Đang áp dụng...' : 'Áp dụng lịch trình'}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </ModalShell>
      )}

      {/* ── EDIT MODAL ─────────────────────────────────────────────────────── */}
      {editingItem && (
        <ModalShell visible={editOpen} onClose={() => setEditOpen(false)}>
          <ScrollView className="bg-brand-bg rounded-3xl border border-brand-line/50" style={{ maxHeight: 600 }}>
            <View className="p-8 gap-6">
              <View className="flex-row justify-between items-center border-b border-brand-line/35 pb-4">
                <View className="flex-row items-center gap-2">
                  {isAddingNewItem ? <Plus size={20} color={BRAND_COLORS.primary} /> : <PenLine size={20} color={BRAND_COLORS.primary} />}
                  <Text className="font-display font-extrabold text-lg text-brand-text">
                    {isAddingNewItem ? 'Thêm hoạt động mới' : 'Chỉnh sửa hoạt động'}
                  </Text>
                </View>
                <Pressable onPress={() => setEditOpen(false)} className="p-1 rounded bg-brand-line/10">
                  <X size={16} color={BRAND_COLORS.textSoft} />
                </Pressable>
              </View>

              <View className="gap-4">
                <View className="gap-1.5">
                  <Text className="text-sm font-bold text-brand-textSoft">Tên hoạt động</Text>
                  <TextInput testID="input-activity-title" value={editTitle} onChangeText={setEditTitle} className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm font-semibold bg-brand-bg text-brand-text" placeholderTextColor={BRAND_COLORS.textMuted} />
                </View>
                <View className="gap-1.5">
                  <Text className="text-sm font-bold text-brand-textSoft">Mô tả</Text>
                  <TextInput value={editDesc} onChangeText={setEditDesc} multiline numberOfLines={2} className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm bg-brand-bg text-brand-text" placeholderTextColor={BRAND_COLORS.textMuted} style={{ minHeight: 70, textAlignVertical: 'top' }} />
                </View>
                <View className="flex-row gap-4">
                  <View className="flex-1 gap-1.5">
                    <Text className="text-sm font-bold text-brand-textSoft">Giờ bắt đầu</Text>
                    <TimeInput value={editStartTime} onChange={setEditStartTime} />
                  </View>
                  <View className="flex-1 gap-1.5">
                    <Text className="text-sm font-bold text-brand-textSoft">Giờ kết thúc</Text>
                    <TimeInput value={editEndTime} onChange={setEditEndTime} />
                  </View>
                </View>
                <View className="gap-1.5">
                  <Text className="text-sm font-bold text-brand-textSoft">Chi phí (VND)</Text>
                  <TextInput testID="input-activity-cost" value={editCost} onChangeText={setEditCost} keyboardType="numeric" placeholder="Để trống nếu chưa có giá" className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm font-semibold bg-brand-bg text-brand-text" placeholderTextColor={BRAND_COLORS.textMuted} />
                </View>
                <View className="gap-1.5">
                  <Text className="text-sm font-bold text-brand-textSoft">Trạng thái</Text>
                  <SelectPicker options={STATUS_OPTIONS} value={editStatus} onChange={setEditStatus} />
                </View>
                <View className="gap-1.5">
                  <Text className="text-sm font-bold text-brand-textSoft">Loại hoạt động</Text>
                  <SelectPicker options={ITEM_TYPE_OPTIONS} value={editItemType} onChange={setEditItemType} />
                </View>
              </View>

              <View className="flex-row justify-end gap-3 pt-4 border-t border-brand-line/35">
                <Pressable onPress={() => setEditOpen(false)} className="px-4 py-2.5 rounded-lg border border-brand-line">
                  <Text className="text-xs font-bold text-brand-textSoft">Hủy bỏ</Text>
                </Pressable>
                <Pressable
                  testID="btn-save-activity"
                  onPress={() => {
                    if (!editTitle) return;
                    const payload = {
                      title: editTitle,
                      description: editDesc,
                      start_time: editStartTime || null,
                      end_time: editEndTime || null,
                      estimated_cost: editCost.trim() === '' ? null : Number(editCost),
                      status: editStatus,
                      item_type: editItemType
                    };
                    if (isAddingNewItem) {
                      addItemMutation.mutate(payload);
                    } else {
                      editMutation.mutate(payload);
                    }
                  }}
                  disabled={editMutation.isPending || addItemMutation.isPending}
                  className="flex-row items-center gap-1.5 px-5 py-3 rounded-xl bg-brand-primary"
                  style={(editMutation.isPending || addItemMutation.isPending) ? { opacity: 0.5 } : undefined}
                >
                  {(editMutation.isPending || addItemMutation.isPending) ? <ActivityIndicator size="small" color="white" /> : <Check size={16} color="white" />}
                  <Text className="text-white text-xs font-bold">
                    {(editMutation.isPending || addItemMutation.isPending) ? 'Đang lưu...' : (isAddingNewItem ? 'Thêm hoạt động' : 'Lưu thay đổi')}
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </ModalShell>
      )}

      {/* ── AI REPLACE MODAL ───────────────────────────────────────────────── */}
      {aiReplaceItem && (
        <ModalShell visible={aiReplaceOpen} onClose={() => setAiReplaceOpen(false)}>
          <ScrollView className="bg-brand-bg rounded-3xl border border-brand-line/50" style={{ maxHeight: 600 }}>
            <View className="p-8 gap-6">
              <View className="flex-row justify-between items-center border-b border-brand-line/35 pb-4">
                <View className="gap-1">
                  <View className="flex-row items-center gap-2">
                    <Sparkles size={20} color={BRAND_COLORS.accent} />
                    <Text className="font-display font-extrabold text-lg text-brand-text">AI Thay Thế Hoạt Động</Text>
                  </View>
                  <Text className="text-xs text-brand-textSoft">Thay thế: <Text className="font-bold text-brand-text">"{aiReplaceItem.title}"</Text></Text>
                </View>
                <Pressable onPress={() => setAiReplaceOpen(false)} className="p-1 rounded bg-brand-line/10">
                  <X size={16} color={BRAND_COLORS.textSoft} />
                </Pressable>
              </View>

              {/* Tab chuyển đổi: Chọn từ điểm đến / Tìm kiếm (Mặc định) vs AI Gợi ý */}
              <View className="flex-row gap-2 border-b border-brand-line/20 pb-3">
                <Pressable
                  onPress={() => setReplaceTab('manual')}
                  className={`flex-row items-center gap-1.5 px-3.5 py-2 rounded-xl ${replaceTab === 'manual' ? 'bg-brand-primary text-white' : 'bg-brand-bgAlt border border-brand-line/40'}`}
                >
                  <MapPin size={14} color={replaceTab === 'manual' ? '#fff' : BRAND_COLORS.primary} />
                  <Text className={`text-xs font-bold ${replaceTab === 'manual' ? 'text-white' : 'text-brand-text'}`}>
                    📍 Tìm kiếm & Chọn từ {trip.destination_city}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setReplaceTab('ai')}
                  className={`flex-row items-center gap-1.5 px-3.5 py-2 rounded-xl ${replaceTab === 'ai' ? 'bg-brand-accent text-white' : 'bg-brand-bgAlt border border-brand-line/40'}`}
                >
                  <Sparkles size={14} color={replaceTab === 'ai' ? '#fff' : BRAND_COLORS.accent} />
                  <Text className={`text-xs font-bold ${replaceTab === 'ai' ? 'text-white' : 'text-brand-text'}`}>
                    ✨ AI Gợi Ý Tự Động
                  </Text>
                </Pressable>
              </View>

              {replaceTab === 'manual' ? (
                <View className="gap-3">
                  <Text className="text-xs font-bold text-brand-textSoft">
                    Chọn 1 địa điểm thực tế tại {trip.destination_city} hoặc tự gõ tên quán ăn bạn muốn đến:
                  </Text>

                  {/* Filter chips & Search */}
                  <View className="gap-2">
                    <TextInput
                      value={replaceSearchQuery}
                      onChangeText={setReplaceSearchQuery}
                      placeholder="🔎 Gõ tên quán ăn, cà phê, điểm đến bất kỳ..."
                      className="px-3.5 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text"
                      placeholderTextColor={BRAND_COLORS.textMuted}
                    />

                    {/* Quick custom replace option if user typed query */}
                    {replaceSearchQuery.trim().length > 0 && (
                      <View className="p-3 rounded-xl bg-brand-accent/10 border border-brand-accent/30 flex-row justify-between items-center">
                        <View className="flex-1 mr-2">
                          <Text className="text-xs font-bold text-brand-text">
                            ✨ Đổi thành: "{replaceSearchQuery.trim()}"
                          </Text>
                          <Text className="text-[10px] text-brand-textSoft">
                            Áp dụng địa điểm tự nhập này ngay lập tức vào ô hoạt động
                          </Text>
                        </View>
                        <Pressable
                          onPress={async () => {
                            let lat = aiReplaceItem.location_lat;
                            let lng = aiReplaceItem.location_lng;
                            let address = `${replaceSearchQuery.trim()}, ${trip.destination_city}`;

                            try {
                              const res = await api.get(`/places/geocode?name=${encodeURIComponent(replaceSearchQuery.trim())}&city=${encodeURIComponent(trip.destination_city)}`);
                              if (res.data?.found && res.data.lat && res.data.lng) {
                                lat = res.data.lat;
                                lng = res.data.lng;
                                if (res.data.address) address = res.data.address;
                              }
                            } catch (e) {
                              // ignore
                            }

                            aiReplaceMutation.mutate({
                              itemId: aiReplaceItem.id,
                              payload: {
                                title: replaceSearchQuery.trim(),
                                description: address,
                                start_time: aiReplaceItem.start_time,
                                end_time: aiReplaceItem.end_time,
                                estimated_cost: 50000,
                                item_type: aiReplaceItem.item_type || 'dining',
                                location_lat: lat,
                                location_lng: lng,
                                status: 'planned'
                              }
                            });
                          }}
                          className="px-3 py-1.5 rounded-lg bg-brand-accent"
                        >
                          <Text className="text-white text-xs font-bold">Thay thế ngay</Text>
                        </Pressable>
                      </View>
                    )}

                    <View className="flex-row gap-1.5 flex-wrap">
                      {[
                        { id: 'all', label: 'Tất cả' },
                        { id: 'dining', label: '🔴 Ăn uống' },
                        { id: 'cafe', label: '🟡 Cafe' },
                        { id: 'hotel', label: '🔵 Khách sạn' },
                        { id: 'attraction', label: '🟣 Vui chơi' },
                      ].map(cat => (
                        <Pressable
                          key={cat.id}
                          onPress={() => setReplaceCategory(cat.id)}
                          className={`px-2.5 py-1 rounded-lg border ${replaceCategory === cat.id ? 'bg-brand-primary border-brand-primary' : 'bg-brand-bgAlt border-brand-line/40'}`}
                        >
                          <Text className={`text-[10px] font-bold ${replaceCategory === cat.id ? 'text-white' : 'text-brand-textSoft'}`}>
                            {cat.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  {loadingPool ? (
                    <View className="py-8 items-center gap-2">
                      <ActivityIndicator size="small" color={BRAND_COLORS.primary} />
                      <Text className="text-xs text-brand-textSoft font-semibold">Đang tải kho địa điểm thực tế...</Text>
                    </View>
                  ) : (
                    <View className="gap-2" style={{ maxHeight: 340, overflow: 'auto' as any }}>
                      {(() => {
                        const rawPool = poolPlaces.length > 0 ? poolPlaces : getCuratedPlacesForCity(trip.destination_city);
                        const filtered = rawPool.filter(p => {
                          const matchCat = replaceCategory === 'all' || p.category === replaceCategory;
                          const q = replaceSearchQuery.toLowerCase().trim();
                          const matchQuery = !q || p.name.toLowerCase().includes(q) || (p.address && p.address.toLowerCase().includes(q));
                          return matchCat && matchQuery;
                        });

                        if (filtered.length === 0) {
                          return (
                            <View className="py-6 items-center">
                              <Text className="text-xs text-brand-textMuted italic">Không tìm thấy địa điểm phù hợp bộ lọc.</Text>
                            </View>
                          );
                        }

                        return filtered.map((place: any) => {
                          const finalLat = place.lat;
                          const finalLng = place.lng;
                          const finalAddress = place.address || place.social_review_quote || place.description || '';

                          return (
                            <Pressable
                              key={place.id}
                              onPress={() => {
                                const cost = place.estimated_cost ?? (place.price_level ? place.price_level * 50000 : 0);
                                let mappedType: 'accommodation' | 'transport' | 'dining' | 'attraction' | 'rental' | 'experience' = 'attraction';
                                if (place.category === 'dining' || place.category === 'cafe') mappedType = 'dining';
                                else if (place.category === 'hotel' || place.category === 'accommodation') mappedType = 'accommodation';
                                else if (place.category === 'rental') mappedType = 'rental';

                                aiReplaceMutation.mutate({
                                  itemId: aiReplaceItem.id,
                                  payload: {
                                    title: place.name,
                                    description: finalAddress,
                                    start_time: aiReplaceItem.start_time,
                                    end_time: aiReplaceItem.end_time,
                                    estimated_cost: cost,
                                    item_type: mappedType,
                                    location_lat: finalLat,
                                    location_lng: finalLng,
                                    status: 'planned'
                                  }
                                });
                              }}
                              className="p-3 rounded-xl border border-brand-line/40 bg-white hover:bg-brand-bgAlt flex-row justify-between items-center"
                              style={{ cursor: 'pointer' as any }}
                            >
                              <View className="flex-1 mr-3 gap-0.5">
                                <Text className="text-sm font-bold text-brand-text">{place.name}</Text>
                                <Text className="text-xs text-brand-textSoft" numberOfLines={1}>{finalAddress}</Text>
                                <View className="flex-row items-center gap-2 mt-1">
                                  <Text className="text-[10px] font-bold uppercase text-brand-primary bg-brand-primary/10 px-1.5 py-0.5 rounded">{place.category}</Text>
                                  {place.estimated_cost ? (
                                    <Text className="text-[10px] font-semibold text-brand-textMuted">💰 {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(place.estimated_cost)}</Text>
                                  ) : null}
                                </View>
                              </View>
                              <View className="px-3 py-1.5 rounded-lg bg-brand-primary">
                                <Text className="text-white text-xs font-bold">Chọn thay</Text>
                              </View>
                            </Pressable>
                          );
                        });
                      })()}
                    </View>
                  )}
                </View>
              ) : (
                <>
                  <View className="flex-row gap-2">
                    <TextInput
                      value={aiRequirement} onChangeText={setAiRequirement} placeholder="Yêu cầu đặc thù (tùy chọn)..."
                      className="flex-1 px-4 py-3 rounded-xl border border-brand-line text-sm font-semibold bg-brand-bg text-brand-text"
                      placeholderTextColor={BRAND_COLORS.textMuted}
                    />
                    <Pressable
                      onPress={async () => {
                        setFetchingAlts(true);
                        try {
                          const r = await api.post(`/trips/items/${aiReplaceItem.id}/ai-replace`, { user_requirement: aiRequirement });
                          setAiAlternatives(r.data.alternatives || []);
                        } catch (err: any) {
                          Alert.alert('Lỗi', err.response?.data?.error || err.message);
                        } finally { setFetchingAlts(false); }
                      }}
                      disabled={fetchingAlts}
                      className="flex-row items-center gap-1.5 px-5 py-3 rounded-xl bg-brand-accent"
                      style={fetchingAlts ? { opacity: 0.5 } : undefined}
                    >
                      {fetchingAlts ? <ActivityIndicator size="small" color="white" /> : <Sparkles size={16} color="white" />}
                      <Text className="text-white text-xs font-bold">{fetchingAlts ? 'Đang quét...' : 'Gợi ý'}</Text>
                    </Pressable>
                  </View>

                  {fetchingAlts ? (
                    <View className="py-12 items-center gap-3">
                      <ActivityIndicator size="large" color={BRAND_COLORS.accent} />
                      <Text className="text-xs text-brand-textSoft font-semibold">Gemini đang đề xuất các lựa chọn...</Text>
                    </View>
                  ) : aiAlternatives.length > 0 ? (
                    <View className="gap-3">
                      <Text className="text-sm font-bold text-brand-textSoft">Chọn 1 trong 3 đề xuất từ AI:</Text>
                      {aiAlternatives.map((alt, i) => (
                        <View key={i} className="p-4 rounded-2xl border border-brand-line/50 bg-brand-bgAlt gap-3">
                          <View className="flex-row justify-between items-start gap-2">
                            <Text className="text-sm font-extrabold text-brand-text flex-1">{alt.title}</Text>
                            <View className="bg-brand-accent/10 px-1.5 py-0.5 rounded">
                              <Text className="text-[9px] font-bold text-brand-accent uppercase">{alt.item_type}</Text>
                            </View>
                          </View>
                          <Text className="text-xs text-brand-textSoft font-serif">{alt.description}</Text>
                          <Text className="text-[10px] font-semibold text-brand-textMuted">⏱️ {alt.start_time?.substring(0, 5)} - {alt.end_time?.substring(0, 5)} · 💰 {formatCost(alt.estimated_cost, alt.item_type)}</Text>
                          <View className="p-2.5 rounded-lg bg-brand-accent/5 border border-brand-accent/20">
                            <Text className="text-[10px] text-brand-accentStrong font-semibold">💡 {alt.reason}</Text>
                          </View>
                          <Pressable
                            onPress={() => aiReplaceMutation.mutate({ itemId: aiReplaceItem.id, payload: { title: alt.title, description: alt.description, start_time: alt.start_time, end_time: alt.end_time, estimated_cost: alt.estimated_cost ?? null, item_type: alt.item_type, status: 'planned' } })}
                            disabled={aiReplaceMutation.isPending}
                            className="self-end flex-row items-center gap-1 px-4 py-2 rounded-xl bg-brand-primary"
                            style={aiReplaceMutation.isPending ? { opacity: 0.5 } : undefined}
                          >
                            <Text className="text-white text-xs font-bold">{aiReplaceMutation.isPending ? 'Đang áp dụng...' : 'Áp dụng đề xuất này'}</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View className="py-6 items-center border border-dashed border-brand-line rounded-2xl bg-brand-bgAlt/50">
                      <Text className="text-xs text-brand-textSoft font-semibold">Bấm "Gợi ý" để AI đề xuất hoạt động thay thế</Text>
                    </View>
                  )}
                </>
              )}

              <View className="flex-row justify-end pt-4 border-t border-brand-line/35">
                <Pressable onPress={() => setAiReplaceOpen(false)} className="px-4 py-2.5 rounded-lg border border-brand-line">
                  <Text className="text-xs font-bold text-brand-textSoft">Hủy bỏ</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </ModalShell>
      )}
      <ConfirmModal
        visible={!!confirmModal?.visible}
        title={confirmModal?.title || ''}
        message={confirmModal?.message || ''}
        isDestructive={confirmModal?.isDestructive}
        onConfirm={confirmModal?.onConfirm || (() => {})}
        onCancel={() => setConfirmModal(null)}
      />
      </View>

      {/* Web print-friendly stylesheet injection */}
      {Platform.OS === 'web' && (
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body, html, #root {
              background-color: white !important;
              color: #1B2420 !important;
              margin: 0 !important;
              padding: 0 !important;
              height: auto !important;
              overflow: visible !important;
            }
            .no-print {
              display: none !important;
            }
            .print-only-container {
              display: block !important;
              position: static !important;
              width: 100% !important;
              height: auto !important;
              overflow: visible !important;
              background-color: white !important;
              color: #1B2420 !important;
              padding: 20px !important;
            }
            .print-day-block {
              page-break-after: always !important;
              page-break-inside: avoid !important;
              margin-bottom: 30px !important;
              display: block !important;
            }
            .print-day-block:last-child {
              page-break-after: avoid !important;
            }
          }
          .print-only-container {
            display: none;
          }
        `}} />
      )}

      {/* Web Print Container */}
      {Platform.OS === 'web' && (
        <View className="print-only-container" style={{ display: 'none' } as any}>
          {/* Header info */}
          <View style={{ borderBottomWidth: 2, borderBottomColor: '#14201B', paddingBottom: 15, marginBottom: 25 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#14201B', marginBottom: 8 }}>{trip.title}</Text>
                <Text style={{ fontSize: 13, color: '#555555' }}>📍 Điểm đến: <Text style={{ fontWeight: 'bold' }}>{trip.destination_city}</Text></Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#14201B', marginBottom: 4 }}>ViVu Planner</Text>
                <Text style={{ fontSize: 11, color: '#777777' }}>Lịch trình du lịch cá nhân hóa</Text>
              </View>
            </View>
            
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 15, gap: 20 }}>
              <Text style={{ fontSize: 12, color: '#333333' }}>📅 <Text style={{ fontWeight: 'bold' }}>Thời gian:</Text> {formatDate(trip.start_date)} — {formatDate(trip.end_date)}</Text>
              <Text style={{ fontSize: 12, color: '#333333' }}>💰 <Text style={{ fontWeight: 'bold' }}>Tổng ngân sách:</Text> {formatVND(trip.budget_total)}</Text>
              <Text style={{ fontSize: 12, color: '#333333' }}>👥 <Text style={{ fontWeight: 'bold' }}>Thành viên:</Text> {trip.traveler_count} người ({trip.traveler_type})</Text>
            </View>
          </View>

          {/* Days list */}
          {sortedDays.map((day) => {
            const spentVal = dailySpent[day.id] || 0;
            const remainingVal = dailyRemaining[day.id] || 0;
            const items = (day.items || [])
              .sort((a, b) => a.order_index - b.order_index)
              .filter(item => item.status !== 'replaced' && item.status !== 'skipped');

            return (
              <View key={day.id} className="print-day-block" style={{ marginBottom: 25 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#dddddd', paddingBottom: 6, marginBottom: 12 }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#14201B' }}>
                    Ngày 0{day.day_number}: {formatDate(day.date)}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Text style={{ fontSize: 11, color: '#555555' }}>Dự kiến: <Text style={{ fontWeight: 'bold' }}>{formatVND(spentVal)}</Text></Text>
                    <Text style={{ fontSize: 11, color: '#555555' }}>Còn lại: <Text style={{ fontWeight: 'bold' }}>{formatVND(remainingVal)}</Text></Text>
                  </View>
                </View>

                {Boolean(day.weather_summary?.note) ? (
                  <View style={{ backgroundColor: '#f9f9f9', padding: 8, borderRadius: 6, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#14201B' }}>
                    <Text style={{ fontSize: 11, fontStyle: 'italic', color: '#555555' }}>☀️ Thời tiết: {day.weather_summary?.note}</Text>
                  </View>
                ) : null}

                {items.length === 0 ? (
                  <Text style={{ fontSize: 12, color: '#777777', fontStyle: 'italic', paddingLeft: 10 }}>Chưa có hoạt động nào được lên lịch.</Text>
                ) : (
                  <View style={{ gap: 12 }}>
                    {items.map((item) => (
                      <View key={item.id} style={{ borderWidth: 1, borderColor: '#eeeeee', borderRadius: 8, padding: 10, backgroundColor: '#ffffff' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#14201B', backgroundColor: '#e2f0ea', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4 }}>
                              {ITEM_TYPE_LABELS[item.item_type] || 'Khác'}
                            </Text>
                            {Boolean(item.start_time) ? (
                              <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#666666' }}>
                                ⏱️ {item.start_time?.substring(0, 5)}{item.end_time ? ` - ${item.end_time?.substring(0, 5)}` : ''}
                              </Text>
                            ) : null}
                          </View>
                          {Boolean(hasOfficialCost(item.estimated_cost)) ? (
                            <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#14201B' }}>
                              {formatCost(item.estimated_cost, item.item_type)}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#111111', marginBottom: 4 }}>{item.title}</Text>
                        {Boolean(item.description) ? (
                          <Text style={{ fontSize: 11, color: '#555555', lineHeight: 15 }}>{item.description}</Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Custom In-App Toast Banner */}
      <AppToast toast={appToast} onClose={() => setAppToast(null)} />
    </View>
  );
}
