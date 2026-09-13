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

  it("shows the most recently uploaded image and evicts the oldest once past the gallery limit", async () => {
    // Regression test for the bug where listImageKeys() paged kv.list() with a
    // limit and then sorted/reversed just that page: with ascending-timestamp
    // keys, kv.list({ prefix, limit }) returns the OLDEST keys first, so the
    // returned page (and therefore the gallery) contained the oldest images
    // instead of the newest ones. Uploading more than the gallery limit (12)
    // and asserting the newest is present while an early one is gone is the
    // only way to catch that: a test that just checks key format (as the old
    // upload.test.ts test did) passes on both the buggy and fixed code.
    const bytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
      ),
      (c) => c.charCodeAt(0)
    );

    async function uploadAndGetUrl(): Promise<string> {
      const body = new FormData();
      body.append("image", new File([bytes], "pixel.png", { type: "image/png" }));
      const response = await exports.default.fetch("https://example.com/upload", {
        method: "POST",
        body,
      });
      const { url } = await response.json<{ url: string }>();
      return url;
    }

    const urls: string[] = [];
    // Gallery limit is 12; upload 15 so the first few must be evicted from
    // the top-12 window if the ordering is correct.
    for (let i = 0; i < 15; i++) {
      urls.push(await uploadAndGetUrl());
      // Ensure distinct millisecond timestamps so key ordering is unambiguous.
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const firstUrl = urls[0];
    const lastUrl = urls[urls.length - 1];

    const homeResponse = await exports.default.fetch("https://example.com/");
    expect(homeResponse.status).toBe(200);
    const homeBody = await homeResponse.text();

    // The most recently uploaded image must appear in the gallery.
    expect(homeBody).toContain(`src="${lastUrl}"`);
    // The first (oldest) of the 15 uploads must have been evicted from the
    // top-12 newest window.
    expect(homeBody).not.toContain(`src="${firstUrl}"`);
  });
});
