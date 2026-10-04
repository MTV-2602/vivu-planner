import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  FlatList,
  ActivityIndicator,
  Image,
  Modal,
  Platform,
} from 'react-native';
import { X, Activity } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { BRAND_COLORS } from '../constants';

export interface ActivityLogItem {
  id: string;
  trip_id: string;
  user_id?: string;
  display_name?: string;
  avatar_url?: string;
  action?: string;
  action_type?: string;
  item_title?: string;
  item_id?: string;
  details?: any;
  detail?: any;
  created_at: string;
}

export interface ActivityFeedProps {
  tripId: string;
  visible: boolean;
  onClose: () => void;
  currentUserId?: string;
}

export const ACTION_LABELS: Record<string, string> = {
  drag_item: 'đã di chuyển',
  edit_item: 'đã chỉnh sửa',
  add_item: 'đã thêm',
  delete_item: 'đã xóa',
  join_trip: 'đã tham gia nhóm',
  leave_trip: 'đã rời nhóm',
  save_schedule: 'đã lưu lịch trình',
  apply_ai: 'áp dụng đề xuất AI',
  view_trip: 'đang xem lịch trình',
};

const ACTION_COLORS: Record<string, string> = {
  drag_item: '#10B981',     // green
  edit_item: '#3B82F6',     // blue
  add_item: '#F59E0B',      // amber
  delete_item: '#EF4444',   // red
  join_trip: '#10B981',     // green
  leave_trip: '#6B7280',    // gray
  save_schedule: '#7C3AED', // purple
  apply_ai: '#8B5CF6',      // violet
  view_trip: '#06B6D4',     // cyan
};

