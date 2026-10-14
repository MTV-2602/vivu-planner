import React, { useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Platform, Linking } from 'react-native';
import { Upload, RefreshCw, FileSpreadsheet } from 'lucide-react-native';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../lib/api';
import { PartnerRecord, useAdminPartners, useSavePartner, useTogglePartnerActive, useDeletePartner } from '../../lib/adminApi';
import { PageHeader, StatCard, DataTable, Badge, Button, SearchInput, Field, Input, Select, Textarea, Modal, ConfirmDialog, Pagination, useAdminToast } from '../../components/admin/ui';

const CATEGORIES: Record<string, string> = { hotel: 'Khách sạn', homestay: 'Homestay', resort: 'Resort', restaurant: 'Ăn uống', cafe: 'Cà phê', attraction: 'Tham quan', transport: 'Di chuyển', experience: 'Trải nghiệm', rental: 'Thuê xe' };
export function isPartnerLocationVerified(p: PartnerRecord): boolean {
  return (p.location_verified === true || p.i18n?.location_verified === true) && (p.coordinate_source || p.i18n?.coordinate_source) === 'google_maps_pin';
}
interface PreviewRow { index: number; name: string; city: string; category: string; address: string; lat: number | null; lng: number | null; googleMapsUrl?: string; verified: boolean; reason?: string; duplicate: boolean; status: string }
interface ImportPreview { previewId: string; sourceName?: string; total: number; rows: PreviewRow[]; cities: string[]; categories: string[]; databaseMode?: string }
interface VerifyResult { id: string; status: 'verified' | 'unresolved' | 'failed' | 'missing'; reason?: string }
interface VerifyResponse { results: VerifyResult[]; databaseMode?: string }
interface DeleteResponse { deletedIds: string[]; databaseMode?: string; errors?: {id: string; error: string}[] }
interface ImportResult { imported: number; staged?: number; skipped: number; failed: number; errors?: string[]; databaseMode?: string }
const options = (values: string[], label: string, categories = false) => [{ value: 'all', label }, ...values.map(value => ({ value, label: categories ? CATEGORIES[value] || value : value }))];
function verificationReason(reason?: string): string {
  if (!reason) return 'Chưa lấy được ghim chính xác. Thử lại hoặc bổ sung link địa điểm trong Sửa.';
  if (/missing_url|empty_url/.test(reason)) return 'Chưa có link Google Maps. Bấm Sửa để bổ sung link địa điểm.';
  if (/database_unavailable/.test(reason)) return 'Chưa kết nối cơ sở dữ liệu; chưa lưu kết quả xác minh.';
  if (/no_venue_pin|no_matching_pin|coords_not_resolved/.test(reason)) return 'Link chưa có ghim địa điểm chính xác. Mở Google Maps, chọn đúng địa điểm rồi sao chép link chia sẻ vào Sửa.';
  if (/fetch_error|timeout|too_many_redirects|redirect_missing_location/.test(reason)) return 'Chưa mở được link Google Maps. Thử xác minh lại sau hoặc thay link chia sẻ của địa điểm.';
  if (/invalid|not_allowlisted|untrusted|blocked|non_https|unauthorized|not_allowed/.test(reason)) return 'Link chưa hợp lệ. Bấm Sửa và dán link chia sẻ HTTPS của địa điểm trên Google Maps.';
  return reason.includes('_') ? 'Không thể xác minh link này. Thử lại hoặc bổ sung link chia sẻ Google Maps của địa điểm.' : reason;
}
const errorText = (e: any) => e.response?.data?.error || e.message || 'Không thể xử lý dữ liệu';

