// Bishop Ogez SMIS service worker: makes the system installable ("Add to home screen") and shows a friendly page
// when a screen is opened without internet. It does NOT cache school data — everything always comes fresh from the server.
const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>No internet</title><style>body{font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;background:#f8fafc;color:#0f172a;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
.c{max-width:380px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;text-align:center}h1{font-size:20px;margin:0 0 8px}p{color:#475569;line-height:1.5}
button{margin-top:12px;background:#1e3a8a;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:16px}</style></head>
<body><div class="c"><h1>No internet connection</h1><p>The school system needs the internet to open this page. Marks you already typed are kept on this phone or computer until you save them.</p>
<button onclick="location.reload()">Try again</button></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return; // let the browser handle everything else normally
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
