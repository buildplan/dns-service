# === Build stage: Install dependencies and dumb-init ===
FROM dhi.io/node:26.3.0-alpine3.23-dev@sha256:434d03b43e7fcc7009e26c755de67e311448a6022402e0973cf0e077ce8b658b AS builder

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
