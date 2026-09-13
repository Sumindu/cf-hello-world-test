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
          bindings: {
            TEST_MIGRATIONS: migrations,
            ADMIN_NOTIFY_SECRET: "dev-only-admin-secret",
            VAPID_PUBLIC_KEY: "dev-only-public-key",
            VAPID_PRIVATE_KEY: "dev-only-private-key",
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./test/setup-web-push.ts", "./test/apply-migrations.ts"],
    },
  };
});
