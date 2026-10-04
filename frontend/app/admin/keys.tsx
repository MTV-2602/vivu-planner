import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, Platform } from 'react-native';
import {
  Key,
  Cpu,
  RefreshCw,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Sliders,
  Shield,
  Copy,
  Check,
  Server,
  Layers,
  Sparkles,
} from 'lucide-react-native';
import { BRAND_COLORS } from '../../constants';
import { useAuth } from '../../hooks/useAuth';
import {
  PageHeader,
  Card,
  Section,
  StatCard,
  DataTable,
  Badge,
  Button,
  FilterChips,
  ConfirmDialog,
  Field,
  Input,
  Select,
  Switch,
  Textarea,
  useAdminToast,
  formatDate,
} from '../../components/admin/ui';
import {
  useAdminApiKeys,
  useAddApiKey,
  useToggleApiKey,
  useDeleteApiKey,
  useAdminAiConfig,
  useUpdateAiConfig,
  useTestAiConfig,
  ApiKeyRecord,
} from '../../lib/adminApi';

function maskKey(v: string) {
  if (!v) return '';
  if (v.length <= 15) return v;
  return `${v.substring(0, 8)}...${v.substring(v.length - 5)}`;
}

export default function AdminKeysPage() {
  const { isAdmin } = useAuth();
  const { showToast } = useAdminToast();

  // Tab: 'gateway' hoặc 'gemini'
  const [activeTab, setActiveTab] = useState<'gateway' | 'gemini'>('gateway');

  // AI Gateway form state
  const [aiProvider, setAiProvider] = useState<'gemini' | 'custom_openai'>('gemini');
  const [isAiActive, setIsAiActive] = useState(false);
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [aiModel, setAiModel] = useState('ag/gemini-3-flash');
  const [customMaxTokens, setCustomMaxTokens] = useState('16384');
  const [geminiMaxTokens, setGeminiMaxTokens] = useState('16384');
  const [pingStatus, setPingStatus] = useState<{
    success?: boolean;
    message?: string;
    durationMs?: number;
    modelUsed?: string;
    reply?: string;
    fallbackNotice?: string;
  } | null>(null);

  // Gemini Direct form state
  const [bulkKeys, setBulkKeys] = useState('');
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Confirm delete dialog state
  const [deleteConfirmKey, setDeleteConfirmKey] = useState<{ id: string; masked: string } | null>(null);

  // Queries
  const {
    data: aiConfig,
    isLoading: aiConfigLoading,
    isFetching: aiConfigFetching,
    refetch: refetchAiConfig,
  } = useAdminAiConfig();

  const {
    data: apiKeys = [],
    isLoading: keysLoading,
    isFetching: keysFetching,
    refetch: refetchKeys,
  } = useAdminApiKeys();

  // Mutations
  const updateAiConfig = useUpdateAiConfig();
  const testAiConfig = useTestAiConfig();
  const addApiKey = useAddApiKey();
  const toggleApiKey = useToggleApiKey();
  const deleteApiKey = useDeleteApiKey();

  // Sync AI Config data to state
  useEffect(() => {
    if (aiConfig?.data) {
      setAiProvider(aiConfig.data.provider || 'gemini');
      setIsAiActive(Boolean(aiConfig.data.isActive));
      setAiBaseUrl(aiConfig.data.baseUrl || '');
      setAiApiKey(aiConfig.data.apiKey || '');
      setAiModel(aiConfig.data.model || 'ag/gemini-3-flash');
      setCustomMaxTokens(String(aiConfig.data.maxTokens || 16384));
      setGeminiMaxTokens(String(aiConfig.data.geminiMaxTokens || 16384));
    }
  }, [aiConfig]);

  // Keys stats
  const activeKeysCount = useMemo(
    () => apiKeys.filter((k) => k.is_active && k.status === 'active').length,
    [apiKeys]
  );
  const issueKeysCount = useMemo(
    () => apiKeys.filter((k) => !k.is_active || k.status !== 'active').length,
    [apiKeys]
  );

  // Handler: Save AI Gateway Config
  const handleSaveAiConfig = () => {
    updateAiConfig.mutate(
      {
        provider: aiProvider,
        baseUrl: aiBaseUrl.trim(),
        apiKey: aiApiKey.trim(),
        model: aiModel.trim(),
        isActive: isAiActive,
        maxTokens: parseInt(customMaxTokens, 10) || 16384,
        geminiMaxTokens: parseInt(geminiMaxTokens, 10) || 16384,
      },
      {
        onSuccess: () => {
          showToast('Đã lưu cấu hình AI Gateway thành công!', 'success');
        },
        onError: (err: any) => {
          showToast(err.response?.data?.error || err.message || 'Lỗi khi lưu cấu hình AI', 'error');
        },
      }
    );
  };

  // Handler: Ping Test AI Gateway
  const handleTestAiConfig = () => {
    setPingStatus(null);
    testAiConfig.mutate(
      {
        baseUrl: aiBaseUrl.trim(),
        apiKey: aiApiKey.trim(),
        model: aiModel.trim(),
      },
      {
        onSuccess: (data) => {
          setPingStatus({
            success: true,
            durationMs: data.durationMs,
            modelUsed: data.modelUsed,
            reply: data.reply,
            fallbackNotice: data.fallbackNotice,
            message: data.message || `Kết nối thành công trong ${data.durationMs}ms`,
          });
          showToast(`Ping thành công (${data.durationMs}ms)!`, 'success');
        },
        onError: (err: any) => {
          const details = err.response?.data?.details || err.response?.data?.error || err.message;
          setPingStatus({
            success: false,
            message: details,
          });
          showToast(`Ping thất bại: ${details}`, 'error');
        },
      }
    );
  };

  // Handler: Add Bulk Gemini Keys
  const handleAddKeys = () => {
    if (!bulkKeys.trim()) {
      showToast('Vui lòng nhập ít nhất một API Key', 'error');
      return;
    }

    const lines = bulkKeys
      .split(/[\n,;]+/)
      .map((k) => k.trim())
      .filter((k) => k.length > 10);

    if (lines.length === 0) {
      showToast('Không tìm thấy API Key hợp lệ. Key Gemini thường dài hơn 15 ký tự.', 'error');
      return;
    }

    addApiKey.mutate(lines, {
      onSuccess: (res) => {
        setBulkKeys('');
        showToast(res.message || `Đã thêm thành công ${lines.length} key vào bể khóa!`, 'success');
      },
      onError: (err: any) => {
        showToast(err.response?.data?.error || err.message || 'Lỗi thêm API Key', 'error');
      },
    });
  };

  // Handler: Toggle key active state
  const handleToggleKey = (keyRecord: ApiKeyRecord) => {
    const nextActive = !keyRecord.is_active;
    const nextStatus = nextActive ? 'active' : 'paused';

    toggleApiKey.mutate(
      {
        id: keyRecord.id,
        is_active: nextActive,
        status: nextStatus,
      },
      {
        onSuccess: () => {
          showToast(
            nextActive
              ? `Đã kích hoạt khóa ${maskKey(keyRecord.key_value)}!`
              : `Đã tạm dừng khóa ${maskKey(keyRecord.key_value)}!`,
            'info'
          );
        },
        onError: (err: any) => {
          showToast(err.response?.data?.error || err.message || 'Lỗi cập nhật trạng thái', 'error');
        },
      }
    );
  };

  // Handler: Delete key
  const handleConfirmDelete = () => {
    if (!deleteConfirmKey) return;
    deleteApiKey.mutate(deleteConfirmKey.id, {
      onSuccess: () => {
        showToast('Đã xóa API Key khỏi bể khóa thành công!', 'success');
        setDeleteConfirmKey(null);
      },
      onError: (err: any) => {
        showToast(err.response?.data?.error || err.message || 'Lỗi xóa API Key', 'error');
      },
    });
  };

  // Handler: Copy key to clipboard (Web & Native safe)
  const handleCopyKey = (id: string, text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKeyId(id);
      showToast('Đã sao chép API Key vào bộ nhớ tạm!', 'success');
      setTimeout(() => setCopiedKeyId(null), 2000);
    } else {
      showToast('Trình duyệt không hỗ trợ tự động sao chép', 'info');
    }
  };

  // Column definitions for Gemini Keys DataTable
  const columns = [
    {
      key: 'key_value',
      title: 'Khóa API (Gemini)',
      width: 240,
      render: (row: ApiKeyRecord) => {
        const isRevealed = !!visibleKeys[row.id];
        const isCopied = copiedKeyId === row.id;

        return (
          <View className="flex-row items-center gap-2">
            <Text
              className="text-xs font-mono font-medium text-brand-text flex-1"
              numberOfLines={1}
            >
              {isRevealed ? row.key_value : maskKey(row.key_value)}
            </Text>
            <Pressable
              onPress={() =>
                setVisibleKeys((prev) => ({ ...prev, [row.id]: !prev[row.id] }))
              }
              hitSlop={6}
              className="p-1 rounded-md hover:bg-slate-100"
            >
              {isRevealed ? (
                <EyeOff size={14} color={BRAND_COLORS.textMuted} />
              ) : (
                <Eye size={14} color={BRAND_COLORS.textMuted} />
              )}
            </Pressable>
            <Pressable
              onPress={() => handleCopyKey(row.id, row.key_value)}
              hitSlop={6}
              className="p-1 rounded-md hover:bg-slate-100"
            >
              {isCopied ? (
                <Check size={14} color={BRAND_COLORS.primary} />
              ) : (
                <Copy size={14} color={BRAND_COLORS.textMuted} />
              )}
            </Pressable>
          </View>
        );
      },
    },
    {
      key: 'status',
      title: 'Trạng thái',
      width: 140,
      render: (row: ApiKeyRecord) => {
        if (!row.is_active) {
          return <Badge label="Tạm dừng" tone="neutral" dot size="sm" />;
        }
        if (row.status === 'active') {
          return <Badge label="Hoạt động" tone="success" dot size="sm" />;
        }
        if (row.status === 'rate_limited') {
          return <Badge label="Hạ nhiệt (Rate Limit)" tone="warning" dot size="sm" />;
        }
        return <Badge label="Sự cố" tone="danger" dot size="sm" />;
      },
    },
    {
      key: 'usage_count',
      title: 'Lượt gọi',
      width: 100,
      align: 'center' as const,
      render: (row: ApiKeyRecord) => (
        <Text className="text-xs font-semibold text-brand-text">
          {(row.usage_count ?? 0).toLocaleString()}
        </Text>
      ),
    },
    {
      key: 'last_used_at',
      title: 'Lần dùng cuối',
      width: 150,
      render: (row: ApiKeyRecord) => (
        <Text className="text-xs text-brand-textSoft">
          {row.last_used_at ? formatDate(row.last_used_at) : 'Chưa sử dụng'}
        </Text>
      ),
    },
    {
      key: 'created_at',
      title: 'Ngày thêm',
      width: 130,
      render: (row: ApiKeyRecord) => (
        <Text className="text-xs text-brand-textMuted">
          {formatDate(row.created_at)}
        </Text>
      ),
    },
    {
      key: 'actions',
      title: 'Thao tác',
      width: 120,
      align: 'right' as const,
      render: (row: ApiKeyRecord) => (
        <View className="flex-row items-center justify-end gap-2">
          <Switch
            value={row.is_active}
            onValueChange={() => handleToggleKey(row)}
            disabled={toggleApiKey.isPending}
          />
          <Pressable
            onPress={() =>
              setDeleteConfirmKey({ id: row.id, masked: maskKey(row.key_value) })
            }
            hitSlop={8}
            className="p-1.5 rounded-lg hover:bg-red-50"
          >
            <Trash2 size={15} color={BRAND_COLORS.danger} />
          </Pressable>
        </View>
      ),
    },
  ];

  return (
    <ScrollView className="flex-1 bg-brand-bg" contentContainerStyle={{ padding: 24, gap: 24 }}>
      {/* Page Header */}
      <PageHeader
        title="Quản trị AI & API Keys"
        description="Cấu hình Cổng AI Gateway và quản lý bể khóa Google Gemini Direct xoay vòng tự động"
        badge={
          <View className="w-8 h-8 rounded-xl items-center justify-center bg-brand-primary/10">
            <Key size={18} color={BRAND_COLORS.primary} />
          </View>
        }
        action={
          <Button
            label="Làm mới"
            variant="outline"
            size="sm"
            icon={
              <RefreshCw
                size={14}
                color={BRAND_COLORS.textSoft}
                className={aiConfigFetching || keysFetching ? 'animate-spin' : ''}
              />
            }
            onPress={() => {
              if (activeTab === 'gateway') {
                refetchAiConfig();
              } else {
                refetchKeys();
              }
              showToast('Đã làm mới dữ liệu!', 'info');
            }}
          />
        }
      />

      {/* Tab Switcher */}
      <View className="flex-row items-center justify-between flex-wrap gap-3">
        <FilterChips
          options={[
            {
              value: 'gateway',
              label: 'Cổng AI Gateway (Bên thứ 3 / Custom OpenAI)',
            },
            {
              value: 'gemini',
              label: `Bể khóa Gemini Direct (${apiKeys.length} keys)`,
            },
          ]}
          value={activeTab}
          onChange={(val) => setActiveTab(val as 'gateway' | 'gemini')}
          size="md"
        />

        {activeTab === 'gateway' ? (
          <Badge
            label={isAiActive ? 'Cổng Gateway Đang BẬT' : 'Cổng Gateway Đang TẮT'}
            tone={isAiActive ? 'success' : 'neutral'}
            dot
            size="md"
          />
        ) : (
          <Badge
            label={`${activeKeysCount}/${apiKeys.length} Khóa Sẵn Sàng`}
            tone={activeKeysCount > 0 ? 'success' : 'danger'}
            dot
            size="md"
          />
        )}
      </View>

      {/* TAB 1: CỔNG AI GATEWAY */}
      {activeTab === 'gateway' && (
        <View className="gap-6">
          <Card
            title="Cấu hình Cổng AI Gateway"
            subtitle="Định tuyến các yêu cầu AI tạo lịch trình qua máy chủ trung gian hoặc nhà cung cấp tùy chọn"
            icon={<Cpu size={20} color={BRAND_COLORS.primary} />}
          >
            {aiConfigLoading ? (
              <View className="py-12 items-center justify-center gap-3">
                <ActivityIndicator size="large" color={BRAND_COLORS.primary} />
                <Text className="text-xs text-brand-textSoft">Đang tải cấu hình AI Gateway...</Text>
              </View>
            ) : (
              <View className="gap-5 mt-2">
                {/* Switch Active */}
                <View className="p-4 bg-brand-bgAlt/40 rounded-xl border border-brand-line/40">
                  <Switch
                    label="Kích hoạt Cổng AI Gateway"
                    description="Khi bật, hệ thống ưu tiên gửi mọi yêu cầu tạo lịch trình sang Gateway này thay vì bể khóa Gemini Direct."
                    value={isAiActive}
                    onValueChange={setIsAiActive}
                  />
                </View>

                {/* Form fields */}
                <View className="flex-row flex-wrap gap-4">
                  <View className="flex-1 min-w-[280px]">
                    <Field
                      label="Nhà cung cấp AI (Provider)"
                      required
                      hint="Chọn loại chuẩn giao tiếp API tương thích"
                    >
                      <Select
                        options={[
                          { value: 'gemini', label: 'Google Gemini (Native Format)' },
                          { value: 'custom_openai', label: 'Custom OpenAI-compatible (OpenAI / OpenRouter / vLLM)' },
                        ]}
                        value={aiProvider}
                        onChange={(v) => setAiProvider(v as any)}
                      />
                    </Field>
                  </View>

                  <View className="flex-1 min-w-[280px]">
                    <Field
                      label="Model Name"
                      required
                      hint="Ví dụ: ag/gemini-3-flash, gpt-4o-mini, deepseek-chat"
                    >
                      <Input
                        value={aiModel}
                        onChangeText={setAiModel}
                        placeholder="ag/gemini-3-flash"
                      />
                    </Field>
                  </View>
                </View>

                {/* Base URL */}
                <Field
                  label="Base URL (Endpoint API Gateway)"
                  required
                  hint="Ví dụ: https://api.openai.com/v1 hoặc proxy URL nội bộ của bạn"
                >
                  <Input
                    value={aiBaseUrl}
                    onChangeText={setAiBaseUrl}
                    placeholder="https://api.openai.com/v1"
                    prefix={<Server size={14} color={BRAND_COLORS.textMuted} />}
                  />
                </Field>

                {/* API Key */}
                <Field
                  label="API Key / Bearer Token"
                  hint={
                    aiConfig?.data?.hasApiKey
                      ? `Đang lưu khóa: ${aiConfig.data.apiKey} (để trống nếu giữ nguyên)`
                      : 'Nhập API key hoặc Bearer token để xác thực với AI Gateway'
                  }
                >
                  <Input
                    value={aiApiKey}
                    onChangeText={setAiApiKey}
                    placeholder={
                      aiConfig?.data?.hasApiKey
                        ? `${aiConfig.data.apiKey} (Nhập mới để đổi key)`
                        : 'sk-...'
                    }
                    secureTextEntry={!showApiKey}
                    prefix={<Shield size={14} color={BRAND_COLORS.textMuted} />}
                    suffix={
                      <Pressable
                        onPress={() => setShowApiKey(!showApiKey)}
                        hitSlop={8}
                        className="p-1 rounded-md hover:bg-slate-100"
                      >
                        {showApiKey ? (
                          <EyeOff size={15} color={BRAND_COLORS.textMuted} />
                        ) : (
                          <Eye size={15} color={BRAND_COLORS.textMuted} />
                        )}
                      </Pressable>
                    }
                  />
                </Field>

                {/* Max Tokens config */}
                <View className="flex-row flex-wrap gap-4">
                  <View className="flex-1 min-w-[240px]">
                    <Field
                      label="Max Tokens (Custom OpenAI)"
                      hint="Giới hạn token xuất tối đa (1024 - 65536)"
                    >
                      <Input
                        value={customMaxTokens}
                        onChangeText={setCustomMaxTokens}
                        keyboardType="numeric"
                        placeholder="16384"
                      />
                    </Field>
                  </View>

                  <View className="flex-1 min-w-[240px]">
                    <Field
                      label="Gemini Max Tokens"
                      hint="Giới hạn token xuất cho Google Gemini (1024 - 65536)"
                    >
                      <Input
                        value={geminiMaxTokens}
                        onChangeText={setGeminiMaxTokens}
                        keyboardType="numeric"
                        placeholder="16384"
                      />
                    </Field>
                  </View>
                </View>

                {/* Ping Result Box */}
                {pingStatus && (
                  <View
                    className={`p-4 rounded-xl border flex-row items-start gap-3 ${
                      pingStatus.success
                        ? 'bg-emerald-50/70 border-emerald-200'
                        : 'bg-red-50/70 border-red-200'
                    }`}
                  >
                    {pingStatus.success ? (
                      <CheckCircle2 size={20} color="#059669" className="shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle size={20} color="#DC2626" className="shrink-0 mt-0.5" />
                    )}
                    <View className="flex-1 gap-1">
                      <Text
                        className={`text-xs font-bold ${
                          pingStatus.success ? 'text-emerald-900' : 'text-red-900'
                        }`}
                      >
                        {pingStatus.success ? 'Kết nối Gateway thành công!' : 'Kết nối Gateway thất bại!'}
                      </Text>
                      <Text
                        className={`text-xs leading-relaxed ${
                          pingStatus.success ? 'text-emerald-800' : 'text-red-800'
                        }`}
                      >
                        {pingStatus.message}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Action Buttons */}
                <View className="flex-row items-center justify-end gap-3 pt-3 border-t border-brand-line/30">
                  <Button
                    label="Kiểm tra kết nối (Ping Test)"
                    variant="outline"
                    icon={<Zap size={16} color={BRAND_COLORS.accentStrong} />}
                    loading={testAiConfig.isPending}
                    onPress={handleTestAiConfig}
                  />

                  <Button
                    label="Lưu cấu hình AI"
                    variant="primary"
                    icon={<CheckCircle2 size={16} color="#FFFFFF" />}
                    loading={updateAiConfig.isPending}
                    onPress={handleSaveAiConfig}
                  />
                </View>
              </View>
            )}
          </Card>
        </View>
      )}

      {/* TAB 2: BỂ KHÓA GEMINI DIRECT */}
      {activeTab === 'gemini' && (
        <View className="gap-6">
          {/* Stat Cards */}
          <View className="flex-row flex-wrap gap-4">
            <StatCard
              label="Tổng số Key"
              value={apiKeys.length}
              subtext="Trong bể khóa xoay vòng"
              icon={<Key size={20} color={BRAND_COLORS.primary} />}
              loading={keysLoading}
              className="flex-1 min-w-[200px]"
            />
            <StatCard
              label="Đang hoạt động"
              value={activeKeysCount}
              subtext="Sẵn sàng phục vụ yêu cầu"
              icon={<CheckCircle2 size={20} color="#10B981" />}
              iconBg="rgba(16, 185, 129, 0.12)"
              loading={keysLoading}
              className="flex-1 min-w-[200px]"
            />
            <StatCard
              label="Sự cố / Rate Limit"
              value={issueKeysCount}
              subtext="Tạm dừng hoặc đang hạ nhiệt"
              icon={<AlertTriangle size={20} color="#EF4444" />}
              iconBg="rgba(239, 68, 68, 0.12)"
              loading={keysLoading}
              className="flex-1 min-w-[200px]"
            />
          </View>

          {/* Add Key Card */}
          <Card
            title="Thêm API Key vào bể khóa"
            subtitle="Hỗ trợ thêm một hoặc nhiều API Key từ Google AI Studio (bắt đầu bằng AIzaSy...)"
            icon={<Plus size={20} color={BRAND_COLORS.primary} />}
          >
            <View className="gap-4 mt-2">
              <Field
                label="Danh sách API Key"
                hint="Nhập mỗi dòng một key hoặc cách nhau bằng dấu phẩy. Hệ thống sẽ tự động loại bỏ các key trùng lặp."
              >
                <Textarea
                  value={bulkKeys}
                  onChangeText={setBulkKeys}
                  placeholder={`AIzaSyBHPaLXoSL8vXh0r0u8nYypHngALsO-ARo\nAIzaSyDh0DV2-y4tIjDQOWvisQNWTwfPgDjENeg`}
                  rows={4}
                />
              </Field>

              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-brand-textMuted">
                  Khóa được bảo mật trong cơ sở dữ liệu và chỉ gửi trực tiếp đến Google AI.
                </Text>

                <Button
                  label="Thêm vào bể khóa"
                  variant="primary"
                  icon={<Plus size={16} color="#FFFFFF" />}
                  loading={addApiKey.isPending}
                  onPress={handleAddKeys}
                />
              </View>
            </View>
          </Card>

          {/* Keys DataTable */}
          <Section
            title="Danh sách API Key xoay vòng"
            subtitle="Tự động phân phối tải và làm mát khi gặp lỗi Rate Limit (429)"
          >
            <DataTable<ApiKeyRecord>
              columns={columns}
              data={apiKeys}
              keyExtractor={(item) => item.id}
              loading={keysLoading}
              emptyTitle="Chưa có API Key nào"
              emptyMessage="Hãy dán các API Key của Google AI Studio vào ô phía trên để bắt đầu."
              minWidth={800}
            />
          </Section>
        </View>
      )}

      {/* Confirm Delete Key Dialog */}
      <ConfirmDialog
        visible={!!deleteConfirmKey}
        title="Xác nhận xóa API Key"
        message={`Bạn có chắc chắn muốn xóa API Key (${deleteConfirmKey?.masked}) khỏi bể khóa không? Thao tác này không thể hoàn tác.`}
        confirmText="Xóa vĩnh viễn"
        cancelText="Hủy"
        isDestructive
        loading={deleteApiKey.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmKey(null)}
      />
    </ScrollView>
  );
}
