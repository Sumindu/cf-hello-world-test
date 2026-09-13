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

  it("returns 404 for a missing image key", async () => {
    const response = await exports.default.fetch("https://example.com/image/img/missing.png");
    expect(response.status).toBe(404);
  });
});
