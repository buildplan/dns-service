# === Build stage: Install dependencies and dumb-init ===
FROM dhi.io/node:26.13.0-alpine3.24-dev@sha256:4f971dcdc1fdf59f9d3e84dbd529690c2d15f75ae898fb310acad9c12d7bbdf9 AS builder

WORKDIR /usr/src/app

# Install dumb-init for process management
RUN apk add --no-cache dumb-init

# Install Dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy App Code
COPY . .

# === Final stage: Create minimal runtime image ===
FROM dhi.io/node:26.13.0-alpine3.24@sha256:016ab5fb31bc219dc1e73a0dcab4ace4e400ce1cbaf5d36fb93cca9e9fb8c26b

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
