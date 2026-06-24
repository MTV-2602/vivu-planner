import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Compass, Users, Map, Trash2, Shield, BarChart3, AlertTriangle,
  Key, Check, X, Eye, LogOut, MapPin, Calendar, Wallet,
  Mail, RefreshCw, ChevronRight, Plus, Star, Sparkles,
} from 'lucide-react-native';
import { supabase } from '../../lib/supabaseClient';
import { apiClient } from '../../lib/apiClient';
import { cancelTripReminder } from '../../lib/notifications';
import { clearCache } from '../../lib/cache';
import Reveal from '../../components/Reveal';
import { BRAND_COLORS, VIETNAMESE_CITIES } from '../../constants';

const canUseLocalStorage = Platform.OS === 'web' && typeof localStorage !== 'undefined';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AdminStats { totalUsers: number; totalTrips: number; totalDisruptions: number; totalApiKeys: number; totalPartners: number; }
interface UserRecord { id: string; email: string; full_name: string; created_at: string; banned_until?: string | null; }
interface TripRecord { id: string; title: string; destination_city: string; start_date: string; end_date: string; budget_total: number; status: string; user_email: string; created_at: string; }
interface ApiKeyRecord { id: string; key_value: string; is_active: boolean; status: string; last_used_at: string | null; created_at: string; }
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

