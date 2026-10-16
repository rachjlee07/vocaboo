(function(){
"use strict";
/* ---------- data ---------- */
const BANK = window.__BANK__;
const BY = {};            // id -> entry
const idOf = w => w.toLowerCase().replace(/[^a-z0-9]+/g, "_");
BANK.forEach((e, i) => { e.id = idOf(e.w); e.i = i; BY[e.id] = e;
  const c = e.src.find(s => s[0] === "C"); e.cu = c ? +c.slice(1) : 0;
  e.book = e.src[0][0]; });
BANK.forEach(e => { if (!e.senses) e.senses = [{ pos: e.pos, ko: e.ko, def: e.def }]; e.posAll = [...new Set(e.senses.map(x => x.pos))].join(" · "); });
const QUEUE = BANK.filter(e => e.cu).sort((a, b) => a.cu - b.cu || a.i - b.i);

const DEFAULT_CFG = { startUnit: 18, newPerWeek: 20, reviewPerWeek: 10, hints: true, passPct: 80, speak: true };
const INTERVALS = [0, 1, 2, 4, 7, 14, 30];
const MASTER_BOX = 4;

/* ---------- utils ---------- */
const $app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const dstr = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const today = () => dstr(new Date());
const addDays = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return dstr(d); };
function weekKey(at) { // weeks start Saturday 12:00 (after class)
  const d = at ? new Date(at) : new Date();
  const sat = new Date(d); sat.setHours(12, 0, 0, 0);
  sat.setDate(sat.getDate() - ((d.getDay() + 1) % 7));
  if (d < sat) sat.setDate(sat.getDate() - 7);
  return dstr(sat);
}
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const norm = s => String(s || "").toLowerCase().trim().replace(/[’‘`]/g, "'").replace(/\s+/g, " ");
function lev(a, b) { const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i]); for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
const fmtMin = s => Math.round((s || 0) / 60);
const actSec = s => Math.max(s.activeSec || 0, Math.min(((s.last || s.start) - s.start) / 1000, (s.activeSec || 0) + 60));
const timeOf = ts => { const d = new Date(ts); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function toast(msg) { const t = document.getElementById("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 2200); }
const ICON_SPK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const ICON_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const TYPE_NAME = { mc_ko: "Choose Korean meaning", mc_def: "Choose word from definition", ko_en: "Korean → type English", def_en: "Definition → type word", dict: "Dictation (hear → type)", train: "Training (cover & write)", say: "Say the word", saysent: "Read the sentence" };

/* ---------- speech ---------- */
let VOICE = null;
let VOICES = [];
const vScore = v => (/Premium/i.test(v.name) ? 0 : /Enhanced/i.test(v.name) ? 1 : /Ava|Zoe|Evan|Nathan|Samantha|Allison|Google US English/i.test(v.name) ? 2 : 3);
function pickVoice() { if (!("speechSynthesis" in window)) return;
  VOICES = speechSynthesis.getVoices().filter(v => /^en[-_]US/i.test(v.lang) && !/Eloquence|Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Ralph|Kathy|Grandpa|Grandma|Rocko|Shelley|Flo|Reed|Sandy/i.test(v.name)).sort((a, b) => vScore(a) - vScore(b));
  let saved = null; try { saved = localStorage.getItem("ww_voice"); } catch (e) {}
  VOICE = VOICES.find(v => v.name === saved) || VOICES[0] || null; }
function voicePicker() { if (!VOICES.length) return "";
  return `<div class="card"><h3>Backup voice</h3><div class="field"><label for="voiceSel">Phone voice (used only when a recording is missing)</label><select id="voiceSel" data-change="voice">${VOICES.map(v => `<option value="${esc(v.name)}" ${VOICE && v.name === VOICE.name ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></div>
  <p class="muted small">Voices marked Enhanced or Premium sound best.</p></div>`; }
if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function say(text, rate) { if (!("speechSynthesis" in window)) { toast("Sound isn't available on this device"); return; }
  speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = "en-US"; if (VOICE) u.voice = VOICE; u.rate = rate || 0.9; speechSynthesis.speak(u); }
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let srBroken = !SR;
const SPEAK = new Set(["say", "saysent"]);

/* ---------- db ---------- */
let db = null, user = null, ME = null, IS_OWNER = false;
const qmap = new Map();
function write(ref, fn) { const k = ref.path; const p = (qmap.get(k) || Promise.resolve()).then(fn).catch(e => { console.warn("write failed", k, e); if (e && e.code === "quota_exceeded") toast("Storage is full — tell your teacher"); });
  qmap.set(k, p); return p; }
const setDoc = (path, data) => { const r = db.doc(path); return write(r, () => r.set(data)); };
const updDoc = (path, data) => { const r = db.doc(path); return write(r, () => r.update(data)); };
async function getAll(coll) { const s = await db.collection(coll).get(); return s.docs.map(d => Object.assign({ _id: d.id }, d.data())); }
const clone = o => JSON.parse(JSON.stringify(o));

/* ---------- state ---------- */
let CFG = Object.assign({}, DEFAULT_CFG);
let SID = null, ST = null, WORDS = {}; // student id, student doc, word docs
let mode = "student";
let view = { name: "loading" };

function newStudent(test) { return { created: Date.now(), test: !!test, placement: { done: false }, reviewPool: [], week: null, lock: { on: false, ids: [] }, streak: { count: 0, best: 0, last: "" }, quizSize: 15, sizeLog: [] }; }
const sPath = () => "students/" + SID;
const saveST = () => setDoc(sPath(), clone(ST));
function wordDoc(id) { return WORDS[id] || (WORDS[id] = { box: 0, due: today(), right: 0, wrong: 0, seen: 0, hist: [], wrongAns: [] }); }
const saveWord = id => setDoc(sPath() + "/words/" + id, clone(WORDS[id]));
const isMastered = id => (WORDS[id] && WORDS[id].box >= MASTER_BOX);

/* ---------- weekly batch ---------- */
function buildWeek(st, words, cfg, force) {
  const key = weekKey();
  if (!force && st.week && st.week.key === key) return false;
  const prev = st.week;
  const used = new Set(Object.keys(words));
  (st.history || []).forEach(h => h.newIds.forEach(i => used.add(i)));
  if (prev) prev.newIds.forEach(i => used.add(i));
  const newIds = [];
  for (const e of QUEUE) { if (newIds.length >= cfg.newPerWeek) break; if (e.cu < cfg.startUnit || used.has(e.id)) continue; newIds.push(e.id); }
  const rev = []; const take = id => { if (!rev.includes(id) && !newIds.includes(id) && BY[id]) rev.push(id); };
  // 1) words still weak from last week, 2) placement misses, 3) weakest learned words, 4) earlier units
  if (prev) prev.newIds.concat(prev.reviewIds).filter(id => words[id] && words[id].box < 3).sort((a, b) => (words[b].wrong - words[b].right) - (words[a].wrong - words[a].right)).forEach(id => rev.length < cfg.reviewPerWeek && take(id));
  while (rev.length < cfg.reviewPerWeek && st.reviewPool.length) take(st.reviewPool.shift());
  Object.keys(words).filter(id => words[id].box < MASTER_BOX).sort((a, b) => words[a].box - words[b].box || words[b].wrong - words[a].wrong).forEach(id => rev.length < cfg.reviewPerWeek && take(id));
  if (rev.length < cfg.reviewPerWeek) shuffle(QUEUE.filter(e => e.cu < cfg.startUnit && !words[e.id])).forEach(e => rev.length < cfg.reviewPerWeek && take(e.id));
  if (prev) { st.history = (st.history || []).concat([{ key: prev.key, newIds: prev.newIds, reviewIds: prev.reviewIds }]).slice(-40); }
  st.week = { key, newIds, reviewIds: rev, introDone: false, trained: [], created: Date.now() };
  return true;
}
function growQuiz(st, attempts) {
  const prevKey = addDays(weekKey(), -7);
  if (st.sizeCheckedFor === prevKey) return;
  st.sizeCheckedFor = prevKey;
  const qs = attempts.filter(a => a.kind === "quiz" && a.weekKey === prevKey && a.end);
  if (qs.length < 5 || st.quizSize >= 30) return;
  const acc = qs.reduce((s, a) => s + a.score, 0) / qs.length;
  const ms = qs.flatMap(a => a.items.map(i => i.ms)).sort((a, b) => a - b); const med = ms[Math.floor(ms.length / 2)] || 99999;
  if (acc >= 0.8 && med < 9000) { st.quizSize = Math.min(30, st.quizSize + 5); st.sizeLog = (st.sizeLog || []).concat([{ week: prevKey, to: st.quizSize, acc: Math.round(acc * 100), med }]); }
}
const weekIds = () => ST.week ? ST.week.newIds.concat(ST.week.reviewIds) : [];

/* ---------- session tracking ---------- */
let SESSION = null, lastAct = Date.now(), hbTimer = null, hiddenAt = 0;
function startSession() {
  SESSION = { id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), start: Date.now(), last: Date.now(), activeSec: 0, day: today(), weekKey: weekKey(), did: [] };
  setDoc(sPath() + "/sessions/" + SESSION.id, clone(SESSION));
}
function logDid(what) { if (!SESSION) return; SESSION.did.push(what); SESSION.last = Date.now(); setDoc(sPath() + "/sessions/" + SESSION.id, clone(SESSION)); }
function heartbeat() { if (!SESSION || document.hidden) return; if (Date.now() - lastAct > 90000) return; SESSION.activeSec += 30; SESSION.last = Date.now(); setDoc(sPath() + "/sessions/" + SESSION.id, clone(SESSION)); }
let tracking = false;
function trackStudent() {
  if (tracking) { startSession(); hbTimer = setInterval(heartbeat, 30000); return; } tracking = true;
  ["pointerdown", "keydown"].forEach(ev => document.addEventListener(ev, () => lastAct = Date.now(), { passive: true }));
  document.addEventListener("visibilitychange", () => { if (document.hidden) { hiddenAt = Date.now(); if (SESSION) { SESSION.last = Date.now(); setDoc(sPath() + "/sessions/" + SESSION.id, clone(SESSION)); } }
    else if (hiddenAt && Date.now() - hiddenAt > 10 * 60000) { startSession(); } });
  startSession(); hbTimer = setInterval(heartbeat, 30000);
}

/* ---------- attempts ---------- */
let ATT = null;
function startAttempt(kind, extra) { ATT = Object.assign({ id: "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), kind, start: Date.now(), day: today(), weekKey: weekKey(), items: [] }, extra || {}); return ATT; }
function saveAttempt() { if (ATT) setDoc(sPath() + "/attempts/" + ATT.id, clone(ATT)); }
function record(id, t, ok, ans, ms) {
  ATT.items.push({ id, t, ok: !!ok, ans: ans == null ? "" : String(ans).slice(0, 40), ms: Math.round(ms || 0) });
  if (ATT.kind === "placement") return;
  const w = wordDoc(id); w.seen++; w.last = Date.now();
  if (!SPEAK.has(t)) { if (ok) w.right++; else { w.wrong++; if (ans && t !== "mc_ko" && t !== "mc_def") w.wrongAns = (w.wrongAns || []).concat([String(ans).slice(0, 30)]).slice(-6); } }
  w.hist = (w.hist || []).concat([(ok ? "1" : "0") + t]).slice(-12);
  if (ATT.kind === "quiz") { if (ok) w.box = Math.min(6, w.box + 1); else w.box = 0; w.due = addDays(today(), INTERVALS[w.box]); }
  saveWord(id);
  if (ATT.items.length % 5 === 0) saveAttempt();
}

/* ---------- question builders ---------- */
function stageOf(id) { return (WORDS[id] && WORDS[id].box >= 2) ? 2 : 1; }
function distract(e, key, n, poolIds) {
  const pool = shuffle((poolIds || []).map(i => BY[i]).filter(x => x && x.id !== e.id).concat(shuffle(BANK).slice(0, 80)));
  const out = [], seen = new Set([e[key]]);
  for (const x of pool.filter(x => x.pos === e.pos).concat(pool)) { if (out.length >= n) break; if (seen.has(x[key])) continue; seen.add(x[key]); out.push(x); }
  return out;
}
function makeQ(id, t, poolIds) {
  const e = BY[id]; const q = { id, t };
  if (t === "mc_ko") { q.opts = shuffle([e].concat(distract(e, "ko", 3, poolIds))).map(x => ({ id: x.id, label: x.ko })); }
  if (t === "mc_def") { q.opts = shuffle([e].concat(distract(e, "w", 3, poolIds))).map(x => ({ id: x.id, label: x.w })); }
  return q;
}
function pickTypes(n, ids) {
  // even spread of recall, dictation, recognition; recall gets the most weight
  const plan = []; const base = ["ko_en", "dict", "mc", "def_or_ko", "dict", "ko_en", "mc", "def_or_ko"];
  for (let i = 0; i < n; i++) plan.push(base[i % base.length]);
  return shuffle(plan).map((p, i) => { const st = stageOf(ids[i]);
    if (p === "mc") return st === 1 ? "mc_ko" : "mc_def";
    if (p === "def_or_ko") return st === 1 ? "ko_en" : "def_en";
    return p; });
}
function buildQuiz() {
  const n = ST.quizSize || 15; const wk = weekIds();
  const due = Object.keys(WORDS).filter(id => !wk.includes(id) && WORDS[id].due <= today()).sort((a, b) => WORDS[a].box - WORDS[b].box);
  const wkSorted = shuffle(wk).sort((a, b) => (WORDS[a] ? WORDS[a].box : 0) - (WORDS[b] ? WORDS[b].box : 0));
  const nOld = Math.min(due.length, Math.round(n * 0.3));
  let ids = wkSorted.slice(0, n - nOld).concat(due.slice(0, nOld));
  let k = 0; while (ids.length < n && wk.length) ids.push(wkSorted[k++ % wkSorted.length]);
  ids = shuffle(ids);
  const types = pickTypes(ids.length, ids);
  return ids.map((id, i) => makeQ(id, types[i], wk));
}
function buildPlacement() {
  const pick = (arr, n) => shuffle(arr).slice(0, n);
  const A = BANK.filter(e => e.book === "A"), B = BANK.filter(e => e.book === "B");
  const C = BANK.filter(e => e.book === "C" && e.cu < CFG.startUnit);
  const ids = pick(A, 10).concat(pick(B, 15)).concat(pick(C, 35)).map(e => e.id);
  return shuffle(ids).map((id, i) => makeQ(id, i % 2 ? "mc_ko" : "ko_en", ids));
}


/* ---------- recorded audio ---------- */
const PACKS = {}, PACK_LOADING = {};
const packOf = id => BY[id] ? BY[id].src[0] : null;
function loadPack(name) {
  if (!name) return Promise.resolve();
  if (PACKS[name]) return Promise.resolve(PACKS[name]);
  if (!PACK_LOADING[name]) PACK_LOADING[name] = fetch("audio/" + name + ".json").then(r => r.ok ? r.json() : {}).catch(() => ({})).then(j => (PACKS[name] = j));
  return PACK_LOADING[name];
}
const loadPacksFor = ids => Promise.all([...new Set(ids.map(packOf))].map(loadPack));
const player = new Audio(); player.preload = "auto";
let unlocked = false;
document.addEventListener("pointerdown", () => { if (unlocked) return; unlocked = true;
  try { player.src = "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//OEwAAAAAAAAAAAAEluZm8AAAAPAAAABQAAAqAAbW1tbW1tbW1tbW1tbW1tbW1tbZKSkpKSkpKSkpKSkpKSkpKSkpKStra2tra2tra2tra2tra2tra2trbb29vb29vb29vb29vb29vb29vb2///////////////////////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQEUAAAAAAAAAKgvT9A1gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//NExAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMu//NExFMAAANIAAAAADEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMu//NExKYAAANIAAAAADEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NExKwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NExKwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV"; player.play().catch(() => {}); } catch (e) {} }, { capture: true });
function clipFor(id, tag) { const p = PACKS[packOf(id)]; return p && p[id] && p[id][tag] ? "data:audio/mpeg;base64," + p[id][tag] : null; }
function speak(id, tag) {
  const e = BY[id]; if (!e) return;
  const text = tag === "w" || tag === "s" ? e.w : e.ex[+tag.slice(1)];
  const rate = tag === "s" ? 0.55 : 0.9;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  const src = clipFor(id, tag);
  if (src) { try { player.pause(); player.src = src; player.playbackRate = 1; const p = player.play(); if (p) p.catch(() => say(text, rate)); return; } catch (err) {} }
  else loadPack(packOf(id));
  say(text, rate);
}
function stopAudio() { try { player.pause(); } catch (e) {} if ("speechSynthesis" in window) speechSynthesis.cancel(); }
const spk = (id, tag, label, cls) => `<button class="${cls || "round"} ${label ? "icon-l" : ""}" data-act="speak" data-id="${id}" data-tag="${tag}" aria-label="${label || "Listen"}">${ICON_SPK}${label ? " " + label : ""}</button>`;


/* ---------- icons & art ---------- */
const I = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/></svg>',
  cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><rect x="3" y="6" width="13" height="15" rx="3"/><path d="M8 3h10a3 3 0 0 1 3 3v12"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 1-3.5S9 11 10.5 11C10.5 7 12 2 12 2z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21l1.4-7L2 9.3l7-.8z"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><path d="m4 20 4-1 11-11-3-3L5 16z"/></svg>',
  ear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="m9 5 7 7-7 7"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="m15 5-7 7 7 7"/></svg>'
};
function buddy(mood, size, body) { // original mascot: a word-card buddy
  const s = size || 96, c = body || "#FFC93C";
  const mouth = mood === "sad" ? '<path d="M38 66q10-7 20 0" stroke="#3B2A00" stroke-width="4" fill="none" stroke-linecap="round"/>'
    : mood === "wow" ? '<ellipse cx="48" cy="64" rx="7" ry="8" fill="#3B2A00"/>' : '<path d="M36 60q12 12 24 0" stroke="#3B2A00" stroke-width="4" fill="none" stroke-linecap="round"/>';
  return `<svg width="${s}" height="${s}" viewBox="0 0 96 96" aria-hidden="true"><rect x="10" y="12" width="76" height="76" rx="26" fill="rgba(0,0,0,.12)" transform="translate(3 4)"/><rect x="10" y="10" width="76" height="76" rx="26" fill="${c}"/><path d="M66 10h8v22l-4-4-4 4z" fill="#FF6B5B"/><circle cx="37" cy="44" r="5" fill="#3B2A00"/><circle cx="59" cy="44" r="5" fill="#3B2A00"/><circle cx="29" cy="56" r="4" fill="#FF9F8F" opacity=".7"/><circle cx="67" cy="56" r="4" fill="#FF9F8F" opacity=".7"/>${mouth}</svg>`;
}
const ART = {
  train: '<svg viewBox="0 0 120 120"><rect width="120" height="120" fill="#ECE8FF"/><circle cx="96" cy="22" r="30" fill="#FFC93C" opacity=".55"/><rect x="26" y="34" width="56" height="66" rx="12" fill="#7B61FF" transform="rotate(-10 54 67)"/><rect x="40" y="28" width="56" height="66" rx="12" fill="#5B3FD9"/><path d="M52 52h32M52 64h24M52 76h28" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>',
  quiz: '<svg viewBox="0 0 120 120"><rect width="120" height="120" fill="#FFF4D6"/><circle cx="24" cy="100" r="34" fill="#FF6B5B" opacity=".35"/><circle cx="64" cy="58" r="34" fill="#FFC93C"/><path d="m48 58 11 11 21-23" stroke="#5A3D00" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lock: '<svg viewBox="0 0 120 120"><rect width="120" height="120" fill="#EEECF4"/><circle cx="60" cy="62" r="32" fill="#D9D4EA"/><rect x="44" y="58" width="32" height="24" rx="6" fill="#9E97B8"/><path d="M50 58v-8a10 10 0 0 1 20 0v8" stroke="#9E97B8" stroke-width="6" fill="none"/></svg>',
  bonus: '<svg viewBox="0 0 120 120"><rect width="120" height="120" fill="#DBF5EE"/><circle cx="92" cy="92" r="36" fill="#1FA98F" opacity=".35"/><path d="m60 26 9 19 21 3-15 14 4 21-19-10-19 10 4-21-15-14 21-3z" fill="#1FA98F"/></svg>',
  done: '<svg viewBox="0 0 120 120"><rect width="120" height="120" fill="#DBF5EE"/><circle cx="60" cy="60" r="32" fill="#1FA98F"/><path d="m45 61 10 10 21-22" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

/* ---------- charts ---------- */
function barChart(vals, labels, o) {
  o = o || {}; const W = Math.max(280, labels.length * 44), H = 170, top = 22, bot = 26, max = Math.max(o.min || 1, ...vals);
  const bw = Math.min(26, (W / labels.length) * 0.55);
  const bars = vals.map((v, i) => { const cx = (i + 0.5) * W / labels.length; const h = (H - top - bot) * (v / max); const y = H - bot - h;
    const col = i === o.hi ? (o.hiColor || "#FFC93C") : (o.color || "#7B61FF");
    return `<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${H - top - bot}" rx="${bw / 2}" fill="#F3F1FA"/>${v > 0 ? `<rect x="${cx - bw / 2}" y="${y}" width="${bw}" height="${Math.max(h, bw)}" rx="${bw / 2}" fill="${col}"/>` : ""}
      ${v > 0 ? `<text x="${cx}" y="${y - 6}" text-anchor="middle" font-size="12" font-weight="800" fill="#1E1638">${v}${o.unit || ""}</text>` : ""}
      <text x="${cx}" y="${H - 7}" text-anchor="middle" font-size="12" font-weight="700" fill="${i === o.hi ? "#5B3FD9" : "#6E6787"}">${esc(labels[i])}</text>`; }).join("");
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || "chart")}">${bars}</svg></div>`;
}
function lineChart(vals, labels, o) {
  o = o || {}; const n = vals.length; if (!n) return `<p class="muted">No quizzes yet.</p>`;
  const W = 320, H = 170, l = 30, r = 14, t = 16, b = 26; const X = i => n === 1 ? (l + W - r) / 2 : l + i * (W - l - r) / (n - 1); const Y = v => t + (100 - v) * (H - t - b) / 100;
  const pts = vals.map((v, i) => [X(i), Y(v)]); const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = d + ` L${pts[n - 1][0]} ${H - b} L${pts[0][0]} ${H - b} Z`; const gid = "g" + Math.random().toString(36).slice(2, 7);
  const pass = o.pass || 80; const grid = [0, 50, 100].map(v => `<line x1="${l}" x2="${W - r}" y1="${Y(v)}" y2="${Y(v)}" stroke="#E7E3F3"/><text x="${l - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="10" fill="#6E6787">${v}</text>`).join("");
  const step = Math.ceil(n / 7); const xl = labels.map((s, i) => (i % step === 0 || i === n - 1) ? `<text x="${X(i)}" y="${H - 7}" text-anchor="middle" font-size="10" font-weight="700" fill="#6E6787">${esc(s)}</text>` : "").join("");
  const last = pts[n - 1];
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || "scores")}"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7B61FF" stop-opacity=".35"/><stop offset="1" stop-color="#7B61FF" stop-opacity="0"/></linearGradient></defs>
    ${grid}<line x1="${l}" x2="${W - r}" y1="${Y(pass)}" y2="${Y(pass)}" stroke="#1FA98F" stroke-dasharray="4 4"/><text x="${W - r}" y="${Y(pass) - 4}" text-anchor="end" font-size="10" font-weight="800" fill="#1FA98F">pass ${pass}%</text>
    <path d="${area}" fill="url(#${gid})"/><path d="${d}" fill="none" stroke="#5B3FD9" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="#fff" stroke="#5B3FD9" stroke-width="2"/>`).join("")}
    <circle cx="${last[0]}" cy="${last[1]}" r="6" fill="#5B3FD9"/><text x="${Math.min(last[0], W - r - 14)}" y="${last[1] - 11}" text-anchor="middle" font-size="12" font-weight="900" fill="#1E1638">${vals[n - 1]}%</text>${xl}</svg></div>`;
}
function ring(pct, color, size, inner) {
  const s = size || 120, r = s / 2 - 10, c = 2 * Math.PI * r;
  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true"><circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="rgba(0,0,0,.08)" stroke-width="12"/><circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${c * Math.max(0, Math.min(1, pct / 100))} ${c}" transform="rotate(-90 ${s / 2} ${s / 2})"/>${inner || ""}</svg>`;
}
function donut(parts, size) { // parts: [{v,color}]
  const s = size || 130, r = s / 2 - 12, c = 2 * Math.PI * r, tot = parts.reduce((a, p) => a + p.v, 0) || 1; let off = 0;
  const segs = parts.map(p => { const len = c * p.v / tot; const el = `<circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="${p.color}" stroke-width="16" stroke-dasharray="${Math.max(0, len - 2)} ${c}" stroke-dashoffset="${-off}" transform="rotate(-90 ${s / 2} ${s / 2})"/>`; off += len; return el; }).join("");
  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true"><circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke="#F3F1FA" stroke-width="16"/>${segs}<text x="50%" y="48%" text-anchor="middle" font-size="26" font-weight="900" fill="#1E1638" font-family="Nunito, Noto Sans KR, sans-serif">${parts[0].v}</text><text x="50%" y="64%" text-anchor="middle" font-size="11" font-weight="800" fill="#6E6787">mastered</text></svg>`;
}
const SKILLS = [
  { key: "Meaning", types: ["mc_ko", "mc_def"], color: "#5B3FD9", soft: "#ECE8FF", icon: I.book },
  { key: "Spelling", types: ["ko_en", "def_en", "train"], color: "#FF6B5B", soft: "#FFE6E2", icon: I.pencil },
  { key: "Listening", types: ["dict"], color: "#3F82F2", soft: "#E2EDFF", icon: I.ear },
  { key: "Speaking", types: ["say", "saysent"], color: "#1FA98F", soft: "#DBF5EE", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>' }
];
function skillRows(items) {
  return SKILLS.map(s => { const it = items.filter(i => s.types.includes(i.t)); const ok = it.filter(i => i.ok).length; const p = it.length ? Math.round(ok / it.length * 100) : null;
    return `<div class="hrow"><span class="ic" style="background:${s.soft};color:${s.color}">${s.icon}</span><div class="stack" style="gap:5px"><div class="row between"><b>${s.key}</b><span class="muted small">${it.length ? ok + "/" + it.length : "no data"}</span></div><div class="hbar"><i style="width:${p || 0}%;background:${s.color}"></i></div></div><b style="min-width:44px;text-align:right">${p == null ? "–" : p + "%"}</b></div>`; }).join("");
}

/* ---------- shell ---------- */
let TAB = "today";
function setShell(kind) { // kind: tabs | focus | teacher | bare
  $app.classList.toggle("focus", kind !== "tabs"); $app.classList.toggle("wide", kind === "teacher");
  const tabs = document.getElementById("tabs");
  if (kind !== "tabs") { tabs.innerHTML = ""; return; }
  const t = (k, l, ic) => `<button data-act="tabgo" data-tab="${k}" ${TAB === k ? 'aria-current="page"' : ""}>${ic}<span>${l}</span></button>`;
  tabs.innerHTML = `<div class="tabbar"><nav>${t("today", "Today", I.home)}${t("words", "Words", I.cards)}${t("progress", "Progress", I.chart)}${t("me", "Me", I.me)}</nav></div>`;
}
function previewBar() { return IS_OWNER ? `<div class="notice info row between" style="margin-top:12px"><span>Student preview (test data)</span><button class="ghost" data-act="toTeacher">Dashboard</button></div>` : ""; }
function render() {
  if (mode === "teacher") { setShell("teacher"); return renderTeacher(); }
  const v = view.name;
  if (v === "loading") return;
  if (v === "login") { setShell("bare"); return renderLogin(); }
  if (v === "error") { setShell("bare"); $app.innerHTML = `<div class="splash"><div class="card" style="text-align:left">${buddy("sad", 80)}<h2>Something went wrong</h2><p>${esc(view.msg)}</p><div class="row"><button class="primary" data-act="reload">Try again</button><button class="ghost" data-act="signout">Sign out</button></div></div></div>`; return; }
  if (v === "placementIntro") { setShell("bare"); return renderPlacementIntro(); }
  if (v === "run") { setShell("focus"); return renderRun(); }
  if (v === "train") { setShell("focus"); return renderTrain(); }
  if (v === "result") { setShell("focus"); return renderResult(); }
  if (v === "trainDone") { setShell("focus"); return renderTrainDone(); }
  if (v === "wordCard") { setShell("focus"); return renderWordCard(); }
  setShell("tabs");
  if (TAB === "today") return renderToday();
  if (TAB === "words") return renderWords();
  if (TAB === "progress") return renderProgress();
  if (TAB === "me") return renderMe();
}
function streakNow() { const s = ST.streak || {}; if (s.last === today() || s.last === addDays(today(), -1)) return s.count || 0; return 0; }
function quizDoneToday() { return ST.lastQuizDay === today(); }
function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; }

/* ---------- Today ---------- */
function renderToday() {
  const s = streakNow(); const wk = ST.week; const k = wk ? wk.key : weekKey(); const ids = weekIds();
  const needIntro = wk && !wk.introDone; const locked = ST.lock && ST.lock.on; const qd = quizDoneToday();
  const trained = wk ? (wk.trained || []).length : 0; const mastered = ids.filter(isMastered).length;
  const days = []; for (let i = 0; i < 7; i++) { const d = addDays(k, i); const dt = new Date(d + "T12:00:00");
    days.push(`<div class="wday ${(ST.quizDays || []).includes(d) ? "done" : ""} ${d === today() ? "today" : ""}">${DOW[dt.getDay()].slice(0, 2)}<i>${(ST.quizDays || []).includes(d) ? "✓" : dt.getDate()}</i></div>`); }
  const trainState = locked ? "now" : needIntro ? "now" : "done";
  const quizState = needIntro || locked ? "lock" : qd ? "done" : "now";
  const trainCard = `<div class="step ${trainState === "now" ? "now" : "done"}"><span class="dot"></span><button class="step-card" data-act="train">
    <div class="txt"><span class="eyebrow">${locked ? "Required" : needIntro ? "Step 1 · this week" : "Practice"}</span><h3>${locked ? "Train your missed words" : needIntro ? "Learn this week's words" : "Training"}</h3>
    <div class="meta">${locked ? `<span class="pill bad">${ST.lock.ids.length} words</span>` : needIntro ? `<span class="pill">${trained}/${ids.length} learned</span>` : `<span class="pill good">Done · train any time</span>`}<span>${I.clock.replace("<svg", '<svg width="14" height="14"')} ${locked ? "5–10" : needIntro ? "20–30" : "5"} min</span></div></div>
    <div class="art">${ART.train}</div></button></div>`;
  const quizCard = `<div class="step ${quizState === "now" ? "now" : quizState === "done" ? "done" : ""}"><span class="dot"></span><button class="step-card" data-act="quiz" ${quizState === "lock" ? "disabled" : ""}>
    <div class="txt"><span class="eyebrow">${quizState === "lock" ? "Locked" : "Daily"}</span><h3>Daily quiz</h3>
    <div class="meta">${quizState === "lock" ? `<span class="pill">${needIntro ? "Finish training first" : "Train missed words first"}</span>` : quizState === "done" ? `<span class="pill good">Done today ✓</span>` : `<span class="pill sun">Keeps your streak</span>`}<span>${ST.quizSize} questions</span></div></div>
    <div class="art">${quizState === "lock" ? ART.lock : quizState === "done" ? ART.done : ART.quiz}</div></button></div>`;
  const weak = ids.filter(id => !isMastered(id)).length;
  const bonusCard = `<div class="step"><span class="dot"></span><button class="step-card" data-act="trainWeak">
    <div class="txt"><span class="eyebrow">Bonus</span><h3>Practice tricky words</h3><div class="meta"><span>${weak} not mastered yet</span></div></div><div class="art">${ART.bonus}</div></button></div>`;
  $app.innerHTML = `${previewBar()}<section class="hero"><span class="deco" style="width:160px;height:160px;right:-40px;top:-50px"></span><span class="deco" style="width:70px;height:70px;left:-20px;bottom:30px"></span>
    <div class="hero-row"><div class="stack" style="gap:8px;flex:1"><span class="muted" style="font-weight:800">${greeting()}!</span><h1>${needIntro ? "New words this week" : locked ? "Let's fix those words" : qd ? "All done today" : "Ready to train?"}</h1>
    <div class="row"><span class="streak-chip" style="color:#FFC93C">${I.flame.replace("<svg", '<svg width="18" height="18"')}<span style="color:#fff">${s} day streak</span></span><span class="streak-chip">${mastered}/${ids.length} mastered</span></div></div>
    ${buddy(qd ? "wow" : "happy", 92)}</div></section>
    <div class="week" aria-label="This week">${days.join("")}</div>
    <h2 style="margin-top:6px">Today's plan</h2>
    <div class="path">${trainCard}${quizCard}${bonusCard}</div>`;
}
function renderPlacementIntro() {
  $app.innerHTML = `${previewBar()}<section class="hero" style="text-align:center"><div class="stack" style="align-items:center;gap:10px">${buddy("happy", 110)}<h1>Hi! Let's see what you know</h1><p class="muted">One quick word check before we start</p></div></section>
  <div class="card"><h3>How it works</h3><p>60 quick questions from the books you already studied. Some ask for the Korean meaning, some ask you to type the English word.</p>
  <p class="muted">Don't know a word? Tap <b>I don't know</b>. Guessing makes it harder to pick the right words for you. About 10 minutes.</p>
  <button class="big primary" data-act="startPlacement">Start the word check</button>
  ${IS_OWNER ? `<button class="big" data-act="skipPlacement">Skip with sample answers (teacher test)</button>` : ""}</div>`;
}

/* ---------- Words tab ---------- */
function renderWords() {
  const wk = ST.week; const sec = (title, ids) => `<div class="card"><div class="row between"><h3>${title}</h3><span class="pill">${ids.length}</span></div><div>${ids.map(id => { const e = BY[id]; const w = WORDS[id]; const box = w ? w.box : 0;
    return `<button class="list-row" data-act="openWord" data-id="${id}"><span style="display:grid;place-items:center">${ring(Math.min(100, box / MASTER_BOX * 100), isMastered(id) ? "#1FA98F" : "#7B61FF", 44)}</span><span style="flex:1;min-width:0"><b style="font-size:18px">${esc(e.w)}</b><br><span class="muted small">${esc(e.ko)}</span></span>${isMastered(id) ? '<span class="pill good">mastered</span>' : ""}<span class="muted">${I.chev.replace("<svg", '<svg width="18" height="18"')}</span></button>`; }).join("")}</div></div>`;
  $app.innerHTML = `${previewBar()}<div class="stack" style="padding-top:18px"><span class="eyebrow">Week of ${wk ? wkShort(wk.key) : ""}</span><h1>Your words</h1><p class="muted">Tap a word to hear it and see its card. The ring fills as you master it.</p></div>
    ${wk ? sec("New this week", wk.newIds) + sec("Review", wk.reviewIds) : ""}`;
}
function wkShort(k) { const a = new Date(k + "T12:00:00"); return (a.getMonth() + 1) + "/" + a.getDate(); }
function cardBody(e) {
  return `<div class="row between" style="align-items:flex-start;flex-wrap:nowrap"><div style="min-width:0"><div class="word">${esc(e.w)}</div><p class="ipa">${esc(e.ipa)}</p></div>
      <div class="row" style="flex-wrap:nowrap">${spk(e.id, "w")}${spk(e.id, "s", "Slow", "icon-l")}</div></div>
    <div class="stack" style="gap:10px">${e.senses.map(x => `<div class="sense"><span class="pos-tag">${esc(x.pos)}</span><div><p class="ko">${esc(x.ko)}</p><p class="def">${esc(x.def)}</p></div></div>`).join("")}</div>
    <div class="stack" style="gap:8px"><p class="label">Syllables${e.syl.includes("·") ? " · the purple one is said strongest" : ""}</p><div class="parts">${sylButtons(e)}</div></div>
    <div class="stack" style="gap:8px"><p class="label">Examples</p>${e.ex.map((x, k) => `<div class="ex">${spk(e.id, "e" + k)}<p>${exHtml(x, e.w)}</p></div>`).join("")}</div>`;
}
function renderWordCard() { const e = BY[view.id];
  $app.innerHTML = `<div class="topbar"><button class="x" data-act="closeWord" aria-label="Back">${I.back}</button><span class="count">Word card</span></div>
  <div class="card">${cardBody(e)}<button class="big primary" data-act="trainOne" data-id="${e.id}">Train this word</button></div>`;
}

/* ---------- Progress tab (student) ---------- */
let PROG = null, PROG_RANGE = "week";
async function loadProgress() { const [atts, sess] = await Promise.all([getAll(sPath() + "/attempts"), getAll(sPath() + "/sessions")]); PROG = { atts, sess, at: Date.now() }; }
function renderProgress() {
  if (!PROG) { $app.innerHTML = `${previewBar()}<div class="splash"><p class="muted">Loading your progress…</p></div>`; loadProgress().then(render).catch(() => { PROG = { atts: [], sess: [] }; render(); }); return; }
  const wk = weekKey(); const allTime = PROG_RANGE === "all";
  const atts = PROG.atts.filter(a => a.kind !== "placement" && (allTime || a.weekKey === wk));
  const items = atts.flatMap(a => a.items || []);
  const quizzes = PROG.atts.filter(a => a.kind === "quiz" && a.end).sort((a, b) => a.start - b.start);
  let minutesChart;
  if (!allTime) { const vals = [], labs = []; let hi = -1; for (let i = 0; i < 7; i++) { const d = addDays(wk, i); labs.push(DOW[new Date(d + "T12:00:00").getDay()].slice(0, 2)); if (d === today()) hi = i;
      vals.push(Math.round(PROG.sess.filter(s => s.day === d).reduce((t, s) => t + actSec(s), 0) / 60)); } minutesChart = barChart(vals, labs, { hi, unit: "m", title: "Minutes per day" }); }
  else { const vals = [], labs = []; for (let i = 7; i >= 0; i--) { const k = addDays(wk, -7 * i); labs.push(wkShort(k)); vals.push(Math.round(PROG.sess.filter(s => s.weekKey === k).reduce((t, s) => t + actSec(s), 0) / 60)); } minutesChart = barChart(vals, labs, { hi: 7, unit: "", title: "Minutes per week" }); }
  const qs = (allTime ? quizzes.slice(-20) : quizzes.filter(q => q.weekKey === wk));
  const qChart = lineChart(qs.map(q => Math.round(q.score * 100)), qs.map(q => { const d = new Date(q.start); return (d.getMonth() + 1) + "/" + d.getDate(); }), { pass: CFG.passPct });
  const learned = Object.keys(WORDS); const mastered = learned.filter(isMastered).length; const learning = learned.length - mastered;
  const notSeen = weekIds().filter(id => !WORDS[id]).length;
  const totalMin = Math.round((allTime ? PROG.sess : PROG.sess.filter(s => s.weekKey === wk)).reduce((t, s) => t + actSec(s), 0) / 60);
  // calendar: last 5 weeks Sat..Fri
  const start = addDays(wk, -28); let cal = ""; for (let i = 0; i < 35; i++) { const d = addDays(start, i); const did = (ST.quizDays || []).includes(d) || PROG.atts.some(a => a.kind === "quiz" && a.day === d && a.end);
    const any = PROG.sess.some(s => s.day === d); cal += `<span class="${did ? "on" : any ? "part" : ""} ${d === today() ? "t" : ""}">${new Date(d + "T12:00:00").getDate()}</span>`; }
  const byWord = {}; items.filter(i => !SPEAK.has(i.t)).forEach(i => { const b = byWord[i.id] || (byWord[i.id] = { ok: 0, n: 0 }); b.n++; if (i.ok) b.ok++; });
  const tricky = Object.entries(byWord).filter(([, b]) => b.ok < b.n).sort((a, b) => (b[1].n - b[1].ok) - (a[1].n - a[1].ok)).slice(0, 5);
  $app.innerHTML = `${previewBar()}<div class="row between" style="padding-top:18px"><h1>Progress</h1><div class="seg"><button data-act="range" data-r="week" aria-pressed="${!allTime}">This week</button><button data-act="range" data-r="all" aria-pressed="${allTime}">All time</button></div></div>
   <div class="tiles">
     <div class="tile"><span class="ic" style="background:#FFF4D6;color:#E0A100">${I.flame}</span><b>${streakNow()}</b><span>day streak · best ${ST.streak.best || 0}</span></div>
     <div class="tile"><span class="ic" style="background:#ECE8FF;color:#5B3FD9">${I.clock}</span><b>${totalMin}</b><span>minutes ${allTime ? "total" : "this week"}</span></div>
     <div class="tile"><span class="ic" style="background:#DBF5EE;color:#1FA98F">${I.star}</span><b>${mastered}</b><span>words mastered</span></div>
   </div>
   <div class="card"><div class="row between"><h3>Study time</h3><span class="muted small">${allTime ? "minutes per week" : "minutes per day"}</span></div>${minutesChart}</div>
   <div class="card"><div class="row between"><h3>Quiz scores</h3><span class="muted small">${qs.length} quiz${qs.length === 1 ? "" : "zes"}</span></div>${qChart}</div>
   <div class="card"><h3>Your skills</h3>${skillRows(items)}</div>
   <div class="card"><h3>Words</h3><div class="row" style="gap:18px;flex-wrap:nowrap">${donut([{ v: mastered, color: "#1FA98F" }, { v: learning, color: "#7B61FF" }, { v: notSeen, color: "#FFC93C" }])}
     <div class="stack" style="gap:8px"><span class="row" style="gap:8px"><i style="width:12px;height:12px;border-radius:4px;background:#1FA98F"></i><b>${mastered}</b> mastered</span><span class="row" style="gap:8px"><i style="width:12px;height:12px;border-radius:4px;background:#7B61FF"></i><b>${learning}</b> learning</span><span class="row" style="gap:8px"><i style="width:12px;height:12px;border-radius:4px;background:#FFC93C"></i><b>${notSeen}</b> not started</span></div></div></div>
   <div class="card"><div class="row between"><h3>Streak calendar</h3><span class="muted small">last 5 weeks</span></div><div class="cal">${cal}</div><p class="muted small"><span class="pill sun">quiz done</span> <span class="pill">studied</span></p></div>
   <div class="card"><h3>Tricky words</h3>${tricky.length ? tricky.map(([id, b]) => `<button class="list-row" data-act="openWord" data-id="${id}"><span style="flex:1"><b>${esc(BY[id].w)}</b><br><span class="muted small">${esc(BY[id].ko)}</span></span><span class="pill bad">${b.n - b.ok} missed</span></button>`).join("") : `<p class="muted">No misses ${allTime ? "yet" : "this week"}. Nice!</p>`}</div>`;
}
function renderMe() {
  const email = (WW.user() && WW.user().email) || "";
  $app.innerHTML = `${previewBar()}<div class="stack" style="padding-top:18px;align-items:center;text-align:center">${buddy("happy", 96)}<h1>${esc(email.split("@")[0] || "Me")}</h1><p class="muted">${esc(email)}</p></div>
   ${voicePicker()}
   <div class="card"><h3>Sounds</h3><p class="muted">Words and sentences play recorded audio. If a word has no recording yet, your phone's voice reads it. Pick that voice above.</p></div>
   ${IS_OWNER ? "" : `<button class="big" data-act="signout">Sign out</button>`}`;
}

/* ---------- quiz & placement ---------- */
let RUN = null;
async function startRun(kind) {
  const qs = kind === "placement" ? buildPlacement() : buildQuiz();
  if (!qs.length) { toast("No words yet"); return; }
  RUN = { kind, qs, i: 0, t0: Date.now(), answered: false, right: 0 };
  startAttempt(kind, { n: qs.length }); logDid(kind);
  view = { name: "run" }; render();
  if (kind === "quiz") { await loadPacksFor(qs.map(q => q.id)); }
  RUN && (RUN.t0 = Date.now()); autoSpeak();
}
function autoSpeak() { const q = RUN && RUN.qs[RUN.i]; if (q && q.t === "dict") speak(q.id, "w"); }
function qPrompt(q) {
  const e = BY[q.id]; const hint = CFG.hints ? `<p class="hint">${esc(e.w[0])}${" _".repeat(Math.max(0, e.w.length - 1))}</p>` : "";
  const kos = `<div class="stack" style="gap:6px">${e.senses.map(x => `<div class="sense"><span class="pos-tag">${esc(x.pos)}</span><p class="q-prompt">${esc(x.ko)}</p></div>`).join("")}</div>`;
  if (q.t === "mc_ko") return `<p class="label">What does this word mean?</p><div class="row between" style="flex-wrap:nowrap"><div class="word">${esc(e.w)}</div>${spk(e.id, "w")}</div>`;
  if (q.t === "mc_def") return `<p class="label">Which word matches?</p><p class="q-prompt">${esc(e.def)}</p>`;
  if (q.t === "ko_en") return `<p class="label">Type the English word</p>${kos}${hint}`;
  if (q.t === "def_en") return `<p class="label">Type the word for this meaning</p><div class="sense"><span class="pos-tag">${esc(e.pos)}</span><p class="q-prompt">${esc(e.def)}</p></div>${hint}`;
  if (q.t === "dict") return `<p class="label">Listen and type what you hear</p><div class="row" style="flex-wrap:nowrap">${spk(e.id, "w", "Play word", "big primary icon-l")}${spk(e.id, "s", "Slow", "icon-l")}</div>`;
  return "";
}
function topbar(i, n, extra) { return `<div class="topbar"><button class="x" data-act="quit" aria-label="Stop">${I.x}</button><div class="bar"><i style="width:${Math.round(i / n * 100)}%"></i></div><span class="count">${extra || (i + 1) + "/" + n}</span></div>`; }
function renderRun() {
  const q = RUN.qs[RUN.i]; const e = BY[q.id]; const typed = !q.t.startsWith("mc");
  let body = "";
  if (typed) body = `<form class="stack" data-form="answer"><input class="answer" id="ans" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" ${RUN.answered ? "disabled" : ""} value="${esc(RUN.lastAns || "")}" aria-label="Your answer" placeholder="Type here">
     ${RUN.answered ? "" : `<button class="big primary" type="submit">Check</button><button type="button" class="ghost" data-act="idk" style="align-self:center">I don't know</button>`}</form>`;
  else body = `<div class="opts">${q.opts.map(o => { let c = ""; if (RUN.answered) { if (o.id === q.id) c = "right"; else if (o.id === RUN.picked) c = "wrong"; }
     return `<button class="opt ${c}" data-act="pick" data-id="${o.id}" ${RUN.answered ? "disabled" : ""}>${esc(o.label)}</button>`; }).join("")}</div>`;
  let fb = "";
  if (RUN.answered && RUN.kind !== "placement") {
    fb = RUN.ok ? `<div class="fb good">Correct! <span class="mono">${esc(e.w)}</span> = ${esc(e.ko)}</div>`
      : `<div class="fb bad stack" style="gap:6px"><span>The answer is <b class="mono">${esc(e.w)}</b> (${esc(e.ko)})</span>${typed && RUN.lastAns ? `<span class="diff">${diffHtml(RUN.lastAns, e.w)}</span>` : ""}</div>`;
    if (typed && !RUN.ok && !RUN.fixed) fb += fixForm(e, "fixQuiz");
    else fb += `${typed && !RUN.ok ? `<div class="fb good">Good. Now you've spelled it right.</div>` : ""}<button class="big primary" data-act="next" id="nextBtn">${RUN.i + 1 < RUN.qs.length ? "Next" : "See my score"}</button>`;
  }
  $app.innerHTML = `${topbar(RUN.i, RUN.qs.length)}<span class="eyebrow">${RUN.kind === "placement" ? "Word check" : "Daily quiz"}</span><div class="card">${qPrompt(q)}${body}${fb}</div>`;
  const inp = document.getElementById("ans"); if (inp && !RUN.answered) inp.focus();
  const fx = document.getElementById("fix"); if (fx) fx.focus();
}
function diffHtml(a, b) { a = norm(a); b = norm(b); if (!a) return "";
  const m = a.length, n = b.length, L = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const inA = new Array(m).fill(false), inB = new Array(n).fill(false); let i = 0, j = 0;
  while (i < m && j < n) { if (a[i] === b[j]) { inA[i] = inB[j] = true; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
  const mk = (s, keep) => [...s].map((c, k) => keep[k] ? esc(c) : `<span class="x">${esc(c)}</span>`).join("");
  return `<span>Yours:&nbsp;&nbsp; ${mk(a, inA)}</span><span>Correct: ${mk(b, inB)}</span>`; }
function fixForm(e, form) { return `<form class="stack" data-form="${form}"><p class="label">Type it correctly to continue</p><input class="answer" id="fix" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-label="Type ${esc(e.w)}"><button class="primary big" type="submit">Check</button></form>`; }
function answer(ans, picked) {
  const q = RUN.qs[RUN.i]; const e = BY[q.id]; const ms = Date.now() - RUN.t0;
  let ok; if (q.t.startsWith("mc")) { ok = picked === q.id; RUN.picked = picked; ans = picked ? (q.t === "mc_ko" ? BY[picked].ko : BY[picked].w) : ""; }
  else ok = norm(ans) === norm(e.w);
  RUN.ok = ok; RUN.answered = true; RUN.lastAns = ans; if (ok) RUN.right++;
  record(q.id, q.t, ok, ans, ms);
  if (RUN.kind === "placement") { setTimeout(next, 120); return; }
  if (!ok) speak(e.id, "w");
  render();
}
function next() {
  RUN.i++; RUN.answered = false; RUN.fixed = false; RUN.lastAns = ""; RUN.picked = null; RUN.t0 = Date.now();
  if (RUN.i >= RUN.qs.length) return finishRun();
  render(); autoSpeak();
}
function finishRun() {
  const n = RUN.qs.length, score = RUN.right / n;
  ATT.end = Date.now(); ATT.score = score;
  const wrongIds = [...new Set(ATT.items.filter(i => !i.ok).map(i => i.id))];
  if (RUN.kind === "placement") {
    const by = { A: [0, 0], B: [0, 0], C: [0, 0] }; ATT.items.forEach(i => { const b = BY[i.id].book; by[b][1]++; if (i.ok) by[b][0]++; });
    ST.placement = { done: true, at: Date.now(), score: Math.round(score * 100), byBook: by, missed: wrongIds };
    ST.reviewPool = wrongIds.sort((a, b) => ({ C: 0, B: 1, A: 2 }[BY[a].book] - { C: 0, B: 1, A: 2 }[BY[b].book]));
    buildWeek(ST, WORDS, CFG, true); loadPacksFor(weekIds());
  } else {
    const d = today(); const s = ST.streak || { count: 0, best: 0, last: "" };
    if (s.last !== d) { s.count = s.last === addDays(d, -1) ? (s.count || 0) + 1 : 1; s.last = d; s.best = Math.max(s.best || 0, s.count); }
    ST.streak = s; ST.lastQuizDay = d; ST.quizDays = (ST.quizDays || []).filter(x => x >= addDays(d, -40)).concat(ST.quizDays && ST.quizDays.includes(d) ? [] : [d]);
    if (score * 100 < CFG.passPct) { ST.lock = { on: true, ids: wrongIds, since: Date.now(), quiz: ATT.id }; ATT.locked = true; ST.lockCount = (ST.lockCount || 0) + 1; }
  }
  saveAttempt(); saveST(); logDid(RUN.kind + ":" + Math.round(score * 100) + "%"); PROG = null;
  view = { name: "result", kind: RUN.kind, score, n, right: RUN.right, wrongIds }; RUN = null; render();
}
function renderResult() {
  const v = view; const pct = Math.round(v.score * 100);
  if (v.kind === "placement") {
    const b = ST.placement.byBook;
    $app.innerHTML = `<div style="height:14px"></div><div class="result-hero">${buddy("wow", 100)}<span class="eyebrow" style="color:rgba(255,255,255,.8)">Word check done</span>${ring(pct, "#FFC93C", 150, `<text x="50%" y="56%" text-anchor="middle" font-size="34" font-weight="900" fill="#fff" font-family="Nunito, Noto Sans KR, sans-serif">${pct}%</text>`)}<h1>You knew ${v.right} of ${v.n}</h1><p style="opacity:.85">The ${v.wrongIds.length} words you missed will come back in your review lists.</p></div>
    <div class="tiles"><div class="tile"><b>${b.A[0]}/${b.A[1]}</b><span>Book 1</span></div><div class="tile"><b>${b.B[0]}/${b.B[1]}</b><span>Book 2</span></div><div class="tile"><b>${b.C[0]}/${b.C[1]}</b><span>Current book</span></div></div>
    <button class="big primary" data-act="home">See this week's words</button>`; return;
  }
  const pass = pct >= CFG.passPct;
  $app.innerHTML = `<div style="height:14px"></div><div class="result-hero ${pass ? "" : "bad"}">${buddy(pass ? "wow" : "sad", 96)}${ring(pct, pass ? "#FFC93C" : "#fff", 150, `<text x="50%" y="56%" text-anchor="middle" font-size="34" font-weight="900" fill="#fff" font-family="Nunito, Noto Sans KR, sans-serif">${pct}%</text>`)}
    <h1>${pass ? "Great job!" : "Almost there"}</h1><p style="opacity:.9">${v.right} of ${v.n} correct · <b>${streakNow()}-day streak</b> ${I.flame.replace("<svg", '<svg width="16" height="16" style="vertical-align:-2px;color:#FFC93C"')}</p></div>
  ${pass ? "" : `<div class="notice bad">Under ${CFG.passPct}%. Train the ${v.wrongIds.length} missed words to unlock the next quiz.</div>`}
  ${v.wrongIds.length ? `<div class="card"><h3>Missed words</h3><div class="chips">${v.wrongIds.map(id => `<span class="chip">${esc(BY[id].w)} · ${esc(BY[id].ko)}</span>`).join("")}</div></div>` : ""}
  <button class="big primary" data-act="${pass ? "home" : "train"}">${pass ? "Done" : "Start training"}</button>`;
}

/* ---------- training ---------- */
let TR = null;
async function startTraining(ids, reasonIn) {
  const wk = ST.week; let reason = reasonIn || "free";
  if (!ids) { if (ST.lock && ST.lock.on) { ids = ST.lock.ids.slice(); reason = "missed"; }
    else if (wk && !wk.introDone) { ids = weekIds().filter(id => !(wk.trained || []).includes(id)); reason = "intro"; if (!ids.length) ids = weekIds(); }
    else { ids = shuffle(weekIds()).sort((a, b) => (WORDS[a] ? WORDS[a].box : 0) - (WORDS[b] ? WORDS[b].box : 0)).slice(0, 10); } }
  if (!ids.length) { toast("No words to train"); return; }
  TR = { ids: ids.slice(), queue: ids.slice(), reason, step: "study", done: 0, total: ids.length, t0: Date.now() };
  startAttempt("training", { reason, n: ids.length, required: reason === "missed" || reason === "intro" }); logDid("training:" + reason);
  view = { name: "train" }; render(); await loadPacksFor(ids); if (TR && TR.step === "study") speak(TR.queue[0], "w");
}
function exHtml(s, w) { const re = new RegExp("\\b(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\w*)", "i"); return esc(s).replace(re, "<mark>$1</mark>"); }
function sylButtons(e) {
  const rs = e.rs.split("-"), parts = e.syl.split("·");
  const si = parts.length === 1 ? 0 : (rs.length === parts.length ? rs.findIndex(p => p !== p.toLowerCase()) : -1);
  return parts.map((p, i) => `<span class="syl ${i === si ? "stress" : ""}">${esc(p)}</span>`).join("");
}
function renderTrain() {
  const id = TR.queue[0]; const e = BY[id];
  const head = topbar(TR.done, TR.total, `${TR.done}/${TR.total}`) + `<span class="eyebrow">Training${TR.reason === "missed" ? " · missed words" : ""}</span>`;
  if (TR.step === "study") {
    $app.innerHTML = head + `<div class="card">${cardBody(e)}
      ${speakOn() ? `<button class="big primary icon-l" data-act="toSpeak">${ICON_MIC} I'm ready · say it out loud</button>` : `<button class="big primary" data-act="cover">I'm ready · cover &amp; write</button>`}</div>`;
    return;
  }
  if (TR.step === "speak") { $app.innerHTML = head + speakHtml(e); return; }
  $app.innerHTML = head + `<div class="card">
    <p class="label">Write the word from memory</p>
    <div class="stack" style="gap:6px">${e.senses.map(x => `<div class="sense"><span class="pos-tag">${esc(x.pos)}</span><p class="q-prompt">${esc(x.ko)}</p></div>`).join("")}</div>
    <div class="row">${spk(e.id, "w", "Hear it", "icon-l")}<span class="hint">${e.w.length} letters</span></div>
    <form class="stack" data-form="trainWrite"><input class="answer" id="ans" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" ${TR.fb ? "disabled" : ""} value="${esc(TR.lastAns || "")}" aria-label="Your spelling" placeholder="Type here">
    ${TR.fb ? "" : `<button class="primary big" type="submit">Check</button>`}</form>
    ${TR.fb ? (TR.fb === "ok" ? `<div class="fb good">Perfect spelling!</div>` : `<div class="fb bad stack" style="gap:6px"><span>It's <b class="mono">${esc(e.w)}</b>${e.syl.includes("·") ? ` (${esc(e.syl)})` : ""}. This word comes back at the end.</span><span class="diff">${diffHtml(TR.lastAns, e.w)}</span></div>`)
      + (TR.fb === "bad" && !TR.fixed ? fixForm(e, "fixTrain") : `${TR.fb === "bad" ? `<div class="fb good">Good. Now you've spelled it right.</div>` : ""}<button class="big primary" data-act="trainNext" id="nextBtn">Next</button>`) : ""}
  </div>`;
  const inp = document.getElementById("ans"); if (inp && !TR.fb) inp.focus();
  const fx = document.getElementById("fix"); if (fx) fx.focus();
}
function trainCheck(ans) {
  const id = TR.queue[0]; const e = BY[id]; const ok = norm(ans) === norm(e.w);
  record(id, "train", ok, ans, Date.now() - TR.t0); TR.fb = ok ? "ok" : "bad"; TR.lastAns = ans;
  speak(e.id, "w"); render();
}
function trainNext() {
  const id = TR.queue.shift();
  if (TR.fb === "ok") { TR.done++;
    if (TR.reason === "intro" && ST.week) { ST.week.trained = [...new Set((ST.week.trained || []).concat([id]))]; saveST(); } }
  else TR.queue.push(id);
  TR.fb = null; TR.fixed = false; TR.sp = null; TR.lastAns = ""; TR.step = "study"; TR.t0 = Date.now();
  if (!TR.queue.length) return finishTraining();
  render(); speak(TR.queue[0], "w");
}
function finishTraining() {
  ATT.end = Date.now(); const tr = ATT.items.filter(i => i.t === "train"); ATT.score = tr.length ? tr.filter(i => i.ok).length / tr.length : 1;
  if (TR.reason === "missed") ST.lock = Object.assign({}, ST.lock, { on: false, clearedAt: Date.now() });
  if (TR.reason === "intro" && ST.week) ST.week.introDone = true;
  saveAttempt(); saveST(); logDid("training done"); PROG = null;
  view = { name: "trainDone", reason: TR.reason, n: TR.total }; TR = null; render();
}
function renderTrainDone() { const r = view.reason;
  $app.innerHTML = `<div style="height:14px"></div><div class="result-hero">${buddy("wow", 110)}<h1>${r === "missed" ? "Quiz unlocked!" : r === "intro" ? "Daily quiz unlocked!" : "Nice practice!"}</h1><p style="opacity:.9">You trained ${view.n} word${view.n === 1 ? "" : "s"}.</p></div>
  <button class="big primary" data-act="home">${r === "free" || r === "weak" ? "Back home" : "Go to today's plan"}</button>`;
}

/* ---------- speaking ---------- */
const speakOn = () => CFG.speak !== false && !srBroken;
const toks = x => norm(x).replace(/[’']/g, "").replace(/[^a-z0-9 ]+/g, " ").split(" ").filter(Boolean);
function wordHeard(alts, w) { const t = toks(w).join(""); const forms = [t, t + "s", t + "es", t + "ed", t + "d", t + "ing"];
  return alts.some(a => { const A = toks(a); return A.some(x => forms.includes(x)) || A.join("") === t; }); }
function lcsLen(A, B) { const L = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]); return L[0][0]; }
function sentHeard(alts, sent) { const B = toks(sent); return alts.some(a => lcsLen(toks(a), B) / B.length >= 0.7); }
function startSpeak() { const e = BY[TR.queue[0]];
  TR.sp = { targets: [{ kind: "w", tag: "w", text: e.w, need: 3, got: 0 }].concat(e.ex.map((x, k) => ({ kind: "s", tag: "e" + k, text: x, need: 1, got: 0 }))), idx: 0, fails: 0, heard: "", ok: false, listening: false, err: "" };
  TR.step = "speak"; render(); speak(e.id, "w"); }
function speakHtml(e) {
  const sp = TR.sp; const done = sp.idx >= sp.targets.length; const tg = sp.targets[sp.idx];
  const list = sp.targets.map((t, k) => `<span class="pill ${k < sp.idx ? "good" : ""}" style="${k > sp.idx ? "opacity:.5" : ""}">${k < sp.idx ? "✓ " : ""}${t.kind === "w" ? "Word ×3" : "Sentence " + k}</span>`).join("");
  if (done) return `<div class="card" style="align-items:center;text-align:center">${buddy("wow", 96)}<h2>Great speaking!</h2><p class="muted">Now write it from memory.</p><button class="big primary" data-act="cover" id="nextBtn">Cover &amp; write</button></div>`;
  const target = tg.kind === "w"
    ? `<div class="stack" style="align-items:center;text-align:center;gap:8px"><div class="word">${esc(e.w)}</div><div class="dots">${Array.from({ length: tg.need }, (_, k) => `<i class="${k < tg.got ? "on" : ""}"></i>`).join("")}</div><div class="row">${spk(e.id, "w", "Listen", "icon-l")}${spk(e.id, "s", "Slow", "icon-l")}</div></div>`
    : `<div class="ex">${spk(e.id, tg.tag)}<p style="font-size:21px;font-weight:700">${exHtml(tg.text, e.w)}</p></div><p class="muted small">Listen first, then read the whole sentence out loud.</p>`;
  const err = sp.err === "blocked" ? `<div class="notice">The microphone is turned off. On iPhone: <b>Settings → Apps → Safari → Microphone → Allow</b>, and <b>Settings → General → Keyboard → Enable Dictation</b> on. Then tap the button again.</div>`
    : sp.err === "unsupported" ? `<div class="notice">This browser can't listen. Open the app in Safari on your iPhone.</div><button class="big" data-act="cover">Continue to writing</button>` : "";
  return `<div class="card"><div class="row between"><p class="label">Say it out loud</p><div class="chips">${list}</div></div>${target}
    <button class="mic ${sp.listening ? "on" : ""}" id="micBtn" data-act="mic" ${sp.listening ? "disabled" : ""} aria-label="Tap, then speak">${ICON_MIC}</button>
    <p class="muted" style="text-align:center;font-weight:800">${sp.listening ? "Listening… speak now" : "Tap the mic, then speak"}</p>
    ${sp.heard ? `<div class="fb ${sp.ok ? "good" : "bad"}">${esc(sp.heard)}</div>` : ""}${err}
    ${sp.fails >= 4 ? `<button class="ghost" data-act="spSkip" style="align-self:center">The app can't hear it right · skip (your teacher will see this)</button>` : ""}</div>`;
}
function listen() {
  const sp = TR.sp; if (!sp || sp.listening) return; const e = BY[TR.queue[0]]; const tg = sp.targets[sp.idx]; if (!tg) return;
  let rec; try { rec = new SR(); } catch (err) { sp.err = "unsupported"; return render(); }
  rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 5; rec.continuous = false;
  stopAudio(); sp.listening = true; sp.heard = ""; sp.err = ""; render();
  let got = false;
  rec.onresult = ev => { got = true; const alts = [...ev.results[0]].map(a => a.transcript);
    const ok = tg.kind === "w" ? wordHeard(alts, tg.text) : sentHeard(alts, tg.text);
    record(e.id, tg.kind === "w" ? "say" : "saysent", ok, alts[0], 0); sp.ok = ok;
    if (ok) { tg.got++; sp.fails = 0; sp.heard = "✓ I heard: “" + alts[0] + "”"; if (tg.got >= tg.need) { sp.idx++; const nx = sp.targets[sp.idx]; if (nx) setTimeout(() => { if (TR && TR.sp === sp && !sp.listening) speak(e.id, nx.tag); }, 700); } }
    else { sp.fails++; sp.heard = "I heard: “" + alts[0] + "”. Listen again and try once more."; } };
  rec.onerror = ev => { sp.ok = false; if (/not-allowed|service-not-allowed/.test(ev.error)) sp.err = "blocked";
    else if (ev.error === "no-speech") sp.heard = "I didn't hear anything. Tap and speak a little louder.";
    else if (ev.error !== "aborted") sp.heard = "I didn't catch that. Try again."; };
  rec.onend = () => { sp.listening = false; if (!got && !sp.heard && !sp.err) { sp.ok = false; sp.heard = "I didn't hear anything. Try again."; } if (TR && TR.sp === sp) render(); };
  try { rec.start(); } catch (err) { sp.listening = false; sp.err = "unsupported"; render(); }
}
function spSkip() { const sp = TR.sp; const tg = sp.targets[sp.idx]; if (!tg) return; record(TR.queue[0], tg.kind === "w" ? "say" : "saysent", false, "(skipped)", 0); sp.idx++; sp.fails = 0; sp.heard = ""; render(); }

let T = { students: [], sel: null, data: null, tab: "week", week: null, names: {} };
async function loadTeacher() {
  const list = await getAll("students");
  T.students = list.sort((a, b) => (a.test ? 1 : 0) - (b.test ? 1 : 0) || a.created - b.created);
  if (user) { try { const ids = T.students.map(s => s._id); if (ids.length) T.names = await user.profiles(ids); } catch (e) {} }
  if (!T.sel || !T.students.find(s => s._id === T.sel)) T.sel = T.students[0] ? T.students[0]._id : null;
  if (T.sel) await loadStudentData(T.sel);
  render();
}
async function loadStudentData(sid) {
  const base = "students/" + sid;
  const [sd, words, atts, sess] = await Promise.all([db.doc(base).get(), getAll(base + "/words"), getAll(base + "/attempts"), getAll(base + "/sessions")]);
  const wmap = {}; words.forEach(w => wmap[w._id] = w);
  T.data = { st: sd.exists ? clone(sd.data()) : null, words: wmap, atts, sess };
  if (!T.week) T.week = defaultReportWeek();
}
function defaultReportWeek() { const now = new Date(); const k = weekKey(); // on Fri/Sat-morning show the week ending now
  return k; }
function studentLabel(s) { if (s.test) return "Test (you)"; return s.email || "Student"; }
function weekStats(wk) {
  const D = T.data; const atts = D.atts.filter(a => a.weekKey === wk); const sess = D.sess.filter(s => s.weekKey === wk);
  const quizzes = atts.filter(a => a.kind === "quiz" && a.end); const trains = atts.filter(a => a.kind === "training");
  const days = {}; for (let i = 0; i < 7; i++) days[addDays(wk, i)] = { sec: 0, quiz: [], train: 0 };
  sess.forEach(s => { if (days[s.day]) days[s.day].sec += actSec(s); });
  quizzes.forEach(q => { if (days[q.day]) days[q.day].quiz.push(Math.round(q.score * 100)); });
  trains.forEach(t => { if (days[t.day]) days[t.day].train++; });
  const items = atts.filter(a => a.kind !== "placement").flatMap(a => a.items.map(i => Object.assign({ kind: a.kind, at: a.start }, i)));
  const byType = {}; items.forEach(i => { const b = byType[i.t] || (byType[i.t] = { ok: 0, n: 0, ms: 0 }); b.n++; if (i.ok) b.ok++; b.ms += i.ms || 0; });
  const byWord = {}; items.filter(i => !SPEAK.has(i.t)).forEach(i => { const b = byWord[i.id] || (byWord[i.id] = { ok: 0, n: 0, wrong: [], types: {} }); b.n++; if (i.ok) b.ok++; else { if (i.ans && !i.t.startsWith("mc")) b.wrong.push(i.ans); b.types[i.t] = (b.types[i.t] || 0) + 1; } });
  const near = items.filter(i => !i.ok && i.ans && !i.t.startsWith("mc") && !SPEAK.has(i.t) && lev(norm(i.ans), norm(BY[i.id].w)) <= 2);
  const far = items.filter(i => !i.ok && !i.t.startsWith("mc") && !SPEAK.has(i.t) && !(i.ans && lev(norm(i.ans), norm(BY[i.id].w)) <= 2));
  const totalSec = sess.reduce((s, x) => s + actSec(x), 0);
  const activeDays = Object.values(days).filter(d => d.sec > 0 || d.quiz.length || d.train).length;
  const avg = quizzes.length ? Math.round(quizzes.reduce((s, q) => s + q.score, 0) / quizzes.length * 100) : null;
  const sayBad = {}; items.filter(i => SPEAK.has(i.t) && !i.ok).forEach(i => { const b = sayBad[i.id] || (sayBad[i.id] = { n: 0, skip: 0, heard: [] }); b.n++; if (i.ans === "(skipped)") b.skip++; else if (i.ans) b.heard.push(i.ans); });
  return { sayBad, atts, sess, quizzes, trains, days, byType, byWord, near, far, totalSec, activeDays, avg, locks: quizzes.filter(q => q.locked).length, required: trains.filter(t => t.required).length };
}
function weekOptions() { const ks = new Set([weekKey()]); (T.data.atts || []).forEach(a => ks.add(a.weekKey)); (T.data.sess || []).forEach(a => ks.add(a.weekKey)); return [...ks].sort().reverse(); }
function wkLabel(k) { const a = new Date(k + "T12:00:00"), b = new Date(addDays(k, 6) + "T12:00:00"); return `${a.getMonth() + 1}/${a.getDate()} (Sat) – ${b.getMonth() + 1}/${b.getDate()} (Fri)`; }
function reportText() {
  const wk = T.week; const S = weekStats(wk); const st = T.data.st; const name = studentLabel(T.students.find(s => s._id === T.sel));
  const L = [];
  L.push(`VOCABOO WEEKLY REPORT — ${name} — ${wkLabel(wk)}`);
  L.push(`Time: ${fmtMin(S.totalSec)} min over ${S.activeDays}/7 days, ${S.sess.length} sessions`);
  Object.entries(S.days).forEach(([d, x]) => L.push(`  ${d} ${DOW[new Date(d + "T12:00:00").getDay()]}: ${fmtMin(x.sec)} min, quiz ${x.quiz.length ? x.quiz.join("/") + "%" : "none"}${x.train ? ", training x" + x.train : ""}`));
  L.push(`Quizzes: ${S.quizzes.length}, average ${S.avg == null ? "-" : S.avg + "%"}, sent to training ${S.locks}x. Streak ${st.streak.count} (best ${st.streak.best}). Quiz size ${st.quizSize}.`);
  L.push(`Accuracy by type:`); Object.entries(S.byType).forEach(([t, b]) => L.push(`  ${TYPE_NAME[t]}: ${Math.round(b.ok / b.n * 100)}% (${b.ok}/${b.n})`));
  L.push(`Most-missed words (word | meaning | wrong/total | her typed answers):`);
  Object.entries(S.byWord).filter(([, b]) => b.ok < b.n).sort((a, b) => (b[1].n - b[1].ok) - (a[1].n - a[1].ok)).slice(0, 20).forEach(([id, b]) => L.push(`  ${BY[id].w} | ${BY[id].ko} | ${b.n - b.ok}/${b.n} | ${b.wrong.slice(-4).join(", ") || "-"}`));
  L.push(`Hard to say: ${Object.entries(S.sayBad).sort((a, b) => b[1].n - a[1].n).slice(0, 15).map(([id, b]) => BY[id].w + " (" + b.n + " missed" + (b.skip ? ", " + b.skip + " skipped" : "") + ")").join(", ") || "none"}`);
  L.push(`Spelling near-misses: ${S.near.map(i => i.ans + "→" + BY[i.id].w).join(", ") || "none"}`);
  if (st.week) { L.push(`This week's new words: ${st.week.newIds.map(i => BY[i].w).join(", ")}`); L.push(`This week's review words: ${st.week.reviewIds.map(i => BY[i].w).join(", ")}`);
    L.push(`Not mastered yet: ${st.week.newIds.concat(st.week.reviewIds).filter(id => !(T.data.words[id] && T.data.words[id].box >= MASTER_BOX)).map(i => BY[i].w).join(", ")}`); }
  return L.join("\n");
}
function showReportText(txt) { const pre = document.createElement("pre"); pre.className = "report"; pre.textContent = txt; const box = document.createElement("div"); box.className = "stack";
  const p = document.createElement("p"); p.className = "muted"; p.textContent = "Copying isn't allowed here. Select the text below and copy it."; box.append(p, pre); $app.prepend(box); }
async function saveCfg() {
  const n = id => +document.getElementById(id).value;
  CFG = { startUnit: Math.min(30, Math.max(1, n("cfgStart"))), newPerWeek: Math.min(40, Math.max(5, n("cfgNew"))), reviewPerWeek: Math.min(30, Math.max(0, n("cfgRev"))), passPct: Math.min(100, Math.max(50, n("cfgPass"))), hints: document.getElementById("cfgHints").value === "1", speak: document.getElementById("cfgSpeak").value === "1" };
  await setDoc("config/main", CFG);
  const sz = document.getElementById("cfgSize"); if (sz && T.data && T.data.st) { T.data.st.quizSize = Math.min(30, Math.max(5, +sz.value)); await setDoc("students/" + T.sel, T.data.st); }
  toast("Settings saved"); render();
}
async function resetTest() {
  const tests = T.students.filter(s => s.test);
  for (const s of tests) { const base = "students/" + s._id;
    for (const c of ["words", "attempts", "sessions"]) { const docs = await db.collection(base + "/" + c).get(); for (const d of docs.docs) await db.doc(base + "/" + c + "/" + d.id).delete(); }
    await db.doc(base).delete(); }
  T.sel = null; T.data = null; toast("Test data deleted"); await loadTeacher();
}

/* ---------- teacher views ---------- */
function renderTeacher() {
  const stu = T.students.find(s => s._id === T.sel); const st = T.data && T.data.st;
  const head = `<header class="t-head"><div class="row between"><div class="stack" style="gap:2px"><span class="eyebrow" style="color:rgba(255,255,255,.75)">Teacher dashboard</span><h1>Vocaboo</h1></div>
    <div class="row"><button data-act="refresh">Refresh</button><button data-act="preview">Try as student</button><button data-act="signout">Sign out</button></div></div>
    ${T.students.length > 1 ? `<div class="row">${T.students.map(s => `<button data-act="selStudent" data-id="${s._id}" aria-pressed="${s._id === T.sel}">${esc(studentLabel(s))}</button>`).join("")}</div>` : ""}
    ${st ? `<div class="row"><span class="streak-chip" style="color:#FFC93C">${I.flame.replace("<svg", '<svg width="16" height="16"')}<span style="color:#fff">${esc(studentLabel(stu))} · ${st.streak && st.streak.last >= addDays(today(), -1) ? st.streak.count : 0}-day streak</span></span><span class="streak-chip">quiz size ${st.quizSize}</span>${st.lock && st.lock.on ? `<span class="streak-chip" style="background:#FF6B5B">quiz locked · training needed</span>` : ""}</div>` : ""}
    <div class="row">${[["week", "Weekly report"], ["words", "Words"], ["placement", "Word check"], ["settings", "Settings"]].map(([k, l]) => `<button data-act="ttab" data-tab="${k}" aria-pressed="${T.tab === k}">${l}</button>`).join("")}</div></header>`;
  if (!T.students.length || !T.data) {
    $app.innerHTML = head + `<div class="card">${buddy("happy", 72)}<h2>No student yet</h2><p>Create her login in Firebase (Authentication → Users → Add user). When she signs in on her iPhone, she'll appear here and start with the word check.</p><p class="muted">You can try everything first with "Try as student". That creates test data you can delete in Settings.</p></div>` + (T.tab === "settings" ? settingsHtml() : ""); return;
  }
  let body = !st ? `<div class="card">No data yet.</div>` : T.tab === "week" ? weekHtml() : T.tab === "words" ? wordsHtml() : T.tab === "placement" ? placementHtml() : settingsHtml();
  $app.innerHTML = head + body;
}
function weekHtml() {
  const wk = T.week; const S = weekStats(wk); const st = T.data.st; const ks = weekOptions(); const ix = ks.indexOf(wk);
  const items = S.atts.filter(a => a.kind !== "placement").flatMap(a => a.items || []);
  const dvals = [], dlabs = []; let hi = -1; Object.entries(S.days).forEach(([d, x], i) => { dvals.push(Math.round(x.sec / 60)); dlabs.push(DOW[new Date(d + "T12:00:00").getDay()].slice(0, 2)); if (d === today()) hi = i; });
  const allQ = T.data.atts.filter(a => a.kind === "quiz" && a.end).sort((a, b) => a.start - b.start).slice(-20);
  const trouble = Object.entries(S.byWord).filter(([, b]) => b.ok < b.n).sort((a, b) => (b[1].n - b[1].ok) - (a[1].n - a[1].ok)).slice(0, 25);
  const wkIds = st.week && st.week.key === wk ? st.week.newIds.concat(st.week.reviewIds) : ((st.history || []).find(h => h.key === wk) || { newIds: [], reviewIds: [] }).newIds;
  const notMastered = wkIds.filter(id => !(T.data.words[id] && T.data.words[id].box >= MASTER_BOX));
  const mastered = wkIds.length - notMastered.length;
  return `<div class="row between"><div class="row"><button class="round" data-act="wkPrev" ${ix >= ks.length - 1 ? "disabled" : ""} aria-label="Previous week">${I.back}</button><h2>${wkLabel(wk)}</h2><button class="round" data-act="wkNext" ${ix <= 0 ? "disabled" : ""} aria-label="Next week">${I.chev}</button></div>
     <button class="primary" data-act="copyReport">Copy report for Claude</button></div>
   <div class="kpis">
     <div class="tile"><span class="ic" style="background:#ECE8FF;color:#5B3FD9">${I.clock}</span><b>${fmtMin(S.totalSec)}</b><span>minutes studied</span></div>
     <div class="tile"><span class="ic" style="background:#FFF4D6;color:#E0A100">${I.flame}</span><b>${S.activeDays}/7</b><span>days active</span></div>
     <div class="tile"><span class="ic" style="background:#DBF5EE;color:#1FA98F">${I.check}</span><b>${S.quizzes.length}</b><span>quizzes finished</span></div>
     <div class="tile"><span class="ic" style="background:#E2EDFF;color:#3F82F2">${I.star}</span><b>${S.avg == null ? "–" : S.avg + "%"}</b><span>average quiz score</span></div>
     <div class="tile"><span class="ic" style="background:#FFE6E2;color:#FF6B5B">${I.lock}</span><b>${S.locks}</b><span>times sent to training</span></div>
     <div class="tile"><span class="ic" style="background:#DBF5EE;color:#1FA98F">${I.book}</span><b>${mastered}/${wkIds.length}</b><span>week's words mastered</span></div>
   </div>
   <div class="grid">
     <div class="card"><div class="row between"><h3>Minutes per day</h3><span class="muted small">quiz scores below</span></div>${barChart(dvals, dlabs, { hi, unit: "m" })}
       <div class="row" style="gap:6px">${Object.entries(S.days).map(([d, x]) => `<span class="pill ${x.quiz.length ? (Math.max(...x.quiz) >= CFG.passPct ? "good" : "bad") : ""}" style="font-size:11px">${DOW[new Date(d + "T12:00:00").getDay()].slice(0, 2)} ${x.quiz.length ? x.quiz.join("/") + "%" : "–"}</span>`).join("")}</div></div>
     <div class="card"><div class="row between"><h3>Quiz scores</h3><span class="muted small">last ${allQ.length}</span></div>${lineChart(allQ.map(q => Math.round(q.score * 100)), allQ.map(q => { const d = new Date(q.start); return (d.getMonth() + 1) + "/" + d.getDate(); }), { pass: CFG.passPct })}</div>
     <div class="card"><h3>Skills this week</h3>${skillRows(items)}
       <div class="stack" style="gap:6px">${["mc_ko", "mc_def", "ko_en", "def_en", "dict", "train", "say", "saysent"].filter(t => S.byType[t]).map(t => `<div class="row between small"><span class="muted">${TYPE_NAME[t]}</span><span>${Math.round(S.byType[t].ok / S.byType[t].n * 100)}% · ${S.byType[t].ok}/${S.byType[t].n}${SPEAK.has(t) ? "" : ` · ${(S.byType[t].ms / S.byType[t].n / 1000).toFixed(1)}s`}</span></div>`).join("")}</div></div>
     <div class="card"><h3>Spelling near-misses</h3><p class="muted small">Typed answers 1–2 letters off. These are spelling problems, not meaning problems.</p><div class="chips">${S.near.slice(-24).map(i => `<span class="chip"><span class="mono">${esc(i.ans)}</span> → <b class="mono">${esc(BY[i.id].w)}</b></span>`).join("") || `<span class="muted">None yet.</span>`}</div></div>
   </div>
   <div class="card"><h3>Most-missed words</h3><div class="tbl-wrap"><table><thead><tr><th>Word</th><th>Wrong</th><th>Missed in</th><th>Her answers</th></tr></thead><tbody>${trouble.map(([id, b]) => `<tr><td><b>${esc(BY[id].w)}</b><br><span class="muted">${esc(BY[id].ko)}</span></td><td>${b.n - b.ok} / ${b.n}</td><td>${Object.keys(b.types).map(t => `<span class="pill ${t === "dict" ? "sun" : ""}">${esc(TYPE_NAME[t].split(" (")[0])}</span>`).join(" ")}</td><td class="mono">${b.wrong.slice(-4).map(esc).join(", ") || "–"}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">No misses this week.</td></tr>`}</tbody></table></div></div>
   <div class="grid">
     <div class="card"><h3>Hard to say</h3><p class="muted small">What the app heard when she didn't say it right. "Skipped" = gave up after 4 tries.</p><div class="tbl-wrap"><table><tbody>${Object.entries(S.sayBad).sort((a, b) => b[1].n - a[1].n).slice(0, 15).map(([id, b]) => `<tr><td><b>${esc(BY[id].w)}</b></td><td>${b.n}${b.skip ? ` <span class="pill bad">${b.skip} skipped</span>` : ""}</td><td class="muted">${b.heard.slice(-3).map(esc).join(" · ") || "–"}</td></tr>`).join("") || `<tr><td class="muted">No speaking problems this week.</td></tr>`}</tbody></table></div></div>
     <div class="card"><h3>Not mastered yet</h3><div class="chips">${notMastered.map(id => `<span class="chip">${esc(BY[id].w)}</span>`).join("") || `<span class="muted">All mastered.</span>`}</div></div>
   </div>
   <div class="card"><h3>Sessions</h3><div class="tbl-wrap"><table><thead><tr><th>Day</th><th>Time</th><th>Active</th><th>What she did</th></tr></thead><tbody>${S.sess.slice().sort((a, b) => a.start - b.start).map(s => { const dt = new Date(s.start); return `<tr><td>${DOW[dt.getDay()]} ${dt.getMonth() + 1}/${dt.getDate()}</td><td>${timeOf(s.start)}–${timeOf(s.last)}</td><td>${fmtMin(actSec(s))} min</td><td class="muted">${esc((s.did || []).join(", ") || "opened only")}</td></tr>`; }).join("") || `<tr><td colspan="4" class="muted">No sessions this week.</td></tr>`}</tbody></table></div></div>`;
}
function wordsHtml() {
  const st = T.data.st; const W = T.data.words; if (!st.week) return `<div class="card">The first week starts after her word check.</div>`;
  const row = id => { const e = BY[id], w = W[id]; return `<tr><td><b>${esc(e.w)}</b><br><span class="muted">${esc(e.ko)}</span></td><td>${w ? `${w.right}✓ ${w.wrong}✗` : "not seen"}</td><td>${w ? (w.box >= MASTER_BOX ? '<span class="pill good">mastered</span>' : `<span class="pill ${w.box ? "" : "bad"}">level ${w.box}/${MASTER_BOX}</span>`) : "–"}</td><td><button class="ghost" data-act="rmWord" data-id="${id}">Remove</button></td></tr>`; };
  const next = []; const used = new Set(Object.keys(W).concat(st.week.newIds)); for (const e of QUEUE) { if (next.length >= CFG.newPerWeek) break; if (e.cu >= CFG.startUnit && !used.has(e.id)) next.push(e.w); }
  return `<p class="muted">Week of ${wkLabel(st.week.key)}. New words come in book order from Unit ${CFG.startUnit}. Review words come from her word-check misses and weakest words.</p>
   <div class="card"><div class="row" style="align-items:flex-end"><div class="field" style="flex:1;min-width:200px"><label for="addWord">Add a word to this week</label><input id="addWord" type="text" list="bankList" placeholder="Type a word from the books" autocomplete="off" autocapitalize="off"><datalist id="bankList">${BANK.map(e => `<option value="${esc(e.w)}">`).join("")}</datalist></div><button class="primary" data-act="addWord">Add</button><button data-act="release">Start next week now</button></div></div>
   <div class="grid"><div class="card"><h3>New (${st.week.newIds.length})</h3><div class="tbl-wrap"><table><tbody>${st.week.newIds.map(row).join("")}</tbody></table></div></div>
   <div class="card"><h3>Review (${st.week.reviewIds.length})</h3><div class="tbl-wrap"><table><tbody>${st.week.reviewIds.map(row).join("")}</tbody></table></div></div></div>
   <div class="card"><h3>Coming next week</h3><div class="chips">${next.map(w => `<span class="chip">${esc(w)}</span>`).join("")}</div><p class="muted small">Word-check words still waiting for review: ${(st.reviewPool || []).length}</p></div>`;
}
function placementHtml() {
  const p = T.data.st.placement; if (!p || !p.done) return `<div class="card">She hasn't taken the word check yet. It opens the first time she signs in.</div>`;
  const b = p.byBook; const pl = T.data.atts.find(a => a.kind === "placement"); const pc = x => x[1] ? Math.round(x[0] / x[1] * 100) : 0;
  const missed = (p.missed || []).map(id => `<span class="chip">${esc(BY[id].w)} <span class="muted">${esc(BY[id].src.join(","))}</span></span>`).join("");
  return `<div class="grid"><div class="card" style="align-items:center">${ring(p.score, "#5B3FD9", 150, `<text x="50%" y="56%" text-anchor="middle" font-size="32" font-weight="900" fill="#1E1638" font-family="Nunito, Noto Sans KR, sans-serif">${p.score}%</text>`)}<p class="muted">Overall · ${new Date(p.at).toLocaleDateString()}</p></div>
    <div class="card"><h3>By book</h3>${[["Book 1 (first book)", b.A, "#FFC93C"], ["Book 2", b.B, "#3F82F2"], [`Current book, Units 1–${CFG.startUnit - 1}`, b.C, "#5B3FD9"]].map(([l, x, c]) => `<div class="stack" style="gap:5px"><div class="row between"><b>${l}</b><span class="muted">${x[0]}/${x[1]}</span></div><div class="hbar"><i style="width:${pc(x)}%;background:${c}"></i></div></div>`).join("")}
    ${pl ? `<h3>By question type</h3>${skillRows(pl.items)}` : ""}</div></div>
    <div class="card"><h3>Missed in the word check</h3><p class="muted small">A = first book, B = second book, C = current book.</p><div class="chips">${missed || "None"}</div></div>`;
}
function settingsHtml() {
  return `<div class="card"><h2>Settings</h2>
  <div class="grid2">
   <div class="field"><label for="cfgStart">New words start at unit (current book)</label><input id="cfgStart" type="number" min="1" max="30" value="${CFG.startUnit}"></div>
   <div class="field"><label for="cfgNew">New words per week</label><input id="cfgNew" type="number" min="5" max="40" value="${CFG.newPerWeek}"></div>
   <div class="field"><label for="cfgRev">Review words per week</label><input id="cfgRev" type="number" min="0" max="30" value="${CFG.reviewPerWeek}"></div>
   <div class="field"><label for="cfgPass">Pass mark for the daily quiz (%)</label><input id="cfgPass" type="number" min="50" max="100" value="${CFG.passPct}"></div>
   <div class="field"><label for="cfgSpeak">Speaking practice in training</label><select id="cfgSpeak"><option value="1" ${CFG.speak !== false ? "selected" : ""}>Required</option><option value="0" ${CFG.speak !== false ? "" : "selected"}>Off</option></select></div>
   <div class="field"><label for="cfgHints">Typing hints (first letter and length)</label><select id="cfgHints"><option value="1" ${CFG.hints ? "selected" : ""}>On</option><option value="0" ${CFG.hints ? "" : "selected"}>Off</option></select></div>
   ${T.data && T.data.st ? `<div class="field"><label for="cfgSize">Daily quiz size for this student</label><input id="cfgSize" type="number" min="5" max="30" value="${T.data.st.quizSize}"></div>` : ""}
  </div>
  <p class="muted small">Quiz size grows by 5 (up to 30) after a week with 5+ quizzes, 80%+ average, and under 9 seconds per question.</p>
  <div class="row"><button class="primary" data-act="saveCfg">Save settings</button>${T.data && T.data.st && T.data.st.lock && T.data.st.lock.on ? `<button data-act="unlock">Unlock quiz now</button>` : ""}</div></div>
  ${T.students.some(s => s.test) ? `<div class="card"><h3>Test data</h3><p class="muted">Deletes everything you created with "Try as student". Her data is not touched.</p><div class="row"><button data-act="resetTest">Reset test data</button></div></div>` : ""}`;
}

/* ---------- events ---------- */
document.addEventListener("click", async ev => {
  const b = ev.target.closest("[data-act]"); if (!b) return; const a = b.dataset.act;
  if (a === "speak") { speak(b.dataset.id, b.dataset.tag); return; }
  if (a === "say") { say(b.dataset.text, b.dataset.rate ? +b.dataset.rate : undefined); return; }
  if (a === "reload") return location.reload();
  if (a === "signout") { await WW.signOut(); return location.reload(); }
  if (a === "tabgo") { TAB = b.dataset.tab; if (TAB === "progress") PROG = null; view = { name: "tabs" }; window.scrollTo(0, 0); return render(); }
  if (a === "home") { TAB = "today"; view = { name: "tabs" }; window.scrollTo(0, 0); return render(); }
  if (a === "range") { PROG_RANGE = b.dataset.r; return render(); }
  if (a === "openWord") { view = { name: "wordCard", id: b.dataset.id, back: TAB }; render(); await loadPacksFor([b.dataset.id]); speak(b.dataset.id, "w"); return; }
  if (a === "closeWord") { view = { name: "tabs" }; return render(); }
  if (a === "startPlacement") return startRun("placement");
  if (a === "skipPlacement" && IS_OWNER) { const qs = buildPlacement(); startAttempt("placement", { n: qs.length, simulated: true }); logDid("placement (sample answers)");
    qs.forEach(q => { const ok = Math.random() < 0.7; ATT.items.push({ id: q.id, t: q.t, ok, ans: ok ? BY[q.id].w : "", ms: 4000 }); });
    RUN = { kind: "placement", qs, right: ATT.items.filter(i => i.ok).length }; return finishRun(); }
  if (a === "quiz") { if ((ST.lock && ST.lock.on) || (ST.week && !ST.week.introDone)) return; return startRun("quiz"); }
  if (a === "train") return startTraining();
  if (a === "trainWeak") { const ids = shuffle(weekIds().filter(id => !isMastered(id))).slice(0, 8); return startTraining(ids.length ? ids : null, "weak"); }
  if (a === "trainOne") return startTraining([b.dataset.id], "free");
  if (a === "pick") return answer(null, b.dataset.id);
  if (a === "idk") return answer("");
  if (a === "next") return next();
  if (a === "toSpeak") return startSpeak();
  if (a === "mic") return listen();
  if (a === "spSkip") return spSkip();
  if (a === "cover") { stopAudio(); TR.step = "write"; TR.t0 = Date.now(); return render(); }
  if (a === "trainNext") return trainNext();
  if (a === "quit") { stopAudio(); if (ATT) { ATT.quit = Date.now(); saveAttempt(); } RUN = null; TR = null; view = { name: ST.placement.done ? "tabs" : "placementIntro" }; return render(); }
  // teacher
  if (a === "toTeacher") { mode = "teacher"; clearInterval(hbTimer); SESSION = null; await loadTeacher(); return; }
  if (a === "preview") return enterPreview();
  if (a === "refresh") { await loadTeacher(); toast("Updated"); return; }
  if (a === "ttab") { T.tab = b.dataset.tab; return render(); }
  if (a === "wkPrev" || a === "wkNext") { const ks = weekOptions(); const i = ks.indexOf(T.week) + (a === "wkPrev" ? 1 : -1); if (ks[i]) T.week = ks[i]; return render(); }
  if (a === "selStudent") { T.sel = b.dataset.id; T.week = null; await loadStudentData(T.sel); return render(); }
  if (a === "copyReport") { const txt = reportText(); try { await navigator.clipboard.writeText(txt); toast("Report copied. Paste it to Claude to make the test"); } catch (e) { showReportText(txt); } return; }
  if (a === "saveCfg") return saveCfg();
  if (a === "unlock") { const st = T.data.st; st.lock.on = false; await setDoc("students/" + T.sel, st); toast("Quiz unlocked"); return render(); }
  if (a === "rmWord") { const st = T.data.st; st.week.newIds = st.week.newIds.filter(i => i !== b.dataset.id); st.week.reviewIds = st.week.reviewIds.filter(i => i !== b.dataset.id); await setDoc("students/" + T.sel, st); return render(); }
  if (a === "addWord") { const v = norm(document.getElementById("addWord").value); const e = BANK.find(x => norm(x.w) === v); if (!e) { toast("That word isn't in the books"); return; }
    const st = T.data.st; if (st.week.newIds.includes(e.id) || st.week.reviewIds.includes(e.id)) { toast("Already in this week"); return; }
    st.week.reviewIds.push(e.id); await setDoc("students/" + T.sel, st); toast("Added " + e.w); return render(); }
  if (a === "release") { if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again to confirm"; return; }
    const st = T.data.st; buildWeek(st, T.data.words, CFG, true); await setDoc("students/" + T.sel, st); toast("Next week's words are ready"); return render(); }
  if (a === "resetTest") { if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again to delete test data"; return; } return resetTest(); }
});
document.addEventListener("submit", ev => { ev.preventDefault(); const f = ev.target.dataset.form; const v = (document.getElementById("ans") || {}).value || "";
  if (f === "login") { doLogin(); return; }
  if (f === "answer") { if (!v.trim()) return; answer(v); } if (f === "trainWrite") { if (!v.trim()) return; trainCheck(v); }
  if (f === "fixQuiz" || f === "fixTrain") { const el = document.getElementById("fix"); const id = f === "fixQuiz" ? RUN.qs[RUN.i].id : TR.queue[0];
    if (norm(el.value) === norm(BY[id].w)) { if (f === "fixQuiz") RUN.fixed = true; else TR.fixed = true; render(); }
    else { el.value = ""; el.focus(); toast("Not quite. Look at the word and try again"); } } });
document.addEventListener("change", async ev => {
  if (ev.target.dataset.change === "voice") { VOICE = VOICES.find(v => v.name === ev.target.value) || VOICE; try { localStorage.setItem("ww_voice", VOICE.name); } catch (e) {} say("Hello! This is how your words will sound."); } });
async function enterPreview() { mode = "student"; SID = ME; TAB = "today"; await loadStudent(true); }

/* ---------- login ---------- */
function renderLogin() {
  $app.innerHTML = `<section class="hero" style="text-align:center;padding-bottom:80px"><div class="stack" style="align-items:center;gap:10px;padding-top:30px">${buddy("happy", 110)}<h1>Vocaboo</h1><p class="muted">Train your words every day</p></div></section>
  <form class="card" data-form="login" style="margin-top:-56px;position:relative"><h2>Sign in</h2><p class="muted small">Use the email and password your teacher gave you. You only need to do this once on this phone.</p>
  <div class="field"><label for="lgEmail">Email</label><input id="lgEmail" type="text" inputmode="email" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
  <div class="field"><label for="lgPw">Password</label><input id="lgPw" type="password" autocomplete="current-password"></div>
  ${view.err ? `<div class="fb bad">${esc(view.err)}</div>` : ""}<button class="big primary" type="submit">Sign in</button></form>`;
}
async function doLogin() { const em = document.getElementById("lgEmail").value, pw = document.getElementById("lgPw").value; if (!em || !pw) return;
  try { await WW.signIn(em, pw); } catch (e) { view = { name: "login", err: /invalid|wrong|not-found|credential/.test(e.code || "") ? "That email or password isn't right. Check with your teacher." : "Couldn't sign in: " + (e.code || e.message) }; render(); } }

/* ---------- boot ---------- */
async function loadStudent(test) {
  const sd = await db.doc(sPath()).get();
  ST = sd.exists ? clone(sd.data()) : newStudent(test);
  const em = WW.user() && WW.user().email; if (em && ST.email !== em && !test) { ST.email = em; await saveST(); } else if (!sd.exists) await saveST();
  const words = await getAll(sPath() + "/words"); WORDS = {}; words.forEach(w => { const id = w._id; delete w._id; WORDS[id] = w; });
  if (ST.placement.done) {
    const atts = ST.sizeCheckedFor === addDays(weekKey(), -7) ? [] : await getAll(sPath() + "/attempts");
    const changed = buildWeek(ST, WORDS, CFG, false); growQuiz(ST, atts);
    if (changed || atts.length) await saveST();
    loadPacksFor(weekIds());
  }
  trackStudent(); PROG = null;
  view = { name: ST.placement.done ? "tabs" : "placementIntro" }; render();
}
let booted = false;
async function boot() {
  await new Promise(r => { if (window.WW) return r(); window.addEventListener("ww-ready", r, { once: true }); setTimeout(r, 15000); });
  if (!window.WW) { view = { name: "error", msg: "Couldn't connect. Check the internet connection and try again." }; return render(); }
  if (WW.error) { view = { name: "error", msg: WW.error }; return render(); }
  db = WW.db;
  WW.onAuth(async u => {
    if (!u) { booted = false; mode = "student"; view = { name: "login" }; return render(); }
    if (booted) return; booted = true;
    try {
      ME = u.uid; IS_OWNER = !!WW.teacherUid && u.uid === WW.teacherUid;
      if (!WW.teacherUid || /PASTE/.test(WW.teacherUid)) throw new Error("Setup isn't finished. Your User UID is " + u.uid + ". Paste it into config.js as teacherUid, upload config.js again, then reload.");
      const c = await db.doc("config/main").get(); if (c.exists) CFG = Object.assign({}, DEFAULT_CFG, c.data());
      SID = ME;
      if (IS_OWNER) { mode = "teacher"; await loadTeacher(); }
      else { mode = "student"; await loadStudent(false); }
    } catch (e) { console.error(e); mode = "student"; view = { name: "error", msg: /permission/i.test(e.code || e.message || "") ? "The database refused access. Check the Firestore rules step in the setup guide." : (e.message || String(e)) }; render(); }
  });
}
boot();
})();
