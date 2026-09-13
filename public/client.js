if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

async function compressImage(file, maxDim = 1280, quality = 0.75) {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
}

const uploadForm = document.getElementById("upload-form");
uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = uploadForm.querySelector("input[type=file]");
  const file = input.files[0];
  if (!file) return;

  const button = uploadForm.querySelector("button");
  button.disabled = true;
  try {
    const compressed = await compressImage(file);
    const body = new FormData();
    body.append("image", compressed);
    const response = await fetch("/upload", { method: "POST", body });
    if (!response.ok) throw new Error("upload failed");
    const { url } = await response.json();

    const img = document.createElement("img");
    img.src = url;
    img.loading = "lazy";
    img.width = 160;
    img.height = 160;
    img.className = "thumb";
    img.alt = "Uploaded photo";
    document.getElementById("gallery").prepend(img);
    uploadForm.reset();
  } catch (err) {
    alert("Upload failed. Please try a smaller image.");
  } finally {
    button.disabled = false;
  }
});
