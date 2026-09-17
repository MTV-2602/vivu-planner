import { Router, Response } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { requireAdmin } from '../../middleware/requireAdmin';
import { supabaseAdmin, isDbMocked } from '../../config/supabase';

import { autoCancelExpiredOrders, loadPlansFromDb } from '../payment/payment.router';
import {
  UserRole,
  USER_BAN_CONFIG,
  QUOTA_CONFIG,
  DEFAULT_PLANS_CONFIG,
  PaymentStatus,
  PaymentMethod,
  isUserPremium
} from '../../constants';

const router = Router();

router.use(requireAuth);
router.use(requireAdmin);

// GET /api/admin/stats - System statistics
router.get('/stats', async (_req: any, res: Response) => {
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
    // 1. Get total users count directly from profiles (unlimited)
    const { count: usersCount, error: usersError } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true });
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
      totalUsers: usersCount || 0,
      totalTrips: tripsCount || 0,
      totalDisruptions: disruptionsCount || 0,
      totalApiKeys: keysCount || 0,
      totalPartners: partnersCount || 0
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve stats', details: err.message });
  }
});

// GET /api/admin/users - List all users (query trực tiếp từ bảng profiles, hỗ trợ phân trang)
router.get('/users', async (req: any, res: Response) => {
  if (isDbMocked) {
    return res.json([]);
  }

  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;
    const search = (req.query.search as string || '').trim();

    let query = supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: profiles, count, error } = await query.range(offset, offset + limit - 1);
    if (error) throw error;

    const userProfiles = profiles || [];
    const missingEmailProfiles = userProfiles.filter((p: any) => !p.email);

    if (missingEmailProfiles.length > 0) {
      await Promise.all(
        missingEmailProfiles.slice(0, 50).map(async (p: any) => {
          try {
            const { data: authData } = await supabaseAdmin.auth.admin.getUserById(p.id);
            if (authData?.user?.email) {
              p.email = authData.user.email;
              supabaseAdmin.from('profiles').update({ email: authData.user.email }).eq('id', p.id).then();
            }
          } catch (_) {}
        })
      );
    }

    const formattedUsers = userProfiles.map((p: any) => ({
      id: p.id,
      email: p.email || '',
      full_name: p.full_name || 'Người dùng',
      phone: p.phone || '',
      role: p.role || UserRole.USER,
      is_premium: isUserPremium(p),
      premium_until: p.premium_until || null,
      quota_total: p.quota_total || 3,
      quota_used: p.quota_used || 0,
      created_at: p.created_at,
      last_sign_in_at: p.last_sign_in_at || null,
      banned_until: p.banned_until || null
    }));

    return res.json(formattedUsers);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve users', details: err.message });
  }
});

// PUT /api/admin/users/:id - Chỉnh sửa thông tin chi tiết của người dùng (Họ tên, SĐT, Quota, Mật khẩu)
router.put('/users/:id', async (req: any, res: Response) => {
  const userId = req.params.id;
  const { full_name, phone, quota_total, new_password, role } = req.body;

  try {
    const updateData: any = { updated_at: new Date().toISOString() };
    if (full_name !== undefined) updateData.full_name = String(full_name).trim();
    if (phone !== undefined) updateData.phone = phone ? String(phone).trim() : null;
    if (quota_total !== undefined) {
      updateData.quota_total = Math.max(0, parseInt(quota_total) || 0);
    }
    if (role && [UserRole.USER, UserRole.ADMIN].includes(role)) {
      if (req.user?.id !== userId) {
        updateData.role = role;
      }
    }

    // 1. Cập nhật bảng profiles
    const { data: updatedProfile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', userId)
      .select()
      .maybeSingle();

    if (profileErr) throw profileErr;

    // 2. Nếu có yêu cầu đổi mật khẩu mới (tối thiểu 6 ký tự)
    if (new_password && String(new_password).trim().length >= 6) {
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: String(new_password).trim()
      });
      if (authErr) {
        console.error('[Admin Update User] Đổi mật khẩu thất bại:', authErr.message);
      }
    }

    // 3. Phát Realtime broadcast cho client của user
    try {
      const channel = supabaseAdmin.channel(`user_channel_${userId}`);
      await channel.send({
        type: 'broadcast',
        event: 'user_updated',
        payload: { userId, timestamp: Date.now() },
      });
    } catch (_) {}

    return res.json({
      success: true,
      message: 'Cập nhật thông tin người dùng thành công!',
      data: updatedProfile
    });
  } catch (err: any) {
    console.error('[Admin Update User] Error:', err.message);
    return res.status(500).json({ error: 'Không thể cập nhật thông tin người dùng', details: err.message });
  }
});

