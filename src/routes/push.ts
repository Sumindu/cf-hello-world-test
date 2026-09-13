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
