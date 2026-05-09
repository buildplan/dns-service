# === Build stage: Install dependencies and dumb-init ===
FROM dhi.io/node:25.9.0-alpine3.23-dev@sha256:874a0bb5a24d035059438bcf714ef6623c6b8f9cbe8bb9d10af6bdee07018bf8 AS builder

WORKDIR /usr/src/app

# Install dumb-init for process management
RUN apk add --no-cache dumb-init

# Install Dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy App Code
COPY . .

# === Final stage: Create minimal runtime image ===
FROM dhi.io/node:25.9.0-alpine3.23@sha256:b848ee0cb2aa4681fa24060283558f4286b412062c1cd512c25c20b0dcf6098f

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
