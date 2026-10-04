import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Platform, Linking } from 'react-native';
import {
  Handshake,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Edit3,
  Trash2,
  MapPin,
  Star,
  Phone,
  Mail,
  Globe,
  ExternalLink,
  Eye,
  MousePointer,
  Calendar,
  Percent,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Utensils,
  Coffee,
  Compass,
  Check,
  Tag,
  DollarSign,
  TrendingUp,
} from 'lucide-react-native';
import { BRAND_COLORS, VIETNAMESE_CITIES } from '../../constants';
import { useAuth } from '../../hooks/useAuth';
import {
  PageHeader,
  Card,
  Section,
  StatCard,
  DataTable,
  Badge,
  BadgeTone,
  Button,
  SearchInput,
  FilterChips,
  Modal,
  ConfirmDialog,
  Field,
  Input,
  Select,
  Switch,
  Textarea,
  Pagination,
  EmptyState,
  useAdminToast,
  formatDate,
} from '../../components/admin/ui';
import {
  useAdminPartners,
  usePartnerAnalyticsSummary,
  useSavePartner,
  useTogglePartnerActive,
  useDeletePartner,
  PartnerRecord,
} from '../../lib/adminApi';
import { api } from '../../lib/api';

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  'Hà Nội': { lat: 21.0285, lng: 105.8542 },
  'Đà Nẵng': { lat: 16.0544, lng: 108.2022 },
  'TP. Hồ Chí Minh': { lat: 10.8231, lng: 106.6297 },
  'Hội An': { lat: 15.8801, lng: 108.338 },
  'Huế': { lat: 16.4637, lng: 107.5908 },
  'Nha Trang': { lat: 12.2388, lng: 109.1967 },
  'Đà Lạt': { lat: 11.9404, lng: 108.4583 },
  'Phú Quốc': { lat: 10.2899, lng: 103.984 },
  'Sa Pa': { lat: 22.3364, lng: 103.8438 },
  'Ninh Bình': { lat: 20.2506, lng: 105.9745 },
  'Vũng Tàu': { lat: 10.346, lng: 107.0843 },
};

function getCategoryMeta(cat: string): { label: string; tone: BadgeTone } {
  switch (cat) {
    case 'hotel':
    case 'homestay':
    case 'resort':
      return { label: 'Lưu trú / Khách sạn', tone: 'brand' };
    case 'restaurant':
      return { label: 'Nhà hàng', tone: 'warning' };
    case 'cafe':
      return { label: 'Quán cafe', tone: 'info' };
    case 'attraction':
      return { label: 'Điểm tham quan', tone: 'success' };
    case 'rental':
      return { label: 'Dịch vụ thuê xe', tone: 'neutral' };
    default:
      return { label: cat, tone: 'neutral' };
  }
}

