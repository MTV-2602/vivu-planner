import { Request, Response, NextFunction } from "express";
import { supabaseAuth } from "../config/supabase";
import { UserRole } from "../constants";

declare global {
  namespace Express {
    interface Request {
      user?:    { id: string; email: string; role: string; };
      isAdmin?: boolean;
      token?:   string;
    }
  }
}

export type AuthenticatedRequest = Request;

/**
 * authMiddleware - verify Supabase JWT + extract role tu JWT claim user_role
 * user_role duoc set boi Supabase Auth Hook custom_access_token_hook
 * KHONG con HMAC token, KHONG hardcode email admin
 */
/**
 * Giải mã claim user_role từ JWT access token ở phía backend
 */
export function decodeJwtRole(token: string, fallbackUser?: any): string {
  try {
    const parts = token.split(".");
    if (parts.length >= 2) {
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
      if (payload.user_role) return payload.user_role;
    }
  } catch {}
  return (fallbackUser?.app_metadata as any)?.role || (fallbackUser?.user_metadata as any)?.role || UserRole.USER;
}

export const authMiddleware = async (
  req: Request, res: Response, next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    // Public route - khong co token, cho qua (requireAuth se chặn sau)
    return next();
  }

  const token = authHeader.slice(7).trim();
  req.token = token;
  try {
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);
    if (error || !user) {
      res.status(401).json({ error: "Unauthorized: invalid or expired token" });
      return;
    }

    // Giai ma JWT payload de lay custom claim user_role
    const userRole = decodeJwtRole(token, user);

    req.user    = { id: user.id, email: user.email || "", role: userRole };
    req.isAdmin = userRole === UserRole.ADMIN;
    next();
  } catch (err: any) {
    res.status(500).json({ error: "Auth error", details: err.message });
  }
};

// Alias de tuong thich voi ca 2 cach import
export const authenticate = authMiddleware;
