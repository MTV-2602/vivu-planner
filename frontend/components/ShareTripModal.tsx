import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal, View, Text, TouchableOpacity, FlatList,
  ActivityIndicator, StyleSheet, Alert, Platform, ScrollView,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { X, Users, Crown, Clock, Trash2, Link, RefreshCw } from 'lucide-react-native';
import { api } from '../lib/api';

interface Collaborator {
  id: string;
  user_id: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  accepted_at: string | null;
  is_pending: boolean;
  invite_token?: string;
}

interface Owner {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_premium: boolean;
}

interface ShareTripModalProps {
  visible: boolean;
  onClose: () => void;
  tripId: string;
  tripTitle: string;
  isOwner: boolean;
  currentUserId?: string;
  onMemberKicked?: () => void;
}

export default function ShareTripModal({
  visible, onClose, tripId, tripTitle, isOwner, currentUserId, onMemberKicked,
}: ShareTripModalProps) {
  const [owner, setOwner] = useState<Owner | null>(null);
  const [members, setMembers] = useState<Collaborator[]>([]);
  const [totalCount, setTotalCount] = useState(1);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [kicking, setKicking] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{type: 'kick'|'leave', targetId?: string, targetName?: string} | null>(null);

  const fetchCollaborators = useCallback(async () => {
    if (!tripId) return;
    setLoading(true);
    try {
      const res = await api.get(`/trips/${tripId}/collaborators`);
      const data = res.data;
      setOwner(data.owner || null);
      setMembers(data.members || []);
      setTotalCount(data.total_count || 1);
    } catch (e) {
      console.error('fetchCollaborators error:', e);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    if (visible && tripId) {
      fetchCollaborators();
      setInviteUrl(null);
    }
  }, [visible, tripId, fetchCollaborators]);

  const handleCreateInvite = async () => {
    setCreating(true);
    try {
      const res = await api.post(`/trips/${tripId}/collaborators`);
      const data = res.data;
      const token = data.invite_token;
      const webUrl = typeof window !== 'undefined' 
        ? `${window.location.origin}/join/${token}`
        : `vivu://join/${token}`;
      setInviteUrl(Platform.OS === 'web' ? webUrl : (data.invite_url || `vivu://join/${token}`));
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'Không thể tạo link mời';
      Alert.alert('Lỗi', msg);
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      if (Clipboard && typeof Clipboard.setStringAsync === 'function') {
        await Clipboard.setStringAsync(inviteUrl);
      } else if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(inviteUrl);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('handleCopy error:', e);
    }
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    const { type, targetId } = confirmAction;
    if (type === 'kick') {
      if (!targetId) return;
      setKicking(targetId);
      try {
        await api.delete(`/trips/${tripId}/collaborators/${targetId}`);
        await fetchCollaborators();
        onMemberKicked?.();
      } catch (e: any) {
        const msg = e?.response?.data?.error || 'Không thể xóa thành viên';
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert(msg);
        } else {
          Alert.alert('Lỗi', msg);
        }
      } finally {
        setKicking(null);
      }
    } else if (type === 'leave') {
      if (!currentUserId) return;
      try {
        await api.delete(`/trips/${tripId}/collaborators/${currentUserId}`);
        onClose();
      } catch (e: any) {
        const msg = e?.response?.data?.error || 'Không thể rời nhóm';
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert(msg);
        } else {
          Alert.alert('Lỗi', msg);
        }
      }
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Users size={20} color="#1F6F54" />
              <Text style={styles.headerTitle}>Chia sẻ lịch trình</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <X size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <Text style={styles.tripTitle} numberOfLines={1}>{tripTitle}</Text>

          {loading ? (
            <ActivityIndicator size="large" color="#1F6F54" style={{ marginVertical: 40 }} />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
              {/* Invite Link Section — chỉ owner */}
              {isOwner && (
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Link size={14} color="#1F6F54" />
                    <Text style={styles.sectionTitle}>Link mời nhóm</Text>
                    <Text style={styles.expireNote}>(hết hạn sau 7 ngày)</Text>
                  </View>
                  {inviteUrl ? (
                    <View style={styles.linkBox}>
                      <Text style={styles.linkText} numberOfLines={1} ellipsizeMode="middle">
                        {inviteUrl}
                      </Text>
                      <TouchableOpacity onPress={handleCopy} style={styles.copyBtn}>
                        <Text style={styles.copyBtnText}>{copied ? '✓ Đã chép' : '📋 Copy'}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  <TouchableOpacity
                    onPress={handleCreateInvite}
                    disabled={creating || totalCount >= 5}
                    style={[styles.createBtn, (creating || totalCount >= 5) && styles.createBtnDisabled]}
                  >
                    {creating ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <RefreshCw size={14} color="#fff" />
                        <Text style={styles.createBtnText}>
                          {inviteUrl ? '🔄 Tạo link mới' : '✨ Tạo link mời'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {totalCount >= 5 && (
                    <Text style={styles.maxNote}>⚠️ Đã đủ 5 thành viên tối đa</Text>
                  )}
                </View>
              )}

              {/* Members List */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Thành viên ({totalCount}/5)</Text>
                </View>

                {/* Owner */}
                {owner && (
                  <View style={styles.memberRow}>
                    <View style={styles.avatarCircle}>
                      <Text style={styles.avatarInitial}>
                        {(owner.display_name || '?')[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{owner.display_name || 'Chủ lịch trình'}</Text>
                      <Text style={styles.memberRole}>Chủ lịch trình</Text>
                    </View>
                    <View style={styles.ownerBadge}>
                      <Crown size={12} color="#B45309" />
                      <Text style={styles.ownerBadgeText}>Chủ</Text>
                    </View>
                  </View>
                )}

                {/* Members */}
                {members.filter(m => !m.is_pending && m.accepted_at).map(member => (
                  <View key={member.id} style={styles.memberRow}>
                    <View style={styles.avatarCircle}>
                      <Text style={styles.avatarInitial}>
                        {(member.display_name || '?')[0].toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{member.display_name || 'Thành viên'}</Text>
                      <Text style={styles.memberRole}>Thành viên</Text>
                    </View>
                    {isOwner && member.user_id && (
                      <TouchableOpacity
                        onPress={() => setConfirmAction({ type: 'kick', targetId: member.user_id!, targetName: member.display_name || 'thành viên' })}
                        disabled={kicking === member.user_id}
                        style={styles.kickBtn}
                      >
                        {kicking === member.user_id
                          ? <ActivityIndicator size="small" color="#EF4444" />
                          : <Trash2 size={14} color="#EF4444" />
                        }
                      </TouchableOpacity>
                    )}
                    {!isOwner && member.user_id === currentUserId && (
                      <TouchableOpacity
                        onPress={() => setConfirmAction({ type: 'leave' })}
                        style={styles.leaveBtn}
                      >
                        <Text style={styles.leaveBtnText}>Rời nhóm</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                {/* Pending */}
                {members.filter(m => m.is_pending || !m.accepted_at).map(member => (
                  <View key={member.id} style={[styles.memberRow, styles.pendingRow]}>
                    <View style={[styles.avatarCircle, { backgroundColor: '#F3F4F6' }]}>
                      <Clock size={14} color="#9CA3AF" />
                    </View>
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>Đang chờ xác nhận...</Text>
                      <Text style={styles.memberRole}>Chưa tham gia</Text>
                    </View>
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>Chờ</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Info note */}
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  ℹ️ Thành viên có thể xem và chỉnh sửa các hoạt động trong lịch trình.
                  Ngân sách chuyến đi chỉ chủ lịch trình mới được chỉnh sửa.
                </Text>
              </View>
            </ScrollView>
          )}

          {confirmAction && (
            <View style={styles.confirmOverlay}>
              <View style={styles.confirmBox}>
                <Text style={styles.confirmTitle}>
                  {confirmAction.type === 'leave' ? 'Rời nhóm?' : `Xóa ${confirmAction.targetName}?`}
                </Text>
                <Text style={styles.confirmMsg}>
                  {confirmAction.type === 'leave' 
                    ? 'Bạn sẽ mất quyền truy cập lịch trình này.' 
                    : 'Thành viên này sẽ mất quyền truy cập.'}
                </Text>
                <View style={styles.confirmBtns}>
                  <TouchableOpacity onPress={() => setConfirmAction(null)} style={styles.confirmCancel}>
                    <Text style={styles.confirmCancelText}>Huỷ</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { handleConfirm(); setConfirmAction(null); }} style={styles.confirmOk}>
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Xác nhận</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
    padding: 24,
    position: 'relative' as const,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripTitle: { fontSize: 13, color: '#6B7280', marginBottom: 18 },
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151' },
  expireNote: { fontSize: 11, color: '#9CA3AF' },
  linkBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 10, marginBottom: 8, gap: 8 },
  linkText: { flex: 1, fontSize: 12, color: '#374151' },
  copyBtn: { backgroundColor: '#1F6F54', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
  copyBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1F6F54', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 },
  createBtnDisabled: { backgroundColor: '#A7F3D0' },
  createBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  maxNote: { marginTop: 6, fontSize: 12, color: '#EF4444', textAlign: 'center' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  pendingRow: { opacity: 0.6 },
  avatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E6F4EA', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#137333', fontSize: 14, fontWeight: '700' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 13, fontWeight: '600', color: '#111827' },
  memberRole: { fontSize: 11, color: '#9CA3AF' },
  ownerBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#F59E0B', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6 },
  ownerBadgeText: { fontSize: 10, color: '#B45309', fontWeight: '700' },
  kickBtn: { padding: 8 },
  leaveBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: '#EF4444' },
  leaveBtnText: { fontSize: 11, color: '#EF4444', fontWeight: '600' },
  pendingBadge: { backgroundColor: '#FEF3C7', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6 },
  pendingBadgeText: { fontSize: 10, color: '#92400E', fontWeight: '600' },
  infoBox: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#DCFCE7', borderRadius: 10, padding: 12 },
  infoText: { fontSize: 12, color: '#166534', lineHeight: 18 },
  confirmOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBox: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: 300,
    maxWidth: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  confirmTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  confirmMsg: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
    marginBottom: 20,
  },
  confirmBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  confirmCancel: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  confirmCancelText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 13,
  },
  confirmOk: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
  },
});
