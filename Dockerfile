# === Build stage: Install dependencies and dumb-init ===
FROM dhi.io/node:26.5.0-alpine3.24-dev@sha256:7baafaf015c3e137546e0b001fbc2f3f3e0d6de3ad06d1e702fcb744302107e4 AS builder

WORKDIR /usr/src/app

# Install dumb-init for process management
RUN apk add --no-cache dumb-init

# Install Dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy App Code
COPY . .

# === Final stage: Create minimal runtime image ===
FROM dhi.io/node:26.5.0-alpine3.24@sha256:54bbd76f445f53dda9ecc0f303e7f1e31a2c8ea96639fbb138621aeb8ff4d9a4

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
