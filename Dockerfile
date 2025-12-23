# 1. Use the latest Node LTS Alpine image
FROM node:24-alpine

# 2. Add dumb-init for process management
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
WORKDIR /app

# 3. Optimize permissions
RUN chown -R node:node /app

# Switch to non-root user
USER node

# 4. Install Dependencies
COPY --chown=node:node package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# 5. Copy App Code
COPY --chown=node:node . .

# 6. Expose Port 5000 (DNS Service)
EXPOSE 5000

# 7. Start
CMD ["dumb-init", "node", "server.js"]