export default function AdminPartnersPage() {
  const { isAdmin } = useAuth();
  const { showToast } = useAdminToast();
  const catalog = useAdminPartners();
  const save = useSavePartner();
  const toggle = useTogglePartnerActive();
  const remove = useDeletePartner();
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('all');
  const [category, setCategory] = useState('all');
  const [quality, setQuality] = useState('all');
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<'catalog' | 'import'>('catalog');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [importCity, setImportCity] = useState('all');
  const [importCategory, setImportCategory] = useState('all');
  const [importQuality, setImportQuality] = useState('all');
  const [importPage, setImportPage] = useState(1);
  const [sourceName, setSourceName] = useState('LOCATION DATA.xlsx • dữ liệu mẫu trên máy chủ');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [importMessage, setImportMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<PartnerRecord | null>(null);
  const [draft, setDraft] = useState<Partial<PartnerRecord>>({});
  const [deleting, setDeleting] = useState<PartnerRecord | null>(null);
  const [catalogSelected, setCatalogSelected] = useState<string[]>([]);
  const [deleteSnapshot, setDeleteSnapshot] = useState<PartnerRecord[] | null>(null);
  const [verificationResults, setVerificationResults] = useState<VerifyResult[]>([]);
  const [verificationProgress, setVerificationProgress] = useState({ done: 0, total: 0 });
  const [batchMessage, setBatchMessage] = useState('');
  const [batchErrors, setBatchErrors] = useState<string[]>([]);
  const records = catalog.data || [];
  const cities = [...new Set(records.map(p => p.city).filter(Boolean))].sort();
  const categories = [...new Set(records.map(p => p.category))].sort();
  const filtered = useMemo(() => records.filter(p =>
    (city === 'all' || p.city === city) && (category === 'all' || p.category === category) &&
    (quality === 'all' || (quality === 'ready' ? isPartnerLocationVerified(p) && p.active_status : quality === 'unresolved' ? !isPartnerLocationVerified(p) : !p.active_status)) &&
    `${p.name} ${p.address} ${p.city}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))), [records, city, category, quality, search]);
  const currentPage = filtered.slice((page - 1) * 12, page * 12);
  const verify = useMutation({
    mutationFn: async (ids: string[]) => {
      const results: VerifyResult[] = [];
      setVerificationResults([]); setVerificationProgress({ done: 0, total: ids.length }); setBatchMessage(''); setBatchErrors([]);
      for (let offset = 0; offset < ids.length; offset += 20) {
        const chunk = ids.slice(offset, offset + 20);
        try {
          const response = (await api.post('/admin/partners/batch-verify', { ids: chunk }, { timeout: 120000 })).data as VerifyResponse;
          results.push(...response.results);
        } catch (error) {
          results.push(...chunk.map(id => ({ id, status: 'failed' as const, reason: errorText(error) })));
        }
        setVerificationResults([...results]); setVerificationProgress({ done: Math.min(offset + 20, ids.length), total: ids.length });
      }
      return results;
    },
    onSuccess: results => {
      const verified = results.filter(r => r.status === 'verified').length;
      const unresolved = results.filter(r => r.status === 'unresolved').length;
      const failed = results.length - verified - unresolved;
      setBatchMessage(`Xác minh xong: ${verified} có ghim chính xác; ${unresolved} chưa xác minh; ${failed} lỗi. Địa điểm đang tắt vẫn cần bấm Bật để dùng cho AI.`);
      catalog.refetch();
    },
  });
  const bulkDelete = useMutation({
    mutationFn: async (snapshot: PartnerRecord[]) => { setBatchErrors([]); return (await api.post('/admin/partners/batch-delete', { ids: snapshot.map(p => p.id) })).data as DeleteResponse; },
    onSuccess: data => {
      setCatalogSelected(previous => previous.filter(id => !data.deletedIds.includes(id)));
      setDeleteSnapshot(null);
      setBatchErrors((data.errors || []).map(e => `${records.find(p => p.id === e.id)?.name || e.id}: ${e.error}`));
      setBatchMessage(data.databaseMode === 'preview_only' ? 'Chế độ xem thử: không có địa điểm nào được xóa trong cơ sở dữ liệu.' : `Đã xóa ${data.deletedIds.length} địa điểm. Các địa điểm chưa xóa vẫn được giữ trong lựa chọn để thử lại.`);
      catalog.refetch();
    },
    onError: error => { setDeleteSnapshot(null); setBatchMessage(`Không xóa được dữ liệu: ${errorText(error)}. Lựa chọn được giữ để thử lại.`); },
  });
  const selectedRecords = records.filter(p => catalogSelected.includes(p.id));
  const visiblePreview = (preview?.rows || []).filter(r => (importCity === 'all' || r.city === importCity) && (importCategory === 'all' || r.category === importCategory) && (importQuality === 'all' || r.status === importQuality));
  const importBusy = useMutation({ mutationFn: async (payload: { fileBase64?: string; filename?: string }) => (await api.post('/admin/partners/import-preview', payload)).data as ImportPreview,
    onSuccess: data => { setImportMessage(''); setImportProgress({done:0,total:0}); setPreview(data); setSelected(data.rows.filter(r => !r.duplicate && !!r.name && !!r.city).map(r => r.index)); setImportCity('all'); setImportCategory('all'); setImportQuality('all'); setImportPage(1); setResult(null); }, onError: e => showToast(errorText(e), 'error') });
  const commit = useMutation({
    mutationFn: async (snapshot: { previewId: string; indexes: number[] }) => {
      const summary: ImportResult = { imported: 0, staged: 0, skipped: 0, failed: 0, errors: [], databaseMode: preview?.databaseMode };
      let completed = 0;
      setResult(null); setImportMessage(''); setImportProgress({ done: 0, total: snapshot.indexes.length });
      for (let offset = 0; offset < snapshot.indexes.length; offset += 50) {
        const indexes = snapshot.indexes.slice(offset, offset + 50);
        let response: ImportResult;
        try {
          response = (await api.post('/admin/partners/import-commit', { previewId: snapshot.previewId, selectedIndexes: indexes, resolveCoords: false }, { timeout: 65000 })).data as ImportResult;
        } catch (error) {
          const message = errorText(error);
          summary.errors!.push(message);
          setResult({ ...summary });
          setImportMessage(`Đã dừng nạp: ${message}. Giữ nguyên nhóm hiện tại và các nhóm chưa chạy để bạn bấm Nạp lại. Nếu yêu cầu bị ngắt, một phần dữ liệu có thể đã lưu; nạp lại sẽ bỏ qua địa điểm trùng.`);
          return { complete: false, summary };
        }
        summary.databaseMode = response.databaseMode;
        summary.imported += response.imported || 0;
        summary.staged! += response.staged || 0;
        summary.skipped += response.skipped || 0;
        summary.failed += response.failed || 0;
        summary.errors!.push(...(response.errors || []));
        setResult({ ...summary });
        if (response.databaseMode === 'preview_only') {
          setImportMessage('Chế độ xem thử: không lưu dữ liệu. Bản xem trước và lựa chọn được giữ nguyên. Kết nối cơ sở dữ liệu rồi nạp lại.');
          return { complete: false, summary };
        }
        if (response.databaseMode !== 'connected') {
          setImportMessage('Chưa xác nhận được việc lưu dữ liệu. Giữ nhóm hiện tại và các nhóm chưa chạy để kiểm tra rồi nạp lại.');
          return { complete: false, summary };
        }
        if (response.failed > 0) {
          setImportMessage(`Đã dừng vì nhóm ${Math.floor(offset / 50) + 1} có lỗi. Nhóm này và các nhóm chưa chạy được giữ để nạp lại; dữ liệu đã lưu trong nhóm sẽ được bỏ qua nếu trùng.`);
          return { complete: false, summary };
        }
        completed += indexes.length;
        setSelected(previous => previous.filter(index => !indexes.includes(index)));
        setImportProgress({ done: completed, total: snapshot.indexes.length });
      }
      return { complete: true, summary };
    },
    onSuccess: ({ complete, summary }) => {
      catalog.refetch();
      if (complete) {
        setPreview(null);
        setImportMessage('Đã hoàn tất các nhóm nạp. Vào danh mục, lọc Chờ xác minh ghim và chọn Xác minh Maps để tự động lấy tọa độ từ các link đã lưu.');
        showToast(`Đã nạp ${summary.imported} địa điểm; ${summary.staged || 0} chờ xác minh; ${summary.skipped || 0} bỏ qua.`, 'success');
      }
    },
  });
  const catalogBusy = verify.isPending || bulkDelete.isPending || save.isPending || toggle.isPending || remove.isPending || importBusy.isPending || commit.isPending;
  const chooseFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (commit.isPending) return;
    const file = event.target.files?.[0]; if (!file) return;
    setPreview(null); setSelected([]); setResult(null);
    if (!/\.(xlsx|xls)$/i.test(file.name)) { showToast('Chọn tệp Excel .xlsx hoặc .xls', 'error'); event.target.value = ''; return; }
    if (file.size > 3 * 1024 * 1024) { showToast('Tệp Excel tối đa 3 MB', 'error'); event.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => { setSourceName(file.name); importBusy.mutate({ fileBase64: String(reader.result).split(',')[1], filename: file.name }); };
    reader.onerror = () => showToast('Không đọc được tệp Excel', 'error');
    reader.readAsDataURL(file); event.target.value = '';
  };
  const edit = (p: PartnerRecord) => { setEditing(p); setDraft({ name: p.name, city: p.city, category: p.category, address: p.address, description: p.description || '', source_maps_url: p.source_maps_url || p.i18n?.source_maps_url || '', opening_hours: p.opening_hours || p.i18n?.opening_hours || '', original_price: p.original_price ?? p.i18n?.original_price, avg_duration_minutes: p.avg_duration_minutes ?? p.i18n?.avg_duration_minutes, admin_notes: p.admin_notes || '' }); };
  const setFilter = (setter: (v: string) => void) => (v: string) => { if (catalogBusy) return; setter(v); setPage(1); setCatalogSelected([]); };
  const setImportFilter = (setter: (v: string) => void) => (v: string) => { if (commit.isPending) return; setter(v); setImportPage(1); };
  if (!isAdmin) return <View className="p-8"><Text>Chỉ quản trị viên được quản lý kho địa điểm.</Text></View>;
  return <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 24 }}>
    <PageHeader title="Kho địa điểm bản địa" description="Dữ liệu từ LOCATION DATA • kiểm tra ghim Google Maps trước khi dùng cho AI Pro" action={<Button label="Nạp dữ liệu" icon={<Upload size={16} color="white" />} disabled={catalogBusy} onPress={() => setTab('import')} />} />
    <View className="flex-row flex-wrap gap-3">
      <StatCard label="Tổng địa điểm" value={records.length} />
      <StatCard label="Sẵn sàng cho AI" value={records.filter(p => p.active_status && isPartnerLocationVerified(p)).length} subtext="Đang bật và có ghim Maps xác minh" />
      <StatCard label="Chờ xác minh" value={records.filter(p => !isPartnerLocationVerified(p)).length} subtext="Chưa đưa vào AI / lịch trình" />
      <StatCard label="Thành phố" value={cities.length} />
    </View>
    <View className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 gap-1">
      <Text className="font-bold text-emerald-900">Bản địa cho đúng chuyến đi</Text>
      <Text className="text-sm text-emerald-800">AI Pro tự động sử dụng dữ liệu bản địa đã xác minh trong mỗi lần tạo lịch trình. Hệ thống lọc theo điểm đến, ghép với địa điểm thông thường và loại trùng. Admin quản lý nguồn dữ liệu tại đây.</Text>
    </View>
    <View className="flex-row gap-3"><Button label="Danh mục địa điểm" variant={tab === 'catalog' ? 'primary' : 'outline'} disabled={catalogBusy} onPress={() => setTab('catalog')} /><Button label="Nạp Excel / nguồn mẫu" variant={tab === 'import' ? 'primary' : 'outline'} disabled={catalogBusy} onPress={() => setTab('import')} /></View>
    {tab === 'catalog' ? <View className="gap-4">
      <View className="flex-row flex-wrap gap-3 items-center"><View className="flex-1 min-w-[220px]"><SearchInput value={search} onChangeText={setFilter(setSearch)} placeholder="Tìm tên, địa chỉ, thành phố..." /></View><Button label="Làm mới" variant="outline" loading={catalog.isFetching} disabled={catalogBusy} onPress={() => catalog.refetch()} icon={<RefreshCw size={14} />} /></View>
      <View className="flex-row flex-wrap gap-3"><View className="flex-1 min-w-[180px]"><Select value={city} onChange={setFilter(setCity)} options={options(cities, 'Tất cả thành phố')} /></View><View className="flex-1 min-w-[180px]"><Select value={category} onChange={setFilter(setCategory)} options={options(categories, 'Tất cả loại', true)} /></View><View className="flex-1 min-w-[180px]"><Select value={quality} onChange={setFilter(setQuality)} options={[{value:'all',label:'Tất cả trạng thái'},{value:'ready',label:'Sẵn sàng cho AI'},{value:'unresolved',label:'Chờ xác minh ghim'},{value:'disabled',label:'Đang tắt'}]} /></View></View>
      <View className="p-4 rounded-2xl border border-amber-200 bg-amber-50 gap-2">
        <Text className="font-bold text-amber-900">Xác minh địa điểm như thế nào?</Text>
        <Text className="text-sm text-amber-900">1. Chọn “Chờ xác minh ghim”. 2. Bấm Xác minh Maps để tự động mở link đã lưu từ Excel và lấy tọa độ; không cần nhập lại từng link. Có thể Chọn tất cả kết quả lọc rồi Xác minh Maps để chạy hàng loạt. 3. Nếu thiếu link hoặc chưa tìm được ghim, bấm Sửa, dán link của chính địa điểm từ Google Maps và lưu; sau đó bấm Xác minh Maps. Chỉ khi hiện Đã xác minh mới bấm Bật để đưa vào AI.</Text>
        <Text className="text-xs text-amber-800">Tọa độ được lấy từ ghim địa điểm, không dùng tọa độ tâm thành phố hay góc nhìn bản đồ. Xác minh không tự bật địa điểm đang tắt.</Text>
      </View>
      <View className="gap-3 p-4 rounded-2xl border border-brand-line bg-white">
        <Text className="text-sm font-bold text-brand-text">Đã chọn {catalogSelected.length} / {filtered.length} địa điểm đang lọc</Text>
        <View className="flex-row flex-wrap gap-2">
          <Button testID="catalog-select-page" label={`Chọn trang này (${currentPage.length})`} variant="outline" disabled={catalogBusy || !currentPage.length} onPress={() => setCatalogSelected(previous => [...new Set([...previous, ...currentPage.map(p => p.id)])])} />
          <Button testID="catalog-select-filtered" label={`Chọn tất cả kết quả lọc (${filtered.length})`} variant="outline" disabled={catalogBusy || !filtered.length} onPress={() => setCatalogSelected(filtered.map(p => p.id))} />
          <Button label="Bỏ chọn" variant="ghost" disabled={catalogBusy || !catalogSelected.length} onPress={() => setCatalogSelected([])} />
          <Button testID="catalog-verify-selected" label={`Xác minh Maps (${catalogSelected.length})`} variant="secondary" loading={verify.isPending} disabled={catalogBusy || !catalogSelected.length} onPress={() => verify.mutate([...catalogSelected])} />
          <Button testID="catalog-delete-selected" label={`Xóa đã chọn (${catalogSelected.length})`} variant="danger" disabled={catalogBusy || !selectedRecords.length || selectedRecords.length > 500} onPress={() => setDeleteSnapshot([...selectedRecords])} />
        </View>
        {selectedRecords.length > 500 && <Text className="text-xs text-amber-800">Mỗi lần xóa tối đa 500 địa điểm. Giảm lựa chọn trước khi xóa.</Text>}
        {verify.isPending && <Text className="text-sm text-brand-primary">Đang xác minh {verificationProgress.done}/{verificationProgress.total} địa điểm • mỗi lượt tối đa 20</Text>}
        {!!batchMessage && <Text className="text-sm text-brand-text">{batchMessage}</Text>}
        {batchErrors.map((message,index)=><Text key={index} className="text-xs text-red-700">{message}</Text>)}
        {verificationResults.filter(r => r.status !== 'verified').map(r => <Text key={r.id} className="text-xs text-amber-800">{records.find(p => p.id === r.id)?.name || r.id}: {verificationReason(r.reason)}</Text>)}
      </View>
      {catalog.isError && <Text className="text-red-700">{errorText(catalog.error)}</Text>}
      <DataTable data={currentPage} loading={catalog.isLoading} keyExtractor={p => p.id} minWidth={1100} columns={[
        {key:'selected',title:'Chọn',width:60,render:p=><Pressable testID={`catalog-select-${p.id}`} accessibilityRole="checkbox" accessibilityLabel={`Chọn địa điểm ${p.name}`} accessibilityState={{checked:catalogSelected.includes(p.id),disabled:catalogBusy}} disabled={catalogBusy} onPress={()=>setCatalogSelected(previous=>previous.includes(p.id)?previous.filter(id=>id!==p.id):[...previous,p.id])}><Text className="text-xl text-brand-primary">{catalogSelected.includes(p.id)?'☑':'☐'}</Text></Pressable>},
        {key:'name',title:'Địa điểm / địa chỉ',width:300,render:p=><View className="gap-1"><Text className="font-bold text-brand-text">{p.name}</Text><Text className="text-xs text-brand-textMuted">{p.address}</Text></View>},
        {key:'city',title:'Thành phố',width:130}, {key:'category',title:'Loại',width:130,render:p=><Text className="text-xs">{CATEGORIES[p.category] || p.category}</Text>},
        {key:'quality',title:'Ghim Maps',width:150,render:p=><View className="gap-1"><Badge label={isPartnerLocationVerified(p) ? 'Đã xác minh' : 'Chờ xác minh'} tone={isPartnerLocationVerified(p) ? 'success' : 'warning'} />{isPartnerLocationVerified(p) && <Text className="text-[10px]">{p.lat}, {p.lng}</Text>}</View>},
        {key:'actions',title:'Quản lý',width:330,render:p=><View className="flex-row flex-wrap gap-2"><Button size="sm" label={p.active_status ? 'Tắt' : 'Bật'} variant="outline" disabled={catalogBusy || (!p.active_status && !isPartnerLocationVerified(p))} onPress={()=>toggle.mutate(p.id,{onError:e=>showToast(errorText(e),'error')})} /><Button size="sm" label="Xác minh Maps" testID={`catalog-verify-${p.id}`} variant="secondary" disabled={catalogBusy} onPress={()=>verify.mutate([p.id])} /><Button size="sm" label="Sửa" variant="ghost" disabled={catalogBusy} onPress={()=>edit(p)} /><Button size="sm" label="Xóa" variant="danger" disabled={catalogBusy} onPress={()=>setDeleting(p)} /></View>}
      ]} />
      <Pagination page={page} totalPages={Math.ceil(filtered.length / 12)} totalItems={filtered.length} limit={12} disabled={catalogBusy} onPageChange={setPage} />
    </View> : <View className="gap-4">
      <View className="bg-white border border-brand-line rounded-2xl p-5 gap-3"><Text className="font-bold text-lg text-brand-text">1. Chọn nguồn → 2. Lọc & xem trước → 3. Nạp</Text><Text className="text-sm text-brand-textSoft">Đọc tên, loại, địa chỉ, giá, giờ mở cửa và link Google Maps từ Excel. Link chưa có ghim chính xác được lưu vào hàng chờ xác minh để admin bổ sung.</Text><View className="flex-row flex-wrap gap-3"><Button label="Xem trước LOCATION DATA" testID="local-preview-default" loading={importBusy.isPending} disabled={commit.isPending} onPress={()=>{setPreview(null);setSelected([]);setResult(null);setSourceName('LOCATION DATA.xlsx');importBusy.mutate({});}} icon={<FileSpreadsheet size={16} color="white" />} /><Button label="Chọn Excel từ máy" variant="outline" disabled={importBusy.isPending || commit.isPending} onPress={()=>Platform.OS==='web' ? fileInput.current?.click() : showToast('Mở trang quản trị trên web để chọn Excel','info')} /></View>{Platform.OS==='web' && <input aria-label="Chọn tệp Excel địa điểm" ref={fileInput} type="file" accept=".xlsx,.xls" onChange={chooseFile} style={{display:'none'}} />}</View>
      {preview && <View className="gap-4">{preview.databaseMode === 'preview_only' && <Text className="text-amber-800 font-bold">Chế độ xem thử: máy chủ chưa kết nối cơ sở dữ liệu. Nạp chỉ kiểm tra, không lưu địa điểm.</Text>}<Text className="font-bold text-brand-text">{sourceName} • {preview.total} dòng • đã chọn {selected.length}</Text><View className="flex-row flex-wrap gap-3"><View className="flex-1 min-w-[170px]"><Select disabled={commit.isPending} value={importCity} onChange={setImportFilter(setImportCity)} options={options(preview.cities,'Tất cả thành phố')} /></View><View className="flex-1 min-w-[170px]"><Select disabled={commit.isPending} value={importCategory} onChange={setImportFilter(setImportCategory)} options={options(preview.categories,'Tất cả loại',true)} /></View><View className="flex-1 min-w-[170px]"><Select disabled={commit.isPending} value={importQuality} onChange={setImportFilter(setImportQuality)} options={[{value:'all',label:'Tất cả chất lượng'},{value:'ready',label:'Ghim đã xác minh'},{value:'unresolved',label:'Cần tìm ghim'},{value:'duplicate',label:'Trùng dữ liệu'}]} /></View></View>
        <View className="flex-row flex-wrap gap-3"><Button label="Chỉ chọn kết quả đang lọc" variant="outline" disabled={commit.isPending} onPress={()=>setSelected(visiblePreview.filter(r=>!r.duplicate && !!r.name && !!r.city).map(r=>r.index))} /><Button label="Bỏ chọn tất cả" variant="ghost" disabled={commit.isPending} onPress={()=>setSelected([])} /><Button label={`Nạp ${selected.length} địa điểm`} testID="local-import-commit" disabled={!selected.length || importBusy.isPending} loading={commit.isPending} onPress={()=>preview && commit.mutate({previewId:preview.previewId,indexes:[...selected]})} /></View>
        <Text className="text-xs text-brand-textSoft">Nạp nhanh theo nhóm 50 địa điểm, giữ nguyên link Google Maps. Dòng chưa có ghim được lưu ở trạng thái tắt; sau khi nạp, chọn Xác minh Maps trong danh mục để tự động lấy tọa độ từ link đã lưu.</Text>
        <DataTable data={visiblePreview.slice((importPage-1)*12,importPage*12)} keyExtractor={r=>String(r.index)} minWidth={940} columns={[
          {key:'selected',title:'Chọn',width:60,render:r=><Pressable accessibilityRole="checkbox" accessibilityState={{checked:selected.includes(r.index),disabled:r.duplicate}} accessibilityLabel={`Chọn ${r.name}`} disabled={r.duplicate || commit.isPending} onPress={()=>setSelected(prev=>prev.includes(r.index)?prev.filter(i=>i!==r.index):[...prev,r.index])}><Text className="text-xl">{r.duplicate ? '—' : selected.includes(r.index) ? '☑' : '☐'}</Text></Pressable>},
          {key:'name',title:'Địa điểm / địa chỉ',width:300,render:r=><View><Text className="font-bold text-brand-text">{r.name}</Text><Text className="text-xs text-brand-textMuted">{r.address}</Text></View>},{key:'city',title:'Thành phố',width:130},{key:'category',title:'Loại',width:130,render:r=><Text className="text-xs">{CATEGORIES[r.category] || r.category}</Text>},
          {key:'quality',title:'Chất lượng dữ liệu',width:250,render:r=><View className="gap-1"><Badge label={r.duplicate?'Trùng • bỏ qua':r.verified?'Ghim đã xác minh':'Chờ xác minh'} tone={r.duplicate?'neutral':r.verified?'success':'warning'} /><Text className="text-xs text-brand-textSoft">{r.verified?`${r.lat}, ${r.lng}`:verificationReason(r.reason)}</Text>{r.googleMapsUrl && <Button label="Mở Maps" size="sm" variant="ghost" onPress={()=>Linking.openURL(r.googleMapsUrl!)} />}</View>}
        ]} /><Pagination page={importPage} totalPages={Math.ceil(visiblePreview.length/12)} totalItems={visiblePreview.length} limit={12} disabled={commit.isPending} onPageChange={setImportPage} />
      </View>}
      {importProgress.total > 0 && <Text testID="local-import-progress" className="text-sm font-bold text-brand-primary">Đã hoàn tất {importProgress.done}/{importProgress.total} dòng{commit.isPending ? ' • đang nạp nhóm tối đa 50' : ''}</Text>}
      {!!importMessage && <Text testID="local-import-message" className="text-sm text-brand-text">{importMessage}</Text>}
      {result && <View className="p-5 bg-emerald-50 rounded-2xl gap-2"><Text className="font-bold text-emerald-900">{result.databaseMode === 'preview_only' ? 'Kết quả kiểm tra • chưa lưu dữ liệu' : `Đã lưu ${result.imported} địa điểm`}</Text><Text>{result.databaseMode === 'preview_only' ? '0 địa điểm được lưu vào cơ sở dữ liệu' : `${result.staged || 0} đã lưu trong hàng chờ xác minh`} • {result.skipped || 0} bỏ qua • {result.failed || 0} lỗi</Text>{result.errors?.map((e,i)=><Text key={i} className="text-red-700 text-xs">{e}</Text>)}<Button label="Xem danh mục" variant="outline" disabled={commit.isPending} onPress={()=>setTab('catalog')} /></View>}
    </View>}
    <Modal visible={!!editing} onClose={()=>!save.isPending && setEditing(null)} title="Cập nhật địa điểm bản địa" subtitle="Sau khi lưu, bấm Xác minh Maps để thử lại link đã lưu nếu địa điểm còn chờ xác minh" maxWidth={640} footer={<Button label="Lưu địa điểm" loading={save.isPending} disabled={!draft.name?.trim() || !draft.city?.trim() || !draft.address?.trim()} onPress={()=>save.mutate({id:editing?.id,data:draft},{onSuccess:()=>{setEditing(null);showToast('Đã cập nhật địa điểm','success');},onError:e=>showToast(errorText(e),'error')})} />}>
      <View className="gap-4"><Field label="Tên địa điểm"><Input value={draft.name || ''} onChangeText={v=>setDraft({...draft,name:v})} /></Field><View className="flex-row gap-3"><View className="flex-1"><Field label="Thành phố"><Input value={draft.city || ''} onChangeText={v=>setDraft({...draft,city:v})} /></Field></View><View className="flex-1"><Field label="Loại"><Select value={draft.category || 'attraction'} onChange={v=>setDraft({...draft,category:v})} options={Object.entries(CATEGORIES).map(([value,label])=>({value,label}))} /></Field></View></View><Field label="Địa chỉ"><Input value={draft.address || ''} onChangeText={v=>setDraft({...draft,address:v})} /></Field><Field label="Link Google Maps" hint="Dán link ghim địa điểm; hệ thống xác minh kinh độ/vĩ độ khi lưu."><Input value={draft.source_maps_url || ''} onChangeText={v=>setDraft({...draft,source_maps_url:v})} /></Field><Field label="Giờ mở cửa"><Input value={draft.opening_hours || ''} onChangeText={v=>setDraft({...draft,opening_hours:v})} /></Field><Field label="Giá tham khảo (VND)"><Input value={draft.original_price == null ? '' : String(draft.original_price)} onChangeText={v=>setDraft({...draft,original_price:v || null})} /></Field><Field label="Thời lượng gợi ý (phút)"><Input keyboardType="numeric" value={draft.avg_duration_minutes == null ? '' : String(draft.avg_duration_minutes)} onChangeText={v=>setDraft({...draft,avg_duration_minutes:v ? Number(v) : null})} /></Field><Field label="Mô tả"><Textarea value={draft.description || ''} onChangeText={v=>setDraft({...draft,description:v})} /></Field><Field label="Ghi chú admin"><Textarea value={draft.admin_notes || ''} onChangeText={v=>setDraft({...draft,admin_notes:v})} /></Field></View>
    </Modal>
    <Modal visible={!!deleteSnapshot} onClose={()=>!bulkDelete.isPending && setDeleteSnapshot(null)} title={`Xóa ${deleteSnapshot?.length || 0} địa điểm đã chọn?`} subtitle="Chỉ xóa đúng danh sách bên dưới. Thao tác này không thể hoàn tác." maxWidth={640} footer={<View className="flex-row justify-end gap-2"><Button label="Hủy" variant="outline" disabled={bulkDelete.isPending} onPress={()=>setDeleteSnapshot(null)} /><Button testID="catalog-confirm-delete" label={`Xác nhận xóa ${deleteSnapshot?.length || 0} địa điểm`} variant="danger" loading={bulkDelete.isPending} onPress={()=>deleteSnapshot && bulkDelete.mutate(deleteSnapshot)} /></View>}>
      <View className="gap-2">{deleteSnapshot?.map(p=><Text key={p.id} className="text-sm text-brand-text">• {p.name} — {p.city}</Text>)}</View>
    </Modal>
    <ConfirmDialog visible={!!deleting} title="Xóa địa điểm khỏi kho" message={`Xóa “${deleting?.name}” khỏi dữ liệu bản địa?`} confirmText="Xóa địa điểm" isDestructive loading={remove.isPending} onCancel={()=>setDeleting(null)} onConfirm={()=>deleting && remove.mutate(deleting.id,{onSuccess:()=>setDeleting(null),onError:e=>showToast(errorText(e),'error')})} />
  </ScrollView>;
}
