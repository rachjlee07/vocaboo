// Shows Vocaboo reminders when the app is closed.
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");
importScripts("config.js");
firebase.initializeApp(self.WW_CONFIG.firebase);
const messaging = firebase.messaging();
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = (event.notification.data && (event.notification.data.link || (event.notification.data.FCM_MSG && event.notification.data.FCM_MSG.data && event.notification.data.FCM_MSG.data.link))) || self.registration.scope;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if (c.url.startsWith(self.registration.scope) && "focus" in c) return c.focus(); }
    return clients.openWindow(url);
  }));
});
