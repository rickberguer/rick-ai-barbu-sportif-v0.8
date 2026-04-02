# ============================================
# BarbuSportif AI - Dockerfile for Cloud Run
# Multi-stage build optimized for production
# ============================================

# ---- Stage 1: Install dependencies ----
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 1. MODIFICACIÓN: Evitar que Puppeteer descargue su propio Chromium (pesa más de 100MB extra)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package.json pnpm-lock.yaml* ./
RUN corepack enable pnpm && pnpm install 

# ---- Stage 2: Build the application ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects anonymous telemetry - disable it
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable pnpm && pnpm run build

# ---- Stage 3: Production runner ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 2. MODIFICACIÓN: Instalar Chromium y las dependencias gráficas/fuentes de Alpine
# (Debe ir antes de cambiar al usuario nextjs, ya que requiere permisos de root)
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont

# 3. MODIFICACIÓN: Variable de entorno para que Puppeteer sepa dónde está Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Copy the standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

# Cloud Run uses PORT env var (default 8080)
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"
EXPOSE 8080

# Start the Next.js server
CMD ["node", "server.js"]