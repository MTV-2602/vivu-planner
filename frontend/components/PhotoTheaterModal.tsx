import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  Image,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
  useWindowDimensions,
  Linking,
} from 'react-native';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Star,
  MapPin,
  ExternalLink,
  ThumbsUp,
  MessageSquare,
  Share2,
  Send,
  Camera,
  Smile,
  User,
  Globe,
  Trash2,
} from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { BRAND_COLORS, POST_CATEGORIES } from '../constants';
import ReactionsListModal from './ReactionsListModal';

export const FB_REACTIONS: { id: string; label: string; emoji: string; color: string }[] = [
  { id: 'like', label: 'Thích', emoji: '👍', color: '#1877F2' },
  { id: 'love', label: 'Yêu thích', emoji: '❤️', color: '#FA383E' },
  { id: 'care', label: 'Thương thương', emoji: '🥰', color: '#F7B125' },
  { id: 'haha', label: 'Haha', emoji: '😆', color: '#F7B125' },
  { id: 'wow', label: 'Wow', emoji: '😮', color: '#F7B125' },
  { id: 'sad', label: 'Buồn', emoji: '😢', color: '#F7B125' },
  { id: 'angry', label: 'Phẫn nộ', emoji: '😡', color: '#E9710F' },
];

export const COMMENT_EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
  '😍', '🥰', '😘', '😋', '😜', '🤩', '🥳', '😎', '🥺', '😭',
  '😱', '🤯', '😴', '🤤', '👍', '👎', '👏', '🙌', '🫶', '❤️',
  '💖', '🔥', '💯', '✨', '☕', '🧋', '🍜', '🍲', '🍕', '🍰',
  '🏖️', '🏕️', '✈️', '🛵', '🎉', '🌟', '🌈', '📸', '🗺️', '🛵',
];

