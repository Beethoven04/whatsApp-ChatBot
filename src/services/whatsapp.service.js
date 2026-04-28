/**
 * HOW TO GET A PERMANENT WHATSAPP TOKEN
 * --------------------------------------
 * Temporary tokens (from the API Setup page) expire every 24 hours.
 * To get a permanent token:
 *
 * 1. Go to business.facebook.com → Settings → System Users
 * 2. Create a System User (or use an existing one) with ADMIN role
 * 3. Click "Add Assets" → select your WhatsApp Business Account → grant FULL CONTROL
 * 4. Click "Generate New Token" on that System User
 * 5. Select your App, set token expiry to "Never"
 * 6. Grant permissions: whatsapp_business_messaging, whatsapp_business_management
 * 7. Copy the token and set it as WHATSAPP_TOKEN in Railway environment variables
 *
 * Reference: https://developers.facebook.com/docs/whatsapp/business-management-api/get-started
 */

import axios from 'axios';
import logger from '../utils/logger.js';
import { maskPhone } from '../utils/messageParser.js';

const BASE_URL = 'https://graph.facebook.com/v19.0';

/**
 * Sends a plain text WhatsApp message via Meta Cloud API.
 * @param {string} phone   - Recipient phone number (with country code, no +)
 * @param {string} text    - Message body (max 4096 chars)
 * @returns {Promise<void>}
 */
export async function sendMessage(phone, text) {
  try {
    await axios.post(
      `${BASE_URL}/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'text',
        text: { body: text },
      },
      { headers: buildHeaders() }
    );

    logger.info('Message sent', { to: maskPhone(phone) });
  } catch (err) {
    logApiError('Failed to send WhatsApp message', err, { to: maskPhone(phone) });
  }
}

/**
 * Sends a formatted escalation alert to the manager's WhatsApp number.
 * @param {string} customerPhone  - Customer's phone number
 * @param {string} customerName   - Customer's display name
 * @param {string} customerMsg    - The original message that triggered escalation
 * @param {string} reason         - Why escalation was triggered
 * @returns {Promise<void>}
 */
export async function sendEscalationAlert(customerPhone, customerName, customerMsg, reason) {
  const managerPhone = process.env.MANAGER_PHONE;
  if (!managerPhone) {
    logger.warn('MANAGER_PHONE not set — escalation alert skipped');
    return;
  }

  const alert = [
    `🚨 *Escalation Alert*`,
    ``,
    `👤 Customer: ${customerName} (${maskPhone(customerPhone)})`,
    `💬 Message: "${customerMsg.slice(0, 200)}"`,
    `⚠️ Reason: ${reason}`,
    ``,
    `Please follow up directly with the customer.`,
  ].join('\n');

  try {
    await axios.post(
      `${BASE_URL}/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: managerPhone,
        type: 'text',
        text: { body: alert },
      },
      { headers: buildHeaders() }
    );

    logger.info('Escalation alert sent to manager');
  } catch (err) {
    logApiError('Failed to send escalation alert', err);
  }
}

/**
 * Marks a received message as read (shows double blue tick to customer).
 * @param {string} messageId - The WhatsApp message ID (wamid.*)
 * @returns {Promise<void>}
 */
export async function markAsRead(messageId) {
  try {
    await axios.post(
      `${BASE_URL}/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      },
      { headers: buildHeaders() }
    );
  } catch (err) {
    // Non-critical — never block the main reply flow
    logApiError('Could not mark message as read (non-critical)', err, { messageId }, 'warn');
  }
}

/**
 * Builds the Authorization header for all Meta API requests.
 * @returns {Object}
 */
function buildHeaders() {
  return {
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Logs a Meta API error with a clear TOKEN_EXPIRED message on 401.
 * @param {string} context
 * @param {Error} err
 * @param {Object} [extra]
 * @param {'error'|'warn'} [level]
 */
function logApiError(context, err, extra = {}, level = 'error') {
  const status = err.response?.status;
  const message = err.response?.data?.error?.message ?? err.message;

  if (status === 401) {
    logger[level](`${context} — TOKEN_EXPIRED: regenerate WHATSAPP_TOKEN at developers.facebook.com`, {
      ...extra,
      status,
    });
    return;
  }

  logger[level](context, { ...extra, status, error: message });
}
