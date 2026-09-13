# cf-hello-world-test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a small, highly-optimized Cloudflare Worker demo at `https://hello.sumindu.me` exercising D1 (SQL), Workers KV (blob storage), a PWA shell, and targeted Web Push notifications, with a public GitHub repo and a GitHub Actions CI/CD pipeline.

**Architecture:** A single Cloudflare Worker built with Hono handles dynamic routes (`/`, `/upload`, `/image/*`, `/subscribe`, `/admin/notify`, `/vapid-public-key`); Cloudflare Workers Assets serves static files (`manifest.json`, `sw.js`, `client.js`, icon) directly. D1 stores visit counts and push subscriptions; Workers KV stores uploaded images (originally planned as R2; switched mid-execution because R2 requires a payment method on file even for free-tier use, which the user opted not to provide — see the migration task below and the updated spec). The page is server-rendered vanilla HTML/CSS with no client framework or bundler, to stay light on low-bandwidth connections.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers (D1 + KV + Assets bindings), `web-push` npm package with the `nodejs_compat` compatibility flag, `@cloudflare/vitest-plugin` for testing, Wrangler CLI, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-13-cf-hello-world-test-design.md`

## Global Constraints

- No client-side framework or bundler — plain HTML/CSS/JS only.
- No ORM — D1 accessed via raw SQL through its native binding.
- No external CDN dependencies (fonts, icon libraries, JS CDNs) — everything self-hosted.
- CSS inlined in the HTML response; no separate CSS file round trip.
- Target initial HTML+CSS+JS payload (excluding gallery images): under ~50KB uncompressed.
- Max image upload size: 2MB, enforced server-side regardless of client-side compression.
- `compatibility_date` in `wrangler.jsonc` must be `2026-09-13`; `compatibility_flags` must include `nodejs_compat` (required by `web-push`).
- Admin-only route (`/admin/notify`) is protected by a shared-secret header, not a full auth system.

---

## Task 1: Project scaffolding and health check

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wrangler.jsonc`
- Create: `src/index.ts`
- Create: `vitest.config.ts`
- Create: `test/health.test.ts`
- Create: `.gitignore` (already exists at repo root from spec phase — verify it includes `node_modules/`, `.wrangler/`, `.env`, `.dev.vars`; it does)

**Interfaces:**
- Produces: `Env` type (exported from `src/index.ts`) with fields `DB: D1Database`, `BUCKET: R2Bucket`, `ASSETS: Fetcher`, `ADMIN_NOTIFY_SECRET: string`, `VAPID_PUBLIC_KEY: string`, `VAPID_PRIVATE_KEY: string`. Later tasks import this as `import type { Env } from '../index'`.
- Produces: default-exported Hono `app` from `src/index.ts`, used by all later route wiring and by tests via `exports.default.fetch(...)`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "cf-hello-world-test",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "migrate:local": "wrangler d1 migrations apply DB --local",
    "migrate:remote": "wrangler d1 migrations apply DB --remote"
  },
  "dependencies": {
    "hono": "^4.6.0",
    "web-push": "^3.6.7"
  },
  "devDependencies": {
    "@cloudflare/vitest-plugin": "^1.1.8",
    "@cloudflare/workers-types": "^4.20250906.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0",
    "wrangler": "^4.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types", "vitest/globals"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

- [ ] **Step 3: Create `wrangler.jsonc`**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "cf-hello-world-test",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-13",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./public",
    "binding": "ASSETS"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "cf-hello-world-test-db",
      "database_id": "00000000-0000-0000-0000-000000000001"
    }
  ],
  "r2_buckets": [
    {
      "binding": "BUCKET",
      "bucket_name": "cf-hello-world-test-images"
    }
  ]
}
```

Note: `database_id` is a placeholder — local dev and tests simulate D1 regardless of its value. Task 11 replaces it with the real ID after creating the database.

- [ ] **Step 4: Create an empty `public/` directory placeholder so Wrangler doesn't error on a missing assets directory**

Create `public/.gitkeep` (empty file).

- [ ] **Step 5: Create `src/index.ts` with a health check route**

```ts
import { Hono } from "hono";

export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  ADMIN_NOTIFY_SECRET: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("OK"));

export default app;
```

- [ ] **Step 6: Create `vitest.config.ts`**

```ts
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
});
```

- [ ] **Step 7: Write the failing test — `test/health.test.ts`**

```ts
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("GET /health", () => {
  it("returns OK", async () => {
    const response = await exports.default.fetch("https://example.com/health");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
  });
});
```

- [ ] **Step 8: Install dependencies and run the test**

Run: `npm install`
Then run: `npm test`
Expected: PASS (1 test) — this confirms the whole scaffold (Wrangler config, Hono app, vitest plugin) wires together correctly.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json wrangler.jsonc src/index.ts vitest.config.ts test/health.test.ts public/.gitkeep
git commit -m "Scaffold cf-hello-world-test Worker with health check

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: D1 schema and query helpers

**Files:**
- Create: `migrations/0001_init.sql`
- Create: `src/lib/db.ts`
- Create: `test/apply-migrations.ts`
- Create: `test/env.d.ts`
- Modify: `vitest.config.ts`
- Test: `test/db.test.ts`

**Interfaces:**
- Consumes: `Env` from `src/index.ts` (Task 1).
- Produces (from `src/lib/db.ts`, used by Task 3 and Task 7/8):
  - `recordVisit(db: D1Database): Promise<number>` — inserts a visit row, returns the new total count.
  - `addSubscription(db: D1Database, sub: { endpoint: string; p256dh: string; auth: string; group: string }): Promise<void>` — upserts a push subscription.
  - `getSubscriptionsByGroup(db: D1Database, group: string): Promise<{ endpoint: string; p256dh: string; auth: string }[]>`.

- [ ] **Step 1: Create the migration `migrations/0001_init.sql`**

```sql
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

- [ ] **Step 2: Update `vitest.config.ts` to apply migrations in tests**

```ts
import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrationsPath = path.join(import.meta.dirname, "migrations");
  const migrations = await readD1Migrations(migrationsPath);

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
```

