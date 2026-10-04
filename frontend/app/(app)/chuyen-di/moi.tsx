import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  View, Text, ScrollView, Pressable, TextInput, Image,
  Animated, Platform, KeyboardAvoidingView, ActivityIndicator, Modal, useWindowDimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  Compass, Sparkles, ArrowLeft, ArrowRight,
  MapPin, DollarSign, Heart, AlertTriangle, Crown, Zap, Lock, ChevronDown,
  Trash2, Edit3, Check, Calendar, Plus, ShoppingBag, X, GripVertical, Clock,
  Users, Share2, Copy, Link as LinkIcon,
} from 'lucide-react-native';
import { api } from '../../../lib/api';
import { supabase } from '../../../lib/supabase';
import { clearCache } from '../../../lib/cache';
import { requestNotificationPermission, scheduleTripReminder } from '../../../lib/notifications';
import { useAuth } from '../../../hooks/useAuth';
import { usePaymentStatus } from '../../../hooks/usePaymentStatus';
import { formatWallet } from '../../../lib/plans';
import PremiumModal from '../../../components/PremiumModal';
import Reveal from '../../../components/Reveal';
import BudgetBreakdown, { BudgetBreakdownData } from '../../../components/cart/BudgetBreakdown';
import LiveBudgetBar from '../../../components/cart/LiveBudgetBar';
import CuratedMap, { getCityCenterCoords } from '../../../components/map/CuratedMap';
import GoogleMapsRoutePlanner, { RouteWaypoint } from '../../../components/map/GoogleMapsRoutePlanner';
import GoogleCalendarWorkspace, { CalendarEventItem, StandbyPlaceItem, CalendarDeltaAction } from '../../../components/workspace/GoogleCalendarWorkspace';
import { PlaceItem } from '../../../components/map/PlacePopup';
import { getCuratedPlacesForCity } from '../../../constants/curatedPlaces';
import {
  VIETNAMESE_CITIES, TRAVELER_TYPES, PREFERENCE_OPTIONS, BRAND_COLORS,
  BUDGET_ESTIMATION_CONFIG, APP_ROUTES, TravelerType,
} from '../../../constants';

const LOADING_STAGES = [
  'Đang tra cứu dự báo thời tiết tại điểm đến...',
  'Đang quét địa điểm lưu trú & ăn uống thực tế (OpenStreetMap)...',
  'Đang cá nhân hóa lịch trình tối ưu bằng Gemini AI...',
  'Đang cấu hình các phương án dự phòng sự cố...',
  'Đang khởi tạo cơ sở dữ liệu chuyến đi của bạn...',
];

const CATEGORY_NAMES_VI: Record<string, string> = {
  dining: 'Ăn uống',
  cafe: 'Cà phê',
  hotel: 'Khách sạn',
  accommodation: 'Khách sạn',
  attraction: 'Tham quan',
  experience: 'Trải nghiệm',
  rental: 'Thuê xe',
  transport: 'Di chuyển',
  default: 'Địa điểm',
};

const normalizePlaceKey = (str?: string) =>
  (str || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

function getTodayString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const clean = dateStr.trim();
  
  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const d = new Date(clean);
    if (!isNaN(d.getTime())) return d;
  }
  
  // Try DD/MM/YYYY or DD-MM-YYYY
  const match = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // 0-indexed
    const year = parseInt(match[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }
  
  // Fallback
  const d = new Date(clean);
  if (!isNaN(d.getTime())) return d;
  
  return null;
}

function formatToISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateForDisplay(dateStr: string): string {
  const parsed = parseDate(dateStr);
  if (!parsed) return dateStr;
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = parsed.getFullYear();
  return `${day}/${month}/${year}`;
}

function calculateMinimumBudget(startDateStr: string, endDateStr: string, travelerCount: number): { minBudget: number, daysCount: number, nightsCount: number } {
  const start = parseDate(startDateStr);
  const end = parseDate(endDateStr);
  let daysCount = 1;
  if (start && end) {
    const diffTime = Math.abs(end.getTime() - start.getTime());
    daysCount = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }
  const nightsCount = Math.max(0, daysCount - 1);
  return BUDGET_ESTIMATION_CONFIG.calculateDetailedBudget(daysCount, nightsCount, travelerCount);
}

// Web-only: render <input type="date">; Native: plain TextInput
function DateInput({
  value, onChange, placeholder, min,
}: { value: string; onChange: (v: string) => void; placeholder: string; min?: string }) {
  if (Platform.OS === 'web') {
    // Convert value to YYYY-MM-DD if it's in DD/MM/YYYY for the HTML input
    let webValue = value;
    const parsed = parseDate(value);
    if (parsed) {
      webValue = formatToISODate(parsed);
    }
    return (
      // @ts-ignore — web-only input type
      <input
        type="date"
        value={webValue}
        onChange={(e: any) => onChange(e.target.value)}
        min={min}
        style={{
          width: '100%',
          padding: '12px 16px',
          borderRadius: 12,
          border: '1px solid rgba(27,36,32,0.12)',
          fontSize: 14,
          fontFamily: 'BeVietnamPro_400Regular, system-ui, sans-serif',
          fontWeight: '600',
          backgroundColor: '#FBF5EA',
          outline: 'none',
          color: '#1B2420',
        }}
      />
    );
  }
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm font-semibold bg-brand-bg text-brand-text"
      placeholderTextColor={BRAND_COLORS.textMuted}
    />
  );
}

