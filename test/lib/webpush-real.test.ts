import { describe, expect, it, vi } from "vitest";

// Every other test file runs against the global web-push mock installed by
// test/setup-web-push.ts. This file deliberately opts out so the REAL library
// runs: it is the only evidence that RFC 8291 payload encryption (ECDH + HKDF +
// AES-GCM via node:crypto) actually works inside workerd under nodejs_compat.
vi.unmock("web-push");

// Ephemeral keys generated with `npx web-push generate-vapid-keys` purely for
// this test. They are not, and must never be, the production keypair.
const TEST_VAPID_PUBLIC_KEY =
  "BH7TX8fHJcF070BvoJu_cj3q9Zatomc-Ddp6b91NkqZE9WT-9e5CO975V1tPsKbQd9pDNrToHn7ZiNFLb62Iy7k";
const TEST_VAPID_PRIVATE_KEY = "NH_ii9hGW0NTYeugl46zy3vaxRWhkcWoOXYpRcPRJT8";

// A real (valid) P-256 public point and 16-byte auth secret, so encryption has
// well-formed inputs. The endpoint is syntactically valid but does not exist.
const FAKE_SUBSCRIPTION = {
  endpoint: "https://fcm.googleapis.com/fcm/send/fake-endpoint-for-testing",
  keys: {
    p256dh:
      "BIG2NH-zwIZAOBr26K77XEXzV4lamcom96CnNfRjfdn0s5DzvwQJdMjVckGjjUU_E-KUIj7Zj-uMjBQkoG43woc",
    auth: "Or6VWhUai_YoNns1QQ4SAg",
  },
};

// Anything that indicates we got past encryption and into (or through) HTTP.
function isNetworkStageOutcome(err: unknown): boolean {
  if (typeof err === "object" && err !== null && "statusCode" in err) {
    // web-push's WebPushError: the request was built, encrypted, sent, and the
    // push service answered (404/410 for this fake endpoint).
    return true;
  }
  const message = err instanceof Error ? err.message : String(err);
  return /fetch|network|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket|dns|getaddrinfo|connect|request to .* failed|Not Found|Gone/i.test(
    message
  );
}

describe("web-push under nodejs_compat (unmocked)", () => {
  it("runs the real RFC 8291 encryption pipeline and fails no earlier than network I/O", async () => {
    const webpush = (await import("web-push")).default;

    // Sanity check: we must be running the real module, not the global mock.
    expect(vi.isMockFunction(webpush.sendNotification)).toBe(false);

    webpush.setVapidDetails(
      "mailto:admin@sumindu.me",
      TEST_VAPID_PUBLIC_KEY,
      TEST_VAPID_PRIVATE_KEY
    );

    let outcome: { ok: true } | { ok: false; error: unknown };
    try {
      await webpush.sendNotification(
        FAKE_SUBSCRIPTION,
        JSON.stringify({ title: "Hi", body: "Hello" })
      );
      outcome = { ok: true };
    } catch (error) {
      outcome = { ok: false, error };
    }

    if (outcome.ok) return; // Encryption + transport both completed.

    // Fail loudly (with the real error) if we never made it out of crypto:
    // that would mean push notifications are broken in production regardless
    // of what the mocked tests say.
    if (!isNetworkStageOutcome(outcome.error)) {
      const err = outcome.error;
      throw new Error(
        `web-push failed before network I/O (crypto/encoding stage): ${
          err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : String(err)
        }`
      );
    }
    expect(isNetworkStageOutcome(outcome.error)).toBe(true);
  });
});
