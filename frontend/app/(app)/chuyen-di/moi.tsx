import { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Animated, Platform, KeyboardAvoidingView, ActivityIndicator, Modal, useWindowDimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  Compass, Sparkles, ArrowLeft, ArrowRight,
  MapPin, DollarSign, Heart, AlertTriangle, Crown, Zap, Lock, ChevronDown,
  Trash2, Edit3, Check, Calendar, Plus, ShoppingBag, X, GripVertical, Clock,
} from 'lucide-react-native';
import { api } from '../../../lib/api';
import { clearCache } from '../../../lib/cache';
import { requestNotificationPermission, scheduleTripReminder } from '../../../lib/notifications';
import { useAuth } from '../../../hooks/useAuth';
import PremiumModal from '../../../components/PremiumModal';
import Reveal from '../../../components/Reveal';
import BudgetBreakdown, { BudgetBreakdownData } from '../../../components/cart/BudgetBreakdown';
import LiveBudgetBar from '../../../components/cart/LiveBudgetBar';
import CuratedMap from '../../../components/map/CuratedMap';
import GoogleMapsRoutePlanner, { RouteWaypoint } from '../../../components/map/GoogleMapsRoutePlanner';
import GoogleCalendarWorkspace, { CalendarEventItem, StandbyPlaceItem } from '../../../components/workspace/GoogleCalendarWorkspace';
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
            ViVu AI Planner
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
  const params = useLocalSearchParams<{ city?: string; days?: string; budget?: string; theme?: string }>();
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
  const { isPremium, isAdmin } = useAuth();

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

  // Pro Workspace state
  const [useProWorkspace, setUseProWorkspace] = useState(false);

  // Bảo vệ: Chỉ người dùng Pro mới được phép mở và sử dụng Pro Workspace (Map Live)
  useEffect(() => {
    if (useProWorkspace && !(isPremium || isAdmin)) {
      setUseProWorkspace(false);
    }
  }, [useProWorkspace, isPremium, isAdmin]);
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
  }[]>([]);
  const [showScheduleOptionModal, setShowScheduleOptionModal] = useState(false);
  const [editingCostPlaceId, setEditingCostPlaceId] = useState<string | null>(null);
  const [editCostInput, setEditCostInput] = useState('');
  const { width: windowWidth } = useWindowDimensions();
  const isLargeScreen = windowWidth >= 900;

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

  const deduplicatedPool = useMemo(() => {
    const rawPool = pregenPlaces.length > 0 ? pregenPlaces : getCuratedPlacesForCity(destinationCity);
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
  }, [pregenPlaces, destinationCity]);

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

  const fetchPregenPlaces = async () => {
    setLoadingPregen(true);
    setErrorMsg('');
    try {
      const res = await api.post('/trips/pregen-places', {
        destination_city: destinationCity,
        days_count: daysCount,
        budget_total: budgetTotal,
        budget_breakdown: budgetBreakdown,
        preferences: selectedPrefs,
        traveler_type: travelerType,
        special_requirements: specialRequirements,
        ai_provider: selectedAiProvider
      }, { timeout: 6000 });
      if (res.data?.places && Array.isArray(res.data.places)) {
        setPregenPlaces(res.data.places);
      }
    } catch (err: any) {
      console.warn('Fallback to curated places for city:', destinationCity);
      const fallback = getCuratedPlacesForCity(destinationCity);
      setPregenPlaces(fallback.map((p, idx) => ({ ...p, suggested_day: (idx % daysCount) + 1 })));
    } finally {
      setLoadingPregen(false);
    }
  };

  const handleAddToCart = (place: PlaceItem, option: 'auto' | 'manual' = 'auto', customCost?: number) => {
    const defaultCost = place.estimated_cost || (place.price_level ? place.price_level * 50000 : 50000);
    const finalCost = customCost !== undefined ? customCost : defaultCost;
    setCartItems(prev => {
      const exists = prev.some(item => item.place.id === place.id);
      if (exists) {
        return prev.filter(item => item.place.id !== place.id);
      }
      return [...prev, { place, pricing_option: option, custom_cost: finalCost, day_number: 0, order_index: prev.length + 1 }];
    });
  };

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
    setCartItems(prev => prev.filter(item => item.place.id !== placeId));
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
    const inCartIds = new Set(cartItems.map(it => it.place.id));
    const pool = pregenPlaces.length > 0 ? pregenPlaces : getCuratedPlacesForCity(destinationCity);
    return pool
      .filter(p => !inCartIds.has(p.id))
      .map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        cost: p.estimated_cost || 50000,
        suggestedDuration: 90,
      }));
  }, [cartItems, pregenPlaces, destinationCity]);

  const handleCalendarEventsChange = (updatedEvents: CalendarEventItem[]) => {
    setCartItems(prev => {
      const updated = prev.map(item => {
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

      // Nếu có điểm từ Standby thêm vào
      const pool = pregenPlaces.length > 0 ? pregenPlaces : getCuratedPlacesForCity(destinationCity);
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
            });
          }
        }
      });

      return updated;
    });
  };

  const handleSaveCalendarWorkspace = async (updatedEvents: CalendarEventItem[]) => {
    handleCalendarEventsChange(updatedEvents);
    await handleProScheduleSubmit('manual');
  };

  const handleProScheduleSubmit = async (mode: 'ai_auto' | 'manual') => {
    setShowScheduleOptionModal(false);
    setErrorMsg('');

    const formattedPrefs = PREFERENCE_OPTIONS.reduce((acc, pref) => {
      acc[pref.id] = selectedPrefs.includes(pref.id);
      return acc;
    }, {} as Record<string, any>);

    formattedPrefs.is_ai_pro = true;
    formattedPrefs.ai_tier = 'pro';
    formattedPrefs.creation_mode = mode;

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

    const formattedCartItems = cartItems.map((it, idx) => ({
      place: it.place,
      day_number: it.day_number > 0 ? it.day_number : ((idx % daysCount) + 1),
      order_index: it.order_index || (idx + 1),
      custom_cost: it.custom_cost,
      pricing_option: it.pricing_option,
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
          ai_provider: selectedAiProvider,
          creation_mode: 'ai_auto',
          cart_items: formattedCartItems,
        }, { signal: controller.signal });
        clearInterval(stageInterval);
        await clearCache('trips');
        const granted = await requestNotificationPermission();
        if (granted) {
          await scheduleTripReminder(
            res.data.id,
            title || `Du hí ${destinationCity}`,
            startDate,
          );
        }
        router.replace(APP_ROUTES.TRIP_DETAIL(res.data.id) as any);
      } catch (err: any) {
        clearInterval(stageInterval);
        setLoading(false);
        if (err.name === 'CanceledError' || err.name === 'AbortError' || err.code === 'ERR_CANCELED') return;
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
          cart_items: formattedCartItems,
        });
        await clearCache('trips');
        router.replace(APP_ROUTES.TRIP_DETAIL(res.data.id) as any);
      } catch (err: any) {
        setLoading(false);
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

    formattedPrefs.is_ai_pro = selectedAiProvider === 'custom_openai' || isPremium;
    formattedPrefs.ai_tier = (selectedAiProvider === 'custom_openai' || isPremium) ? 'pro' : 'standard';

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
        ai_provider: selectedAiProvider,
      }, { signal: controller.signal });
      clearInterval(stageInterval);
      // Invalidate trips cache + schedule reminder notification
      await clearCache('trips');
      const granted = await requestNotificationPermission();
      if (granted) {
        await scheduleTripReminder(
          res.data.id,
          title || `Du hí ${destinationCity}`,
          startDate,
        );
      }
      router.replace(APP_ROUTES.TRIP_DETAIL(res.data.id) as any);
    } catch (err: any) {
      clearInterval(stageInterval);
      setLoading(false);
      // Ignore abort errors (user cancelled)
      if (err.name === 'CanceledError' || err.name === 'AbortError' || err.code === 'ERR_CANCELED') return;
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
              <View className="p-4 rounded-xl bg-brand-danger/10 border border-brand-danger/30 flex-row gap-2 items-start">
                <AlertTriangle size={18} color={BRAND_COLORS.danger} />
                <Text className="text-brand-danger text-sm flex-1">{errorMsg}</Text>
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
                      <Text className="text-sm font-bold text-brand-textSoft">Điểm đến (Dropdown Chọn Thành Phố)</Text>
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
                              ? 'ℹ️ Đã tự động thiết lập 1 người (Solo).'
                              : 'ℹ️ Đã tự động thiết lập 2 người (Couple).'}
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
                  {/* Mode switcher / Banner at the top of Step 4 */}
                  {!(isPremium || isAdmin) ? (
                    // Banner for Free user
                    <View className="p-4 rounded-2xl bg-[#FFFBF0] border border-[#F5D599] flex-row items-center justify-between gap-3 shadow-sm">
                      <View className="flex-1 gap-1">
                        <View className="flex-row items-center gap-1.5">
                          <Crown size={16} color={BRAND_COLORS.accent} />
                          <Text className="text-sm font-extrabold text-[#9A5B00]">
                            🌟 Chế độ Pro Planner: Tự tay nhặt địa điểm trên Bản đồ & Tính ngân sách Live 🔒
                          </Text>
                        </View>
                        <Text className="text-xs text-[#7A5210] leading-relaxed">
                          AI sinh kho 16-22 địa điểm phong phú thực tế theo đúng sở thích và ngân sách vừa chọn. Bạn tự do nhặt vào giỏ, đổi ngày và xem đường đi real-time.
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
                    <View className="flex-row items-center justify-between p-3 rounded-2xl bg-white border border-brand-line/40 shadow-sm">
                      <View className="flex-row items-center gap-2">
                        <View className="w-8 h-8 rounded-lg bg-brand-primary items-center justify-center">
                          <Crown size={16} color="#FFFFFF" />
                        </View>
                        <View>
                          <Text className="text-xs font-extrabold text-brand-text">Không gian Pro Workspace (Bản đồ Google Maps & Calendar)</Text>
                          <Text className="text-[10px] text-brand-textSoft">AI đã sinh kho địa điểm thực tế tại {destinationCity}</Text>
                        </View>
                      </View>
                      <Pressable
                        onPress={() => setUseProWorkspace(false)}
                        className="px-3 py-1.5 rounded-lg bg-brand-bgAlt border border-brand-line/40"
                      >
                        <Text className="text-xs font-bold text-brand-textSoft">← Đổi sang tạo nhanh</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {/* PRO WORKSPACE VIEW */}
                  {useProWorkspace && (isPremium || isAdmin) ? (
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
                    ) : (
                      /* KHÔNG GIAN LẬP LỊCH GOOGLE CALENDAR & GOOGLE MAPS DUY NHẤT */
                      <View className="w-full">
                        <GoogleCalendarWorkspace
                          cityName={destinationCity}
                          totalBudget={budgetTotal}
                          daysCount={daysCount}
                          initialEvents={calendarInitialEvents}
                          standbyPlaces={calendarStandbyPlaces}
                          onEventsChange={handleCalendarEventsChange}
                          onSave={handleSaveCalendarWorkspace}
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

                      {/* ── LỰA CHỌN AI ENGINE ── */}
                      <View className="gap-2.5">
                        <View className="flex-row items-center justify-between">
                          <Text className="text-sm font-bold text-brand-textSoft">Lựa chọn Mô hình Trí Tuệ Nhân Tạo (AI)</Text>
                          {(isPremium || isAdmin) ? (
                            <View className="flex-row items-center gap-1 px-2 py-0.5 rounded-md bg-[#FFF2E0] border border-brand-accent/30">
                              <Crown size={11} color={BRAND_COLORS.accent} />
                              <Text className="text-[10px] font-extrabold text-brand-accent">PRO UNLOCKED</Text>
                            </View>
                          ) : (
                            <Pressable onPress={() => setShowPremiumModal(true)} className="flex-row items-center gap-1 px-2 py-0.5 rounded-md bg-brand-bgAlt border border-brand-line/40">
                              <Crown size={11} color={BRAND_COLORS.gold} />
                              <Text className="text-[10px] font-bold text-brand-textSoft">Nâng cấp Pro</Text>
                            </Pressable>
                          )}
                        </View>

                        <View className="flex-row gap-3">
                          {/* Option 1: AI Tiêu Chuẩn (Mặc định) */}
                          <Pressable
                            testID="ai-engine-gemini-card"
                            onPress={() => setSelectedAiProvider('gemini')}
                            className={`flex-1 p-3.5 rounded-xl border flex-col justify-between gap-2 ${selectedAiProvider === 'gemini' ? 'bg-brand-primary/10 border-brand-primary' : 'bg-brand-bg border-brand-line/50'}`}
                          >
                            <View className="flex-row items-center justify-between">
                              <View className="flex-row items-center gap-1.5">
                                <Zap size={14} color={BRAND_COLORS.primary} />
                                <Text className={`text-xs font-bold ${selectedAiProvider === 'gemini' ? 'text-brand-primary' : 'text-brand-text'}`}>
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
                              if (isPremium || isAdmin) {
                                setSelectedAiProvider('custom_openai');
                              } else {
                                setShowPremiumModal(true);
                              }
                            }}
                            className={`flex-1 p-3.5 rounded-xl border flex-col justify-between gap-2 ${selectedAiProvider === 'custom_openai' ? 'bg-brand-accent/10 border-brand-accent' : 'bg-brand-bg border-brand-line/50'}`}
                          >
                            <View className="flex-row items-center justify-between">
                              <View className="flex-row items-center gap-1.5">
                                <Crown size={14} color={BRAND_COLORS.accent} />
                                <Text className={`text-xs font-bold ${selectedAiProvider === 'custom_openai' ? 'text-brand-accent' : 'text-brand-text'}`}>
                                  AI Pro
                                </Text>
                              </View>
                              {(isPremium || isAdmin) ? (
                                <View className="px-1.5 py-0.5 rounded bg-brand-accent/20">
                                  <Text className="text-[9px] font-extrabold text-brand-accent">PRO</Text>
                                </View>
                              ) : (
                                <View className="flex-row items-center gap-0.5 px-1.5 py-0.5 rounded bg-brand-line/30">
                                  <Lock size={9} color={BRAND_COLORS.textSoft} />
                                  <Text className="text-[9px] font-extrabold text-brand-textSoft">PRO</Text>
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
                          <Text className="text-xs text-brand-textSoft">Thành viên: <Text className="font-bold text-brand-text">{travelerCount} khách ({travelerType})</Text></Text>
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
                  if (isPremium || isAdmin) {
                    setUseProWorkspace(true);
                    if (pregenPlaces.length === 0) {
                      fetchPregenPlaces();
                    }
                  } else {
                    setShowPremiumModal(true);
                  }
                }}
                style={({ pressed }) => [{
                  padding: 16,
                  borderRadius: 16,
                  borderWidth: 1.5,
                  borderColor: (isPremium || isAdmin) ? BRAND_COLORS.primary : '#F5D599',
                  backgroundColor: (isPremium || isAdmin)
                    ? (pressed ? 'rgba(31,111,84,0.08)' : 'rgba(31,111,84,0.03)')
                    : '#FFFBF0',
                  gap: 8,
                }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: (isPremium || isAdmin) ? 'rgba(31,111,84,0.12)' : 'rgba(212,160,23,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                      <Crown size={20} color={(isPremium || isAdmin) ? BRAND_COLORS.primary : '#D4A017'} />
                    </View>
                    <View>
                      <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 15, color: (isPremium || isAdmin) ? BRAND_COLORS.primary : '#9A5B00' }}>
                        🗺️ Không gian Map Live & Lập lịch
                      </Text>
                      <Text style={{ fontSize: 11, color: (isPremium || isAdmin) ? '#1F6F54' : '#7A5210', fontWeight: '500' }}>
                        Google Maps Live & Google Calendar
                      </Text>
                    </View>
                  </View>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: (isPremium || isAdmin) ? BRAND_COLORS.primary : '#D4A017', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {!(isPremium || isAdmin) && <Lock size={10} color="#FFFFFF" />}
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>
                      {(isPremium || isAdmin) ? 'PRO UNLOCKED' : 'PRO 🔒'}
                    </Text>
                  </View>
                </View>

                <Text style={{ fontSize: 12, color: (isPremium || isAdmin) ? '#3F4F45' : '#7A5210', lineHeight: 17, paddingLeft: 50 }}>
                  {(isPremium || isAdmin)
                    ? 'Tự do kéo thả địa điểm từ Giỏ hàng vào Google Calendar, xem đường xe chạy OSRM và cân đối Bảng ngân sách ma trận.'
                    : 'Đặc quyền thành viên ViVu Pro. Mở khóa Không gian Map Live & Google Calendar để tự tay sắp xếp lịch trình trên bản đồ.'}
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
    </KeyboardAvoidingView>
  );
}

