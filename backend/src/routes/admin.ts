import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/authMiddleware';
import { supabaseAdmin, isDbMocked } from '../services/supabaseAdmin';

const router = Router();
const ADMIN_EMAILS = ['team89a6@gmail.com', 'vinhvip4508@gmail.com', 'mockuser@vivu.vn'];

import crypto from 'crypto';

// Admin middleware to verify admin token
function adminMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Only the special admin ID (assigned by verifyAdminToken in authMiddleware) is allowed
  const isAuthorized = req.user && req.user.id === '00000000-0000-0000-0000-000000000001';
  if (!isAuthorized) {
    return res.status(403).json({ error: 'Forbidden: Access denied. Admin token required.' });
  }
  next();
}

// POST /api/admin/login - Authenticate admin using Vercel env credentials
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@vivu.vn';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  if (email === adminEmail && password === adminPassword) {
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    const payload = `${email}:${expiresAt}`;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'default-admin-secret';
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const token = `${payload}:${signature}`;

    return res.json({
      success: true,
      email,
      token
    });
  }

  return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu quản trị viên!' });
});

router.use(authMiddleware);
router.use(adminMiddleware);

// GET /api/admin/stats - System statistics
router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
  if (isDbMocked) {
    return res.json({
      totalUsers: 3,
      totalTrips: 5,
      totalDisruptions: 2,
      totalPlacesCached: 12
    });
  }

  try {
    // 1. Get total users
    const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    if (usersError) throw usersError;

    // 2. Get total trips count
    const { count: tripsCount, error: tripsError } = await supabaseAdmin
      .from('trips')
      .select('*', { count: 'exact', head: true });
    if (tripsError) throw tripsError;

    // 3. Get total disruption events
    const { count: disruptionsCount, error: disruptionsError } = await supabaseAdmin
      .from('disruption_events')
      .select('*', { count: 'exact', head: true });
    if (disruptionsError) throw disruptionsError;

    // 4. Get total places cached
    const { count: placesCount, error: placesError } = await supabaseAdmin
      .from('places_cache')
      .select('*', { count: 'exact', head: true });
    if (placesError) throw placesError;

    return res.json({
      totalUsers: users?.length || 0,
      totalTrips: tripsCount || 0,
      totalDisruptions: disruptionsCount || 0,
      totalPlacesCached: placesCount || 0
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve stats', details: err.message });
  }
});

// GET /api/admin/users - List all users
router.get('/users', async (req: AuthenticatedRequest, res: Response) => {
  if (isDbMocked) {
    return res.json([
      { id: '00000000-0000-0000-0000-000000000000', email: 'mockuser@vivu.vn', full_name: 'Vinh Pro', created_at: new Date().toISOString() },
      { id: '11111111-1111-1111-1111-111111111111', email: 'team89a6@gmail.com', full_name: 'MTV-2602 Admin', created_at: new Date().toISOString() },
      { id: '22222222-2222-2222-2222-222222222222', email: 'vinhvip4508@gmail.com', full_name: 'Vinh VIP', created_at: new Date().toISOString() }
    ]);
  }

  try {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) throw error;

    const formattedUsers = users.map((u: any) => ({
      id: u.id,
      email: u.email,
      full_name: u.user_metadata?.full_name || '',
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at
    }));

    return res.json(formattedUsers);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve users', details: err.message });
  }
});

// DELETE /api/admin/users/:id - Delete a user
router.delete('/users/:id', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.params.id;

  if (isDbMocked) {
    return res.json({ success: true, message: `Mock deleted user ${userId}` });
  }

  try {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw error;

    return res.json({ success: true, message: 'User deleted successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete user', details: err.message });
  }
});

