import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { X, Mail, KeyRound, Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { api } from '../lib/api';

interface ChangePasswordModalProps {
  visible: boolean;
  onClose: () => void;
  email: string;
}

export default function ChangePasswordModal({
  visible,
  onClose,
  email,
}: ChangePasswordModalProps) {
  const [step, setStep] = useState<'sendOtp' | 'verifyOtp' | 'newPassword' | 'success'>('sendOtp');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (visible) {
      setStep('sendOtp');
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
      setErrorMsg('');
      setSuccessMsg('');
    }
  }, [visible]);

  // Bước 1: Gửi mã xác nhận OTP
  const handleSendOtp = async () => {
    if (!email) {
      setErrorMsg('Không tìm thấy địa chỉ email tài khoản.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.post('/auth/forgot-password', { email });
      setOtp(''); // Luôn để trống để người dùng tự nhập mã từ email
      setSuccessMsg(res.data?.message || 'Mã xác nhận 6 số đã được gửi đến email của bạn.');
      setStep('verifyOtp');
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || err.message || 'Lỗi gửi mã xác nhận OTP.');
    } finally {
      setLoading(false);
    }
  };

  // Bước 2: Xác thực mã OTP
  const handleVerifyOtp = async () => {
    if (!otp.trim()) {
      setErrorMsg('Vui lòng nhập mã OTP gồm 6 chữ số.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      await api.post('/auth/verify-otp', { email, otp: otp.trim() });
      setSuccessMsg('');
      setStep('newPassword');
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || err.message || 'Mã OTP không hợp lệ hoặc đã hết hạn.');
    } finally {
      setLoading(false);
    }
  };

  // Bước 3: Đặt mật khẩu mới
  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setErrorMsg('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Mật khẩu xác nhận không khớp.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      await api.post('/auth/reset-password', {
        email,
        otp: otp.trim(),
        newPassword,
      });
      setStep('success');
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || err.message || 'Lỗi cập nhật mật khẩu.');
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
          ...(Platform.OS === 'web' ? {
            position: 'fixed' as any,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 99999,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          } : {}),
        }}
      >
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 24,
            width: '100%',
            maxWidth: 480,
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' as any,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 22,
              paddingVertical: 18,
              borderBottomWidth: 1,
              borderBottomColor: '#F1F5F9',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: 'rgba(31,111,84,0.1)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <KeyRound size={20} color="#1F6F54" />
              </View>
              <View>
                <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 17, color: '#1B2420' }}>
                  Đổi Mật Khẩu Tài Khoản
                </Text>
                <Text style={{ fontSize: 12, color: '#64748B' }}>
                  Xác minh qua email để đảm bảo bảo mật
                </Text>
              </View>
            </View>

            <Pressable
              testID="btn-close-change-password"
              onPress={onClose}
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

          {/* Body Content */}
          <View style={{ paddingHorizontal: 22, paddingVertical: 20, gap: 16 }}>
            {/* Error Message */}
            {!!errorMsg && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: '#FEF2F2',
                  borderWidth: 1,
                  borderColor: '#FECACA',
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <AlertCircle size={18} color="#EF4444" />
                <Text style={{ fontSize: 13, color: '#B91C1C', flex: 1 }}>{errorMsg}</Text>
              </View>
            )}

            {/* BƯỚC 1: GỬI MÃ XÁC NHẬN */}
            {step === 'sendOtp' && (
              <View style={{ gap: 16 }}>
                <View
                  style={{
                    backgroundColor: '#FAF5EA',
                    borderWidth: 1,
                    borderColor: '#E8DECC',
                    borderRadius: 14,
                    padding: 16,
                    gap: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Mail size={18} color="#1F6F54" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1B2420' }}>
                      Xác minh danh tính trước khi đổi mật khẩu
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, color: '#475569', lineHeight: 20 }}>
                    Để bảo vệ an toàn cho tài khoản của bạn, hệ thống sẽ gửi một mã xác nhận (OTP) 6 số đến địa chỉ email:
                  </Text>
                  <View
                    style={{
                      backgroundColor: '#FFFFFF',
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#CBD5E1',
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#1F6F54' }}>
                      {email}
                    </Text>
                  </View>
                </View>

                <Pressable
                  testID="btn-send-change-pw-otp"
                  onPress={handleSendOtp}
                  disabled={loading}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    backgroundColor: '#1F6F54',
                    paddingVertical: 12,
                    borderRadius: 12,
                    opacity: loading ? 0.7 : 1,
                    cursor: 'pointer' as any,
                  }}
                >
                  {loading && <ActivityIndicator size="small" color="#FFFFFF" />}
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
                    {loading ? 'Đang gửi mã...' : 'Gửi mã xác nhận về Email'}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* BƯỚC 2: NHẬP MÃ OTP */}
            {step === 'verifyOtp' && (
              <View style={{ gap: 16 }}>
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 13, color: '#475569', lineHeight: 19 }}>
                    Vui lòng nhập mã xác nhận 6 số đã được gửi đến email{' '}
                    <Text style={{ fontWeight: '700', color: '#1B2420' }}>{email}</Text>:
                  </Text>
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#1B2420' }}>
                    Mã xác nhận (OTP)
                  </Text>
                  <TextInput
                    testID="input-change-pw-otp"
                    placeholder="123456"
                    placeholderTextColor="#94A3B8"
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    maxLength={6}
                    style={{
                      backgroundColor: '#F8FAFC',
                      borderWidth: 1.5,
                      borderColor: '#1F6F54',
                      borderRadius: 12,
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      fontSize: 22,
                      fontWeight: '800',
                      letterSpacing: 6,
                      textAlign: 'center',
                      color: '#1B2420',
                    }}
                  />
                </View>

                <View style={{ gap: 10 }}>
                  <Pressable
                    testID="btn-verify-change-pw-otp"
                    onPress={handleVerifyOtp}
                    disabled={loading}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      backgroundColor: '#1F6F54',
                      paddingVertical: 12,
                      borderRadius: 12,
                      opacity: loading ? 0.7 : 1,
                      cursor: 'pointer' as any,
                    }}
                  >
                    {loading && <ActivityIndicator size="small" color="#FFFFFF" />}
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
                      {loading ? 'Đang xác thực...' : 'Xác nhận mã OTP'}
                    </Text>
                  </Pressable>

                  <Pressable
                    testID="btn-resend-change-pw-otp"
                    onPress={handleSendOtp}
                    disabled={loading}
                    style={{
                      alignItems: 'center',
                      paddingVertical: 8,
                      cursor: 'pointer' as any,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#1F6F54' }}>
                      Chưa nhận được mã? Gửi lại
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* BƯỚC 3: NHẬP MẬT KHẨU MỚI */}
            {step === 'newPassword' && (
              <View style={{ gap: 14 }}>
                <View
                  style={{
                    backgroundColor: '#F0FDF4',
                    borderWidth: 1,
                    borderColor: '#BBF7D0',
                    borderRadius: 10,
                    padding: 10,
                  }}
                >
                  <Text style={{ fontSize: 12, color: '#166534', fontWeight: '600' }}>
                    ✓ Xác minh danh tính thành công. Vui lòng thiết lập mật khẩu mới.
                  </Text>
                </View>

                {/* Mật khẩu mới */}
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#1B2420' }}>
                    Mật khẩu mới (Tối thiểu 6 ký tự)
                  </Text>
                  <View style={{ position: 'relative' }}>
                    <TextInput
                      testID="input-new-password"
                      placeholder="Nhập mật khẩu mới..."
                      placeholderTextColor="#94A3B8"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showNewPassword}
                      style={{
                        backgroundColor: '#F8FAFC',
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                        borderRadius: 12,
                        paddingVertical: 10,
                        paddingLeft: 14,
                        paddingRight: 40,
                        fontSize: 14,
                        color: '#1B2420',
                      }}
                    />
                    <Pressable
                      onPress={() => setShowNewPassword(!showNewPassword)}
                      style={{
                        position: 'absolute',
                        right: 12,
                        top: 10,
                        cursor: 'pointer' as any,
                      }}
                    >
                      {showNewPassword ? <EyeOff size={18} color="#64748B" /> : <Eye size={18} color="#64748B" />}
                    </Pressable>
                  </View>
                </View>

                {/* Xác nhận mật khẩu mới */}
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#1B2420' }}>
                    Xác nhận lại mật khẩu mới
                  </Text>
                  <View style={{ position: 'relative' }}>
                    <TextInput
                      testID="input-confirm-new-password"
                      placeholder="Nhập lại mật khẩu mới..."
                      placeholderTextColor="#94A3B8"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirmPassword}
                      style={{
                        backgroundColor: '#F8FAFC',
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                        borderRadius: 12,
                        paddingVertical: 10,
                        paddingLeft: 14,
                        paddingRight: 40,
                        fontSize: 14,
                        color: '#1B2420',
                      }}
                    />
                    <Pressable
                      onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={{
                        position: 'absolute',
                        right: 12,
                        top: 10,
                        cursor: 'pointer' as any,
                      }}
                    >
                      {showConfirmPassword ? <EyeOff size={18} color="#64748B" /> : <Eye size={18} color="#64748B" />}
                    </Pressable>
                  </View>
                </View>

                <Pressable
                  testID="btn-submit-new-password"
                  onPress={handleResetPassword}
                  disabled={loading}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    backgroundColor: '#1F6F54',
                    paddingVertical: 12,
                    borderRadius: 12,
                    marginTop: 6,
                    opacity: loading ? 0.7 : 1,
                    cursor: 'pointer' as any,
                  }}
                >
                  {loading && <ActivityIndicator size="small" color="#FFFFFF" />}
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
                    {loading ? 'Đang cập nhật...' : 'Cập nhật mật khẩu mới'}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* BƯỚC 4: THÀNH CÔNG */}
            {step === 'success' && (
              <View style={{ alignItems: 'center', paddingVertical: 16, gap: 14 }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: '#DCFCE7',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CheckCircle2 size={36} color="#16A34A" />
                </View>
                <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 18, color: '#1B2420', textAlign: 'center' }}>
                  Đổi Mật Khẩu Thành Công!
                </Text>
                <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 20 }}>
                  Mật khẩu tài khoản của bạn đã được cập nhật thành công. Vui lòng ghi nhớ mật khẩu mới cho các lần đăng nhập tiếp theo.
                </Text>
                <Pressable
                  testID="btn-done-change-password"
                  onPress={onClose}
                  style={{
                    width: '100%',
                    backgroundColor: '#1F6F54',
                    paddingVertical: 12,
                    borderRadius: 12,
                    alignItems: 'center',
                    marginTop: 8,
                    cursor: 'pointer' as any,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
                    Hoàn tất
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
