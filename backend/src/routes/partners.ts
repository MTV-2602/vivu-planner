import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/authMiddleware';
import { supabaseAdmin, isDbMocked } from '../services/supabaseAdmin';

const router = Router();
const ADMIN_EMAILS = ['team89a6@gmail.com', 'vinhvip4508@gmail.com', 'mockuser@vivu.vn'];

// Admin middleware to verify admin token/role
function adminMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const isSpecialAdminId = req.user && req.user.id === '00000000-0000-0000-0000-000000000001';
  const isEmailAdmin = req.user && req.user.email && ADMIN_EMAILS.map(e => e.toLowerCase().trim()).includes(req.user.email.toLowerCase().trim());

  if (!isSpecialAdminId && !isEmailAdmin) {
    return res.status(403).json({ error: 'Forbidden: Access denied. Admin rights required.' });
  }
  next();
}

router.use(authMiddleware);
router.use(adminMiddleware);

// GET /api/admin/partners - List all partners (with filters)
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
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
    if (active_status !== undefined) {
      query = query.eq('active_status', active_status === 'true');
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve partners', details: err.message });
  }
});

// GET /api/admin/partners/analytics/summary - Get aggregate performance metrics
router.get('/analytics/summary', async (req: AuthenticatedRequest, res: Response) => {
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

// GET /api/admin/partners/:id - Retrieve details of a single partner
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
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

    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve partner', details: err.message });
  }
});

// POST /api/admin/partners - Create a new partner
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  if (isDbMocked) {
    return res.status(201).json({ id: 'mock-new-partner', ...req.body });
  }

  try {
    const partnerData = req.body;
    if (!partnerData.name || !partnerData.category || !partnerData.address || partnerData.lat === undefined || partnerData.lng === undefined || !partnerData.city) {
      return res.status(400).json({ error: 'Missing required partner fields: name, category, address, lat, lng, city' });
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
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (isDbMocked) {
    return res.json({ id, ...req.body });
  }

  try {
    const partnerData = { ...req.body };
    delete partnerData.id;
    delete partnerData.created_at;
    delete partnerData.updated_at;
    delete partnerData.impression_count;
    delete partnerData.click_count;
    delete partnerData.booking_count;

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
router.put('/:id/toggle', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  if (isDbMocked) {
    return res.json({ id, active_status: false });
  }

  try {
    const { data: partner, error: fetchError } = await supabaseAdmin
      .from('partners')
      .select('active_status')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    const newStatus = !partner.active_status;
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
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
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
router.get('/:id/analytics', async (req: AuthenticatedRequest, res: Response) => {
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

export default router;
