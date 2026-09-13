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

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

const subscribeBtn = document.getElementById("subscribe-btn");
const notifStatus = document.getElementById("notif-status");
subscribeBtn.addEventListener("click", async () => {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    notifStatus.textContent = "Push notifications are not supported in this browser.";
    return;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const { publicKey } = await fetch("/vapid-public-key").then((r) => r.json());
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const group = document.getElementById("group-select").value;
    await fetch("/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...subscription.toJSON(), group }),
    });
    notifStatus.textContent = `Subscribed to "${group}" notifications.`;
    subscribeBtn.disabled = true;
  } catch (err) {
    notifStatus.textContent = "Could not enable notifications.";
  }
});
