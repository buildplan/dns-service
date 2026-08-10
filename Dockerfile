# === Build stage: Install dependencies and dumb-init ===
FROM dhi.io/node:26.7.0-alpine3.24-dev@sha256:1ed5bee8f37bcf640b4487a04c45f4adb411d40d36909a2a4439afce47dc5566 AS builder

WORKDIR /usr/src/app

# Install dumb-init for process management
RUN apk add --no-cache dumb-init

# Install Dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy App Code
COPY . .

# === Final stage: Create minimal runtime image ===
FROM dhi.io/node:26.7.0-alpine3.24@sha256:c46d92ba5c7fb4b64e50a43e1a77ed009bce7db1de39397123e2df3ededed04d

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
