# === Build stage: Install dependencies and dumb-init ===
FROM dhi.io/node:26.5.0-alpine3.24-dev@sha256:2bd8f9c157cbe94be82fe27f2f5bc1a2ff94319ad0217a2915334bddc3688728 AS builder

WORKDIR /usr/src/app

# Install dumb-init for process management
RUN apk add --no-cache dumb-init

# Install Dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy App Code
COPY . .

# === Final stage: Create minimal runtime image ===
FROM dhi.io/node:26.5.0-alpine3.24@sha256:0d49cc0a4ae6adcdb2e85d998818feccb288c776a5524e98780d18a65980f887

ENV NODE_ENV=production
ENV PATH=/app/node_modules/.bin:$PATH

# Copy dumb-init from builder
COPY --from=builder /usr/bin/dumb-init /usr/bin/dumb-init

# Copy application with dependencies from builder
COPY --from=builder --chown=node:node /usr/src/app /app

WORKDIR /app

# Expose Port 5050 (DNS Service)
EXPOSE 5050

# Start with dumb-init for proper signal handling
CMD ["dumb-init", "node", "server.js"]
