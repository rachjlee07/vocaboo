// Connects the app to Firebase (login + database). Nothing to edit here; settings live in config.js.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const C = window.WW_CONFIG || {};
let app, auth, fs;
if (!C.firebase || /PASTE/.test(C.firebase.apiKey || "PASTE")) {
  window.WW = { error: "Setup isn't finished: paste your Firebase settings into config.js and upload it again." };
  window.dispatchEvent(new Event("ww-ready"));
  throw new Error("config.js not filled in");
}
try {
  app = initializeApp(C.firebase);
  auth = getAuth(app);
  fs = initializeFirestore(app, { localCache: persistentLocalCache() });
} catch (e) {
  window.WW = { error: "Firebase isn't set up yet. Paste your Firebase settings into config.js. (" + e.message + ")" };
  window.dispatchEvent(new Event("ww-ready"));
  throw e;
}
const snap = s => ({ id: s.id, exists: s.exists(), data: () => s.exists() ? s.data() : undefined });
const docRef = p => ({
  path: p, id: p.split("/").pop(),
  get: async () => snap(await getDoc(doc(fs, p))),
  set: d => setDoc(doc(fs, p), d),
  update: d => updateDoc(doc(fs, p), d),
  delete: () => deleteDoc(doc(fs, p)),
  collection: c => collRef(p + "/" + c)
});
const collRef = p => ({
  path: p,
  doc: id => docRef(p + "/" + id),
  get: async () => { const q = await getDocs(collection(fs, p)); const docs = q.docs.map(snap); return { docs, size: docs.length, empty: !docs.length }; }
});
let current = null;
async function enablePush() {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) throw new Error("unsupported");
  if (!C.vapidKey || /PASTE/.test(C.vapidKey)) throw new Error("not-configured");
  const M = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js");
  if (!(await M.isSupported())) throw new Error("unsupported");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("denied");
  const reg = await navigator.serviceWorker.register("firebase-messaging-sw.js");
  await navigator.serviceWorker.ready;
  const messaging = M.getMessaging(app);
  const token = await M.getToken(messaging, { vapidKey: C.vapidKey, serviceWorkerRegistration: reg });
  M.onMessage(messaging, p => { const n = (p && p.notification) || {}; if (window.__toast) window.__toast((n.title ? n.title + " · " : "") + (n.body || "")); });
  return token;
}
let aiModels = null;
async function ask(prompt) {
  if (!aiModels) {
    const V = "13.0.0";
    const [A, AI] = await Promise.all([import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`), import(`https://www.gstatic.com/firebasejs/${V}/firebase-ai.js`)]);
    const app2 = A.initializeApp(C.firebase, "ai");
    const ai = AI.getAI(app2, { backend: new AI.GoogleAIBackend() });
    const names = [C.aiModel, "gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"].filter(Boolean);
    aiModels = names.map(n => AI.getGenerativeModel(ai, { model: n, generationConfig: { responseMimeType: "application/json", temperature: 0.3 } }));
  }
  let lastErr;
  for (let i = 0; i < aiModels.length; i++) {
    try { const r = await aiModels[i].generateContent(prompt); if (i) aiModels = aiModels.slice(i); return r.response.text(); }
    catch (e) { lastErr = e; if (!/not.?found|404|unsupported|is not supported|does not exist/i.test(String(e && (e.message || e)))) throw e; }
  }
  throw lastErr;
}
window.WW = {
  db: { doc: docRef, collection: collRef, batch: async ops => { const b = writeBatch(fs); ops.forEach(o => o.type === "update" ? b.update(doc(fs, o.path), o.data) : b.set(doc(fs, o.path), o.data)); await b.commit(); } },
  teacherUid: String(C.teacherUid || "").trim(),
  user: () => current,
  signIn: async (email, pw) => { await setPersistence(auth, browserLocalPersistence); return signInWithEmailAndPassword(auth, email.trim(), pw); },
  signUp: async (email, pw) => { await setPersistence(auth, browserLocalPersistence); return createUserWithEmailAndPassword(auth, email.trim(), pw); },
  resetPassword: email => sendPasswordResetEmail(auth, email.trim()),
  signOut: () => signOut(auth),
  enablePush,
  pushPermission: () => ("Notification" in window ? Notification.permission : "unsupported"),
  standalone: () => !!(navigator.standalone || matchMedia("(display-mode: standalone)").matches),
  ask,
  onAuth: fn => onAuthStateChanged(auth, u => { current = u; fn(u); })
};
window.dispatchEvent(new Event("ww-ready"));
