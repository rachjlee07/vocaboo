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
  const tbN = cfg.tbNew != null ? cfg.tbNew : cfg.newPerWeek;
  if (cfg.textbook !== false) for (const e of QUEUE) { if (newIds.length >= tbN) break; if (e.cu < cfg.startUnit || used.has(e.id)) continue; newIds.push(e.id); }
  if (cfg.grNew && typeof gradedPick === "function") gradedPick(st, words, new Set([...used, ...newIds]), cfg.grNew).forEach(id => newIds.push(id));
  const rev = []; const take = id => { if (!rev.includes(id) && !newIds.includes(id) && BY[id]) rev.push(id); };
  // 1) words still weak from last week, 2) placement misses, 3) weakest learned words, 4) earlier units
  if (prev) prev.newIds.concat(prev.reviewIds).filter(id => words[id] && words[id].box < 3).sort((a, b) => (words[b].wrong - words[b].right) - (words[a].wrong - words[a].right)).forEach(id => rev.length < cfg.reviewPerWeek && take(id));
  while (rev.length < cfg.reviewPerWeek && st.reviewPool.length) take(st.reviewPool.shift());
  Object.keys(words).filter(id => words[id].box < MASTER_BOX).sort((a, b) => words[a].box - words[b].box || words[b].wrong - words[a].wrong).forEach(id => rev.length < cfg.reviewPerWeek && take(id));
  if (rev.length < cfg.reviewPerWeek && cfg.textbook !== false) shuffle(QUEUE.filter(e => e.cu < cfg.startUnit && !words[e.id])).forEach(e => rev.length < cfg.reviewPerWeek && take(e.id));
  if (rev.length < cfg.reviewPerWeek && st.level && typeof GRADED !== "undefined") { const L = st.level.g; const known = new Set(st.level.known || []);
    shuffle(GRADED.filter(e => !e.soft && e.g >= L - 1.5 && e.g < L - 0.3 && !words[e.id] && !known.has(e.id))).forEach(e => rev.length < cfg.reviewPerWeek && take(e.id)); }
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
function clipFor(id, tag) { let p = PACKS[packOf(id)]; if (!(p && p[id] && p[id][tag]) && PACKS.TEST && PACKS.TEST[id]) p = PACKS.TEST; return p && p[id] && p[id][tag] ? "data:audio/mpeg;base64," + p[id][tag] : null; }
function speak(id, tag) {
  const e = BY[id]; if (!e) return;
  if (tag[0] === "y" && !clipFor(id, tag)) { loadPack(packOf(id)); tag = "s"; }
  const text = tag === "w" || tag === "s" ? e.w : e.ex[+tag.slice(1)];
  const rate = tag === "s" ? 0.55 : 0.9;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  const src = clipFor(id, tag);
  if (src) { try { player.pause(); player.src = src; player.playbackRate = 1; const p = player.play(); if (p) p.catch(() => say(text, rate)); return; } catch (err) {} }
  else if (view.name !== "level") loadPack(packOf(id));
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
  reload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
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
  coach: '<svg viewBox="0 0 120 120"><rect width="120" height="120" fill="#E2EDFF"/><circle cx="92" cy="26" r="26" fill="#FFC93C" opacity=".6"/><path d="M22 34h64a10 10 0 0 1 10 10v26a10 10 0 0 1-10 10H52l-16 14V80H22a10 10 0 0 1-10-10V44a10 10 0 0 1 10-10z" fill="#3F82F2"/><path d="M30 52h48M30 64h32" stroke="#fff" stroke-width="6" stroke-linecap="round"/></svg>',
  story: '<svg viewBox="0 0 120 120"><rect width="120" height="120" fill="#FFE6E2"/><circle cx="96" cy="96" r="34" fill="#FF6B5B" opacity=".3"/><path d="M20 36q20-8 40 2v56q-20-10-40-2z" fill="#FF6B5B"/><path d="M100 36q-20-8-40 2v56q20-10 40-2z" fill="#FF8A7A"/><path d="M28 50h22M28 60h22M70 50h22M70 60h22" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>',
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
  { key: "Meaning", types: ["mc_ko", "mc_def", "ctx_ko", "en_ko", "match"], color: "#5B3FD9", soft: "#ECE8FF", icon: I.book },
  { key: "Spelling", types: ["ko_en", "def_en", "train"], color: "#FF6B5B", soft: "#FFE6E2", icon: I.pencil },
  { key: "Listening", types: ["dict", "hear_ko"], color: "#3F82F2", soft: "#E2EDFF", icon: I.ear },
  { key: "Speaking", types: ["say", "saysent", "say_en", "coach"], color: "#1FA98F", soft: "#DBF5EE", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>' }
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
function render() { renderInner(); drawGear(); }
function renderInner() {
  if (mode === "teacher") { setShell("teacher"); return renderTeacher(); }
  const v = view.name;
  if (v === "loading") return;
  if (v === "login") { setShell("bare"); return renderLogin(); }
  if (v === "error") { setShell("bare"); $app.innerHTML = `<div class="splash"><div class="card" style="text-align:left">${buddy("sad", 80)}<h2>Something went wrong</h2><p>${esc(view.msg)}</p><div class="row"><button class="primary" data-act="reload">Try again</button><button class="ghost" data-act="signout">Sign out</button></div></div></div>`; return; }
  if (v === "placementIntro") { setShell("bare"); return renderPlacementIntro(); }
  if (v === "onboard") { setShell("bare"); return renderOnboard(); }
  if (v === "levelIntro") { setShell("bare"); return renderLevelIntro(); }
  if (v === "level") { setShell("focus"); return renderLevel(); }
  if (v === "levelResult") { setShell("focus"); return renderLevelResult(); }
  if (v === "run") { setShell("focus"); return renderRun(); }
  if (v === "train") { setShell("focus"); return renderTrain(); }
  if (v === "result") { setShell("focus"); return renderResult(); }
  if (v === "trainDone") { setShell("focus"); return renderTrainDone(); }
  if (v === "wordCard") { setShell("focus"); return renderWordCard(); }
  if (v === "coach") { setShell("focus"); return renderCoach(); }
  if (v === "story") { setShell("focus"); return renderStory(); }
  setShell("tabs");
  if (TAB === "today") return renderToday();
  if (TAB === "words") return renderWords();
  if (TAB === "progress") return renderProgress();
  if (TAB === "me") return renderMe();
}
const wsz = w => w.length > 13 ? "font-size:30px" : w.length > 10 ? "font-size:36px" : "";
function streakNow() { const s = ST.streak || {}; if (s.last === today() || s.last === addDays(today(), -1)) return s.count || 0; return 0; }
function quizDoneToday() { return ST.lastQuizDay === today(); }
function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; }

/* ---------- Today ---------- */
function renderToday() {
  const s = streakNow(); const wk = ST.week; const k = wk ? wk.key : weekKey(); const ids = weekIds();
  const needIntro = wk && !wk.introDone && !IS_OWNER; const locked = ST.lock && ST.lock.on && !IS_OWNER; const qd = quizDoneToday();
  const trained = wk ? (wk.trained || []).length : 0; const mastered = ids.filter(isMastered).length;
  const days = []; for (let i = 0; i < 7; i++) { const d = addDays(k, i); const dt = new Date(d + "T12:00:00");
    days.push(`<div class="wday ${(ST.quizDays || []).includes(d) ? "done" : ""} ${d === today() ? "today" : ""}">${DOW[dt.getDay()].slice(0, 2)}<i>${(ST.quizDays || []).includes(d) ? "✓" : dt.getDate()}</i></div>`); }
  const weak = ids.filter(id => !isMastered(id)).length;
  const cd = ST.coachDay === today(); const coachN = cd ? 3 : (ST.coachProg && ST.coachProg.day === today() ? Math.min(3, ST.coachProg.n) : 0);
  const sd = (ST.storyWeeks || []).includes(weekKey()); const sp = ST.storyProg && ST.storyProg.week === weekKey() ? ST.storyProg : null;
  const trainPct = locked ? 0 : needIntro ? Math.round(trained / Math.max(1, ids.length) * 100) : 100;
  const quizPct = qd && !locked ? 100 : 0;
  const coachPct = Math.round(coachN / 3 * 100);
  const storyPct = sd ? 100 : sp ? Math.round(sp.n / Math.max(1, sp.of) * 100) : 0;
  const bonusPct = Math.round(mastered / Math.max(1, ids.length) * 100);
  const dayPct = Math.round((trainPct + quizPct + coachPct + storyPct) / 4);
  const clk = m => `<span>${I.clock.replace("<svg", '<svg width="14" height="14"')} ${m} min</span>`;
  const card = o => o.done
    ? `<div class="step done" data-tour="${o.key}"><span class="dot"></span><button class="step-card complete" data-act="${o.act}"><div class="txt"><span class="eyebrow" style="color:var(--mint-ink)">${esc(o.title)}</span><h3>Completed! 🎉</h3><div class="meta"><span>${o.doneNote || "Tap to practice again"}</span></div>
        <div class="slot-bar"><i style="width:100%"></i></div><span class="slot-pct">100%</span></div><div class="art done-art">🎉</div></button></div>`
    : `<div class="step ${o.now ? "now" : ""}" data-tour="${o.key}"><span class="dot"></span><button class="step-card" data-act="${o.act}" ${o.disabled ? "disabled" : ""}><div class="txt"><span class="eyebrow">${o.eyebrow}</span><h3>${o.title}</h3><div class="meta">${o.meta}</div>
        <div class="slot-bar"><i style="width:${o.pct}%"></i></div><span class="slot-pct">${o.pct}% done</span></div><div class="art">${o.art}</div></button></div>`;
  const trainCard = card({ key: "train", act: "train", done: !locked && !needIntro, title: locked ? "Train your missed words" : "Learn this week's words", doneNote: "Train any time to practice more", now: locked || needIntro, pct: trainPct,
    eyebrow: locked ? "Required" : "Step 1 · this week", meta: (locked ? `<span class="pill bad">${ST.lock.ids.length} words</span>` : `<span class="pill">${trained}/${ids.length} learned</span>`) + clk(locked ? "5–10" : "20–30"), art: ART.train });
  const quizCard = card({ key: "quiz", act: "quiz", done: qd && !locked, title: "Daily quiz", doneNote: "Come back tomorrow to keep your streak 🔥", now: !needIntro && !locked, pct: quizPct, disabled: needIntro || locked,
    eyebrow: needIntro || locked ? "Locked" : "Daily", meta: (needIntro || locked ? `<span class="pill">${needIntro ? "Finish training first" : "Train missed words first"}</span>` : `<span class="pill sun">Keeps your streak</span>`) + `<span>${ST.quizSize} questions</span>`, art: needIntro || locked ? ART.lock : ART.quiz });
  const coachCard = card({ key: "coach", act: "coach", done: cd, title: "Sentence coach", pct: coachPct, disabled: needIntro, now: !needIntro && qd,
    eyebrow: needIntro ? "Locked" : "Speak", meta: `<span class="pill">${coachN}/3 sentences</span>` + clk(5), art: ART.coach });
  const storyCard = card({ key: "story", act: "story", done: sd, title: "Weekly story", doneNote: "Read it again any time this week", pct: storyPct, disabled: needIntro,
    eyebrow: needIntro ? "Locked" : "This week", meta: (sp ? `<span class="pill">Part ${sp.n}/${sp.of}</span>` : `<span class="pill sun">+30 XP</span>`) + `<span>A story with your words</span>`, art: ART.story });
  const bonusCard = card({ key: "bonus", act: "trainWeak", done: false, title: "Practice tricky words", pct: bonusPct, eyebrow: "Bonus", meta: `<span>${weak} not mastered yet</span>`, art: ART.bonus });
  $app.innerHTML = `${previewBar()}<section class="hero" data-tour="hero"><span class="deco" style="width:160px;height:160px;right:-40px;top:-50px"></span><span class="deco" style="width:70px;height:70px;left:-20px;bottom:30px"></span>
    <div class="hero-row"><div class="stack" style="gap:8px;flex:1"><div class="row between" style="padding-right:48px"><span class="muted" style="font-weight:800">${greeting()}${firstName() ? ", " + esc(firstName()) : ""}!</span></div><h1>${needIntro ? "New words this week" : locked ? "Let's fix those words" : qd ? "All done today" : "Ready to train?"}</h1>
    <div class="row"><span class="streak-chip" style="color:#FFC93C">${I.flame.replace("<svg", '<svg width="18" height="18"')}<span style="color:#fff">${s} day streak</span></span><span class="streak-chip">${mastered}/${ids.length} mastered</span>${ST.level ? `<span class="streak-chip">📈 ${esc(gradeWord(ST.level.g))}</span>` : ""}</div>${levelBar()}</div>
    ${buddy(qd ? "wow" : "happy", 92)}</div></section>
    <div class="week" aria-label="This week" data-tour="week">${days.join("")}</div>
    ${!IS_OWNER && !pushOn() && WW.pushPermission() !== "denied" && WW.pushPermission() !== "unsupported" ? `<div class="notice info row between"><span>🔔 Get reminders at 8am, 5pm and 8pm</span><button class="primary" data-act="pushOn">Turn on</button></div>` : ""}
    <div class="row between" style="margin-top:6px"><h2>Today's plan</h2><span class="pill ${dayPct === 100 ? "good" : ""}" style="font-size:15px;padding:6px 14px">${dayPct}% done today</span></div>
    ${dayPct === 100 ? `<div class="notice" style="background:var(--mint-soft);color:var(--mint-ink)">🎉 Everything for today is done. Amazing work!</div>` : ""}
    <div class="path">${trainCard}${quizCard}${coachCard}${storyCard}${bonusCard}</div>`;
  if (!tourAsked && !IS_OWNER && maybeAskPush()) { tourAsked = true; return; }
  if (!ST.tourDone && TI < 0 && !tourAsked) { tourAsked = true; setTimeout(startTour, 500); }
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
    return `<button class="list-row" data-act="openWord" data-id="${id}"><span style="display:grid;place-items:center">${ring(Math.min(100, box / MASTER_BOX * 100), isMastered(id) ? "#1FA98F" : "#7B61FF", 44)}</span><span style="flex:1;min-width:0"><b style="font-size:18px">${esc(e.w)}</b><br><span class="muted small">${esc(gloss(e))}</span></span>${isMastered(id) ? '<span class="pill good">mastered</span>' : ""}<span class="muted">${I.chev.replace("<svg", '<svg width="18" height="18"')}</span></button>`; }).join("")}</div></div>`;
  $app.innerHTML = `${previewBar()}<div class="stack" style="padding-top:18px"><span class="eyebrow">Week of ${wk ? wkShort(wk.key) : ""}</span><h1>Your words</h1><p class="muted">Tap a word to hear it and see its card. The ring fills as you master it.</p></div>
    ${wk ? sec("New this week", wk.newIds) + sec("Review", wk.reviewIds) : ""}`;
}
function wkShort(k) { const a = new Date(k + "T12:00:00"); return (a.getMonth() + 1) + "/" + a.getDate(); }
function cardBody(e) {
  return `<div class="row between" style="align-items:flex-start;flex-wrap:wrap;row-gap:8px"><div style="min-width:0"><div class="word" style="${wsz(e.w)}">${esc(e.w)}</div><p class="ipa">${esc(e.ipa)}</p></div>
      <div class="row" style="flex-wrap:nowrap">${spk(e.id, "w")}${spk(e.id, "s", "Slow", "icon-l")}</div></div>
    <div class="stack" style="gap:10px">${e.senses.map(x => `<div class="sense"><span class="pos-tag">${esc(x.pos)}</span><div>${KO() ? `<p class="ko">${esc(x.ko)}</p>` : ""}<p class="def" ${KO() ? "" : 'style="font-size:19px;font-weight:700;color:var(--ink)"'}>${esc(x.def)}</p></div></div>`).join("")}</div>
    <div class="stack" style="gap:8px"><p class="label">Syllables${e.syl.includes("·") ? " · tap to hear · dark = strongest" : ""}</p><div class="parts">${sylButtons(e)}</div></div>
    <div class="stack" style="gap:8px"><p class="label">Examples</p>${e.ex.map((x, k) => `<div class="ex">${spk(e.id, "e" + k)}<p>${exHtml(x, e.w)}</p></div>`).join("")}</div>`;
}
function renderWordCard() { const e = BY[view.id];
  $app.innerHTML = `<div class="topbar"><button class="x" data-act="closeWord" aria-label="Back">${I.back}</button><span class="count" style="flex:1">Word card</span><span style="width:44px;flex:none"></span></div>
  <div class="card">${cardBody(e)}<button class="big primary" data-act="trainOne" data-id="${e.id}">Train this word</button></div>`;
}

/* ---------- Progress tab (student) ---------- */
let PROG = null, PROG_RANGE = "week"; let tourAsked = false;
async function loadProgress() { const [atts, sess] = await Promise.all([getAll(sPath() + "/attempts"), getAll(sPath() + "/sessions")]); PROG = { atts, sess, at: Date.now() }; }
function renderProgress() {
  if (!PROG) { $app.innerHTML = `${previewBar()}<div class="splash"><p class="muted">Loading your progress…</p></div>`; loadProgress().then(render).catch(() => { PROG = { atts: [], sess: [] }; render(); }); return; }
  const wk = weekKey(); const allTime = PROG_RANGE === "all";
  const atts = PROG.atts.filter(a => (a.kind !== "placement" && a.kind !== "level") && (allTime || a.weekKey === wk));
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
  $app.innerHTML = `${previewBar()}<div class="row between" style="padding-top:18px;padding-right:52px"><h1>Progress</h1><div class="seg"><button data-act="range" data-r="week" aria-pressed="${!allTime}">This week</button><button data-act="range" data-r="all" aria-pressed="${allTime}">All time</button></div></div>
   <div class="tiles">
     <div class="tile"><span class="ic" style="background:#FFF4D6;color:#E0A100">${I.flame}</span><b>${streakNow()}</b><span>day streak · best ${ST.streak.best || 0}</span></div>
     <div class="tile"><span class="ic" style="background:#ECE8FF;color:#5B3FD9">${I.star}</span><b>Lv ${levelInfo().n}</b><span>${ST.xp || 0} XP total</span></div>
     <div class="tile"><span class="ic" style="background:#DBF5EE;color:#1FA98F">${I.star}</span><b>${mastered}</b><span>words mastered</span></div>
   </div>
   ${levelCard()}
   <div class="card"><div class="row between"><h3>Study time</h3><span class="muted small">${totalMin} min ${allTime ? "total" : "this week"}</span></div>${minutesChart}</div>
   <div class="card"><div class="row between"><h3>Quiz scores</h3><span class="muted small">${qs.length} quiz${qs.length === 1 ? "" : "zes"}</span></div>${qChart}</div>
   <div class="card"><h3>Your skills</h3>${skillRows(items)}</div>
   <div class="card"><h3>Words</h3><div class="row" style="gap:18px;flex-wrap:nowrap">${donut([{ v: mastered, color: "#1FA98F" }, { v: learning, color: "#7B61FF" }, { v: notSeen, color: "#FFC93C" }])}
     <div class="stack" style="gap:8px"><span class="row" style="gap:8px"><i style="width:12px;height:12px;border-radius:4px;background:#1FA98F"></i><b>${mastered}</b> mastered</span><span class="row" style="gap:8px"><i style="width:12px;height:12px;border-radius:4px;background:#7B61FF"></i><b>${learning}</b> learning</span><span class="row" style="gap:8px"><i style="width:12px;height:12px;border-radius:4px;background:#FFC93C"></i><b>${notSeen}</b> not started</span></div></div></div>
   <div class="card"><div class="row between"><h3>Streak calendar</h3><span class="muted small">last 5 weeks</span></div><div class="cal">${cal}</div><p class="muted small"><span class="pill sun">quiz done</span> <span class="pill">studied</span></p></div>
   <div class="card"><h3>Tricky words</h3>${tricky.length ? tricky.map(([id, b]) => `<button class="list-row" data-act="openWord" data-id="${id}"><span style="flex:1"><b>${esc(BY[id].w)}</b><br><span class="muted small">${esc(gloss(BY[id]))}</span></span><span class="pill bad">${b.n - b.ok} missed</span></button>`).join("") : `<p class="muted">No misses ${allTime ? "yet" : "this week"}. Nice!</p>`}</div>`;
}
function renderMe() {
  const email = (WW.user() && WW.user().email) || "";
  $app.innerHTML = `${previewBar()}<div class="stack" style="padding-top:18px;align-items:center;text-align:center">${buddy("happy", 96)}<h1>${esc(firstName() || email.split("@")[0] || "Me")}</h1><p class="muted">${esc(email)}${ST.level ? " · " + esc(gradeWord(ST.level.g)) : ""}</p></div>
   <div class="card"><h3>This week's goal</h3>${goalHtml()}</div>
   <div class="card"><h3>Word meanings</h3><div class="seg" style="width:100%"><button data-act="setLang" data-v="ko" aria-pressed="${KO()}" style="flex:1">English + 한국어</button><button data-act="setLang" data-v="en" aria-pressed="${!KO()}" style="flex:1">English only</button></div></div>
   <div class="card"><div class="row between"><h3>Level ${levelInfo().n}</h3><span class="pill sun">${ST.xp || 0} XP</span></div>${levelBar()}<p class="muted small">Earn XP for every right answer, word you learn, sentence and story.</p></div>
   <div class="card"><div class="row between"><h3>Badges</h3><span class="pill">${Object.keys(ST.badges || {}).length}/${BADGES.length}</span></div>${badgeGrid()}</div>
   ${pushCard()}
   <button class="big icon-l" data-act="tour">🧭 Show me around the app</button>
   ${voicePicker()}
   <div class="card"><h3>Sounds</h3><p class="muted">Words and sentences play recorded audio. If a word has no recording yet, your phone's voice reads it. Pick that voice above.</p></div>
   <button class="big icon-l" data-act="reload">${I.reload} Reload app</button>
   ${IS_OWNER ? "" : `<button class="big" data-act="signout">Sign out</button>`}`;
}

/* ---------- quiz & placement ---------- */
let RUN = null;
async function startRun(kind) {
  const qs = kind === "placement" ? buildPlacement() : buildQuiz2();
  if (!qs.length) { toast("No words yet"); return; }
  RUN = { kind, qs, i: 0, t0: Date.now(), answered: false, right: 0 };
  startAttempt(kind, { n: qs.length }); logDid(kind);
  view = { name: "run" }; render(); if (kind === "quiz") maybeTour("quiz");
  if (kind === "quiz") { await loadPacksFor(qs.map(q => q.id)); }
  RUN && (RUN.t0 = Date.now()); autoSpeak();
}
function autoSpeak() { const q = RUN && RUN.qs[RUN.i]; if (q && (q.t === "dict" || q.t === "hear_ko")) speak(q.id, "w"); }
function qPrompt(q) {
  const e = BY[q.id]; const hint = (RUN && RUN.kind === "quiz" ? hintsToday() : CFG.hints) ? `<p class="hint">${esc(e.w[0])}${" _".repeat(Math.max(0, e.w.length - 1))}</p>` : "";
  const kos = `<div class="stack" style="gap:6px">${e.senses.map(x => `<div class="sense"><span class="pos-tag">${esc(x.pos)}</span><p class="q-prompt">${esc(sgloss(x))}</p></div>`).join("")}</div>`;
  if (q.t === "mc_ko") return `<p class="label">What does this word mean?</p><div class="row between" style="flex-wrap:nowrap"><div class="word" style="${wsz(e.w)}">${esc(e.w)}</div>${spk(e.id, "w")}</div>`;
  if (q.t === "mc_def") return `<p class="label">Which word matches?</p><p class="q-prompt">${esc(e.def)}</p>`;
  if (q.t === "ko_en") return `<p class="label">Type the English word</p>${kos}${hint}`;
  if (q.t === "def_en") return `<p class="label">Type the word for this meaning</p><div class="sense"><span class="pos-tag">${esc(e.pos)}</span><p class="q-prompt">${esc(e.def)}</p></div>${hint}`;
  if (q.t === "hear_ko") return `<p class="label">Listen. What does it mean?</p><div class="row" style="flex-wrap:nowrap">${spk(e.id, "w", "Play word", "big primary icon-l")}${spk(e.id, "s", "Slow", "icon-l")}</div>`;
  if (q.t === "ctx_ko") return `<p class="label">What does the underlined word mean here?</p><div class="ex">${spk(e.id, "e0")}<p style="font-size:20px;font-weight:700">${exHtml(e.ex[0], e.w)}</p></div>`;
  if (q.t === "en_ko") return `<p class="label">Type the Korean meaning (one meaning is enough)</p><div class="row between" style="flex-wrap:nowrap"><div class="word" style="${wsz(e.w)}">${esc(e.w)}</div>${spk(e.id, "w")}</div>`;
  if (q.t === "say_en") return `<p class="label">Say the English word out loud</p>${kos}`;
  if (q.t === "match") return matchHtml(q);
  if (q.t === "blank_mc") return `<p class="label">Fill in the blank</p><p class="q-prompt" style="font-weight:700">${blankSentence(e)}</p>`;
  if (q.t === "blank_ty") return `<p class="label">Type the missing word</p><p class="q-prompt" style="font-weight:700">${blankSentence(e)}</p><p class="muted small">${esc(senseList(e).map(sgloss).join(" / "))}</p>${hint}`;
  if (q.t === "dict") return `<p class="label">Listen and type what you hear</p><div class="row" style="flex-wrap:nowrap">${spk(e.id, "w", "Play word", "big primary icon-l")}${spk(e.id, "s", "Slow", "icon-l")}</div>`;
  return "";
}
function topbar(i, n, extra) { return `<div class="topbar"><button class="x" data-act="quit" aria-label="Stop">${I.x}</button><div class="bar"><i style="width:${Math.round(i / n * 100)}%"></i></div><span class="count">${extra || (i + 1) + "/" + n}</span><span style="width:44px;flex:none"></span></div>`; }
function renderRun() {
  const q = RUN.qs[RUN.i]; const e = BY[q.id]; const typed = EN_TYPED.has(q.t) || q.t === "en_ko"; const enTyped = EN_TYPED.has(q.t);
  let body = "";
  if (q.t === "match") body = "";
  else if (q.t === "say_en") body = runSayHtml(q, e);
  else if (typed) body = `<form class="stack" data-form="answer"><input class="answer" id="ans" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" ${RUN.answered ? "disabled" : ""} value="${esc(RUN.lastAns || "")}" aria-label="Your answer" placeholder="${q.t === "en_ko" ? "한국어로 쓰세요" : "Type here"}" ${q.t === "en_ko" ? 'lang="ko"' : ""}>
     ${RUN.answered ? "" : `<button class="big primary" type="submit">Check</button><button type="button" class="ghost" data-act="idk" style="align-self:center">I don't know</button>`}</form>`;
  else body = `<div class="opts">${q.opts.map(o => { let c = ""; const bw = q.t === "blank_mc" && (RUN.bWrong || []).includes(o.id); if (RUN.answered) { if (o.id === q.id) c = "right"; else if (o.id === RUN.picked) c = "wrong"; } else if (bw) c = "wrong";
     return `<button class="opt ${c}" data-act="pick" data-id="${o.id}" ${RUN.answered || bw ? "disabled" : ""}>${esc(o.label)}</button>`; }).join("")}</div>`;
  if ((q.t === "blank_mc" || q.t === "blank_ty") && RUN.kind === "quiz" && !RUN.answered && RUN.bTries) body = blankClue(q, e) + body;
  let fb = "";
  const nextBtn = `<button class="big primary" data-act="next" id="nextBtn">${RUN.i + 1 < RUN.qs.length ? "Next" : "See my score"}</button>`;
  if (RUN.answered && RUN.kind !== "placement" && q.t === "match") fb = `<div class="fb ${RUN.ok ? "good" : "bad"}">${RUN.ok ? "Perfect matching!" : "All matched. Some took more than one try."}</div>` + nextBtn;
  else if (RUN.answered && RUN.kind !== "placement" && q.t === "say_en") fb = (RUN.ok || RUN.fixed || (RUN.fixTries || 0) >= 3) ? nextBtn : "";
  else if (RUN.answered && RUN.kind === "quiz" && (q.t === "blank_mc" || q.t === "blank_ty")) fb = blankExplain(e) + nextBtn;
  else if (RUN.answered && RUN.kind !== "placement") {
    fb = RUN.ok ? `<div class="fb good">Correct! <span class="mono">${esc(e.w)}</span> = ${esc(gloss(e))}</div>`
      : `<div class="fb bad stack" style="gap:6px"><span>The answer is <b class="mono">${esc(e.w)}</b> (${esc(gloss(e))})</span>${enTyped && RUN.lastAns ? `<span class="diff">${diffHtml(RUN.lastAns, e.w)}</span>` : ""}</div>`;
    if (enTyped && !RUN.ok && !RUN.fixed) fb += fixForm(e, "fixQuiz");
    else fb += `${enTyped && !RUN.ok ? `<div class="fb good">Good. Now you've spelled it right.</div>` : ""}` + nextBtn;
  }
  $app.innerHTML = `${topbar(RUN.i, RUN.qs.length)}<span class="eyebrow">${RUN.kind === "placement" ? "Word check" : "Daily quiz"}</span><div class="card">${qPrompt(q)}${body}${fb}</div>`;
  const inp = document.getElementById("ans"); if (inp && !RUN.answered) inp.focus();
  const fx = document.getElementById("fix"); if (fx) fx.focus();
}
function runSayHtml(q, e) {
  const err = RUN.micErr === "blocked" ? `<div class="notice">The microphone is turned off. On iPhone: Settings → Apps → Safari → Microphone → Allow.</div><button class="big" data-act="sayGiveUp">Skip this question</button>` : RUN.micErr === "unsupported" ? `<button class="big" data-act="sayGiveUp">This phone can't listen · skip</button>` : "";
  const needFix = RUN.answered && !RUN.ok && !RUN.fixed && (RUN.fixTries || 0) < 3;
  if (RUN.answered && (RUN.ok || RUN.fixed || !needFix)) return `<div class="fb ${RUN.ok ? "good" : RUN.fixed ? "good" : "bad"}">${RUN.ok ? "Correct! " : RUN.fixed ? "Good, now you said it right. " : "The word is "}<b class="mono">${esc(e.w)}</b></div>`;
  return `${RUN.answered ? `<div class="fb bad">${esc(RUN.heard || "")} The word is <b class="mono">${esc(e.w)}</b>. Listen, then say it to continue.</div><div class="row">${spk(e.id, "w", "Listen", "icon-l")}${spk(e.id, "s", "Slow", "icon-l")}</div>` : (RUN.heard ? `<div class="fb bad">${esc(RUN.heard)}</div>` : "")}
    <button class="mic ${RUN.listening ? "on" : ""}" data-act="qmic" ${RUN.listening ? "disabled" : ""} aria-label="Tap, then speak">${ICON_MIC}</button>
    <p class="muted" style="text-align:center;font-weight:800">${RUN.listening ? "Listening… speak now" : "Tap the mic, then say the word"}</p>${err}`;
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
  let ok; if (MC_TYPES.has(q.t)) { ok = picked === q.id; RUN.picked = picked; const o = (q.opts || []).find(x => x.id === picked); ans = o ? o.label : ""; }
  else if (q.t === "en_ko") ok = koMatch(ans, e);
  else ok = norm(ans) === norm(e.w);
  if ((q.t === "blank_mc" || q.t === "blank_ty") && RUN.kind === "quiz") { // keep trying until right; only the first try counts
    if (!ok) { if (!RUN.bTries) record(q.id, q.t, false, ans, ms); RUN.bTries = (RUN.bTries || 0) + 1; RUN.bWrong = (RUN.bWrong || []).concat([picked || ans]); RUN.lastAns = q.t === "blank_ty" ? "" : ans; return render(); }
    const first = !RUN.bTries; RUN.ok = first; RUN.answered = true; RUN.lastAns = ans;
    if (first) { RUN.right++; award(10, "answer"); record(q.id, q.t, true, ans, ms); } else award(2, "fixed");
    speak(e.id, "w"); return render();
  }
  RUN.ok = ok; RUN.answered = true; RUN.lastAns = ans; if (ok) { RUN.right++; award(10, "answer"); }
  record(q.id, q.t, ok, ans, ms);
  if (RUN.kind === "placement") { setTimeout(next, 120); return; }
  if (!ok) speak(e.id, "w");
  render();
}
function next() {
  RUN.i++; RUN.bTries = 0; RUN.bWrong = []; RUN.answered = false; RUN.fixed = false; RUN.heard = ""; RUN.micErr = ""; RUN.fixTries = 0; RUN.listening = false; RUN.lastAns = ""; RUN.picked = null; RUN.t0 = Date.now();
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
    buildWeek(ST, WORDS, effCfg(ST), true); loadPacksFor(weekIds());
  } else {
    const d = today(); const s = ST.streak || { count: 0, best: 0, last: "" };
    if (s.last !== d) { s.count = s.last === addDays(d, -1) ? (s.count || 0) + 1 : 1; s.last = d; s.best = Math.max(s.best || 0, s.count); }
    ST.streak = s; ST.lastQuizDay = d; ST.quizDays = (ST.quizDays || []).filter(x => x >= addDays(d, -40)).concat(ST.quizDays && ST.quizDays.includes(d) ? [] : [d]);
    if (score * 100 < CFG.passPct) { ST.lock = { on: true, ids: wrongIds, since: Date.now(), quiz: ATT.id }; ATT.locked = true; ST.lockCount = (ST.lockCount || 0) + 1; }
    bumpStat("quizzes"); award(20, "quiz done"); if (RUN.right === n) { bumpStat("perfect"); award(50, "perfect"); }
    if (new Date().getHours() < 8) bumpStat("early");
  }
  saveAttempt(); saveST(); logDid(RUN.kind + ":" + Math.round(score * 100) + "%"); PROG = null;
  view = { name: "result", kind: RUN.kind, score, n, right: RUN.right, wrongIds }; RUN = null; render(); if (view.kind === "quiz") setTimeout(checkBadges, 600);
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
  ${v.wrongIds.length ? `<div class="card"><h3>Missed words</h3><div class="chips">${v.wrongIds.map(id => `<span class="chip">${esc(BY[id].w)} · ${esc(gloss(BY[id]))}</span>`).join("")}</div></div>` : ""}
  ${pass && ST.coachDay !== today() ? `<button class="big primary" data-act="coach">Next: Sentence coach</button><button class="big" data-act="home">Later</button>` : `<button class="big primary" data-act="${pass ? "home" : "train"}">${pass ? "Done" : "Start training"}</button>`}`;
}

/* ---------- training ---------- */
let TR = null;
async function startTraining(ids, reasonIn) {
  const wk = ST.week; let reason = reasonIn || "free";
  if (!ids) { if (ST.lock && ST.lock.on) { ids = ST.lock.ids.slice(); reason = "missed"; }
    else if (wk && !wk.introDone) { ids = weekIds().filter(id => !(wk.trained || []).includes(id)); reason = "intro"; if (!ids.length) ids = weekIds(); }
    else { ids = shuffle(weekIds()).sort((a, b) => (WORDS[a] ? WORDS[a].box : 0) - (WORDS[b] ? WORDS[b].box : 0)).slice(0, 10); } }
  if (!ids.length) { toast("No words to train"); return; }
  TR = { ids: ids.slice(), queue: ids.slice(), reason, step: "study", done: 0, total: ids.length, t0: Date.now(), seen: {}, ratings: {} };
  startAttempt("training", { reason, n: ids.length, required: reason === "missed" || reason === "intro" }); logDid("training:" + reason);
  view = { name: "train" }; render(); maybeTour("train"); await loadPacksFor(ids); if (TR && TR.step === "study") speak(TR.queue[0], "w");
}
function exHtml(s, w) { const re = new RegExp("\\b(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\w*)", "i"); return esc(s).replace(re, "<mark>$1</mark>"); }
function sylButtons(e) {
  const rs = e.rs.split("-"), parts = e.syl.split("·");
  const si = parts.length === 1 ? 0 : (rs.length === parts.length ? rs.findIndex(p => p !== p.toLowerCase()) : -1);
  return parts.map((p, i) => parts.length > 1 ? `<button class="syl ${i === si ? "stress" : ""}" data-act="speak" data-id="${e.id}" data-tag="y${i}" aria-label="Hear ${esc(p)}">${esc(p)}</button>` : `<span class="syl stress">${esc(p)}</span>`).join("");
}
function renderTrain() {
  const id = TR.queue[0]; const e = BY[id];
  const head = topbar(TR.done, TR.total, `${TR.done}/${TR.total}`) + `<span class="eyebrow">Training${TR.reason === "missed" ? " · missed words" : ""}</span>`;
  if (TR.step === "study") {
    $app.innerHTML = head + `<div class="card">${cardBody(e)}
      ${speakOn() && !TR.seen[id] ? `<button class="big primary icon-l" data-act="toSpeak">${ICON_MIC} I'm ready · say it out loud</button>` : `<button class="big primary" data-act="cover">I'm ready · cover &amp; write</button>`}</div>`;
    return;
  }
  if (TR.step === "speak") { $app.innerHTML = head + speakHtml(e); return; }
  $app.innerHTML = head + `<div class="card">
    <p class="label">Write the word from memory</p>
    <div class="stack" style="gap:6px">${e.senses.map(x => `<div class="sense"><span class="pos-tag">${esc(x.pos)}</span><p class="q-prompt">${esc(sgloss(x))}</p></div>`).join("")}</div>
    <div class="row">${spk(e.id, "w", "Hear it", "icon-l")}<span class="hint">${e.w.length} letters</span></div>
    <form class="stack" data-form="trainWrite"><input class="answer" id="ans" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" ${TR.fb ? "disabled" : ""} value="${esc(TR.lastAns || "")}" aria-label="Your spelling" placeholder="Type here">
    ${TR.fb ? "" : `<button class="primary big" type="submit">Check</button>`}</form>
    ${TR.fb ? (TR.fb === "ok" ? `<div class="fb good">Perfect spelling!</div>` : `<div class="fb bad stack" style="gap:6px"><span>It's <b class="mono">${esc(e.w)}</b>${e.syl.includes("·") ? ` (${esc(e.syl)})` : ""}. This word comes back at the end.</span><span class="diff">${diffHtml(TR.lastAns, e.w)}</span></div>`)
      + (TR.fb === "bad" && !TR.fixed ? fixForm(e, "fixTrain") : `${TR.fb === "bad" ? `<div class="fb good">Good. Now you've spelled it right.</div>` : ""}${rateHtml()}`) : ""}
  </div>`;
  const inp = document.getElementById("ans"); if (inp && !TR.fb) inp.focus();
  const fx = document.getElementById("fix"); if (fx) fx.focus();
}
function trainCheck(ans) {
  const id = TR.queue[0]; const e = BY[id]; const ok = norm(ans) === norm(e.w);
  record(id, "train", ok, ans, Date.now() - TR.t0); TR.fb = ok ? "ok" : "bad"; TR.lastAns = ans; if (ok) award(5, "spell");
  speak(e.id, "w"); render();
}
function rateHtml() {
  return `<p class="label" style="text-align:center">How well do you know this word?</p><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
    <button class="opt rate" data-act="rate" data-r="bad" style="text-align:center"><span style="font-size:34px">😟</span><br><span class="small">Again ×2</span></button>
    <button class="opt rate" data-act="rate" data-r="mid" style="text-align:center"><span style="font-size:34px">😐</span><br><span class="small">Once more</span></button>
    <button class="opt rate" data-act="rate" data-r="good" style="text-align:center"><span style="font-size:34px">😊</span><br><span class="small">Got it!</span></button></div>`;
}
function trainNext(rating) {
  const id = TR.queue.shift();
  TR.seen[id] = (TR.seen[id] || 0) + 1;
  if (rating) { (TR.ratings[id] = TR.ratings[id] || []).push(rating); ATT.ratings = TR.ratings; }
  let extra = rating === "bad" ? 2 : rating === "mid" ? 1 : 0;
  if (TR.fb !== "ok") extra = Math.max(extra, 1);
  if (TR.fb === "ok" && TR.reason === "intro" && ST.week && !(ST.week.trained || []).includes(id)) { ST.week.trained = (ST.week.trained || []).concat([id]); saveST(); }
  // spread the extra reviews out: one a few cards later, one at the end
  if (extra >= 1) TR.queue.splice(Math.min(3, TR.queue.length), 0, id);
  if (extra >= 2) TR.queue.push(id);
  if (!TR.queue.includes(id)) TR.done++;
  TR.fb = null; TR.fixed = false; TR.sp = null; TR.lastAns = ""; TR.step = "study"; TR.t0 = Date.now();
  if (!TR.queue.length) return finishTraining();
  render(); speak(TR.queue[0], "w");
}
function finishTraining() {
  ATT.end = Date.now(); const tr = ATT.items.filter(i => i.t === "train"); ATT.score = tr.length ? tr.filter(i => i.ok).length / tr.length : 1;
  if (TR.reason === "missed") { ST.lock = Object.assign({}, ST.lock, { on: false, clearedAt: Date.now() }); bumpStat("unlocks"); }
  award(10, "training done"); if (new Date().getHours() < 8) bumpStat("early");
  if (TR.reason === "intro" && ST.week) ST.week.introDone = true;
  saveAttempt(); saveST(); logDid("training done"); PROG = null;
  view = { name: "trainDone", reason: TR.reason, n: TR.total }; TR = null; render(); setTimeout(checkBadges, 600);
}
function renderTrainDone() { const r = view.reason;
  $app.innerHTML = `<div style="height:14px"></div><div class="result-hero">${buddy("wow", 110)}<h1>${r === "coach" ? "Great speaking!" : r === "missed" ? "Quiz unlocked!" : r === "intro" ? "Daily quiz unlocked!" : "Nice practice!"}</h1><p style="opacity:.9">${r === "coach" ? "You made " + view.n + " sentences." : "You trained " + view.n + " word" + (view.n === 1 ? "" : "s") + "."}</p></div>
  <button class="big primary" data-act="home">${r === "free" || r === "weak" ? "Back home" : "Go to today's plan"}</button>`;
}

/* ---------- speaking ---------- */
const speakOn = () => CFG.speak !== false && !srBroken;
const toks = x => norm(x).replace(/[’']/g, "").replace(/[^a-z0-9 ]+/g, " ").split(" ").filter(Boolean);
function phKey(s) { // rough sound-alike key
  s = s.toLowerCase().replace(/[^a-z]/g, ""); if (!s) return "";
  s = s.replace(/^kn|^gn|^wr/, m => m[1]).replace(/ph/g, "f").replace(/ck|q/g, "k").replace(/c(?=[eiy])/g, "s").replace(/c/g, "k").replace(/x/g, "ks").replace(/z/g, "s").replace(/dg/g, "j").replace(/tch/g, "ch").replace(/gh/g, "").replace(/wh/g, "w").replace(/(.)\1+/g, "$1");
  return s[0] + s.slice(1).replace(/[aeiouyhw]/g, "");
}
function soundsLike(tok, w) { const t = toks(w).join(""); if (!tok) return false;
  const forms = [t, t + "s", t + "es", t + "ed", t + "d", t + "ing", t + "y", t + "er"]; if (forms.includes(tok)) return true;
  const pa = phKey(tok), pb = phKey(t);
  if (pa === pb) return true;
  if (lev(tok, t) <= (t.length <= 3 ? 1 : t.length <= 6 ? 2 : t.length <= 9 ? 3 : 4)) return true;
  return lev(pa, pb) <= (pb.length <= 3 ? 1 : 2) && Math.abs(tok.length - t.length) <= 3; }
function countHeard(text, w) { const A = toks(text), parts = toks(w); let n = 0;
  for (let i = 0; i + 2 < A.length + 1 && parts.length === 1; i++) { if (i + 2 < A.length && soundsLike(A[i] + A[i + 1] + A[i + 2], w)) { n++; i += 2; continue; } }
  if (n) return n;
  for (let i = 0; i < A.length; i++) { if (soundsLike(A[i], w)) { n++; continue; } if (parts.length === 1 && i + 1 < A.length && soundsLike(A[i] + A[i + 1], w)) { n++; i++; } }
  if (!n && soundsLike(A.join(""), w)) n = 1; return n; }
function wordHeard(alts, w) { return alts.some(a => countHeard(a, w) > 0); }
function lcsLen(A, B) { const L = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]); return L[0][0]; }
function sentHeard(alts, sent) { const B = toks(sent); return alts.some(a => lcsLen(toks(a), B) / B.length >= 0.75); }
function startSpeak() { const e = BY[TR.queue[0]];
  TR.sp = { targets: [{ kind: "w", tag: "w", text: e.w, need: 1, got: 0 }].concat(e.ex.map((x, k) => ({ kind: "s", tag: "e" + k, text: x, need: 1, got: 0 }))), idx: 0, fails: 0, tries: 0, heard: "", ok: false, listening: false, err: "" };
  TR.step = "speak"; render(); speak(e.id, "w"); }
function speakHtml(e) {
  const sp = TR.sp; const done = sp.idx >= sp.targets.length; const tg = sp.targets[sp.idx];
  const list = sp.targets.map((t, k) => `<span class="pill ${k < sp.idx ? "good" : ""}" style="${k > sp.idx ? "opacity:.5" : ""}">${k < sp.idx ? "✓ " : ""}${t.kind === "w" ? "Word" : "Sentence " + k}</span>`).join("");
  if (done) return `<div class="card" style="align-items:center;text-align:center">${buddy("wow", 96)}<h2>Great speaking!</h2><p class="muted">Now write it from memory.</p><button class="big primary" data-act="cover" id="nextBtn">Cover &amp; write</button></div>`;
  const target = tg.kind === "w"
    ? `<div class="stack" style="align-items:center;text-align:center;gap:8px"><p class="muted small" style="font-weight:800">Tap the mic and say the word</p><div class="word" style="${wsz(e.w)}">${esc(e.w)}</div><div class="dots">${Array.from({ length: tg.need }, (_, k) => `<i class="${k < tg.got ? "on" : ""}"></i>`).join("")}</div><div class="row">${spk(e.id, "w", "Listen", "icon-l")}${spk(e.id, "s", "Slow", "icon-l")}</div></div>`
    : `<div class="ex">${spk(e.id, tg.tag)}<p style="font-size:21px;font-weight:700">${exHtml(tg.text, e.w)}</p></div><p class="muted small">Listen first, then read the whole sentence out loud.</p>`;
  const err = sp.err === "blocked" ? `<div class="notice">The microphone is turned off. On iPhone: <b>Settings → Apps → Safari → Microphone → Allow</b>, and <b>Settings → General → Keyboard → Enable Dictation</b> on. Then tap the button again.</div>`
    : sp.err === "unsupported" ? `<div class="notice">This browser can't listen. Open the app in Safari on your iPhone.</div><button class="big" data-act="cover">Continue to writing</button>` : "";
  return `<div class="card"><div class="row between"><p class="label">Say it out loud</p><div class="chips">${list}</div></div>${target}
    <button class="mic ${sp.listening ? "on" : ""}" id="micBtn" data-act="mic" ${sp.listening ? "disabled" : ""} aria-label="Tap, then speak">${ICON_MIC}</button>
    <p class="muted" style="text-align:center;font-weight:800">${sp.listening ? "Listening… speak now" : "Tap the mic, then speak"}</p>
    ${sp.heard ? `<div class="fb ${sp.ok ? "good" : "bad"}">${esc(sp.heard)}</div>` : ""}${err}
    ${sp.tries >= 3 ? `<button class="big" data-act="spSkip" style="align-self:center">The app can't hear it right · skip (your teacher will see this)</button>` : ""}</div>`;
}
function listen() {
  const sp = TR.sp; if (!sp || sp.listening) return; const e = BY[TR.queue[0]]; const tg = sp.targets[sp.idx]; if (!tg) return;
  let rec; try { rec = new SR(); } catch (err) { sp.err = "unsupported"; return render(); }
  rec.lang = "en-US"; rec.interimResults = true; rec.maxAlternatives = 3; rec.continuous = true;
  stopAudio(); sp.listening = true; sp.heard = ""; sp.err = ""; render();
  let decided = false, lastText = "", timer = null, best = 0, quiet = null; const startGot = tg.got; let matched = "", quietS = null;
  if (tg.kind === "w") {
    const wordEnd = () => { if (decided) return; decided = true; clearTimeout(timer); clearTimeout(quiet); try { rec.abort(); } catch (x) {} sp.listening = false;
      sp.tries++;
      if (!lastText) { sp.ok = false; sp.heard = "I didn't hear anything. Tap and speak a little louder."; return render(); }
      const ok = best > 0; record(e.id, "say", ok, lastText, 0); sp.ok = ok;
      if (ok) { sp.fails = 0; bumpStat("say", best); award(2 * best, "say"); sp.heard = "✓ I heard: “" + lastText + "”";
        if (tg.got >= tg.need) { sp.idx++; sp.tries = 0; const nx = sp.targets[sp.idx]; if (nx) setTimeout(() => { if (TR && TR.sp === sp && !sp.listening) speak(e.id, nx.tag); }, 600); }
        else sp.heard += " Say it " + (tg.need - tg.got) + " more time" + (tg.need - tg.got === 1 ? "" : "s") + "."; }
      else { sp.fails++; sp.heard = "I heard: “" + lastText + "”. Listen again and try once more."; }
      if (TR && TR.sp === sp) render(); };
    rec.onresult = ev => { let joined = ""; for (let i = 0; i < ev.results.length; i++) joined += " " + ev.results[i][0].transcript; joined = joined.trim(); lastText = joined || lastText;
      const L = ev.results[ev.results.length - 1]; let c = countHeard(joined, tg.text); for (let k = 1; k < L.length; k++) c = Math.max(c, countHeard(L[k].transcript, tg.text));
      if (c > best) { best = c; tg.got = Math.min(tg.need, startGot + best); const dots = document.querySelectorAll(".dots i"); dots.forEach((d, k) => d.classList.toggle("on", k < tg.got)); }
      if (tg.got >= tg.need) return wordEnd();
      clearTimeout(quiet); quiet = setTimeout(wordEnd, 1600); };
    rec.onerror = ev => { if (/not-allowed|service-not-allowed/.test(ev.error)) { decided = true; clearTimeout(timer); sp.listening = false; sp.err = "blocked"; render(); } };
    rec.onend = () => wordEnd();
    timer = setTimeout(wordEnd, 7000);
    try { rec.start(); } catch (err) { decided = true; sp.listening = false; sp.err = "unsupported"; render(); }
    return;
  }
  const check = alts => tg.kind === "w" ? wordHeard(alts, tg.text) : sentHeard(alts, tg.text);
  const finish = (ok, text) => {
    if (decided) return; decided = true; clearTimeout(timer);
    try { rec.abort(); } catch (x) {}
    sp.listening = false; sp.tries++;
    if (!text) { sp.ok = false; sp.heard = "I didn't hear anything. Tap and speak a little louder."; return render(); }
    record(e.id, tg.kind === "w" ? "say" : "saysent", ok, text, 0); sp.ok = ok;
    if (ok) { tg.got++; sp.fails = 0; sp.heard = "✓ I heard: “" + text + "”"; bumpStat("say"); award(2, "say"); if (tg.got >= tg.need) { sp.idx++; sp.tries = 0; const nx = sp.targets[sp.idx]; if (nx) setTimeout(() => { if (TR && TR.sp === sp && !sp.listening) speak(e.id, nx.tag); }, 600); } }
    else { sp.fails++; sp.heard = "I heard: “" + text + "”. Listen again and try once more."; }
    if (TR && TR.sp === sp) render();
  };
  rec.onresult = ev => {
    // join everything heard so far (sentences arrive in pieces)
    let joined = "", alts = [];
    for (let i = 0; i < ev.results.length; i++) joined += " " + ev.results[i][0].transcript;
    joined = joined.trim(); lastText = joined || lastText;
    const last = ev.results[ev.results.length - 1]; for (let k = 0; k < last.length; k++) alts.push(last[k].transcript);
    // sentence: once enough is heard, wait until she stops talking before moving on
    if (check([joined].concat(alts))) { matched = joined || alts[0]; clearTimeout(quietS); quietS = setTimeout(() => finish(true, matched), 1300); return; }
    if (matched) { clearTimeout(quietS); quietS = setTimeout(() => finish(true, matched), 1300); }
  };
  rec.onerror = ev => { if (/not-allowed|service-not-allowed/.test(ev.error)) { decided = true; clearTimeout(timer); sp.listening = false; sp.err = "blocked"; render(); } };
  rec.onend = () => { if (!decided) finish(!!matched, matched || lastText); };
  // stop listening on its own: 4s for a word, about 1s per 2 words + 3s for a sentence
  timer = setTimeout(() => { try { rec.stop(); } catch (x) {} setTimeout(() => finish(!!matched, matched || lastText), 1200); }, 4500 + toks(tg.text).length * 650);
  try { rec.start(); } catch (err) { decided = true; sp.listening = false; sp.err = "unsupported"; render(); }
}
function spSkip() { const sp = TR.sp; const tg = sp.targets[sp.idx]; if (!tg) return; record(TR.queue[0], tg.kind === "w" ? "say" : "saysent", false, "(skipped)", 0); sp.idx++; sp.fails = 0; sp.tries = 0; sp.heard = ""; render(); }

/* ---------- reminders (push) ---------- */
window.__toast = msg => toast(msg);
const pushOn = () => !!(ST && ST.push && ST.push.tokens && ST.push.tokens.length && WW.pushPermission() === "granted");
function pushCard() {
  const perm = WW.pushPermission(); const on = pushOn();
  let body;
  if (on) body = `<p>🔔 Reminders are on: around <b>8am</b>, <b>5pm</b> and <b>8pm</b>.</p><button class="ghost" data-act="pushOn" style="align-self:flex-start">Re-connect reminders</button>`;
  else if (perm === "unsupported" || !WW.standalone()) body = `<p class="muted">To get reminders on iPhone, open Vocaboo from its <b>home-screen icon</b> (not Safari), then tap the button here.</p>${perm !== "unsupported" ? `<button class="big primary" data-act="pushOn">Turn on reminders</button>` : ""}`;
  else if (perm === "denied") body = `<p class="muted">Notifications are blocked. On iPhone: <b>Settings → Notifications → Vocaboo → Allow Notifications</b>, then come back and tap below.</p><button class="big" data-act="pushOn">Try again</button>`;
  else body = `<p class="muted">Get a friendly reminder in the morning, at 5pm and at 8pm.</p><button class="big primary" data-act="pushOn">Turn on reminders</button>`;
  return `<div class="card"><h3>Reminders</h3>${body}</div>`;
}
async function turnOnPush(btn) {
  if (btn) { btn.disabled = true; btn.textContent = "Turning on…"; }
  try {
    const token = await WW.enablePush();
    ST.push = { tokens: [...new Set([token].concat((ST.push && ST.push.tokens) || []))].slice(0, 3), on: Date.now(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
    await saveST(); toast("Reminders are on 🔔"); render();
  } catch (e) {
    const c = String(e && e.message || e);
    toast(c === "denied" ? "Notifications were not allowed" : c === "unsupported" ? "Open Vocaboo from the home-screen icon first" : c === "not-configured" ? "Reminders aren't set up yet (ask your teacher)" : "Couldn't turn on reminders: " + c);
    render();
  }
}

/* fill-in-the-blank: clue on a wrong try, explanation after the right answer */
function blankClue(q, e) { return `<div class="notice"><b>Not quite. Try again!${KO() ? " 다시 해 보세요!" : ""}</b></div>`; }
function blankExplain(e) { const re = new RegExp("\\b" + e.w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i"); const s = e.ex.find(x => re.test(x)) || e.ex[0];
  const ko = senseList(e)[0].ko, all = senseList(e).map(x => x.ko).join(" / ");
  return `<div class="fb ${RUN.ok ? "good" : ""} stack" style="gap:8px;${RUN.ok ? "" : "background:var(--sun-soft);color:var(--sun-ink)"}"><span>${RUN.ok ? "✓ Correct on the first try!" + (KO() ? " 한 번에 맞혔어요!" : "") : "✓ You got it!" + (KO() ? " 맞혔어요!" : "")}</span>
    <span style="font-weight:700">“${exHtml(s, e.w)}”</span>
    <span style="font-weight:600">🇺🇸 The answer is <b class="mono">${esc(e.w)}</b>. It means “${esc(e.def)}”, so it fits the sentence.</span>
    ${KO() ? "" : "<!--"}<span style="font-weight:600">🇰🇷 정답은 <b class="mono">${esc(e.w)}</b>예요. ${senseList(e).length > 1 ? `‘${esc(all)}’라는 뜻이 있는데, 이 문장에서는 ‘${esc(ko)}’의 뜻으로 쓰여서 빈칸에 딱 맞아요.` : `‘${esc(ko)}’라는 뜻이라서 빈칸에 딱 맞아요.`}</span>${KO() ? "" : "-->"}</div>`; }

/* ---------- quiz v2: mixed directions, speaking, matching ---------- */
Object.assign(TYPE_NAME, { blank_mc: "Fill in the blank (choose)", blank_ty: "Fill in the blank (type)", hear_ko: "Hear it → choose Korean", ctx_ko: "Word in a sentence → choose Korean", en_ko: "English → type Korean", match: "Match pairs", say_en: "Korean → say English", coach: "Own sentence (AI coach)", level: "Level check" });
const MC_TYPES = new Set(["mc_ko", "mc_def", "hear_ko", "ctx_ko", "blank_mc"]);
const EN_TYPED = new Set(["ko_en", "def_en", "dict", "train", "blank_ty"]);
const senseList = e => (e.senses && e.senses.length ? e.senses : [{ pos: e.pos, ko: e.ko }]);
const oneSense = e => { const s = senseList(e); const x = s[Math.floor(Math.random() * s.length)]; return KO() ? x.ko : x.def; };
function koTerms(e) { const out = new Set();
  senseList(e).forEach(s => s.ko.split(/[;,]/).forEach(t => { const a = t.replace(/\(.*?\)/g, "").replace(/[~∼…·.\s]/g, "").trim(); const b = t.replace(/[()~∼…·.\s]/g, "").trim(); if (a) out.add(a); if (b) out.add(b); }));
  return [...out]; }
function koMatch(ans, e) { const a = String(ans || "").replace(/[\s.,!?~]/g, ""); if (a.length < 1) return false;
  return koTerms(e).some(t => { if (a === t) return true; if (a.length < 2) return false;
    let p = 0; while (p < a.length && p < t.length && a[p] === t[p]) p++;
    return p >= Math.max(2, Math.min(a.length, t.length) - 1); }); }
function hintsToday() { if (!CFG.hints) return false; const d = Math.round((new Date(today() + "T12:00:00") - new Date(weekKey() + "T12:00:00")) / 864e5); return d < 2; }
function koOpts(e, poolIds) { return shuffle([e].concat(distract(e, "ko", 3, poolIds))).map(x => ({ id: x.id, label: x.id === e.id ? oneSense(x) : oneSense(x) })); }
function makeQ2(id, t, poolIds) {
  const e = BY[id]; const q = { id, t };
  if (t === "mc_ko" || t === "hear_ko" || t === "ctx_ko") q.opts = koOpts(e, poolIds);
  if (t === "ctx_ko") { q.opts = shuffle([e].concat(distract(e, "ko", 3, poolIds))).map(x => ({ id: x.id, label: x.id === e.id ? sgloss(senseList(e)[0]) : oneSense(x) })); }
  if (t === "blank_mc") q.opts = shuffle([e].concat(distract(e, "w", 3, poolIds))).map(x => ({ id: x.id, label: x.w }));
  if (t === "mc_def") q.opts = shuffle([e].concat(distract(e, "w", 3, poolIds))).map(x => ({ id: x.id, label: x.w }));
  if (t === "match") { const others = shuffle((poolIds || []).filter(x => x !== id && BY[x])).slice(0, 3);
    q.pairs = [id].concat(others); q.left = shuffle(q.pairs.slice()); q.right = shuffle(q.pairs.slice()).map(x => ({ id: x, label: oneSense(BY[x]) })); q.done = []; q.miss = {}; }
  return q;
}
function buildQuiz2() {
  const n = ST.quizSize || 15; const wk = weekIds();
  const due = Object.keys(WORDS).filter(id => !wk.includes(id) && WORDS[id].due <= today()).sort((a, b) => WORDS[a].box - WORDS[b].box);
  const wkSorted = shuffle(wk).sort((a, b) => (WORDS[a] ? WORDS[a].box : 0) - (WORDS[b] ? WORDS[b].box : 0));
  const nOld = Math.min(due.length, Math.round(n * 0.3));
  let ids = wkSorted.slice(0, n - nOld).concat(due.slice(0, nOld));
  let k = 0; while (ids.length < n && wk.length) ids.push(wkSorted[k++ % wkSorted.length]);
  ids = shuffle(ids);
  const half = Math.ceil(n / 2);
  const enko = KO() ? ["mc_ko", "hear_ko", "ctx_ko", "en_ko", "mc_ko", "hear_ko", "en_ko", "ctx_ko"] : ["mc_ko", "hear_ko", "ctx_ko", "blank", "mc_ko", "hear_ko", "def_or_ko", "ctx_ko"];
  const koen = ["ko_en", "blank", "dict", speakOn() ? "say_en" : "ko_en", "def_or_ko", "blank", "dict", speakOn() ? "say_en" : "def_or_ko"];
  const plan = []; for (let i = 0; i < half; i++) plan.push(enko[i % enko.length]); for (let i = 0; i < n - half; i++) plan.push(koen[i % koen.length]);
  if (n >= 10 && wk.length >= 4) plan[0] = "match";
  const types = shuffle(plan).map((p, i) => p === "def_or_ko" ? (stageOf(ids[i]) === 1 ? "ko_en" : "def_en") : p === "blank" ? (stageOf(ids[i]) === 1 ? "blank_mc" : "blank_ty") : p);
  return ids.map((id, i) => makeQ2(id, types[i], wk.concat(due)));
}

/* quiz speaking (one word) */
function quizListen() {
  const q = RUN.qs[RUN.i]; const e = BY[q.id]; if (RUN.listening) return;
  let rec; try { rec = new SR(); } catch (err) { RUN.micErr = "unsupported"; return render(); }
  rec.lang = "en-US"; rec.interimResults = true; rec.maxAlternatives = 3; rec.continuous = true;
  stopAudio(); RUN.listening = true; RUN.heard = ""; RUN.micErr = ""; render();
  let decided = false, last = "", timer = null;
  const finish = (ok, text) => { if (decided) return; decided = true; clearTimeout(timer); try { rec.abort(); } catch (x) {} RUN.listening = false;
    if (!text) { RUN.heard = "I didn't hear anything. Tap the mic and try again."; return render(); }
    if (!RUN.answered) { RUN.ok = ok; RUN.answered = true; RUN.lastAns = text; if (ok) { RUN.right++; award(10, "say"); bumpStat("say"); } record(q.id, "say_en", ok, text, Date.now() - RUN.t0); if (!ok) speak(e.id, "w"); }
    else if (ok) RUN.fixed = true; else RUN.fixTries = (RUN.fixTries || 0) + 1;
    RUN.heard = (ok ? "✓ I heard: “" : "I heard: “") + text + "”"; RUN.heardOk = ok; render(); };
  rec.onresult = ev => { let j = ""; const alts = []; for (let i = 0; i < ev.results.length; i++) j += " " + ev.results[i][0].transcript; j = j.trim(); last = j || last;
    const L = ev.results[ev.results.length - 1]; for (let k = 0; k < L.length; k++) alts.push(L[k].transcript);
    if (wordHeard([j].concat(alts), e.w)) return finish(true, j || alts[0]); clearTimeout(RUN._q); RUN._q = setTimeout(() => finish(false, last), 1500); };
  rec.onerror = ev => { if (/not-allowed|service-not-allowed/.test(ev.error)) { decided = true; clearTimeout(timer); RUN.listening = false; RUN.micErr = "blocked"; render(); } };
  rec.onend = () => { if (!decided) finish(false, last); };
  timer = setTimeout(() => { try { rec.stop(); } catch (x) {} setTimeout(() => finish(false, last), 1200); }, 4500);
  try { rec.start(); } catch (err) { decided = true; RUN.listening = false; RUN.micErr = "unsupported"; render(); }
}
/* matching */
function matchTap(side, id) {
  const q = RUN.qs[RUN.i]; if (q.done.includes(id)) return;
  if (side === "L") { q.selL = id; return render(); }
  if (!q.selL) { toast("Tap an English word first"); return; }
  if (q.selL === id) { q.done.push(id); q.selL = null; speak(id, "w");
    if (q.done.length === q.pairs.length) { const ms = Date.now() - RUN.t0; q.pairs.forEach(p => record(p, "match", !q.miss[p], q.miss[p] ? "(mismatched)" : "", ms / q.pairs.length));
      const ok = !Object.keys(q.miss).length; RUN.ok = ok; RUN.answered = true; if (ok) { RUN.right++; award(10, "match"); } RUN.fixed = true; }
    return render(); }
  q.miss[q.selL] = true; q.wrongFlash = id; const sl = q.selL; q.selL = null; render(); setTimeout(() => { if (RUN && RUN.qs[RUN.i] === q) { q.wrongFlash = null; render(); } }, 600); void sl;
}
function matchHtml(q) {
  const L = q.left.map(id => `<button class="opt ${q.done.includes(id) ? "right" : ""} ${q.selL === id ? "sel" : ""}" data-act="mL" data-id="${id}" ${q.done.includes(id) ? "disabled" : ""}>${esc(BY[id].w)}</button>`).join("");
  const R = q.right.map(o => `<button class="opt ${q.done.includes(o.id) ? "right" : ""} ${q.wrongFlash === o.id ? "wrong" : ""}" data-act="mR" data-id="${o.id}" ${q.done.includes(o.id) ? "disabled" : ""} style="font-size:16px">${esc(o.label)}</button>`).join("");
  return `<p class="label">Match the pairs</p><p class="muted small">Tap a word, then its ${KO() ? "Korean meaning" : "meaning"}.</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="opts">${L}</div><div class="opts">${R}</div></div>`;
}

/* ---------- sentence coach (AI) ---------- */
let CO = null;
function coachWords() { const wk = weekIds(); const seen = wk.filter(id => WORDS[id]);
  return shuffle(seen.length >= 3 ? seen : wk).sort((a, b) => (WORDS[a] ? WORDS[a].box : 0) - (WORDS[b] ? WORDS[b].box : 0)).slice(0, 3); }
async function startCoach() {
  const ids = coachWords(); if (!ids.length) { toast("No words yet"); return; }
  CO = { ids, i: 0, text: "", res: null, busy: false, listening: false, err: "", done: 0 };
  startAttempt("coach", { n: ids.length }); logDid("sentence coach");
  view = { name: "coach" }; render(); maybeTour("coach"); await loadPacksFor(ids);
}
function coachPrompt(e, sentence) {
  return `You are a warm, encouraging English tutor for a ${(ST.profile && ST.profile.age) || 11}-year-old ${KO() ? "Korean " : ""}student learning English (vocabulary about US ${ST.level ? gradeWord(ST.level.g).toLowerCase() : "grade 2-3"} level).
She was asked to say her OWN English sentence using the target word. Her sentence came from speech recognition, so ignore capitalization and missing punctuation, and do not count obvious speech-recognition slips as her mistakes unless they change the meaning.

Target word: "${e.w}"
Meanings: ${senseList(e).map(s => s.pos + " " + s.ko + " (" + s.def + ")").join(" / ")}
Her sentence: "${sentence}"

Judge: (1) did she use the target word (any form like -s, -ed, -ing is fine) with a correct meaning, (2) is the grammar correct and natural.
Reply with ONLY a JSON object, no markdown:
{"correct": true or false (true only if the word is used correctly AND the sentence has no real grammar mistakes),
 "usedWord": true or false,
 "fixed": "her sentence with the smallest corrections needed (same as hers if already correct), with normal capitalization and punctuation",
 "another": "one different, natural, simple way to say a similar idea using the target word (max 12 words)",
 "praise": "one short, warm, SPECIFIC sentence of encouragement about something good in her sentence (her idea, a good word choice, the length...). Vary the wording; never just 'Great sentence'. Encourage her even if it has mistakes",
 "level_up": "a more advanced version of HER corrected sentence that keeps her idea and the target word but adds one thing: a describing word, a reason (because/so), a time or place phrase, or a stronger verb. Natural, max 16 words",
 "level_up_tip": "one very short, simple English tip saying what made the level-up sentence better (max 12 words)",
${KO() ? ` "why_ko": "1-2 short sentences in friendly Korean (반말 X, 친절한 존댓말) explaining what was wrong and why, or praising what was good if correct",` : ` "why_ko": "1-2 short sentences in very simple English explaining what was wrong and why, or praising what was good if correct",`}
 "tip_en": "one very short, simple English tip (max 10 words)"}`;
}
async function coachCheck() {
  const e = BY[CO.ids[CO.i]]; const s = (document.getElementById("coachText") || {}).value || CO.text; CO.text = s.trim();
  if (CO.text.split(/\s+/).length < 3) { toast("Say a whole sentence (at least 3 words)"); return; }
  if (!window.WW || !WW.ask) { CO.res = { offline: true }; return render(); }
  CO.busy = true; CO.res = null; render();
  try { const raw = await WW.ask(coachPrompt(e, CO.text)); const m = raw.match(/\{[\s\S]*\}/); CO.res = JSON.parse(m ? m[0] : raw); }
  catch (err) { console.warn(err); CO.res = { error: String(err && (err.code || err.message) || err) }; }
  CO.busy = false;
  if (CO.res && !CO.res.error && !CO.res.offline) {
    const ok = !!CO.res.correct; CO.done++; ST.coachProg = { day: today(), n: (ST.coachProg && ST.coachProg.day === today() ? ST.coachProg.n : 0) + 1 }; saveST(); bumpStat("sentences"); award(ok ? 15 : 8, "sentence");
    ATT.items.push({ id: e.id, t: "coach", ok, ans: CO.text.slice(0, 200), fixed: String(CO.res.fixed || "").slice(0, 200), another: String(CO.res.another || "").slice(0, 200), why: String(CO.res.why_ko || "").slice(0, 300), ms: 0 });
    CO.sayTarget = String((ok ? (CO.res.level_up || CO.res.another || CO.res.fixed) : (CO.res.fixed || CO.res.level_up)) || CO.text);
    CO.sayOk = false; CO.sayTries = 0; CO.sayHeard = "";
    CO.head = ok ? pickOne(["Great sentence! 🌟", "Wow, nicely done! 🎉", "You nailed it! 💪", "Super job! ⭐", "That's a perfect sentence! 🙌", "Awesome work! 🚀", "Brilliant! ✨", "Way to go! 🥳"]) : r_almost(CO.res);
    saveAttempt(); if (!ok && CO.res.fixed) say(CO.res.fixed, 0.9);
  } else if (CO.res && (CO.res.error || CO.res.offline)) {
    ATT.items.push({ id: e.id, t: "coach", ok: false, ans: CO.text.slice(0, 200), fixed: "", another: "", why: "(AI not available)", ms: 0, noai: true }); saveAttempt();
  }
  render();
}
const pickOne = a => a[Math.floor(Math.random() * a.length)];
function r_almost(r) { if (r.usedWord === false) return pickOne(["Nice try! Now let's use the word in it. 💡", "Good idea! Let's add the word. ✏️"]);
  return pickOne(["Good try! Let's fix one small thing. 💪", "So close! 🌱", "Nice effort! You're almost there.", "Great idea! Let's polish it. ✨", "You're getting there! 👍", "Good thinking! One quick fix. 🔧"]); }
function coachRedo() { try { CO.rec && CO.rec.abort(); } catch (x) {} CO.listening = false; CO.text = ""; const b = document.getElementById("coachText"); if (b) b.value = ""; render(); setTimeout(coachListen, 150); }
function coachSay() { // read the corrected / level-up sentence out loud to move on
  if (CO.sayListening) return; let rec; try { rec = new SR(); } catch (err) { CO.err = "unsupported"; CO.sayTries = 3; return render(); }
  rec.lang = "en-US"; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 3; stopAudio();
  CO.sayListening = true; CO.sayHeard = ""; render();
  let decided = false, last = "", matched = "", q = null, timer = null; const target = CO.sayTarget;
  const finish = () => { if (decided) return; decided = true; clearTimeout(q); clearTimeout(timer); try { rec.abort(); } catch (x) {} CO.sayListening = false;
    const text = matched || last; const ok = !!matched; CO.sayTries++;
    ATT.items.push({ id: CO.ids[CO.i], t: "saysent", ok, ans: String(text || "").slice(0, 120), ms: 0 }); saveAttempt();
    if (ok) { CO.sayOk = true; award(5, "say"); bumpStat("say"); CO.sayHeard = "✓ " + pickOne(["Perfect reading!", "Sounds great!", "Beautiful!", "Well said!"]); }
    else CO.sayHeard = text ? "I heard: “" + text + "”. Listen and try again." : "I didn't hear anything. Tap and read a little louder.";
    render(); };
  rec.onresult = ev => { let j = ""; for (let i = 0; i < ev.results.length; i++) j += " " + ev.results[i][0].transcript; j = j.trim(); last = j || last;
    const L = ev.results[ev.results.length - 1]; const alts = [j]; for (let k = 0; k < L.length; k++) alts.push(L[k].transcript);
    if (sentHeard(alts, target)) matched = j || alts[0];
    clearTimeout(q); q = setTimeout(finish, matched ? 1300 : 2200); };
  rec.onerror = ev => { if (/not-allowed|service-not-allowed/.test(ev.error)) { CO.err = "blocked"; } };
  rec.onend = () => finish();
  timer = setTimeout(() => { try { rec.stop(); } catch (x) {} setTimeout(finish, 1200); }, 5000 + toks(target).length * 700);
  try { rec.start(); } catch (err) { decided = true; CO.sayListening = false; CO.sayTries = 3; render(); }
}
function coachListen() {
  if (CO.listening) return; let rec; try { rec = new SR(); } catch (err) { CO.err = "unsupported"; return render(); }
  rec.lang = "en-US"; rec.interimResults = true; rec.continuous = true; stopAudio(); CO.rec = rec;
  CO.listening = true; CO.err = ""; CO.text = ""; render();
  let quiet = null; const box = () => document.getElementById("coachText");
  const end = () => { clearTimeout(quiet); try { rec.stop(); } catch (x) {} };
  rec.onresult = ev => { let j = ""; for (let i = 0; i < ev.results.length; i++) j += " " + ev.results[i][0].transcript; CO.text = j.trim(); const b = box(); if (b) b.value = CO.text;
    clearTimeout(quiet); quiet = setTimeout(end, 2200); };
  rec.onerror = ev => { if (/not-allowed|service-not-allowed/.test(ev.error)) CO.err = "blocked"; };
  rec.onend = () => { CO.listening = false; clearTimeout(quiet); render(); };
  quiet = setTimeout(end, 9000);
  try { rec.start(); } catch (err) { CO.listening = false; CO.err = "unsupported"; render(); }
}
function renderCoach() {
  const e = BY[CO.ids[CO.i]]; const r = CO.res;
  let body;
  if (CO.busy) body = `<div class="stack" style="align-items:center;text-align:center;padding:20px 0">${buddy("happy", 80)}<p class="muted" style="font-weight:800">Checking your sentence…</p></div>`;
  else if (r && !r.error && !r.offline) body = `
    <div class="fb ${r.correct ? "good" : ""} stack" style="gap:4px;${r.correct ? "" : "background:var(--sun-soft);color:var(--sun-ink)"}"><b>${esc(CO.head || (r.correct ? "Great sentence! 🌟" : "Good try! 💪"))}</b>${r.praise ? `<span style="font-weight:600">${esc(r.praise)}</span>` : ""}</div>
    <div class="stack" style="gap:6px"><p class="label">You said</p><p style="font-size:18px">${esc(CO.text)}</p></div>
    ${r.correct ? "" : `<div class="stack" style="gap:6px"><p class="label">Correct way</p><div class="ex"><button class="round" data-act="say" data-text="${esc(r.fixed)}" aria-label="Listen">${ICON_SPK}</button><p style="font-size:19px;font-weight:800">${esc(r.fixed)}</p></div></div>`}
    ${r.why_ko ? `<div class="notice info">${esc(r.why_ko)}</div>` : ""}
    ${r.level_up ? `<div class="stack" style="gap:6px"><p class="label">🚀 Level it up</p><div class="ex"><button class="round" data-act="say" data-text="${esc(r.level_up)}" aria-label="Listen">${ICON_SPK}</button><p style="font-size:19px;font-weight:800">${exHtml(r.level_up, e.w)}</p></div>${r.level_up_tip ? `<p class="muted small">💡 ${esc(r.level_up_tip)}</p>` : ""}</div>` : ""}
    ${r.another && !r.level_up ? `<div class="stack" style="gap:6px"><p class="label">Another way to say it</p><div class="ex"><button class="round" data-act="say" data-text="${esc(r.another)}" aria-label="Listen">${ICON_SPK}</button><p style="font-size:18px">${exHtml(r.another, e.w)}</p></div></div>` : ""}
    ${r.tip_en ? `<p class="muted small">Tip: ${esc(r.tip_en)}</p>` : ""}
    <div class="say-box stack" style="gap:8px;background:var(--violet-soft);border-radius:18px;padding:14px">
      <p class="label">🎤 Now read this out loud to move on</p>
      <div class="ex"><button class="round" data-act="say" data-text="${esc(CO.sayTarget || "")}" aria-label="Listen">${ICON_SPK}</button><p style="font-size:19px;font-weight:800">${esc(CO.sayTarget || "")}</p></div>
      ${CO.sayOk ? "" : `<button class="mic ${CO.sayListening ? "on" : ""}" data-act="coachSay" ${CO.sayListening ? "disabled" : ""} aria-label="Tap, then read">${ICON_MIC}</button><p class="muted" style="text-align:center;font-weight:800">${CO.sayListening ? "Listening… read the whole sentence" : "Tap the mic, then read it"}</p>`}
      ${CO.sayHeard ? `<div class="fb ${CO.sayOk ? "good" : "bad"}">${esc(CO.sayHeard)}</div>` : ""}
      ${!CO.sayOk && CO.sayTries >= 3 ? `<button class="big" data-act="coachSaySkip">The app can't hear it right · skip (your teacher will see this)</button>` : ""}</div>
    <div class="row"><button class="big" data-act="coachRetry" style="flex:1">Make a new sentence</button>${CO.sayOk ? `<button class="big primary" data-act="coachNext" style="flex:1" id="nextBtn">${CO.i + 1 < CO.ids.length ? "Next word" : "Finish"}</button>` : ""}</div>`;
  else body = `
    ${r && (r.error || r.offline) ? `<div class="notice">The sentence coach isn't working right now${r.error ? " (" + esc(r.error) + ")" : ""}. Your sentence was saved for your teacher.</div>` : ""}
    <p class="muted">Say your own sentence using <b>${esc(e.w)}</b>. Make it about your life!</p>
    <button class="mic ${CO.listening ? "on" : ""}" data-act="coachMic" ${CO.listening ? "disabled" : ""} aria-label="Tap, then speak">${ICON_MIC}</button>
    <p class="muted" style="text-align:center;font-weight:800">${CO.listening ? "Listening… stop talking when you're done" : "Tap the mic, then say your sentence"}</p>
    ${CO.listening || CO.text ? `<button class="big icon-l" data-act="coachRedo" style="align-self:center">🔄 Redo · start over</button>` : ""}
    ${CO.err === "blocked" ? `<div class="notice">The microphone is turned off. On iPhone: Settings → Apps → Safari → Microphone → Allow. You can also type below.</div>` : ""}
    <div class="field"><label for="coachText">Your sentence (fix it if the app heard you wrong)</label><textarea id="coachText" rows="3" style="font:inherit;font-size:19px;padding:12px 14px;border-radius:18px;border:2px solid var(--line);width:100%;resize:vertical">${esc(CO.text)}</textarea></div>
    <button class="big primary" data-act="coachCheck" ${CO.listening ? "disabled" : ""}>Check my sentence</button>
    ${r && (r.error || r.offline) ? `<button class="ghost" data-act="coachNext" style="align-self:center">Skip to the next word</button>` : ""}`;
  $app.innerHTML = topbar(CO.i, CO.ids.length, `${CO.i + 1}/${CO.ids.length}`) + `<span class="eyebrow">Sentence coach</span>
    <div class="card"><div class="row between" style="flex-wrap:nowrap"><div style="min-width:0"><div class="word" style="font-size:40px">${esc(e.w)}</div><p class="muted">${esc(senseList(e).map(sgloss).join(" / "))}</p></div>${spk(e.id, "w")}</div>
    <div class="ex">${spk(e.id, "e0")}<p class="muted">${exHtml(e.ex[0], e.w)}</p></div></div>
    <div class="card">${body}</div>`;
}
function coachNext() { CO.i++; CO.text = ""; CO.res = null; CO.err = ""; CO.sayOk = false; CO.sayTries = 0; CO.sayHeard = ""; CO.sayTarget = "";
  if (CO.i >= CO.ids.length) { ATT.end = Date.now(); const it = ATT.items.filter(i => i.t === "coach" && !i.noai); ATT.score = it.length ? it.filter(i => i.ok).length / it.length : 0; saveAttempt();
    ST.coachDay = today(); bumpStat("coach"); award(10, "coach done"); saveST(); logDid("coach done"); setTimeout(checkBadges, 600); PROG = null; view = { name: "trainDone", reason: "coach", n: CO.ids.length }; CO = null; return render(); }
  render(); speak(CO.ids[CO.i], "w"); }

/* ---------- XP, levels, badges ---------- */
const lvlStart = n => 50 * (n - 1) * n;           // XP needed to reach level n (1:0, 2:100, 3:300, 4:600 …)
function levelOf(xp) { let n = 1; while (xp >= lvlStart(n + 1)) n++; return n; }
function levelInfo() { const xp = ST.xp || 0, n = levelOf(xp), a = lvlStart(n), b = lvlStart(n + 1); return { xp, n, into: xp - a, need: b - a, pct: Math.round((xp - a) / (b - a) * 100) }; }
let xpQueue = 0, xpTimer = null, xpDirty = false;
function award(n, why) {
  if (!ST || !n || (ATT && ATT.kind === "placement")) return;
  const before = levelOf(ST.xp || 0);
  ST.xp = (ST.xp || 0) + n; const d = today(); ST.xpDays = ST.xpDays || {}; ST.xpDays[d] = (ST.xpDays[d] || 0) + n;
  const keys = Object.keys(ST.xpDays).sort(); if (keys.length > 60) keys.slice(0, keys.length - 60).forEach(k => delete ST.xpDays[k]);
  xpQueue += n; clearTimeout(xpTimer); xpTimer = setTimeout(() => { flyXP(xpQueue); xpQueue = 0; }, 250);
  xpDirty = true;
  const after = levelOf(ST.xp); if (after > before) celebrate({ kind: "level", title: "Level " + after + "!", sub: "You reached a new level. Keep going!" });
}
function flushXP() { if (xpDirty) { xpDirty = false; saveST(); } }
setInterval(flushXP, 8000);
function flyXP(n) { const el = document.createElement("div"); el.className = "xpfly"; el.textContent = "+" + n + " XP"; document.body.appendChild(el); setTimeout(() => el.remove(), 1300); }
function bumpStat(k, n) { ST.stats = ST.stats || {}; ST.stats[k] = (ST.stats[k] || 0) + (n || 1); }

const BADGES = [
  { id: "first_quiz", icon: "🎯", name: "First quiz", desc: "Finish your first daily quiz", test: s => (s.quizzes || 0) >= 1 },
  { id: "perfect", icon: "💯", name: "Perfect!", desc: "Get 100% on a daily quiz", test: s => (s.perfect || 0) >= 1 },
  { id: "perfect5", icon: "🏆", name: "Perfect ×5", desc: "Get 100% five times", test: s => (s.perfect || 0) >= 5 },
  { id: "streak3", icon: "🔥", name: "3-day streak", desc: "Quiz 3 days in a row", test: (s, st) => (st.streak && st.streak.best || 0) >= 3 },
  { id: "streak7", icon: "🔥", name: "1 week streak", desc: "Quiz 7 days in a row", test: (s, st) => (st.streak && st.streak.best || 0) >= 7 },
  { id: "streak14", icon: "⚡", name: "2 week streak", desc: "Quiz 14 days in a row", test: (s, st) => (st.streak && st.streak.best || 0) >= 14 },
  { id: "streak30", icon: "👑", name: "30-day streak", desc: "Quiz 30 days in a row", test: (s, st) => (st.streak && st.streak.best || 0) >= 30 },
  { id: "words25", icon: "🌱", name: "25 words", desc: "Master 25 words", test: () => masteredCount() >= 25 },
  { id: "words50", icon: "🌿", name: "50 words", desc: "Master 50 words", test: () => masteredCount() >= 50 },
  { id: "words100", icon: "🌳", name: "100 words", desc: "Master 100 words", test: () => masteredCount() >= 100 },
  { id: "words250", icon: "🌲", name: "250 words", desc: "Master 250 words", test: () => masteredCount() >= 250 },
  { id: "speaker", icon: "🎤", name: "Speaker", desc: "Say 50 words correctly", test: s => (s.say || 0) >= 50 },
  { id: "speaker2", icon: "📣", name: "Super speaker", desc: "Say 300 words correctly", test: s => (s.say || 0) >= 300 },
  { id: "coach1", icon: "💬", name: "My own sentence", desc: "Finish the sentence coach once", test: s => (s.coach || 0) >= 1 },
  { id: "coach10", icon: "✍️", name: "Sentence maker", desc: "Make 30 of your own sentences", test: s => (s.sentences || 0) >= 30 },
  { id: "story1", icon: "📖", name: "Story reader", desc: "Finish your first weekly story", test: s => (s.stories || 0) >= 1 },
  { id: "story5", icon: "📚", name: "Bookworm", desc: "Finish 5 weekly stories", test: s => (s.stories || 0) >= 5 },
  { id: "comeback", icon: "💪", name: "Comeback", desc: "Train your missed words and unlock the quiz", test: s => (s.unlocks || 0) >= 1 },
  { id: "early", icon: "🌅", name: "Early bird", desc: "Study before 8 in the morning", test: s => (s.early || 0) >= 1 },
  { id: "level5", icon: "⭐", name: "Level 5", desc: "Reach level 5", test: (s, st) => levelOf(st.xp || 0) >= 5 },
  { id: "level10", icon: "🌟", name: "Level 10", desc: "Reach level 10", test: (s, st) => levelOf(st.xp || 0) >= 10 }
];
const masteredCount = () => Object.keys(WORDS).filter(isMastered).length;
function checkBadges() {
  ST.badges = ST.badges || {}; const got = [];
  BADGES.forEach(b => { if (!ST.badges[b.id] && b.test(ST.stats || {}, ST)) { ST.badges[b.id] = today(); got.push(b); } });
  got.forEach(b => celebrate({ kind: "badge", icon: b.icon, title: "New badge: " + b.name, sub: b.desc }));
  if (got.length) { award(25 * got.length, "badge"); saveST(); }
}
function badgeGrid(st) { const have = (st || ST).badges || {};
  return `<div class="badges">${BADGES.map(b => `<div class="badge ${have[b.id] ? "on" : ""}"><span class="bi">${have[b.id] ? b.icon : "🔒"}</span><b>${esc(b.name)}</b><span>${esc(b.desc)}</span></div>`).join("")}</div>`; }

/* celebration popups (queued) */
const CEL = [];
function celebrate(c) { CEL.push(c); if (CEL.length === 1) showCel(); }
function showCel() { const c = CEL[0]; if (!c) return;
  const el = document.createElement("div"); el.className = "cel"; el.setAttribute("role", "dialog");
  el.innerHTML = `<div class="cel-card">${c.kind === "badge" ? `<div class="cel-icon">${c.icon}</div>` : `<div class="cel-icon lv">${buddy("wow", 96)}</div>`}<h2>${esc(c.title)}</h2><p class="muted">${esc(c.sub || "")}</p><button class="big primary" data-act="celOk">Yay!</button></div>`;
  document.body.appendChild(el); confetti(el); }
function celOk() { const el = document.querySelector(".cel"); if (el) el.remove(); CEL.shift(); if (CEL.length) setTimeout(showCel, 200); }
function confetti(host) { if (matchMedia("(prefers-reduced-motion: reduce)").matches) return; const cols = ["#FFC93C", "#FF6B5B", "#7B61FF", "#1FA98F", "#3F82F2"];
  for (let i = 0; i < 40; i++) { const s = document.createElement("i"); s.className = "cf"; s.style.left = Math.random() * 100 + "%"; s.style.background = cols[i % cols.length]; s.style.animationDelay = (Math.random() * 0.4) + "s"; s.style.transform = `rotate(${Math.random() * 360}deg)`; host.appendChild(s); } }
function levelBar() { const L = levelInfo();
  return `<div class="lvl"><span class="lv-badge">Lv ${L.n}</span><div class="lv-bar"><i style="width:${L.pct}%"></i></div><span class="lv-num">${L.into}/${L.need} XP</span></div>`; }

/* ---------- fill in the blank ---------- */
function blankSentence(e) { const re = new RegExp("\\b" + e.w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i"); const s = e.ex.find(x => re.test(x)) || e.ex[0];
  return esc(s).replace(new RegExp("\\b" + esc(e.w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i"), `<span class="blank">${"_".repeat(Math.max(4, e.w.length))}</span>`); }

/* ---------- weekly story (read a part → answer → next part) ---------- */
let STORY = null;
const storyPath = () => sPath() + "/stories/" + weekKey();
function storyPrompt(ids) {
  const list = ids.map(id => `${BY[id].w} (${senseList(BY[id]).map(s => KO() ? s.ko : s.def).join(" / ")})`).join("; ");
  const age = (ST.profile && ST.profile.age) || 11; const lv = ST.level ? Math.max(1, Math.round(ST.level.g)) : 2;
  return `Write a short, fun story for a ${age}-year-old ${KO() ? "Korean " : ""}student learning English (about US grade ${Math.max(1, lv - 1)}-${lv} reading level), split into 4 parts.
Use EVERY one of these target words at least once across the story (normal forms like -s, -ed, -ing are fine): ${list}
Rules: each part is 45-65 words, simple sentences, friendly and kid-appropriate, one clear plot that continues from part to part, a kid main character (can be Korean). No violence or scary content.
After each part, write 2 multiple-choice questions in simple English about THAT part only: 1 about what happened, 1 about what a target word used in that part means there. Each has 4 short options and exactly one correct answer.
Reply with ONLY JSON, no markdown:
${KO() ? `{"title": "...", "parts": [{"en": "...", "ko": "natural Korean translation of the part", "questions": [{"q": "...", "options": ["...","...","...","..."], "answer": 0, "why_ko": "short Korean explanation of the answer"}]}]}` : `{"title": "...", "parts": [{"en": "...", "questions": [{"q": "...", "options": ["...","...","...","..."], "answer": 0, "why_en": "short simple English explanation of the answer"}]}]}`}`;
}
function normStory(d) { // older saved stories had one block of paragraphs + questions
  if (d && d.parts) return d;
  if (d && d.paragraphs) return { title: d.title, words: d.words, parts: [{ en: d.paragraphs.map(p => p.en).join(" "), ko: d.paragraphs.map(p => p.ko).join(" "), questions: d.questions || [] }] };
  return null;
}
async function openStory() {
  const wk = ST.week; if (!wk) { toast("No words yet"); return; }
  view = { name: "story" }; STORY = { loading: true, part: 0, step: "read", qi: 0, picked: null, right: 0, total: 0, answered: {}, showKo: {} }; render();
  try {
    const snap = await db.doc(storyPath()).get();
    let data = snap.exists ? snap.data() : null;
    const prep = preparedStory(wk.newIds);
    if (prep && (!data || data.prepKey !== prep.key)) { data = { prepKey: prep.key, title: prep.title, parts: prep.parts, words: wk.newIds, created: Date.now() }; await setDoc(storyPath(), data); }
    if (data && data.prepKey != null) { const pp = (window.__STORIES__ || []).find(s => s.key === data.prepKey); if (pp) { data = Object.assign({}, data, { parts: pp.parts }); await loadStoryAudio(pp.key); } }
    if (!data || !data.parts) {
      if (!WW.ask) throw new Error("AI not available");
      const raw = await WW.ask(storyPrompt(wk.newIds)); const m = raw.match(/\{[\s\S]*\}/); data = JSON.parse(m ? m[0] : raw);
      if (!data.parts || !data.parts.length) throw new Error("bad story");
      data.created = Date.now(); data.words = wk.newIds; await setDoc(storyPath(), data);
    }
    data = normStory(data);
    STORY = Object.assign(STORY, { loading: false, data, total: data.parts.reduce((s, p) => s + (p.questions || []).length, 0) });
  } catch (err) { console.warn(err); STORY = Object.assign(STORY, { loading: false, error: String(err && (err.code || err.message) || err) }); }
  if (view.name === "story") { render(); if (STORY && STORY.data) maybeTour("story"); }
}
function preparedStory(ids) { const set = ids.slice().sort().join("|");
  return (window.__STORIES__ || []).find(s => s.ids.slice().sort().join("|") === set) || null; }
const STORY_AUDIO = {};
function loadStoryAudio(key) { if (STORY_AUDIO[key]) return Promise.resolve(); return fetch("audio/story_" + key + ".json").then(r => r.ok ? r.json() : {}).catch(() => ({})).then(j => { STORY_AUDIO[key] = j; }); }
function storyClip(pi, si) { const d = STORY && STORY.data; if (!d || d.prepKey == null) return null; const a = STORY_AUDIO[d.prepKey] || {}; const b = a[d.prepKey + "_" + pi + "_" + si]; return b ? "data:audio/mpeg;base64," + b : null; }
let paraToken = 0;
function playClips(list, done) { // list of {src,text}
  const my = ++paraToken; let i = 0;
  const nextOne = () => { if (my !== paraToken) return; if (i >= list.length) { done && done(); return; } const it = list[i++];
    if (it.src) { player.onended = () => setTimeout(nextOne, 30); player.src = it.src; player.playbackRate = it.rate || 1; const p = player.play(); if (p) p.catch(() => { say(it.text, 0.9); setTimeout(nextOne, 1500); }); }
    else { if ("speechSynthesis" in window) { const u = new SpeechSynthesisUtterance(it.text); u.lang = "en-US"; if (VOICE) u.voice = VOICE; u.rate = 0.88; u.onend = () => setTimeout(nextOne, 60); speechSynthesis.speak(u); } else nextOne(); } };
  nextOne();
}
function storySents(p) { return p.sents || String(p.en).split(/(?<=[.!?])\s+(?=[A-Z"“])/).map(s => s.trim()).filter(Boolean); }
function storyHtmlPara(text, ids) {
  let h = esc(text);
  ids.forEach(id => { const w = BY[id].w; const re = new RegExp("\\b(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:s|es|ed|d|ing)?)\\b", "gi");
    h = h.replace(re, `<button class="sword" data-act="sword" data-id="${id}">$1</button>`); });
  return h;
}
function renderStory() {
  const S = STORY;
  const top = `<div class="topbar"><button class="x" data-act="quit" aria-label="Close">${I.x}</button><span class="count" style="flex:1">Weekly story</span><span style="width:44px;flex:none"></span></div>`;
  if (S.loading) { $app.innerHTML = top + `<div class="card" style="align-items:center;text-align:center">${buddy("happy", 96)}<h2>Writing this week's story…</h2><p class="muted">It uses all your new words. This takes a few seconds.</p></div>`; return; }
  if (S.error) { $app.innerHTML = top + `<div class="card">${buddy("sad", 80)}<h2>The story couldn't load</h2><p class="muted">${esc(S.error)}</p><button class="big primary" data-act="story">Try again</button></div>`; return; }
  if (S.read) return renderReadAloud();
  if (S.dict) return renderDictation();
  const d = S.data; const ids = d.words || weekIds(); const P = d.parts[S.part]; const nParts = d.parts.length;
  const steps = `<div class="row" style="gap:6px">${d.parts.map((_, k) => `<span class="pill ${k < S.part || (k === S.part && S.step === "after") ? "good" : k === S.part ? "sun" : ""}">Part ${k + 1}</span>`).join("")}</div>`;
  if (S.step === "done") {
    const pct = S.total ? Math.round(S.right / S.total * 100) : 100;
    $app.innerHTML = `<div style="height:14px"></div><div class="result-hero">${buddy("wow", 100)}${ring(pct, "#FFC93C", 140, `<text x="50%" y="56%" text-anchor="middle" font-size="30" font-weight="900" fill="#fff" font-family="Nunito, sans-serif">${S.right}/${S.total}</text>`)}<h1>Story done!</h1><p style="opacity:.9">You can read it again any time this week.</p></div>
      <button class="big primary" data-act="home">Back home</button>`; return;
  }
  if (S.step === "q") {
    const q = P.questions[S.qi]; const ans = S.picked != null;
    $app.innerHTML = `<div class="topbar"><button class="x" data-act="storyBack" aria-label="Back to the story">${I.back}</button><div class="bar"><i style="width:${Math.round(S.part / nParts * 100)}%"></i></div><span class="count">Part ${S.part + 1}/${nParts}</span></div>
      <span class="eyebrow">Question ${S.qi + 1} of ${P.questions.length}</span><div class="card"><p class="q-prompt">${esc(q.q)}</p>
      <div class="opts">${q.options.map((o, k) => `<button class="opt ${ans ? (k === q.answer ? "right" : k === S.picked ? "wrong" : "") : ""}" data-act="storyPick" data-k="${k}" ${ans ? "disabled" : ""}>${esc(o)}</button>`).join("")}</div>
      ${ans ? `${(KO() ? q.why_ko : q.why_en) ? `<div class="notice info">${esc(KO() ? q.why_ko : q.why_en)}</div>` : ""}<button class="big primary" data-act="storyNextQ" id="nextBtn">Next</button>` : ""}</div>`;
    return;
  }
  const after = S.step === "after";
  $app.innerHTML = top + `<div class="story-hero"><span class="eyebrow" style="color:rgba(255,255,255,.8)">This week's story</span><h1>${esc(d.title)}</h1>${steps}</div>
    <div class="card story-p"><div class="row between" style="flex-wrap:nowrap;align-items:flex-start"><p class="story-text">${storyHtmlPara(P.en, ids)}</p><button class="round" data-act="readPara" data-i="${S.part}" aria-label="Listen">${ICON_SPK}</button></div>
      ${after && (!KO() || !P.ko) ? "" : after ? (S.showKo[S.part] ? `<p class="muted story-ko">${esc(P.ko)}</p><button class="ghost" data-act="toggleKo" data-i="${S.part}" style="align-self:flex-start">Hide Korean</button>` : `<button class="ghost" data-act="toggleKo" data-i="${S.part}" style="align-self:flex-start">Show Korean</button>`) : `<p class="muted small">Tap a highlighted word to hear it and see what it means in English.</p>`}</div>
    ${after ? `<button class="big primary" data-act="storyNextPart">${S.part + 1 < nParts ? "Next part →" : "Finish the story"}</button>`
      : `<button class="big primary" data-act="storyQs">I read it · answer ${P.questions.length} question${P.questions.length === 1 ? "" : "s"}</button>`}`;
  if (S.dictAsk) { const el = document.createElement("div"); el.className = "cel"; el.innerHTML = `<div class="cel-card"><div class="cel-icon">🎤</div><h2>Bonus: read it out loud!</h2><p class="muted">Read Part ${S.part + 1} out loud from beginning to end. The app follows along and checks your reading. Earn up to +15 XP.</p>${KO() ? `<p class="muted small">이 부분을 처음부터 끝까지 소리 내어 읽어 보세요!</p>` : ""}<button class="big primary" data-act="readYes">Yes, let's read!</button><button class="big" data-act="dictNo">Skip</button></div>`; $app.appendChild(el); }
}
function storyPick(k) { const S = STORY; const q = S.data.parts[S.part].questions[S.qi]; S.picked = k; const ok = k === q.answer; if (ok) { S.right++; award(5, "story q"); } S.answers = (S.answers || []).concat([{ p: S.part, q: S.qi, k, ok }]); render(); }
function storyNextQ() { const S = STORY; S.qi++; S.picked = null;
  if (S.qi >= S.data.parts[S.part].questions.length) { S.step = "after"; S.qi = 0; window.scrollTo(0, 0); }
  render(); }
function storyNextPart() { const S = STORY; stopAudio(); paraToken++; if (!S.dictDone) S.dictDone = {};
  if (!S.dictDone[S.part] && speakOn()) { S.dictDone[S.part] = true; return storyAskDict(); }
  return storyAdvance(); }
function storyAdvance() { const S = STORY; stopAudio(); paraToken++;
  ST.storyProg = { week: weekKey(), n: Math.max(S.part + 1, (ST.storyProg && ST.storyProg.week === weekKey() ? ST.storyProg.n : 0)), of: S.data.parts.length }; saveST();
  if (S.part + 1 < S.data.parts.length) { S.part++; S.step = "read"; window.scrollTo(0, 0); return render(); }
  S.step = "done";
  startAttempt("story", { n: S.total, title: S.data.title }); ATT.end = Date.now(); ATT.score = S.total ? S.right / S.total : 1; ATT.answers = S.answers; ATT.dictation = S.dictLog || []; ATT.reading = S.readLog || []; saveAttempt();
  if (!(ST.storyWeeks || []).includes(weekKey())) { ST.storyWeeks = (ST.storyWeeks || []).concat([weekKey()]).slice(-30); bumpStat("stories"); award(30, "story"); }
  logDid("story " + S.right + "/" + S.total); checkBadges(); saveST(); PROG = null; render(); }
function readPara(i) { const p = STORY.data.parts[i]; if (!p) return; stopAudio(); paraToken++;
  const all = storyClip(i, "all"); if (all) return playClips([{ src: all, text: p.en }]);
  playClips(storySents(p).map((s, si) => ({ src: storyClip(i, si), text: s }))); }

/* ---------- story dictation (optional bonus) ---------- */
function dictSentences(pi) { const p = STORY.data.parts[pi]; if (p.dictation && p.dictation.length) return p.dictation.slice(0, 2);
  return storySents(p).filter(s => { const n = s.split(/\s+/).length; return n >= 5 && n <= 11; }).sort((a, b) => a.length - b.length).slice(0, 2); }
function dictClip(pi, text) { const p = STORY.data.parts[pi]; const si = storySents(p).indexOf(text);
  if (si >= 0) return storyClip(pi, si);
  const d = STORY.data, a = STORY_AUDIO[d.prepKey] || {}; const di = (p.dictation || []).indexOf(text); const b = a[d.prepKey + "_" + pi + "_d" + di]; return b ? "data:audio/mpeg;base64," + b : null; }
function playDict(rate) { const S = STORY; const t = S.dict.list[S.dict.i]; stopAudio(); paraToken++; playClips([{ src: dictClip(S.part, t), text: t, rate: rate || 1 }]); }
const wtoks = s => String(s).toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
function dictScore(ans, target) { const A = wtoks(ans), B = wtoks(target); const n = lcsLen(A, B); return { pct: B.length ? Math.round(n / B.length * 100) : 0, A, B }; }
function dictDiff(ans, target) { const A = wtoks(ans), B = wtoks(target); const m = A.length, n = B.length, L = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ok = new Array(n).fill(false); let i = 0, j = 0; while (i < m && j < n) { if (A[i] === B[j]) { ok[j] = true; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
  const orig = String(target).split(/\s+/).filter(x => wtoks(x).length); // show the sentence as written
  return B.map((w, k) => { const shown = orig.length === B.length ? orig[k] : w; return ok[k] ? `<span>${esc(shown)}</span>` : `<span class="dmiss">${esc(shown)}</span>`; }).join(" "); }
function renderDictation() {
  const S = STORY, D = S.dict, t = D.list[D.i], r = D.res;
  $app.innerHTML = `<div class="topbar"><button class="x" data-act="dictSkip" aria-label="Skip dictation">${I.x}</button><div class="bar"><i style="width:${Math.round(D.i / D.list.length * 100)}%"></i></div><span class="count">${D.i + 1}/${D.list.length}</span></div>
    <span class="eyebrow">Bonus dictation · Part ${S.part + 1}</span>
    <div class="card"><p class="label">Listen and type the sentence</p>
      <div class="row" style="flex-wrap:nowrap"><button class="big primary icon-l" data-act="dictPlay" style="flex:1">${ICON_SPK} Play</button><button class="icon-l" data-act="dictSlow">${ICON_SPK} Slow</button></div>
      <form class="stack" data-form="dict"><textarea id="dictAns" rows="3" ${r ? "disabled" : ""} placeholder="Type what you hear" autocapitalize="sentences" autocorrect="off" spellcheck="false" style="font:inherit;font-size:19px;padding:12px 14px;border-radius:18px;border:2px solid var(--line);width:100%;resize:vertical">${esc(D.ans || "")}</textarea>
      ${r ? "" : `<button class="big primary" type="submit">Check</button>`}</form>
      ${r ? `<div class="fb ${r.pct >= 90 ? "good" : r.pct >= 60 ? "" : "bad"}" style="${r.pct >= 60 && r.pct < 90 ? "background:var(--sun-soft);color:var(--sun-ink)" : ""}">${r.pct >= 90 ? "Excellent! " : r.pct >= 60 ? "Good try! " : "Keep practicing! "}${r.pct}% of the words right · +${r.xp} XP</div>
        <div class="stack" style="gap:6px"><p class="label">The sentence</p><p style="font-size:19px;line-height:1.6">${dictDiff(D.ans, t)}</p><p class="muted small">Red words were missed or misspelled.</p></div>
        <button class="big primary" data-act="dictNext" id="nextBtn">${D.i + 1 < D.list.length ? "Next sentence" : "Done · next part"}</button>` : ""}
    </div>`;
  const ta = document.getElementById("dictAns"); if (ta && !r) ta.focus();
}
function dictCheck() { const S = STORY, D = S.dict; const ans = (document.getElementById("dictAns") || {}).value || ""; if (!ans.trim()) return;
  const t = D.list[D.i]; const sc = dictScore(ans, t); const xp = sc.pct >= 90 ? 10 : sc.pct >= 60 ? 5 : 2; award(xp, "dictation");
  D.ans = ans; D.res = { pct: sc.pct, xp }; S.dictLog = (S.dictLog || []).concat([{ p: S.part, text: t, ans: ans.slice(0, 200), pct: sc.pct }]); render(); }
function dictNext() { const S = STORY, D = S.dict; D.i++; D.ans = ""; D.res = null; if (D.i >= D.list.length) { S.dict = null; S.dictAsk = false; return storyAdvance(); } render(); setTimeout(() => playDict(), 300); }
function storyAskDict() { STORY.dictAsk = true; render(); }
function storyStartDict() { const S = STORY; S.dictAsk = false; S.dict = { list: dictSentences(S.part), i: 0, ans: "", res: null }; if (!S.dict.list.length) { S.dict = null; return storyAdvance(); } render(); setTimeout(() => playDict(), 300); }
/* ---------- walkthrough ---------- */
const TOUR = [
  { sel: '[data-tour="hero"]', en: "This is your home screen. Your streak 🔥 and level ⭐ are here.", ko: "여기가 홈 화면이에요. 연속 학습일과 레벨을 볼 수 있어요." },
  { sel: '[data-tour="week"]', en: "Each day you finish the quiz gets a yellow check.", ko: "퀴즈를 끝낸 날에는 노란 체크가 생겨요." },
  { sel: '[data-tour="train"]', en: "Step 1: Learn this week's new words. Listen, say them, and write them.", ko: "1단계: 이번 주 새 단어를 배워요. 듣고, 말하고, 써 봐요." },
  { sel: '[data-tour="quiz"]', en: "Step 2: Do the daily quiz every day to keep your streak. Under 80%? Train the missed words first.", ko: "2단계: 매일 퀴즈를 풀어서 연속 기록을 지켜요. 80% 미만이면 틀린 단어를 먼저 연습해요." },
  { sel: '[data-tour="coach"]', en: "Step 3: Say your own sentences. The coach fixes them and shows a better way.", ko: "3단계: 직접 문장을 말해 봐요. 코치가 고쳐 주고 다른 표현도 알려줘요." },
  { sel: '[data-tour="story"]', en: "Every week there's a new story made from your words!", ko: "매주 내 단어로 만든 새 이야기가 있어요!" },
  { sel: '[data-tab="words"]', en: "Words: see all your words and tap one to hear it.", ko: "단어: 이번 주 단어를 보고 눌러서 들어요." },
  { sel: '[data-tab="progress"]', en: "Progress: your charts, scores and tricky words.", ko: "진도: 그래프, 점수, 어려운 단어를 볼 수 있어요." },
  { sel: '[data-tab="me"]', en: "Me: your badges, voice settings, and this tour again.", ko: "나: 배지, 소리 설정, 그리고 이 안내를 다시 볼 수 있어요." },
  { sel: '[data-act="reload"]', en: "Stuck? Tap ↻ to reload the app.", ko: "멈췄나요? ↻ 를 눌러 앱을 새로고침해요." }
];
let TI = -1, TSTEPS = TOUR, TKEY = "main";
const SEC_TOURS = {
  train: [[".card .word", "Here is your new word. Tap 🔊 to hear it, or Slow to hear it slowly.", "새 단어예요. 🔊를 눌러 듣고, Slow로 천천히 들어요."], [".sense", "The Korean meaning and an easy English definition.", "한국어 뜻과 쉬운 영어 설명이에요."], [".parts", "Syllables: tap a part to hear it. The dark one is said strongest.", "음절이에요. 눌러서 들어 보세요. 진한 부분을 가장 세게 읽어요."], [".ex", "Example sentences. Tap 🔊 to listen.", "예문이에요. 🔊를 눌러 들어요."], ['[data-act="toSpeak"],[data-act="cover"]', "Next, say it out loud, then write it from memory!", "그다음 소리 내어 말하고, 기억해서 써 봐요!"], [".topbar .bar", "This bar shows how many words you've finished.", "끝낸 단어 수를 보여줘요."]],
  quiz: [[".topbar .bar", "This bar shows how far you are in the quiz.", "퀴즈를 얼마나 풀었는지 보여줘요."], [".card", "Each question is different: choose, type, listen, speak or match. Score 80% or more!", "문제마다 고르기, 쓰기, 듣기, 말하기, 짝 맞추기가 있어요. 80% 이상을 받아요!"], ['[data-act="quit"]', "Need a break? Tap ✕ to stop.", "쉬고 싶으면 ✕를 눌러요."]],
  coach: [[".card .word", "This is the word for your sentence.", "이 단어로 문장을 만들어요."], [".mic", "Tap the mic and say your own sentence. Make it about your life!", "마이크를 누르고 나만의 문장을 말해요. 내 이야기로 만들어 봐요!"], ["#coachText", "If the app heard you wrong, you can fix the text here.", "앱이 잘못 들었으면 여기서 고칠 수 있어요."], ['[data-act="coachCheck"]', "Check it! The coach fixes mistakes and shows another way to say it.", "확인하면 코치가 고쳐 주고 다른 표현도 알려줘요."]],
  story: [[".story-text", "Read this part of the story. Tap a purple word to hear it.", "이야기를 읽어요. 보라색 단어를 누르면 들을 수 있어요."], ['[data-act="readPara"]', "Tap 🔊 to listen to the part.", "🔊를 누르면 들을 수 있어요."], ['[data-act="storyQs"]', "Then answer the questions. The Korean appears after you answer.", "그다음 문제를 풀어요. 답한 뒤에 한국어가 나와요."]],
  words: [[".list-row", "Tap a word to see its card. The ring fills as you master it.", "단어를 누르면 카드를 볼 수 있어요. 외울수록 동그라미가 채워져요."]],
  progress: [[".tiles", "Your streak, level and words mastered.", "연속 학습일, 레벨, 외운 단어 수예요."], [".chart", "Charts of your study time and quiz scores.", "공부 시간과 퀴즈 점수 그래프예요."], [".seg", "Switch between this week and all time.", "이번 주와 전체 기간을 바꿔 볼 수 있어요."]],
  me: [[".badges", "Collect badges by practicing!", "연습하면서 배지를 모아요!"], ['[data-act="tour"]', "Watch the app tour again here.", "여기서 안내를 다시 볼 수 있어요."]]
};
function maybeTour(key) { if (!ST || TI >= 0 || !ST.tourDone) return; if ((ST.seenTours || {})[key]) return; const steps = SEC_TOURS[key]; if (!steps) return;
  setTimeout(() => { if (TI >= 0) return; TSTEPS = steps.map(s => ({ sel: s[0], en: s[1], ko: s[2] })); TKEY = key; TI = 0; drawTour(); }, 500); }
function startTour() { TAB = "today"; view = { name: "tabs" }; TSTEPS = TOUR; TKEY = "main"; render(); window.scrollTo(0, 0); TI = 0; setTimeout(drawTour, 150); }
function drawTour() {
  document.querySelectorAll(".tour").forEach(x => x.remove()); if (TI < 0 || TI >= TSTEPS.length) return;
  const st = TSTEPS[TI]; const t = document.querySelector(st.sel);
  if (!t) { TI++; return drawTour(); }
  t.scrollIntoView({ block: "center", behavior: "instant" in document.documentElement.style ? "instant" : "auto" });
  setTimeout(() => { const r = t.getBoundingClientRect(); const pad = 8; const ov = document.createElement("div"); ov.className = "tour";
    const below = r.top < innerHeight / 2;
    ov.innerHTML = `<div class="tour-hole" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px"></div>
      <div class="tour-card" style="${below ? `top:${Math.min(innerHeight - 220, r.bottom + 16)}px` : `bottom:${Math.min(innerHeight - 220, innerHeight - r.top + 16)}px`}">
      <p class="eyebrow">${TI + 1} / ${TSTEPS.length}</p><p style="font-weight:800;font-size:17px">${esc(st.en)}</p>${KO() ? `<p class="muted">${esc(st.ko)}</p>` : ""}
      <div class="row between"><button class="ghost" data-act="tourEnd">Skip</button><div class="row">${TI ? `<button data-act="tourBack">Back</button>` : ""}<button class="primary" data-act="tourNext">${TI + 1 < TSTEPS.length ? "Next" : "Got it!"}</button></div></div></div>`;
    document.body.appendChild(ov); }, 120);
}
function tourEnd() { TI = -1; document.querySelectorAll(".tour").forEach(x => x.remove());
  if (TKEY === "main") { if (!ST.tourDone) { ST.tourDone = today(); saveST(); } window.scrollTo(0, 0); }
  else { ST.seenTours = Object.assign({}, ST.seenTours, { [TKEY]: today() }); saveST(); }
  TSTEPS = TOUR; TKEY = "main"; }
window.addEventListener("resize", () => { if (TI >= 0) drawTour(); });

/* ---------- read-aloud fluency (optional bonus) ---------- */
const rtoks = s => String(s).split(/\s+/).filter(Boolean).map(w => ({ raw: w, n: w.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "") })).filter(x => x.n);
function wordOk(a, b) { if (!a || !b) return false; if (a === b) return true; if (b.length > 3 && lev(a, b) <= 1) return true; return phKey(a) === phKey(b) && Math.abs(a.length - b.length) <= 2; }
function alignRead(heardText, T) { const R = String(heardText).toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const ok = new Array(T.length).fill(false); let pos = 0;
  for (const r of R) { for (let k = pos; k < Math.min(T.length, pos + 5); k++) { if (wordOk(r, T[k].n)) { ok[k] = true; pos = k + 1; break; } } }
  return { ok, pos }; }
function startReadAloud() { const S = STORY; S.dictAsk = false; const P = S.data.parts[S.part];
  S.read = { T: rtoks(P.en), heard: "", final: "", ok: [], listening: false, res: null, t0: 0, restarts: 0, rec: null }; render(); }
function readListen() {
  const R = STORY.read; if (R.listening) return; let rec; try { rec = new SR(); } catch (e) { toast("This phone can't listen here"); return; }
  rec.lang = "en-US"; rec.interimResults = true; rec.continuous = true; stopAudio(); paraToken++;
  R.rec = rec; R.listening = true; if (!R.t0) R.t0 = Date.now(); let quiet = null;
  rec.onresult = ev => { let fin = "", inter = ""; for (let i = 0; i < ev.results.length; i++) { if (ev.results[i].isFinal) fin += " " + ev.results[i][0].transcript; else inter += " " + ev.results[i][0].transcript; }
    R.heard = (R.final + " " + fin + " " + inter).trim(); R.cur = fin;
    const a = alignRead(R.heard, R.T); R.ok = a.ok; paintRead();
    clearTimeout(quiet); if (a.pos >= R.T.length - 1) quiet = setTimeout(() => readFinish(), 1200); else quiet = setTimeout(() => readFinish(), 4000); };
  rec.onerror = ev => { if (/not-allowed|service-not-allowed/.test(ev.error)) { R.listening = false; toast("Microphone is off. Allow it in Settings → Safari."); render(); } };
  rec.onend = () => { if (!R.listening) return; R.final = (R.final + " " + (R.cur || "")).trim(); R.cur = "";
    if (R.restarts < 4) { R.restarts++; R.listening = false; R.rec = null; readListen(); } else readFinish(); };
  try { rec.start(); } catch (e) { R.listening = false; }
  render();
}
function paintRead() { const R = STORY.read; document.querySelectorAll(".rw").forEach((el, k) => el.classList.toggle("on", !!R.ok[k])); const c = document.getElementById("readCount"); if (c) c.textContent = R.ok.filter(Boolean).length + " / " + R.T.length + " words"; }
function readFinish() { const R = STORY.read; if (!R || R.res) return; R.listening = false; try { R.rec && R.rec.abort(); } catch (e) {}
  const got = R.ok.filter(Boolean).length, pct = Math.round(got / Math.max(1, R.T.length) * 100); const secs = Math.max(1, (Date.now() - R.t0) / 1000); const wpm = Math.round(got / secs * 60);
  const xp = pct >= 90 ? 15 : pct >= 70 ? 10 : 5; award(xp, "read aloud");
  R.res = { pct, wpm, xp, secs: Math.round(secs) };
  STORY.readLog = (STORY.readLog || []).concat([{ p: STORY.part, pct, wpm, missed: R.T.filter((t, k) => !R.ok[k]).map(t => t.n).slice(0, 15) }]);
  render(); }
function renderReadAloud() {
  const S = STORY, R = S.read;
  const words = R.T.map((t, k) => `<span class="rw ${R.ok[k] ? "on" : R.res ? "miss" : ""}">${esc(t.raw)}</span>`).join(" ");
  $app.innerHTML = `<div class="topbar"><button class="x" data-act="readSkip" aria-label="Skip">${I.x}</button><span class="count" style="flex:1">Read out loud · Part ${S.part + 1}</span></div>
    <div class="card"><p class="label">Read from beginning to end</p><p class="story-text read-text">${words}</p>
      ${R.res ? `<div class="fb ${R.res.pct >= 90 ? "good" : R.res.pct >= 70 ? "" : "bad"}" style="${R.res.pct >= 70 && R.res.pct < 90 ? "background:var(--sun-soft);color:var(--sun-ink)" : ""}">${R.res.pct >= 90 ? "Fantastic reading! 🌟" : R.res.pct >= 70 ? "Good reading! 👍" : "Nice try! Read the red words again. 💪"}<br>${R.res.pct}% of the words · ${R.res.wpm} words per minute · +${R.res.xp} XP</div>
        <div class="row"><button class="big" data-act="readAgain" style="flex:1">Read again</button><button class="big primary" data-act="readDone" style="flex:1">Next →</button></div>`
      : `<p class="muted" id="readCount" style="text-align:center;font-weight:800">${R.ok.filter(Boolean).length} / ${R.T.length} words</p>
        <button class="mic ${R.listening ? "on" : ""}" data-act="readMic" ${R.listening ? "disabled" : ""} aria-label="Start reading">${ICON_MIC}</button>
        <p class="muted" style="text-align:center;font-weight:800">${R.listening ? "Listening… read the whole part. Words turn green." : "Tap the mic, then start reading"}</p>
        ${R.listening ? `<button class="big" data-act="readStop">I'm done reading</button>` : `<button class="ghost" data-act="readHear" style="align-self:center">${ICON_SPK} Listen to it first</button>`}`}
    </div>`;
}

/* ---------- level test, profile, goals, language, menu ---------- */
const GRADED = BANK.filter(e => typeof e.g === "number");
const TEST_IDS = (window.__TEST__ || []).filter(id => BY[id] && typeof BY[id].g === "number");
const KO = () => !(ST && ST.settings && ST.settings.lang === "en");
const gloss = e => KO() ? e.ko : e.def;
const sgloss = s => KO() ? s.ko : s.def;
function gradeLabel(g) { if (g == null || isNaN(g)) return "–"; if (g < 0.5) return "K"; if (g >= 8.95) return "8+"; return (Math.round(g * 10) / 10).toFixed(1); }
function gradeWord(g) { const l = gradeLabel(g); return l === "K" ? "Kindergarten" : l === "8+" ? "Grade 8+" : "Grade " + l; }
function defaultSettings(st) { const legacy = !!(st && st.placement && st.placement.byBook);
  return legacy ? { lang: "ko", textbook: true, tbNew: 12, grNew: 8, review: 10 } : { lang: "ko", textbook: false, tbNew: 12, grNew: 20, review: 10 }; }
function SET(st) { st = st || ST; return Object.assign(defaultSettings(st), (st && st.settings) || {}); }
function effCfg(st) { const s = SET(st);
  return Object.assign({}, CFG, { textbook: !!s.textbook, tbNew: s.textbook ? s.tbNew : 0, grNew: s.grNew, newPerWeek: (s.textbook ? s.tbNew : 0) + s.grNew, reviewPerWeek: s.review, startUnit: s.startUnit || CFG.startUnit }); }
function studentHome() {
  if (!ST.profile) return "onboard";
  if (!ST.level || ST.levelRetake) return "levelIntro";
  if (SET().textbook && !ST.placement.done) return "placementIntro";
  return "tabs";
}
const readyForWeeks = () => !!(ST && ST.profile && ST.level && (!SET().textbook || ST.placement.done));
const firstName = () => (ST && ST.profile && ST.profile.name) || "";

/* new words picked from the graded list, just above her level */
function gradedPick(st, words, used, n) {
  const L = st.level ? st.level.g : 2; const known = new Set((st.level && st.level.known) || []); const s = SET(st);
  const out = []; const ok = id => BY[id] && !used.has(id) && !words[id] && !out.includes(id);
  (st.gradedPool || []).forEach(id => { if (out.length < n && ok(id)) out.push(id); });
  st.gradedPool = (st.gradedPool || []).filter(id => !out.includes(id) && !used.has(id) && !words[id]);
  if (out.length < n) {
    const cand = GRADED.filter(e => e.g >= L - 0.3 && !e.soft && (!s.textbook || e.book === "G") && !known.has(e.id) && ok(e.id)).sort((a, b) => a.g - b.g);
    for (const e of cand) { if (out.length >= n) break; out.push(e.id); }
  }
  return out;
}

/* ---------- onboarding ---------- */
function renderOnboard() {
  const p = ST.profile || {}; const lang = (ST.settings && ST.settings.lang) || "ko";
  const ages = []; for (let a = 6; a <= 16; a++) ages.push(`<option value="${a}" ${(p.age || 11) === a ? "selected" : ""}>${a}</option>`);
  $app.innerHTML = `<section class="hero" style="text-align:center"><div class="stack" style="align-items:center;gap:10px">${buddy("happy", 104)}<h1>Welcome to Vocaboo!</h1><p class="muted">Let's get to know you first</p></div></section>
  <form class="card" data-form="onboard"><h2>About you</h2>
    <div class="field"><label for="obName">What's your name?</label><input id="obName" type="text" autocomplete="given-name" value="${esc(p.name || "")}" placeholder="Your first name" maxlength="30"></div>
    <div class="field"><label for="obAge">How old are you?</label><select id="obAge">${ages.join("")}</select></div>
    <div class="field"><label>Word meanings</label><div class="seg" style="width:100%"><button type="button" data-act="obLang" data-v="ko" aria-pressed="${lang !== "en"}" style="flex:1">English + 한국어</button><button type="button" data-act="obLang" data-v="en" aria-pressed="${lang === "en"}" style="flex:1">English only</button></div></div>
    <button class="big primary" type="submit">Next</button></form>`;
}
function saveOnboard() {
  const name = (document.getElementById("obName").value || "").trim(); const age = +document.getElementById("obAge").value;
  if (!name) { toast("Type your name first"); return; }
  ST.profile = { name: name.slice(0, 30), age, at: Date.now() }; ST.settings = Object.assign({}, ST.settings || {}, { lang: ST._lang || (ST.settings && ST.settings.lang) || "ko" }); delete ST._lang;
  saveST(); logDid("profile"); view = { name: studentHome() }; render();
}

/* ---------- adaptive level test ---------- */
let LT = null;
const GRID = []; for (let x = -1.5; x <= 10.001; x += 0.1) GRID.push(+x.toFixed(2));
const pKnow = (th, g) => 1 / (1 + Math.exp(-(0.85 * (th - g) + 0.85))); // a word at her level: ~70% known
const GUESS = 0.6; // chance she guesses (instead of "I don't know") when she doesn't know
function ltLike(r, th, g) { const P = pKnow(th, g); return r === "ok" ? 0.97 * P + (1 - P) * GUESS * 0.25 : r === "bad" ? 0.03 * P + (1 - P) * GUESS * 0.75 : (1 - P) * (1 - GUESS) + 0.01; }
function ltEst() { const s = LT.post.reduce((a, b) => a + b, 0); let m = 0; LT.post.forEach((p, i) => m += GRID[i] * p / s); let v = 0; LT.post.forEach((p, i) => v += (GRID[i] - m) ** 2 * p / s); return { m, sd: Math.sqrt(v) }; }
function renderLevelIntro() {
  const retake = !!ST.level; const nm = firstName();
  $app.innerHTML = `${previewBar()}<section class="hero" style="text-align:center"><div class="stack" style="align-items:center;gap:10px">${buddy("happy", 110)}<h1>${retake ? "Level check time!" : `Hi${nm ? " " + esc(nm) : ""}! Let's see what you know`}</h1><p class="muted">${retake ? "Let's see how much you've grown" : "A quick word game to find your level"}</p></div></section>
  <div class="card"><h3>How it works</h3>
    <p>You'll see and hear a word. Pick what it means. ${KO() ? "Meanings are in Korean or English." : ""}</p>
    <p>Get it right and the words get harder. Miss one and they get easier. That's normal. Nobody knows them all!</p>
    <div class="notice info">Don't know a word? Tap <b>I don't know</b>. Please don't guess. Guessing makes your level wrong.${KO() ? "<br><span class='small'>모르는 단어는 찍지 말고 ‘I don't know’를 눌러 주세요.</span>" : ""}</div>
    <p class="muted">About 25–30 words · 5–8 minutes</p>
    <button class="big primary" data-act="startLevel">Start</button>
    ${IS_OWNER ? `<button class="big" data-act="skipLevel">Skip with sample answers (teacher test)</button>` : ""}</div>`;
}
async function startLevelTest(sim) {
  const age = (ST.profile && ST.profile.age) || 11; const mu = Math.max(0, Math.min(8, ST.level ? ST.level.g : age - 7));
  LT = { post: GRID.map(x => Math.exp(-((x - mu) ** 2) / (2 * 2.5 * 2.5))), items: [], used: new Set(), q: null, t0: Date.now(), mu };
  startAttempt("level", { n: 0, retake: !!ST.level }); logDid("level test");
  if (sim) { const truth = mu + (Math.random() * 2 - 1); while (!ltDone()) { ltNext(true); const e = BY[LT.q.id]; const P = pKnow(truth, e.g); const r = Math.random() < P ? "ok" : Math.random() < GUESS ? (Math.random() < 0.25 ? "ok" : "bad") : "idk"; ltRecord(r, r === "ok" ? LT.q.id : r === "bad" ? "x" : null, 3000); } return finishLevelTest(); }
  view = { name: "level" }; ltNext(); render(); await loadPack("TEST"); if (LT && LT.q) speak(LT.q.id, "w");
}
function ltDone() { const { sd } = ltEst(); const n = LT.items.length; return n >= 32 || (n >= 24 && sd < 0.5); }
function ltNext(quiet) {
  const { m } = ltEst(); const n = LT.items.length;
  const target = n < 3 ? m - 1.4 + n * 0.45 : m - 0.2 + (Math.random() - 0.5) * 0.5;
  const pool = TEST_IDS.filter(id => !LT.used.has(id)).sort((a, b) => Math.abs(BY[a].g - target) - Math.abs(BY[b].g - target)).slice(0, 5);
  const id = pool[Math.floor(Math.random() * pool.length)]; LT.used.add(id);
  LT.q = { id, opts: levelOpts(BY[id]) }; LT.t0 = Date.now(); LT.picked = null;
}
function levelOpts(e) {
  const lab = x => { const s = senseList(x)[0]; return KO() ? s.ko : s.def; };
  const mine = new Set(koTerms(e)); const myLab = lab(e);
  const fine = x => x.id !== e.id && lab(x) !== myLab && !koTerms(x).some(t => mine.has(t)) && !norm(x.def).includes(norm(e.w)) && !norm(e.def).includes(norm(x.w));
  let pool = shuffle(GRADED.filter(x => Math.abs(x.g - e.g) < 1.5 && x.pos === e.pos && fine(x)));
  if (pool.length < 3) pool = pool.concat(shuffle(GRADED.filter(x => Math.abs(x.g - e.g) < 2.5 && fine(x))));
  const out = []; const seen = new Set([myLab]); for (const x of pool) { if (out.length >= 3) break; const l = lab(x); if (seen.has(l)) continue; seen.add(l); out.push(x); }
  return shuffle([e].concat(out)).map(x => ({ id: x.id, label: lab(x) }));
}
function ltRecord(r, pick, ms) {
  const q = LT.q; const e = BY[q.id];
  LT.post = LT.post.map((p, i) => p * ltLike(r, GRID[i], e.g));
  const mx = Math.max(...LT.post); LT.post = LT.post.map(p => p / mx);
  LT.items.push({ id: q.id, g: e.g, r });
  const o = q.opts.find(x => x.id === pick);
  ATT.items.push({ id: q.id, t: "level", ok: r === "ok", ans: r === "idk" ? "(I don't know)" : o ? String(o.label).slice(0, 40) : "", ms: Math.round(ms || 0), g: e.g });
}
function levelAnswer(pick) {
  if (!LT || !LT.q || LT.picked != null) return; const q = LT.q;
  const r = pick == null ? "idk" : pick === q.id ? "ok" : "bad"; LT.picked = pick == null ? "idk" : pick;
  ltRecord(r, pick, Date.now() - LT.t0); if (LT.items.length % 5 === 0) { ATT.n = LT.items.length; saveAttempt(); }
  render();
  setTimeout(() => { if (!LT) return; if (ltDone()) return finishLevelTest(); ltNext(); render(); speak(LT.q.id, "w"); }, 260);
}
function renderLevel() {
  const q = LT.q; const e = BY[q.id]; const n = LT.items.length; const est = Math.min(32, Math.max(n + 1, 30));
  $app.innerHTML = `<div class="topbar"><button class="x" data-act="quit" aria-label="Stop">${I.x}</button><div class="bar"><i style="width:${Math.round(n / est * 100)}%"></i></div><span class="count">${n + 1}</span><span style="width:44px"></span></div>
  <span class="eyebrow">Level check</span>
  <div class="card"><p class="label">What does this word mean?</p>
    <div class="row between" style="flex-wrap:nowrap"><div class="word" style="${wsz(e.w)}">${esc(e.w)}</div>${spk(e.id, "w")}</div>
    <div class="opts">${q.opts.map(o => `<button class="opt ${LT.picked === o.id ? "sel" : ""}" data-act="ltPick" data-id="${o.id}" ${LT.picked != null ? "disabled" : ""}>${esc(o.label)}</button>`).join("")}</div>
    <button class="big ${LT.picked === "idk" ? "sel" : ""}" data-act="ltIdk" ${LT.picked != null ? "disabled" : ""}>🤔 I don't know</button></div>
  <p class="muted small" style="text-align:center">There's no score here. It just finds the right words for you.</p>`;
}
function finishLevelTest() {
  const { m, sd } = ltEst(); const g = Math.max(0, Math.min(9, m));
  const known = LT.items.filter(i => i.r === "ok").map(i => i.id); const missed = LT.items.filter(i => i.r !== "ok").map(i => i.id);
  const vocab = Math.round(GRADED.reduce((s, e) => s + pKnow(g, e.g), 0));
  const first = !ST.level; const prev = ST.level;
  ST.level = { g: +g.toFixed(2), lo: +Math.max(0, g - sd).toFixed(2), hi: +Math.min(9, g + sd).toFixed(2), sd: +sd.toFixed(2), at: Date.now(), n: LT.items.length,
    known: [...new Set(((prev && prev.known) || []).concat(known))], vocab, of: GRADED.length, att: ATT.id };
  ST.levelHist = (ST.levelHist || []).concat([{ g: ST.level.g, lo: ST.level.lo, hi: ST.level.hi, at: ST.level.at, vocab }]).slice(-30);
  ST.levelRetake = false;
  ST.gradedPool = [...new Set(missed.filter(id => BY[id].g <= g + 1).sort((a, b) => BY[a].g - BY[b].g).concat(ST.gradedPool || []))].filter(id => !WORDS[id]);
  if (!ST.goal) { const s = SET(); ST.goal = { g: +Math.min(8.9, g + 1).toFixed(1), by: addDays(today(), 182), from: +g.toFixed(2), auto: true }; void s; }
  ATT.end = Date.now(); ATT.n = LT.items.length; ATT.score = known.length / Math.max(1, LT.items.length); ATT.level = ST.level.g; ATT.sd = ST.level.sd;
  saveAttempt(); bumpStat("levelTests"); award(30, "level check"); logDid("level " + gradeLabel(g));
  if (!ST.week && readyForWeeks()) { buildWeek(ST, WORDS, effCfg(ST), true); loadPacksFor(weekIds()); }
  saveST(); PROG = null;
  view = { name: "levelResult", prev: prev ? prev.g : null, first }; LT = null; render();
}
function renderLevelResult() {
  const L = ST.level; const prev = view.prev; const up = prev != null ? L.g - prev : null; const gl = gradeLabel(L.g);
  const pct = Math.min(100, Math.max(4, L.g / 9 * 100));
  const scale = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(k => `<span>${k === 0 ? "K" : k}</span>`).join("");
  const next = studentHome() === "tabs" ? (ST.week ? "See my words" : "Let's start") : "Next";
  $app.innerHTML = `<div style="height:14px"></div><div class="result-hero">${buddy("wow", 96)}<span class="eyebrow" style="color:rgba(255,255,255,.8)">Your word level</span>
    <h1 style="font-size:46px;margin:0">${gl === "K" ? "K" : "Grade " + gl}</h1>
    <p style="opacity:.9">You know words like a typical US ${gl === "K" ? "kindergartner" : "grade " + gl + " student"}.</p>
    ${up != null ? `<span class="pill ${up >= 0 ? "good" : ""}" style="font-size:15px">${up >= 0 ? "▲ up " + up.toFixed(1) : "▼ " + Math.abs(up).toFixed(1)} since last time</span>` : ""}</div>
  <div class="card"><h3>Where you are</h3>
    <div class="lvscale"><div class="lvtrack"><i class="lvrange" style="left:${L.lo / 9 * 100}%;width:${Math.max(2, (L.hi - L.lo) / 9 * 100)}%"></i><b class="lvdot" style="left:${pct}%"></b>${ST.goal ? `<b class="lvgoal" style="left:${Math.min(100, ST.goal.g / 9 * 100)}%" title="goal">★</b>` : ""}</div><div class="lvlabels">${scale}</div></div>
    <p class="muted small">Likely range: ${gradeLabel(L.lo)} – ${gradeLabel(L.hi)}${ST.goal ? ` · ★ goal: ${gradeWord(ST.goal.g)}` : ""}</p></div>
  <div class="tiles"><div class="tile"><b>${L.vocab.toLocaleString()}</b><span>of ${L.of.toLocaleString()} core K–8 words you probably know</span></div><div class="tile"><b>${L.n}</b><span>words checked</span></div></div>
  <div class="card"><h3>Your weekly goal</h3>${goalHtml()}</div>
  <button class="big primary" data-act="levelDone">${next}</button>`;
}
function goalHtml(st) {
  st = st || ST; const c = effCfg(st);
  return `<div class="stack" style="gap:6px"><p>📚 Learn <b>${c.newPerWeek}</b> new words + review <b>${c.reviewPerWeek}</b> each week</p><p>✏️ Daily quiz on <b>5 or more</b> days</p>${st.goal ? `<p>⭐ Reach <b>${gradeWord(st.goal.g)}</b> by ${new Date(st.goal.by + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>` : ""}</div>`;
}
function levelCard() { // Me / Progress card
  const L = ST.level; if (!L) return "";
  const days = Math.floor((Date.now() - L.at) / 864e5); const can = days >= 28 || IS_OWNER;
  const H = (ST.levelHist || []); const g0 = ST.goal ? ST.goal.from : H.length ? H[0].g : L.g; const goalPct = ST.goal ? Math.max(0, Math.min(100, (L.g - g0) / Math.max(0.1, ST.goal.g - g0) * 100)) : 0;
  return `<div class="card"><div class="row between"><h3>Word level</h3><span class="pill sun">${gradeWord(L.g)}</span></div>
    ${H.length > 1 ? lineChartG(H) : ""}
    ${ST.goal ? `<div class="stack" style="gap:5px"><div class="row between small"><span class="muted">Goal: ${gradeWord(ST.goal.g)}</span><b>${Math.round(goalPct)}%</b></div><div class="hbar"><i style="width:${goalPct}%;background:#FFC93C"></i></div></div>` : ""}
    <p class="muted small">Last checked ${days === 0 ? "today" : days + " day" + (days === 1 ? "" : "s") + " ago"}. ${can ? "" : "You can check again in " + (28 - days) + " days."}</p>
    ${can ? `<button class="big" data-act="levelAgain">Check my level again</button>` : ""}</div>`;
}
function lineChartG(H) {
  const W = 320, Hh = 130, l = 26, r = 12, t = 12, b = 22, n = H.length; const max = Math.max(4, Math.ceil(Math.max(...H.map(h => h.hi || h.g), ST.goal ? ST.goal.g : 0)));
  const X = i => n === 1 ? (l + W - r) / 2 : l + i * (W - l - r) / (n - 1), Y = v => t + (max - v) * (Hh - t - b) / max;
  const d = H.map((h, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(h.g).toFixed(1)).join(" ");
  const grid = [0, Math.round(max / 2), max].map(v => `<line x1="${l}" x2="${W - r}" y1="${Y(v)}" y2="${Y(v)}" stroke="#E7E3F3"/><text x="${l - 5}" y="${Y(v) + 4}" text-anchor="end" font-size="10" fill="#6E6787">${v === 0 ? "K" : v}</text>`).join("");
  const goal = ST.goal ? `<line x1="${l}" x2="${W - r}" y1="${Y(ST.goal.g)}" y2="${Y(ST.goal.g)}" stroke="#E0A100" stroke-dasharray="4 4"/><text x="${W - r}" y="${Y(ST.goal.g) - 4}" text-anchor="end" font-size="10" font-weight="800" fill="#E0A100">goal</text>` : "";
  return `<div class="chart"><svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Level over time">${grid}${goal}<path d="${d}" fill="none" stroke="#5B3FD9" stroke-width="3" stroke-linejoin="round"/>${H.map((h, i) => `<circle cx="${X(i)}" cy="${Y(h.g)}" r="4" fill="#fff" stroke="#5B3FD9" stroke-width="2"/><text x="${X(i)}" y="${Hh - 6}" text-anchor="middle" font-size="10" fill="#6E6787">${new Date(h.at).getMonth() + 1}/${new Date(h.at).getDate()}</text>`).join("")}</svg></div>`;
}

/* ---------- menu (always reachable) ---------- */
function gearHtml() { return `<button id="gearBtn" class="gear" data-act="menu" aria-label="Menu">⚙️</button>`; }
function drawGear() {
  let g = document.getElementById("gearBtn"); const show = mode === "student" && !["loading", "login"].includes(view.name);
  if (!show) { if (g) g.remove(); return; }
  if (!g) { const w = document.createElement("div"); w.innerHTML = gearHtml(); document.body.appendChild(w.firstChild); }
}
function openMenu() {
  closeMenu(); const el = document.createElement("div"); el.className = "menu-wrap"; el.id = "menuWrap";
  const inRun = ["run", "train", "coach", "story", "level", "wordCard"].includes(view.name); const home = ST && studentHome() === "tabs";
  const em = (WW.user() && WW.user().email) || "";
  el.innerHTML = `<div class="menu-sheet" role="dialog" aria-label="Menu"><div class="row between"><div class="stack" style="gap:0"><b>${esc(firstName() || em.split("@")[0] || "Menu")}</b><span class="muted small">${esc(em)}</span></div><button class="x" data-act="menuClose" aria-label="Close">${I.x}</button></div>
    ${home ? `<button class="menu-item" data-act="menuHome">🏠 ${inRun ? "Stop and go home" : "Home"}</button><button class="menu-item" data-act="menuMe">⚙️ My settings</button>` : ""}
    ${ST && !IS_OWNER && !pushOn() && WW.pushPermission() !== "unsupported" ? `<button class="menu-item" data-act="menuPush">🔔 Turn on reminders</button>` : ""}
    <button class="menu-item" data-act="reload">🔄 Reload app</button>
    ${IS_OWNER ? `<button class="menu-item" data-act="toTeacher">📊 Teacher dashboard</button>` : `<button class="menu-item danger" data-act="menuSignout">↩️ Sign out</button>`}</div>`;
  document.body.appendChild(el);
  el.addEventListener("click", ev => { if (ev.target === el) closeMenu(); });
}
function closeMenu() { const m = document.getElementById("menuWrap"); if (m) m.remove(); }
function leaveActivity() { stopAudio(); if (typeof flushXP === "function") flushXP(); if (ATT && !ATT.end && view.name !== "story") { ATT.quit = Date.now(); saveAttempt(); } RUN = null; TR = null; CO = null; STORY = null; LT = null; }

/* ---------- ask about reminders once a day ---------- */
let PUSHASK = false;
function maybeAskPush() {
  if (IS_OWNER || !ST || pushOn() || PUSHASK) return false;
  const perm = WW.pushPermission(); if (perm === "denied" || perm === "unsupported" || !WW.standalone()) return false;
  if (ST.pushAskDay === today()) return false;
  ST.pushAskDay = today(); saveST(); PUSHASK = true;
  const el = document.createElement("div"); el.className = "cel"; el.id = "pushAsk";
  el.innerHTML = `<div class="cel-card"><div class="cel-icon">🔔</div><h2>Turn on reminders?</h2><p class="muted">Vocaboo can send a friendly reminder at 8am, 5pm and 8pm so you never lose your streak.</p>${KO() ? `<p class="muted small">알림을 켜면 연속 기록을 지키기 쉬워요!</p>` : ""}<button class="big primary" data-act="pushAskYes">Yes, remind me</button><button class="big" data-act="pushAskNo">Not now</button></div>`;
  document.body.appendChild(el); return true;
}
function closePushAsk() { const el = document.getElementById("pushAsk"); if (el) el.remove(); PUSHASK = false; if (ST && !ST.tourDone && TI < 0) setTimeout(startTour, 300); }
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
function studentLabel(s) { if (s.test) return "Test (you)"; return (s.profile && s.profile.name) || s.email || "Student"; }
function weekStats(wk) {
  const D = T.data; const atts = D.atts.filter(a => a.weekKey === wk); const sess = D.sess.filter(s => s.weekKey === wk);
  const quizzes = atts.filter(a => a.kind === "quiz" && a.end); const trains = atts.filter(a => a.kind === "training");
  const days = {}; for (let i = 0; i < 7; i++) days[addDays(wk, i)] = { sec: 0, quiz: [], train: 0 };
  sess.forEach(s => { if (days[s.day]) days[s.day].sec += actSec(s); });
  quizzes.forEach(q => { if (days[q.day]) days[q.day].quiz.push(Math.round(q.score * 100)); });
  trains.forEach(t => { if (days[t.day]) days[t.day].train++; });
  const items = atts.filter(a => (a.kind !== "placement" && a.kind !== "level")).flatMap(a => a.items.map(i => Object.assign({ kind: a.kind, at: a.start }, i)));
  const byType = {}; items.forEach(i => { const b = byType[i.t] || (byType[i.t] = { ok: 0, n: 0, ms: 0 }); b.n++; if (i.ok) b.ok++; b.ms += i.ms || 0; });
  const byWord = {}; items.filter(i => !SPEAK.has(i.t) && i.t !== "coach").forEach(i => { const b = byWord[i.id] || (byWord[i.id] = { ok: 0, n: 0, wrong: [], types: {} }); b.n++; if (i.ok) b.ok++; else { if (i.ans && !MC_TYPES.has(i.t) && i.t !== "match") b.wrong.push(i.ans); b.types[i.t] = (b.types[i.t] || 0) + 1; } });
  const near = items.filter(i => !i.ok && i.ans && EN_TYPED.has(i.t) && lev(norm(i.ans), norm(BY[i.id].w)) <= 2);
  const far = items.filter(i => !i.ok && EN_TYPED.has(i.t) && !(i.ans && lev(norm(i.ans), norm(BY[i.id].w)) <= 2));
  const totalSec = sess.reduce((s, x) => s + actSec(x), 0);
  const activeDays = Object.values(days).filter(d => d.sec > 0 || d.quiz.length || d.train).length;
  const avg = quizzes.length ? Math.round(quizzes.reduce((s, q) => s + q.score, 0) / quizzes.length * 100) : null;
  const sayBad = {}; items.filter(i => (SPEAK.has(i.t) || i.t === "say_en") && !i.ok).forEach(i => { const b = sayBad[i.id] || (sayBad[i.id] = { n: 0, skip: 0, heard: [] }); b.n++; if (i.ans === "(skipped)") b.skip++; else if (i.ans) b.heard.push(i.ans); });
  const coach = items.filter(i => i.t === "coach");
  const stories = atts.filter(a => a.kind === "story" && a.end); let xpWeek = 0; for (let i = 0; i < 7; i++) xpWeek += ((T.data.st && T.data.st.xpDays) || {})[addDays(wk, i)] || 0;
  const ratings = {}; atts.filter(a => a.kind === "training" && a.ratings).sort((x, y) => x.start - y.start).forEach(a => Object.entries(a.ratings).forEach(([id, r]) => { ratings[id] = r[r.length - 1]; }));
  return { stories, xpWeek, ratings, coach, sayBad, atts, sess, quizzes, trains, days, byType, byWord, near, far, totalSec, activeDays, avg, locks: quizzes.filter(q => q.locked).length, required: trains.filter(t => t.required).length };
}
function weekOptions() { const ks = new Set([weekKey()]); (T.data.atts || []).forEach(a => ks.add(a.weekKey)); (T.data.sess || []).forEach(a => ks.add(a.weekKey)); return [...ks].sort().reverse(); }
function wkLabel(k) { const a = new Date(k + "T12:00:00"), b = new Date(addDays(k, 6) + "T12:00:00"); return `${a.getMonth() + 1}/${a.getDate()} (Sat) – ${b.getMonth() + 1}/${b.getDate()} (Fri)`; }
function reportText() {
  const wk = T.week; const S = weekStats(wk); const st = T.data.st; const name = studentLabel(T.students.find(s => s._id === T.sel));
  const L = [];
  L.push(`VOCABOO WEEKLY REPORT — ${name} — ${wkLabel(wk)}`);
  if (st.profile) L.push(`Age ${st.profile.age}. Meanings shown: ${SET(st).lang === "en" ? "English only" : "English + Korean"}.`);
  if (st.level) L.push(`Word level: ${gradeWord(st.level.g)} (range ${gradeLabel(st.level.lo)}–${gradeLabel(st.level.hi)}), checked ${new Date(st.level.at).toLocaleDateString()}, about ${st.level.vocab}/${st.level.of} core words known.${st.goal ? " Goal: " + gradeWord(st.goal.g) + " by " + st.goal.by + "." : ""}`);
  L.push(`Time: ${fmtMin(S.totalSec)} min over ${S.activeDays}/7 days, ${S.sess.length} sessions`);
  Object.entries(S.days).forEach(([d, x]) => L.push(`  ${d} ${DOW[new Date(d + "T12:00:00").getDay()]}: ${fmtMin(x.sec)} min, quiz ${x.quiz.length ? x.quiz.join("/") + "%" : "none"}${x.train ? ", training x" + x.train : ""}`));
  L.push(`Quizzes: ${S.quizzes.length}, average ${S.avg == null ? "-" : S.avg + "%"}, sent to training ${S.locks}x. Streak ${st.streak.count} (best ${st.streak.best}). Quiz size ${st.quizSize}.`);
  L.push(`Accuracy by type:`); Object.entries(S.byType).forEach(([t, b]) => L.push(`  ${TYPE_NAME[t]}: ${Math.round(b.ok / b.n * 100)}% (${b.ok}/${b.n})`));
  L.push(`Most-missed words (word | meaning | wrong/total | her typed answers):`);
  Object.entries(S.byWord).filter(([, b]) => b.ok < b.n).sort((a, b) => (b[1].n - b[1].ok) - (a[1].n - a[1].ok)).slice(0, 20).forEach(([id, b]) => L.push(`  ${BY[id].w} | ${BY[id].ko} | ${b.n - b.ok}/${b.n} | ${b.wrong.slice(-4).join(", ") || "-"}`));
  L.push(`Hard to say: ${Object.entries(S.sayBad).sort((a, b) => b[1].n - a[1].n).slice(0, 15).map(([id, b]) => BY[id].w + " (" + b.n + " missed" + (b.skip ? ", " + b.skip + " skipped" : "") + ")").join(", ") || "none"}`);
  L.push(`XP this week: ${S.xpWeek} (level ${levelOf(st.xp || 0)}, ${Object.keys(st.badges || {}).length} badges). Story: ${S.stories.map(a => Math.round((a.score || 0) * (a.n || 5)) + "/" + (a.n || 5)).join(", ") || "not read"}`);
  L.push(`Self-ratings (latest): ${Object.entries(S.ratings).map(([id, r]) => BY[id].w + " " + { bad: ":(", mid: ":|", good: ":)" }[r]).join(", ") || "none"}`);
  L.push(`Her own sentences: ${S.coach.map(i => `[${BY[i.id].w}] "${i.ans}"${i.ok ? " ✓" : " → " + (i.fixed || "?")}`).join(" | ") || "none"}`);
  L.push(`Spelling near-misses: ${S.near.map(i => i.ans + "→" + BY[i.id].w).join(", ") || "none"}`);
  if (st.week) { L.push(`This week's new words: ${st.week.newIds.map(i => BY[i].w).join(", ")}`); L.push(`This week's review words: ${st.week.reviewIds.map(i => BY[i].w).join(", ")}`);
    L.push(`Not mastered yet: ${st.week.newIds.concat(st.week.reviewIds).filter(id => !(T.data.words[id] && T.data.words[id].box >= MASTER_BOX)).map(i => BY[i].w).join(", ")}`); }
  return L.join("\n");
}
function showReportText(txt) { const pre = document.createElement("pre"); pre.className = "report"; pre.textContent = txt; const box = document.createElement("div"); box.className = "stack";
  const p = document.createElement("p"); p.className = "muted"; p.textContent = "Copying isn't allowed here. Select the text below and copy it."; box.append(p, pre); $app.prepend(box); }
async function saveCfg() {
  const n = id => +document.getElementById(id).value;
  const old = CFG; CFG = { startUnit: Math.min(30, Math.max(1, n("cfgStart"))), newPerWeek: Math.min(40, Math.max(5, n("cfgNew"))), reviewPerWeek: Math.min(30, Math.max(0, n("cfgRev"))), passPct: Math.min(100, Math.max(50, n("cfgPass"))), hints: document.getElementById("cfgHints").value === "1", speak: document.getElementById("cfgSpeak").value === "1" };
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
async function saveStu() {
  const st = T.data.st; const v = id => document.getElementById(id).value; const n = (id, lo, hi) => Math.min(hi, Math.max(lo, +v(id) || 0));
  st.settings = Object.assign({}, st.settings || {}, { lang: v("sLang"), textbook: v("sTb") === "1", tbNew: n("sTbNew", 0, 40), startUnit: n("sStart", 1, 30), grNew: n("sGrNew", 0, 40), review: n("sRev", 0, 30) });
  if (v("sGoal") !== "") st.goal = Object.assign({}, st.goal || { from: st.level ? st.level.g : 0 }, { g: n("sGoal", 0, 9), by: v("sGoalBy") || addDays(today(), 182), auto: false });
  if (v("sLevel") !== "" && st.level && Math.abs(+v("sLevel") - st.level.g) > 0.04) { const g = n("sLevel", 0, 9); st.level = Object.assign({}, st.level, { g, lo: Math.max(0, g - 0.3), hi: Math.min(9, g + 0.3), set: "teacher" }); }
  st.quizSize = n("cfgSize", 5, 30);
  await setDoc("students/" + T.sel, st); toast("Plan saved"); render();
}

/* ---------- teacher views ---------- */
function renderTeacher() {
  const stu = T.students.find(s => s._id === T.sel); const st = T.data && T.data.st;
  const head = `<header class="t-head"><div class="row between"><div class="stack" style="gap:2px"><span class="eyebrow" style="color:rgba(255,255,255,.75)">Teacher dashboard</span><h1>Vocaboo</h1></div>
    <div class="row"><button data-act="refresh">Refresh data</button><button data-act="reload">Reload app</button><button data-act="preview">Try as student</button><button data-act="signout">Sign out</button></div></div>
    ${T.students.length > 1 ? `<div class="row">${T.students.map(s => `<button data-act="selStudent" data-id="${s._id}" aria-pressed="${s._id === T.sel}">${esc(studentLabel(s))}</button>`).join("")}</div>` : ""}
    ${st ? `<div class="row"><span class="streak-chip" style="color:#FFC93C">${I.flame.replace("<svg", '<svg width="16" height="16"')}<span style="color:#fff">${esc(studentLabel(stu))} · ${st.streak && st.streak.last >= addDays(today(), -1) ? st.streak.count : 0}-day streak</span></span><span class="streak-chip">Lv ${levelOf(st.xp || 0)} · ${st.xp || 0} XP</span><span class="streak-chip">${Object.keys(st.badges || {}).length} badges</span><span class="streak-chip">quiz size ${st.quizSize}</span><span class="streak-chip">${st.push && st.push.tokens && st.push.tokens.length ? "🔔 reminders on" : "🔕 reminders off"}</span>${st.lock && st.lock.on ? `<span class="streak-chip" style="background:#FF6B5B">quiz locked · training needed</span>` : ""}</div>` : ""}
    <div class="row">${[["week", "Weekly report"], ["words", "Words"], ["placement", "Level"], ["settings", "Settings"]].map(([k, l]) => `<button data-act="ttab" data-tab="${k}" aria-pressed="${T.tab === k}">${l}</button>`).join("")}</div></header>`;
  if (!T.students.length || !T.data) {
    $app.innerHTML = head + `<div class="card">${buddy("happy", 72)}<h2>No student yet</h2><p>Create her login in Firebase (Authentication → Users → Add user). When she signs in on her iPhone, she'll appear here and start with the word check.</p><p class="muted">You can try everything first with "Try as student". That creates test data you can delete in Settings.</p></div>` + (T.tab === "settings" ? settingsHtml() : ""); return;
  }
  let body = !st ? `<div class="card">No data yet.</div>` : T.tab === "week" ? weekHtml() : T.tab === "words" ? wordsHtml() : T.tab === "placement" ? levelHtml() + placementHtml() : settingsHtml();
  $app.innerHTML = head + body;
}
function weekHtml() {
  const wk = T.week; const S = weekStats(wk); const st = T.data.st; const ks = weekOptions(); const ix = ks.indexOf(wk);
  const items = S.atts.filter(a => (a.kind !== "placement" && a.kind !== "level")).flatMap(a => a.items || []);
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
       <div class="stack" style="gap:6px">${["mc_ko", "hear_ko", "ctx_ko", "en_ko", "match", "mc_def", "ko_en", "def_en", "dict", "train", "say_en", "say", "saysent", "coach"].filter(t => S.byType[t]).map(t => `<div class="row between small"><span class="muted">${TYPE_NAME[t]}</span><span>${Math.round(S.byType[t].ok / S.byType[t].n * 100)}% · ${S.byType[t].ok}/${S.byType[t].n}${SPEAK.has(t) ? "" : ` · ${(S.byType[t].ms / S.byType[t].n / 1000).toFixed(1)}s`}</span></div>`).join("")}</div></div>
     <div class="card"><h3>Spelling near-misses</h3><p class="muted small">Typed answers 1–2 letters off. These are spelling problems, not meaning problems.</p><div class="chips">${S.near.slice(-24).map(i => `<span class="chip"><span class="mono">${esc(i.ans)}</span> → <b class="mono">${esc(BY[i.id].w)}</b></span>`).join("") || `<span class="muted">None yet.</span>`}</div></div>
   </div>
   <div class="card"><h3>Most-missed words</h3><div class="tbl-wrap"><table><thead><tr><th>Word</th><th>Wrong</th><th>Missed in</th><th>Her answers</th></tr></thead><tbody>${trouble.map(([id, b]) => `<tr><td><b>${esc(BY[id].w)}</b><br><span class="muted">${esc(BY[id].ko)}</span></td><td>${b.n - b.ok} / ${b.n}</td><td>${Object.keys(b.types).map(t => `<span class="pill ${t === "dict" ? "sun" : ""}">${esc(TYPE_NAME[t].split(" (")[0])}</span>`).join(" ")}</td><td class="mono">${b.wrong.slice(-4).map(esc).join(", ") || "–"}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">No misses this week.</td></tr>`}</tbody></table></div></div>
   <div class="grid">
     <div class="card"><h3>Hard to say</h3><p class="muted small">What the app heard when she didn't say it right. "Skipped" = gave up after 4 tries.</p><div class="tbl-wrap"><table><tbody>${Object.entries(S.sayBad).sort((a, b) => b[1].n - a[1].n).slice(0, 15).map(([id, b]) => `<tr><td><b>${esc(BY[id].w)}</b></td><td>${b.n}${b.skip ? ` <span class="pill bad">${b.skip} skipped</span>` : ""}</td><td class="muted">${b.heard.slice(-3).map(esc).join(" · ") || "–"}</td></tr>`).join("") || `<tr><td class="muted">No speaking problems this week.</td></tr>`}</tbody></table></div></div>
     <div class="card"><h3>Not mastered yet</h3><div class="chips">${notMastered.map(id => `<span class="chip">${esc(BY[id].w)}</span>`).join("") || `<span class="muted">All mastered.</span>`}</div></div>
   </div>
   <div class="grid"><div class="card"><h3>XP & badges</h3><div class="row"><span class="pill sun">${S.xpWeek} XP this week</span><span class="pill">Level ${levelOf(st.xp || 0)}</span></div>${badgeGrid(st)}</div>
   <div class="card"><h3>Weekly story</h3>${S.stories.length ? S.stories.map(a => `<p><b>${esc(a.title || "Story")}</b> · ${Math.round((a.score || 0) * (a.n || 5))}/${a.n || 5} questions right · ${new Date(a.start).toLocaleDateString()}</p>${(a.reading || []).length ? `<p class="muted small">Read aloud: ${a.reading.map(x => "Part " + (x.p + 1) + " " + x.pct + "% (" + x.wpm + " wpm)").join(", ")}</p>${a.reading.filter(x => x.missed && x.missed.length).map(x => `<p class="small">Part ${x.p + 1} missed: <span class="mono">${esc(x.missed.join(", "))}</span></p>`).join("")}` : ""}${(a.dictation || []).length ? `<p class="muted small">Dictation: ${a.dictation.map(x => x.pct + "%").join(", ")}</p>${a.dictation.filter(x => x.pct < 90).map(x => `<p class="small"><span class="muted">${esc(x.text)}</span><br>→ <span class="mono">${esc(x.ans)}</span></p>`).join("")}` : ""}`).join("") : `<p class="muted">Not read yet this week.</p>`}</div></div>
   <div class="card"><h3>How she rated words in training</h3><p class="muted small">Her own feeling after each word: 😟 needs more study, 😐 so-so, 😊 got it. Latest rating shown.</p><div class="chips">${Object.entries(S.ratings).sort((x, y) => ({ bad: 0, mid: 1, good: 2 }[x[1]] - { bad: 0, mid: 1, good: 2 }[y[1]])).map(([id, r]) => `<span class="chip">${{ bad: "😟", mid: "😐", good: "😊" }[r]} ${esc(BY[id].w)}</span>`).join("") || `<span class="muted">No ratings yet.</span>`}</div></div>
   <div class="card"><h3>Her own sentences (AI coach)</h3><div class="tbl-wrap"><table><thead><tr><th>Word</th><th>She said</th><th>Corrected</th><th>Feedback</th></tr></thead><tbody>${S.coach.map(i => `<tr><td><b>${esc(BY[i.id].w)}</b></td><td>${i.ok ? '<span class="pill good">✓</span> ' : ""}${esc(i.ans)}</td><td>${i.ok ? '<span class="muted">–</span>' : esc(i.fixed || "")}</td><td class="muted small">${esc(i.why || "")}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">No sentences this week.</td></tr>`}</tbody></table></div></div>
   <div class="card"><h3>Sessions</h3><div class="tbl-wrap"><table><thead><tr><th>Day</th><th>Time</th><th>Active</th><th>What she did</th></tr></thead><tbody>${S.sess.slice().sort((a, b) => a.start - b.start).map(s => { const dt = new Date(s.start); return `<tr><td>${DOW[dt.getDay()]} ${dt.getMonth() + 1}/${dt.getDate()}</td><td>${timeOf(s.start)}–${timeOf(s.last)}</td><td>${fmtMin(actSec(s))} min</td><td class="muted">${esc((s.did || []).join(", ") || "opened only")}</td></tr>`; }).join("") || `<tr><td colspan="4" class="muted">No sessions this week.</td></tr>`}</tbody></table></div></div>`;
}
function wordsHtml() {
  const st = T.data.st; const W = T.data.words; if (!st.week) return `<div class="card">The first week starts after her word check.</div>`;
  const row = id => { const e = BY[id], w = W[id]; return `<tr><td><b>${esc(e.w)}</b><br><span class="muted">${esc(e.ko)}</span></td><td>${w ? `${w.right}✓ ${w.wrong}✗` : "not seen"}</td><td>${w ? (w.box >= MASTER_BOX ? '<span class="pill good">mastered</span>' : `<span class="pill ${w.box ? "" : "bad"}">level ${w.box}/${MASTER_BOX}</span>`) : "–"}</td><td><button class="ghost" data-act="rmWord" data-id="${id}">Remove</button></td></tr>`; };
  const sim = clone(st); buildWeek(sim, W, effCfg(st), true); const next = sim.week.newIds.map(id => BY[id].w + (BY[id].book === "G" ? "" : "*")); const c = effCfg(st);
  return `<p class="muted">Week of ${wkLabel(st.week.key)}. ${c.textbook ? `${c.tbNew} new textbook words (book order from Unit ${c.startUnit}) + ` : ""}${c.grNew} new words from the graded list${st.level ? ` (just above ${gradeWord(st.level.g)})` : ""}, plus ${c.reviewPerWeek} review words. Change this in Settings.</p>
   <div class="card"><div class="row" style="align-items:flex-end"><div class="field" style="flex:1;min-width:200px"><label for="addWord">Add a word to this week</label><input id="addWord" type="text" list="bankList" placeholder="Type a word from the books" autocomplete="off" autocapitalize="off"><datalist id="bankList">${BANK.map(e => `<option value="${esc(e.w)}">`).join("")}</datalist></div><button class="primary" data-act="addWord">Add</button><button data-act="release">Start next week now</button></div></div>
   <div class="grid"><div class="card"><h3>New (${st.week.newIds.length})</h3><div class="tbl-wrap"><table><tbody>${st.week.newIds.map(row).join("")}</tbody></table></div></div>
   <div class="card"><h3>Review (${st.week.reviewIds.length})</h3><div class="tbl-wrap"><table><tbody>${st.week.reviewIds.map(row).join("")}</tbody></table></div></div></div>
   <div class="card"><h3>Coming next week</h3><div class="chips">${next.map(w => `<span class="chip">${esc(w)}</span>`).join("")}</div>${c.textbook ? `<p class="muted small">* = textbook word</p>` : ""}<p class="muted small">Word-check words still waiting for review: ${(st.reviewPool || []).length}</p></div>`;
}
function placementHtml() {
  const p = T.data.st.placement; if (!p || !p.done || !p.byBook) return "";
  const b = p.byBook; const pl = T.data.atts.find(a => a.kind === "placement" && !a.simulated) || T.data.atts.find(a => a.kind === "placement"); const pc = x => x[1] ? Math.round(x[0] / x[1] * 100) : 0;
  const missed = (p.missed || []).map(id => `<span class="chip">${esc(BY[id].w)} <span class="muted">${esc(BY[id].src.join(","))}</span></span>`).join("");
  return `<h2 style="margin-top:10px">Textbook word check</h2><div class="grid"><div class="card" style="align-items:center">${ring(p.score, "#5B3FD9", 150, `<text x="50%" y="56%" text-anchor="middle" font-size="32" font-weight="900" fill="#1E1638" font-family="Nunito, Noto Sans KR, sans-serif">${p.score}%</text>`)}<p class="muted">Overall · ${new Date(p.at).toLocaleDateString()}</p></div>
    <div class="card"><h3>By book</h3>${[["Book 1 (first book)", b.A, "#FFC93C"], ["Book 2", b.B, "#3F82F2"], [`Current book, Units 1–${CFG.startUnit - 1}`, b.C, "#5B3FD9"]].map(([l, x, c]) => `<div class="stack" style="gap:5px"><div class="row between"><b>${l}</b><span class="muted">${x[0]}/${x[1]}</span></div><div class="hbar"><i style="width:${pc(x)}%;background:${c}"></i></div></div>`).join("")}
    ${pl ? `<h3>By question type</h3>${skillRows(pl.items)}` : ""}</div></div>
    <div class="card"><h3>Missed in the word check</h3><p class="muted small">A = first book, B = second book, C = current book.</p><div class="chips">${missed || "None"}</div></div>`;
}
function levelHtml() {
  const st = T.data.st; const L = st.level;
  const prof = st.profile ? `<p class="muted">${esc(st.profile.name)} · age ${st.profile.age} · ${SET(st).lang === "en" ? "English only" : "English + Korean"}</p>` : `<p class="muted">She hasn't filled in her name and age yet.</p>`;
  if (!L) return `<div class="card"><h2>Word level</h2>${prof}<p>She hasn't taken the level test yet. It opens the next time she signs in.</p></div>`;
  const att = T.data.atts.find(a => a.id === L.att) || T.data.atts.filter(a => a.kind === "level" && a.end).sort((a, b) => b.start - a.start)[0];
  const H = st.levelHist || [];
  const rows = att ? att.items.map(i => `<tr><td><b>${esc(BY[i.id] ? BY[i.id].w : i.id)}</b></td><td>${gradeLabel(i.g != null ? i.g : BY[i.id] && BY[i.id].g)}</td><td>${i.ok ? '<span class="pill good">✓</span>' : i.ans === "(I don't know)" ? '<span class="pill">I don\'t know</span>' : '<span class="pill bad">✗</span>'}</td><td class="muted small">${i.ok ? "" : esc(i.ans)}</td></tr>`).join("") : "";
  return `<div class="grid"><div class="card"><h2>Word level</h2>${prof}
      <div class="row" style="gap:14px;align-items:flex-end"><b style="font-size:44px;line-height:1">${esc(gradeWord(L.g))}</b><span class="muted">range ${gradeLabel(L.lo)}–${gradeLabel(L.hi)}</span></div>
      <p>About <b>${L.vocab.toLocaleString()}</b> of ${L.of.toLocaleString()} core K–8 words known. ${L.n} words tested on ${new Date(L.at).toLocaleDateString()}.</p>
      ${st.goal ? `<p>Goal: <b>${gradeWord(st.goal.g)}</b> by ${st.goal.by}</p>` : ""}
      <p class="muted small">"Grade 3.4" means she knows words about as well as a typical US student in grade 3.4. It's an estimate from an adaptive test (word lists graded with research data on when US children learn each word), not an official Lexile score.</p>
      <div class="row"><button data-act="retakeLevel">${st.levelRetake ? "Retake requested ✓" : "Ask her to retake the test"}</button></div></div>
    <div class="card"><h3>Level over time</h3>${H.length ? `<div class="tbl-wrap"><table><tbody>${H.slice().reverse().map(h => `<tr><td>${new Date(h.at).toLocaleDateString()}</td><td><b>${gradeWord(h.g)}</b></td><td class="muted">${gradeLabel(h.lo)}–${gradeLabel(h.hi)}</td><td class="muted">${h.vocab || ""} words</td></tr>`).join("")}</tbody></table></div>` : ""}</div></div>
    ${rows ? `<div class="card"><h3>Last test, word by word</h3><p class="muted small">Words got harder after right answers and easier after misses.</p><div class="tbl-wrap"><table><thead><tr><th>Word</th><th>Grade</th><th>Result</th><th>She picked</th></tr></thead><tbody>${rows}</tbody></table></div></div>` : ""}`;
}
function stuSettingsHtml() {
  const st = T.data && T.data.st; if (!st) return ""; const s = SET(st); const nm = studentLabel(T.students.find(x => x._id === T.sel));
  return `<div class="card"><h2>${esc(nm)}: study plan</h2>
  <div class="grid2">
   <div class="field"><label for="sLang">Word meanings</label><select id="sLang"><option value="ko" ${s.lang !== "en" ? "selected" : ""}>English + Korean</option><option value="en" ${s.lang === "en" ? "selected" : ""}>English only</option></select></div>
   <div class="field"><label for="sTb">Textbook words</label><select id="sTb"><option value="1" ${s.textbook ? "selected" : ""}>On</option><option value="0" ${s.textbook ? "" : "selected"}>Off (graded list only)</option></select></div>
   <div class="field"><label for="sTbNew">New textbook words per week</label><input id="sTbNew" type="number" min="0" max="40" value="${s.tbNew}"></div>
   <div class="field"><label for="sStart">Textbook starts at unit</label><input id="sStart" type="number" min="1" max="30" value="${s.startUnit || CFG.startUnit}"></div>
   <div class="field"><label for="sGrNew">New graded-list words per week</label><input id="sGrNew" type="number" min="0" max="40" value="${s.grNew}"></div>
   <div class="field"><label for="sRev">Review words per week</label><input id="sRev" type="number" min="0" max="30" value="${s.review}"></div>
   <div class="field"><label for="sGoal">Goal level (grade, 0 = K)</label><input id="sGoal" type="number" min="0" max="9" step="0.1" value="${st.goal ? st.goal.g : ""}"></div>
   <div class="field"><label for="sGoalBy">Goal date</label><input id="sGoalBy" type="date" value="${st.goal ? st.goal.by : ""}"></div>
   <div class="field"><label for="sLevel">Word level (change only to correct it)</label><input id="sLevel" type="number" min="0" max="9" step="0.1" value="${st.level ? st.level.g : ""}"></div>
   <div class="field"><label for="cfgSize">Daily quiz size</label><input id="cfgSize" type="number" min="5" max="30" value="${st.quizSize}"></div>
  </div>
  <p class="muted small">Graded-list words start just above her level and move up as she learns them. Changes apply from next week's words (or tap "Start next week now" on the Words tab).</p>
  <div class="row"><button class="primary" data-act="saveStu">Save ${esc(nm)}'s plan</button></div></div>`;
}
function settingsHtml() {
  return stuSettingsHtml() + `<div class="card"><h2>Settings for everyone</h2>
  <div class="grid2">
   <input id="cfgStart" type="hidden" value="${CFG.startUnit}"><input id="cfgNew" type="hidden" value="${CFG.newPerWeek}"><input id="cfgRev" type="hidden" value="${CFG.reviewPerWeek}">
   <div class="field"><label for="cfgPass">Pass mark for the daily quiz (%)</label><input id="cfgPass" type="number" min="50" max="100" value="${CFG.passPct}"></div>
   <div class="field"><label for="cfgSpeak">Speaking practice in training</label><select id="cfgSpeak"><option value="1" ${CFG.speak !== false ? "selected" : ""}>Required</option><option value="0" ${CFG.speak !== false ? "" : "selected"}>Off</option></select></div>
   <div class="field"><label for="cfgHints">Typing hints (first letter and length)</label><select id="cfgHints"><option value="1" ${CFG.hints ? "selected" : ""}>On</option><option value="0" ${CFG.hints ? "" : "selected"}>Off</option></select></div>
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
  if (a === "menu") return openMenu();
  if (a === "menuClose") return closeMenu();
  if (a === "menuHome") { closeMenu(); leaveActivity(); TAB = "today"; view = { name: studentHome() }; window.scrollTo(0, 0); return render(); }
  if (a === "menuMe") { closeMenu(); leaveActivity(); TAB = "me"; view = { name: studentHome() }; window.scrollTo(0, 0); return render(); }
  if (a === "menuPush") { closeMenu(); return turnOnPush(); }
  if (a === "menuSignout") { if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again to sign out"; return; } closeMenu(); leaveActivity(); await WW.signOut(); return location.reload(); }
  if (a === "pushAskYes") { closePushAsk(); return turnOnPush(); }
  if (a === "pushAskNo") return closePushAsk();
  if (a === "obLang") { ST._lang = b.dataset.v; document.querySelectorAll('[data-act="obLang"]').forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false")); return; }
  if (a === "setLang") { ST.settings = Object.assign({}, ST.settings || {}, { lang: b.dataset.v }); saveST(); return render(); }
  if (a === "startLevel") return startLevelTest(false);
  if (a === "skipLevel" && IS_OWNER) return startLevelTest(true);
  if (a === "ltPick") return levelAnswer(b.dataset.id);
  if (a === "ltIdk") return levelAnswer(null);
  if (a === "levelDone") { TAB = "today"; view = { name: studentHome() }; window.scrollTo(0, 0); return render(); }
  if (a === "levelAgain") { ST.levelRetake = true; view = { name: "levelIntro" }; return render(); }
  if (a === "signout") { await WW.signOut(); return location.reload(); }
  if (a === "tabgo") { TAB = b.dataset.tab; if (TAB === "progress") PROG = null; view = { name: "tabs" }; window.scrollTo(0, 0); render(); if (TAB !== "today") maybeTour(TAB === "progress" ? "progress" : TAB); return; }
  if (a === "home") { TAB = "today"; view = { name: "tabs" }; window.scrollTo(0, 0); return render(); }
  if (a === "range") { PROG_RANGE = b.dataset.r; return render(); }
  if (a === "openWord") { view = { name: "wordCard", id: b.dataset.id, back: TAB }; render(); await loadPacksFor([b.dataset.id]); speak(b.dataset.id, "w"); return; }
  if (a === "closeWord") { view = { name: "tabs" }; return render(); }
  if (a === "startPlacement") return startRun("placement");
  if (a === "skipPlacement" && IS_OWNER) { const qs = buildPlacement(); startAttempt("placement", { n: qs.length, simulated: true }); logDid("placement (sample answers)");
    qs.forEach(q => { const ok = Math.random() < 0.7; ATT.items.push({ id: q.id, t: q.t, ok, ans: ok ? BY[q.id].w : "", ms: 4000 }); });
    RUN = { kind: "placement", qs, right: ATT.items.filter(i => i.ok).length }; return finishRun(); }
  if (a === "quiz") { if (!IS_OWNER && ((ST.lock && ST.lock.on) || (ST.week && !ST.week.introDone))) return; return startRun("quiz"); }
  if (a === "train") return startTraining();
  if (a === "trainWeak") { const ids = shuffle(weekIds().filter(id => !isMastered(id))).slice(0, 8); return startTraining(ids.length ? ids : null, "weak"); }
  if (a === "trainOne") return startTraining([b.dataset.id], "free");
  if (a === "pick") return answer(null, b.dataset.id);
  if (a === "mL" || a === "mR") return matchTap(a === "mL" ? "L" : "R", b.dataset.id);
  if (a === "qmic") return quizListen();
  if (a === "sayGiveUp") { if (!RUN.answered) { RUN.answered = true; RUN.ok = false; record(RUN.qs[RUN.i].id, "say_en", false, "(no mic)", 0); } RUN.fixTries = 3; return render(); }
  if (a === "coach") { if (!IS_OWNER && ST.week && !ST.week.introDone) return; return startCoach(); }
  if (a === "coachMic") return coachListen();
  if (a === "coachCheck") return coachCheck();
  if (a === "coachRetry") { CO.res = null; CO.text = ""; CO.sayOk = false; CO.sayTries = 0; CO.sayHeard = ""; return render(); }
  if (a === "coachRedo") return coachRedo();
  if (a === "coachSay") return coachSay();
  if (a === "coachSaySkip") { ATT.items.push({ id: CO.ids[CO.i], t: "saysent", ok: false, ans: "(skipped)", ms: 0 }); saveAttempt(); CO.sayOk = true; CO.sayHeard = "Skipped. Your teacher will help with this one."; return render(); }
  if (a === "coachNext") return coachNext();
  if (a === "celOk") return celOk();
  if (a === "pushOn") return turnOnPush(b);
  if (a === "story") { if (!IS_OWNER && ST.week && !ST.week.introDone) return; return openStory(); }
  if (a === "sword") { const e = BY[b.dataset.id]; speak(e.id, "w"); toast(e.w + ": " + e.def + (KO() && STORY && STORY.step === "after" ? " (" + senseList(e).map(s => s.ko).join(" / ") + ")" : "")); return; }
  if (a === "readPara") return readPara(+b.dataset.i);
  if (a === "toggleKo") { STORY.showKo[b.dataset.i] = !STORY.showKo[b.dataset.i]; return render(); }
  if (a === "storyQs") { stopAudio(); STORY.step = "q"; window.scrollTo(0, 0); return render(); }
  if (a === "storyBack") { STORY.step = "read"; return render(); }
  if (a === "storyPick") return storyPick(+b.dataset.k);
  if (a === "storyNextQ") return storyNextQ();
  if (a === "storyNextPart") return storyNextPart();
  if (a === "dictYes") return storyStartDict();
  if (a === "readYes") return startReadAloud();
  if (a === "readMic") return readListen();
  if (a === "readStop") return readFinish();
  if (a === "readAgain") { const R = STORY.read; try { R.rec && R.rec.abort(); } catch (e) {} return startReadAloud(); }
  if (a === "readHear") return readPara(STORY.part);
  if (a === "readDone" || a === "readSkip") { const R = STORY.read; if (R) { R.listening = false; try { R.rec && R.rec.abort(); } catch (e) {} } STORY.read = null; return storyAdvance(); }
  if (a === "dictNo") { STORY.dictAsk = false; return storyAdvance(); }
  if (a === "dictPlay") return playDict(1);
  if (a === "dictSlow") return playDict(0.75);
  if (a === "dictNext") return dictNext();
  if (a === "dictSkip") { stopAudio(); STORY.dict = null; return storyAdvance(); }
  if (a === "tour") return startTour();
  if (a === "tourNext") { TI++; if (TI >= TSTEPS.length) return tourEnd(); return drawTour(); }
  if (a === "tourBack") { TI = Math.max(0, TI - 1); return drawTour(); }
  if (a === "tourEnd") return tourEnd();
  if (a === "idk") return answer("");
  if (a === "next") return next();
  if (a === "toSpeak") return startSpeak();
  if (a === "mic") return listen();
  if (a === "spSkip") return spSkip();
  if (a === "cover") { stopAudio(); TR.step = "write"; TR.t0 = Date.now(); return render(); }
  if (a === "trainNext") return trainNext();
  if (a === "rate") return trainNext(b.dataset.r);
  if (a === "quit") { leaveActivity(); view = { name: studentHome() }; return render(); }
  // teacher
  if (a === "toTeacher") { mode = "teacher"; clearInterval(hbTimer); SESSION = null; await loadTeacher(); return; }
  if (a === "preview") return enterPreview();
  if (a === "refresh") { await loadTeacher(); toast("Updated"); return; }
  if (a === "ttab") { T.tab = b.dataset.tab; return render(); }
  if (a === "wkPrev" || a === "wkNext") { const ks = weekOptions(); const i = ks.indexOf(T.week) + (a === "wkPrev" ? 1 : -1); if (ks[i]) T.week = ks[i]; return render(); }
  if (a === "selStudent") { T.sel = b.dataset.id; T.week = null; await loadStudentData(T.sel); return render(); }
  if (a === "copyReport") { const txt = reportText(); try { await navigator.clipboard.writeText(txt); toast("Report copied. Paste it to Claude to make the test"); } catch (e) { showReportText(txt); } return; }
  if (a === "saveCfg") return saveCfg();
  if (a === "saveStu") return saveStu();
  if (a === "retakeLevel") { const st = T.data.st; st.levelRetake = true; await setDoc("students/" + T.sel, st); toast("She'll get the level test next time she opens the app"); return render(); }
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
  if (f === "onboard") { saveOnboard(); return; }
  if (f === "dict") { dictCheck(); return; }
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
  if (readyForWeeks()) {
    const atts = ST.sizeCheckedFor === addDays(weekKey(), -7) ? [] : await getAll(sPath() + "/attempts");
    const changed = buildWeek(ST, WORDS, effCfg(ST), false); growQuiz(ST, atts);
    if (changed || atts.length) await saveST();
    loadPacksFor(weekIds());
  }
  trackStudent(); PROG = null;
  view = { name: studentHome() }; render();
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
