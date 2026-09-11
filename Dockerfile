# ════════════════════════════════════════════════════════════════════════
#  VenuePlatform — Multi-stage Production Dockerfile
#
#  Stack    : pnpm 11.5.0 · Turborepo 2 · @venue/core-3d · Next.js 14
#  Runtime  : node:22-alpine (LTS)
#
#  Build stages
#  ────────────
#  base      Node + Alpine + pnpm — shared by all stages
#  deps      Copy manifests only → frozen pnpm install (layer-cache safe)
#  builder   Full source copy → turbo build (core-3d then web, in order)
#  runner    Minimal production image — non-root user, Next.js server only
#
#  Usage
#  ─────
#  docker build -t venue-platform .
#  docker run -p 3000:3000 venue-platform
# ════════════════════════════════════════════════════════════════════════


# ── Stage 1: base ──────────────────────────────────────────────────────
# Shared Alpine + Node 22 foundation (required by pnpm 11.5).
# libc6-compat resolves musl / glibc compatibility for native bindings
# (PlayCanvas and any future canvas-native modules may require it).
FROM node:22-alpine AS base

RUN apk add --no-cache libc6-compat

# Activate the exact pnpm version declared in root package.json
# `corepack prepare` downloads & caches the binary at image build time,
# so container startup never blocks on a network fetch.
RUN corepack enable && \
    corepack prepare pnpm@11.5.0 --activate

WORKDIR /app


# ── Stage 2: deps — workspace-isolated dependency installation ─────────
# Copy only the manifest + lock files first.
# Docker will cache this layer independently of source changes, so a
# code-only edit never triggers a full `pnpm install` re-run.
FROM base AS deps

# Root workspace manifests
COPY package.json          ./
COPY pnpm-lock.yaml        ./
COPY pnpm-workspace.yaml   ./
COPY turbo.json            ./

# Workspace package manifests (source code excluded)
COPY packages/core-3d/package.json  ./packages/core-3d/package.json
COPY apps/web/package.json          ./apps/web/package.json

# --frozen-lockfile: rejects any lock-file drift → reproducible installs
# --prefer-offline:  uses the pnpm content-addressable cache store first
RUN pnpm install --frozen-lockfile --prefer-offline --ignore-scripts


# ── Stage 3: builder — compile the full production artefact tree ────────
FROM base AS builder

WORKDIR /app

# ── Inherit the fully-populated pnpm virtual store from deps stage ──────
# Copying node_modules separately per package preserves the pnpm symlink
# graph that `transpilePackages: ['@venue/core-3d']` relies on.
COPY --from=deps /app/node_modules                    ./node_modules
COPY --from=deps /app/packages/core-3d/node_modules   ./packages/core-3d/node_modules
COPY --from=deps /app/apps/web/node_modules           ./apps/web/node_modules

# ── Full source tree (node_modules excluded via .dockerignore) ──────────
COPY . .

# ── Build pipeline ──────────────────────────────────────────────────────
# Turborepo reads turbo.json: `"build": { "dependsOn": ["^build"] }`
#   1. packages/core-3d:build → tsc → dist/index.js + dist/index.d.ts
#   2. apps/web:build          → next build → .next/
#
# This ordering guarantees @venue/core-3d type declarations are present
# when Next.js resolves `transpilePackages` during its webpack pass.
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm run build


# ── Stage 4: runner — minimal production image ─────────────────────────
# Re-derives from the clean base (no build toolchain, no source files).
# Only the artefacts required by `next start` are copied in.
FROM node:22-alpine AS runner

RUN apk add --no-cache libc6-compat
RUN corepack enable && \
    corepack prepare pnpm@11.5.0 --activate

WORKDIR /app

# ── Baked environment variables ─────────────────────────────────────────
# Override individual values via docker-compose `environment:` blocks or
# `--env-file` flags without rebuilding the image layer.
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# V8 old-generation heap ceiling. Free Render plans have ~512 MB RAM —
# keep the heap under that so the process isn't OOM-killed at boot.
ENV NODE_OPTIONS=--max-old-space-size=384

# ── Non-root user — defence-in-depth for production workloads ───────────
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# ── Production artefacts — only what `next start` requires ───────────────
#
# pnpm virtual store (root)
#   The .pnpm content-addressable store + workspace symlink graph must be
#   present so that `require('@venue/core-3d')` resolves at runtime.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules                    ./node_modules

# @venue/core-3d runtime package
#   `dist/` contains the compiled JS + type declarations.
#   `package.json` carries the `exports` map read by the module resolver.
#   `node_modules/` provides playcanvas and tsc runtime deps.
COPY --from=builder --chown=nextjs:nodejs /app/packages/core-3d/node_modules   ./packages/core-3d/node_modules
COPY --from=builder --chown=nextjs:nodejs /app/packages/core-3d/dist           ./packages/core-3d/dist
COPY --from=builder --chown=nextjs:nodejs /app/packages/core-3d/package.json   ./packages/core-3d/package.json

# Next.js frontend artefacts
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/node_modules           ./apps/web/node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next                  ./apps/web/.next
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public                 ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/next.config.js         ./apps/web/next.config.js
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/package.json           ./apps/web/package.json

# Root workspace manifests — required so pnpm can resolve the symlink
# graph and so scripts invoked via `pnpm start` resolve correctly.
COPY --from=builder --chown=nextjs:nodejs /app/package.json                    ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/pnpm-workspace.yaml             ./pnpm-workspace.yaml

# ── Switch to non-root user before exposing the port ────────────────────
USER nextjs

# Change working directory to the Next.js app so `pnpm start` resolves
# `next start` from apps/web/node_modules/.bin correctly.
WORKDIR /app/apps/web

EXPOSE 3000

# `pnpm start` runs `next start` as declared in apps/web/package.json
CMD ["pnpm", "start"]
