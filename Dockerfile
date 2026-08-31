# === Build stage: Install dependencies and dumb-init ===
FROM dhi.io/node:26.8.1-alpine3.24-dev@sha256:568938d6b7b45704a4bd6b86604bbd3363623d7505875449ba431bb7cd6f0796 AS builder

WORKDIR /usr/src/app

# Install dumb-init for process management
RUN apk add --no-cache dumb-init

# Install Dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy App Code
COPY . .

# === Final stage: Create minimal runtime image ===
FROM dhi.io/node:26.8.1-alpine3.24@sha256:33c8aa3a66d8b227e75e8bec0a8c8a022cfcd96e0732d6e4abdde13e574ba1e7

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
