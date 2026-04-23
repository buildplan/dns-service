# === Build stage: Install dependencies and dumb-init ===
FROM dhi.io/node:25.9.0-alpine3.23-dev@sha256:4bd7e0e3b935a1570270ff610458baeed572e4fa26f1bd8a175c35f8bb55bcfe AS builder

WORKDIR /usr/src/app

# Install dumb-init for process management
RUN apk add --no-cache dumb-init

# Install Dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy App Code
COPY . .

# === Final stage: Create minimal runtime image ===
FROM dhi.io/node:25.9.0-alpine3.23@sha256:cf8572c898852b048975b1eab70b1bcdaef1d6f544b6495499b5dbb3f0021b40

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
