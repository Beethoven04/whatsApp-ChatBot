import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';

/**
 * Limits each IP to 30 requests per minute.
 * Returns HTTP 429 with a JSON body when the limit is exceeded.
 */
export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', { ip: req.ip });
    res.status(429).json({ error: 'Too many requests, please slow down.' });
  },
});
