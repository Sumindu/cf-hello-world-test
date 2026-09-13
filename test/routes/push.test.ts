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