// Loading screen with spinning compass + progress + cancel
function LoadingScreen({ stage, onCancel }: { stage: number; onCancel: () => void }) {
  const spinAnim = useRef(new Animated.Value(0)).current;
  const ringAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 3000, useNativeDriver: true })
    ).start();
    Animated.loop(
      Animated.timing(ringAnim, { toValue: 1, duration: 1200, useNativeDriver: true })
    ).start();
  }, []);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: (stage + 1) / LOADING_STAGES.length,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [stage]);

  const compassRotate = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const ringRotate = ringAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View className="flex-1 bg-brand-bgDark items-center justify-center px-6">
      <View className="w-full max-w-sm items-center gap-8">
        {/* Spinning compass */}
        <View className="w-24 h-24 items-center justify-center">
          <Animated.View
            style={{
              position: 'absolute', width: 96, height: 96, borderRadius: 48,
              borderWidth: 2, borderColor: 'rgba(31,111,84,0.2)',
            }}
          />
          <Animated.View
            style={{
              position: 'absolute', width: 96, height: 96, borderRadius: 48,
              borderWidth: 2, borderTopColor: BRAND_COLORS.accent,
              borderRightColor: 'transparent', borderBottomColor: 'transparent',
              borderLeftColor: 'transparent',
              transform: [{ rotate: ringRotate }],
            }}
          />
          <Animated.View style={{ transform: [{ rotate: compassRotate }] }}>
            <Compass size={48} color={BRAND_COLORS.primary} />
          </Animated.View>
        </View>

        <View className="items-center gap-2">
          <Text className="font-display font-extrabold text-2xl text-brand-textDark tracking-tight">
            ViVu Lập Lịch Thông Minh
          </Text>
          <Text className="font-serif text-sm text-brand-textMuted italic text-center">
            "Lập trình trải nghiệm du lịch thông minh"
          </Text>
        </View>

        {/* Progress bar */}
        <View className="w-full bg-brand-primary/10 rounded-full h-2 overflow-hidden border border-white/10">
          <Animated.View
            style={{
              height: '100%', backgroundColor: BRAND_COLORS.primary,
              width: progressWidth, borderRadius: 999,
            }}
          />
        </View>

        <Text className="text-sm font-semibold text-brand-primary text-center">
          {LOADING_STAGES[stage]}
        </Text>

        {/* Cancel button */}
        <Pressable
          onPress={onCancel}
          style={{ marginTop: 8, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 24, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.05)' }}
        >
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' }}>✕ Hủy tạo lịch trình</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function TripWizard() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    city?: string;
    days?: string;
    budget?: string;
    theme?: string;
    draft_id?: string;
    token?: string;
  }>();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleCancelLoading = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
    setErrorMsg('');
    setStep(1);
  };

  // Form state
  const { user, isPremium, isAdmin } = useAuth();
  const { paymentStatus, refetch: refetchStatus } = usePaymentStatus();
  const [useProForTrip, setUseProForTrip] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      router.replace(APP_ROUTES.ADMIN as any);
    }
  }, [isAdmin]);

  const [selectedAiProvider, setSelectedAiProvider] = useState<'gemini' | 'custom_openai'>('gemini');
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [title, setTitle] = useState('');
  const [destinationCity, setDestinationCity] = useState(VIETNAMESE_CITIES[0]);
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 2);
  const defaultEndDate = new Date(tomorrowDate);
  defaultEndDate.setDate(tomorrowDate.getDate() + 3);

  const [startDate, setStartDate] = useState(formatToISODate(tomorrowDate));
  const [endDate, setEndDate] = useState(formatToISODate(defaultEndDate));
  const [travelerCount, setTravelerCount] = useState(1);
  const [travelerType, setTravelerType] = useState('solo');
  const [budgetTotal, setBudgetTotal] = useState(5000000);
  const [budgetBreakdown, setBudgetBreakdown] = useState<BudgetBreakdownData>({
    transport: 1000000,
    accommodation: 1500000,
    dining: 1250000,
    cafe: 500000,
    entertainment: 750000,
  });
  const [selectedPrefs, setSelectedPrefs] = useState<string[]>([]);
  const [customPrefInput, setCustomPrefInput] = useState('');
  const [healthConditions, setHealthConditions] = useState('');
  const [specialRequirements, setSpecialRequirements] = useState('');
  const [lodgingPreference, setLodgingPreference] = useState<'single' | 'multiple'>('single');

  // ── STATE TẠO NHÓM CHỌN GIỎ HÀNG CHUNG & ĐỒNG BỘ REALTIME ──
  const [draftTripId, setDraftTripId] = useState<string | null>(params.draft_id || null);
  const [draftShareToken, setDraftShareToken] = useState<string | null>(params.token || null);
  const [draftOwnerId, setDraftOwnerId] = useState<string | null>(null);
  const draftChannelRef = useRef<any>(null);
  const cartTombstonesRef = useRef<Map<string, number>>(new Map());

  const getPlaceKeys = useCallback((placeOrItem: any): string[] => {
    const keys: string[] = [];
    const p = placeOrItem?.place || placeOrItem;
    if (p?.id) keys.push(String(p.id));
    if (placeOrItem?.id && placeOrItem.id !== p?.id) keys.push(String(placeOrItem.id));
    const name = p?.name || placeOrItem?.title || placeOrItem?.name;
    if (name && typeof name === 'string') {
      const norm = normalizePlaceKey(name);
      if (norm) keys.push(`name_${norm}`);
    }
    return keys;
  }, []);
  const [showGroupModal, setShowGroupModal] = useState<boolean>(false);
  const [isCreatingDraftGroup, setIsCreatingDraftGroup] = useState<boolean>(false);
  const [collaboratorCount, setCollaboratorCount] = useState<number>(1);
  const [copiedLink, setCopiedLink] = useState(false);
  const [groupToastMsg, setGroupToastMsg] = useState<string | null>(null);

  // Phân quyền trưởng nhóm vs thành viên: Chỉ trưởng nhóm mới có quyền chốt danh sách & xếp lịch
  const isGroupDraftOwner = !draftTripId || !params.draft_id || draftOwnerId === user?.id;
  const isGroupMember = Boolean(draftTripId && params.draft_id && draftOwnerId && draftOwnerId !== user?.id);

  // Pro Workspace state
  const [useProWorkspace, setUseProWorkspace] = useState(false);
  const totalCredits = (paymentStatus?.pro_credits || 0) + (paymentStatus?.monthly_credits || 0);
  const remainingTrips = paymentStatus?.remainingTrips ?? totalCredits;
  const hasCredits = remainingTrips > 0 || (Boolean(paymentStatus?.isPremium) && remainingTrips > 0);
  const canAccessWorkspace = Boolean(isAdmin || draftTripId || hasCredits);

  // Bảo vệ: Chỉ người dùng Pro hoặc thành viên nhóm giỏ hàng chung mới được phép mở và sử dụng Pro Workspace (Map Live)
  useEffect(() => {
    if (useProWorkspace && !canAccessWorkspace) {
      setUseProWorkspace(false);
    }
  }, [useProWorkspace, canAccessWorkspace]);
  const [workspaceStage, setWorkspaceStage] = useState<'collecting' | 'scheduling'>('collecting');
  const [pregenPlaces, setPregenPlaces] = useState<any[]>([]);
  const [loadingPregen, setLoadingPregen] = useState(false);
  const [placeSearchQuery, setPlaceSearchQuery] = useState('');
  const [placeCategoryFilter, setPlaceCategoryFilter] = useState<string>('all');
  const [activeScheduleDay, setActiveScheduleDay] = useState<number>(1);
  const [scheduleMapMode, setScheduleMapMode] = useState<'gmaps' | 'curated'>('gmaps');
  const [schedulingViewMode, setSchedulingViewMode] = useState<'calendar' | 'board' | 'timeline'>('calendar');
  const [draggedPlaceId, setDraggedPlaceId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<number | 'unassigned' | null>(null);
  const [cartItems, setCartItems] = useState<{
    place: PlaceItem;
    pricing_option: 'auto' | 'manual';
    custom_cost: number;
    day_number: number;
    order_index: number;
    nights?: number;
    startHour?: number;
    startMinute?: number;
    durationMinutes?: number;
    added_by_name?: string;
    added_by_id?: string;
    updated_at?: number;
  }[]>([]);
  const [externalDelta, setExternalDelta] = useState<CalendarDeltaAction | null>(null);
  const [showScheduleOptionModal, setShowScheduleOptionModal] = useState(false);
  const [showConfirmAiProModal, setShowConfirmAiProModal] = useState<boolean>(false);
  const [showConfirmLiveMapModal, setShowConfirmLiveMapModal] = useState<boolean>(false);
  const [editingCostPlaceId, setEditingCostPlaceId] = useState<string | null>(null);
  const [editCostInput, setEditCostInput] = useState('');
  const [hoveredPoolPlaceId, setHoveredPoolPlaceId] = useState<string | null>(null);
  const cartMapIframeRef = useRef<any>(null);
  const { width: windowWidth } = useWindowDimensions();
  const isLargeScreen = windowWidth >= 900;

  // ── STATE TỰ NHẬP ĐỊA ĐIỂM THỦ CÔNG (KHÔNG PHỤ THUỘC HARDCODE) ──
  const [showCustomPlaceModal, setShowCustomPlaceModal] = useState<boolean>(false);
  const [customPlaceTitle, setCustomPlaceTitle] = useState('');
  const [customPlaceCategory, setCustomPlaceCategory] = useState<'dining' | 'cafe' | 'hotel' | 'attraction' | 'other'>('dining');
  const [customPlaceCost, setCustomPlaceCost] = useState('');
  const [customPlaceAddress, setCustomPlaceAddress] = useState('');

  const { minBudget, daysCount, nightsCount } = useMemo(() => {
    return calculateMinimumBudget(startDate, endDate, travelerCount);
  }, [startDate, endDate, travelerCount]);

  const currentCartTotal = useMemo(() => {
    const hotelItems = cartItems.filter(it =>
      ['hotel', 'accommodation', 'homestay', 'resort'].includes(String(it.place.category || '').toLowerCase())
    );
    const isSingleHotel = hotelItems.length === 1;

    return cartItems.reduce((acc, item) => {
      const isHotel = ['hotel', 'accommodation', 'homestay', 'resort'].includes(String(item.place.category || '').toLowerCase());
      const nights = isHotel ? (item.nights || (isSingleHotel ? Math.max(1, nightsCount) : 1)) : 1;
      return acc + (Number(item.custom_cost) || 0) * nights;
    }, 0);
  }, [cartItems, nightsCount]);

  // Không hardcode dữ liệu từ curatedPlaces: Chỉ hiển thị dữ liệu thực tế do AI sinh hoặc người dùng thêm
  const deduplicatedPool = useMemo(() => {
    const rawPool = pregenPlaces;
    const result: any[] = [];
    const seenKeys: string[] = [];

    rawPool.forEach((p: any) => {
      const key = (p.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
      if (!key) return;

      let isDup = false;
      for (const sk of seenKeys) {
        if (key === sk || (key.length >= 8 && sk.length >= 8 && (key.includes(sk) || sk.includes(key)))) {
          isDup = true;
          break;
        }
      }
      if (!isDup) {
        seenKeys.push(key);
        result.push(p);
      }
    });

    return result;
  }, [pregenPlaces]);

  const filteredPoolPlaces = useMemo(() => {
    return deduplicatedPool.filter((p: any) => {
      const matchCat = placeCategoryFilter === 'all' || p.category === placeCategoryFilter;
      const q = placeSearchQuery.toLowerCase().trim();
      const matchQuery = !q || p.name.toLowerCase().includes(q) || (p.address && p.address.toLowerCase().includes(q));
      return matchCat && matchQuery;
    });
  }, [deduplicatedPool, placeCategoryFilter, placeSearchQuery]);

  const dayValidationWarnings = useMemo(() => {
    const warnings: Record<number, { hotelCount: number; hotels: string[]; isOverloaded: boolean; missingDining: boolean }> = {};

    for (let d = 1; d <= daysCount; d++) {
      const dayItems = cartItems.filter(it => it.day_number === d);
      const hotels = dayItems.filter(it => {
        const cat = String(it.place.category || '').toLowerCase();
        return cat === 'hotel' || cat === 'accommodation' || cat === 'homestay' || cat === 'resort';
      }).map(it => it.place.name);

      const hasDining = dayItems.some(it => {
        const cat = String(it.place.category || '').toLowerCase();
        return cat === 'dining' || cat === 'cafe' || cat === 'food' || cat === 'restaurant';
      });

      warnings[d] = {
        hotelCount: hotels.length,
        hotels,
        isOverloaded: dayItems.length > 5,
        missingDining: dayItems.length >= 2 && !hasDining
      };
    }

    return warnings;
  }, [cartItems, daysCount]);

  const scheduleRoutePlaces = useMemo(() => {
    const items = cartItems.filter(it => Number(it.day_number) === Number(activeScheduleDay));
    return items.sort((a, b) => a.order_index - b.order_index).map(it => it.place);
  }, [cartItems, activeScheduleDay]);

  // Đồng bộ chi tiết hành động thêm/bớt địa điểm lên Realtime Channel để tránh xung đột lịch sử
  const broadcastCartAction = useCallback((action: {
    type: 'cart_item_added' | 'cart_item_removed' | 'cart_cleared';
    item?: any;
    placeId?: string;
    placeName?: string;
    deletedKeys?: string[];
    deleted_at?: number;
    updatedCart?: typeof cartItems;
  }) => {
    if (!draftTripId) return;
    try {
      const senderName = user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Thành viên';
      const senderId = user?.id;
      const timestamp = Date.now();

      const ch = draftChannelRef.current || supabase.channel(`draft-cart:${draftTripId}`);
      if (action.type === 'cart_item_added') {
        ch.send({
          type: 'broadcast',
          event: 'cart_item_added',
          payload: { item: action.item, senderId, senderName, timestamp },
        }).catch(() => {});
      } else if (action.type === 'cart_item_removed') {
        ch.send({
          type: 'broadcast',
          event: 'cart_item_removed',
          payload: {
            placeId: action.placeId,
            placeName: action.placeName,
            deletedKeys: action.deletedKeys || (action.placeId ? [action.placeId] : []),
            deleted_at: action.deleted_at || timestamp,
            senderId,
            senderName,
            timestamp,
          },
        }).catch(() => {});
      } else if (action.type === 'cart_cleared') {
        ch.send({
          type: 'broadcast',
          event: 'cart_cleared',
          payload: { senderId, senderName, timestamp },
        }).catch(() => {});
      }

      if (action.updatedCart !== undefined) {
        const tombstonesObj: Record<string, number> = {};
        cartTombstonesRef.current.forEach((val, key) => {
          tombstonesObj[key] = val;
        });

        let deletedPlaceIds: string[] = [];
        let actionName: string | undefined = undefined;
        if (action.type === 'cart_item_removed') {
          deletedPlaceIds = action.deletedKeys && action.deletedKeys.length > 0
            ? action.deletedKeys
            : (action.placeId ? [action.placeId] : []);
          actionName = 'remove';
        } else if (action.type === 'cart_cleared') {
          deletedPlaceIds = action.deletedKeys && action.deletedKeys.length > 0
            ? action.deletedKeys
            : Array.from(cartTombstonesRef.current.keys());
          actionName = 'clear';
        } else if (action.type === 'cart_item_added') {
          deletedPlaceIds = [];
          actionName = 'add';
        }

        api.put(`/trips/${draftTripId}/shared-cart`, {
          draft_cart: action.updatedCart,
          deleted_place_ids: deletedPlaceIds,
          tombstones: tombstonesObj,
          action: actionName,
          workspace_stage: workspaceStage,
        }).catch((err) => {
          console.warn('Failed to update shared-cart:', err?.message);
        });
      }
    } catch (e) {
      console.warn('broadcastCartAction error:', e);
    }
  }, [draftTripId, user?.id, user?.user_metadata, user?.email, workspaceStage]);

  const handleEventDelta = useCallback((delta: CalendarDeltaAction) => {
    if (!draftTripId) return;
    const ch = draftChannelRef.current || supabase.channel(`draft-cart:${draftTripId}`);
    const currentUserId = user?.id;
    if (ch && currentUserId) {
      ch.send({
        type: 'broadcast',
        event: 'calendar_delta',
        payload: {
          delta,
          updated_by: currentUserId,
          timestamp: Date.now(),
        }
      }).catch((err: any) => {
        console.warn('calendar_delta broadcast error in moi.tsx:', err);
      });
    }
  }, [draftTripId, user?.id]);

  // Đồng bộ giỏ hàng lên Realtime Channel và cập nhật ngầm vào trip draft
  const syncCartToDraft = (updatedCart: typeof cartItems) => {
    if (!draftTripId) return;
    try {
      const senderName = user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Thành viên';
      const sendPayload = {
        cartItems: updatedCart,
        senderId: user?.id,
        senderName,
        timestamp: Date.now(),
      };
      if (draftChannelRef.current) {
        draftChannelRef.current.send({
          type: 'broadcast',
          event: 'cart_updated',
          payload: sendPayload,
        }).catch(() => {});
      } else {
        const channel = supabase.channel(`draft-cart:${draftTripId}`);
        channel.send({
          type: 'broadcast',
          event: 'cart_updated',
          payload: sendPayload,
        }).catch(() => {});
      }
    } catch (e) {}

    const tombstonesObj: Record<string, number> = {};
    cartTombstonesRef.current.forEach((val, key) => {
      tombstonesObj[key] = val;
    });

    api.put(`/trips/${draftTripId}/shared-cart`, {
      draft_cart: updatedCart,
      deleted_place_ids: [],
      tombstones: tombstonesObj,
      workspace_stage: workspaceStage,
    }).catch((err) => {
      console.warn('Failed to update shared-cart:', err?.message);
    });
  };

  // Phát thông báo broadcast chuyển trang đồng bộ cho tất cả thành viên trong nhóm đang cùng chọn giỏ hàng
  const broadcastTripFinalized = async (targetTripId: string) => {
    if (!draftTripId) return;
    try {
      const payload = {
        tripId: targetTripId,
        redirectUrl: APP_ROUTES.TRIP_DETAIL(targetTripId),
      };
      if (draftChannelRef.current) {
        await draftChannelRef.current.send({
          type: 'broadcast',
          event: 'trip_finalized',
          payload,
        });
      } else {
        const channel = supabase.channel(`draft-cart:${draftTripId}`);
        await channel.send({
          type: 'broadcast',
          event: 'trip_finalized',
          payload,
        });
      }
    } catch (e) {
      console.warn('Failed to broadcast trip_finalized:', e);
    }
  };

  const fetchPregenPlaces = async (overrideProvider?: any) => {
    setLoadingPregen(true);
    setErrorMsg('');
    let finalPlaces: PlaceItem[] = [];
    const validOverride = (overrideProvider === 'gemini' || overrideProvider === 'custom_openai') ? overrideProvider : undefined;
    const providerToUse = validOverride || (useProWorkspace || useProForTrip ? 'custom_openai' : selectedAiProvider);
    try {
      const res = await api.post('/trips/pregen-places', {
        destination_city: destinationCity,
        days_count: daysCount,
        budget_total: budgetTotal,
        budget_breakdown: budgetBreakdown,
        preferences: selectedPrefs,
        traveler_type: travelerType,
        traveler_count: travelerCount,
        special_requirements: specialRequirements,
        ai_provider: providerToUse
      }, { timeout: 45000 });
      if (res.data?.places && Array.isArray(res.data.places) && res.data.places.length > 0) {
        finalPlaces = res.data.places;
      } else {
        const fallback = getCuratedPlacesForCity(destinationCity);
        finalPlaces = fallback.length > 0 ? fallback : [];
      }
    } catch (err: any) {
      console.warn('Pregen places error:', err?.message);
      if (err?.response?.data?.places && Array.isArray(err.response.data.places) && err.response.data.places.length > 0) {
        finalPlaces = err.response.data.places;
      } else {
        const fallback = getCuratedPlacesForCity(destinationCity);
        finalPlaces = fallback && fallback.length > 0 ? fallback : [];
        setErrorMsg('Chưa thể lấy danh sách mới nhất từ AI. Bạn có thể nhấn Thử lại lấy gợi ý AI hoặc tự thêm địa điểm thủ công!');
      }
    } finally {
      if (finalPlaces.length > 0) {
        setPregenPlaces(finalPlaces);
        if (draftTripId) {
          api.put(`/trips/${draftTripId}/shared-cart`, {
            workspace_stage: workspaceStage,
            pregen_places: finalPlaces,
          }).catch(() => {});
          if (draftChannelRef.current) {
            draftChannelRef.current.send({
              type: 'broadcast',
              event: 'pregen_places_updated',
              payload: { places: finalPlaces },
            }).catch(() => {});
          }
        }
      }
      setLoadingPregen(false);
    }
  };

  const handleAddToCart = (place: PlaceItem, option: 'auto' | 'manual' = 'auto', customCost?: number) => {
    const defaultCost = place.estimated_cost || (place.price_level ? place.price_level * 50000 : 50000);
    const finalCost = customCost !== undefined ? customCost : defaultCost;
    const addedByName = user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Tôi';
    const addedById = user?.id;

    setCartItems(prev => {
      const match = prev.find(item =>
        item.place.id === place.id ||
        (normalizePlaceKey(item.place.name) === normalizePlaceKey(place.name) && item.place.category === place.category)
      );
      if (match) {
        const delTime = Date.now();
        const delKeys = getPlaceKeys(match);
        delKeys.forEach(k => cartTombstonesRef.current.set(k, delTime));

        const updated = prev.filter(item => item !== match);
        broadcastCartAction({
          type: 'cart_item_removed',
          placeId: match.place.id,
          placeName: match.place.name,
          deletedKeys: delKeys,
          deleted_at: delTime,
          updatedCart: updated,
        });
        return updated;
      } else {
        const now = Date.now();
        const addKeys = getPlaceKeys(place);
        addKeys.forEach(k => cartTombstonesRef.current.delete(k));

        const newItem = {
          place,
          pricing_option: option,
          custom_cost: finalCost,
          day_number: 0,
          order_index: prev.length + 1,
          added_by_name: addedByName,
          added_by_id: addedById,
          updated_at: now,
        };
        const updated = [...prev, newItem];
        broadcastCartAction({
          type: 'cart_item_added',
          item: newItem,
          placeId: place.id,
          updatedCart: updated,
        });
        return updated;
      }
    });
  };

  const handleClearCart = () => {
    const now = Date.now();
    const allDeletedKeys: string[] = [];
    cartItems.forEach(it => {
      getPlaceKeys(it).forEach(k => {
        cartTombstonesRef.current.set(k, now);
        allDeletedKeys.push(k);
      });
    });
    setCartItems([]);
    broadcastCartAction({
      type: 'cart_cleared',
      deletedKeys: allDeletedKeys,
      updatedCart: [],
    });
  };

  // Thêm địa điểm thủ công theo ý muốn (không phụ thuộc vào danh sách mock)
  const handleAddNewCustomPlace = () => {
    if (!customPlaceTitle.trim()) return;
    const costNum = parseInt(customPlaceCost.replace(/\D/g, ''), 10) || 50000;
    const center = getCityCenterCoords(destinationCity);
    const newCustomPlace: PlaceItem = {
      id: `custom-p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: customPlaceTitle.trim(),
      category: customPlaceCategory,
      city: destinationCity,
      address: customPlaceAddress.trim() || destinationCity,
      estimated_cost: costNum,
      price_level: Math.min(4, Math.max(1, Math.ceil(costNum / 100000))),
      lat: center.lat + (Math.random() - 0.5) * 0.02,
      lng: center.lng + (Math.random() - 0.5) * 0.02,
    };
    handleAddToCart(newCustomPlace, 'manual', costNum);
    setShowCustomPlaceModal(false);
    setCustomPlaceTitle('');
    setCustomPlaceCost('');
    setCustomPlaceAddress('');
  };

  // Lắng nghe params.draft_id nếu người dùng mở từ link mời nhóm cùng chọn giỏ hàng
  useEffect(() => {
    const draftId = params.draft_id;
    if (!draftId) return;

    setDraftTripId(draftId);
    setStep(4);
    setUseProWorkspace(true);
    setWorkspaceStage('collecting');

    const joinAndFetchDraft = async () => {
      if (params.token) {
        setDraftShareToken(params.token);
        try {
          await api.put(`/trips/join/${params.token}`);
        } catch (e) {}
      }

      try {
        const res: any = await api.get(`/trips/${draftId}`);
        const t = res.data;
        if (t) {
          if (t.user_id) setDraftOwnerId(t.user_id);
          if (t.destination_city) setDestinationCity(t.destination_city);
          if (t.budget_total) setBudgetTotal(Number(t.budget_total));
          if (t.start_date) setStartDate(t.start_date);
          if (t.end_date) setEndDate(t.end_date);
          const remoteCart = t.shared_cart || t.preferences?.draft_cart;
          if (remoteCart && Array.isArray(remoteCart)) {
            setCartItems(remoteCart);
          }
          const remotePlaces = t.pregen_places || t.preferences?.pregen_places;
          if (remotePlaces && Array.isArray(remotePlaces) && remotePlaces.length > 0) {
            setPregenPlaces(remotePlaces);
          }
          const remoteStage = t.workspace_stage || t.preferences?.workspace_stage;
          if (remoteStage === 'scheduling' || remoteStage === 'collecting') {
            setWorkspaceStage(remoteStage);
          }
        }
      } catch (e) {}

      try {
        const cartRes: any = await api.get(`/trips/${draftId}/shared-cart`, {
          params: params.token ? { invite_token: params.token } : undefined,
          headers: params.token ? { 'x-invite-token': params.token } : undefined,
        });
        if (cartRes.data?.tombstones) {
          for (const [k, v] of Object.entries(cartRes.data.tombstones)) {
            cartTombstonesRef.current.set(k, Number(v) || Date.now());
          }
        }
        if (cartRes.data?.draft_cart && Array.isArray(cartRes.data.draft_cart)) {
          const filteredDraftCart = cartRes.data.draft_cart.filter((it: any) => {
            const itKeys = getPlaceKeys(it);
            const maxTombTime = Math.max(0, ...itKeys.map(k => cartTombstonesRef.current.get(k) || 0));
            const itemTime = Number(it.updated_at || 0);
            return maxTombTime === 0 || itemTime > maxTombTime;
          });
          setCartItems(filteredDraftCart);
        }
        if (cartRes.data?.pregen_places && Array.isArray(cartRes.data.pregen_places) && cartRes.data.pregen_places.length > 0) {
          setPregenPlaces(cartRes.data.pregen_places);
        }
      } catch (e) {}
    };
    joinAndFetchDraft();
  }, [params.draft_id, params.token]);

  // Tự động lấy danh sách gợi ý địa điểm nếu vào Pro Workspace và chưa có địa điểm
  useEffect(() => {
    if (params.token || isGroupMember) return;
    if (useProWorkspace && canAccessWorkspace && pregenPlaces.length === 0 && !loadingPregen && destinationCity) {
      fetchPregenPlaces();
    }
  }, [useProWorkspace, canAccessWorkspace, destinationCity, isGroupMember, params.token, pregenPlaces.length]);

  // Realtime Channel đồng bộ giỏ hàng và danh sách thành viên online
  useEffect(() => {
    if (!draftTripId) return;
    const channel = supabase.channel(`draft-cart:${draftTripId}`);
    draftChannelRef.current = channel;

    channel
      .on('broadcast', { event: 'cart_item_added' }, (msg: any) => {
        const payload = msg?.payload;
        if (payload?.item && payload.senderId !== user?.id) {
          getPlaceKeys(payload.item).forEach(k => cartTombstonesRef.current.delete(k));

          setCartItems(prev => {
            const exists = prev.some(it =>
              it.place.id === payload.item.place.id ||
              (normalizePlaceKey(it.place.name) === normalizePlaceKey(payload.item.place.name) && it.place.category === payload.item.place.category)
            );
            if (exists) return prev;
            return [...prev, payload.item];
          });
          const sender = payload.senderName || 'Thành viên';
          setGroupToastMsg(`👥 ${sender} vừa thêm "${payload.item.place?.name || 'địa điểm'}" vào giỏ hàng!`);
          setTimeout(() => setGroupToastMsg(null), 3000);
        }
      })
      .on('broadcast', { event: 'cart_item_removed' }, (msg: any) => {
        const payload = msg?.payload;
        if ((payload?.placeId || payload?.deletedKeys) && payload.senderId !== user?.id) {
          const delTime = payload.deleted_at || Date.now();
          if (Array.isArray(payload.deletedKeys)) {
            payload.deletedKeys.forEach((k: string) => cartTombstonesRef.current.set(k, delTime));
          }
          if (payload.placeId) cartTombstonesRef.current.set(payload.placeId, delTime);
          if (payload.placeName) cartTombstonesRef.current.set(`name_${normalizePlaceKey(payload.placeName)}`, delTime);

          setCartItems(prev => prev.filter(it => {
            const itKeys = getPlaceKeys(it);
            const isMatch = itKeys.some(k =>
              (payload.deletedKeys && payload.deletedKeys.includes(k)) ||
              k === payload.placeId ||
              k === `name_${normalizePlaceKey(payload.placeName || '')}`
            );
            return !isMatch;
          }));
          const sender = payload.senderName || 'Thành viên';
          const pName = payload.placeName || 'địa điểm';
          setGroupToastMsg(`👥 ${sender} vừa bỏ "${pName}" khỏi giỏ hàng!`);
          setTimeout(() => setGroupToastMsg(null), 3000);
        }
      })
      .on('broadcast', { event: 'cart_cleared' }, (msg: any) => {
        const payload = msg?.payload;
        if (payload?.senderId !== user?.id) {
          const now = Date.now();
          setCartItems(prev => {
            prev.forEach(it => {
              getPlaceKeys(it).forEach(k => cartTombstonesRef.current.set(k, now));
            });
            return [];
          });
          const sender = payload.senderName || 'Thành viên';
          setGroupToastMsg(`👥 ${sender} đã làm trống giỏ hàng!`);
          setTimeout(() => setGroupToastMsg(null), 3000);
        }
      })
      .on('broadcast', { event: 'calendar_delta' }, (msg: any) => {
        const payload = msg?.payload;
        if (payload?.delta && payload.updated_by !== user?.id) {
          setExternalDelta({ ...payload.delta });
        }
      })
      .on('broadcast', { event: 'cart_updated' }, (msg: any) => {
        const payload = msg?.payload;
        if (payload?.cartItems && payload.senderId !== user?.id) {
          setCartItems(prev => {
            const incomingItems: any[] = payload.cartItems;
            const validIncoming = incomingItems.filter(it => {
              const itKeys = getPlaceKeys(it);
              const maxTombTime = Math.max(0, ...itKeys.map(k => cartTombstonesRef.current.get(k) || 0));
              const itemTime = Number(it.updated_at || 0);
              return maxTombTime === 0 || itemTime > maxTombTime;
            });

            if (!prev || prev.length === 0) return validIncoming;

            const prevMap = new Map(prev.map(it => [it.place.id, it]));
            const merged: typeof prev = [];

            for (const incoming of validIncoming) {
              const local = prevMap.get(incoming.place?.id);
              if (!local) {
                merged.push(incoming);
              } else {
                const incomingTime = Number(incoming.updated_at || 0);
                const localTime = Number(local.updated_at || 0);
                if (incomingTime >= localTime) {
                  merged.push({ ...local, ...incoming });
                } else {
                  merged.push(local);
                }
                prevMap.delete(incoming.place?.id);
              }
            }

            for (const remaining of prevMap.values()) {
              const remKeys = getPlaceKeys(remaining);
              const maxTombTime = Math.max(0, ...remKeys.map(k => cartTombstonesRef.current.get(k) || 0));
              const localTime = Number(remaining.updated_at || 0);
              const isTombstoned = maxTombTime > 0 && maxTombTime >= localTime;
              if (isTombstoned) continue;

              merged.push(remaining);
            }
            return merged;
          });
          const sender = payload.senderName || 'Thành viên';
          setGroupToastMsg(`👥 ${sender} vừa cập nhật giỏ hàng chung!`);
          setTimeout(() => setGroupToastMsg(null), 3500);
        }
      })
      .on('broadcast', { event: 'calendar_updated' }, (msg: any) => {
        const payload = msg?.payload;
        if (payload?.cartItems && payload.senderId !== user?.id) {
          setCartItems(prev => {
            const incomingItems: any[] = payload.cartItems;
            const validIncoming = incomingItems.filter(it => {
              const itKeys = getPlaceKeys(it);
              const maxTombTime = Math.max(0, ...itKeys.map(k => cartTombstonesRef.current.get(k) || 0));
              const itemTime = Number(it.updated_at || 0);
              return maxTombTime === 0 || itemTime > maxTombTime;
            });

            if (!prev || prev.length === 0) return validIncoming;

            const prevMap = new Map(prev.map(it => [it.place.id, it]));
            const merged: typeof prev = [];

            for (const incoming of validIncoming) {
              const local = prevMap.get(incoming.place?.id);
              if (!local) {
                merged.push(incoming);
              } else {
                const incomingTime = Number(incoming.updated_at || 0);
                const localTime = Number(local.updated_at || 0);
                if (incomingTime >= localTime) {
                  merged.push({ ...local, ...incoming });
                } else {
                  merged.push(local);
                }
                prevMap.delete(incoming.place?.id);
              }
            }

            for (const remaining of prevMap.values()) {
              const remKeys = getPlaceKeys(remaining);
              const maxTombTime = Math.max(0, ...remKeys.map(k => cartTombstonesRef.current.get(k) || 0));
              const localTime = Number(remaining.updated_at || 0);
              const isTombstoned = maxTombTime > 0 && maxTombTime >= localTime;
              if (isTombstoned) continue;

              merged.push(remaining);
            }
            return merged;
          });
          const sender = payload.senderName || 'Thành viên';
          setGroupToastMsg(`📅 ${sender} vừa cập nhật lịch trình!`);
          setTimeout(() => setGroupToastMsg(null), 3000);
        }
      })
      .on('broadcast', { event: 'pregen_places_updated' }, (msg: any) => {
        const payload = msg?.payload || msg;
        if (payload?.places && Array.isArray(payload.places) && payload.places.length > 0) {
          setPregenPlaces(payload.places);
        }
      })
      .on('broadcast', { event: 'stage_changed' }, (msg: any) => {
        const payload = msg?.payload;
        if (payload?.stage) {
          setWorkspaceStage(payload.stage);
          if (payload.stage === 'scheduling') {
            setGroupToastMsg(`🚀 ${payload.senderName || 'Trưởng nhóm'} đã chuyển sang bước Xếp lịch trình!`);
            setTimeout(() => setGroupToastMsg(null), 3500);
          } else if (payload.stage === 'collecting') {
            setGroupToastMsg(`📝 ${payload.senderName || 'Trưởng nhóm'} đã quay lại bước Chọn thêm địa điểm!`);
            setTimeout(() => setGroupToastMsg(null), 3500);
          }
        }
      })
      .on('broadcast', { event: 'trip_finalized' }, (msg: any) => {
        const payload = msg?.payload;
        if (payload?.tripId) {
          setGroupToastMsg('🎉 Trưởng nhóm đã chốt lịch trình! Đang cùng bạn chuyển sang chuyến đi...');
          setTimeout(() => {
            const redirectUrl = payload.redirectUrl || APP_ROUTES.TRIP_DETAIL(payload.tripId);
            router.replace(redirectUrl as any);
          }, 800);
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const count = Object.keys(state).length;
        if (count > 0) setCollaboratorCount(count);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && user?.id) {
          await channel.track({
            user_id: user.id,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      draftChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [draftTripId, user?.id]);

  // Polling nhẹ mỗi 4 giây khi đang ở phòng chọn giỏ hàng chung để đảm bảo đồng bộ 100%
  useEffect(() => {
    if (!draftTripId || step !== 4) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/trips/${draftTripId}/shared-cart`);
        if (res.data?.tombstones) {
          for (const [k, v] of Object.entries(res.data.tombstones)) {
            const t = Number(v) || 0;
            if (t > (cartTombstonesRef.current.get(k) || 0)) {
              cartTombstonesRef.current.set(k, t);
            }
          }
        }
        const remoteCart = res.data?.draft_cart;
        if (Array.isArray(remoteCart)) {
          setCartItems((prev) => {
            const itemMap = new Map<string, any>();

            // 1. Giữ các item local nếu chưa bị tombstone đánh dấu xóa
            for (const local of prev) {
              const locKeys = getPlaceKeys(local);
              const maxTomb = Math.max(0, ...locKeys.map(k => cartTombstonesRef.current.get(k) || 0));
              const locTime = Number(local.updated_at || 0);
              if (maxTomb === 0 || locTime > maxTomb) {
                itemMap.set(local.place.id, local);
              }
            }

            // 2. Hợp nhất với remoteCart từ backend
            for (const remote of remoteCart) {
              const remKeys = getPlaceKeys(remote);
              const maxTomb = Math.max(0, ...remKeys.map(k => cartTombstonesRef.current.get(k) || 0));
              const remTime = Number(remote.updated_at || 0);
              if (maxTomb === 0 || remTime > maxTomb) {
                const pId = remote.place?.id || remote.id;
                const existing = itemMap.get(pId);
                if (!existing || Number(remote.updated_at || 0) >= Number(existing.updated_at || 0)) {
                  itemMap.set(pId, remote);
                }
              }
            }

            const mergedList = Array.from(itemMap.values());
            if (JSON.stringify(prev) !== JSON.stringify(mergedList)) {
              return mergedList;
            }
            return prev;
          });
        }
        const remotePregen = res.data?.pregen_places;
        if (Array.isArray(remotePregen) && remotePregen.length > 0) {
          setPregenPlaces(remotePregen);
        }
        const remoteStage = res.data?.workspace_stage;
        if (remoteStage && (remoteStage === 'collecting' || remoteStage === 'scheduling')) {
          setWorkspaceStage((prev) => {
            if (prev !== remoteStage) {
              if (remoteStage === 'scheduling') {
                setGroupToastMsg('🚀 Trưởng nhóm đã chuyển sang bước Xếp lịch trình!');
                setTimeout(() => setGroupToastMsg(null), 3500);
              } else if (remoteStage === 'collecting') {
                setGroupToastMsg('📝 Trưởng nhóm đã quay lại bước Chọn thêm địa điểm!');
                setTimeout(() => setGroupToastMsg(null), 3500);
              }
              return remoteStage;
            }
            return prev;
          });
        }
      } catch (e) {
        // Im lặng khi polling
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [draftTripId, step]);

  // Mở modal tạo nhóm / mời bạn bè cùng chọn giỏ hàng
  const handleOpenDraftGroupModal = async () => {
    if (draftTripId) {
      setShowGroupModal(true);
      return;
    }

    setIsCreatingDraftGroup(true);
    try {
      const formattedCartItems = cartItems.map((it, idx) => ({
        place: it.place,
        pricing_option: it.pricing_option,
        custom_cost: it.custom_cost,
        day_number: it.day_number || 0,
        order_index: idx + 1,
      }));

      const res = await api.post('/trips', {
        title: title || `Chuyến đi ${destinationCity} (Đang chọn địa điểm)`,
        destination_city: destinationCity,
        start_date: startDate,
        end_date: endDate,
        budget_total: budgetTotal,
        traveler_count: travelerCount,
        traveler_type: travelerType,
        creation_mode: 'manual',
        use_pro_workspace: true,
        is_ai_pro: true,
        is_draft: true,
        ai_provider: selectedAiProvider || 'custom_openai',
        preferences: {
          ...selectedPrefs,
          selected_prefs: selectedPrefs,
          special_requirements: specialRequirements,
          creation_mode: 'manual',
          draft_cart: cartItems,
          workspace_stage: workspaceStage,
          pregen_places: pregenPlaces,
          is_ai_pro: true,
          ai_tier: 'pro',
          use_pro_workspace: true,
        },
        cart_items: formattedCartItems,
      }, { timeout: 120000 });

      const newTrip = res.data;
      const tripId = newTrip.id;
      setDraftTripId(tripId);
      setDraftOwnerId(newTrip.user_id || user?.id || null);

      let token = newTrip.share_token;
      try {
        const collabRes = await api.post(`/trips/${tripId}/collaborators`);
        if (collabRes.data?.invite_token) {
          token = collabRes.data.invite_token;
        }
      } catch (e) {}

      setDraftShareToken(token || tripId);
      setShowGroupModal(true);
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Không thể khởi tạo nhóm lúc này. Vui lòng kiểm tra lại ngân sách hoặc thông tin!';
      setErrorMsg(msg);
    } finally {
      setIsCreatingDraftGroup(false);
    }
  };

  // Đội trưởng chuyển bước sang Xếp lịch trình 4B và đồng bộ cho cả nhóm
  const handleCaptainAdvanceToScheduling = () => {
    if (cartItems.length === 0) {
      setErrorMsg('Vui lòng chọn ít nhất 1 địa điểm vào giỏ hàng trước khi lên lịch!');
      return;
    }
    setErrorMsg('');
    setWorkspaceStage('scheduling');

    const senderName = user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Trưởng nhóm';
    const payload = { stage: 'scheduling', senderName };

    if (draftTripId) {
      try {
        if (draftChannelRef.current) {
          draftChannelRef.current.send({
            type: 'broadcast',
            event: 'stage_changed',
            payload,
          }).catch(() => {});
        } else {
          const channel = supabase.channel(`draft-cart:${draftTripId}`);
          channel.send({
            type: 'broadcast',
            event: 'stage_changed',
            payload,
          }).catch(() => {});
        }
      } catch (e) {}

      const tombstonesObj: Record<string, number> = {};
      cartTombstonesRef.current.forEach((val, key) => {
        tombstonesObj[key] = val;
      });

      api.put(`/trips/${draftTripId}/shared-cart`, {
        draft_cart: cartItems,
        deleted_place_ids: [],
        tombstones: tombstonesObj,
        workspace_stage: 'scheduling',
      }).catch((err) => {
        console.warn('Failed to update workspace_stage to scheduling:', err?.message);
      });
    }
  };

  // Đội trưởng quay lại bước Chọn địa điểm 4A và đồng bộ cho cả nhóm
  const handleBackToCollecting = () => {
    setWorkspaceStage('collecting');
    const senderName = user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Trưởng nhóm';
    const payload = { stage: 'collecting', senderName };

    if (draftTripId) {
      try {
        if (draftChannelRef.current) {
          draftChannelRef.current.send({
            type: 'broadcast',
            event: 'stage_changed',
            payload,
          }).catch(() => {});
        } else {
          const channel = supabase.channel(`draft-cart:${draftTripId}`);
          channel.send({
            type: 'broadcast',
            event: 'stage_changed',
            payload,
          }).catch(() => {});
        }
      } catch (e) {}

      const tombstonesObj: Record<string, number> = {};
      cartTombstonesRef.current.forEach((val, key) => {
        tombstonesObj[key] = val;
      });

      api.put(`/trips/${draftTripId}/shared-cart`, {
        draft_cart: cartItems,
        deleted_place_ids: [],
        tombstones: tombstonesObj,
        workspace_stage: 'collecting',
      }).catch((err) => {
        console.warn('Failed to update workspace_stage to collecting:', err?.message);
      });
    }
  };

  // ── LẮNG NGHE SỰ KIỆN CLICK THÊM GIỎ TỪ BẢN ĐỒ BƯỚC 4A ──
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handleMapMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'MAP_TOGGLE_CART' && e.data.placeId) {
        const target = deduplicatedPool.find((p: any) => p.id === e.data.placeId);
        if (target) {
          handleAddToCart(target);
        }
      } else if (e.data.type === 'MAP_HOVER_PLACE' && e.data.placeId) {
        setHoveredPoolPlaceId(e.data.placeId);
      }
    };
    window.addEventListener('message', handleMapMessage);
    return () => window.removeEventListener('message', handleMapMessage);
  }, [deduplicatedPool]);

  // ── HTML GOOGLE MAPS TILES CHO BƯỚC 4A (KHO GỢI Ý & GIỎ HÀNG) ──
  const cartMapIframeHTML = useMemo(() => {
    const validPlaces = filteredPoolPlaces.filter((p: any) => p.lat && p.lng);
    const cartIds = new Set<string>();
    filteredPoolPlaces.forEach((p) => {
      const match = cartItems.find((it) =>
        it.place.id === p.id ||
        (normalizePlaceKey(it.place.name) === normalizePlaceKey(p.name) && it.place.category === p.category)
      );
      if (match) cartIds.add(p.id);
    });
    const center = getCityCenterCoords(destinationCity);

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
    .map-pin {
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      box-shadow: 0 4px 10px rgba(0,0,0,0.3);
      cursor: pointer;
      transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      position: relative;
    }
    .map-pin:hover {
      transform: scale(1.24);
      z-index: 9999 !important;
    }
    .pin-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      background: #137333;
      color: white;
      font-size: 9px;
      font-weight: 900;
      width: 15px;
      height: 15px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1.5px solid white;
    }
    .leaflet-popup-content-wrapper {
      border-radius: 14px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      padding: 0;
      overflow: hidden;
    }
    .leaflet-popup-content {
      margin: 0;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: false }).setView([${center.lat}, ${center.lng}], 13);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      attribution: '© Google Maps'
    }).addTo(map);

    var markersMap = {};
    var places = ${JSON.stringify(validPlaces)};
    var cartIds = ${JSON.stringify(Array.from(cartIds))};
    var cartSet = new Set(cartIds);

    var categoryColors = {
      dining: '#EA4335',
      cafe: '#B06000',
      hotel: '#8E24AA',
      accommodation: '#8E24AA',
      attraction: '#137333',
      experience: '#1A73E8',
      default: '#1A73E8'
    };

    var categoryIcons = {
      dining: '🍽️',
      cafe: '☕',
      hotel: '🏨',
      accommodation: '🏨',
      attraction: '🏔️',
      experience: '✨',
      default: '📍'
    };

    var categoryNames = {
      dining: 'Ăn uống',
      cafe: 'Cà phê',
      hotel: 'Khách sạn',
      accommodation: 'Khách sạn',
      attraction: 'Tham quan',
      experience: 'Trải nghiệm',
      rental: 'Thuê xe',
      transport: 'Di chuyển',
      default: 'Địa điểm'
    };

    var bounds = [];

    places.forEach(function(p) {
      if (!p.lat || !p.lng) return;
      var inCart = cartSet.has(p.id);
      var cat = (p.category || 'default').toLowerCase();
      var color = categoryColors[cat] || categoryColors.default;
      var icon = categoryIcons[cat] || categoryIcons.default;
      var costFormatted = (Number(p.estimated_cost) || 0).toLocaleString('vi-VN') + ' đ';

      var html = '<div class="map-pin" style="width:34px; height:34px; background:' + (inCart ? '#137333' : color) + '; border:2.5px solid white;">' +
        '<span style="font-size:14px;">' + icon + '</span>' +
        (inCart ? '<span class="pin-badge">✓</span>' : '') +
        '</div>';

      var customIcon = L.divIcon({
        html: html,
        className: 'custom-leaflet-pin',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -18]
      });

      var marker = L.marker([p.lat, p.lng], { icon: customIcon }).addTo(map);
      markersMap[p.id] = marker;
      bounds.push([p.lat, p.lng]);

      var popupHtml = '<div style="padding:12px; min-width:210px; max-width:260px;">' +
        '<div style="font-size:10px; font-weight:800; color:' + color + '; margin-bottom:2px;">' + icon + ' ' + (categoryNames[cat] || 'Địa điểm') + '</div>' +
        '<div style="font-size:13px; font-weight:800; color:#202124; margin-bottom:4px;">' + p.name + '</div>' +
        '<div style="font-size:11px; font-weight:800; color:#137333; margin-bottom:4px;">' + costFormatted + '</div>' +
        (p.address ? '<div style="font-size:10px; color:#5F6368; margin-bottom:8px;">📍 ' + p.address + '</div>' : '') +
        '<button onclick="window.parent.postMessage({ type: \\'MAP_TOGGLE_CART\\', placeId: \\'' + p.id + '\\' }, \\'*\\')" style="width:100%; padding:7px 10px; border-radius:8px; border:none; cursor:pointer; font-weight:800; font-size:11px; background:' + (inCart ? '#E6F4EA' : '#1A73E8') + '; color:' + (inCart ? '#137333' : '#FFFFFF') + ';">' +
        (inCart ? '✓ Đã trong giỏ (Bấm để bỏ)' : '+ Thêm vào giỏ') +
        '</button>' +
        '</div>';

      marker.bindPopup(popupHtml);

      marker.on('mouseover', function() {
        window.parent.postMessage({ type: 'MAP_HOVER_PLACE', placeId: p.id }, '*');
      });
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    }

    // Lắng nghe lệnh từ React Native (highlight place khi hover card)
    window.addEventListener('message', function(e) {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'PAN_TO_PLACE' && e.data.placeId) {
        var m = markersMap[e.data.placeId];
        if (m) {
          map.panTo(m.getLatLng(), { animate: true, duration: 0.6 });
          m.openPopup();
        }
      }
    });
  </script>