export default function AdminPartnersPage() {
  const { isAdmin } = useAuth();
  const { showToast } = useAdminToast();

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [page, setPage] = useState(1);
  const limit = 10;

  // Modal Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<PartnerRecord | null>(null);
  const [formSubTab, setFormSubTab] = useState<'basic' | 'contact' | 'config' | 'tags'>('basic');

  // Form Fields
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
  const [priceLevel, setPriceLevel] = useState('2');
  const [cuisineTags, setCuisineTags] = useState('');
  const [amenityTags, setAmenityTags] = useState('');
  const [dietarySafe, setDietarySafe] = useState('');
  const [adminRating, setAdminRating] = useState('4');
  const [adminNotes, setAdminNotes] = useState('');
  const [partnerPriority, setPartnerPriority] = useState('0');

  // Google Places Search Helper inside Modal
  const [placesSearchQuery, setPlacesSearchQuery] = useState('');
  const [placesSearchResults, setPlacesSearchResults] = useState<any[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);

  // Confirm delete dialog
  const [partnerToDelete, setPartnerToDelete] = useState<PartnerRecord | null>(null);

  // Queries
  const {
    data: partners = [],
    isLoading: partnersLoading,
    isFetching: partnersFetching,
    refetch: refetchPartners,
  } = useAdminPartners();

  const {
    data: analyticsSummary,
    isLoading: summaryLoading,
    isFetching: summaryFetching,
    refetch: refetchSummary,
  } = usePartnerAnalyticsSummary();

  // Mutations
  const savePartner = useSavePartner();
  const togglePartnerActive = useTogglePartnerActive();
  const deletePartner = useDeletePartner();

  // Open modal for create or edit
  const openPartnerModal = (partner: PartnerRecord | null = null) => {
    setFormSubTab('basic');
    setEditingPartner(partner);
    setPlacesSearchQuery('');
    setPlacesSearchResults([]);

    if (partner) {
      setName(partner.name || '');
      setCategory(partner.category || 'hotel');
      setAddress(partner.address || '');
      setLat(String(partner.lat ?? ''));
      setLng(String(partner.lng ?? ''));
      setCity(partner.city || 'Hà Nội');
      setDistrict(partner.district || '');
      setContactPhone(partner.contact_phone || '');
      setContactEmail(partner.contact_email || '');
      setWebsiteUrl(partner.website_url || '');
      setBookingUrl(partner.booking_url || '');
      setDescription(partner.description || '');
      setImageUrls(partner.image_urls ? partner.image_urls.join(', ') : '');
      setPriceLevel(String(partner.price_level ?? 2));
      setCuisineTags(partner.cuisine_tags ? partner.cuisine_tags.join(', ') : '');
      setAmenityTags(partner.amenity_tags ? partner.amenity_tags.join(', ') : '');
      setDietarySafe(partner.dietary_safe ? partner.dietary_safe.join(', ') : '');
      setAdminRating(String(partner.admin_rating ?? 4));
      setAdminNotes(partner.admin_notes || '');
      setPartnerPriority(String(partner.partner_priority ?? 0));
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
      setPriceLevel('2');
      setCuisineTags('');
      setAmenityTags('');
      setDietarySafe('');
      setAdminRating('4');
      setAdminNotes('');
      setPartnerPriority('0');
    }

    setIsModalOpen(true);
  };

  // Google Places search
  const handlePlacesSearch = async () => {
    if (!placesSearchQuery.trim()) return;
    setIsSearchingPlaces(true);
    setPlacesSearchResults([]);
    try {
      const coords = CITY_COORDS[city] || { lat: 16.0544, lng: 108.2022 };
      let placeCat = 'rental';
      if (['hotel', 'homestay', 'resort'].includes(category)) placeCat = 'accommodation';
      else if (['restaurant', 'cafe'].includes(category)) placeCat = 'dining';
      else if (category === 'attraction') placeCat = 'attraction';

      const res = await api.get('/places/search', {
        params: {
          query: placesSearchQuery.trim(),
          lat: coords.lat,
          lng: coords.lng,
          category: placeCat,
        },
      });
      const list = res.data?.results || (Array.isArray(res.data) ? res.data : []);
      setPlacesSearchResults(list);
      if (list.length === 0) {
        showToast('Không tìm thấy địa điểm nào khớp với từ khóa.', 'info');
      }
    } catch (e: any) {
      showToast('Lỗi tìm kiếm địa điểm: ' + (e.response?.data?.error || e.message), 'error');
    } finally {
      setIsSearchingPlaces(false);
    }
  };

  const handleSelectPlace = (place: any) => {
    setName(place.name || '');
    setAddress(place.address || '');
    setLat(String(place.lat ?? ''));
    setLng(String(place.lng ?? ''));
    if (place.price_level) setPriceLevel(String(place.price_level));
    if (place.rating) setAdminRating(String(Math.min(5, Math.max(1, Math.round(place.rating)))));
    setPlacesSearchResults([]);
    setPlacesSearchQuery('');
    showToast('Đã tự động điền thông tin từ Google Places!', 'success');
  };

  const parseTags = (str: string) =>
    str
      .split(/[,;\n]+/)
      .map((t) => t.trim())
      .filter(Boolean);

  // Save Partner Handler
  const handleSavePartner = () => {
    if (!name.trim()) return showToast('Vui lòng nhập tên đối tác', 'error');
    if (!address.trim()) return showToast('Vui lòng nhập địa chỉ đối tác', 'error');
    if (!lat.trim() || isNaN(Number(lat))) return showToast('Vui lòng nhập vĩ độ hợp lệ (Lat)', 'error');
    if (!lng.trim() || isNaN(Number(lng))) return showToast('Vui lòng nhập kinh độ hợp lệ (Lng)', 'error');
    if (!city) return showToast('Vui lòng chọn thành phố', 'error');

    const numLat = parseFloat(lat);
    const numLng = parseFloat(lng);
    const numPriority = parseInt(partnerPriority, 10) || 0;
    const numPrice = parseInt(priceLevel, 10) || 2;
    const numRating = parseInt(adminRating, 10) || 4;

    if (numLat < -90 || numLat > 90) return showToast('Vĩ độ phải nằm trong khoảng [-90, 90]', 'error');
    if (numLng < -180 || numLng > 180) return showToast('Kinh độ phải nằm trong khoảng [-180, 180]', 'error');
    if (numPriority < 0 || numPriority > 100) return showToast('Độ ưu tiên phải từ 0 đến 100', 'error');

    const payload: Partial<PartnerRecord> = {
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
      price_level: numPrice,
      cuisine_tags: parseTags(cuisineTags),
      amenity_tags: parseTags(amenityTags),
      dietary_safe: parseTags(dietarySafe),
      admin_rating: numRating,
      admin_notes: adminNotes.trim() || null,
      partner_priority: numPriority,
    };

    savePartner.mutate(
      { id: editingPartner?.id, data: payload },
      {
        onSuccess: () => {
          setIsModalOpen(false);
          showToast(
            editingPartner
              ? 'Đã cập nhật thông tin đối tác!'
              : 'Đã thêm đối tác mới thành công!',
            'success'
          );
        },
        onError: (err: any) => {
          showToast(err.response?.data?.error || err.message || 'Lỗi lưu thông tin đối tác', 'error');
        },
      }
    );
  };

  // Toggle active state
  const handleToggleActive = (partner: PartnerRecord) => {
    togglePartnerActive.mutate(partner.id, {
      onSuccess: () => {
        showToast(
          partner.active_status
            ? `Đã tạm dừng đối tác ${partner.name}!`
            : `Đã kích hoạt đối tác ${partner.name}!`,
          'info'
        );
      },
      onError: (err: any) => {
        showToast(err.response?.data?.error || err.message || 'Lỗi cập nhật trạng thái', 'error');
      },
    });
  };

  // Delete partner
  const handleDeletePartner = () => {
    if (!partnerToDelete) return;
    deletePartner.mutate(partnerToDelete.id, {
      onSuccess: () => {
        showToast(`Đã xóa đối tác "${partnerToDelete.name}" thành công!`, 'success');
        setPartnerToDelete(null);
      },
      onError: (err: any) => {
        showToast(err.response?.data?.error || err.message || 'Lỗi xóa đối tác', 'error');
      },
    });
  };

  // Filtered partners
  const filteredPartners = useMemo(() => {
    let list = partners;

    if (categoryFilter === 'active') {
      list = list.filter((p) => p.active_status);
    } else if (categoryFilter === 'inactive') {
      list = list.filter((p) => !p.active_status);
    } else if (categoryFilter !== 'all') {
      list = list.filter((p) => p.category === categoryFilter);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.city?.toLowerCase().includes(q) ||
          p.district?.toLowerCase().includes(q) ||
          p.address?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [partners, categoryFilter, searchTerm]);

  // Paginated partners
  const totalPages = Math.max(1, Math.ceil(filteredPartners.length / limit));
  const paginatedPartners = useMemo(() => {
    const start = (page - 1) * limit;
    return filteredPartners.slice(start, start + limit);
  }, [filteredPartners, page, limit]);

  // Reset page when filter changes
  const handleFilterChange = (val: string) => {
    setCategoryFilter(val);
    setPage(1);
  };

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setPage(1);
  };

  // DataTable columns
  const columns = [
    {
      key: 'partner',
      title: 'Đối tác',
      width: 260,
      render: (row: PartnerRecord) => {
        const meta = getCategoryMeta(row.category);
        return (
          <View className="gap-1.5 py-1">
            <Text className="text-xs font-bold text-brand-text leading-tight" numberOfLines={2}>
              {row.name}
            </Text>
            <View className="flex-row items-center gap-1.5 flex-wrap">
              <Badge label={meta.label} tone={meta.tone} size="sm" />
              <View className="flex-row items-center gap-1">
                <MapPin size={11} color={BRAND_COLORS.textMuted} />
                <Text className="text-[11px] text-brand-textSoft font-medium">
                  {row.city || 'Chưa chọn'}
                </Text>
              </View>
            </View>
          </View>
        );
      },
    },
    {
      key: 'contact',
      title: 'Địa chỉ & Liên hệ',
      width: 250,
      render: (row: PartnerRecord) => (
        <View className="gap-1 py-1">
          <Text className="text-xs text-brand-textSoft" numberOfLines={1}>
            {row.address}
          </Text>
          <View className="flex-row items-center gap-3 flex-wrap">
            {row.contact_phone ? (
              <View className="flex-row items-center gap-1">
                <Phone size={11} color={BRAND_COLORS.textMuted} />
                <Text className="text-[11px] text-brand-textMuted font-mono">
                  {row.contact_phone}
                </Text>
              </View>
            ) : null}
            {row.website_url ? (
              <Pressable
                onPress={() => Linking.openURL(row.website_url!)}
                hitSlop={4}
                className="flex-row items-center gap-1"
              >
                <Globe size={11} color={BRAND_COLORS.primary} />
                <Text className="text-[11px] text-brand-primary underline" numberOfLines={1}>
                  Website
                </Text>
              </Pressable>
            ) : null}
            {row.booking_url ? (
              <Pressable
                onPress={() => Linking.openURL(row.booking_url!)}
                hitSlop={4}
                className="flex-row items-center gap-1"
              >
                <ExternalLink size={11} color={BRAND_COLORS.accentStrong} />
                <Text className="text-[11px] text-brand-accentStrong font-semibold underline">
                  Booking
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ),
    },
    {
      key: 'rating_priority',
      title: 'Đánh giá & Ưu tiên',
      width: 170,
      render: (row: PartnerRecord) => (
        <View className="gap-1 py-1">
          <View className="flex-row items-center gap-1.5">
            <View className="flex-row items-center">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  size={12}
                  color={i < (row.admin_rating || 3) ? '#F59E0B' : '#E2E8F0'}
                  fill={i < (row.admin_rating || 3) ? '#F59E0B' : 'none'}
                />
              ))}
            </View>
            <Text className="text-[11px] font-bold text-amber-600">
              {row.admin_rating || 3}/5
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Text className="text-[11px] text-brand-textMuted font-mono">
              {'$'.repeat(row.price_level || 2)}
            </Text>
            <Badge
              label={`Ưu tiên: ${row.partner_priority || 0}`}
              tone={(row.partner_priority || 0) > 0 ? 'info' : 'neutral'}
              size="sm"
            />
          </View>
        </View>
      ),
    },
    {
      key: 'performance',
      title: 'Hiệu suất (Hiển thị / Click / Đặt)',
      width: 200,
      render: (row: PartnerRecord) => {
        const ctr =
          row.impression_count > 0
            ? ((row.click_count / row.impression_count) * 100).toFixed(1)
            : '0.0';

        return (
          <View className="gap-1 py-1">
            <View className="flex-row items-center gap-2">
              <Text className="text-xs text-brand-text font-semibold">
                {row.impression_count.toLocaleString()}
              </Text>
              <Text className="text-xs text-brand-textMuted">/</Text>
              <Text className="text-xs text-brand-primary font-semibold">
                {row.click_count.toLocaleString()}
              </Text>
              <Text className="text-xs text-brand-textMuted">/</Text>
              <Text className="text-xs text-brand-accentStrong font-bold">
                {row.booking_count.toLocaleString()}
              </Text>
            </View>
            <Text className="text-[11px] text-brand-textMuted">
              CTR: <Text className="font-bold text-brand-text">{ctr}%</Text>
            </Text>
          </View>
        );
      },
    },
    {
      key: 'status',
      title: 'Trạng thái',
      width: 110,
      render: (row: PartnerRecord) => (
        <Switch
          value={row.active_status}
          onValueChange={() => handleToggleActive(row)}
          disabled={togglePartnerActive.isPending}
        />
      ),
    },
    {
      key: 'actions',
      title: 'Thao tác',
      width: 110,
      align: 'right' as const,
      render: (row: PartnerRecord) => (
        <View className="flex-row items-center justify-end gap-1.5">
          <Pressable
            onPress={() => openPartnerModal(row)}
            hitSlop={6}
            className="p-1.5 rounded-lg hover:bg-slate-100"
          >
            <Edit3 size={15} color={BRAND_COLORS.textSoft} />
          </Pressable>
          <Pressable
            onPress={() => setPartnerToDelete(row)}
            hitSlop={6}
            className="p-1.5 rounded-lg hover:bg-red-50"
          >
            <Trash2 size={15} color={BRAND_COLORS.danger} />
          </Pressable>
        </View>
      ),
    },
  ];

  return (
    <ScrollView className="flex-1 bg-brand-bg" contentContainerStyle={{ padding: 24, gap: 24 }}>
      {/* Page Header */}
      <PageHeader
        title="Quản lý Đối tác Dịch vụ"
        description="Mạng lưới đối tác liên kết lưu trú, ẩm thực, giải trí và hiệu suất chuyển đổi đặt chỗ"
        badge={
          <View className="w-8 h-8 rounded-xl items-center justify-center bg-brand-primary/10">
            <Handshake size={18} color={BRAND_COLORS.primary} />
          </View>
        }
        action={
          <View className="flex-row items-center gap-2">
            <Button
              label="Làm mới"
              variant="outline"
              size="sm"
              icon={
                <RefreshCw
                  size={14}
                  color={BRAND_COLORS.textSoft}
                  className={partnersFetching || summaryFetching ? 'animate-spin' : ''}
                />
              }
              onPress={() => {
                refetchPartners();
                refetchSummary();
                showToast('Đã làm mới dữ liệu đối tác!', 'info');
              }}
            />
            <Button
              label="Thêm đối tác"
              variant="primary"
              size="sm"
              icon={<Plus size={15} color="#FFFFFF" />}
              onPress={() => openPartnerModal(null)}
            />
          </View>
        }
      />

      {/* 4 Stat Cards */}
      <View className="flex-row flex-wrap gap-4">
        <StatCard
          label="Tổng lượt hiển thị"
          value={analyticsSummary?.totalImpressions?.toLocaleString() ?? 0}
          subtext="Số lần xuất hiện trong lịch trình"
          icon={<Eye size={20} color={BRAND_COLORS.primary} />}
          loading={summaryLoading}
          className="flex-1 min-w-[200px]"
        />
        <StatCard
          label="Tổng lượt nhấp"
          value={analyticsSummary?.totalClicks?.toLocaleString() ?? 0}
          subtext="Số lần người dùng bấm xem link"
          icon={<MousePointer size={20} color="#3B82F6" />}
          iconBg="rgba(59, 130, 246, 0.12)"
          loading={summaryLoading}
          className="flex-1 min-w-[200px]"
        />
        <StatCard
          label="Tổng lượt đặt chỗ"
          value={analyticsSummary?.totalBookings?.toLocaleString() ?? 0}
          subtext="Chuyển đổi booking thành công"
          icon={<Calendar size={20} color="#10B981" />}
          iconBg="rgba(16, 185, 129, 0.12)"
          loading={summaryLoading}
          className="flex-1 min-w-[200px]"
        />
        <StatCard
          label="Tỷ lệ CTR trung bình"
          value={`${((analyticsSummary?.averageCtr ?? 0) * 100).toFixed(1)}%`}
          subtext="Lượt nhấp / Lượt hiển thị"
          icon={<Percent size={20} color="#F59E0B" />}
          iconBg="rgba(245, 158, 11, 0.12)"
          loading={summaryLoading}
          className="flex-1 min-w-[200px]"
        />
      </View>

      {/* Main Partners Table Card */}
      <Card padding="none">
        {/* Toolbar */}
        <View className="p-4 border-b border-brand-line/40 gap-3">
          <View className="flex-row items-center justify-between flex-wrap gap-3">
            <SearchInput
              value={searchTerm}
              onChangeText={handleSearchChange}
              placeholder="Tìm theo tên, địa chỉ, quận, thành phố..."
              className="w-full md:w-80"
            />
            <Text className="text-xs text-brand-textMuted font-medium">
              Tìm thấy <Text className="font-bold text-brand-text">{filteredPartners.length}</Text> đối tác
            </Text>
          </View>

          <FilterChips
            options={[
              { value: 'all', label: 'Tất cả danh mục' },
              { value: 'hotel', label: 'Khách sạn / Lưu trú' },
              { value: 'restaurant', label: 'Nhà hàng' },
              { value: 'cafe', label: 'Quán cafe' },
              { value: 'attraction', label: 'Điểm tham quan' },
              { value: 'active', label: 'Đang hoạt động' },
              { value: 'inactive', label: 'Tạm dừng' },
            ]}
            value={categoryFilter}
            onChange={handleFilterChange}
            size="sm"
          />
        </View>

        {/* DataTable */}
        <DataTable<PartnerRecord>
          columns={columns}
          data={paginatedPartners}
          keyExtractor={(item) => item.id}
          loading={partnersLoading}
          emptyTitle="Chưa có đối tác nào"
          emptyMessage="Không tìm thấy đối tác phù hợp với điều kiện tìm kiếm hoặc bộ lọc."
          minWidth={950}
        />

        {/* Pagination Footer */}
        {filteredPartners.length > 0 && (
          <View className="px-4 py-2 border-t border-brand-line/30 bg-slate-50/50">
            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={filteredPartners.length}
              limit={limit}
              onPageChange={setPage}
            />
          </View>
        )}
      </Card>

      {/* Modal Thêm / Chỉnh sửa Đối tác */}
      <Modal
        visible={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingPartner ? 'Chỉnh sửa đối tác' : 'Thêm đối tác mới'}
        subtitle="Quản lý thông tin chi tiết, tọa độ và đường link tiếp thị đối tác"
        maxWidth={660}
        footer={
          <View className="flex-row items-center justify-end gap-2 w-full">
            <Button
              label="Hủy"
              variant="outline"
              size="md"
              onPress={() => setIsModalOpen(false)}
            />
            <Button
              label={editingPartner ? 'Cập nhật đối tác' : 'Tạo đối tác mới'}
              variant="primary"
              size="md"
              icon={<CheckCircle2 size={16} color="#FFFFFF" />}
              loading={savePartner.isPending}
              onPress={handleSavePartner}
            />
          </View>
        }
      >
        {/* Form Subtabs */}
        <View className="border-b border-brand-line/30 pb-3">
          <FilterChips
            options={[
              { value: 'basic', label: '1. Cơ bản & Địa chỉ' },
              { value: 'contact', label: '2. Liên hệ & Đặt chỗ' },
              { value: 'config', label: '3. Đánh giá & Thiết lập' },
              { value: 'tags', label: '4. Tags & Hình ảnh' },
            ]}
            value={formSubTab}
            onChange={(v) => setFormSubTab(v as any)}
            size="sm"
          />
        </View>

        {/* SUBTAB 1: THÔNG TIN CƠ BẢN */}
        {formSubTab === 'basic' && (
          <View className="gap-4">
            {/* Quick search places tool */}
            <View className="p-3 bg-brand-primary/5 rounded-xl border border-brand-primary/20 gap-2">
              <Text className="text-xs font-bold text-brand-primary">
                Tìm nhanh từ Google Places để tự động điền:
              </Text>
              <View className="flex-row items-center gap-2">
                <View className="flex-1">
                  <Input
                    value={placesSearchQuery}
                    onChangeText={setPlacesSearchQuery}
                    placeholder="Nhập tên địa điểm (ví dụ: Continental Sài Gòn)..."
                    onSubmitEditing={handlePlacesSearch}
                  />
                </View>
                <Button
                  label="Tìm"
                  variant="primary"
                  size="sm"
                  loading={isSearchingPlaces}
                  onPress={handlePlacesSearch}
                />
              </View>

              {/* Place search results */}
              {placesSearchResults.length > 0 && (
                <View className="gap-1.5 mt-2 bg-white p-2 rounded-lg border border-brand-line/40">
                  <Text className="text-[11px] font-bold text-brand-textSoft">
                    Chọn địa điểm bên dưới:
                  </Text>
                  {placesSearchResults.slice(0, 4).map((p, idx) => (
                    <Pressable
                      key={idx}
                      onPress={() => handleSelectPlace(p)}
                      className="p-2 rounded-md hover:bg-brand-primary/10 border border-brand-line/20"
                    >
                      <Text className="text-xs font-bold text-brand-text" numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text className="text-[11px] text-brand-textMuted" numberOfLines={1}>
                        {p.address}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            <Field label="Tên đối tác" required>
              <Input
                value={name}
                onChangeText={setName}
                placeholder="Ví dụ: Khách sạn Continental Sài Gòn"
              />
            </Field>

            <View className="flex-row flex-wrap gap-4">
              <View className="flex-1 min-w-[240px]">
                <Field label="Danh mục đối tác" required>
                  <Select
                    options={[
                      { value: 'hotel', label: 'Khách sạn / Lưu trú' },
                      { value: 'restaurant', label: 'Nhà hàng ẩm thực' },
                      { value: 'cafe', label: 'Quán cafe / Giải khát' },
                      { value: 'attraction', label: 'Điểm tham quan / Vui chơi' },
                      { value: 'homestay', label: 'Homestay' },
                      { value: 'resort', label: 'Resort / Khu nghỉ dưỡng' },
                      { value: 'rental', label: 'Dịch vụ thuê xe' },
                    ]}
                    value={category}
                    onChange={setCategory}
                  />
                </Field>
              </View>

              <View className="flex-1 min-w-[240px]">
                <Field label="Thành phố" required>
                  <Select
                    options={VIETNAMESE_CITIES.map((c) => ({ value: c, label: c }))}
                    value={city}
                    onChange={setCity}
                  />
                </Field>
              </View>
            </View>

            <Field label="Quận / Huyện">
              <Input
                value={district}
                onChangeText={setDistrict}
                placeholder="Ví dụ: Quận 1, Ba Đình..."
              />
            </Field>

            <Field label="Địa chỉ cụ thể" required>
              <Input
                value={address}
                onChangeText={setAddress}
                placeholder="Ví dụ: 132-134 Đồng Khởi, Bến Nghé, Quận 1, Hồ Chí Minh"
              />
            </Field>

            <View className="flex-row flex-wrap gap-4">
              <View className="flex-1 min-w-[200px]">
                <Field label="Vĩ độ (Lat)" required hint="Khoảng -90 đến 90">
                  <Input
                    value={lat}
                    onChangeText={setLat}
                    placeholder="Ví dụ: 10.7760"
                    keyboardType="numeric"
                  />
                </Field>
              </View>

              <View className="flex-1 min-w-[200px]">
                <Field label="Kinh độ (Lng)" required hint="Khoảng -180 đến 180">
                  <Input
                    value={lng}
                    onChangeText={setLng}
                    placeholder="Ví dụ: 106.7010"
                    keyboardType="numeric"
                  />
                </Field>
              </View>
            </View>

            <Field label="Mô tả đối tác">
              <Textarea
                value={description}
                onChangeText={setDescription}
                placeholder="Mô tả nổi bật về dịch vụ, không gian và đặc điểm của đối tác..."
                rows={3}
              />
            </Field>
          </View>
        )}

        {/* SUBTAB 2: LIÊN HỆ & ĐẶT CHỖ */}
        {formSubTab === 'contact' && (
          <View className="gap-4">
            <Field label="Số điện thoại liên hệ">
              <Input
                value={contactPhone}
                onChangeText={setContactPhone}
                placeholder="Ví dụ: 028 3829 9201"
                prefix={<Phone size={14} color={BRAND_COLORS.textMuted} />}
              />
            </Field>

            <Field label="Email liên hệ">
              <Input
                value={contactEmail}
                onChangeText={setContactEmail}
                placeholder="Ví dụ: booking@hotelcontinental.vn"
                prefix={<Mail size={14} color={BRAND_COLORS.textMuted} />}
              />
            </Field>

            <Field label="Website chính thức">
              <Input
                value={websiteUrl}
                onChangeText={setWebsiteUrl}
                placeholder="Ví dụ: https://hotelcontinentalsaigon.vn"
                prefix={<Globe size={14} color={BRAND_COLORS.textMuted} />}
              />
            </Field>

            <Field
              label="Link đặt chỗ (Booking / Affiliate URL)"
              hint="Đường link dẫn người dùng đến trang đặt phòng, đặt bàn hoặc tiếp thị liên kết"
            >
              <Input
                value={bookingUrl}
                onChangeText={setBookingUrl}
                placeholder="Ví dụ: https://www.agoda.com/partners/hotel..."
                prefix={<ExternalLink size={14} color={BRAND_COLORS.textMuted} />}
              />
            </Field>
          </View>
        )}

        {/* SUBTAB 3: ĐÁNH GIÁ & THIẾT LẬP */}
        {formSubTab === 'config' && (
          <View className="gap-4">
            <View className="flex-row flex-wrap gap-4">
              <View className="flex-1 min-w-[200px]">
                <Field label="Mức giá">
                  <Select
                    options={[
                      { value: '1', label: '💵 Giá rẻ ($)' },
                      { value: '2', label: '💵💵 Bình dân ($$)' },
                      { value: '3', label: '💵💵💵 Cao cấp ($$$)' },
                      { value: '4', label: '💵💵💵💵 Sang trọng ($$$$)' },
                    ]}
                    value={priceLevel}
                    onChange={setPriceLevel}
                  />
                </Field>
              </View>

              <View className="flex-1 min-w-[200px]">
                <Field label="Đánh giá Admin">
                  <Select
                    options={[
                      { value: '5', label: '⭐⭐⭐⭐⭐ 5 sao xuất sắc' },
                      { value: '4', label: '⭐⭐⭐⭐ 4 sao tốt' },
                      { value: '3', label: '⭐⭐⭐ 3 sao tiêu chuẩn' },
                      { value: '2', label: '⭐⭐ 2 sao cơ bản' },
                      { value: '1', label: '⭐ 1 sao' },
                    ]}
                    value={adminRating}
                    onChange={setAdminRating}
                  />
                </Field>
              </View>
            </View>

            <Field
              label="Độ ưu tiên hiển thị (Priority)"
              hint="Điểm từ 0 đến 100. Điểm càng cao đối tác càng được AI ưu tiên gợi ý trong lịch trình chuyến đi."
            >
              <Input
                value={partnerPriority}
                onChangeText={setPartnerPriority}
                placeholder="0"
                keyboardType="numeric"
              />
            </Field>

            <Field
              label="Ghi chú nội bộ Admin"
              hint="Chỉ hiển thị cho người quản trị, người dùng không nhìn thấy."
            >
              <Textarea
                value={adminNotes}
                onChangeText={setAdminNotes}
                placeholder="Ghi chú về hợp đồng, tỷ lệ hoa hồng hoặc lưu ý đặc biệt..."
                rows={3}
              />
            </Field>
          </View>
        )}

        {/* SUBTAB 4: TAGS & HÌNH ẢNH */}
        {formSubTab === 'tags' && (
          <View className="gap-4">
            <Field
              label="Tags ẩm thực / Món đặc trưng"
              hint="Phân cách bằng dấu phẩy, ví dụ: Buffet, Món Âu, Rượu vang"
            >
              <Input
                value={cuisineTags}
                onChangeText={setCuisineTags}
                placeholder="Buffet, Món Âu, Rượu vang..."
              />
            </Field>

            <Field
              label="Tags tiện ích & Dịch vụ"
              hint="Phân cách bằng dấu phẩy, ví dụ: Hồ bơi, Spa, Wifi miễn phí, Phòng gym"
            >
              <Input
                value={amenityTags}
                onChangeText={setAmenityTags}
                placeholder="Hồ bơi, Spa, Wifi miễn phí, Phòng gym..."
              />
            </Field>

            <Field
              label="Tiêu chuẩn an toàn thực phẩm & Chế độ ăn"
              hint="Phân cách bằng dấu phẩy, ví dụ: Halal, Chay, Không gluten, Vệ sinh ATTP"
            >
              <Input
                value={dietarySafe}
                onChangeText={setDietarySafe}
                placeholder="Halal, Chay, Vệ sinh ATTP..."
              />
            </Field>

            <Field
              label="Danh sách URLs hình ảnh"
              hint="Mỗi link một dòng hoặc phân cách bằng dấu phẩy"
            >
              <Textarea
                value={imageUrls}
                onChangeText={setImageUrls}
                placeholder="https://example.com/img1.jpg&#10;https://example.com/img2.jpg"
                rows={3}
              />
            </Field>
          </View>
        )}
      </Modal>

      {/* Confirm Dialog Xóa Đối Tác */}
      <ConfirmDialog
        visible={!!partnerToDelete}
        title="Xác nhận xóa đối tác"
        message={`Bạn có chắc chắn muốn xóa đối tác "${partnerToDelete?.name}" không? Toàn bộ dữ liệu hiển thị và thống kê hiệu suất liên quan sẽ bị xóa vĩnh viễn.`}
        confirmText="Xóa đối tác"
        cancelText="Hủy"
        isDestructive
        loading={deletePartner.isPending}
        onConfirm={handleDeletePartner}
        onCancel={() => setPartnerToDelete(null)}
      />
    </ScrollView>
  );
}
