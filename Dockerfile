# === Build stage: Install dependencies and dumb-init ===
FROM dhi.io/node:26.13.1-alpine3.24-dev@sha256:16375cc385b69dbd63d19603d5ba671493294b4cd4d0e3d8132abb0562e29db5 AS builder

WORKDIR /usr/src/app

# Install dumb-init for process management
RUN apk add --no-cache dumb-init

# Install Dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy App Code
COPY . .

# === Final stage: Create minimal runtime image ===
FROM dhi.io/node:26.13.1-alpine3.24@sha256:f7b40a7a5e3b75dafd68687f9f5cd4989a2ca02a5004e03147596e7bf8653acc

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
