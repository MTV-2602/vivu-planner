import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/authMiddleware';
import { supabaseAdmin, isDbMocked } from '../services/supabaseAdmin';

const router = Router();
const ADMIN_EMAILS = ['team89a6@gmail.com', 'vinhvip4508@gmail.com', 'mockuser@vivu.vn'];

// Admin middleware to verify email
function adminMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || !req.user.email || !ADMIN_EMAILS.includes(req.user.email)) {
    return res.status(403).json({ error: 'Forbidden: Access denied' });
  }
  next();
}

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

export default router;
