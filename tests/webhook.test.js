import request from 'supertest';
import app from '../src/app.js';
import { parseIncomingMessage, maskPhone, sanitizeInput } from '../src/utils/messageParser.js';
import { searchProducts, getProductById, getAllProducts } from '../src/services/product.service.js';

// ─── messageParser utils ──────────────────────────────────────────────────────

describe('parseIncomingMessage', () => {
  const makeBody = (overrides = {}) => ({
    entry: [{
      changes: [{
        value: {
          messages: [{ type: 'text', from: '12125551234', id: 'wamid.abc', text: { body: 'Hello' }, ...overrides.message }],
          contacts: [{ profile: { name: 'Alice' } }],
          ...overrides.value,
        },
      }],
    }],
  });

  test('parses a valid text message', () => {
    const result = parseIncomingMessage(makeBody());
    expect(result).toMatchObject({ phone: '12125551234', name: 'Alice', text: 'Hello', messageId: 'wamid.abc' });
  });

  test('returns null for status update (no messages array)', () => {
    const body = { entry: [{ changes: [{ value: { statuses: [{}] } }] }] };
    expect(parseIncomingMessage(body)).toBeNull();
  });

  test('returns null for non-text message types', () => {
    expect(parseIncomingMessage(makeBody({ message: { type: 'image' } }))).toBeNull();
  });

  test('returns null for malformed body', () => {
    expect(parseIncomingMessage(null)).toBeNull();
    expect(parseIncomingMessage({})).toBeNull();
  });

  test('falls back to "Customer" when contact name is missing', () => {
    const body = makeBody();
    body.entry[0].changes[0].value.contacts = [];
    const result = parseIncomingMessage(body);
    expect(result?.name).toBe('Customer');
  });
});

describe('maskPhone', () => {
  test('masks all but last 4 digits', () => {
    expect(maskPhone('12125551234')).toBe('****1234');
  });

  test('handles short strings safely', () => {
    expect(maskPhone('12')).toBe('****');
    expect(maskPhone('')).toBe('****');
  });
});

describe('sanitizeInput', () => {
  test('trims whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
  });

  test('respects maxLength', () => {
    const long = 'a'.repeat(2000);
    expect(sanitizeInput(long, 100).length).toBe(100);
  });

  test('returns empty string for non-strings', () => {
    expect(sanitizeInput(null)).toBe('');
    expect(sanitizeInput(42)).toBe('');
  });
});

// ─── productService ───────────────────────────────────────────────────────────

describe('productService', () => {
  test('getAllProducts returns an array', async () => {
    const products = await getAllProducts();
    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBeGreaterThan(0);
  });

  test('getProductById returns the correct product', async () => {
    const p = await getProductById('M-001');
    expect(p).not.toBeNull();
    expect(p.product_id).toBe('M-001');
  });

  test('getProductById returns null for unknown id', async () => {
    const p = await getProductById('DOES_NOT_EXIST');
    expect(p).toBeNull();
  });

  test('searchProducts finds products by keyword', async () => {
    const results = await searchProducts('linen');
    expect(results.length).toBeGreaterThan(0);
    const names = results.map((p) => p.name.toLowerCase());
    expect(names.some((n) => n.includes('linen'))).toBe(true);
  });

  test('searchProducts returns empty array for no match', async () => {
    const results = await searchProducts('xyznotaproduct99999');
    expect(results).toEqual([]);
  });

  test('searchProducts handles empty/null query', async () => {
    expect(await searchProducts('')).toEqual([]);
    expect(await searchProducts(null)).toEqual([]);
  });

  test('searchProducts ranks better matches first', async () => {
    const results = await searchProducts('casual summer');
    expect(results.length).toBeGreaterThan(0);
  });
});

// ─── webhook GET (Meta verification) ─────────────────────────────────────────

describe('GET /webhook', () => {
  beforeAll(() => {
    process.env.WHATSAPP_VERIFY_TOKEN = 'test_verify_token';
  });

  test('responds with challenge on valid verification', async () => {
    const res = await request(app)
      .get('/webhook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'test_verify_token', 'hub.challenge': 'abc123' });

    expect(res.status).toBe(200);
    expect(res.text).toBe('abc123');
  });

  test('returns 403 when token is wrong', async () => {
    const res = await request(app)
      .get('/webhook')
      .query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': 'abc123' });

    expect(res.status).toBe(403);
  });
});

// ─── webhook POST ─────────────────────────────────────────────────────────────

describe('POST /webhook', () => {
  beforeAll(() => {
    // Skip signature verification in tests (no WHATSAPP_APP_SECRET + not production)
    process.env.NODE_ENV = 'test';
    delete process.env.WHATSAPP_APP_SECRET;
  });

  const validBody = {
    entry: [{
      changes: [{
        value: {
          messages: [{ type: 'text', from: '12125551234', id: 'wamid.test001', text: { body: 'Do you have linen shirts?' } }],
          contacts: [{ profile: { name: 'Bob' } }],
        },
      }],
    }],
  };

  test('returns 200 immediately for a valid message payload', async () => {
    const res = await request(app).post('/webhook').send(validBody);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('returns 200 for status-update payloads (no messages)', async () => {
    const statusBody = { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.x', status: 'delivered' }] } }] }] };
    const res = await request(app).post('/webhook').send(statusBody);
    expect(res.status).toBe(200);
  });

  test('returns 200 for empty body', async () => {
    const res = await request(app).post('/webhook').send({});
    expect(res.status).toBe(200);
  });
});

// ─── health check ─────────────────────────────────────────────────────────────

describe('GET /health', () => {
  test('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
  });
});
