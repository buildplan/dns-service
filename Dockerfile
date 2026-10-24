# === Build stage: Install dependencies and dumb-init ===
FROM dhi.io/node:26.12.1-alpine3.24-dev@sha256:c870cbe703c1fd8d3200d33d14b7bafe310423728759b14c002558010b3ca9cb AS builder

WORKDIR /usr/src/app

# Install dumb-init for process management
RUN apk add --no-cache dumb-init

# Install Dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy App Code
COPY . .

# === Final stage: Create minimal runtime image ===
FROM dhi.io/node:26.12.1-alpine3.24@sha256:f175282a7d1e2091c557a5de17c2fa2e70cd81a950f4234436ffd91af7ad78f1

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
