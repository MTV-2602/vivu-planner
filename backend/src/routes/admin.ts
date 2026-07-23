import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/authMiddleware';
import { supabaseAdmin, isDbMocked } from '../services/supabaseAdmin';

const router = Router();
const ADMIN_EMAILS = ['team89a6@gmail.com', 'vinhvip4508@gmail.com', 'mockuser@vivu.vn'];

import crypto from 'crypto';

// Admin middleware to verify admin token
function adminMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const isSpecialAdminId = req.user && req.user.id === '00000000-0000-0000-0000-000000000001';
  const isEmailAdmin = req.user && req.user.email && ADMIN_EMAILS.map(e => e.toLowerCase().trim()).includes(req.user.email.toLowerCase().trim());

  if (!isSpecialAdminId && !isEmailAdmin) {
    return res.status(403).json({ error: 'Forbidden: Access denied. Admin rights required.' });
  }
  next();
}

// POST /api/admin/login - Authenticate admin using Render env credentials
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    return res.status(500).json({ error: 'Chưa cấu hình ADMIN_EMAIL và ADMIN_PASSWORD trên máy chủ!' });
  }

  const inputEmail = (email || '').toLowerCase().trim();

  if (inputEmail === adminEmail && password === adminPassword) {
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    const payload = `${inputEmail}:${expiresAt}`;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'default-admin-secret';
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const token = `${payload}:${signature}`;

    return res.json({
      success: true,
      email: inputEmail,
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
      totalApiKeys: 12,
      totalPartners: 1
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

    // 4. Get total API keys in pool
    const { count: keysCount, error: keysError } = await supabaseAdmin
      .from('gemini_api_keys')
      .select('*', { count: 'exact', head: true });
    if (keysError) throw keysError;

    // 5. Get total partners count
    const { count: partnersCount, error: partnersError } = await supabaseAdmin
      .from('partners')
      .select('*', { count: 'exact', head: true });
    if (partnersError) throw partnersError;

    return res.json({
      totalUsers: users?.length || 0,
      totalTrips: tripsCount || 0,
      totalDisruptions: disruptionsCount || 0,
      totalApiKeys: keysCount || 0,
      totalPartners: partnersCount || 0
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve stats', details: err.message });
  }
});

// GET /api/admin/users - List all users
router.get('/users', async (req: AuthenticatedRequest, res: Response) => {
  if (isDbMocked) {
    return res.json([
      { id: '00000000-0000-0000-0000-000000000000', email: 'mockuser@vivu.vn', full_name: 'Vinh Pro', created_at: new Date().toISOString(), banned_until: null },
      { id: '11111111-1111-1111-1111-111111111111', email: 'team89a6@gmail.com', full_name: 'MTV-2602 Admin', created_at: new Date().toISOString(), banned_until: null },
      { id: '22222222-2222-2222-2222-222222222222', email: 'vinhvip4508@gmail.com', full_name: 'Vinh VIP', created_at: new Date().toISOString(), banned_until: new Date(Date.now() + 10000000).toISOString() }
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
      last_sign_in_at: u.last_sign_in_at,
      banned_until: u.banned_until || null
    }));

    return res.json(formattedUsers);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve users', details: err.message });
  }
});

// DELETE /api/admin/users/:id - Delete a user and all related data cleanly
router.delete('/users/:id', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.params.id;

  if (isDbMocked) {
    return res.json({ success: true, message: `Mock deleted user ${userId}`, deletedTripIds: [] });
  }

  try {
    // 1. Fetch all trip IDs of this user
    const { data: userTrips, error: tripsError } = await supabaseAdmin
      .from('trips')
      .select('id')
      .eq('user_id', userId);
    
    if (tripsError) throw tripsError;
    const tripIds = (userTrips || []).map((t: any) => t.id);

    // 2. Cascade delete records related to these trips
    if (tripIds.length > 0) {
      // Get all day IDs for these trips
      const { data: days, error: daysError } = await supabaseAdmin
        .from('itinerary_days')
        .select('id')
        .in('trip_id', tripIds);
      
      if (daysError) throw daysError;
      const dayIds = (days || []).map((d: any) => d.id);

      // Delete itinerary items
      if (dayIds.length > 0) {
        const { error: itemsDelError } = await supabaseAdmin
          .from('itinerary_items')
          .delete()
          .in('day_id', dayIds);
        if (itemsDelError) throw itemsDelError;
      }

      // Delete disruption events
      const { error: disruptDelError } = await supabaseAdmin
        .from('disruption_events')
        .delete()
        .in('trip_id', tripIds);
      if (disruptDelError) throw disruptDelError;

      // Delete itinerary revisions
      const { error: revDelError } = await supabaseAdmin
        .from('itinerary_revisions')
        .delete()
        .in('trip_id', tripIds);
      if (revDelError) throw revDelError;

      // Delete itinerary days
      const { error: daysDelError } = await supabaseAdmin
        .from('itinerary_days')
        .delete()
        .in('trip_id', tripIds);
      if (daysDelError) throw daysDelError;

      // Delete trips
      const { error: tripsDelError } = await supabaseAdmin
        .from('trips')
        .delete()
        .in('id', tripIds);
      if (tripsDelError) throw tripsDelError;
    }

    // 3. Delete user profiles
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId);
    if (profileError) throw profileError;

    // 4. Delete user from auth
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) throw authError;

    return res.json({ 
      success: true, 
      message: 'User and all related data deleted successfully',
      deletedTripIds: tripIds
    });
  } catch (err: any) {
    console.error('[Admin Delete User] Error:', err.message);
    return res.status(500).json({ error: 'Failed to delete user and related data', details: err.message });
  }
});

