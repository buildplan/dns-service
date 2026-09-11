# === Build stage: Install dependencies and dumb-init ===
FROM dhi.io/node:26.8.2-alpine3.24-dev@sha256:cea4c075ea20a9db7794cee6cea8e7f33f876e94cfe892503faa2b3f910b06f1 AS builder

WORKDIR /usr/src/app

# Install dumb-init for process management
RUN apk add --no-cache dumb-init

# Install Dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy App Code
COPY . .

# === Final stage: Create minimal runtime image ===
FROM dhi.io/node:26.8.2-alpine3.24@sha256:124cc04806f1218017dd44950907d996b1ff22ca7b7780ceb4ef63d3546f8a00

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