- [ ] **Step 3: Create `test/apply-migrations.ts`**

```ts
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

- [ ] **Step 4: Create `test/env.d.ts` declaring the test-only binding**

```ts
declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
```

- [ ] **Step 5: Write the failing test — `test/db.test.ts`**

```ts
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { addSubscription, getSubscriptionsByGroup, recordVisit } from "../src/lib/db";

describe("recordVisit", () => {
  it("increments and returns the running count", async () => {
    const first = await recordVisit(env.DB);
    const second = await recordVisit(env.DB);
    expect(second).toBe(first + 1);
  });
});

describe("push subscriptions", () => {
  it("stores and retrieves subscriptions by group", async () => {
    await addSubscription(env.DB, {
      endpoint: "https://push.example.com/a",
      p256dh: "key-a",
      auth: "auth-a",
      group: "testers",
    });
    await addSubscription(env.DB, {
      endpoint: "https://push.example.com/b",
      p256dh: "key-b",
      auth: "auth-b",
      group: "all",
    });

    const testers = await getSubscriptionsByGroup(env.DB, "testers");
    expect(testers).toHaveLength(1);
    expect(testers[0].endpoint).toBe("https://push.example.com/a");
  });

  it("upserts on repeated subscribe with the same endpoint", async () => {
    await addSubscription(env.DB, {
      endpoint: "https://push.example.com/c",
      p256dh: "old-key",
      auth: "old-auth",
      group: "all",
    });
    await addSubscription(env.DB, {
      endpoint: "https://push.example.com/c",
      p256dh: "new-key",
      auth: "new-auth",
      group: "vip",
    });

    const vip = await getSubscriptionsByGroup(env.DB, "vip");
    expect(vip).toHaveLength(1);
    expect(vip[0].p256dh).toBe("new-key");
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `src/lib/db.ts` does not exist yet.

- [ ] **Step 7: Implement `src/lib/db.ts`**

```ts
export async function recordVisit(db: D1Database): Promise<number> {
  await db.prepare("INSERT INTO visits DEFAULT VALUES").run();
  const row = await db
    .prepare("SELECT COUNT(*) as count FROM visits")
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  group: string;
};

export async function addSubscription(
  db: D1Database,
  sub: PushSubscriptionInput
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, group_tag)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         group_tag = excluded.group_tag`
    )
    .bind(sub.endpoint, sub.p256dh, sub.auth, sub.group)
    .run();
}

export type StoredSubscription = { endpoint: string; p256dh: string; auth: string };

export async function getSubscriptionsByGroup(
  db: D1Database,
  group: string
): Promise<StoredSubscription[]> {
  const { results } = await db
    .prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE group_tag = ?")
    .bind(group)
    .all<StoredSubscription>();
  return results;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test`
Expected: PASS (3 tests in `db.test.ts`, plus the Task 1 health test still passing)

- [ ] **Step 9: Commit**

```bash
git add migrations/0001_init.sql src/lib/db.ts test/apply-migrations.ts test/env.d.ts test/db.test.ts vitest.config.ts
git commit -m "Add D1 schema and query helpers for visits and push subscriptions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Home page route with server-rendered view count

**Files:**
- Create: `src/lib/render.ts`
- Create: `src/routes/home.ts`
- Modify: `src/index.ts`
- Test: `test/routes/home.test.ts`

**Interfaces:**
- Consumes: `recordVisit` from `src/lib/db.ts` (Task 2); `Env` from `src/index.ts` (Task 1).
- Produces: `renderHomePage(opts: { visitCount: number; imageKeys: string[] }): string` from `src/lib/render.ts`, used by Task 5 (gallery) with a non-empty `imageKeys`. For this task, call it with `imageKeys: []`.
- Produces: `homeRoute` Hono handler exported from `src/routes/home.ts`, registered on `GET /` in `src/index.ts`.

- [ ] **Step 1: Write the failing test — `test/routes/home.test.ts`**

```ts
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("GET /", () => {
  it("renders HTML containing the visit count", async () => {
    const first = await exports.default.fetch("https://example.com/");
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toContain("text/html");
    const firstBody = await first.text();
    expect(firstBody).toMatch(/viewed <span class="count">1<\/span> times/);

    const second = await exports.default.fetch("https://example.com/");
    const secondBody = await second.text();
    expect(secondBody).toMatch(/viewed <span class="count">2<\/span> times/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `GET /` is not registered (404).

- [ ] **Step 3: Implement `src/lib/render.ts`**

```ts
export function renderHomePage(opts: { visitCount: number; imageKeys: string[] }): string {
  const gallery = opts.imageKeys
    .map(
      (key) =>
        `<img src="/image/${key}" alt="Uploaded photo" loading="lazy" width="160" height="160" class="thumb">`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hello, Cloudflare</title>
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#0b5fff">
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#111; --accent:#0b5fff; --border:#ddd; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0b0b0c; --fg:#eee; --border:#333; } }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px 16px; background:var(--bg); color:var(--fg); font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height:1.5; }
  main { max-width: 640px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 4px; }
  .count { color: var(--accent); font-weight: 600; }
  section { margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--border); }
  .gallery { display:grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap:8px; margin-top:12px; }
  .thumb { width:100%; height:80px; object-fit:cover; border-radius:6px; background:var(--border); }
  form { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
  input[type=file] { flex:1; min-width:180px; }
  button { background:var(--accent); color:#fff; border:0; border-radius:6px; padding:10px 16px; font-size:1rem; cursor:pointer; }
  button:disabled { opacity:.6; cursor:default; }
  select { padding:6px; border-radius:6px; border:1px solid var(--border); background:var(--bg); color:var(--fg); }
  #notif-status { font-size:.9rem; opacity:.8; margin-top:8px; }
</style>
</head>
<body>
<main>
  <h1>👋 Hello from Cloudflare Workers</h1>
  <p>This page has been viewed <span class="count">${opts.visitCount}</span> times.</p>

  <section id="gallery-section">
    <h2>Photo gallery</h2>
    <form id="upload-form">
      <input type="file" name="image" accept="image/*" required>
      <button type="submit">Upload</button>
    </form>
    <div class="gallery" id="gallery">${gallery}</div>
  </section>

  <section id="notify-section">
    <h2>Notifications</h2>
    <label for="group-select">Group</label>
    <select id="group-select">
      <option value="all" selected>all</option>
      <option value="testers">testers</option>
    </select>
    <button id="subscribe-btn">Enable notifications</button>
    <p id="notif-status"></p>
  </section>
</main>
<script src="/client.js" defer></script>
</body>
</html>`;
}
```

- [ ] **Step 4: Implement `src/routes/home.ts`**

```ts
import type { Context } from "hono";
import type { Env } from "../index";
import { recordVisit } from "../lib/db";
import { renderHomePage } from "../lib/render";

export async function homeRoute(c: Context<{ Bindings: Env }>) {
  const visitCount = await recordVisit(c.env.DB);
  return c.html(renderHomePage({ visitCount, imageKeys: [] }));
}
```

- [ ] **Step 5: Modify `src/index.ts` to register the route**

```ts
import { Hono } from "hono";
import { homeRoute } from "./routes/home";

export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  ADMIN_NOTIFY_SECRET: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("OK"));
app.get("/", homeRoute);

export default app;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all tests so far)

- [ ] **Step 7: Commit**

```bash
git add src/lib/render.ts src/routes/home.ts src/index.ts test/routes/home.test.ts
git commit -m "Add server-rendered home page with live D1 visit counter

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: R2 image upload and retrieval

**Files:**
- Create: `src/lib/storage.ts`
- Create: `src/routes/upload.ts`
- Modify: `src/index.ts`
- Test: `test/routes/upload.test.ts`

**Interfaces:**
- Consumes: `Env` from `src/index.ts`.
- Produces (from `src/lib/storage.ts`, used by Task 5's gallery listing):
  - `putImage(bucket: R2Bucket, key: string, data: ArrayBuffer, contentType: string): Promise<void>`
  - `getImage(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null>`
  - `listImageKeys(bucket: R2Bucket, limit?: number): Promise<string[]>`
- Produces: `uploadRoute` and `imageRoute` Hono handlers, registered as `POST /upload` and `GET /image/*`.

- [ ] **Step 1: Write the failing test — `test/routes/upload.test.ts`**

```ts
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

function makeImageFile(): File {
  // 1x1 transparent PNG
  const bytes = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    ),
    (c) => c.charCodeAt(0)
  );
  return new File([bytes], "pixel.png", { type: "image/png" });
}

describe("POST /upload and GET /image/*", () => {
  it("stores an uploaded image and serves it back", async () => {
    const body = new FormData();
    body.append("image", makeImageFile());

    const uploadResponse = await exports.default.fetch("https://example.com/upload", {
      method: "POST",
      body,
    });
    expect(uploadResponse.status).toBe(200);
    const { url } = await uploadResponse.json<{ url: string }>();
    expect(url).toMatch(/^\/image\/img\/.+\.png$/);

    const imageResponse = await exports.default.fetch(`https://example.com${url}`);
    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers.get("content-type")).toBe("image/png");
    expect(imageResponse.headers.get("cache-control")).toContain("immutable");
  });

  it("rejects non-image uploads", async () => {
    const body = new FormData();
    body.append("image", new File(["hello"], "not-image.txt", { type: "text/plain" }));

    const response = await exports.default.fetch("https://example.com/upload", {
      method: "POST",
      body,
    });
    expect(response.status).toBe(415);
  });

  it("returns 404 for a missing image key", async () => {
    const response = await exports.default.fetch("https://example.com/image/img/missing.png");
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `POST /upload` and `GET /image/*` are not registered.

- [ ] **Step 3: Implement `src/lib/storage.ts`**

```ts
export async function putImage(
  bucket: R2Bucket,
  key: string,
  data: ArrayBuffer,
  contentType: string
): Promise<void> {
  await bucket.put(key, data, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
  });
}

export async function getImage(bucket: R2Bucket, key: string) {
  return bucket.get(key);
}

export async function listImageKeys(bucket: R2Bucket, limit = 12): Promise<string[]> {
  const listed = await bucket.list({ prefix: "img/", limit });
  return listed.objects.map((o) => o.key).sort().reverse();
}
```

- [ ] **Step 4: Implement `src/routes/upload.ts`**

```ts
import type { Context } from "hono";
import type { Env } from "../index";
import { getImage, putImage } from "../lib/storage";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export async function uploadRoute(c: Context<{ Bindings: Env }>) {
  const body = await c.req.parseBody();
  const file = body["image"];

  if (!(file instanceof File)) {
    return c.json({ error: "image field required" }, 400);
  }
  if (!file.type.startsWith("image/")) {
    return c.json({ error: "must be an image" }, 415);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return c.json({ error: "file too large (max 2MB)" }, 413);
  }

  const ext = file.type.split("/")[1] || "bin";
  const key = `img/${crypto.randomUUID()}.${ext}`;
  await putImage(c.env.BUCKET, key, await file.arrayBuffer(), file.type);

  return c.json({ key, url: `/image/${key}` });
}

export async function imageRoute(c: Context<{ Bindings: Env }>) {
  const key = c.req.path.replace(/^\/image\//, "");
  const object = await getImage(c.env.BUCKET, key);
  if (!object) {
    return c.notFound();
  }
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
```

- [ ] **Step 5: Modify `src/index.ts` to register the routes**

```ts
import { Hono } from "hono";
import { homeRoute } from "./routes/home";
import { imageRoute, uploadRoute } from "./routes/upload";

export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  ADMIN_NOTIFY_SECRET: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("OK"));
app.get("/", homeRoute);
app.post("/upload", uploadRoute);
app.get("/image/*", imageRoute);

export default app;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all tests so far)

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage.ts src/routes/upload.ts src/index.ts test/routes/upload.test.ts
git commit -m "Add R2-backed image upload and retrieval routes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Gallery integration and static PWA assets

**Files:**
- Modify: `src/routes/home.ts`
- Modify: `test/routes/home.test.ts`
- Create: `public/manifest.json`
- Create: `public/icons/icon.svg`
- Create: `public/.gitkeep` (remove — no longer needed once real files exist)

**Interfaces:**
- Consumes: `listImageKeys` from `src/lib/storage.ts` (Task 4); `renderHomePage` from `src/lib/render.ts` (Task 3, already accepts `imageKeys`).

- [ ] **Step 1: Update the test — `test/routes/home.test.ts`** (add a new test alongside the existing ones)

```ts
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("GET /", () => {
  it("renders HTML containing the visit count", async () => {
    const first = await exports.default.fetch("https://example.com/");
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toContain("text/html");
    const firstBody = await first.text();
    expect(firstBody).toMatch(/viewed <span class="count">1<\/span> times/);

    const second = await exports.default.fetch("https://example.com/");
    const secondBody = await second.text();
    expect(secondBody).toMatch(/viewed <span class="count">2<\/span> times/);
  });

  it("includes uploaded images in the gallery", async () => {
    const uploadBody = new FormData();
    const bytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
      ),
      (c) => c.charCodeAt(0)
    );
    uploadBody.append("image", new File([bytes], "pixel.png", { type: "image/png" }));
    const uploadResponse = await exports.default.fetch("https://example.com/upload", {
      method: "POST",
      body: uploadBody,
    });
    const { url } = await uploadResponse.json<{ url: string }>();

    const homeResponse = await exports.default.fetch("https://example.com/");
    const homeBody = await homeResponse.text();
    expect(homeBody).toContain(`src="${url}"`);
  });
});
```

- [ ] **Step 2: Run test to verify the new assertion fails**

Run: `npm test`
Expected: FAIL — the gallery test fails because `homeRoute` doesn't list images yet.

- [ ] **Step 3: Modify `src/routes/home.ts` to list images**

```ts
import type { Context } from "hono";
import type { Env } from "../index";
import { recordVisit } from "../lib/db";
import { renderHomePage } from "../lib/render";
import { listImageKeys } from "../lib/storage";

export async function homeRoute(c: Context<{ Bindings: Env }>) {
  const visitCount = await recordVisit(c.env.DB);
  const imageKeys = await listImageKeys(c.env.BUCKET);
  return c.html(renderHomePage({ visitCount, imageKeys }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all tests so far)

- [ ] **Step 5: Create `public/manifest.json`**

```json
{
  "name": "Cloudflare Hello World Test",
  "short_name": "CF Hello",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0b0b0c",
  "theme_color": "#0b5fff",
  "icons": [
    { "src": "/icons/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 6: Create `public/icons/icon.svg`**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0b5fff"/>
  <text x="50%" y="58%" font-family="system-ui, sans-serif" font-size="280" fill="#fff" text-anchor="middle">H</text>
</svg>
```

This is a placeholder icon; swap the SVG content for real branding later if desired (resolves the spec's open question on icon assets).

- [ ] **Step 7: Remove the now-unneeded placeholder**

```bash
rm public/.gitkeep
```

- [ ] **Step 8: Manually verify static assets are served**

Run: `npm run dev`
In another terminal: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/manifest.json` — expect `200`.
Stop the dev server (Ctrl+C).

- [ ] **Step 9: Commit**

```bash
git add src/routes/home.ts test/routes/home.test.ts public/manifest.json public/icons/icon.svg
git rm public/.gitkeep
git commit -m "Add image gallery to home page and PWA manifest/icon

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Client-side upload and image compression

**Files:**
- Create: `public/client.js`

**Interfaces:**
- Consumes: `#upload-form`, `#gallery` DOM ids from `src/lib/render.ts` (Task 3/5); `POST /upload` from Task 4.
- Produces: none consumed elsewhere yet — Task 9 appends push-subscription logic to this same file.

This task is manual-test-only: browser JavaScript running client-side has no Workers-runtime automated test in this stack. Test manually as described in Step 3.

- [ ] **Step 1: Create `public/client.js`**

```js
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

async function compressImage(file, maxDim = 1280, quality = 0.75) {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
}

const uploadForm = document.getElementById("upload-form");
uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = uploadForm.querySelector("input[type=file]");
  const file = input.files[0];
  if (!file) return;

  const button = uploadForm.querySelector("button");
  button.disabled = true;
  try {
    const compressed = await compressImage(file);
    const body = new FormData();
    body.append("image", compressed);
    const response = await fetch("/upload", { method: "POST", body });
    if (!response.ok) throw new Error("upload failed");
    const { url } = await response.json();

    const img = document.createElement("img");
    img.src = url;
    img.loading = "lazy";
    img.width = 160;
    img.height = 160;
    img.className = "thumb";
    img.alt = "Uploaded photo";
    document.getElementById("gallery").prepend(img);
    uploadForm.reset();
  } catch (err) {
    alert("Upload failed. Please try a smaller image.");
  } finally {
    button.disabled = false;
  }
});
```

- [ ] **Step 2: Note — service worker registration will 404 until Task 9 creates `public/sw.js`; that's expected at this point and does not block manual testing of upload**

- [ ] **Step 3: Manually test in a browser**

Run: `npm run dev`
Open `http://localhost:8787/` in a browser. Choose an image file, click Upload, confirm the image appears in the gallery immediately without a full page reload.

- [ ] **Step 4: Commit**

```bash
git add public/client.js
git commit -m "Add client-side upload with canvas-based image compression

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Push subscription endpoints

**Files:**
- Create: `src/routes/push.ts`
- Modify: `src/index.ts`
- Test: `test/routes/push.test.ts`

**Interfaces:**
- Consumes: `addSubscription`, `getSubscriptionsByGroup` from `src/lib/db.ts` (Task 2); `Env` from `src/index.ts`.
- Produces: `vapidPublicKeyRoute` and `subscribeRoute` Hono handlers, registered as `GET /vapid-public-key` and `POST /subscribe`. Task 8 adds `notifyRoute` to this same file.

- [ ] **Step 1: Write the failing test — `test/routes/push.test.ts`**

```ts
import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("GET /vapid-public-key", () => {
  it("returns the configured public key", async () => {
    const response = await exports.default.fetch("https://example.com/vapid-public-key");
    expect(response.status).toBe(200);
    const { publicKey } = await response.json<{ publicKey: string }>();
    expect(publicKey).toBe(env.VAPID_PUBLIC_KEY);
  });
});

describe("POST /subscribe", () => {
  it("accepts a valid subscription", async () => {
    const response = await exports.default.fetch("https://example.com/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "https://push.example.com/xyz",
        keys: { p256dh: "abc", auth: "def" },
        group: "testers",
      }),
    });
    expect(response.status).toBe(200);
  });

  it("rejects an incomplete subscription", async () => {
    const response = await exports.default.fetch("https://example.com/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "https://push.example.com/incomplete" }),
    });
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — routes not registered, and `VAPID_PUBLIC_KEY` not yet set in `wrangler.jsonc` test vars.

- [ ] **Step 3: Add test-time secrets to `wrangler.jsonc`'s `vars` for local/test use**

Add a `vars` block so tests have deterministic values (production secrets are set separately via `wrangler secret put` in Task 11 and take precedence when deployed):

```jsonc
  "vars": {
    "ADMIN_NOTIFY_SECRET": "dev-only-admin-secret",
    "VAPID_PUBLIC_KEY": "dev-only-public-key",
    "VAPID_PRIVATE_KEY": "dev-only-private-key"
  }
```

Insert this alongside `d1_databases`/`r2_buckets` in `wrangler.jsonc`.

- [ ] **Step 4: Implement `src/routes/push.ts`**

```ts
import type { Context } from "hono";
import type { Env } from "../index";
import { addSubscription, getSubscriptionsByGroup } from "../lib/db";

export async function vapidPublicKeyRoute(c: Context<{ Bindings: Env }>) {
  return c.json({ publicKey: c.env.VAPID_PUBLIC_KEY });
}

type SubscribeBody = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  group?: string;
};

export async function subscribeRoute(c: Context<{ Bindings: Env }>) {
  const body = await c.req.json<SubscribeBody>();
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return c.json({ error: "invalid subscription" }, 400);
  }
  await addSubscription(c.env.DB, {
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    group: body.group || "all",
  });
  return c.json({ ok: true });
}
```

- [ ] **Step 5: Modify `src/index.ts` to register the routes**

```ts
import { Hono } from "hono";
import { homeRoute } from "./routes/home";
import { subscribeRoute, vapidPublicKeyRoute } from "./routes/push";
import { imageRoute, uploadRoute } from "./routes/upload";

export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  ADMIN_NOTIFY_SECRET: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("OK"));
app.get("/", homeRoute);
app.post("/upload", uploadRoute);
app.get("/image/*", imageRoute);
app.get("/vapid-public-key", vapidPublicKeyRoute);
app.post("/subscribe", subscribeRoute);

export default app;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all tests so far)

- [ ] **Step 7: Commit**

```bash
git add src/routes/push.ts src/index.ts test/routes/push.test.ts wrangler.jsonc
git commit -m "Add push subscription storage endpoints

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Targeted push sending via web-push

**Files:**
- Modify: `src/routes/push.ts`
- Modify: `src/index.ts`
- Test: `test/routes/notify.test.ts`

**Interfaces:**
- Consumes: `getSubscriptionsByGroup` from `src/lib/db.ts`; `web-push` package (mocked in tests).
- Produces: `notifyRoute` Hono handler, registered as `POST /admin/notify`.

- [ ] **Step 1: Write the failing test — `test/routes/notify.test.ts`**

```ts
import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addSubscription } from "../../src/lib/db";

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue({ statusCode: 201 }),
  },
}));

describe("POST /admin/notify", () => {
  beforeEach(async () => {
    await addSubscription(env.DB, {
      endpoint: "https://push.example.com/notify-a",
      p256dh: "key-a",
      auth: "auth-a",
      group: "notify-group",
    });
    await addSubscription(env.DB, {
      endpoint: "https://push.example.com/notify-b",
      p256dh: "key-b",
      auth: "auth-b",
      group: "other-group",
    });
  });

  it("rejects requests without the admin secret", async () => {
    const response = await exports.default.fetch("https://example.com/admin/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: "notify-group", title: "Hi", body: "Hello" }),
    });
    expect(response.status).toBe(401);
  });

  it("sends only to subscriptions in the requested group", async () => {
    const response = await exports.default.fetch("https://example.com/admin/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Secret": env.ADMIN_NOTIFY_SECRET,
      },
      body: JSON.stringify({ group: "notify-group", title: "Hi", body: "Hello" }),
    });
    expect(response.status).toBe(200);
    const { sent, total } = await response.json<{ sent: number; total: number }>();
    expect(total).toBe(1);
    expect(sent).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `POST /admin/notify` is not registered.

- [ ] **Step 3: Modify `src/routes/push.ts` to add `notifyRoute`**

Append to the existing file:

```ts
import webpush from "web-push";

type NotifyBody = { group?: string; title: string; body: string };

export async function notifyRoute(c: Context<{ Bindings: Env }>) {
  if (c.req.header("X-Admin-Secret") !== c.env.ADMIN_NOTIFY_SECRET) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const body = await c.req.json<NotifyBody>();
  const group = body.group || "all";
  const subs = await getSubscriptionsByGroup(c.env.DB, group);

  webpush.setVapidDetails(
    "mailto:admin@sumindu.me",
    c.env.VAPID_PUBLIC_KEY,
    c.env.VAPID_PRIVATE_KEY
  );

  const payload = JSON.stringify({ title: body.title, body: body.body });
  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      )
    )
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;

  return c.json({ sent, total: subs.length });
}
```

- [ ] **Step 4: Modify `src/index.ts` to register the route — replace the full file with:**

```ts
import { Hono } from "hono";
import { homeRoute } from "./routes/home";
import { notifyRoute, subscribeRoute, vapidPublicKeyRoute } from "./routes/push";
import { imageRoute, uploadRoute } from "./routes/upload";

export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  ADMIN_NOTIFY_SECRET: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("OK"));
app.get("/", homeRoute);
app.post("/upload", uploadRoute);
app.get("/image/*", imageRoute);
app.get("/vapid-public-key", vapidPublicKeyRoute);
app.post("/subscribe", subscribeRoute);
app.post("/admin/notify", notifyRoute);

export default app;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all tests so far)

- [ ] **Step 6: Commit**

```bash
git add src/routes/push.ts src/index.ts test/routes/notify.test.ts
git commit -m "Add group-targeted push notification sending via web-push

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Service worker and push subscribe UI

**Files:**
- Create: `public/sw.js`
- Modify: `public/client.js`
- Create (untracked, git-ignored, not committed): `.dev.vars`

**Interfaces:**
- Consumes: `#subscribe-btn`, `#group-select`, `#notif-status` DOM ids from `src/lib/render.ts` (Task 3); `GET /vapid-public-key` and `POST /subscribe` from Task 7.

This task is manual-test-only (service workers and the Push API require a real browser).

- [ ] **Step 1: Create `public/sw.js`**

```js
const CACHE_NAME = "shell-v1";
const SHELL_URLS = ["/", "/manifest.json", "/client.js"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/image/")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        const fetchPromise = fetch(event.request).then((response) => {
          cache.put(event.request, response.clone());
          return response;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  if (SHELL_URLS.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
  }
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : { title: "Notification", body: "" };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon.svg",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow("/");
    })
  );
});
```

- [ ] **Step 2: Append push-subscribe logic to `public/client.js`**

```js
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

const subscribeBtn = document.getElementById("subscribe-btn");
const notifStatus = document.getElementById("notif-status");
subscribeBtn.addEventListener("click", async () => {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    notifStatus.textContent = "Push notifications are not supported in this browser.";
    return;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const { publicKey } = await fetch("/vapid-public-key").then((r) => r.json());
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const group = document.getElementById("group-select").value;
    await fetch("/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...subscription.toJSON(), group }),
    });
    notifStatus.textContent = `Subscribed to "${group}" notifications.`;
    subscribeBtn.disabled = true;
  } catch (err) {
    notifStatus.textContent = "Could not enable notifications.";
  }
});
```

- [ ] **Step 3: Generate a real VAPID keypair for local testing**

Run: `npx --yes web-push generate-vapid-keys`
Copy the printed public/private keys into a new `.dev.vars` file at the project root (this file is already listed in `.gitignore` from Task 1, so a real keypair never enters git history):

```
VAPID_PUBLIC_KEY="<paste the public key here>"
VAPID_PRIVATE_KEY="<paste the private key here>"
```

Wrangler automatically loads `.dev.vars` for `wrangler dev` and overrides the matching `vars` entries from `wrangler.jsonc` (the `dev-only-*` placeholders stay in `wrangler.jsonc` unchanged, and vitest's test runs are unaffected since `.dev.vars` is only read by `wrangler dev`). This is needed because browsers validate the VAPID key format when subscribing — the placeholder strings from Task 7 aren't valid keys.

- [ ] **Step 4: Manually test in a browser**

Run: `npm run dev`
Open `http://localhost:8787/` in Chrome or Edge. Click "Enable notifications", accept the permission prompt, confirm the status text shows "Subscribed to...". Check DevTools → Application → Service Workers shows it registered and activated.

- [ ] **Step 5: Commit**

```bash
git add public/sw.js public/client.js
git commit -m "Add service worker (shell caching, push handling) and subscribe UI

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Local end-to-end smoke test

**Files:** none (verification only; fix forward in the relevant file if something fails)

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: PASS (all tests across all files)

- [ ] **Step 2: Run local D1 migrations and start the dev server**

Run: `npm run migrate:local`
Run: `npm run dev`

- [ ] **Step 3: Manual checklist against `http://localhost:8787/`**

- Load `/` twice, confirm the visit count increments by 1 each time.
- Upload an image, confirm it appears in the gallery without a full reload.
- Reload the page, confirm the uploaded image persists in the gallery.
- Click "Enable notifications" (using the real VAPID keys from Task 9 Step 3), confirm subscription succeeds.
- In a second terminal, trigger a notification for the subscribed group:

```bash
curl -X POST http://localhost:8787/admin/notify \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: dev-only-admin-secret" \
  -d '{"group":"all","title":"Test","body":"Hello from local dev"}'
```

Confirm the browser shows a system notification, and clicking it focuses/opens the tab.
- Subscribe from a second browser profile under a different group (e.g. `testers`), send a notification to `all` only, confirm the `testers` subscriber does not receive it.

- [ ] **Step 4: Stop the dev server; if any check failed, fix the relevant file from Tasks 1–9 and re-run `npm test` before proceeding**

No commit for this task unless fixes were needed (in which case, commit the fix with a message describing what was broken).

---

## Task 10b: Migrate image storage from R2 to Workers KV

**Context:** Task 11 discovered that R2 requires a payment method on file even for free-tier usage. The user opted not to provide one, so image storage moves to Workers KV instead — see the updated spec (`docs/superpowers/specs/2026-09-13-cf-hello-world-test-design.md`) for the full rationale and the KV tradeoffs (eventual consistency). This task ports the R2-based code from Tasks 4/5 to KV without changing any route behavior or response shapes.

**Files:**
- Modify: `wrangler.jsonc` (remove `r2_buckets`, add `kv_namespaces`)
- Modify: `src/index.ts` (Env type: `BUCKET: R2Bucket` → `IMAGES_KV: KVNamespace`)
- Modify: `src/lib/storage.ts` (rewrite against the KV API)
- Modify: `src/routes/upload.ts` (use `c.env.IMAGES_KV` instead of `c.env.BUCKET`)
- Modify: `src/routes/home.ts` (use `c.env.IMAGES_KV` instead of `c.env.BUCKET`)
- Modify: `test/routes/upload.test.ts`, `test/routes/home.test.ts` (no assertion changes needed — same response shapes — but the local KV binding needs a dummy id in `wrangler.jsonc` for Miniflare to simulate it)

**Interfaces:** Unchanged from Tasks 4/5 — `putImage`, `getImage`, `listImageKeys` keep the same names and call sites in `upload.ts`/`home.ts`; only their internal implementation and first-parameter type change.

- [ ] **Step 1: Update `wrangler.jsonc`** — replace the `r2_buckets` block with:

```jsonc
  "kv_namespaces": [
    {
      "binding": "IMAGES_KV",
      "id": "00000000000000000000000000000000"
    }
  ],
```

(32-character dummy id — Miniflare simulates KV locally regardless of the value; Task 11 replaces it with the real namespace id after creation.)

- [ ] **Step 2: Update the `Env` type in `src/index.ts`** — replace `BUCKET: R2Bucket;` with `IMAGES_KV: KVNamespace;`. Do not change any other line in this file.

- [ ] **Step 3: Rewrite `src/lib/storage.ts`**

```ts
export async function putImage(
  kv: KVNamespace,
  key: string,
  data: ArrayBuffer,
  contentType: string
): Promise<void> {
  await kv.put(key, data, {
    metadata: { contentType },
  });
}

export type StoredImage = { body: ArrayBuffer; contentType: string } | null;

export async function getImage(kv: KVNamespace, key: string): Promise<StoredImage> {
  const result = await kv.getWithMetadata<{ contentType: string }>(key, "arrayBuffer");
  if (result.value === null) return null;
  return { body: result.value, contentType: result.metadata?.contentType ?? "application/octet-stream" };
}

export async function listImageKeys(kv: KVNamespace, limit = 12): Promise<string[]> {
  const listed = await kv.list({ prefix: "img/", limit });
  return listed.keys.map((k) => k.name).sort().reverse();
}
```

- [ ] **Step 4: Update `src/routes/upload.ts`** — two call-site changes only:

Replace:
```ts
  await putImage(c.env.BUCKET, key, await file.arrayBuffer(), file.type);
```
with:
```ts
  await putImage(c.env.IMAGES_KV, key, await file.arrayBuffer(), file.type);
```

Replace the whole `imageRoute` function with:
```ts
export async function imageRoute(c: Context<{ Bindings: Env }>) {
  const key = c.req.path.replace(/^\/image\//, "");
  const image = await getImage(c.env.IMAGES_KV, key);
  if (!image) {
    return c.notFound();
  }
  return new Response(image.body, {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
```

- [ ] **Step 5: Update `src/routes/home.ts`** — replace `await listImageKeys(c.env.BUCKET);` with `await listImageKeys(c.env.IMAGES_KV);`. No other change.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — `test/routes/upload.test.ts` and `test/routes/home.test.ts` exercise the same routes and assert the same response shapes; only the underlying storage binding changed, so no test file edits should be needed. If a test fails, read the failure before changing test assertions — the response shapes (`{key, url}` on upload, `Content-Type`/`Cache-Control` headers on retrieval, `src="..."` in the gallery HTML) must stay identical to what Tasks 4/5 already established and had reviewed.

- [ ] **Step 7: Commit**

```bash
git add wrangler.jsonc src/index.ts src/lib/storage.ts src/routes/upload.ts src/routes/home.ts
git commit -m "Migrate image storage from R2 to Workers KV

R2 requires a payment method on file even for free-tier usage; the
user opted not to provide one. Workers KV has no such requirement.
Response shapes and route behavior are unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: Provision Cloudflare resources and deploy

**Files:**
- Modify: `wrangler.jsonc`

- [ ] **Step 1: Create the D1 database**

Run: `npx wrangler d1 create cf-hello-world-test-db`
Copy the `database_id` from the output.

- [ ] **Step 2: Create the Workers KV namespace**

Run: `npx wrangler kv namespace create IMAGES_KV`
Copy the `id` from the output.

- [ ] **Step 3: Update `wrangler.jsonc` with the real D1 database ID and KV namespace ID**

Replace `"database_id": "00000000-0000-0000-0000-000000000001"` with the ID from Step 1.
Replace `"id": "00000000000000000000000000000000"` under `kv_namespaces` with the ID from Step 2.

- [ ] **Step 4: Add the custom domain route**

Add to `wrangler.jsonc` (this Cloudflare account already has `sumindu.me` as a zone):

```jsonc
  "routes": [
    { "pattern": "hello.sumindu.me/*", "custom_domain": true }
  ]
```

- [ ] **Step 5: Run migrations against the remote D1 database**

Run: `npm run migrate:remote`

- [ ] **Step 6: Generate a production VAPID keypair (separate from the local dev one used in Task 9)**

Run: `npx --yes web-push generate-vapid-keys`

- [ ] **Step 6b: Remove the dev-only vars from `wrangler.jsonc` and relocate them**

Cloudflare does not allow a `secret` and a `var` to share a binding name — `wrangler deploy` pushes the `vars` block in a way that conflicts with (and can overwrite) an existing same-named secret. So before setting real secrets, the `vars` block Task 7 added to `wrangler.jsonc` (`ADMIN_NOTIFY_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) must be removed entirely and relocated:

1. Delete the whole `vars: { ... }` block from `wrangler.jsonc`.
2. Add the same three keys (same dev-only placeholder string values Task 7 used) to `vitest.config.ts`'s `cloudflareTest({ miniflare: { bindings: { ... } } })` — the same mechanism already used for `TEST_MIGRATIONS` in Task 2 — so `npm test` keeps working unchanged.
3. Add `ADMIN_NOTIFY_SECRET="dev-only-admin-secret"` to the project's `.dev.vars` file (already containing the real local VAPID keypair from Task 9) so `wrangler dev`/local smoke testing keeps working unchanged — this matches the exact value Task 10's smoke test already used.
4. Run `npm test` to confirm all tests still pass with the relocated bindings.

No application code changes are needed — routes already read `c.env.ADMIN_NOTIFY_SECRET` etc. regardless of where the value comes from.

- [ ] **Step 7: Set production secrets** (each prompts for a value; do not put these in `wrangler.jsonc`)

Run: `npx wrangler secret put ADMIN_NOTIFY_SECRET` — enter a newly generated random string (e.g. from `openssl rand -hex 32`).
Run: `npx wrangler secret put VAPID_PUBLIC_KEY` — enter the public key from Step 6.
Run: `npx wrangler secret put VAPID_PRIVATE_KEY` — enter the private key from Step 6.

Note: these secret names no longer appear anywhere in the committed `wrangler.jsonc` after Step 6b, so there is no collision — `wrangler deploy` in Step 8 will not overwrite them.

- [ ] **Step 8: Deploy**

Run: `npm run deploy`

- [ ] **Step 9: Verify the deployment**

Run: `curl -s -o /dev/null -w "%{http_code}\n" https://hello.sumindu.me/`
Expected: `200`
Run: `curl -s https://hello.sumindu.me/ | grep -o 'viewed <span class="count">[0-9]*</span> times'`
Expected: a line showing a count of 1 or more.

- [ ] **Step 10: Commit the `wrangler.jsonc` changes (database ID, KV id, and route only — never commit secrets)**

```bash
git add wrangler.jsonc
git commit -m "Point wrangler.jsonc at provisioned D1 database, KV namespace, and hello.sumindu.me route

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 10b: Commit the Step 6b vars relocation separately (`wrangler.jsonc`, `vitest.config.ts`; `.dev.vars` stays untracked)**

```bash
git add wrangler.jsonc vitest.config.ts
git commit -m "Move dev-only secret placeholders out of deployed wrangler.jsonc

Cloudflare rejects a secret and a var sharing a binding name, and
wrangler deploy was clobbering the just-set production secrets with
these placeholders. Relocated to vitest.config.ts miniflare bindings
(for npm test) and .dev.vars (for wrangler dev, already git-ignored).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: Create and push the GitHub repository

**Files:** none (repository operations only)

- [ ] **Step 1: Check whether GitHub CLI is installed**

Run: `gh --version`
If not found, run: `winget install --id GitHub.cli -e` and open a new terminal.

- [ ] **Step 2: Authenticate**

Run: `gh auth login` and follow the browser device-code flow (choose GitHub.com, HTTPS, and authenticate via browser).

- [ ] **Step 3: Verify authentication**

Run: `gh auth status`
Expected: shows a logged-in account.

- [ ] **Step 4: Create the repository and push the existing local commits**

From the project root (which already has commits from the spec and this plan):

```bash
gh repo create cf-hello-world-test --public --source=. --remote=origin --push
```

- [ ] **Step 5: Verify**

Run: `gh repo view --web` (or `gh repo view` for a text summary) and confirm the commits are present on GitHub.

---

## Task 13: GitHub Actions CI/CD pipeline

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create `.github/workflows/deploy.yml`**

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - run: npm ci

      - run: npm test

      - name: Run D1 migrations
        run: npx wrangler d1 migrations apply DB --remote
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

      - name: Deploy
        run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

- [ ] **Step 2: Set the `CLOUDFLARE_API_TOKEN` GitHub Actions secret**

Run (reads the value from your already-configured local environment variable, so it is never typed or displayed):

```bash
gh secret set CLOUDFLARE_API_TOKEN --body "$CLOUDFLARE_API_TOKEN" --repo cf-hello-world-test
```

- [ ] **Step 3: Commit and push to trigger the pipeline**

```bash
git add .github/workflows/deploy.yml
git commit -m "Add GitHub Actions pipeline: test, migrate, deploy on push to main

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
git push
```

- [ ] **Step 4: Watch the run and confirm it succeeds**

Run: `gh run watch`
Expected: the run completes with a green checkmark for all three steps (test, migrate, deploy).

---

## Task 14: Production end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Verify the page loads and the counter is live**

```bash
curl -s https://hello.sumindu.me/ | grep -o 'viewed <span class="count">[0-9]*</span> times'
curl -s https://hello.sumindu.me/ | grep -o 'viewed <span class="count">[0-9]*</span> times'
```

Expected: the second count is one higher than the first.

- [ ] **Step 2: Verify image upload against production**

```bash
curl -s -X POST https://hello.sumindu.me/upload \
  -F "image=@public/icons/icon.svg;type=image/svg+xml"
```

Note: the route currently validates `content-type` starts with `image/`, which `image/svg+xml` satisfies. Expect a JSON response with a `url` field. Note also: image storage is Workers KV, which is eventually consistent — if the immediate GET below returns 404, wait a few seconds and retry once before treating it as a real failure. Then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://hello.sumindu.me$(curl -s -X POST https://hello.sumindu.me/upload -F 'image=@public/icons/icon.svg;type=image/svg+xml' | grep -o '"url":"[^"]*"' | cut -d'"' -f4)"
```

Expected: `200`.

- [ ] **Step 3: Manually verify push notifications against production**

In a real browser, visit `https://hello.sumindu.me/`, click "Enable notifications" under group `all`. Then:

```bash
curl -X POST https://hello.sumindu.me/admin/notify \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: <the value you set in Task 11 Step 7>" \
  -d '{"group":"all","title":"It works","body":"Production push test"}'
```

Confirm the browser receives the notification. Repeat with a `testers`-group subscriber and confirm an `all`-only send does not reach it.

- [ ] **Step 4: Run a Lighthouse check as a sanity check (not a hard gate)**

In Chrome DevTools, open Lighthouse, run the "Performance" and "PWA" categories against `https://hello.sumindu.me/`. Note the scores; if Performance is unexpectedly poor, revisit the Global Constraints section of this plan (payload size, external dependencies) before considering the project done.

- [ ] **Step 5: Update the spec/plan status — no code changes needed if all checks pass. If any check fails, return to the relevant task above, fix, commit, and redeploy (push to `main` re-triggers the pipeline from Task 13).**
