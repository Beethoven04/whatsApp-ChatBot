import express from 'express';
import helmet from 'helmet';
import webhookRouter from './routes/webhook.routes.js';
import logger from './utils/logger.js';

const app = express();

// Required for express-rate-limit to read the real client IP behind Railway's proxy.
// Without this, rate-limit throws a ValidationError about X-Forwarded-For.
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// Parse JSON and capture rawBody for signature verification
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Root health check — Railway's default healthcheck hits /
app.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Extended health check with uptime
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Main webhook route
app.use('/webhook', webhookRouter);

// Catch-all 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler — last resort, should rarely be reached
app.use((err, _req, res, _next) => {
  logger.error('Unhandled Express error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
