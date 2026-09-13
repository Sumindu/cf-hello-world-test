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
