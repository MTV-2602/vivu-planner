import { isDbMocked, supabaseAdmin } from '../../config/supabase';
import { resolveGoogleMapsVenuePin, verifyRecordPinEvidence, validateMapsUrl } from './partnerImport.service';

export function validateSelectedLocationIds(input: unknown, maximum: number): string[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > maximum || input.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
    throw Object.assign(new Error(`Chọn từ 1 đến ${maximum} địa điểm có mã hợp lệ.`), { status: 400 });
  }
  return [...new Set(input.map(id => id.toLowerCase()))];
}

export async function deleteSelectedLocations(input: unknown) {
  const ids = validateSelectedLocationIds(input, 500);
  if (isDbMocked) return { deletedIds: [], deletedCount: 0, requestedCount: ids.length, errors: ids.map(id => ({ id, error: 'Chưa kết nối cơ sở dữ liệu; chưa xóa địa điểm.' })), databaseMode: 'preview_only' };
  const { data, error } = await supabaseAdmin.from('partners').delete().in('id', ids).select('id');
  if (error) throw new Error(`Không thể xóa địa điểm: ${error.message}`);
  const deletedIds = (data || []).map(record => record.id);
  const deleted = new Set(deletedIds);
  return { deletedIds, deletedCount: deletedIds.length, requestedCount: ids.length,
    errors: ids.filter(id => !deleted.has(id)).map(id => ({ id, error: 'Địa điểm không còn tồn tại hoặc chưa được xóa.' })), databaseMode: 'connected' };
}

type VerificationResult = { id: string; status: 'verified' | 'unresolved' | 'failed' | 'missing'; reason?: string; active_status?: boolean; lat?: number | null; lng?: number | null };

export async function verifySelectedLocations(input: unknown) {
  const ids = validateSelectedLocationIds(input, 20);
  const results: VerificationResult[] = [];
  if (isDbMocked) {
    ids.forEach(id => results.push({ id, status: 'failed', reason: 'Chưa kết nối cơ sở dữ liệu; chưa lưu xác minh.' }));
  } else {
    const { data, error } = await supabaseAdmin.from('partners').select('*').in('id', ids);
    if (error) throw new Error(`Không thể đọc địa điểm: ${error.message}`);
    const byId = new Map((data || []).map(record => [record.id, record]));
    // Bound concurrency so retrying many short links does not flood Maps or database writes.
    for (let offset = 0; offset < ids.length; offset += 4) {
      await Promise.all(ids.slice(offset, offset + 4).map(async id => {
        const current = byId.get(id);
        if (!current) { results.push({ id, status: 'missing', reason: 'Không tìm thấy địa điểm.' }); return; }
        try {
          const sources = [current.i18n?.source_maps_url, current.booking_url, current.social_review_url, current.website_url];
          const sourceUrl = sources.find(url => typeof url === 'string' && validateMapsUrl(url).valid) || current.i18n?.source_maps_url || '';
          const resolution = await resolveGoogleMapsVenuePin(sourceUrl, 4, 2000);
          const i18n = { ...(current.i18n || {}), source_type: 'local_data', source_maps_url: sourceUrl,
            location_verified: Boolean(resolution.coords), coordinate_source: resolution.coords ? 'google_maps_pin' : 'unresolved',
            last_location_check_at: new Date().toISOString() };
          delete i18n.resolved_maps_url;
          delete i18n.resolved_lat;
          delete i18n.resolved_lng;
          delete i18n.pin_provenance;
          delete i18n.unresolved_reason;
          if (resolution.coords) {
            i18n.resolved_maps_url = resolution.finalUrl || sourceUrl;
            i18n.resolved_lat = resolution.coords.lat;
            i18n.resolved_lng = resolution.coords.lng;
            i18n.pin_provenance = resolution.pinProvenance || 'direct_pin';
          }
          const candidate = { ...current, lat: resolution.coords?.lat ?? null, lng: resolution.coords?.lng ?? null, i18n };
          const evidence = verifyRecordPinEvidence(candidate);
          if (!evidence.verified) {
            candidate.lat = null;
            candidate.lng = null;
            i18n.location_verified = false;
            i18n.coordinate_source = 'unresolved';
            i18n.unresolved_reason = resolution.reason || evidence.reason || 'no_venue_pin_found';
          }
          // Verification enriches data but never publishes a disabled row.
          const activeStatus = evidence.verified && current.active_status === true;
          const { data: saved, error: updateError } = await supabaseAdmin.from('partners').update({ lat: candidate.lat, lng: candidate.lng,
            active_status: activeStatus, i18n, updated_at: new Date().toISOString() }).eq('id', id).select('id').maybeSingle();
          if (updateError) throw updateError;
          if (!saved) { results.push({ id, status: 'missing', reason: 'Địa điểm đã bị xóa trước khi lưu xác minh.' }); return; }
          results.push({ id, status: evidence.verified ? 'verified' : 'unresolved', reason: evidence.verified ? undefined : i18n.unresolved_reason,
            active_status: activeStatus, lat: candidate.lat, lng: candidate.lng });
        } catch (err: any) { results.push({ id, status: 'failed', reason: err.message || 'Không thể lưu xác minh.' }); }
      }));
    }
  }
  results.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const verifiedIds = results.filter(result => result.status === 'verified').map(result => result.id);
  const unresolvedIds = results.filter(result => result.status === 'unresolved').map(result => result.id);
  return { results, verifiedIds, unresolvedIds, verified: verifiedIds.length, unresolved: unresolvedIds.length,
    failed: results.filter(result => result.status === 'failed' || result.status === 'missing').length,
    errors: results.filter(result => result.status === 'failed' || result.status === 'missing').map(result => ({ id: result.id, error: result.reason })),
    databaseMode: isDbMocked ? 'preview_only' : 'connected' };
}
