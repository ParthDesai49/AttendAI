// Minimal service worker: lets browsers treat AttendAI as an installable app.
// It does not cache anything, so users always get the latest version.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