const ADMIN_EMAILS = ['team89a6@gmail.com', 'vinhvip4508@gmail.com', 'mockuser@vivu.vn'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(s: string) {
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
function maskKey(v: string) {
  if (v.length <= 15) return v;
  return `${v.substring(0,8)}...${v.substring(v.length-5)}`;
}

// ─── Row helpers ──────────────────────────────────────────────────────────────
function TableHeader({ cols }: { cols: string[] }) {
  return (
    <View className="flex-row px-4 py-3 border-b border-brand-line/40 bg-brand-bgAlt/60">
      {cols.map((c, i) => (
        <Text key={i} className="flex-1 text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider">{c}</Text>
      ))}
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Admin() {
  const router = useRouter();
  const qc = useQueryClient();
  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [activeTab, setActiveTab] = useState<'users'|'trips'|'keys'|'partners'>('users');
  const [bulkKeys, setBulkKeys] = useState('');
  const [visibleKeys, setVisibleKeys] = useState<Record<string,boolean>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // ─── Partner Form States ───────────────────────────────────────────────────
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

  // Google Places search autofill states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };

  const showConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    options?: { confirmText?: string; cancelText?: string; isDestructive?: boolean }
  ) => {
    setConfirmModal({
      visible: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(null);
      },
      confirmText: options?.confirmText || 'Xác nhận',
      cancelText: options?.cancelText || 'Hủy',
      isDestructive: options?.isDestructive ?? false,
    });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    const checkAdmin = async () => {
      const hasAdminToken = canUseLocalStorage && !!localStorage.getItem('vivu_admin_token');
      if (hasAdminToken) {
        setIsAdmin(true);
        setChecking(false);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const email = session?.user?.email;
        const allAdminEmails = [
          ...ADMIN_EMAILS,
          process.env.EXPO_PUBLIC_ADMIN_EMAIL
        ].filter(Boolean).map(e => e!.toLowerCase().trim());

        const isUserAdmin = email && allAdminEmails.includes(email.toLowerCase().trim());

        if (isUserAdmin) {
          setIsAdmin(true);
          setChecking(false);
        } else {
          if (Platform.OS === 'web') {
            window.alert('Từ chối truy cập: Bạn không có quyền truy cập trang quản trị!');
            router.replace('/chuyen-di');
          } else {
            Alert.alert('Từ chối truy cập', 'Bạn không có quyền truy cập trang quản trị!', [
              { text: 'OK', onPress: () => router.replace('/chuyen-di') },
            ]);
          }
          setChecking(false);
        }
      } catch (err) {
        if (Platform.OS === 'web') {
          window.alert('Từ chối truy cập: Bạn không có quyền truy cập trang quản trị!');
          router.replace('/chuyen-di');
        } else {
          Alert.alert('Từ chối truy cập', 'Bạn không có quyền truy cập trang quản trị!', [
            { text: 'OK', onPress: () => router.replace('/chuyen-di') },
          ]);
        }
        setChecking(false);
      }
    };

    checkAdmin();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    if (canUseLocalStorage) {
      localStorage.removeItem('vivu_admin_token');
      localStorage.removeItem('vivu_mock_user');
      localStorage.removeItem('vivu_mock_token');
    }
    router.replace('/(auth)/dang-nhap');
  };

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: stats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ['adminStats'],
    queryFn: async () => (await apiClient.get('/admin/stats')).data,
    enabled: isAdmin,
  });
  const { data: users, isLoading: usersLoading } = useQuery<UserRecord[]>({
    queryKey: ['adminUsers'],
    queryFn: async () => (await apiClient.get('/admin/users')).data,
    enabled: isAdmin,
  });
  const { data: trips, isLoading: tripsLoading } = useQuery<TripRecord[]>({
    queryKey: ['adminTrips'],
    queryFn: async () => (await apiClient.get('/admin/trips')).data,
    enabled: isAdmin,
  });
  const { data: apiKeys, isLoading: keysLoading } = useQuery<ApiKeyRecord[]>({
    queryKey: ['adminKeys'],
    queryFn: async () => (await apiClient.get('/admin/keys')).data,
    enabled: isAdmin,
  });
  const { data: partners, isLoading: partnersLoading } = useQuery<PartnerRecord[]>({
    queryKey: ['adminPartners'],
    queryFn: async () => (await apiClient.get('/admin/partners')).data,
    enabled: isAdmin,
  });
  const { data: partnerStats, isLoading: partnerStatsLoading } = useQuery<{ totalImpressions: number; totalClicks: number; totalBookings: number; averageCtr: number }>({
    queryKey: ['adminPartnerStats'],
    queryFn: async () => (await apiClient.get('/admin/partners/analytics/summary')).data,
    enabled: isAdmin && activeTab === 'partners',
  });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const deleteUser = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin/users/${id}`),
    onSuccess: (res) => { 
      const tripIds = res.data?.deletedTripIds || [];
      tripIds.forEach((tripId: string) => {
        cancelTripReminder(tripId);
        clearCache(`trip_${tripId}`);
      });
      qc.invalidateQueries({ queryKey: ['adminUsers'] }); 
      qc.invalidateQueries({ queryKey: ['adminStats'] }); 
      showToast('Đã xóa người dùng và toàn bộ dữ liệu liên quan thành công!', 'success'); 
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });
  const toggleBan = useMutation({
    mutationFn: (id: string) => apiClient.put(`/admin/users/${id}/toggle-ban`),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['adminUsers'] }); 
      showToast('Đã thay đổi trạng thái người dùng!', 'success'); 
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });
  const deleteTrip = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin/trips/${id}`),
    onSuccess: (_, tripId) => {
      cancelTripReminder(tripId);
      clearCache(`trip_${tripId}`);
      qc.invalidateQueries({ queryKey: ['adminTrips'] });
      qc.invalidateQueries({ queryKey: ['adminStats'] });
      showToast('Đã xóa chuyến đi và toàn bộ lịch trình liên quan!', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });
  const addKeys = useMutation({
    mutationFn: (keyValues: string[]) => apiClient.post('/admin/keys', { key_values: keyValues }),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['adminKeys'] }); 
      qc.invalidateQueries({ queryKey: ['adminStats'] }); 
      setBulkKeys(''); 
      showToast('Đã thêm danh sách API Key thành công!', 'success'); 
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });
  const updateKey = useMutation({
    mutationFn: ({ id, is_active, status }: { id: string; is_active: boolean; status: string }) => apiClient.put(`/admin/keys/${id}`, { is_active, status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminKeys'] });
      showToast('Đã thay đổi cấu hình API Key!', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });
  const deleteKey = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin/keys/${id}`),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['adminKeys'] }); 
      qc.invalidateQueries({ queryKey: ['adminStats'] }); 
      showToast('Đã xóa API Key thành công!', 'success'); 
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });
  const deletePartner = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/admin/partners/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminPartners'] });
      qc.invalidateQueries({ queryKey: ['adminStats'] });
      qc.invalidateQueries({ queryKey: ['adminPartnerStats'] });
      showToast('Đã xóa đối tác thành công!', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });
  const togglePartnerActive = useMutation({
    mutationFn: (id: string) => apiClient.put(`/admin/partners/${id}/toggle`),
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
        return apiClient.put(`/admin/partners/${id}`, data);
      } else {
        return apiClient.post('/admin/partners', data);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminPartners'] });
      qc.invalidateQueries({ queryKey: ['adminStats'] });
      setPartnerModalVisible(false);
      showToast(editingPartner ? 'Đã cập nhật thông tin đối tác!' : 'Đã thêm đối tác mới thành công!', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });

  // ── Confirm helpers ──────────────────────────────────────────────────────────
  const confirmDeleteUser = (id: string, email: string) => {
    showConfirm(
      'Xác nhận xóa tài khoản',
      `Bạn có chắc chắn muốn xóa tài khoản ${email}? Toàn bộ thông tin cá nhân, hành trình chuyến đi và các dữ liệu liên quan khác của người dùng này sẽ bị XÓA SẠCH HOÀN TOÀN khỏi cơ sở dữ liệu!`,
      () => deleteUser.mutate(id),
      { confirmText: 'Xóa sạch', cancelText: 'Hủy', isDestructive: true }
    );
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
      setName('');
      setCategory('hotel');
      setAddress('');
      setLat('');
      setLng('');
      setCity('Hà Nội');
      setDistrict('');
      setContactPhone('');
      setContactEmail('');
      setWebsiteUrl('');
      setBookingUrl('');
      setDescription('');
      setImageUrls('');
      setPriceLevel(2);
      setCuisineTags('');
      setAmenityTags('');
      setDietarySafe('');
      setAdminRating(3);
      setAdminNotes('');
      setPartnerPriority('0');
    }
    setPartnerModalVisible(true);
  };
  const parseTags = (str: string) => {
    return str.split(',').map(t => t.trim()).filter(Boolean);
  };
  const handleSavePartner = () => {
    if (!name.trim()) return showToast('Vui lòng nhập tên đối tác', 'error');
    if (!address.trim()) return showToast('Vui lòng nhập địa chỉ đối tác', 'error');
    if (!lat.trim() || isNaN(Number(lat))) return showToast('Vui lòng nhập vĩ độ (lat) hợp lệ', 'error');
    if (!lng.trim() || isNaN(Number(lng))) return showToast('Vui lòng nhập kinh độ (lng) hợp lệ', 'error');
    if (!city) return showToast('Vui lòng chọn thành phố', 'error');
    
    const numLat = parseFloat(lat);
    const numLng = parseFloat(lng);
    const priorityVal = parseInt(partnerPriority) || 0;
    
    if (numLat < -90 || numLat > 90) return showToast('Vĩ độ phải nằm trong khoảng -90 đến 90', 'error');
    if (numLng < -180 || numLng > 180) return showToast('Kinh độ phải nằm trong khoảng -180 đến 180', 'error');
    if (priorityVal < 0 || priorityVal > 10) return showToast('Độ ưu tiên phải nằm trong khoảng từ 0 đến 10', 'error');

    const data = {
      name: name.trim(),
      category,
      address: address.trim(),
      lat: numLat,
      lng: numLng,
      city,
      district: district.trim() || null,
      contact_phone: contactPhone.trim() || null,
      contact_email: contactEmail.trim() || null,
      website_url: websiteUrl.trim() || null,
      booking_url: bookingUrl.trim() || null,
      description: description.trim() || null,
      image_urls: parseTags(imageUrls),
      price_level: priceLevel,
      cuisine_tags: parseTags(cuisineTags),
      amenity_tags: parseTags(amenityTags),
      dietary_safe: parseTags(dietarySafe),
      admin_rating: adminRating,
      admin_notes: adminNotes.trim() || null,
      partner_priority: priorityVal,
    };

    savePartner.mutate({
      id: editingPartner?.id,
      data
    });
  };

  const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
    'Hà Nội': { lat: 21.0285, lng: 105.8542 },
    'Đà Nẵng': { lat: 16.0544, lng: 108.2022 },
    'TP. Hồ Chí Minh': { lat: 10.8231, lng: 106.6297 },
    'Hội An': { lat: 15.8801, lng: 108.3380 },
    'Huế': { lat: 16.4637, lng: 107.5908 },
    'Nha Trang': { lat: 12.2388, lng: 109.1967 },
    'Đà Lạt': { lat: 11.9404, lng: 108.4583 },
    'Phú Quốc': { lat: 10.2899, lng: 103.9840 },
    'Sa Pa': { lat: 22.3364, lng: 103.8438 },
    'Ninh Bình': { lat: 20.2506, lng: 105.9745 },
    'Vũng Tàu': { lat: 10.3460, lng: 107.0843 }
  };

  const mapFormCategoryToPlacesCategory = (formCat: string): 'accommodation' | 'dining' | 'attraction' | 'rental' => {
    if (formCat === 'hotel' || formCat === 'homestay' || formCat === 'resort') return 'accommodation';
    if (formCat === 'restaurant' || formCat === 'cafe') return 'dining';
    if (formCat === 'attraction') return 'attraction';
    return 'rental';
  };

  const handlePlacesSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchingPlaces(true);
    setSearchResults([]);
    try {
      const coords = CITY_COORDS[city] || { lat: 16.0544, lng: 108.2022 };
      const placeCategory = mapFormCategoryToPlacesCategory(category);
      
      const response = await apiClient.get('/places/search', {
        params: {
          query: searchQuery.trim(),
          lat: coords.lat,
          lng: coords.lng,
          category: placeCategory
        }
      });
      
      setSearchResults(response.data || []);
      if (response.data?.length === 0) {
        showToast('Không tìm thấy địa điểm nào khớp từ Google.', 'info');
      }
    } catch (e: any) {
      console.error(e);
      showToast('Lỗi tìm kiếm địa điểm: ' + (e.response?.data?.error || e.message), 'error');
    } finally {
      setSearchingPlaces(false);
    }
  };

  const handleSelectPlace = (place: any) => {
    setName(place.name || '');
    setAddress(place.address || '');
    setLat(String(place.lat || ''));
    setLng(String(place.lng || ''));
    if (place.price_level) {
      setPriceLevel(place.price_level);
    }
    if (place.rating) {
      setAdminRating(Math.min(5, Math.max(1, Math.round(place.rating))));
    }
    setSearchResults([]);
    setSearchQuery('');
    showToast('Đã tự động điền thông tin từ Google Places!', 'success');
  };

  const confirmDeleteTrip = (id: string, title: string) => {
    showConfirm(
      'Xác nhận xóa chuyến đi',
      `Bạn có chắc chắn muốn xóa chuyến đi "${title}"? Toàn bộ các ngày lịch trình, hoạt động chi tiết, dữ liệu chi tiêu và sự cố liên quan sẽ bị XÓA SẠCH khỏi hệ thống!`,
      () => deleteTrip.mutate(id),
      { confirmText: 'Xóa sạch', cancelText: 'Hủy', isDestructive: true }
    );
  };
  const confirmDeleteKey = (id: string, value: string) => {
    const masked = maskKey(value);
    showConfirm(
      'Xác nhận xóa API Key',
      `Bạn có chắc chắn muốn xóa API Key ${masked} khỏi bể khóa xoay vòng không? Hành động này không thể hoàn tác!`,
      () => deleteKey.mutate(id),
      { confirmText: 'Xóa', cancelText: 'Hủy', isDestructive: true }
    );
  };
  const confirmToggleBan = (id: string, email: string, isBanned: boolean) => {
    const title = isBanned ? 'Xác nhận mở khóa tài khoản' : 'Xác nhận khóa tài khoản';
    const message = isBanned 
      ? `Bạn có chắc chắn muốn mở khóa cho tài khoản ${email}? Người dùng sẽ lấy lại quyền đăng nhập và tạo chuyến đi.` 
      : `Bạn có chắc chắn muốn khóa tài khoản ${email}? Người dùng này sẽ lập tức bị đăng xuất và không thể truy cập hệ thống.`;
    showConfirm(
      title,
      message,
      () => toggleBan.mutate(id),
      { confirmText: isBanned ? 'Mở khóa' : 'Khóa tài khoản', cancelText: 'Hủy', isDestructive: !isBanned }
    );
  };
  const confirmToggleRotation = (id: string, value: string, isActive: boolean, status: string) => {
    const masked = maskKey(value);
    const title = isActive ? 'Tắt xoay vòng Key' : 'Bật xoay vòng Key';
    const message = isActive 
      ? `Bạn có chắc chắn muốn tắt tính năng xoay vòng đối với key ${masked}?` 
      : `Bạn có chắc chắn muốn bật tính năng xoay vòng đối với key ${masked}?`;
    showConfirm(
      title,
      message,
      () => updateKey.mutate({ id, is_active: !isActive, status }),
      { confirmText: isActive ? 'Tắt xoay' : 'Bật xoay', cancelText: 'Hủy' }
    );
  };
  const confirmResetKey = (id: string, value: string) => {
    const masked = maskKey(value);
    showConfirm(
      'Đặt lại trạng thái Key',
      `Bạn có chắc chắn muốn khôi phục trạng thái hoạt động bình thường cho key ${masked}?`,
      () => updateKey.mutate({ id, is_active: true, status: 'active' }),
      { confirmText: 'Đặt lại', cancelText: 'Hủy' }
    );
  };
  const handleAddBulkKeys = () => {
    if (!bulkKeys.trim()) return;
    const parsed = bulkKeys.split('\n').map(k => k.trim()).filter(k => k.length > 10 && (k.startsWith('AIzaSy') || k.startsWith('AQ') || k.startsWith('AO')));
    if (parsed.length === 0) { 
      showToast('Không tìm thấy API Key hợp lệ (bắt đầu bằng AIzaSy, AQ hoặc AO).', 'error'); 
      return; 
    }
    addKeys.mutate(parsed);
  };

  // ── Auth check ────────────────────────────────────────────────────────────────
  if (checking) {
    return (
      <View className="flex-1 bg-brand-bg items-center justify-center gap-3">
        <ActivityIndicator size="large" color={BRAND_COLORS.primary} />
        <Text className="text-sm font-semibold text-brand-textSoft">Đang kiểm tra quyền quản trị viên...</Text>
      </View>
    );
  }
  if (!isAdmin) return null;

  const STAT_CARDS = [
    { icon: <Users size={22} color={BRAND_COLORS.primary} />, bg: `${BRAND_COLORS.primary}1A`, label: 'Người dùng', value: stats?.totalUsers },
    { icon: <Map size={22} color={BRAND_COLORS.accent} />, bg: `${BRAND_COLORS.accent}1A`, label: 'Chuyến đi', value: stats?.totalTrips },
    { icon: <AlertTriangle size={22} color={BRAND_COLORS.danger} />, bg: `${BRAND_COLORS.danger}1A`, label: 'Sự cố AI', value: stats?.totalDisruptions },
    { icon: <Key size={22} color={BRAND_COLORS.gold} />, bg: `${BRAND_COLORS.gold}1A`, label: 'Bể API Keys', value: stats?.totalApiKeys },
    { icon: <Compass size={22} color={BRAND_COLORS.primaryStrong} />, bg: `${BRAND_COLORS.primaryStrong}1A`, label: 'Đối tác', value: stats?.totalPartners },
  ];

  return (
    <View className="flex-1 bg-brand-bg">
      {/* Toast Notification */}
      {toast && (
        <View className="absolute top-4 left-4 right-4 z-50 items-center pointer-events-none">
          <View 
            className="flex-row items-center gap-2 px-4 py-3 rounded-xl shadow-lg border border-brand-line/40 max-w-md w-full"
            style={{ 
              backgroundColor: toast.type === 'success' ? '#EBF8F4' : toast.type === 'error' ? '#FDE8E8' : '#FFF3ED',
              borderColor: toast.type === 'success' ? '#CBECE1' : toast.type === 'error' ? '#FBD5D5' : '#FFE4D6',
              shadowColor: '#000', 
              shadowOffset: { width: 0, height: 4 }, 
              shadowOpacity: 0.1, 
              shadowRadius: 10,
              elevation: 5
            }}
          >
            {toast.type === 'success' ? (
              <Check size={16} color={BRAND_COLORS.primary} />
            ) : toast.type === 'error' ? (
              <X size={16} color={BRAND_COLORS.danger} />
            ) : (
              <AlertTriangle size={16} color={BRAND_COLORS.accent} />
            )}
            <Text 
              className="text-xs font-bold flex-1" 
              style={{ color: toast.type === 'success' ? BRAND_COLORS.primaryStrong : toast.type === 'error' ? BRAND_COLORS.danger : BRAND_COLORS.accentStrong }}
            >
              {toast.message}
            </Text>
          </View>
        </View>
      )}

      {/* Navbar */}
      <View className="bg-brand-bg border-b border-brand-line/40 px-6 py-4 flex-row justify-between items-center">
        <View className="flex-row items-center gap-2">
          <Compass size={26} color={BRAND_COLORS.primary} />
          <Text className="font-display font-bold text-xl text-brand-primary">ViVu Planner</Text>
        </View>
        <View className="flex-row items-center gap-3">
          <View className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border" style={{ backgroundColor: `${BRAND_COLORS.accent}1A`, borderColor: `${BRAND_COLORS.accent}4D` }}>
            <Shield size={12} color={BRAND_COLORS.accent} />
            <Text className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: BRAND_COLORS.accent }}>Quản Trị</Text>
          </View>
          <Pressable onPress={handleLogout} className="flex-row items-center gap-1 px-3 py-2 rounded-lg" style={{ backgroundColor: `${BRAND_COLORS.danger}1A` }}>
            <LogOut size={13} color={BRAND_COLORS.danger} />
            <Text className="text-xs font-bold" style={{ color: BRAND_COLORS.danger }}>Đăng xuất</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 24 }}>
        {/* Page title */}
        <View className="gap-1">
          <View className="flex-row items-center gap-2.5">
            <Shield size={28} color={BRAND_COLORS.primary} />
            <Text className="font-display font-extrabold text-3xl text-brand-text">Quản Trị Hệ Thống</Text>
          </View>
          <Text className="text-sm text-brand-textSoft">Giám sát người dùng, chuyến đi và xoay vòng API Key</Text>
        </View>

        {/* Stats Grid */}
        <Reveal>
          <View className="flex-row flex-wrap gap-4">
            {STAT_CARDS.map((s, i) => (
              <View key={i} className="p-5 rounded-2xl border border-brand-line/40 flex-row items-center gap-4 bg-brand-bgAlt/50" style={{ minWidth: 140, flex: 1 }}>
                <View className="w-12 h-12 rounded-xl items-center justify-center shrink-0" style={{ backgroundColor: s.bg }}>
                  {s.icon}
                </View>
                <View>
                  <Text className="text-[10px] font-bold text-brand-textSoft uppercase tracking-wider">{s.label}</Text>
                  <Text className="font-display font-bold text-2xl text-brand-text mt-0.5">
                    {statsLoading ? '...' : (s.value ?? 0)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Reveal>

        {/* Tabs */}
        <View className="flex-row border-b border-brand-line/40 gap-0">
          {(['users','trips','keys','partners'] as const).map(tab => {
            const labels = { users: 'Người dùng', trips: 'Chuyến đi', keys: 'Gemini Keys', partners: 'Đối tác' };
            const active = activeTab === tab;
            return (
              <Pressable key={tab} onPress={() => setActiveTab(tab)} className="px-5 py-3 border-b-2" style={{ borderBottomColor: active ? BRAND_COLORS.primary : 'transparent' }}>
                <Text className={`font-bold text-sm ${active ? 'text-brand-primary' : 'text-brand-textSoft'}`}>{labels[tab]}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── USERS TAB ───────────────────────────────────────────────────── */}
        {activeTab === 'users' && (
          <View className="rounded-2xl border border-brand-line/40 overflow-hidden bg-brand-bgAlt/30">
            <TableHeader cols={['Tên / Email', 'Ngày đăng ký', 'Trạng thái', '']} />
            {usersLoading ? (
              <View className="py-12 items-center gap-2">
                <ActivityIndicator color={BRAND_COLORS.primary} />
                <Text className="text-xs text-brand-textSoft">Đang tải danh sách thành viên...</Text>
              </View>
            ) : !users?.length ? (
              <Text className="text-center py-12 text-brand-textSoft text-sm">Chưa có người dùng nào.</Text>
            ) : users.map(u => (
              <View key={u.id} className="flex-row items-center px-4 py-4 border-b border-brand-line/20 gap-2">
                {/* Name + email */}
                <View className="flex-1 gap-0.5">
                  <Text className="font-bold text-sm text-brand-text" numberOfLines={1}>{u.full_name || 'Khách Vô Danh'}</Text>
                  <View className="flex-row items-center gap-1">
                    <Mail size={11} color={BRAND_COLORS.textSoft} />
                    <Text className="text-[11px] text-brand-textSoft" numberOfLines={1}>{u.email}</Text>
                  </View>
                </View>
                {/* Date */}
                <Text className="text-xs text-brand-textSoft w-20 text-center">{formatDate(u.created_at)}</Text>
                {/* Status toggle */}
                <View className="w-24 items-center">
                  {u.email === 'mockuser@vivu.vn' || ADMIN_EMAILS.includes(u.email) ? (
                    <View className="px-2 py-0.5 rounded" style={{ backgroundColor: `${BRAND_COLORS.accent}1A` }}>
                      <Text className="text-[10px] font-bold uppercase" style={{ color: BRAND_COLORS.accent }}>Hệ thống</Text>
                    </View>
                  ) : (
                    <Pressable onPress={() => confirmToggleBan(u.id, u.email, !!u.banned_until)} className="flex-row items-center gap-1">
                      <View className="w-9 h-5 rounded-full items-center justify-center" style={{ backgroundColor: u.banned_until ? `${BRAND_COLORS.danger}20` : `${BRAND_COLORS.primary}20` }}>
                        <View className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: u.banned_until ? BRAND_COLORS.danger : BRAND_COLORS.primary, marginLeft: u.banned_until ? -6 : 6 }} />
                      </View>
                      <Text className="text-[10px] font-bold" style={{ color: u.banned_until ? BRAND_COLORS.danger : BRAND_COLORS.primary }}>
                        {u.banned_until ? 'Bị khóa' : 'Hoạt động'}
                      </Text>
                    </Pressable>
                  )}
                </View>
                {/* Delete */}
                <Pressable
                  onPress={() => confirmDeleteUser(u.id, u.email)}
                  disabled={u.email === 'mockuser@vivu.vn'}
                  className="p-2 rounded-lg"
                  style={{ backgroundColor: `${BRAND_COLORS.danger}1A`, opacity: u.email === 'mockuser@vivu.vn' ? 0.3 : 1 }}
                >
                  <Trash2 size={15} color={BRAND_COLORS.danger} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* ── TRIPS TAB ───────────────────────────────────────────────────── */}
        {activeTab === 'trips' && (
          <View className="rounded-2xl border border-brand-line/40 overflow-hidden bg-brand-bgAlt/30">
            <TableHeader cols={['Chuyến đi', 'Chủ sở hữu', 'Ngân sách', 'Trạng thái', '']} />
            {tripsLoading ? (
              <View className="py-12 items-center gap-2">
                <ActivityIndicator color={BRAND_COLORS.primary} />
                <Text className="text-xs text-brand-textSoft">Đang tải danh sách chuyến đi...</Text>
              </View>
            ) : !trips?.length ? (
              <Text className="text-center py-12 text-brand-textSoft text-sm">Chưa có chuyến đi nào.</Text>
            ) : trips.map(t => {
              const statusMeta = t.status === 'completed'
                ? { label: 'Hoàn thành', bg: `${BRAND_COLORS.textSoft}20`, color: BRAND_COLORS.textSoft }
                : t.status === 'active'
                ? { label: 'Hoạt động', bg: `${BRAND_COLORS.primary}1A`, color: BRAND_COLORS.primary }
                : { label: 'Bản nháp', bg: `${BRAND_COLORS.gold}20`, color: BRAND_COLORS.primaryStrong };
              return (
                <View key={t.id} className="px-4 py-4 border-b border-brand-line/20 gap-2">
                  {/* Row 1: Title + actions */}
                  <View className="flex-row justify-between items-start gap-2">
                    <View className="flex-1 gap-1">
                      <Text className="font-bold text-sm text-brand-text" numberOfLines={1}>{t.title}</Text>
                      <View className="flex-row flex-wrap gap-3">
                        <View className="flex-row items-center gap-1">
                          <MapPin size={11} color={BRAND_COLORS.primary} />
                          <Text className="text-[11px] text-brand-textSoft">{t.destination_city}</Text>
                        </View>
                        <View className="flex-row items-center gap-1">
                          <Calendar size={11} color={BRAND_COLORS.primary} />
                          <Text className="text-[11px] text-brand-textSoft">{formatDate(t.start_date)} - {formatDate(t.end_date)}</Text>
                        </View>
                        <View className="flex-row items-center gap-1">
                          <Wallet size={11} color={BRAND_COLORS.primary} />
                          <Text className="text-[11px] text-brand-textSoft">{new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND'}).format(t.budget_total)}</Text>
                        </View>
                      </View>
                    </View>
                    <View className="flex-row items-center gap-2">
                      <View className="px-2 py-0.5 rounded" style={{ backgroundColor: statusMeta.bg }}>
                        <Text className="text-[10px] font-bold uppercase" style={{ color: statusMeta.color }}>{statusMeta.label}</Text>
                      </View>
                      <Pressable onPress={() => router.push(`/chuyen-di/${t.id}` as any)} className="p-2 rounded-lg" style={{ backgroundColor: `${BRAND_COLORS.primary}1A` }}>
                        <ChevronRight size={14} color={BRAND_COLORS.primary} />
                      </Pressable>
                      <Pressable onPress={() => confirmDeleteTrip(t.id, t.title)} className="p-2 rounded-lg" style={{ backgroundColor: `${BRAND_COLORS.danger}1A` }}>
                        <Trash2 size={14} color={BRAND_COLORS.danger} />
                      </Pressable>
                    </View>
                  </View>
                  {/* Owner */}
                  <Text className="text-[11px] text-brand-textSoft">Chủ sở hữu: <Text className="font-semibold">{t.user_email}</Text></Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── KEYS TAB ────────────────────────────────────────────────────── */}
        {activeTab === 'keys' && (
          <View className="gap-8">
            {/* Add keys form */}
            <Reveal>
              <View className="p-5 rounded-2xl border border-brand-line/40 bg-brand-bgAlt/40 gap-4">
                <View className="gap-0.5">
                  <View className="flex-row items-center gap-2">
                    <Key size={15} color={BRAND_COLORS.primary} />
                    <Text className="font-bold text-base text-brand-text">Thêm nhanh Gemini API Keys</Text>
                  </View>
                  <Text className="text-xs text-brand-textSoft">Dán danh sách API Keys (mỗi key nằm trên một dòng riêng biệt)</Text>
                </View>
                <TextInput
                  value={bulkKeys}
                  onChangeText={setBulkKeys}
                  multiline
                  numberOfLines={4}
                  placeholder={'AIzaSyBHPaLXoSL8vXh0r0...\nAQ.Ab8RN6KCHEwv9Xa...\nAO.Ab8RN6IIWn40...'}
                  className="w-full px-4 py-3 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text font-mono"
                  placeholderTextColor={BRAND_COLORS.textMuted}
                  style={{ minHeight: 90, textAlignVertical: 'top' }}
                />
                <View className="items-end">
                  <Pressable
                    onPress={handleAddBulkKeys}
                    disabled={addKeys.isPending || !bulkKeys.trim()}
                    className="flex-row items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-primary"
                    style={(addKeys.isPending || !bulkKeys.trim()) ? { opacity: 0.5 } : undefined}
                  >
                    {addKeys.isPending ? <ActivityIndicator size="small" color="white" /> : <Key size={14} color="white" />}
                    <Text className="text-white text-xs font-bold">{addKeys.isPending ? 'Đang thêm...' : 'Thêm danh sách Keys'}</Text>
                  </Pressable>
                </View>
              </View>
            </Reveal>

            {/* Keys table */}
            <View className="gap-3">
              <View className="flex-row items-center gap-2">
                <BarChart3 size={15} color={BRAND_COLORS.primary} />
                <Text className="font-bold text-base text-brand-text">Danh sách Keys đang xoay vòng</Text>
              </View>
              <View className="rounded-2xl border border-brand-line/40 overflow-hidden bg-brand-bgAlt/30">
                <TableHeader cols={['API Key', 'Ngày thêm', 'Trạng thái', 'Xoay', '']} />
                {keysLoading ? (
                  <View className="py-12 items-center gap-2">
                    <ActivityIndicator color={BRAND_COLORS.primary} />
                    <Text className="text-xs text-brand-textSoft">Đang tải bể API Keys...</Text>
                  </View>
                ) : !apiKeys?.length ? (
                  <Text className="text-center py-10 text-brand-textSoft text-sm px-6">Chưa có API Key nào. Hãy thêm key ở trên!</Text>
                ) : apiKeys.map(k => {
                  const statusMeta = k.status === 'active'
                    ? { label: 'Hoạt động', icon: <Check size={10} color={BRAND_COLORS.primary} />, bg: `${BRAND_COLORS.primary}1A`, color: BRAND_COLORS.primary }
                    : k.status === 'rate_limited'
                    ? { label: 'Hạn chế', icon: <AlertTriangle size={10} color={BRAND_COLORS.gold} />, bg: `${BRAND_COLORS.gold}20`, color: BRAND_COLORS.gold }
                    : { label: 'Không hợp lệ', icon: <X size={10} color={BRAND_COLORS.danger} />, bg: `${BRAND_COLORS.danger}1A`, color: BRAND_COLORS.danger };
                  return (
                    <View key={k.id} className="flex-row items-center px-4 py-4 border-b border-brand-line/20 gap-2">
                      {/* Key value */}
                      <View className="flex-1 flex-row items-center gap-2">
                        <Text className="text-[11px] font-mono text-brand-textSoft flex-1" numberOfLines={1}>
                          {visibleKeys[k.id] ? k.key_value : maskKey(k.key_value)}
                        </Text>
                        <Pressable onPress={() => setVisibleKeys(p => ({ ...p, [k.id]: !p[k.id] }))} className="p-1 rounded bg-brand-line/10">
                          <Eye size={13} color={BRAND_COLORS.textSoft} />
                        </Pressable>
                      </View>
                      {/* Date */}
                      <Text className="text-[11px] text-brand-textSoft w-16 text-center">{formatDate(k.created_at)}</Text>
                      {/* Status + reset */}
                      <View className="gap-1 items-center">
                        <View className="flex-row items-center gap-1 px-1.5 py-0.5 rounded" style={{ backgroundColor: statusMeta.bg }}>
                          {statusMeta.icon}
                          <Text className="text-[9px] font-bold uppercase" style={{ color: statusMeta.color }}>{statusMeta.label}</Text>
                        </View>
                        {k.status !== 'active' && (
                          <Pressable onPress={() => confirmResetKey(k.id, k.key_value)}>
                            <Text className="text-[10px] font-bold text-brand-primary">Đặt lại</Text>
                          </Pressable>
                        )}
                      </View>
                      {/* Toggle rotation */}
                      <Pressable onPress={() => confirmToggleRotation(k.id, k.key_value, k.is_active, k.status)} className="px-2">
                        <View className="w-10 h-5 rounded-full items-center justify-center" style={{ backgroundColor: k.is_active ? `${BRAND_COLORS.primary}20` : `${BRAND_COLORS.textSoft}20` }}>
                          <View className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: k.is_active ? BRAND_COLORS.primary : BRAND_COLORS.textSoft, marginLeft: k.is_active ? 6 : -6 }} />
                        </View>
                      </Pressable>
                      {/* Delete */}
                      <Pressable onPress={() => confirmDeleteKey(k.id, k.key_value)} className="p-2 rounded-lg" style={{ backgroundColor: `${BRAND_COLORS.danger}1A` }}>
                        <Trash2 size={14} color={BRAND_COLORS.danger} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        )}
        {/* ── PARTNERS TAB ────────────────────────────────────────────────── */}
        {activeTab === 'partners' && (
          <View className="gap-6">
            {/* Aggregate Stats Section */}
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

            {/* Action Bar */}
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

            {/* Partners list table */}
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
                const categoryLabels: Record<string, string> = {
                  hotel: 'Khách sạn',
                  homestay: 'Homestay',
                  resort: 'Resort',
                  restaurant: 'Nhà hàng',
                  cafe: 'Cà phê',
                  attraction: 'Tham quan',
                  transport: 'Vận chuyển'
                };
                return (
                  <View key={p.id} className="flex-row items-center px-4 py-4 border-b border-brand-line/20 gap-2">
                    {/* Name & Address */}
                    <View className="flex-1 gap-0.5">
                      <Text className="font-bold text-sm text-brand-text" numberOfLines={1}>{p.name}</Text>
                      <View className="flex-row items-center gap-1">
                        <MapPin size={10} color={BRAND_COLORS.textSoft} />
                        <Text className="text-[10px] text-brand-textSoft" numberOfLines={1}>{p.address}</Text>
                      </View>
                    </View>
                    {/* Category & City */}
                    <View className="w-28 justify-center">
                      <Text className="text-xs font-bold text-brand-textSoft">{categoryLabels[p.category] || p.category}</Text>
                      <Text className="text-[10px] text-brand-textMuted">{p.city}</Text>
                    </View>
                    {/* Internal Rating */}
                    <View className="w-16 flex-row items-center gap-0.5">
                      <Star size={12} color={BRAND_COLORS.gold} fill={BRAND_COLORS.gold} />
                      <Text className="text-xs font-bold text-brand-text">{p.admin_rating}/5</Text>
                    </View>
                    {/* Performance Metrics */}
                    <View className="w-32 justify-center">
                      <Text className="text-xs text-brand-text font-semibold">
                        H: {p.impression_count || 0} / C: {p.click_count || 0} / B: {p.booking_count || 0}
                      </Text>
                      <Text className="text-[10px] text-brand-textMuted font-medium">
                        CTR: {p.impression_count ? ((p.click_count / p.impression_count) * 100).toFixed(1) : '0.0'}%
                      </Text>
                    </View>
                    {/* Active toggle */}
                    <View className="w-20 items-center">
                      <Pressable onPress={() => togglePartnerActive.mutate(p.id)} className="flex-row items-center gap-1">
                        <View className="w-9 h-5 rounded-full items-center justify-center" style={{ backgroundColor: p.active_status ? `${BRAND_COLORS.primary}20` : `${BRAND_COLORS.textSoft}20` }}>
                          <View className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: p.active_status ? BRAND_COLORS.primary : BRAND_COLORS.textSoft, marginLeft: p.active_status ? 6 : -6 }} />
                        </View>
                      </Pressable>
                    </View>
                    {/* Edit / Delete actions */}
                    <View className="flex-row items-center gap-1.5">
                      <Pressable
                        onPress={() => openPartnerModal(p)}
                        className="p-2 rounded-lg bg-brand-primary/10"
                      >
                        <ChevronRight size={14} color={BRAND_COLORS.primary} />
                      </Pressable>
                      <Pressable
                        onPress={() => confirmDeletePartner(p.id, p.name)}
                        className="p-2 rounded-lg bg-brand-danger/10"
                      >
                        <Trash2 size={14} color={BRAND_COLORS.danger} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Custom Partner Create/Edit Modal */}
      {partnerModalVisible && (
        <View className="absolute inset-0 z-40 items-center justify-center bg-black/60 px-4 py-8">
          <View 
            className="bg-brand-bg border border-brand-line/60 rounded-2xl p-6 max-w-2xl w-full max-h-[90%] shadow-2xl flex-col"
            style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20 }}
          >
            {/* Modal Header */}
            <View className="flex-row justify-between items-center border-b border-brand-line/40 pb-3 mb-3 shrink-0">
              <Text className="text-lg font-display font-extrabold text-brand-text">
                {editingPartner ? 'Cập Nhật Đối Tác' : 'Thêm Đối Tác Mới'}
              </Text>
              <Pressable onPress={() => setPartnerModalVisible(false)} className="p-1.5 rounded-lg bg-brand-line/10">
                <X size={16} color={BRAND_COLORS.textSoft} />
              </Pressable>
            </View>

            {/* Modal Sub-tabs Selection */}
            <View className="flex-row border-b border-brand-line/40 pb-1 mb-4 gap-2 shrink-0">
              {([
                { value: 'basic', label: 'Cơ bản' },
                { value: 'contact', label: 'Liên hệ' },
                { value: 'config', label: 'Phân loại & Tags' },
                { value: 'media', label: 'Mô tả & Ảnh' }
              ] as const).map(tab => {
                const active = formSubTab === tab.value;
                return (
                  <Pressable
                    key={tab.value}
                    onPress={() => setFormSubTab(tab.value)}
                    className="flex-1 py-2 items-center border-b-2"
                    style={{ borderBottomColor: active ? BRAND_COLORS.primary : 'transparent' }}
                  >
                    <Text className={`font-bold text-[11px] ${active ? 'text-brand-primary' : 'text-brand-textSoft'}`}>
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Scrollable Form Body */}
            <ScrollView className="flex-1 pr-1 gap-4" contentContainerStyle={{ paddingBottom: 16 }}>
              {formSubTab === 'basic' && (
                <View className="gap-3">
                  {/* Google Places Autofill Search Bar */}
                  <View className="p-4 rounded-xl border border-brand-primary/20 bg-brand-primary/5 gap-2.5 mb-2">
                    <View className="flex-row items-center gap-1.5">
                      <Sparkles size={14} color={BRAND_COLORS.primary} />
                      <Text className="text-xs font-bold text-brand-primary">Tìm kiếm & Tự động điền dữ liệu Google</Text>
                    </View>
                    <Text className="text-[10px] text-brand-textSoft">
                      Nhập tên địa điểm để tự động điền Tên, Địa chỉ, Tọa độ GPS, Giá và Đánh giá từ Google Maps.
                    </Text>
                    <View className="flex-row gap-2 mt-1">
                      <TextInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="Nhập tên địa điểm (VD: Metropole Hanoi...)"
                        className="flex-1 px-3 py-2 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text"
                        placeholderTextColor={BRAND_COLORS.textMuted}
                        onSubmitEditing={handlePlacesSearch}
                      />
                      <Pressable
                        onPress={handlePlacesSearch}
                        disabled={searchingPlaces}
                        className="px-4 py-2 rounded-xl bg-brand-primary items-center justify-center"
                      >
                        {searchingPlaces ? (
                          <ActivityIndicator size="small" color="white" />
                        ) : (
                          <Text className="text-white text-xs font-bold">Tìm</Text>
                        )}
                      </Pressable>
                    </View>

                    {/* Search Results Dropdown List */}
                    {searchResults.length > 0 && (
                      <View className="mt-2 bg-brand-bg border border-brand-line rounded-xl overflow-hidden max-h-48">
                        <ScrollView nestedScrollEnabled>
                          {searchResults.map((r, idx) => (
                            <Pressable
                              key={idx}
                              onPress={() => handleSelectPlace(r)}
                              className="px-3 py-2.5 border-b border-brand-line/40 hover:bg-brand-bgAlt/40 active:bg-brand-bgAlt/40"
                            >
                              <Text className="text-xs font-bold text-brand-text">{r.name}</Text>
                              <Text className="text-[10px] text-brand-textSoft mt-0.5" numberOfLines={1}>{r.address}</Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                  {/* Name */}
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Tên đối tác *</Text>
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      placeholder="Ví dụ: Khách sạn Continental Sài Gòn"
                      className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text"
                      placeholderTextColor={BRAND_COLORS.textMuted}
                    />
                  </View>

                  {/* Category */}
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Danh mục *</Text>
                    <View className="flex-row flex-wrap gap-2 mt-1">
                      {[
                        { value: 'hotel', label: 'Khách sạn' },
                        { value: 'homestay', label: 'Homestay' },
                        { value: 'resort', label: 'Resort' },
                        { value: 'restaurant', label: 'Nhà hàng' },
                        { value: 'cafe', label: 'Cà phê' },
                        { value: 'attraction', label: 'Điểm tham quan' },
                        { value: 'transport', label: 'Vận chuyển' },
                      ].map(cat => {
                        const active = category === cat.value;
                        return (
                          <Pressable
                            key={cat.value}
                            onPress={() => setCategory(cat.value)}
                            className="px-3 py-1.5 rounded-full border"
                            style={{
                              backgroundColor: active ? BRAND_COLORS.primary : 'transparent',
                              borderColor: active ? BRAND_COLORS.primary : BRAND_COLORS.textMuted + '40',
                            }}
                          >
                            <Text className="text-xs font-bold" style={{ color: active ? 'white' : BRAND_COLORS.textSoft }}>
                              {cat.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* City */}
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Thành phố *</Text>
                    <View className="flex-row flex-wrap gap-2 mt-1">
                      {VIETNAMESE_CITIES.map(c => {
                        const active = city === c;
                        return (
                          <Pressable
                            key={c}
                            onPress={() => setCity(c)}
                            className="px-3 py-1.5 rounded-full border"
                            style={{
                              backgroundColor: active ? BRAND_COLORS.primary : 'transparent',
                              borderColor: active ? BRAND_COLORS.primary : BRAND_COLORS.textMuted + '40',
                            }}
                          >
                            <Text className="text-xs font-bold" style={{ color: active ? 'white' : BRAND_COLORS.textSoft }}>
                              {c}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* District */}
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Quận / Huyện</Text>
                    <TextInput
                      value={district}
                      onChangeText={setDistrict}
                      placeholder="Ví dụ: Quận 1"
                      className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text"
                      placeholderTextColor={BRAND_COLORS.textMuted}
                    />
                  </View>

                  {/* Detailed Address */}
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Địa chỉ chi tiết *</Text>
                    <TextInput
                      value={address}
                      onChangeText={setAddress}
                      placeholder="Ví dụ: 132-134 Đồng Khởi, Bến Nghé"
                      className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text"
                      placeholderTextColor={BRAND_COLORS.textMuted}
                    />
                  </View>

                  {/* Coordinates (Lat, Lng) */}
                  <View className="flex-row gap-4 mb-1">
                    <View className="flex-1 gap-1">
                      <Text className="text-xs font-bold text-brand-textSoft">Vĩ độ (Latitude) *</Text>
                      <TextInput
                        value={lat}
                        onChangeText={setLat}
                        placeholder="Ví dụ: 10.776"
                        keyboardType="numeric"
                        className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text"
                        placeholderTextColor={BRAND_COLORS.textMuted}
                      />
                    </View>
                    <View className="flex-1 gap-1">
                      <Text className="text-xs font-bold text-brand-textSoft">Kinh độ (Longitude) *</Text>
                      <TextInput
                        value={lng}
                        onChangeText={setLng}
                        placeholder="Ví dụ: 106.701"
                        keyboardType="numeric"
                        className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text"
                        placeholderTextColor={BRAND_COLORS.textMuted}
                      />
                    </View>
                  </View>
                </View>
              )}

              {formSubTab === 'contact' && (
                <View className="gap-3">
                  {/* Contact phone & email */}
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Số điện thoại liên hệ</Text>
                    <TextInput
                      value={contactPhone}
                      onChangeText={setContactPhone}
                      placeholder="Ví dụ: 02838299201"
                      className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text"
                      placeholderTextColor={BRAND_COLORS.textMuted}
                    />
                  </View>
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Email liên hệ</Text>
                    <TextInput
                      value={contactEmail}
                      onChangeText={setContactEmail}
                      placeholder="Ví dụ: contact@hotel.com"
                      className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text"
                      placeholderTextColor={BRAND_COLORS.textMuted}
                    />
                  </View>

                  {/* Website & Booking URLs */}
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Trang web đối tác</Text>
                    <TextInput
                      value={websiteUrl}
                      onChangeText={setWebsiteUrl}
                      placeholder="Ví dụ: https://continentalhotel.com.vn"
                      className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text"
                      placeholderTextColor={BRAND_COLORS.textMuted}
                    />
                  </View>
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Link đặt phòng / đặt chỗ (Booking URL)</Text>
                    <TextInput
                      value={bookingUrl}
                      onChangeText={setBookingUrl}
                      placeholder="Ví dụ: https://booking.com/hotel/vn/continental..."
                      className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text"
                      placeholderTextColor={BRAND_COLORS.textMuted}
                    />
                  </View>
                </View>
              )}

              {formSubTab === 'config' && (
                <View className="gap-3">
                  {/* Price Level */}
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Phân khúc giá</Text>
                    <View className="flex-row gap-2 mt-1">
                      {[1, 2, 3, 4].map(level => {
                        const labels = ['Bình dân ($)', 'Trung cấp ($$)', 'Cao cấp ($$$)', 'Sang trọng ($$$$)'];
                        const active = priceLevel === level;
                        return (
                          <Pressable
                            key={level}
                            onPress={() => setPriceLevel(level)}
                            className="px-3 py-1.5 rounded-full border flex-1 items-center"
                            style={{
                              backgroundColor: active ? BRAND_COLORS.primary : 'transparent',
                              borderColor: active ? BRAND_COLORS.primary : BRAND_COLORS.textMuted + '40',
                            }}
                          >
                            <Text className="text-[10px] font-bold" style={{ color: active ? 'white' : BRAND_COLORS.textSoft }}>
                              {labels[level - 1]}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Admin Rating */}
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Điểm đánh giá hệ thống</Text>
                    <View className="flex-row gap-2 mt-1">
                      {[1, 2, 3, 4, 5].map(rating => {
                        const active = adminRating === rating;
                        return (
                          <Pressable
                            key={rating}
                            onPress={() => setAdminRating(rating)}
                            className="p-2 rounded-xl border flex-row items-center justify-center gap-1 flex-1"
                            style={{
                              backgroundColor: active ? BRAND_COLORS.gold + '20' : 'transparent',
                              borderColor: active ? BRAND_COLORS.gold : BRAND_COLORS.textMuted + '40',
                            }}
                          >
                            <Star size={12} color={BRAND_COLORS.gold} fill={active ? BRAND_COLORS.gold : 'transparent'} />
                            <Text className="text-xs font-bold" style={{ color: BRAND_COLORS.textSoft }}>
                              {rating} Sao
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {/* Priority */}
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Độ ưu tiên (0-10) *</Text>
                    <TextInput
                      value={partnerPriority}
                      onChangeText={setPartnerPriority}
                      placeholder="Ví dụ: 5"
                      keyboardType="numeric"
                      className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text"
                      placeholderTextColor={BRAND_COLORS.textMuted}
                    />
                  </View>

                  {/* Tags (Cuisine, Amenities, Dietary) */}
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Tags Ẩm thực (cho nhà hàng/cafe, cách nhau bởi dấu phẩy)</Text>
                    <TextInput
                      value={cuisineTags}
                      onChangeText={setCuisineTags}
                      placeholder="vietnamese, seafood, buffet, street_food"
                      className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text"
                      placeholderTextColor={BRAND_COLORS.textMuted}
                    />
                  </View>
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Tags Tiện ích (cho khách sạn/resort, cách nhau bởi dấu phẩy)</Text>
                    <TextInput
                      value={amenityTags}
                      onChangeText={setAmenityTags}
                      placeholder="pool, spa, gym, parking, free_wifi, breakfast"
                      className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text"
                      placeholderTextColor={BRAND_COLORS.textMuted}
                    />
                  </View>
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Chế độ ăn uống an toàn (cách nhau bởi dấu phẩy)</Text>
                    <TextInput
                      value={dietarySafe}
                      onChangeText={setDietarySafe}
                      placeholder="vegetarian, vegan, halal, gluten_free"
                      className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text"
                      placeholderTextColor={BRAND_COLORS.textMuted}
                    />
                  </View>
                </View>
              )}

              {formSubTab === 'media' && (
                <View className="gap-3">
                  {/* Description */}
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Mô tả ngắn về đối tác</Text>
                    <TextInput
                      value={description}
                      onChangeText={setDescription}
                      placeholder="Mô tả tóm tắt dịch vụ, điểm nổi bật..."
                      multiline
                      numberOfLines={3}
                      className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text"
                      placeholderTextColor={BRAND_COLORS.textMuted}
                      style={{ minHeight: 60, textAlignVertical: 'top' }}
                    />
                  </View>

                  {/* Image URLs */}
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">URLs Hình ảnh (Phân cách bởi dấu phẩy)</Text>
                    <TextInput
                      value={imageUrls}
                      onChangeText={setImageUrls}
                      placeholder="https://image1.jpg, https://image2.jpg"
                      multiline
                      className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text"
                      placeholderTextColor={BRAND_COLORS.textMuted}
                      style={{ minHeight: 45 }}
                    />
                  </View>

                  {/* Admin Notes */}
                  <View className="gap-1 mb-1">
                    <Text className="text-xs font-bold text-brand-textSoft">Ghi chú quản lý nội bộ</Text>
                    <TextInput
                      value={adminNotes}
                      onChangeText={setAdminNotes}
                      placeholder="Thông tin liên hệ phụ, lưu ý riêng..."
                      multiline
                      numberOfLines={2}
                      className="w-full px-4 py-2.5 rounded-xl border border-brand-line text-xs bg-brand-bg text-brand-text"
                      placeholderTextColor={BRAND_COLORS.textMuted}
                      style={{ minHeight: 45, textAlignVertical: 'top' }}
                    />
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Modal Footer Buttons */}
            <View className="flex-row justify-between items-center border-t border-brand-line/40 pt-4 mt-2 shrink-0">
              <View className="flex-row gap-2">
                {formSubTab !== 'basic' && (
                  <Pressable
                    onPress={() => {
                      const tabs = ['basic', 'contact', 'config', 'media'] as const;
                      const currentIndex = tabs.indexOf(formSubTab);
                      setFormSubTab(tabs[currentIndex - 1]);
                    }}
                    className="px-4 py-2.5 rounded-xl border border-brand-line/60 bg-brand-bgAlt/50"
                  >
                    <Text className="text-xs font-bold text-brand-textSoft">Quay lại</Text>
                  </Pressable>
                )}
                {formSubTab !== 'media' && (
                  <Pressable
                    onPress={() => {
                      const tabs = ['basic', 'contact', 'config', 'media'] as const;
                      const currentIndex = tabs.indexOf(formSubTab);
                      setFormSubTab(tabs[currentIndex + 1]);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-brand-primary"
                  >
                    <Text className="text-xs font-bold text-white">Tiếp tục</Text>
                  </Pressable>
                )}
              </View>
              <View className="flex-row gap-2">
                <Pressable 
                  onPress={() => setPartnerModalVisible(false)}
                  className="px-4 py-2.5 rounded-xl border border-brand-line/60 bg-brand-bgAlt/50"
                >
                  <Text className="text-xs font-bold text-brand-textSoft">Hủy</Text>
                </Pressable>
                <Pressable 
                  onPress={handleSavePartner}
                  disabled={savePartner.isPending}
                  className="px-4 py-2.5 rounded-xl bg-brand-primary"
                  style={savePartner.isPending ? { opacity: 0.5 } : undefined}
                >
                  <Text className="text-xs font-bold text-white">
                    {savePartner.isPending ? 'Đang lưu...' : 'Lưu lại'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Custom Confirmation Modal */}
      {confirmModal && confirmModal.visible && (
        <View className="absolute inset-0 z-50 items-center justify-center bg-black/60 px-4">
          <View 
            className="bg-brand-bg border border-brand-line/60 rounded-2xl p-6 max-w-md w-full shadow-2xl"
            style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 20 }}
          >
            <View className="flex-row items-center gap-2 mb-3">
              <AlertTriangle size={22} color={confirmModal.isDestructive ? BRAND_COLORS.danger : BRAND_COLORS.accent} />
              <Text className="text-lg font-display font-extrabold text-brand-text">{confirmModal.title}</Text>
            </View>
            <Text className="text-xs text-brand-textSoft leading-relaxed mb-6">
              {confirmModal.message}
            </Text>
            <View className="flex-row justify-end gap-3">
              <Pressable 
                onPress={() => setConfirmModal(null)}
                className="px-4 py-2.5 rounded-xl border border-brand-line/60 bg-brand-bgAlt/50"
              >
                <Text className="text-xs font-bold text-brand-textSoft">{confirmModal.cancelText}</Text>
              </Pressable>
              <Pressable 
                onPress={confirmModal.onConfirm}
                className="px-4 py-2.5 rounded-xl"
                style={{ backgroundColor: confirmModal.isDestructive ? BRAND_COLORS.danger : BRAND_COLORS.primary }}
              >
                <Text className="text-xs font-bold text-white">{confirmModal.confirmText}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
