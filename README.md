# Fashion Store WhatsApp AI Chatbot

A production-ready WhatsApp AI chatbot built with Node.js, Meta Cloud API, and OpenRouter (LLaMA 3.3 70B). Answers product questions, handles greetings, and escalates complex issues to a manager.

---

## Architecture

```
Customer WhatsApp
       │
       ▼
Meta Cloud API ──POST──► /webhook
                              │
                    parseIncomingMessage
                              │
                     searchProducts (JSON / Shopify)
                              │
                      getAIResponse (OpenRouter)
                              │
              ┌───────────────┴──────────────┐
              │ needs_escalation=true         │ normal
              ▼                               ▼
  sendEscalationAlert(manager)         sendMessage(customer)
  sendMessage(customer)
```

---

## Quick Start

### 1. Clone & install

```bash
git clone <your-repo>
cd whatsapp-fashion-bot
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

Required variables:

| Variable | Description |
|---|---|
| `WHATSAPP_TOKEN` | Meta access token |
| `WHATSAPP_PHONE_ID` | WhatsApp Phone Number ID |
| `WHATSAPP_VERIFY_TOKEN` | Any secret string for webhook verification |
| `WHATSAPP_APP_SECRET` | App Secret from Meta dashboard (for signature verification) |
| `OPENROUTER_API_KEY` | Your OpenRouter API key |
| `MANAGER_PHONE` | Manager's WhatsApp number (country code, no +) |

### 3. Run locally

```bash
npm run dev
```

### 4. Expose to the internet (for Meta webhook registration)

```bash
npx ngrok http 3000
# Copy the https URL — you'll need it in Step 5
```

### 5. Register the webhook in Meta

1. Go to [developers.facebook.com](https://developers.facebook.com) → Your App → WhatsApp → Configuration
2. Set **Callback URL**: `https://your-ngrok-url/webhook`
3. Set **Verify Token**: same value as `WHATSAPP_VERIFY_TOKEN` in your `.env`
4. Subscribe to the **messages** webhook field
5. Click **Verify and Save**

---

## Deployment on Railway

### First-time setup

```bash
npm install -g @railway/cli
railway login
railway init        # creates a new Railway project
railway up          # deploys from the Dockerfile
```

### Set environment variables

```bash
railway variables set WHATSAPP_TOKEN=your_token
railway variables set WHATSAPP_PHONE_ID=1161539513701346
railway variables set WHATSAPP_VERIFY_TOKEN=your_verify_token
railway variables set WHATSAPP_APP_SECRET=your_app_secret
railway variables set OPENROUTER_API_KEY=sk-or-v1-...
railway variables set MANAGER_PHONE=212777933465
railway variables set NODE_ENV=production
```

Or set them all at once in the Railway dashboard under **Variables**.

### Get your production URL

```bash
railway domain
# Example: https://whatsapp-fashion-bot-production.up.railway.app
```

Update the Meta webhook callback URL to `https://<your-railway-domain>/webhook`.

### Redeploy after changes

```bash
railway up
```

---

## Running Tests

```bash
npm test
```

Tests cover:
- Message parsing (valid, status updates, non-text, malformed)
- Phone masking and input sanitisation
- Product search (keyword matching, ranking, edge cases)
- Webhook GET verification handshake
- Webhook POST returns 200 immediately
- Health check endpoint

---

## Adding Shopify as the Product Source

The product layer is fully isolated in [src/services/product.service.js](src/services/product.service.js). Swapping to Shopify requires **only** changing that file — nothing else in the codebase needs to change.

See the detailed migration comment at the top of that file. The summary:

1. Install `@shopify/shopify-api`
2. Call `GET /admin/api/2024-01/products.json` in `getAllProducts()`
3. Map Shopify fields to the existing shape (`name`, `category`, `price`, `sizes`, `colors`, `material`, `style_tags`, `description`, `in_stock`, `sku`)
4. Add a Redis or in-memory cache so every message doesn't trigger a Shopify API call

---

## Project Structure

```
/src
  /services
    whatsapp.service.js   — Meta Cloud API calls
    ai.service.js         — OpenRouter / LLaMA calls
    product.service.js    — Data layer (swap this for Shopify)
  /middleware
    auth.middleware.js    — Webhook signature verification
    rateLimit.middleware.js
  /routes
    webhook.routes.js     — GET (verification) + POST (events)
  /utils
    logger.js             — Winston structured logging
    messageParser.js      — Meta payload parsing + sanitisation
  app.js                  — Express app setup
  server.js               — HTTP server + graceful shutdown
/data
  products.json           — 20-product fashion catalog
/tests
  webhook.test.js         — Jest test suite
.env.example
Dockerfile
railway.toml
```

---

## Security Notes

- All POST requests are signature-verified via `X-Hub-Signature-256`
- Rate limited to 30 req/min per IP
- Phone numbers are masked in all logs
- Tokens and secrets are never logged
- Runs as a non-root user in Docker
- Helmet sets secure HTTP headers
