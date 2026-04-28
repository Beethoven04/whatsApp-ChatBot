import { Router } from 'express';
import { verifyWebhookSignature } from '../middleware/auth.middleware.js';
import { webhookRateLimiter } from '../middleware/rateLimit.middleware.js';
import { parseIncomingMessage, sanitizeInput } from '../utils/messageParser.js';
import { searchProducts } from '../services/product.service.js';
import { getAIResponse } from '../services/ai.service.js';
import { sendMessage, sendEscalationAlert, markAsRead } from '../services/whatsapp.service.js';
import logger from '../utils/logger.js';

const router = Router();

/**
 * GET /webhook
 * Meta's webhook verification handshake.
 * Meta sends hub.mode, hub.verify_token, hub.challenge as query params.
 */
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('Webhook verified by Meta');
    return res.status(200).send(challenge);
  }

  logger.warn('Webhook verification failed', { mode, tokenMatch: token === process.env.WHATSAPP_VERIFY_TOKEN });
  return res.status(403).json({ error: 'Forbidden' });
});

/**
 * POST /webhook
 * Receives all incoming WhatsApp events from Meta.
 * Returns 200 immediately, then processes asynchronously.
 */
router.post('/', webhookRateLimiter, verifyWebhookSignature, (req, res) => {
  // Always ACK to Meta immediately — Meta will retry if we don't respond in time
  res.status(200).json({ status: 'ok' });

  // Process in background — errors must never bubble to the HTTP layer
  handleIncomingEvent(req.body).catch((err) => {
    logger.error('Unhandled error in webhook handler', { error: err.message, stack: err.stack });
  });
});

/**
 * Orchestrates the full message handling pipeline.
 * @param {Object} body - Parsed request body from Meta
 */
async function handleIncomingEvent(body) {
  const parsed = parseIncomingMessage(body);

  if (!parsed) {
    // Status update, reaction, non-text message — silently ignore
    return;
  }

  const { phone, name, text, messageId } = parsed;
  const safeText = sanitizeInput(text);

  logger.info('Incoming message', { name, textLength: safeText.length });

  // Mark as read (fire-and-forget)
  markAsRead(messageId).catch(() => {});

  try {
    // 1. Find relevant products
    const products = await searchProducts(safeText);
    logger.info('Product search', { query: safeText.slice(0, 50), hits: products.length });

    // 2. Get AI response
    const aiResponse = await getAIResponse(safeText, products);
    logger.info('AI response', { intent: aiResponse.intent, needs_escalation: aiResponse.needs_escalation });

    // 3. Handle escalation
    if (aiResponse.needs_escalation) {
      await sendEscalationAlert(
        phone,
        name,
        safeText,
        aiResponse.escalation_reason || 'AI requested escalation'
      );
    }

    // 4. Reply to customer
    await sendMessage(phone, aiResponse.reply);
  } catch (err) {
    logger.error('Pipeline error — escalating to manager', {
      error: err.message,
    });

    // Escalate on any unexpected failure
    await sendEscalationAlert(phone, name, safeText, `System error: ${err.message}`).catch(() => {});

    await sendMessage(
      phone,
      "Sorry, I'm experiencing technical difficulties right now. A team member will reach out to you shortly! 🙏"
    ).catch(() => {});
  }
}

export default router;
