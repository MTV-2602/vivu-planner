import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Image, RefreshControl, Platform, TextInput, Alert, Modal, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import { User, MapPin, Calendar, Heart, ArrowLeft, LogOut, Sparkles, ChevronRight, ChevronLeft, Star, Trash2, Plus, Tag, X, ExternalLink, ThumbsUp, MessageSquare } from 'lucide-react-native';
import { PREFERENCE_OPTIONS, APP_ROUTES, POST_CATEGORIES } from '../../constants';
import CreatePostModal from '../../components/CreatePostModal';
import ConfirmModal from '../../components/ConfirmModal';

interface TripItem {
  id: string;
  title: string;
  destination_city: string;
  start_date: string;
  end_date: string;
  budget_total: number;
  status: string;
  preferences?: any;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { session, user, profile, signOut, refreshProfile } = useAuth();
  const [trips, setTrips] = useState<TripItem[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Tab & Posts State
  const [activeTab, setActiveTab] = useState<'trips' | 'posts'>('trips');
  const [myPosts, setMyPosts] = useState<any[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [showCreatePostModal, setShowCreatePostModal] = useState(false);
  const [previewGallery, setPreviewGallery] = useState<{ images: string[]; activeIndex: number } | null>(null);
  const [postToDelete, setPostToDelete] = useState<{ id: string; place_name: string } | null>(null);

  const [userPrefs, setUserPrefs] = useState<string[]>([]);
  const [customPrefInput, setCustomPrefInput] = useState('');
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    if (profile?.preferences && Array.isArray(profile.preferences)) {
      setUserPrefs(profile.preferences);
    } else {
      setUserPrefs([
        '🌿 Thiên nhiên & Sinh thái',
        '☕ Cà phê view đẹp',
        '🍜 Ẩm thực & Đặc sản',
        '📸 Check-in sống ảo',
      ]);
    }
  }, [profile?.preferences]);

  const togglePreference = (prefLabel: string) => {
    setUserPrefs((prev) =>
      prev.includes(prefLabel)
        ? prev.filter((p) => p !== prefLabel)
        : [...prev, prefLabel]
    );
  };

  const handleAddCustomPreference = () => {
    if (!customPrefInput.trim()) return;
    const cleanTag = customPrefInput.trim();
    if (!userPrefs.includes(cleanTag)) {
      setUserPrefs((prev) => [...prev, cleanTag]);
    }
    setCustomPrefInput('');
  };

  const handleSavePreferences = async () => {
    if (!user?.id) return;
    setSavingPrefs(true);
    try {
      await supabase
        .from('profiles')
        .update({ preferences: userPrefs })
        .eq('id', user.id);

      await refreshProfile();
    } catch (err) {
      console.error('Lỗi khi lưu sở thích:', err);
    } finally {
      setSavingPrefs(false);
    }
  };

  const isWeb = Platform.OS === 'web';

