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
