import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Flag, X, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react-native';
import { BRAND_COLORS } from '../constants';
import { api } from '../lib/api';

const REPORT_REASONS = [
  { id: 'spam', label: 'Spam hoặc quảng cáo trái phép', icon: '🚫' },
  { id: 'harassment', label: 'Ngôn từ thù ghét, xúc phạm, thiếu văn minh', icon: '🤬' },
  { id: 'misinformation', label: 'Thông tin địa điểm giả mạo, lừa đảo', icon: '📍' },
  { id: 'inappropriate', label: 'Nội dung hoặc hình ảnh phản cảm', icon: '🔞' },
  { id: 'other', label: 'Lý do khác (ghi chú chi tiết bên dưới)', icon: '⚠️' },
];

interface ReportModalProps {
  visible: boolean;
  postId: string | null;
  placeName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ReportModal({
  visible,
  postId,
  placeName,
  onClose,
  onSuccess,
}: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState(REPORT_REASONS[0].label);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async () => {
    if (!postId) return;
    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await api.post(`/posts/${postId}/report`, {
        reason: selectedReason,
        details: note.trim(),
      });

      if (res.data?.success) {
        setSuccessMsg(res.data.message || 'Báo cáo của bạn đã được gửi thành công!');
        setTimeout(() => {
          setSuccessMsg('');
          setNote('');
          onSuccess?.();
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Không thể gửi báo cáo vào lúc này');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setErrorMsg('');
    setSuccessMsg('');
    setNote('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(20, 32, 27, 0.7)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
        }}
      >
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            width: '100%',
            maxWidth: 520,
            padding: 24,
            gap: 16,
            boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.3)' as any,
          }}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: '#FEF2F2',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Flag size={20} color="#DC2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 18, color: BRAND_COLORS.text }}>
                  Báo Cáo Bài Viết
                </Text>
                <Text style={{ fontSize: 13, color: BRAND_COLORS.textMuted }} numberOfLines={1}>
                  Địa điểm: {placeName}
                </Text>
              </View>
            </View>

            <Pressable
              testID="btn-close-report-modal"
              onPress={handleClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: '#F1F5F9',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer' as any,
              }}
            >
              <X size={16} color="#64748B" />
            </Pressable>
          </View>

          {/* Alert Messages */}
          {!!errorMsg && (
            <View
              style={{
                flexDirection: 'row',
                gap: 8,
                alignItems: 'center',
                backgroundColor: '#FEF2F2',
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#FCA5A5',
              }}
            >
              <AlertCircle size={16} color="#DC2626" />
              <Text style={{ fontSize: 13, color: '#DC2626', flex: 1 }}>{errorMsg}</Text>
            </View>
          )}

          {!!successMsg && (
            <View
              style={{
                flexDirection: 'row',
                gap: 8,
                alignItems: 'center',
                backgroundColor: '#F0FDF4',
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#86EFAC',
              }}
            >
              <CheckCircle2 size={16} color="#16A34A" />
              <Text style={{ fontSize: 13, color: '#16A34A', flex: 1 }}>{successMsg}</Text>
            </View>
          )}

          {/* Reasons List */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_COLORS.text }}>
              Chọn lý do báo cáo vi phạm:
            </Text>
            {REPORT_REASONS.map((r) => {
              const isSelected = selectedReason === r.label;
              return (
                <Pressable
                  key={r.id}
                  testID={`report-reason-${r.id}`}
                  onPress={() => setSelectedReason(r.label)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 1.5,
                    borderColor: isSelected ? '#DC2626' : '#E2E8F0',
                    backgroundColor: isSelected ? '#FEF2F2' : '#F8FAFC',
                    cursor: 'pointer' as any,
                  }}
                >
                  <Text style={{ fontSize: 16 }}>{r.icon}</Text>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: isSelected ? '700' : '500',
                      color: isSelected ? '#991B1B' : BRAND_COLORS.text,
                      flex: 1,
                    }}
                  >
                    {r.label}
                  </Text>
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      borderWidth: 1.5,
                      borderColor: isSelected ? '#DC2626' : '#CBD5E1',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isSelected && (
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#DC2626' }} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Optional Note */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_COLORS.text }}>
              Mô tả chi tiết bổ sung (tùy chọn):
            </Text>
            <TextInput
              testID="input-report-details"
              placeholder="Cung cấp thêm chi tiết giúp Admin xử lý nhanh hơn..."
              placeholderTextColor="#94A3B8"
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
              style={{
                backgroundColor: '#F8FAFC',
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#E2E8F0',
                padding: 10,
                fontSize: 13,
                color: BRAND_COLORS.text,
                minHeight: 70,
                textAlignVertical: 'top',
              }}
            />
          </View>

          {/* Action Buttons */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <Pressable
              onPress={handleClose}
              disabled={submitting}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: BRAND_COLORS.line,
                backgroundColor: '#FFFFFF',
                cursor: 'pointer' as any,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: BRAND_COLORS.textSoft }}>
                Hủy
              </Text>
            </Pressable>

            <Pressable
              testID="btn-submit-report"
              onPress={handleSubmit}
              disabled={submitting}
              style={{
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: '#DC2626',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                opacity: submitting ? 0.7 : 1,
                cursor: 'pointer' as any,
              }}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Flag size={15} color="#FFFFFF" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                    Gửi Báo Cáo
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
