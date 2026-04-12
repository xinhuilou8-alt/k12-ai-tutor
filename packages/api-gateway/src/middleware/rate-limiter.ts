import rateLimit from 'express-rate-limit';

/**
 * Default API rate limiter.
 * 100 requests per minute per IP.
 */
export const defaultLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

/**
 * Stricter rate limiter for auth endpoints.
 * 20 requests per minute per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth requests, please try again later' },
});
