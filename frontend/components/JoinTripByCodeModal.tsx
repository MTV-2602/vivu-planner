import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { X, Users, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react-native';
import { api } from '../lib/api';

interface JoinTripByCodeModalProps {
  visible: boolean;
  onClose: () => void;
  onJoined: (tripId: string) => void;
}

export const extractToken = (raw: string): string => {
  if (!raw) return '';
  const trimmed = raw.trim();

  // 1. Tự động nhận diện chuỗi VIVU-[0-9A-Z]+ (bất kể hoa hay thường, e.g. vivu-789 -> VIVU-789)
  const vivuMatch = trimmed.match(/\b(VIVU-[0-9A-Za-z]+)\b/i);
  if (vivuMatch && vivuMatch[1]) {
    return vivuMatch[1].toUpperCase();
  }

  // 2. Nhận diện URL https://.../join/(VIVU-[0-9A-Z]+|[a-zA-Z0-9_-]+)
  const urlMatch = trimmed.match(/\/join\/([a-zA-Z0-9_-]+)/i);
  if (urlMatch && urlMatch[1]) {
    const code = urlMatch[1];
    return code.toUpperCase().startsWith('VIVU-') ? code.toUpperCase() : code;
  }

  // 3. Nhận diện query param ?token= hoặc ?code=
  const queryMatch = trimmed.match(/[?&](?:token|code)=([a-zA-Z0-9_-]+)/i);
  if (queryMatch && queryMatch[1]) {
    const code = queryMatch[1];
    return code.toUpperCase().startsWith('VIVU-') ? code.toUpperCase() : code;
  }

  // 4. Nếu người dùng nhập trực tiếp có tiền tố vivu- thì uppercase
  if (trimmed.toUpperCase().startsWith('VIVU-')) {
    return trimmed.toUpperCase();
  }

  return trimmed;
};

export default function JoinTripByCodeModal({
  visible,
  onClose,
  onJoined,
}: JoinTripByCodeModalProps) {
  const [rawInput, setRawInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleClose = () => {
    if (loading) return;
    setRawInput('');
    setError('');
    setSuccessMsg('');
    onClose();
  };

  const handleJoin = async () => {
    const cleanedToken = extractToken(rawInput);
    if (!cleanedToken) {
      setError('Vui lòng nhập Mã tham gia hoặc dán link mời.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const tokenToSend = cleanedToken.toUpperCase().startsWith('VIVU-')
        ? cleanedToken.toUpperCase()
        : cleanedToken;

      const res = await api.put(`/trips/join/${tokenToSend}`);
      const tripId = res.data?.trip_id;

      if (res.data?.already_member) {
        setSuccessMsg(res.data?.message || 'Bạn đã là thành viên của chuyến đi này! Đang chuyển hướng...');
        setTimeout(() => {
          handleClose();
          if (tripId) onJoined(tripId);
        }, 800);
      } else if (tripId) {
        setSuccessMsg(res.data?.message || 'Tham gia chuyến đi thành công! Đang chuyển hướng...');
        setTimeout(() => {
          handleClose();
          onJoined(tripId);
        }, 800);
      } else {
        setError('Không tìm thấy thông tin chuyến đi hợp lệ.');
      }
    } catch (err: any) {
      const serverMsg = err?.response?.data?.error;
      let msg = 'Mã tham gia hoặc link mời không hợp lệ hoặc đã hết hạn.';
      if (serverMsg) {
        if (serverMsg.includes('đủ 5') || serverMsg.includes('tối đa') || serverMsg.includes('đầy')) {
          msg = 'Chuyến đi này đã đủ số lượng 5 thành viên tối đa.';
        } else if (serverMsg.includes('hết hạn') || serverMsg.includes('không hợp lệ') || serverMsg.includes('not found') || serverMsg.includes('Invalid')) {
          msg = 'Mã tham gia hoặc link mời không hợp lệ hoặc đã hết hạn.';
        } else {
          msg = serverMsg;
        }
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleClose}
        />
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <Users size={20} color="#0f4c5c" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Tham gia chuyến đi nhóm</Text>
                <Text style={styles.headerSubtitle}>Nhập Mã tham gia hoặc link để cùng đồng hành</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <View style={styles.body}>
            <Text style={styles.description}>
              Nhập Mã tham gia (ví dụ: <Text style={styles.highlightText}>VIVU-789</Text>) hoặc dán toàn bộ đường link do bạn bè chia sẻ để cùng lên lịch trình.
            </Text>

            {/* Error & Success Messages */}
            {error ? (
              <View style={styles.errorBox}>
                <AlertCircle size={16} color="#DC2626" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {successMsg ? (
              <View style={styles.successBox}>
                <CheckCircle2 size={16} color="#059669" />
                <Text style={styles.successText}>{successMsg}</Text>
              </View>
            ) : null}

            {/* Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Mã tham gia hoặc link mời:</Text>
              <TextInput
                testID="input-join-trip-code"
                style={styles.input}
                placeholder="VD: VIVU-789 hoặc dán link mời..."
                placeholderTextColor="#9CA3AF"
                value={rawInput}
                onChangeText={(text) => {
                  setRawInput(text);
                  if (error) setError('');
                }}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={handleJoin}
                editable={!loading}
              />
            </View>

            {/* Action Buttons */}
            <TouchableOpacity
              testID="btn-submit-join-trip"
              onPress={handleJoin}
              disabled={loading}
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.submitBtnText}>Xác nhận tham gia</Text>
                  <ArrowRight size={16} color="#FFFFFF" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: '100%',
    maxWidth: 480,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#F8FBFB',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15, 76, 92, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f4c5c',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: 20,
    gap: 16,
  },
  description: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 20,
  },
  highlightText: {
    fontWeight: '600',
    color: '#0f4c5c',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#991B1B',
    fontWeight: '600',
    flex: 1,
  },
  successBox: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  successText: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '600',
    flex: 1,
  },
  inputContainer: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#111827',
  },
  submitBtn: {
    backgroundColor: '#0c77b0',
    paddingVertical: 13,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    shadowColor: '#0c77b0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