  const loadProfileData = async () => {
    if (!user?.id) return;
    try {
      setLoadingTrips(true);
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setTrips(data);
      }
    } catch (err) {
      console.error('Lỗi lấy danh sách chuyến đi:', err);
    } finally {
      setLoadingTrips(false);
    }
  };

  const loadMyPosts = async () => {
    if (!user?.id) return;
    try {
      setLoadingPosts(true);
      const res = await api.get('/posts/my-posts');
      if (res.data?.posts) {
        setMyPosts(res.data.posts);
      }
    } catch (err) {
      console.error('Lỗi lấy bài viết của tôi:', err);
    } finally {
      setLoadingPosts(false);
    }
  };

  useEffect(() => {
    loadProfileData();
    loadMyPosts();
  }, [user?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshProfile();
    await Promise.all([loadProfileData(), loadMyPosts()]);
    setRefreshing(false);
  };

  const preferencesList: string[] = (profile as any)?.preferences || [
    '🌿 Du lịch chữa lành',
    '☕ Cà phê view đẹp',
    '🍜 Khám phá ẩm thực',
    '📸 Check-in sống ảo',
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#FBF5EA' }}>
      {/* Header Bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: isWeb ? 20 : 48,
          paddingBottom: 16,
          backgroundColor: '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(27,36,32,0.08)',
        }}
      >
        <Pressable
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace((APP_ROUTES.TRIPS || '/(app)/chuyen-di') as any);
            }
          }}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={20} color="#1B2420" />
            <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 14, color: '#1B2420' }}>
              Quay lại
            </Text>
          </View>
        </Pressable>

        <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 17, color: '#1B2420' }}>
          Hồ Sơ Cá Nhân
        </Text>

        <Pressable
          onPress={signOut}
          style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
        >
          <LogOut size={20} color="#B23B3B" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 24, maxWidth: 800, alignSelf: 'center', width: '100%' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1F6F54']} />}
      >
        {/* Profile Card */}
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            padding: 24,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: 'rgba(27,36,32,0.08)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.04,
            shadowRadius: 12,
            marginBottom: 24,
          }}
        >
          {profile?.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={{ width: 88, height: 88, borderRadius: 44, marginBottom: 14, borderWidth: 3, borderColor: '#1F6F54' }}
            />
          ) : (
            <View
              style={{
                width: 88,
                height: 88,
                borderRadius: 44,
                backgroundColor: 'rgba(31,111,84,0.1)',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 14,
                borderWidth: 2,
                borderColor: '#1F6F54',
              }}
            >
              <User size={40} color="#1F6F54" />
            </View>
          )}

          <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 22, color: '#1B2420', marginBottom: 4 }}>
            {profile?.full_name || 'Người dùng ViVu'}
          </Text>
          <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 13, color: '#6E7B70', marginBottom: 12 }}>
            {user?.email || 'Chưa cập nhật email'}
          </Text>

          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: 'rgba(31,111,84,0.1)' }}>
              <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 12, color: '#1F6F54' }}>
                {profile?.is_premium ? '⭐ Thành viên Premium' : '🌱 Thành viên Miễn phí'}
              </Text>
            </View>
          </View>
        </View>

        {/* Preferences Section */}
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            padding: 20,
            borderWidth: 1,
            borderColor: 'rgba(27,36,32,0.08)',
            marginBottom: 24,
            gap: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Heart size={18} color="#E2703A" />
              <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 16, color: '#1B2420' }}>
                Sở Thích Du Lịch ({userPrefs.length})
              </Text>
            </View>

            <Pressable
              onPress={handleSavePreferences}
              disabled={savingPrefs}
              style={({ pressed }) => [{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 100,
                backgroundColor: '#1F6F54',
                opacity: pressed || savingPrefs ? 0.8 : 1,
              }]}
            >
              <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 12, color: '#FFFFFF' }}>
                {savingPrefs ? 'Đang lưu...' : 'Lưu sở thích'}
              </Text>
            </Pressable>
          </View>

          <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 12, color: '#6E7B70' }}>
            Chọn hoặc tự nhập thêm các sở thích cá nhân để Gemini AI cá nhân hóa chuyến đi cho bạn:
          </Text>

          {/* Preset 18 Tags Grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {PREFERENCE_OPTIONS.map((opt) => {
              const isSelected = userPrefs.includes(opt.label);
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => togglePreference(opt.label)}
                  style={({ pressed }) => [{
                    paddingHorizontal: 13,
                    paddingVertical: 7,
                    borderRadius: 100,
                    backgroundColor: isSelected ? '#1F6F54' : '#F3ECDC',
                    borderWidth: 1,
                    borderColor: isSelected ? '#1F6F54' : 'rgba(27,36,32,0.08)',
                    opacity: pressed ? 0.8 : 1,
                  }]}
                >
                  <Text
                    style={{
                      fontFamily: isSelected ? 'BeVietnamPro_700Bold' : 'BeVietnamPro_600SemiBold',
                      fontSize: 12,
                      color: isSelected ? '#FFFFFF' : '#1B2420',
                    }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}

            {/* Custom User Added Tags */}
            {userPrefs
              .filter((p) => !PREFERENCE_OPTIONS.some((opt) => opt.label === p))
              .map((customTag, idx) => (
                <Pressable
                  key={idx}
                  onPress={() => togglePreference(customTag)}
                  style={({ pressed }) => [{
                    paddingHorizontal: 13,
                    paddingVertical: 7,
                    borderRadius: 100,
                    backgroundColor: '#E2703A',
                    opacity: pressed ? 0.8 : 1,
                  }]}
                >
                  <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 12, color: '#FFFFFF' }}>
                    ✨ {customTag} ✕
                  </Text>
                </Pressable>
              ))}
          </View>

          {/* Custom Tag Input */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <TextInput
              value={customPrefInput}
              onChangeText={setCustomPrefInput}
              placeholder="Tự nhập sở thích riêng (VD: Bắn cung, Nông trại...)"
              style={{
                flex: 1,
                backgroundColor: '#FBF5EA',
                borderWidth: 1,
                borderColor: 'rgba(27,36,32,0.12)',
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 7,
                fontFamily: 'BeVietnamPro_400Regular',
                fontSize: 13,
                color: '#1B2420',
              }}
            />
            <Pressable
              onPress={handleAddCustomPreference}
              disabled={!customPrefInput.trim()}
              style={({ pressed }) => [{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 10,
                backgroundColor: '#E2703A',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed || !customPrefInput.trim() ? 0.7 : 1,
              }]}
            >
              <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 12, color: '#FFFFFF' }}>
                + Thêm
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Tab Switcher: Chuyến Đi & Bài Đánh Giá */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <Pressable
            testID="tab-profile-trips"
            onPress={() => setActiveTab('trips')}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 14,
              backgroundColor: activeTab === 'trips' ? '#1F6F54' : '#FFFFFF',
              borderWidth: 1,
              borderColor: activeTab === 'trips' ? '#1F6F54' : 'rgba(27,36,32,0.1)',
              alignItems: 'center',
              cursor: 'pointer' as any,
            }}
          >
            <Text
              style={{
                fontFamily: 'BeVietnamPro_700Bold',
                fontSize: 13,
                color: activeTab === 'trips' ? '#FFFFFF' : '#1B2420',
              }}
            >
              🗺️ Chuyến Đi ({trips.length})
            </Text>
          </Pressable>

          <Pressable
            testID="tab-profile-posts"
            onPress={() => setActiveTab('posts')}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 14,
              backgroundColor: activeTab === 'posts' ? '#1F6F54' : '#FFFFFF',
              borderWidth: 1,
              borderColor: activeTab === 'posts' ? '#1F6F54' : 'rgba(27,36,32,0.1)',
              alignItems: 'center',
              cursor: 'pointer' as any,
            }}
          >
            <Text
              style={{
                fontFamily: 'BeVietnamPro_700Bold',
                fontSize: 13,
                color: activeTab === 'posts' ? '#FFFFFF' : '#1B2420',
              }}
            >
              ✍️ Bài Đánh Giá ({myPosts.length})
            </Text>
          </Pressable>
        </View>

        {/* TAB 1: Danh Sách Chuyến Đi */}
        {activeTab === 'trips' && (
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MapPin size={18} color="#1F6F54" />
                <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 16, color: '#1B2420' }}>
                  Danh Sách Chuyến Đi ({trips.length})
                </Text>
              </View>

              <Pressable
                onPress={() => router.push('/(app)/chuyen-di/moi' as any)}
                style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: '#1F6F54' }}>
                  <Sparkles size={13} color="#FFFFFF" />
                  <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 12, color: '#FFFFFF' }}>Tạo Mới</Text>
                </View>
              </Pressable>
            </View>

            {loadingTrips ? (
              <ActivityIndicator size="small" color="#1F6F54" style={{ marginVertical: 20 }} />
            ) : trips.length === 0 ? (
              <View
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 16,
                  padding: 24,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: 'rgba(27,36,32,0.08)',
                }}
              >
                <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 14, color: '#6E7B70', textAlign: 'center', marginBottom: 12 }}>
                  Bạn chưa khởi tạo chuyến đi nào. Hãy bắt đầu lên kế hoạch ngay!
                </Text>
                <Pressable
                  onPress={() => router.push('/(app)/chuyen-di/moi' as any)}
                  style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 100, backgroundColor: '#1F6F54' }}
                >
                  <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 13, color: '#FFFFFF' }}>Tạo chuyến đi đầu tiên</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {trips.map((trip) => (
                  <Pressable
                    key={trip.id}
                    onPress={() => router.push(`/(app)/chuyen-di/${trip.id}` as any)}
                    style={({ pressed }) => [{
                      backgroundColor: '#FFFFFF',
                      borderRadius: 16,
                      padding: 16,
                      borderWidth: 1,
                      borderColor: 'rgba(27,36,32,0.08)',
                      opacity: pressed ? 0.9 : 1,
                      transform: [{ scale: pressed ? 0.99 : 1 }],
                    }]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 15, color: '#1B2420' }}>
                          {trip.title || `Chuyến đi ${trip.destination_city}`}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <MapPin size={13} color="#6E7B70" />
                            <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 12, color: '#6E7B70' }}>
                              {trip.destination_city}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Calendar size={13} color="#6E7B70" />
                            <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 12, color: '#6E7B70' }}>
                              {trip.start_date} - {trip.end_date}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <ChevronRight size={18} color="#6E7B70" />
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {/* TAB 2: Danh Sách Bài Đánh Giá Đã Đăng */}
        {activeTab === 'posts' && (
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Star size={18} color="#E2703A" fill="#E2703A" />
                <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 16, color: '#1B2420' }}>
                  Bài Đánh Giá Của Bạn ({myPosts.length})
                </Text>
              </View>

              <Pressable
                testID="btn-profile-create-post"
                onPress={() => setShowCreatePostModal(true)}
                style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: '#1F6F54' }}>
                  <Plus size={13} color="#FFFFFF" />
                  <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 12, color: '#FFFFFF' }}>Đăng Bài Mới</Text>
                </View>
              </Pressable>
            </View>

            {loadingPosts ? (
              <ActivityIndicator size="small" color="#1F6F54" style={{ marginVertical: 20 }} />
            ) : myPosts.length === 0 ? (
              <View
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 16,
                  padding: 28,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: 'rgba(27,36,32,0.08)',
                  gap: 10,
                }}
              >
                <Text style={{ fontSize: 32 }}>✍️</Text>
                <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 15, color: '#1B2420' }}>
                  Bạn chưa đăng bài đánh giá nào
                </Text>
                <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 13, color: '#6E7B70', textAlign: 'center', maxWidth: 400 }}>
                  Hãy đóng góp đánh giá về các khách sạn, quán ăn, quán cà phê hoặc điểm tham quan bạn từng trải nghiệm để hỗ trợ cộng đồng ViVu!
                </Text>
                <Pressable
                  onPress={() => setShowCreatePostModal(true)}
                  style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 100, backgroundColor: '#1F6F54', marginTop: 4 }}
                >
                  <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 13, color: '#FFFFFF' }}>Đăng bài đầu tiên ngay</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 14 }}>
                {myPosts.map((post) => {
                  const catMeta = POST_CATEGORIES.find((c) => c.id === post.category) || {
                    id: 'other',
                    label: 'Khác',
                    icon: '🏷️',
                    color: '#6B7280',
                    bg: '#F3F4F6',
                  };

                  return (
                    <View
                      key={post.id}
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 18,
                        padding: 18,
                        borderWidth: 1,
                        borderColor: 'rgba(27,36,32,0.08)',
                        gap: 12,
                      }}
                    >
                      {/* Place & Delete */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View style={{ flex: 1, gap: 4 }}>
                          <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 17, color: '#1B2420' }}>
                            {post.place_name}
                          </Text>

                          {/* 2 Tags Bắt Buộc */}
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                              <MapPin size={11} color="#2E7D32" />
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#1B5E20' }}>
                                {post.province}
                              </Text>
                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: catMeta.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                              <Text style={{ fontSize: 11 }}>{catMeta.icon}</Text>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: catMeta.color }}>
                                {catMeta.label}
                              </Text>
                            </View>

                            <View style={{ backgroundColor: post.place_status === 'closed' ? '#FEE2E2' : '#F0FDF4', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: post.place_status === 'closed' ? '#991B1B' : '#166534' }}>
                                {post.place_status === 'closed' ? '🔴 Đã đóng cửa' : '🟢 Đang hoạt động'}
                              </Text>
                            </View>
                          </View>
                        </View>

                        <Pressable
                          onPress={() => setPostToDelete({ id: post.id, place_name: post.place_name })}
                          style={{ padding: 6, cursor: 'pointer' as any }}
                        >
                          <Trash2 size={16} color="#DC2626" />
                        </Pressable>
                      </View>

                      {/* Stars & Cost */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ flexDirection: 'row', gap: 2 }}>
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              size={14}
                              color={s <= post.rating ? '#F59E0B' : '#CBD5E1'}
                              fill={s <= post.rating ? '#F59E0B' : 'none'}
                            />
                          ))}
                        </View>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#B45309' }}>
                          {post.rating}.0 / 5.0
                        </Text>
                        {post.cost_per_person > 0 && (
                          <Text style={{ fontSize: 12, color: '#475569', marginLeft: 8 }}>
                            · 💰 ~{Number(post.cost_per_person).toLocaleString('vi-VN')} đ / người
                          </Text>
                        )}
                      </View>

                      {/* Content */}
                      <Text style={{ fontSize: 13, color: '#334155', lineHeight: 20 }}>
                        {post.content}
                      </Text>

                      {/* Aspects */}
                      {post.aspects && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {post.aspects.quality && (
                            <View style={{ backgroundColor: '#F8FAFC', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, borderWidth: 1, borderColor: '#E2E8F0' }}>
                              <Text style={{ fontSize: 10, color: '#475569' }}>💎 {post.aspects.quality}</Text>
                            </View>
                          )}
                          {post.aspects.service && (
                            <View style={{ backgroundColor: '#F8FAFC', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, borderWidth: 1, borderColor: '#E2E8F0' }}>
                              <Text style={{ fontSize: 10, color: '#475569' }}>🛎️ {post.aspects.service}</Text>
                            </View>
                          )}
                          {post.aspects.atmosphere && (
                            <View style={{ backgroundColor: '#F8FAFC', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, borderWidth: 1, borderColor: '#E2E8F0' }}>
                              <Text style={{ fontSize: 10, color: '#475569' }}>🌿 {post.aspects.atmosphere}</Text>
                            </View>
                          )}
                          {post.aspects.parking && (
                            <View style={{ backgroundColor: '#F8FAFC', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5, borderWidth: 1, borderColor: '#E2E8F0' }}>
                              <Text style={{ fontSize: 10, color: '#475569' }}>🚗 {post.aspects.parking}</Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Media Thumbnails */}
                      {post.media_urls && post.media_urls.length > 0 && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                          {post.media_urls.map((url: string, i: number) => (
                            <Pressable
                              key={i}
                              onPress={() => setPreviewGallery({ images: post.media_urls, activeIndex: i })}
                              style={{
                                width: 72,
                                height: 72,
                                borderRadius: 10,
                                overflow: 'hidden',
                                borderWidth: 1,
                                borderColor: '#E2E8F0',
                                cursor: 'pointer' as any,
                              }}
                            >
                              <Image
                                source={{ uri: url }}
                                style={{ width: '100%', height: '100%' }}
                                resizeMode="cover"
                              />
                            </Pressable>
                          ))}
                        </View>
                      )}

                      {/* Google Maps Link Button */}
                      {post.google_maps_url ? (
                        <Pressable
                          onPress={() => {
                            if (Platform.OS === 'web') {
                              window.open(post.google_maps_url, '_blank');
                            } else {
                              Linking.openURL(post.google_maps_url);
                            }
                          }}
                          style={({ pressed }) => [{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            alignSelf: 'flex-start',
                            backgroundColor: '#F0FDF4',
                            borderWidth: 1,
                            borderColor: '#BBF7D0',
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 6,
                            marginTop: 4,
                            cursor: 'pointer' as any,
                            opacity: pressed ? 0.8 : 1,
                          }]}
                        >
                          <ExternalLink size={13} color="#166534" />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#166534' }}>
                            Xem trên Google Maps
                          </Text>
                        </Pressable>
                      ) : null}

                      {/* Reaction and Comments Count Summary */}
                      {((post.reactions?.total || 0) > 0 || (post.comments_count || 0) > 0) && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                          {(post.reactions?.total || 0) > 0 && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <ThumbsUp size={13} color="#1877F2" />
                              <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B' }}>
                                {post.reactions.total} cảm xúc
                              </Text>
                            </View>
                          )}
                          {(post.comments_count || 0) > 0 && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <MessageSquare size={13} color="#64748B" />
                              <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B' }}>
                                {post.comments_count} bình luận
                              </Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Modal Đăng Bài */}
      <CreatePostModal
        visible={showCreatePostModal}
        onClose={() => setShowCreatePostModal(false)}
        onSuccess={() => {
          loadMyPosts();
        }}
      />

      {/* Modal Xem Bộ Sưu Tập Ảnh */}
      {previewGallery && (
        <Modal visible={!!previewGallery} transparent animationType="fade" onRequestClose={() => setPreviewGallery(null)}>
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.92)',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 16,
            }}
          >
            {/* Top Toolbar */}
            <View
              style={{
                position: 'absolute',
                top: 20,
                left: 20,
                right: 20,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                zIndex: 10,
              }}
            >
              <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
                  Ảnh {previewGallery.activeIndex + 1} / {previewGallery.images.length}
                </Text>
              </View>

              <Pressable
                onPress={() => setPreviewGallery(null)}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.25)',
                  borderRadius: 20,
                  padding: 8,
                  cursor: 'pointer' as any,
                }}
              >
                <X size={20} color="#FFFFFF" />
              </Pressable>
            </View>

            {/* Main Image with Navigation Arrows */}
            <View style={{ width: '100%', maxWidth: 900, height: '70%', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
              <Image
                source={{ uri: previewGallery.images[previewGallery.activeIndex] }}
                style={{ width: '100%', height: '100%', borderRadius: 12 }}
                resizeMode="contain"
              />

              {/* Prev Button */}
              {previewGallery.images.length > 1 && (
                <Pressable
                  onPress={() =>
                    setPreviewGallery((prev) =>
                      prev ? { ...prev, activeIndex: (prev.activeIndex - 1 + prev.images.length) % prev.images.length } : null
                    )
                  }
                  style={{
                    position: 'absolute',
                    left: 12,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    borderRadius: 30,
                    padding: 10,
                    cursor: 'pointer' as any,
                  }}
                >
                  <ChevronLeft size={24} color="#FFFFFF" />
                </Pressable>
              )}

              {/* Next Button */}
              {previewGallery.images.length > 1 && (
                <Pressable
                  onPress={() =>
                    setPreviewGallery((prev) =>
                      prev ? { ...prev, activeIndex: (prev.activeIndex + 1) % prev.images.length } : null
                    )
                  }
                  style={{
                    position: 'absolute',
                    right: 12,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    borderRadius: 30,
                    padding: 10,
                    cursor: 'pointer' as any,
                  }}
                >
                  <ChevronRight size={24} color="#FFFFFF" />
                </Pressable>
              )}
            </View>

            {/* Bottom Thumbnail Strip */}
            {previewGallery.images.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingHorizontal: 16, marginTop: 16 }}
                style={{ maxHeight: 70 }}
              >
                {previewGallery.images.map((img, i) => (
                  <Pressable
                    key={i}
                    onPress={() => setPreviewGallery((prev) => (prev ? { ...prev, activeIndex: i } : null))}
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 8,
                      overflow: 'hidden',
                      borderWidth: 2,
                      borderColor: previewGallery.activeIndex === i ? '#3B82F6' : 'transparent',
                      opacity: previewGallery.activeIndex === i ? 1 : 0.6,
                      cursor: 'pointer' as any,
                    }}
                  >
                    <Image source={{ uri: img }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </Modal>
      )}

      {/* Modal Xác Nhận Xóa Bài */}
      {postToDelete && (
        <ConfirmModal
          visible={!!postToDelete}
          title="Xác nhận xóa bài đánh giá"
          message={`Bạn có chắc chắn muốn xóa bài đánh giá về "${postToDelete.place_name}" không?`}
          isDestructive
          onConfirm={async () => {
            if (postToDelete) {
              try {
                await api.delete(`/posts/${postToDelete.id}`);
                setMyPosts((prev) => prev.filter((p) => p.id !== postToDelete.id));
                setPostToDelete(null);
              } catch (err: any) {
                Alert.alert('Lỗi', err.response?.data?.error || 'Không thể xóa');
                setPostToDelete(null);
              }
            }
          }}
          onCancel={() => setPostToDelete(null)}
        />
      )}
    </View>
  );
}
