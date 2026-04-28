FROM node:20-alpine

# Security: run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy dependency manifests first (layer cache)
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy application source
COPY src/ ./src/
COPY data/ ./data/

# Switch to non-root user
USER appuser

EXPOSE 3000

# Graceful shutdown via SIGTERM is handled in server.js
CMD ["node", "src/server.js"]
