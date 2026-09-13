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
