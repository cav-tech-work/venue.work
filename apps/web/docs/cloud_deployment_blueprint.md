# VenuePlatform — Cloud Deployment Blueprint

**Version:** 1.0  
**Audience:** Infrastructure engineers, DevOps, incoming platform team  
**Last updated:** 2026-06-02  

---

## 1. Architecture Overview

VenuePlatform is split into two independent delivery surfaces:

```
┌─────────────────────────────────────────────────────────────────┐
│                     VERCEL EDGE NETWORK                         │
│  Next.js 14 App Router — apps/web                               │
│  Serverless functions · ISR pages · Static HTML/CSS/JS          │
│  Region: bom1 (Mumbai) · sin1 (Singapore) failover              │
└──────────────────────────┬──────────────────────────────────────┘
                           │  Resolves /assets/* URLs at runtime
                           │  via absolute CDN URLs in venue data
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              AWS CLOUDFRONT DISTRIBUTION (CDN)                  │
│  d{id}.cloudfront.net  →  assets.venueplatform.com              │
│  Origins: S3 bucket (see §3)                                    │
│  Edge locations: India (Mumbai, Chennai, Hyderabad, Delhi)      │
│  + Singapore · Tokyo · Frankfurt · New York                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              AWS S3 BUCKET — venue-platform-assets              │
│  Region: ap-south-1 (Mumbai — lowest latency to Kolkata)        │
│  Contents:                                                      │
│    assets/splats/{venue-id}/capture.ply  (3DGS point clouds)   │
│    assets/splats/{venue-id}/collision.glb (proxy mesh)          │
│    assets/models/{category}/{model-name}.glb (equipment)        │
└─────────────────────────────────────────────────────────────────┘
```

**Why this split?**

Large binary assets (`.ply` captures average 80–400 MB each; `.glb` models 2–50 MB) cannot be served efficiently from Vercel's serverless infrastructure — the platform is built for lightweight HTML, JS, and API responses, not high-throughput binary streaming. Routing heavy assets through Vercel would:

- Exhaust serverless function invocation budgets
- Introduce cold-start latency on every asset request
- Incur disproportionate bandwidth costs at Vercel's edge pricing tier

CloudFront + S3 solves all three: assets are streamed from persistent edge caches, billed at S3/CloudFront data-transfer rates (~$0.008/GB outbound from Mumbai), and cached globally with a single origin request per file per edge PoP.

---

## 2. File Naming & Path Conventions

The Vercel app, SplatEngine, and S3 bucket must share a **single canonical path schema**. Any deviation between layers will cause 404 asset faults in the PlayCanvas WebGL context.

### 2.1 3DGS Point-Cloud Captures (`.ply`)

| Path pattern | Example |
|---|---|
| `assets/splats/{venue-id}/capture.ply` | `assets/splats/venue-001/capture.ply` |
| `assets/splats/{venue-id}/collision.glb` | `assets/splats/venue-001/collision.glb` |

`venue-id` must match the `id` field in `apps/web/src/data/venues.ts` exactly:

```typescript
// venues.ts — ID values that drive all URL resolution
{ id: "venue-001", ... }   // → assets/splats/venue-001/capture.ply
{ id: "venue-002", ... }   // → assets/splats/venue-002/capture.ply
{ id: "venue-003", ... }   // → assets/splats/venue-003/capture.ply
```

### 2.2 Injectable Equipment Models (`.glb`)

| Path pattern | Example |
|---|---|
| `assets/models/technical/{name}.glb` | `assets/models/technical/db-audiotechnik-v.glb` |
| `assets/models/staging/{name}.glb` | `assets/models/staging/concert-stage-deck.glb` |
| `assets/models/construction/{name}.glb` | `assets/models/construction/mojo-barricade.glb` |

File names must use lowercase kebab-case only. No spaces, underscores, or uppercase.  
These paths are registered in `apps/web/src/data/assetLibrary.ts` as the `modelUrl` field.

---

## 3. S3 Bucket Configuration

### 3.1 Bucket Creation

```bash
aws s3api create-bucket \
  --bucket venue-platform-assets \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1
```

**Bucket settings (apply immediately after creation):**