export const CURATED_GIFS = [
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

export const CURATED_STICKERS = [
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

export const formatTheaterTimeAgo = (dateStr: string) => {
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

export const getTheaterCategoryMeta = (catId: string) => {
  return (
    POST_CATEGORIES.find((c) => c.id === catId) || {
      id: 'other',
      label: 'Khác',
      icon: '🏷️',
      color: '#6B7280',
      bg: '#F3F4F6',
    }
  );
};

interface PhotoTheaterModalProps {
  visible: boolean;
  post: any;
  initialIndex?: number;
  onClose: () => void;
  currentUser?: any;
  userProfile?: any;
  isAdmin?: boolean;
  onReact?: (postId: string, reaction: string) => void;
  onAddComment?: (data: {
    postId: string;
    content?: string;
    media_url?: string;
    media_type?: 'image' | 'gif' | 'sticker';
  }) => Promise<any> | void;
  onDeleteComment?: (postId: string, commentId: string) => Promise<any> | void;
  onShare?: (post: any) => void;
}

export default function PhotoTheaterModal({
  visible,
  post,
  initialIndex = 0,
  onClose,
  currentUser,
  userProfile,
  isAdmin = false,
  onReact,
  onAddComment,
  onDeleteComment,
  onShare,
}: PhotoTheaterModalProps) {
  const { width, height } = useWindowDimensions();
  const queryClient = useQueryClient();
  const isDesktop = width >= 860;

  const mediaUrls: string[] = post?.media_urls || [];
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  // Sync index when initialIndex or visible changes
  useEffect(() => {
    if (visible) {
      const idx = Math.max(0, Math.min(initialIndex, Math.max(0, mediaUrls.length - 1)));
      setActiveIndex(idx);
    }
  }, [visible, initialIndex, mediaUrls.length]);

  // Local comments state
  const [localComments, setLocalComments] = useState<any[]>(post?.comments || []);
  const [commentsCount, setCommentsCount] = useState<number>(post?.comments_count || post?.comments?.length || 0);

  // Sync local comments whenever post changes
  useEffect(() => {
    if (post?.comments) {
      setLocalComments(post.comments);
      setCommentsCount(post.comments_count ?? post.comments.length);
    }
  }, [post]);

  // Local reactions state
  const [userReaction, setUserReaction] = useState<string | null>(post?.reactions?.user_reaction || null);
  const [reactionsTotal, setReactionsTotal] = useState<number>(post?.reactions?.total || 0);
  const [reactionsByType, setReactionsByType] = useState<Record<string, number>>(post?.reactions?.by_type || {});
  const [hoverReaction, setHoverReaction] = useState(false);
  const [hoveredReactionEmoji, setHoveredReactionEmoji] = useState<string | null>(null);
  const [showReactionsList, setShowReactionsList] = useState(false);
  const hoverTimerRef = useRef<any>(null);

  useEffect(() => {
    if (post?.reactions) {
      setUserReaction(post.reactions.user_reaction || null);
      setReactionsTotal(post.reactions.total || 0);
      setReactionsByType(post.reactions.by_type || {});
    }
  }, [post]);

  // Comment input states
  const [commentText, setCommentText] = useState('');
  const [commentMediaAttachment, setCommentMediaAttachment] = useState<{
    type: 'image' | 'gif' | 'sticker';
    url: string;
  } | null>(null);
  const [activeCommentToolbar, setActiveCommentToolbar] = useState<'emoji' | 'gif' | 'sticker' | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [likedCommentIds, setLikedCommentIds] = useState<Record<string, boolean>>({});

  const commentInputRef = useRef<any>(null);

  // Navigation handlers
  const handleNext = () => {
    if (mediaUrls.length <= 1) return;
    setActiveIndex((prev) => (prev + 1) % mediaUrls.length);
  };

  const handlePrev = () => {
    if (mediaUrls.length <= 1) return;
    setActiveIndex((prev) => (prev - 1 + mediaUrls.length) % mediaUrls.length);
  };

  // Keyboard navigation on Web (ArrowLeft, ArrowRight, Escape)
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        if (isInput) {
          (target as HTMLElement).blur();
        }
        onClose();
        return;
      }

      if (isInput) return;

      if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, mediaUrls.length, onClose]);

  // Reactions interaction
  const handleSelectReaction = async (reactionId: string) => {
    if (!currentUser) {
      Alert.alert('Thông báo', 'Vui lòng đăng nhập để thả cảm xúc.');
      return;
    }

    setHoverReaction(false);
    setHoveredReactionEmoji(null);

    const prevUserReaction = userReaction;
    const isToggleOff = prevUserReaction === reactionId;
    const nextReaction = isToggleOff ? null : reactionId;

    const nextByType = { ...reactionsByType };
    if (prevUserReaction && nextByType[prevUserReaction]) {
      nextByType[prevUserReaction] = Math.max(0, nextByType[prevUserReaction] - 1);
    }
    if (nextReaction) {
      nextByType[nextReaction] = (nextByType[nextReaction] || 0) + 1;
    }
    const nextTotal = Object.values(nextByType).reduce((sum, count) => sum + Number(count || 0), 0);

    // Optimistic update
    setUserReaction(nextReaction);
    setReactionsByType(nextByType);
    setReactionsTotal(nextTotal);

    if (onReact) {
      onReact(post.id, reactionId);
    } else {
      try {
        await api.post(`/posts/${post.id}/react`, { type: reactionId, reaction: reactionId });
        queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      } catch (err: any) {
        Alert.alert('Lỗi', err.response?.data?.error || 'Không thể thả cảm xúc');
      }
    }
  };

  // Upload comment image
  const handleUploadImage = async (file: any) => {
    setIsUploadingMedia(true);
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
            setCommentMediaAttachment({ type: 'image', url: res.data.url });
          }
        } catch (err: any) {
          Alert.alert('Lỗi', err.response?.data?.error || 'Không thể tải ảnh đính kèm');
        } finally {
          setIsUploadingMedia(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setIsUploadingMedia(false);
    }
  };

  const triggerImagePicker = () => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e: any) => {
        const file = e.target?.files?.[0];
        if (file) handleUploadImage(file);
      };
      input.click();
    } else {
      Alert.alert('Thông báo', 'Tính năng tải ảnh hỗ trợ trên trình duyệt web');
    }
  };

  // Submit comment
  const handleSubmitComment = async () => {
    const text = commentText.trim();
    const media = commentMediaAttachment;
    if (!text && !media) return;

    if (!currentUser) {
      Alert.alert('Thông báo', 'Vui lòng đăng nhập để bình luận.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (onAddComment) {
        await onAddComment({
          postId: post.id,
          content: text,
          media_url: media?.url,
          media_type: media?.type,
        });
      } else {
        const res = await api.post(`/posts/${post.id}/comments`, {
          content: text,
          media_url: media?.url,
          media_type: media?.type,
        });
        if (res.data?.comments) {
          setLocalComments(res.data.comments);
          setCommentsCount(res.data.comments.length);
        } else if (res.data?.comment) {
          setLocalComments((prev) => [...prev, res.data.comment]);
          setCommentsCount((prev) => prev + 1);
        }
        queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      }

      setCommentText('');
      setCommentMediaAttachment(null);
      setActiveCommentToolbar(null);
    } catch (err: any) {
      Alert.alert('Lỗi', err.response?.data?.error || 'Không thể đăng bình luận');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete comment
  const handleDeleteComment = async (commentId: string) => {
    try {
      if (onDeleteComment) {
        await onDeleteComment(post.id, commentId);
      } else {
        await api.delete(`/posts/${post.id}/comments/${commentId}`);
        queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      }
      setLocalComments((prev) => prev.filter((c) => c.id !== commentId));
      setCommentsCount((prev) => Math.max(0, prev - 1));
    } catch (err: any) {
      Alert.alert('Lỗi', err.response?.data?.error || 'Không thể xóa bình luận');
    }
  };

  if (!visible || !post) return null;

  const total = mediaUrls.length;
  const currentImageUrl = mediaUrls[activeIndex] || '';
  const catMeta = getTheaterCategoryMeta(post.category);
  const isAuthor = currentUser?.id === post.user_id;
  const canDeletePost = isAuthor || isAdmin;

  const userReactionMeta = userReaction ? FB_REACTIONS.find((r) => r.id === userReaction) : null;

  const topEmojis = Object.entries(reactionsByType)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type]) => {
      const found = FB_REACTIONS.find((r) => r.id === type);
      return found ? found.emoji : '👍';
    });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        testID="theater-modal"
        style={{
          position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          backgroundColor: '#000000',
          flexDirection: isDesktop ? 'row' : 'column',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* ── CỘT TRÁI: MEDIA STAGE (Chiếm ~70% chiều rộng trên Desktop) ─── */}
        <View
          style={{
            flex: isDesktop ? 1 : undefined,
            width: isDesktop ? undefined : '100%',
            height: isDesktop ? '100%' : Math.min(380, height * 0.44),
            backgroundColor: '#000000',
            position: 'relative',
            justifyContent: 'center',
            alignItems: 'center',
            overflow: 'hidden',
          }}
        >
          {/* Nút đóng [X] ở góc trên bên trái (top: 16, left: 16) */}
          <Pressable
            testID="theater-btn-close"
            onPress={onClose}
            accessibilityLabel="Đóng rạp hát xem ảnh"
            style={({ pressed }) => [{
              position: 'absolute',
              top: 16,
              left: 16,
              zIndex: 60,
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: pressed ? 'rgba(51, 65, 85, 0.9)' : 'rgba(30, 41, 59, 0.75)',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer' as any,
            }]}
          >
            <X size={22} color="#FFFFFF" />
          </Pressable>

          {/* Badge hiển thị số thứ tự: Ảnh {index + 1} / {total} */}
          {total > 0 && (
            <View
              testID="theater-badge-counter"
              style={{
                position: 'absolute',
                top: 18,
                left: 70,
                zIndex: 50,
                backgroundColor: 'rgba(15, 23, 42, 0.75)',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.2)',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
                Ảnh {activeIndex + 1} / {total}
              </Text>
            </View>
          )}

          {/* Ảnh đang chọn ở chính giữa (resizeMode="contain") */}
          {currentImageUrl ? (
            <View style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
              <Image
                testID="theater-image-active"
                source={{ uri: currentImageUrl }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="contain"
              />
            </View>
          ) : (
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#94A3B8', fontSize: 14 }}>Không có ảnh để hiển thị</Text>
            </View>
          )}

          {/* Nút mũi tên tròn < ở mép trái */}
          {total > 1 && (
            <Pressable
              testID="theater-btn-prev"
              onPress={handlePrev}
              accessibilityLabel="Ảnh trước"
              style={({ pressed }) => [{
                position: 'absolute',
                left: 16,
                top: '50%',
                transform: [{ translateY: -24 }],
                zIndex: 50,
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: pressed ? 'rgba(51, 65, 85, 0.95)' : 'rgba(30, 41, 59, 0.8)',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer' as any,
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)' as any,
              }]}
            >
              <ChevronLeft size={28} color="#FFFFFF" />
            </Pressable>
          )}

          {/* Nút mũi tên tròn > ở mép phải */}
          {total > 1 && (
            <Pressable
              testID="theater-btn-next"
              onPress={handleNext}
              accessibilityLabel="Ảnh tiếp theo"
              style={({ pressed }) => [{
                position: 'absolute',
                right: 16,
                top: '50%',
                transform: [{ translateY: -24 }],
                zIndex: 50,
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: pressed ? 'rgba(51, 65, 85, 0.95)' : 'rgba(30, 41, 59, 0.8)',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer' as any,
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)' as any,
              }]}
            >
              <ChevronRight size={28} color="#FFFFFF" />
            </Pressable>
          )}

          {/* Dải ảnh nhỏ xem nhanh dưới đáy sân khấu (Thumbnail Strip) */}
          {total > 1 && isDesktop && (
            <View
              style={{
                position: 'absolute',
                bottom: 14,
                left: 0,
                right: 0,
                alignItems: 'center',
                zIndex: 40,
              }}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  gap: 8,
                  paddingHorizontal: 20,
                  alignItems: 'center',
                  backgroundColor: 'rgba(0, 0, 0, 0.55)',
                  paddingVertical: 6,
                  borderRadius: 12,
                }}
                style={{ maxHeight: 66 }}
              >
                {mediaUrls.map((url, i) => (
                  <Pressable
                    key={i}
                    onPress={() => setActiveIndex(i)}
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 8,
                      overflow: 'hidden',
                      borderWidth: 2,
                      borderColor: activeIndex === i ? '#3B82F6' : 'transparent',
                      opacity: activeIndex === i ? 1 : 0.45,
                      cursor: 'pointer' as any,
                    }}
                  >
                    <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* ── CỘT PHẢI: SIDEBAR (Chiếm ~30% trên Desktop, minWidth 360px, 100vh) ─── */}
        <View
          style={{
            width: isDesktop ? Math.max(360, Math.min(480, width * 0.32)) : '100%',
            flex: isDesktop ? undefined : 1,
            height: isDesktop ? '100%' : undefined,
            backgroundColor: '#FFFFFF',
            borderLeftWidth: isDesktop ? 1 : 0,
            borderLeftColor: '#E2E8F0',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header Sidebar: Tác giả, Thời gian, Biểu tượng công khai 🌐 */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: '#F1F5F9',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {post.author?.avatar_url ? (
                <Image
                  source={{ uri: post.author.avatar_url }}
                  style={{ width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: '#E2E8F0' }}
                />
              ) : (
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 21,
                    backgroundColor: 'rgba(31,111,84,0.1)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <User size={22} color={BRAND_COLORS.primary} />
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Text style={{ fontSize: 11, color: '#94A3B8' }}>
                    {formatTheaterTimeAgo(post.created_at)}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#94A3B8' }}>·</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Globe size={11} color="#94A3B8" />
                    <Text style={{ fontSize: 11, color: '#94A3B8' }}>Công khai</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Nút đóng phụ tiện lợi */}
            <Pressable
              onPress={onClose}
              style={{
                padding: 6,
                borderRadius: 20,
                backgroundColor: '#F1F5F9',
                cursor: 'pointer' as any,
              }}
            >
              <X size={18} color="#64748B" />
            </Pressable>
          </View>

          {/* Nội dung cuộn độc lập (ScrollView) */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, gap: 14 }}
            showsVerticalScrollIndicator={true}
          >
            {/* Tên địa điểm */}
            <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 18, color: BRAND_COLORS.text }}>
              {post.place_name}
            </Text>

            {/* 2 Tags Bắt Buộc & Trạng Thái Mở Cửa */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {/* Tag 1: Tỉnh thành */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: '#E8F5E9',
                  paddingHorizontal: 9,
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
                  paddingHorizontal: 9,
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

              {/* Trạng thái mở cửa */}
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

            {/* Rating Stars & Chi phí */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      size={15}
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
                <View style={{ backgroundColor: '#F8FAFC', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B' }}>
                    💰 ~{Number(post.cost_per_person).toLocaleString('vi-VN')} đ / người
                  </Text>
                </View>
              )}
            </View>

            {/* Nội dung bài viết */}
            <Text style={{ fontSize: 14, color: '#334155', lineHeight: 22 }}>
              {post.content}
            </Text>

            {/* Tiêu chí chi tiết (chất lượng, dịch vụ, không khí...) */}
            {post.aspects && (
              <View style={{ backgroundColor: '#F8FAFC', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#F1F5F9', gap: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>
                  Tiêu chí trải nghiệm
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                  {post.aspects.quality && (
                    <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 }}>
                      <Text style={{ fontSize: 11, color: '#334155' }}>
                        💎 Chất lượng: <Text style={{ fontWeight: '700' }}>{post.aspects.quality}</Text>
                      </Text>
                    </View>
                  )}
                  {post.aspects.service && (
                    <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 }}>
                      <Text style={{ fontSize: 11, color: '#334155' }}>
                        🛎️ Dịch vụ: <Text style={{ fontWeight: '700' }}>{post.aspects.service}</Text>
                      </Text>
                    </View>
                  )}
                  {post.aspects.atmosphere && (
                    <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 }}>
                      <Text style={{ fontSize: 11, color: '#334155' }}>
                        🌿 Không khí: <Text style={{ fontWeight: '700' }}>{post.aspects.atmosphere}</Text>
                      </Text>
                    </View>
                  )}
                  {post.aspects.waiting_time && (
                    <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 }}>
                      <Text style={{ fontSize: 11, color: '#334155' }}>
                        ⏱️ Chờ đợi: <Text style={{ fontWeight: '700' }}>{post.aspects.waiting_time}</Text>
                      </Text>
                    </View>
                  )}
                  {post.aspects.booking_method && (
                    <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 }}>
                      <Text style={{ fontSize: 11, color: '#334155' }}>
                        📅 Đặt chỗ: <Text style={{ fontWeight: '700' }}>{post.aspects.booking_method}</Text>
                      </Text>
                    </View>
                  )}
                  {post.aspects.parking && (
                    <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 }}>
                      <Text style={{ fontSize: 11, color: '#334155' }}>
                        🚗 Đỗ xe: <Text style={{ fontWeight: '700' }}>{post.aspects.parking}</Text>
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Nút xem trên Google Maps */}
            {post.google_maps_url ? (
              <Pressable
                testID="theater-btn-gmaps"
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
                  paddingVertical: 6,
                  borderRadius: 8,
                  cursor: 'pointer' as any,
                  opacity: pressed ? 0.8 : 1,
                }]}
              >
                <ExternalLink size={13} color="#166534" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#166534' }}>
                  Xem trên Google Maps
                </Text>
              </Pressable>
            ) : null}

            {/* Số lượt cảm xúc (❤️, 👍,...) và số lượng bình luận */}
            {(reactionsTotal > 0 || commentsCount > 0) && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: 8,
                  borderTopWidth: 1,
                  borderTopColor: '#F1F5F9',
                }}
              >
                {/* Reactions Counter */}
                {reactionsTotal > 0 ? (
                  <Pressable
                    onPress={() => setShowReactionsList(true)}
                    style={({ pressed }) => [{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      opacity: pressed ? 0.7 : 1,
                      cursor: 'pointer' as any,
                    }]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {topEmojis.map((emoji, idx) => (
                        <Text key={idx} style={{ fontSize: 13, marginLeft: idx > 0 ? -3 : 0 }}>
                          {emoji}
                        </Text>
                      ))}
                    </View>
                    <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '600' }}>
                      {reactionsTotal}
                    </Text>
                  </Pressable>
                ) : <View />}

                {/* Comments Counter */}
                {commentsCount > 0 ? (
                  <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '600' }}>
                    {commentsCount} bình luận
                  </Text>
                ) : null}
              </View>
            )}

            {/* Thanh nút tương tác Facebook: Thích, Bình luận, Chia sẻ */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: '#F1F5F9',
                paddingVertical: 4,
                position: 'relative',
              }}
            >
              {/* Floating Reaction Popover (7 cảm xúc) */}
              {hoverReaction && (
                <View
                  // @ts-ignore
                  onMouseEnter={() => {
                    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                    setHoverReaction(true);
                  }}
                  onMouseLeave={() => {
                    hoverTimerRef.current = setTimeout(() => setHoverReaction(false), 300);
                  }}
                  style={{
                    position: 'absolute',
                    bottom: 40,
                    left: 0,
                    flexDirection: 'row',
                    backgroundColor: '#242526',
                    borderRadius: 30,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    boxShadow: '0 6px 20px rgba(0,0,0,0.3)' as any,
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
                          testID={`theater-react-${r.id}`}
                          // @ts-ignore
                          onMouseEnter={() => setHoveredReactionEmoji(r.id)}
                          onMouseLeave={() => setHoveredReactionEmoji(null)}
                          onPress={() => handleSelectReaction(r.id)}
                          style={({ pressed }) => [{
                            padding: 4,
                            borderRadius: 20,
                            transform: [{ scale: isHovered || pressed ? 1.3 : 1 }],
                            cursor: 'pointer' as any,
                          }]}
                        >
                          <Text style={{ fontSize: 24 }}>{r.emoji}</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Nút Thích */}
              <View
                style={{ flex: 1, position: 'relative' }}
                // @ts-ignore
                onMouseEnter={() => {
                  if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                  setHoverReaction(true);
                }}
                onMouseLeave={() => {
                  hoverTimerRef.current = setTimeout(() => setHoverReaction(false), 350);
                }}
              >
                <Pressable
                  testID="theater-btn-like"
                  onPress={() => {
                    const reactToSend = userReaction ? userReaction : 'like';
                    handleSelectReaction(reactToSend);
                  }}
                  style={({ pressed }) => [{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    paddingVertical: 7,
                    borderRadius: 6,
                    backgroundColor: pressed ? '#F1F5F9' : 'transparent',
                    cursor: 'pointer' as any,
                  }]}
                >
                  {userReactionMeta ? (
                    <>
                      <Text style={{ fontSize: 15 }}>{userReactionMeta.emoji}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: userReactionMeta.color }}>
                        {userReactionMeta.label}
                      </Text>
                    </>
                  ) : (
                    <>
                      <ThumbsUp size={15} color="#64748B" />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B' }}>
                        Thích
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>

              {/* Nút Bình luận */}
              <Pressable
                testID="theater-btn-comment"
                onPress={() => {
                  if (commentInputRef.current) {
                    commentInputRef.current.focus?.();
                  }
                }}
                style={({ pressed }) => [{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  paddingVertical: 7,
                  borderRadius: 6,
                  backgroundColor: pressed ? '#F1F5F9' : 'transparent',
                  cursor: 'pointer' as any,
                }]}
              >
                <MessageSquare size={15} color="#64748B" />
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B' }}>
                  Bình luận
                </Text>
              </Pressable>

              {/* Nút Chia sẻ */}
              <Pressable
                testID="theater-btn-share"
                onPress={() => {
                  if (onShare) {
                    onShare(post);
                  } else {
                    if (Platform.OS === 'web' && typeof window !== 'undefined' && navigator.clipboard) {
                      navigator.clipboard.writeText(window.location.href);
                    }
                    Alert.alert('Chia sẻ thành công', `Đã sao chép liên kết bài viết "${post.place_name}"!`);
                  }
                }}
                style={({ pressed }) => [{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  paddingVertical: 7,
                  borderRadius: 6,
                  backgroundColor: pressed ? '#F1F5F9' : 'transparent',
                  cursor: 'pointer' as any,
                }]}
              >
                <Share2 size={15} color="#64748B" />
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B' }}>
                  Chia sẻ
                </Text>
              </Pressable>
            </View>

            {/* Danh sách toàn bộ bình luận */}
            <View style={{ gap: 12, marginTop: 4 }}>
              {localComments && localComments.length > 0 ? (
                localComments.map((cmt: any) => {
                  const canDeleteCmt = currentUser?.id === cmt.user_id || canDeletePost;
                  const isLikedCmt = !!likedCommentIds[cmt.id];

                  return (
                    <View key={cmt.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                      {cmt.author?.avatar_url ? (
                        <Image
                          source={{ uri: cmt.author.avatar_url }}
                          style={{ width: 32, height: 32, borderRadius: 16, marginTop: 2 }}
                        />
                      ) : (
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            backgroundColor: 'rgba(31,111,84,0.1)',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: 2,
                          }}
                        >
                          <User size={15} color={BRAND_COLORS.primary} />
                        </View>
                      )}

                      <View style={{ flex: 1 }}>
                        {/* Bong bóng bình luận */}
                        <View
                          style={{
                            backgroundColor: '#F0F2F5',
                            borderRadius: 16,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            alignSelf: 'flex-start',
                            maxWidth: '95%',
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: BRAND_COLORS.text }}>
                            {cmt.author?.full_name || 'Người dùng ViVu'}
                          </Text>

                          {!!cmt.content && (
                            <Text style={{ fontSize: 13, color: '#1B2420', marginTop: 2, lineHeight: 18 }}>
                              {cmt.content}
                            </Text>
                          )}

                          {/* Media đính kèm (Ảnh / GIF / Sticker) */}
                          {cmt.media_url && (
                            <View style={{ marginTop: 6, borderRadius: 8, overflow: 'hidden' }}>
                              {cmt.media_type === 'sticker' ? (
                                <Image
                                  source={{ uri: cmt.media_url }}
                                  style={{ width: 80, height: 80 }}
                                  resizeMode="contain"
                                />
                              ) : cmt.media_type === 'gif' ? (
                                <Image
                                  source={{ uri: cmt.media_url }}
                                  style={{ width: 200, height: 130, borderRadius: 8 }}
                                  resizeMode="cover"
                                />
                              ) : (
                                <Image
                                  source={{ uri: cmt.media_url }}
                                  style={{ width: 220, height: 140, borderRadius: 8 }}
                                  resizeMode="cover"
                                />
                              )}
                            </View>
                          )}
                        </View>

                        {/* Thanh tác vụ dưới bình luận */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 3, marginLeft: 8 }}>
                          <Pressable
                            onPress={() => setLikedCommentIds((prev) => ({ ...prev, [cmt.id]: !prev[cmt.id] }))}
                            style={{ cursor: 'pointer' as any }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: '700',
                                color: isLikedCmt ? '#1877F2' : '#64748B',
                              }}
                            >
                              Thích
                            </Text>
                          </Pressable>

                          <Pressable
                            onPress={() => {
                              setCommentText(`@${cmt.author?.full_name || 'Người dùng'} `);
                              if (commentInputRef.current) commentInputRef.current.focus?.();
                            }}
                            style={{ cursor: 'pointer' as any }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B' }}>
                              Phản hồi
                            </Text>
                          </Pressable>

                          <Text style={{ fontSize: 10, color: '#94A3B8' }}>
                            {formatTheaterTimeAgo(cmt.created_at)}
                          </Text>

                          {canDeleteCmt && (
                            <Pressable
                              testID={`theater-btn-delete-comment-${cmt.id}`}
                              onPress={() => handleDeleteComment(cmt.id)}
                              style={{ cursor: 'pointer' as any }}
                            >
                              <Text style={{ fontSize: 10, color: '#EF4444', fontWeight: '600' }}>
                                Xóa
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic', textAlign: 'center', marginVertical: 10 }}>
                  Chưa có bình luận nào. Hãy là người đầu tiên bình luận!
                </Text>
              )}
            </View>
          </ScrollView>

          {/* ── KHUNG GÕ BÌNH LUẬN KIỂU FACEBOOK CỐ ĐỊNH Ở ĐÁY CỘT PHẢI ─── */}
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: '#E2E8F0',
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: '#FFFFFF',
              gap: 8,
            }}
          >
            {/* Popover Trays */}
            {activeCommentToolbar === 'emoji' && (
              <View
                testID="theater-tray-emoji"
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 12,
                  padding: 8,
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.08)' as any,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B' }}>Biểu tượng cảm xúc 😊</Text>
                  <Pressable onPress={() => setActiveCommentToolbar(null)} style={{ cursor: 'pointer' as any }}>
                    <X size={14} color="#94A3B8" />
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, maxHeight: 120, overflow: 'hidden' }}>
                  {COMMENT_EMOJIS.slice(0, 30).map((emoji, idx) => (
                    <Pressable
                      key={idx}
                      testID={`theater-emoji-item-${idx}`}
                      onPress={() => setCommentText((prev) => prev + emoji)}
                      style={({ pressed }) => [{
                        padding: 3,
                        borderRadius: 4,
                        backgroundColor: pressed ? '#F1F5F9' : 'transparent',
                        cursor: 'pointer' as any,
                      }]}
                    >
                      <Text style={{ fontSize: 18 }}>{emoji}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {activeCommentToolbar === 'gif' && (
              <View
                testID="theater-tray-gif"
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 12,
                  padding: 10,
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.08)' as any,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND_COLORS.text }}>Chọn ảnh GIF 🎞️</Text>
                  <Pressable onPress={() => setActiveCommentToolbar(null)} style={{ cursor: 'pointer' as any }}>
                    <X size={14} color="#94A3B8" />
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {CURATED_GIFS.map((gif) => (
                    <Pressable
                      key={gif.id}
                      testID={`theater-gif-item-${gif.id}`}
                      onPress={() => {
                        setCommentMediaAttachment({ type: 'gif', url: gif.url });
                        setActiveCommentToolbar(null);
                      }}
                      style={{ borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: '#CBD5E1', cursor: 'pointer' as any }}
                    >
                      <Image source={{ uri: gif.url }} style={{ width: 88, height: 60 }} resizeMode="cover" />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {activeCommentToolbar === 'sticker' && (
              <View
                testID="theater-tray-sticker"
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 12,
                  padding: 10,
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.08)' as any,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: BRAND_COLORS.text }}>Bộ nhãn dán ViVu 🧸</Text>
                  <Pressable onPress={() => setActiveCommentToolbar(null)} style={{ cursor: 'pointer' as any }}>
                    <X size={14} color="#94A3B8" />
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {CURATED_STICKERS.map((stk) => (
                    <Pressable
                      key={stk.id}
                      testID={`theater-sticker-item-${stk.id}`}
                      onPress={() => {
                        setCommentMediaAttachment({ type: 'sticker', url: stk.url });
                        setActiveCommentToolbar(null);
                      }}
                      style={{ padding: 4, borderRadius: 8, backgroundColor: '#F8FAFC', cursor: 'pointer' as any }}
                    >
                      <Image source={{ uri: stk.url }} style={{ width: 44, height: 44 }} resizeMode="contain" />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Row Avatar & Input Pill */}
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              {userProfile?.avatar_url ? (
                <Image
                  source={{ uri: userProfile.avatar_url }}
                  style={{ width: 34, height: 34, borderRadius: 17, marginTop: 2, borderWidth: 1, borderColor: '#CBD5E1' }}
                />
              ) : (
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: '#1877F2',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 2,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>
                    {userProfile?.full_name ? userProfile.full_name.charAt(0).toUpperCase() : 'U'}
                  </Text>
                </View>
              )}

              <View style={{ flex: 1, gap: 4 }}>
                <View
                  style={{
                    backgroundColor: '#F0F2F5',
                    borderRadius: 18,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                  }}
                >
                  {/* Media đính kèm xem trước */}
                  {commentMediaAttachment && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: '#FFFFFF',
                        padding: 5,
                        borderRadius: 8,
                        alignSelf: 'flex-start',
                        marginBottom: 4,
                        borderWidth: 1,
                        borderColor: '#CBD5E1',
                      }}
                    >
                      <Image
                        source={{ uri: commentMediaAttachment.url }}
                        style={{ width: 36, height: 36, borderRadius: 4 }}
                        resizeMode={commentMediaAttachment.type === 'sticker' ? 'contain' : 'cover'}
                      />
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#1E293B' }}>
                        {commentMediaAttachment.type === 'image'
                          ? '📷 Ảnh'
                          : commentMediaAttachment.type === 'gif'
                          ? '🎞️ GIF'
                          : '🧸 Sticker'}
                      </Text>
                      <Pressable
                        onPress={() => setCommentMediaAttachment(null)}
                        style={{ padding: 2, cursor: 'pointer' as any }}
                      >
                        <X size={12} color="#64748B" />
                      </Pressable>
                    </View>
                  )}

                  {/* Indicator đang tải ảnh */}
                  {isUploadingMedia && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <ActivityIndicator size="small" color={BRAND_COLORS.primary} />
                      <Text style={{ fontSize: 11, color: '#64748B' }}>Đang tải ảnh lên...</Text>
                    </View>
                  )}

                  {/* Ô nhập bình luận */}
                  <TextInput
                    ref={commentInputRef}
                    testID="theater-input-comment"
                    placeholder={currentUser ? 'Viết bình luận...' : 'Đăng nhập để bình luận'}
                    placeholderTextColor="#94A3B8"
                    value={commentText}
                    onChangeText={setCommentText}
                    multiline
                    editable={!!currentUser}
                    style={{
                      fontSize: 13,
                      color: BRAND_COLORS.text,
                      minHeight: 22,
                      maxHeight: 80,
                      paddingVertical: 2,
                    }}
                  />

                  {/* 4 công cụ (Emoji, Ảnh, GIF, Sticker) & nút gửi */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 4,
                      paddingTop: 3,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      {/* Emoji */}
                      <Pressable
                        testID="theater-btn-open-emoji"
                        onPress={() => setActiveCommentToolbar((prev) => (prev === 'emoji' ? null : 'emoji'))}
                        style={({ pressed }) => [{
                          padding: 4,
                          borderRadius: 14,
                          backgroundColor: activeCommentToolbar === 'emoji' ? '#E2E8F0' : pressed ? '#E2E8F0' : 'transparent',
                          cursor: 'pointer' as any,
                        }]}
                      >
                        <Smile size={17} color={activeCommentToolbar === 'emoji' ? BRAND_COLORS.primary : '#64748B'} />
                      </Pressable>

                      {/* Camera / Ảnh */}
                      <Pressable
                        testID="theater-btn-open-camera"
                        onPress={triggerImagePicker}
                        style={({ pressed }) => [{
                          padding: 4,
                          borderRadius: 14,
                          backgroundColor: pressed ? '#E2E8F0' : 'transparent',
                          cursor: 'pointer' as any,
                        }]}
                      >
                        <Camera size={17} color="#64748B" />
                      </Pressable>

                      {/* GIF */}
                      <Pressable
                        testID="theater-btn-open-gif"
                        onPress={() => setActiveCommentToolbar((prev) => (prev === 'gif' ? null : 'gif'))}
                        style={({ pressed }) => [{
                          paddingHorizontal: 5,
                          paddingVertical: 2,
                          borderRadius: 5,
                          backgroundColor: activeCommentToolbar === 'gif' ? '#CBD5E1' : pressed ? '#CBD5E1' : '#E2E8F0',
                          cursor: 'pointer' as any,
                        }]}
                      >
                        <Text style={{ fontSize: 9, fontWeight: '800', color: activeCommentToolbar === 'gif' ? BRAND_COLORS.primary : '#475569' }}>
                          GIF
                        </Text>
                      </Pressable>

                      {/* Sticker */}
                      <Pressable
                        testID="theater-btn-open-sticker"
                        onPress={() => setActiveCommentToolbar((prev) => (prev === 'sticker' ? null : 'sticker'))}
                        style={({ pressed }) => [{
                          padding: 4,
                          borderRadius: 14,
                          backgroundColor: activeCommentToolbar === 'sticker' ? '#E2E8F0' : pressed ? '#E2E8F0' : 'transparent',
                          cursor: 'pointer' as any,
                        }]}
                      >
                        <Text style={{ fontSize: 14 }}>🧸</Text>
                      </Pressable>
                    </View>

                    {/* Nút gửi */}
                    <Pressable
                      testID="theater-btn-send-comment"
                      disabled={!currentUser || (!commentText.trim() && !commentMediaAttachment) || isSubmitting}
                      onPress={handleSubmitComment}
                      style={({ pressed }) => [{
                        opacity: !commentText.trim() && !commentMediaAttachment ? 0.35 : 1,
                        padding: 5,
                        borderRadius: 14,
                        backgroundColor: pressed ? '#E2E8F0' : 'transparent',
                        cursor: 'pointer' as any,
                      }]}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator size="small" color={BRAND_COLORS.primary} />
                      ) : (
                        <Send size={15} color={BRAND_COLORS.primary} />
                      )}
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Modal Danh sách cảm xúc */}
      <ReactionsListModal
        visible={showReactionsList}
        onClose={() => setShowReactionsList(false)}
        postId={post?.id || null}
        totalReactions={reactionsTotal}
      />
    </Modal>
  );
}
