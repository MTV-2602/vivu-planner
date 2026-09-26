import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, Modal,
  ActivityIndicator, Platform, ScrollView, Alert,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { X, User, Lock, Phone, KeyRound, CheckCircle2, AlertCircle, Shield, Link2, Unlink } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { BRAND_COLORS } from '../constants';
import { useAuth } from '../hooks/useAuth';

const GoogleIcon = () => (
  <Svg width="16" height="16" viewBox="0 0 24 24">
    <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
    <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
  </Svg>
);

interface ProfileModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function ProfileModal({ visible, onClose }: ProfileModalProps) {
  const {
    user, profile, refreshProfile,
    isGoogleLinked, googleIdentityEmail,
    linkGoogleAccount, unlinkGoogleAccount,
  } = useAuth();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Đổi mật khẩu
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [linkingGoogle, setLinkingGoogle] = useState(false);

  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (visible) {
      setFullName(profile?.full_name || '');
      setPhone(profile?.phone || '');
      setAvatarUrl(profile?.avatar_url || '');
      setNewPassword('');
      setConfirmPassword('');
      setToastMsg(null);

      // Kiem tra phan hoi loi lien ket
      if (typeof window !== 'undefined' && window.localStorage) {
        const linkError = window.localStorage.getItem('vivu_link_error');
        if (linkError) {
          showToast(linkError, 'error');
          window.localStorage.removeItem('vivu_link_error');
        }
      }
    }
  }, [visible, profile]);

  const showToast = (text: string, type: 'success' | 'error') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const handleUpdateProfile = async () => {
    if (!user?.id) return;
    setSavingProfile(true);
    setToastMsg(null);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          avatar_url: avatarUrl.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      await refreshProfile();
      showToast('Cập nhật hồ sơ thành công!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Lỗi cập nhật hồ sơ.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      showToast('Vui lòng điền mật khẩu mới và xác nhận mật khẩu.', 'error');
      return;
    }

    if (newPassword.length < 6) {
      showToast('Mật khẩu mới phải có ít nhất 6 ký tự.', 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast('Mật khẩu xác nhận không khớp.', 'error');
      return;
    }

    setChangingPassword(true);
    setToastMsg(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setNewPassword('');
      setConfirmPassword('');
      showToast('Đổi mật khẩu thành công!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Lỗi khi đổi mật khẩu.', 'error');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLinkGoogle = async () => {
    setLinkingGoogle(true);
    setToastMsg(null);
    try {
      await linkGoogleAccount();
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('Manual linking is disabled')) {
        showToast('Tính năng liên kết chưa được bật trên Supabase. Vui lòng gạt ON mục "Allow manual linking" trong Supabase Dashboard -> Authentication -> Settings.', 'error');
      } else {
        showToast(msg || 'Không thể khởi chạy liên kết tài khoản Google.', 'error');
      }
      setLinkingGoogle(false);
    }
  };

  const handleUnlinkGoogle = async () => {
    setLinkingGoogle(true);
    setToastMsg(null);
    try {
      await unlinkGoogleAccount();
      showToast('Hủy liên kết tài khoản Google thành công!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Không thể hủy liên kết tài khoản Google.', 'error');
    } finally {
      setLinkingGoogle(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={(Platform.OS === 'web' ? {
          position: 'fixed' as any,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw' as any,
          height: '100vh' as any,
          zIndex: 9999,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(6px)',
          padding: 16,
        } : {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.65)',
          padding: 16,
        }) as any}
      >
        <View
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 24,
            width: '100%',
            maxWidth: 540,
            maxHeight: '92%',
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: '#E2E8F0',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.15,
            shadowRadius: 24,
            elevation: 12,
          }}
        >
          {/* Header */}
          <View
            style={{
              backgroundColor: '#1B3A2D',
              paddingHorizontal: 24,
              paddingVertical: 18,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(110,231,183,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                <User size={20} color="#6EE7B7" />
              </View>
              <View>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#ffffff' }}>Hồ Sơ Cá Nhân</Text>
                <Text style={{ fontSize: 12, color: '#A7F3D0' }}>Quản lý thông tin & bảo mật tài khoản</Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityLabel="close-modal"
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: 'rgba(255,255,255,0.15)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={18} color="#ffffff" />
            </Pressable>
          </View>

          {/* Toast alert */}
          {toastMsg && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 20,
                paddingVertical: 12,
                backgroundColor: toastMsg.type === 'success' ? '#ECFDF5' : '#FEF2F2',
                borderBottomWidth: 1,
                borderBottomColor: toastMsg.type === 'success' ? '#A7F3D0' : '#FECACA',
              }}
            >
              {toastMsg.type === 'success' ? (
                <CheckCircle2 size={16} color="#059669" />
              ) : (
                <AlertCircle size={16} color="#DC2626" />
              )}
              <Text style={{ fontSize: 13, fontWeight: '600', color: toastMsg.type === 'success' ? '#065F46' : '#991B1B', flex: 1 }}>
                {toastMsg.text}
              </Text>
            </View>
          )}

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24, gap: 20 }}>
            {/* 1. THÔNG TIN ĐĂNG NHẬP & EMAIL (KHÓA) */}
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Email Đăng Nhập
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 }}>
                  <Lock size={11} color="#64748B" />
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B' }}>Cố định / Không thể sửa</Text>
                </View>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#F8FAFC',
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  gap: 10,
                }}
              >
                <Lock size={16} color="#94A3B8" />
                <Text style={{ fontSize: 14, color: '#64748B', fontWeight: '600', flex: 1 }}>
                  {user?.email || 'Chưa cập nhật'}
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic' }}>
                * Email dùng để nhận dạng tài khoản và thông báo vé/chuyến đi, không thể thay đổi sau khi đăng ký.
              </Text>
            </View>

            {/* 2. THÔNG TIN CÁ NHÂN */}
            <View style={{ gap: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 16 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#1B3A2D', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Thông Tin Hiển Thị
              </Text>

              {/* Họ tên */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155' }}>Họ và tên</Text>
                <TextInput
                  style={{
                    backgroundColor: '#ffffff',
                    borderWidth: 1.5,
                    borderColor: '#CBD5E1',
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    fontSize: 14,
                    color: '#0F172A',
                  }}
                  placeholder="Nhập họ và tên..."
                  value={fullName}
                  onChangeText={setFullName}
                />
              </View>

              {/* Số điện thoại */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155' }}>Số điện thoại liên hệ</Text>
                <TextInput
                  style={{
                    backgroundColor: '#ffffff',
                    borderWidth: 1.5,
                    borderColor: '#CBD5E1',
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    fontSize: 14,
                    color: '#0F172A',
                  }}
                  placeholder="098xxxxxxx"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                />
              </View>

              {/* Lưu thông tin cá nhân */}
              <Pressable
                onPress={handleUpdateProfile}
                disabled={savingProfile}
                style={{
                  backgroundColor: BRAND_COLORS.primary,
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                }}
              >
                {savingProfile ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <User size={16} color="#ffffff" />
                    <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14 }}>Lưu thông tin cá nhân</Text>
                  </>
                )}
              </Pressable>
            </View>

            {/* 3. ĐỔI MẬT KHẨU */}
            <View style={{ gap: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <KeyRound size={16} color="#1B3A2D" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1B3A2D', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Đổi Mật Khẩu
                </Text>
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155' }}>Mật khẩu mới</Text>
                <TextInput
                  style={{
                    backgroundColor: '#ffffff',
                    borderWidth: 1.5,
                    borderColor: '#CBD5E1',
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    fontSize: 14,
                    color: '#0F172A',
                  }}
                  placeholder="Tối thiểu 6 ký tự..."
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155' }}>Xác nhận mật khẩu mới</Text>
                <TextInput
                  style={{
                    backgroundColor: '#ffffff',
                    borderWidth: 1.5,
                    borderColor: '#CBD5E1',
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    fontSize: 14,
                    color: '#0F172A',
                  }}
                  placeholder="Nhập lại mật khẩu mới..."
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
              </View>

              <Pressable
                onPress={handleChangePassword}
                disabled={changingPassword}
                style={{
                  backgroundColor: '#334155',
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                }}
              >
                {changingPassword ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <KeyRound size={16} color="#ffffff" />
                    <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14 }}>Cập nhật mật khẩu mới</Text>
                  </>
                )}
              </Pressable>
            </View>

            {/* 4. TÀI KHOẢN LIÊN KẾT (GOOGLE OAUTH LINKING) */}
            <View style={{ gap: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Link2 size={16} color="#1B3A2D" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1B3A2D', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Tài Khoản Liên Kết
                </Text>
              </View>

              {isGoogleLinked ? (
                <View style={{
                  backgroundColor: '#F0FDF4',
                  borderWidth: 1,
                  borderColor: '#BBF7D0',
                  borderRadius: 14,
                  padding: 14,
                  gap: 12,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <GoogleIcon />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#166534' }}>
                        Đã liên kết với Google
                      </Text>
                      <Text style={{ fontSize: 11, color: '#15803D' }}>
                        {googleIdentityEmail || user?.email}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    onPress={handleUnlinkGoogle}
                    disabled={linkingGoogle}
                    style={({ pressed }) => [{
                      backgroundColor: '#FFFFFF',
                      borderWidth: 1,
                      borderColor: '#FECACA',
                      paddingVertical: 9,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      opacity: linkingGoogle ? 0.6 : (pressed ? 0.8 : 1),
                    }]}
                  >
                    {linkingGoogle ? (
                      <ActivityIndicator size="small" color="#DC2626" />
                    ) : (
                      <>
                        <Unlink size={14} color="#DC2626" />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#DC2626' }}>
                          Hủy liên kết với Google
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              ) : (
                <View style={{
                  backgroundColor: '#F8FAFC',
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  borderRadius: 14,
                  padding: 14,
                  gap: 12,
                }}>
                  <Text style={{ fontSize: 12, color: '#64748B', lineHeight: 18 }}>
                    Liên kết với Google cho phép bạn đăng nhập nhanh chóng. Email của tài khoản Google phải trùng khớp với Email đăng ký (<Text style={{ fontWeight: '700', color: '#0F172A' }}>{user?.email}</Text>) của bạn.
                  </Text>

                  <Pressable
                    onPress={handleLinkGoogle}
                    disabled={linkingGoogle}
                    style={({ pressed }) => [{
                      backgroundColor: '#FFFFFF',
                      borderWidth: 1.5,
                      borderColor: '#CBD5E1',
                      paddingVertical: 11,
                      paddingHorizontal: 14,
                      borderRadius: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      opacity: linkingGoogle ? 0.6 : (pressed ? 0.85 : 1),
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }]}
                  >
                    {linkingGoogle ? (
                      <ActivityIndicator size="small" color={BRAND_COLORS.primary} />
                    ) : (
                      <>
                        <GoogleIcon />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                          Liên kết với tài khoản Google
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
