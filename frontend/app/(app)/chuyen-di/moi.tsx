import { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Animated, Platform, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Compass, Sparkles, ArrowLeft, ArrowRight,
  MapPin, DollarSign, Heart, AlertTriangle,
} from 'lucide-react-native';
import { apiClient } from '../../../lib/apiClient';
import { clearCache } from '../../../lib/cache';
import { requestNotificationPermission, scheduleTripReminder } from '../../../lib/notifications';
import Reveal from '../../../components/Reveal';
import {
  VIETNAMESE_CITIES, TRAVELER_TYPES, PREFERENCE_OPTIONS, BRAND_COLORS,
} from '../../../constants';

const canUseLocalStorage = Platform.OS === 'web' && typeof localStorage !== 'undefined';

const LOADING_STAGES = [
  'Đang tra cứu dự báo thời tiết tại điểm đến...',
  'Đang quét địa điểm lưu trú & ăn uống thực tế (Google Places)...',
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

// Loading screen with spinning compass + progress
function LoadingScreen({ stage }: { stage: number }) {
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
      </View>
    </View>
  );
}

export default function TripWizard() {
  const router = useRouter();

  useEffect(() => {
    if (canUseLocalStorage && localStorage.getItem('vivu_admin_token')) {
      router.replace('/admin' as any);
    }
  }, []);

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

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  // Form state
  const [title, setTitle] = useState('');
  const [destinationCity, setDestinationCity] = useState(VIETNAMESE_CITIES[0]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [travelerCount, setTravelerCount] = useState(1);
  const [travelerType, setTravelerType] = useState('solo');
  const [budgetTotal, setBudgetTotal] = useState(5000000);
  const [selectedPrefs, setSelectedPrefs] = useState<string[]>([]);
  const [healthConditions, setHealthConditions] = useState('');
  const [specialRequirements, setSpecialRequirements] = useState('');
  const [lodgingPreference, setLodgingPreference] = useState<'single' | 'multiple'>('single');

  const handlePrefToggle = (id: string) => {
    setSelectedPrefs(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleTravelerTypeChange = (value: string) => {
    setTravelerType(value);
    if (value === 'solo') setTravelerCount(1);
    else if (value === 'couple') setTravelerCount(2);
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
    setErrorMsg('');
    setStep(prev => prev + 1);
  };

  const handlePrev = () => {
    setErrorMsg('');
    setStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setLoadingStage(0);

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
    }, {} as Record<string, boolean>);

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
      const res = await apiClient.post('/trips', {
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
      });
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
      router.replace(`/chuyen-di/${res.data.id}` as any);
    } catch (err: any) {
      clearInterval(stageInterval);
      setLoading(false);
      setErrorMsg(err.response?.data?.error || 'Có lỗi xảy ra khi tạo chuyến đi');
      setStep(4);
    }
  };

  if (loading) return <LoadingScreen stage={loadingStage} />;

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
              onPress={() => router.push('/chuyen-di')}
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

                  {/* City picker */}
                  <View className="gap-2">
                    <View className="flex-row items-center gap-1.5">
                      <MapPin size={14} color={BRAND_COLORS.primary} />
                      <Text className="text-sm font-bold text-brand-textSoft">Điểm đến (Chỉ Việt Nam)</Text>
                    </View>
                    <View className="flex-row flex-wrap gap-2">
                      {VIETNAMESE_CITIES.map(city => (
                        <Pressable
                          key={city}
                          onPress={() => setDestinationCity(city)}
                          className={`px-3.5 py-2 rounded-full border ${destinationCity === city
                            ? 'bg-brand-primary border-brand-primary'
                            : 'bg-brand-bg border-brand-line'}`}
                        >
                          <Text
                            className={`text-xs font-bold ${destinationCity === city ? 'text-white' : 'text-brand-textSoft'}`}
                          >
                            {city}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
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
                    {(travelerType === 'solo' || travelerType === 'couple') && (
                      <Text className="text-xs font-semibold text-brand-primary">
                        {travelerType === 'solo'
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
                        value={String(budgetTotal)}
                        onChangeText={v => setBudgetTotal(parseInt(v) || 0)}
                        keyboardType="numeric"
                        className="flex-1 px-4 py-3 rounded-xl border border-brand-line text-sm font-semibold bg-brand-bg text-brand-text"
                        placeholderTextColor={BRAND_COLORS.textMuted}
                      />
                      <DollarSign size={18} color={BRAND_COLORS.primary} />
                    </View>
                    <Text className="text-[10px] text-brand-textMuted">
                      Gợi ý: Tối thiểu ~1,500,000đ/ngày để có trải nghiệm tốt.
                    </Text>
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
                    <View className="flex-row flex-wrap gap-3">
                      {PREFERENCE_OPTIONS.map(pref => {
                        const selected = selectedPrefs.includes(pref.id);
                        return (
                          <Pressable
                            key={pref.id}
                            onPress={() => handlePrefToggle(pref.id)}
                            className={`px-4 py-3.5 rounded-xl border ${selected
                              ? 'bg-brand-primary border-brand-primary'
                              : 'bg-brand-bg border-brand-line/50'}`}
                            style={{ minWidth: 130 }}
                          >
                            <Text
                              className={`text-sm font-semibold ${selected ? 'text-white' : 'text-brand-textSoft'}`}
                            >
                              {pref.label}
                            </Text>
                          </Pressable>
                        );
                      })}
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
                  onPress={handleNext}
                  disabled={!!errorMsg}
                  className={`flex-row items-center gap-1.5 px-5 py-3 rounded-xl ${!!errorMsg ? 'bg-brand-primary/40 opacity-50' : 'bg-brand-primary'}`}
                >
                  <Text className="text-white text-sm font-bold">Tiếp tục</Text>
                  <ArrowRight size={16} color="white" />
                </Pressable>
              ) : (
                <Pressable
                  onPress={handleSubmit}
                  disabled={!!errorMsg}
                  className={`flex-row items-center gap-2 px-6 py-3.5 rounded-xl ${!!errorMsg ? 'bg-brand-accent/40 opacity-50' : 'bg-brand-accent'}`}
                >
                  <Sparkles size={16} color="white" />
                  <Text className="text-white text-sm font-bold">Tạo lịch trình AI</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
