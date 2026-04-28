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
    logger.error('Failed to send WhatsApp message', {
      to: maskPhone(phone),
      status: err.response?.status,
      error: err.response?.data?.error?.message ?? err.message,
    });
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
    logger.error('Failed to send escalation alert', {
      status: err.response?.status,
      error: err.response?.data?.error?.message ?? err.message,
    });
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
    // Non-critical — log and continue
    logger.warn('Could not mark message as read', {
      messageId,
      error: err.response?.data?.error?.message ?? err.message,
    });
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
