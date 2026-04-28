import app from './app.js';
import logger from './utils/logger.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

// Validate required env variables and log any missing ones on startup
const REQUIRED_VARS = [
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_ID',
  'WHATSAPP_VERIFY_TOKEN',
  'OPENROUTER_API_KEY',
  'MANAGER_PHONE',
];
const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
if (missing.length) {
  logger.warn(`Missing environment variables: ${missing.join(', ')}`);
}
if (!process.env.WHATSAPP_APP_SECRET) {
  logger.warn('WHATSAPP_APP_SECRET not set — webhook signature verification disabled');
}

// Bind to 0.0.0.0 so Railway can reach the server from outside the container
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Fashion Store WhatsApp Bot running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown — lets Railway drain in-flight requests before stopping
const shutdown = (signal) => {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force exit after 10 seconds if still hanging
  setTimeout(() => {
    logger.error('Forced exit after shutdown timeout');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
});
