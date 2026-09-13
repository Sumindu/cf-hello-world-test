declare namespace Cloudflare {
  // Tells workers-types what `exports` from "cloudflare:workers" contains, so
  // `exports.default.fetch(...)` in tests is typed instead of erroring.
  interface GlobalProps {
    mainModule: typeof import("../src/index");
  }

  interface Env {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    DB: D1Database;
    IMAGES_KV: KVNamespace;
    ASSETS: Fetcher;
    ADMIN_NOTIFY_SECRET: string;
    VAPID_PUBLIC_KEY: string;
    VAPID_PRIVATE_KEY: string;
  }
}
