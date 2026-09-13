# cf-hello-world-test — Design Spec

Date: 2026-09-13

## Purpose

A small end-to-end test project proving out a full Cloudflare stack (Workers,
D1, R2, custom domain, GitHub Actions CI/CD) through one deployed page:
`https://hello.sumindu.me`. Secondary goal: demonstrate PWA installability and
targeted Web Push notifications. The project must feel like a real, polished
page rather than a bare test harness, and must be lightweight enough to be
smooth on low-bandwidth connections.

## Non-goals

- No user accounts / authentication for end users (only the admin notify
  endpoint is protected, via a shared secret).
- No image processing pipeline beyond client-side resize/compress before
  upload — no Cloudflare Images product dependency.
- No client-side framework or bundler — plain HTML/CSS/JS to keep payload
  minimal and avoid build-tooling overhead for a project this size.
- No ORM — two tables don't justify one; D1 accessed via raw SQL through
  its native binding.

## Tech stack

- **Routing/backend**: [Hono](https://hono.dev) (~14KB, Workers-native,
  used internally by Cloudflare for its own D1/KV dashboards). Runs
  entirely on the edge, so it costs the browser zero bytes — improves
  code structure with no low-bandwidth tradeoff.
- **Database**: D1 native binding (`env.DB.prepare(...).bind(...)`), no
  ORM.