// GET /api/admin/trips - List all trips across all users
router.get('/trips', async (req: AuthenticatedRequest, res: Response) => {
  if (isDbMocked) {
    return res.json([
      {
        id: 'trip-1',
        title: 'Chuyến đi Hà Nội thú vị',
        destination_city: 'Hà Nội',
        start_date: '2026-06-18',
        end_date: '2026-06-20',
        budget_total: 5000000,
        status: 'draft',
        user_email: 'mockuser@vivu.vn',
        created_at: new Date().toISOString()
      }
    ]);
  }

  try {
    // 1. Fetch all trips
    const { data: trips, error: tripsError } = await supabaseAdmin
      .from('trips')
      .select('*')
      .order('created_at', { ascending: false });

    if (tripsError) throw tripsError;

    // 2. Fetch all users to map user emails
    const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    const userEmailMap = new Map<string, string>();
    if (!usersError && users) {
      users.forEach((u: any) => {
        userEmailMap.set(u.id, u.email || '');
      });
    }

    const tripsWithEmails = (trips || []).map((trip: any) => ({
      ...trip,
      user_email: userEmailMap.get(trip.user_id) || 'Unknown User'
    }));

    return res.json(tripsWithEmails);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve trips', details: err.message });
  }
});

// DELETE /api/admin/trips/:id - Delete a trip
router.delete('/trips/:id', async (req: AuthenticatedRequest, res: Response) => {
  const tripId = req.params.id;

  if (isDbMocked) {
    return res.json({ success: true, message: `Mock deleted trip ${tripId}` });
  }

  try {
    const { error } = await supabaseAdmin
      .from('trips')
      .delete()
      .eq('id', tripId);

    if (error) throw error;

    return res.json({ success: true, message: 'Trip deleted successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete trip', details: err.message });
  }
});

// GET /api/admin/keys - Retrieve all API keys in the pool
router.get('/keys', async (req: AuthenticatedRequest, res: Response) => {
  if (isDbMocked) {
    return res.json([
      { id: '1', key_value: 'AIzaSyBHPaLXoSL8vXh0r0u8nYypHngALsO-ARo', is_active: true, status: 'active', created_at: new Date().toISOString() },
      { id: '2', key_value: 'AIzaSyDh0DV2-y4tIjDQOWvisQNWTwfPgDjENeg', is_active: true, status: 'active', created_at: new Date().toISOString() }
    ]);
  }

  try {
    const { data: keys, error } = await supabaseAdmin
      .from('gemini_api_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json(keys);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve API keys', details: err.message });
  }
});

// POST /api/admin/keys - Add a new API key (supports single or bulk import)
router.post('/keys', async (req: AuthenticatedRequest, res: Response) => {
  const { key_value, key_values } = req.body;

  if (isDbMocked) {
    return res.json({ success: true, message: 'Mock key added successfully' });
  }

  try {
    let rowsToInsert: any[] = [];

    if (key_values && Array.isArray(key_values)) {
      rowsToInsert = key_values.map(k => ({ key_value: k.trim(), is_active: true, status: 'active' }));
    } else if (key_value) {
      rowsToInsert = [{ key_value: key_value.trim(), is_active: true, status: 'active' }];
    } else {
      return res.status(400).json({ error: 'Missing parameter key_value or key_values' });
    }

    const { data, error } = await supabaseAdmin
      .from('gemini_api_keys')
      .insert(rowsToInsert)
      .select();

    if (error) throw error;
    return res.json({ success: true, message: 'API key(s) added successfully', data });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to add API key(s)', details: err.message });
  }
});

// PUT /api/admin/keys/:id - Update status/active state of a key
router.put('/keys/:id', async (req: AuthenticatedRequest, res: Response) => {
  const keyId = req.params.id;
  const { is_active, status } = req.body;

  if (isDbMocked) {
    return res.json({ success: true, message: `Mock updated key ${keyId}` });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('gemini_api_keys')
      .update({ is_active, status })
      .eq('id', keyId)
      .select()
      .single();

    if (error) throw error;
    return res.json({ success: true, message: 'API key updated successfully', data });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update API key', details: err.message });
  }
});

// DELETE /api/admin/keys/:id - Delete an API key
router.delete('/keys/:id', async (req: AuthenticatedRequest, res: Response) => {
  const keyId = req.params.id;

  if (isDbMocked) {
    return res.json({ success: true, message: `Mock deleted key ${keyId}` });
  }

  try {
    const { error } = await supabaseAdmin
      .from('gemini_api_keys')
      .delete()
      .eq('id', keyId);

    if (error) throw error;
    return res.json({ success: true, message: 'API key deleted successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete API key', details: err.message });
  }
});

export default router;
