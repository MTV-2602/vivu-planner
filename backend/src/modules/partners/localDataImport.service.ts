import fs from 'fs';
import path from 'path';
import { createHmac, timingSafeEqual } from 'crypto';
import { deflateSync, inflateSync } from 'zlib';
import { ENV } from '../../config/env';
import { isDbMocked, supabaseAdmin } from '../../config/supabase';
import { importPartners, parsePartnerExcel, partnerImportKey, PartnerInput, verifyRecordPinEvidence } from './partnerImport.service';

const PREVIEW_TTL = 30 * 60 * 1000;

function previewSecret(): string {
  const secret = process.env.LOCAL_DATA_IMPORT_SECRET || ENV.SUPABASE_SERVICE_ROLE_KEY;
  if (secret) return secret;
  if (isDbMocked) return 'local-data-preview-only-development';
  throw new Error('Cần cấu hình LOCAL_DATA_IMPORT_SECRET để nạp dữ liệu.');
}

function signPreview(owner: string, records: PartnerInput[]): string {
  const payload = deflateSync(Buffer.from(JSON.stringify({ owner, expires: Date.now() + PREVIEW_TTL, records }))).toString('base64url');
  const signature = createHmac('sha256', previewSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function readPreview(token: string, owner: string): { records: PartnerInput[] } {
  try {
    if (typeof token !== 'string' || token.length > 2 * 1024 * 1024) throw new Error();
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra) throw new Error();
    const expected = createHmac('sha256', previewSecret()).update(payload).digest();
    const received = Buffer.from(signature, 'base64url');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error();
    const preview = JSON.parse(inflateSync(Buffer.from(payload, 'base64url'), { maxOutputLength: 20 * 1024 * 1024 }).toString());
    if (preview.owner !== owner || preview.expires < Date.now() || !Array.isArray(preview.records)) throw new Error();
    return preview;
  } catch {
    throw Object.assign(new Error('Bản xem trước không hợp lệ hoặc đã hết hạn. Hãy xem trước lại.'), { status: 410 });
  }
}

export async function previewLocalData(owner: string, input: { fileBase64?: string; filename?: string; resolveCoords?: boolean }) {
  let source: string | Buffer;
  let sourceName: string;
  if (input.fileBase64) {
    source = Buffer.from(input.fileBase64, 'base64');
    if (source.length > 3 * 1024 * 1024) throw Object.assign(new Error('File Excel tối đa 3 MB.'), { status: 400 });
    sourceName = path.basename(input.filename || 'LOCATION DATA.xlsx');
  } else {
    const candidates = [process.env.LOCAL_DATA_FILE, 'C:\\Users\\vinhmt\\Downloads\\LOCATION DATA.xlsx', path.resolve(process.cwd(), 'LOCATION DATA.xlsx'), path.resolve(process.cwd(), '..', 'LOCATION DATA.xlsx')];
    const found = candidates.find((candidate): candidate is string => Boolean(candidate && fs.existsSync(candidate)));
    if (!found) throw Object.assign(new Error('Chưa có nguồn mặc định. Hãy tải file Excel lên.'), { status: 404 });
    source = found;
    sourceName = path.basename(found);
  }
  const records = await parsePartnerExcel(source, { resolveCoords: input.resolveCoords === true });
  if (!records.length) throw Object.assign(new Error('Không có địa điểm hợp lệ. Cần cột Tên, Tỉnh/ Thành phố và Google Maps.'), { status: 400 });
  let existing: any[] = [];
  if (!isDbMocked) {
    const { data, error } = await supabaseAdmin.from('partners').select('id,name,city,address');
    if (error) throw new Error(`Không thể kiểm tra dữ liệu trùng: ${error.message}`);
    existing = data || [];
  }
  const existingMap = new Map(existing.map(record => [partnerImportKey(record), record.id]));
  const seen = new Set<string>();
  const rows = records.map((record, index) => {
    const key = partnerImportKey(record);
    const duplicate = seen.has(key);
    seen.add(key);
    const verified = verifyRecordPinEvidence(record).verified;
    return {
      index, name: record.name, city: record.city, category: record.category, address: record.address,
      lat: verified ? record.lat : null, lng: verified ? record.lng : null,
      googleMapsUrl: record.i18n?.source_maps_url || '',
      price: record.i18n?.original_price || '', openingHours: record.opening_hours,
      durationMinutes: record.avg_duration_minutes, rating: record.i18n?.original_rating,
      verified, duplicate, existingId: existingMap.get(key) || null,
      status: duplicate ? 'duplicate' : verified ? 'ready' : 'unresolved',
      reason: verified ? null : record.i18n?.unresolved_reason || 'coords_not_resolved'
    };
  });
  const previewId = signPreview(owner, records);
  return {
    previewId, sourceName, total: records.length, rows, databaseMode: isDbMocked ? 'preview_only' : 'connected',
    expiresAt: new Date(Date.now() + PREVIEW_TTL).toISOString(),
    cities: Array.from(new Set(records.map(record => record.city))).sort(),
    categories: Array.from(new Set(records.map(record => record.category))).sort(),
    qualityReport: {
      total: records.length, verified: rows.filter(row => row.verified).length,
      unresolved: rows.filter(row => !row.verified).length,
      duplicates: rows.filter(row => row.duplicate).length,
      existing: rows.filter(row => row.existingId).length
    }
  };
}

export async function commitLocalData(owner: string, input: { previewId: string; selectedIndexes?: number[]; cities?: string[]; categories?: string[]; resolveCoords?: boolean }) {
  const preview = readPreview(input.previewId, owner);
  if (input.selectedIndexes !== undefined && (!Array.isArray(input.selectedIndexes) || input.selectedIndexes.some(index => !Number.isInteger(index) || index < 0 || index >= preview.records.length))) throw Object.assign(new Error('Danh sách địa điểm được chọn không hợp lệ.'), { status: 400 });
  if (input.cities !== undefined && !Array.isArray(input.cities) || input.categories !== undefined && !Array.isArray(input.categories)) throw Object.assign(new Error('Bộ lọc không hợp lệ.'), { status: 400 });
  const indexes = input.selectedIndexes === undefined ? null : new Set(input.selectedIndexes);
  const selected = preview.records.filter((record, index) => (!indexes || indexes.has(index)) && (!input.cities?.length || input.cities.includes(record.city)) && (!input.categories?.length || input.categories.includes(record.category)));
  if (selected.length > 50) throw Object.assign(new Error('Mỗi lượt chỉ nạp tối đa 50 địa điểm. Hãy chia danh sách thành các lượt nhỏ.'), { status: 400 });
  const unique = new Map<string, PartnerInput>();
  selected.forEach(record => { const key = partnerImportKey(record); if (!unique.has(key)) unique.set(key, record); });
  if (!unique.size) throw Object.assign(new Error('Hãy chọn ít nhất một địa điểm để nạp.'), { status: 400 });
    // Persist quickly; Maps verification runs separately through the bounded batch-verify endpoint.
    const result = await importPartners([...unique.values()], { resolveCoords: false });
    return {
      success: result.failed === 0, total: preview.records.length, selected: selected.length,
      imported: result.success, staged: result.staged, failed: result.failed,
      skipped: result.skipped + selected.length - unique.size,
      duplicates: selected.length - unique.size, excluded: preview.records.length - selected.length,
      errors: result.errors, cityCounts: result.cityCounts, qualityReport: result.qualityReport,
      maxBatchSize: 50, verificationDeferred: true,
      databaseMode: isDbMocked ? 'preview_only' : 'connected'
    };
}
