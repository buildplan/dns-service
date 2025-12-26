# Use Docker Hardened Image for Node.js 24
FROM dhi.io/node:20-alpine3.22

ENV NODE_ENV=production
WORKDIR /home/node/app

# Install Dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy App Code
COPY . .

# Expose Port 5000 (DNS Service)
EXPOSE 5000

# Start application
CMD ["node", "server.js"]
