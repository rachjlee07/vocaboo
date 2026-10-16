// Connects the app to Firebase (login + database). Nothing to edit here; settings live in config.js.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
window.WW = {
  db: { doc: docRef, collection: collRef },
  teacherUid: String(C.teacherUid || "").trim(),
  user: () => current,
  signIn: async (email, pw) => { await setPersistence(auth, browserLocalPersistence); return signInWithEmailAndPassword(auth, email.trim(), pw); },
  signOut: () => signOut(auth),
  onAuth: fn => onAuthStateChanged(auth, u => { current = u; fn(u); })
};
window.dispatchEvent(new Event("ww-ready"));
