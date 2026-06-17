import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabaseAdmin';
import crypto from 'crypto';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
      };
      token?: string;
    }
  }
}

export type AuthenticatedRequest = Request;

export function verifyAdminToken(token: string): boolean {
  try {
    const parts = token.split(':');
    if (parts.length !== 3) {
      console.log('[VerifyAdminToken] Failed: parts length is', parts.length, 'expected 3. Parts:', parts);
      return false;
    }
    const [email, expiresAtStr, signature] = parts;
    
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@vivu.vn';
    if (email.toLowerCase().trim() !== adminEmail.toLowerCase().trim()) {
      console.log('[VerifyAdminToken] Failed: email mismatch. Token email:', email.toLowerCase().trim(), 'Expected adminEmail:', adminEmail.toLowerCase().trim());
      return false;
    }
    
    const expiresAt = parseInt(expiresAtStr);
    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      console.log('[VerifyAdminToken] Failed: token expired or invalid. Expires:', expiresAt, 'Now:', Date.now());
      return false;
    }
    
    const payload = `${email}:${expiresAtStr}`;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'default-admin-secret';
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    
    if (signature !== expectedSignature) {
      console.log('[VerifyAdminToken] Failed: signature mismatch. Got:', signature, 'Expected:', expectedSignature);
      console.log('[VerifyAdminToken] Diagnostic info: payload:', payload, 'secret length:', secret.length);
      return false;
    }
    
    console.log('[VerifyAdminToken] Success for admin:', email);
    return true;
  } catch (err: any) {
    console.error('[VerifyAdminToken] Exception occurred:', err.message);
    return false;
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
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

  // 1. Check if token is a valid cryptographically signed admin token
  const tokenClean = token.trim();
  const isLooksLikeAdmin = tokenClean.includes('@') && tokenClean.split(':').length === 3;
  if (isLooksLikeAdmin) {
    const parts = tokenClean.split(':');
    const [email, expiresAtStr, signature] = parts;
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@vivu.vn';
    const expiresAt = parseInt(expiresAtStr);
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'default-admin-secret';
    
    if (email.toLowerCase().trim() !== adminEmail.toLowerCase().trim()) {
      return res.status(401).json({
        error: 'Admin authentication failed',
        reason: 'Email mismatch',
        tokenEmail: email,
        configEmail: adminEmail
      });
    }
    
    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      return res.status(401).json({
        error: 'Admin authentication failed',
        reason: 'Token expired or invalid time',
        expiresAt,
        now: Date.now()
      });
    }
    
    const payload = `${email}:${expiresAtStr}`;
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (signature !== expectedSignature) {
      return res.status(401).json({
        error: 'Admin authentication failed',
        reason: 'Signature mismatch',
        payload,
        secretLength: secret.length,
        secretPrefix: secret.substring(0, 5),
        gotSignature: signature,
        expectedSignature
      });
    }
    
    req.user = {
      id: '00000000-0000-0000-0000-000000000001', // Special Admin ID
      email: adminEmail
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
