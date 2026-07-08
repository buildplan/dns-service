# === Build stage: Install dependencies and dumb-init ===
FROM dhi.io/node:26.4.0-alpine3.24-dev@sha256:6049c9bf9906b19c05596189887b19905471a0a88d555fc76db55ff23ee79a5a AS builder

WORKDIR /usr/src/app

# Install dumb-init for process management
RUN apk add --no-cache dumb-init

# Install Dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy App Code
COPY . .

# === Final stage: Create minimal runtime image ===
FROM dhi.io/node:26.4.0-alpine3.24@sha256:fedb4f426b8fcc707e5186f886ff6bfe2f589fc4eaf6da5b4632e51beb3a4b8f

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
