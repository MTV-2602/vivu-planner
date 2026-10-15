import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../../middleware/requireAuth';
import { requireAdmin } from '../../middleware/requireAdmin';
import { supabaseAdmin, isDbMocked } from '../../config/supabase';
import { logPartnerEvent } from './partners.service';
import { parsePartnerExcel, importPartners, verifyRecordPinEvidence, extractCoordinatesFromUrl, validateMapsUrl, resolveGoogleMapsVenuePin, parseVndPrice } from './partnerImport.service';
import { previewLocalData, commitLocalData } from './localDataImport.service';
import { isUserPremium } from '../../constants';
import { deleteSelectedLocations, verifySelectedLocations } from './localDataManagement.service';

const router = Router();

function validateLocalLocation(record: any): string | null {
  const url = record.i18n?.resolved_maps_url || record.i18n?.source_maps_url || record.booking_url;
  const pin = typeof url === 'string' && validateMapsUrl(url).valid ? extractCoordinatesFromUrl(url) : null;
  const verified = Boolean(pin && Number.isFinite(record.lat) && Number.isFinite(record.lng) && Math.abs(pin.lat - record.lat) <= 1e-4 && Math.abs(pin.lng - record.lng) <= 1e-4);
  record.i18n = { ...(record.i18n || {}), source_type: 'local_data', location_verified: verified, coordinate_source: verified ? 'google_maps_pin' : 'unresolved' };
  if (verified) {
    record.i18n.resolved_maps_url = url;
    record.i18n.source_maps_url = record.i18n.source_maps_url || url;
    delete record.i18n.unresolved_reason;
  } else {
    record.lat = null;
    record.lng = null;
    delete record.i18n.resolved_lat;
    delete record.i18n.resolved_lng;
    delete record.i18n.pin_provenance;
    record.i18n.unresolved_reason = 'no_matching_pin_in_url';
  }
  if (record.active_status !== false && !verified) return 'Chỉ kích hoạt địa điểm có tọa độ khớp với pin Google Maps đã xác minh.';
  return null;
}

async function prepareLocalEdit(input: any, current: any = {}) {
  const record = { ...current, ...input, i18n: { ...(current.i18n || {}), ...(input.i18n || {}) } };
  for (const field of ['source_maps_url', 'original_price']) {
    if (input[field] !== undefined) record.i18n[field] = input[field];
    delete record[field];
  }
  if (input.original_price !== undefined) record.price_level = parseVndPrice(input.original_price).priceLevel;
  delete record.location_verified;
  delete record.coordinate_source;
  if (input.source_maps_url !== undefined && input.source_maps_url !== current.i18n?.source_maps_url) {
    const resolved = await resolveGoogleMapsVenuePin(String(input.source_maps_url || ''));
    delete record.i18n.resolved_maps_url;
    record.booking_url = input.source_maps_url || null;
    if (resolved.coords) {
      record.lat = resolved.coords.lat;
      record.lng = resolved.coords.lng;
      record.i18n.resolved_maps_url = resolved.finalUrl || input.source_maps_url;
      record.i18n.pin_provenance = resolved.pinProvenance;
    } else {
      record.lat = null;
      record.lng = null;
      record.active_status = false;
      record.i18n.unresolved_reason = resolved.reason || 'no_venue_pin_found';
    }
  }
  return record;
}

router.use(requireAuth);

async function canReadLocalData(req: any): Promise<boolean> {
  if (req.isAdmin === true || req.user?.role === 'admin') return true;
  if (isDbMocked) return false;
  const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', req.user.id).maybeSingle();
  return isUserPremium(profile);
}

