import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { UserRole } from '../constants';

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  if (req.isAdmin === true || req.user?.role === UserRole.ADMIN) {
    return next();
  }

  if (req.user?.id) {
    try {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', req.user.id)
        .maybeSingle();

      if (profile?.role === UserRole.ADMIN) {
        req.isAdmin = true;
        if (req.user) req.user.role = UserRole.ADMIN;
        return next();
      }
    } catch (_) {}
  }

  return res.status(403).json({ error: 'Forbidden: Admin rights required' });
};
