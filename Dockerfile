# === Build stage: Install dependencies and dumb-init ===
FROM dhi.io/node:26.5.0-alpine3.24-dev@sha256:4b9a4d120a14c1c01b21fe82cddc6031c17e1907a521521dbeeb3b2d8178aa34 AS builder

WORKDIR /usr/src/app

# Install dumb-init for process management
RUN apk add --no-cache dumb-init

# Install Dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy App Code
COPY . .

# === Final stage: Create minimal runtime image ===
FROM dhi.io/node:26.5.0-alpine3.24@sha256:bc2fb801857894e7e4acf1b564dd19e869e6662009f0ce6dc179f16fd28ca158

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
