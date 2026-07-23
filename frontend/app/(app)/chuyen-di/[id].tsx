import { useState, useEffect, useRef, useContext } from 'react';
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
  Shield, Share2,
} from 'lucide-react-native';
import { apiClient } from '../../../lib/apiClient';
import { getCache, setCache } from '../../../lib/cache';
import { ChatbotContext } from '../../../context/ChatbotContext';
import { cancelTripReminder } from '../../../lib/notifications';
import { useDistanceToCity } from '../../../hooks/useLocation';
import Reveal from '../../../components/Reveal';
import SystemClock from '../../../components/SystemClock';
import BackToTop from '../../../components/BackToTop';
import { BRAND_COLORS } from '../../../constants';
import InteractiveMap, { MapItem } from '../../../components/InteractiveMap';
import ShareModal from '../../../components/ShareModal';
import BookingModal, { BookableItem } from '../../../components/BookingModal';
import PremiumModal from '../../../components/PremiumModal';

const canUseLocalStorage = Platform.OS === 'web' && typeof localStorage !== 'undefined';

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
  days: ItineraryDay[]; revisions?: any[];
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
    if (itemType === 'accommodation' || itemType === 'rental') return 'Cần xác nhận giá';
    return 'Chưa cập nhật';
  }
  return Number(c) === 0 ? 'Miễn phí' : `${Number(c).toLocaleString('vi-VN')}đ`;
}
function getItemTypeIcon(type: string) {
  const props = { size: 14, color: BRAND_COLORS.primary };
  switch (type) {
    case 'accommodation': return <Home {...props} />;
    case 'transport': case 'rental': return <Bike {...props} />;
    case 'dining': return <Utensils {...props} />;
    case 'experience': return <Sparkles {...props} />;
    default: return <Map {...props} />;
  }
}
const ITEM_TYPE_LABELS: Record<string, string> = {
  accommodation: 'Chỗ nghỉ', transport: 'Di chuyển', dining: 'Ăn uống',
  attraction: 'Tham quan', rental: 'Thuê xe', experience: 'Trải nghiệm',
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
  const isAdmin = canUseLocalStorage && !!localStorage.getItem('vivu_admin_token');
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
  const [aiAlternatives, setAiAlternatives] = useState<any[]>([]);
  const [aiRequirement, setAiRequirement] = useState('');
  const [fetchingAlts, setFetchingAlts] = useState(false);

  // New features state
  const [showMapView, setShowMapView] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [bookedItemIds, setBookedItemIds] = useState<Set<string>>(new Set());
  const [selectedBookingItems, setSelectedBookingItems] = useState<BookableItem[]>([]);

  useEffect(() => {
    if (id) {
      getCache<TripDetailData>(`trip_${id}`).then(data => { if (data) setCachedTrip(data); });
    }
  }, [id]);

  const { data: trip, isLoading, isError, refetch } = useQuery<TripDetailData>({
    queryKey: ['trip', id],
    queryFn: async () => {
      const r = await apiClient.get(`/trips/${id}`);
      await setCache(`trip_${id}`, r.data);
      return r.data;
    },
    placeholderData: cachedTrip ?? undefined,
  });

  const tripData = trip ?? cachedTrip;
  const { distanceKm, loading: locLoading } = useDistanceToCity(tripData?.destination_city ?? '');

  const { setTripId, registerPreviewTrigger, unregisterPreviewTrigger } = useContext(ChatbotContext);

  useEffect(() => {
    if (id) {
      setTripId(id);
    }
    return () => setTripId(null);
  }, [id, setTripId]);

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

      const normalizeTime = (t: string) => {
        if (!t) return '';
        return t.substring(0, 5);
      };

      const normalizeCost = (c: any) => {
        if (c === null || c === undefined) return 0;
        return Number(c) || 0;
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
      const r = await apiClient.post(`/trips/${id}/disruptions/preview`, payload);
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
      const r = await apiClient.post(`/trips/${id}/disruptions/apply`, payload);
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
      const r = await apiClient.put(`/trips/items/${editingItem.id}`, payload);
      return r.data;
    },
    onSuccess: () => { setEditOpen(false); refetch(); },
    onError: (err: any) => Alert.alert('Lỗi cập nhật', err.response?.data?.error || err.message),
  });

  const aiReplaceMutation = useMutation({
    mutationFn: async ({ itemId, payload }: { itemId: string; payload: any }) => {
      const r = await apiClient.put(`/trips/items/${itemId}`, payload);
      return r.data;
    },
    onSuccess: () => { setAiReplaceOpen(false); setAiReplaceItem(null); setAiAlternatives([]); refetch(); },
    onError: (err: any) => Alert.alert('Lỗi áp dụng gợi ý AI', err.response?.data?.error || err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => { await apiClient.delete(`/trips/items/${itemId}`); },
    onSuccess: () => refetch(),
    onError: (err: any) => Alert.alert('Lỗi xóa hoạt động', err.response?.data?.error || err.message),
  });

  const deleteTripMutation = useMutation({
    mutationFn: async () => { await apiClient.delete(`/trips/${id}`); },
    onSuccess: () => {
      router.replace(isAdmin ? '/admin' as any : '/chuyen-di');
    },
    onError: (err: any) => Alert.alert('Lỗi xóa chuyến đi', err.response?.data?.error || err.message),
  });

  const handleConfirmDeleteTrip = () => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Bạn có chắc chắn muốn xóa chuyến đi "${tripData?.title}"? Hành động này không thể hoàn tác.`)) {
        deleteTripMutation.mutate();
      }
    } else {
      Alert.alert('Xác nhận xóa chuyến đi', `Bạn có chắc chắn muốn xóa chuyến đi "${tripData?.title}"? Hành động này không thể hoàn tác.`, [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Xóa chuyến đi', style: 'destructive', onPress: () => deleteTripMutation.mutate() },
      ]);
    }
  };

  const openEdit = (item: any) => {
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

  const confirmDelete = (itemId: string, title: string) => {
    Alert.alert('Xác nhận xóa', `Bạn có chắc muốn xóa hoạt động "${title}"?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => deleteMutation.mutate(itemId) },
    ]);
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
        <Pressable onPress={() => router.push(isAdmin ? '/admin' as any : '/chuyen-di')} className="flex-row items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-primary">
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
          spent += Number(item.estimated_cost) || 0;
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
            <Pressable onPress={() => router.push(isAdmin ? '/admin' as any : '/chuyen-di')} className="flex-row items-center gap-1.5">
              <ArrowLeft size={16} color={BRAND_COLORS.textSoft} />
              <Text className="text-xs font-bold text-brand-textSoft">{isAdmin ? 'Quản trị' : 'Bảng điều khiển'}</Text>
            </Pressable>
            <View className="flex-row items-center gap-3">
              <SystemClock />
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
                    <Text className="text-xs text-brand-textSoft font-semibold">{trip.traveler_count} khách ({trip.traveler_type})</Text>
                  </View>
                </View>
              </View>
              <View className="flex-row gap-3 items-center flex-wrap">
                <Pressable onPress={handleExportPDF} className="flex-row items-center gap-2 px-5 py-3.5 rounded-xl bg-brand-primary">
                  <Share2 size={16} color="white" />
                  <Text className="text-white font-bold">{Platform.OS === 'web' ? 'Tải PDF' : 'Chia sẻ'}</Text>
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

          {/* Body: Day switcher + Timeline */}
          <View className="gap-8">
            {/* Day Switcher */}
            <View className="bg-brand-bgAlt p-5 rounded-2xl border border-brand-line/50 gap-4">
              <Text className="font-bold text-brand-text text-sm">Các ngày hành trình</Text>
              <View className="gap-2">
                {sortedDays.map(day => {
                  const active = activeTabId === day.id;
                  return (
                    <Pressable
                      key={day.id}
                      onPress={() => setActiveTabId(day.id)}
                      className={`p-4 rounded-xl border ${active ? 'bg-brand-primary border-brand-primary' : 'bg-brand-bg/50 border-brand-line/30'}`}
                    >
                      <View className="flex-row justify-between items-center">
                        <View className="flex-1">
                          <Text className={`text-xs font-semibold ${active ? 'text-white/75' : 'text-brand-textMuted'}`}>Ngày 0{day.day_number}</Text>
                          <Text className={`font-bold text-sm mt-0.5 ${active ? 'text-white' : 'text-brand-textSoft'}`}>{formatDate(day.date)}</Text>
                          
                          <View className="flex-row items-center gap-2 mt-1.5 flex-wrap">
                            <Text className={`text-[10px] font-bold ${active ? 'text-white/90' : 'text-brand-textSoft'}`}>
                              Dự kiến: <Text className={active ? 'text-white' : 'text-brand-accent'}>{formatVND(dailySpent[day.id] || 0)}</Text>
                            </Text>
                            <Text className={`text-[10px] ${active ? 'text-white/60' : 'text-brand-textMuted'}`}>|</Text>
                            <Text className={`text-[10px] font-bold ${active ? 'text-white/90' : 'text-brand-textSoft'}`}>
                              Còn lại: <Text className={active ? 'text-white' : 'text-emerald-600'}>{formatVND(dailyRemaining[day.id] || 0)}</Text>
                            </Text>
                          </View>
                        </View>
                        <ChevronRight size={16} color={active ? 'white' : BRAND_COLORS.textSoft} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Interactive Map Toggle */}
            <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#f0ebe0' }}>
              <Pressable
                onPress={() => setShowMapView(!showMapView)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 20 }}>🗺️</Text>
                  <View>
                    <Text style={{ fontWeight: '800', color: '#1B3A2D', fontSize: 15 }}>Bản đồ tương tác</Text>
                    <Text style={{ color: '#888', fontSize: 12 }}>Xem tất cả địa điểm trên bản đồ</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 18, color: '#888' }}>{showMapView ? '▲' : '▼'}</Text>
              </Pressable>
              {showMapView && (
                <View style={{ marginTop: 16 }}>
                  <InteractiveMap
                    items={trip.days.flatMap(day => day.items.map(item => ({
                      id: item.id,
                      title: item.title,
                      item_type: item.item_type,
                      start_time: item.start_time,
                      estimated_cost: item.estimated_cost,
                      location_lat: (item as any).location_lat,
                      location_lng: (item as any).location_lng,
                      day_number: day.day_number,
                      google_place_id: item.google_place_id,
                    })) as MapItem[])}
                    cityName={trip.destination_city}
                  />
                </View>
              )}
            </View>

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

            {/* Timeline */}
            <View className="bg-brand-bgAlt p-6 rounded-3xl border border-brand-line/50 gap-6">
              <View className="flex-row justify-between items-center flex-wrap gap-2">
                <Text className="font-display font-extrabold text-2xl text-brand-text">Chi tiết hoạt động</Text>
                {activeDay && (
                  <View className="flex-row gap-2">
                    <View className="px-2.5 py-1 rounded-lg bg-brand-accent/10 border border-brand-accent/20">
                      <Text className="text-[10px] font-extrabold text-brand-accent uppercase">Dự kiến: {formatVND(dailySpent[activeDay.id] || 0)}</Text>
                    </View>
                    <View className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200">
                      <Text className="text-[10px] font-extrabold text-emerald-600 uppercase">Còn lại: {formatVND(dailyRemaining[activeDay.id] || 0)}</Text>
                    </View>
                  </View>
                )}
              </View>
              {activeItems.length === 0 ? (
                <Text className="text-center py-12 text-brand-textSoft text-sm">Chưa có hoạt động nào.</Text>
              ) : (
                <View style={{ borderLeftWidth: 1, borderLeftColor: 'rgba(27,36,32,0.12)', marginLeft: 12, paddingLeft: 24, gap: 24 }}>
                  {activeItems.map((item, idx) => {
                    const isReplaced = item.status === 'replaced';
                    const isSkipped = item.status === 'skipped';
                    return (
                      <View key={item.id} style={{ opacity: isReplaced || isSkipped ? 0.4 : 1 }}>
                        {/* Timeline dot */}
                        <View style={{
                          position: 'absolute', left: -31, top: 6, width: 16, height: 16,
                          borderRadius: 8, borderWidth: 2,
                          backgroundColor: isReplaced ? 'rgba(27,36,32,0.12)' : BRAND_COLORS.bg,
                          borderColor: isReplaced ? BRAND_COLORS.textMuted : BRAND_COLORS.primary,
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isReplaced && <X size={8} color={BRAND_COLORS.textMuted} />}
                        </View>

                        <View className="p-4 rounded-2xl bg-brand-bg border border-brand-line/40 gap-3">
                          <View className="flex-row justify-between items-start gap-2">
                            <View className="gap-2 flex-1">
                              {/* Type + time badges */}
                              <View className="flex-row flex-wrap items-center gap-2">
                                <View className="flex-row items-center gap-1 bg-white border border-brand-line/40 px-2 py-0.5 rounded">
                                  {getItemTypeIcon(item.item_type)}
                                  <Text className="text-[10px] font-bold uppercase tracking-wider text-brand-primary">{ITEM_TYPE_LABELS[item.item_type] || 'Khác'}</Text>
                                </View>
                                {item.start_time && (
                                  <View className="flex-row items-center gap-1">
                                    <Clock size={12} color={BRAND_COLORS.textSoft} />
                                    <Text className="text-[10px] font-bold text-brand-textSoft">{item.start_time.substring(0, 5)}{item.end_time ? ` — ${item.end_time.substring(0, 5)}` : ''}</Text>
                                  </View>
                                )}
                                {isReplaced && (
                                  <View className="bg-brand-danger/10 border border-brand-danger/35 px-1.5 py-0.5 rounded">
                                    <Text className="text-[9px] font-bold text-brand-danger">ĐÃ THAY THẾ</Text>
                                  </View>
                                )}
                                {item.google_place_id && item.google_place_id.startsWith('partner_') && (
                                  <View className="flex-row items-center gap-1 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                    <Shield size={10} color="#059669" />
                                    <Text className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-600">Đối tác xác minh</Text>
                                  </View>
                                )}
                              </View>
                              <Text className="text-base font-bold text-brand-text" style={isReplaced ? { textDecorationLine: 'line-through' } : undefined}>{item.title}</Text>
                              <Text className="text-xs text-brand-textSoft font-serif" numberOfLines={4}>{item.description}</Text>
                              {item.booking_url && (
                                <Pressable
                                  onPress={() => {
                                    if (item.booking_url) {
                                      Linking.openURL(item.booking_url).catch(err =>
                                        console.error("Failed to open URL", err)
                                      );
                                      if (item.google_place_id && item.google_place_id.startsWith('partner_')) {
                                        const partnerId = item.google_place_id.replace('partner_', '');
                                        apiClient.post(`/admin/partners/${partnerId}/click`, { tripId: id }).catch(err =>
                                          console.error("Failed to log partner click", err)
                                        );
                                      }
                                    }
                                  }}
                                  className="mt-2 self-start flex-row items-center gap-1.5 bg-brand-primary/10 py-1.5 px-3 rounded-lg border border-brand-primary/20"
                                >
                                  <Compass size={12} color={BRAND_COLORS.primary} />
                                  <Text className="text-[10px] font-bold text-brand-primary">Đặt chỗ trực tuyến</Text>
                                </Pressable>
                              )}
                            </View>

                            {/* Cost + actions */}
                            <View className="items-end gap-3">
                              {(hasOfficialCost(item.estimated_cost) || item.item_type === 'accommodation' || item.item_type === 'rental') && (
                                <View className="items-end">
                                  <Text className="text-[10px] text-brand-textMuted font-bold uppercase tracking-wider">Dự tính</Text>
                                  <Text className="text-xs font-extrabold text-brand-text">{formatCost(item.estimated_cost, item.item_type)}</Text>
                                </View>
                              )}
                              {!isAdmin && (
                                <View className="flex-row gap-2">
                                  <Pressable onPress={() => { setAiReplaceItem(item); setAiAlternatives([]); setAiRequirement(''); setAiReplaceOpen(true); }} className="p-1.5 rounded bg-brand-accent/10">
                                    <Sparkles size={14} color={BRAND_COLORS.accent} />
                                  </Pressable>
                                  <Pressable onPress={() => openEdit(item)} className="p-1.5 rounded bg-brand-primary/10">
                                    <PenLine size={14} color={BRAND_COLORS.primary} />
                                  </Pressable>
                                  <Pressable onPress={() => confirmDelete(item.id, item.title)} className="p-1.5 rounded bg-brand-danger/10">
                                    <Trash2 size={14} color={BRAND_COLORS.danger} />
                                  </Pressable>
                                </View>
                              )}
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
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
        onActivated={() => setShowPremiumModal(false)}
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
                  const itemsToShow = day.items.filter((item: any, i: number) => {
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
                  <PenLine size={20} color={BRAND_COLORS.primary} />
                  <Text className="font-display font-extrabold text-lg text-brand-text">Chỉnh sửa hoạt động</Text>
                </View>
                <Pressable onPress={() => setEditOpen(false)} className="p-1 rounded bg-brand-line/10">
                  <X size={16} color={BRAND_COLORS.textSoft} />
                </Pressable>
              </View>

              <View className="gap-4">
                <View className="gap-1.5">
                  <Text className="text-sm font-bold text-brand-textSoft">Tên hoạt động</Text>
                  <TextInput value={editTitle} onChangeText={setEditTitle} className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm font-semibold bg-brand-bg text-brand-text" placeholderTextColor={BRAND_COLORS.textMuted} />
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
                  <TextInput value={editCost} onChangeText={setEditCost} keyboardType="numeric" placeholder="Để trống nếu chưa có giá" className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm font-semibold bg-brand-bg text-brand-text" placeholderTextColor={BRAND_COLORS.textMuted} />
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
                  onPress={() => { if (!editTitle) return; editMutation.mutate({ title: editTitle, description: editDesc, start_time: editStartTime || null, end_time: editEndTime || null, estimated_cost: editCost.trim() === '' ? null : Number(editCost), status: editStatus, item_type: editItemType }); }}
                  disabled={editMutation.isPending}
                  className="flex-row items-center gap-1.5 px-5 py-3 rounded-xl bg-brand-primary"
                  style={editMutation.isPending ? { opacity: 0.5 } : undefined}
                >
                  {editMutation.isPending ? <ActivityIndicator size="small" color="white" /> : <Check size={16} color="white" />}
                  <Text className="text-white text-xs font-bold">{editMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}</Text>
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
                      const r = await apiClient.post(`/trips/items/${aiReplaceItem.id}/ai-replace`, { user_requirement: aiRequirement });
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

              <View className="flex-row justify-end pt-4 border-t border-brand-line/35">
                <Pressable onPress={() => setAiReplaceOpen(false)} className="px-4 py-2.5 rounded-lg border border-brand-line">
                  <Text className="text-xs font-bold text-brand-textSoft">Hủy bỏ</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </ModalShell>
      )}
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

                {day.weather_summary?.note && (
                  <View style={{ backgroundColor: '#f9f9f9', padding: 8, borderRadius: 6, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#14201B' }}>
                    <Text style={{ fontSize: 11, fontStyle: 'italic', color: '#555555' }}>☀️ Thời tiết: {day.weather_summary.note}</Text>
                  </View>
                )}

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
                            {item.start_time && (
                              <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#666666' }}>
                                ⏱️ {item.start_time.substring(0, 5)}{item.end_time ? ` - ${item.end_time.substring(0, 5)}` : ''}
                              </Text>
                            )}
                          </View>
                          {hasOfficialCost(item.estimated_cost) && (
                            <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#14201B' }}>
                              {formatCost(item.estimated_cost, item.item_type)}
                            </Text>
                          )}
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#111111', marginBottom: 4 }}>{item.title}</Text>
                        {item.description && (
                          <Text style={{ fontSize: 11, color: '#555555', lineHeight: 15 }}>{item.description}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
