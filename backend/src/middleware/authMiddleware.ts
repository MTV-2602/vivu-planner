import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabaseAdmin';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
  };
  token?: string;
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header is missing' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Token formatted incorrectly' });
  }

  const token = parts[1];
  req.token = token;

  // Helper check: if Supabase variables are not set, allow mock-token for local testing
  const isSupabaseMissing = !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY;
  if (isSupabaseMissing || token === 'mock-token') {
    req.user = {
      id: '00000000-0000-0000-0000-000000000000',
      email: 'mockuser@vivu.vn'
    };
    return next();
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token', details: error?.message });
    }

    req.user = {
      id: user.id,
      email: user.email
    };
    next();
  } catch (err: any) {
    return res.status(500).json({ error: 'Authentication failed', details: err.message });
  }
}
