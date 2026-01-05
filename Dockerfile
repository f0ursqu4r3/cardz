# Build stage for frontend
FROM oven/bun:1 AS frontend-builder
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source files
COPY . .

# Build frontend
RUN bun run build-only

# Production stage
FROM oven/bun:1-slim AS production
WORKDIR /app

# Install curl for healthcheck (optional, Railway doesn't require it)
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy server package files
COPY server-src/package.json ./server-src/
COPY shared/ ./shared/

# Install server dependencies
WORKDIR /app/server-src
RUN bun install --production

# Copy server source
COPY server-src/ ./

# Copy built frontend to serve statically (optional, if serving from same container)
WORKDIR /app
COPY --from=frontend-builder /app/dist ./dist

# Create data directory for persistence
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
# PORT will be set by Railway, default to 9001 for local testing
ENV PORT=9001

# Expose the port (Railway uses PORT env var, this is just documentation)
EXPOSE $PORT

# Health check (Railway has its own healthcheck, this is for local Docker)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

# Start the server
WORKDIR /app/server-src
CMD ["bun", "run", "index.ts"]
