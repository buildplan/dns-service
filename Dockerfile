# === Build stage: Install dependencies and dumb-init ===
FROM dhi.io/node:26.3.0-alpine3.23-dev@sha256:4e89331fc96781aea69a7586ac687a38ad303e913341c8bb2d152d3081b7b2c1 AS builder

WORKDIR /usr/src/app

# Install dumb-init for process management
RUN apk add --no-cache dumb-init

# Install Dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy App Code
COPY . .

# === Final stage: Create minimal runtime image ===
FROM dhi.io/node:26.3.0-alpine3.23@sha256:bd6ddda904ad7e80d5a6f5ae0bbb964d459fb66f14170bfe82fa4b2ede3022a3

ENV NODE_ENV=production
ENV PATH=/app/node_modules/.bin:$PATH

# Copy dumb-init from builder
COPY --from=builder /usr/bin/dumb-init /usr/bin/dumb-init

# Copy application with dependencies from builder
COPY --from=builder --chown=node:node /usr/src/app /app

WORKDIR /app

# Expose Port 5000 (DNS Service)
EXPOSE 5000

# Start with dumb-init for proper signal handling
CMD ["dumb-init", "node", "server.js"]
