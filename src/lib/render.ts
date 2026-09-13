export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderHomePage(opts: { visitCount: number; imageKeys: string[] }): string {
  const gallery = opts.imageKeys
    .map(
      (key) =>
        `<img src="/image/${escapeHtml(key)}" alt="Uploaded photo" loading="lazy" width="160" height="160" class="thumb">`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hello, Cloudflare</title>
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#0b5fff">
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#111; --accent:#0b5fff; --border:#ddd; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0b0b0c; --fg:#eee; --border:#333; } }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px 16px; background:var(--bg); color:var(--fg); font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height:1.5; }
  main { max-width: 640px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 4px; }
  .count { color: var(--accent); font-weight: 600; }
  section { margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--border); }
  .gallery { display:grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap:8px; margin-top:12px; }
  .thumb { width:100%; height:80px; object-fit:cover; border-radius:6px; background:var(--border); }
  form { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
  input[type=file] { flex:1; min-width:180px; }
  button { background:var(--accent); color:#fff; border:0; border-radius:6px; padding:10px 16px; font-size:1rem; cursor:pointer; }
  button:disabled { opacity:.6; cursor:default; }
  select { padding:6px; border-radius:6px; border:1px solid var(--border); background:var(--bg); color:var(--fg); }
  #notif-status { font-size:.9rem; opacity:.8; margin-top:8px; }
</style>
</head>
<body>
<main>
  <h1>👋 Hello from Cloudflare Workers</h1>
  <p>This page has been viewed <span class="count">${opts.visitCount}</span> times.</p>

  <section id="gallery-section">
    <h2>Photo gallery</h2>
    <form id="upload-form">
      <input type="file" name="image" accept="image/*" required>
      <button type="submit">Upload</button>
    </form>
    <div class="gallery" id="gallery">${gallery}</div>
  </section>

  <section id="notify-section">
    <h2>Notifications</h2>
    <label for="group-select">Group</label>
    <select id="group-select">
      <option value="all" selected>all</option>
      <option value="testers">testers</option>
    </select>
    <button id="subscribe-btn">Enable notifications</button>
    <p id="notif-status"></p>
  </section>
</main>
<script src="/client.js" defer></script>
</body>
</html>`;
}