```bash
# Block all public access — CloudFront uses an OAC, not public bucket policy
aws s3api put-public-access-block \
  --bucket venue-platform-assets \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,\
    BlockPublicPolicy=true,RestrictPublicBuckets=true
```

### 3.2 Bucket Policy (CloudFront OAC)

After creating the CloudFront distribution (§4), attach this bucket policy so only CloudFront can read the bucket. Replace `{DISTRIBUTION_ID}` and `{ACCOUNT_ID}`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipal",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::venue-platform-assets/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::{ACCOUNT_ID}:distribution/{DISTRIBUTION_ID}"
        }
      }
    }
  ]
}
```

### 3.3 CORS Configuration on S3

S3-level CORS is **not** the primary CORS enforcement layer (CloudFront handles that via response headers policies), but S3 CORS is required for direct preflight `OPTIONS` requests during CloudFront cache misses:

```json
[
  {
    "AllowedHeaders": ["Content-Type", "Range", "Accept-Encoding"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": [
      "https://venueplatform.com",
      "https://*.vercel.app",
      "http://localhost:3000"
    ],
    "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges", "ETag"],
    "MaxAgeSeconds": 86400
  }
]
```

Apply via AWS Console → S3 → `venue-platform-assets` → Permissions → CORS, or CLI:

```bash
aws s3api put-bucket-cors \
  --bucket venue-platform-assets \
  --cors-configuration file://s3-cors.json
```

### 3.4 File Upload — Recommended Metadata

When uploading assets to S3, set explicit metadata so CloudFront and the browser cache correctly without a separate response header policy:

```bash
# Upload a .ply capture
aws s3 cp \
  capture.ply \
  s3://venue-platform-assets/assets/splats/venue-001/capture.ply \
  --content-type "application/octet-stream" \
  --cache-control "public, max-age=604800, stale-while-revalidate=86400" \
  --metadata-directive REPLACE

# Upload a .glb model
aws s3 cp \
  concert-stage-deck.glb \
  s3://venue-platform-assets/assets/models/staging/concert-stage-deck.glb \
  --content-type "model/gltf-binary" \
  --cache-control "public, max-age=2592000, stale-while-revalidate=86400" \
  --metadata-directive REPLACE
