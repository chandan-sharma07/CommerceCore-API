const rateLimit = require('express-rate-limit');
const AppError = require('../core/AppError');

const isTest = process.env.NODE_ENV === 'test';

/**
 * Strict rate limit for auth routes (login/register).
 * 5 requests per 15 minutes per IP — brute-force protection.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  handler: (req, res, next) => {
    next(new AppError(
      'Too many authentication attempts from this IP, please try again after 15 minutes',
      429,
      'RATE_LIMIT_EXCEEDED'
    ));
  }
});

/**
 * General rate limit for all API routes.
 * 100 requests per 15 minutes per IP.
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  handler: (req, res, next) => {
    next(new AppError(
      'Too many requests from this IP, please try again later',
      429,
      'RATE_LIMIT_EXCEEDED'
    ));
  }
});

module.exports = { authLimiter, generalLimiter };
