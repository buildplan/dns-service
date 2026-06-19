# === Build stage: Install dependencies and dumb-init ===
FROM dhi.io/node:26.3.1-alpine3.24-dev@sha256:df3d2356c5c3f5dd3f488f0e2402b355fc80ce75dab8a1de37267a43ddd71117 AS builder

WORKDIR /usr/src/app

# Install dumb-init for process management
RUN apk add --no-cache dumb-init

# Install Dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy App Code
COPY . .

# === Final stage: Create minimal runtime image ===
FROM dhi.io/node:26.3.1-alpine3.24@sha256:4a155cf39f2af9ea0becf88dd095c04187841489f0291c4e24318d206dc3875a

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
