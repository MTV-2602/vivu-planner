import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { X, Camera, Plus, Check, User, AlertCircle, CheckCircle2 } from 'lucide-react-native';
import { api } from '../lib/api';
import { PREFERENCE_OPTIONS, BRAND_COLORS } from '../constants';

interface EditProfileModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  profile: any;
  user: any;
}

export default function EditProfileModal({
  visible,
  onClose,
  onSuccess,
  profile,
  user,
}: EditProfileModalProps) {
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [selectedPrefs, setSelectedPrefs] = useState<string[]>([]);
  const [customPrefInput, setCustomPrefInput] = useState('');

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fileInputRef = useRef<any>(null);

  useEffect(() => {
    if (visible && profile) {
      setFullName(profile.full_name || '');
      setAvatarUrl(profile.avatar_url || null);
      setSelectedPrefs(Array.isArray(profile.preferences) ? profile.preferences : []);
      setCustomPrefInput('');
      setErrorMsg('');
      setSuccessMsg('');
    }
  }, [visible, profile]);

  const togglePreference = (label: string) => {
    setSelectedPrefs((prev) =>
      prev.includes(label) ? prev.filter((p) => p !== label) : [...prev, label]
    );
  };

  const handleAddCustomPref = () => {
    const clean = customPrefInput.trim();
    if (!clean) return;
    if (!selectedPrefs.includes(clean)) {
      setSelectedPrefs((prev) => [...prev, clean]);
    }
    setCustomPrefInput('');
  };

  const handleRemovePref = (tag: string) => {
    setSelectedPrefs((prev) => prev.filter((p) => p !== tag));
  };

  const handleFileSelect = async (e: any) => {
    const file = e?.target?.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Vui lòng chọn tệp hình ảnh hợp lệ (PNG, JPG, WEBP).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('Kích thước ảnh tối đa là 10MB.');
      return;
    }

    setUploadingAvatar(true);
    setErrorMsg('');

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          const res = await api.post('/auth/upload-avatar', {
            fileName: file.name,
            fileType: file.type,
            base64,
          });

          if (res.data?.url) {
            setAvatarUrl(res.data.url);
          }
        } catch (uploadErr: any) {
          setErrorMsg(uploadErr.response?.data?.error || 'Lỗi khi tải ảnh lên máy chủ.');
        } finally {
          setUploadingAvatar(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi khi đọc file ảnh.');
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      setErrorMsg('Vui lòng nhập họ và tên của bạn.');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    try {
      await api.put('/auth/profile', {
        full_name: fullName.trim(),
        avatar_url: avatarUrl,
        preferences: selectedPrefs,
      });

      setSuccessMsg('Cập nhật thông tin thành công!');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 700);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || err.message || 'Lỗi lưu thông tin hồ sơ.');
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(20, 32, 27, 0.75)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
        }}
      >
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 24,
            width: '100%',
            maxWidth: 720,
            maxHeight: '92%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)' as any,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 24,
              paddingVertical: 18,
              borderBottomWidth: 1,
              borderBottomColor: '#F1F5F9',
              backgroundColor: '#FBF5EA',
            }}
          >
            <View>
              <Text style={{ fontFamily: 'Lora_700Bold', fontSize: 18, color: '#1B2420' }}>
                Chỉnh Sửa Hồ Sơ Cá Nhân
              </Text>
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                Cập nhật ảnh đại diện, họ tên và sở thích du lịch cá nhân
              </Text>
            </View>

            <Pressable
              testID="btn-close-edit-profile"
              onPress={onClose}
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: 'rgba(27,36,32,0.06)',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer' as any,
              }}
            >
              <X size={18} color="#1B2420" />
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1, paddingHorizontal: 24, paddingVertical: 18 }}
            contentContainerStyle={{ gap: 16, paddingBottom: 28 }}
          >
            {/* Status Messages */}
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
                  padding: 10,
                }}
              >
                <AlertCircle size={16} color="#EF4444" />
                <Text style={{ fontSize: 13, color: '#B91C1C', flex: 1 }}>{errorMsg}</Text>
              </View>
            )}

            {!!successMsg && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: '#F0FDF4',
                  borderWidth: 1,
                  borderColor: '#BBF7D0',
                  borderRadius: 12,
                  padding: 10,
                }}
              >
                <CheckCircle2 size={16} color="#16A34A" />
                <Text style={{ fontSize: 13, color: '#166534', flex: 1 }}>{successMsg}</Text>
              </View>
            )}

            {/* Avatar Section */}
            <View style={{ alignItems: 'center', gap: 8 }}>
              <View style={{ position: 'relative' }}>
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 40,
                      borderWidth: 3,
                      borderColor: '#1F6F54',
                    }}
                  />
                ) : (
                  <View
                    style={{
                      width: 80,
                      height: 80,
                      borderRadius: 40,
                      backgroundColor: 'rgba(31,111,84,0.12)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 2,
                      borderColor: '#1F6F54',
                    }}
                  >
                    <User size={38} color="#1F6F54" />
                  </View>
                )}

                {/* Edit Badge Button */}
                <Pressable
                  testID="btn-change-avatar-badge"
                  onPress={() => fileInputRef.current?.click()}
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: '#1F6F54',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 2,
                    borderColor: '#FFFFFF',
                    cursor: 'pointer' as any,
                  }}
                >
                  <Camera size={16} color="#FFFFFF" />
                </Pressable>
              </View>

              {/* Hidden File Input on Web */}
              {Platform.OS === 'web' && (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              )}

              <Pressable
                testID="btn-choose-avatar-file"
                onPress={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 100,
                  backgroundColor: '#FAF5EA',
                  borderWidth: 1,
                  borderColor: '#E8DECC',
                  cursor: 'pointer' as any,
                }}
              >
                {uploadingAvatar ? (
                  <ActivityIndicator size="small" color="#1F6F54" />
                ) : (
                  <Camera size={14} color="#1F6F54" />
                )}
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#1F6F54' }}>
                  {uploadingAvatar ? 'Đang tải ảnh lên...' : 'Chọn ảnh đại diện mới'}
                </Text>
              </Pressable>
            </View>

            {/* Full Name Input */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#1B2420' }}>
                Họ và tên <Text style={{ color: '#EF4444' }}>*</Text>
              </Text>
              <TextInput
                testID="input-edit-fullname"
                placeholder="Nhập họ và tên..."
                placeholderTextColor="#94A3B8"
                value={fullName}
                onChangeText={setFullName}
                style={{
                  backgroundColor: '#F8FAFC',
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: 14,
                  color: '#1B2420',
                }}
              />
            </View>

            {/* Email (Read only) */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748B' }}>
                Địa chỉ Email (Định danh tài khoản)
              </Text>
              <View
                style={{
                  backgroundColor: '#F1F5F9',
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                }}
              >
                <Text style={{ fontSize: 14, color: '#64748B' }}>
                  {user?.email || 'Chưa cập nhật email'}
                </Text>
              </View>
            </View>

            {/* Preferences Section */}
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#1B2420' }}>
                  Sở thích du lịch ({selectedPrefs.length})
                </Text>
                <Text style={{ fontSize: 11, color: '#64748B' }}>
                  Chọn hoặc thêm sở thích của bạn
                </Text>
              </View>

              {/* Add Custom Tag */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  testID="input-edit-custom-pref"
                  placeholder="Thêm sở thích mới (VD: Đi phượt xe máy, Cắm trại...)"
                  placeholderTextColor="#94A3B8"
                  value={customPrefInput}
                  onChangeText={setCustomPrefInput}
                  onSubmitEditing={handleAddCustomPref}
                  style={{
                    flex: 1,
                    backgroundColor: '#F8FAFC',
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    fontSize: 13,
                    color: '#1B2420',
                  }}
                />
                <Pressable
                  testID="btn-add-custom-pref"
                  onPress={handleAddCustomPref}
                  style={{
                    backgroundColor: '#1F6F54',
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer' as any,
                  }}
                >
                  <Plus size={16} color="#FFFFFF" />
                </Pressable>
              </View>

              {/* Preset Tags Grid */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, maxHeight: 180 }}>
                {PREFERENCE_OPTIONS.map((opt) => {
                  const isSelected = selectedPrefs.includes(opt.label);
                  return (
                    <Pressable
                      key={opt.id}
                      testID={`pref-option-${opt.id}`}
                      onPress={() => togglePreference(opt.label)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 100,
                        backgroundColor: isSelected ? '#1F6F54' : '#F8FAFC',
                        borderWidth: 1,
                        borderColor: isSelected ? '#1F6F54' : '#CBD5E1',
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: isSelected ? '700' : '500',
                          color: isSelected ? '#FFFFFF' : '#334155',
                        }}
                      >
                        {opt.label}
                      </Text>
                      {isSelected && <Check size={12} color="#FFFFFF" />}
                    </Pressable>
                  );
                })}
              </View>

              {/* Custom tags list if any not in preset */}
              {selectedPrefs.filter((p) => !PREFERENCE_OPTIONS.some((o) => o.label === p)).length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {selectedPrefs
                    .filter((p) => !PREFERENCE_OPTIONS.some((o) => o.label === p))
                    .map((customTag, idx) => (
                      <View
                        key={idx}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          backgroundColor: '#E6F4EA',
                          borderWidth: 1,
                          borderColor: '#A8DAB5',
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 100,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#1F6F54' }}>
                          {customTag}
                        </Text>
                        <Pressable
                          onPress={() => handleRemovePref(customTag)}
                          style={{ cursor: 'pointer' as any }}
                        >
                          <X size={12} color="#1F6F54" />
                        </Pressable>
                      </View>
                    ))}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'flex-end',
              gap: 10,
              paddingHorizontal: 22,
              paddingVertical: 14,
              borderTopWidth: 1,
              borderTopColor: '#F1F5F9',
              backgroundColor: '#FAFAFA',
            }}
          >
            <Pressable
              testID="btn-cancel-edit-profile"
              onPress={onClose}
              disabled={saving}
              style={{
                paddingHorizontal: 18,
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: '#F1F5F9',
                cursor: 'pointer' as any,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748B' }}>Hủy</Text>
            </Pressable>

            <Pressable
              testID="btn-save-edit-profile"
              onPress={handleSave}
              disabled={saving || uploadingAvatar}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 22,
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: '#1F6F54',
                opacity: saving || uploadingAvatar ? 0.7 : 1,
                cursor: 'pointer' as any,
              }}
            >
              {saving && <ActivityIndicator size="small" color="#FFFFFF" />}
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                {saving ? 'Đang lưu...' : 'Lưu Thay Đổi'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
