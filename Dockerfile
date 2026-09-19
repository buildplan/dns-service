# === Build stage: Install dependencies and dumb-init ===
FROM dhi.io/node:26.9.0-alpine3.24-dev@sha256:4624b0b43de9b1808717acf82eb3d19f854dbfd15729fdc7f37273e694672873 AS builder

WORKDIR /usr/src/app

# Install dumb-init for process management
RUN apk add --no-cache dumb-init

# Install Dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy App Code
COPY . .

# === Final stage: Create minimal runtime image ===
FROM dhi.io/node:26.9.0-alpine3.24@sha256:ea203af2ac7553aa6c1da76d4888aff304f1b4fadd9ec7c8d120bfeb5e65dabe

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
