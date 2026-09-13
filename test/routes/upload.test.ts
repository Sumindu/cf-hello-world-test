import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

function makeImageFile(): File {
  // 1x1 transparent PNG
  const bytes = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    ),
    (c) => c.charCodeAt(0)
  );
  return new File([bytes], "pixel.png", { type: "image/png" });
}

describe("POST /upload and GET /image/*", () => {
  it("stores an uploaded image and serves it back", async () => {
    const body = new FormData();
    body.append("image", makeImageFile());

    const uploadResponse = await exports.default.fetch("https://example.com/upload", {
      method: "POST",
      body,
    });
    expect(uploadResponse.status).toBe(200);
    const { url } = await uploadResponse.json<{ url: string }>();
    expect(url).toMatch(/^\/image\/img\/.+\.png$/);

    const imageResponse = await exports.default.fetch(`https://example.com${url}`);
    expect(imageResponse.status).toBe(200);
    expect(imageResponse.headers.get("content-type")).toBe("image/png");
    expect(imageResponse.headers.get("cache-control")).toContain("immutable");
  });

  it("rejects non-image uploads", async () => {
    const body = new FormData();
    body.append("image", new File(["hello"], "not-image.txt", { type: "text/plain" }));

    const response = await exports.default.fetch("https://example.com/upload", {
      method: "POST",
      body,
    });
    expect(response.status).toBe(415);
  });

  it("generates time-sortable keys so the gallery can show recent uploads", async () => {
    async function upload(): Promise<string> {
      const body = new FormData();
      body.append("image", makeImageFile());
      const response = await exports.default.fetch("https://example.com/upload", {
        method: "POST",
        body,
      });
      const { key } = await response.json<{ key: string }>();
      return key;
    }

    const first = await upload();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await upload();

    // img/<13-digit ms timestamp>-<uuid>.<ext>
    const pattern = /^img\/(\d{13})-[0-9a-f-]{36}\.png$/;
    const firstMatch = first.match(pattern);
    const secondMatch = second.match(pattern);
    expect(firstMatch).not.toBeNull();
    expect(secondMatch).not.toBeNull();

    const firstTs = Number(firstMatch![1]);
    const secondTs = Number(secondMatch![1]);
    // Timestamps are real and non-decreasing, so lexicographic sort is chronological.
    expect(Math.abs(Date.now() - firstTs)).toBeLessThan(60_000);
    expect(secondTs).toBeGreaterThanOrEqual(firstTs);
  });

  it("rejects an image/* type that is not on the allowlist", async () => {
    const body = new FormData();
    body.append("image", new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }));

    const response = await exports.default.fetch("https://example.com/upload", {
      method: "POST",
      body,
    });
    expect(response.status).toBe(415);
  });

  it("rejects a Content-Type crafted to break out of the img src attribute", async () => {
    const body = new FormData();
    body.append(
      "image",
      new File([makeImageFile()], "evil.png", { type: 'image/png" onerror="alert(1)' })
    );

    const response = await exports.default.fetch("https://example.com/upload", {
      method: "POST",
      body,
    });
    expect(response.status).toBe(415);

    // The malicious type must never reach the gallery markup.
    const home = await exports.default.fetch("https://example.com/");
    expect(await home.text()).not.toContain("onerror=");
  });

  it("rejects an upload larger than 2MB", async () => {
    const body = new FormData();
    body.append(
      "image",
      new File([new Uint8Array(3 * 1024 * 1024)], "big.png", { type: "image/png" })
    );

    const response = await exports.default.fetch("https://example.com/upload", {
      method: "POST",
      body,
    });
    expect(response.status).toBe(413);
  });

  it("rejects a request with no image field", async () => {
    const response = await exports.default.fetch("https://example.com/upload", {
      method: "POST",
      body: new FormData(),
    });
    expect(response.status).toBe(400);
  });

  it("returns 404 for a missing image key", async () => {
    const response = await exports.default.fetch("https://example.com/image/img/missing.png");
    expect(response.status).toBe(404);
  });
});