```

---

## 4. CloudFront Distribution Configuration

### 4.1 Create Distribution

Use the AWS Console or CDK. Key parameters:

| Setting | Value |
|---|---|
| **Origin domain** | `venue-platform-assets.s3.ap-south-1.amazonaws.com` |
| **Origin access** | Origin Access Control (OAC) — not legacy OAI |
| **Viewer protocol policy** | Redirect HTTP to HTTPS |
| **Allowed HTTP methods** | GET, HEAD, OPTIONS |
| **Cache policy** | CachingOptimized (or custom, see §4.2) |
| **Origin request policy** | CORS-S3Origin |
| **Response headers policy** | Custom (see §4.3) |
| **Price class** | PriceClass_200 (US, Europe, Asia — covers India + global) |
| **Alternate domain** | `assets.venueplatform.com` |
| **SSL certificate** | ACM certificate for `assets.venueplatform.com` |
| **HTTP/2** | Enabled |
| **HTTP/3 (QUIC)** | Enabled — reduces handshake RTT by 1 round trip on mobile |

### 4.2 Cache Behaviours

Create two path-pattern cache behaviours in order (CloudFront matches top-to-bottom):

**Behaviour 1 — 3DGS Point Clouds (binary, large, slow-changing)**

| Parameter | Value |
|---|---|
| Path pattern | `assets/splats/*` |
| Compress objects | Yes |
| Cache TTL (min/default/max) | 86400 / 604800 / 2592000 (1d / 7d / 30d) |
| Cache key — query strings | None |
| Cache key — headers | Origin, Access-Control-Request-Headers, Access-Control-Request-Method |

Large `.ply` files (80–400 MB) benefit from long cache windows because venue scans are updated infrequently (re-capture cycles are typically monthly). Use S3 object versioning + CloudFront cache invalidation (`aws cloudfront create-invalidation`) when a rescan is published.

**Behaviour 2 — Equipment Models (medium, updated per design revision)**

| Parameter | Value |
|---|---|
| Path pattern | `assets/models/*` |
| Compress objects | Yes |
| Cache TTL (min/default/max) | 3600 / 2592000 / 7776000 (1h / 30d / 90d) |
| Cache key | Same as above |

**Default behaviour** — forwards non-asset requests to the Vercel origin (configure separately if using CloudFront in front of the full stack).

### 4.3 Custom Response Headers Policy

Attach this policy to **both** asset behaviours. It injects the CORS and resource-sharing headers that PlayCanvas's `pc.Application` asset loader requires on every cross-origin fetch:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
Access-Control-Allow-Headers: Content-Type, Range, Accept-Encoding
Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges
Cross-Origin-Resource-Policy: cross-origin
Vary: Origin, Accept-Encoding
```

> **Critical:** `Cross-Origin-Resource-Policy: cross-origin` is required because the Vercel app sets `Cross-Origin-Embedder-Policy: unsafe-none`. Without the CORP header on CDN responses, Chromium-based browsers will block the fetch with a network error.

---

## 5. Vercel ↔ CDN URL Wiring

### 5.1 Environment Variable

Add to Vercel dashboard → Project → Environment Variables:

```
NEXT_PUBLIC_ASSET_CDN_BASE=https://assets.venueplatform.com
```

Set for: Production, Preview, Development (use `http://localhost:3000` for local dev).

### 5.2 venues.ts — CDN-aware splatUrl

Once the CDN is live, update `apps/web/src/data/venues.ts` to reference the CDN base:

```typescript
// Before (local public/ directory, works in dev):
splatUrl: "/assets/splats/venue-001/capture.ply"

// After (CDN-streamed, required in production):
splatUrl: `${process.env.NEXT_PUBLIC_ASSET_CDN_BASE}/assets/splats/venue-001/capture.ply`
```

The same pattern applies to `collisionMeshUrl` and all `modelUrl` entries in `assetLibrary.ts`.

### 5.3 Local Development Fallback

During local development (`pnpm dev`), `NEXT_PUBLIC_ASSET_CDN_BASE` resolves to `http://localhost:3000`, so all asset paths fall back to the `apps/web/public/` directory. Engineers can place test `.ply` and `.glb` files there without touching S3.

---

## 6. Performance Targets & Validation

| Asset type | Target first-byte | Method |
|---|---|---|
| `.ply` capture (cold edge) | < 100 ms TTFB | CloudFront HTTP/3 + OAC cache |
| `.ply` capture (warm edge) | < 15 ms TTFB | CloudFront PoP hit |
| `.glb` equipment model | < 40 ms TTFB | CloudFront PoP hit |
| `collision.glb` proxy | < 40 ms TTFB | CloudFront PoP hit |

**TTFB is the critical metric** for PlayCanvas's streaming loader — the asset pipeline blocks on `asset.on('load')`, so the first-byte latency directly determines how quickly the viewer reaches the `engineState === "ready"` state. Total transfer time is a function of the user's bandwidth and cannot be controlled; TTFB is fully within the CDN's control.

### Validation Script (run from an `ap-south-1`-proxied machine or EC2 in Mumbai)

```bash
#!/usr/bin/env bash
CDN="https://assets.venueplatform.com"
ASSETS=(
  "assets/splats/venue-001/capture.ply"
  "assets/splats/venue-001/collision.glb"
  "assets/models/staging/concert-stage-deck.glb"
)

for path in "${ASSETS[@]}"; do
  ttfb=$(curl -o /dev/null -s -w "%{time_starttransfer}" "${CDN}/${path}")
  echo "TTFB ${ttfb}s — ${path}"
done
```

Expected output on a warm cache: all values under `0.100`.

---

## 7. Cache Invalidation Workflow

When a venue rescan is published or an equipment model is updated:

```bash
# Invalidate a single venue's scan files
aws cloudfront create-invalidation \
  --distribution-id {DISTRIBUTION_ID} \
  --paths "/assets/splats/venue-001/*"

# Invalidate all equipment models (use sparingly — billed per path)
aws cloudfront create-invalidation \
  --distribution-id {DISTRIBUTION_ID} \
  --paths "/assets/models/*"

# Nuclear option — full cache flush (avoid in production)
aws cloudfront create-invalidation \
  --distribution-id {DISTRIBUTION_ID} \
  --paths "/*"
```

> **Cost note:** AWS charges $0.005 per invalidation path after the first 1,000 paths/month. Prefer uploading new files to versioned S3 keys (`capture-v2.ply`) and updating `venues.ts` to point at the new key — this sidesteps invalidation costs entirely and allows instant rollback.

---

## 8. S3 Folder Layout — Complete Reference

```
s3://venue-platform-assets/
│
├── assets/
│   ├── splats/
│   │   ├── venue-001/
│   │   │   ├── capture.ply          # 3DGS Gaussian Splat — Ballygunge Heritage Grand
│   │   │   └── collision.glb        # Invisible proxy mesh for raycasting
│   │   ├── venue-002/
│   │   │   ├── capture.ply          # Science City Convention Arena
│   │   │   └── collision.glb
│   │   └── venue-003/
│   │       ├── capture.ply          # Eco Park Amphitheatre
│   │       └── collision.glb
│   │
│   └── models/
│       ├── technical/
│       │   ├── audio/
│       │   │   ├── db-audiotechnik-v-series.glb
│       │   │   └── digico-quantum338-console.glb
│       │   ├── lighting/
│       │   │   ├── moving-head-profile.glb
│       │   │   └── haze-machine.glb
│       │   └── led/
│       │       └── p3-9-led-panel.glb
│       │
│       ├── staging/
│       │   ├── stage/
│       │   │   └── concert-stage-deck-4x4.glb
│       │   ├── risers/
│       │   │   └── drum-riser-2x2.glb
│       │   ├── trussing/
│       │   │   ├── truss-goalpost.glb
│       │   │   └── roof-rigging-tower.glb
│       │   └── scaffolding/
│       │       └── pa-delay-tower.glb
│       │
│       └── construction/
│           ├── tin_barricade/
│           │   └── galvanized-tin-barricade.glb
│           ├── mojo_barricade/
│           │   └── mojo-crowd-control-barricade.glb
│           └── welfare/
│               └── mobile-toilets-block.glb
```

---

## 9. Cost Efficiency Model

At the platform's initial Kolkata-market scale (3 venues, ~50 daily active users):

| Line item | Estimate |
|---|---|
| S3 storage (3 venues × 200 MB avg + models) | ~1 GB → **$0.023/month** |
| CloudFront data transfer (India PoP) | ~50 GB/month → **$0.40/month** |
| CloudFront HTTPS requests | ~100K/month → **$0.009/month** |
| S3 GET requests | ~200K/month → **$0.08/month** |
| **Total CDN layer** | **~$0.51/month** |
| Vercel Pro (Next.js app only) | ~$20/month |
| **Total production infrastructure** | **~$20.51/month** |

This splits the workload optimally: Vercel handles zero-config Next.js deployments, preview environments, and edge middleware; CloudFront + S3 handle the data-heavy binary asset streaming at a fraction of the cost of routing those bytes through Vercel's function invocation model.

---

## 10. Onboarding Checklist for Incoming Engineers

- [ ] Create `venue-platform-assets` S3 bucket in `ap-south-1`
- [ ] Apply Block Public Access settings
- [ ] Create CloudFront Origin Access Control (OAC)
- [ ] Create CloudFront distribution — configure origins, cache behaviours, response headers policy
- [ ] Attach S3 bucket policy granting CloudFront OAC read access
- [ ] Configure S3 CORS policy (`s3-cors.json`)
- [ ] Create ACM certificate for `assets.venueplatform.com` in `us-east-1` (required for CloudFront)
- [ ] Create Route 53 CNAME: `assets.venueplatform.com` → CloudFront distribution domain
- [ ] Upload all `.ply` and `.glb` files with correct `Content-Type` and `Cache-Control` metadata
- [ ] Add `NEXT_PUBLIC_ASSET_CDN_BASE` environment variable in Vercel dashboard
- [ ] Update `venues.ts` `splatUrl` fields to use CDN base
- [ ] Update `assetLibrary.ts` `modelUrl` fields to use CDN base
- [ ] Run TTFB validation script from Mumbai-proxied machine
- [ ] Confirm `Access-Control-Allow-Origin: *` header is present on all asset responses
- [ ] Confirm PlayCanvas viewer loads without CORS console errors at `/viewer?id=venue-001`
