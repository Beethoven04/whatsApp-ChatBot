import axios from 'axios';
import logger from '../utils/logger.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'meta-llama/llama-3.3-70b-instruct:free';

const SYSTEM_PROMPT = `You are a WhatsApp customer support agent for a fashion store.
Answer ONLY from the product data provided in the user message.
Never invent prices, sizes, colors, or availability.
If you cannot answer from the provided data, set needs_escalation to true.

You MUST always respond with valid JSON in exactly this format:
{
  "intent": "product_question|shipping|returns|greeting|escalate|other",
  "reply": "Your WhatsApp-friendly reply here (max 300 chars, use emojis 😊)",
  "needs_escalation": false,
  "escalation_reason": ""
}

Rules:
- "reply" must be under 300 characters
- Use friendly WhatsApp-style language with relevant emojis
- For greetings: introduce yourself as the store's virtual assistant
- For product questions: mention price, availability, and key details
- If the item is out of stock, say so clearly and offer alternatives`;

/**
 * Calls the OpenRouter API and returns a parsed AI response object.
 *
 * On 429 (rate limit): escalates immediately — waiting 60s blocks the customer
 * for no good reason on a free-tier model. Instant escalation is better UX.
 *
 * @param {string} customerMessage - The raw message from the customer
 * @param {Array<Object>} products  - Matched products from the product service
 * @returns {Promise<{ intent: string, reply: string, needs_escalation: boolean, escalation_reason: string }>}
 */
export async function getAIResponse(customerMessage, products) {
  // Limit product context to top 5 matches to keep the prompt small and fast
  const topProducts = products.slice(0, 5);
  const productContext =
    topProducts.length > 0
      ? JSON.stringify(topProducts, null, 2)
      : 'No matching products found in the catalog.';

  const userContent = `Customer message: "${customerMessage}"

Relevant product data:
${productContext}`;

  try {
    return await callOpenRouter(userContent);
  } catch (err) {
    const status = err.response?.status;

    if (status === 429) {
      // Rate limited — escalate immediately rather than making customer wait
      logger.warn('OpenRouter rate limited — escalating immediately (check OPENROUTER_API_KEY in Railway)');
      return escalationFallback('OpenRouter rate limit — check your API key and free-tier quota');
    }

    if (status === 401 || status === 403) {
      logger.error('OpenRouter auth failed — OPENROUTER_API_KEY is invalid or expired');
      return escalationFallback('OpenRouter API key invalid — update OPENROUTER_API_KEY in Railway Variables');
    }

    // Network error, timeout, or unexpected status
    logger.error('OpenRouter call failed', { status, message: err.message });
    return escalationFallback(`AI service error: ${err.message}`);
  }
}

/**
 * Makes the HTTP request to OpenRouter and parses the JSON response.
 * @param {string} userContent
 * @returns {Promise<Object>}
 */
async function callOpenRouter(userContent) {
  const response = await axios.post(
    OPENROUTER_URL,
    {
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 400,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://whatsapp-chatbot-production-0171.up.railway.app',
        'X-Title': 'Fashion Store WhatsApp Bot',
      },
      timeout: 30_000,
    }
  );

  const raw = response.data?.choices?.[0]?.message?.content ?? '';
  return parseAIResponse(raw);
}

/**
 * Extracts and validates the JSON object from the AI response string.
 * Falls back to an escalation response if parsing fails.
 * @param {string} raw
 * @returns {{ intent: string, reply: string, needs_escalation: boolean, escalation_reason: string }}
 */
function parseAIResponse(raw) {
  // Strip markdown code fences if present
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  // Extract first JSON object from response
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    logger.warn('AI returned non-JSON response, escalating', { raw: raw.slice(0, 200) });
    return escalationFallback('AI returned an unstructured response');
  }

  try {
    const parsed = JSON.parse(match[0]);

    return {
      intent: String(parsed.intent || 'other'),
      reply: String(parsed.reply || '').slice(0, 300),
      needs_escalation: Boolean(parsed.needs_escalation),
      escalation_reason: String(parsed.escalation_reason || ''),
    };
  } catch {
    logger.warn('Failed to parse AI JSON, escalating', { raw: raw.slice(0, 200) });
    return escalationFallback('AI returned malformed JSON');
  }
}

/**
 * Returns a safe escalation object when AI parsing fails.
 * @param {string} reason
 */
function escalationFallback(reason) {
  return {
    intent: 'escalate',
    reply: "I'm having trouble understanding your request right now. A team member will follow up shortly! 🙏",
    needs_escalation: true,
    escalation_reason: reason,
  };
}

