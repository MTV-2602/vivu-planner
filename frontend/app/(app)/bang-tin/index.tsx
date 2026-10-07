import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
  TextInput,
  Platform,
  Alert,
  Modal,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Compass,
  MapPin,
  Tag,
  Star,
  Plus,
  ArrowLeft,
  Search,
  Filter,
  Trash2,
  Share2,
  Clock,
  DollarSign,
  CheckCircle2,
  X,
  User,
  Sparkles,
  ExternalLink,
  MessageSquare,
  ThumbsUp,
  ChevronLeft,
  ChevronRight,
  Send,
  Camera,
  Smile,
  ImageIcon,
  Heart,
  SmilePlus,
  Flag,
} from 'lucide-react-native';
import { useAuth } from '../../../hooks/useAuth';
import { api } from '../../../lib/api';
import SystemClock from '../../../components/SystemClock';
import CreatePostModal from '../../../components/CreatePostModal';
import ConfirmModal from '../../../components/ConfirmModal';
import ReportModal from '../../../components/ReportModal';
import PhotoTheaterModal from '../../../components/PhotoTheaterModal';
import ReactionsListModal from '../../../components/ReactionsListModal';
import {
  BRAND_COLORS,
  APP_ROUTES,
  VIETNAM_PROVINCES,
  POST_CATEGORIES,
} from '../../../constants';

const FB_REACTIONS: { id: string; label: string; emoji: string; color: string }[] = [
  { id: 'like', label: 'Thích', emoji: '👍', color: '#1877F2' },
  { id: 'love', label: 'Yêu thích', emoji: '❤️', color: '#FA383E' },
  { id: 'care', label: 'Thương thương', emoji: '🥰', color: '#F7B125' },
  { id: 'haha', label: 'Haha', emoji: '😆', color: '#F7B125' },
  { id: 'wow', label: 'Wow', emoji: '😮', color: '#F7B125' },
  { id: 'sad', label: 'Buồn', emoji: '😢', color: '#F7B125' },
  { id: 'angry', label: 'Phẫn nộ', emoji: '😡', color: '#E9710F' },
];

const COMMENT_EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
  '😍', '🥰', '😘', '😋', '😜', '🤩', '🥳', '😎', '🥺', '😭',
  '😱', '🤯', '😴', '🤤', '👍', '👎', '👏', '🙌', '🫶', '❤️',
  '💖', '🔥', '💯', '✨', '☕', '🧋', '🍜', '🍲', '🍕', '🍰',
  '🏖️', '🏕️', '✈️', '🛵', '🎉', '🌟', '🌈', '📸', '🗺️', '🛵',
];