// DELETE /api/admin/users/:id - Delete a user and all related data cleanly
router.delete('/users/:id', async (req: any, res: Response) => {
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
router.put('/users/:id/toggle-ban', async (req: any, res: Response) => {
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
      ban_duration: isBanned ? USER_BAN_CONFIG.UNBAN_DURATION : USER_BAN_CONFIG.DEFAULT_BAN_DURATION
    });

    if (updateError) throw updateError;

    try {
      const channel = supabaseAdmin.channel(`user_channel_${userId}`);
      await channel.send({
        type: 'broadcast',
        event: 'user_updated',
        payload: { userId, isBanned: !isBanned, timestamp: Date.now() },
      });
    } catch (_) {}

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

// PUT /api/admin/users/:id/role - Phân quyền Admin / User trực tiếp trên Production
router.put('/users/:id/role', async (req: any, res: Response) => {
  const userId = req.params.id;
  const { role } = req.body;

  if (![UserRole.USER, UserRole.ADMIN].includes(role)) {
    return res.status(400).json({ error: 'Role không hợp lệ. Chỉ chấp nhận "user" hoặc "admin".' });
  }

  // Không cho phép tự hạ quyền của chính mình
  if (req.user?.id === userId && role !== UserRole.ADMIN) {
    return res.status(400).json({ error: 'Bạn không thể tự hạ quyền Admin của chính mình!' });
  }

  try {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    try {
      const channel = supabaseAdmin.channel(`user_channel_${userId}`);
      await channel.send({
        type: 'broadcast',
        event: 'user_updated',
        payload: { userId, role, timestamp: Date.now() },
      });
    } catch (_) {}

    return res.json({
      success: true,
      message: `Đã cập nhật vai trò thành ${role === 'admin' ? 'Quản trị viên (Admin)' : 'Người dùng (User)'}!`,
      role
    });
  } catch (err: any) {
    console.error('[Admin Update Role] Error:', err.message);
    return res.status(500).json({ error: 'Cập nhật quyền thất bại', details: err.message });
  }
});




// GET /api/admin/trips - List all trips across all users
router.get('/trips', async (_req: any, res: Response) => {
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
router.delete('/trips/:id', async (req: any, res: Response) => {
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
router.get('/keys', async (_req: any, res: Response) => {
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
router.post('/keys', async (req: any, res: Response) => {
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
router.put('/keys/:id', async (req: any, res: Response) => {
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
router.delete('/keys/:id', async (req: any, res: Response) => {
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
router.get('/user-packages', async (_req: any, res: Response) => {
  try {
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
    const { data: profiles } = await supabaseAdmin.from('profiles').select('*');
    const { data: trips } = await supabaseAdmin.from('trips').select('user_id');
    const { data: orders } = await supabaseAdmin
      .from('payment_orders')
      .select('user_id, plan')
      .in('status', ['completed', 'success'])
      .order('created_at', { ascending: false });

    const latestOrderMap = new Map<string, string>();
    (orders || []).forEach((o: any) => {
      if (!latestOrderMap.has(o.user_id)) {
        latestOrderMap.set(o.user_id, o.plan || 'pro');
      }
    });

    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
    const tripsCountMap = new Map<string, number>();
    (trips || []).forEach((t: any) => {
      tripsCountMap.set(t.user_id, (tripsCountMap.get(t.user_id) || 0) + 1);
    });

    const userPackages = (users || []).map((u: any) => {
      const prof: any = profileMap.get(u.id);
      const isPremium = !!(prof?.is_premium || (prof?.premium_until && new Date(prof.premium_until) > new Date()));
      const tripsUsed = Math.max(prof?.quota_used ?? 0, prof?.trips_used ?? 0, tripsCountMap.get(u.id) || 0);
      const tripsQuota = prof?.quota_total ?? (prof?.custom_quota ?? (isPremium ? QUOTA_CONFIG.UNLIMITED_ADMIN_TRIPS : QUOTA_CONFIG.DEFAULT_FREE_TRIPS));

      let planName = 'Gói Miễn Phí';
      if (isPremium) {
        const planId = latestOrderMap.get(u.id) || 'pro';
        if (planId === 'plus' || planId === 'starter') {
          planName = '👑 Gói Starter';
        } else {
          planName = '👑 Gói Premium';
        }
      }

      return {
        id: u.id,
        email: u.email,
        full_name: u.user_metadata?.full_name || '',
        is_premium: isPremium,
        premium_until: prof?.premium_until || null,
        plan_name: planName,
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
router.put('/users/:id/package', async (req: any, res: Response) => {
  const userId = req.params.id;
  const { is_premium, custom_quota, plan = 'premium', duration_days = 30 } = req.body;
  try {
    const allPlans = (await loadPlansFromDb()) || (DEFAULT_PLANS_CONFIG as any);
    const planInfo = allPlans?.[plan] || (is_premium ? allPlans?.['premium'] : null);
    const planAmount = planInfo?.amount ?? (plan === 'starter' ? DEFAULT_PLANS_CONFIG.starter.amount : DEFAULT_PLANS_CONFIG.premium.amount);
    const planQuota = planInfo?.quota_total_grant ?? (is_premium ? QUOTA_CONFIG.UNLIMITED_ADMIN_TRIPS : QUOTA_CONFIG.DEFAULT_FREE_TRIPS);
    const planDuration = planInfo?.duration_days ?? duration_days;

    const premium_until = is_premium
      ? new Date(Date.now() + planDuration * 24 * 60 * 60 * 1000).toISOString()
      : null;

    if (is_premium) {
      // Upsert a completed order to keep plans unified
      const orderId = `ADMIN_AUTO_${Date.now()}`;
      await supabaseAdmin.from('payment_orders').insert({
        id: orderId,
        user_id: userId,
        method: PaymentMethod.ADMIN,
        plan,
        amount: planAmount,
        status: PaymentStatus.COMPLETED,
        order_code: String(Date.now()),
        created_at: new Date().toISOString(),
      });
    }

    const targetQuota = custom_quota != null ? Number(custom_quota) : planQuota;

    let result = await supabaseAdmin
      .from('profiles')
      .update({
        is_premium: !!is_premium,
        premium_until,
        quota_total: targetQuota,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .maybeSingle();

    if (result.error) {
      result = await supabaseAdmin
        .from('profiles')
        .update({
          is_premium: !!is_premium,
          premium_until,
          custom_quota: targetQuota,
        })
        .eq('id', userId)
        .select()
        .maybeSingle();
    }

    if (result.error) throw result.error;

    // Phát broadcast Realtime tới client của user để cập nhật giao diện lập tức
    try {
      const channel = supabaseAdmin.channel(`user_channel_${userId}`);
      await channel.send({
        type: 'broadcast',
        event: 'user_updated',
        payload: {
          userId,
          is_premium: !!is_premium,
          quota_total: targetQuota,
          premium_until,
          timestamp: Date.now(),
        },
      });
    } catch (e: any) {
      console.error('[Admin] Realtime broadcast error:', e.message);
    }

    return res.json({ success: true, message: 'User package updated successfully', data: result.data });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update user package', details: err.message });
  }
});

// POST /api/admin/plans - Update pricing plans dynamically
router.post('/plans', async (req: any, res: Response) => {
  const { starter, premium, plans, plan } = req.body;
  try {
    // 1. Cập nhật mảng danh sách các gói tùy ý
    if (Array.isArray(plans) && plans.length > 0) {
      for (const p of plans) {
        if (!p.id) continue;
        await supabaseAdmin.from('pricing_plans').upsert({
          id: p.id,
          amount: Number(p.amount ?? p.price ?? 0),
          price: Number(p.amount ?? p.price ?? 0),
          label: p.label || p.name || p.id,
          name: p.label || p.name || p.id,
          duration_days: Number(p.duration_days || 30),
          quota_total_grant: Number(p.quota_total_grant ?? 9999),
          is_unlimited: !!p.is_unlimited,
          features: Array.isArray(p.features) ? p.features : [],
          is_active: p.is_active !== undefined ? !!p.is_active : true,
        });
      }
    }
    // 2. Cập nhật một gói đơn lẻ
    else if (plan && plan.id) {
      await supabaseAdmin.from('pricing_plans').upsert({
        id: plan.id,
        amount: Number(plan.amount ?? plan.price ?? 0),
        price: Number(plan.amount ?? plan.price ?? 0),
        label: plan.label || plan.name || plan.id,
        name: plan.label || plan.name || plan.id,
        duration_days: Number(plan.duration_days || 30),
        quota_total_grant: Number(plan.quota_total_grant ?? 9999),
        is_unlimited: !!plan.is_unlimited,
        features: Array.isArray(plan.features) ? plan.features : [],
        is_active: plan.is_active !== undefined ? !!plan.is_active : true,
      });
    }
    // 3. Tương thích định dạng starter / premium cũ
    else {
      if (starter) {
        const starterData = {
          amount: Number(starter.amount ?? starter.price ?? 29000),
          price: Number(starter.amount ?? starter.price ?? 29000),
          label: starter.label || starter.name || 'Gói Starter',
          name: starter.label || starter.name || 'Gói Starter',
          duration_days: Number(starter.duration_days || 30),
          quota_total_grant: Number(starter.quota_total_grant ?? 10),
          is_unlimited: false,
          is_active: true
        };
        await supabaseAdmin.from('pricing_plans').upsert({ id: 'starter', ...starterData });
        await supabaseAdmin.from('pricing_plans').upsert({ id: 'plus', ...starterData });
      }
      if (premium) {
        const premiumData = {
          amount: Number(premium.amount ?? premium.price ?? 49000),
          price: Number(premium.amount ?? premium.price ?? 49000),
          label: premium.label || premium.name || 'Gói Premium',
          name: premium.label || premium.name || 'Gói Premium',
          duration_days: Number(premium.duration_days || 30),
          quota_total_grant: Number(premium.quota_total_grant ?? 9999),
          is_unlimited: true,
          is_active: true
        };
        await supabaseAdmin.from('pricing_plans').upsert({ id: 'premium', ...premiumData });
        await supabaseAdmin.from('pricing_plans').upsert({ id: 'pro', ...premiumData });
        await supabaseAdmin.from('pricing_plans').upsert({ id: 'monthly', ...premiumData });
      }
    }

    // Clear and reload cache
    await loadPlansFromDb();

    // Phát tín hiệu Realtime qua Supabase Realtime cho tất cả client đang kết nối
    try {
      const realtimeChannel = supabaseAdmin.channel('pricing_realtime');
      realtimeChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          realtimeChannel.send({
            type: 'broadcast',
            event: 'plans_updated',
            payload: { timestamp: Date.now() },
          }).then(() => {
            supabaseAdmin.removeChannel(realtimeChannel);
          });
        }
      });
    } catch (realtimeErr: any) {
      console.warn('[Admin] Realtime broadcast warning:', realtimeErr?.message);
    }

    return res.json({ success: true, message: 'Cấu hình giá đã được cập nhật thành công!' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Lỗi cập nhật cấu hình giá', details: err.message });
  }
});

// GET /api/admin/revenue - Financial Revenue & Order Statistics
router.get('/revenue', async (_req: any, res: Response) => {
  try {
    await autoCancelExpiredOrders();
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
      plus: { label: 'Gói Starter', count: 0, revenue: 0 },
      pro: { label: 'Gói Premium', count: 0, revenue: 0 },
    };

    completedOrders.forEach((o: any) => {
      let p = (o.plan || 'pro') as string;
      if (p === 'monthly' || p === 'premium' || p === 'yearly' || p === 'vip' || p === 'quarterly') p = 'pro';
      if (p === 'starter') p = 'plus';

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

// ==========================================
// CẤU HÌNH AI GATEWAY & THIRD-PARTY AI
// ==========================================

import { getEffectiveAiConfig, saveAiGatewayConfig, testAiGatewayConnection } from '../ai/aiGateway.service';

// GET /api/admin/ai-config - Lấy cấu hình AI hiện tại
router.get('/ai-config', async (_req: any, res: Response) => {
  try {
    const config = await getEffectiveAiConfig();
    // Che bớt API key khi trả về client để bảo mật
    let maskedKey = '';
    if (config.apiKey) {
      if (config.apiKey.length <= 8) {
        maskedKey = '********';
      } else {
        maskedKey = `${config.apiKey.substring(0, 4)}...${config.apiKey.substring(config.apiKey.length - 4)}`;
      }
    }

    return res.json({
      success: true,
      data: {
        provider: config.provider,
        baseUrl: config.baseUrl || '',
        apiKey: maskedKey,
        hasApiKey: !!config.apiKey,
        model: config.model || 'ag/gemini-3-flash',
        isActive: config.isActive,
        maxTokens: config.maxTokens || 16384,
        geminiMaxTokens: config.geminiMaxTokens || 16384
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Lỗi lấy cấu hình AI', details: err.message });
  }
});

// PUT /api/admin/ai-config - Cập nhật cấu hình AI
router.put('/ai-config', async (req: any, res: Response) => {
  try {
    const { provider, baseUrl, apiKey, model, isActive, maxTokens, geminiMaxTokens } = req.body;
    const currentConfig = await getEffectiveAiConfig();

    // Nếu người dùng không nhập key mới (đang hiển thị masked), giữ nguyên key cũ
    let finalKey = apiKey;
    if (!apiKey || apiKey.includes('...')) {
      finalKey = currentConfig.apiKey;
    }

    await saveAiGatewayConfig({
      provider: provider === 'custom_openai' ? 'custom_openai' : 'gemini',
      baseUrl: baseUrl || '',
      apiKey: finalKey || '',
      model: model || 'ag/gemini-3-flash',
      isActive: Boolean(isActive),
      maxTokens: maxTokens ? Math.max(1024, Math.min(65536, Number(maxTokens))) : (currentConfig.maxTokens || 16384),
      geminiMaxTokens: geminiMaxTokens ? Math.max(1024, Math.min(65536, Number(geminiMaxTokens))) : (currentConfig.geminiMaxTokens || 16384)
    });

    return res.json({ success: true, message: 'Cập nhật cấu hình AI thành công!' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Lỗi lưu cấu hình AI', details: err.message });
  }
});

// POST /api/admin/ai-config/test - Kiểm tra kết nối nhanh đến Gateway bên thứ 3
router.post('/ai-config/test', async (req: any, res: Response) => {
  try {
    const { baseUrl, apiKey, model } = req.body;
    const currentConfig = await getEffectiveAiConfig();

    let finalKey = apiKey;
    if (!apiKey || apiKey.includes('...')) {
      finalKey = currentConfig.apiKey;
    }

    const finalBaseUrl = baseUrl?.trim() || currentConfig.baseUrl || process.env.CUSTOM_AI_BASE_URL || '';
    if (!finalBaseUrl) {
      return res.status(400).json({ error: 'Vui lòng cung cấp Base URL hoặc cấu hình CUSTOM_AI_BASE_URL trên hệ thống' });
    }
    if (!finalKey) {
      return res.status(400).json({ error: 'Vui lòng cung cấp API Key / Bearer Token' });
    }

    const testResult = await testAiGatewayConnection({
      baseUrl: finalBaseUrl,
      apiKey: finalKey,
      model: model || 'ag/gemini-3-flash'
    });

    return res.json({
      message: 'Kết nối API Gateway thành công!',
      ...testResult
    });
  } catch (err: any) {
    const errMsg = err.response?.data?.error?.message || err.response?.data?.error || err.message || 'Kết nối thất bại';
    return res.status(500).json({
      success: false,
      error: 'Không thể kết nối đến API Gateway',
      details: errMsg
    });
  }
});

export default router;

