import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../rateLimiter';

describe('In-Memory Rate Limiter Middleware', () => {
  it('should allow requests within configured threshold', () => {
    const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 3 });

    let allowedCount = 0;
    const mockReq: any = { ip: '192.168.1.100', headers: {} };
    const mockRes: any = {
      status(code: number) { this.statusCode = code; return this; },
      json(data: any) { this.body = data; return this; },
      setHeader(name: string, val: any) { this[name] = val; }
    };
    const mockNext = () => { allowedCount++; };

    limiter(mockReq, mockRes, mockNext);
    limiter(mockReq, mockRes, mockNext);
    limiter(mockReq, mockRes, mockNext);

    assert.equal(allowedCount, 3);
  });

  it('should block requests exceeding threshold with HTTP 429', () => {
    const limiter = createRateLimiter({
      windowMs: 5000,
      maxRequests: 2,
      message: 'Rate limit exceeded'
    });

    let allowedCount = 0;
    const mockReq: any = { ip: '10.0.0.50', headers: {} };
    let capturedStatus = 0;
    let capturedBody: any = null;

    const mockRes: any = {
      status(code: number) { capturedStatus = code; return this; },
      json(data: any) { capturedBody = data; return this; },
      setHeader() {}
    };
    const mockNext = () => { allowedCount++; };

    limiter(mockReq, mockRes, mockNext); // 1st request -> allowed
    limiter(mockReq, mockRes, mockNext); // 2nd request -> allowed
    limiter(mockReq, mockRes, mockNext); // 3rd request -> blocked (429)

    assert.equal(allowedCount, 2);
    assert.equal(capturedStatus, 429);
    assert.equal(capturedBody?.error, 'Rate limit exceeded');
    assert.ok(capturedBody?.retryAfter >= 1);
  });
});
