import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export type UserRole = 'child' | 'parent';

export interface JwtPayload {
  userId: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'k12-ai-dev-secret';

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>, expiresInSeconds = 86400): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: expiresInSeconds });
}

/**
 * JWT authentication middleware.
 * Extracts and verifies the Bearer token from the Authorization header.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Role-based authorization middleware.
 * Restricts access to specified roles.
 */
export function authorize(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

/**
 * Parent read-only middleware.
 * Parents can only perform GET requests on the routes this is applied to.
 * Requirement 26.2: 家长只读权限
 */
export function parentReadOnly(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role === 'parent' && req.method !== 'GET') {
    res.status(403).json({ error: 'Parent role has read-only access' });
    return;
  }
  next();
}
