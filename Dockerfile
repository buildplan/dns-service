# === Build stage: Install dependencies and dumb-init ===
FROM dhi.io/node:26.5.1-alpine3.24-dev@sha256:3fe65246872bb2eabd5cb5957f6081358403621ea438d565a11ae91c6564d1ac AS builder

WORKDIR /usr/src/app

# Install dumb-init for process management
RUN apk add --no-cache dumb-init

# Install Dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy App Code
COPY . .

# === Final stage: Create minimal runtime image ===
FROM dhi.io/node:26.5.1-alpine3.24@sha256:d4eebee600282f49e6b13f9421bf3305b677e72baa797f933f2cf8f7e58fe5a2

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