export function timeAgo(dateStr: string): string {
  if (!dateStr) return 'vừa xong';
  const diff = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${Math.max(0, sec)} giây trước`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const day = Math.floor(hr / 24);
  return `${day} ngày trước`;
}

function getDetailsText(item: ActivityLogItem): string | null {
  const details = item.details || item.detail;
  if (!details) return null;
  if (typeof details === 'string') return details;
  if (typeof details === 'object') {
    if (details.from_time && details.to_time) {
      return `sang ${details.to_time}`;
    }
    if (details.to_time) {
      return `sang ${details.to_time}`;
    }
    if (details.day_number) {
      return `vào Ngày ${details.day_number}`;
    }
    if (details.target) {
      return details.target;
    }
    if (details.message) {
      return details.message;
    }
  }
  return null;
}

export default function ActivityFeed({
  tripId,
  visible,
  onClose,
  currentUserId,
}: ActivityFeedProps) {
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [loading, setLoading] = useState(false);

  // 1. Khi mount hoặc tripId đổi: gọi GET /api/trips/:tripId/activity để load 50 log gần nhất
  const fetchActivities = useCallback(async () => {
    if (!tripId) return;
    setLoading(true);
    try {
      const res = await api.get(`/trips/${tripId}/activity`);
      const raw = res.data;
      const items: ActivityLogItem[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
          ? raw.data
          : Array.isArray(raw?.logs)
            ? raw.logs
            : [];
      setLogs(items.slice(0, 50));
    } catch {
      // Fallback trực tiếp qua Supabase nếu endpoint chưa được cấu hình
      try {
        const { data, error } = await supabase
          .from('trip_activity_log')
          .select('*')
          .eq('trip_id', tripId)
          .order('created_at', { ascending: false })
          .limit(50);
        if (!error && Array.isArray(data)) {
          setLogs(data as ActivityLogItem[]);
        }
      } catch {
        // Không ngắt mạch giao diện nếu bảng chưa tồn tại
      }
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    if (visible && tripId) {
      fetchActivities();
    }
  }, [visible, tripId, fetchActivities]);

  // 2. Subscribe postgres_changes và broadcast trên channel cố định trip-activity-${tripId}
  useEffect(() => {
    if (!tripId) return;

    const channelName = `trip-activity-${tripId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trip_activity_log',
          filter: `trip_id=eq.${tripId}`,
        },
        (payload) => {
          if (payload?.new) {
            const newLog = payload.new as ActivityLogItem;
            setLogs((prev) => {
              if (prev.some((item) => item.id === newLog.id)) return prev;
              return [newLog, ...prev].slice(0, 50);
            });
          }
        }
      )
      .on('broadcast', { event: 'new_activity' }, (payload: any) => {
        const data = payload?.payload || payload;
        if (data) {
          const newLog = data as ActivityLogItem;
          setLogs((prev) => {
            if (prev.some((item) => item.id === newLog.id)) return prev;
            return [newLog, ...prev].slice(0, 50);
          });
        }
      })
      .on('broadcast', { event: 'user_action' }, (payload: any) => {
        const data = payload?.payload || payload;
        if (data) {
          const newLog: ActivityLogItem = {
            id: data.id || `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            trip_id: tripId,
            user_id: data.user_id,
            display_name: data.display_name,
            action: data.action_type || data.action,
            action_type: data.action_type || data.action,
            item_title: data.item_title,
            created_at: data.timestamp || new Date().toISOString(),
          };
          setLogs((prev) => {
            if (prev.some((item) => item.id === newLog.id)) return prev;
            return [newLog, ...prev].slice(0, 50);
          });
        }
      })
      .on('broadcast', { event: 'activity' }, (payload: any) => {
        const data = payload?.payload || payload;
        if (data) {
          const newLog = data as ActivityLogItem;
          setLogs((prev) => {
            if (prev.some((item) => item.id === newLog.id)) return prev;
            return [newLog, ...prev].slice(0, 50);
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId]);

  if (!visible) return null;

  const renderLogItem = ({ item }: { item: ActivityLogItem }) => {
    const actionKey = item.action || item.action_type || 'view_trip';
    const dotColor = ACTION_COLORS[actionKey] || '#10B981';
    const actionLabel = ACTION_LABELS[actionKey] || actionKey || 'đã thao tác';
    const isMe = Boolean(currentUserId && item.user_id === currentUserId);
    const displayName = item.display_name || (isMe ? 'Bạn' : 'Thành viên');
    const details = getDetailsText(item);

    return (
      <View style={styles.logItem}>
        {/* Avatar nhỏ 32px + Status indicator */}
        <View style={styles.avatarContainer}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: dotColor }]}>
              <Text style={styles.avatarInitial}>
                {(displayName || '?')[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View style={[styles.statusBadge, { backgroundColor: dotColor }]} />
        </View>

        {/* Nội dung log */}
        <View style={styles.logContent}>
          <View style={styles.logHeaderRow}>
            <Text style={styles.userName} numberOfLines={1}>
              {displayName} {isMe && !displayName.includes('Bạn') && <Text style={styles.meTag}>(Bạn)</Text>}
            </Text>
            <Text style={styles.timeMuted}>· {timeAgo(item.created_at)}</Text>
          </View>

          <Text style={styles.actionRow} numberOfLines={2}>
            <Text style={styles.actionLabel}>{actionLabel}</Text>
            {item.item_title ? (
              <Text style={styles.itemTitle}> "{item.item_title}"</Text>
            ) : null}
            {details ? <Text style={styles.detailText}> {details}</Text> : null}
          </Text>
        </View>
      </View>
    );
  };

  const panelContent = (
    <View style={styles.panelCard}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerEmoji}>📋</Text>
          <Text style={styles.headerTitle}>Hoạt động nhóm</Text>
        </View>
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Đóng"
        >
          <X size={18} color={BRAND_COLORS.textSoft} />
        </TouchableOpacity>
      </View>

      {/* Body List */}
      {loading && logs.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="small" color={BRAND_COLORS.primary} />
          <Text style={styles.loadingText}>Đang tải hoạt động...</Text>
        </View>
      ) : logs.length === 0 ? (
        <View style={styles.centerContainer}>
          <Activity size={28} color={BRAND_COLORS.textMuted} />
          <Text style={styles.emptyTitle}>Chưa có hoạt động</Text>
          <Text style={styles.emptySubtitle}>Các thao tác chỉnh sửa sẽ xuất hiện tại đây theo thời gian thực.</Text>
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item, index) => item.id || `act_${index}_${item.created_at}`}
          renderItem={renderLogItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
          style={styles.list}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );

  // Giao diện web: floating panel góc phải; mobile: slide-up modal
  if (Platform.OS === 'web') {
    return <View style={styles.webFloatingWrapper}>{panelContent}</View>;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.mobileBackdrop} onPress={onClose}>
        <Pressable style={styles.mobileSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          {panelContent}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  webFloatingWrapper: {
    position: 'absolute',
    top: 72,
    right: 16,
    zIndex: 9999,
  },
  panelCard: {
    width: Platform.OS === 'web' ? 340 : '100%',
    maxHeight: Platform.OS === 'web' ? 500 : 540,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(27,36,32,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(27,36,32,0.08)',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerEmoji: {
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: BRAND_COLORS.text,
  },
  closeBtn: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(27,36,32,0.05)',
  },
  list: {
    marginTop: 6,
  },
  listContent: {
    paddingVertical: 4,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    gap: 10,
  },
  avatarContainer: {
    position: 'relative',
    width: 32,
    height: 32,
  },
  avatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
  },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  statusBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  logContent: {
    flex: 1,
    justifyContent: 'center',
  },
  logHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 2,
  },
  userName: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND_COLORS.text,
  },
  meTag: {
    fontSize: 11,
    fontWeight: '500',
    color: BRAND_COLORS.primary,
  },
  timeMuted: {
    fontSize: 11,
    color: BRAND_COLORS.textMuted,
  },
  actionRow: {
    fontSize: 12,
    lineHeight: 17,
    color: BRAND_COLORS.textSoft,
  },
  actionLabel: {
    color: BRAND_COLORS.textSoft,
  },
  itemTitle: {
    fontWeight: '700',
    color: BRAND_COLORS.text,
  },
  detailText: {
    color: BRAND_COLORS.primary,
    fontWeight: '600',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(27,36,32,0.05)',
  },
  centerContainer: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: BRAND_COLORS.textMuted,
    marginTop: 4,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND_COLORS.textSoft,
  },
  emptySubtitle: {
    fontSize: 12,
    color: BRAND_COLORS.textMuted,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  mobileBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  mobileSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 8,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(27,36,32,0.2)',
    alignSelf: 'center',
    marginBottom: 12,
  },
});
