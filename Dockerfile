# === Build stage: Install dependencies and dumb-init ===
FROM dhi.io/node:26.2.0-alpine3.23-dev@sha256:88d721c72f82cc1522b4900750bdc7cc7191e73d5b9b5343d8e970ef4a3cf5d1 AS builder

WORKDIR /usr/src/app

# Install dumb-init for process management
RUN apk add --no-cache dumb-init

# Install Dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy App Code
COPY . .

# === Final stage: Create minimal runtime image ===
FROM dhi.io/node:26.3.0-alpine3.23@sha256:06d198004a7b868a1d1931cfe86b9efca6f048d47e7cd4c15784f1fe1f1cc195

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
