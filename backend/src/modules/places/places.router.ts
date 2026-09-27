import { Router, Request, Response } from 'express';
import { searchPlaces } from './places.service';
import { geocodeOnline } from './geocoding.service';

const router = Router();

// GET /api/places/geocode - Tra cứu tọa độ địa lý trực tuyến chuẩn xác theo tên và thành phố
router.get('/geocode', async (req: Request, res: Response) => {
  const { name, address, city } = req.query;
  if (!name && !address) {
    return res.status(400).json({ error: 'name hoặc address là bắt buộc' });
  }

  try {
    const result = await geocodeOnline(String(name || ''), String(address || ''), String(city || ''));
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: 'Geocode failed', details: err.message });
  }
});

// GET /api/places/search
router.get('/search', async (req: Request, res: Response) => {
  const { query, category, lat, lng } = req.query;
  if (!query) {
    return res.status(400).json({ error: 'Query parameter is required' });
  }

  try {
    const results = await searchPlaces(
      String(query),
      (category as any) || 'attraction',
      lat ? Number(lat) : undefined,
      lng ? Number(lng) : undefined
    );
    return res.json({ results, data: results });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to search places', details: err.message });
  }
});

// POST /api/places/suggest - Submit UGC place suggestion into place_suggestions table
router.post('/suggest', async (req: Request, res: Response) => {
  const { name, category, city, address, estimated_cost, opening_hours, user_review } = req.body;

  if (!name || !city) {
    return res.status(400).json({ error: 'name and city are required' });
  }

  try {
    const { supabaseAdmin } = require('../../config/supabase');
    const { data, error } = await supabaseAdmin
      .from('place_suggestions')
      .insert([{
        name,
        category: category || 'cafe',
        city,
        address: address || '',
        estimated_cost: Number(estimated_cost) || 0,
        opening_hours: opening_hours || '',
        user_review: user_review || '',
        status: 'pending',
      }]);

    if (error) throw error;

    return res.json({ success: true, message: 'Gửi đóng góp địa điểm thành công! Đang chờ Admin duyệt.' });
  } catch (err: any) {
    console.error('[Places Suggest API] Error:', err.message);
    return res.status(500).json({ error: 'Failed to submit place suggestion', details: err.message });
  }
});

export default router;
