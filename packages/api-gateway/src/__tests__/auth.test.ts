import { Request, Response, NextFunction } from 'express';
import { authenticate, authorize, parentReadOnly, signToken, verifyToken } from '../middleware/auth';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { headers: {}, ...overrides } as unknown as Request;
}

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

const next: NextFunction = jest.fn();

beforeEach(() => jest.clearAllMocks());

describe('signToken / verifyToken', () => {
  it('should sign and verify a token', () => {
    const token = signToken({ userId: 'c1', role: 'child' });
    const payload = verifyToken(token);
    expect(payload.userId).toBe('c1');
    expect(payload.role).toBe('child');
  });

  it('should throw on invalid token', () => {
    expect(() => verifyToken('bad-token')).toThrow();
  });
});

describe('authenticate middleware', () => {
  it('should reject missing Authorization header', () => {
    const req = mockReq();
    const res = mockRes();
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject non-Bearer token', () => {
    const req = mockReq({ headers: { authorization: 'Basic abc' } });
    const res = mockRes();
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should reject invalid token', () => {
    const req = mockReq({ headers: { authorization: 'Bearer invalid' } });
    const res = mockRes();
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should set req.user and call next for valid token', () => {
    const token = signToken({ userId: 'c1', role: 'child' });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();
    authenticate(req, res, next);
    expect(req.user).toBeDefined();
    expect(req.user!.userId).toBe('c1');
    expect(req.user!.role).toBe('child');
    expect(next).toHaveBeenCalled();
  });
});

describe('authorize middleware', () => {
  it('should reject unauthenticated request', () => {
    const req = mockReq();
    const res = mockRes();
    authorize('child')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should reject unauthorized role', () => {
    const req = mockReq();
    req.user = { userId: 'p1', role: 'parent' };
    const res = mockRes();
    authorize('child')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should allow authorized role', () => {
    const req = mockReq();
    req.user = { userId: 'c1', role: 'child' };
    const res = mockRes();
    authorize('child')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should allow when multiple roles specified', () => {
    const req = mockReq();
    req.user = { userId: 'p1', role: 'parent' };
    const res = mockRes();
    authorize('child', 'parent')(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('parentReadOnly middleware', () => {
  it('should allow parent GET requests', () => {
    const req = mockReq({ method: 'GET' });
    req.user = { userId: 'p1', role: 'parent' };
    const res = mockRes();
    parentReadOnly(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should block parent POST requests', () => {
    const req = mockReq({ method: 'POST' });
    req.user = { userId: 'p1', role: 'parent' };
    const res = mockRes();
    parentReadOnly(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should block parent PUT requests', () => {
    const req = mockReq({ method: 'PUT' });
    req.user = { userId: 'p1', role: 'parent' };
    const res = mockRes();
    parentReadOnly(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should allow child any method', () => {
    const req = mockReq({ method: 'POST' });
    req.user = { userId: 'c1', role: 'child' };
    const res = mockRes();
    parentReadOnly(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
