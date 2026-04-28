import crypto from 'crypto';
import logger from '../utils/logger.js';

/**
 * Verifies the X-Hub-Signature-256 header sent by Meta on every webhook POST.
 * Rejects requests with invalid or missing signatures with HTTP 403.
 *
 * Requires the raw request body — must be used BEFORE express.json() parses
 * the body (or alongside a rawBody option). The app uses express.json() with
 * a `verify` callback to capture the raw buffer.
 */
export function verifyWebhookSignature(req, res, next) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  // Skip verification outside production when no app secret is configured
  if (!appSecret) {
    if (process.env.NODE_ENV !== 'production') {
      logger.warn('WHATSAPP_APP_SECRET not set — skipping signature check (dev/test only)');
      return next();
    }
    logger.error('WHATSAPP_APP_SECRET not configured in production');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    logger.warn('Webhook request missing signature header');
    return res.status(403).json({ error: 'Missing signature' });
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    logger.error('rawBody not available — ensure express.json verify callback is set');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  const expected = `sha256=${crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex')}`;

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);

  // timingSafeEqual throws RangeError if buffers differ in length
  const valid =
    sigBuf.length === expBuf.length &&
    crypto.timingSafeEqual(sigBuf, expBuf);

  if (!valid) {
    logger.warn('Webhook signature mismatch — request rejected');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  next();
}
