import { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Animated, Platform, KeyboardAvoidingView, ActivityIndicator, Modal, useWindowDimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  Compass, Sparkles, ArrowLeft, ArrowRight,
  MapPin, DollarSign, Heart, AlertTriangle, Crown, Zap, Lock, ChevronDown,
  Trash2, Edit3, Check, Calendar, Plus, ShoppingBag, X,
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
  const [cartItems, setCartItems] = useState<{
    place: PlaceItem;
    pricing_option: 'auto' | 'manual';
    custom_cost: number;
  }[]>([]);
  const [showScheduleOptionModal, setShowScheduleOptionModal] = useState(false);
  const [editingCostPlaceId, setEditingCostPlaceId] = useState<string | null>(null);
  const [editCostInput, setEditCostInput] = useState('');
  const { width: windowWidth } = useWindowDimensions();
  const isLargeScreen = windowWidth >= 900;

  const currentCartTotal = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + (Number(item.custom_cost) || 0), 0);
  }, [cartItems]);

  const handleAddToCart = (place: PlaceItem, option: 'auto' | 'manual', customCost?: number) => {
    setCartItems(prev => {
      const exists = prev.some(item => item.place.id === place.id);
      const defaultCost = place.estimated_cost || (place.price_level ? place.price_level * 50000 : 50000);
      const finalCost = customCost !== undefined ? customCost : defaultCost;
      if (exists) {
        return prev.map(item => item.place.id === place.id ? { ...item, pricing_option: option, custom_cost: finalCost } : item);
      }
      return [...prev, { place, pricing_option: option, custom_cost: finalCost }];
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
          cart_items: cartItems,
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
          cart_items: cartItems,
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
        <View className="max-w-xl w-full self-center gap-8">
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

            {/* ── STEP 2: Travelers & Budget / Pro Workspace ── */}
            {step === 2 && (
              <Reveal>
                <View className="gap-6">
                  {/* Banner / Tab selector for Pro Workspace */}
                  {!(isPremium || isAdmin) ? (
                    // Banner for non-pro user
                    <View className="p-4 rounded-2xl bg-[#FFFBF0] border border-[#F5D599] flex-row items-center justify-between gap-3 shadow-sm">
                      <View className="flex-1 gap-1">
                        <View className="flex-row items-center gap-1.5">
                          <Crown size={16} color={BRAND_COLORS.accent} />
                          <Text className="text-sm font-extrabold text-[#9A5B00]">
                            🌟 Chế độ Pro Planner: Chọn địa điểm trên Bản đồ & Cân đối ngân sách thời gian thực 🔒
                          </Text>
                        </View>
                        <Text className="text-xs text-[#7A5210] leading-relaxed">
                          Chọn trực quan từng quán ăn, khách sạn trên bản đồ, tính toán ngân sách trực tiếp và để AI tối ưu hóa lộ trình thông minh.
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
                  ) : (
                    // Pro user mode switcher
                    <View className="p-1 rounded-2xl bg-brand-bgAlt border border-brand-line/40 flex-row gap-1">
                      <Pressable
                        onPress={() => setUseProWorkspace(false)}
                        className={`flex-1 py-3 px-3 rounded-xl flex-row items-center justify-center gap-2 ${!useProWorkspace ? 'bg-white shadow-sm border border-brand-line/40' : ''}`}
                      >
                        <Sparkles size={15} color={!useProWorkspace ? BRAND_COLORS.primary : BRAND_COLORS.textSoft} />
                        <Text className={`text-xs font-bold ${!useProWorkspace ? 'text-brand-primary' : 'text-brand-textSoft'}`}>
                          Tạo nhanh tự động
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() => setUseProWorkspace(true)}
                        className={`flex-1 py-3 px-3 rounded-xl flex-row items-center justify-center gap-2 ${useProWorkspace ? 'bg-brand-primary shadow-sm' : ''}`}
                      >
                        <Crown size={15} color={useProWorkspace ? '#FFFFFF' : BRAND_COLORS.accent} />
                        <Text className={`text-xs font-bold ${useProWorkspace ? 'text-white' : 'text-brand-text'}`}>
                          🌟 Pro Workspace (Map + Ngân sách Live)
                        </Text>
                      </Pressable>
                    </View>
                  )}

                  {/* Standard Mode Form: Đoàn đi & Ngân sách */}
                  {(!useProWorkspace || !(isPremium || isAdmin)) ? (
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
                  ) : (
                    /* ── PRO WORKSPACE LAYOUT (2 CỘT RESPONSIVE) ── */
                    <View className="gap-6">
                      <View className="flex-row justify-between items-start flex-wrap gap-2">
                        <View>
                          <View className="flex-row items-center gap-2">
                            <Text className="font-display font-extrabold text-2xl text-brand-text">
                              Pro Planner Workspace
                            </Text>
                            <View className="px-2 py-0.5 rounded-md bg-[#FFF2E0] border border-brand-accent/30">
                              <Text className="text-[10px] font-extrabold text-brand-accent">PRO</Text>
                            </View>
                          </View>
                          <Text className="text-xs text-brand-textSoft mt-0.5">
                            Chọn địa điểm tại {destinationCity} trên bản đồ & cân đối ngân sách theo thời gian thực
                          </Text>
                        </View>

                        {/* Quick budget adjustment badge */}
                        <View className="flex-row items-center gap-2 bg-brand-bgAlt px-3 py-1.5 rounded-xl border border-brand-line/40">
                          <Text className="text-xs text-brand-textSoft">Trần ngân sách:</Text>
                          <Text className="text-xs font-bold text-brand-primary">
                            {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(budgetTotal)}
                          </Text>
                        </View>
                      </View>

                      {/* 2-Column Responsive Layout */}
                      <View style={{ flexDirection: isLargeScreen ? 'row' : 'column', gap: 20, alignItems: 'flex-start' }}>
                        {/* Cột 1 (Bên trái / Trên): Bản đồ tương tác CuratedMap */}
                        <View style={{ flex: isLargeScreen ? 1.4 : undefined, width: '100%' }}>
                          <CuratedMap
                            places={getCuratedPlacesForCity(destinationCity)}
                            cityName={destinationCity}
                            addedPlaceIds={cartItems.map(item => item.place.id)}
                            existingTripPlaceNames={[]}
                            onAddToCart={handleAddToCart}
                          />
                        </View>

                        {/* Cột 2 (Bên phải / Dưới): LiveBudgetBar + Giỏ hàng cartItems + Nút bấm to */}
                        <View style={{ flex: isLargeScreen ? 1 : undefined, width: '100%', gap: 14 }}>
                          {/* 1. LiveBudgetBar */}
                          <LiveBudgetBar
                            totalBudget={budgetTotal}
                            currentCartTotal={currentCartTotal}
                          />

                          {/* 2. Danh sách các món trong giỏ hàng (cartItems) */}
                          <View className="bg-white rounded-2xl p-4 border border-brand-line/40 gap-3 shadow-sm">
                            <View className="flex-row justify-between items-center pb-2 border-b border-brand-line/20">
                              <View className="flex-row items-center gap-2">
                                <ShoppingBag size={16} color={BRAND_COLORS.primary} />
                                <Text className="font-bold text-sm text-brand-text">
                                  Địa điểm đã chọn ({cartItems.length})
                                </Text>
                              </View>
                              {cartItems.length > 0 && (
                                <Pressable
                                  onPress={() => setCartItems([])}
                                  className="px-2 py-1 rounded-md hover:bg-brand-bgAlt"
                                >
                                  <Text className="text-[11px] font-semibold text-brand-danger">Xóa tất cả</Text>
                                </Pressable>
                              )}
                            </View>

                            {cartItems.length === 0 ? (
                              <View className="py-8 items-center justify-center gap-2">
                                <Text className="text-xs text-brand-textSoft text-center px-4 leading-relaxed">
                                  Giỏ địa điểm đang trống. Bạn hãy bấm chọn các địa điểm trên bản đồ hoặc danh sách gợi ý để thêm vào chuyến đi!
                                </Text>
                              </View>
                            ) : (
                              <ScrollView style={{ maxHeight: 320 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                                <View className="gap-2.5 pr-1">
                                  {cartItems.map((item) => {
                                    const isEditing = editingCostPlaceId === item.place.id;
                                    return (
                                      <View
                                        key={item.place.id}
                                        className="p-3 rounded-xl bg-brand-bgAlt/80 border border-brand-line/40 gap-2"
                                      >
                                        <View className="flex-row justify-between items-start gap-2">
                                          <View className="flex-1">
                                            <Text className="text-xs font-bold text-brand-text" numberOfLines={1}>
                                              {item.place.name}
                                            </Text>
                                            <Text className="text-[11px] text-brand-textMuted" numberOfLines={1}>
                                              {item.place.address}
                                            </Text>
                                          </View>

                                          <Pressable
                                            onPress={() => handleRemoveFromCart(item.place.id)}
                                            className="p-1 rounded-lg hover:bg-brand-danger/10"
                                          >
                                            <Trash2 size={14} color={BRAND_COLORS.danger} />
                                          </Pressable>
                                        </View>

                                        {/* Price display and quick edit */}
                                        <View className="flex-row items-center justify-between pt-1 border-t border-brand-line/20">
                                          {isEditing ? (
                                            <View className="flex-row items-center gap-2 flex-1 mr-2">
                                              <TextInput
                                                value={editCostInput}
                                                onChangeText={setEditCostInput}
                                                keyboardType="numeric"
                                                autoFocus
                                                className="flex-1 px-2.5 py-1 text-xs rounded-lg border border-brand-primary bg-white font-bold"
                                                placeholder="Nhập giá mới..."
                                              />
                                              <Pressable
                                                onPress={() => {
                                                  const newCost = parseInt(editCostInput.replace(/\D/g, ''), 10) || 0;
                                                  handleUpdateItemCost(item.place.id, newCost);
                                                }}
                                                className="p-1.5 rounded-lg bg-brand-primary"
                                              >
                                                <Check size={13} color="#FFFFFF" />
                                              </Pressable>
                                              <Pressable
                                                onPress={() => setEditingCostPlaceId(null)}
                                                className="p-1.5 rounded-lg bg-brand-line/40"
                                              >
                                                <X size={13} color={BRAND_COLORS.textSoft} />
                                              </Pressable>
                                            </View>
                                          ) : (
                                            <>
                                              <View className="flex-row items-center gap-1.5">
                                                <Text className="text-xs font-bold text-brand-accent">
                                                  {new Intl.NumberFormat('vi-VN').format(item.custom_cost)} đ
                                                </Text>
                                                <Text className="text-[10px] text-brand-textMuted">
                                                  ({item.pricing_option === 'auto' ? 'Giá quán' : 'Tự chỉnh'})
                                                </Text>
                                              </View>

                                              <Pressable
                                                onPress={() => handleStartEditCost(item.place.id, item.custom_cost)}
                                                className="flex-row items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-brand-line/40"
                                              >
                                                <Edit3 size={11} color={BRAND_COLORS.textSoft} />
                                                <Text className="text-[10px] font-semibold text-brand-textSoft">Đổi giá</Text>
                                              </Pressable>
                                            </>
                                          )}
                                        </View>
                                      </View>
                                    );
                                  })}
                                </View>
                              </ScrollView>
                            )}

                            {/* 3. Nút bấm to nổi bật: "Xác nhận danh sách địa điểm (X địa điểm)" */}
                            <Pressable
                              onPress={() => {
                                if (cartItems.length === 0) {
                                  setErrorMsg('Vui lòng thêm ít nhất 1 địa điểm từ bản đồ vào giỏ');
                                  return;
                                }
                                setErrorMsg('');
                                setShowScheduleOptionModal(true);
                              }}
                              disabled={cartItems.length === 0}
                              className={`w-full py-4 px-4 rounded-2xl flex-row items-center justify-center gap-2 mt-2 shadow-sm ${cartItems.length > 0 ? 'bg-brand-primary active:opacity-90' : 'bg-brand-line/60 opacity-60'}`}
                            >
                              <Check size={18} color="#FFFFFF" />
                              <Text className="text-white text-sm font-extrabold text-center">
                                Xác nhận danh sách địa điểm ({cartItems.length} địa điểm)
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    </View>
                  )}
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

            {/* ── STEP 4: Health & Confirm ── */}
            {step === 4 && (
              <Reveal>
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
              ) : (
                <Pressable
                  testID="btn-submit-trip"
                  onPress={handleSubmit}
                  className="flex-row items-center gap-2 px-6 py-3.5 rounded-xl bg-brand-accent active:opacity-80"
                >
                  <Sparkles size={16} color="white" />
                  <Text className="text-white text-sm font-bold">
                    {errorMsg ? 'Thử lại tạo lịch trình AI' : 'Tạo lịch trình AI'}
                  </Text>
                </Pressable>
              )}
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
                  <Crown size={18} color={BRAND_COLORS.accent} />
                  <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 18, color: '#1B2420' }}>
                    Chọn phương thức lập lịch trình
                  </Text>
                </View>
                <Text style={{ fontSize: 13, color: '#6E7B70', lineHeight: 18 }}>
                  Bạn đã chọn <Text style={{ fontWeight: 'bold', color: '#1B2420' }}>{cartItems.length} địa điểm</Text> với tổng chi phí dự kiến <Text style={{ fontWeight: 'bold', color: BRAND_COLORS.primary }}>{new Intl.NumberFormat('vi-VN').format(currentCartTotal)} đ</Text>. Vui lòng chọn cách khởi tạo hành trình:
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
              {/* Lựa chọn A: Dùng AI sắp xếp lịch trình thông minh */}
              <Pressable
                onPress={() => handleProScheduleSubmit('ai_auto')}
                style={({ pressed }) => [{
                  padding: 16,
                  borderRadius: 16,
                  borderWidth: 1.5,
                  borderColor: BRAND_COLORS.primary,
                  backgroundColor: pressed ? 'rgba(31,111,84,0.08)' : 'rgba(31,111,84,0.03)',
                  gap: 8,
                }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(31,111,84,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                      <Sparkles size={20} color={BRAND_COLORS.primary} />
                    </View>
                    <View>
                      <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 15, color: BRAND_COLORS.primary }}>
                        Lựa chọn A: AI Sắp Xếp Thông Minh
                      </Text>
                      <Text style={{ fontSize: 11, color: '#1F6F54', fontWeight: '600' }}>
                        AI Itinerary Engine (Khuyên dùng)
                      </Text>
                    </View>
                  </View>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: BRAND_COLORS.primary }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>AI PRO</Text>
                  </View>
                </View>

                <Text style={{ fontSize: 12, color: '#3F4F45', lineHeight: 17, paddingLeft: 44 }}>
                  Gemini AI tự động phân bổ {cartItems.length} địa điểm đã chọn vào từng ngày hợp lý theo cung đường di chuyển tối ưu nhất, thêm gợi ý thời gian chi tiết.
                </Text>
              </Pressable>

              {/* Lựa chọn B: Tự sắp xếp thủ công (Self-Schedule) */}
              <Pressable
                onPress={() => handleProScheduleSubmit('manual')}
                style={({ pressed }) => [{
                  padding: 16,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(27,36,32,0.15)',
                  backgroundColor: pressed ? '#F5F0E6' : '#FFFFFF',
                  gap: 8,
                }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(27,36,32,0.06)', alignItems: 'center', justifyContent: 'center' }}>
                      <Calendar size={18} color="#1B2420" />
                    </View>
                    <View>
                      <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 15, color: '#1B2420' }}>
                        Lựa chọn B: Tự Sắp Xếp Thủ Công
                      </Text>
                      <Text style={{ fontSize: 11, color: '#6E7B70', fontWeight: '500' }}>
                        Self-Schedule (Tự do tùy biến)
                      </Text>
                    </View>
                  </View>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(27,36,32,0.08)' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#6E7B70' }}>THỦ CÔNG</Text>
                  </View>
                </View>

                <Text style={{ fontSize: 12, color: '#6E7B70', lineHeight: 17, paddingLeft: 44 }}>
                  Không qua phân tích AI. Tạo ngay chuyến đi và lưu sẵn {cartItems.length} địa điểm vào ngày 1 để bạn tự tay kéo thả, chia ngày theo sở thích riêng.
                </Text>
              </Pressable>
            </View>

            {/* Cancel Button */}
            <Pressable
              onPress={() => setShowScheduleOptionModal(false)}
              style={{ paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#F3ECDC' }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#1B2420' }}>Quay lại bản đồ</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

