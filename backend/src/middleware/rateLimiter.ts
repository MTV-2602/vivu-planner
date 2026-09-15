import { Request, Response, NextFunction } from 'express';

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
}

/**
 * Lightweight in-memory sliding window rate limiter.
 * Zero external dependencies, safe for containerized and serverless cold-starts.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const { windowMs, maxRequests, message = 'Quá nhiều yêu cầu, vui lòng thử lại sau.' } = options;
  const requestHits = new Map<string, { count: number; resetTime: number }>();

  // Periodic cleanup of expired entries
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of requestHits.entries()) {
      if (now > record.resetTime) {
        requestHits.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  cleanupTimer.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = String(
      (req as any).user?.id ||
      req.ip ||
      req.headers['x-forwarded-for'] ||
      'client'
    );
    const now = Date.now();

    const record = requestHits.get(clientId);

    if (!record || now > record.resetTime) {
      requestHits.set(clientId, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (record.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: message,
        retryAfter: retryAfterSeconds
      });
    }

    record.count += 1;
    return next();
  };
}
