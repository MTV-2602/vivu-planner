import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, Modal,
  ActivityIndicator, Platform, ScrollView, Alert,
} from 'react-native';
import { X, User, Lock, Phone, KeyRound, CheckCircle2, AlertCircle, Shield } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { BRAND_COLORS } from '../constants';
import { useAuth } from '../hooks/useAuth';

interface ProfileModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function ProfileModal({ visible, onClose }: ProfileModalProps) {
  const { user, profile, refreshProfile } = useAuth();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Đổi mật khẩu
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (visible) {
      setFullName(profile?.full_name || '');
      setPhone(profile?.phone || '');
      setAvatarUrl(profile?.avatar_url || '');
      setNewPassword('');
      setConfirmPassword('');
      setToastMsg(null);
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
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
