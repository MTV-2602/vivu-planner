import { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Trash2, Key, BarChart3, Eye, Check, AlertTriangle, X,
  Cpu, Sparkles, RefreshCw, CheckCircle2, Zap, Crown, Shield, Settings2, Sliders
} from 'lucide-react-native';
import { BRAND_COLORS } from '../../constants';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import AdminNav from '../../components/admin/AdminNav';
import Reveal from '../../components/Reveal';

interface ApiKeyRecord {
  id: string;
  key_value: string;
  is_active: boolean;
  status: string;
  last_used_at: string | null;
  created_at: string;
  usage_count?: number;
}

interface AiGatewayConfigData {
  provider: 'gemini' | 'custom_openai';
  baseUrl: string;
  apiKey: string;
  hasApiKey: boolean;
  model: string;
  isActive: boolean;
  maxTokens?: number;
  geminiMaxTokens?: number;
}

function maskKey(v: string) {
  if (v.length <= 15) return v;
  return `${v.substring(0, 8)}...${v.substring(v.length - 5)}`;
}

export default function AdminKeys() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
  } | null>(null);

  // Tab chuyển đổi: 'gateway' (AI Bên thứ 3) hoặc 'gemini' (Gemini Direct)
  const [activeTab, setActiveTab] = useState<'gateway' | 'gemini'>('gateway');

  // Cấu hình AI Gateway form state
  const [aiProvider, setAiProvider] = useState<'gemini' | 'custom_openai'>('gemini');
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiModel, setAiModel] = useState('ag/gemini-3-flash');
  const [customMaxTokens, setCustomMaxTokens] = useState('16384');
  const [geminiMaxTokens, setGeminiMaxTokens] = useState('16384');
  const [pingStatus, setPingStatus] = useState<{ success?: boolean; message?: string; durationMs?: number } | null>(null);

  // Gemini state
  const [bulkKeys, setBulkKeys] = useState('');
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});

  // Lấy cấu hình AI hiện tại
  const { data: aiConfig, isLoading: aiConfigLoading, refetch: refetchAiConfig } = useQuery<{ success: boolean; data: AiGatewayConfigData }>({
    queryKey: ['adminAiConfig'],
    queryFn: async () => (await api.get('/admin/ai-config')).data,
    enabled: !!isAdmin,
  });

  useEffect(() => {
    if (aiConfig?.data) {
      setAiProvider(aiConfig.data.provider || 'gemini');
      setAiBaseUrl(aiConfig.data.baseUrl || '');
      setAiApiKey(aiConfig.data.apiKey || '');
      setAiModel(aiConfig.data.model && !aiConfig.data.model.includes('3.8') ? aiConfig.data.model : 'ag/gemini-3-flash');
      setCustomMaxTokens(String(aiConfig.data.maxTokens || 16384));
      setGeminiMaxTokens(String(aiConfig.data.geminiMaxTokens || 16384));
    }
  }, [aiConfig]);

  const saveAiConfigMutation = useMutation({
    mutationFn: async (payload: {
      provider: string;
      baseUrl: string;
      apiKey: string;
      model: string;
      isActive: boolean;
      maxTokens?: number;
      geminiMaxTokens?: number;
    }) => {
      return (await api.put('/admin/ai-config', payload)).data;
    },
    onSuccess: () => {
      refetchAiConfig();
      showToast('Đã lưu cấu hình AI thành công!', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });

  const testAiConfigMutation = useMutation({
    mutationFn: async (payload: { baseUrl: string; apiKey: string; model: string }) => {
      return (await api.post('/admin/ai-config/test', payload)).data;
    },
    onSuccess: (data: any) => {
      const notice = data.fallbackNotice ? `\n💡 ${data.fallbackNotice}` : '';
      setPingStatus({
        success: true,
        message: `Kết nối thành công (${data.durationMs}ms)! Model: ${data.modelUsed || 'Chuẩn'}. AI phản hồi: "${data.reply?.substring(0, 80)}..."${notice}`,
        durationMs: data.durationMs,
      });
      showToast(`Ping thành công (${data.durationMs}ms)!`, 'success');
    },
    onError: (e: any) => {
      const msg = e.response?.data?.details || e.response?.data?.error || e.message;
      setPingStatus({
        success: false,
        message: `Lỗi kết nối: ${msg}`,
      });
      showToast(`Ping thất bại: ${msg}`, 'error');
    },
  });

  const { data: apiKeys, isLoading: keysLoading } = useQuery<ApiKeyRecord[]>({
    queryKey: ['adminKeys'],
    queryFn: async () => (await api.get('/admin/keys')).data,
    enabled: !!isAdmin && activeTab === 'gemini',
  });

  const addKeys = useMutation({
    mutationFn: (keyValues: string[]) => api.post('/admin/keys', { key_values: keyValues }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminKeys'] });
      setBulkKeys('');
      showToast('Đã thêm danh sách API Key thành công!', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });

  const updateKey = useMutation({
    mutationFn: ({ id, is_active, status }: { id: string; is_active: boolean; status: string }) =>
      api.put(`/admin/keys/${id}`, { is_active, status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminKeys'] });
      showToast('Đã cập nhật trạng thái API Key!', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });

  const deleteKey = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/keys/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminKeys'] });
      showToast('Đã xóa API Key thành công!', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.error || e.message, 'error'),
  });

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };

  const showConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    options?: { confirmText?: string; cancelText?: string; isDestructive?: boolean }
  ) => {
    setConfirmModal({
      visible: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(null);
      },
      confirmText: options?.confirmText || 'Xác nhận',
      cancelText: options?.cancelText || 'Hủy',
      isDestructive: options?.isDestructive ?? false,
    });
  };

  const confirmDeleteKey = (id: string, value: string) => {
    const masked = maskKey(value);
    showConfirm(
      'Xác nhận xóa API Key',
      `Bạn có chắc chắn muốn xóa API Key ${masked} khỏi bể khóa xoay vòng không?`,
      () => deleteKey.mutate(id),
      { confirmText: 'Xóa', cancelText: 'Hủy', isDestructive: true }
    );
  };

  const confirmToggleRotation = (id: string, value: string, isActive: boolean, status: string) => {
    const masked = maskKey(value);
    const title = isActive ? 'Tắt xoay vòng Key' : 'Bật xoay vòng Key';
    const message = isActive
      ? `Bạn có chắc muốn tạm dừng sử dụng key ${masked}?`
      : `Bạn có chắc muốn kích hoạt lại key ${masked}?`;
    showConfirm(
      title,
      message,
      () => updateKey.mutate({ id, is_active: !isActive, status }),
      { confirmText: isActive ? 'Tắt' : 'Bật', cancelText: 'Hủy' }
    );
  };

  const handleAddBulkKeys = () => {
    if (!bulkKeys.trim()) return;
    const parsed = bulkKeys
      .split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 10 && (k.startsWith('AIzaSy') || k.startsWith('AQ') || k.startsWith('AO')));
    if (parsed.length === 0) {
      showToast('Không tìm thấy API Key hợp lệ (bắt đầu bằng AIzaSy, AQ hoặc AO).', 'error');
      return;
    }
    addKeys.mutate(parsed);
  };

  if (!isAdmin) {
    return (
      <View className="flex-1 bg-brand-bg">
        <AdminNav />
        <View className="flex-1 items-center justify-center py-20 gap-3">
          <ActivityIndicator size="large" color={BRAND_COLORS.primary} />
          <Text className="text-xs font-semibold text-brand-textSoft">Đang tải và xác thực quyền quản trị...</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-brand-bg">
      <AdminNav />

      {/* Toast Notification */}
      {toast && (
        <View className="absolute top-20 left-4 right-4 z-50 items-center pointer-events-none">
          <View className="flex-row items-center gap-2 px-4 py-3 rounded-xl shadow-lg border border-brand-line/40 max-w-md w-full bg-white">
            <Text
              className="text-xs font-bold flex-1"
              style={{
                color:
                  toast.type === 'success'
                    ? BRAND_COLORS.primaryStrong
                    : toast.type === 'error'
                    ? BRAND_COLORS.danger
                    : BRAND_COLORS.accentStrong,
              }}
            >
              {toast.message}
            </Text>
          </View>
        </View>
      )}

      {/* Confirm Modal */}
      {confirmModal && (
        <View className="absolute inset-0 bg-black/40 z-50 items-center justify-center p-4">
          <View className="bg-white rounded-2xl max-w-sm w-full p-6 gap-4 border border-brand-line/40 shadow-xl">
            <Text className="font-display font-extrabold text-base text-brand-text">{confirmModal.title}</Text>
            <Text className="text-xs text-brand-textSoft leading-relaxed">{confirmModal.message}</Text>
            <View className="flex-row justify-end gap-2 pt-2">
              <Pressable
                onPress={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-xl border border-brand-line bg-white"
              >
                <Text className="text-xs font-bold text-brand-textSoft">{confirmModal.cancelText}</Text>
              </Pressable>
              <Pressable
                onPress={confirmModal.onConfirm}
                className="px-4 py-2 rounded-xl"
                style={{ backgroundColor: confirmModal.isDestructive ? BRAND_COLORS.danger : BRAND_COLORS.primary }}
              >
                <Text className="text-xs font-bold text-white">{confirmModal.confirmText}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 20 }}>
        <View className="max-w-5xl w-full self-center gap-6">
          {/* Header Card */}
          <View className="p-6 rounded-3xl border border-brand-line/40 bg-white shadow-xs flex-row justify-between items-center flex-wrap gap-4">
            <View className="flex-row items-center gap-3">
              <View className="w-11 h-11 rounded-2xl bg-brand-primary/10 items-center justify-center">
                <Cpu size={22} color={BRAND_COLORS.primary} />
              </View>
              <View>
                <Text className="font-display font-black text-xl text-brand-text">Cấu hình & Quản trị AI</Text>
                <Text className="text-xs text-brand-textSoft">
                  Tùy biến Cổng AI Gateway (Gói Pro) và Quản lý Bể khóa Google Gemini
                </Text>
              </View>
            </View>

            {/* Trạng thái hiện tại */}
            <View className="flex-row items-center gap-2 px-3 py-1.5 rounded-full bg-brand-bgAlt border border-brand-line/30">
              <View
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: aiProvider === 'custom_openai' ? '#2563EB' : BRAND_COLORS.primary }}
              />
              <Text className="text-xs font-bold" style={{ color: aiProvider === 'custom_openai' ? '#2563EB' : BRAND_COLORS.primary }}>
                {aiProvider === 'custom_openai' ? 'Đang dùng AI Gateway (Pro)' : 'Đang dùng Gemini Direct'}
              </Text>
            </View>
          </View>

          {/* Thanh Tabs chuyển đổi gọn gàng */}
          <View className="flex-row p-1.5 bg-brand-bgAlt rounded-2xl border border-brand-line/30 gap-2">
            <Pressable
              testID="tab-gateway-btn"
              onPress={() => setActiveTab('gateway')}
              className={`flex-1 py-3 px-4 rounded-xl flex-row items-center justify-center gap-2 ${
                activeTab === 'gateway' ? 'bg-white shadow-xs' : 'bg-transparent'
              }`}
            >
              <Crown size={16} color={activeTab === 'gateway' ? '#2563EB' : BRAND_COLORS.textSoft} />
              <Text
                className={`text-xs font-bold ${
                  activeTab === 'gateway' ? 'text-[#2563EB]' : 'text-brand-textSoft'
                }`}
              >
                Cổng AI Gateway (Gói Pro)
              </Text>
            </Pressable>

            <Pressable
              testID="tab-gemini-btn"
              onPress={() => setActiveTab('gemini')}
              className={`flex-1 py-3 px-4 rounded-xl flex-row items-center justify-center gap-2 ${
                activeTab === 'gemini' ? 'bg-white shadow-xs' : 'bg-transparent'
              }`}
            >
              <Zap size={16} color={activeTab === 'gemini' ? BRAND_COLORS.primary : BRAND_COLORS.textSoft} />
              <Text
                className={`text-xs font-bold ${
                  activeTab === 'gemini' ? 'text-brand-primary' : 'text-brand-textSoft'
                }`}
              >
                Google Gemini (Bể Keys Miễn Phí)
              </Text>
            </Pressable>
          </View>

          {/* ========================================================= */}
          {/* TAB 1: CỔNG AI GATEWAY BÊN THỨ 3 (GÓI PRO)               */}
          {/* ========================================================= */}
          {activeTab === 'gateway' && (
            <Reveal>
              <View className="p-6 rounded-3xl border border-brand-line/40 bg-white shadow-xs gap-5">
                <View className="flex-row items-center justify-between pb-3 border-b border-brand-line/20">
                  <View className="flex-row items-center gap-2">
                    <Crown size={18} color="#2563EB" />
                    <Text className="font-display font-extrabold text-base text-brand-text">
                      Thiết lập Cổng AI Gateway (OpenAI-Compatible)
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setAiProvider(prev => (prev === 'custom_openai' ? 'gemini' : 'custom_openai'))}
                    className="flex-row items-center gap-1.5 px-3 py-1 rounded-full border"
                    style={{
                      backgroundColor: aiProvider === 'custom_openai' ? '#EFF6FF' : '#F1F5F9',
                      borderColor: aiProvider === 'custom_openai' ? '#BFDBFE' : '#CBD5E1',
                    }}
                  >
                    <View
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: aiProvider === 'custom_openai' ? '#2563EB' : '#64748B' }}
                    />
                    <Text
                      className="text-[11px] font-bold"
                      style={{ color: aiProvider === 'custom_openai' ? '#2563EB' : '#64748B' }}
                    >
                      {aiProvider === 'custom_openai' ? 'Kích hoạt cho Pro: BẬT' : 'Kích hoạt cho Pro: TẮT'}
                    </Text>
                  </Pressable>
                </View>

                {/* Form nhập thông số */}
                {/* Form nhập thông số */}
                <View className="gap-5">
                  {/* Base URL */}
                  <View className="gap-1.5">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-bold text-brand-text">Đường dẫn Cổng API (Base URL):</Text>
                      <Text className="text-[10px] text-brand-textSoft">Để trống sẽ dùng URL mặc định từ hệ thống / Vercel</Text>
                    </View>
                    <TextInput
                      testID="ai-base-url-input"
                      value={aiBaseUrl}
                      onChangeText={setAiBaseUrl}
                      placeholder="Mặc định theo cấu hình hệ thống (hoặc nhập URL tùy chỉnh)"
                      placeholderTextColor={BRAND_COLORS.textMuted}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-line/60 text-xs bg-brand-bg text-brand-text font-mono"
                    />
                  </View>

                  {/* API Key */}
                  <View className="gap-1.5">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-bold text-brand-text">Secret API Key / Bearer Token:</Text>
                      {aiConfig?.data?.hasApiKey && (
                        <Text className="text-[10px] font-semibold text-brand-primary">✓ Đã lưu token bảo mật</Text>
                      )}
                    </View>
                    <TextInput
                      testID="ai-api-key-input"
                      value={aiApiKey}
                      onChangeText={setAiApiKey}
                      secureTextEntry
                      placeholder={
                        aiConfig?.data?.hasApiKey ? '(Để trống nếu giữ nguyên token đã lưu)' : 'sk-... hoặc Bearer Token'
                      }
                      placeholderTextColor={BRAND_COLORS.textMuted}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-brand-line/60 text-xs bg-brand-bg text-brand-text font-mono"
                    />
                  </View>

                  {/* Model ID & Max Tokens */}
                  <View className="flex-row gap-4 flex-wrap">
                    {/* Model ID */}
                    <View className="flex-1 min-w-[240px] gap-1.5">
                      <Text className="text-xs font-bold text-brand-text">Mô hình AI Pro (Model ID):</Text>
                      <TextInput
                        testID="ai-model-input"
                        value={aiModel}
                        onChangeText={setAiModel}
                        placeholder="ag/gemini-3-flash"
                        placeholderTextColor={BRAND_COLORS.textMuted}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-brand-line/60 text-xs bg-brand-bg text-brand-text font-mono"
                      />
                      {/* Chips chọn nhanh mô hình AI Gateway an toàn & ổn định */}
                      <View className="flex-row flex-wrap gap-1.5 pt-1">
                        {[
                          { id: 'ag/gemini-3-flash', label: '⭐ ag/gemini-3-flash (Chuẩn ổn định 100%)' },
                          { id: 'ag/gemini-3.7-flash', label: '✨ ag/gemini-3.7-flash (Lý luận sâu)' },
                          { id: 'ag/gemini-3-flash-agent', label: '🤖 ag/gemini-3-flash-agent' },
                        ].map(m => (
                          <Pressable
                            key={m.id}
                            onPress={() => setAiModel(m.id)}
                            className="px-2.5 py-1 rounded-lg border text-[10px]"
                            style={{
                              borderColor: aiModel === m.id ? '#059669' : 'rgba(27,36,32,0.15)',
                              backgroundColor: aiModel === m.id ? '#ECFDF5' : '#FFFFFF',
                              cursor: 'pointer' as any
                            }}
                          >
                            <Text
                              className="text-[10px] font-bold"
                              style={{ color: aiModel === m.id ? '#059669' : BRAND_COLORS.textSoft }}
                            >
                              {m.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>

                    {/* Giới hạn Token (Max Output Tokens) */}
                    <View className="flex-1 min-w-[240px] gap-1.5">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-xs font-bold text-brand-text">Giới hạn Tokens tối đa (Output):</Text>
                        <Sliders size={12} color={BRAND_COLORS.textSoft} />
                      </View>
                      <TextInput
                        testID="ai-max-tokens-input"
                        value={customMaxTokens}
                        onChangeText={setCustomMaxTokens}
                        keyboardType="numeric"
                        placeholder="50000"
                        placeholderTextColor={BRAND_COLORS.textMuted}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-brand-line/60 text-xs bg-brand-bg text-brand-text font-mono"
                      />
                      {/* Chips chọn Token nhanh có kỷ luật */}
                      <View className="flex-row flex-wrap gap-1.5 pt-1">
                        {[
                          { val: '4096', label: '4,096 (Cơ bản)' },
                          { val: '16384', label: '16,384 (Tiêu chuẩn)' },
                          { val: '50000', label: '🔥 50,000 (Tối đa AI Pro)' }
                        ].map(t => (
                          <Pressable
                            key={t.val}
                            onPress={() => setCustomMaxTokens(t.val)}
                            className="px-2.5 py-1 rounded-lg border text-[10px]"
                            style={{
                              borderColor: customMaxTokens === t.val ? '#2563EB' : 'rgba(27,36,32,0.15)',
                              backgroundColor: customMaxTokens === t.val ? '#EFF6FF' : (t.val === '50000' ? '#FFF7ED' : '#FFFFFF'),
                              cursor: 'pointer' as any
                            }}
                          >
                            <Text
                              className="text-[10px] font-bold"
                              style={{
                                color: customMaxTokens === t.val ? '#2563EB' : (t.val === '50000' ? '#C2410C' : BRAND_COLORS.textSoft),
                              }}
                            >
                              {t.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  </View>

                  {/* Kết quả Ping Test */}
                  {pingStatus && (
                    <View
                      className="p-3.5 rounded-xl border flex-row items-start gap-2.5"
                      style={{
                        backgroundColor: pingStatus.success ? '#F0FDF4' : '#FEF2F2',
                        borderColor: pingStatus.success ? '#BBF7D0' : '#FECACA',
                      }}
                    >
                      {pingStatus.success ? (
                        <CheckCircle2 size={16} color="#16A34A" style={{ marginTop: 2 }} />
                      ) : (
                        <AlertTriangle size={16} color="#DC2626" style={{ marginTop: 2 }} />
                      )}
                      <View className="flex-1">
                        <Text
                          className="text-xs font-bold"
                          style={{ color: pingStatus.success ? '#15803D' : '#B91C1C' }}
                        >
                          {pingStatus.success ? 'Kiểm tra kết nối Gateway: Thành công' : 'Kiểm tra kết nối: Thất bại'}
                        </Text>
                        <Text
                          className="text-[11px] mt-0.5 leading-relaxed"
                          style={{ color: pingStatus.success ? '#166534' : '#991B1B' }}
                        >
                          {pingStatus.message}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Actions */}
                  <View className="flex-row items-center justify-end gap-3 pt-3 border-t border-brand-line/20">
                    <Pressable
                      testID="ai-ping-test-btn"
                      onPress={() =>
                        testAiConfigMutation.mutate({ baseUrl: aiBaseUrl, apiKey: aiApiKey, model: aiModel })
                      }
                      disabled={testAiConfigMutation.isPending || (!aiApiKey && !aiConfig?.data?.hasApiKey)}
                      className="flex-row items-center gap-1.5 px-4 py-2.5 rounded-xl border border-brand-line bg-white"
                      style={testAiConfigMutation.isPending || (!aiApiKey && !aiConfig?.data?.hasApiKey) ? { opacity: 0.5 } : undefined}
                    >
                      {testAiConfigMutation.isPending ? (
                        <ActivityIndicator size="small" color={BRAND_COLORS.text} />
                      ) : (
                        <Zap size={14} color="#2563EB" />
                      )}
                      <Text className="text-xs font-bold text-brand-text">
                        {testAiConfigMutation.isPending ? 'Đang ping (ước tính 15-25s)...' : 'Kiểm tra kết nối (Ping Test)'}
                      </Text>
                    </Pressable>

                    <Pressable
                      testID="ai-save-config-btn"
                      onPress={() =>
                        saveAiConfigMutation.mutate({
                          provider: aiProvider,
                          baseUrl: aiBaseUrl,
                          apiKey: aiApiKey,
                          model: aiModel,
                          isActive: aiProvider === 'custom_openai',
                          maxTokens: parseInt(customMaxTokens, 10) || 16384,
                          geminiMaxTokens: parseInt(geminiMaxTokens, 10) || 16384,
                        })
                      }
                      disabled={saveAiConfigMutation.isPending}
                      className="flex-row items-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand-primary"
                      style={saveAiConfigMutation.isPending ? { opacity: 0.6 } : undefined}
                    >
                      {saveAiConfigMutation.isPending ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <Sparkles size={14} color="white" />
                      )}
                      <Text className="text-white text-xs font-bold">
                        {saveAiConfigMutation.isPending ? 'Đang lưu...' : 'Lưu cấu hình Gateway'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Reveal>
          )}

          {/* ========================================================= */}
          {/* TAB 2: GOOGLE GEMINI DIRECT (BỂ KEYS & CẤU HÌNH)         */}
          {/* ========================================================= */}
          {activeTab === 'gemini' && (
            <Reveal>
              <View className="gap-6">
                {/* 1. Card Cấu hình Tokens cho Gemini */}
                <View className="p-5 rounded-3xl border border-brand-line/40 bg-white shadow-xs gap-4">
                  <View className="flex-row items-center justify-between pb-3 border-b border-brand-line/20">
                    <View className="flex-row items-center gap-2">
                      <Zap size={18} color={BRAND_COLORS.primary} />
                      <Text className="font-display font-extrabold text-base text-brand-text">
                        Cấu hình Mô hình Gemini
                      </Text>
                    </View>
                    <Pressable
                      onPress={() =>
                        saveAiConfigMutation.mutate({
                          provider: 'gemini',
                          baseUrl: aiBaseUrl,
                          apiKey: aiApiKey,
                          model: aiModel,
                          isActive: false,
                          maxTokens: parseInt(customMaxTokens, 10) || 16384,
                          geminiMaxTokens: parseInt(geminiMaxTokens, 10) || 16384,
                        })
                      }
                      className="px-4 py-2 rounded-xl bg-brand-primary flex-row items-center gap-1.5"
                    >
                      <Check size={14} color="white" />
                      <Text className="text-white text-xs font-bold">Lưu giới hạn Token</Text>
                    </Pressable>
                  </View>

                  <View className="flex-row items-center justify-between flex-wrap gap-4">
                    <View className="flex-1 min-w-[240px] gap-1.5">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-xs font-bold text-brand-text">
                          Giới hạn Tokens của Gemini (Max Output Tokens):
                        </Text>
                        <Sliders size={12} color={BRAND_COLORS.textSoft} />
                      </View>
                      <TextInput
                        value={geminiMaxTokens}
                        onChangeText={setGeminiMaxTokens}
                        keyboardType="numeric"
                        placeholder="8192"
                        placeholderTextColor={BRAND_COLORS.textMuted}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-brand-line/60 text-xs bg-brand-bg text-brand-text font-mono"
                      />
                      <View className="flex-row flex-wrap gap-1.5 pt-1">
                        {[
                          { val: '4096', label: '4,096 (Nhanh)' },
                          { val: '8192', label: '8,192 (Khuyến nghị)' },
                          { val: '16384', label: '16,384 (Trần tối đa)' }
                        ].map(t => (
                          <Pressable
                            key={t.val}
                            onPress={() => setGeminiMaxTokens(t.val)}
                            className="px-2.5 py-1 rounded-lg border text-[10px]"
                            style={{
                              borderColor: geminiMaxTokens === t.val ? BRAND_COLORS.primary : 'rgba(27,36,32,0.15)',
                              backgroundColor: geminiMaxTokens === t.val ? `${BRAND_COLORS.primary}15` : '#FFFFFF',
                            }}
                          >
                            <Text
                              className="text-[10px] font-bold"
                              style={{ color: geminiMaxTokens === t.val ? BRAND_COLORS.primary : BRAND_COLORS.textSoft }}
                            >
                              {t.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>

                    <View className="flex-1 min-w-[240px] p-3 rounded-2xl bg-brand-bgAlt/50 border border-brand-line/30 gap-1">
                      <Text className="text-xs font-bold text-brand-text">Cơ chế tự động xoay vòng</Text>
                      <Text className="text-[11px] text-brand-textSoft leading-relaxed">
                        Hệ thống tự động xoay tua danh sách API Keys bên dưới khi gửi yêu cầu lập lịch trình. Khi 1 key
                        chạm ngưỡng giới hạn (Rate Limit), hệ thống lập tức thử key kế tiếp.
                      </Text>
                    </View>
                  </View>
                </View>

                {/* 2. Card Thêm Nhanh Gemini API Keys (Chỉ nằm ở tab Gemini!) */}
                <View className="p-5 rounded-3xl border border-brand-line/40 bg-white shadow-xs gap-4">
                  <View className="gap-1">
                    <View className="flex-row items-center gap-2">
                      <Key size={16} color={BRAND_COLORS.primary} />
                      <Text className="font-bold text-sm text-brand-text">Thêm nhanh Gemini API Keys</Text>
                    </View>
                    <Text className="text-xs text-brand-textSoft">
                      Dán danh sách API Keys (mỗi key nằm trên một dòng riêng biệt)
                    </Text>
                  </View>
                  <TextInput
                    value={bulkKeys}
                    onChangeText={setBulkKeys}
                    multiline
                    numberOfLines={3}
                    placeholder={'AIzaSyBHPaLXoSL8vXh0r0...\nAQ.Ab8RN6KCHEwv9Xa...\nAO.Ab8RN6IIWn40...'}
                    className="w-full px-4 py-3 rounded-2xl border border-brand-line text-xs bg-brand-bg text-brand-text font-mono"
                    placeholderTextColor={BRAND_COLORS.textMuted}
                    style={{ minHeight: 80, textAlignVertical: 'top' }}
                  />
                  <View className="items-end">
                    <Pressable
                      onPress={handleAddBulkKeys}
                      disabled={addKeys.isPending || !bulkKeys.trim()}
                      className="flex-row items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-primary"
                      style={addKeys.isPending || !bulkKeys.trim() ? { opacity: 0.5 } : undefined}
                    >
                      {addKeys.isPending ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <Key size={14} color="white" />
                      )}
                      <Text className="text-white text-xs font-bold">
                        {addKeys.isPending ? 'Đang thêm...' : 'Thêm danh sách Keys'}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {/* 3. Bảng Danh sách Keys đang xoay vòng */}
                <View className="gap-3">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <BarChart3 size={16} color={BRAND_COLORS.primary} />
                      <Text className="font-bold text-sm text-brand-text">Bể API Keys đang xoay vòng</Text>
                    </View>
                    <Text className="text-xs text-brand-textSoft">
                      Tổng số: <Text className="font-bold text-brand-text">{apiKeys?.length || 0}</Text> keys
                    </Text>
                  </View>

                  <View className="rounded-2xl border border-brand-line/40 overflow-hidden bg-white shadow-xs">
                    <View className="flex-row px-4 py-3 border-b border-brand-line/40 bg-brand-bgAlt items-center">
                      <Text className="flex-[3] text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider">
                        API Key
                      </Text>
                      <Text className="w-24 text-center text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider">
                        Số lượt gọi
                      </Text>
                      <Text className="w-32 text-center text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider">
                        Trạng thái
                      </Text>
                      <Text className="w-20 text-center text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider">
                        Xoay
                      </Text>
                      <Text className="w-16 text-center text-[10px] font-extrabold text-brand-textMuted uppercase tracking-wider"></Text>
                    </View>

                    {keysLoading ? (
                      <View className="py-12 items-center gap-2">
                        <ActivityIndicator color={BRAND_COLORS.primary} />
                        <Text className="text-xs text-brand-textSoft">Đang tải bể API Keys...</Text>
                      </View>
                    ) : !apiKeys?.length ? (
                      <Text className="text-center py-10 text-brand-textSoft text-sm px-6">
                        Chưa có API Key nào trong bể xoay vòng. Hãy dán key vào ô phía trên!
                      </Text>
                    ) : (
                      apiKeys.map(k => {
                        const statusMeta =
                          k.status === 'active'
                            ? {
                                label: 'Hoạt động',
                                icon: <Check size={10} color={BRAND_COLORS.primary} />,
                                bg: `${BRAND_COLORS.primary}1A`,
                                color: BRAND_COLORS.primary,
                              }
                            : k.status === 'rate_limited'
                            ? {
                                label: 'Hạn chế',
                                icon: <AlertTriangle size={10} color={BRAND_COLORS.gold} />,
                                bg: `${BRAND_COLORS.gold}20`,
                                color: BRAND_COLORS.gold,
                              }
                            : {
                                label: 'Lỗi',
                                icon: <X size={10} color={BRAND_COLORS.danger} />,
                                bg: `${BRAND_COLORS.danger}1A`,
                                color: BRAND_COLORS.danger,
                              };

                        return (
                          <View key={k.id} className="flex-row items-center px-4 py-3 border-b border-brand-line/20">
                            <View className="flex-[3] flex-row items-center gap-2 pr-4">
                              <Text className="text-[11px] font-mono text-brand-textSoft flex-1" numberOfLines={1}>
                                {visibleKeys[k.id] ? k.key_value : maskKey(k.key_value)}
                              </Text>
                              <Pressable
                                onPress={() => setVisibleKeys(p => ({ ...p, [k.id]: !p[k.id] }))}
                                className="p-1 rounded bg-brand-line/10"
                              >
                                <Eye size={13} color={BRAND_COLORS.textSoft} />
                              </Pressable>
                            </View>

                            <Text className="w-24 text-center text-[11px] font-bold text-brand-textSoft">
                              {k.usage_count || 0} lượt
                            </Text>

                            <View className="w-32 items-center">
                              <View
                                className="flex-row items-center gap-1 px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: statusMeta.bg }}
                              >
                                {statusMeta.icon}
                                <Text className="text-[10px] font-bold" style={{ color: statusMeta.color }}>
                                  {statusMeta.label}
                                </Text>
                              </View>
                            </View>

                            <View className="w-20 items-center">
                              <Pressable
                                onPress={() => confirmToggleRotation(k.id, k.key_value, k.is_active, k.status)}
                                className={`w-8 h-4 rounded-full p-0.5 justify-center ${
                                  k.is_active ? 'bg-brand-primary items-end' : 'bg-brand-line items-start'
                                }`}
                              >
                                <View className="w-3 h-3 rounded-full bg-white" />
                              </Pressable>
                            </View>

                            <View className="w-16 items-center">
                              <Pressable
                                onPress={() => confirmDeleteKey(k.id, k.key_value)}
                                className="p-1.5 rounded-lg hover:bg-brand-danger/10"
                              >
                                <Trash2 size={14} color={BRAND_COLORS.danger} />
                              </Pressable>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
                </View>
              </View>
            </Reveal>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
