import { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput, Platform } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Compass, Plus, MapPin, Star, ChevronRight, AlertTriangle, X, Sparkles } from 'lucide-react-native';
import { BRAND_COLORS, VIETNAMESE_CITIES } from '../../constants';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import AdminNav from '../../components/admin/AdminNav';
import Reveal from '../../components/Reveal';

interface PartnerRecord {
  id: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  city: string;
  district?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  website_url?: string | null;
  booking_url?: string | null;
  description?: string | null;
  image_urls?: string[] | null;
  price_level: number;
  cuisine_tags?: string[] | null;
  amenity_tags?: string[] | null;
  dietary_safe?: string[] | null;
  admin_rating: number;
  admin_notes?: string | null;
  partner_priority: number;
  active_status: boolean;
  impression_count: number;
  click_count: number;
  booking_count: number;
  created_at: string;
}

function TableHeader({ cols }: { cols: string[] }) {
  return (
    <View className="flex-row px-4 py-3 border-b border-brand-line/40 bg-brand-bgAlt/60">
      {cols.map((c, i) => (
        <Text key={i} className="flex-1 text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider">{c}</Text>
      ))}
    </View>
  );
}

export default function AdminPartners() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ visible: boolean; title: string; message: string; onConfirm: () => void; confirmText?: string; cancelText?: string; isDestructive?: boolean } | null>(null);

  const [partnerModalVisible, setPartnerModalVisible] = useState(false);
  const [editingPartner, setEditingPartner] = useState<PartnerRecord | null>(null);
  const [formSubTab, setFormSubTab] = useState<'basic'|'contact'|'config'|'media'>('basic');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('hotel');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [city, setCity] = useState('Hà Nội');
  const [district, setDistrict] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [bookingUrl, setBookingUrl] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrls, setImageUrls] = useState('');
  const [priceLevel, setPriceLevel] = useState(2);
  const [cuisineTags, setCuisineTags] = useState('');
  const [amenityTags, setAmenityTags] = useState('');
  const [dietarySafe, setDietarySafe] = useState('');
  const [adminRating, setAdminRating] = useState(3);
  const [adminNotes, setAdminNotes] = useState('');
  const [partnerPriority, setPartnerPriority] = useState('0');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);

  const { data: partners, isLoading: partnersLoading } = useQuery<PartnerRecord[]>({
    queryKey: ['adminPartners'],
    queryFn: async () => (await api.get('/admin/partners')).data,
    enabled: !!isAdmin,
  });

  const { data: partnerStats, isLoading: partnerStatsLoading } = useQuery<{ totalImpressions: number; totalClicks: number; totalBookings: number; averageCtr: number }>({
    queryKey: ['adminPartnerStats'],
    queryFn: async () => (await api.get('/admin/partners/analytics/summary')).data,
    enabled: !!isAdmin,
  });

  const deletePartner = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/partners/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminPartners'] });
      qc.invalidateQueries({ queryKey: ['adminPartnerStats'] });
      showToast('Đã xóa đối tác thành công!', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });

  const togglePartnerActive = useMutation({
    mutationFn: (id: string) => api.put(`/admin/partners/${id}/toggle`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminPartners'] });
      qc.invalidateQueries({ queryKey: ['adminPartnerStats'] });
      showToast('Đã cập nhật trạng thái hoạt động!', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });

  const savePartner = useMutation({
    mutationFn: ({ id, data }: { id?: string; data: any }) => {
      if (id) {
        return api.put(`/admin/partners/${id}`, data);
      } else {
        return api.post('/admin/partners', data);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminPartners'] });
      setPartnerModalVisible(false);
      showToast(editingPartner ? 'Đã cập nhật thông tin đối tác!' : 'Đã thêm đối tác mới thành công!', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void, options?: { confirmText?: string; cancelText?: string; isDestructive?: boolean }) => {
    setConfirmModal({ visible: true, title, message, onConfirm: () => { onConfirm(); setConfirmModal(null); }, confirmText: options?.confirmText || 'Xác nhận', cancelText: options?.cancelText || 'Hủy', isDestructive: options?.isDestructive ?? false });
  };

  const confirmDeletePartner = (id: string, name: string) => {
    showConfirm(
      'Xác nhận xóa đối tác',
      `Bạn có chắc chắn muốn xóa đối tác "${name}" không? Toàn bộ dữ liệu cấu hình và thống kê hiệu suất liên quan sẽ bị xóa vĩnh viễn khỏi hệ thống!`,
      () => deletePartner.mutate(id),
      { confirmText: 'Xóa đối tác', cancelText: 'Hủy', isDestructive: true }
    );
  };

  const openPartnerModal = (partner: PartnerRecord | null = null) => {
    setFormSubTab('basic');
    setEditingPartner(partner);
    if (partner) {
      setName(partner.name || '');
      setCategory(partner.category || 'hotel');
      setAddress(partner.address || '');
      setLat(String(partner.lat || ''));
      setLng(String(partner.lng || ''));
      setCity(partner.city || 'Hà Nội');
      setDistrict(partner.district || '');
      setContactPhone(partner.contact_phone || '');
      setContactEmail(partner.contact_email || '');
      setWebsiteUrl(partner.website_url || '');
      setBookingUrl(partner.booking_url || '');
      setDescription(partner.description || '');
      setImageUrls(partner.image_urls ? partner.image_urls.join(', ') : '');
      setPriceLevel(partner.price_level || 2);
      setCuisineTags(partner.cuisine_tags ? partner.cuisine_tags.join(', ') : '');
      setAmenityTags(partner.amenity_tags ? partner.amenity_tags.join(', ') : '');
      setDietarySafe(partner.dietary_safe ? partner.dietary_safe.join(', ') : '');
      setAdminRating(partner.admin_rating || 3);
      setAdminNotes(partner.admin_notes || '');
      setPartnerPriority(String(partner.partner_priority || 0));
    } else {
      setName(''); setCategory('hotel'); setAddress(''); setLat(''); setLng(''); setCity('Hà Nội');
      setDistrict(''); setContactPhone(''); setContactEmail(''); setWebsiteUrl(''); setBookingUrl('');
      setDescription(''); setImageUrls(''); setPriceLevel(2); setCuisineTags(''); setAmenityTags('');
      setDietarySafe(''); setAdminRating(3); setAdminNotes(''); setPartnerPriority('0');
    }
    setPartnerModalVisible(true);
  };

  const parseTags = (str: string) => str.split(',').map(t => t.trim()).filter(Boolean);

  const handleSavePartner = () => {
    if (!name.trim()) return showToast('Vui lòng nhập tên đối tác', 'error');
    if (!address.trim()) return showToast('Vui lòng nhập địa chỉ đối tác', 'error');
    if (!lat.trim() || isNaN(Number(lat))) return showToast('Vui lòng nhập vĩ độ hợp lệ', 'error');
    if (!lng.trim() || isNaN(Number(lng))) return showToast('Vui lòng nhập kinh độ hợp lệ', 'error');
    if (!city) return showToast('Vui lòng chọn thành phố', 'error');
    
    const numLat = parseFloat(lat);
    const numLng = parseFloat(lng);
    const priorityVal = parseInt(partnerPriority) || 0;
    
    if (numLat < -90 || numLat > 90) return showToast('Vĩ độ phải nằm trong khoảng -90 đến 90', 'error');
    if (numLng < -180 || numLng > 180) return showToast('Kinh độ phải nằm trong khoảng -180 đến 180', 'error');
    if (priorityVal < 0 || priorityVal > 10) return showToast('Độ ưu tiên phải nằm trong khoảng 0-10', 'error');

    const data = {
      name: name.trim(), category, address: address.trim(), lat: numLat, lng: numLng,
      city, district: district.trim() || null, contact_phone: contactPhone.trim() || null,
      contact_email: contactEmail.trim() || null, website_url: websiteUrl.trim() || null,
      booking_url: bookingUrl.trim() || null, description: description.trim() || null,
      image_urls: parseTags(imageUrls), price_level: priceLevel, cuisine_tags: parseTags(cuisineTags),
      amenity_tags: parseTags(amenityTags), dietary_safe: parseTags(dietarySafe),
      admin_rating: adminRating, admin_notes: adminNotes.trim() || null, partner_priority: priorityVal,
    };

    savePartner.mutate({ id: editingPartner?.id, data });
  };

  const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
    'Hà Nội': { lat: 21.0285, lng: 105.8542 }, 'Đà Nẵng': { lat: 16.0544, lng: 108.2022 },
    'TP. Hồ Chí Minh': { lat: 10.8231, lng: 106.6297 }, 'Hội An': { lat: 15.8801, lng: 108.3380 },
    'Huế': { lat: 16.4637, lng: 107.5908 }, 'Nha Trang': { lat: 12.2388, lng: 109.1967 },
    'Đà Lạt': { lat: 11.9404, lng: 108.4583 }, 'Phú Quốc': { lat: 10.2899, lng: 103.9840 },
    'Sa Pa': { lat: 22.3364, lng: 103.8438 }, 'Ninh Bình': { lat: 20.2506, lng: 105.9745 },
    'Vũng Tàu': { lat: 10.3460, lng: 107.0843 }
  };

  const mapFormCategoryToPlacesCategory = (formCat: string) => {
    if (['hotel','homestay','resort'].includes(formCat)) return 'accommodation';
    if (['restaurant','cafe'].includes(formCat)) return 'dining';
    if (formCat === 'attraction') return 'attraction';
    return 'rental';
  };

  const handlePlacesSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchingPlaces(true); setSearchResults([]);
    try {
      const coords = CITY_COORDS[city] || { lat: 16.0544, lng: 108.2022 };
      const placeCategory = mapFormCategoryToPlacesCategory(category);
      
      const response = await api.get('/places/search', {
        params: { query: searchQuery.trim(), lat: coords.lat, lng: coords.lng, category: placeCategory }
      });
      const placeList = response.data?.results || (Array.isArray(response.data) ? response.data : []);
      setSearchResults(placeList);
      if (placeList.length === 0) showToast('Không tìm thấy địa điểm nào khớp từ Google.', 'info');
    } catch (e: any) {
      showToast('Lỗi tìm kiếm địa điểm: ' + (e.response?.data?.error || e.message), 'error');
    } finally {
      setSearchingPlaces(false);
    }
  };

  const handleSelectPlace = (place: any) => {
    setName(place.name || ''); setAddress(place.address || ''); setLat(String(place.lat || '')); setLng(String(place.lng || ''));
    if (place.price_level) setPriceLevel(place.price_level);
    if (place.rating) setAdminRating(Math.min(5, Math.max(1, Math.round(place.rating))));
    setSearchResults([]); setSearchQuery('');
    showToast('Đã tự động điền thông tin từ Google Places!', 'success');
  };

  if (!isAdmin) {
    return (
      <View className="flex-1 bg-brand-bg">
        <AdminNav />
        <View className="flex-1 items-center justify-center py-20 gap-3">
          <ActivityIndicator size="large" color={BRAND_COLORS.primary} />
          <Text className="text-xs font-semibold text-brand-textSoft">Đang tải và xác thực quyền quản trị...</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-brand-bg">
      <AdminNav />
      {toast && (
        <View className="absolute top-20 left-4 right-4 z-50 items-center pointer-events-none">
          <View className="flex-row items-center gap-2 px-4 py-3 rounded-xl shadow-lg border border-brand-line/40 max-w-md w-full bg-white">
            <Text className="text-xs font-bold flex-1" style={{ color: toast.type === 'success' ? BRAND_COLORS.primaryStrong : toast.type === 'error' ? BRAND_COLORS.danger : BRAND_COLORS.accentStrong }}>
              {toast.message}
            </Text>
          </View>
        </View>
      )}

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 24 }}>
        <View className="gap-6">
          {partnerStatsLoading ? (
            <ActivityIndicator color={BRAND_COLORS.primary} />
          ) : partnerStats ? (
            <Reveal>
              <View className="flex-row flex-wrap gap-4 bg-brand-bgAlt/20 p-5 rounded-2xl border border-brand-line/40">
                <View className="flex-1 min-w-[120px] items-center py-2">
                  <Text className="text-[10px] font-bold text-brand-textSoft uppercase tracking-wider">Tổng hiển thị</Text>
                  <Text className="text-xl font-bold text-brand-text mt-1">{partnerStats.totalImpressions}</Text>
                </View>
                <View className="w-[1px] bg-brand-line/40 my-2" style={{ width: Platform.OS === 'web' ? 1 : 0 }} />
                <View className="flex-1 min-w-[120px] items-center py-2">
                  <Text className="text-[10px] font-bold text-brand-textSoft uppercase tracking-wider">Tổng Click</Text>
                  <Text className="text-xl font-bold text-brand-text mt-1">{partnerStats.totalClicks}</Text>
                </View>
                <View className="w-[1px] bg-brand-line/40 my-2" style={{ width: Platform.OS === 'web' ? 1 : 0 }} />
                <View className="flex-1 min-w-[120px] items-center py-2">
                  <Text className="text-[10px] font-bold text-brand-textSoft uppercase tracking-wider">Tổng Booking</Text>
                  <Text className="text-xl font-bold text-brand-text mt-1">{partnerStats.totalBookings}</Text>
                </View>
                <View className="w-[1px] bg-brand-line/40 my-2" style={{ width: Platform.OS === 'web' ? 1 : 0 }} />
                <View className="flex-1 min-w-[120px] items-center py-2">
                  <Text className="text-[10px] font-bold text-brand-textSoft uppercase tracking-wider">CTR trung bình</Text>
                  <Text className="text-xl font-bold text-brand-primary mt-1">{(partnerStats.averageCtr * 100).toFixed(1)}%</Text>
                </View>
              </View>
            </Reveal>
          ) : null}

          <View className="flex-row justify-between items-center">
            <View className="flex-row items-center gap-2">
              <Compass size={18} color={BRAND_COLORS.primary} />
              <Text className="font-bold text-base text-brand-text">Quản lý Đối tác Tích hợp</Text>
            </View>
            <Pressable
              onPress={() => openPartnerModal(null)}
              className="flex-row items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-primary"
            >
              <Plus size={14} color="white" />
              <Text className="text-white text-xs font-bold">Thêm đối tác</Text>
            </Pressable>
          </View>

          <View className="rounded-2xl border border-brand-line/40 overflow-hidden bg-brand-bgAlt/30">
            <TableHeader cols={['Tên đối tác', 'Danh mục / TP', 'Đánh giá', 'Hiệu suất (H/C/B)', 'Trạng thái', '']} />
            {partnersLoading ? (
              <View className="py-12 items-center gap-2">
                <ActivityIndicator color={BRAND_COLORS.primary} />
                <Text className="text-xs text-brand-textSoft">Đang tải danh sách đối tác...</Text>
              </View>
            ) : !partners?.length ? (
              <Text className="text-center py-12 text-brand-textSoft text-sm">Chưa có đối tác nào được tích hợp.</Text>
            ) : partners.map(p => {
              const categoryLabels: Record<string, string> = { hotel: 'Khách sạn', homestay: 'Homestay', resort: 'Resort', restaurant: 'Nhà hàng', cafe: 'Cà phê', attraction: 'Tham quan', transport: 'Vận chuyển' };
              return (
                <View key={p.id} className="flex-row items-center px-4 py-4 border-b border-brand-line/20 gap-2">
                  <View className="flex-1 gap-0.5">
                    <Text className="font-bold text-sm text-brand-text" numberOfLines={1}>{p.name}</Text>
                    <View className="flex-row items-center gap-1">
                      <MapPin size={10} color={BRAND_COLORS.textSoft} />
                      <Text className="text-[10px] text-brand-textSoft" numberOfLines={1}>{p.address}</Text>
                    </View>
                  </View>
                  <View className="w-28 justify-center">
                    <Text className="text-xs font-bold text-brand-textSoft">{categoryLabels[p.category] || p.category}</Text>
                    <Text className="text-[10px] text-brand-textMuted">{p.city}</Text>
                  </View>
                  <View className="w-16 flex-row items-center gap-0.5">
                    <Star size={12} color={BRAND_COLORS.gold} fill={BRAND_COLORS.gold} />
                    <Text className="text-xs font-bold text-brand-text">{p.admin_rating}/5</Text>
                  </View>
                  <View className="w-32 justify-center">
                    <Text className="text-xs text-brand-text font-semibold">
                      H: {p.impression_count || 0} / C: {p.click_count || 0} / B: {p.booking_count || 0}
                    </Text>
                    <Text className="text-[10px] text-brand-textMuted font-medium">
                      CTR: {p.impression_count ? ((p.click_count / p.impression_count) * 100).toFixed(1) : '0.0'}%
                    </Text>
                  </View>
                  <View className="w-20 items-center">
                    <Pressable onPress={() => togglePartnerActive.mutate(p.id)} className="flex-row items-center gap-1">
                      <View className="w-9 h-5 rounded-full items-center justify-center" style={{ backgroundColor: p.active_status ? `${BRAND_COLORS.primary}20` : `${BRAND_COLORS.textSoft}20` }}>
                        <View className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: p.active_status ? BRAND_COLORS.primary : BRAND_COLORS.textSoft, marginLeft: p.active_status ? 6 : -6 }} />
                      </View>
                    </Pressable>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <Pressable onPress={() => openPartnerModal(p)} className="p-2 rounded-lg bg-brand-primary/10">
                      <ChevronRight size={14} color={BRAND_COLORS.primary} />
                    </Pressable>
                    <Pressable onPress={() => confirmDeletePartner(p.id, p.name)} className="p-2 rounded-lg bg-brand-danger/10">
                      <Trash2 size={14} color={BRAND_COLORS.danger} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Partner Modal */}
      {partnerModalVisible && (
        <View className="absolute inset-0 z-40 items-center justify-center bg-black/60 px-4 py-8">
          <View className="bg-brand-bg border border-brand-line/60 rounded-2xl p-6 max-w-2xl w-full max-h-[90%] shadow-2xl flex-col">
            <View className="flex-row justify-between items-center border-b border-brand-line/40 pb-3 mb-3 shrink-0">
              <Text className="text-lg font-display font-extrabold text-brand-text">
                {editingPartner ? 'Cập Nhật Đối Tác' : 'Thêm Đối Tác Mới'}
              </Text>
              <Pressable onPress={() => setPartnerModalVisible(false)} className="p-1.5 rounded-lg bg-brand-line/10">
                <X size={16} color={BRAND_COLORS.textSoft} />
              </Pressable>
            </View>

            <View className="flex-row border-b border-brand-line/40 pb-1 mb-4 gap-2 shrink-0">
              {([{ value: 'basic', label: 'Cơ bản' }, { value: 'contact', label: 'Liên hệ' }, { value: 'config', label: 'Phân loại & Tags' }, { value: 'media', label: 'Mô tả & Ảnh' }] as const).map(tab => {
                const active = formSubTab === tab.value;
                return (
                  <Pressable key={tab.value} onPress={() => setFormSubTab(tab.value)} className="flex-1 py-2 items-center border-b-2" style={{ borderBottomColor: active ? BRAND_COLORS.primary : 'transparent' }}>
                    <Text className={`font-bold text-[11px] ${active ? 'text-brand-primary' : 'text-brand-textSoft'}`}>{tab.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <ScrollView className="flex-1 pr-1 gap-4" contentContainerStyle={{ paddingBottom: 16 }}>
              {formSubTab === 'basic' && (
                <View className="gap-3">
                  <View className="p-4 rounded-xl border border-brand-primary/20 bg-brand-primary/5 gap-2.5 mb-2">
                    <View className="flex-row items-center gap-1.5">
                      <Sparkles size={14} color={BRAND_COLORS.primary} />
                      <Text className="text-xs font-bold text-brand-primary">Tìm kiếm & Tự động điền dữ liệu Google</Text>
                    </View>
                    <Text className="text-[10px] text-brand-textSoft">Nhập tên địa điểm để tự động điền Tên, Địa chỉ, Tọa độ GPS, Giá và Đánh giá từ Google Maps.</Text>
                    <View className="flex-row gap-2 mt-1">
                      <TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Nhập tên địa điểm (VD: Metropole Hanoi...)" className="flex-1 px-3 py-2 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text" placeholderTextColor={BRAND_COLORS.textMuted} onSubmitEditing={handlePlacesSearch} />
                      <Pressable onPress={handlePlacesSearch} disabled={searchingPlaces} className="px-4 py-2 rounded-xl bg-brand-primary items-center justify-center">
                        {searchingPlaces ? <ActivityIndicator size="small" color="white" /> : <Text className="text-white text-xs font-bold">Tìm</Text>}
                      </Pressable>
                    </View>
                    {searchResults.length > 0 && (
                      <View className="mt-2 bg-brand-bg border border-brand-line rounded-xl overflow-hidden max-h-48">
                        <ScrollView nestedScrollEnabled>
                          {searchResults.map((r, idx) => (
                            <Pressable key={idx} onPress={() => handleSelectPlace(r)} className="px-3 py-2.5 border-b border-brand-line/40 hover:bg-brand-bgAlt/40 active:bg-brand-bgAlt/40">
                              <Text className="text-xs font-bold text-brand-text">{r.name}</Text>
                              <Text className="text-[10px] text-brand-textSoft mt-0.5" numberOfLines={1}>{r.address}</Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Tên đối tác *</Text>
                    <TextInput value={name} onChangeText={setName} placeholder="Ví dụ: Khách sạn Continental Sài Gòn" className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text" placeholderTextColor={BRAND_COLORS.textMuted} />
                  </View>
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Danh mục *</Text>
                    <View className="flex-row flex-wrap gap-2 mt-1">
                      {[{ value: 'hotel', label: 'Khách sạn' }, { value: 'homestay', label: 'Homestay' }, { value: 'resort', label: 'Resort' }, { value: 'restaurant', label: 'Nhà hàng' }, { value: 'cafe', label: 'Cà phê' }, { value: 'attraction', label: 'Điểm tham quan' }, { value: 'transport', label: 'Vận chuyển' }].map(cat => (
                        <Pressable key={cat.value} onPress={() => setCategory(cat.value)} className="px-3 py-1.5 rounded-full border" style={{ backgroundColor: category === cat.value ? BRAND_COLORS.primary : 'transparent', borderColor: category === cat.value ? BRAND_COLORS.primary : BRAND_COLORS.textMuted + '40' }}>
                          <Text className="text-xs font-bold" style={{ color: category === cat.value ? 'white' : BRAND_COLORS.textSoft }}>{cat.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Thành phố *</Text>
                    <View className="flex-row flex-wrap gap-2 mt-1">
                      {VIETNAMESE_CITIES.map(c => (
                        <Pressable key={c} onPress={() => setCity(c)} className="px-3 py-1.5 rounded-full border" style={{ backgroundColor: city === c ? BRAND_COLORS.primary : 'transparent', borderColor: city === c ? BRAND_COLORS.primary : BRAND_COLORS.textMuted + '40' }}>
                          <Text className="text-xs font-bold" style={{ color: city === c ? 'white' : BRAND_COLORS.textSoft }}>{c}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Quận/Huyện</Text>
                    <TextInput value={district} onChangeText={setDistrict} placeholder="Ví dụ: Quận 1" className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text" placeholderTextColor={BRAND_COLORS.textMuted} />
                  </View>
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Địa chỉ chi tiết *</Text>
                    <TextInput value={address} onChangeText={setAddress} placeholder="Số nhà, tên đường..." className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text" placeholderTextColor={BRAND_COLORS.textMuted} />
                  </View>
                  <View className="flex-row gap-4 mb-1">
                    <View className="flex-1 gap-1">
                      <Text className="text-xs font-bold text-brand-textSoft">Vĩ độ (Lat) *</Text>
                      <TextInput value={lat} onChangeText={setLat} placeholder="10.7769" keyboardType="numeric" className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text" placeholderTextColor={BRAND_COLORS.textMuted} />
                    </View>
                    <View className="flex-1 gap-1">
                      <Text className="text-xs font-bold text-brand-textSoft">Kinh độ (Lng) *</Text>
                      <TextInput value={lng} onChangeText={setLng} placeholder="106.7009" keyboardType="numeric" className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text" placeholderTextColor={BRAND_COLORS.textMuted} />
                    </View>
                  </View>
                </View>
              )}

              {formSubTab === 'contact' && (
                <View className="gap-3">
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Số điện thoại liên hệ</Text>
                    <TextInput value={contactPhone} onChangeText={setContactPhone} placeholder="Ví dụ: 0901234567" keyboardType="phone-pad" className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text" placeholderTextColor={BRAND_COLORS.textMuted} />
                  </View>
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Email liên hệ</Text>
                    <TextInput value={contactEmail} onChangeText={setContactEmail} placeholder="Ví dụ: contact@hotel.com" keyboardType="email-address" className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text" placeholderTextColor={BRAND_COLORS.textMuted} />
                  </View>
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Trang web đối tác</Text>
                    <TextInput value={websiteUrl} onChangeText={setWebsiteUrl} placeholder="Ví dụ: https://continentalhotel.com.vn" className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text" placeholderTextColor={BRAND_COLORS.textMuted} />
                  </View>
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Link đặt phòng / đặt chỗ (Booking URL)</Text>
                    <TextInput value={bookingUrl} onChangeText={setBookingUrl} placeholder="Ví dụ: https://booking.com/hotel/vn/continental..." className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text" placeholderTextColor={BRAND_COLORS.textMuted} />
                  </View>
                </View>
              )}

              {formSubTab === 'config' && (
                <View className="gap-3">
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Phân khúc giá</Text>
                    <View className="flex-row gap-2 mt-1">
                      {[1, 2, 3, 4].map(level => {
                        const labels = ['Bình dân ($)', 'Trung cấp ($$)', 'Cao cấp ($$$)', 'Sang trọng ($$$$)'];
                        return (
                          <Pressable key={level} onPress={() => setPriceLevel(level)} className="px-3 py-1.5 rounded-full border flex-1 items-center" style={{ backgroundColor: priceLevel === level ? BRAND_COLORS.primary : 'transparent', borderColor: priceLevel === level ? BRAND_COLORS.primary : BRAND_COLORS.textMuted + '40' }}>
                            <Text className="text-[10px] font-bold" style={{ color: priceLevel === level ? 'white' : BRAND_COLORS.textSoft }}>{labels[level - 1]}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Điểm đánh giá hệ thống</Text>
                    <View className="flex-row gap-2 mt-1">
                      {[1, 2, 3, 4, 5].map(rating => (
                        <Pressable key={rating} onPress={() => setAdminRating(rating)} className="p-2 rounded-xl border flex-row items-center justify-center gap-1 flex-1" style={{ backgroundColor: adminRating === rating ? BRAND_COLORS.gold + '20' : 'transparent', borderColor: adminRating === rating ? BRAND_COLORS.gold : BRAND_COLORS.textMuted + '40' }}>
                          <Star size={12} color={BRAND_COLORS.gold} fill={adminRating === rating ? BRAND_COLORS.gold : 'transparent'} />
                          <Text className="text-xs font-bold" style={{ color: BRAND_COLORS.textSoft }}>{rating} Sao</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Độ ưu tiên (0-10) *</Text>
                    <TextInput value={partnerPriority} onChangeText={setPartnerPriority} placeholder="Ví dụ: 5" keyboardType="numeric" className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text" placeholderTextColor={BRAND_COLORS.textMuted} />
                  </View>

                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Tags Ẩm thực (cho nhà hàng/cafe, cách nhau bởi dấu phẩy)</Text>
                    <TextInput value={cuisineTags} onChangeText={setCuisineTags} placeholder="vietnamese, seafood, buffet, street_food" className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text" placeholderTextColor={BRAND_COLORS.textMuted} />
                  </View>
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Tags Tiện ích (cho khách sạn/resort, cách nhau bởi dấu phẩy)</Text>
                    <TextInput value={amenityTags} onChangeText={setAmenityTags} placeholder="pool, spa, gym, parking, free_wifi, breakfast" className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text" placeholderTextColor={BRAND_COLORS.textMuted} />
                  </View>
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Chế độ ăn uống an toàn (cách nhau bởi dấu phẩy)</Text>
                    <TextInput value={dietarySafe} onChangeText={setDietarySafe} placeholder="vegetarian, vegan, halal, gluten_free" className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text" placeholderTextColor={BRAND_COLORS.textMuted} />
                  </View>
                </View>
              )}

              {formSubTab === 'media' && (
                <View className="gap-3">
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Mô tả ngắn về đối tác</Text>
                    <TextInput value={description} onChangeText={setDescription} placeholder="Mô tả tóm tắt dịch vụ, điểm nổi bật..." multiline numberOfLines={3} className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text" placeholderTextColor={BRAND_COLORS.textMuted} style={{ minHeight: 60, textAlignVertical: 'top' }} />
                  </View>

                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">URLs Hình ảnh (Phân cách bởi dấu phẩy)</Text>
                    <TextInput value={imageUrls} onChangeText={setImageUrls} placeholder="https://image1.jpg, https://image2.jpg" multiline className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text" placeholderTextColor={BRAND_COLORS.textMuted} style={{ minHeight: 45 }} />
                  </View>

                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Ghi chú quản lý nội bộ</Text>
                    <TextInput value={adminNotes} onChangeText={setAdminNotes} placeholder="Thông tin liên hệ phụ, lưu ý riêng..." multiline numberOfLines={2} className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text" placeholderTextColor={BRAND_COLORS.textMuted} style={{ minHeight: 45, textAlignVertical: 'top' }} />
                  </View>
                </View>
              )}
            </ScrollView>

            <View className="flex-row justify-between items-center border-t border-brand-line/40 pt-4 mt-2 shrink-0">
              <View className="flex-row gap-2">
                {formSubTab !== 'basic' && (
                  <Pressable onPress={() => { const tabs = ['basic', 'contact', 'config', 'media'] as const; setFormSubTab(tabs[tabs.indexOf(formSubTab) - 1]); }} className="px-4 py-2.5 rounded-xl border border-brand-line/60 bg-brand-bgAlt/50">
                    <Text className="text-xs font-bold text-brand-textSoft">Quay lại</Text>
                  </Pressable>
                )}
                {formSubTab !== 'media' && (
                  <Pressable onPress={() => { const tabs = ['basic', 'contact', 'config', 'media'] as const; setFormSubTab(tabs[tabs.indexOf(formSubTab) + 1]); }} className="px-4 py-2.5 rounded-xl bg-brand-primary">
                    <Text className="text-xs font-bold text-white">Tiếp tục</Text>
                  </Pressable>
                )}
              </View>
              <View className="flex-row gap-2">
                <Pressable onPress={() => setPartnerModalVisible(false)} className="px-4 py-2.5 rounded-xl border border-brand-line/60 bg-brand-bgAlt/50">
                  <Text className="text-xs font-bold text-brand-textSoft">Hủy</Text>
                </Pressable>
                <Pressable onPress={handleSavePartner} disabled={savePartner.isPending} className="px-4 py-2.5 rounded-xl bg-brand-primary" style={savePartner.isPending ? { opacity: 0.5 } : undefined}>
                  <Text className="text-xs font-bold text-white">{savePartner.isPending ? 'Đang lưu...' : 'Lưu lại'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Confirmation Modal */}
      {confirmModal && confirmModal.visible && (
        <View className="absolute inset-0 z-50 items-center justify-center bg-black/60 px-4">
          <View className="bg-brand-bg border border-brand-line/60 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <View className="flex-row items-center gap-2 mb-3">
              <AlertTriangle size={22} color={confirmModal.isDestructive ? BRAND_COLORS.danger : BRAND_COLORS.accent} />
              <Text className="text-lg font-display font-extrabold text-brand-text">{confirmModal.title}</Text>
            </View>
            <Text className="text-xs text-brand-textSoft leading-relaxed mb-6">{confirmModal.message}</Text>
            <View className="flex-row justify-end gap-3">
              <Pressable onPress={() => setConfirmModal(null)} className="px-4 py-2.5 rounded-xl border border-brand-line/60 bg-brand-bgAlt/50">
                <Text className="text-xs font-bold text-brand-textSoft">{confirmModal.cancelText}</Text>
              </Pressable>
              <Pressable onPress={confirmModal.onConfirm} className="px-4 py-2.5 rounded-xl" style={{ backgroundColor: confirmModal.isDestructive ? BRAND_COLORS.danger : BRAND_COLORS.primary }}>
                <Text className="text-xs font-bold text-white">{confirmModal.confirmText}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