// POST /api/admin/partners/:id/click - Public endpoint to log partner clicks (requires user auth, not admin)
router.post('/:id/click', async (req: any, res: Response) => {
  const { id } = req.params;
  const { tripId } = req.body;
  try {
    await logPartnerEvent(id, 'click', tripId, req.user?.id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to log partner click', details: err.message });
  }
});

// GET /api/partners & /api/admin/partners - List partners (filtered by active_status for non-admins)
router.get('/', async (req: any, res: Response) => {
  if (!await canReadLocalData(req)) return res.status(403).json({ error: 'Kho dữ liệu địa phương dành cho Pro.', requires_premium: true });
  if (isDbMocked) {
    return res.json([
      {
        id: 'mock-partner-1',
        name: 'Khách sạn Continental Sài Gòn',
        category: 'hotel',
        address: '132-134 Đồng Khởi, Bến Nghé, Quận 1, Hồ Chí Minh',
        lat: 10.776,
        lng: 106.701,
        city: 'Hồ Chí Minh',
        district: 'Quận 1',
        price_level: 3,
        admin_rating: 5,
        active_status: true,
        impression_count: 50,
        click_count: 10,
        booking_count: 3
      }
    ]);
  }

  try {
    const { city, category, active_status } = req.query;
    let query = supabaseAdmin.from('partners').select('*');

    if (city) {
      query = query.eq('city', city as string);
    }
    if (category) {
      query = query.eq('category', category as string);
    }

    const isAdmin = req.user?.role === 'admin';
    if (!isAdmin) {
      query = query.eq('active_status', true);
    } else if (active_status !== undefined) {
      query = query.eq('active_status', active_status === 'true');
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve partners', details: err.message });
  }
});

// GET /api/partners/:id - Retrieve details of a single partner
router.get('/:id', async (req: any, res: Response) => {
  if (!await canReadLocalData(req)) return res.status(403).json({ error: 'Kho dữ liệu địa phương dành cho Pro.', requires_premium: true });
  const { id } = req.params;
  if (isDbMocked) {
    return res.json({
      id,
      name: 'Khách sạn Continental Sài Gòn',
      category: 'hotel',
      address: '132-134 Đồng Khởi, Bến Nghé, Quận 1, Hồ Chí Minh',
      lat: 10.776,
      lng: 106.701,
      city: 'Hồ Chí Minh',
      district: 'Quận 1',
      price_level: 3,
      admin_rating: 5,
      active_status: true
    });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('partners')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) throw error || new Error('Partner not found');
    if (req.user?.role !== 'admin' && !data.active_status) {
      return res.status(404).json({ error: 'Partner not found or inactive' });
    }
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve partner', details: err.message });
  }
});

// Below endpoints require admin privileges
router.use(requireAdmin);

router.post(['/batch-delete', '/bulk-delete'], async (req: any, res: Response) => {
  try { return res.json(await deleteSelectedLocations(req.body?.ids)); }
  catch (err: any) { return res.status(err.status || 500).json({ error: err.message }); }
});

router.post(['/batch-verify', '/verify-locations'], async (req: any, res: Response) => {
  try { return res.json(await verifySelectedLocations(req.body?.ids)); }
  catch (err: any) { return res.status(err.status || 500).json({ error: err.message }); }
});

router.post('/:id/verify-location', async (req: any, res: Response) => {
  try { return res.json(await verifySelectedLocations([req.params.id])); }
  catch (err: any) { return res.status(err.status || 500).json({ error: err.message }); }
});

router.post(['/import-preview', '/import/preview'], async (req: any, res: Response) => {
  try {
    return res.json(await previewLocalData(req.user.id, req.body));
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

router.post(['/import-commit', '/import/commit'], async (req: any, res: Response) => {
  try {
    return res.json(await commitLocalData(req.user.id, req.body));
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/admin/partners/analytics/summary - Get aggregate performance metrics
router.get('/analytics/summary', async (_req: any, res: Response) => {
  if (isDbMocked) {
    return res.json({
      totalImpressions: 120,
      totalClicks: 25,
      totalBookings: 8,
      averageCtr: 0.208
    });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('partners')
      .select('impression_count, click_count, booking_count');
    
    if (error) throw error;

    let totalImpressions = 0;
    let totalClicks = 0;
    let totalBookings = 0;

    if (data) {
      data.forEach((p: any) => {
        totalImpressions += p.impression_count || 0;
        totalClicks += p.click_count || 0;
        totalBookings += p.booking_count || 0;
      });
    }

    return res.json({
      totalImpressions,
      totalClicks,
      totalBookings,
      averageCtr: totalImpressions > 0 ? totalClicks / totalImpressions : 0
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve analytics summary', details: err.message });
  }
});

// POST /api/admin/partners - Create a new partner
router.post('/', async (req: any, res: Response) => {
  try {
    const partnerData = await prepareLocalEdit(req.body);
    const locationError = validateLocalLocation(partnerData);
    if (locationError) return res.status(400).json({ error: locationError });
    if (isDbMocked) return res.status(201).json({ id: 'mock-new-partner', ...partnerData, databaseMode: 'preview_only' });
    if (!partnerData.name || !partnerData.category || !partnerData.address || partnerData.lat === undefined || partnerData.lng === undefined || !partnerData.city) {
      return res.status(400).json({ error: 'Missing required partner fields: name, category, address, lat, lng, city' });
    }

    if (partnerData.partner_priority !== undefined && partnerData.priority === undefined) {
      partnerData.priority = partnerData.partner_priority;
    } else if (partnerData.priority !== undefined && partnerData.partner_priority === undefined) {
      partnerData.partner_priority = partnerData.priority;
    }

    if (!partnerData.tags || partnerData.tags.length === 0) {
      partnerData.tags = [
        ...(partnerData.cuisine_tags || []),
        ...(partnerData.amenity_tags || []),
        ...(partnerData.dietary_safe || [])
      ];
    }

    const { data, error } = await supabaseAdmin
      .from('partners')
      .insert([partnerData])
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to create partner', details: err.message });
  }
});

// PUT /api/admin/partners/:id - Update an existing partner's details
router.put('/:id', async (req: any, res: Response) => {
  const { id } = req.params;
  if (isDbMocked) {
    if (req.body.active_status === true || req.body.lat !== undefined || req.body.lng !== undefined) {
      const locationError = validateLocalLocation(req.body);
      if (locationError) return res.status(400).json({ error: locationError });
    }
    return res.json({ id, ...req.body });
  }

  try {
    const partnerData = { ...req.body };
    const { data: current, error: currentError } = await supabaseAdmin.from('partners').select('*').eq('id', id).single();
    if (currentError || !current) return res.status(404).json({ error: 'Không tìm thấy địa điểm.' });
    const merged = await prepareLocalEdit(partnerData, current);
    const locationError = validateLocalLocation(merged);
    if (locationError) return res.status(400).json({ error: locationError });
    for (const key of Object.keys(partnerData)) if (!(key in merged)) delete partnerData[key];
    for (const key of ['i18n', 'lat', 'lng', 'active_status', 'booking_url', 'price_level']) if (merged[key] !== undefined) partnerData[key] = merged[key];
    delete partnerData.id;
    delete partnerData.created_at;
    delete partnerData.updated_at;
    delete partnerData.impression_count;
    delete partnerData.click_count;
    delete partnerData.booking_count;

    if (partnerData.partner_priority !== undefined && partnerData.priority === undefined) {
      partnerData.priority = partnerData.partner_priority;
    } else if (partnerData.priority !== undefined && partnerData.partner_priority === undefined) {
      partnerData.partner_priority = partnerData.priority;
    }

    if (!partnerData.tags || partnerData.tags.length === 0) {
      partnerData.tags = [
        ...(partnerData.cuisine_tags || []),
        ...(partnerData.amenity_tags || []),
        ...(partnerData.dietary_safe || [])
      ];
    }

    const { data, error } = await supabaseAdmin
      .from('partners')
      .update({ ...partnerData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update partner', details: err.message });
  }
});

// PUT /api/admin/partners/:id/toggle - Toggle partner active status
router.put('/:id/toggle', async (req: any, res: Response) => {
  const { id } = req.params;
  if (isDbMocked) {
    return res.json({ id, active_status: false });
  }

  try {
    const { data: partner, error: fetchError } = await supabaseAdmin
      .from('partners')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    const newStatus = !partner.active_status;
    if (newStatus && !verifyRecordPinEvidence(partner).verified) return res.status(400).json({ error: 'Địa điểm chưa có pin Google Maps hợp lệ. Hãy sửa tọa độ trước khi kích hoạt.' });
    const { data, error } = await supabaseAdmin
      .from('partners')
      .update({ active_status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to toggle partner status', details: err.message });
  }
});

// DELETE /api/admin/partners/:id - Delete a partner (cascade deletes analytics)
router.delete('/:id', async (req: any, res: Response) => {
  const { id } = req.params;
  if (isDbMocked) {
    return res.json({ success: true, message: 'Partner deleted successfully' });
  }

  try {
    const { error } = await supabaseAdmin
      .from('partners')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return res.json({ success: true, message: 'Partner deleted successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete partner', details: err.message });
  }
});

// GET /api/admin/partners/:id/analytics - Get metrics and events log for a specific partner
router.get('/:id/analytics', async (req: any, res: Response) => {
  const { id } = req.params;
  if (isDbMocked) {
    return res.json({
      partner_id: id,
      name: 'Mock Partner',
      impression_count: 50,
      click_count: 10,
      booking_count: 3,
      events: []
    });
  }

  try {
    const { data: partner, error: partnerError } = await supabaseAdmin
      .from('partners')
      .select('name, impression_count, click_count, booking_count')
      .eq('id', id)
      .single();

    if (partnerError) throw partnerError;

    const { data: events, error: eventsError } = await supabaseAdmin
      .from('partner_analytics')
      .select('*')
      .eq('partner_id', id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (eventsError) throw eventsError;

    return res.json({
      partner_id: id,
      name: partner.name,
      impression_count: partner.impression_count || 0,
      click_count: partner.click_count || 0,
      booking_count: partner.booking_count || 0,
      events: events || []
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve partner analytics', details: err.message });
  }
});

// POST /api/admin/partners/import-excel - Import partners from Excel file or base64
router.post('/import-excel', async (req: any, res: Response) => {
  try {
    const { filePath, fileBase64, resolveCoords } = req.body;
    let records: any[] = [];

    if (fileBase64) {
      const buffer = Buffer.from(fileBase64, 'base64');
      records = await parsePartnerExcel(buffer);
    } else if (filePath) {
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `File không tồn tại tại đường dẫn: ${filePath}` });
      }
      records = await parsePartnerExcel(filePath);
    } else {
      // Thử tìm file mặc định
      const defaultPaths = [
        'C:\\Users\\vinhmt\\Downloads\\LOCATION DATA.xlsx',
        path.resolve(process.cwd(), 'LOCATION DATA.xlsx'),
        path.resolve(process.cwd(), '..', 'LOCATION DATA.xlsx')
      ];
      const foundPath = defaultPaths.find(p => fs.existsSync(p));
      if (foundPath) {
        records = await parsePartnerExcel(foundPath);
      } else {
        return res.status(400).json({ error: 'Vui lòng cung cấp filePath hoặc fileBase64 để nạp dữ liệu' });
      }
    }

    if (records.length === 0) {
      return res.status(400).json({ error: 'Không tìm thấy dữ liệu đối tác hợp lệ trong file Excel' });
    }

    const result = await importPartners(records, {
      resolveCoords: resolveCoords !== false
    });

    return res.json({
      success: result.failed === 0,
      total: records.length,
      imported: result.success,
      staged: result.staged,
      databaseMode: isDbMocked ? 'preview_only' : 'connected',
      failed: result.failed,
      skipped: result.skipped,
      cityCounts: result.cityCounts,
      errors: result.errors,
      qualityReport: result.qualityReport
    });
  } catch (err: any) {
    console.error('[Admin Partner Import] Error:', err);
    return res.status(500).json({ error: 'Lỗi khi import file Excel đối tác', details: err.message });
  }
});

// POST /api/admin/partners/quick-seed - Nạp nhanh 367 đối tác từ file mặc định trên máy
router.post('/quick-seed', async (req: any, res: Response) => {
  try {
    const defaultPaths = [
      'C:\\Users\\vinhmt\\Downloads\\LOCATION DATA.xlsx',
      path.resolve(process.cwd(), 'LOCATION DATA.xlsx'),
      path.resolve(process.cwd(), '..', 'LOCATION DATA.xlsx')
    ];
    const foundPath = defaultPaths.find(p => fs.existsSync(p));

    if (!foundPath) {
      return res.status(404).json({
        error: 'Không tìm thấy file LOCATION DATA.xlsx mặc định trên máy tại C:\\Users\\vinhmt\\Downloads\\LOCATION DATA.xlsx'
      });
    }

    const records = await parsePartnerExcel(foundPath);
    if (records.length === 0) {
      return res.status(400).json({ error: 'File Excel rỗng hoặc không có dữ liệu đối tác' });
    }

    const resolveCoords = req.body.resolveCoords !== false;
    const result = await importPartners(records, { resolveCoords });

    return res.json({
      success: result.failed === 0,
      message: isDbMocked ? 'Chế độ xem thử: chưa ghi dữ liệu.' : `Đã lưu ${result.success} điểm có pin và ${result.staged} điểm trong hàng chờ.`,
      sourcePath: foundPath,
      total: records.length,
      imported: result.success,
      staged: result.staged,
      databaseMode: isDbMocked ? 'preview_only' : 'connected',
      failed: result.failed,
      skipped: result.skipped,
      cityCounts: result.cityCounts,
      qualityReport: result.qualityReport
    });
  } catch (err: any) {
    console.error('[Admin Partner Quick Seed] Error:', err);
    return res.status(500).json({ error: 'Lỗi khi nạp nhanh dữ liệu đối tác', details: err.message });
  }
});

export default router;