- **Storage**: R2 native binding, no additional library.
- **Push**: standard [`web-push`](https://www.npmjs.com/package/web-push)
  npm package with the `nodejs_compat` compatibility flag — this is
  Cloudflare's own documented approach (see their
  [Agents push-notifications guide](https://developers.cloudflare.com/agents/guides/push-notifications/)),
  and removes the need for a niche WebCrypto-only package.
- **Frontend**: vanilla HTML/CSS/JS, server-rendered by Hono — no client
  framework or bundler.

## Architecture

Single Cloudflare Worker (Hono app) serving both the HTML page and its
API routes.

```
Browser ──GET /──────────────► Worker ──D1: SELECT/INSERT visits
   │                              │
   │◄── HTML (count inlined) ─────┘
   │
   ├──POST /upload (image) ─────► Worker ──R2: PUT object
   ├──GET /image/:key ──────────► Worker ──R2: GET object
   ├──POST /subscribe ──────────► Worker ──D1: INSERT push_subscriptions
   └──POST /admin/notify ───────► Worker ──D1: SELECT subscriptions WHERE group
                                       └──► Web Push (VAPID) to each endpoint
```

### Data model (D1)

```sql
-- migrations/0001_init.sql
CREATE TABLE visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  viewed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  group_tag TEXT NOT NULL DEFAULT 'all',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_push_subscriptions_group ON push_subscriptions(group_tag);
```

### R2

- Bucket stores uploaded images keyed by a content hash or timestamp-based
  key (e.g. `img/<uuid>.<ext>`) to avoid collisions and enable long-lived
  cache headers (`Cache-Control: public, max-age=31536000, immutable`).
- Worker enforces a max upload size (e.g. 2 MB) server-side regardless of
  client-side compression, since the client cannot be trusted.

### Routes

| Method | Path             | Behavior |
|--------|------------------|----------|
| GET    | `/`              | Renders the page. Inserts a `visits` row, reads `COUNT(*)`, inlines the count directly into the HTML (no extra client round trip for critical content). Lists recent uploaded image keys for the gallery. |
| POST   | `/upload`        | Accepts multipart/form-data image, validates type/size, stores in R2, returns the new key/URL. |
| GET    | `/image/:key`    | Streams the object from R2 with long-lived cache headers. 404 if missing. |
| POST   | `/subscribe`     | Accepts a PushSubscription JSON + optional `group` field, upserts into `push_subscriptions`. |
| POST   | `/admin/notify`  | Requires header `X-Admin-Secret` matching the `ADMIN_NOTIFY_SECRET` Worker secret. Body `{group, title, body}`. Looks up matching subscriptions and sends Web Push to each. |
| GET    | `/manifest.json` | PWA manifest. |
| GET    | `/sw.js`         | Service worker script. |

### PWA

- `manifest.json`: name, short_name, icons (a couple of sizes generated as
  simple PNGs), theme/background color, `display: standalone`.
- `sw.js`: precache the app shell (`/`, `/manifest.json`, icon files) on
  install; cache-first for shell assets, stale-while-revalidate for
  `/image/:key` responses; listens for `push` (shows a Notification using
  the payload) and `notificationclick` (focuses/opens the page).

### Push notifications (targeted)

- Browser subscribes via `PushManager.subscribe` using a VAPID public key
  exposed by the Worker (`GET /vapid-public-key` or inlined at page load).
- Subscription POSTed to `/subscribe` with a `group` value (page exposes a
  simple selector, defaulting to `"all"`, so a viewer can join e.g.
  `"testers"`).
- Sending is done via the standard `web-push` npm package (RFC 8291
  payload encryption handled by the library), enabled by the
  `nodejs_compat` compatibility flag in `wrangler.jsonc` — per Cloudflare's
  own documented approach, no fallback needed.
- VAPID keypair generated once (via `web-push generate-vapid-keys` or
  equivalent) and stored as Worker secrets (`VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`), not committed to the repo.

## Performance / low-bandwidth requirements

- No external CDN dependencies (no Google Fonts, no icon-font CDN, no JS
  framework CDN) — everything self-hosted from the Worker/edge to avoid
  extra DNS/TLS round trips.
- System font stack only; CSS inlined in the single HTML response (no
  separate CSS file round trip for first paint).
- Vanilla JS, no bundler; JS kept minimal and deferred/non-blocking.
- View count is server-rendered into the initial HTML — no extra fetch
  needed to show the page's core dynamic content.
- Images: resized/compressed client-side (canvas) before upload to bound
  upload size on slow connections; gallery images use `loading="lazy"` and
  explicit `width`/`height` to avoid layout shift; served with long-lived
  immutable cache headers.
- Service worker caches the shell for near-instant repeat loads and
  resilience on flaky connections.
- Target initial HTML+CSS+JS payload (excluding gallery images): under
  ~50KB uncompressed.

## UI/UX

- Single page, clean and intentional visual design (not a bare test
  harness) — clear sections for: greeting + live view count, image
  gallery + upload, notification opt-in. Responsive down to ~360px width.
  Dark/light aware via `prefers-color-scheme`.

## Infra / deployment

- `wrangler.jsonc`: D1 binding (`DB`), R2 binding (`BUCKET`), custom domain
  route `hello.sumindu.me/*`, `compatibility_date` set to today,
  `compatibility_flags: ["nodejs_compat"]` (required by `web-push`).
- Secrets (`ADMIN_NOTIFY_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`)
  set via `wrangler secret put`, and mirrored as GitHub Actions secrets for
  CI use where needed (VAPID public key can be a plain build-time constant
  since it is not sensitive).
- GitHub repo `cf-hello-world-test` (public), created via `gh repo create`.
- GitHub Actions workflow (`.github/workflows/deploy.yml`): on push to
  `main` — checkout, setup Node, `npm ci`, run D1 migrations against the
  remote DB (`wrangler d1 migrations apply DB --remote`), then
  `wrangler deploy`. Uses `CLOUDFLARE_API_TOKEN` as a repo secret.

## Testing

- After deploy: `curl https://hello.sumindu.me` to confirm 200 + expected
  markup; verify the visit count increments across repeated requests.
- Manual: upload an image via the page, confirm it appears in the gallery
  and loads from `/image/:key`.
- Manual: subscribe to push in a browser, trigger `/admin/notify` for that
  group, confirm the notification arrives; confirm a different group does
  not receive it.
- Lighthouse (or equivalent) check for performance/PWA installability as a
  sanity check, not a hard gate.

## Open questions resolved during implementation

- Icon assets: generated as simple placeholder PNGs unless the user
  supplies branding.
