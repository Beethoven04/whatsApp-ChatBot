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
  // express-rate-limit v7 throws a hard ValidationError (not an Express error)
  // when X-Forwarded-For is present and its own proxy checks don't pass.
  // Disabling this specific check here — proxy trust is already handled by
  // app.set('trust proxy', 1) in app.js.
  validate: { xForwardedForHeader: false },
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', { ip: req.ip });
    res.status(429).json({ error: 'Too many requests, please slow down.' });
  },
});
