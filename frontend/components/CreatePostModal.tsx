import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import {
  X,
  Star,
  MapPin,
  Tag,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  Upload,
  Image as ImageIcon,
  Sparkles,
  ChevronDown,
  Navigation,
} from 'lucide-react-native';
import { api } from '../lib/api';
import {
  VIETNAM_PROVINCES,
  POST_CATEGORIES,
  POST_ASPECT_OPTIONS,
  BRAND_COLORS,
} from '../constants';

interface CreatePostModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialPlaceName?: string;
  initialProvince?: string;
  initialTripId?: string;
}

export default function CreatePostModal({
  visible,
  onClose,
  onSuccess,
  initialPlaceName = '',
  initialProvince = '',
  initialTripId = '',
}: CreatePostModalProps) {
  // Form State
  const [placeName, setPlaceName] = useState(initialPlaceName);
  const [province, setProvince] = useState(initialProvince || 'Hà Nội');
  const [category, setCategory] = useState('food_local');
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState('');
  const [costPerPerson, setCostPerPerson] = useState('');
  const [openingHours, setOpeningHours] = useState('');
  const [placeStatus, setPlaceStatus] = useState<'operating' | 'closed'>('operating');
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');

  // Selected Aspects
  const [aspectQuality, setAspectQuality] = useState('Rất tốt');
  const [aspectService, setAspectService] = useState('Chu đáo');
  const [aspectAtmosphere, setAspectAtmosphere] = useState('Ấm cúng');
  const [aspectWaitingTime, setAspectWaitingTime] = useState('Không phải chờ');
  const [aspectBookingMethod, setAspectBookingMethod] = useState('Không cần đặt trước');
  const [aspectParking, setAspectParking] = useState('Bãi đỗ xe máy miễn phí');

  // Trip selection
  const [userTrips, setUserTrips] = useState<any[]>([]);
  const [selectedTripId, setSelectedTripId] = useState(initialTripId);
  const [tripPlaces, setTripPlaces] = useState<any[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(false);

  // Status
  const [submitting, setSubmitting] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset form when opened
  useEffect(() => {
    if (visible) {
      setPlaceName(initialPlaceName);
      setProvince(initialProvince || 'Hà Nội');
      setCategory('food_local');
      setRating(5);
      setContent('');
      setCostPerPerson('');
      setOpeningHours('07:00 - 22:00');
      setPlaceStatus('operating');
      setMediaUrls([]);
      setGoogleMapsUrl('');
      setErrorMsg('');
      setSuccessMsg('');
      setUploadProgressText('');
      setSelectedTripId(initialTripId);

      // Fetch user's trips for quick place selection
      setLoadingTrips(true);
      api
        .get('/trips')
        .then((res) => {
          if (res.data && Array.isArray(res.data)) {
            setUserTrips(res.data);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingTrips(false));
    }
  }, [visible, initialPlaceName, initialProvince, initialTripId]);

  // When a trip is selected, fetch its days and places
  const handleSelectTrip = async (tripId: string) => {
    setSelectedTripId(tripId);
    if (!tripId) {
      setTripPlaces([]);
      return;
    }

    try {
      const res = await api.get(`/trips/${tripId}`);
      if (res.data?.days) {
        const places: any[] = [];
        res.data.days.forEach((day: any) => {
          (day.items || []).forEach((item: any) => {
            if (item.title && item.status !== 'replaced' && item.status !== 'skipped') {
              places.push({
                title: item.title,
                city: res.data.destination_city || province,
                item_type: item.item_type,
              });
            }
          });
        });
        setTripPlaces(places);
      }
    } catch {
      setTripPlaces([]);
    }
  };

  const handlePickPlaceFromTrip = (place: any) => {
    setPlaceName(place.title);
    if (place.city) {
      // Find matching province
      const matched = VIETNAM_PROVINCES.find(
        (p) =>
          p.toLowerCase().includes(place.city.toLowerCase()) ||
          place.city.toLowerCase().includes(p.toLowerCase())
      );
      if (matched) setProvince(matched);
    }
    // Map item_type to category
    if (place.item_type === 'accommodation') setCategory('stay');
    else if (place.item_type === 'dining') setCategory('food_local');
    else if (place.item_type === 'attraction') setCategory('entertainment');
  };

  const handleRemoveMedia = (index: number) => {
    setMediaUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || '');
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  // Upload multiple files on Web
  const handleFileChange = async (e: any) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    setUploadingMedia(true);
    setErrorMsg('');

    try {
      const newUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgressText(`Đang tải ảnh ${i + 1}/${files.length}...`);
        const base64 = await readFileAsDataURL(file);
        const res = await api.post('/posts/upload-media', {
          fileName: file.name,
          fileType: file.type,
          base64,
        });

        if (res.data?.url) {
          newUrls.push(res.data.url);
        }
      }

      if (newUrls.length > 0) {
        setMediaUrls((prev) => [...prev, ...newUrls]);
      }
    } catch (uploadErr: any) {
      setErrorMsg(uploadErr.response?.data?.error || 'Lỗi khi tải ảnh/video lên máy chủ');
    } finally {
      setUploadingMedia(false);
      setUploadProgressText('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!placeName.trim()) {
      setErrorMsg('Vui lòng nhập tên địa điểm đánh giá');
      return;
    }

    if (!province) {
      setErrorMsg('Vui lòng chọn Tỉnh/Thành phố (Tag bắt buộc)');
      return;
    }

    if (!category) {
      setErrorMsg('Vui lòng chọn Phân loại địa điểm (Tag bắt buộc)');
      return;
    }

    if (!content.trim()) {
      setErrorMsg('Vui lòng viết mô tả đánh giá chi tiết về địa điểm');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    const payload = {
      place_name: placeName.trim(),
      province,
      category,
      rating,
      content: content.trim(),
      media_urls: mediaUrls,
      google_maps_url: googleMapsUrl.trim(),
      aspects: {
        quality: aspectQuality,
        service: aspectService,
        atmosphere: aspectAtmosphere,
        waiting_time: aspectWaitingTime,
        booking_method: aspectBookingMethod,
        parking: aspectParking,
      },
      cost_per_person: parseInt(costPerPerson.replace(/\D/g, ''), 10) || 0,
      opening_hours: openingHours.trim(),
      place_status: placeStatus,
      trip_id: selectedTripId || null,
    };

    try {
      const res = await api.post('/posts', payload);
      if (res.data?.success) {
        setSuccessMsg('Đăng bài đánh giá thành công!');
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 800);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Lỗi hệ thống khi đăng bài');
    } finally {
      setSubmitting(false);
    }
  };

  const ratingDescriptions: Record<number, string> = {
    1: '1 sao · Rất tệ',
    2: '2 sao · Tệ / Chưa hài lòng',
    3: '3 sao · Bình thường',
    4: '4 sao · Hài lòng / Tốt',
    5: '5 sao · Tuyệt vời / Đáng thử!',
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(20,32,27,0.65)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
        }}
      >
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 24,
            width: '100%',
            maxWidth: 720,
            maxHeight: '92%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 45px rgba(0,0,0,0.2)' as any,
          }}
        >
          {/* Header */}
          <View
            style={{
              paddingHorizontal: 24,
              paddingVertical: 18,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(27,36,32,0.08)',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#FBF5EA',
            }}
          >
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 20 }}>✍️</Text>
                <Text
                  style={{
                    fontFamily: 'Lora_700Bold',
                    fontSize: 18,
                    color: BRAND_COLORS.text,
                  }}
                >
                  Đăng Bài Đánh Giá Địa Điểm
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: BRAND_COLORS.textMuted }}>
                Chia sẻ cảm nhận, tiêu chí phụ, chi phí và hình ảnh thực tế tới cộng đồng
              </Text>
            </View>

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [{
                padding: 6,
                borderRadius: 12,
                backgroundColor: pressed ? '#EAE5D9' : 'transparent',
              }]}
            >
              <X size={20} color={BRAND_COLORS.text} />
            </Pressable>
          </View>

          {/* Body Form */}
          <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
            {/* Error & Success Notification */}
            {errorMsg ? (
              <View
                style={{
                  backgroundColor: '#FEE2E2',
                  borderWidth: 1,
                  borderColor: '#F87171',
                  borderRadius: 12,
                  padding: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <AlertCircle size={18} color="#DC2626" />
                <Text style={{ color: '#991B1B', fontSize: 13, fontWeight: '600', flex: 1 }}>
                  {errorMsg}
                </Text>
              </View>
            ) : null}

            {successMsg ? (
              <View
                style={{
                  backgroundColor: '#DCFCE7',
                  borderWidth: 1,
                  borderColor: '#86EFAC',
                  borderRadius: 12,
                  padding: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <CheckCircle2 size={18} color="#16A34A" />
                <Text style={{ color: '#166534', fontSize: 13, fontWeight: '700', flex: 1 }}>
                  {successMsg}
                </Text>
              </View>
            ) : null}

            {/* Bước 1: Chọn từ chuyến đi hoặc Tên địa điểm */}
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: BRAND_COLORS.text }}>
                  1. Tên Địa Điểm Được Đánh Giá <Text style={{ color: '#EF4444' }}>*</Text>
                </Text>
                {userTrips.length > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Sparkles size={13} color={BRAND_COLORS.primary} />
                    <Text style={{ fontSize: 12, color: BRAND_COLORS.primary, fontWeight: '600' }}>
                      Có thể chọn nhanh từ chuyến đi
                    </Text>
                  </View>
                )}
              </View>

              {/* Quick Trip Selector */}
              {userTrips.length > 0 && (
                <View style={{ backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', gap: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#475569' }}>
                    Chọn chuyến đi để lấy địa điểm (tùy chọn):
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    <Pressable
                      onPress={() => handleSelectTrip('')}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 8,
                        backgroundColor: !selectedTripId ? '#1E293B' : '#FFFFFF',
                        borderWidth: 1,
                        borderColor: !selectedTripId ? '#1E293B' : '#CBD5E1',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: !selectedTripId ? '#FFFFFF' : '#334155' }}>
                        Tự nhập mới
                      </Text>
                    </Pressable>
                    {userTrips.map((t) => (
                      <Pressable
                        key={t.id}
                        onPress={() => handleSelectTrip(t.id)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 8,
                          backgroundColor: selectedTripId === t.id ? BRAND_COLORS.primary : '#FFFFFF',
                          borderWidth: 1,
                          borderColor: selectedTripId === t.id ? BRAND_COLORS.primary : '#CBD5E1',
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: selectedTripId === t.id ? '#FFFFFF' : '#334155' }}>
                          📍 {t.title || t.destination_city}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>

                  {/* List places from selected trip */}
                  {tripPlaces.length > 0 && (
                    <View style={{ marginTop: 4, gap: 6 }}>
                      <Text style={{ fontSize: 11, color: '#64748B' }}>
                        Bấm vào địa điểm để điền tự động:
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {tripPlaces.map((p, idx) => (
                          <Pressable
                            key={idx}
                            onPress={() => handlePickPlaceFromTrip(p)}
                            style={{
                              backgroundColor: placeName === p.title ? '#DBEAFE' : '#FFFFFF',
                              borderWidth: 1,
                              borderColor: placeName === p.title ? '#3B82F6' : '#E2E8F0',
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 8,
                            }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: placeName === p.title ? '700' : '500', color: placeName === p.title ? '#1D4ED8' : '#334155' }}>
                              + {p.title}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* Place Name Input */}
              <TextInput
                testID="modal-input-place-name"
                value={placeName}
                onChangeText={setPlaceName}
                placeholder="Nhập tên quán ăn, cà phê, khách sạn hoặc điểm đến (VD: Phở Bát Đàn, Khách sạn Mường Thanh...)"
                placeholderTextColor="#94A3B8"
                style={{
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1.5,
                  borderColor: 'rgba(27,36,32,0.15)',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: 14,
                  color: BRAND_COLORS.text,
                }}
              />
            </View>

            {/* Bước 2: 2 TAG BẮT BUỘC (TỈNH THÀNH + PHÂN LOẠI) */}
            <View style={{ gap: 14, backgroundColor: '#FAF5EA', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E8DECC' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Tag size={16} color={BRAND_COLORS.primary} />
                <Text style={{ fontSize: 14, fontWeight: '800', color: BRAND_COLORS.primary }}>
                  2. Hai Tag Bắt Buộc Gắn Vào Bài Viết
                </Text>
              </View>

              {/* Tag 1: Tỉnh / Thành */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_COLORS.text }}>
                  Tag Tỉnh / Thành phố: <Text style={{ color: '#EF4444' }}>*</Text>
                </Text>
                {Platform.OS === 'web' ? (
                  <select
                    data-testid="modal-select-province"
                    value={province}
                    onChange={(e: any) => setProvince(e.target.value)}
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1.5px solid rgba(27,36,32,0.2)',
                      borderRadius: 10,
                      padding: '10px 14px',
                      fontSize: 14,
                      color: BRAND_COLORS.text,
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    {VIETNAM_PROVINCES.map((p) => (
                      <option key={p} value={p}>
                        📍 {p}
                      </option>
                    ))}
                  </select>
                ) : (
                  <TextInput
                    value={province}
                    onChangeText={setProvince}
                    placeholder="Nhập tỉnh thành (VD: Hà Nội, Đà Nẵng, TP. Hồ Chí Minh...)"
                    style={{
                      backgroundColor: '#FFFFFF',
                      borderWidth: 1.5,
                      borderColor: 'rgba(27,36,32,0.2)',
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      fontSize: 14,
                      color: BRAND_COLORS.text,
                    }}
                  />
                )}
              </View>

              {/* Tag 2: Phân loại */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_COLORS.text }}>
                  Tag Phân loại địa điểm: <Text style={{ color: '#EF4444' }}>*</Text>
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {POST_CATEGORIES.map((cat) => {
                    const isSelected = category === cat.id;
                    return (
                      <Pressable
                        key={cat.id}
                        testID={`tag-category-${cat.id}`}
                        onPress={() => setCategory(cat.id)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 10,
                          backgroundColor: isSelected ? cat.color : '#FFFFFF',
                          borderWidth: 1.5,
                          borderColor: isSelected ? cat.color : '#E2E8F0',
                          cursor: 'pointer' as any,
                        }}
                      >
                        <Text style={{ fontSize: 14 }}>{cat.icon}</Text>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: isSelected ? '800' : '600',
                            color: isSelected ? '#FFFFFF' : '#334155',
                          }}
                        >
                          {cat.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* Bước 3: Đánh giá & Xếp hạng sao */}
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: BRAND_COLORS.text }}>
                3. Xếp Hạng & Đánh Giá Chi Tiết <Text style={{ color: '#EF4444' }}>*</Text>
              </Text>

              {/* Interactive Stars */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Pressable
                      key={s}
                      onPress={() => setRating(s)}
                      style={{ padding: 4, cursor: 'pointer' as any }}
                    >
                      <Star
                        size={28}
                        color={s <= rating ? '#F59E0B' : '#D1D5DB'}
                        fill={s <= rating ? '#F59E0B' : 'none'}
                      />
                    </Pressable>
                  ))}
                </View>
                <View
                  style={{
                    backgroundColor: '#FEF3C7',
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#B45309' }}>
                    {ratingDescriptions[rating] || `${rating} sao`}
                  </Text>
                </View>
              </View>

              {/* Detail Content */}
              <TextInput
                testID="modal-input-content"
                value={content}
                onChangeText={setContent}
                placeholder="Mô tả trải nghiệm chi tiết của bạn tại đây: Chất lượng món ăn / phòng ốc, thái độ nhân viên, không gian, những điều cần lưu ý..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={4}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1.5,
                  borderColor: 'rgba(27,36,32,0.15)',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 14,
                  color: BRAND_COLORS.text,
                  minHeight: 90,
                  textAlignVertical: 'top',
                }}
              />
            </View>

            {/* Bước 4: Tiêu chí trải nghiệm chi tiết */}
            <View style={{ gap: 12, backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#1E293B' }}>
                4. Tiêu Chí Trải Nghiệm Chi Tiết
              </Text>

              {/* Chất lượng & Dịch vụ */}
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>
                  💎 Chất lượng:
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {POST_ASPECT_OPTIONS.quality.map((opt) => (
                    <Pressable
                      key={opt}
                      onPress={() => setAspectQuality(opt)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 8,
                        backgroundColor: aspectQuality === opt ? '#2563EB' : '#FFFFFF',
                        borderWidth: 1,
                        borderColor: aspectQuality === opt ? '#2563EB' : '#CBD5E1',
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '600', color: aspectQuality === opt ? '#FFFFFF' : '#334155' }}>
                        {opt}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Dịch vụ */}
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>
                  🛎️ Dịch vụ:
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {POST_ASPECT_OPTIONS.service.map((opt) => (
                    <Pressable
                      key={opt}
                      onPress={() => setAspectService(opt)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 8,
                        backgroundColor: aspectService === opt ? '#2563EB' : '#FFFFFF',
                        borderWidth: 1,
                        borderColor: aspectService === opt ? '#2563EB' : '#CBD5E1',
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '600', color: aspectService === opt ? '#FFFFFF' : '#334155' }}>
                        {opt}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Bầu không khí */}
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>
                  🌿 Bầu không khí:
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {POST_ASPECT_OPTIONS.atmosphere.map((opt) => (
                    <Pressable
                      key={opt}
                      onPress={() => setAspectAtmosphere(opt)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 8,
                        backgroundColor: aspectAtmosphere === opt ? '#2563EB' : '#FFFFFF',
                        borderWidth: 1,
                        borderColor: aspectAtmosphere === opt ? '#2563EB' : '#CBD5E1',
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '600', color: aspectAtmosphere === opt ? '#FFFFFF' : '#334155' }}>
                        {opt}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Thời gian chờ & Đặt chỗ & Đỗ xe */}
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>
                  ⏱️ Thời gian chờ đợi:
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {POST_ASPECT_OPTIONS.waiting_time.map((opt) => (
                    <Pressable
                      key={opt}
                      onPress={() => setAspectWaitingTime(opt)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 8,
                        backgroundColor: aspectWaitingTime === opt ? '#059669' : '#FFFFFF',
                        borderWidth: 1,
                        borderColor: aspectWaitingTime === opt ? '#059669' : '#CBD5E1',
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '600', color: aspectWaitingTime === opt ? '#FFFFFF' : '#334155' }}>
                        {opt}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>
                  📅 Phương thức đặt chỗ:
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {POST_ASPECT_OPTIONS.booking_method.map((opt) => (
                    <Pressable
                      key={opt}
                      onPress={() => setAspectBookingMethod(opt)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 8,
                        backgroundColor: aspectBookingMethod === opt ? '#059669' : '#FFFFFF',
                        borderWidth: 1,
                        borderColor: aspectBookingMethod === opt ? '#059669' : '#CBD5E1',
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '600', color: aspectBookingMethod === opt ? '#FFFFFF' : '#334155' }}>
                        {opt}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>
                  🚗 Tiện ích đỗ xe:
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {POST_ASPECT_OPTIONS.parking.map((opt) => (
                    <Pressable
                      key={opt}
                      onPress={() => setAspectParking(opt)}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 8,
                        backgroundColor: aspectParking === opt ? '#059669' : '#FFFFFF',
                        borderWidth: 1,
                        borderColor: aspectParking === opt ? '#059669' : '#CBD5E1',
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '600', color: aspectParking === opt ? '#FFFFFF' : '#334155' }}>
                        {opt}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            {/* Bước 5: Chi phí & Giờ hoạt động & Trạng thái */}
            <View style={{ gap: 12, flexDirection: 'row', flexWrap: 'wrap' }}>
              {/* Chi phí trên 1 người */}
              <View style={{ flex: 1, minWidth: 200, gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_COLORS.text }}>
                  💰 Chi phí trên 1 người (VND):
                </Text>
                <TextInput
                  value={costPerPerson}
                  onChangeText={(val) => {
                    const num = val.replace(/\D/g, '');
                    setCostPerPerson(num ? Number(num).toLocaleString('vi-VN') : '');
                  }}
                  placeholder="VD: 50.000, 150.000..."
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1.5,
                    borderColor: 'rgba(27,36,32,0.15)',
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    fontSize: 14,
                    color: BRAND_COLORS.text,
                  }}
                />
              </View>

              {/* Giờ mở/đóng cửa */}
              <View style={{ flex: 1, minWidth: 200, gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_COLORS.text }}>
                  ⏰ Giờ mở / đóng cửa:
                </Text>
                <TextInput
                  value={openingHours}
                  onChangeText={setOpeningHours}
                  placeholder="VD: 07:00 - 22:30"
                  placeholderTextColor="#94A3B8"
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1.5,
                    borderColor: 'rgba(27,36,32,0.15)',
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    fontSize: 14,
                    color: BRAND_COLORS.text,
                  }}
                />
              </View>

              {/* Trạng thái hoạt động */}
              <View style={{ width: '100%', gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_COLORS.text }}>
                  📌 Trạng thái địa điểm:
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Pressable
                    onPress={() => setPlaceStatus('operating')}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 10,
                      alignItems: 'center',
                      backgroundColor: placeStatus === 'operating' ? '#DCFCE7' : '#FFFFFF',
                      borderWidth: 1.5,
                      borderColor: placeStatus === 'operating' ? '#16A34A' : '#E2E8F0',
                      cursor: 'pointer' as any,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '800', color: placeStatus === 'operating' ? '#166534' : '#64748B' }}>
                      🟢 Đang hoạt động
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setPlaceStatus('closed')}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 10,
                      alignItems: 'center',
                      backgroundColor: placeStatus === 'closed' ? '#FEE2E2' : '#FFFFFF',
                      borderWidth: 1.5,
                      borderColor: placeStatus === 'closed' ? '#DC2626' : '#E2E8F0',
                      cursor: 'pointer' as any,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '800', color: placeStatus === 'closed' ? '#991B1B' : '#64748B' }}>
                      🔴 Đã đóng cửa
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Bước 6: Hình ảnh & Video */}
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: BRAND_COLORS.text }}>
                  📸 Hình Ảnh & Video Trải Nghiệm {mediaUrls.length > 0 ? `(${mediaUrls.length} đã chọn)` : ''}
                </Text>
                {mediaUrls.length > 0 && (
                  <Pressable onPress={() => setMediaUrls([])} style={{ padding: 2, cursor: 'pointer' as any }}>
                    <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '600' }}>Xóa tất cả ảnh</Text>
                  </Pressable>
                )}
              </View>

              {/* File upload button for Web */}
              {Platform.OS === 'web' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    style={{ display: 'none' }}
                    ref={fileInputRef as any}
                    onChange={handleFileChange}
                  />
                  <Pressable
                    onPress={() => fileInputRef.current?.click()}
                    disabled={uploadingMedia}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      backgroundColor: uploadingMedia ? '#E2E8F0' : '#F3F4F6',
                      borderWidth: 1,
                      borderColor: '#CBD5E1',
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      borderRadius: 10,
                      cursor: uploadingMedia ? 'not-allowed' : ('pointer' as any),
                    }}
                  >
                    {uploadingMedia ? (
                      <ActivityIndicator size="small" color="#1E293B" />
                    ) : (
                      <Upload size={16} color="#1E293B" />
                    )}
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B' }}>
                      {uploadingMedia ? (uploadProgressText || 'Đang tải lên...') : 'Tải nhiều ảnh/video từ máy (Chọn cùng lúc)'}
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* Google Maps Link Input */}
              <View style={{ gap: 6, marginTop: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MapPin size={15} color="#EA4335" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_COLORS.text }}>
                    Đường dẫn Google Maps của địa điểm:
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748B' }}>(Tùy chọn)</Text>
                </View>
                <TextInput
                  testID="modal-input-gmaps-url"
                  value={googleMapsUrl}
                  onChangeText={setGoogleMapsUrl}
                  placeholder="Dán liên kết Google Maps của địa điểm (VD: https://maps.app.goo.gl/...)"
                  placeholderTextColor="#94A3B8"
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderWidth: 1.5,
                    borderColor: 'rgba(27,36,32,0.15)',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    fontSize: 13,
                    color: BRAND_COLORS.text,
                  }}
                />
              </View>

              {/* Previews with index badges */}
              {mediaUrls.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                  {mediaUrls.map((url, i) => (
                    <View
                      key={i}
                      style={{
                        position: 'relative',
                        width: 96,
                        height: 96,
                        borderRadius: 10,
                        overflow: 'hidden',
                        borderWidth: 1,
                        borderColor: '#CBD5E1',
                      }}
                    >
                      <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} />
                      <View
                        style={{
                          position: 'absolute',
                          bottom: 4,
                          left: 4,
                          backgroundColor: 'rgba(0,0,0,0.65)',
                          paddingHorizontal: 6,
                          paddingVertical: 1,
                          borderRadius: 4,
                        }}
                      >
                        <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>#{i + 1}</Text>
                      </View>
                      <Pressable
                        onPress={() => handleRemoveMedia(i)}
                        style={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          backgroundColor: 'rgba(0,0,0,0.65)',
                          borderRadius: 12,
                          width: 22,
                          height: 22,
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer' as any,
                        }}
                      >
                        <X size={12} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View
            style={{
              paddingHorizontal: 24,
              paddingVertical: 16,
              borderTopWidth: 1,
              borderTopColor: 'rgba(27,36,32,0.08)',
              flexDirection: 'row',
              justifyContent: 'flex-end',
              gap: 12,
              backgroundColor: '#FFFFFF',
            }}
          >
            <Pressable
              onPress={onClose}
              disabled={submitting}
              style={{
                paddingHorizontal: 18,
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: '#F3F4F6',
                cursor: 'pointer' as any,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#4B5563' }}>Hủy bỏ</Text>
            </Pressable>

            <Pressable
              testID="btn-submit-post"
              onPress={handleSubmit}
              disabled={submitting}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 22,
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: BRAND_COLORS.primary,
                opacity: submitting ? 0.7 : 1,
                cursor: 'pointer' as any,
              }}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={{ fontSize: 15 }}>🚀</Text>
              )}
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>
                {submitting ? 'Đang đăng bài...' : 'Đăng Bài Đánh Giá'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
