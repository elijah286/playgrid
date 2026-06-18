# syntax=docker/dockerfile:1.7

# Multi-stage build for Next.js 16 standalone output, targeting Cloud Run.
# - deps:    install all dependencies (cached layer)
# - builder: run `next build` to produce .next/standalone
# - runner:  minimal runtime image, non-root user, listens on $PORT

ARG NODE_VERSION=20-alpine

# ---------- deps ----------
FROM node:${NODE_VERSION} AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- builder ----------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle at build time,
# so they must be present as build args. Pass via --build-arg in CI.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_BILLING_ENABLED
# Per-deploy build id (commit SHA) — drives the native resume-reload check.
ARG NEXT_PUBLIC_BUILD_ID

# Sentry source-map upload is build-time only and self-disables if the
# auth token is absent (see next.config.ts sourcemaps.disable).
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_ORG
ARG SENTRY_PROJECT

ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_BILLING_ENABLED=$NEXT_PUBLIC_BILLING_ENABLED \
    NEXT_PUBLIC_BUILD_ID=$NEXT_PUBLIC_BUILD_ID \
    SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN \
    SENTRY_ORG=$SENTRY_ORG \
    SENTRY_PROJECT=$SENTRY_PROJECT \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ---------- runner ----------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S -g 1001 nodejs && adduser -S -G nodejs -u 1001 nextjs

# Standalone bundle contains server.js + traced node_modules.
# Do NOT run `npm install` after this COPY — it overwrites the traced
# node_modules and breaks Sentry instrumentation (import-in-the-middle
# is bundled by reference, not in the standalone package.json).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 8080

CMD ["node", "server.js"]
