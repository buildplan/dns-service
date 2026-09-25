# === Build stage: Install dependencies and dumb-init ===
FROM dhi.io/node:26.10.0-alpine3.24-dev@sha256:ff2c07e1681b1bcf1747b55ed54b900a327602a37975fb77487e2f795e822dfd AS builder

WORKDIR /usr/src/app

# Install dumb-init for process management
RUN apk add --no-cache dumb-init

# Install Dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy App Code
COPY . .

# === Final stage: Create minimal runtime image ===
FROM dhi.io/node:26.10.0-alpine3.24@sha256:f8d430e62687225dfa5a4b2033da9ca6b34285cb3e5aff6da80fda9e88987d7c

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
