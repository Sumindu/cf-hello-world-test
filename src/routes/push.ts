import type { Context } from "hono";
import type { Env } from "../index";
import { addSubscription, getSubscriptionsByGroup } from "../lib/db";
import webpush from "web-push";

export async function vapidPublicKeyRoute(c: Context<{ Bindings: Env }>) {
  return c.json({ publicKey: c.env.VAPID_PUBLIC_KEY });
}

type SubscribeBody = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  group?: string;
};

export async function subscribeRoute(c: Context<{ Bindings: Env }>) {
  let body: SubscribeBody;
  try {
    body = await c.req.json<SubscribeBody>();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
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

type NotifyBody = { group?: string; title: string; body: string };

export async function notifyRoute(c: Context<{ Bindings: Env }>) {
  // An unbound secret must fail closed: without the first check, a missing
  // header would compare undefined !== undefined and be treated as authorized.
  if (
    !c.env.ADMIN_NOTIFY_SECRET ||
    c.req.header("X-Admin-Secret") !== c.env.ADMIN_NOTIFY_SECRET
  ) {
    return c.json({ error: "unauthorized" }, 401);
  }

  let body: NotifyBody;
  try {
    body = await c.req.json<NotifyBody>();
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }

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
