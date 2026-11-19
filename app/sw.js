// Notifikationer fra Tallo (19. nov 2026): "Othman har svaret". Gemmer intet; siden hentes altid frisk.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = {}; }
  e.waitUntil(self.registration.showNotification(d.titel || "Tallo", {
    body: d.tekst || "Du har en ny besked",
    icon: "ikoner/ikon-192.png",
    badge: "ikoner/ikon-192.png",
    data: { url: d.url || "./" },
    tag: d.url || "tallo",
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "./";
  e.waitUntil((async () => {
    const vinduer = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const v of vinduer) {
      if (new URL(v.url).pathname === new URL(url, self.location.href).pathname) { await v.focus(); return v.navigate(url); }
    }
    return self.clients.openWindow(url);
  })());
});