const CURATED_GIFS = [
  { id: 'g1', title: 'Tuyệt vời', url: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif' },
  { id: 'g2', title: 'Ngon tuyệt cú mèo', url: 'https://media.giphy.com/media/3q3QK6KyDVUBzih7hB/giphy.gif' },
  { id: 'g3', title: 'Thả tim yêu thương', url: 'https://media.giphy.com/media/osjgQPWRx3cac/giphy.gif' },
  { id: 'g4', title: 'Vỗ tay tán thưởng', url: 'https://media.giphy.com/media/NEvPzZ8bd1V4Y/giphy.gif' },
  { id: 'g5', title: 'Cười ngất', url: 'https://media.giphy.com/media/ltIFdjNAasOwVvKhvx/giphy.gif' },
  { id: 'g6', title: 'Xách ba lô lên và đi', url: 'https://media.giphy.com/media/3o7btQ8jDTPGDpgc6I/giphy.gif' },
  { id: 'g7', title: 'Cạn ly nào', url: 'https://media.giphy.com/media/QMkPpxPDYY0fu/giphy.gif' },
  { id: 'g8', title: 'Wow bất ngờ', url: 'https://media.giphy.com/media/oYtVHSxngR3lC/giphy.gif' },
  { id: 'g9', title: 'Đói bụng thèm ăn', url: 'https://media.giphy.com/media/12uXi1GXBibALC/giphy.gif' },
  { id: 'g10', title: 'Chúc mừng', url: 'https://media.giphy.com/media/g9582DNuQppxC/giphy.gif' },
  { id: 'g11', title: 'Lên đồ du lịch', url: 'https://media.giphy.com/media/26FPLMDDN5fJCir0A/giphy.gif' },
  { id: 'g12', title: 'Chill thư giãn', url: 'https://media.giphy.com/media/l41lI4bYmcsPJX9Go/giphy.gif' },
];

const CURATED_STICKERS = [
  { id: 's1', name: 'Thả tim', url: 'https://api.iconify.design/fluent-emoji:smiling-face-with-heart-eyes.svg' },
  { id: 's2', name: 'Gấu cưng', url: 'https://api.iconify.design/fluent-emoji:bear.svg' },
  { id: 's3', name: 'Cún đáng yêu', url: 'https://api.iconify.design/fluent-emoji:dog-face.svg' },
  { id: 's4', name: 'Mèo cười', url: 'https://api.iconify.design/fluent-emoji:cat-with-wry-smile.svg' },
  { id: 's5', name: 'Tô phở nóng', url: 'https://api.iconify.design/fluent-emoji:steaming-bowl.svg' },
  { id: 's6', name: 'Trà sữa trân châu', url: 'https://api.iconify.design/fluent-emoji:bubble-tea.svg' },
  { id: 's7', name: 'Cà phê sáng', url: 'https://api.iconify.design/fluent-emoji:hot-beverage.svg' },
  { id: 's8', name: 'Balo phượt', url: 'https://api.iconify.design/fluent-emoji:backpack.svg' },
  { id: 's9', name: 'Vali vi vu', url: 'https://api.iconify.design/fluent-emoji:luggage.svg' },
  { id: 's10', name: 'Máy bay', url: 'https://api.iconify.design/fluent-emoji:airplane-departure.svg' },
  { id: 's11', name: 'Bãi biển', url: 'https://api.iconify.design/fluent-emoji:beach-with-umbrella.svg' },
  { id: 's12', name: 'Like to bự', url: 'https://api.iconify.design/fluent-emoji:thumbs-up.svg' },
  { id: 's13', name: 'Trái tim rực cháy', url: 'https://api.iconify.design/fluent-emoji:heart-on-fire.svg' },
  { id: 's14', name: 'Pháo hoa', url: 'https://api.iconify.design/fluent-emoji:party-popper.svg' },
  { id: 's15', name: 'Đèn lồng', url: 'https://api.iconify.design/fluent-emoji:red-paper-lantern.svg' },
  { id: 's16', name: 'Lấp lánh', url: 'https://api.iconify.design/fluent-emoji:sparkles.svg' },
];

export default function CommunityFeedScreen() {
  const router = useRouter();
  const { user, profile, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  // Filter States (2 tag bắt buộc)
  const [selectedProvince, setSelectedProvince] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [photoTheater, setPhotoTheater] = useState<{ post: any; activeIndex: number } | null>(null);
  const [postToDelete, setPostToDelete] = useState<{ id: string; place_name: string } | null>(null);
  const [postToReport, setPostToReport] = useState<{ id: string; place_name: string } | null>(null);
  const [showReactionsModalFor, setShowReactionsModalFor] = useState<{ id: string; total: number } | null>(null);

  // Facebook Reactions Hover & Popover States
  const [hoverReactionPostId, setHoverReactionPostId] = useState<string | null>(null);
  const [hoveredReactionEmoji, setHoveredReactionEmoji] = useState<string | null>(null);
  const reactionLeaveTimerRef = React.useRef<any>(null);

  // Facebook Comments States
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [commentMediaAttachments, setCommentMediaAttachments] = useState<
    Record<string, { type: 'image' | 'gif' | 'sticker'; url: string } | null>
  >({});
  const [activeCommentToolbar, setActiveCommentToolbar] = useState<
    Record<string, 'emoji' | 'gif' | 'sticker' | null>
  >({});
  const [isUploadingCommentMedia, setIsUploadingCommentMedia] = useState<Record<string, boolean>>({});
  const [commentLikes, setCommentLikes] = useState<Record<string, boolean>>({});

  const renderMediaGallery = (post: any) => {
    const mediaUrls = post?.media_urls;
    if (!mediaUrls || mediaUrls.length === 0) return null;
    const count = mediaUrls.length;

    // 1 ảnh: 1 ảnh lớn bo góc 14px
    if (count === 1) {
      return (
        <Pressable
          testID={`post-img-${post.id}-0`}
          onPress={() => setPhotoTheater({ post, activeIndex: 0 })}
          style={{ width: '100%', height: 280, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', cursor: 'pointer' as any }}
        >
          <Image source={{ uri: mediaUrls[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        </Pressable>
      );
    }

    // 2 ảnh: 2 cột bằng nhau (hàng ngang cao 220px)
    if (count === 2) {
      return (
        <View style={{ flexDirection: 'row', gap: 8, height: 220 }}>
          {mediaUrls.map((url: string, i: number) => (
            <Pressable
              key={i}
              testID={`post-img-${post.id}-${i}`}
              onPress={() => setPhotoTheater({ post, activeIndex: i })}
              style={{ flex: 1, height: '100%', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', cursor: 'pointer' as any }}
            >
              <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </Pressable>
          ))}
        </View>
      );
    }

    // 3 ảnh: 1 ảnh bên trái, 2 ảnh bên phải (hàng ngang cao 240px)
    if (count === 3) {
      return (
        <View style={{ flexDirection: 'row', gap: 8, height: 240 }}>
          <Pressable
            testID={`post-img-${post.id}-0`}
            onPress={() => setPhotoTheater({ post, activeIndex: 0 })}
            style={{ flex: 1.3, height: '100%', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', cursor: 'pointer' as any }}
          >
            <Image source={{ uri: mediaUrls[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </Pressable>
          <View style={{ flex: 1, gap: 8, height: '100%' }}>
            <Pressable
              testID={`post-img-${post.id}-1`}
              onPress={() => setPhotoTheater({ post, activeIndex: 1 })}
              style={{ flex: 1, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', cursor: 'pointer' as any }}
            >
              <Image source={{ uri: mediaUrls[1] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </Pressable>
            <Pressable
              testID={`post-img-${post.id}-2`}
              onPress={() => setPhotoTheater({ post, activeIndex: 2 })}
              style={{ flex: 1, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', cursor: 'pointer' as any }}
            >
              <Image source={{ uri: mediaUrls[2] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </Pressable>
          </View>
        </View>
      );
    }

    // 4 ảnh: lưới 2x2
    if (count === 4) {
      return (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8, height: 160 }}>
            <Pressable
              testID={`post-img-${post.id}-0`}
              onPress={() => setPhotoTheater({ post, activeIndex: 0 })}
              style={{ flex: 1, height: '100%', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', cursor: 'pointer' as any }}
            >
              <Image source={{ uri: mediaUrls[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </Pressable>
            <Pressable
              testID={`post-img-${post.id}-1`}
              onPress={() => setPhotoTheater({ post, activeIndex: 1 })}
              style={{ flex: 1, height: '100%', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', cursor: 'pointer' as any }}
            >
              <Image source={{ uri: mediaUrls[1] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, height: 160 }}>
            <Pressable
              testID={`post-img-${post.id}-2`}
              onPress={() => setPhotoTheater({ post, activeIndex: 2 })}
              style={{ flex: 1, height: '100%', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', cursor: 'pointer' as any }}
            >
              <Image source={{ uri: mediaUrls[2] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </Pressable>
            <Pressable
              testID={`post-img-${post.id}-3`}
              onPress={() => setPhotoTheater({ post, activeIndex: 3 })}
              style={{ flex: 1, height: '100%', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', cursor: 'pointer' as any }}
            >
              <Image source={{ uri: mediaUrls[3] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </Pressable>
          </View>
        </View>
      );
    }

    // >= 5 ảnh (Chuẩn Facebook như Hình 1):
    // Chia thành 2 cột:
    // - Cột trái (chiếm ~55% chiều rộng): 2 ảnh lớn xếp dọc, bo góc đẹp mắt (tổng chiều cao ~380px).
    // - Cột phải (chiếm ~45% chiều rộng): 3 ảnh xếp dọc.
    // - Ảnh thứ 5 (dưới cùng cột phải): Có lớp phủ mờ tối rgba(0,0,0,0.6) và chữ hiển thị số ảnh còn lại +{mediaUrls.length - 4} (như +9 trong Hình 1).
    return (
      <View style={{ flexDirection: 'row', gap: 8, height: 380 }}>
        {/* Cột trái: 2 ảnh lớn xếp dọc (~55% chiều rộng) */}
        <View style={{ flex: 1.22, gap: 8, height: '100%' }}>
          <Pressable
            testID={`post-img-${post.id}-0`}
            onPress={() => setPhotoTheater({ post, activeIndex: 0 })}
            style={{ flex: 1, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', cursor: 'pointer' as any }}
          >
            <Image source={{ uri: mediaUrls[0] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </Pressable>
          <Pressable
            testID={`post-img-${post.id}-1`}
            onPress={() => setPhotoTheater({ post, activeIndex: 1 })}
            style={{ flex: 1, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', cursor: 'pointer' as any }}
          >
            <Image source={{ uri: mediaUrls[1] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </Pressable>
        </View>

        {/* Cột phải: 3 ảnh xếp dọc (~45% chiều rộng) */}
        <View style={{ flex: 1, gap: 8, height: '100%' }}>
          <Pressable
            testID={`post-img-${post.id}-2`}
            onPress={() => setPhotoTheater({ post, activeIndex: 2 })}
            style={{ flex: 1, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', cursor: 'pointer' as any }}
          >
            <Image source={{ uri: mediaUrls[2] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </Pressable>
          <Pressable
            testID={`post-img-${post.id}-3`}
            onPress={() => setPhotoTheater({ post, activeIndex: 3 })}
            style={{ flex: 1, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', cursor: 'pointer' as any }}
          >
            <Image source={{ uri: mediaUrls[3] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </Pressable>
          <Pressable
            testID={`post-img-${post.id}-4`}
            onPress={() => setPhotoTheater({ post, activeIndex: 4 })}
            style={{ flex: 1, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', position: 'relative', cursor: 'pointer' as any }}
          >
            <Image source={{ uri: mediaUrls[4] }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            {count > 5 && (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.6)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: '800' }}>
                  +{count - 4}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>
    );
  };

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch Posts from API
  const {
    data: postsData,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['community-posts', selectedProvince, selectedCategory, debouncedSearch],
    queryFn: async () => {
      const params: any = {};
      if (selectedProvince && selectedProvince !== 'all') params.province = selectedProvince;
      if (selectedCategory && selectedCategory !== 'all') params.category = selectedCategory;
      if (debouncedSearch) params.search = debouncedSearch;

      const res = await api.get('/posts', { params });
      return res.data;
    },
  });

  const posts = postsData?.posts || [];
  const currentTheaterPost = photoTheater
    ? (posts.find((p: any) => p.id === photoTheater.post.id) || photoTheater.post)
    : null;

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (postId: string) => {
      await api.delete(`/posts/${postId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      setPostToDelete(null);
    },
    onError: (err: any) => {
      Alert.alert('Lỗi', err.response?.data?.error || 'Không thể xóa bài viết');
      setPostToDelete(null);
    },
  });

  // Facebook Reactions Mutation
  const reactMutation = useMutation({
    mutationFn: async ({ postId, reaction }: { postId: string; reaction: string }) => {
      const res = await api.post(`/posts/${postId}/react`, { type: reaction, reaction });
      return res.data;
    },
    onMutate: async ({ postId, reaction }) => {
      await queryClient.cancelQueries({ queryKey: ['community-posts'] });
      const previousData = queryClient.getQueriesData({ queryKey: ['community-posts'] });

      queryClient.setQueriesData({ queryKey: ['community-posts'] }, (old: any) => {
        if (!old?.posts) return old;
        return {
          ...old,
          posts: old.posts.map((p: any) => {
            if (p.id !== postId) return p;
            const currentReaction = p.reactions?.user_reaction;
            const isToggleOff = currentReaction === reaction;
            const nextReaction = isToggleOff ? null : reaction;

            const prevBy = { ...(p.reactions?.by_type || {}) };
            if (currentReaction && prevBy[currentReaction]) {
              prevBy[currentReaction] = Math.max(0, prevBy[currentReaction] - 1);
            }
            if (nextReaction) {
              prevBy[nextReaction] = (prevBy[nextReaction] || 0) + 1;
            }

            const total = Object.values(prevBy).reduce((sum: number, c: any) => sum + Number(c || 0), 0);

            return {
              ...p,
              reactions: {
                total,
                by_type: prevBy,
                user_reaction: nextReaction,
              },
            };
          }),
        };
      });

      setHoverReactionPostId(null);
      setHoveredReactionEmoji(null);
      return { previousData };
    },
    onError: (err: any, _, context: any) => {
      if (context?.previousData) {
        context.previousData.forEach(([key, val]: any) => {
          queryClient.setQueryData(key, val);
        });
      }
      Alert.alert('Lỗi', err.response?.data?.error || 'Không thể tương tác cảm xúc');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
    },
  });

  const handleMouseEnterLike = (postId: string) => {
    if (reactionLeaveTimerRef.current) {
      clearTimeout(reactionLeaveTimerRef.current);
      reactionLeaveTimerRef.current = null;
    }
    setHoverReactionPostId(postId);
  };

  const handleMouseLeaveLike = () => {
    if (reactionLeaveTimerRef.current) {
      clearTimeout(reactionLeaveTimerRef.current);
    }
    reactionLeaveTimerRef.current = setTimeout(() => {
      setHoverReactionPostId(null);
      setHoveredReactionEmoji(null);
    }, 350);
  };

  // Comments Mutations
  const addCommentMutation = useMutation({
    mutationFn: async ({
      postId,
      content,
      media_url,
      media_type,
    }: {
      postId: string;
      content?: string;
      media_url?: string;
      media_type?: 'image' | 'gif' | 'sticker';
    }) => {
      const res = await api.post(`/posts/${postId}/comments`, { content, media_url, media_type });
      return res.data;
    },
    onSuccess: (_, variables) => {
      setCommentInputs((prev) => ({ ...prev, [variables.postId]: '' }));
      setCommentMediaAttachments((prev) => ({ ...prev, [variables.postId]: null }));
      setActiveCommentToolbar((prev) => ({ ...prev, [variables.postId]: null }));
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
    },
    onError: (err: any) => {
      Alert.alert('Lỗi', err.response?.data?.error || 'Không thể đăng bình luận');
    },
  });

  const handleUploadCommentImage = async (postId: string, file: any) => {
    setIsUploadingCommentMedia((prev) => ({ ...prev, [postId]: true }));
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          const res = await api.post('/posts/upload-media', {
            fileName: file.name,
            fileType: file.type,
            base64,
          });
          if (res.data?.url) {
            setCommentMediaAttachments((prev) => ({
              ...prev,
              [postId]: { type: 'image', url: res.data.url },
            }));
            setExpandedComments((prev) => ({ ...prev, [postId]: true }));
          }
        } catch (err: any) {
          Alert.alert('Lỗi', err.response?.data?.error || 'Không thể tải ảnh đính kèm');
        } finally {
          setIsUploadingCommentMedia((prev) => ({ ...prev, [postId]: false }));
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setIsUploadingCommentMedia((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const triggerCommentImagePicker = (postId: string) => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e: any) => {
        const file = e.target?.files?.[0];
        if (file) {
          handleUploadCommentImage(postId, file);
        }
      };
      input.click();
    } else {
      Alert.alert('Thông báo', 'Tính năng chọn ảnh từ thiết bị hỗ trợ trên trình duyệt web');
    }
  };

  const handleSubmitComment = (postId: string) => {
    const text = (commentInputs[postId] || '').trim();
    const media = commentMediaAttachments[postId];

    if (!text && !media) return;

    addCommentMutation.mutate({
      postId,
      content: text,
      media_url: media?.url,
      media_type: media?.type,
    });
  };

  const deleteCommentMutation = useMutation({
    mutationFn: async ({ postId, commentId }: { postId: string; commentId: string }) => {
      const res = await api.delete(`/posts/${postId}/comments/${commentId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
    },
    onError: (err: any) => {
      Alert.alert('Lỗi', err.response?.data?.error || 'Không thể xóa bình luận');
    },
  });

  const getTopReactionEmojis = (byType: Record<string, number> = {}) => {
    const sorted = Object.entries(byType)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return sorted.map(([type]) => {
      const found = FB_REACTIONS.find((r) => r.id === type);
      return found ? found.emoji : '👍';
    });
  };

  const handleSharePost = (p: any) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(window.location.href);
      }
      Alert.alert('Chia sẻ thành công', `Đã sao chép liên kết bài viết "${p.place_name}" vào khay nhớ tạm!`);
    } else {
      Alert.alert('Chia sẻ', `Chia sẻ bài viết "${p.place_name}"`);
    }
  };

  // Popular quick provinces
  const popularProvinces = [
    'Hà Nội',
    'TP. Hồ Chí Minh',
    'Đà Nẵng',
    'Lâm Đồng',
    'Khánh Hòa',
    'Quảng Ninh',
    'Hội An',
    'Ninh Bình',
  ];

  const handleResetFilters = () => {
    setSelectedProvince('all');
    setSelectedCategory('all');
    setSearchQuery('');
  };

  const isFiltering = selectedProvince !== 'all' || selectedCategory !== 'all' || !!searchQuery;

  // Format date helper
  const formatTimeAgo = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const diffMinutes = Math.floor(diffMs / 60000);
      if (diffMinutes < 1) return 'Vừa xong';
      if (diffMinutes < 60) return `${diffMinutes} phút trước`;
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return `${diffHours} giờ trước`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 30) return `${diffDays} ngày trước`;
      return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short' }).format(new Date(dateStr));
    } catch {
      return '';
    }
  };

  const getCategoryMeta = (catId: string) => {
    return POST_CATEGORIES.find((c) => c.id === catId) || {
      id: 'other',
      label: 'Khác',
      icon: '🏷️',
      color: '#6B7280',
      bg: '#F3F4F6',
    };
  };

  return (
    <View style={{ flex: 1, backgroundColor: BRAND_COLORS.bg }}>
      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <View
        style={{
          backgroundColor: '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(27,36,32,0.08)',
          paddingHorizontal: 24,
          paddingVertical: 14,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Logo & Navigation */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Pressable
              onPress={() => router.push(APP_ROUTES.TRIPS as any)}
              style={({ pressed }) => [{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 10,
                backgroundColor: pressed ? '#F3ECDC' : '#FAF5EA',
                cursor: 'pointer' as any,
              }]}
            >
              <ArrowLeft size={16} color={BRAND_COLORS.text} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_COLORS.text }}>
                Chuyến đi của bạn
              </Text>
            </Pressable>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Compass size={24} color={BRAND_COLORS.primary} />
              <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 18, color: BRAND_COLORS.primary }}>
                Bảng Tin ViVu
              </Text>
            </View>
          </View>

          {/* Right Actions */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <SystemClock />

            {/* Profile Button */}
            <Pressable
              onPress={() => router.push('/(app)/profile' as any)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 100,
                backgroundColor: '#FAF5EA',
                borderWidth: 1,
                borderColor: '#E8DECC',
                cursor: 'pointer' as any,
              }}
            >
              {profile?.avatar_url ? (
                <Image
                  source={{ uri: profile.avatar_url }}
                  style={{ width: 22, height: 22, borderRadius: 11 }}
                />
              ) : (
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: 'rgba(31,111,84,0.15)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <User size={13} color={BRAND_COLORS.primary} />
                </View>
              )}
              <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND_COLORS.text }}>
                {profile?.full_name || 'Hồ sơ'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* ── Main Body ────────────────────────────────────────────────────── */}
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingVertical: 24,
          maxWidth: 960,
          alignSelf: 'center',
          width: '100%',
          gap: 20,
        }}
      >
        {/* ── Hero Banner & Nút Đăng Bài ────────────────────────────────────── */}
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            padding: 24,
            borderWidth: 1,
            borderColor: 'rgba(27,36,32,0.08)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.03)' as any,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <View style={{ flex: 1, minWidth: 280, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  backgroundColor: '#E8F5E9',
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 6,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#1B5E20' }}>
                  CỘNG ĐỒNG DU LỊCH VIVU 🌏
                </Text>
              </View>
            </View>
            <Text
              style={{
                fontFamily: 'Lora_700Bold',
                fontSize: 22,
                color: BRAND_COLORS.text,
              }}
            >
              Bảng Tin Đánh Giá & Chia Sẻ Địa Điểm
            </Text>
            <Text style={{ fontSize: 13, color: BRAND_COLORS.textMuted, lineHeight: 20 }}>
              Khám phá đánh giá chân thực theo phong cách Google Maps: khách sạn, quán ăn ngon, cà phê check-in, tiêu chí phục vụ và chi phí thực tế.
            </Text>
          </View>

          <Pressable
            testID="btn-open-create-post"
            onPress={() => setShowCreateModal(true)}
            style={({ pressed }) => [{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: BRAND_COLORS.primary,
              paddingHorizontal: 22,
              paddingVertical: 14,
              borderRadius: 14,
              boxShadow: '0 4px 14px rgba(31,111,84,0.3)' as any,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
              cursor: 'pointer' as any,
            }]}
          >
            <Plus size={18} color="#FFFFFF" />
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>
              + Đăng Bài Đánh Giá Mới
            </Text>
          </Pressable>
        </View>

        {/* ── BỘ LỌC 2 TẦNG (TAG TỈNH THÀNH + TAG PHÂN LOẠI) ──────────────── */}
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            padding: 20,
            borderWidth: 1,
            borderColor: 'rgba(27,36,32,0.08)',
            gap: 16,
          }}
        >
          {/* Header Bộ lọc & Thanh tìm kiếm */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Filter size={18} color={BRAND_COLORS.primary} />
              <Text style={{ fontSize: 15, fontWeight: '800', color: BRAND_COLORS.text }}>
                Bộ Lọc Tìm Kiếm Đa Tiêu Chí
              </Text>
              {isFiltering && (
                <Pressable
                  onPress={handleResetFilters}
                  style={{
                    backgroundColor: '#FEE2E2',
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 6,
                    cursor: 'pointer' as any,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626' }}>
                    ✕ Đặt lại bộ lọc
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Search Input */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: '#FAF5EA',
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderWidth: 1,
                borderColor: '#E8DECC',
                minWidth: 260,
                flex: 1,
                maxWidth: 400,
              }}
            >
              <Search size={16} color="#6E7B70" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Tìm tên địa điểm, món ăn, tỉnh thành..."
                placeholderTextColor="#94A3B8"
                style={{ flex: 1, fontSize: 13, color: BRAND_COLORS.text }}
              />
              {searchQuery ? (
                <Pressable onPress={() => setSearchQuery('')} style={{ padding: 2 }}>
                  <X size={14} color="#64748B" />
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Tầng 1: Lọc theo Tag Phân Loại */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B' }}>
              📌 Tag Phân loại địa điểm:
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Pressable
                onPress={() => setSelectedCategory('all')}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 10,
                  backgroundColor: selectedCategory === 'all' ? BRAND_COLORS.primary : '#F1F5F9',
                  cursor: 'pointer' as any,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: selectedCategory === 'all' ? '#FFFFFF' : '#475569',
                  }}
                >
                  Tất cả phân loại
                </Text>
              </Pressable>

              {POST_CATEGORIES.map((cat) => {
                const active = selectedCategory === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    testID={`filter-category-${cat.id}`}
                    onPress={() => setSelectedCategory(cat.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 10,
                      backgroundColor: active ? cat.color : '#FFFFFF',
                      borderWidth: 1,
                      borderColor: active ? cat.color : '#E2E8F0',
                      cursor: 'pointer' as any,
                    }}
                  >
                    <Text style={{ fontSize: 13 }}>{cat.icon}</Text>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: active ? '800' : '600',
                        color: active ? '#FFFFFF' : '#334155',
                      }}
                    >
                      {cat.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Tầng 2: Lọc theo Tag Tỉnh Thành */}
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B' }}>
                📍 Tag Tỉnh / Thành phố:
              </Text>
              {Platform.OS === 'web' && (
                <select
                  value={selectedProvince}
                  onChange={(e: any) => setSelectedProvince(e.target.value)}
                  style={{
                    backgroundColor: '#FAF5EA',
                    border: '1px solid #E8DECC',
                    borderRadius: 8,
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: '600',
                    color: BRAND_COLORS.text,
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="all">Tất cả 63 tỉnh thành</option>
                  {VIETNAM_PROVINCES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              )}
            </View>

            {/* Quick popular provinces */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Pressable
                onPress={() => setSelectedProvince('all')}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor: selectedProvince === 'all' ? '#1E293B' : '#F8FAFC',
                  borderWidth: 1,
                  borderColor: selectedProvince === 'all' ? '#1E293B' : '#CBD5E1',
                  cursor: 'pointer' as any,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: selectedProvince === 'all' ? '#FFFFFF' : '#475569',
                  }}
                >
                  Tất cả tỉnh
                </Text>
              </Pressable>

              {popularProvinces.map((prov) => {
                const active = selectedProvince.toLowerCase().includes(prov.toLowerCase());
                return (
                  <Pressable
                    key={prov}
                    onPress={() => setSelectedProvince(prov)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: active ? '#059669' : '#FFFFFF',
                      borderWidth: 1,
                      borderColor: active ? '#059669' : '#E2E8F0',
                      cursor: 'pointer' as any,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: active ? '700' : '500',
                        color: active ? '#FFFFFF' : '#334155',
                      }}
                    >
                      {prov}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>

        {/* ── DANH SÁCH BÀI ĐĂNG (FEED LIST) ──────────────────────────────── */}
        <View style={{ gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: BRAND_COLORS.text }}>
              {isFiltering ? `Kết quả tìm kiếm (${posts.length} bài)` : `Tất cả bài đánh giá (${posts.length})`}
            </Text>
            {isRefetching && <ActivityIndicator size="small" color={BRAND_COLORS.primary} />}
          </View>

          {isLoading ? (
            <View style={{ padding: 40, alignItems: 'center', gap: 12 }}>
              <ActivityIndicator size="large" color={BRAND_COLORS.primary} />
              <Text style={{ fontSize: 13, color: BRAND_COLORS.textMuted }}>
                Đang tải các bài đánh giá mới nhất...
              </Text>
            </View>
          ) : posts.length === 0 ? (
            <View
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 20,
                padding: 40,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: 'rgba(27,36,32,0.08)',
                gap: 12,
              }}
            >
              <Text style={{ fontSize: 36 }}>🗺️</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: BRAND_COLORS.text }}>
                Chưa có bài đánh giá nào phù hợp
              </Text>
              <Text style={{ fontSize: 13, color: BRAND_COLORS.textMuted, textAlign: 'center', maxWidth: 400 }}>
                Hãy thử thay đổi hoặc đặt lại bộ lọc, hoặc là người đầu tiên chia sẻ bài đánh giá về địa điểm này!
              </Text>
              <Pressable
                onPress={() => setShowCreateModal(true)}
                style={{
                  backgroundColor: BRAND_COLORS.primary,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  borderRadius: 100,
                  marginTop: 6,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
                  + Viết bài đánh giá ngay
                </Text>
              </Pressable>
            </View>
          ) : (
            posts.map((post: any) => {
              const catMeta = getCategoryMeta(post.category);
              const isAuthor = user?.id === post.user_id;
              const canDelete = isAuthor || isAdmin;

              return (
                <View
                  key={post.id}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 20,
                    padding: 22,
                    borderWidth: 1,
                    borderColor: 'rgba(27,36,32,0.08)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.02)' as any,
                    gap: 14,
                  }}
                >
                  {/* Header Author Info */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      {post.author?.avatar_url ? (
                        <Image
                          source={{ uri: post.author.avatar_url }}
                          style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0' }}
                        />
                      ) : (
                        <View
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            backgroundColor: 'rgba(31,111,84,0.1)',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <User size={20} color={BRAND_COLORS.primary} />
                        </View>
                      )}
                      <View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: BRAND_COLORS.text }}>
                            {post.author?.full_name || 'Người dùng ViVu'}
                          </Text>
                          {post.author?.is_premium && (
                            <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ fontSize: 10, fontWeight: '800', color: '#B45309' }}>
                                ⭐ PRO
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 11, color: '#94A3B8' }}>
                          Đã đăng {formatTimeAgo(post.created_at)}
                        </Text>
                      </View>
                    </View>

                    {/* Actions: Report (for non-author) & Delete (for author/admin) */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {!isAuthor && (
                        <Pressable
                          testID={`btn-report-post-${post.id}`}
                          onPress={() => setPostToReport({ id: post.id, place_name: post.place_name })}
                          style={{
                            padding: 6,
                            borderRadius: 8,
                            backgroundColor: '#F8FAFC',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer' as any,
                          }}
                          accessibilityLabel="Báo cáo vi phạm"
                        >
                          <Flag size={15} color="#94A3B8" />
                        </Pressable>
                      )}

                      {canDelete && (
                        <Pressable
                          onPress={() => setPostToDelete({ id: post.id, place_name: post.place_name })}
                          style={{ padding: 6, cursor: 'pointer' as any }}
                          accessibilityLabel="Xóa bài viết"
                        >
                          <Trash2 size={16} color="#DC2626" />
                        </Pressable>
                      )}
                    </View>
                  </View>

                  {/* Place Title & 2 Tags Bắt Buộc */}
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 18, color: BRAND_COLORS.text }}>
                      {post.place_name}
                    </Text>

                    {/* 2 Tags Bắt Buộc & Badges */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      {/* Tag 1: Tỉnh thành */}
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          backgroundColor: '#E8F5E9',
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: '#C8E6C9',
                        }}
                      >
                        <MapPin size={13} color="#2E7D32" />
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#1B5E20' }}>
                          {post.province}
                        </Text>
                      </View>

                      {/* Tag 2: Phân loại */}
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5,
                          backgroundColor: catMeta.bg,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: catMeta.color + '40',
                        }}
                      >
                        <Text style={{ fontSize: 12 }}>{catMeta.icon}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: catMeta.color }}>
                          {catMeta.label}
                        </Text>
                      </View>

                      {/* Trạng thái & Giờ mở cửa */}
                      <View
                        style={{
                          backgroundColor: post.place_status === 'closed' ? '#FEE2E2' : '#F0FDF4',
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '700',
                            color: post.place_status === 'closed' ? '#991B1B' : '#166534',
                          }}
                        >
                          {post.place_status === 'closed' ? '🔴 Đã đóng cửa' : '🟢 Đang hoạt động'}
                          {post.opening_hours ? ` · ⏰ ${post.opening_hours}` : ''}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Rating Stars & Cost */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ flexDirection: 'row', gap: 2 }}>
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            size={16}
                            color={s <= post.rating ? '#F59E0B' : '#CBD5E1'}
                            fill={s <= post.rating ? '#F59E0B' : 'none'}
                          />
                        ))}
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#B45309' }}>
                        {post.rating}.0 / 5.0
                      </Text>
                    </View>

                    {post.cost_per_person > 0 && (
                      <View style={{ backgroundColor: '#F8FAFC', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B' }}>
                          💰 Chi phí: ~{Number(post.cost_per_person).toLocaleString('vi-VN')} đ / người
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Detailed Description */}
                  <Text style={{ fontSize: 14, color: '#334155', lineHeight: 22 }}>
                    {post.content}
                  </Text>

                  {/* Tiêu Chí Phụ */}
                  {post.aspects && (
                    <View style={{ backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9', gap: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>
                        Tiêu chí trải nghiệm chi tiết
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {post.aspects.quality && (
                          <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                            <Text style={{ fontSize: 11, color: '#334155' }}>
                              💎 Chất lượng: <Text style={{ fontWeight: '700' }}>{post.aspects.quality}</Text>
                            </Text>
                          </View>
                        )}
                        {post.aspects.service && (
                          <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                            <Text style={{ fontSize: 11, color: '#334155' }}>
                              🛎️ Dịch vụ: <Text style={{ fontWeight: '700' }}>{post.aspects.service}</Text>
                            </Text>
                          </View>
                        )}
                        {post.aspects.atmosphere && (
                          <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                            <Text style={{ fontSize: 11, color: '#334155' }}>
                              🌿 Không khí: <Text style={{ fontWeight: '700' }}>{post.aspects.atmosphere}</Text>
                            </Text>
                          </View>
                        )}
                        {post.aspects.waiting_time && (
                          <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                            <Text style={{ fontSize: 11, color: '#334155' }}>
                              ⏱️ Chờ đợi: <Text style={{ fontWeight: '700' }}>{post.aspects.waiting_time}</Text>
                            </Text>
                          </View>
                        )}
                        {post.aspects.booking_method && (
                          <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                            <Text style={{ fontSize: 11, color: '#334155' }}>
                              📅 Đặt chỗ: <Text style={{ fontWeight: '700' }}>{post.aspects.booking_method}</Text>
                            </Text>
                          </View>
                        )}
                        {post.aspects.parking && (
                          <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                            <Text style={{ fontSize: 11, color: '#334155' }}>
                              🚗 Đỗ xe: <Text style={{ fontWeight: '700' }}>{post.aspects.parking}</Text>
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}

                  {/* Media Gallery */}
                  {renderMediaGallery(post)}

                  {/* Nút Xem trên Google Maps */}
                  {post.google_maps_url ? (
                    <Pressable
                      testID={`btn-open-gmaps-${post.id}`}
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
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 8,
                        cursor: 'pointer' as any,
                        opacity: pressed ? 0.8 : 1,
                      }]}
                    >
                      <ExternalLink size={14} color="#166534" />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#166534' }}>
                        Xem trên Google Maps
                      </Text>
                    </Pressable>
                  ) : null}

                  {/* Reaction and Comments Count Summary Bar */}
                  {((post.reactions?.total || 0) > 0 || (post.comments_count || 0) > 0) && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: 10,
                        borderTopWidth: 1,
                        borderTopColor: '#F1F5F9',
                      }}
                    >
                      {/* Left: Reactions Counter */}
                      {(post.reactions?.total || 0) > 0 ? (
                        <Pressable
                          onPress={() => setShowReactionsModalFor({ id: post.id, total: post.reactions.total })}
                          style={({ pressed }) => [{
                            flexDirection: 'row', alignItems: 'center', gap: 6,
                            opacity: pressed ? 0.7 : 1,
                            cursor: 'pointer' as any,
                          }]}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            {getTopReactionEmojis(post.reactions?.by_type).map((emoji, idx) => (
                              <Text key={idx} style={{ fontSize: 14, marginLeft: idx > 0 ? -4 : 0 }}>
                                {emoji}
                              </Text>
                            ))}
                          </View>
                          <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '600' }}>
                            {post.reactions.total}
                          </Text>
                        </Pressable>
                      ) : <View />}

                      {/* Right: Comments Counter */}
                      {(post.comments_count || 0) > 0 ? (
                        <Pressable
                          onPress={() => setExpandedComments((prev) => ({ ...prev, [post.id]: !prev[post.id] }))}
                          style={{ cursor: 'pointer' as any }}
                        >
                          <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '600' }}>
                            {post.comments_count} bình luận
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  )}

                  {/* Facebook Action Buttons (Thích, Bình luận, Chia sẻ) */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderTopWidth: 1,
                      borderTopColor: '#F1F5F9',
                      paddingTop: 6,
                      marginTop: 2,
                      position: 'relative',
                    }}
                  >
                    {/* Floating Reaction Popover - Kích hoạt khi di chuột vào nút Thích */}
                    {hoverReactionPostId === post.id && (
                      <View
                        // @ts-ignore
                        onMouseEnter={() => handleMouseEnterLike(post.id)}
                        onMouseLeave={handleMouseLeaveLike}
                        style={{
                          position: 'absolute',
                          bottom: 44,
                          left: 0,
                          flexDirection: 'row',
                          backgroundColor: '#242526',
                          borderRadius: 40,
                          paddingHorizontal: 8,
                          paddingVertical: 5,
                          boxShadow: '0 8px 24px rgba(0,0,0,0.25)' as any,
                          zIndex: 9999,
                          gap: 6,
                          alignItems: 'center',
                        }}
                      >
                        {FB_REACTIONS.map((r) => {
                          const isHovered = hoveredReactionEmoji === r.id;
                          return (
                            <View key={r.id} style={{ alignItems: 'center', position: 'relative' }}>
                              {isHovered && (
                                <View
                                  style={{
                                    position: 'absolute',
                                    top: -24,
                                    backgroundColor: 'rgba(0,0,0,0.85)',
                                    paddingHorizontal: 6,
                                    paddingVertical: 2,
                                    borderRadius: 8,
                                    zIndex: 10,
                                  }}
                                >
                                  <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>
                                    {r.label}
                                  </Text>
                                </View>
                              )}
                              <Pressable
                                testID={`react-${post.id}-${r.id}`}
                                // @ts-ignore
                                onMouseEnter={() => setHoveredReactionEmoji(r.id)}
                                onMouseLeave={() => setHoveredReactionEmoji(null)}
                                onPress={() => {
                                  if (!user) {
                                    Alert.alert('Thông báo', 'Vui lòng đăng nhập để thả cảm xúc.');
                                    return;
                                  }
                                  setHoverReactionPostId(null);
                                  setHoveredReactionEmoji(null);
                                  reactMutation.mutate({ postId: post.id, reaction: r.id });
                                }}
                                style={({ pressed }) => [{
                                  padding: 4,
                                  borderRadius: 24,
                                  transform: [{ scale: isHovered || pressed ? 1.35 : 1 }],
                                  cursor: 'pointer' as any,
                                }]}
                              >
                                <Text style={{ fontSize: 26 }}>{r.emoji}</Text>
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {/* Nút Thích - Hỗ trợ Hover hiện emoji và Click toggle */}
                    {(() => {
                      const userReaction = post.reactions?.user_reaction;
                      const currentMeta = userReaction ? FB_REACTIONS.find((r) => r.id === userReaction) : null;

                      return (
                        <View
                          style={{ flex: 1, position: 'relative' }}
                          // @ts-ignore
                          onMouseEnter={() => handleMouseEnterLike(post.id)}
                          onMouseLeave={handleMouseLeaveLike}
                        >
                          <Pressable
                            testID={`btn-react-${post.id}`}
                            onPress={() => {
                              if (!user) {
                                Alert.alert('Thông báo', 'Vui lòng đăng nhập để thả cảm xúc.');
                                return;
                              }
                              const reactToSend = userReaction ? userReaction : 'like';
                              reactMutation.mutate({ postId: post.id, reaction: reactToSend });
                            }}
                            style={({ pressed }) => [{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6,
                              paddingVertical: 8,
                              borderRadius: 8,
                              backgroundColor: pressed ? '#F1F5F9' : 'transparent',
                              cursor: 'pointer' as any,
                            }]}
                          >
                            {currentMeta ? (
                              <>
                                <Text style={{ fontSize: 16 }}>{currentMeta.emoji}</Text>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: currentMeta.color }}>
                                  {currentMeta.label}
                                </Text>
                              </>
                            ) : (
                              <>
                                <ThumbsUp size={16} color="#64748B" />
                                <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748B' }}>
                                  Thích
                                </Text>
                              </>
                            )}
                          </Pressable>
                        </View>
                      );
                    })()}

                    {/* Nút Bình luận */}
                    <Pressable
                      testID={`btn-comment-${post.id}`}
                      onPress={() => setExpandedComments((prev) => ({ ...prev, [post.id]: !prev[post.id] }))}
                      style={({ pressed }) => [{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: pressed ? '#F1F5F9' : 'transparent',
                        cursor: 'pointer' as any,
                      }]}
                    >
                      <MessageSquare size={16} color="#64748B" />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748B' }}>
                        Bình luận
                      </Text>
                    </Pressable>

                    {/* Nút Chia sẻ */}
                    <Pressable
                      testID={`btn-share-${post.id}`}
                      onPress={() => handleSharePost(post)}
                      style={({ pressed }) => [{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        paddingVertical: 8,
                        borderRadius: 8,
                        backgroundColor: pressed ? '#F1F5F9' : 'transparent',
                        cursor: 'pointer' as any,
                      }]}
                    >
                      <Share2 size={16} color="#64748B" />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748B' }}>
                        Chia sẻ
                      </Text>
                    </Pressable>
                  </View>

                  {/* Khu Vực Bình Luận Khi Được Mở Rộng */}
                  {expandedComments[post.id] && (
                    <View style={{ gap: 12, marginTop: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                      {/* Danh sách bình luận */}
                      {post.comments && post.comments.length > 0 ? (
                        <View style={{ gap: 12 }}>
                          {post.comments.map((cmt: any) => {
                            const canDeleteCmt = user?.id === cmt.user_id || canDelete;
                            const isLikedCmt = !!commentLikes[cmt.id];

                            return (
                              <View key={cmt.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                                {cmt.author?.avatar_url ? (
                                  <Image
                                    source={{ uri: cmt.author.avatar_url }}
                                    style={{ width: 34, height: 34, borderRadius: 17, marginTop: 2 }}
                                  />
                                ) : (
                                  <View
                                    style={{
                                      width: 34,
                                      height: 34,
                                      borderRadius: 17,
                                      backgroundColor: 'rgba(31,111,84,0.1)',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      marginTop: 2,
                                    }}
                                  >
                                    <User size={16} color={BRAND_COLORS.primary} />
                                  </View>
                                )}

                                <View style={{ flex: 1 }}>
                                  {/* Bong bóng bình luận */}
                                  <View
                                    style={{
                                      backgroundColor: '#F0F2F5',
                                      borderRadius: 18,
                                      paddingHorizontal: 14,
                                      paddingVertical: 10,
                                      alignSelf: 'flex-start',
                                      maxWidth: '92%',
                                    }}
                                  >
                                    <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_COLORS.text }}>
                                      {cmt.author?.full_name || 'Người dùng ViVu'}
                                    </Text>

                                    {/* Nội dung chữ */}
                                    {!!cmt.content && (
                                      <Text style={{ fontSize: 13, color: '#1B2420', marginTop: 3, lineHeight: 19 }}>
                                        {cmt.content}
                                      </Text>
                                    )}

                                    {/* Media đính kèm (Ảnh / GIF / Sticker) */}
                                    {cmt.media_url && (
                                      <View style={{ marginTop: 6, borderRadius: 12, overflow: 'hidden' }}>
                                        {cmt.media_type === 'sticker' ? (
                                          <Image
                                            source={{ uri: cmt.media_url }}
                                            style={{ width: 96, height: 96 }}
                                            resizeMode="contain"
                                          />
                                        ) : cmt.media_type === 'gif' ? (
                                          <Image
                                            source={{ uri: cmt.media_url }}
                                            style={{ width: 240, height: 160, borderRadius: 12 }}
                                            resizeMode="cover"
                                          />
                                        ) : (
                                          <Image
                                            source={{ uri: cmt.media_url }}
                                            style={{ width: 280, height: 180, borderRadius: 12 }}
                                            resizeMode="cover"
                                          />
                                        )}
                                      </View>
                                    )}
                                  </View>

                                  {/* Thanh tác vụ dưới bình luận (Thích, Phản hồi, Thời gian, Xóa) */}
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, marginLeft: 10 }}>
                                    <Pressable
                                      onPress={() => setCommentLikes((prev) => ({ ...prev, [cmt.id]: !prev[cmt.id] }))}
                                      style={{ cursor: 'pointer' as any }}
                                    >
                                      <Text
                                        style={{
                                          fontSize: 12,
                                          fontWeight: '700',
                                          color: isLikedCmt ? '#1877F2' : '#64748B',
                                        }}
                                      >
                                        Thích
                                      </Text>
                                    </Pressable>

                                    <Pressable
                                      onPress={() => {
                                        setCommentInputs((prev) => ({
                                          ...prev,
                                          [post.id]: `@${cmt.author?.full_name || 'Người dùng'} `,
                                        }));
                                      }}
                                      style={{ cursor: 'pointer' as any }}
                                    >
                                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B' }}>
                                        Phản hồi
                                      </Text>
                                    </Pressable>

                                    <Text style={{ fontSize: 11, color: '#94A3B8' }}>
                                      {formatTimeAgo(cmt.created_at)}
                                    </Text>

                                    {canDeleteCmt && (
                                      <Pressable
                                        testID={`btn-delete-comment-${cmt.id}`}
                                        onPress={() => deleteCommentMutation.mutate({ postId: post.id, commentId: cmt.id })}
                                        style={{ cursor: 'pointer' as any }}
                                      >
                                        <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '600' }}>
                                          Xóa
                                        </Text>
                                      </Pressable>
                                    )}
                                  </View>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      ) : (
                        <Text style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic', textAlign: 'center', marginVertical: 4 }}>
                          Chưa có bình luận nào. Hãy là người đầu tiên bình luận!
                        </Text>
                      )}

                      {/* Khung Nhập Bình Luận Phong Cách Facebook */}
                      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 6 }}>
                        {profile?.avatar_url ? (
                          <Image
                            source={{ uri: profile.avatar_url }}
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 18,
                              marginTop: 2,
                              borderWidth: 1.5,
                              borderColor: '#CBD5E1',
                            }}
                          />
                        ) : (
                          <View
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 18,
                              backgroundColor: '#1877F2',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginTop: 2,
                            }}
                          >
                            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>
                              {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : (user?.email ? user.email.charAt(0).toUpperCase() : 'B')}
                            </Text>
                          </View>
                        )}

                        <View style={{ flex: 1, gap: 6 }}>
                          {/* Khung nhập hình pill */}
                          <View
                            style={{
                              backgroundColor: '#F0F2F5',
                              borderRadius: 18,
                              paddingHorizontal: 12,
                              paddingVertical: 8,
                              borderWidth: 1,
                              borderColor: '#E2E8F0',
                            }}
                          >
                            {/* Xem trước Media đính kèm (Ảnh / GIF / Sticker) */}
                            {commentMediaAttachments[post.id] && (
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 8,
                                  backgroundColor: '#FFFFFF',
                                  padding: 6,
                                  borderRadius: 10,
                                  alignSelf: 'flex-start',
                                  marginBottom: 6,
                                  borderWidth: 1,
                                  borderColor: '#CBD5E1',
                                }}
                              >
                                <Image
                                  source={{ uri: commentMediaAttachments[post.id]!.url }}
                                  style={{ width: 44, height: 44, borderRadius: 6 }}
                                  resizeMode={commentMediaAttachments[post.id]!.type === 'sticker' ? 'contain' : 'cover'}
                                />
                                <View>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#1B2420' }}>
                                    {commentMediaAttachments[post.id]!.type === 'image'
                                      ? '📷 Ảnh đính kèm'
                                      : commentMediaAttachments[post.id]!.type === 'gif'
                                      ? '🎞️ Ảnh GIF'
                                      : '🧸 Sticker'}
                                  </Text>
                                  <Text style={{ fontSize: 10, color: '#64748B' }}>Sẵn sàng gửi</Text>
                                </View>
                                <Pressable
                                  testID={`btn-remove-attachment-${post.id}`}
                                  onPress={() => setCommentMediaAttachments((prev) => ({ ...prev, [post.id]: null }))}
                                  style={{ padding: 4, cursor: 'pointer' as any }}
                                >
                                  <X size={14} color="#64748B" />
                                </Pressable>
                              </View>
                            )}

                            {/* Loading tải ảnh */}
                            {isUploadingCommentMedia[post.id] && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                <ActivityIndicator size="small" color={BRAND_COLORS.primary} />
                                <Text style={{ fontSize: 11, color: '#64748B' }}>Đang tải ảnh lên...</Text>
                              </View>
                            )}

                            {/* Text Input */}
                            <TextInput
                              testID={`input-comment-${post.id}`}
                              placeholder={user ? "Viết bình luận..." : "Đăng nhập để bình luận"}
                              placeholderTextColor="#94A3B8"
                              value={commentInputs[post.id] || ''}
                              onChangeText={(text) => setCommentInputs((prev) => ({ ...prev, [post.id]: text }))}
                              multiline
                              editable={!!user}
                              style={{
                                fontSize: 13,
                                color: BRAND_COLORS.text,
                                minHeight: 24,
                                maxHeight: 100,
                                paddingVertical: 2,
                              }}
                            />

                            {/* Thanh công cụ biểu tượng Facebook (Emoji, Ảnh, GIF, Sticker, Gửi) */}
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginTop: 6,
                                paddingTop: 4,
                              }}
                            >
                              {/* 4 Công Cụ Chuẩn Facebook */}
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                {/* Emoji Button */}
                                <Pressable
                                  testID={`btn-open-emoji-${post.id}`}
                                  onPress={() => {
                                    setActiveCommentToolbar((prev) => ({
                                      ...prev,
                                      [post.id]: prev[post.id] === 'emoji' ? null : 'emoji',
                                    }));
                                  }}
                                  style={({ pressed }) => [{
                                    padding: 5,
                                    borderRadius: 16,
                                    backgroundColor: activeCommentToolbar[post.id] === 'emoji' ? '#E2E8F0' : pressed ? '#E2E8F0' : 'transparent',
                                    cursor: 'pointer' as any,
                                  }]}
                                >
                                  <Smile size={18} color={activeCommentToolbar[post.id] === 'emoji' ? BRAND_COLORS.primary : '#64748B'} />
                                </Pressable>

                                {/* Photo / Camera Button */}
                                <Pressable
                                  testID={`btn-open-camera-${post.id}`}
                                  onPress={() => triggerCommentImagePicker(post.id)}
                                  style={({ pressed }) => [{
                                    padding: 5,
                                    borderRadius: 16,
                                    backgroundColor: pressed ? '#E2E8F0' : 'transparent',
                                    cursor: 'pointer' as any,
                                  }]}
                                >
                                  <Camera size={18} color="#64748B" />
                                </Pressable>

                                {/* GIF Button */}
                                <Pressable
                                  testID={`btn-open-gif-${post.id}`}
                                  onPress={() => {
                                    setActiveCommentToolbar((prev) => ({
                                      ...prev,
                                      [post.id]: prev[post.id] === 'gif' ? null : 'gif',
                                    }));
                                  }}
                                  style={({ pressed }) => [{
                                    paddingHorizontal: 6,
                                    paddingVertical: 2,
                                    borderRadius: 6,
                                    backgroundColor: activeCommentToolbar[post.id] === 'gif' ? '#CBD5E1' : '#E2E8F0',
                                    cursor: 'pointer' as any,
                                  }]}
                                >
                                  <Text style={{ fontSize: 10, fontWeight: '800', color: activeCommentToolbar[post.id] === 'gif' ? BRAND_COLORS.primary : '#475569' }}>
                                    GIF
                                  </Text>
                                </Pressable>

                                {/* Sticker Button */}
                                <Pressable
                                  testID={`btn-open-sticker-${post.id}`}
                                  onPress={() => {
                                    setActiveCommentToolbar((prev) => ({
                                      ...prev,
                                      [post.id]: prev[post.id] === 'sticker' ? null : 'sticker',
                                    }));
                                  }}
                                  style={({ pressed }) => [{
                                    padding: 5,
                                    borderRadius: 16,
                                    backgroundColor: activeCommentToolbar[post.id] === 'sticker' ? '#E2E8F0' : pressed ? '#E2E8F0' : 'transparent',
                                    cursor: 'pointer' as any,
                                  }]}
                                >
                                  <Text style={{ fontSize: 15 }}>🧸</Text>
                                </Pressable>
                              </View>

                              {/* Send Button */}
                              <Pressable
                                testID={`btn-send-comment-${post.id}`}
                                disabled={
                                  !user ||
                                  (!(commentInputs[post.id] || '').trim() && !commentMediaAttachments[post.id]) ||
                                  addCommentMutation.isPending
                                }
                                onPress={() => handleSubmitComment(post.id)}
                                style={({ pressed }) => [{
                                  opacity: !(commentInputs[post.id] || '').trim() && !commentMediaAttachments[post.id] ? 0.4 : 1,
                                  padding: 5,
                                  borderRadius: 16,
                                  backgroundColor: pressed ? '#E2E8F0' : 'transparent',
                                  cursor: 'pointer' as any,
                                }]}
                              >
                                <Send size={16} color={BRAND_COLORS.primary} />
                              </Pressable>
                            </View>
                          </View>

                          {/* Popover Tray: Bảng chọn Emoji */}
                          {activeCommentToolbar[post.id] === 'emoji' && (
                            <View
                              style={{
                                backgroundColor: '#FFFFFF',
                                borderRadius: 14,
                                padding: 10,
                                borderWidth: 1,
                                borderColor: '#E2E8F0',
                                boxShadow: '0 6px 16px rgba(0,0,0,0.08)' as any,
                              }}
                            >
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B' }}>
                                  Biểu tượng cảm xúc
                                </Text>
                                <Pressable
                                  onPress={() => setActiveCommentToolbar((prev) => ({ ...prev, [post.id]: null }))}
                                  style={{ cursor: 'pointer' as any }}
                                >
                                  <X size={14} color="#94A3B8" />
                                </Pressable>
                              </View>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {COMMENT_EMOJIS.map((emoji, idx) => (
                                  <Pressable
                                    key={idx}
                                    testID={`emoji-item-${post.id}-${idx}`}
                                    onPress={() => {
                                      setCommentInputs((prev) => ({
                                        ...prev,
                                        [post.id]: (prev[post.id] || '') + emoji,
                                      }));
                                    }}
                                    style={({ pressed }) => [{
                                      padding: 4,
                                      borderRadius: 6,
                                      backgroundColor: pressed ? '#F1F5F9' : 'transparent',
                                      cursor: 'pointer' as any,
                                    }]}
                                  >
                                    <Text style={{ fontSize: 20 }}>{emoji}</Text>
                                  </Pressable>
                                ))}
                              </View>
                            </View>
                          )}

                          {/* Popover Tray: Bảng chọn GIF */}
                          {activeCommentToolbar[post.id] === 'gif' && (
                            <View
                              style={{
                                backgroundColor: '#FFFFFF',
                                borderRadius: 14,
                                padding: 12,
                                borderWidth: 1,
                                borderColor: '#E2E8F0',
                                boxShadow: '0 6px 16px rgba(0,0,0,0.08)' as any,
                              }}
                            >
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND_COLORS.text }}>
                                  Chọn ảnh động GIF 🎞️
                                </Text>
                                <Pressable
                                  onPress={() => setActiveCommentToolbar((prev) => ({ ...prev, [post.id]: null }))}
                                  style={{ cursor: 'pointer' as any }}
                                >
                                  <X size={14} color="#94A3B8" />
                                </Pressable>
                              </View>
                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                              >
                                {CURATED_GIFS.map((gif) => (
                                  <Pressable
                                    key={gif.id}
                                    testID={`gif-item-${post.id}-${gif.id}`}
                                    onPress={() => {
                                      setCommentMediaAttachments((prev) => ({
                                        ...prev,
                                        [post.id]: { type: 'gif', url: gif.url },
                                      }));
                                      setActiveCommentToolbar((prev) => ({ ...prev, [post.id]: null }));
                                    }}
                                    style={({ pressed }) => [{
                                      width: 130,
                                      height: 90,
                                      borderRadius: 8,
                                      overflow: 'hidden',
                                      borderWidth: 1,
                                      borderColor: '#E2E8F0',
                                      opacity: pressed ? 0.8 : 1,
                                      cursor: 'pointer' as any,
                                      position: 'relative',
                                    }]}
                                  >
                                    <Image source={{ uri: gif.url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                    <View
                                      style={{
                                        position: 'absolute',
                                        bottom: 0,
                                        left: 0,
                                        right: 0,
                                        backgroundColor: 'rgba(0,0,0,0.6)',
                                        paddingHorizontal: 4,
                                        paddingVertical: 2,
                                      }}
                                    >
                                      <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '600' }} numberOfLines={1}>
                                        {gif.title}
                                      </Text>
                                    </View>
                                  </Pressable>
                                ))}
                              </ScrollView>
                            </View>
                          )}

                          {/* Popover Tray: Bảng chọn Sticker */}
                          {activeCommentToolbar[post.id] === 'sticker' && (
                            <View
                              style={{
                                backgroundColor: '#FFFFFF',
                                borderRadius: 14,
                                padding: 12,
                                borderWidth: 1,
                                borderColor: '#E2E8F0',
                                boxShadow: '0 6px 16px rgba(0,0,0,0.08)' as any,
                              }}
                            >
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND_COLORS.text }}>
                                  Nhãn dán Sticker 🧸
                                </Text>
                                <Pressable
                                  onPress={() => setActiveCommentToolbar((prev) => ({ ...prev, [post.id]: null }))}
                                  style={{ cursor: 'pointer' as any }}
                                >
                                  <X size={14} color="#94A3B8" />
                                </Pressable>
                              </View>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                                {CURATED_STICKERS.map((stk) => (
                                  <Pressable
                                    key={stk.id}
                                    testID={`sticker-item-${post.id}-${stk.id}`}
                                    onPress={() => {
                                      setCommentMediaAttachments((prev) => ({
                                        ...prev,
                                        [post.id]: { type: 'sticker', url: stk.url },
                                      }));
                                      setActiveCommentToolbar((prev) => ({ ...prev, [post.id]: null }));
                                    }}
                                    style={({ pressed }) => [{
                                      width: 48,
                                      height: 48,
                                      padding: 4,
                                      borderRadius: 8,
                                      backgroundColor: pressed ? '#F1F5F9' : '#FAF5EA',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer' as any,
                                    }]}
                                  >
                                    <Image source={{ uri: stk.url }} style={{ width: 36, height: 36 }} resizeMode="contain" />
                                  </Pressable>
                                ))}
                              </View>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* ── Modal Đăng Bài ──────────────────────────────────────────────── */}
      <CreatePostModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          refetch();
        }}
      />

      {/* ── Photo Theater Modal / Rạp Hát Xem Ảnh Facebook ──────────────── */}
      {photoTheater && currentTheaterPost && (
        <PhotoTheaterModal
          visible={!!photoTheater}
          post={currentTheaterPost}
          initialIndex={photoTheater.activeIndex}
          onClose={() => setPhotoTheater(null)}
          currentUser={user}
          userProfile={profile}
          isAdmin={isAdmin}
          onReact={(postId, reaction) => {
            reactMutation.mutate({ postId, reaction });
          }}
          onAddComment={async ({ postId, content, media_url, media_type }) => {
            await addCommentMutation.mutateAsync({ postId, content, media_url, media_type });
          }}
          onDeleteComment={async (postId, commentId) => {
            await deleteCommentMutation.mutateAsync({ postId, commentId });
          }}
          onShare={handleSharePost}
        />
      )}

      {/* ── Modal Xác Nhận Xóa Bài ──────────────────────────────────────── */}
      {postToDelete && (
        <ConfirmModal
          visible={!!postToDelete}
          title="Xác nhận xóa bài đánh giá"
          message={`Bạn có chắc chắn muốn xóa bài đánh giá về "${postToDelete.place_name}" không? Hành động này không thể hoàn tác.`}
          isDestructive
          onConfirm={() => {
            if (postToDelete) deleteMutation.mutate(postToDelete.id);
          }}
          onCancel={() => setPostToDelete(null)}
        />
      )}

      {/* ── Modal Báo Cáo Vi Phạm Bài Viết ───────────────────────────────── */}
      {postToReport && (
        <ReportModal
          visible={!!postToReport}
          postId={postToReport.id}
          placeName={postToReport.place_name}
          onClose={() => setPostToReport(null)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['community-posts'] });
          }}
        />
      )}

      {/* ── Modal Danh Sách Người Đã Thả Cảm Xúc ─────────────────────────── */}
      <ReactionsListModal
        visible={!!showReactionsModalFor}
        onClose={() => setShowReactionsModalFor(null)}
        postId={showReactionsModalFor?.id || null}
        totalReactions={showReactionsModalFor?.total}
      />
    </View>
  );
}