// PUT /api/admin/users/:id/toggle-ban - Bật/tắt hoạt động của người dùng (Banned / Active)
router.put('/users/:id/toggle-ban', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.params.id;

  if (isDbMocked) {
    return res.json({ success: true, message: `Mock toggled ban for user ${userId}` });
  }

  try {
    // 1. Lấy thông tin user hiện tại
    const { data: { user }, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (fetchError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isBanned = !!(user.banned_until && new Date(user.banned_until) > new Date());
    
    // 2. Nếu đang bị ban -> unban. Nếu chưa bị ban -> ban 10 năm (87600h)
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: isBanned ? 'none' : '87600h'
    });

    if (updateError) throw updateError;

    return res.json({
      success: true,
      isBanned: !isBanned,
      message: isBanned ? 'Đã mở khóa hoạt động người dùng!' : 'Đã khóa hoạt động người dùng thành công!'
    });
  } catch (err: any) {
    console.error('[Admin Toggle Ban] Error:', err.message);
    return res.status(500).json({ error: 'Failed to toggle user ban status', details: err.message });
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

// DELETE /api/admin/trips/:id - Delete a trip and related data cleanly
router.delete('/trips/:id', async (req: AuthenticatedRequest, res: Response) => {
  const tripId = req.params.id;

  if (isDbMocked) {
    return res.json({ success: true, message: `Mock deleted trip ${tripId}` });
  }

  try {
    // 1. Fetch all day IDs for this trip
    const { data: days, error: daysError } = await supabaseAdmin
      .from('itinerary_days')
      .select('id')
      .eq('trip_id', tripId);
    
    if (daysError) throw daysError;
    const dayIds = (days || []).map((d: any) => d.id);

    // 2. Delete related itinerary items
    if (dayIds.length > 0) {
      const { error: itemsDelError } = await supabaseAdmin
        .from('itinerary_items')
        .delete()
        .in('day_id', dayIds);
      if (itemsDelError) throw itemsDelError;
    }

    // 3. Delete related disruption events
    const { error: disruptDelError } = await supabaseAdmin
      .from('disruption_events')
      .delete()
      .eq('trip_id', tripId);
    if (disruptDelError) throw disruptDelError;

    // 4. Delete related itinerary revisions
    const { error: revDelError } = await supabaseAdmin
      .from('itinerary_revisions')
      .delete()
      .eq('trip_id', tripId);
    if (revDelError) throw revDelError;

    // 5. Delete related itinerary days
    const { error: daysDelError } = await supabaseAdmin
      .from('itinerary_days')
      .delete()
      .eq('trip_id', tripId);
    if (daysDelError) throw daysDelError;

    // 6. Delete the trip itself
    const { error: tripDelError } = await supabaseAdmin
      .from('trips')
      .delete()
      .eq('id', tripId);

    if (tripDelError) throw tripDelError;

    return res.json({ success: true, message: 'Trip and related data deleted successfully' });
  } catch (err: any) {
    console.error('[Admin Delete Trip] Error:', err.message);
    return res.status(500).json({ error: 'Failed to delete trip and related data', details: err.message });
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

    // Fetch existing keys to prevent unique constraint violation
    const { data: existingKeys, error: fetchError } = await supabaseAdmin
      .from('gemini_api_keys')
      .select('key_value');
      
    if (fetchError) throw fetchError;

    const existingKeySet = new Set((existingKeys || []).map(k => k.key_value));
    const uniqueRowsToInsert = rowsToInsert.filter(row => !existingKeySet.has(row.key_value));

    if (uniqueRowsToInsert.length === 0) {
      return res.json({ success: true, message: 'Tất cả các key gửi lên đã tồn tại trong cơ sở dữ liệu.' });
    }

    const { data, error } = await supabaseAdmin
      .from('gemini_api_keys')
      .insert(uniqueRowsToInsert)
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
// GET /api/admin/user-packages - List all users with package & trip quota status
router.get('/user-packages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
    const { data: profiles } = await supabaseAdmin.from('profiles').select('*');
    const { data: trips } = await supabaseAdmin.from('trips').select('user_id');

    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
    const tripsCountMap = new Map<string, number>();
    (trips || []).forEach((t: any) => {
      tripsCountMap.set(t.user_id, (tripsCountMap.get(t.user_id) || 0) + 1);
    });

    const userPackages = (users || []).map((u: any) => {
      const prof: any = profileMap.get(u.id);
      const isPremium = !!(prof?.is_premium || (prof?.premium_until && new Date(prof.premium_until) > new Date()));
      const tripsUsed = tripsCountMap.get(u.id) || 0;
      const tripsQuota = prof?.custom_quota || (isPremium ? 10 : 3);

      return {
        id: u.id,
        email: u.email,
        full_name: u.user_metadata?.full_name || '',
        is_premium: isPremium,
        premium_until: prof?.premium_until || null,
        plan_name: isPremium ? 'Gói Pro (10 lượt)' : 'Gói Miễn Phí (3 lượt)',
        trips_used: tripsUsed,
        trips_quota: tripsQuota,
        created_at: u.created_at,
      };
    });

    return res.json(userPackages);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve user packages', details: err.message });
  }
});

// PUT /api/admin/users/:id/package - Update user package & quota
router.put('/users/:id/package', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.params.id;
  const { is_premium, custom_quota, duration_days = 30 } = req.body;

  try {
    const premium_until = is_premium
      ? new Date(Date.now() + duration_days * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        is_premium: !!is_premium,
        premium_until,
        custom_quota: custom_quota != null ? Number(custom_quota) : (is_premium ? 10 : 3),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return res.json({ success: true, message: 'User package updated successfully', data });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update user package', details: err.message });
  }
});

// GET /api/admin/revenue - Financial Revenue & Order Statistics
router.get('/revenue', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: orders } = await supabaseAdmin
      .from('payment_orders')
      .select('*')
      .order('created_at', { ascending: false });

    const orderList = orders || [];
    const completedOrders = orderList.filter((o: any) => o.status === 'completed' || o.status === 'success');
    
    const totalRevenue = completedOrders.reduce((sum: number, o: any) => sum + (Number(o.amount) || 0), 0);
    
    const now = new Date();
    const currentMonthPrefix = now.toISOString().slice(0, 7);
    const monthlyOrders = completedOrders.filter((o: any) => o.created_at && o.created_at.startsWith(currentMonthPrefix));
    const monthlyRevenue = monthlyOrders.reduce((sum: number, o: any) => sum + (Number(o.amount) || 0), 0);

    const planStats: Record<string, { label: string; count: number; revenue: number }> = {
      plus: { label: 'Gói ViVu Plus (29k - +5 lượt)', count: 0, revenue: 0 },
      pro: { label: 'Gói ViVu Pro (49k - +10 lượt)', count: 0, revenue: 0 },
      vip: { label: 'Gói ViVu VIP (99k - +25 lượt)', count: 0, revenue: 0 },
    };

    completedOrders.forEach((o: any) => {
      let p = (o.plan || 'pro') as string;
      if (p === 'monthly') p = 'pro';
      if (p === 'yearly' || p === 'quarterly') p = 'vip';

      if (!planStats[p]) {
        planStats[p] = { label: `Gói ${p}`, count: 0, revenue: 0 };
      }
      planStats[p].count += 1;
      planStats[p].revenue += Number(o.amount) || 0;
    });

    return res.json({
      totalRevenue,
      monthlyRevenue,
      totalOrders: orderList.length,
      completedOrdersCount: completedOrders.length,
      pendingOrdersCount: orderList.length - completedOrders.length,
      conversionRate: orderList.length > 0 ? parseFloat(((completedOrders.length / orderList.length) * 100).toFixed(1)) : 0,
      planStats,
      recentOrders: orderList.slice(0, 30),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve revenue statistics', details: err.message });
  }
});

export default router;