</body>
</html>`;
  }, [filteredPoolPlaces, cartItems, destinationCity]);

  const handleDragStart = (placeId: string, e: any) => {
    setDraggedPlaceId(placeId);
    if (Platform.OS === 'web' && e && e.dataTransfer) {
      e.dataTransfer.setData('text/plain', placeId);
      e.dataTransfer.effectAllowed = 'move';
    }
  };

  const handleDragEnd = () => {
    setDraggedPlaceId(null);
    setDragOverTarget(null);
  };

  const handleDropOnDay = (targetDay: number, e: any) => {
    if (Platform.OS === 'web' && e && e.preventDefault) e.preventDefault();
    const placeId = draggedPlaceId || (e?.dataTransfer ? e.dataTransfer.getData('text/plain') : null);
    if (placeId) {
      handleMoveItemDay(placeId, targetDay);
      setActiveScheduleDay(targetDay);
    }
    setDraggedPlaceId(null);
    setDragOverTarget(null);
  };

  const handleDropOnUnassigned = (e: any) => {
    if (Platform.OS === 'web' && e && e.preventDefault) e.preventDefault();
    const placeId = draggedPlaceId || (e?.dataTransfer ? e.dataTransfer.getData('text/plain') : null);
    if (placeId) {
      handleMoveItemDay(placeId, 0);
    }
    setDraggedPlaceId(null);
    setDragOverTarget(null);
  };

  const handleAutoDistributeDays = () => {
    setCartItems(prev => {
      return prev.map((item, idx) => ({
        ...item,
        day_number: (idx % daysCount) + 1,
        order_index: Math.floor(idx / daysCount) + 1
      }));
    });
  };

  const handleReorderScheduleDayPlaces = (newWaypoints: RouteWaypoint[]) => {
    setCartItems(prev => {
      const updated = [...prev];
      newWaypoints.forEach((wp, newIdx) => {
        const foundIdx = updated.findIndex(
          it => it.place.id === wp.id && Number(it.day_number) === Number(activeScheduleDay)
        );
        if (foundIdx !== -1) {
          updated[foundIdx] = {
            ...updated[foundIdx],
            order_index: newIdx + 1
          };
        }
      });
      return updated;
    });
  };

  const handleUpdateItemNights = (placeId: string, delta: number) => {
    setCartItems(prev => prev.map(item => {
      if (item.place.id === placeId) {
        const currentNights = item.nights || 1;
        const newNights = Math.max(1, Math.min(currentNights + delta, Math.max(1, nightsCount)));
        return { ...item, nights: newNights };
      }
      return item;
    }));
  };

  const handleAddCustomPlace = async () => {
    if (!placeSearchQuery.trim()) return;
    const name = placeSearchQuery.trim();
    let lat = pregenPlaces[0]?.lat || 21.0285;
    let lng = pregenPlaces[0]?.lng || 105.8542;
    let address = `${name}, ${destinationCity}`;

    try {
      const res = await api.get(`/places/geocode?name=${encodeURIComponent(name)}&city=${encodeURIComponent(destinationCity)}`);
      if (res.data?.found && res.data.lat && res.data.lng) {
        lat = res.data.lat;
        lng = res.data.lng;
        if (res.data.address) address = res.data.address;
      }
    } catch (e) {
      // fallback
    }

    const customPlace: PlaceItem = {
      id: `custom_${Date.now()}`,
      name,
      category: 'dining' as any,
      city: destinationCity,
      address,
      lat,
      lng,
      price_level: 2,
      estimated_cost: 50000,
      rating: 4.8,
      social_review_quote: 'Địa điểm theo yêu cầu của du khách',
    };
    handleAddToCart(customPlace, 'manual', customPlace.estimated_cost);
    setPlaceSearchQuery('');
  };

  const handleMoveItemDay = (placeId: string, newDay: number) => {
    setCartItems(prev => {
      const targetDayItems = prev.filter(it => it.day_number === newDay && it.place.id !== placeId);
      return prev.map(it => {
        if (it.place.id === placeId) {
          return { ...it, day_number: newDay, order_index: targetDayItems.length + 1 };
        }
        return it;
      });
    });
  };

  const handleReorderItem = (placeId: string, direction: 'up' | 'down') => {
    setCartItems(prev => {
      const item = prev.find(it => it.place.id === placeId);
      if (!item) return prev;
      const sameDayItems = prev.filter(it => it.day_number === item.day_number).sort((a, b) => a.order_index - b.order_index);
      const idx = sameDayItems.findIndex(it => it.place.id === placeId);
      if (direction === 'up' && idx > 0) {
        const prevItem = sameDayItems[idx - 1];
        const temp = item.order_index;
        item.order_index = prevItem.order_index;
        prevItem.order_index = temp;
      } else if (direction === 'down' && idx < sameDayItems.length - 1) {
        const nextItem = sameDayItems[idx + 1];
        const temp = item.order_index;
        item.order_index = nextItem.order_index;
        nextItem.order_index = temp;
      }
      return [...prev];
    });
  };

  const handleRemoveFromCart = (placeId: string) => {
    setCartItems(prev => {
      const match = prev.find(item => item.place.id === placeId);
      if (!match) return prev;
      const delTime = Date.now();
      const delKeys = getPlaceKeys(match);
      delKeys.forEach(k => cartTombstonesRef.current.set(k, delTime));
      const updated = prev.filter(item => item !== match);
      broadcastCartAction({
        type: 'cart_item_removed',
        placeId: match.place.id,
        placeName: match.place.name,
        deletedKeys: delKeys,
        deleted_at: delTime,
        updatedCart: updated,
      });
      return updated;
    });
  };

  const handleUpdateItemCost = (placeId: string, newCost: number) => {
    setCartItems(prev => prev.map(item => item.place.id === placeId ? { ...item, custom_cost: newCost, pricing_option: 'manual' } : item));
    setEditingCostPlaceId(null);
  };

  const handleStartEditCost = (placeId: string, currentCost: number) => {
    setEditingCostPlaceId(placeId);
    setEditCostInput(String(currentCost));
  };

  const calendarInitialEvents: CalendarEventItem[] = useMemo(() => {
    const assigned = cartItems.filter(it => it.day_number && it.day_number > 0);
    if (assigned.length > 0) {
      return assigned.map((it) => ({
        id: `ev-${it.place.id}`,
        placeId: it.place.id,
        title: it.place.name,
        category: it.place.category,
        address: it.place.address,
        lat: it.place.lat,
        lng: it.place.lng,
        cost: it.custom_cost,
        dayNumber: it.day_number,
        startHour: it.startHour !== undefined ? it.startHour : 8,
        startMinute: it.startMinute || 0,
        durationMinutes: it.durationMinutes || 90,
      }));
    }
    // MỚI VÀO CHƯA SẮP XẾP GÌ: Lịch trình ban đầu PHẢI HOÀN TOÀN TRỐNG!
    return [];
  }, [cartItems]);

  const calendarStandbyPlaces: StandbyPlaceItem[] = useMemo(() => {
    // Chỉ đưa vào Giỏ chờ những địa điểm người dùng ĐÃ TỰ TAY CHỌN VÀO GIỎ HÀNG (cartItems) và chưa được xếp giờ
    return cartItems
      .filter(it => !it.day_number || it.day_number <= 0)
      .map(it => ({
        id: it.place.id,
        name: it.place.name,
        category: it.place.category,
        address: it.place.address,
        lat: it.place.lat,
        lng: it.place.lng,
        cost: it.custom_cost,
        suggestedDuration: it.durationMinutes || 90,
      }));
  }, [cartItems]);

  const handleCalendarEventsChange = (updatedEvents: CalendarEventItem[]) => {
    setCartItems(prev => {
      const now = Date.now();
      const updated = prev.map(item => {
        const found = updatedEvents.find(e => e.placeId === item.place.id || e.id === `ev-${item.place.id}`);
        if (found) {
          const hasChanged = item.day_number !== found.dayNumber ||
            item.startHour !== found.startHour ||
            item.startMinute !== found.startMinute ||
            item.custom_cost !== found.cost ||
            item.durationMinutes !== found.durationMinutes;
          return {
            ...item,
            day_number: found.dayNumber,
            custom_cost: found.cost,
            startHour: found.startHour,
            startMinute: found.startMinute,
            durationMinutes: found.durationMinutes,
            updated_at: hasChanged ? now : (item.updated_at || now),
          };
        }
        return {
          ...item,
          day_number: 0,
          updated_at: item.day_number !== 0 ? now : (item.updated_at || now),
        };
      });

      // Nếu có điểm từ Standby thêm vào
      const pool = pregenPlaces;
      updatedEvents.forEach(ev => {
        const already = updated.some(it => it.place.id === ev.placeId || `ev-${it.place.id}` === ev.id);
        if (!already) {
          const p = pool.find(place => place.id === ev.placeId);
          if (p) {
            updated.push({
              place: p,
              pricing_option: 'auto',
              custom_cost: ev.cost,
              day_number: ev.dayNumber,
              startHour: ev.startHour,
              startMinute: ev.startMinute,
              durationMinutes: ev.durationMinutes,
              order_index: updated.length + 1,
              updated_at: now,
            });
          }
        }
      });

      if (draftTripId) {
        const senderName = user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Thành viên';
        draftChannelRef.current?.send({
          type: 'broadcast',
          event: 'calendar_updated',
          payload: { cartItems: updated, senderId: user?.id, senderName },
        }).catch(() => {});
        const tombstonesObj: Record<string, number> = {};
        cartTombstonesRef.current.forEach((val, key) => {
          tombstonesObj[key] = val;
        });

        api.put(`/trips/${draftTripId}/shared-cart`, {
          draft_cart: updated,
          deleted_place_ids: [],
          tombstones: tombstonesObj,
          workspace_stage: 'scheduling',
        }).catch(() => {});
      }

      return updated;
    });
  };

  const handleSaveCalendarWorkspace = async (updatedEvents: CalendarEventItem[]) => {
    let updated = cartItems.map(item => {
      const found = updatedEvents.find(e => e.placeId === item.place.id || e.id === `ev-${item.place.id}`);
      if (found) {
        return {
          ...item,
          day_number: found.dayNumber,
          custom_cost: found.cost,
          startHour: found.startHour,
          startMinute: found.startMinute,
          durationMinutes: found.durationMinutes,
        };
      }
      return {
        ...item,
        day_number: 0,
      };
    });

    // Nếu có điểm từ Standby được xếp vào
    const pool = pregenPlaces;
    updatedEvents.forEach(ev => {
      const already = updated.some(it => it.place.id === ev.placeId || `ev-${it.place.id}` === ev.id);
      if (!already) {
        const p = pool.find(place => place.id === ev.placeId);
        if (p) {
          updated.push({
            place: p,
            pricing_option: 'auto',
            custom_cost: ev.cost,
            day_number: ev.dayNumber,
            startHour: ev.startHour,
            startMinute: ev.startMinute,
            durationMinutes: ev.durationMinutes,
            order_index: updated.length + 1,
            added_by_name: user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Tôi',
            added_by_id: user?.id,
          });
        }
      }
    });

    setCartItems(updated);
    syncCartToDraft(updated);
    await handleProScheduleSubmit('manual', updated);
  };

  const handleProScheduleSubmit = async (mode: 'ai_auto' | 'manual', sourceCartItems?: typeof cartItems) => {
    setShowScheduleOptionModal(false);
    setErrorMsg('');

    const itemsToSubmit = sourceCartItems || cartItems;

    const formattedPrefs = PREFERENCE_OPTIONS.reduce((acc, pref) => {
      acc[pref.id] = selectedPrefs.includes(pref.id);
      return acc;
    }, {} as Record<string, any>);

    const willUsePro = Boolean(useProWorkspace || useProForTrip || selectedAiProvider === 'custom_openai');
    formattedPrefs.is_ai_pro = willUsePro;
    formattedPrefs.ai_tier = willUsePro ? 'pro' : 'standard';
    formattedPrefs.creation_mode = mode;
    if (useProWorkspace) {
      formattedPrefs.use_pro_workspace = true;
    }

    const fullSpecialRequirements = [
      specialRequirements,
      lodgingPreference === 'single'
        ? 'Sở thích lưu trú: Ở cố định một chỗ'
        : 'Sở thích lưu trú: Đổi nhiều khách sạn để trải nghiệm'
    ].filter(Boolean).join('\n');

    const parsedStart = parseDate(startDate);
    const parsedEnd = parseDate(endDate);
    const formattedStartDate = parsedStart ? formatToISODate(parsedStart) : startDate;
    const formattedEndDate = parsedEnd ? formatToISODate(parsedEnd) : endDate;

    const formattedCartItems = itemsToSubmit.map((it, idx) => ({
      place: it.place,
      day_number: it.day_number || 0,
      order_index: it.order_index || (idx + 1),
      custom_cost: it.custom_cost,
      pricing_option: it.pricing_option,
      startHour: it.startHour,
      startMinute: it.startMinute,
      durationMinutes: it.durationMinutes,
    }));

    if (mode === 'ai_auto') {
      setLoading(true);
      setLoadingStage(0);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const stageInterval = setInterval(() => {
        setLoadingStage(prev => {
          if (prev < LOADING_STAGES.length - 1) return prev + 1;
          clearInterval(stageInterval);
          return prev;
        });
      }, 1800);

      try {
        const res = await api.post('/trips', {
          title: title || `Du hí ${destinationCity}`,
          destination_city: destinationCity,
          start_date: formattedStartDate,
          end_date: formattedEndDate,
          budget_total: budgetTotal,
          traveler_count: travelerCount,
          traveler_type: travelerType,
          preferences: formattedPrefs,
          health_conditions: healthConditions,
          special_requirements: fullSpecialRequirements,
          ai_provider: useProWorkspace ? (selectedAiProvider || 'custom_openai') : selectedAiProvider,
          is_ai_pro: willUsePro,
          use_pro_workspace: Boolean(useProWorkspace),
          creation_mode: 'ai_auto',
          cart_items: formattedCartItems,
          ...(draftTripId ? { draft_id: draftTripId } : {}),
        }, { signal: controller.signal, timeout: 120000 });
        clearInterval(stageInterval);
        await clearCache('trips');
        const targetTripId = res.data?.id || draftTripId;
        if (draftTripId && targetTripId) {
          await broadcastTripFinalized(targetTripId);
        }
        const granted = await requestNotificationPermission();
        if (granted && targetTripId) {
          await scheduleTripReminder(
            targetTripId,
            title || `Du hí ${destinationCity}`,
            startDate,
          );
        }
        router.replace(APP_ROUTES.TRIP_DETAIL(targetTripId) as any);
      } catch (err: any) {
        clearInterval(stageInterval);
        setLoading(false);
        if (err.name === 'CanceledError' || err.name === 'AbortError' || err.code === 'ERR_CANCELED') return;
        if (err.response?.status === 403 || err.response?.data?.code === 'requires_premium') {
          setShowPremiumModal(true);
        }
        setErrorMsg(err.response?.data?.error || 'Có lỗi xảy ra khi tạo chuyến đi');
      }
    } else {
      // mode === 'manual': Không gọi AI, tạo ngay chuyến đi và đưa các địa điểm vào ngày 1 để khách tự sắp xếp, chuyển ngay sang trang chi tiết chuyến đi.
      setLoading(true);
      setLoadingStage(4);
      try {
        const res = await api.post('/trips', {
          title: title || `Du hí ${destinationCity} (Tự sắp xếp)`,
          destination_city: destinationCity,
          start_date: formattedStartDate,
          end_date: formattedEndDate,
          budget_total: budgetTotal,
          traveler_count: travelerCount,
          traveler_type: travelerType,
          preferences: formattedPrefs,
          health_conditions: healthConditions,
          special_requirements: fullSpecialRequirements,
          creation_mode: 'manual',
          is_finalizing: true,
          ai_provider: useProWorkspace ? (selectedAiProvider || 'custom_openai') : selectedAiProvider,
          is_ai_pro: willUsePro,
          use_pro_workspace: Boolean(useProWorkspace),
          cart_items: formattedCartItems,
          ...(draftTripId ? { draft_id: draftTripId } : {}),
        }, { timeout: 120000 });
        await clearCache('trips');
        const targetTripId = res.data?.id || draftTripId;
        if (draftTripId && targetTripId) {
          await broadcastTripFinalized(targetTripId);
        }
        router.replace(APP_ROUTES.TRIP_DETAIL(targetTripId) as any);
      } catch (err: any) {
        setLoading(false);
        if (err.response?.status === 403 || err.response?.data?.code === 'requires_premium') {
          setShowPremiumModal(true);
        }
        setErrorMsg(err.response?.data?.error || 'Có lỗi xảy ra khi tạo chuyến đi thủ công');
      }
    }
  };

  // Đọc params từ Smart Empty State hoặc liên kết ngoài để tự động điền
  useEffect(() => {
    if (params.city) {
      const cityDecoded = decodeURIComponent(params.city);
      const matchedCity = VIETNAMESE_CITIES.find(c => c.toLowerCase() === cityDecoded.toLowerCase()) || cityDecoded;
      setDestinationCity(matchedCity);
      setTitle(`Khám phá ${matchedCity}`);

      const daysCount = parseInt(params.days || '3', 10) || 3;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const endDay = new Date(tomorrow);
      endDay.setDate(tomorrow.getDate() + (daysCount - 1));

      setStartDate(formatToISODate(tomorrow));
      setEndDate(formatToISODate(endDay));

      if (params.budget) {
        const b = parseInt(params.budget, 10);
        if (!isNaN(b) && b > 0) setBudgetTotal(b);
      }

      if (params.theme) {
        const themeDecoded = decodeURIComponent(params.theme);
        setSelectedPrefs(prev => Array.from(new Set([...prev, themeDecoded])));
      }
    }
  }, [params.city, params.days, params.budget, params.theme]);


  // Real-time validation for dates
  useEffect(() => {
    if (!startDate && !endDate) {
      setErrorMsg('');
      return;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (startDate) {
      const start = parseDate(startDate);
      if (start) {
        if (start < today) {
          setErrorMsg('Ngày đi không được ở quá khứ');
          return;
        }
      }
    }
    
    if (endDate) {
      const end = parseDate(endDate);
      if (end) {
        if (end < today) {
          setErrorMsg('Ngày về không được ở quá khứ');
          return;
        }
      }
    }
    
    if (startDate && endDate) {
      const start = parseDate(startDate);
      const end = parseDate(endDate);
      if (start && end) {
        if (start > end) {
          setErrorMsg('Ngày về phải sau ngày đi');
          return;
        }
      }
    }
    
    setErrorMsg('');
  }, [startDate, endDate]);

  // Clear budget errors when budget or traveler count changes to keep the Next/Submit button enabled
  useEffect(() => {
    setErrorMsg('');
  }, [budgetTotal, travelerCount]);

  const handlePrefToggle = (id: string) => {
    setSelectedPrefs(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleTravelerTypeChange = (value: string) => {
    setTravelerType(value);
    if (value === TravelerType.SOLO) setTravelerCount(1);
    else if (value === TravelerType.COUPLE) setTravelerCount(2);
    else if (travelerCount <= 2) setTravelerCount(4);
  };

  const handleNext = () => {
    if (step === 1) {
      if (!startDate || !endDate) {
        setErrorMsg('Vui lòng chọn ngày đi và ngày về');
        return;
      }
      
      const start = parseDate(startDate);
      const end = parseDate(endDate);
      if (!start || isNaN(start.getTime()) || !end || isNaN(end.getTime())) {
        setErrorMsg('Ngày đi hoặc ngày về không đúng định dạng');
        return;
      }
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (start < today) {
        setErrorMsg('Ngày đi không được ở quá khứ');
        return;
      }
      if (end < today) {
        setErrorMsg('Ngày về không được ở quá khứ');
        return;
      }
      if (start > end) {
        setErrorMsg('Ngày về phải sau ngày đi');
        return;
      }
    }
    if (step === 2) {
      if (budgetTotal <= 0) {
        setErrorMsg('Vui lòng nhập tổng ngân sách lớn hơn 0');
        return;
      }
      const { minBudget, daysCount, nightsCount } = calculateMinimumBudget(startDate, endDate, travelerCount);
      if (budgetTotal < minBudget) {
        setErrorMsg(`Ngân sách tối thiểu dự kiến cho chuyến đi ${daysCount} ngày (${nightsCount} đêm) của ${travelerCount} khách là ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(minBudget)} (bao gồm chỗ nghỉ bình dân dorm và chi phí ăn uống tối thiểu). Vui lòng nâng ngân sách để tiếp tục.`);
        return;
      }
    }
    setErrorMsg('');
    setStep(prev => prev + 1);
  };

  const handlePrev = () => {
    setErrorMsg('');
    // Nếu đang ở Pro Workspace tại step 2, bấm quay lại hoặc chuyển mode
    setStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    setErrorMsg('');
    const { minBudget, daysCount, nightsCount } = calculateMinimumBudget(startDate, endDate, travelerCount);
    if (budgetTotal < minBudget) {
      setErrorMsg(`Ngân sách tối thiểu dự kiến cho chuyến đi ${daysCount} ngày (${nightsCount} đêm) của ${travelerCount} khách là ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(minBudget)}. Vui lòng quay lại bước 2 để nâng ngân sách.`);
      setStep(2);
      return;
    }

    setLoading(true);
    setLoadingStage(0);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const stageInterval = setInterval(() => {
      setLoadingStage(prev => {
        if (prev < LOADING_STAGES.length - 1) return prev + 1;
        clearInterval(stageInterval);
        return prev;
      });
    }, 1800);

    const formattedPrefs = PREFERENCE_OPTIONS.reduce((acc, pref) => {
      acc[pref.id] = selectedPrefs.includes(pref.id);
      return acc;
    }, {} as Record<string, any>);

    const willUsePro = Boolean(useProWorkspace || useProForTrip || selectedAiProvider === 'custom_openai');
    formattedPrefs.is_ai_pro = willUsePro;
    formattedPrefs.ai_tier = willUsePro ? 'pro' : 'standard';
    if (useProWorkspace) {
      formattedPrefs.use_pro_workspace = true;
    }

    const fullSpecialRequirements = [
      specialRequirements,
      lodgingPreference === 'single'
        ? 'Sở thích lưu trú: Ở cố định một chỗ'
        : 'Sở thích lưu trú: Đổi nhiều khách sạn để trải nghiệm'
    ].filter(Boolean).join('\n');

    const parsedStart = parseDate(startDate);
    const parsedEnd = parseDate(endDate);
    const formattedStartDate = parsedStart ? formatToISODate(parsedStart) : startDate;
    const formattedEndDate = parsedEnd ? formatToISODate(parsedEnd) : endDate;

    try {
      const res = await api.post('/trips', {
        title: title || `Du hí ${destinationCity}`,
        destination_city: destinationCity,
        start_date: formattedStartDate,
        end_date: formattedEndDate,
        budget_total: budgetTotal,
        traveler_count: travelerCount,
        traveler_type: travelerType,
        preferences: formattedPrefs,
        health_conditions: healthConditions,
        special_requirements: fullSpecialRequirements,
        ai_provider: useProWorkspace ? (selectedAiProvider || 'custom_openai') : selectedAiProvider,
        is_ai_pro: willUsePro,
        use_pro_workspace: Boolean(useProWorkspace),
        ...(draftTripId ? { draft_id: draftTripId } : {}),
      }, { signal: controller.signal, timeout: 120000 });
      clearInterval(stageInterval);
      // Invalidate trips cache + schedule reminder notification
      await clearCache('trips');
      const targetTripId = res.data?.id || draftTripId;
      if (draftTripId && targetTripId) {
        await broadcastTripFinalized(targetTripId);
      }
      const granted = await requestNotificationPermission();
      if (granted && targetTripId) {
        await scheduleTripReminder(
          targetTripId,
          title || `Du hí ${destinationCity}`,
          startDate,
        );
      }
      router.replace(APP_ROUTES.TRIP_DETAIL(targetTripId) as any);
    } catch (err: any) {
      clearInterval(stageInterval);
      setLoading(false);
      // Ignore abort errors (user cancelled)
      if (err.name === 'CanceledError' || err.name === 'AbortError' || err.code === 'ERR_CANCELED') return;
      if (err.response?.status === 403 || err.response?.data?.code === 'requires_premium') {
        setShowPremiumModal(true);
      }
      setErrorMsg(err.response?.data?.error || 'Có lỗi xảy ra khi tạo chuyến đi');
      setStep(4);
    }
  };

  if (isAdmin) {
    return (
      <View className="flex-1 bg-brand-bg items-center justify-center p-6 gap-4">
        <ActivityIndicator size="large" color={BRAND_COLORS.primary} />
        <Text className="text-base font-bold text-brand-text">Tài khoản Quản trị viên (Admin)</Text>
        <Text className="text-xs text-brand-textSoft text-center max-w-sm">
          Quản trị viên chuyên tâm quản trị hệ thống và không tạo chuyến đi cá nhân. Đang chuyển hướng về Bảng Quản Trị...
        </Text>
        <Pressable
          onPress={() => router.replace(APP_ROUTES.ADMIN as any)}
          className="mt-2 px-5 py-2.5 rounded-xl bg-brand-primary"
          style={{ cursor: 'pointer' as any }}
        >
          <Text className="text-white text-xs font-bold">Vào Bảng Quản Trị ngay →</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) return <LoadingScreen stage={loadingStage} onCancel={handleCancelLoading} />;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-brand-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 48, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className={`w-full self-center gap-8 ${useProWorkspace && step === 4 ? 'max-w-[1360px]' : 'max-w-xl'}`}>
          {/* Top bar: back + step dots */}
          <View className="flex-row justify-between items-center">
            <Pressable
              onPress={() => router.push(APP_ROUTES.TRIPS as any)}
              className="flex-row items-center gap-1"
            >
              <ArrowLeft size={14} color={BRAND_COLORS.textSoft} />
              <Text className="text-xs font-bold text-brand-textSoft">Quay lại</Text>
            </Pressable>

            <View className="flex-row gap-1.5">
              {[1, 2, 3, 4].map(idx => (
                <View
                  key={idx}
                  className={`h-1.5 rounded-full ${step >= idx ? 'bg-brand-primary' : 'bg-brand-line'}`}
                  style={{ width: 32 }}
                />
              ))}
            </View>
          </View>

          {/* Form card */}
          <View className="bg-white rounded-3xl p-8 shadow-sm border border-brand-line/30 gap-6">
            {/* Error banner */}
            {!!errorMsg && (
              <View className="p-4 rounded-xl bg-brand-danger/10 border border-brand-danger/30 flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <View className="flex-row gap-2 items-start flex-1 min-w-[240px]">
                  <AlertTriangle size={18} color={BRAND_COLORS.danger} />
                  <Text className="text-brand-danger text-sm flex-1">{errorMsg}</Text>
                </View>
                {useProWorkspace && step === 4 && (
                  <View className="flex-row items-center gap-2">
                    <Pressable
                      testID="btn-retry-pregen-banner"
                      onPress={fetchPregenPlaces}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 active:opacity-90 flex-row items-center gap-1"
                    >
                      <Sparkles size={13} color="#FFFFFF" />
                      <Text className="text-xs font-bold text-white">🔄 Thử lại lấy gợi ý AI</Text>
                    </Pressable>
                    <Pressable
                      testID="btn-manual-add-place-banner"
                      onPress={() => setShowCustomPlaceModal(true)}
                      className="px-3 py-1.5 rounded-lg bg-brand-bgAlt border border-brand-line/60 active:opacity-80 flex-row items-center gap-1"
                    >
                      <Plus size={13} color={BRAND_COLORS.text} />
                      <Text className="text-xs font-bold text-brand-text">+ Thêm địa điểm thủ công</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}

            {/* ── STEP 1: Destination & Dates ── */}
            {step === 1 && (
              <Reveal>
                <View className="gap-6">
                  <Text className="font-display font-extrabold text-2xl text-brand-text">
                    Bạn muốn đi du lịch ở đâu?
                  </Text>

                  {/* City Dropdown picker [Mục 2] */}
                  <View className="gap-2">
                    <View className="flex-row items-center gap-1.5">
                      <MapPin size={14} color={BRAND_COLORS.primary} />
                      <Text className="text-sm font-bold text-brand-textSoft">Điểm đến (Chọn Thành Phố)</Text>
                    </View>
                    {Platform.OS === 'web' ? (
                      <select
                        value={destinationCity}
                        onChange={(e) => setDestinationCity(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          borderRadius: '12px',
                          border: '1px solid rgba(27,36,32,0.15)',
                          backgroundColor: '#FBF5EA',
                          fontSize: '14px',
                          fontWeight: 'bold',
                          color: '#1B2420',
                          outline: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        {VIETNAMESE_CITIES.map((city) => (
                          <option key={city} value={city}>
                            📍 {city}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <View style={{ borderWidth: 1, borderColor: 'rgba(27,36,32,0.15)', borderRadius: 12, overflow: 'hidden', backgroundColor: '#FBF5EA' }}>
                        <Pressable
                          style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                        >
                          <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 14, color: '#1B2420' }}>
                            📍 {destinationCity}
                          </Text>
                          <ChevronDown size={16} color="#1B2420" />
                        </Pressable>
                      </View>
                    )}
                  </View>

                  {/* Dates */}
                  <View className="flex-row gap-4">
                    <View className="flex-1 gap-1.5">
                      <Text className="text-sm font-bold text-brand-textSoft">Ngày đi</Text>
                      <DateInput value={startDate} onChange={setStartDate} placeholder="YYYY-MM-DD" min={getTodayString()} />
                    </View>
                    <View className="flex-1 gap-1.5">
                      <Text className="text-sm font-bold text-brand-textSoft">Ngày về</Text>
                      <DateInput value={endDate} onChange={setEndDate} placeholder="YYYY-MM-DD" min={getTodayString()} />
                    </View>
                  </View>

                  {/* Title (optional) */}
                  <View className="gap-1.5">
                    <Text className="text-sm font-bold text-brand-textSoft">Tên chuyến đi (Tùy chọn)</Text>
                    <TextInput
                      value={title}
                      onChangeText={setTitle}
                      placeholder={`Hành trình khám phá ${destinationCity}`}
                      className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm bg-brand-bg text-brand-text"
                      placeholderTextColor={BRAND_COLORS.textMuted}
                    />
                  </View>
                </View>
              </Reveal>
            )}

            {/* ── STEP 2: Travelers & Budget ── */}
            {step === 2 && (
              <Reveal>
                <View className="gap-6">
                  <Text className="font-display font-extrabold text-2xl text-brand-text">
                    Đoàn đi và Ngân sách
                  </Text>

                      {/* Traveler type */}
                      <View className="gap-2">
                        <Text className="text-sm font-bold text-brand-textSoft">Loại thành viên</Text>
                        <View className="flex-row flex-wrap gap-2">
                          {TRAVELER_TYPES.map(t => (
                            <Pressable
                              key={t.value}
                              onPress={() => handleTravelerTypeChange(t.value)}
                              className={`px-4 py-2.5 rounded-xl border ${travelerType === t.value
                                ? 'bg-brand-primary border-brand-primary'
                                : 'bg-brand-bg border-brand-line'}`}
                            >
                              <Text
                                className={`text-sm font-semibold ${travelerType === t.value ? 'text-white' : 'text-brand-textSoft'}`}
                              >
                                {t.label}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                        {(travelerType === TravelerType.SOLO || travelerType === TravelerType.COUPLE) && (
                          <Text className="text-xs font-semibold text-brand-primary">
                            {travelerType === TravelerType.SOLO
                              ? 'ℹ️ Đã tự động thiết lập 1 người (Đi một mình).'
                              : 'ℹ️ Đã tự động thiết lập 2 người (Cặp đôi).'}
                          </Text>
                        )}
                      </View>

                      {/* Traveler count (only for group/family/friends) */}
                      {travelerType !== 'solo' && travelerType !== 'couple' && (
                        <View className="gap-1.5">
                          <Text className="text-sm font-bold text-brand-textSoft">Số lượng khách (Tối thiểu 3)</Text>
                          <TextInput
                            value={String(travelerCount)}
                            onChangeText={v => {
                              const n = parseInt(v) || 3;
                              setTravelerCount(n < 3 ? 3 : n);
                            }}
                            keyboardType="numeric"
                            className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm font-semibold bg-brand-bg text-brand-text"
                            placeholderTextColor={BRAND_COLORS.textMuted}
                          />
                        </View>
                      )}

                      {/* Budget */}
                      <View className="gap-1.5">
                        <View className="flex-row justify-between items-center">
                          <Text className="text-sm font-bold text-brand-textSoft">Tổng ngân sách (VND)</Text>
                          <Text className="text-xs font-semibold text-brand-primary">
                            {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(budgetTotal)}
                          </Text>
                        </View>
                        <View className="flex-row items-center gap-3">
                          <TextInput
                            value={budgetTotal > 0 ? new Intl.NumberFormat('vi-VN').format(budgetTotal) : ''}
                            onChangeText={v => setBudgetTotal(parseInt(v.replace(/\D/g, ''), 10) || 0)}
                            keyboardType="numeric"
                            className="flex-1 px-4 py-3 rounded-xl border border-brand-line text-sm font-semibold bg-brand-bg text-brand-text"
                            placeholderTextColor={BRAND_COLORS.textMuted}
                          />
                          <DollarSign size={18} color={BRAND_COLORS.primary} />
                        </View>
                        <Text className="text-[10px] text-brand-textMuted">
                          Gợi ý: Tối thiểu ~1,500,000đ/ngày để có trải nghiệm tốt.
                        </Text>

                        {/* Component Phân bổ ngân sách theo Tag với Nút Tự động chia */}
                        <BudgetBreakdown
                          totalBudget={budgetTotal}
                          breakdown={budgetBreakdown}
                          onChange={setBudgetBreakdown}
                        />
                      </View>

                      {/* Lodging Preference */}
                      <View className="gap-2 mt-2">
                        <Text className="text-sm font-bold text-brand-textSoft">Sở thích lưu trú</Text>
                        <View className="flex-row gap-3">
                          <Pressable
                            onPress={() => setLodgingPreference('single')}
                            className={`flex-1 px-4 py-3 rounded-xl border ${lodgingPreference === 'single'
                              ? 'bg-brand-primary border-brand-primary'
                              : 'bg-brand-bg border-brand-line'}`}
                          >
                            <Text
                              className={`text-xs font-bold text-center ${lodgingPreference === 'single' ? 'text-white' : 'text-brand-textSoft'}`}
                            >
                              Ở cố định 1 chỗ
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setLodgingPreference('multiple')}
                            className={`flex-1 px-4 py-3 rounded-xl border ${lodgingPreference === 'multiple'
                              ? 'bg-brand-primary border-brand-primary'
                              : 'bg-brand-bg border-brand-line'}`}
                          >
                            <Text
                              className={`text-xs font-bold text-center ${lodgingPreference === 'multiple' ? 'text-white' : 'text-brand-textSoft'}`}
                            >
                              Đổi nhiều nơi
                            </Text>
                          </Pressable>
                        </View>
                        <Text className="text-[10px] text-brand-textMuted">
                          {lodgingPreference === 'single'
                            ? 'Gợi ý: Ở cố định giúp tối ưu hóa chi phí lưu trú và di chuyển thuận tiện hơn.'
                            : 'Lưu ý: Thay đổi chỗ ở có thể tăng chi phí và công sức nhận/trả phòng.'}
                        </Text>
                      </View>
                    </View>
              </Reveal>
            )}

            {/* ── STEP 3: Preferences ── */}
            {step === 3 && (
              <Reveal>
                <View className="gap-6">
                  <Text className="font-display font-extrabold text-2xl text-brand-text">
                    Bạn mong muốn trải nghiệm điều gì?
                  </Text>

                  <View className="gap-2">
                    <Text className="text-sm font-bold text-brand-textSoft">Chọn các sở thích (Chọn nhiều)</Text>
                    <View className="flex-row flex-wrap gap-2.5">
                      {PREFERENCE_OPTIONS.map(pref => {
                        const selected = selectedPrefs.includes(pref.id);
                        return (
                          <Pressable
                            key={pref.id}
                            onPress={() => handlePrefToggle(pref.id)}
                            className={`px-4 py-3 rounded-xl border ${selected
                              ? 'bg-brand-primary border-brand-primary'
                              : 'bg-brand-bg border-brand-line/50'}`}
                          >
                            <Text
                              className={`text-sm font-semibold ${selected ? 'text-white' : 'text-brand-textSoft'}`}
                            >
                              {pref.label}
                            </Text>
                          </Pressable>
                        );
                      })}

                      {/* Display custom added tags in wizard */}
                      {selectedPrefs
                        .filter(p => !PREFERENCE_OPTIONS.some(opt => opt.id === p))
                        .map((customTag, idx) => (
                          <Pressable
                            key={idx}
                            onPress={() => handlePrefToggle(customTag)}
                            className="px-4 py-3 rounded-xl bg-brand-accent border border-brand-accent"
                          >
                            <Text className="text-sm font-bold text-white">✨ {customTag} ✕</Text>
                          </Pressable>
                        ))}
                    </View>
                  </View>

                  {/* Custom tag input in wizard */}
                  <View className="gap-2 pt-2 border-t border-brand-line/30">
                    <Text className="text-xs font-bold text-brand-textSoft">Hoặc tự nhập sở thích trải nghiệm riêng:</Text>
                    <View className="flex-row gap-2">
                      <TextInput
                        value={customPrefInput}
                        onChangeText={setCustomPrefInput}
                        placeholder="VD: Bắn cung, Ngắm hoàng hôn..."
                        className="flex-1 px-4 py-2.5 rounded-xl border border-brand-line text-sm bg-brand-bg text-brand-text"
                        placeholderTextColor={BRAND_COLORS.textMuted}
                      />
                      <Pressable
                        onPress={() => {
                          if (customPrefInput.trim() && !selectedPrefs.includes(customPrefInput.trim())) {
                            setSelectedPrefs(prev => [...prev, customPrefInput.trim()]);
                            setCustomPrefInput('');
                          }
                        }}
                        disabled={!customPrefInput.trim()}
                        className="px-5 py-2.5 rounded-xl bg-brand-accent justify-center items-center"
                        style={{ opacity: customPrefInput.trim() ? 1 : 0.6 }}
                      >
                        <Text className="text-xs font-bold text-white">+ Thêm</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </Reveal>
            )}

            {/* ── STEP 4: Setup & Schedule (Pro Workspace or Standard AI) ── */}
            {step === 4 && (
              <Reveal>
                <View className="gap-6">
                  {/* Mode header / Group Collaboration Bar at the top of Step 4 */}
                  {!canAccessWorkspace ? (
                    // Banner for Free user
                    <View className="p-4 rounded-2xl bg-[#FFFBF0] border border-[#F5D599] flex-row items-center justify-between gap-3 shadow-sm">
                      <View className="flex-1 gap-1">
                        <View className="flex-row items-center gap-1.5">
                          <Crown size={16} color={BRAND_COLORS.accent} />
                          <Text className="text-sm font-extrabold text-[#9A5B00]">
                            🌟 Chế độ Lập kế hoạch Chuyên sâu: Tự tay chọn địa điểm trên Bản đồ & Quản lý ngân sách 🔒
                          </Text>
                        </View>
                        <Text className="text-xs text-[#7A5210] leading-relaxed">
                          AI sinh kho địa điểm phong phú thực tế theo đúng sở thích và ngân sách vừa chọn. Bạn tự do nhặt vào giỏ, tạo nhóm cùng chọn và xem đường đi trực tiếp.
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setShowPremiumModal(true)}
                        className="px-3.5 py-2 rounded-xl bg-brand-accent active:opacity-90 flex-row items-center gap-1.5 self-center shadow-sm"
                      >
                        <Crown size={13} color="#FFFFFF" />
                        <Text className="text-xs font-bold text-white whitespace-nowrap">Nâng cấp Pro để mở khóa</Text>
                      </Pressable>
                    </View>
                  ) : useProWorkspace ? (
                    <View className="p-3.5 rounded-2xl bg-white border border-brand-line/50 shadow-sm gap-2.5">
                      <View className="flex-row flex-wrap items-center justify-between gap-2">
                        <View className="flex-row items-center gap-2.5">
                          <View className="w-9 h-9 rounded-xl bg-brand-primary items-center justify-center shadow-xs">
                            <Crown size={17} color="#FFFFFF" />
                          </View>
                          <View>
                            <View className="flex-row items-center gap-2 flex-wrap">
                              <Text className="text-sm font-extrabold text-brand-text">
                                Không gian Chọn địa điểm & Lập lịch ViVu ({destinationCity})
                              </Text>
                              <View className="px-2 py-0.5 rounded-full bg-brand-primary/10 border border-brand-primary/20">
                                <Text className="text-[10px] font-bold text-brand-primary">
                                  {`⚡ Còn ${paymentStatus?.remainingTrips ?? 0} lượt Pro`}
                                </Text>
                              </View>
                            </View>
                            <Text className="text-[11px] text-brand-textSoft">
                              {draftTripId
                                ? `🟢 Phòng chọn chung đang hoạt động · ${collaboratorCount} thành viên trực tuyến`
                                : 'Chọn địa điểm vào giỏ hoặc mời bạn bè cùng chọn đồng bộ tức thì'}
                            </Text>
                          </View>
                        </View>

                        {/* Nút thao tác Nhóm & Thêm địa điểm */}
                        <View className="flex-row items-center gap-2">
                          <Pressable
                            testID="btn-open-custom-place-modal"
                            onPress={() => setShowCustomPlaceModal(true)}
                            className="px-3 py-2 rounded-xl bg-brand-bgAlt border border-brand-line/60 flex-row items-center gap-1.5 active:opacity-80"
                          >
                            <Plus size={13} color={BRAND_COLORS.primary} />
                            <Text className="text-xs font-bold text-brand-text">+ Tự thêm điểm</Text>
                          </Pressable>

                          <Pressable
                            testID="btn-draft-group-collab"
                            onPress={handleOpenDraftGroupModal}
                            disabled={isCreatingDraftGroup}
                            className={`px-3.5 py-2 rounded-xl flex-row items-center gap-1.5 shadow-xs ${
                              draftTripId
                                ? 'bg-emerald-600 active:opacity-90'
                                : 'bg-brand-primary active:opacity-90'
                            }`}
                          >
                            {isCreatingDraftGroup ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <Users size={14} color="#FFFFFF" />
                            )}
                            <Text className="text-xs font-extrabold text-white">
                              {draftTripId ? `👥 Mời nhóm (${collaboratorCount})` : '👥 Tạo nhóm cùng chọn giỏ'}
                            </Text>
                          </Pressable>
                        </View>
                      </View>

                      {groupToastMsg && (
                        <View className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 flex-row items-center gap-2">
                          <Sparkles size={14} color="#059669" />
                          <Text className="text-xs font-bold text-emerald-800 flex-1">{groupToastMsg}</Text>
                        </View>
                      )}
                    </View>
                  ) : null}

                  {/* PRO WORKSPACE VIEW */}
                  {useProWorkspace && canAccessWorkspace ? (
                    loadingPregen ? (
                      <View className="py-20 items-center justify-center gap-4 bg-brand-bgAlt/50 rounded-3xl border border-dashed border-brand-line/60">
                        <ActivityIndicator size="large" color={BRAND_COLORS.primary} />
                        <Text className="text-base font-extrabold text-brand-primary">
                          Gemini đang khảo sát & sinh kho địa điểm thực tế...
                        </Text>
                        <Text className="text-xs text-brand-textSoft text-center max-w-md px-4">
                          Đang phân tích ngân sách {new Intl.NumberFormat('vi-VN').format(budgetTotal)} đ và sở thích "{selectedPrefs.join(', ') || 'ẩm thực, trải nghiệm'}" tại {destinationCity} để gợi ý các địa điểm chất lượng cao, tọa độ chuẩn xác.
                        </Text>
                      </View>
                    ) : workspaceStage === 'collecting' ? (
                      /* BƯỚC 4A: GỢI Ý ĐỊA ĐIỂM TỪ AI ĐỂ NGƯỜI DÙNG TỰ CHỌN VÀO GIỎ */
                      <View className="gap-5">
                        {/* Header giải thích */}
                        <View className="gap-1.5 p-4 rounded-2xl bg-brand-primary/5 border border-brand-primary/20">
                          <View className="flex-row items-center gap-2">
                            <Sparkles size={18} color={BRAND_COLORS.primary} />
                            <Text className="text-base font-extrabold text-brand-text">
                              Gợi ý Địa điểm từ AI cho chuyến đi {destinationCity}
                            </Text>
                          </View>
                          <Text className="text-xs text-brand-textSoft leading-relaxed">
                            AI đã phân tích {daysCount} ngày, ngân sách {new Intl.NumberFormat('vi-VN').format(budgetTotal)} đ và sở thích của bạn. Trỏ vào từng địa điểm để định vị trên bản đồ bên phải, hoặc bấm trực tiếp trên bản đồ để thêm vào giỏ!
                          </Text>
                        </View>

                        {/* Layout 2 Cột: Bên trái Danh sách địa điểm, Bên phải Bản đồ tương tác */}
                        <View className="flex-col lg:flex-row gap-5 items-start">
                          {/* CỘT TRÁI: BỘ LỌC + DANH SÁCH ĐỊA ĐIỂM */}
                          <View className="w-full lg:flex-1 gap-3.5">
                            {/* Thanh lọc danh mục & Thao tác nhanh */}
                            <View className="flex-row flex-wrap items-center justify-between gap-2.5 p-3 bg-white rounded-2xl border border-brand-line/50">
                              {/* Filter Tabs */}
                              <View className="flex-row flex-wrap items-center gap-1.5">
                                {[
                                  { id: 'all', label: 'Tất cả' },
                                  { id: 'dining', label: 'Ẩm thực 🍽️' },
                                  { id: 'cafe', label: 'Cà phê ☕' },
                                  { id: 'attraction', label: 'Tham quan 🏔️' },
                                  { id: 'hotel', label: 'Khách sạn 🏨' },
                                ].map((tab) => (
                                  <Pressable
                                    key={tab.id}
                                    onPress={() => setPlaceCategoryFilter(tab.id)}
                                    className={`px-2.5 py-1.5 rounded-xl border ${
                                      placeCategoryFilter === tab.id
                                        ? 'bg-brand-primary border-brand-primary'
                                        : 'bg-brand-bgAlt border-brand-line/50'
                                    }`}
                                  >
                                    <Text
                                      className={`text-xs font-bold ${
                                        placeCategoryFilter === tab.id ? 'text-white' : 'text-brand-textSoft'
                                      }`}
                                    >
                                      {tab.label}
                                    </Text>
                                  </Pressable>
                                ))}
                              </View>

                              {/* Action Buttons */}
                              <View className="flex-row items-center gap-2">
                                <Pressable
                                  onPress={() => {
                                    const addedByName = user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Tôi';
                                    const addedById = user?.id;
                                    setCartItems((prev) => {
                                      let updated = [...prev];
                                      filteredPoolPlaces.forEach((p) => {
                                        const match = updated.find(
                                          (it) =>
                                            it.place.id === p.id ||
                                            (normalizePlaceKey(it.place.name) === normalizePlaceKey(p.name) && it.place.category === p.category)
                                        );
                                        if (!match) {
                                          const cost = p.estimated_cost || (p.price_level ? p.price_level * 50000 : 50000);
                                          updated.push({
                                            place: p,
                                            pricing_option: 'auto',
                                            custom_cost: cost,
                                            day_number: 0,
                                            order_index: updated.length + 1,
                                            added_by_name: addedByName,
                                            added_by_id: addedById,
                                          });
                                        }
                                      });
                                      syncCartToDraft(updated);
                                      return updated;
                                    });
                                  }}
                                  className="px-2.5 py-1.5 rounded-xl bg-brand-primary/10 border border-brand-primary/30 flex-row items-center gap-1"
                                >
                                  <Sparkles size={12} color={BRAND_COLORS.primary} />
                                  <Text className="text-xs font-bold text-brand-primary">
                                    ⚡ Chọn tất cả ({filteredPoolPlaces.length})
                                  </Text>
                                </Pressable>

                                {cartItems.length > 0 && (
                                  <Pressable
                                    onPress={handleClearCart}
                                    className="px-2.5 py-1.5 rounded-xl bg-rose-50 border border-rose-200 flex-row items-center gap-1"
                                  >
                                    <Trash2 size={12} color="#E11D48" />
                                    <Text className="text-xs font-bold text-rose-600">Xóa giỏ ({cartItems.length})</Text>
                                  </Pressable>
                                )}
                              </View>
                            </View>

                            {/* Ô tìm kiếm */}
                            <View className="flex-row items-center px-3.5 py-2.5 bg-white rounded-xl border border-brand-line/50 gap-2">
                              <Text style={{ fontSize: 13 }}>🔍</Text>
                              <TextInput
                                value={placeSearchQuery}
                                onChangeText={setPlaceSearchQuery}
                                placeholder="Tìm kiếm địa điểm theo tên hoặc địa chỉ..."
                                placeholderTextColor="#9CA3AF"
                                className="flex-1 text-xs text-brand-text outline-none"
                              />
                              {placeSearchQuery ? (
                                <Pressable onPress={() => setPlaceSearchQuery('')}>
                                  <X size={14} color="#9CA3AF" />
                                </Pressable>
                              ) : null}
                            </View>

                            {/* Danh sách địa điểm AI gợi ý (2 cột trên desktop) */}
                            {filteredPoolPlaces.length === 0 ? (
                              <View className="py-14 px-6 items-center justify-center bg-white rounded-2xl border border-dashed border-brand-line/60 gap-3 w-full">
                                <View className="w-12 h-12 rounded-2xl bg-brand-primary/10 items-center justify-center">
                                  <Sparkles size={24} color={BRAND_COLORS.primary} />
                                </View>
                                <Text className="text-sm font-extrabold text-brand-text text-center">
                                  Chưa có địa điểm gợi ý nào trong danh sách
                                </Text>
                                <Text className="text-xs text-brand-textSoft text-center max-w-sm">
                                  Bạn có thể nhấn nút dưới đây để AI phân tích và gợi ý kho địa điểm thực tế theo ngân sách, hoặc tự thêm địa điểm theo sở thích riêng.
                                </Text>
                                <View className="flex-row items-center gap-2.5 mt-2">
                                  <Pressable
                                    testID="btn-retry-pregen-empty"
                                    onPress={fetchPregenPlaces}
                                    className="px-4 py-2.5 rounded-xl bg-brand-primary active:opacity-90 flex-row items-center gap-1.5"
                                  >
                                    <Sparkles size={14} color="#FFFFFF" />
                                    <Text className="text-xs font-bold text-white">🔄 Thử lại lấy gợi ý AI</Text>
                                  </Pressable>
                                  <Pressable
                                    testID="btn-custom-place-empty"
                                    onPress={() => setShowCustomPlaceModal(true)}
                                    className="px-4 py-2.5 rounded-xl bg-brand-bgAlt border border-brand-line/60 active:opacity-80 flex-row items-center gap-1.5"
                                  >
                                    <Plus size={14} color={BRAND_COLORS.text} />
                                    <Text className="text-xs font-bold text-brand-text">+ Thêm địa điểm thủ công</Text>
                                  </Pressable>
                                </View>
                              </View>
                            ) : (
                              <View className="flex-row flex-wrap gap-3">
                                {filteredPoolPlaces.map((place) => {
                                  const cartMatch = cartItems.find((it) =>
                                    it.place.id === place.id ||
                                    (normalizePlaceKey(it.place.name) === normalizePlaceKey(place.name) && it.place.category === place.category)
                                  );
                                  const isInCart = Boolean(cartMatch);
                                  const cost = place.estimated_cost || 50000;
                                  const isHovered = hoveredPoolPlaceId === place.id;
                                  const addedByText = cartMatch?.added_by_id === user?.id
                                    ? 'Bạn'
                                    : (cartMatch?.added_by_name || 'Thành viên');

                                  return (
                                    <View
                                      key={place.id}
                                      testID={`pool-card-${place.id}`}
                                      // @ts-ignore
                                      onMouseEnter={() => {
                                        if (Platform.OS === 'web' && cartMapIframeRef.current?.contentWindow) {
                                          cartMapIframeRef.current.contentWindow.postMessage({
                                            type: 'PAN_TO_PLACE',
                                            placeId: place.id
                                          }, '*');
                                        }
                                      }}
                                      className={`p-3.5 rounded-2xl border bg-white flex-1 min-w-[240px] max-w-[360px] gap-2.5 shadow-sm transition-all ${
                                        isInCart
                                          ? 'border-2 border-emerald-600 bg-emerald-50/40'
                                          : isHovered
                                          ? 'border-brand-accent bg-amber-50/30'
                                          : 'border-brand-line/50'
                                      }`}
                                    >
                                      <View className="flex-row items-start justify-between gap-2">
                                        <View className="flex-1 gap-1">
                                          <View className="flex-row items-center gap-2 flex-wrap">
                                            <View className="px-2 py-0.5 rounded-md bg-brand-bgAlt border border-brand-line/40">
                                              <Text className="text-[10px] font-extrabold text-brand-textSoft">
                                                {CATEGORY_NAMES_VI[String(place.category || '').toLowerCase()] || place.category || 'Địa điểm'}
                                              </Text>
                                            </View>
                                            <Text className="text-xs font-extrabold text-emerald-700">
                                              {new Intl.NumberFormat('vi-VN').format(cost)} đ
                                            </Text>
                                            {isInCart && (
                                              <View className="px-1.5 py-0.5 rounded-md bg-emerald-100 border border-emerald-300">
                                                <Text className="text-[10px] font-bold text-emerald-800">
                                                  ✓ {addedByText} đã thêm
                                                </Text>
                                              </View>
                                            )}
                                          </View>
                                          <Text className="text-sm font-extrabold text-brand-text" numberOfLines={1}>
                                            {place.name}
                                          </Text>
                                          {place.address && (
                                            <Text className="text-[11px] text-brand-textSoft" numberOfLines={1}>
                                              📍 {place.address}
                                            </Text>
                                          )}
                                        </View>
                                      </View>

                                      <Pressable
                                        testID={`btn-toggle-cart-${place.id}`}
                                        onPress={() => handleAddToCart(place)}
                                        className={`w-full py-2.5 px-3 rounded-xl flex-row items-center justify-center gap-1.5 transition-all ${
                                          isInCart
                                            ? 'bg-emerald-600 active:opacity-90'
                                            : 'bg-brand-primary active:opacity-90'
                                        }`}
                                      >
                                        {isInCart ? (
                                          <>
                                            <Check size={14} color="#FFFFFF" />
                                            <Text className="text-xs font-bold text-white">
                                              ✓ {addedByText} đã thêm · Bấm để bỏ
                                            </Text>
                                          </>
                                        ) : (
                                          <>
                                            <Plus size={14} color="#FFFFFF" />
                                            <Text className="text-xs font-bold text-white">+ Thêm vào giỏ</Text>
                                          </>
                                        )}
                                      </Pressable>
                                    </View>
                                  );
                                })}
                              </View>
                            )}
                          </View>

                          {/* CỘT PHẢI: BẢN ĐỒ TƯƠNG TÁC GOOGLE MAPS TILES */}
                          <View className="w-full lg:w-[420px] rounded-2xl overflow-hidden border border-brand-line/50 shadow-md bg-white min-h-[460px] lg:min-h-[580px] lg:sticky lg:top-4">
                            <View className="p-3 bg-white border-b border-brand-line/40 flex-row items-center justify-between">
                              <View className="flex-row items-center gap-2">
                                <MapPin size={15} color={BRAND_COLORS.primary} />
                                <Text className="text-xs font-extrabold text-brand-text">
                                  Bản đồ Gợi ý ({filteredPoolPlaces.length} điểm)
                                </Text>
                              </View>
                              <Text className="text-[10px] text-brand-textSoft italic">
                                Trỏ vào để định vị · Bấm pin để thêm
                              </Text>
                            </View>

                            {Platform.OS === 'web' ? (
                              <iframe
                                ref={cartMapIframeRef}
                                srcDoc={cartMapIframeHTML}
                                style={{ width: '100%', height: 530, border: 'none' }}
                              />
                            ) : null}
                          </View>
                        </View>

                        {/* Thanh tổng kết giỏ hàng & Nút mở Calendar */}
                        <View className="p-4 rounded-2xl bg-[#FFFBF0] border border-[#F5D599] flex-row items-center justify-between gap-3 shadow-md mt-2">
                          <View className="flex-row items-center gap-3">
                            <View className="w-10 h-10 rounded-xl bg-brand-accent/20 items-center justify-center">
                              <ShoppingBag size={20} color={BRAND_COLORS.accent} />
                            </View>
                            <View>
                              <Text className="text-sm font-extrabold text-[#9A5B00]">
                                🛒 Giỏ hàng: {cartItems.length} địa điểm
                              </Text>
                              <Text className="text-xs text-[#7A5210]">
                                Dự tính: {new Intl.NumberFormat('vi-VN').format(currentCartTotal)} đ / Ngân sách:{' '}
                                {new Intl.NumberFormat('vi-VN').format(budgetTotal)} đ
                              </Text>
                            </View>
                          </View>

                          {isGroupMember ? (
                            <View className="flex-col sm:flex-row items-end sm:items-center gap-2">
                              <Text className="text-[11px] text-gray-500 italic max-w-xs text-right">
                                ℹ️ Bạn đang tham gia nhóm chọn giỏ hàng. Chỉ trưởng nhóm mới có quyền chốt danh sách và chuyển sang bước xếp lịch trình.
                              </Text>
                              <View
                                testID="btn-open-calendar-member-disabled"
                                className="px-5 py-3 rounded-xl flex-row items-center gap-2 bg-gray-200 opacity-80"
                              >
                                <Clock size={16} color="#6B7280" />
                                <Text className="text-xs font-extrabold text-gray-500">
                                  ⏳ Chờ trưởng nhóm chốt danh sách ({cartItems.length} địa điểm)
                                </Text>
                              </View>
                            </View>
                          ) : (
                            <Pressable
                              testID="btn-open-calendar-from-cart"
                              disabled={cartItems.length === 0}
                              onPress={handleCaptainAdvanceToScheduling}
                              className={`px-5 py-3 rounded-xl flex-row items-center gap-2 shadow-sm ${
                                cartItems.length === 0 ? 'bg-gray-300 opacity-60' : 'bg-brand-primary active:opacity-90'
                              }`}
                            >
                              <Calendar size={16} color="#FFFFFF" />
                              <Text className="text-xs font-extrabold text-white">
                                🚀 Chốt danh sách & Sang bước xếp lịch ({cartItems.length} điểm) →
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    ) : (
                      /* BƯỚC 4B: KHÔNG GIAN LẬP LỊCH TRỰC QUAN & BẢN ĐỒ VIVU */
                      <View className="w-full gap-3">
                        <View className="flex-row items-center justify-between p-3 rounded-2xl bg-white border border-brand-line/40 shadow-sm">
                          <View className="flex-row items-center gap-2">
                            <View className="w-8 h-8 rounded-lg bg-brand-primary items-center justify-center">
                              <Calendar size={16} color="#FFFFFF" />
                            </View>
                            <View>
                              <Text className="text-xs font-extrabold text-brand-text">
                                Không gian Lập lịch ViVu ({cartItems.length} địa điểm trong giỏ)
                              </Text>
                            </View>
                          </View>

                          <Pressable
                            testID="btn-back-to-pick-places"
                            onPress={handleBackToCollecting}
                            className="px-3.5 py-1.5 rounded-xl bg-brand-bgAlt border border-brand-line/50 flex-row items-center gap-1.5 active:opacity-80"
                          >
                            <Plus size={13} color={BRAND_COLORS.primary} />
                            <Text className="text-xs font-bold text-brand-primary">← Chọn thêm / bớt địa điểm vào giỏ</Text>
                          </Pressable>
                        </View>

                        <GoogleCalendarWorkspace
                          cityName={destinationCity}
                          travelerCount={travelerCount}
                          totalBudget={budgetTotal}
                          budgetBreakdown={budgetBreakdown}
                          daysCount={daysCount}
                          initialEvents={calendarInitialEvents}
                          standbyPlaces={calendarStandbyPlaces}
                          onEventsChange={handleCalendarEventsChange}
                          onEventDelta={handleEventDelta}
                          externalDelta={externalDelta}
                          onSave={handleSaveCalendarWorkspace}
                          onBackToCollecting={handleBackToCollecting}
                          readOnly={false}
                          isOwner={isGroupDraftOwner}
                        />
                      </View>
                    )
                  ) : (
                    /* STANDARD 1-CLICK AI CONFIG */
                    <View className="gap-6">
                      <Text className="font-display font-extrabold text-2xl text-brand-text">
                        Yêu cầu đặc biệt & Xác nhận
                      </Text>

                      <View className="gap-1.5">
                        <View className="flex-row items-center gap-1.5">
                          <Heart size={14} color={BRAND_COLORS.primary} />
                          <Text className="text-sm font-bold text-brand-textSoft">Tình trạng sức khỏe (Nếu có)</Text>
                        </View>
                        <TextInput
                          value={healthConditions}
                          onChangeText={setHealthConditions}
                          placeholder="Ví dụ: Người lớn tuổi không đi bộ leo dốc nhiều, bị say xe nhẹ..."
                          multiline
                          numberOfLines={3}
                          className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm bg-brand-bg text-brand-text"
                          placeholderTextColor={BRAND_COLORS.textMuted}
                          style={{ minHeight: 80, textAlignVertical: 'top' }}
                        />
                      </View>

                      <View className="gap-1.5">
                        <Text className="text-sm font-bold text-brand-textSoft">Lưu ý / Ràng buộc ăn uống, đi lại</Text>
                        <TextInput
                          value={specialRequirements}
                          onChangeText={setSpecialRequirements}
                          placeholder="Ví dụ: Ăn chay trường, thích đi các quán ăn vỉa hè bản địa..."
                          multiline
                          numberOfLines={3}
                          className="w-full px-4 py-3 rounded-xl border border-brand-line text-sm bg-brand-bg text-brand-text"
                          placeholderTextColor={BRAND_COLORS.textMuted}
                          style={{ minHeight: 80, textAlignVertical: 'top' }}
                        />
                      </View>

                      {/* ── LỰA CHỌN AI ENGINE & DÙNG LƯỢT PRO ── */}
                      <View className="gap-3 p-4 rounded-2xl border border-brand-line/60 bg-brand-bgAlt/40">
                        <View className="flex-row items-center justify-between flex-wrap gap-2">
                          <Text className="text-sm font-bold text-brand-text">Lựa chọn Mô hình Trí Tuệ Nhân Tạo (AI)</Text>
                          <Pressable
                            onPress={() => setShowPremiumModal(true)}
                            className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-brand-bg border border-brand-line/50"
                          >
                            <Crown size={12} color={hasCredits ? BRAND_COLORS.accent : BRAND_COLORS.gold} />
                            <Text className="text-[10px] font-extrabold" style={{ color: hasCredits ? BRAND_COLORS.accent : BRAND_COLORS.textSoft }}>
                              {hasCredits ? `Còn ${remainingTrips} lượt Pro` : 'Mua thêm lượt Pro'}
                            </Text>
                          </Pressable>
                        </View>

                        <View className="flex-row gap-3">
                          {/* Option 1: AI Tiêu Chuẩn (Mặc định) */}
                          <Pressable
                            testID="ai-engine-gemini-card"
                            onPress={() => {
                              setSelectedAiProvider('gemini');
                              setUseProForTrip(false);
                            }}
                            className={`flex-1 p-3.5 rounded-xl border flex-col justify-between gap-2 ${(!useProForTrip && selectedAiProvider === 'gemini') ? 'bg-brand-primary/10 border-brand-primary' : 'bg-brand-bg border-brand-line/50'}`}
                          >
                            <View className="flex-row items-center justify-between">
                              <View className="flex-row items-center gap-1.5">
                                <Zap size={14} color={BRAND_COLORS.primary} />
                                <Text className={`text-xs font-bold ${(!useProForTrip && selectedAiProvider === 'gemini') ? 'text-brand-primary' : 'text-brand-text'}`}>
                                  AI Tiêu Chuẩn
                                </Text>
                              </View>
                              <View className="px-1.5 py-0.5 rounded bg-brand-line/20">
                                <Text className="text-[9px] font-bold text-brand-textSoft">Miễn phí</Text>
                              </View>
                            </View>
                            <Text className="text-[10px] text-brand-textSoft leading-tight">
                              Tốc độ nhanh, gợi ý điểm đến phổ biến và lịch trình cơ bản.
                            </Text>
                          </Pressable>

                          {/* Option 2: AI Pro (Độc quyền cho gói Pro) */}
                          <Pressable
                            testID="ai-engine-custom-card"
                            onPress={() => {
                              if (hasCredits) {
                                setShowConfirmAiProModal(true);
                              } else {
                                setShowPremiumModal(true);
                              }
                            }}
                            className={`flex-1 p-3.5 rounded-xl border flex-col justify-between gap-2 ${(useProForTrip || selectedAiProvider === 'custom_openai') ? 'bg-brand-accent/10 border-brand-accent' : 'bg-brand-bg border-brand-line/50'}`}
                          >
                            <View className="flex-row items-center justify-between">
                              <View className="flex-row items-center gap-1.5">
                                <Crown size={14} color={BRAND_COLORS.accent} />
                                <Text className={`text-xs font-bold ${(useProForTrip || selectedAiProvider === 'custom_openai') ? 'text-brand-accent' : 'text-brand-text'}`}>
                                  AI Pro
                                </Text>
                              </View>
                              {hasCredits ? (
                                <View className="px-1.5 py-0.5 rounded bg-brand-accent/20">
                                  <Text className="text-[9px] font-extrabold text-brand-accent">
                                    {`CÒN ${remainingTrips} LƯỢT`}
                                  </Text>
                                </View>
                              ) : (
                                <View className="flex-row items-center gap-0.5 px-1.5 py-0.5 rounded bg-brand-line/30">
                                  <Lock size={9} color={BRAND_COLORS.textSoft} />
                                  <Text className="text-[9px] font-extrabold text-brand-textSoft">CẦN GÓI PRO</Text>
                                </View>
                              )}
                            </View>
                            <Text className="text-[10px] text-brand-textSoft leading-tight">
                              Tối ưu ngân sách sâu, lộ trình thông minh và khám phá điểm đến độc lạ.
                            </Text>
                          </Pressable>
                        </View>
                      </View>

                      {/* Summary */}
                      <View className="p-4 rounded-xl bg-brand-bgAlt border border-brand-line/50 gap-2.5">
                        <Text className="font-bold text-brand-text text-sm border-b border-brand-line/30 pb-2">Tóm tắt hành trình</Text>
                        <View className="flex-row flex-wrap gap-x-4 gap-y-1.5">
                          <Text className="text-xs text-brand-textSoft">Điểm đến: <Text className="font-bold text-brand-text">{destinationCity}</Text></Text>
                          <Text className="text-xs text-brand-textSoft">Thành viên: <Text className="font-bold text-brand-text">{travelerCount} khách ({TRAVELER_TYPES.find(t => t.value === travelerType)?.label || travelerType})</Text></Text>
                          <Text className="text-xs text-brand-textSoft">Bắt đầu: <Text className="font-bold text-brand-text">{formatDateForDisplay(startDate)}</Text></Text>
                          <Text className="text-xs text-brand-textSoft">Kết thúc: <Text className="font-bold text-brand-text">{formatDateForDisplay(endDate)}</Text></Text>
                          <Text className="text-xs text-brand-textSoft">
                            Ngân sách:{' '}
                            <Text className="font-bold text-brand-text">
                              {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(budgetTotal)}
                            </Text>
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              </Reveal>
            )}

            {/* Nav buttons */}
            <View className="flex-row justify-between items-center pt-5 border-t border-brand-line/35 mt-2">
              {step > 1 ? (
                <Pressable
                  onPress={handlePrev}
                  className="flex-row items-center gap-1.5 px-4 py-2.5 rounded-lg border border-brand-line"
                >
                  <Text className="text-xs font-bold text-brand-textSoft">Quay lại</Text>
                </Pressable>
              ) : (
                <View />
              )}

              {step < 4 ? (
                <Pressable
                  testID="btn-next-step"
                  onPress={handleNext}
                  disabled={!!errorMsg}
                  className={`flex-row items-center gap-1.5 px-5 py-3 rounded-xl ${!!errorMsg ? 'bg-brand-primary/40 opacity-50' : 'bg-brand-primary'}`}
                >
                  <Text className="text-white text-sm font-bold">Tiếp tục</Text>
                  <ArrowRight size={16} color="white" />
                </Pressable>
              ) : !useProWorkspace ? (
                isGroupMember ? (
                  <View className="px-5 py-3 rounded-xl bg-gray-200 opacity-80 flex-row items-center gap-2">
                    <Clock size={16} color="#6B7280" />
                    <Text className="text-gray-500 text-sm font-bold">
                      ⏳ Chờ trưởng nhóm tạo lịch trình
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    testID="btn-open-create-modal"
                    onPress={() => setShowScheduleOptionModal(true)}
                    className="flex-row items-center gap-2 px-6 py-3.5 rounded-xl bg-brand-primary active:opacity-90 shadow-sm"
                  >
                    <Sparkles size={16} color="white" />
                    <Text className="text-white text-sm font-bold">
                      🚀 Tạo lịch trình
                    </Text>
                    <ArrowRight size={16} color="white" />
                  </Pressable>
                )
              ) : null}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Premium Upgrade Modal */}
      <PremiumModal
        visible={showPremiumModal}
        onClose={() => setShowPremiumModal(false)}
        onActivated={() => {
          setShowPremiumModal(false);
          setSelectedAiProvider('custom_openai');
          refetchStatus();
        }}
        onSuccess={() => {
          setShowPremiumModal(false);
          setSelectedAiProvider('custom_openai');
          refetchStatus();
        }}
      />

      {/* Modal Lựa chọn sắp xếp lịch trình (Pro Workspace Confirmation) */}
      <Modal
        visible={showScheduleOptionModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowScheduleOptionModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 540, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, gap: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 10 }}>
            {/* Modal Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ gap: 4, flex: 1, paddingRight: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={18} color={BRAND_COLORS.primary} />
                  <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 18, color: '#1B2420' }}>
                    Khởi tạo hành trình {destinationCity}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, color: '#6E7B70', lineHeight: 18 }}>
                  Vui lòng chọn phương thức khởi tạo lịch trình phù hợp với nhu cầu của bạn:
                </Text>
              </View>

              <Pressable
                onPress={() => setShowScheduleOptionModal(false)}
                style={{ padding: 6, borderRadius: 999, backgroundColor: '#F3ECDC' }}
              >
                <X size={18} color="#6E7B70" />
              </Pressable>
            </View>

            {/* 2 Options */}
            <View style={{ gap: 12 }}>
              {/* Lựa chọn 1: Tạo nhanh tự động (1-chạm) - Cho tất cả tài khoản */}
              <Pressable
                testID="btn-choose-quick-ai"
                onPress={() => {
                  setShowScheduleOptionModal(false);
                  handleSubmit();
                }}
                style={({ pressed }) => [{
                  padding: 16,
                  borderRadius: 16,
                  borderWidth: 1.5,
                  borderColor: BRAND_COLORS.accent,
                  backgroundColor: pressed ? 'rgba(226,112,58,0.08)' : 'rgba(226,112,58,0.03)',
                  gap: 8,
                }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(226,112,58,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                      <Sparkles size={20} color={BRAND_COLORS.accent} />
                    </View>
                    <View>
                      <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 15, color: BRAND_COLORS.accent }}>
                        ⚡ Tạo nhanh tự động (1-chạm)
                      </Text>
                      <Text style={{ fontSize: 11, color: '#6E7B70', fontWeight: '500' }}>
                        Miễn phí cho mọi tài khoản
                      </Text>
                    </View>
                  </View>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: BRAND_COLORS.accent }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>NHANH 5S</Text>
                  </View>
                </View>

                <Text style={{ fontSize: 12, color: '#3F4F45', lineHeight: 17, paddingLeft: 50 }}>
                  AI tự động phân tích sở thích, ngân sách và tạo lịch trình hoàn chỉnh từ A-Z trong vài giây, tối ưu đường đi và thời gian hợp lý.
                </Text>
              </Pressable>

              {/* Lựa chọn 2: Map Live & Tự xếp lịch (Dành riêng cho Pro) */}
              <Pressable
                testID="btn-choose-workspace-live-modal"
                onPress={() => {
                  setShowScheduleOptionModal(false);
                  if (canAccessWorkspace) {
                    setShowConfirmLiveMapModal(true);
                  } else {
                    setShowPremiumModal(true);
                  }
                }}
                style={({ pressed }) => [{
                  padding: 16,
                  borderRadius: 16,
                  borderWidth: 1.5,
                  borderColor: canAccessWorkspace ? BRAND_COLORS.primary : '#F5D599',
                  backgroundColor: canAccessWorkspace
                    ? (pressed ? 'rgba(31,111,84,0.08)' : 'rgba(31,111,84,0.03)')
                    : '#FFFBF0',
                  gap: 8,
                }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: canAccessWorkspace ? 'rgba(31,111,84,0.12)' : 'rgba(212,160,23,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                      <Crown size={20} color={canAccessWorkspace ? BRAND_COLORS.primary : '#D4A017'} />
                    </View>
                    <View>
                      <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 15, color: canAccessWorkspace ? BRAND_COLORS.primary : '#9A5B00' }}>
                        🗺️ Không gian Bản đồ Trực quan & Lập lịch
                      </Text>
                      <Text style={{ fontSize: 11, color: canAccessWorkspace ? '#1F6F54' : '#7A5210', fontWeight: '500' }}>
                        Bản đồ Trực quan & Lịch trình ViVu
                      </Text>
                    </View>
                  </View>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: canAccessWorkspace ? BRAND_COLORS.primary : '#D4A017', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {!canAccessWorkspace && <Lock size={10} color="#FFFFFF" />}
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>
                      {canAccessWorkspace ? `ĐÃ MỞ KHÓA PRO (${paymentStatus?.remainingTrips ?? 0} lượt)` : 'GÓI PRO 🔒'}
                    </Text>
                  </View>
                </View>

                <Text style={{ fontSize: 12, color: canAccessWorkspace ? '#3F4F45' : '#7A5210', lineHeight: 17, paddingLeft: 50 }}>
                  {canAccessWorkspace
                    ? 'Tự do kéo thả địa điểm từ Giỏ hàng vào Lịch trình trực quan, xem đường xe chạy OSRM và cân đối Bảng ngân sách ma trận.'
                    : 'Đặc quyền thành viên ViVu Pro. Mở khóa Không gian Bản đồ Trực quan & Lịch trình ViVu để tự tay sắp xếp lịch trình trên bản đồ.'}
                </Text>
              </Pressable>
            </View>

            {/* Cancel Button */}
            <Pressable
              onPress={() => setShowScheduleOptionModal(false)}
              style={{ paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#F3ECDC' }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#1B2420' }}>Đóng</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Modal Xác nhận sử dụng AI Pro */}
      <Modal
        visible={showConfirmAiProModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowConfirmAiProModal(false);
          setUseProForTrip(false);
          setSelectedAiProvider('gemini');
        }}
      >
        <View
          style={(Platform.OS === 'web' ? {
            position: 'fixed' as any,
            top: 0, left: 0, right: 0, bottom: 0,
            width: '100vw' as any, height: '100vh' as any,
            zIndex: 9999, justifyContent: 'center', alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
            padding: 20,
          } : {
            flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
            justifyContent: 'center', alignItems: 'center', padding: 20,
          }) as any}
        >
          <View
            testID="modal-confirm-ai-pro"
            style={{
              width: '100%',
              maxWidth: 440,
              backgroundColor: '#FFFFFF',
              borderRadius: 24,
              padding: 24,
              gap: 16,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.25,
              shadowRadius: 24,
              elevation: 12,
              borderWidth: 1,
              borderColor: '#E2E8F0',
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(226,112,58,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                  <Crown size={22} color={BRAND_COLORS.accent} />
                </View>
                <View>
                  <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 16, color: '#1B2420' }}>
                    Xác nhận sử dụng AI Pro
                  </Text>
                  <Text style={{ fontSize: 11, color: '#6E7B70', fontWeight: '500' }}>
                    Đặc quyền mô hình trí tuệ nhân tạo cao cấp
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => {
                  setShowConfirmAiProModal(false);
                  setUseProForTrip(false);
                  setSelectedAiProvider('gemini');
                }}
                style={{ padding: 6, borderRadius: 999, backgroundColor: '#F3ECDC' }}
              >
                <X size={16} color="#6E7B70" />
              </Pressable>
            </View>

            <View style={{ backgroundColor: '#FFFBEB', padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#FDE68A', gap: 6 }}>
              <Text style={{ fontSize: 13, color: '#92400E', fontWeight: '600', lineHeight: 20 }}>
                Bạn có muốn dùng 1 lượt AI Pro cho chuyến đi này không?
              </Text>
              <Text style={{ fontSize: 11, color: '#B45309' }}>
                ⚡ Lượt Pro khả dụng: {paymentStatus?.remainingTrips ?? 0} lượt
              </Text>
            </View>

            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Check size={14} color="#059669" />
                <Text style={{ fontSize: 12, color: '#334155' }}>Lộ trình sâu sắc, tối ưu kinh phí & đường đi</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Check size={14} color="#059669" />
                <Text style={{ fontSize: 12, color: '#334155' }}>Gợi ý địa điểm bản địa độc đáo và trải nghiệm trọn vẹn</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Pressable
                testID="btn-cancel-use-ai-pro"
                onPress={() => {
                  setShowConfirmAiProModal(false);
                  setUseProForTrip(false);
                  setSelectedAiProvider('gemini');
                }}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>Giữ AI Tiêu Chuẩn</Text>
              </Pressable>
              <Pressable
                testID="btn-confirm-use-ai-pro"
                onPress={() => {
                  setShowConfirmAiProModal(false);
                  setUseProForTrip(true);
                  setSelectedAiProvider('custom_openai');
                }}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: BRAND_COLORS.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
              >
                <Crown size={15} color="#FFFFFF" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>Dùng 1 Lượt Pro</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Xác nhận sử dụng AI Pro cho Live Map */}
      <Modal
        visible={showConfirmLiveMapModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmLiveMapModal(false)}
      >
        <View
          style={(Platform.OS === 'web' ? {
            position: 'fixed' as any,
            top: 0, left: 0, right: 0, bottom: 0,
            width: '100vw' as any, height: '100vh' as any,
            zIndex: 9999, justifyContent: 'center', alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
            padding: 20,
          } : {
            flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
            justifyContent: 'center', alignItems: 'center', padding: 20,
          }) as any}
        >
          <View
            testID="modal-confirm-live-map"
            style={{
              width: '100%',
              maxWidth: 460,
              backgroundColor: '#FFFFFF',
              borderRadius: 24,
              padding: 24,
              gap: 16,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 12 },
              shadowOpacity: 0.25,
              shadowRadius: 24,
              elevation: 12,
              borderWidth: 1,
              borderColor: '#E2E8F0',
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(31,111,84,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                  <Crown size={22} color={BRAND_COLORS.primary} />
                </View>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 16, color: '#1B2420' }}>
                    Xác nhận sử dụng AI Pro cho Live Map
                  </Text>
                  <Text style={{ fontSize: 11, color: '#6E7B70', fontWeight: '500' }}>
                    Không gian Bản đồ Trực quan & Lập lịch tương tác
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => setShowConfirmLiveMapModal(false)}
                style={{ padding: 6, borderRadius: 999, backgroundColor: '#F3ECDC' }}
              >
                <X size={16} color="#6E7B70" />
              </Pressable>
            </View>

            <View style={{ backgroundColor: '#ECFDF5', padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#A7F3D0', gap: 6 }}>
              <Text style={{ fontSize: 13, color: '#065F46', fontWeight: '600', lineHeight: 20 }}>
                Bạn có muốn dùng 1 lượt AI Pro cho chuyến đi này để mở khóa Không gian Bản đồ Trực quan & Lập lịch tương tác (Live Map) không?
              </Text>
              <Text style={{ fontSize: 11, color: '#047857' }}>
                ⚡ Lượt Pro khả dụng: {paymentStatus?.remainingTrips ?? 0} lượt
              </Text>
            </View>

            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Check size={14} color="#059669" />
                <Text style={{ fontSize: 12, color: '#334155' }}>Kéo thả địa điểm từ giỏ hàng vào từng ngày</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Check size={14} color="#059669" />
                <Text style={{ fontSize: 12, color: '#334155' }}>Bản đồ số OpenStreetMap & tuyến đường xe chạy OSRM</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Check size={14} color="#059669" />
                <Text style={{ fontSize: 12, color: '#334155' }}>Cân đối ngân sách chi tiêu chi tiết theo ma trận</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Pressable
                testID="btn-cancel-use-live-map"
                onPress={() => setShowConfirmLiveMapModal(false)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>Để sau</Text>
              </Pressable>
              <Pressable
                testID="btn-confirm-use-live-map"
                onPress={() => {
                  setShowConfirmLiveMapModal(false);
                  setUseProWorkspace(true);
                  setUseProForTrip(true);
                  setSelectedAiProvider('custom_openai');
                  if (pregenPlaces.length === 0) {
                    fetchPregenPlaces('custom_openai');
                  }
                }}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: BRAND_COLORS.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
              >
                <Crown size={15} color="#FFFFFF" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>Mở Khóa Live Map</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Mời bạn bè cùng chọn giỏ hàng qua Supabase Realtime */}
      <Modal
        visible={showGroupModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGroupModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 500, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, gap: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(31,111,84,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                  <Users size={20} color={BRAND_COLORS.primary} />
                </View>
                <View>
                  <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 16, color: '#1B2420' }}>
                    Mời bạn bè cùng chọn địa điểm
                  </Text>
                  <Text style={{ fontSize: 11, color: '#6E7B70' }}>
                    Đồng bộ giỏ hàng theo thời gian thực (Realtime)
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => setShowGroupModal(false)}
                style={{ padding: 6, borderRadius: 999, backgroundColor: '#F3ECDC' }}
              >
                <X size={18} color="#6E7B70" />
              </Pressable>
            </View>

            <View style={{ backgroundColor: '#F7F4EA', padding: 14, borderRadius: 16, gap: 8 }}>
              <Text style={{ fontSize: 12, color: '#3F4F45', lineHeight: 18 }}>
                👥 Bất kỳ ai có đường link dưới đây đều có thể tham gia vào phòng chọn giỏ hàng này. Mọi thao tác thêm/bớt địa điểm sẽ tức thì hiển thị trên màn hình của nhau!
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E5DFD3' }}>
                <LinkIcon size={14} color="#6E7B70" />
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: '#1B2420' }}>
                  {typeof window !== 'undefined'
                    ? `${window.location.origin}/chuyen-di/moi?draft_id=${draftTripId}&token=${draftShareToken || ''}`
                    : `https://vivu.app/chuyen-di/moi?draft_id=${draftTripId}&token=${draftShareToken || ''}`}
                </Text>
              </View>

              <Pressable
                onPress={async () => {
                  const shareUrl = typeof window !== 'undefined'
                    ? `${window.location.origin}/chuyen-di/moi?draft_id=${draftTripId}&token=${draftShareToken || ''}`
                    : `https://vivu.app/chuyen-di/moi?draft_id=${draftTripId}&token=${draftShareToken || ''}`;
                  try {
                    if (typeof navigator !== 'undefined' && navigator.clipboard) {
                      await navigator.clipboard.writeText(shareUrl);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2500);
                    }
                  } catch (e) {}
                }}
                style={{ paddingVertical: 11, backgroundColor: copiedLink ? '#059669' : BRAND_COLORS.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
              >
                {copiedLink ? <Check size={15} color="#FFFFFF" /> : <Copy size={15} color="#FFFFFF" />}
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                  {copiedLink ? 'Đã sao chép link mời!' : 'Sao chép link gửi bạn bè'}
                </Text>
              </Pressable>
            </View>

            {/* QR Code preview */}
            {draftTripId && (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 6 }}>
                <Image
                  source={{
                    uri: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                      typeof window !== 'undefined'
                        ? `${window.location.origin}/chuyen-di/moi?draft_id=${draftTripId}&token=${draftShareToken || ''}`
                        : `https://vivu.app/chuyen-di/moi?draft_id=${draftTripId}&token=${draftShareToken || ''}`
                    )}`,
                  }}
                  style={{ width: 130, height: 130, borderRadius: 12 }}
                  resizeMode="contain"
                />
                <Text style={{ fontSize: 11, color: '#6E7B70' }}>Quét mã QR để cùng chọn giỏ hàng trên điện thoại</Text>
              </View>
            )}

            <Pressable
              onPress={() => setShowGroupModal(false)}
              style={{ paddingVertical: 11, borderRadius: 12, backgroundColor: '#F3ECDC', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#1B2420' }}>Hoàn tất</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Modal Tự thêm địa điểm mới vào giỏ hàng */}
      <Modal
        visible={showCustomPlaceModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCustomPlaceModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ width: '100%', maxWidth: 460, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, gap: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 20, elevation: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(226,112,58,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                  <Plus size={20} color={BRAND_COLORS.accent} />
                </View>
                <View>
                  <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 16, color: '#1B2420' }}>
                    Thêm địa điểm tùy chọn
                  </Text>
                  <Text style={{ fontSize: 11, color: '#6E7B70' }}>
                    Tự nhập quán ăn, khách sạn hoặc điểm yêu thích
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => setShowCustomPlaceModal(false)}
                style={{ padding: 6, borderRadius: 999, backgroundColor: '#F3ECDC' }}
              >
                <X size={18} color="#6E7B70" />
              </Pressable>
            </View>

            <View style={{ gap: 12 }}>
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1B2420' }}>Tên địa điểm *</Text>
                <TextInput
                  value={customPlaceTitle}
                  onChangeText={setCustomPlaceTitle}
                  placeholder="VD: Quán Bánh mì Phượng, Khách sạn Mường Thanh..."
                  placeholderTextColor="#9CA3AF"
                  style={{ borderWidth: 1, borderColor: '#E5DFD3', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#1B2420' }}
                />
              </View>

              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1B2420' }}>Phân loại</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {[
                    { id: 'dining', label: 'Ẩm thực 🍽️' },
                    { id: 'cafe', label: 'Cà phê ☕' },
                    { id: 'hotel', label: 'Khách sạn 🏨' },
                    { id: 'attraction', label: 'Tham quan 🏔️' },
                    { id: 'other', label: 'Khác 📍' },
                  ].map((cat) => (
                    <Pressable
                      key={cat.id}
                      onPress={() => setCustomPlaceCategory(cat.id as any)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 10,
                        backgroundColor: customPlaceCategory === cat.id ? BRAND_COLORS.primary : '#F7F4EA',
                        borderWidth: 1,
                        borderColor: customPlaceCategory === cat.id ? BRAND_COLORS.primary : '#E5DFD3',
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: customPlaceCategory === cat.id ? '#FFFFFF' : '#3F4F45' }}>
                        {cat.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1B2420' }}>Chi phí ước tính (VNĐ)</Text>
                <TextInput
                  value={customPlaceCost}
                  onChangeText={setCustomPlaceCost}
                  keyboardType="numeric"
                  placeholder="VD: 50000"
                  placeholderTextColor="#9CA3AF"
                  style={{ borderWidth: 1, borderColor: '#E5DFD3', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#1B2420' }}
                />
              </View>

              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1B2420' }}>Địa chỉ / Khu vực</Text>
                <TextInput
                  value={customPlaceAddress}
                  onChangeText={setCustomPlaceAddress}
                  placeholder={`VD: Trung tâm TP ${destinationCity}...`}
                  placeholderTextColor="#9CA3AF"
                  style={{ borderWidth: 1, borderColor: '#E5DFD3', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#1B2420' }}
                />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Pressable
                onPress={() => setShowCustomPlaceModal(false)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F3ECDC', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#1B2420' }}>Hủy</Text>
              </Pressable>
              <Pressable
                testID="btn-confirm-add-custom-place"
                onPress={handleAddNewCustomPlace}
                disabled={!customPlaceTitle.trim()}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: customPlaceTitle.trim() ? BRAND_COLORS.primary : '#D1D5DB', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>+ Thêm vào giỏ</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Floating group sync notification toast */}
      {groupToastMsg && (
        <View
          style={{
            position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
            top: 24,
            left: 20,
            right: 20,
            maxWidth: 520,
            alignSelf: 'center',
            zIndex: 99999,
            backgroundColor: '#064E3B',
            borderRadius: 16,
            paddingHorizontal: 20,
            paddingVertical: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 10,
            elevation: 10,
          }}
        >
          <Sparkles size={20} color="#34D399" />
          <Text style={{ flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
            {groupToastMsg}
          </Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

