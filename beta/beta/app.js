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
let WK_ANCHOR = null; // a student's own week start (the day they began); null = weeks start Saturday 12:00 (after class)
function weekKey(at) {
  const d = at ? new Date(at) : new Date();
  if (WK_ANCHOR) { const n = Math.floor((new Date(dstr(d) + "T12:00:00") - new Date(WK_ANCHOR + "T12:00:00")) / 864e5); return addDays(WK_ANCHOR, 7 * Math.floor(n / 7)); }
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
function say(text, rate) { if (!("speechSynthesis" in window)) { toast(/android/i.test(navigator.userAgent) ? "No recording for this yet, and this browser can't read aloud. Open Vocaboo in Chrome." : "No recording for this yet, and this browser can't read aloud. Open Vocaboo in Safari."); return; }
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
  if (st === ST && !st.week && !st.weekAnchor && !cfg.textbook) { st.weekAnchor = today(); WK_ANCHOR = st.weekAnchor; } // week 1 starts the day they start
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
  if (prev) { st.history = (st.history || []).concat([{ key: prev.key, newIds: prev.newIds, reviewIds: prev.reviewIds, learned: prev.introDone ? prev.newIds.length : (prev.trained || []).length }]).slice(-40); }
  st.week = { key, newIds, reviewIds: rev, introDone: false, trained: [], created: Date.now() };
  if (st._hard) { st.week.hard = st._hard; delete st._hard; }
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
  if (ATT.kind === "quiz" || ATT.kind === "spaced") { if (ok) w.box = Math.min(6, w.box + 1); else w.box = 0; w.due = addDays(today(), INTERVALS[w.box]); }
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
}const AUDIO_BASE = window.__audioBase || "audio/"; // beta copies point at the main app's audio folder

/* ---------- recorded audio ---------- */
const PACKS = {}, PACK_LOADING = {};
const packOf = id => BY[id] ? BY[id].src[0] : null;
function loadPack(name) {
  if (!name) return Promise.resolve();
  if (PACKS[name]) return Promise.resolve(PACKS[name]);
  if (!PACK_LOADING[name]) PACK_LOADING[name] = fetch(AUDIO_BASE + name + ".json").then(r => r.ok ? r.json() : {}).catch(() => ({})).then(j => (PACKS[name] = j));
  return PACK_LOADING[name];
}
const loadPacksFor = ids => Promise.all([...new Set(ids.map(packOf))].map(loadPack));
const player = new Audio(); player.preload = "auto";
let unlocked = false;
document.addEventListener("pointerdown", () => { if (unlocked) return; unlocked = true;
  try { player.src = "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//OEwAAAAAAAAAAAAEluZm8AAAAPAAAABQAAAqAAbW1tbW1tbW1tbW1tbW1tbW1tbZKSkpKSkpKSkpKSkpKSkpKSkpKStra2tra2tra2tra2tra2tra2trbb29vb29vb29vb29vb29vb29vb2///////////////////////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQEUAAAAAAAAAKgvT9A1gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//NExAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMu//NExFMAAANIAAAAADEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMu//NExKYAAANIAAAAADEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NExKwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NExKwAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV"; player.play().catch(() => {}); } catch (e) {} }, { capture: true });
function clipFor(id, tag) { let p = PACKS[packOf(id)]; if (!(p && p[id] && p[id][tag]) && PACKS.TEST && PACKS.TEST[id]) p = PACKS.TEST; return p && p[id] && p[id][tag] ? "data:audio/mpeg;base64," + p[id][tag] : null; }
let speakTok = 0;
function playSrc(src, rate, fallback) { try { player.pause(); player.src = src; player.playbackRate = rate || 1; try { player.preservesPitch = true; player.webkitPreservesPitch = true; } catch (x) {} const p = player.play(); if (p) p.catch(fallback); return true; } catch (err) { return false; } }
async function speak(id, tag) {
  const e = BY[id]; if (!e) return; const my = ++speakTok;
  const text = tag === "w" || tag === "s" || tag[0] === "y" ? e.w : e.ex[+tag.slice(1)];
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  const pick = () => { if (tag === "s") { const w = clipFor(id, "w"); return w ? [w, 0.7] : null; } // slow = the recorded word, slowed down
    const c = clipFor(id, tag); if (c) return [c, 1]; if (tag[0] === "y") { const w = clipFor(id, "w"); return w ? [w, 0.7] : null; } return null; };
  let got = pick();
  if (!got && view.name !== "level") { // recording may still be downloading: wait for it briefly
    await Promise.race([loadPack(packOf(id)), new Promise(r => setTimeout(r, 3500))]); if (my !== speakTok) return; got = pick(); }
  const rate = tag === "s" || tag[0] === "y" ? 0.55 : 0.9;
  if (got && playSrc(got[0], got[1], () => say(text, rate))) return;
  say(text, rate);
}
function stopAudio() { try { if (typeof STORY !== "undefined" && STORY) { STORY.playing = null; STORY.paused = false; } } catch (e) {} try { player.pause(); } catch (e) {} if ("speechSynthesis" in window) speechSynthesis.cancel(); }
const spk = (id, tag, label, cls) => `<button class="${cls || "round"} ${label ? "icon-l" : ""}" data-act="speak" data-id="${id}" data-tag="${tag}" aria-label="${label || "Listen"}">${ICON_SPK}${label ? " " + label : ""}</button>`;

/* ---------- my voice: record while the phone listens, so the child can replay and compare ---------- */
const MYV = { rec: null, chunks: [], stream: null, last: {}, ok: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder), saved: null };
function voiceStart() { if (!MYV.ok || (ST && ST.settings && ST.settings.record === false)) return Promise.resolve(false);
  return navigator.mediaDevices.getUserMedia({ audio: true }).then(st => { try { MYV.stream = st; MYV.rec = new MediaRecorder(st); MYV.chunks = []; MYV.rec.ondataavailable = e => { if (e.data && e.data.size) MYV.chunks.push(e.data); }; MYV.rec.start(); return true; } catch (e) { voiceCleanup(); return false; } }).catch(() => false); }
function voiceCleanup() { try { MYV.stream && MYV.stream.getTracks().forEach(t => t.stop()); } catch (e) {} MYV.stream = null; MYV.rec = null; }
function voiceStop(key) { return new Promise(res => { const r = MYV.rec; if (!r || r.state === "inactive") { voiceCleanup(); return res(null); }
  r.onstop = () => { const blob = new Blob(MYV.chunks, { type: r.mimeType || "audio/webm" }); voiceCleanup(); if (blob.size < 1500) return res(null);
    const v = { blob, url: URL.createObjectURL(blob), at: Date.now() }; MYV.last[key] = v; res(v); };
  try { r.stop(); } catch (e) { voiceCleanup(); res(null); } }); }
function voicePlay(key) { const v = MYV.last[key]; if (!v) return; stopAudio(); const a = new Audio(v.url); a.play().catch(() => {}); }
const voiceHas = key => !!MYV.last[key];
/* keep one "best sentence" per child on this phone only (never uploaded) */
function idb() { return new Promise((res, rej) => { try { const q = indexedDB.open("vocaboo-voice", 1); q.onupgradeneeded = () => q.result.createObjectStore("v"); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); } catch (e) { rej(e); } }); }
async function voiceSaveBest(key, text) { const v = MYV.last[key]; if (!v || !SID) return; try { const d = await idb(); const tx = d.transaction("v", "readwrite"); tx.objectStore("v").put({ blob: v.blob, text, at: Date.now(), day: today() }, "best:" + SID); MYV.saved = { url: v.url, text, day: today() }; } catch (e) {} }
async function voiceLoadBest() { if (!SID) return; try { const d = await idb(); const tx = d.transaction("v", "readonly"); const q = tx.objectStore("v").get("best:" + SID); q.onsuccess = () => { const r = q.result; MYV.saved = r ? { url: URL.createObjectURL(r.blob), text: r.text, day: r.day } : null; if (view.name === "tabs" && TAB === "today") render(); }; } catch (e) {} }
function lastVoiceCard() { const v = MYV.saved; if (!v || !v.text) return "";
  const when = v.day === today() ? "TODAY" : v.day === addDays(today(), -1) ? "YESTERDAY" : "EARLIER";
  return `<div class="card" style="background:var(--soft);border-color:transparent;flex-direction:row;align-items:center;gap:12px"><button class="play-sm" data-act="playBest" aria-label="Play my sentence" style="width:44px;height:44px;min-width:44px;min-height:44px;background:var(--ink);color:#fff">${I.play.replace("<svg", '<svg width="16" height="16"')}</button><div style="min-width:0"><div class="eyebrow" style="font-size:11px">${when}, IN YOUR MYV</div><div style="font-size:15px">“${esc(v.text)}”</div></div></div>`; }

/* ---------- icons & art ---------- */
const I = {
  coachI: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M4 5h16v11H8l-4 4z"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
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
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="m15 5-7 7 7 7"/></svg>'
};
/* Bubbo: the speech-bubble mascot. moods: happy | wow (listening) | think | cheer | sad */
function buddy(mood, size) { return bubbo(mood, size); }
let BB_N = 0;
/* Bubbo: one soft body with flipper arms, feet, a notebook and a pencil. Moods are CSS classes on the svg (m-happy/cheer/wow/think/sad/sleep);
   moves are CSS classes too (act-wake, act-run, act-land, act-nod, act-cheer, act-wave, act-shake, hold, writing). */
function bubbo(mood, size, fill, cls) {
  const s = size || 96; const m = mood || "happy"; const k = "bb" + (++BB_N); const body = fill || "#FFE24A"; const flip = fill ? "#F1EBD2" : "#F5C21A";
  const eye = (cx, side) => `<g><clipPath id="${k}${side}"><ellipse cx="${cx}" cy="104" rx="19" ry="23"/></clipPath><ellipse cx="${cx}" cy="104" rx="19" ry="23" fill="#FFFFFF"/>
    <g clip-path="url(#${k}${side})"><g class="pupils"><ellipse cx="${cx + 3}" cy="108" rx="9.5" ry="12" fill="#16141D"/><circle cx="${cx - 1}" cy="100" r="3.5" fill="#FFFFFF"/></g>
      <rect class="lid" x="${cx - 22}" y="78" width="44" height="52" fill="${body}"/><path class="hlid" d="M${cx - 22} 104q22 -26 44 0v30h-44z" fill="${body}"/></g></g>`;
  const fl = (x, c, dir, extra) => `<g class="fl ${c}"><path d="M${x} 116c${dir * 18} 4 ${dir * 26} 30 ${dir * 14} 54c${dir * -6} 12 ${dir * -20} 10 ${dir * -22} -6c${dir * -2} -20 ${dir * 2} -38 ${dir * 8} -48z" fill="${flip}"/>${extra || ""}</g>`;
  const pen = `<g class="pen"><rect x="170" y="134" width="9" height="40" rx="2" fill="#FFC93C"/><rect x="170" y="134" width="9" height="7" rx="2" fill="#FF8FB0"/><path d="M170 174h9l-4.5 9z" fill="#F0C9A0"/><path d="M172.5 179h4l-2 4z" fill="#16141D"/></g>`;
  const nb = `<g class="nb"><rect x="54" y="138" width="86" height="64" rx="7" fill="#FFFDF5" stroke="#E0D9C8" stroke-width="2"/><path d="M64 138v64" stroke="#E7DFC9" stroke-width="2"/>${[0, 1, 2, 3].map(i => `<circle cx="64" cy="${148 + i * 14}" r="2.5" fill="#B9B0A0"/>`).join("")}
    <path class="scrib" d="M72 154c10-5 18 7 28 1s14-6 26 0" stroke="#16141D" stroke-width="3.5" fill="none" stroke-linecap="round"/><path class="scrib" d="M72 170c8 6 18-5 28 2s14-4 26 0" stroke="#16141D" stroke-width="3.5" fill="none" stroke-linecap="round" style="animation-delay:.25s"/><path class="scrib" d="M72 186h40" stroke="#16141D" stroke-width="3.5" fill="none" stroke-linecap="round" style="animation-delay:.45s"/></g>`;
  const mouth = m === "wow" ? `<ellipse cx="100" cy="138" rx="7" ry="9" fill="#16141D"/>` : m === "sad" ? `<path d="M88 142q12-11 24 0" stroke="#16141D" stroke-width="5" fill="none" stroke-linecap="round"/>`
    : m === "think" ? `<path d="M90 138h20" stroke="#16141D" stroke-width="5" stroke-linecap="round"/>` : `<path d="M88 136q12 12 24 0" stroke="#16141D" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  return `<svg class="bubbo m-${m}${cls ? " " + cls : ""}" width="${s}" height="${Math.round(s * 1.2)}" viewBox="0 0 200 240" aria-hidden="true">
    <ellipse class="shadow" cx="100" cy="212" rx="54" ry="7" fill="#16141D" opacity=".1"/><g class="puff"><circle cx="34" cy="206" r="10" fill="#D9D4EA"/><circle cx="166" cy="206" r="10" fill="#D9D4EA"/></g>
    <ellipse class="foot foot-l" cx="78" cy="204" rx="17" ry="9" fill="#16141D"/><ellipse class="foot foot-r" cx="122" cy="204" rx="17" ry="9" fill="#16141D"/>
    <g class="body"><path d="M62 40h76a32 32 0 0 1 32 32v66a32 32 0 0 1-32 32H86c-10 2-24 12-44 20 8-8 10-14 10-22-12-4-22-12-22-22V72a32 32 0 0 1 32-32z" fill="${body}"/>
      <path d="M100 130c24 0 40 10 40 22 0 10-16 16-40 16s-40-6-40-16c0-12 16-22 40-22z" fill="${fill ? "#FFFFFF" : "#FFF0A0"}" opacity=".9"/>
      ${fl(40, "fl-l", -1)}${nb}${fl(160, "fl-r", 1, pen)}<g class="face">${eye(76, "l")}${eye(124, "r")}${mouth}</g></g></svg>`;
}
function bubboClip(mood, size) { return bubbo(mood, size, null, "hold"); }
/* the travelling mascot: one element that moves between screens (onboarding, setup, hello) */
const MASCOT = { el: null, key: "", fill: "", tm: [] };
function mascotEl(fill) { if (MASCOT.el && MASCOT.fill === (fill || "")) return MASCOT.el;
  if (MASCOT.el) MASCOT.el.remove(); const el = document.createElement("div"); el.id = "mascot"; el.innerHTML = bubbo("happy", 150, fill || null, "idle");
  document.body.appendChild(el); MASCOT.el = el; MASCOT.fill = fill || ""; MASCOT.key = ""; return el; }
function mascotAct(cls, ms) { const sv = MASCOT.el && MASCOT.el.firstElementChild; if (!sv) return; ["act-wake", "act-run", "act-land", "act-nod", "act-cheer", "act-wave", "act-shake", "writing"].forEach(k => sv.classList.remove(k)); void sv.offsetWidth; sv.classList.add(cls); if (ms) MASCOT.tm.push(setTimeout(() => sv.classList.remove(cls), ms)); }
function mascotWrite() { const sv = MASCOT.el && MASCOT.el.firstElementChild; if (!sv || !sv.classList.contains("hold")) return; sv.classList.remove("writing"); void sv.offsetWidth; sv.classList.add("writing"); MASCOT.tm.push(setTimeout(() => sv.classList.remove("writing"), 800)); }
function mascotHappy(on, ms) { const sv = MASCOT.el && MASCOT.el.firstElementChild; if (!sv) return; sv.classList.toggle("m-cheer", !!on); if (ms) MASCOT.tm.push(setTimeout(() => sv.classList.remove("m-cheer"), ms)); }
function mascotMove(x, y, sc, snap) { const el = MASCOT.el; if (snap) el.classList.add("snap"); el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) scale(${sc})`; if (snap) { void el.offsetWidth; el.classList.remove("snap"); } }
/* after every render: if the screen has a .mslot, put the mascot there (travelling from where it was); otherwise hide it */
function mascotSync(snap) {
  const slot = document.querySelector(".mslot"); if (!slot) { if (MASCOT.el) { MASCOT.el.remove(); MASCOT.el = null; MASCOT.key = ""; } return; }
  const el = mascotEl(slot.dataset.fill === "auto" ? (/theme-/.test(document.documentElement.className) ? "" : "#FFFFFF") : slot.dataset.fill); const sv = el.firstElementChild; const sc = +slot.dataset.sc || 1; const r = slot.getBoundingClientRect();
  const x = r.left + window.scrollX + (r.width - 150 * sc) / 2 + (150 * sc - 150) / 2; const y = r.top + window.scrollY + r.height - 180 + (180 - 180 * sc);
  const key = slot.dataset.key || slot.className; const fresh = MASCOT.key !== key; MASCOT.tm.forEach(clearTimeout); MASCOT.tm = [];
  sv.classList.toggle("hold", slot.dataset.hold === "1"); if (fresh) sv.classList.remove("m-cheer");
  if (fresh && slot.dataset.act === "run") { mascotMove(x, y - 120 * sc, .18, true); el.style.transitionDuration = "1.6s"; MASCOT.tm.push(setTimeout(() => { mascotMove(x, y, sc); mascotAct("act-run"); }, 30)); MASCOT.tm.push(setTimeout(() => { el.style.transitionDuration = ""; mascotAct("act-wave", 2000); }, 2500)); }
  else if (fresh && slot.dataset.act === "wake") { mascotMove(x, y, sc, true); mascotAct("act-wake", 2300); }
  else if (fresh) { mascotMove(x, y, sc, !!snap || !MASCOT.key); const a = slot.dataset.act;
    if (a === "cheer") MASCOT.tm.push(setTimeout(() => { mascotAct("act-cheer", 1800); mascotHappy(true); }, 450));
    else if (a === "wave") MASCOT.tm.push(setTimeout(() => mascotAct("act-wave", 2000), 400));
    else if (MASCOT.key) MASCOT.tm.push(setTimeout(() => mascotAct("act-land", 700), 650)); }
  else if (!snap) { mascotMove(x, y, sc, true); }
  MASCOT.key = key;
}
window.addEventListener("resize", () => { try { mascotSync(true); } catch (e) {} });
function mascotNext() { mascotAct("act-nod", 500); MASCOT.tm.push(setTimeout(mascotWrite, 200)); }
/* the full-screen splash: wait so it is seen, then fade it away */
function splashOff() { const el = document.getElementById("splash"); if (!el) return Promise.resolve();
  const t0 = window.__t0 || Date.now(); const wait = Math.max(0, 2000 - (Date.now() - t0));
  return new Promise(r => setTimeout(() => { el.classList.add("out"); setTimeout(() => { el.remove(); r(); }, 360); }, wait)); }
(function () { const sp = document.getElementById("spBB"); if (sp) sp.innerHTML = bubbo("happy", 220, /theme-/.test(document.documentElement.className) ? null : "#FFFFFF", "act-wake"); })();
/* color themes: picked in onboarding, changeable in Me */
const THEMES = [["marker", "Marker", "#FFE24A", "#FFFFFF"], ["mint", "Mint", "#8CF0C8", "#FFFFFF"], ["coral", "Coral", "#FF8A6B", "#FFF9F4"], ["grape", "Grape", "#D9FF4A", "#F3EFFF"], ["stamp", "Stamp", "#FF4B3E", "#FBF8F2"]];
function applyTheme(t) { t = t || (ST && ST.settings && ST.settings.theme) || (() => { try { return localStorage.getItem("vb_theme"); } catch (e) { return ""; } })() || "marker";
  document.documentElement.className = document.documentElement.className.replace(/\btheme-\w+/g, "").trim() + (t === "marker" ? "" : " theme-" + t);
  try { localStorage.setItem("vb_theme", t); } catch (e) {} const mc = document.querySelector('meta[name="theme-color"]'); if (mc) mc.content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#fff"; }
function themePicker() { const cur = (ST && ST.settings && ST.settings.theme) || "marker";
  return `<div class="themes">${THEMES.map(([k, n, a, b]) => `<button type="button" class="theme-sw" data-act="setTheme" data-v="${k}" aria-pressed="${cur === k}"><i style="background:${a};box-shadow:inset 0 0 0 5px ${b}"></i>${n}</button>`).join("")}</div>`; }
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
  tabs.innerHTML = `<div class="tabbar"><nav>${t("today", "Today", I.home)}${t("map", "Map", I.map)}${t("words", "Words", I.cards)}${t("progress", "Progress", I.chart)}${t("me", "Me", I.me)}</nav></div>`;
}
function previewBar() { return IS_OWNER ? `<div class="notice info row between" style="margin-top:12px"><span>Student preview (test data)</span><button class="ghost" data-act="toTeacher">Dashboard</button></div>` : ""; }
function render() { renderInner(); drawGear(); fitWords(); try { mascotSync(); } catch (e) {} }
function fitWords() { document.querySelectorAll("#app .word").forEach(el => { el.style.whiteSpace = "nowrap"; let fs = parseFloat(getComputedStyle(el).fontSize) || 46; let n = 0;
  while (el.scrollWidth > el.clientWidth + 1 && fs > 20 && n++ < 30) { fs -= 2; el.style.fontSize = fs + "px"; } }); }
window.addEventListener("resize", () => { try { fitWords(); } catch (e) {} });
function renderInner() {
  if (mode === "teacher") { setShell("teacher"); return renderTeacher(); }
  const v = view.name;
  if (v === "loading") return;
  if (v === "login") { setShell("bare"); return renderLogin(); }
  if (v === "error") { setShell("bare"); $app.innerHTML = `<div class="splash"><div class="card" style="text-align:left">${buddy("sad", 80)}<h2>Something went wrong</h2><p>${esc(view.msg)}</p><div class="row"><button class="primary" data-act="reload">Try again</button><button class="ghost" data-act="signout">Sign out</button></div></div></div>`; return; }
  if (v === "placementIntro") { setShell("bare"); return renderPlacementIntro(); }
  if (v === "onboard") { setShell("bare"); return renderOnboard(); }
  if (v === "hello") { setShell("bare"); return renderHello(); }
  if (v === "who") { setShell("bare"); return renderWho(); }
  if (v === "parent") { setShell("focus"); return renderParent(); }
  if (v === "pending" || v === "rejected") { setShell("bare"); return renderPending(v === "rejected"); }
  if (v === "levelIntro") { setShell("bare"); return renderLevelIntro(); }
  if (v === "level") { setShell("focus"); return renderLevel(); }
  if (v === "levelResult") { setShell("focus"); return renderLevelResult(); }
  if (v === "testoutResult") { setShell("focus"); return renderTestOutResult(); }
  if (v === "bossResult") { setShell("focus"); return renderBossResult(); }
  if (v === "packResult") { setShell("focus"); return renderPackResult(); }
  if (v === "flash") { setShell("focus"); return renderFlash(); }
  if (v === "setup") { setShell("bare"); return renderSetup(); }
  if (v === "spacedResult") { setShell("focus"); return renderSpacedResult(); }
  if (v === "run") { setShell("focus"); return renderRun(); }
  if (v === "train") { setShell("focus"); return renderTrain(); }
  if (v === "result") { setShell("focus"); return renderResult(); }
  if (v === "trainDone") { setShell("focus"); return renderTrainDone(); }
  if (v === "wordCard") { setShell("focus"); return renderWordCard(); }
  if (v === "coach") { setShell("focus"); return renderCoach(); }
  if (v === "story") { setShell("focus"); return renderStory(); }
  setShell("tabs");
  if (TAB === "today") return renderToday();
  if (TAB === "map") return renderMap();
  if (TAB === "words") return renderWords();
  if (TAB === "progress") return renderProgress();
  if (TAB === "me") return renderMe();
}
const wsz = w => w.length > 13 ? "font-size:30px" : w.length > 10 ? "font-size:36px" : "";
function streakNow() { const s = ST.streak || {}; return streakAlive(s, today()) ? s.count || 0 : 0; }
function quizDoneToday() { return ST.lastQuizDay === today(); }
function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; }

/* ---------- Today ---------- */
function bubboSays() { // one line from Bubbo for the Today screen
  const P = packInfo(); const nm = firstName(); const qd = quizDoneToday(); const locked = ST.lock && ST.lock.on; const h = new Date().getHours();
  const hi = nm ? (h < 12 ? "좋은 아침, " : h < 18 ? "안녕, " : "저녁이네, ") + nm + "!" : (h < 12 ? "좋은 아침!" : "안녕!");
  if (locked) return { mood: "think", t: `${hi} 어제 틀린 단어 <b>${ST.lock.ids.length}개</b>만 다시 보면 퀴즈가 열려.` };
  if (P && P.due > 0) return { mood: "happy", t: `${hi} 오늘은 <b>단어 ${P.due}개</b>만 하면 돼. 다 하면 나랑 문장 만들기 하자.` };
  if (!qd) return { mood: "wow", t: `${hi} 오늘 단어는 끝! 이제 <b>퀴즈</b>로 확인해 볼까?` };
  if (ST.coachDay !== today()) return { mood: "cheer", t: `퀴즈까지 끝! 이제 배운 단어로 <b>네 문장</b>을 말해 줘.` };
  return { mood: "cheer", t: `오늘 할 일 다 했어! 내일 또 보자 🙌` };
}
function renderToday() {
  saveStars(); const s = streakNow(); const wk = ST.week; const ids = weekIds();
  const P = packInfo(); const needIntro = !!P && !quizReady() && !IS_OWNER; const locked = ST.lock && ST.lock.on && !IS_OWNER; const qd = quizDoneToday();
  const storyLock = !!P && !storyReady() && !IS_OWNER; const mastered = ids.filter(isMastered).length;
  const cd = ST.coachDay === today(); const cT = coachTarget(); const coachN = cd ? cT : (ST.coachProg && ST.coachProg.day === today() ? Math.min(cT, ST.coachProg.n) : 0);
  const sd = (ST.storyWeeks || []).includes(weekKey()); const sp = ST.storyProg && ST.storyProg.week === weekKey() ? ST.storyProg : null;
  const dueN = P ? P.due : 0; const weekend = P && !P.studyDay; const say = bubboSays();
  const todayIds = P ? (dueN ? nextPackIds(dueN) : []) : [];
  const dayLabel = P ? (weekend ? "CATCH-UP DAY" : "DAY " + Math.min(5, Math.max(1, weekStage())) + " OF 5") : "";
  const wordTile = (id, k) => { const e = BY[id]; const on = k === 0; return `<div style="border-radius:14px;background:${on ? "var(--accent)" : "var(--soft)"};color:${on ? "var(--accent-ink)" : "var(--muted)"};padding:10px 10px 8px;min-width:0"><div style="font-family:var(--f-display);font-weight:800;font-size:18px;letter-spacing:-.02em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.w)}</div><div class="small" style="opacity:.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(gloss(e))}</div></div>`; };
  const learnCard = locked ? `<div class="card ink"><div class="row between"><h2>어제 틀린 단어</h2><span class="pill bad">${ST.lock.ids.length}</span></div><div class="chips">${ST.lock.ids.slice(0, 6).map(id => `<span class="chip">${esc(BY[id].w)}</span>`).join("")}</div><button class="big primary" data-act="train">⚡ 빠르게 다시 보기</button></div>`
    : dueN > 0 ? `<div class="card ink"><div class="row between"><h2>Today's words</h2><span class="muted" style="font-family:var(--f-mono);font-size:13px">${P.todayDone > 0 ? P.todayDone : 0} / ${P.todayTarget}</span></div>
        <div style="display:grid;grid-template-columns:repeat(${Math.min(3, todayIds.length)},minmax(0,1fr));gap:8px">${todayIds.slice(0, 3).map(wordTile).join("")}</div>${todayIds.length > 3 ? `<p class="muted small">+ ${todayIds.length - 3} more</p>` : ""}
        <button class="big primary" data-act="train">시작하기 · 약 ${Math.max(3, dueN * 2)}분 →</button></div>`
    : `<div class="card" style="background:var(--accent-soft);border-color:transparent"><div class="row between"><h2>오늘 단어 끝 ✓</h2><span class="muted" style="font-family:var(--f-mono);font-size:13px">${P ? P.learned + " / " + P.total : ""} this week</span></div>
        ${P && P.remaining ? `<button class="big" data-act="learnMore" style="background:var(--card);border:1.5px solid var(--ink)">+ ${Math.min(2, P.remaining)}개 더 배우기 (선택)</button>` : `<p class="muted small">이번 주 단어를 다 배웠어요 🏆</p>`}</div>`;
  const tile = (o) => `<button class="step-card ${o.done ? "complete" : ""}" data-act="${o.act}" ${o.disabled ? "disabled" : ""} style="flex-direction:column;align-items:flex-start;padding:14px;gap:8px;min-height:120px">
      <span style="width:36px;height:36px;border-radius:11px;background:${o.done ? "var(--accent)" : "var(--soft)"};display:grid;place-items:center">${o.icon}</span>
      <span style="font-weight:700;font-size:15px;line-height:1.25">${o.title}</span><span class="muted small">${o.sub}</span></button>`;
  const ic = n => (I[n] || "").replace("<svg", '<svg width="18" height="18"');
  const coachTile = tile({ act: "coach", done: cd, disabled: needIntro, icon: ic("coachI"), title: "Bubbo랑 문장 만들기", sub: cd ? "오늘 완료 ✓" : needIntro ? "단어 배우면 열려요" : `${coachN}/${cT} 문장` });
  const quizTile = tile({ act: "quiz", done: qd && !locked, disabled: needIntro || locked, icon: ic("pencil"), title: "데일리 퀴즈", sub: qd ? "오늘 완료 ✓" : needIntro ? "단어 배우면 열려요" : locked ? "틀린 단어 먼저" : `${quizLen()}문제 · 스트릭 지키기` });
  const storyTile = tile({ act: "story", done: sd, disabled: storyLock, icon: ic("book"), title: "이번 주 이야기", sub: sd ? "다시 읽기" : storyLock ? `이번 주 단어 ${P ? P.learned + "/" + P.total : ""}` : sp ? `Part ${sp.n}/${sp.of}` : "내 단어로 만든 이야기" });
  const bonusTile = tile({ act: "trainWeak", done: false, icon: ic("star"), title: "헷갈리는 단어", sub: `${ids.filter(id => !isMastered(id)).length}개 연습` });
  $app.innerHTML = `${previewBar()}<div class="row between" style="padding-top:14px"><span class="eyebrow">${dayLabel}${wk ? " · " + wk.newIds.length + " WORDS THIS WEEK" : ""}</span><span class="pill" style="font-family:var(--f-mono)">${I.flame.replace("<svg", '<svg width="14" height="14" style="color:#FF7A45"')} ${s}</span></div>
    <div class="ob-ask" style="align-items:flex-end">${bubbo(say.mood, 64)}<div class="bub" style="flex:1"><div class="eyebrow" style="font-size:11px;margin-bottom:2px">BUBBO</div>${say.t}</div></div>
    ${inappBanner()}${installBanner()}
    ${learnCard}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${coachTile}${quizTile}${storyTile}${bonusTile}</div>
    ${lastVoiceCard()}
    ${spacedCard()}
    ${!IS_OWNER && !pushOn() && WW.pushPermission() !== "denied" && WW.pushPermission() !== "unsupported" ? `<div class="notice info row between"><span>🔔 알림 받기</span><button class="primary" data-act="pushOn">켜기</button></div>` : ""}
    <div class="row between muted small" style="padding:0 4px"><span>${ST.level ? `<button class="ghost grade-tap" data-act="showGrade" style="min-height:32px;padding:0">📈 ${esc(gradeWord(ST.level.g))} ›</button>` : ""}</span><span>${mastered}/${ids.length} mastered</span></div>`;
  if (!tourAsked && !IS_OWNER && maybeAskPush()) { tourAsked = true; return; }
  if (ST.tourDone && !IS_OWNER && maybeWeekCard()) return;
  if (ST.tourDone && TI < 0) setTimeout(() => { if (view.name === "tabs" && TAB === "today") maybeSurvey(); }, 700);
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
    return `<button class="list-row" data-act="openWord" data-id="${id}"><span style="display:grid;place-items:center">${ring(Math.min(100, box / MASTER_BOX * 100), isMastered(id) ? "#1FA98F" : "#7B61FF", 44)}</span><span style="flex:1;min-width:0"><b style="font-size:18px">${esc(e.w)}</b>${(ST.week && ST.week.hard || []).includes(id) ? ' <span class="pill sun" style="font-size:11px">⭐ challenge</span>' : ""}<br><span class="muted small">${esc(gloss(e))}</span></span>${isMastered(id) ? '<span class="pill good">mastered</span>' : ""}<span class="muted">${I.chev.replace("<svg", '<svg width="18" height="18"')}</span></button>`; }).join("")}</div></div>`;
  $app.innerHTML = `${previewBar()}<div class="stack" style="padding-top:18px"><span class="eyebrow">Week of ${wk ? wkShort(wk.key) : ""}</span><h1>Your words</h1><p class="muted">Tap a word to hear it and see its card. The ring fills as you master it.</p></div>
    <button class="big primary icon-l" data-act="flash">🃏 Flashcards</button>
    ${wk ? sec("New this week", wk.newIds) + sec("Review", wk.reviewIds) : ""}`;
}
function wkShort(k) { const a = new Date(k + "T12:00:00"); return (a.getMonth() + 1) + "/" + a.getDate(); }
function cardBody(e) {
  return `<div class="row between" style="align-items:flex-start;flex-wrap:wrap;row-gap:8px"><div style="min-width:0"><div class="word" style="${wsz(e.w)}">${esc(e.w)}</div><p class="ipa">${esc(e.ipa)}</p>${KO() && e.kr ? `<div style="margin-top:6px">${krBadge(e)}</div>` : ""}</div>
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
let PROG = null, PROG_RANGE = "week"; let tourAsked = false; let CAL_M = 0;
async function loadProgress() { const [atts, sess] = await Promise.all([getAll(sPath() + "/attempts"), getAll(sPath() + "/sessions")]); PROG = { atts, sess, at: Date.now() }; }
function renderProgress() {
  if (!PROG) { $app.innerHTML = `${previewBar()}${loaderHtml("Loading your progress… 📈")}`; loadProgress().then(render).catch(() => { PROG = { atts: [], sess: [] }; render(); }); return; }
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
  // calendar: one month at a time
  const quizSet = new Set((ST.quizDays || []).concat(PROG.atts.filter(a => a.kind === "quiz" && a.end && a.day).map(a => a.day)));
  const studySet = new Set(PROG.sess.filter(s => actSec(s) > 20).map(s => s.day).concat([...quizSet]));
  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + CAL_M); const yy = base.getFullYear(), mm = base.getMonth();
  const first = new Date(yy, mm, 1).getDay(), nd = new Date(yy, mm + 1, 0).getDate(); let cal = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(x => `<span class="hd">${x}</span>`).join("");
  for (let i = 0; i < first; i++) cal += `<span class="e"></span>`; let monthN = 0;
  for (let k = 1; k <= nd; k++) { const d = yy + "-" + pad(mm + 1) + "-" + pad(k); const did = quizSet.has(d), any = studySet.has(d); if (any) monthN++;
    cal += `<span class="${did ? "on" : any ? "part" : ""} ${d === today() ? "t" : ""}">${k}</span>`; }
  const monthName = base.toLocaleDateString(undefined, { month: "long", year: "numeric" });
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
   <div class="card"><div class="row between"><h3>Study calendar</h3><span class="pill sun">🔥 ${studySet.size} day${studySet.size === 1 ? "" : "s"} total</span></div>
     <div class="row between"><button class="ghost" data-act="calMonth" data-d="-1" aria-label="Previous month">‹</button><b>${esc(monthName)} · ${monthN} day${monthN === 1 ? "" : "s"}</b><button class="ghost" data-act="calMonth" data-d="1" aria-label="Next month" ${CAL_M >= 0 ? "disabled" : ""}>›</button></div>
     <div class="cal month">${cal}</div><p class="muted small"><span class="pill sun">quiz done</span> <span class="pill">studied</span></p></div>
   <div class="card"><h3>Tricky words</h3>${tricky.length ? tricky.map(([id, b]) => `<button class="list-row" data-act="openWord" data-id="${id}"><span style="flex:1"><b>${esc(BY[id].w)}</b><br><span class="muted small">${esc(gloss(BY[id]))}</span></span><span class="pill bad">${b.n - b.ok} missed</span></button>`).join("") : `<p class="muted">No misses ${allTime ? "yet" : "this week"}. Nice!</p>`}</div>`;
}
function renderMe() {
  const email = (WW.user() && WW.user().email) || "";
  $app.innerHTML = `${previewBar()}<div class="stack" style="padding-top:18px;align-items:center;text-align:center">${bubbo("happy", 96)}<h1>${esc(firstName() || email.split("@")[0] || "Me")}</h1><p class="muted">${esc(email)}</p>${ST.level ? `<button class="pill grade-tap" data-act="showGrade" style="font-size:15px;padding:6px 14px">📈 ${esc(gradeWord(ST.level.g))} · see details ›</button>` : ""}</div>
   <div class="card"><h3>This week's goal</h3>${goalHtml()}</div>
   ${IS_OWNER ? `<button class="big primary icon-l" data-act="openParent">👨‍👩‍👧 For parents · 부모님 ${FAMPIN ? "🔒" : ""}</button>` : `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><button class="big primary" data-act="openParent" style="padding:10px 8px">👨‍👩‍👧 For parents${FAMPIN ? " 🔒" : ""}<br><span class="small" style="font-weight:600;opacity:.85">부모님</span></button>
     <button class="big" data-act="menuSwitch" style="padding:10px 8px">${(FAM || []).length > 1 ? "👥 Switch or add child" : "➕ Add a child"}<br><span class="small" style="font-weight:600;opacity:.8">${(FAM || []).length > 1 ? "자녀 바꾸기 · 추가" : "자녀 추가"}</span></button></div>`}
   <button class="big icon-l" data-act="weekCard">📸 My weekly card</button>
   <div class="card"><h3>My colors · 내 색</h3>${themePicker()}</div>
   ${textCard()}
   <div class="card"><div class="row between"><h3>Record my voice</h3><button class="pill ${ST.settings && ST.settings.record === false ? "" : "sun"}" data-act="toggleRec" style="min-height:36px">${ST.settings && ST.settings.record === false ? "Off" : "On"}</button></div><p class="muted small">When on, you can replay your own voice next to Bella's. Recordings stay on this phone only and are never uploaded. 녹음은 이 휴대폰에만 저장돼요.</p></div>
   <div class="card"><h3>Streak freezes ❄️</h3><p class="muted small">You have <b>${ST.freezes || 0}</b> of 2. A freeze saves your streak if you miss one day. Earn one for every 5 daily quizzes.</p></div>
   <div class="card"><div class="row between"><h3>Level ${levelInfo().n}</h3><span class="pill sun">${ST.xp || 0} XP</span></div>${levelBar()}<p class="muted small">Earn XP for every right answer, word you learn, sentence and story.</p></div>
   <div class="card"><div class="row between"><h3>Badges</h3><span class="pill">${Object.keys(ST.badges || {}).length}/${BADGES.length}</span></div>${badgeGrid()}</div>
   ${pushCard()}
   ${micCard()}
   <button class="big icon-l" data-act="tour">🧭 Show me around the app</button>
   ${voicePicker()}
   <div class="card"><h3>Sounds</h3><p class="muted">Words and sentences play recorded audio. If a word has no recording yet, your phone's voice reads it. Pick that voice above.</p></div>
   <button class="big icon-l" data-act="feedback">💬 Send feedback</button>
   <button class="big icon-l" data-act="reload">${I.reload} Reload app</button>
   ${IS_OWNER ? `<button class="big icon-l" data-act="toTeacher">📊 Teacher dashboard</button>` : `<button class="big icon-l" data-act="menuSignout" style="color:var(--coral-ink,#c0392b)">↩️ Sign out</button>`}
`;
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
  const e = BY[q.id]; const hint = (RUN && RUN.kind === "quiz" ? hintsToday() : RUN && RUN.kind === "testout" ? false : CFG.hints) ? `<p class="hint">${esc(e.w[0])}${" _".repeat(Math.max(0, e.w.length - 1))}</p>` : "";
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
     return `<button class="opt ${c}" data-act="pick" data-id="${o.id}" ${RUN.answered || bw ? "disabled" : ""}>${esc(o.label)}</button>`; }).join("")}</div>${RUN.kind === "skipcheck" && !RUN.answered ? `<button type="button" class="ghost" data-act="idk" style="align-self:center">I don't know</button>` : ""}`;
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
  $app.innerHTML = `${topbar(RUN.i, RUN.qs.length)}<span class="eyebrow">${RUN.kind === "placement" ? "Word check" : RUN.kind === "testout" ? "Test-out quiz · need 80%" : RUN.kind === "boss" ? "👑 Boss review · need 80%" : RUN.kind === "skipcheck" ? "Quick check · do you know it?" : RUN.kind === "spaced" ? "🧠 Remember these?" : "Daily quiz"}</span><div class="card">${qPrompt(q)}${body}${fb}</div>`;
  const inp = document.getElementById("ans"); if (inp && !RUN.answered) inp.focus();
  const fx = document.getElementById("fix"); if (fx) fx.focus();
}
function runSayHtml(q, e) {
  const err = RUN.micErr === "blocked" ? `${micBlockedHtml()}<button class="big" data-act="sayGiveUp">Skip this question</button>` : RUN.micErr === "unsupported" ? `<button class="big" data-act="sayGiveUp">This phone can't listen · skip</button>` : "";
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
  if (RUN.kind === "testout") return finishTestOut();
  if (RUN.kind === "boss") return finishBoss();
  if (RUN.kind === "skipcheck") return finishPackCheck();
  if (RUN.kind === "spaced") return finishSpaced();
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
    ST.streak = streakUpdate(d); ST.lastQuizDay = d; ST.quizDays = (ST.quizDays || []).filter(x => x >= addDays(d, -40)).concat(ST.quizDays && ST.quizDays.includes(d) ? [] : [d]);
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
    else if (wk && packInfo().due > 0) { ids = nextPackIds(packInfo().due); reason = "intro"; }
    else { ids = shuffle(weekIds()).sort((a, b) => (WORDS[a] ? WORDS[a].box : 0) - (WORDS[b] ? WORDS[b].box : 0)).slice(0, 10); } }
  if (!ids.length) { toast("No words to train"); return; }
  TR = { ids: ids.slice(), queue: ids.slice(), reason, step: "study", done: 0, total: ids.length, t0: Date.now(), seen: {}, ratings: {}, hints: {}, dueAtStart: packInfo() ? packInfo().due : 0 };
  startAttempt("training", { reason, n: ids.length, required: reason === "missed" || reason === "intro" }); logDid("training:" + reason);
  view = { name: "train" }; render(); maybeTour("train"); await loadPacksFor(ids); if (TR && TR.step === "study") speak(TR.queue[0], "w");
}
function exHtml(s, w) { const re = new RegExp("\\b(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\w*)", "i"); return esc(s).replace(re, "<mark>$1</mark>"); }
function sylButtons(e) {
  const rs = e.rs.split("-"), parts = e.syl.split("·");
  const si = parts.length === 1 ? 0 : (rs.length === parts.length ? rs.findIndex(p => p !== p.toLowerCase()) : -1);
  return parts.map((p, i) => parts.length > 1 ? `<button class="syl ${i === si ? "stress" : ""}" data-act="speak" data-id="${e.id}" data-tag="y${i}" aria-label="Hear ${esc(p)}">${esc(p)}</button>` : `<span class="syl stress">${esc(p)}</span>`).join("");
}
function trainTopbar(id) {
  const again = !!TR.seen[id]; const pos = Math.min(TR.total, Object.keys(TR.seen).length + (again ? 0 : 1));
  return `<div class="topbar"><button class="save-x" data-act="saveExit" aria-label="Save and exit">💾 Save &amp; exit</button><div class="bar"><i style="width:${Math.round((again ? pos : pos - 1) / TR.total * 100)}%"></i></div><span class="count">${again ? "Review" : pos + "/" + TR.total}</span></div>`; }
function renderTrain() {
  const id = TR.queue[0]; const e = BY[id];
  const head = trainTopbar(id) + `<span class="eyebrow">${TR.reason === "missed" ? "⚡ Quick fix · missed words" : "Training"}${TR.seen[id] ? " · one more time" : ""}</span>`
    + (!Object.keys(TR.seen).length && TR.step === "study" ? `<div class="notice info small">💾 You can stop any time. Words you finish are saved, so you can come back later.</div>` : "");
  if (TR.step === "study") {
    $app.innerHTML = head + `<div class="card">${cardBody(e)}
      ${speakOn() && !TR.seen[id] ? `<button class="big primary icon-l" data-act="toSpeak">${ICON_MIC} I'm ready · say it out loud</button>` : `<button class="big primary" data-act="cover">I'm ready · cover &amp; write</button>`}</div>`;
    return;
  }
  if (TR.step === "speak") { $app.innerHTML = head + speakHtml(e); return; }
  if (TR.step === "count") { $app.innerHTML = head + `<div class="card" style="align-items:center;text-align:center;gap:14px"><p class="label">Look carefully, then it disappears!</p>
      <div class="word" style="${wsz(e.w)}">${esc(e.w)}</div><div class="countdown" aria-live="polite">${TR.count}</div></div>`; return; }
  $app.innerHTML = head + `<div class="card">
    <p class="label">Write the word from memory</p>
    <div class="stack" style="gap:6px">${e.senses.map(x => `<div class="sense"><span class="pos-tag">${esc(x.pos)}</span><p class="q-prompt">${esc(sgloss(x))}</p></div>`).join("")}</div>
    <p class="blanks mono" aria-label="${e.w.length} letters">${[...e.w].map((c, k) => c === " " || c === "-" ? `<span class="gap">${esc(c)}</span>` : `<span class="${k < (TR.hints[id] || 0) ? "rev" : ""}">${k < (TR.hints[id] || 0) ? esc(c) : "_"}</span>`).join("")}</p>
    <div class="row">${spk(e.id, "w", "Hear it", "icon-l")}${!TR.fb && (TR.hints[id] || 0) < Math.min(3, e.w.length - 1) ? `<button class="ghost" data-act="trHint">💡 Hint (${3 - (TR.hints[id] || 0)} left)</button>` : TR.hints[id] ? `<span class="muted small">💡 ${TR.hints[id]} hint letter${TR.hints[id] === 1 ? "" : "s"}</span>` : ""}</div>
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
  record(id, "train", ok, ans, Date.now() - TR.t0); const h = TR.hints[id] || 0; if (h && ATT.items.length) ATT.items[ATT.items.length - 1].hints = h;
  TR.fb = ok ? "ok" : "bad"; TR.lastAns = ans; if (ok) award(h ? 2 : 5, "spell");
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
  if ((TR.reason === "intro" || TR.reason === "more") && ST.week && !(ST.week.trained || []).includes(id)) { markLearned([id]); saveST(); }
  // spread the extra reviews out: one a few cards later, one at the end
  if (extra >= 1) TR.queue.splice(Math.min(3, TR.queue.length), 0, id);
  if (extra >= 2) TR.queue.push(id);
  if (!TR.queue.includes(id)) TR.done++;
  TR.fb = null; TR.fixed = false; TR.sp = null; TR.lastAns = ""; TR.step = "study"; TR.t0 = Date.now(); delete TR.hints[id];
  if (!TR.queue.length) return finishTraining();
  render(); speak(TR.queue[0], "w");
}
function finishTraining() {
  ATT.end = Date.now(); const tr = ATT.items.filter(i => i.t === "train"); ATT.score = tr.length ? tr.filter(i => i.ok).length / tr.length : 1;
  if (TR.reason === "missed") { ST.lock = Object.assign({}, ST.lock, { on: false, clearedAt: Date.now() }); bumpStat("unlocks"); }
  award(10, "training done"); if (new Date().getHours() < 8) bumpStat("early");
  if ((TR.reason === "intro" || TR.reason === "more") && ST.week) markLearned(TR.ids);
  saveAttempt(); saveST(); logDid("training done"); PROG = null;
  const pk = TR.reason === "intro" || TR.reason === "more"; const P = packInfo(); const goalNow = pk && P && P.due === 0 && (TR.dueAtStart > 0 || TR.reason === "more");
  view = { name: "trainDone", reason: TR.reason, n: TR.total }; const n = TR.total, more = TR.reason === "more"; TR = null; render();
  if (goalNow) setTimeout(() => dayDonePopup(n, more), 250); else setTimeout(checkBadges, 600);
}
function renderTrainDone() { const r = view.reason;
  $app.innerHTML = `<div style="height:14px"></div><div class="result-hero">${buddy("wow", 110)}<h1>${r === "coach" ? "Great speaking!" : r === "missed" ? "Quiz unlocked!" : r === "intro" || r === "more" ? (quizDoneToday() ? "Words learned! 🌱" : "Daily quiz unlocked!") : "Nice practice!"}</h1><p style="opacity:.9">${r === "coach" ? "You made " + view.n + " sentences." : "You trained " + view.n + " word" + (view.n === 1 ? "" : "s") + "."}</p></div>
  <button class="big primary" data-act="home">${r === "free" || r === "weak" ? "Back home" : "Go to today's plan"}</button>
  ${(r === "intro" || r === "more") && packInfo() && packInfo().remaining ? `<button class="big" data-act="learnMore">➕ Learn ${Math.min(2, packInfo().remaining)} more words (optional)</button>` : ""}`;
}

/* ---------- speaking ---------- */
// tell apart "spoke but not understood", "only noise" and "silent" when no words come back
function micWatch(rec) { const m = { sound: false, speech: false }; rec.onsoundstart = () => { m.sound = true; }; rec.onspeechstart = () => { m.sound = m.speech = true; }; return m; }
const quietKind = m => m.speech ? "spoke" : m.sound ? "noise" : "silent";
const QUIET_ANS = { spoke: "(spoke, not recognized)", noise: "(only noise)", silent: "(nothing heard)" };
const QUIET_MSG = { spoke: "I heard you, but couldn't catch the word. Try a little slower and closer to the phone.", noise: "I only heard background noise. Find a quiet spot and speak up.", silent: "I didn't hear anything. Tap the mic, then speak a little louder." };
const speakOn = () => CFG.speak !== false && !(ST && ST.settings && ST.settings.speak === false) && !srBroken;
const toks = x => norm(x).replace(/[’']/g, "").replace(/[^a-z0-9 ]+/g, " ").split(" ").filter(Boolean);
function phKey(s) { // rough sound-alike key
  s = s.toLowerCase().replace(/[^a-z]/g, ""); if (!s) return "";
  s = s.replace(/^kn|^gn|^wr/, m => m[1]).replace(/ph/g, "f").replace(/ck|q/g, "k").replace(/c(?=[eiy])/g, "s").replace(/c/g, "k").replace(/x/g, "ks").replace(/z/g, "s").replace(/dg/g, "j").replace(/tch/g, "ch").replace(/gh/g, "").replace(/wh/g, "w").replace(/(.)\1+/g, "$1");
  return s[0] + s.slice(1).replace(/[aeiouyhw]/g, "");
}
// sounds Korean (and many Asian) speakers mix up: r/l, b/v, p/f, th, z/j, sh/s
const kfold = s => s.toLowerCase().replace(/th/g, "t").replace(/ph/g, "p").replace(/sh/g, "s").replace(/r/g, "l").replace(/v/g, "b").replace(/f/g, "p").replace(/z/g, "j").replace(/(.)\1+/g, "$1");
function soundsLike(tok, w) { const t = toks(w).join(""); if (!tok) return false;
  const forms = [t, t + "s", t + "es", t + "ed", t + "d", t + "ing", t + "y", t + "er"]; if (forms.includes(tok)) return true;
  const fa = kfold(tok), fb = kfold(t); if (fa === fb || forms.some(f => kfold(f) === fa)) return true;
  if (lev(fa, fb) <= (fb.length <= 3 ? 1 : fb.length <= 6 ? 2 : fb.length <= 9 ? 3 : 4)) return true;
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
const tokEq = (a, b) => a === b || kfold(a) === kfold(b) || (b.length > 3 && lev(kfold(a), kfold(b)) <= 1);
function lcsLen(A, B) { const L = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = tokEq(A[i], B[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]); return L[0][0]; }
function sentHeard(alts, sent) { const B = toks(sent); return alts.some(a => lcsLen(toks(a), B) / B.length >= 0.7); }
function startSpeak() { const e = BY[TR.queue[0]];
  const quick = TR.reason === "missed"; // quick fix for missed quiz words: say it once, no sentences
  TR.sp = { targets: [{ kind: "w", tag: "w", text: e.w, need: quick ? 1 : 3, got: 0 }].concat(quick ? [] : e.ex.map((x, k) => ({ kind: "s", tag: "e" + k, text: x, need: 1, got: 0 }))), idx: 0, fails: 0, tries: 0, heard: "", ok: false, listening: false, err: "" };
  TR.step = "speak"; render(); speak(e.id, "w"); }
function speakHtml(e) {
  const sp = TR.sp; const done = sp.idx >= sp.targets.length; const tg = sp.targets[sp.idx];
  const list = sp.targets.map((t, k) => `<span class="pill ${k < sp.idx ? "sun" : k === sp.idx ? "" : ""}" style="${k > sp.idx ? "opacity:.45" : ""}${k === sp.idx ? "background:var(--ink);color:#fff" : ""}">${k < sp.idx ? "✓ " : ""}${t.kind === "w" ? "단어" : "예문 " + k}</span>`).join("");
  if (done) return `<div class="card" style="align-items:center;text-align:center">${bubbo("cheer", 96)}<h2>말하기 완료!</h2><p class="muted">이제 가리고 써 볼 차례.</p><button class="big primary" data-act="cover" id="nextBtn">가리고 쓰기 ✍️</button></div>`;
  const vkey = e.id + ":" + tg.tag; const mine = voiceHas(vkey);
  const card = tg.kind === "w"
    ? `<div class="card ink"><div class="row between"><span class="eyebrow">${esc(e.pos)} · ${esc(gradeLabel(e.g) === "–" ? "" : "Grade " + gradeLabel(e.g))}</span><span class="ipa">${esc(e.ipa)}</span></div>
        <div class="row between" style="flex-wrap:nowrap"><div class="word" style="${wsz(e.w)}">${esc(e.w)}</div>${spk(e.id, "w")}</div>
        <div class="ko hl">${esc(gloss(e))}</div><div class="row">${spk(e.id, "s", "천천히", "icon-l")}</div></div>`
    : `<div class="card ink"><span class="eyebrow">예문 ${sp.idx} · 듣고 따라 읽기</span><div class="ex">${spk(e.id, tg.tag)}<p style="font-size:21px;font-weight:700">${exHtml(tg.text, e.w)}</p></div></div>`;
  let mood = "happy", line = tg.kind === "w" ? `<b>${esc(e.w)}</b>를 ${tg.need === 1 ? "한 번" : tg.need + "번"} 말해 줘. 듣고 있을게!` : "문장 전체를 소리 내어 읽어 봐.";
  if (sp.listening) { mood = "wow"; line = "듣고 있어… 말해 봐!"; }
  else if (sp.wait) { mood = "cheer"; line = tg.kind === "w" ? `와, ${tg.need === 1 ? "성공" : tg.need + "번 성공"}! <b>${esc(e.w)}</b> 정말 잘 들렸어.` : "잘 읽었어! 다음으로 가자."; }
  else if (sp.heard && sp.ok) { mood = "cheer"; line = `잘 들었어! <b>${esc(e.w)}</b> ${tg.got}번 성공. ${tg.need - tg.got}번만 더!`; }
  else if (sp.heard) { mood = "think"; line = esc(sp.heard); }
  const talk = `<div class="ob-ask" style="align-items:flex-start">${bubbo(mood, 52)}<div class="bub" style="flex:1">${line}</div></div>`;
  const dots = tg.kind === "w" ? `<div class="dots" style="justify-content:center">${Array.from({ length: tg.need }, (_, k) => `<i class="${k < tg.got ? "on" : ""}">${k < tg.got ? "" : k + 1}</i>`).join("")}</div>` : "";
  const cmp = `<div class="card" style="background:var(--soft);border-color:transparent;padding:12px;gap:8px"><span class="eyebrow" style="font-size:11px">COMPARE · 들어 보고 비교하기</span><div class="cmp">
      <button type="button" data-act="speak" data-id="${e.id}" data-tag="${tg.tag}"><span class="pb">${I.play}</span>원어민</button>
      <button type="button" class="mine" data-act="playMine" data-key="${esc(vkey)}" ${mine ? "" : "disabled"}><span class="pb">${I.play}</span>${mine ? "내 목소리" : "내 목소리 (아직 없음)"}</button></div></div>`;
  if (sp.wait) { const last = sp.idx + 1 >= sp.targets.length;
    return `<div class="stack"><div class="row between"><span class="label">Say it out loud</span><div class="chips">${list}</div></div>${card}${talk}${dots}${cmp}
      <div style="display:grid;grid-template-columns:1fr 1.4fr;gap:10px"><button class="big" data-act="spRedo">🔁 다시</button><button class="big primary" data-act="spNext" id="nextBtn">${last ? "다음: 쓰기 ✍️" : "다음 →"}</button></div></div>`; }
  const err = sp.err === "blocked" ? micBlockedHtml() : sp.err === "unsupported" ? `<div class="notice">이 브라우저는 듣기를 지원하지 않아요. Safari나 Chrome에서 열어 주세요.</div><button class="big" data-act="cover">쓰기로 넘어가기</button>` : "";
  return `<div class="stack"><div class="row between"><span class="label">Say it out loud</span><div class="chips">${list}</div></div>${card}${talk}${dots}${mine ? cmp : ""}
    <button class="mic ${sp.listening ? "on" : ""}" id="micBtn" data-act="mic" ${sp.listening ? "disabled" : ""} aria-label="Tap, then speak">${ICON_MIC}</button>
    <p class="muted small" style="text-align:center">${sp.listening ? "듣고 있어요… 말해 보세요" : "눌러서 말하기"}</p>${err}
    ${sp.tries >= 3 ? `<button class="big" data-act="spSkip">잘 안 들려요 · 건너뛰기</button>` : ""}</div>`;
}
function listen() {
  const sp = TR.sp; if (!sp || sp.listening) return; const e = BY[TR.queue[0]]; const tg = sp.targets[sp.idx]; if (!tg) return;
  let rec; try { rec = new SR(); } catch (err) { sp.err = "unsupported"; return render(); }
  rec.lang = "en-US"; rec.interimResults = true; rec.maxAlternatives = 3; rec.continuous = true;
  stopAudio(); sp.listening = true; sp.heard = ""; sp.err = ""; render(); const mw = micWatch(rec); const vkey = e.id + ":" + tg.tag; voiceStart();
  let decided = false, lastText = "", timer = null, best = 0, quiet = null; const startGot = tg.got; let matched = "", quietS = null;
  if (tg.kind === "w") {
    const wordEnd = () => { if (decided) return; decided = true; clearTimeout(timer); clearTimeout(quiet); try { rec.abort(); } catch (x) {} sp.listening = false; voiceStop(vkey).then(v => { if (v && TR && TR.sp === sp && !sp.listening) render(); });
      sp.tries++;
      if (!lastText) { sp.ok = false; const qk = quietKind(mw); record(e.id, "say", false, QUIET_ANS[qk], 0); tagLast("w"); sp.heard = QUIET_MSG[qk]; return render(); }
      const ok = best > 0; record(e.id, "say", ok, lastText, 0); tagLast("w"); sp.ok = ok;
      if (ok) { sp.fails = 0; bumpStat("say", best); award(2 * best, "say"); sp.heard = "✓ I heard: “" + lastText + "”";
        if (tg.got >= tg.need) { sp.wait = true; sp.tries = 0; }
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
    sp.listening = false; sp.tries++; voiceStop(vkey).then(v => { if (v && TR && TR.sp === sp && !sp.listening) render(); });
    if (!text) { sp.ok = false; const qk = quietKind(mw); record(e.id, tg.kind === "w" ? "say" : "saysent", false, QUIET_ANS[qk], 0); tagLast(tg.tag); sp.heard = QUIET_MSG[qk]; return render(); }
    record(e.id, tg.kind === "w" ? "say" : "saysent", ok, text, 0); tagLast(tg.tag); sp.ok = ok;
    if (ok) { tg.got++; sp.fails = 0; sp.heard = "✓ I heard: “" + text + "”"; bumpStat("say"); award(2, "say"); if (tg.got >= tg.need) { sp.wait = true; sp.tries = 0; } }
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
function spSkip() { const sp = TR.sp; const tg = sp.targets[sp.idx]; if (!tg) return; record(TR.queue[0], tg.kind === "w" ? "say" : "saysent", false, "(skipped)", 0); tagLast(tg.tag); spNext(); }
function tagLast(tag) { if (ATT && ATT.items && ATT.items.length) ATT.items[ATT.items.length - 1].tag = tag; }
function spNext() { const sp = TR.sp; stopAudio(); sp.wait = false; sp.idx++; sp.fails = 0; sp.tries = 0; sp.heard = ""; sp.ok = false;
  if (sp.idx >= sp.targets.length) return startCountdown();
  render(); const nx = sp.targets[sp.idx]; setTimeout(() => { if (TR && TR.sp === sp && !sp.listening) speak(TR.queue[0], nx.tag); }, 300); }
function spRedo() { const sp = TR.sp; const tg = sp.targets[sp.idx]; if (!tg) return; tg.got = 0; sp.wait = false; sp.heard = ""; sp.ok = false; sp.tries = 0; render(); speak(TR.queue[0], tg.tag); }
function startCountdown() { stopAudio(); const id = TR.queue[0]; TR.step = "count"; TR.count = 3; render(); speak(id, "w");
  const tick = () => { if (!TR || TR.step !== "count" || TR.queue[0] !== id) return; TR.count--; if (TR.count <= 0) { TR.step = "write"; TR.t0 = Date.now(); return render(); } render(); setTimeout(tick, 1000); };
  setTimeout(tick, 1000); }

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
  const n = quizLen(); const wk = quizIds().length ? quizIds() : weekIds();
  const due = Object.keys(WORDS).filter(id => !wk.includes(id) && WORDS[id].due <= today()).sort((a, b) => WORDS[a].box - WORDS[b].box);
  const wkSorted = shuffle(wk).sort((a, b) => (WORDS[a] ? WORDS[a].box : 0) - (WORDS[b] ? WORDS[b].box : 0));
  const nOld = Math.min(due.length, Math.round(n * 0.3));
  let ids = wkSorted.slice(0, n - nOld).concat(due.slice(0, nOld));
  let k = 0; while (ids.length < n && wk.length) ids.push(wkSorted[k++ % wkSorted.length]);
  ids = shuffle(ids);
  const half = Math.round(n * (1 - prodShare())); // early in the week: more choosing; later: more typing, listening, speaking
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
  let decided = false, last = "", timer = null; const mw = micWatch(rec);
  const finish = (ok, text) => { if (decided) return; decided = true; clearTimeout(timer); try { rec.abort(); } catch (x) {} RUN.listening = false;
    if (!text) { RUN.heard = QUIET_MSG[quietKind(mw)]; return render(); }
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
/* ---------- daily word packs: weekly words split over the first 5 days of each week; days 6-7 = optional catch-up ---------- */
const STUDY_DAYS = 5;
// each week's first 5 days are study days; days 6 and 7 are optional catch-up days
const dayIdx = (d, key) => (((Math.round((new Date(d + "T12:00:00") - new Date(key + "T12:00:00")) / 864e5)) % 7) + 7) % 7;
const isStudyDay = (d, key) => dayIdx(d, key || (ST && ST.week ? ST.week.key : weekKey())) < STUDY_DAYS;
function studyDaysBetween(a, b, key) { let n = 0; for (let d = a; d <= b; d = addDays(d, 1)) if (isStudyDay(d, key)) n++; return n; }
function packInfo() {
  const wk = ST && ST.week; if (!wk) return null;
  const total = wk.newIds.length; const trained = wk.introDone ? wk.newIds.concat(wk.trained || []) : (wk.trained || []); // weeks finished in the old all-at-once way count as fully learned
  const learnedIds = wk.newIds.filter(id => trained.includes(id)); const learned = learnedIds.length;
  const per = Math.max(1, Math.ceil(total / STUDY_DAYS));
  const wkStart = wk.key, wkEnd = addDays(wk.key, 6), d = today();
  const created = wk.created ? dstr(new Date(wk.created)) : wkStart;
  const from = created > wkStart ? created : wkStart;
  const daysInWeek = Math.max(1, studyDaysBetween(from, wkEnd, wkStart)); // a week that starts mid-week just has fewer study days
  const reqTotal = Math.min(total, per * daysInWeek);
  const idx = studyDaysBetween(from, d > wkEnd ? wkEnd : d, wkStart); // study days so far, including today
  const required = Math.min(reqTotal, per * idx);
  // fix today's target when the day starts, so learning more doesn't move the goal; at most 2 days of backlog
  if (!wk.day || wk.day.d !== d) { let due0 = Math.max(0, Math.min(required - learned, 2 * per));
    if (!learned && !(wk.reviewIds || []).length) due0 = Math.max(due0, Math.min(per, total)); // nothing to quiz yet: learn a first pack
    wk.day = { d, start: learned, due: due0 }; }
  const due = Math.max(0, wk.day.start + wk.day.due - learned);
  const remaining = total - learned;
  return { total, per, learned, learnedIds, due, remaining, reqTotal, required, studyDay: isStudyDay(d, wkStart), daysInWeek, todayTarget: wk.day.due, todayDone: Math.min(wk.day.due, learned - wk.day.start) };
}
function quizIds() { const wk = ST.week; if (!wk) return []; const p = packInfo(); return p.learnedIds.concat(wk.reviewIds); }
function quizReady() { const p = packInfo(); return !!p && p.due === 0 && quizIds().length > 0; }
function storyReady() { const p = packInfo(); return !!p && p.learned >= p.reqTotal; }
function nextPackIds(n) { const wk = ST.week; const tr = wk.trained || []; return wk.newIds.filter(id => !tr.includes(id)).slice(0, n); }
function markLearned(ids) { const wk = ST.week; if (!wk) return; const tr = wk.trained || []; ids.forEach(id => { if (wk.newIds.includes(id) && !tr.includes(id)) tr.push(id); }); wk.trained = tr; wk.introDone = wk.newIds.every(id => tr.includes(id)); }

/* tapping "Train": today's pack (with a quick "do I know these?" check first) or free practice */
function trainTap(more) {
  if (ST.lock && ST.lock.on) return startTraining();
  const p = packInfo(); if (!p) return startTraining();
  let ids = [];
  if (!more && p.due > 0) ids = nextPackIds(p.due);
  else if (more && p.remaining > 0) return startTraining(nextPackIds(2), "more"); // extra words: 2 at a time, straight in
  if (!ids.length) return startTraining(null, "free");
  packSheet(ids, more ? "more" : "intro");
}
let PACK_PENDING = null;
function packSheet(ids, reason) {
  PACK_PENDING = { ids, reason };
  sheet(`<div style="font-size:52px;line-height:1">🧐</div><h2>${reason === "more" ? "Learn " + ids.length + " more words" : "Today's " + ids.length + " new word" + (ids.length === 1 ? "" : "s")}</h2>
    <p style="font-weight:800;margin:0">Already know these?</p><p class="muted">Take a quick check first. Words you get right are skipped, so you only learn the new ones.</p>
    <div class="chips" style="justify-content:center">${ids.map(id => `<span class="chip">${esc(BY[id].w)}</span>`).join("")}</div>
    <button class="big primary" data-act="packCheck">Quick check (${ids.length} question${ids.length === 1 ? "" : "s"})</button>
    <button class="big" data-act="packLearn">Start learning</button>
    <p class="muted small">💾 You can stop any time. Your progress is saved.</p>
    ${reason === "intro" && !(ST.week.trained || []).length && canTestOut() ? `<div class="stack" style="gap:8px;border-top:2px dashed var(--line);padding-top:12px;width:100%"><b>Do this week's words look too easy? 🚀</b>
      <div class="chips" style="justify-content:center">${ST.week.newIds.map(id => `<span class="chip small">${esc(BY[id].w)}</span>`).join("")}</div>
      <p class="muted small">Take a quick quiz on them. Get 80% or more and you get a new, harder set.</p><button class="big" data-act="sheetTestOut">Test out for harder words</button></div>` : ""}`);
}
function startPackCheck() {
  const pk = PACK_PENDING; closeSheet(); if (!pk) return;
  const pool = ST.week.newIds.concat(ST.week.reviewIds);
  const qs = pk.ids.map(id => makeQ2(id, KO() ? "mc_ko" : "mc_def", pool));
  RUN = { kind: "skipcheck", qs, i: 0, t0: Date.now(), answered: false, right: 0, pack: pk };
  startAttempt("skipcheck", { n: qs.length }); logDid("skip check");
  view = { name: "run" }; render(); loadPacksFor(pk.ids); RUN && (RUN.t0 = Date.now()); autoSpeak();
}
function finishPackCheck() {
  const pk = RUN.pack; const known = [...new Set(ATT.items.filter(i => i.ok).map(i => i.id))];
  ATT.end = Date.now(); ATT.score = RUN.right / RUN.qs.length; saveAttempt();
  markLearned(known); if (known.length) award(5 * known.length, "already knew"); saveST(); PROG = null;
  const rest = pk.ids.filter(id => !known.includes(id));
  view = { name: "packResult", known, rest, reason: pk.reason }; RUN = null; render();
}
function renderPackResult() { const v = view;
  $app.innerHTML = `<div style="height:14px"></div><div class="result-hero">${buddy(v.known.length ? "wow" : "happy", 100)}<h1>${!v.rest.length ? "You knew them all! ⭐" : v.known.length ? "You knew " + v.known.length + "!" : "Let's learn them!"}</h1>
    <p style="opacity:.9">${!v.rest.length ? "No training needed for these words." : v.rest.length + " word" + (v.rest.length === 1 ? "" : "s") + " to learn now."}</p></div>
    ${v.known.length ? `<div class="card"><h3>Skipped (you know these)</h3><div class="chips">${v.known.map(id => `<span class="chip">✓ ${esc(BY[id].w)}</span>`).join("")}</div><p class="muted small">They'll still show up in your quizzes.</p></div>` : ""}
    ${v.rest.length ? `<button class="big primary" data-act="packGo">Start learning</button><button class="big" data-act="home">Later</button>` : `<button class="big primary" data-act="home">Back home</button>`}`;
}
function packPlanText(n) { const per = Math.max(1, Math.ceil(n / STUDY_DAYS)); return `≈ ${per} new word${per === 1 ? "" : "s"} a day for 5 days, then 2 catch-up days (optional).`; }

/* ---------- the week gets a little harder each day ---------- */
function weekStage() { const wk = ST.week; if (!wk) return 3; const d = today(), end = addDays(wk.key, 6); return studyDaysBetween(wk.key, d > end ? end : d, wk.key); } // 1 = first day of the week … 5
function quizLen() { const base = ST.quizSize || 15; const st = weekStage(); const f = st <= 1 ? 0.6 : st === 2 ? 0.75 : st === 3 ? 0.9 : 1; return Math.max(8, Math.round(base * f)); }
function prodShare() { return 0.35 + 0.1 * Math.min(4, weekStage()); } // share of typing / listening / speaking questions
function coachTarget() { const st = weekStage(); return st <= 1 ? 2 : st <= 3 ? 3 : 4; }

/* ---------- flashcards (any time) ---------- */
let FL = null;
function flashSheet() {
  const wk = ST.week; const p = packInfo(); const week = p ? p.learnedIds.concat(wk.reviewIds) : weekIds();
  const all = [...new Set(Object.keys(WORDS).filter(id => BY[id]).concat(week))]; const tricky = all.filter(id => !isMastered(id));
  sheet(`<div style="font-size:52px;line-height:1">🃏</div><h2>Flashcards</h2><p class="muted">Tap a card to flip it. Then pick a face: see it again soon, later, or you've got it.</p>
    <button class="big primary" data-act="flStart" data-deck="week" ${week.length ? "" : "disabled"}>This week's words (${week.length})</button>
    <button class="big" data-act="flStart" data-deck="tricky" ${tricky.length ? "" : "disabled"}>Tricky words (${tricky.length})</button>
    <button class="big" data-act="flStart" data-deck="all" ${all.length ? "" : "disabled"}>All my words (${all.length})</button>`);
}
function startFlash(deck) {
  closeSheet(); const wk = ST.week; const p = packInfo();
  let ids = deck === "week" ? (p ? p.learnedIds.concat(wk.reviewIds) : weekIds()) : deck === "tricky" ? Object.keys(WORDS).filter(id => BY[id] && !isMastered(id)) : Object.keys(WORDS).filter(id => BY[id]).concat(p ? p.learnedIds.concat(wk.reviewIds) : []);
  ids = shuffle([...new Set(ids)]).slice(0, 40); if (!ids.length) { toast("No words yet"); return; }
  const modes = KO() ? ["word", "def", "ko", "word", "ko"] : ["word", "def"]; const mode = {}; ids.forEach((id, k) => { mode[id] = modes[k % modes.length]; });
  FL = { queue: ids.slice(), total: ids.length, got: 0, flipped: false, again: {}, mode };
  logDid("flashcards " + deck); view = { name: "flash" }; render(); loadPacksFor(ids).then(() => flSpeak());
}
function renderFlash() {
  if (!FL.queue.length) {
    $app.innerHTML = `<div style="height:14px"></div><div class="result-hero">${buddy("wow", 100)}<h1>Deck done! 🃏</h1><p style="opacity:.9">You went through ${FL.total} card${FL.total === 1 ? "" : "s"}.</p></div>
      ${Object.keys(FL.again).length ? `<div class="card"><h3>Ones to keep practicing</h3><div class="chips">${Object.keys(FL.again).map(id => `<span class="chip">😟 ${esc(BY[id].w)}</span>`).join("")}</div></div>` : ""}
      <button class="big primary" data-act="flHome">Back to my words</button>`; return; }
  const id = FL.queue[0]; const e = BY[id];
  const md = FL.mode[id] || "word";
  const front = md === "word" ? `<div class="stack" style="align-items:center;text-align:center;gap:10px"><span class="pos-tag">${esc(e.pos)}</span><div class="word" style="${wsz(e.w)}">${esc(e.w)}</div><div class="row" style="justify-content:center">${spk(id, "w", "Listen", "icon-l")}</div><p class="muted small">What does it mean? Tap to flip.</p></div>`
    : `<div class="stack" style="align-items:center;text-align:center;gap:12px"><span class="pos-tag">${esc(e.pos)}</span><p class="label">${md === "ko" ? "Which English word means…" : "Which word means…"}</p>
      <p class="${md === "ko" ? "ko" : "def"}" style="font-size:24px;font-weight:800;color:var(--ink)">${esc(md === "ko" ? senseList(e).map(x => x.ko).join(" / ") : e.def)}</p>
      <p class="muted small">${esc(e.w[0])}${" _".repeat(Math.max(0, e.w.length - 1))} · think of the word, then tap to flip.</p></div>`;
  const back = `<div class="stack" style="gap:10px"><div class="row between" style="flex-wrap:nowrap"><div class="word" style="${wsz(e.w)};font-size:34px">${esc(e.w)}</div>${spk(id, "w")}</div>
    ${senseList(e).map(x => `<div class="sense"><span class="pos-tag">${esc(x.pos)}</span><div>${KO() ? `<p class="ko">${esc(x.ko)}</p>` : ""}<p class="def">${esc(x.def || e.def)}</p></div></div>`).join("")}
    ${e.ex && e.ex[0] ? `<div class="ex">${spk(id, "e0")}<p>${exHtml(e.ex[0], e.w)}</p></div>` : ""}</div>`;
  $app.innerHTML = `<div class="topbar"><button class="x" data-act="flHome" aria-label="Close">${I.x}</button><div class="bar"><i style="width:${Math.round(FL.got / FL.total * 100)}%"></i></div><span class="count">${FL.got}/${FL.total} ✓</span></div>
    <span class="eyebrow">Flashcards</span>
    <div class="card flash-card ${FL.flipped ? "flipped" : ""}" ${FL.flipped ? "" : 'data-act="flFlip" role="button" tabindex="0" aria-label="Flip card"'}>${FL.flipped ? back : front}</div>
    ${FL.flipped ? `<p class="label" style="text-align:center">How well did you know it?</p><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
      <button class="opt rate" data-act="flRate" data-r="bad" style="text-align:center"><span style="font-size:34px">😟</span><br><span class="small">Show again soon</span></button>
      <button class="opt rate" data-act="flRate" data-r="mid" style="text-align:center"><span style="font-size:34px">😐</span><br><span class="small">Show later</span></button>
      <button class="opt rate" data-act="flRate" data-r="good" style="text-align:center"><span style="font-size:34px">😊</span><br><span class="small">Got it!</span></button></div>` : ""}`;
}
function flFlip() { if (!FL || FL.flipped) return; FL.flipped = true; render(); speak(FL.queue[0], "w"); }
function flSpeak() { if (FL && view.name === "flash" && FL.queue.length && (FL.mode[FL.queue[0]] || "word") === "word") speak(FL.queue[0], "w"); }
function flRate(r) { const id = FL.queue.shift(); FL.flipped = false;
  if (r === "bad") { FL.again[id] = 1; FL.queue.splice(Math.min(3, FL.queue.length), 0, id); }
  else if (r === "mid") FL.queue.push(id);
  else { FL.got++; award(1, "flashcard"); }
  render(); flSpeak(); }

/* ---------- account set-up (right after the first level test), one thing per screen ---------- */
let SU = 0;
function renderSetup() {
  const s = SET(); const n = (s.textbook ? s.tbNew : 0) + s.grNew; const times = (ST.push && ST.push.times) || [8, 17, 20]; const nm = firstName() || "";
  const hour = h => h < 12 ? h + ":00 am" : h === 12 ? "12:00 pm" : (h - 12) + ":00 pm";
  const sel = i => `<select data-change="remTime" data-i="${i}" style="min-height:50px;border-radius:14px;border:2px solid var(--line);padding:0 10px;font:inherit;font-size:17px;background:#fff;width:100%"><option value="">Off</option>${Array.from({ length: 17 }, (_, k) => k + 6).map(h => `<option value="${h}" ${times[i] === h ? "selected" : ""}>${hour(h)}</option>`).join("")}</select>`;
  const canPush = WW.pushPermission() !== "unsupported"; const ios = /iPhone|iPad/.test(navigator.userAgent); const installed = WW.standalone ? WW.standalone() : false;
  const per = Math.max(1, Math.ceil(n / STUDY_DAYS));
  const steps = [
    { mood: "happy", q: "일주일에 새 단어<br>몇 개 배울까?", sub: "How many new words a week?", body: s.textbook ? `<p class="muted">Your teacher set your plan: <b>${n}</b> words a week.</p>`
      : `<div class="goals">${[[10, "가볍게 · Easy"], [15, "딱 좋아 · Just right"], [20, "열심히 · Serious"], [30, "빡세게 · Intense"]].map(([v, l]) => `<button class="goal" data-act="suWords" data-v="${v}" aria-pressed="${s.grNew === v}"><b style="font-family:var(--f-display);font-size:22px;width:36px">${v}</b>${l}<span class="ck"></span></button>`).join("")}</div><p class="muted small">잘 모르겠으면 15! 나중에 For parents에서 바꿀 수 있어요.</p>` },
    { hero: true, body: `<div class="ob-hero"><div class="mslot hero" data-sc="1.4" data-act="cheer" data-hold="1" data-key="count"></div><div class="big-num" style="animation:introIn .5s .2s both">${n}<small>words</small></div><div class="ob-q" style="animation:introIn .5s .35s both">첫 주에 단어 ${n}개!</div><p class="muted" style="animation:introIn .5s .5s both">하루 ${per}개씩 5일, 그리고 쉬는 날 2일. ${nm ? nm + ", " : ""}넌 할 수 있어!</p></div>` },
    { mood: "wow", q: "매일 알림을<br>보내 줄까?", sub: "A friendly nudge at the times you choose (up to 3).", body: `${canPush ? (pushOn() ? `<div class="fb good">🔔 Reminders are on</div>` : `<button class="big primary" data-act="pushOn">🔔 알림 켜기 · Turn on reminders</button>`) : `<p class="muted small">On iPhone, reminders work after you add Vocaboo to your home screen. You can turn them on later in Me.</p>`}
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%">${sel(0)}${sel(1)}${sel(2)}</div>` },
    { mood: "think", q: "글자 크기는<br>어떤 게 편해?", sub: "Pick what's easiest to read.", body: textCard().replace('<div class="card">', '<div style="width:100%">').replace("<h3>Text size</h3>", "") },
    { mood: "happy", q: "마이크가 잘 되는지<br>확인해 보자.", sub: "You'll practice saying words out loud.", body: `<div style="width:100%;text-align:left">${micCard().replace('<div class="card"', '<div')}</div><p class="muted small">You can skip this and test later in Me → Sound &amp; microphone.</p>` }]
    .concat(installed ? [] : [{ mood: "wow", q: "홈 화면에<br>추가해 두면 편해!", sub: "Add Vocaboo to your home screen — it opens like an app.", body: `<div class="phone-mock"><div class="pm-row" style="width:60%"></div><div class="pm-row"></div><div class="pm-app">${bubbo("happy", 26)} Vocaboo</div><div class="pm-row" style="width:80%"></div><span class="pm-tap" style="right:14px;bottom:18px">${ios ? "⬆️" : "⋮"}</span></div>
      <div class="steps-list">${(ios ? ["아래 공유 버튼 ⬆️ 을 눌러요", "“홈 화면에 추가”를 골라요", "오른쪽 위 “추가”를 눌러요"] : ["오른쪽 위 ⋮ 메뉴를 열어요", "“홈 화면에 추가” 또는 “앱 설치”를 골라요", "“설치”를 눌러요"]).map((t, i) => `<div class="st"><b>${i + 1}</b>${t}</div>`).join("")}</div>` }])
    .concat([{ hero: true, body: `<div class="ob-hero"><div class="mslot hero" data-sc="1.4" data-act="wave" data-key="done"></div><div class="ob-q" style="animation:introIn .5s .25s both">준비 완료! 🎉</div><p class="muted" style="animation:introIn .5s .4s both">매일 단어 몇 개, 짧은 퀴즈, 그리고 말하기 연습. 작은 걸음이 모여 큰 실력이 돼요.</p></div>` }]);
  SU = Math.max(0, Math.min(steps.length - 1, SU)); const st = steps[SU]; const last = SU === steps.length - 1;
  const body = st.hero ? st.body : obAsk(st.mood, st.q, st.sub) + st.body;
  $app.innerHTML = obShell({ back: SU ? "suBack" : "", pct: (SU + 1) / steps.length * 100, body, act: last ? "suDone" : "suNext", btn: last ? "시작하자! 🚀" : "계속 →", disabled: SU === 0 && !s.textbook && !s.grNew });
}
function suWords(v) { const s = Object.assign({}, ST.settings || {}); s.grNew = v; ST.settings = s; ST.planBy = { at: Date.now(), who: "setup" };
  const wk = ST.week; if (wk && !(wk.trained || []).length) { buildWeek(ST, WORDS, effCfg(ST), true); delete ST.week.day; loadPacksFor(weekIds()); } // first week not started: use the new number now
  saveST(); OB_DIR = 0; render(); mascotWrite(); }

/* ---------- spaced review: "Remember these?" words from 1, 2 and 4 weeks ago ---------- */
function spacedIds() {
  const wk = ST.week; if (!wk) return [];
  const H = ST.history || []; const pick = (back, n) => { const k = addDays(wk.key, -7 * back); const h = H.find(x => x.key === k) || H.find(x => x.key < k && x.key >= addDays(k, -3));
    if (!h) return []; return shuffle(h.newIds.filter(id => WORDS[id] && BY[id])).sort((a, b) => (WORDS[a].box || 0) - (WORDS[b].box || 0)).slice(0, n); };
  return [...new Set(pick(1, 3).concat(pick(2, 3), pick(4, 2)))];
}
function spacedCard() {
  if (ST.spacedDay === today()) return `<div class="card row between" style="gap:12px;flex-wrap:nowrap;background:var(--mint-soft)"><div class="stack" style="gap:2px"><b>🧠 Remember these? Done today ✓</b><span class="muted small">Old words stay strong when you see them again.</span></div></div>`;
  const ids = spacedIds(); if (ids.length < 3) return "";
  return `<div class="card row between" style="gap:12px;flex-wrap:nowrap"><div class="stack" style="gap:2px"><b>🧠 Remember these?</b><span class="muted small">${ids.length} words from 1, 2 and 4 weeks ago · about 2 min. Seeing old words again is the best way to never forget them!</span></div><button class="primary" data-act="spaced" style="flex:none">Start</button></div>`;
}
function startSpaced() {
  const ids = spacedIds(); if (!ids.length) return;
  const pool = Object.keys(WORDS).filter(id => BY[id]);
  const types = KO() ? ["mc_ko", "ko_en", "hear_ko", "blank_mc", "dict", "ctx_ko"] : ["mc_def", "def_en", "hear_ko", "blank_mc", "dict"];
  const qs = shuffle(ids).map((id, i) => makeQ2(id, types[i % types.length], pool));
  RUN = { kind: "spaced", qs, i: 0, t0: Date.now(), answered: false, right: 0 };
  startAttempt("spaced", { n: qs.length }); logDid("spaced review"); view = { name: "run" }; render();
  loadPacksFor(ids).then(() => { RUN && (RUN.t0 = Date.now()); autoSpeak(); });
}
function finishSpaced() {
  const n = RUN.qs.length, right = RUN.right; ATT.end = Date.now(); ATT.score = right / n; saveAttempt();
  ST.spacedDay = today(); award(5 * right, "remembered"); bumpStat("spaced"); saveST(); PROG = null;
  const missed = [...new Set(ATT.items.filter(i => !i.ok).map(i => i.id))];
  view = { name: "spacedResult", n, right, missed }; RUN = null; render();
}
function renderSpacedResult() { const v = view;
  $app.innerHTML = `<div style="height:14px"></div><div class="result-hero">${buddy(v.right >= v.n * 0.7 ? "wow" : "happy", 100)}<h1>${v.right === v.n ? "You remembered them all! 🧠" : "You remembered " + v.right + " of " + v.n + "!"}</h1>
    <p style="opacity:.9">${v.missed.length ? "The ones you forgot will come back soon, so you can lock them in." : "These words are strong in your memory."}</p></div>
    ${v.missed.length ? `<div class="card"><h3>Coming back soon</h3><div class="chips">${v.missed.map(id => `<span class="chip">${esc(BY[id].w)} · ${esc(gloss(BY[id]))}</span>`).join("")}</div></div>` : ""}
    <button class="big primary" data-act="home">Done</button>`; }

/* ---------- weekly summary card (to share with family / on Instagram) ---------- */
function weekSummary(which) {
  const wk = ST.week; if (!wk) return null; const H = ST.history || [];
  const h = which === "last" ? H[H.length - 1] : null; const key = h ? h.key : wk.key;
  const newIds = h ? h.newIds : wk.newIds;
  const learnedIds = (h ? newIds.filter(id => WORDS[id]) : packInfo().learnedIds).filter(id => BY[id]);
  const learned = h ? (h.learned != null ? h.learned : learnedIds.length) : learnedIds.length;
  let quiz = 0, xp = 0; for (let i = 0; i < 7; i++) { const d = addDays(key, i); if ((ST.quizDays || []).includes(d)) quiz++; xp += (ST.xpDays || {})[d] || 0; }
  return { key, learned, quiz, xp, words: learnedIds.slice(0, 8).map(id => BY[id].w), streak: streakNow(), grade: ST.level ? gradeWord(ST.level.g) : "", name: firstName() || "My child" };
}
function drawWeekCard(S) {
  const c = document.createElement("canvas"); c.width = 1080; c.height = 1350; const g = c.getContext("2d");
  const css = getComputedStyle(document.documentElement); const ACC = css.getPropertyValue("--accent").trim() || "#FFE24A", INK = css.getPropertyValue("--ink").trim() || "#16141D", BG = css.getPropertyValue("--bg").trim() || "#fff", SOFT = css.getPropertyValue("--soft").trim() || "#F4F2F9", MUT = css.getPropertyValue("--muted").trim() || "#6B6680";
  const F = (w, s, mono) => `${w} ${s}px ${mono ? '"IBM Plex Mono", Menlo, monospace' : '"Bricolage Grotesque", "IBM Plex Sans KR", system-ui, sans-serif'}`;
  g.fillStyle = BG; g.fillRect(0, 0, 1080, 1350);
  const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const wrap = (t, x, y, maxW, lh) => { const words = t.split(" "); let line = "", yy = y; for (const w of words) { const test = line ? line + " " + w : w; if (g.measureText(test).width > maxW && line) { g.fillText(line, x, yy); line = w; yy += lh; } else line = test; } g.fillText(line, x, yy); return yy; };
  // Bubbo
  const bx = 80, by = 80; g.fillStyle = ACC; g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.moveTo(bx + 28, by); g.lineTo(bx + 112, by); g.arcTo(bx + 140, by, bx + 140, by + 28, 28); g.lineTo(bx + 140, by + 84); g.arcTo(bx + 140, by + 112, bx + 112, by + 112, 28); g.lineTo(bx + 56, by + 112); g.lineTo(bx + 24, by + 138); g.lineTo(bx + 24, by + 110); g.arcTo(bx, by + 108, bx, by + 84, 26); g.lineTo(bx, by + 28); g.arcTo(bx, by, bx + 28, by, 28); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = INK; g.beginPath(); g.ellipse(bx + 48, by + 50, 8, 10, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(bx + 92, by + 50, 8, 10, 0, 0, 7); g.fill(); g.lineWidth = 7; g.lineCap = "round"; g.beginPath(); g.moveTo(bx + 52, by + 74); g.quadraticCurveTo(bx + 70, by + 92, bx + 88, by + 74); g.stroke();
  g.textAlign = "left"; g.fillStyle = INK; g.font = F(800, 52); g.fillText("Vocaboo", 250, 140); g.fillStyle = MUT; g.font = F(500, 28, true);
  const a = new Date(S.key + "T12:00:00"), b = new Date(addDays(S.key, 6) + "T12:00:00"); g.fillText(`WEEK OF ${a.getMonth() + 1}/${a.getDate()} – ${b.getMonth() + 1}/${b.getDate()}`, 250, 186);
  g.fillStyle = INK; g.font = F(800, 86); let y = wrap(`${S.name} learned ${S.learned} new word${S.learned === 1 ? "" : "s"} this week!`, 80, 360, 920, 96);
  // highlighter under the number line
  g.font = F(700, 36); g.fillStyle = ACC; rr(80, y + 40, 420, 56, 12); g.fill(); g.fillStyle = INK; g.fillText(S.learned >= 10 ? "Amazing work!" : S.learned ? "Great progress!" : "Every step counts!", 96, y + 80);
  const tiles = [["streak", S.streak + "-day"], ["quiz days", S.quiz + "/7"], ["word level", S.grade.replace("Grade ", "Gr. ") || "–"], ["XP this week", String(S.xp)]];
  tiles.forEach(([lab, big], i) => { const x = 80 + (i % 2) * 470, ty = y + 150 + Math.floor(i / 2) * 200; g.fillStyle = SOFT; rr(x, ty, 450, 176, 28); g.fill(); g.strokeStyle = INK; g.lineWidth = 3; rr(x, ty, 450, 176, 28); g.stroke();
    g.fillStyle = INK; g.font = F(800, 64); g.fillText(big, x + 30, ty + 92); g.font = F(500, 24, true); g.fillStyle = MUT; g.fillText(lab.toUpperCase(), x + 32, ty + 140); });
  let wy = y + 600; if (S.words.length) { g.font = F(500, 26, true); g.fillStyle = MUT; g.fillText("WORDS I LEARNED", 80, wy); wy += 24; let x = 80; g.font = F(800, 34);
    for (const w of S.words) { const tw = g.measureText(w).width + 48; if (x + tw > 1000) { x = 80; wy += 74; } if (wy > 1180) break; g.fillStyle = ACC; rr(x, wy, tw, 58, 14); g.fill(); g.fillStyle = INK; g.fillText(w, x + 24, wy + 41); x += tw + 14; } }
  g.font = F(500, 24, true); g.fillStyle = MUT; g.fillText("A FEW ENGLISH WORDS A DAY · VOCABOO", 80, 1290);
  return c;
}
let CARD_WHICH = "this";
function weekCardSheet(which) {
  CARD_WHICH = which || CARD_WHICH; const S = weekSummary(CARD_WHICH); if (!S) return; const c = drawWeekCard(S); const url = c.toDataURL("image/png");
  const hasLast = (ST.history || []).length > 0;
  sheet(`<h2 style="margin:0">📸 Weekly card</h2>${hasLast ? `<div class="seg" style="width:100%"><button data-act="cardWhich" data-w="this" aria-pressed="${CARD_WHICH === "this"}" style="flex:1">This week</button><button data-act="cardWhich" data-w="last" aria-pressed="${CARD_WHICH === "last"}" style="flex:1">Last week</button></div>` : ""}
    <img src="${url}" alt="Weekly summary card" style="width:100%;border-radius:18px;box-shadow:var(--shadow)">
    <button class="big primary" data-act="cardShare">📤 Share or save</button><p class="muted small">Share it with family on KakaoTalk or post it to your Instagram story! 가족에게 보내거나 인스타그램에 올려 보세요.</p>`);
}
async function shareWeekCard() {
  const S = weekSummary(CARD_WHICH); const c = drawWeekCard(S);
  const blob = await new Promise(r => c.toBlob(r, "image/png")); const file = new File([blob], `vocaboo-week-${S.key}.png`, { type: "image/png" });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Vocaboo weekly card", text: `${S.name} learned ${S.learned} new words this week on Vocaboo!` }); return; } } catch (e) { if (e && e.name === "AbortError") return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); toast("Saved to your downloads");
}
// first time the app opens in a new week: show last week's card once
function maybeWeekCard() {
  const H = ST.history || []; const last = H[H.length - 1]; if (!last || ST.cardShown === last.key) return false;
  ST.cardShown = last.key; saveST(); const S = weekSummary("last"); if (!S || (!S.learned && !S.quiz)) return false;
  setTimeout(() => { if (view.name === "tabs") { weekCardSheet("last"); } }, 600); return true;
}

/* ---------- sentence coach (AI) ---------- */
let CO = null;
function coachWords() { const wk = weekIds(); const seen = wk.filter(id => WORDS[id]);
  return shuffle(seen.length >= 2 ? seen : wk).sort((a, b) => (WORDS[a] ? WORDS[a].box : 0) - (WORDS[b] ? WORDS[b].box : 0)).slice(0, coachTarget()); }
async function startCoach() {
  const ids = coachWords(); if (!ids.length) { toast("No words yet"); return; }
  CO = { ids, i: 0, text: "", res: null, busy: false, listening: false, err: "", done: 0 };
  startAttempt("coach", { n: ids.length }); logDid("sentence coach");
  view = { name: "coach" }; render(); maybeTour("coach"); await loadPacksFor(ids);
}
function coachPrompt(e, sentence) {
  return `You are a warm, encouraging English tutor for a ${ageOf(ST) || 11}-year-old ${KO() ? "Korean " : ""}student learning English (vocabulary about US ${ST.level ? gradeWord(ST.level.g).toLowerCase() : "grade 2-3"} level).
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
  CO.sayListening = true; CO.sayHeard = ""; render(); const skey = "coachsay:" + CO.ids[CO.i]; voiceStart();
  let decided = false, last = "", matched = "", q = null, timer = null; const target = CO.sayTarget; const mw = micWatch(rec);
  const finish = () => { if (decided) return; decided = true; clearTimeout(q); clearTimeout(timer); try { rec.abort(); } catch (x) {} CO.sayListening = false;
    const text = matched || last; const ok = !!matched; CO.sayTries++; voiceStop(skey).then(v => { if (v && ok) voiceSaveBest(skey, target); });
    ATT.items.push({ id: CO.ids[CO.i], t: "saysent", ok, ans: text ? String(text).slice(0, 120) : QUIET_ANS[quietKind(mw)], ms: 0 }); saveAttempt();
    if (ok) { CO.sayOk = true; award(5, "say"); bumpStat("say"); CO.sayHeard = "✓ " + pickOne(["Perfect reading!", "Sounds great!", "Beautiful!", "Well said!"]); }
    else CO.sayHeard = text ? "I heard: “" + text + "”. Listen and try again." : QUIET_MSG[quietKind(mw)];
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
  CO.listening = true; CO.err = ""; CO.text = ""; render(); const vkey = "coach:" + CO.ids[CO.i] + ":" + (CO.take = (CO.take || 0) + 1); CO.vkey = vkey; voiceStart();
  let quiet = null; const box = () => document.getElementById("coachText");
  const end = () => { clearTimeout(quiet); try { rec.stop(); } catch (x) {} };
  rec.onresult = ev => { let j = ""; for (let i = 0; i < ev.results.length; i++) j += " " + ev.results[i][0].transcript; CO.text = j.trim(); const b = box(); if (b) b.value = CO.text;
    clearTimeout(quiet); quiet = setTimeout(end, 2200); };
  rec.onerror = ev => { if (/not-allowed|service-not-allowed/.test(ev.error)) CO.err = "blocked"; };
  rec.onend = () => { CO.listening = false; clearTimeout(quiet); voiceStop(vkey).then(() => render()); render(); };
  quiet = setTimeout(end, 9000);
  try { rec.start(); } catch (err) { CO.listening = false; CO.err = "unsupported"; render(); }
}
function coachMsg(mood, html) { return `<div class="msg">${bubbo(mood, 40)}<div class="bub">${html}</div></div>`; }
function meMsg(text, vkey) { return `<div class="msg me"><div class="bub">${vkey && voiceHas(vkey) ? `<div class="meta"><button type="button" class="play-sm" data-act="playMine" data-key="${esc(vkey)}" aria-label="내 목소리 듣기">${I.play}</button>내 목소리</div>` : ""}${esc(text)}</div></div>`; }
function renderCoach() {
  const e = BY[CO.ids[CO.i]]; const r = CO.res; const chat = [];
  chat.push(coachMsg("happy", `<b>${esc(e.w)}</b>로 문장을 하나 말해 볼까? ${CO.i === 0 ? "네 이야기로 만들면 더 좋아!" : "이번에도 네 이야기로!"}<div class="muted small" style="margin-top:4px">${esc(senseList(e).map(sgloss).join(" / "))} · 예: ${exHtml(e.ex[0], e.w)}</div>`));
  let foot = "";
  if (CO.busy) { chat.push(meMsg(CO.text, CO.vkey)); chat.push(coachMsg("think", `<span class="muted">읽고 있어… 🧐</span>`)); }
  else if (r && !r.error && !r.offline) {
    chat.push(meMsg(CO.text, CO.vkey));
    const fixed = r.correct ? "" : `<div class="card ink" style="padding:12px 14px;gap:8px;margin-top:8px"><div style="font-size:17px;line-height:1.65">${esc(r.fixed)}</div>${r.why_ko ? `<div class="small" style="color:var(--muted);border-top:1px solid var(--line);padding-top:8px">${esc(r.why_ko)}</div>` : ""}<div class="row"><button class="ghost" data-act="say" data-text="${esc(r.fixed)}" style="min-height:32px;display:inline-flex;align-items:center;gap:6px">${ICON_SPK.replace("<svg", '<svg width="16" height="16"')} 듣기</button></div></div>`;
    chat.push(coachMsg(r.correct ? "cheer" : "happy", `<b>${esc(CO.head || (r.correct ? "완벽한 문장이야! 🌟" : "좋은 시도야! 💪"))}</b>${r.praise ? `<br><span>${esc(r.praise)}</span>` : ""}${fixed}`));
    if (r.level_up) chat.push(coachMsg("wow", `<div class="eyebrow" style="font-size:11px">LEVEL UP · 한 단계 더</div><div style="font-size:16px;margin-top:2px">${exHtml(r.level_up, e.w)}</div>${r.level_up_tip ? `<div class="muted small" style="margin-top:4px">💡 ${esc(r.level_up_tip)}</div>` : ""}<div class="row"><button class="ghost" data-act="say" data-text="${esc(r.level_up)}" style="min-height:32px;display:inline-flex;align-items:center;gap:6px">${ICON_SPK.replace("<svg", '<svg width="16" height="16"')} 듣기</button></div>`));
    else if (r.another) chat.push(coachMsg("happy", `이렇게도 말할 수 있어: <b>${exHtml(r.another, e.w)}</b>`));
    if (!CO.sayOk) { chat.push(coachMsg("wow", `이제 이 문장을 소리 내어 읽어 봐:<br><b>${esc(CO.sayTarget || "")}</b>${CO.sayHeard ? `<div class="fb ${CO.sayOk ? "good" : "bad"}" style="margin-top:8px;padding:8px 12px;font-size:14px">${esc(CO.sayHeard)}</div>` : ""}`));
      foot = `<div class="row" style="gap:8px"><button class="ghost" data-act="say" data-text="${esc(CO.sayTarget || "")}" style="min-height:36px;display:inline-flex;align-items:center;gap:6px">${ICON_SPK.replace("<svg", '<svg width="16" height="16"')} 듣기</button><button class="ghost" data-act="coachRetry" style="min-height:36px">새 문장</button>${CO.sayTries >= 3 ? `<button class="ghost" data-act="coachSaySkip" style="min-height:36px">건너뛰기</button>` : ""}</div>
        <div class="row between" style="flex-wrap:nowrap"><span class="muted small">${CO.sayListening ? "듣고 있어요… 문장 전체를 읽어요" : "눌러서 읽기"}</span><button class="mic ${CO.sayListening ? "on" : ""}" data-act="coachSay" ${CO.sayListening ? "disabled" : ""} aria-label="Tap, then read" style="width:64px;height:64px;min-height:64px;align-self:auto">${ICON_MIC}</button></div>`; }
    else { chat.push(coachMsg("cheer", `잘 읽었어! ${CO.i + 1 < CO.ids.length ? "다음 단어로 가자." : "오늘 문장 연습 끝!"}`));
      foot = `<div class="row"><button class="big" data-act="coachRetry" style="flex:1">새 문장</button><button class="big primary" data-act="coachNext" style="flex:1.4" id="nextBtn">${CO.i + 1 < CO.ids.length ? "다음 단어 →" : "완료 🎉"}</button></div>`; }
  } else {
    if (r && (r.error || r.offline)) chat.push(coachMsg("sad", `지금은 코치가 쉬고 있어${r.error ? " (" + esc(r.error) + ")" : ""}. 네 문장은 선생님께 저장했어.`));
    if (CO.listening) chat.push(coachMsg("wow", "듣고 있어… 다 말하면 잠깐 기다려 줘."));
    else if (CO.text) chat.push(meMsg(CO.text, CO.vkey));
    if (CO.err === "blocked") chat.push(coachMsg("think", micBlockedHtml("아래에 직접 써도 돼.")));
    foot = `${CO.text && !CO.listening ? `<div class="row" style="gap:8px"><button class="ghost" data-act="coachRedo" style="min-height:36px">다시 말하기</button><button class="ghost" data-act="coachType" style="min-height:36px">고치기</button></div>` : ""}
      ${CO.typing || (!SR) ? `<textarea id="coachText" rows="2" placeholder="문장을 써도 돼요" style="font:inherit;font-size:17px;padding:12px 14px;border-radius:16px;border:1.5px solid var(--line);width:100%;resize:vertical">${esc(CO.text)}</textarea>` : `<input id="coachText" type="hidden" value="${esc(CO.text)}">`}
      <div class="row between" style="flex-wrap:nowrap"><span class="muted small">${CO.listening ? "듣고 있어요…" : CO.text ? "" : "눌러서 문장 말하기"}${!CO.typing && !CO.text && !CO.listening ? ` · <button class="ghost" data-act="coachType" style="min-height:24px;padding:0;font-size:13px">타이핑</button>` : ""}</span>
        ${CO.text && !CO.listening ? `<button class="big primary" data-act="coachCheck" style="width:auto;padding:0 22px;min-height:56px">확인 →</button>` : `<button class="mic ${CO.listening ? "on" : ""}" data-act="coachMic" ${CO.listening ? "disabled" : ""} aria-label="Tap, then speak" style="width:64px;height:64px;min-height:64px;align-self:auto">${ICON_MIC}</button>`}</div>
      ${r && (r.error || r.offline) ? `<button class="ghost" data-act="coachNext" style="align-self:center">다음 단어로 건너뛰기</button>` : ""}`;
  }
  $app.innerHTML = `<div class="topbar"><button class="x" data-act="quit" aria-label="Stop">${I.x}</button><div class="stack" style="gap:0;flex:1"><b>Bubbo랑 문장 만들기</b><span class="eyebrow" style="font-size:11px">WORD: ${esc(e.w).toUpperCase()} · ${CO.i + 1} OF ${CO.ids.length}</span></div>${spk(e.id, "w")}</div>
    <div class="chat" style="flex:1;padding-bottom:8px">${chat.join("")}</div>
    <div class="stack" style="gap:10px;position:sticky;bottom:0;background:var(--bg);padding:10px 0 4px;border-top:1px solid var(--line)">${foot}</div>`;
  const ta = document.getElementById("coachText"); if (ta && CO.typing && ta.tagName === "TEXTAREA") ta.focus();
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
function storyShape() { const lv = ST.level ? ST.level.g : 2, age = ageOf(ST) || 11; const g = Math.max(lv, Math.min(age - 6, lv + 1));
  if (g < 3.5) return { parts: 4, words: "45-65", q: 2, kinds: "1 about what happened, 1 about what a target word means there" };
  if (g < 6.5) return { parts: 4, words: "80-110", q: 3, kinds: "1 about what happened, 1 about why a character did something or how they felt (inference), 1 about what a target word means there" };
  if (g < 9.5) return { parts: 5, words: "120-160", q: 4, kinds: "1 main idea, 1 detail, 1 inference, 1 about what a target word means in context" };
  return { parts: 5, words: "160-210", q: 4, kinds: "1 main idea or theme, 1 inference, 1 author's purpose or tone, 1 about what a target word means in context" }; }
function storyPrompt(ids) {
  const list = ids.map(id => `${BY[id].w} (${senseList(BY[id]).map(s => KO() ? s.ko : s.def).join(" / ")})`).join("; ");
  const age = ageOf(ST) || 11; const lv = ST.level ? Math.max(1, Math.round(ST.level.g)) : 2; const sh = storyShape();
  return `Write an engaging story for a ${age}-year-old ${KO() ? "Korean " : ""}student learning English (about US grade ${Math.max(1, lv - 1)}-${lv} reading level), split into ${sh.parts} parts.
Use EVERY one of these target words at least once across the story (normal forms like -s, -ed, -ing are fine): ${list}
Rules: each part is ${sh.words} words, friendly and age-appropriate, one clear plot that continues from part to part, a relatable main character (can be Korean). ${age >= 13 ? "Make it interesting for a teenager (school life, friendship, mystery, sports, science, adventure); vary sentence length." : "Simple, clear sentences."} No violence or scary content.
After each part, write ${sh.q} multiple-choice questions in simple English about THAT part only: ${sh.kinds}. Each has 4 short options and exactly one correct answer.
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
      data.created = Date.now(); data.words = wk.newIds; data.needsAudio = true; await setDoc(storyPath(), data); ST.storyAudioPending = weekKey(); saveST();
    }
    if (data && data.prepKey == null && data.parts) {
      if (data.audio && data.audio.parts) { try { const au = await getAll(storyPath() + "/audio"); STORY.ai = {}; au.forEach(x => STORY.ai[x._id] = x.b64); } catch (e) {} if (ST.storyAudioPending) { delete ST.storyAudioPending; saveST(); } }
      else if (!data.needsAudio) { data.needsAudio = true; await setDoc(storyPath(), data); ST.storyAudioPending = weekKey(); saveST(); }
    }
    data = normStory(data);
    STORY = Object.assign(STORY, { loading: false, data, total: data.parts.reduce((s, p) => s + (p.questions || []).length, 0) });
  } catch (err) { console.warn(err); STORY = Object.assign(STORY, { loading: false, error: String(err && (err.code || err.message) || err) }); }
  if (view.name === "story") { render(); if (STORY && STORY.data) maybeTour("story"); }
}
function preparedStory(ids) { const set = ids.slice().sort().join("|");
  return (window.__STORIES__ || []).find(s => s.ids.slice().sort().join("|") === set) || null; }
const STORY_AUDIO = {};
function loadStoryAudio(key) { if (STORY_AUDIO[key]) return Promise.resolve(); return fetch(AUDIO_BASE + "story_" + key + ".json").then(r => r.ok ? r.json() : {}).catch(() => ({})).then(j => { STORY_AUDIO[key] = j; }); }
function storyClip(pi, si) { const d = STORY && STORY.data; if (d && d.prepKey == null && STORY.ai && si === "all" && STORY.ai[pi]) return "data:audio/mpeg;base64," + STORY.ai[pi]; if (!d || d.prepKey == null) return null; const a = STORY_AUDIO[d.prepKey] || {}; const b = a[d.prepKey + "_" + pi + "_" + si]; return b ? "data:audio/mpeg;base64," + b : null; }
let paraToken = 0;
function playClips(list, done) { // list of {src,text}
  const my = ++paraToken; let i = 0;
  const nextOne = () => { if (my !== paraToken) return; if (i >= list.length) { if (STORY && STORY.playing != null) { STORY.playing = null; STORY.paused = false; if (view.name === "story") render(); } done && done(); return; } const it = list[i++];
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
  if (S.loading) { $app.innerHTML = top + loaderHtml("Writing this week's story… 📖"); return; }
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
    <div class="card story-p"><div class="row between" style="flex-wrap:nowrap;align-items:flex-start"><p class="story-text">${storyHtmlPara(P.en, ids)}</p><button class="round" data-act="readPara" data-i="${S.part}" aria-label="${S.playing === S.part && !S.paused ? "Pause" : "Listen"}" style="${S.playing === S.part ? "background:var(--violet);color:#fff" : ""}">${S.playing === S.part ? (S.paused ? "▶" : "⏸") : ICON_SPK}</button></div>
      ${d.prepKey == null && d.needsAudio && !S.ai ? `<p class="muted small">🎙️ Bella is recording this story. The natural voice will be ready in about 10–20 minutes.</p>` : ""}
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
function readPara(i) { const p = STORY.data.parts[i]; if (!p) return;
  if (STORY.playing === i) { // second tap pauses, third resumes
    if (!STORY.paused) { STORY.paused = true; try { player.pause(); } catch (e) {} if (window.speechSynthesis) speechSynthesis.pause(); return render(); }
    STORY.paused = false; if (player.src && player.currentTime > 0 && !player.ended) { player.play().catch(() => {}); } else if (window.speechSynthesis) speechSynthesis.resume(); return render(); }
  stopAudio(); paraToken++; STORY.playing = i; STORY.paused = false; setTimeout(render, 0);
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
  rec.onerror = ev => { if (/not-allowed|service-not-allowed/.test(ev.error)) { R.listening = false; toast("The microphone is off. See ⚙️ My settings → Microphone"); render(); } };
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

/* write this week's story in the background so Bella can record it before the student opens it */
async function prepStory() {
  try { if (!WW.ask || !ST || !ST.week || !readyForWeeks() || IS_OWNER) return; const wk = ST.week, key = weekKey();
    if (ST.storyPrepped === key || preparedStory(wk.newIds)) return;
    const snap = await db.doc(storyPath()).get(); if (snap.exists) { ST.storyPrepped = key; return; }
    const raw = await WW.ask(storyPrompt(wk.newIds)); const m = raw.match(/\{[\s\S]*\}/); const data = JSON.parse(m ? m[0] : raw);
    if (!data.parts || !data.parts.length) return;
    const again = await db.doc(storyPath()).get(); if (again.exists) return;
    data.created = Date.now(); data.words = wk.newIds; data.needsAudio = true; data.pre = true;
    await setDoc(storyPath(), data); ST.storyPrepped = key; ST.storyAudioPending = key; saveST();
  } catch (e) { console.warn("prepStory", e); }
}

/* trumpet fanfare (made with Web Audio, no file needed) */
let FAN_CTX = null;
function fanfare() { try { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; FAN_CTX = FAN_CTX || new AC(); const c = FAN_CTX; if (c.state === "suspended") c.resume();
  const notes = [[392, 0, .14], [523.25, .15, .14], [659.25, .30, .14], [783.99, .45, .55], [659.25, 1.02, .12], [783.99, 1.16, .7]]; const t0 = c.currentTime + .05;
  const out = c.createGain(); out.gain.value = .22; out.connect(c.destination);
  notes.forEach(([f, at, d]) => { [1, 2.003].forEach((m, k) => { const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = f * m;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200; const g = c.createGain(); const a = t0 + at;
    g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(k ? .25 : 1, a + .03); g.gain.setValueAtTime(k ? .2 : .8, a + d * .7); g.gain.linearRampToValueAtTime(0, a + d + .08);
    o.connect(lp); lp.connect(g); g.connect(out); o.start(a); o.stop(a + d + .1); }); });
} catch (e) {} }
/* "today's words done" popup: learn 2 more or stop */
function dayDonePopup(n, more) { const P = packInfo(); const left = P ? P.remaining : 0;
  const el = document.createElement("div"); el.className = "cel"; el.id = "dayDone"; el.setAttribute("role", "dialog");
  el.innerHTML = `<div class="cel-card"><div class="cel-icon lv">${bubbo("cheer", 120, null, "act-cheer")}</div><h2>${more ? "You did it! 🌟" : "Today's words done! 🎉"}</h2>
    <p class="muted">${more ? "You learned " + n + " extra word" + (n === 1 ? "" : "s") + "." : "You finished today's goal. Amazing work!"}</p>
    ${left ? `<p style="font-weight:800;margin:4px 0 0">Want to learn more?</p><button class="big primary" data-act="moreYes">Yes! ${Math.min(2, left)} more word${Math.min(2, left) === 1 ? "" : "s"} 🚀</button><button class="big" data-act="moreNo">I'm done for today 👋</button>`
      : `<p style="font-weight:800">You learned every word this week! 🏆</p><button class="big primary" data-act="moreNo">Yay!</button>`}</div>`;
  document.body.appendChild(el); confetti(el); fanfare(); }
function closeDayDone() { const el = document.getElementById("dayDone"); if (el) el.remove(); }

/* ---------- level test, profile, goals, language, menu ---------- */
const GRADED = BANK.filter(e => typeof e.g === "number");
const TEST_IDS = (window.__TEST__ || []).filter(id => BY[id] && typeof BY[id].g === "number");
const KO = () => !(ST && ST.settings && ST.settings.lang === "en");
const gloss = e => KO() ? e.ko : e.def;
const KR_TAG = { 1: "초등 필수", 2: "중·고 필수", 3: "고등 선택" };
const krBadge = e => e && e.kr ? `<span class="pill sun" title="Korean national curriculum word">🇰🇷 ${KR_TAG[e.kr]}</span>` : "";
const sgloss = s => KO() ? s.ko : s.def;
function ageOf(st) { const p = st && st.profile; if (!p) return null; if (p.dob) { const d = new Date(p.dob + "T12:00:00"), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--; return a; } return p.age != null ? p.age : null; }
const MAXG = 13; // scale K–12
function gradeLabel(g) { if (g == null || isNaN(g)) return "–"; if (g < 0.5) return "K"; if (g >= 12.95) return "12+"; return (Math.round(g * 10) / 10).toFixed(1); }
function gradeWord(g) { const l = gradeLabel(g); return l === "K" ? "Kindergarten" : l === "12+" ? "Grade 12+" : "Grade " + l; }
function defaultSettings(st) { const legacy = !!(st && st.placement && st.placement.byBook);
  return legacy ? { lang: "ko", textbook: true, tbNew: 12, grNew: 8, review: 10 } : { lang: "ko", textbook: false, tbNew: 12, grNew: 15, review: 10 }; }
function SET(st) { st = st || ST; return Object.assign(defaultSettings(st), (st && st.settings) || {}); }
function effCfg(st) { const s = SET(st);
  return Object.assign({}, CFG, { textbook: !!s.textbook, tbNew: s.textbook ? s.tbNew : 0, grNew: s.grNew, newPerWeek: (s.textbook ? s.tbNew : 0) + s.grNew, reviewPerWeek: s.review, startUnit: s.startUnit || CFG.startUnit }); }
function studentHome() {
  if (!ST.profile) return "onboard";
  if (ST.rejected) return "rejected";
  if (ST.approved === false) return "pending";
  if (!ST.level || ST.levelRetake) return "levelIntro";
  if (SET().textbook && !ST.placement.done) return "placementIntro";
  return "tabs";
}
const readyForWeeks = () => !!(ST && ST.profile && ST.approved !== false && !ST.rejected && ST.level && (!SET().textbook || ST.placement.done));
const firstName = () => (ST && ST.profile && ST.profile.name) || "";

/* new words picked from the graded list, just above her level */
function gradedPick(st, words, used, n) {
  const L = st.level ? st.level.g : 2; const known = new Set((st.level && st.level.known) || []); const s = SET(st);
  const out = []; const ok = id => BY[id] && !used.has(id) && !words[id] && !out.includes(id);
  (st.gradedPool || []).forEach(id => { if (out.length < n && ok(id)) out.push(id); });
  st.gradedPool = (st.gradedPool || []).filter(id => !out.includes(id) && !used.has(id) && !words[id]);
  if (out.length < n) {
    const kor = s.kor != null ? s.kor : s.lang !== "en"; const age = ageOf(st) || 11;
    const bonus = e => !kor || !e.kr ? 0 : e.kr === 1 ? 1.5 : e.kr === 2 ? 1.2 : age >= 14 ? 1.0 : 0.4; // Korean school words come first
    const base = e => !e.soft && (!s.textbook || e.book === "G" || e.book === "H") && !known.has(e.id) && ok(e.id);
    // a few challenge words (1–2.5 grades above her level) mixed in with at-level words
    const mix = st._mix != null ? st._mix : 0.2; const nC = Math.round((n - out.length) * mix);
    const hard = shuffle(GRADED.filter(e => base(e) && e.kr !== 1 && e.g >= L + 1 && e.g <= L + 2.5)).sort((a, b) => (b.kr ? 1 : 0) - (a.kr ? 1 : 0)).slice(0, nC);
    hard.forEach(e => out.push(e.id));
    const below = st._mix != null ? 0 : (kor ? 1.5 : 0.3); // after a test-out: nothing below her level
    const cand = GRADED.filter(e => base(e) && e.g >= L - (e.kr ? below : 0.3) && (st._mix == null || e.g >= L)).sort((a, b) => (a.g - bonus(a)) - (b.g - bonus(b)));
    for (const e of cand) { if (out.length >= n) break; out.push(e.id); }
    st._hard = hard.map(e => e.id);
  }
  return out;
}

/* ---------- onboarding ---------- */
/* onboarding: one question per screen, Bubbo asks */
let OB = 0, OB_INTRO = true, OB_DIR = 1; // OB_DIR: 1 forward, -1 back, 0 re-render in place
const GOALS = [["school", "학교 영어 성적", "📝"], ["speak", "말하기 자신감", "🗣️"], ["read", "영어 책 읽기", "📚"], ["test", "시험 준비 (TOEFL, 수능…)", "🎯"], ["fun", "그냥 재미있게!", "🎈"]];
function obAsk(mood, q, sub) { return `<div class="ob-ask"><div class="mslot" data-hold="1" data-sc=".82" data-key="q"></div><div class="bub" style="flex:1"><div class="ob-q">${q}</div>${sub ? `<div class="muted" style="margin-top:6px">${sub}</div>` : ""}</div></div>`; }
/* shared shell for the question screens: back arrow + progress bar on top, one big button at the bottom */
function obShell(opt) { const dir = OB_DIR; OB_DIR = 0;
  const anim = dir === 0 ? "" : dir < 0 ? " back" : ""; const style = dir === 0 ? ' style="animation:none"' : "";
  return `<${opt.form ? `form data-form="${opt.form}"` : "div"} class="ob-wrap">
    <div class="ob-top">${opt.back ? `<button type="button" class="ob-bk" data-act="${opt.back}" aria-label="Back"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>` : ""}<div class="ob-bar"><i style="width:${Math.round(opt.pct)}%"></i></div></div>
    <div class="ob-screen${anim}"${style}>${opt.body}</div>
    <div class="ob-foot">${opt.foot || ""}<button class="big primary" id="obGo" type="${opt.form ? "submit" : "button"}" ${opt.act ? `data-act="${opt.act}"` : ""} ${opt.disabled ? "disabled" : ""}>${opt.btn}</button></div></${opt.form ? "form" : "div"}>`; }
function obSteps() { const p = ST.profile || {}; const dob = ST._dob || p.dob || ""; const age = dob ? ageOf({ profile: { dob } }) : null; const kid = age != null && age < 14;
  return ["name", "dob"].concat(kid ? ["consent"] : []).concat(["lang", "theme", "goal"]); }
function obCanGo() { const st = obSteps()[OB]; const v = id => ((document.getElementById(id) || {}).value || "").trim();
  if (st === "name") return !!v("obName"); if (st === "dob") return !!(v("obY") && v("obM") && v("obD"));
  if (st === "consent") return !!(v("obParent") && (document.getElementById("obConsent") || {}).checked);
  if (st === "lang") return !!(ST._lang || (ST.settings && ST.settings.lang)) || true; if (st === "goal") return (ST._goals || []).length > 0; return true; }
function obReady(typed) { const b = document.getElementById("obGo"); if (b) b.disabled = !obCanGo(); if (typed) mascotWrite(); }
function renderOnboard() {
  const p = ST.profile || {}; const dob = ST._dob || p.dob || ""; const age = dob ? ageOf({ profile: { dob } }) : null;
  const name = ST._name != null ? ST._name : (p.name || ""); const lang = ST._lang || (ST.settings && ST.settings.lang) || "ko";
  const steps = obSteps(); OB = Math.max(0, Math.min(steps.length - 1, OB)); const st = steps[OB]; const last = OB === steps.length - 1;
  if (OB_INTRO && OB === 0 && !p.name) { OB_DIR = 0;
    $app.innerHTML = `<div class="ob-wrap"><div class="ob-screen" style="animation:none"><div class="ob-hero"><div class="bub">안녕! 난 <b>Bubbo</b>야.<br>몇 가지만 물어보고 시작할게!</div><div class="mslot hero" data-sc="1.5" data-act="run" data-key="intro"></div><p class="muted">Hi, I'm Bubbo. A few quick questions and we're off.</p></div></div>
      <div class="ob-foot"><button class="big primary" data-act="obIntroGo">계속 →</button><p class="muted small" style="text-align:center;margin-top:10px">계속하면 <a href="#" data-act="privacy">개인정보 안내</a>에 동의하는 거예요.</p></div></div>`; return; }
  let body = "";
  if (st === "name") body = obAsk("happy", "네 이름은 뭐야?", "What's your name?") + `<input id="obName" type="text" autocomplete="given-name" value="${esc(name)}" placeholder="이름 · Your name" maxlength="30" autofocus data-input="obReady">`;
  else if (st === "dob") body = obAsk("happy", `반가워, ${esc(name.trim() || "친구")}!<br>생일은 언제야?`, "When's your birthday? 단어 레벨을 맞추는 데 써요.") + dobSelects(dob) + `<input id="obDob" type="hidden" value="${esc(dob)}">${age != null ? `<p class="muted small">만 ${age}세</p>` : ""}`;
  else if (st === "consent") body = obAsk("think", "부모님께 한 가지만<br>여쭤볼게요.", `${esc(name.trim())}는 만 14세 미만이라 보호자 동의가 필요해요.`) + `<div class="card"><div class="field"><label for="obParent">보호자 이름 · Parent or guardian</label><input id="obParent" type="text" value="${esc(ST._parent || "")}" maxlength="40" data-input="obReady"></div>
      <label class="row" style="gap:10px;align-items:flex-start;font-weight:700"><input id="obConsent" type="checkbox" ${ST._consent ? "checked" : ""} style="width:22px;height:22px;flex:none;margin-top:2px" data-change="obReady"><span>저는 보호자이며 <a href="#" data-act="privacy">개인정보 안내</a>에 동의합니다. I'm the parent/guardian and I agree to the privacy note.</span></label></div>`;
  else if (st === "lang") body = obAsk("happy", "단어 뜻은 어떻게<br>보여 줄까?", "How should I show meanings?") + `<div class="goals"><button type="button" class="goal" data-act="obLang" data-v="ko" aria-pressed="${lang !== "en"}"><span style="font-size:22px">🇰🇷</span>영어 + 한국어 뜻<span class="ck"></span></button><button type="button" class="goal" data-act="obLang" data-v="en" aria-pressed="${lang === "en"}"><span style="font-size:22px">🇺🇸</span>English only<span class="ck"></span></button></div>`;
  else if (st === "theme") body = obAsk("cheer", "네 Vocaboo 색을<br>골라 봐!", "Pick your colors. 언제든 바꿀 수 있어.") + themePicker();
  else if (st === "goal") body = obAsk("wow", "영어, 왜 배우고 싶어?", "What's your goal? 여러 개 골라도 돼요.") + `<div class="goals">${GOALS.map(([k, l, ic]) => `<button type="button" class="goal" data-act="obGoal" data-v="${k}" aria-pressed="${(ST._goals || []).includes(k)}"><span style="font-size:22px">${ic}</span>${l}<span class="ck"></span></button>`).join("")}</div>`;
  $app.innerHTML = obShell({ form: "onboard", back: "obBack", pct: (OB + 1) / (steps.length + 1) * 100, body, btn: last ? "시작! 🚀" : "계속 →", disabled: true });
  obReady(); const inp = document.getElementById("obName"); if (inp) inp.focus();
}
/* "it's really you!" welcome back, once a day */
function renderHello() { const nm = firstName() || ""; const s = streakNow(); const h = new Date().getHours();
  const line = s >= 2 ? `${s}일 연속! 오늘도 이어 가자.` : h < 12 ? "오늘도 단어 몇 개만 하면 돼." : "돌아와서 반가워. 오늘 단어 보러 갈까?";
  $app.innerHTML = `<div class="hello${document.getElementById("splash") ? " wait" : ""}"><span class="hl-eyebrow">GOOD TO SEE YOU</span><h1>${esc(nm)}${nm ? ", " : ""}정말 너구나!</h1><div class="mslot hero" data-sc="1.4" data-act="wave" data-fill="auto" data-key="hello"></div>
    ${s >= 2 ? `<span class="streak-big">🔥 ${s}</span>` : ""}<p class="hl-line">${line}</p><button class="big primary hl-btn" data-act="helloGo">좋아, 시작! →</button></div>`; }
function obNext() {
  stashOnboard(); const p = ST.profile || {}; const dob = ST._dob || p.dob || ""; const age = dob ? ageOf({ profile: { dob } }) : null; const kid = age != null && age < 14;
  const steps = ["name", "dob"].concat(kid ? ["consent"] : []).concat(["lang", "theme", "goal"]); const st = steps[OB];
  if (st === "name" && !(ST._name || "").trim()) { toast("이름을 알려 줘!"); return; }
  if (st === "dob") { if (!dob) { toast("생일을 골라 줘!"); return; } if (age == null || age < 3 || age > 100) { toast("생일을 다시 확인해 줘"); return; } }
  if (st === "consent" && (!ST._consent || !(ST._parent || "").trim())) { toast("보호자 이름과 동의가 필요해요"); return; }
  if (OB >= steps.length - 1) return saveOnboard();
  OB++; OB_DIR = 1; render(); mascotNext();
}
function privacyHtml() { return `<div class="cel" id="privacy"><div class="cel-card" style="text-align:left;max-height:80vh;overflow:auto"><h2>Privacy note · 개인정보 안내</h2>
  <p class="small"><b>What we keep:</b> name, date of birth, email login, and learning records (answers, quiz scores, study time, sentences written or said in the app, feedback you send).</p>
  <p class="small"><b>Who sees it:</b> only the student and their Vocaboo teacher. It is never sold or shown to other users.</p>
  <p class="small"><b>Voice:</b> speaking practice uses your phone's built-in speech recognition. Vocaboo saves only the words it heard, not recordings.</p>
  <p class="small"><b>AI feedback:</b> sentences and stories are sent to Google's Gemini AI to create feedback.</p>
  <p class="small"><b>Delete:</b> you can erase everything any time in ⚙️ → My settings → Reset my account, or ask your teacher.</p>
  <p class="small muted">이름, 생년월일, 이메일, 학습 기록만 저장하며 학생과 담당 선생님만 볼 수 있어요. 문장 피드백을 위해 Google Gemini AI를 사용해요. 설정에서 언제든지 모든 기록을 삭제할 수 있어요.</p>
  <button class="big primary" data-act="privacyClose">OK</button></div></div>`; }
/* birthday: three simple dropdowns (one tap each) instead of the phone's date wheel */
function dobSelects(dob) {
  const [y, m, d] = (ST._dobP || (dob ? dob.split("-").map(Number) : [0, 0, 0])); const ny = new Date().getFullYear();
  const days = y && m ? new Date(y, m, 0).getDate() : 31; const st = 'style="min-height:52px;font:inherit;font-size:17px;border-radius:14px;border:2px solid var(--line);padding:0 8px;background:#fff;width:100%"';
  const opt = (v, cur, lab) => `<option value="${v}" ${+cur === v ? "selected" : ""}>${lab}</option>`;
  const ys = []; for (let k = ny - 2; k >= 1930; k--) ys.push(opt(k, y, k));
  const ms = []; for (let k = 1; k <= 12; k++) ms.push(opt(k, m, ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][k - 1] + " · " + k + "월"));
  const ds = []; for (let k = 1; k <= days; k++) ds.push(opt(k, d, k));
  return `<div style="display:grid;grid-template-columns:1.1fr 1.3fr .9fr;gap:8px"><select id="obY" data-change="obDobSel" ${st} aria-label="Year"><option value="">Year · 년</option>${ys.join("")}</select>
    <select id="obM" data-change="obDobSel" ${st} aria-label="Month"><option value="">Month · 월</option>${ms.join("")}</select>
    <select id="obD" data-change="obDobSel" ${st} aria-label="Day"><option value="">Day · 일</option>${ds.join("")}</select></div>`;
}
function stashOnboard() { const v = id => (document.getElementById(id) || {}).value; if (document.getElementById("obName")) ST._name = v("obName"); const c = document.getElementById("obConsent"); if (c) ST._consent = c.checked; const pa = document.getElementById("obParent"); if (pa) ST._parent = pa.value; }
function saveOnboard() {
  stashOnboard(); const name = (ST._name || "").trim(); const dob = (document.getElementById("obDob") || {}).value || ST._dob || "";
  if (!name) { toast("Type your name first"); return; }
  if (!dob) { toast("Choose your date of birth"); return; }
  const age = ageOf({ profile: { dob } }); if (age == null || age < 3 || age > 100) { toast("Check the date of birth"); return; }
  if (age < 14 && (!ST._consent || !(ST._parent || "").trim())) { toast("A parent needs to type their name and agree"); return; }
  ST.profile = { name: name.slice(0, 30), dob, at: Date.now() };
  if (age < 14) ST.consent = { by: ST._parent.trim().slice(0, 40), at: Date.now(), v: 1 }; else ST.consent = { self: true, at: Date.now(), v: 1 };
  ST.settings = Object.assign({}, ST.settings || {}, { lang: ST._lang || (ST.settings && ST.settings.lang) || "ko" }); ST.goals = ST._goals || [];
  ["_lang", "_dob", "_dobP", "_name", "_consent", "_parent", "_goals"].forEach(k => delete ST[k]); OB = 0; OB_INTRO = true; OB_DIR = 1;
  saveST(); logDid("profile"); view = { name: studentHome() }; render();
}

/* ---------- adaptive level test ---------- */
let LT = null;
const GRID = []; for (let x = -1.5; x <= 14.501; x += 0.1) GRID.push(+x.toFixed(2));
const pKnow = (th, g) => 1 / (1 + Math.exp(-(0.85 * (th - g) + 0.85))); // a word at her level: ~70% known
const GUESS = 0.6; // chance she guesses (instead of "I don't know") when she doesn't know
function ltLike(r, th, g) { const P = pKnow(th, g); return r === "ok" ? 0.97 * P + (1 - P) * GUESS * 0.25 : r === "bad" ? 0.03 * P + (1 - P) * GUESS * 0.75 : (1 - P) * (1 - GUESS) + 0.01; }
function ltEst() { const s = LT.post.reduce((a, b) => a + b, 0); let m = 0; LT.post.forEach((p, i) => m += GRID[i] * p / s); let v = 0; LT.post.forEach((p, i) => v += (GRID[i] - m) ** 2 * p / s); return { m, sd: Math.sqrt(v) }; }
let LIS = 0; // level-test intro step
function renderLevelIntro() {
  const retake = !!ST.level; const nm = firstName(); const ko = KO();
  const steps = [
    { icon: buddy("happy", 100), t: retake ? "Level check time!" : `Hi${nm ? " " + esc(nm) : ""}! Let's find your level`, b: retake ? "Let's see how much you've grown." : "A quick word game. About 5–8 minutes.", k: retake ? "얼마나 늘었는지 확인해 봐요!" : "단어 게임으로 레벨을 찾아요. 5–8분 걸려요." },
    { icon: "👀", t: "Look and listen", b: "You'll see and hear a word. Pick what it means." + (ko ? " Meanings are in Korean or English." : ""), k: "단어를 보고 듣고, 뜻을 골라요." },
    { icon: "📈", t: "It changes as you go", b: "Right answers make the words harder. Misses make them easier. That's normal. Nobody knows them all!", k: "맞히면 어려워지고, 틀리면 쉬워져요. 다 아는 사람은 없어요!" },
    { icon: "🙋", t: "Don't know it? Don't guess!", b: "Tap <b>I don't know</b>. Guessing makes your level wrong.", k: "모르는 단어는 찍지 말고 ‘I don't know’를 눌러 주세요." },
    { icon: "🚀", t: "Ready?", b: "About 25–30 words. Take your time.", k: "준비됐나요?" }];
  LIS = Math.max(0, Math.min(steps.length - 1, LIS)); const st = steps[LIS]; const last = LIS === steps.length - 1;
  $app.innerHTML = `${previewBar()}<div class="intro-wrap"><div class="card intro-card" style="align-items:center;text-align:center">
    <div class="intro-ic">${st.icon}</div><h1 style="font-size:28px">${st.t}</h1><p style="font-size:19px">${st.b}</p>${ko ? `<p class="muted">${st.k}</p>` : ""}
    <div class="intro-dots">${steps.map((_, i) => `<i class="${i === LIS ? "on" : i < LIS ? "done" : ""}"></i>`).join("")}</div>
    <div style="display:grid;grid-template-columns:${LIS ? "1fr 1.6fr" : "1fr"};gap:10px;width:100%">${LIS ? `<button class="big" data-act="liBack">← Back</button>` : ""}
      ${last ? `<button class="big primary" data-act="startLevel">Start! 🎯</button>` : `<button class="big primary" data-act="liNext">Next →</button>`}</div>
    ${IS_OWNER ? `<button class="ghost" data-act="skipLevel">Skip with sample answers (teacher test)</button>` : ""}</div></div>`;
}
async function startLevelTest(sim) {
  const age = ageOf(ST) || 11; const mu = Math.max(0, Math.min(10, ST.level ? ST.level.g : age >= 19 ? 10 : age - 7));
  LT = { post: GRID.map(x => Math.exp(-((x - mu) ** 2) / (2 * 2.5 * 2.5))), items: [], used: new Set(), q: null, t0: Date.now(), mu };
  startAttempt("level", { n: 0, retake: !!ST.level }); logDid("level test");
  if (sim) { const truth = mu + (Math.random() * 2 - 1); while (!ltDone()) { ltNext(true); const e = BY[LT.q.id]; const P = pKnow(truth, e.g); const r = Math.random() < P ? "ok" : Math.random() < GUESS ? (Math.random() < 0.25 ? "ok" : "bad") : "idk"; ltRecord(r, r === "ok" ? LT.q.id : r === "bad" ? "x" : null, 3000); } return finishLevelTest(); }
  view = { name: "level" }; ltNext(); render(); await loadPack("TEST"); if (LT && LT.q) speak(LT.q.id, "w");
}
function ltDone() { const { m, sd } = ltEst(); const n = LT.items.length; const last = LT.items.slice(-8);
  if (n >= 14 && m >= 12.6 && last.every(i => i.r === "ok")) return true; // knows the hardest words: Grade 12+
  return n >= 32 || (n >= 24 && sd < 0.5); }
function ltNext(quiet) {
  const { m } = ltEst(); const n = LT.items.length;
  const target = n < 3 ? m - 1.4 + n * 0.45 : m - 0.2 + (Math.random() - 0.5) * 0.6;
  const root = w => w.toLowerCase().replace(/[^a-z]/g, "").slice(0, 5);
  const usedRoots = new Set([...LT.used].map(i => root(BY[i].w)));
  const free = TEST_IDS.filter(id => !LT.used.has(id) && !usedRoots.has(root(BY[id].w)));
  let pool = free.filter(id => Math.abs(BY[id].g - target) <= 0.6);
  if (pool.length < 6) pool = free.slice().sort((a, b) => Math.abs(BY[a].g - target) - Math.abs(BY[b].g - target)).slice(0, 10);
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
  const { m, sd } = ltEst(); const g = Math.max(0, Math.min(MAXG, m));
  const known = LT.items.filter(i => i.r === "ok").map(i => i.id); const missed = LT.items.filter(i => i.r !== "ok").map(i => i.id);
  const vocab = Math.round(GRADED.reduce((s, e) => s + pKnow(g, e.g), 0));
  const first = !ST.level; const prev = ST.level;
  ST.level = { g: +g.toFixed(2), lo: +Math.max(0, g - sd).toFixed(2), hi: +Math.min(MAXG, g + sd).toFixed(2), sd: +sd.toFixed(2), at: Date.now(), n: LT.items.length,
    known: [...new Set(((prev && prev.known) || []).concat(known))], vocab, of: GRADED.length, att: ATT.id };
  ST.levelHist = (ST.levelHist || []).concat([{ g: ST.level.g, lo: ST.level.lo, hi: ST.level.hi, at: ST.level.at, vocab }]).slice(-30);
  ST.levelRetake = false;
  ST.gradedPool = [...new Set(missed.filter(id => BY[id].g <= g + 1).sort((a, b) => BY[a].g - BY[b].g).concat(ST.gradedPool || []))].filter(id => !WORDS[id]);
  if (!ST.goal && g < 12) { const s = SET(); ST.goal = { g: +Math.min(12.9, g + 1).toFixed(1), by: addDays(today(), 182), from: +g.toFixed(2), auto: true }; void s; }
  ATT.end = Date.now(); ATT.n = LT.items.length; ATT.score = known.length / Math.max(1, LT.items.length); ATT.level = ST.level.g; ATT.sd = ST.level.sd;
  saveAttempt(); bumpStat("levelTests"); award(30, "level check"); logDid("level " + gradeLabel(g));
  if (!ST.week && readyForWeeks()) { buildWeek(ST, WORDS, effCfg(ST), true); loadPacksFor(weekIds()); }
  saveST(); PROG = null;
  view = { name: "levelResult", prev: prev ? prev.g : null, first }; LT = null; render();
}
function renderLevelResult() {
  const L = ST.level; const prev = view.prev; const up = prev != null ? L.g - prev : null; const gl = gradeLabel(L.g);
  const pct = Math.min(100, Math.max(3, L.g / MAXG * 100));
  const scale = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(k => `<span>${k === 0 ? "K" : k}</span>`).join("");
  const next = view.fromHome ? "Back" : studentHome() === "tabs" ? (ST.week ? "See my words" : "Let's start") : "Next";
  $app.innerHTML = `<div style="height:14px"></div><div class="result-hero">${buddy("wow", 96)}<span class="eyebrow" style="color:rgba(255,255,255,.8)">Your word level</span>
    <h1 style="font-size:46px;margin:0">${esc(gradeWord(L.g))}</h1>
    <p style="opacity:.9">${gl === "12+" ? "You know words like a strong US high-school graduate. Amazing!" : `You know words like a typical US ${gl === "K" ? "kindergartner" : "grade " + gl + " student"}.`}</p>
    ${up != null ? `<span class="pill ${up >= 0 ? "good" : ""}" style="font-size:15px">${up >= 0 ? "▲ up " + up.toFixed(1) : "▼ " + Math.abs(up).toFixed(1)} since last time</span>` : ""}</div>
  <div class="card"><h3>Where you are</h3>
    <div class="lvscale"><div class="lvtrack"><i class="lvrange" style="left:${L.lo / MAXG * 100}%;width:${Math.max(2, (L.hi - L.lo) / MAXG * 100)}%"></i><b class="lvdot" style="left:${pct}%"></b>${ST.goal ? `<b class="lvgoal" style="left:${Math.min(100, ST.goal.g / MAXG * 100)}%" title="goal">★</b>` : ""}</div><div class="lvlabels">${scale}</div></div>
    <p class="muted small">Likely range: ${gradeLabel(L.lo)} – ${gradeLabel(L.hi)}${ST.goal ? ` · ★ goal: ${gradeWord(ST.goal.g)}` : ""}</p></div>
  <div class="tiles"><div class="tile"><b>${L.vocab.toLocaleString()}</b><span>of ${L.of.toLocaleString()} core K–12 words you probably know</span></div><div class="tile"><b>${L.n}</b><span>words checked</span></div></div>
  ${gradeInfoHtml()}
  <div class="card"><h3>Your weekly goal</h3>${goalHtml()}</div>
  <button class="big primary" data-act="levelDone">${next}</button>`;
}
function goalHtml(st) {
  st = st || ST; const c = effCfg(st);
  return `<div class="stack" style="gap:6px"><p>📚 Learn <b>${c.newPerWeek}</b> new words a week (<b>about ${Math.max(1, Math.ceil(c.newPerWeek / 5))} a day</b> for 5 days) + review <b>${c.reviewPerWeek}</b></p><p>✏️ Daily quiz on <b>5 or more</b> days</p>${st.goal ? `<p>⭐ Reach <b>${gradeWord(st.goal.g)}</b> by ${new Date(st.goal.by + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>` : ""}</div>`;
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
function gearHtml() { return `<button id="gearBtn" class="gear" data-act="menu" aria-label="Menu">⋯</button>`; }
function drawGear() {
  let g = document.getElementById("gearBtn"); const show = mode === "student" && ["onboard", "pending", "rejected", "levelIntro", "placementIntro", "error", "who"].includes(view.name) && view.name !== "who"; // only on setup screens, so nobody gets stuck
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
    ${ST && ["pending", "rejected"].indexOf(studentHome()) < 0 && ST.profile ? `<button class="menu-item" data-act="feedback">💬 Send feedback</button>` : ""}
    ${ST && studentHome() === "tabs" ? `<button class="menu-item" data-act="menuMic">🎤 Sound &amp; microphone</button>` : ""}
    ${!IS_OWNER && ST && ST.profile ? `<button class="menu-item" data-act="menuParent">👨‍👩‍👧 For parents</button><button class="menu-item" data-act="menuSwitch">👥 Switch or add child</button>` : ""}
    <button class="menu-item" data-act="reload">🔄 Reload app</button>
    ${IS_OWNER ? `<button class="menu-item" data-act="menuSurvey">⭐ Preview parent survey</button>` : ""}
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

/* ---------- waiting for approval ---------- */
function renderPending(rejected) {
  const em = (WW.user() && WW.user().email) || "";
  $app.innerHTML = `<section class="hero" style="text-align:center"><div class="stack" style="align-items:center;gap:10px">${buddy(rejected ? "sad" : "happy", 104)}<h1>${rejected ? "Account not approved" : ST.waitlist ? "You're on the list!" : "Almost there!"}</h1><p class="muted">${esc(em)}</p></div></section>
  <div class="card">${!rejected && ST.waitlist ? `<h3>Sorry, all free beta spots are filled! 🙏</h3><p>Good news: you're on the <b>official launch list</b>. We'll let you know as soon as Vocaboo opens for more students.</p><p class="muted small">무료 베타 자리가 모두 찼어요. 정식 출시 명단에 등록되었으니 오픈하면 바로 알려 드릴게요!</p><button class="big primary" data-act="checkApproved">Check again</button>` : rejected ? `<p>Your teacher didn't approve this account. If you think this is a mistake, please contact your teacher.</p>` : `<h3>Waiting for your teacher</h3><p>Thanks, ${esc(firstName())}! Your teacher needs to approve your account before you can start. This is usually quick.</p><p class="muted small">선생님이 계정을 승인하면 바로 시작할 수 있어요.</p><button class="big primary" data-act="checkApproved">Check again</button>`}
  <button class="big" data-act="signout">Sign out</button></div>`;
}
async function checkApproved() { const d = await db.doc(sPath()).get(); if (d.exists) { const x = d.data(); ST.approved = x.approved; ST.rejected = x.rejected; }
  if (ST.approved === false && !ST.rejected) { toast("Not approved yet. Try again a little later"); return render(); }
  return loadStudent(false); }

/* ---------- reset my account ---------- */
function resetCard() { return `<div class="card"><h3>Reset my account</h3><p class="muted small">Start over from the beginning. This permanently deletes all your progress.</p><button class="big" data-act="resetMe" style="color:#B3261E">Reset my account…</button></div>`; }
function resetAsk(step) {
  const old = document.getElementById("resetAsk"); if (old) old.remove();
  const el = document.createElement("div"); el.className = "cel"; el.id = "resetAsk";
  el.innerHTML = step === 1 ? `<div class="cel-card" style="text-align:left"><div class="cel-icon" style="text-align:center">⚠️</div><h2>Are you sure?</h2>
    <p>Resetting <b>permanently deletes</b>:</p><ul class="small" style="margin:0;padding-left:20px;line-height:1.7"><li>all your learned words and review history</li><li>your streak, XP, level and badges</li><li>quiz scores, stories, sentences and study time</li><li>your word level test results</li></ul>
    <p class="small"><b>This cannot be undone.</b> Your login (email and password) stays the same.</p><p class="small muted">모든 학습 기록이 영구적으로 삭제되며 되돌릴 수 없어요.</p>
    <button class="big" data-act="resetStep2" style="color:#B3261E">Yes, continue</button><button class="big primary" data-act="resetCancel">Cancel</button></div>`
  : `<div class="cel-card" style="text-align:left"><h2>Last step</h2><p>Type <b>RESET</b> to permanently delete everything and start over.</p>
    <input id="resetTxt" type="text" autocomplete="off" autocapitalize="characters" style="min-height:52px;font:inherit;font-size:20px;border-radius:16px;border:2px solid var(--line);padding:0 14px;width:100%;text-transform:uppercase">
    <button class="big" data-act="resetGo" style="background:#B3261E;color:#fff">Delete everything</button><button class="big primary" data-act="resetCancel">Cancel</button></div>`;
  document.body.appendChild(el); const i = document.getElementById("resetTxt"); if (i) i.focus();
}
async function wipeStudent(sid, keep) {
  const base = "students/" + sid;
  for (const c of ["words", "attempts", "sessions", "stories", "feedback"]) { const s = await db.collection(base + "/" + c).get(); for (const d of s.docs) await db.doc(base + "/" + c + "/" + d.id).delete(); }
  const fresh = Object.assign(newStudent(!!keep.test), { email: keep.email || "", resetAt: Date.now(), resets: (keep.resets || 0) + 1 });
  ["family", "parentPin", "parent", "betaSeat"].forEach(k => { if (keep[k] != null) fresh[k] = keep[k]; });
  if (keep.approved != null) fresh.approved = keep.approved; if (keep.rejected) fresh.rejected = keep.rejected; if (keep.settings && keep.settings.lang) fresh.settings = { lang: keep.settings.lang };
  await db.doc(base).set(fresh); return fresh;
}
async function resetGo() {
  const v = ((document.getElementById("resetTxt") || {}).value || "").trim().toUpperCase(); if (v !== "RESET") { toast("Type RESET to confirm"); return; }
  const el = document.getElementById("resetAsk"); if (el) el.innerHTML = `<div class="cel-card"><h2>Deleting…</h2><p class="muted">Please wait.</p></div>`;
  try { clearInterval(hbTimer); SESSION = null; leaveActivity(); await wipeStudent(SID, ST); if (el) el.remove(); toast("Your account was reset"); WORDS = {}; return loadStudent(!!ST.test); }
  catch (e) { console.error(e); if (el) el.remove(); toast("Couldn't reset: " + (e.code || e.message)); }
}

/* ---------- feedback ---------- */
function feedbackAsk() {
  const el = document.createElement("div"); el.className = "cel"; el.id = "fbAsk";
  el.innerHTML = `<div class="cel-card" style="text-align:left"><h2>Send feedback 💬</h2><p class="muted small">What do you like? What's hard or broken? Ideas? 🔒 It's anonymous: your name isn't attached.</p>
    <div class="row" style="justify-content:space-between">${["😍", "🙂", "😐", "🙁"].map((f, k) => `<button class="opt rate" data-act="fbRate" data-r="${k}" style="flex:1;text-align:center;font-size:30px;min-height:58px">${f}</button>`).join("")}</div>
    <textarea id="fbTxt" rows="4" maxlength="1500" placeholder="Type here… (한국어도 괜찮아요)" style="font:inherit;font-size:17px;padding:12px 14px;border-radius:18px;border:2px solid var(--line);width:100%;resize:vertical"></textarea>
    <button class="big primary" data-act="fbSend">Send</button><button class="big" data-act="fbClose">Cancel</button></div>`;
  document.body.appendChild(el);
}
const anonId = () => [...crypto.getRandomValues(new Uint8Array(10))].map(x => x.toString(16).padStart(2, "0")).join("");
async function feedbackSend() {
  const t = ((document.getElementById("fbTxt") || {}).value || "").trim(); const r = document.querySelector('[data-act="fbRate"].sel'); if (!t && !r) { toast("Pick a face or type a message"); return; }
  // anonymous: saved without name, email or account id
  try { await setDoc("anonFeedback/" + anonId(), { at: Date.now(), text: t.slice(0, 1500), rate: r ? +r.dataset.r : null, screen: view.name, tab: TAB }); } catch (e) { toast("Couldn't send. Please try again later."); return; }
  const el = document.getElementById("fbAsk"); if (el) el.remove(); toast("Thank you! Sent anonymously 💜");
}

/* ---------- my study plan (student / parent can change) ---------- */
function planCard() { const s = SET(); const c = effCfg(ST);
  if (s.textbook) return `<div class="card"><h3>My study plan</h3><p class="muted small">Your teacher sets your plan: ${c.newPerWeek} new words and ${c.reviewPerWeek} review words a week. ${packPlanText(c.newPerWeek)}</p></div>`;
  const sel = (id, vals, cur, unit) => `<select id="${id}" data-change="myPlan" style="min-height:48px;border-radius:14px;border:2px solid var(--line);padding:0 12px;font:inherit;font-size:17px;background:#fff">${vals.map(v => `<option value="${v}" ${+cur === v ? "selected" : ""}>${v} ${unit}</option>`).join("")}</select>`;
  const kor = s.kor != null ? s.kor : s.lang !== "en";
  return `<div class="card"><h3>My study plan</h3><p class="muted small">Choose what fits your week. Changes start with next week's words. 매주 학습량을 직접 정할 수 있어요.</p>
    <div class="grid2"><div class="field"><label for="myNew">New words per week</label>${sel("myNew", [10, 15, 20, 25, 30, 40], s.grNew, "words")}</div>
    <div class="field"><label for="myRev">Review words per week</label>${sel("myRev", [0, 5, 10, 15, 20], s.review, "words")}</div>
    <div class="field"><label for="myQuiz">Daily quiz length</label>${sel("myQuiz", [10, 15, 20, 25, 30], ST.quizSize || 15, "questions")}</div>
    ${KO() ? `<div class="field"><label for="myKor">Korean school words first</label><select id="myKor" data-change="myPlan" style="min-height:48px;border-radius:14px;border:2px solid var(--line);padding:0 12px;font:inherit;font-size:17px;background:#fff"><option value="1" ${kor ? "selected" : ""}>On (교과서 필수 단어 먼저)</option><option value="0" ${kor ? "" : "selected"}>Off</option></select></div>` : ""}</div>
    <p class="muted small">📅 ${packPlanText((s.textbook ? s.tbNew : 0) + s.grNew)} About ${Math.round(Math.ceil(((s.textbook ? s.tbNew : 0) + s.grNew) / 5) * 1.5 + (ST.quizSize || 15) * 0.5 + 3)} minutes a day.</p></div>`; }
function savePlan() { const v = id => document.getElementById(id); const s = Object.assign({}, ST.settings || {});
  if (v("myNew")) s.grNew = +v("myNew").value; if (v("myRev")) s.review = +v("myRev").value; if (v("myKor")) s.kor = v("myKor").value === "1";
  ST.settings = s; if (v("myQuiz")) ST.quizSize = +v("myQuiz").value; ST.planBy = { at: Date.now(), who: "student" }; saveST(); toast("Saved. Starts with next week's words"); render(); }

/* ---------- parent survey (day 7 and day 30) ---------- */
const SURVEY = [
  { k: "often", q: "How often does your child use Vocaboo?", ko: "아이가 얼마나 자주 사용하나요?", type: "one", opts: [["daily", "Every day · 매일"], ["weekly", "A few times a week · 주 몇 회"], ["rarely", "Rarely · 거의 안 해요"]] },
  { k: "learning", q: "Is your child learning new words?", ko: "새 단어를 배우고 있나요?", type: "scale" },
  { k: "enjoy", q: "Does your child enjoy using it?", ko: "아이가 즐겁게 사용하나요?", type: "scale" },
  { k: "amount", q: "Is the daily amount right?", ko: "하루 학습량은 어떤가요?", type: "one", opts: [["little", "Too little · 적어요"], ["right", "Just right · 적당해요"], ["much", "Too much · 많아요"]] },
  { k: "helps", q: "Which parts help most? (choose any)", ko: "가장 도움이 되는 부분은? (여러 개 선택)", type: "multi", opts: [["train", "Training · 단어 학습"], ["quiz", "Daily quiz · 퀴즈"], ["speak", "Speaking · 말하기"], ["coach", "Sentence coach · 문장 코치"], ["story", "Stories · 이야기"]] },
  { k: "pay", q: "After the free beta, would you consider paying for Vocaboo?", ko: "무료 베타 후 유료로 이용할 생각이 있나요?", type: "one", opts: [["yes", "Yes · 네"], ["maybe", "Maybe · 아마도"], ["no", "No · 아니요"]] },
  { k: "recommend", q: "Would you recommend Vocaboo to another parent?", ko: "다른 부모님께 추천하시겠어요?", type: "one", opts: [["yes", "Yes · 네"], ["maybe", "Maybe · 아마도"], ["no", "No · 아니요"]] }
];
let SV = null;
function surveyDue() {
  if (!ST || !ST.profile || ST.approved === false || ST.rejected) return null;
  if (ST.surveyNow) return "now";
  const S = ST.survey || {}; if (S.snooze && S.snooze > Date.now()) return null;
  const start = (ST.profile && ST.profile.at) || ST.created || Date.now(); const days = (Date.now() - start) / 864e5;
  if (days >= 30 && !S.d30) return "d30"; if (days >= 7 && !S.d7 && !S.d30) return "d7"; return null;
}
function maybeSurvey() { if (SV || PUSHASK || document.querySelector(".cel,.tour")) return false; const due = surveyDue(); if (!due) return false; openSurvey(due); return true; }
function openSurvey(due) { SV = { due, a: {}, stars: 0 }; drawSurvey(); }
function drawSurvey() {
  const old = document.getElementById("survey");
  const el = document.createElement("div"); el.className = "cel"; el.id = "survey";
  const opt = (q, v, label) => { const on = q.type === "multi" ? (SV.a[q.k] || []).includes(v) : SV.a[q.k] === v;
    return `<button class="opt ${on ? "sel" : ""}" data-act="svPick" data-k="${q.k}" data-v="${v}" style="min-height:44px;font-size:15px;padding:8px 12px">${esc(label)}</button>`; };
  const body = SURVEY.map((q, i) => `<div class="stack" style="gap:6px;align-self:stretch"><b>${i + 1}. ${esc(q.q)}</b><span class="muted small">${esc(q.ko)}</span>
    ${q.type === "scale" ? `<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">${[1, 2, 3, 4, 5].map(n => opt(q, n, String(n))).join("")}</div><div class="row between muted small"><span>Not at all · 전혀</span><span>A lot · 많이</span></div>`
      : `<div class="opts" style="gap:6px">${q.opts.map(([v, l]) => opt(q, v, l)).join("")}</div>`}</div>`).join("");
  el.innerHTML = `<div class="cel-card" style="text-align:left;max-height:86vh;overflow:auto;gap:14px"><span class="eyebrow">For parents · 부모님께</span><h2 style="margin:0">How is Vocaboo going?</h2>
    <p class="muted small" style="margin:0">2 minutes. Your answers help us make Vocaboo better during the free beta. 2분이면 끝나요. 베타 기간 동안 앱을 개선하는 데 큰 도움이 돼요!<br>🔒 Anonymous: your name and email are not attached. 익명으로 전송돼요.</p>
    <div class="stack" style="gap:6px;align-self:stretch"><b>Overall, how would you rate Vocaboo?</b><span class="muted small">전체적으로 몇 점을 주시겠어요?</span>
      <div class="row" style="gap:4px;justify-content:center">${[1, 2, 3, 4, 5].map(n => `<button data-act="svStar" data-n="${n}" aria-label="${n} stars" style="background:none;box-shadow:none;min-height:52px;padding:0 4px;font-size:40px;color:${n <= SV.stars ? "#FFC93C" : "#D9D4EA"}">★</button>`).join("")}</div></div>
    ${body}
    <div class="stack" style="gap:6px;align-self:stretch"><b>${SURVEY.length + 1}. Anything you'd like to tell us?</b><span class="muted small">자유롭게 의견을 남겨 주세요 (선택)</span>
      <textarea id="svTxt" rows="4" maxlength="2000" style="font:inherit;font-size:16px;padding:12px 14px;border-radius:18px;border:2px solid var(--line);width:100%;resize:vertical">${esc(SV.txt || "")}</textarea></div>
    <button class="big primary" data-act="svSend">Send · 보내기</button><button class="ghost" data-act="svLater" style="align-self:center">Later · 나중에</button></div>`;
  if (old) { const oc = old.querySelector(".cel-card"), sc = oc.scrollTop; oc.innerHTML = el.querySelector(".cel-card").innerHTML; oc.scrollTop = sc; return; }
  document.body.appendChild(el);
}
function svKeepText() { const t = document.getElementById("svTxt"); if (t && SV) SV.txt = t.value; }
async function surveySend() {
  svKeepText(); if (!SV.stars) { toast("Tap the stars first · 별점을 눌러 주세요"); document.querySelector("#survey .cel-card").scrollTop = 0; return; }
  try { await setDoc("anonFeedback/" + anonId(), { kind: "survey", at: Date.now(), due: SV.due, stars: SV.stars, answers: SV.a, text: String(SV.txt || "").slice(0, 2000) }); } catch (e) { toast("Couldn't send. Please try again later."); return; }
  const S = Object.assign({}, ST.survey || {}); if (SV.due === "d30") S.d30 = Date.now(); else S.d7 = Date.now(); delete S.snooze; ST.survey = S; ST.surveyNow = false; saveST();
  const el = document.getElementById("survey"); if (el) el.remove(); SV = null; toast("Thank you so much! 감사합니다 💜"); render();
}
function surveyLater() { const S = Object.assign({}, ST.survey || {}); if (S.snoozed) { if (SV.due === "d30") S.d30 = "skipped"; else S.d7 = "skipped"; } else { S.snooze = Date.now() + 2 * 864e5; S.snoozed = true; }
  ST.survey = S; ST.surveyNow = false; saveST(); const el = document.getElementById("survey"); if (el) el.remove(); SV = null; }

/* ---------- microphone help & test ---------- */
const OS = /android/i.test(navigator.userAgent) ? "android" : /iphone|ipad|ipod|macintosh/i.test(navigator.userAgent) && "ontouchend" in document ? "ios" : "other";
function micSteps() {
  if (OS === "android") return `<ol class="small" style="margin:0;padding-left:20px;line-height:1.7">
    <li><b>In Chrome:</b> tap the <b>⋮</b> or the icon left of the web address → <b>Permissions</b> (or Site settings) → <b>Microphone → Allow</b>.</li>
    <li><b>If you use the Vocaboo icon:</b> press and hold the icon → <b>App info</b> (ⓘ) → <b>Permissions → Microphone → Allow</b>.</li>
    <li><b>Phone settings:</b> Settings → Apps → <b>Chrome</b> → Permissions → <b>Microphone → Allow</b>.</li>
    <li><b>Speech recognition:</b> make sure the <b>Google</b> app is installed and turned on (Settings → Apps → Google → Enable). Android uses it to understand speech.</li></ol>`;
  if (OS === "ios") return `<ol class="small" style="margin:0;padding-left:20px;line-height:1.7">
    <li>Settings → Apps → <b>Safari</b> → <b>Microphone → Allow</b> (or Ask).</li>
    <li>Settings → General → Keyboard → <b>Enable Dictation</b> → on.</li>
    <li>Settings → <b>Screen Time</b> → Content &amp; Privacy → make sure <b>Microphone</b> and <b>Speech Recognition</b> are allowed.</li>
    <li>Close Vocaboo completely and open it again.</li></ol>`;
  return `<p class="small">Click the 🔒 icon next to the web address and set <b>Microphone</b> to <b>Allow</b>, then reload.</p>`;
}
function micBlockedHtml(extra) { return `<div class="notice stack" style="gap:6px"><b>🎤 The microphone is turned off</b>${micSteps()}<span class="small">Then tap the mic again.${extra ? " " + esc(extra) : ""}</span></div>`; }
let MIC = { state: "", heard: "", busy: false };
function micCard() {
  const st = MIC.state; const off = CFG.speak === false || SET().speak === false;
  return `${inappBanner()}<div class="card"><h3>Sound 🔊</h3><p class="muted small">Can't hear the words? Tap to test. Check the volume, and on iPhone turn off silent mode (the switch on the side).</p><button class="big" data-act="soundTest">🔊 Test sound</button></div><div class="card"><h3>Microphone 🎤</h3>
    <p class="muted small">Vocaboo listens when you say words and sentences. Test it here.</p>
    ${off ? `<div class="notice info small">Speaking practice is turned off for you by your teacher.</div>` : ""}
    ${!SR ? `<div class="notice small">This browser can't do speech recognition. ${OS === "android" ? "Open Vocaboo in <b>Chrome</b>." : OS === "ios" ? "Open Vocaboo in <b>Safari</b> or from the home-screen icon." : "Use Chrome or Safari."}</div>` : ""}
    ${st === "ok" ? `<div class="fb good">✓ The microphone works!${MIC.heard ? " I heard: “" + esc(MIC.heard) + "”" : ""}</div>` : ""}
    ${st === "noheard" ? `<div class="fb bad">The microphone is on, but I didn't hear anything. Speak a little louder and closer.</div>` : ""}
    ${st === "blocked" ? micBlockedHtml() : ""}
    ${st === "nomic" ? `<div class="notice small">No microphone was found. Check that nothing else (like a call or another app) is using it, and that earphones are plugged in properly.</div>` : ""}
    ${st === "error" ? `<div class="notice small">Something went wrong: ${esc(MIC.msg || "")}. Try reloading the app.</div>` : ""}
    <button class="big ${MIC.busy ? "" : "primary"}" data-act="micTest" ${MIC.busy || !SR ? "disabled" : ""}>${MIC.busy ? "Listening… say “hello”" : "🎤 Test my microphone"}</button>
    <details><summary class="small" style="font-weight:800">How to turn the microphone on</summary><div style="margin-top:8px">${micSteps()}</div></details></div>`;
}
async function micTest() {
  MIC = { state: "", heard: "", busy: true }; render();
  try { if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop()); } }
  catch (e) { MIC = { state: /NotAllowed|Permission|Security/i.test(e.name || e.message) ? "blocked" : /NotFound|NotReadable|Overconstrained/i.test(e.name) ? "nomic" : "error", msg: e.name || e.message, busy: false }; return render(); }
  let rec; try { rec = new SR(); } catch (e) { MIC = { state: "error", msg: "speech recognition unavailable", busy: false }; return render(); }
  rec.lang = "en-US"; rec.interimResults = true; let heard = "", done = false;
  const fin = st => { if (done) return; done = true; try { rec.abort(); } catch (x) {} MIC = { state: st || (heard ? "ok" : "noheard"), heard, busy: false, msg: MIC.msg }; render(); };
  rec.onresult = ev => { heard = Array.from(ev.results).map(r => r[0].transcript).join(" ").trim(); if (heard) setTimeout(() => fin("ok"), 600); };
  rec.onerror = ev => { MIC.msg = ev.error; fin(/not-allowed|service-not-allowed/.test(ev.error) ? "blocked" : ev.error === "audio-capture" ? "nomic" : ev.error === "no-speech" ? "noheard" : "error"); };
  rec.onend = () => fin();
  setTimeout(() => fin(), 6000);
  try { rec.start(); } catch (e) { MIC.msg = e.message; fin("error"); }
}

/* ---------- in-app browsers (KakaoTalk, Instagram, Naver…) can't do sound/mic well ---------- */
const INAPP = /KAKAOTALK|Instagram|FBAN|FBAV|NAVER|Line\/|DaumApps|everytimeApp|; wv\)/i.test(navigator.userAgent);
function openOutside() { const url = location.href;
  if (/KAKAOTALK/i.test(navigator.userAgent)) { location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(url); return; }
  if (OS === "android") { location.href = "intent://" + url.replace(/^https?:\/\//, "") + "#Intent;scheme=https;package=com.android.chrome;end"; return; }
  try { navigator.clipboard.writeText(url); toast("Link copied. Paste it in Safari"); } catch (e) { toast("Open this link in Safari: " + url); } }
function inappBanner() { return INAPP ? `<div class="notice stack" style="gap:8px"><b>⚠️ You're inside ${/KAKAOTALK/i.test(navigator.userAgent) ? "KakaoTalk" : /Instagram/i.test(navigator.userAgent) ? "Instagram" : "another app"}'s browser</b><span class="small">Sound and the microphone may not work here. Open Vocaboo in ${OS === "android" ? "Chrome" : "Safari"} instead. 다른 앱 안의 브라우저에서는 소리/마이크가 안 될 수 있어요.</span><button class="primary" data-act="openOutside">Open in ${OS === "android" ? "Chrome" : "Safari"}</button></div>` : ""; }
function soundTest() { const id = BY.hello ? "hello" : BANK[0].id; speak(id, "w"); setTimeout(() => { if (player.paused && !(window.speechSynthesis && speechSynthesis.speaking)) toast("If you heard nothing: turn up the volume and turn off silent mode"); }, 1500); }

/* ---------- install to home screen ---------- */
let INSTALL_EVT = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); INSTALL_EVT = e; try { if (mode === "student" && ["tabs", "login"].includes(view.name)) render(); } catch (x) {} });
window.addEventListener("appinstalled", () => { INSTALL_EVT = null; toast("Vocaboo is on your home screen 🎉"); try { render(); } catch (x) {} });
const isStandalone = () => !!(navigator.standalone || matchMedia("(display-mode: standalone)").matches);
function installBanner() {
  if (isStandalone() || INAPP) return "";
  if (INSTALL_EVT) return `<div class="notice info row between" style="gap:10px"><span>📲 Put Vocaboo on your home screen</span><button class="primary" data-act="installApp">Install</button></div>`;
  if (OS === "ios") return `<div class="notice info small">📲 <b>Add to home screen:</b> tap Share <b>⬆︎</b> at the bottom of Safari → <b>Add to Home Screen</b> → Add. Then open Vocaboo from the icon.</div>`;
  if (OS === "android") return `<div class="notice info small">📲 <b>Add to home screen:</b> in Chrome tap <b>⋮</b> (top right) → <b>Add to Home screen</b> or <b>Install app</b> → Install. Then open Vocaboo from the icon.</div>`;
  return "";
}
async function installApp() { if (!INSTALL_EVT) return; INSTALL_EVT.prompt(); try { await INSTALL_EVT.userChoice; } catch (e) {} INSTALL_EVT = null; render(); }

/* ---------- "too easy?" test-out quiz ---------- */
const canTestOut = () => !!(ST && ST.week && ST.week.newIds.length >= 4 && (ST.week.testOuts || 0) < 2 && !(ST.lock && ST.lock.on));
function testOutCard() { if (!canTestOut()) return "";
  return `<div class="card row between" style="gap:12px;flex-wrap:nowrap"><div class="stack" style="gap:2px"><b>Words too easy? 🚀</b><span class="muted small">Take a quick quiz on this week's new words. Get 80% or more and you get a new, harder set.</span></div><button class="primary" data-act="testOut" style="flex:none">Test out</button></div>`; }
async function startTestOut() {
  if (!canTestOut()) return; const ids = shuffle(ST.week.newIds.slice());
  const qs = ids.map((id, i) => makeQ2(id, i % 2 ? (KO() ? "ko_en" : "def_en") : (KO() ? "mc_ko" : "mc_def"), ids));
  RUN = { kind: "testout", qs, i: 0, t0: Date.now(), answered: false, right: 0 };
  startAttempt("testout", { n: qs.length }); logDid("test-out");
  view = { name: "run" }; render(); await loadPacksFor(ids); RUN && (RUN.t0 = Date.now());
}
function finishTestOut() {
  const n = RUN.qs.length, score = RUN.right / n, pass = score >= 0.8; const wk = ST.week;
  ATT.end = Date.now(); ATT.score = score; ATT.passed = pass; saveAttempt();
  const okIds = [...new Set(ATT.items.filter(i => i.ok).map(i => i.id))]; const missIds = [...new Set(ATT.items.filter(i => !i.ok).map(i => i.id))];
  wk.testOuts = (wk.testOuts || 0) + 1;
  let fresh = null;
  if (pass) {
    okIds.forEach(id => { const w = wordDoc(id); w.box = Math.max(w.box, MASTER_BOX); w.due = addDays(today(), INTERVALS[MASTER_BOX]); w.testedOut = Date.now(); saveWord(id); });
    if (ST.level) { ST.level.known = [...new Set((ST.level.known || []).concat(okIds))]; ST.level.g = +Math.min(MAXG, ST.level.g + 0.5).toFixed(2); ST.level.bumps = (ST.level.bumps || 0) + 1; }
    const keep = { key: wk.key, testOuts: wk.testOuts, reviewIds: wk.reviewIds };
    ST._mix = 0.4; buildWeek(ST, WORDS, effCfg(ST), true); delete ST._mix;
    ST.week.key = keep.key; ST.week.testOuts = keep.testOuts;
    ST.week.reviewIds = [...new Set(missIds.concat(keep.reviewIds))].filter(id => !ST.week.newIds.includes(id)).slice(0, Math.max(effCfg(ST).reviewPerWeek, missIds.length));
    ST.week.introDone = false; ST.week.trained = []; delete ST.week.day; ST.week.created = Date.now(); ST.week.hard = ST.week.hard || [];
    fresh = ST.week.newIds.slice(); award(30, "test-out"); loadPacksFor(weekIds());
  }
  saveST(); PROG = null;
  view = { name: "testoutResult", pass, pct: Math.round(score * 100), right: RUN.right, n, fresh, missIds }; RUN = null; render();
}
function renderTestOutResult() { const v = view;
  $app.innerHTML = `<div style="height:14px"></div><div class="result-hero ${v.pass ? "" : "bad"}">${buddy(v.pass ? "wow" : "happy", 96)}${ring(v.pct, v.pass ? "#FFC93C" : "#fff", 140, `<text x="50%" y="56%" text-anchor="middle" font-size="32" font-weight="900" fill="#fff" font-family="Nunito, sans-serif">${v.pct}%</text>`)}
    <h1>${v.pass ? "You tested out! 🚀" : "These words are just right"}</h1><p style="opacity:.9">${v.right} of ${v.n} correct</p></div>
  ${v.pass ? `<div class="card"><h3>Your new, harder words</h3><p class="muted small">A mix of words at your level and ⭐ challenge words. Learn them to unlock today's quiz.</p><div class="chips">${v.fresh.map(id => `<span class="chip">${(ST.week.hard || []).includes(id) ? "⭐ " : ""}${esc(BY[id].w)}</span>`).join("")}</div>${v.missIds.length ? `<p class="muted small">The ${v.missIds.length} word${v.missIds.length === 1 ? "" : "s"} you missed moved to your review list.</p>` : ""}</div>`
    : `<div class="notice">You need 80% to get new words. Keep training these. You can try again ${(ST.week.testOuts || 0) < 2 ? "once more this week" : "next week"}.</div>`}
  <button class="big primary" data-act="${v.pass ? "train" : "home"}">${v.pass ? "Learn my new words" : "Back home"}</button>`;
}

/* ---------- moving loader ---------- */
const LD_MSGS = ["Hang on tight! 🚀", "Almost there…!", "Warming up your words… 🔥", "Just a sec… 🐢", "Getting things ready ✏️"];
function loaderHtml(first) { clearInterval(window.__ld2); window.__ld2 = setInterval(() => { const e = document.getElementById("ldMsg2"); if (!e) return clearInterval(window.__ld2); const i = (LD_MSGS.indexOf(e.textContent) + 1) % LD_MSGS.length; e.style.opacity = 0; setTimeout(() => { e.textContent = LD_MSGS[i]; e.style.opacity = 1; }, 200); }, 1600);
  return `<div class="splash"><div class="loader"><div class="ld-buddy">${buddy("happy", 84)}</div><div class="ld-shadow"></div><p class="ld-msg" id="ldMsg2">${esc(first || LD_MSGS[0])}</p><div class="ld-dots"><i></i><i></i><i></i></div></div></div>`; }

/* ---------- "new version" popup ---------- */
const APP_VER = "fd829c43b5"; let VER_SNOOZE = 0;
async function checkVersion() {
  if (Date.now() < VER_SNOOZE || document.getElementById("verPop") || /^__/.test(APP_VER)) return;
  try { const r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" }); if (!r.ok) return; const j = await r.json();
    if (j.v && j.v !== APP_VER) {
      const el = document.createElement("div"); el.className = "cel"; el.id = "verPop";
      el.innerHTML = `<div class="cel-card"><div class="cel-icon">✨</div><h2>New version ready!</h2><p class="muted">Vocaboo just got better. Tap to update. It only takes a second.</p><p class="muted small">새 버전이 있어요! 눌러서 업데이트하세요.</p><button class="big primary" data-act="verUpdate" data-v="${esc(j.v)}">Update now</button><button class="ghost" data-act="verLater">Later</button></div>`;
      document.body.appendChild(el); } } catch (e) {}
}
setTimeout(checkVersion, 8000); setInterval(checkVersion, 10 * 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkVersion(); });

/* what the grade numbers mean (shown on the level result) */
function gradeInfoHtml() {
  const rows = [["K–2", "Kindergarten – 2nd grade", "초등 1–2학년 수준 (원어민)", "happy, jump, friend"], ["3–5", "3rd – 5th grade", "초등 3–5학년 수준", "explore, protect, journey"], ["6–8", "6th – 8th grade (middle school)", "초6 – 중2 수준", "analyze, contrast, essential"],
    ["9–12", "9th – 12th grade (high school)", "중3 – 고3 수준", "inevitable, ambiguous, scrutinize"], ["12+", "Beyond high school", "대학 이상", "ubiquitous, pragmatic"]];
  return `<details class="card" style="cursor:pointer"><summary style="font-weight:800;font-size:18px">ℹ️ What do the numbers mean? · 숫자의 뜻</summary>
    <p class="small">The number is a <b>US school grade</b>. It tells you which grade of American students knows about as many English words as you do. The decimal shows how far into that school year: <b>4.0</b> = start of 4th grade, <b>4.5</b> = middle of 4th grade.</p>
    <p class="small muted">숫자는 <b>미국 학년</b>이에요. 미국 원어민 학생 몇 학년만큼 단어를 아는지 보여줘요. 소수점은 학년 중 어디쯤인지예요 (4.0 = 4학년 초, 4.5 = 4학년 중간).</p>
    <table class="gtable"><tbody>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}<br><span class="muted small">${r[2]}</span><br><span class="small" style="color:var(--violet)">e.g. ${r[3]}</span></td></tr>`).join("")}</tbody></table>
    <p class="small">💡 For kids learning English as a second language, being a few grades below their age is normal. What matters is that the number goes up over time.</p>
    <p class="small muted">영어를 외국어로 배우는 아이는 나이보다 몇 학년 낮게 나오는 게 보통이에요. 숫자가 꾸준히 올라가는 게 중요해요.</p></details>`; }

/* ---------- family profiles (one parent login, several kids) ---------- */
let FAM = null, FAMPIN = null, PARENT_OK = 0;
const famKey = () => "vb_sid_" + ME;
const AV_COLORS = ["#7B61FF", "#FF6B5B", "#1FA98F", "#3F82F2", "#E0A100", "#D946EF"];
async function startFamily(forcePicker) {
  const prim = await db.doc("students/" + ME).get(); const P = prim.exists ? prim.data() : null;
  FAMPIN = (P && P.parentPin) || null;
  FAM = [{ sid: ME, st: P }];
  for (const sid of ((P && P.family) || [])) { try { const d = await db.doc("students/" + sid).get(); if (d.exists) FAM.push({ sid, st: d.data() }); } catch (e) {} }
  let pick = null; try { pick = localStorage.getItem(famKey()); } catch (e) {}
  if (forcePicker || FAM.length > 1) { /* with 2+ children, always ask who is learning */ mode = "student"; view = { name: "who" }; return render(); }
  SID = pick && FAM.some(f => f.sid === pick) ? pick : ME; return loadStudent(false);
}
function renderWho() {
  const card = (f, i) => { const st = f.st || {}; const nm = (st.profile && st.profile.name) || (i === 0 ? "My first child" : "New child");
    return `<button class="who-card" data-act="pickKid" data-sid="${esc(f.sid)}"><span class="avatar" style="width:72px;height:72px;font-size:32px;background:${AV_COLORS[i % AV_COLORS.length]}">${esc(nm[0].toUpperCase())}</span><b>${esc(nm)}</b><span class="muted small">${st.rejected ? "Not approved" : st.approved === false && st.profile ? "Waiting for approval" : st.level ? esc(gradeWord(st.level.g)) : st.profile ? "Level test next" : "Not set up yet"}</span></button>`; };
  $app.innerHTML = `<section class="hero" style="text-align:center;padding-bottom:70px"><div class="stack" style="align-items:center;gap:8px;padding-top:20px">${buddy("happy", 90)}<h1>Who's learning today?</h1><p class="muted">누가 공부할까요?</p></div></section>
    <div class="who-grid" style="margin-top:-48px;position:relative">${(FAM || []).map(card).join("")}${(FAM || []).length < 6 ? `<button class="who-card add" data-act="addKid"><span class="avatar" style="width:72px;height:72px;font-size:34px;background:var(--violet-soft);color:var(--violet)">+</span><b>Add a child</b><span class="muted small">아이 추가</span></button>` : ""}</div>
    <p class="muted small" style="text-align:center">Each child has their own words, level, streak and progress.</p>
    <button class="ghost" data-act="whoSignout" style="align-self:center">Sign out</button>`;
}
async function pickKid(sid) {
  try { localStorage.setItem(famKey(), sid); } catch (e) {}
  leaveActivity(); clearInterval(hbTimer); SESSION = null; WORDS = {}; PROG = null; TAB = "today"; tourAsked = false; PARENT_OK = 0;
  $app.innerHTML = loaderHtml("Getting ready… 🎒"); SID = sid; await loadStudent(false);
}
async function addKid() {
  const prim = await db.doc("students/" + ME).get(); const P = prim.exists ? clone(prim.data()) : null;
  if (!P) return pickKid(ME); // the first child uses the main profile
  const fam = P.family || []; let n = 2; while (fam.includes(ME + "_k" + n)) n++;
  const sid = ME + "_k" + n; P.family = fam.concat([sid]); await db.doc("students/" + ME).set(P);
  return pickKid(sid);
}
function switchKid() { leaveActivity(); closeMenu(); $app.innerHTML = loaderHtml("Opening profiles… 👨‍👩‍👧"); startFamily(true); }

/* ---------- parent corner (PIN) ---------- */
async function pinHash(pin) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("vocaboo|" + ME + "|" + pin)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
function parentUnlocked() { return PARENT_OK && Date.now() - PARENT_OK < 10 * 60000; }
let PIN_FLOW = null; // {mode:'set'|'confirm'|'enter'|'forgot', first, entry, err, then}
function openParent(then) { PIN_FLOW = { mode: FAMPIN ? "enter" : "set", entry: "", then: then || "parent" }; if (FAMPIN && parentUnlocked()) return pinDone(); drawPin(); }
function drawPin() {
  const old = document.getElementById("pinPad"); if (old) old.remove(); if (!PIN_FLOW) return;
  const F = PIN_FLOW; const title = F.mode === "set" ? "Create a parent PIN" : F.mode === "confirm" ? "Type the PIN again" : F.mode === "forgot" ? "Forgot your PIN?" : "Parents only";
  const sub = F.mode === "set" ? "4 numbers your child doesn't know. 아이가 모르는 4자리 숫자" : F.mode === "confirm" ? "" : F.mode === "forgot" ? "Type your Vocaboo account password to make a new PIN." : "Enter your 4-digit PIN · 부모님 비밀번호";
  const el = document.createElement("div"); el.className = "cel"; el.id = "pinPad";
  el.innerHTML = `<div class="cel-card" style="gap:12px"><div class="cel-icon">👨‍👩‍👧</div><h2 style="margin:0">${title}</h2>${sub ? `<p class="muted small" style="margin:0">${sub}</p>` : ""}
    ${F.mode === "forgot" ? `<input id="pinPw" type="password" autocomplete="current-password" placeholder="Account password" style="min-height:52px;width:100%;border-radius:16px;border:2px solid var(--line);padding:0 14px;font:inherit;font-size:18px"><button class="big primary" data-act="pinForgotGo">Continue</button>`
      : `<div class="pin-dots">${[0, 1, 2, 3].map(i => `<i class="${i < F.entry.length ? "on" : ""}"></i>`).join("")}</div>
      <div class="pin-keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map(k => k === "" ? "<span></span>" : `<button data-act="pinKey" data-k="${k}">${k}</button>`).join("")}</div>`}
    ${F.err ? `<div class="fb bad" style="width:100%">${esc(F.err)}</div>` : ""}
    <div class="row" style="justify-content:center">${F.mode === "enter" ? `<button class="ghost" data-act="pinForgot">Forgot PIN?</button>` : ""}<button class="ghost" data-act="pinClose">Cancel</button></div></div>`;
  document.body.appendChild(el);
}
async function pinKey(k) { const F = PIN_FLOW; if (!F) return; F.err = "";
  if (k === "⌫") F.entry = F.entry.slice(0, -1); else if (F.entry.length < 4) F.entry += k;
  if (F.entry.length < 4) return drawPin();
  if (F.mode === "set") { F.first = F.entry; F.entry = ""; F.mode = "confirm"; return drawPin(); }
  if (F.mode === "confirm") { if (F.entry !== F.first) { F.mode = "set"; F.entry = ""; F.err = "The PINs didn't match. Try again."; return drawPin(); }
    FAMPIN = await pinHash(F.entry); const prim = await db.doc("students/" + ME).get(); if (prim.exists) { const P = clone(prim.data()); P.parentPin = FAMPIN; await db.doc("students/" + ME).set(P); if (SID === ME) ST.parentPin = FAMPIN; }
    toast("Parent PIN saved 🔒"); return pinDone(); }
  if (F.mode === "enter") { if ((await pinHash(F.entry)) === FAMPIN) return pinDone(); F.entry = ""; F.err = "Wrong PIN. Try again."; return drawPin(); }
}
async function pinForgotGo() { const pw = (document.getElementById("pinPw") || {}).value || ""; if (!pw) return;
  try { await WW.reauth(pw); PIN_FLOW = { mode: "set", entry: "", then: PIN_FLOW.then }; drawPin(); }
  catch (e) { PIN_FLOW.err = "That password isn't right."; drawPin(); } }
function pinDone() { PARENT_OK = Date.now(); const then = PIN_FLOW && PIN_FLOW.then; PIN_FLOW = null; const el = document.getElementById("pinPad"); if (el) el.remove();
  if (then === "signout") { WW.signOut().then(() => location.reload()); return; }
  leaveActivity(); view = { name: "parent" }; PROG = null; window.scrollTo(0, 0); render(); }
function renderParent() {
  if (!parentUnlocked()) { view = { name: "tabs" }; TAB = "me"; return render(); }
  if (!PROG) { $app.innerHTML = loaderHtml("Loading the parent report… 📊"); loadProgress().then(() => view.name === "parent" && render()).catch(() => { PROG = { atts: [], sess: [] }; render(); }); return; }
  const wk = weekKey(); const sess = PROG.sess.filter(s => s.weekKey === wk); const mins = Math.round(sess.reduce((t, s) => t + actSec(s), 0) / 60);
  const days = new Set(sess.map(s => s.day)).size; const qz = PROG.atts.filter(a => a.kind === "quiz" && a.end && a.weekKey === wk); const avg = qz.length ? Math.round(qz.reduce((t, a) => t + a.score, 0) / qz.length * 100) : null;
  const ids = weekIds(); const mastered = ids.filter(isMastered).length; const learned = Object.keys(WORDS).length; const totalMastered = Object.keys(WORDS).filter(isMastered).length;
  const miss = {}; PROG.atts.filter(a => a.weekKey === wk && ["quiz", "training", "boss", "testout"].includes(a.kind)).flatMap(a => a.items || []).filter(i => !i.ok && BY[i.id] && !SPEAK.has(i.t)).forEach(i => miss[i.id] = (miss[i.id] || 0) + 1);
  const tricky = Object.entries(miss).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const L = ST.level; const g0 = ST.goal ? ST.goal.from : L ? L.g : 0; const goalPct = ST.goal && L ? Math.max(0, Math.min(100, (L.g - g0) / Math.max(0.1, ST.goal.g - g0) * 100)) : 0;
  const times = (ST.push && ST.push.times) || [8, 17, 20];
  const hourSel = (i) => `<select data-change="remTime" data-i="${i}" style="min-height:46px;border-radius:14px;border:2px solid var(--line);padding:0 10px;font:inherit;font-size:16px;background:#fff"><option value="">Off</option>${Array.from({ length: 17 }, (_, k) => k + 6).map(h => `<option value="${h}" ${times[i] === h ? "selected" : ""}>${h < 12 ? h + ":00 am" : h === 12 ? "12:00 pm" : (h - 12) + ":00 pm"}</option>`).join("")}</select>`;
  $app.innerHTML = `<div class="topbar"><button class="x" data-act="parentClose" aria-label="Back">${I.back}</button><span class="count" style="flex:1">For parents · 부모님</span><span style="width:44px;flex:none"></span></div>
   <section class="hero" style="padding:18px 20px"><div class="row" style="gap:12px"><span class="avatar big">${esc((firstName() || "?")[0].toUpperCase())}</span><div class="stack" style="gap:2px"><h1 style="margin:0;font-size:26px">${esc(firstName())}'s week</h1><span class="muted">${L ? esc(gradeWord(L.g)) : ""}${ageOf(ST) != null ? " · age " + ageOf(ST) : ""}</span></div></div></section>
   <div class="tiles"><div class="tile"><b>${mins}</b><span>minutes this week</span></div><div class="tile"><b>${days}/7</b><span>days studied</span></div><div class="tile"><b>${qz.length}</b><span>quizzes${avg != null ? " · avg " + avg + "%" : ""}</span></div></div>
   <div class="tiles"><div class="tile"><b>${streakNow()}🔥</b><span>day streak${ST.freezes ? " · ❄️" + ST.freezes : ""}</span></div><div class="tile"><b>${mastered}/${ids.length}</b><span>this week's words mastered</span></div><div class="tile"><b>${totalMastered}</b><span>words mastered total (${learned} studied)</span></div></div>
   ${L ? `<div class="card"><div class="row between"><h3>Word level</h3><span class="pill sun">${esc(gradeWord(L.g))}</span></div>${ST.goal ? `<div class="stack" style="gap:5px"><div class="row between small"><span class="muted">Goal: ${esc(gradeWord(ST.goal.g))} by ${ST.goal.by}</span><b>${Math.round(goalPct)}%</b></div><div class="hbar"><i style="width:${goalPct}%;background:#FFC93C"></i></div></div>` : ""}</div>` : ""}
   <div class="card"><h3>Needs more practice</h3>${tricky.length ? `<div class="chips">${tricky.map(([id, n]) => `<span class="chip">${esc(BY[id].w)} · ${esc(gloss(BY[id]))} <b>×${n}</b></span>`).join("")}</div>` : `<p class="muted">No misses this week. 👏</p>`}</div>
   <div class="card"><h3>Reminder times 🔔</h3><p class="muted small">Choose up to 3 times a day. ${pushOn() ? "" : "Reminders are off on this phone. Turn them on below."}</p><div class="row" style="gap:8px">${hourSel(0)}${hourSel(1)}${hourSel(2)}</div>${pushOn() ? "" : `<button class="big primary" data-act="pushOn">Turn on reminders</button>`}</div>
   ${planCard()}
   <div class="card"><h3>Word meanings</h3><div class="seg" style="width:100%"><button data-act="setLang" data-v="ko" aria-pressed="${KO()}" style="flex:1">English + 한국어</button><button data-act="setLang" data-v="en" aria-pressed="${!KO()}" style="flex:1">English only</button></div></div>
   <div class="card"><h3>Parent PIN</h3><div class="row"><button data-act="pinChange">Change PIN</button></div></div>
   <button class="big primary icon-l" data-act="weekCard">📸 Weekly card · 이번 주 카드</button>
   ${resetCard()}
   ${SID !== ME ? `<div class="card"><h3>Remove this child's profile</h3><p class="muted small">Deletes ${esc(firstName() || "this child")}'s profile and all their learning records from this account. This can't be undone. 이 자녀 프로필과 학습 기록을 모두 삭제해요.</p><button data-act="removeKid" style="color:#B3261E">Remove profile…</button></div>` : ""}
   <button class="big" data-act="switchKid">👥 Switch or add child</button>
   <button class="big" data-act="signoutNow">Sign out</button>`;
}
function saveRemTime(i, v) { const t = ((ST.push && ST.push.times) || [8, 17, 20]).slice(); while (t.length < 3) t.push(null); t[i] = v === "" ? null : +v;
  const clean = [...new Set(t.filter(x => x != null))].sort((a, b) => a - b);
  ST.push = Object.assign({}, ST.push || {}, { times: clean, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }); saveST(); toast(clean.length ? "Reminders at " + clean.map(h => (h > 12 ? h - 12 : h) + (h < 12 ? "am" : "pm")).join(", ") : "Reminders off"); render(); }

/* ---------- streak freeze ---------- */
// earn 1 freeze for every 5 quizzes finished (hold up to 2). A freeze covers one missed day.
function streakAlive(s, d) { if (!s || !s.last) return false; const gap = Math.round((new Date(d + "T12:00:00") - new Date(s.last + "T12:00:00")) / 864e5); return gap <= 1 + (ST.freezes || 0); }
function streakUpdate(d) { const s = ST.streak || { count: 0, best: 0, last: "" };
  if (s.last === d) return s;
  const gap = s.last ? Math.round((new Date(d + "T12:00:00") - new Date(s.last + "T12:00:00")) / 864e5) : 99;
  if (gap === 1) s.count = (s.count || 0) + 1;
  else if (gap > 1 && gap - 1 <= (ST.freezes || 0)) { ST.freezes -= gap - 1; ST.freezeUsed = (ST.freezeUsed || 0) + gap - 1; s.count = (s.count || 0) + 1; setTimeout(() => toast("❄️ A streak freeze saved your streak!"), 1200); }
  else s.count = 1;
  s.last = d; s.best = Math.max(s.best || 0, s.count);
  ST.quizzesDone = (ST.quizzesDone || 0) + 1; if (ST.quizzesDone % 5 === 0 && (ST.freezes || 0) < 2) { ST.freezes = (ST.freezes || 0) + 1; setTimeout(() => toast("❄️ You earned a streak freeze!"), 2600); }
  return s; }

/* ---------- bigger text ---------- */
function applyTextSize() { const z = (ST && ST.settings && ST.settings.text) || "m"; document.body.classList.toggle("txt-l", z === "l"); document.body.classList.toggle("txt-xl", z === "xl"); }
function textCard() { const z = (ST.settings && ST.settings.text) || "m";
  return `<div class="card"><h3>Text size</h3><div class="seg" style="width:100%"><button data-act="setText" data-v="m" aria-pressed="${z === "m"}" style="flex:1">A</button><button data-act="setText" data-v="l" aria-pressed="${z === "l"}" style="flex:1;font-size:18px">A</button><button data-act="setText" data-v="xl" aria-pressed="${z === "xl"}" style="flex:1;font-size:22px">A</button></div></div>`; }

async function removeKid(btn) {
  if (SID === ME) return;
  if (btn.dataset.armed !== "1") { btn.dataset.armed = "1"; btn.textContent = "Tap again to remove " + (firstName() || "this profile") + " for good"; return; }
  $app.innerHTML = loaderHtml("Removing profile…");
  try { const prim = await db.doc("students/" + ME).get(); const P = prim.exists ? clone(prim.data()) : null;
    if (P) { P.family = (P.family || []).filter(x => x !== SID); await db.doc("students/" + ME).set(P); }
    ST.deleted = Date.now(); await saveST(); // the teacher dashboard deletes it for good
  } catch (e) { toast("Couldn't remove it. Try again."); }
  try { localStorage.removeItem(famKey()); } catch (e) {}
  leaveActivity(); SID = ME; PARENT_OK = 0; startFamily(true);
}

/* ---------- world map: one island per week, boss island every 4 weeks ---------- */
const WORLDS = [
  { name: "Crystal Peaks", ko: "크리스탈 봉우리", bg: ["#1E2A6E", "#4B2C91"], top: "#E6F4FF", side: "#8EC5FF", side2: "#5C9EE8", deco: "crystal" },
  { name: "Jungle Jumble", ko: "정글 대모험", bg: ["#0D3B2E", "#178A6E"], top: "#B5E48C", side: "#8B5E34", side2: "#6B4423", deco: "tree" },
  { name: "Sunny Dunes", ko: "햇살 사막", bg: ["#9A3412", "#F59E0B"], top: "#FDE68A", side: "#D97706", side2: "#B45309", deco: "cactus" },
  { name: "Star Galaxy", ko: "별빛 은하", bg: ["#0B1026", "#4C1D95"], top: "#DDD6FE", side: "#7C3AED", side2: "#5B21B6", deco: "planet" }
];
const PER_WORLD = 12;
function mapWeeks() { const ks = new Set(((ST.history || []).map(h => h.key)).concat(ST.week ? [ST.week.key] : [])); return [...ks].sort(); }
function weekWords(key) { if (ST.week && ST.week.key === key) return ST.week.newIds.concat(ST.week.reviewIds); const h = (ST.history || []).filter(x => x.key === key).pop(); return h ? h.newIds.concat(h.reviewIds || []) : []; }
function starsFor(key) {
  const cur = ST.week && ST.week.key === key; const saved = (ST.weekStars || {})[key] || 0;
  const qd = (ST.quizDays || []).filter(d => d >= key && d <= addDays(key, 6)).length; const story = (ST.storyWeeks || []).includes(key);
  let s = 0; if ((cur && (ST.week.trained || []).length > 0) || (!cur && qd > 0)) s = 1; if (s >= 1 && qd >= 4) s = 2; if (s >= 2 && story) s = 3;
  return Math.max(saved, s);
}
function saveStars() { const k = ST.week && ST.week.key; if (!k) return; const s = starsFor(k); ST.weekStars = ST.weekStars || {}; if ((ST.weekStars[k] || 0) < s) { ST.weekStars[k] = s; saveST(); if (s === 3) setTimeout(() => toast("⭐⭐⭐ Island complete!"), 400); } }
function bossReady(b, weeks) { const last = 4 * b + 3; return weeks.length > last && starsFor(weeks[last]) >= 1; }

function islandSvg(x, y, th, state, r) { // state: done | current | locked
  r = r || 46; const lock = state === "locked"; const top = lock ? "#C9C5D9" : th.top, side = lock ? "#8F8AA8" : th.side, side2 = lock ? "#7A7594" : th.side2;
  let deco = "";
  if (!lock) {
    if (th.deco === "crystal") deco = `<path d="M${x - 22} ${y - 6}l6 -22 6 22z" fill="#9AD0FF"/><path d="M${x - 14} ${y - 4}l4 -14 4 14z" fill="#C7E6FF"/><path d="M${x + 16} ${y - 5}l5 -18 5 18z" fill="#9AD0FF"/>`;
    if (th.deco === "tree") deco = `<rect x="${x - 21}" y="${y - 20}" width="4" height="14" fill="#6B4423"/><circle cx="${x - 19}" cy="${y - 24}" r="10" fill="#2D9D5C"/><rect x="${x + 17}" y="${y - 16}" width="4" height="11" fill="#6B4423"/><circle cx="${x + 19}" cy="${y - 20}" r="8" fill="#38B26C"/>`;
    if (th.deco === "cactus") deco = `<rect x="${x - 22}" y="${y - 26}" width="7" height="20" rx="3.5" fill="#3F9E4D"/><rect x="${x - 28}" y="${y - 20}" width="5" height="9" rx="2.5" fill="#3F9E4D"/><rect x="${x + 16}" y="${y - 18}" width="6" height="13" rx="3" fill="#3F9E4D"/>`;
    if (th.deco === "planet") deco = `<circle cx="${x - 20}" cy="${y - 16}" r="8" fill="#F472B6"/><ellipse cx="${x - 20}" cy="${y - 16}" rx="13" ry="3.5" fill="none" stroke="#FBCFE8" stroke-width="2"/><path d="M${x + 18} ${y - 22}l2 5 5 1 -4 3 1 5 -4 -3 -4 3 1 -5 -4 -3 5 -1z" fill="#FDE047"/>`;
  }
  return `<g${lock ? ' opacity=".75"' : ""}><path d="M${x - r} ${y} Q${x - r * 0.8} ${y + r * 0.95} ${x} ${y + r * 1.15} Q${x + r * 0.8} ${y + r * 0.95} ${x + r} ${y} Z" fill="${side}"/><path d="M${x} ${y} L${x + r} ${y} Q${x + r * 0.8} ${y + r * 0.95} ${x} ${y + r * 1.15} Z" fill="${side2}" opacity=".55"/>
    <ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.42}" fill="${top}"/><ellipse cx="${x}" cy="${y + 2}" rx="${r * 0.55}" ry="${r * 0.2}" fill="rgba(0,0,0,.07)"/>${deco}</g>`;
}
function starRow(x, y, n) { return [0, 1, 2].map(k => { const cx = x + (k - 1) * 22, cy = y - (k === 1 ? 6 : 0); return `<g transform="translate(${cx} ${cy})"><circle r="10" fill="${k < n ? "#FFC93C" : "rgba(255,255,255,.25)"}" stroke="${k < n ? "#E0A100" : "rgba(255,255,255,.35)"}" stroke-width="2"/><path d="M0 -5.5l1.6 3.4 3.7.4-2.8 2.5.8 3.6L0 2.6l-3.3 1.8.8-3.6-2.8-2.5 3.7-.4z" fill="${k < n ? "#B45309" : "rgba(255,255,255,.5)"}"/></g>`; }).join(""); }
function renderMap() {
  saveStars();
  const weeks = mapWeeks(); const curIdx = weeks.length - 1;
  // nodes: weeks + boss after every 4, plus 2 upcoming locked islands
  const nodes = []; const total = weeks.length + 2;
  for (let i = 0; i < total; i++) { nodes.push({ kind: "week", i }); if ((i + 1) % 4 === 0) nodes.push({ kind: "boss", b: (i + 1) / 4 - 1 }); }
  const worldOf = n => Math.floor((n.kind === "week" ? n.i : n.b * 4 + 3) / PER_WORLD);
  const W = 360; const gaps = nodes.map(n => n.kind === "boss" ? 205 : 170); const H = gaps.reduce((a, b) => a + b, 0) + 170;
  let yy = H - 140; const pos = nodes.map((n, k) => { if (k) yy -= (n.kind === "boss" || nodes[k - 1].kind === "boss") ? 200 : 168; return { x: W / 2 + Math.sin(k * 1.15) * 100, y: yy }; });
  let path = "", bg = "", art = "";
  // backgrounds per world band
  let worldStartY = H; for (let k = 0; k < nodes.length; k++) { const w = worldOf(nodes[k]); const nextW = k + 1 < nodes.length ? worldOf(nodes[k + 1]) : -1;
    if (nextW !== w) { const th = WORLDS[w % WORLDS.length]; const yTop = k + 1 < nodes.length ? (pos[k].y + pos[k + 1].y) / 2 : 0;
      bg = `<rect x="0" y="${yTop}" width="${W}" height="${worldStartY - yTop}" fill="url(#wg${w % WORLDS.length})"/><text x="18" y="${worldStartY - 18}" font-size="13" font-weight="900" fill="rgba(255,255,255,.75)" font-family="Nunito,sans-serif">WORLD ${w + 1} · ${th.name.toUpperCase()}</text>` + bg; worldStartY = yTop; } }
  // clouds / sparkles
  for (let c = 0; c < nodes.length; c++) { const cy = pos[c].y - 85; const cx = (c * 97) % (W - 60) + 20; art += `<g opacity=".35"><ellipse cx="${cx}" cy="${cy}" rx="26" ry="9" fill="#fff"/><ellipse cx="${cx + 14}" cy="${cy - 6}" rx="14" ry="9" fill="#fff"/></g><circle cx="${(cx + 180) % W}" cy="${cy + 40}" r="2" fill="#fff" opacity=".6"/>`; }
  // stepping stones
  for (let k = 0; k + 1 < nodes.length; k++) { const a = pos[k], b = pos[k + 1]; const locked = nodeState(nodes[k + 1]) === "locked";
    for (let s = 1; s <= 3; s++) { const t = s / 4; path += `<ellipse cx="${a.x + (b.x - a.x) * t}" cy="${a.y - 10 + (b.y - a.y) * t}" rx="9" ry="4" fill="${locked ? "rgba(255,255,255,.25)" : "rgba(255,255,255,.75)"}"/>`; } }
  function nodeState(n) { if (n.kind === "week") return n.i < curIdx ? "done" : n.i === curIdx ? "current" : "locked"; const c = (ST.bosses || {})[n.b]; return c ? "done" : bossReady(n.b, weeks) ? "current" : "locked"; }
  let isl = "";
  nodes.forEach((n, k) => { const p = pos[k]; const th = WORLDS[worldOf(n) % WORLDS.length]; const st = nodeState(n);
    if (n.kind === "week") {
      const s = st === "locked" ? 0 : starsFor(weeks[n.i]);
      isl += `<g class="isle" data-act="isle" data-i="${n.i}" style="cursor:pointer">${st === "current" ? `<ellipse cx="${p.x}" cy="${p.y}" rx="62" ry="28" fill="none" stroke="#FFC93C" stroke-width="4" class="isle-pulse"/>` : ""}${islandSvg(p.x, p.y, th, st)}
        ${st === "locked" ? `<text x="${p.x}" y="${p.y + 8}" text-anchor="middle" font-size="22">🔒</text>` : starRow(p.x, p.y - (st === "current" ? 78 : 50), s)}
        <rect x="${p.x - 34}" y="${p.y + 52}" width="68" height="22" rx="11" fill="rgba(0,0,0,.35)"/><text x="${p.x}" y="${p.y + 67}" text-anchor="middle" font-size="12" font-weight="900" fill="#fff" font-family="Nunito,sans-serif">Week ${n.i + 1}</text>
        ${st === "current" ? `<g transform="translate(${p.x - 19} ${p.y - 46}) scale(.4)">${buddy("happy", 96).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</g>` : ""}</g>`;
    } else {
      const c = (ST.bosses || {})[n.b] || 0;
      isl += `<g class="isle" data-act="boss" data-b="${n.b}" style="cursor:pointer">${st === "current" ? `<ellipse cx="${p.x}" cy="${p.y}" rx="72" ry="32" fill="none" stroke="#FF6B5B" stroke-width="4" class="isle-pulse"/>` : ""}${islandSvg(p.x, p.y, th, st === "locked" ? "locked" : "done", 58)}
        <g transform="translate(${p.x} ${p.y - 18})"><rect x="-18" y="-26" width="36" height="28" fill="${st === "locked" ? "#8F8AA8" : "#FF6B5B"}"/><path d="M-22 -26h44l-6 -10h-6l-3 6h-4l-3 -6h-4l-3 6h-4l-3 -6h-6z" fill="${st === "locked" ? "#7A7594" : "#E04F3F"}"/><rect x="-6" y="-12" width="12" height="14" rx="6" fill="rgba(0,0,0,.35)"/></g>
        ${c ? starRow(p.x, p.y - 86, c) : `<text x="${p.x}" y="${p.y - 56}" text-anchor="middle" font-size="22">${st === "locked" ? "🔒" : "👑"}</text>`}
        <rect x="${p.x - 44}" y="${p.y + 62}" width="88" height="22" rx="11" fill="rgba(0,0,0,.4)"/><text x="${p.x}" y="${p.y + 77}" text-anchor="middle" font-size="12" font-weight="900" fill="#fff" font-family="Nunito,sans-serif">Boss review</text></g>`;
    } });
  const defs = WORLDS.map((t, k) => `<linearGradient id="wg${k}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${t.bg[1]}"/><stop offset="1" stop-color="${t.bg[0]}"/></linearGradient>`).join("");
  const totalStars = weeks.reduce((t, k) => t + starsFor(k), 0) + Object.values(ST.bosses || {}).reduce((a, b) => a + b, 0);
  $app.innerHTML = `${previewBar()}<div class="row between" style="padding-top:18px;padding-right:52px"><div class="stack" style="gap:2px"><h1 style="margin:0">World map</h1><span class="muted small">${esc(WORLDS[Math.floor(curIdx / PER_WORLD) % WORLDS.length].name)} · ${esc(WORLDS[Math.floor(curIdx / PER_WORLD) % WORLDS.length].ko)}</span></div><span class="pill sun" style="font-size:15px">⭐ ${totalStars}</span></div>
    <div class="map-wrap" id="mapWrap"><svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block"><defs>${defs}</defs>${bg}${art}${path}${isl}</svg></div>
    <div class="card"><h3>How to earn stars</h3><p class="small" style="margin:0">⭐ Learn the week's words &nbsp; ⭐⭐ Daily quiz on 4+ days &nbsp; ⭐⭐⭐ Also finish the weekly story</p><p class="muted small" style="margin:0">Every 4 islands, beat the 👑 boss review to show you still remember older words. A new island opens every week.</p></div>`;
  const cur = document.querySelector(`[data-act="isle"][data-i="${curIdx}"]`); if (cur && !renderMap._scrolled) { renderMap._scrolled = true; setTimeout(() => cur.scrollIntoView({ block: "center" }), 60); }
}
function isleSheet(i) {
  const weeks = mapWeeks(); const key = weeks[i]; const cur = i === weeks.length - 1;
  let html;
  if (!key) html = `<div class="cel-icon">🔒</div><h2>Week ${i + 1}</h2><p class="muted">This island opens on Saturday, ${new Date(addDays(weekKey(), 7 * (i - weeks.length + 1)) + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}. Finish this week's island first!</p>`;
  else { const s = starsFor(key); const ids = weekWords(key); const qd = (ST.quizDays || []).filter(d => d >= key && d <= addDays(key, 6)).length;
    html = `<div class="cel-icon">${["🏝️", "⭐", "⭐⭐", "🌟"][s]}</div><h2 style="margin:0">Week ${i + 1}</h2><p class="muted small" style="margin:0">${wkShort(key)} – ${wkShort(addDays(key, 6))}</p>
      <div class="stack" style="gap:6px;text-align:left;width:100%"><span>${s >= 1 ? "✅" : "⬜"} Learn the week's words</span><span>${s >= 2 ? "✅" : "⬜"} Daily quiz on 4+ days <span class="muted small">(${qd} so far)</span></span><span>${s >= 3 ? "✅" : "⬜"} Finish the weekly story</span></div>
      ${ids.length ? `<div class="chips" style="justify-content:center">${ids.slice(0, 12).map(id => `<span class="chip">${esc(BY[id] ? BY[id].w : id)}</span>`).join("")}${ids.length > 12 ? `<span class="chip">+${ids.length - 12}</span>` : ""}</div>` : ""}
      ${cur ? `<button class="big primary" data-act="sheetGo" data-go="home">Go to today's plan</button>` : `<button class="big primary" data-act="sheetGo" data-go="practice" data-i="${i}">Practice these words</button>`}`; }
  sheet(html);
}
function bossSheet(b) { const weeks = mapWeeks(); const ready = bossReady(b, weeks); const c = (ST.bosses || {})[b] || 0;
  sheet(`<div class="cel-icon">👑</div><h2 style="margin:0">Boss review ${b + 1}</h2>
    <p class="muted">${ready ? `A 20-question challenge with words from weeks ${4 * b + 1}–${4 * b + 4}. Get 80% to win. 90% = ⭐⭐, 95% = ⭐⭐⭐.` : `Opens when you reach week ${4 * b + 4} and earn at least one star there.`}</p>
    ${c ? `<p>Best: ${"⭐".repeat(c)}</p>` : ""}${ready ? `<button class="big primary" data-act="bossGo" data-b="${b}">${c ? "Try again" : "Fight the boss!"}</button>` : ""}`); }
function sheet(inner) { const old = document.getElementById("mapSheet"); if (old) old.remove(); const el = document.createElement("div"); el.className = "cel"; el.id = "mapSheet";
  el.innerHTML = `<div class="cel-card" style="gap:10px">${inner}<button class="ghost" data-act="sheetClose">Close</button></div>`; el.addEventListener("click", e => { if (e.target === el) el.remove(); }); document.body.appendChild(el); }
function closeSheet() { const el = document.getElementById("mapSheet"); if (el) el.remove(); }
async function startBoss(b) {
  closeSheet(); const weeks = mapWeeks(); let pool = []; for (let w = 4 * b; w <= 4 * b + 3; w++) pool = pool.concat(weekWords(weeks[w] || ""));
  pool = shuffle([...new Set(pool)].filter(id => BY[id])).slice(0, 20); if (pool.length < 5) { toast("Not enough words yet"); return; }
  const types = KO() ? ["mc_ko", "ko_en", "hear_ko", "blank_mc", "dict", "ctx_ko", "def_en", "blank_ty"] : ["mc_def", "def_en", "hear_ko", "blank_mc", "dict", "ctx_ko", "blank_ty"];
  const qs = pool.map((id, i) => makeQ2(id, types[i % types.length], pool));
  RUN = { kind: "boss", boss: b, qs, i: 0, t0: Date.now(), answered: false, right: 0 };
  startAttempt("boss", { n: qs.length, boss: b }); logDid("boss " + (b + 1));
  view = { name: "run" }; render(); await loadPacksFor(pool); RUN && (RUN.t0 = Date.now()); autoSpeak();
}
function finishBoss() {
  const n = RUN.qs.length, pct = Math.round(RUN.right / n * 100), b = RUN.boss; const stars = pct >= 95 ? 3 : pct >= 90 ? 2 : pct >= 80 ? 1 : 0;
  ATT.end = Date.now(); ATT.score = RUN.right / n; ATT.stars = stars; saveAttempt();
  ST.bosses = ST.bosses || {}; const was = ST.bosses[b] || 0; if (stars > was) ST.bosses[b] = stars;
  if (stars) { award(stars * 25, "boss"); bumpStat("bosses"); }
  saveST(); PROG = null;
  const missed = [...new Set(ATT.items.filter(i => !i.ok).map(i => i.id))];
  view = { name: "bossResult", pct, stars, b, missed }; RUN = null; render();
}
function renderBossResult() { const v = view;
  $app.innerHTML = `<div style="height:14px"></div><div class="result-hero ${v.stars ? "" : "bad"}">${buddy(v.stars ? "wow" : "sad", 96)}<h1>${v.stars ? "Boss defeated! 👑" : "So close!"}</h1>
    <p style="font-size:30px;margin:0">${v.stars ? "⭐".repeat(v.stars) : ""}</p><p style="opacity:.9">${v.pct}% correct${v.stars ? "" : " · you need 80% to win"}</p></div>
    ${v.missed.length ? `<div class="card"><h3>Words to practice</h3><div class="chips">${v.missed.map(id => `<span class="chip">${esc(BY[id].w)} · ${esc(gloss(BY[id]))}</span>`).join("")}</div><button class="big" data-act="bossPractice">Practice these words</button></div>` : ""}
    <button class="big primary" data-act="toMap">Back to the map</button>`; }
let T = { students: [], sel: null, data: null, tab: "week", week: null, names: {}, view: "list", q: "", sort: "name" };
async function loadTeacher() {
  let list = await getAll("students");
  // profiles a family removed are deleted automatically
  const gone = list.filter(s => s.deleted); for (const s of gone) { try { await purgeStudent(s._id); } catch (e) { console.warn("purge", s._id, e); } }
  list = list.filter(s => !s.deleted);
  T.students = list.sort((a, b) => (a.test ? 1 : 0) - (b.test ? 1 : 0) || a.created - b.created);
  if (user) { try { const ids = T.students.map(s => s._id); if (ids.length) T.names = await user.profiles(ids); } catch (e) {} }
  if (T.sel && !T.students.find(s => s._id === T.sel)) { T.sel = null; T.view = "list"; }
  try { const bd = await db.doc("config/beta").get(); T.beta = bd.exists ? bd.data() : { on: false, cap: 50, count: 0 }; } catch (e) { T.beta = { on: false, cap: 50, count: 0 }; }
  if (T.view === "student" && T.sel) await loadStudentData(T.sel); else T.data = null;
  render();
}
async function loadStudentData(sid) {
  const base = "students/" + sid;
  const [sd, words, atts, sess] = await Promise.all([db.doc(base).get(), getAll(base + "/words"), getAll(base + "/attempts"), getAll(base + "/sessions")]);
  const wmap = {}; words.forEach(w => wmap[w._id] = w);
  T.data = { st: sd.exists ? clone(sd.data()) : null, words: wmap, atts, sess };
  WK_ANCHOR = (T.data.st && T.data.st.weekAnchor) || null; // anchors are only set for students without the textbook
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
  const tagName = i => i.t === "say_en" ? "quiz" : i.t === "say" ? "word" : i.tag && /^e\d/.test(i.tag) ? "sentence " + (+i.tag.slice(1) + 1) : i.kind === "coach" ? "coach sentence" : "sentence";
  const sayBad = {}; items.filter(i => (SPEAK.has(i.t) || i.t === "say_en") && !i.ok).forEach(i => { const b = sayBad[i.id] || (sayBad[i.id] = { n: 0, skip: 0, heard: [], skipped: {}, where: {} }); const w = tagName(i);
    if (i.ans === "(skipped)") { b.skip++; b.skipped[w] = 1; } else if (i.ans === "(nothing heard)") { b.silent = (b.silent || 0) + 1; } else if (i.ans === "(spoke, not recognized)") { b.spoke = (b.spoke || 0) + 1; } else if (i.ans === "(only noise)") { b.noise = (b.noise || 0) + 1; } else { b.n++; b.where[w] = 1; if (i.ans) b.heard.push(i.ans); } });
  items.filter(i => i.hints).forEach(i => { const b = byWord[i.id]; if (b) b.hints = (b.hints || 0) + i.hints; });
  const coach = items.filter(i => i.t === "coach");
  const stories = atts.filter(a => a.kind === "story" && a.end); let xpWeek = 0; for (let i = 0; i < 7; i++) xpWeek += ((T.data.st && T.data.st.xpDays) || {})[addDays(wk, i)] || 0;
  const ratings = {}; atts.filter(a => a.kind === "training" && a.ratings).sort((x, y) => x.start - y.start).forEach(a => Object.entries(a.ratings).forEach(([id, r]) => { ratings[id] = r[r.length - 1]; }));
  return { stories, xpWeek, ratings, coach, sayBad, atts, sess, quizzes, trains, days, byType, byWord, near, far, totalSec, activeDays, avg, locks: quizzes.filter(q => q.locked).length, required: trains.filter(t => t.required).length };
}
function weekOptions() { const ks = new Set([weekKey()]); (T.data.atts || []).forEach(a => ks.add(a.weekKey)); (T.data.sess || []).forEach(a => ks.add(a.weekKey)); return [...ks].sort().reverse(); }
function wkLabel(k) { const a = new Date(k + "T12:00:00"), b = new Date(addDays(k, 6) + "T12:00:00"); return `${a.getMonth() + 1}/${a.getDate()} (${DOW[a.getDay()]}) – ${b.getMonth() + 1}/${b.getDate()} (${DOW[b.getDay()]})`; }
function reportText() {
  const wk = T.week; const S = weekStats(wk); const st = T.data.st; const name = studentLabel(T.students.find(s => s._id === T.sel));
  const L = [];
  L.push(`VOCABOO WEEKLY REPORT — ${name} — ${wkLabel(wk)}`);
  if (st.profile) L.push(`Age ${ageOf(st)}. Meanings shown: ${SET(st).lang === "en" ? "English only" : "English + Korean"}.`);
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
  st.settings = Object.assign({}, st.settings || {}, { lang: v("sLang"), textbook: v("sTb") === "1", tbNew: n("sTbNew", 0, 40), startUnit: n("sStart", 1, 30), grNew: n("sGrNew", 0, 40), review: n("sRev", 0, 30), kor: v("sKor") === "1", speak: v("sSpeak") === "1" });
  if (v("sGoal") !== "") st.goal = Object.assign({}, st.goal || { from: st.level ? st.level.g : 0 }, { g: n("sGoal", 0, 13), by: v("sGoalBy") || addDays(today(), 182), auto: false });
  if (v("sLevel") !== "" && st.level && Math.abs(+v("sLevel") - st.level.g) > 0.04) { const g = n("sLevel", 0, 13); st.level = Object.assign({}, st.level, { g, lo: Math.max(0, g - 0.3), hi: Math.min(13, g + 0.3), set: "teacher" }); }
  st.quizSize = n("cfgSize", 5, 30);
  await setDoc("students/" + T.sel, st); toast("Plan saved"); render();
}

async function loadFeedback() { const out = [];
  try { (await getAll("anonFeedback")).forEach(f => out.push(Object.assign({ who: "Anonymous" }, f))); } catch (e) {}
  for (const s of T.students) { try { (await getAll("students/" + s._id + "/feedback")).forEach(f => out.push(Object.assign({ sid: s._id, who: "Anonymous" }, f, { name: "", email: "" }))); } catch (e) {} }
  T.fb = out.sort((a, b) => b.at - a.at); if (T.tab === "feedback") render(); }
function feedbackHtml() {
  if (!T.fb) return `<div class="card"><p class="muted">Loading feedback…</p></div>`;
  const faces = ["😍", "🙂", "😐", "🙁"]; const sv = T.fb.filter(f => f.kind === "survey"), kids = T.fb.filter(f => f.kind !== "survey");
  const L = k => { const q = SURVEY.find(x => x.k === k); return v => q && q.opts ? ((q.opts.find(o => o[0] === v) || [, v])[1].split(" · ")[0]) : v; };
  const tally = k => { const c = {}; sv.forEach(f => { const v = f.answers && f.answers[k]; (Array.isArray(v) ? v : v != null ? [v] : []).forEach(x => c[x] = (c[x] || 0) + 1); }); return c; };
  const bar = (label, n, tot, col) => `<div class="stack" style="gap:3px"><div class="row between small"><span>${esc(label)}</span><b>${n}</b></div><div class="hbar"><i style="width:${tot ? Math.round(n / tot * 100) : 0}%;background:${col || "#7B61FF"}"></i></div></div>`;
  const avg = (k) => { const v = sv.map(f => f.answers && f.answers[k]).filter(x => typeof x === "number"); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : "–"; };
  const stars = sv.length ? (sv.reduce((a, f) => a + (f.stars || 0), 0) / sv.length) : 0;
  const block = (k, title) => { const c = tally(k); const tot = Object.values(c).reduce((a, b) => a + b, 0); const q = SURVEY.find(x => x.k === k);
    return `<div class="card"><h3>${esc(title)}</h3>${q.opts.map(([v]) => bar(L(k)(v), c[v] || 0, k === "helps" ? sv.length : tot, v === "yes" || v === "right" || v === "daily" ? "#1FA98F" : v === "no" || v === "rarely" ? "#FF6B5B" : "#7B61FF")).join("")}</div>`; };
  const summary = sv.length ? `<div class="kpis"><div class="tile"><b>${stars.toFixed(1)} ★</b><span>average rating · ${sv.length} parent${sv.length === 1 ? "" : "s"}</span></div><div class="tile"><b>${avg("learning")}/5</b><span>learning new words</span></div><div class="tile"><b>${avg("enjoy")}/5</b><span>enjoys it</span></div></div>
    <div class="grid">${block("pay", "Would consider paying")}${block("recommend", "Would recommend")}${block("often", "How often")}${block("amount", "Daily amount")}${block("helps", "Helps most")}</div>
    <div class="card"><h3>Parent comments</h3>${sv.filter(f => f.text).map(f => `<div class="stack" style="gap:2px;border-top:1px solid var(--line);padding-top:8px"><div class="row between"><b>${"★".repeat(f.stars || 0)} ${esc(f.who)}</b><span class="muted small">${new Date(f.at).toLocaleDateString()}</span></div><p style="white-space:pre-wrap;margin:0">${esc(f.text)}</p></div>`).join("") || `<p class="muted">No comments yet.</p>`}</div>` : `<div class="card"><p class="muted">No parent surveys yet. They pop up after 7 and 30 days, or send one from a student's Study plan tab.</p></div>`;
  return `<h2>⭐ Parent surveys</h2>${summary}<h2>💬 Student feedback (${kids.length})</h2>${kids.length ? kids.map(f => `<div class="card" style="gap:6px"><div class="row between"><b>${f.rate != null ? faces[f.rate] + " " : ""}${esc(f.who)}</b><span class="muted small">${new Date(f.at).toLocaleString()}</span></div>${f.text ? `<p style="white-space:pre-wrap;margin:0">${esc(f.text)}</p>` : ""}<span class="muted small">${esc(f.email || "")} · sent from ${esc(f.screen === "tabs" ? f.tab : f.screen)}</span></div>`).join("") : `<div class="card"><p class="muted">No feedback yet. Students and parents can send it from ⚙️ → Send feedback.</p></div>`}`;
}

/* permanently delete a student's folder (all records + the profile) */
async function purgeStudent(sid) {
  const base = "students/" + sid;
  for (const c of ["words", "attempts", "sessions", "feedback", "stories"]) {
    const snap = await db.collection(base + "/" + c).get();
    for (const d of snap.docs) {
      if (c === "stories") { try { const au = await db.collection(base + "/stories/" + d.id + "/audio").get(); for (const x of au.docs) await db.doc(base + "/stories/" + d.id + "/audio/" + x.id).delete(); } catch (e) {} }
      await db.doc(base + "/" + c + "/" + d.id).delete();
    }
  }
  await db.doc(base).delete();
}

/* ---------- teacher views ---------- */
function renderTeacher() { return T.view === "student" && T.sel ? renderTeacherStudent() : renderTeacherList(); }
function lastActive(s) { const t = Math.max(s.lastSeen || 0, s.lastQuizDay ? new Date(s.lastQuizDay + "T20:00:00").getTime() : 0); if (!t) return { txt: "never", days: 999 };
  const d = Math.floor((Date.now() - t) / 864e5); return { txt: d <= 0 ? "today" : d === 1 ? "yesterday" : d + " days ago", days: d }; }
function stuStatus(s) { const la = lastActive(s);
  if (!s.profile || !s.level) return { cls: "", txt: "Getting started" };
  if (s.lock && s.lock.on) return { cls: "bad", txt: "Needs training" };
  if (s.lastQuizDay === today()) return { cls: "good", txt: "Quiz done today" };
  if (la.days >= 999) return { cls: "", txt: "Not active yet" };
  if (la.days >= 3) return { cls: "bad", txt: "Inactive " + la.days + " days" };
  return { cls: "sun", txt: "Quiz not done yet" }; }
function tBar(o) { // clean top bar: back, title, small icon buttons
  return `<header class="tbar"><div class="tbar-l">${o.back ? `<button class="icon-btn" data-act="tBackList" aria-label="All students">${I.back}</button>` : ""}${o.avatar ? `<span class="avatar">${esc(o.avatar)}</span>` : ""}
    <div class="stack" style="gap:0;min-width:0"><span class="tbar-sub ellipsis">${o.sub}</span><h1 class="tbar-title ellipsis">${esc(o.title)}</h1></div></div>
    <div class="tbar-r"><button class="icon-btn" data-act="refresh" aria-label="Refresh" title="Refresh">${I.reload}</button>${o.home ? `<button class="icon-btn" data-act="tFeedback" aria-label="Feedback" title="Feedback">💬</button><button class="icon-btn" data-act="tGlobal" aria-label="Settings" title="Settings for everyone">⚙️</button>` : ""}
      <div class="more"><button class="icon-btn" data-act="tMore" aria-label="More">⋯</button><div class="more-menu" id="tMoreMenu" hidden>${o.home ? `<button data-act="preview">🧪 Try as student</button>` : ""}<button data-act="signout">↩️ Sign out</button></div></div></div></header>`; }
function emptyAccounts() { return T.students.filter(s => !s.test && s.approved !== false && !s.rejected && !s.profile && s.created && Date.now() - s.created > 7 * 864e5); }
function renderTeacherList() {
  const empty = new Set(emptyAccounts().map(s => s._id));
  const all = T.students.filter(s => !s.test), test = T.students.filter(s => s.test);
  const pending = all.filter(s => s.approved === false && !s.rejected), rejected = all.filter(s => s.rejected), real = all.filter(s => s.approved !== false && !s.rejected && !empty.has(s._id));
  const q = norm(T.q || "");
  let list = real.filter(s => !q || norm(studentLabel(s) + " " + (s.email || "")).includes(q));
  const key = { name: s => norm(studentLabel(s)), level: s => -(s.level ? s.level.g : -1), active: s => lastActive(s).days, streak: s => -((s.streak && s.streak.last >= addDays(today(), -1)) ? s.streak.count : 0) }[T.sort] || (s => 0);
  list = list.slice().sort((x, y) => { const a = key(x), b = key(y); return a < b ? -1 : a > b ? 1 : 0; });
  const doneToday = real.filter(s => s.lastQuizDay === today()).length, needHelp = real.filter(s => (s.lock && s.lock.on) || (lastActive(s).days >= 3 && lastActive(s).days < 999)).length;
  const row = s => { const st = stuStatus(s); const la = lastActive(s); const streak = s.streak && s.streak.last >= addDays(today(), -1) ? s.streak.count : 0; const nm = studentLabel(s);
    return `<button class="srow" data-act="openStudent" data-id="${s._id}"><span class="srow-name"><span class="avatar">${esc((nm[0] || "?").toUpperCase())}</span><span class="stack" style="gap:0;min-width:0"><b class="ellipsis">${esc(nm)}</b><span class="muted small ellipsis">${esc(s.email || "")}</span></span></span>
      <span class="srow-status"><span class="pill ${st.cls}">${esc(st.txt)}</span></span>
      <span class="srow-num"><b>${s.level ? esc(gradeLabel(s.level.g)) : "–"}</b><i>level</i></span><span class="srow-num"><b>${streak}🔥</b><i>streak</i></span><span class="srow-num"><b>${esc(la.txt)}</b><i>last active</i></span><span class="srow-go">${I.chev}</span></button>`; };
  const stat = (n, label, cls) => `<div class="tstat ${cls || ""}"><b>${n}</b><span>${label}</span></div>`;
  const back = `<div class="row"><button class="ghost" data-act="tBackList">${I.back.replace("<svg", '<svg width="18" height="18"')} All students</button></div>`;
  $app.innerHTML = tBar({ title: T.tab === "global" ? "Settings for everyone" : T.tab === "feedback" ? "Feedback" : "Students", sub: "Vocaboo · Teacher", home: true })
  + (T.tab === "global" ? back + settingsHtml(true) : T.tab === "feedback" ? back + feedbackHtml() : `
  <div class="tstats">${stat(real.length, "students")}${stat(doneToday, "quiz done today", "good")}${stat(needHelp, "need attention", needHelp ? "bad" : "")}${stat(pending.length, "waiting for approval", pending.length ? "sun" : "")}</div>
  ${pending.length ? `<section class="card" style="border:2px solid #FFC93C"><div class="row between"><h3 style="margin:0">⏳ Waiting for approval (${pending.length})</h3>${pending.length > 1 ? `<button class="primary" data-act="approveAll">Approve all</button>` : ""}</div>
    <div class="slist">${pending.map(s => `<div class="srow static"><span class="srow-name"><span class="avatar">${esc(((s.profile && s.profile.name) || "?")[0].toUpperCase())}</span><span class="stack" style="gap:0;min-width:0"><b class="ellipsis">${esc((s.profile && s.profile.name) || "(no name yet)")}${s.waitlist ? ` <span class="pill sun">launch list</span>` : ""}</b><span class="muted small ellipsis">${esc(s.email || "")} · age ${ageOf(s) != null ? ageOf(s) : "–"} · ${s.consent ? (s.consent.by ? "consent: " + esc(s.consent.by) : "14+") : "no consent yet"}</span></span></span>
      <span class="row" style="flex-wrap:nowrap;justify-content:flex-end"><button class="primary" data-act="approve" data-id="${s._id}">Approve</button><button data-act="reject" data-id="${s._id}">Reject</button></span></div>`).join("")}</div></section>` : ""}
  <div class="row between" style="align-items:center;margin-top:4px"><h2 style="margin:0">Students</h2>
    <div class="row" style="flex-wrap:nowrap"><input id="tSearch" type="text" placeholder="🔍 Search" value="${esc(T.q || "")}" autocomplete="off" class="tsearch">
    <select id="tSort" data-change="tSort" class="tsort"><option value="name" ${T.sort === "name" ? "selected" : ""}>Name</option><option value="active" ${T.sort === "active" ? "selected" : ""}>Last active</option><option value="level" ${T.sort === "level" ? "selected" : ""}>Level</option><option value="streak" ${T.sort === "streak" ? "selected" : ""}>Streak</option></select></div></div>
  ${list.length ? `<div class="slist card" style="padding:6px">${list.map(row).join("")}</div>` : `<div class="card">${buddy("happy", 64)}<h3>${real.length ? "No student matches that search" : "No students yet"}</h3>${real.length ? "" : `<p>When a parent creates an account and it's approved, the student shows up here.</p>`}</div>`}
  ${test.length ? `<details class="card"><summary><b>🧪 Test accounts (${test.length})</b></summary><div class="slist" style="margin-top:8px">${test.map(row).join("")}</div></details>` : ""}
  ${empty.size ? `<details class="card"><summary><b>🧹 Never finished signing up (${empty.size})</b></summary><p class="muted small">Accounts older than a week with no name or level yet.</p><div class="slist">${emptyAccounts().map(s => `<div class="srow static"><span class="srow-name"><span class="stack" style="gap:0"><b>${esc(s.email || s._id)}</b><span class="muted small">created ${new Date(s.created).toLocaleDateString()}</span></span></span><button data-act="tDelete" data-id="${s._id}" style="color:#B3261E">Delete</button></div>`).join("")}</div><button data-act="tDeleteEmpty" style="color:#B3261E;margin-top:8px">Delete all of these</button></details>` : ""}
  ${rejected.length ? `<details class="card"><summary><b>Rejected accounts (${rejected.length})</b></summary><div class="slist" style="margin-top:8px">${rejected.map(s => `<div class="srow static"><span class="srow-name"><span class="stack" style="gap:0"><b>${esc(studentLabel(s))}</b><span class="muted small">${esc(s.email || "")}</span></span></span><span class="row" style="flex-wrap:nowrap"><button data-act="unreject" data-id="${s._id}">Move back</button><button data-act="tDelete" data-id="${s._id}" style="color:#B3261E">Delete</button></span></div>`).join("")}</div></details>` : ""}
  <details class="card"><summary><b>➕ How to add a new student</b></summary><ol class="small" style="margin:8px 0 0;padding-left:18px;line-height:1.7"><li>Send the parent the app link: <b>${esc(location.origin + location.pathname)}</b></li><li>They tap <b>Create account</b>, then fill in the child's name and birthday (and parent consent if under 14).</li><li>New accounts are approved automatically while free beta spots last; otherwise they appear under <b>Waiting for approval</b>.</li></ol></details>`);
  const si = document.getElementById("tSearch"); if (si) si.oninput = () => { T.q = si.value; const pos = si.selectionStart; renderTeacherList(); const n = document.getElementById("tSearch"); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} };
}
function renderTeacherStudent() {
  const stu = T.students.find(s => s._id === T.sel); const st = T.data && T.data.st; const nm = stu ? studentLabel(stu) : "Student";
  const sub = st ? [stu && stu.email, st.profile && ageOf(st) != null ? "age " + ageOf(st) : "", st.level ? gradeWord(st.level.g) : "", SET(st).lang === "en" ? "English only" : "English + Korean"].filter(Boolean).map(esc).join(" · ") : "";
  const status = st ? stuStatus(st) : null; const streak = st && st.streak && st.streak.last >= addDays(today(), -1) ? st.streak.count : 0;
  const head = tBar({ back: true, avatar: (nm[0] || "?").toUpperCase(), title: nm, sub: sub || "Student" })
    + (st ? `<div class="stu-strip"><span class="pill ${status.cls}">${esc(status.txt)}</span><span class="pill">🔥 ${streak}-day streak</span><span class="pill">⭐ Lv ${levelOf(st.xp || 0)} · ${st.xp || 0} XP</span><span class="pill">${st.push && st.push.tokens && st.push.tokens.length ? "🔔 reminders on" : "🔕 reminders off"}</span></div>` : "")
    + `<nav class="ttabs">${[["week", "📊 Report"], ["words", "📚 Words"], ["placement", "📈 Level"], ["settings", "⚙️ Plan"]].map(([k, l]) => `<button data-act="ttab" data-tab="${k}" aria-pressed="${T.tab === k}">${l}</button>`).join("")}</nav>`;
  if (!st) { $app.innerHTML = head + `<div class="card">No data yet for this student.</div>`; return; }
  const surveyBtn = `<div class="card"><h3>Parent survey</h3><p class="muted small">Pops up automatically after 7 and 30 days. You can also send it now.</p><div class="row"><button data-act="tSurveyNow">${st.surveyNow ? "Survey requested ✓" : "Show the survey next time they open the app"}</button></div></div>`;
  const danger = stu && stu.test ? testResetHtml() : `<div class="card"><h3>Danger zone</h3>
    <div class="row between"><span class="small"><b>Reset progress</b><br><span class="muted">Deletes words, scores, streak, XP and level. Their login stays.</span></span><button data-act="tResetStu" style="color:#B3261E">Reset…</button></div>
    <div class="row between"><span class="small"><b>Delete student</b><br><span class="muted">Removes this student's folder completely. To also remove their login, delete it in Firebase → Authentication.</span></span><button data-act="tDelete" data-id="${T.sel}" style="color:#B3261E">Delete…</button></div></div>`;
  const body = T.tab === "week" ? weekHtml() : T.tab === "words" ? wordsHtml() : T.tab === "placement" ? levelHtml() + placementHtml() : stuSettingsHtml() + surveyBtn + danger;
  $app.innerHTML = head + body;
}
const MEANING_T = new Set(["mc_ko", "hear_ko", "ctx_ko", "en_ko", "match", "mc_def", "blank_mc", "skipcheck"]);
const SPELL_T = new Set(["ko_en", "def_en", "dict", "train", "blank_ty"]);
function weekHtml() {
  const wk = T.week; const S = weekStats(wk); const st = T.data.st; const ks = weekOptions(); const ix = ks.indexOf(wk);
  const items = S.atts.filter(a => (a.kind !== "placement" && a.kind !== "level")).flatMap(a => (a.items || []).map(i => Object.assign({ kind: a.kind }, i)));
  const dvals = [], dlabs = []; let hi = -1; Object.entries(S.days).forEach(([d, x], i) => { dvals.push(Math.round(x.sec / 60)); dlabs.push(DOW[new Date(d + "T12:00:00").getDay()].slice(0, 2)); if (d === today()) hi = i; });
  const allQ = T.data.atts.filter(a => a.kind === "quiz" && a.end).sort((a, b) => a.start - b.start).slice(-20);
  const wkIds = st.week && st.week.key === wk ? st.week.newIds.concat(st.week.reviewIds) : ((st.history || []).find(h => h.key === wk) || { newIds: [], reviewIds: [] }).newIds;
  const mastered = wkIds.filter(id => T.data.words[id] && T.data.words[id].box >= MASTER_BOX).length;
  const learned = st.week && st.week.key === wk ? (st.week.introDone ? st.week.newIds.length : (st.week.trained || []).length) : null;
  // words to work on, grouped by kind of mistake
  const mean = {}, spell = {};
  items.filter(i => !i.ok && !SPEAK.has(i.t) && i.t !== "say_en" && i.t !== "coach").forEach(i => {
    if (SPELL_T.has(i.t)) { const b = spell[i.id] || (spell[i.id] = { n: 0, tries: {}, hints: 0 }); b.n++; if (i.ans) b.tries[norm(i.ans)] = (b.tries[norm(i.ans)] || 0) + 1; }
    else { const b = mean[i.id] || (mean[i.id] = { n: 0 }); b.n++; } });
  items.filter(i => i.hints).forEach(i => { const b = spell[i.id] || (spell[i.id] = { n: 0, tries: {}, hints: 0 }); b.hints += i.hints; });
  const top = o => Object.entries(o).sort((a, b) => b[1].n - a[1].n);
  const wcell = (id, right) => `<div class="wrow"><span><b>${esc(BY[id].w)}</b> <span class="muted small">${esc(gloss(BY[id]))}</span></span>${right}</div>`;
  const meanHtml = top(mean).slice(0, 12).map(([id, b]) => wcell(id, `<span class="pill bad">×${b.n}</span>`)).join("") || `<p class="muted small">No meaning mistakes 🎉</p>`;
  const spellHtml = top(spell).slice(0, 12).map(([id, b]) => wcell(id, `<span class="stack" style="gap:2px;align-items:flex-end">${b.n ? `<span class="pill bad">×${b.n}</span>` : ""}${b.hints ? `<span class="pill sun">💡${b.hints}</span>` : ""}</span>`)
    + (Object.keys(b.tries).length ? `<div class="tries">${Object.entries(b.tries).slice(0, 4).map(([t, c]) => `<span class="mono">${esc(t)}${c > 1 ? " ×" + c : ""}</span>`).join("")}</div>` : "")).join("") || `<p class="muted small">No spelling mistakes 🎉</p>`;
  const sayHtml = Object.entries(S.sayBad).sort((a, b) => (b[1].n + b[1].skip) - (a[1].n + a[1].skip)).slice(0, 12).map(([id, b]) => wcell(id, `<span class="stack" style="gap:2px;align-items:flex-end">${b.n ? `<span class="pill bad">×${b.n}</span>` : ""}${b.skip ? `<span class="pill">⏭ ${b.skip}</span>` : ""}${b.silent ? `<span class="pill sun">🤫${b.silent}</span>` : ""}${b.spoke ? `<span class="pill">🗣️${b.spoke}</span>` : ""}</span>`)
    + `<div class="tries">${b.heard.slice(-3).map(h => `<span>“${esc(h)}”</span>`).join("")}${Object.keys(b.skipped || {}).length ? `<span class="muted">skipped: ${esc(Object.keys(b.skipped).join(", "))}</span>` : ""}</div>`).join("") || `<p class="muted small">No speaking problems 🎉</p>`;
  // her own ratings, in three groups
  const rate = { bad: [], mid: [], good: [] }; Object.entries(S.ratings).forEach(([id, r]) => rate[r] && rate[r].push(id));
  // highlights
  const silent = Object.values(S.sayBad).reduce((t, b) => t + (b.silent || 0), 0); const hintsN = Object.values(spell).reduce((t, b) => t + b.hints, 0);
  const tips = [];
  tips.push(S.activeDays >= 5 ? `✅ Studied on <b>${S.activeDays} days</b>. Great routine!` : `📅 Studied on <b>${S.activeDays} day${S.activeDays === 1 ? "" : "s"}</b> this week (goal: 5).`);
  if (S.avg != null) tips.push(S.avg >= CFG.passPct ? `⭐ Quiz average <b>${S.avg}%</b>.` : `⚠️ Quiz average <b>${S.avg}%</b>, under the ${CFG.passPct}% pass mark.`);
  if (S.locks) tips.push(`🔒 Sent to training <b>${S.locks}×</b> after a low quiz.`);
  const worst = top(Object.fromEntries(Object.keys(Object.assign({}, mean, spell)).map(id => [id, { n: ((mean[id] || {}).n || 0) + ((spell[id] || {}).n || 0) }]))).slice(0, 3);
  if (worst.length && worst[0][1].n >= 2) tips.push(`🔁 Trickiest words: ${worst.map(([id, b]) => `<b>${esc(BY[id].w)}</b> (×${b.n})`).join(", ")}.`);
  if (silent >= 3) tips.push(`🎤 <b>${silent}</b> silent mic tries. Her microphone may not be picking up; check Sound &amp; microphone on her phone.`);
  if (hintsN) tips.push(`💡 Used <b>${hintsN}</b> hint letter${hintsN === 1 ? "" : "s"} in spelling.`);
  const fold = (title, n, inner) => `<details class="card"><summary><b>${title}</b>${n != null ? ` <span class="muted small">(${n})</span>` : ""}</summary><div class="stack" style="gap:10px;margin-top:10px">${inner}</div></details>`;
  return `<div class="row between"><div class="row" style="flex-wrap:nowrap"><button class="icon-btn" data-act="wkPrev" ${ix >= ks.length - 1 ? "disabled" : ""} aria-label="Previous week">${I.back}</button><b style="font-size:18px">${wkLabel(wk)}</b><button class="icon-btn" data-act="wkNext" ${ix <= 0 ? "disabled" : ""} aria-label="Next week">${I.chev}</button></div>
     <button data-act="copyReport">📋 Copy report</button></div>
   <div class="tstats">
     <div class="tstat"><b>${fmtMin(S.totalSec)}</b><span>minutes studied</span></div>
     <div class="tstat ${S.activeDays >= 5 ? "good" : ""}"><b>${S.activeDays}/7</b><span>days active</span></div>
     <div class="tstat ${S.avg != null && S.avg < CFG.passPct ? "bad" : ""}"><b>${S.quizzes.length}${S.avg != null ? ` · ${S.avg}%` : ""}</b><span>quizzes · average</span></div>
     <div class="tstat"><b>${learned != null ? learned + "/" + st.week.newIds.length : mastered + "/" + wkIds.length}</b><span>${learned != null ? "new words learned" : "words mastered"}</span></div>
   </div>
   <div class="card"><h3>This week at a glance</h3><ul class="tips">${tips.map(t => `<li>${t}</li>`).join("")}</ul></div>
   <div class="grid">
     <div class="card"><h3>Minutes per day</h3>${barChart(dvals, dlabs, { hi, unit: "m" })}
       <div class="row" style="gap:6px">${Object.entries(S.days).map(([d, x]) => `<span class="pill ${x.quiz.length ? (Math.max(...x.quiz) >= CFG.passPct ? "good" : "bad") : ""}" style="font-size:11px">${DOW[new Date(d + "T12:00:00").getDay()].slice(0, 2)} ${x.quiz.length ? x.quiz.join("/") + "%" : "–"}</span>`).join("")}</div></div>
     <div class="card"><div class="row between"><h3>Quiz scores</h3><span class="muted small">last ${allQ.length}</span></div>${lineChart(allQ.map(q => Math.round(q.score * 100)), allQ.map(q => { const d = new Date(q.start); return (d.getMonth() + 1) + "/" + d.getDate(); }), { pass: CFG.passPct })}</div>
   </div>
   <div class="card"><h3>Skills</h3>${skillRows(items)}
     <details><summary class="muted small">Details by question type</summary><div class="stack" style="gap:6px;margin-top:8px">${["mc_ko", "hear_ko", "ctx_ko", "en_ko", "match", "mc_def", "ko_en", "def_en", "dict", "train", "say_en", "say", "saysent", "coach"].filter(t => S.byType[t]).map(t => `<div class="row between small"><span class="muted">${TYPE_NAME[t]}</span><span>${Math.round(S.byType[t].ok / S.byType[t].n * 100)}% · ${S.byType[t].ok}/${S.byType[t].n}${SPEAK.has(t) ? "" : ` · ${(S.byType[t].ms / S.byType[t].n / 1000).toFixed(1)}s`}</span></div>`).join("")}</div></details></div>
   <div class="card"><h3>Words to work on</h3><p class="muted small">×N = times missed this week. Spelling shows what she typed. 💡 = hint letters used. Speaking: ⏭ skipped · 🤫 silent mic · 🗣️ spoke but not understood.</p>
     <div class="grid3"><div class="wcol"><h4>📖 Meaning</h4>${meanHtml}</div><div class="wcol"><h4>✍️ Spelling</h4>${spellHtml}</div><div class="wcol"><h4>🗣️ Speaking</h4>${sayHtml}</div></div></div>
   <div class="card"><h3>How she feels about her words</h3><p class="muted small">Her own rating after each word in training (latest).</p>
     <div class="grid3">${[["bad", "😟 Needs more study"], ["mid", "😐 So-so"], ["good", "😊 Got it"]].map(([k, l]) => `<div class="wcol"><h4>${l} <span class="muted small">(${rate[k].length})</span></h4><div class="chips">${rate[k].map(id => `<span class="chip">${esc(BY[id].w)}</span>`).join("") || `<span class="muted small">–</span>`}</div></div>`).join("")}</div></div>
   ${fold("💬 Her own sentences (AI coach)", S.coach.length, S.coach.length ? `<div class="tbl-wrap"><table><thead><tr><th>Word</th><th>She said</th><th>Corrected</th><th>Feedback</th></tr></thead><tbody>${S.coach.map(i => `<tr><td><b>${esc(BY[i.id].w)}</b></td><td>${i.ok ? '<span class="pill good">✓</span> ' : ""}${esc(i.ans)}</td><td>${i.ok ? '<span class="muted">–</span>' : esc(i.fixed || "")}</td><td class="muted small">${esc(i.why || "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">No sentences this week.</p>`)}
   ${fold("📖 Weekly story", S.stories.length, S.stories.length ? S.stories.map(a => `<p><b>${esc(a.title || "Story")}</b> · ${Math.round((a.score || 0) * (a.n || 5))}/${a.n || 5} questions right · ${new Date(a.start).toLocaleDateString()}</p>${(a.reading || []).length ? `<p class="muted small">Read aloud: ${a.reading.map(x => "Part " + (x.p + 1) + " " + x.pct + "% (" + x.wpm + " wpm)").join(", ")}</p>${a.reading.filter(x => x.missed && x.missed.length).map(x => `<p class="small">Part ${x.p + 1} missed: <span class="mono">${esc(x.missed.join(", "))}</span></p>`).join("")}` : ""}${(a.dictation || []).length ? `<p class="muted small">Dictation: ${a.dictation.map(x => x.pct + "%").join(", ")}</p>${a.dictation.filter(x => x.pct < 90).map(x => `<p class="small"><span class="muted">${esc(x.text)}</span><br>→ <span class="mono">${esc(x.ans)}</span></p>`).join("")}` : ""}`).join("") : `<p class="muted">Not read yet this week.</p>`)}
   ${fold("🕒 Sessions", S.sess.length, `<div class="tbl-wrap"><table><thead><tr><th>Day</th><th>Time</th><th>Active</th><th>What she did</th></tr></thead><tbody>${S.sess.slice().sort((a, b) => a.start - b.start).map(s => { const dt = new Date(s.start); return `<tr><td>${DOW[dt.getDay()]} ${dt.getMonth() + 1}/${dt.getDate()}</td><td>${timeOf(s.start)}–${timeOf(s.last)}</td><td>${fmtMin(actSec(s))} min</td><td class="muted">${esc((s.did || []).join(", ") || "opened only")}</td></tr>`; }).join("") || `<tr><td colspan="4" class="muted">No sessions this week.</td></tr>`}</tbody></table></div>`)}
   ${fold("🏅 XP &amp; badges", null, `<div class="row"><span class="pill sun">${S.xpWeek} XP this week</span><span class="pill">Level ${levelOf(st.xp || 0)}</span></div>${badgeGrid(st)}`)}`;
}
function wordsHtml() {
  const st = T.data.st; const W = T.data.words; if (!st.week) return `<div class="card">The first week starts after her word check.</div>`;
  const row = id => { const e = BY[id], w = W[id]; return `<tr><td><b>${esc(e.w)}</b>${(st.week.trained || []).includes(id) ? " 🌱" : ""} ${krBadge(e)}<br><span class="muted">${esc(e.ko)}</span></td><td>${w ? `${w.right}✓ ${w.wrong}✗` : "not seen"}</td><td>${w ? (w.box >= MASTER_BOX ? '<span class="pill good">mastered</span>' : `<span class="pill ${w.box ? "" : "bad"}">level ${w.box}/${MASTER_BOX}</span>`) : "–"}</td><td><button class="ghost" data-act="rmWord" data-id="${id}">Remove</button></td></tr>`; };
  const sim = clone(st); buildWeek(sim, W, effCfg(st), true); const next = sim.week.newIds.map(id => BY[id].w + (BY[id].book === "G" ? "" : "*")); const c = effCfg(st);
  return `<p class="muted">Week of ${wkLabel(st.week.key)}. ${c.textbook ? `${c.tbNew} new textbook words (book order from Unit ${c.startUnit}) + ` : ""}${c.grNew} new words from the graded list${st.level ? ` (just above ${gradeWord(st.level.g)})` : ""}, plus ${c.reviewPerWeek} review words. Change this in Settings.</p>
   <div class="card"><div class="row" style="align-items:flex-end"><div class="field" style="flex:1;min-width:200px"><label for="addWord">Add a word to this week</label><input id="addWord" type="text" list="bankList" placeholder="Type a word from the books" autocomplete="off" autocapitalize="off"><datalist id="bankList">${BANK.map(e => `<option value="${esc(e.w)}">`).join("")}</datalist></div><button class="primary" data-act="addWord">Add</button><button data-act="release">Start next week now</button></div></div>
   <div class="notice info small"><b>How to read this:</b> <b>3✓ 1✗</b> = times she answered this word right / wrong (all time: quizzes, training spelling, listening; speaking not counted). <b>Level 0–4</b> = memory level: it goes up 1 each time she gets the word right in a daily quiz and drops back to 0 when she misses it. Level 4 = <b>mastered</b>. 🌱 = learned in training this week.</div>
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
  const prof = st.profile ? `<p class="muted">${esc(st.profile.name)} · age ${ageOf(st)} · ${SET(st).lang === "en" ? "English only" : "English + Korean"}</p>` : `<p class="muted">She hasn't filled in her name and age yet.</p>`;
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
   <div class="field"><label for="sKor">Korean school words (교육부 기본 어휘 3,000) first</label><select id="sKor"><option value="1" ${(s.kor != null ? s.kor : s.lang !== "en") ? "selected" : ""}>On</option><option value="0" ${(s.kor != null ? s.kor : s.lang !== "en") ? "" : "selected"}>Off</option></select></div>
   <div class="field"><label for="sSpeak">Speaking practice for this student</label><select id="sSpeak"><option value="1" ${s.speak !== false ? "selected" : ""}>Required</option><option value="0" ${s.speak === false ? "selected" : ""}>Off (microphone doesn't work)</option></select></div>
   <div class="field"><label for="sGrNew">New graded-list words per week</label><input id="sGrNew" type="number" min="0" max="40" value="${s.grNew}"></div>
   <div class="field"><label for="sRev">Review words per week</label><input id="sRev" type="number" min="0" max="30" value="${s.review}"></div>
   <div class="field"><label for="sGoal">Goal level (grade, 0 = K)</label><input id="sGoal" type="number" min="0" max="13" step="0.1" value="${st.goal ? st.goal.g : ""}"></div>
   <div class="field"><label for="sGoalBy">Goal date</label><input id="sGoalBy" type="date" value="${st.goal ? st.goal.by : ""}"></div>
   <div class="field"><label for="sLevel">Word level (change only to correct it)</label><input id="sLevel" type="number" min="0" max="13" step="0.1" value="${st.level ? st.level.g : ""}"></div>
   <div class="field"><label for="cfgSize">Daily quiz size</label><input id="cfgSize" type="number" min="5" max="30" value="${st.quizSize}"></div>
  </div>
  ${st.planBy && st.planBy.who === "student" ? `<p class="small"><span class="pill sun">Changed by the student/parent on ${new Date(st.planBy.at).toLocaleDateString()}</span></p>` : ""}
  <p class="muted small">Graded-list words start just above her level and move up as she learns them. Changes apply from next week's words (or tap "Start next week now" on the Words tab).</p>
  <div class="row"><button class="primary" data-act="saveStu">Save ${esc(nm)}'s plan</button></div></div>`;
}
function testResetHtml() { return `<div class="card"><h3>Test data</h3><p class="muted">Deletes everything you created with "Try as student". Real students' data is not touched.</p><div class="row"><button data-act="resetTest">Reset test data</button></div></div>`; }
function betaHtml() { const B = T.beta || {};
  return `<div class="card"><h2>Free beta sign-ups</h2><p class="muted small">New accounts are approved automatically until the free spots run out. After that, people see "Sorry, all free beta spots are filled. You're on the official launch list" and wait under <b>Waiting for approval</b> (you can still approve them by hand).</p>
  <div class="grid2"><div class="field"><label for="bOn">Auto-approve</label><select id="bOn"><option value="1" ${B.on ? "selected" : ""}>On</option><option value="0" ${B.on ? "" : "selected"}>Off (approve everyone by hand)</option></select></div>
  <div class="field"><label for="bCap">Free spots</label><input id="bCap" type="number" min="0" max="10000" value="${B.cap != null ? B.cap : 50}"></div></div>
  <p><b>${B.count || 0}</b> of ${B.cap != null ? B.cap : 50} spots used.</p><div class="row"><button class="primary" data-act="saveBeta">Save</button></div></div>`; }
function settingsHtml() {
  return betaHtml() + `<div class="card"><h2>Settings for everyone</h2>
  <div class="grid2">
   <input id="cfgStart" type="hidden" value="${CFG.startUnit}"><input id="cfgNew" type="hidden" value="${CFG.newPerWeek}"><input id="cfgRev" type="hidden" value="${CFG.reviewPerWeek}">
   <div class="field"><label for="cfgPass">Pass mark for the daily quiz (%)</label><input id="cfgPass" type="number" min="50" max="100" value="${CFG.passPct}"></div>
   <div class="field"><label for="cfgSpeak">Speaking practice in training</label><select id="cfgSpeak"><option value="1" ${CFG.speak !== false ? "selected" : ""}>Required</option><option value="0" ${CFG.speak !== false ? "" : "selected"}>Off</option></select></div>
   <div class="field"><label for="cfgHints">Typing hints (first letter and length)</label><select id="cfgHints"><option value="1" ${CFG.hints ? "selected" : ""}>On</option><option value="0" ${CFG.hints ? "" : "selected"}>Off</option></select></div>
  </div>
  <p class="muted small">Quiz size grows by 5 (up to 30) after a week with 5+ quizzes, 80%+ average, and under 9 seconds per question.</p>
  <div class="row"><button class="primary" data-act="saveCfg">Save settings</button>${T.data && T.data.st && T.data.st.lock && T.data.st.lock.on ? `<button data-act="unlock">Unlock quiz now</button>` : ""}</div></div>
  ${T.students.some(s => s.test) ? testResetHtml() : ""}`;
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
  if (a === "menuSignout" && FAMPIN && !parentUnlocked()) { closeMenu(); return openParent("signout"); }
  if (a === "menuSignout") { if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again to sign out"; return; } closeMenu(); leaveActivity(); await WW.signOut(); return location.reload(); }
  if (a === "pushAskYes") { closePushAsk(); return turnOnPush(); }
  if (a === "pushAskNo") return closePushAsk();
  if (a === "checkApproved") { $app.innerHTML = loaderHtml("Checking… ⏳"); return checkApproved(); }
  if (a === "micTest") return micTest();
  if (a === "pickKid") return pickKid(b.dataset.sid);
  if (a === "isle") return isleSheet(+b.dataset.i);
  if (a === "boss") return bossSheet(+b.dataset.b);
  if (a === "sheetClose") return closeSheet();
  if (a === "bossGo") return startBoss(+b.dataset.b);
  if (a === "toMap") { TAB = "map"; view = { name: "tabs" }; return render(); }
  if (a === "bossPractice") { const ids = (view.missed || []).slice(0, 10); return startTraining(ids, "free"); }
  if (a === "sheetGo") { closeSheet(); if (b.dataset.go === "home") { TAB = "today"; view = { name: "tabs" }; window.scrollTo(0, 0); return render(); }
    const ids = shuffle(weekWords(mapWeeks()[+b.dataset.i]).filter(id => BY[id])).slice(0, 10); return startTraining(ids, "free"); }
  if (a === "addKid") return addKid();
  if (a === "whoSignout") { if (FAMPIN && !parentUnlocked()) return openParent("signout"); await WW.signOut(); return location.reload(); }
  if (a === "switchKid" || a === "menuSwitch") return switchKid();
  if (a === "menuParent" || a === "openParent") { closeMenu(); return openParent("parent"); }
  if (a === "pinKey") return pinKey(b.dataset.k);
  if (a === "pinClose") { PIN_FLOW = null; const el = document.getElementById("pinPad"); if (el) el.remove(); return; }
  if (a === "pinForgot") { PIN_FLOW.mode = "forgot"; PIN_FLOW.err = ""; return drawPin(); }
  if (a === "pinForgotGo") return pinForgotGo();
  if (a === "pinChange") { PIN_FLOW = { mode: "set", entry: "", then: "parent" }; return drawPin(); }
  if (a === "parentClose") { PARENT_OK = 0; TAB = "me"; view = { name: "tabs" }; return render(); }
  if (a === "signoutNow") { await WW.signOut(); return location.reload(); }
  if (a === "toggleRec") { ST.settings = Object.assign({}, ST.settings || {}, { record: !(ST.settings && ST.settings.record === false) ? false : true }); saveST(); return render(); }
  if (a === "setTheme") { ST.settings = Object.assign({}, ST.settings || {}, { theme: b.dataset.v }); applyTheme(b.dataset.v); if (ST.profile) saveST(); OB_DIR = 0; render(); mascotAct("act-nod", 500); mascotHappy(true, 900); return; }
  if (a === "setText") { ST.settings = Object.assign({}, ST.settings || {}, { text: b.dataset.v }); saveST(); applyTextSize(); return render(); }
  if (a === "verUpdate") { try { if (ATT && !ATT.end) saveAttempt(); } catch (e) {} location.replace(location.pathname + "?v=" + b.dataset.v); return; }
  if (a === "verLater") { VER_SNOOZE = Date.now() + 30 * 60000; const el = document.getElementById("verPop"); if (el) el.remove(); return; }
  if (a === "testOut") return startTestOut();
  if (a === "soundTest") return soundTest();
  if (a === "openOutside") return openOutside();
  if (a === "installApp") return installApp();
  if (a === "menuMic") { closeMenu(); leaveActivity(); TAB = "me"; view = { name: studentHome() }; render(); setTimeout(() => { const c = [...document.querySelectorAll(".card h3")].find(h => /Microphone/.test(h.textContent)); if (c) c.scrollIntoView({ behavior: "smooth", block: "center" }); }, 100); return; }
  if (a === "lgMode") { view = { name: "login", mode: b.dataset.m }; return render(); }
  if (a === "resetMe") return resetAsk(1);
  if (a === "resetStep2") return resetAsk(2);
  if (a === "resetCancel") { const el = document.getElementById("resetAsk"); if (el) el.remove(); return; }
  if (a === "resetGo") return resetGo();
  if (a === "feedback") { closeMenu(); return feedbackAsk(); }
  if (a === "fbRate") { document.querySelectorAll('[data-act="fbRate"]').forEach(x => x.classList.toggle("sel", x === b)); return; }
  if (a === "fbSend") return feedbackSend();
  if (a === "svStar") { svKeepText(); SV.stars = +b.dataset.n; return drawSurvey(); }
  if (a === "svPick") { svKeepText(); const q = SURVEY.find(x => x.k === b.dataset.k); const v = q.type === "scale" ? +b.dataset.v : b.dataset.v;
    if (q.type === "multi") { const arr = SV.a[q.k] || []; SV.a[q.k] = arr.includes(v) ? arr.filter(x => x !== v) : arr.concat([v]); } else SV.a[q.k] = v; return drawSurvey(); }
  if (a === "svSend") return surveySend();
  if (a === "svLater") return surveyLater();
  if (a === "menuSurvey") { closeMenu(); return openSurvey("now"); }
  if (a === "tSurveyNow") { const d = (await db.doc("students/" + T.sel).get()).data(); d.surveyNow = true; await setDoc("students/" + T.sel, d); T.data.st.surveyNow = true; toast("The survey will pop up next time they open the app"); return render(); }
  if (a === "fbClose") { const el = document.getElementById("fbAsk"); if (el) el.remove(); return; }
  if (a === "approve" || a === "reject") { const id = b.dataset.id; const s = T.students.find(x => x._id === id); if (!s) return; const d = (await db.doc("students/" + id).get()).data();
    if (a === "approve") { d.approved = true; d.rejected = false; d.waitlist = false; d.approvedAt = Date.now(); } else { if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again to reject"; return; } d.approved = false; d.rejected = true; }
    await setDoc("students/" + id, d); toast(a === "approve" ? "Approved " + studentLabel(d) : "Rejected"); return loadTeacher(); }
  if (a === "saveBeta") { const on = document.getElementById("bOn").value === "1", cap = Math.max(0, +document.getElementById("bCap").value || 0); T.beta = Object.assign({ count: 0 }, T.beta || {}, { on, cap }); await setDoc("config/beta", T.beta); toast("Saved"); return render(); }
  if (a === "approveAll") { if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again to approve all"; return; }
    for (const s of T.students.filter(x => x.approved === false && !x.rejected)) { const d = (await db.doc("students/" + s._id).get()).data(); d.approved = true; d.approvedAt = Date.now(); await setDoc("students/" + s._id, d); }
    toast("All approved"); return loadTeacher(); }
  if (a === "unreject") { const id = b.dataset.id; const d = (await db.doc("students/" + id).get()).data(); d.rejected = false; d.approved = false; await setDoc("students/" + id, d); return loadTeacher(); }
  if (a === "tFeedback") { T.view = "list"; T.tab = "feedback"; T.fb = null; render(); return loadFeedback(); }
  if (a === "tResetStu") { if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again: permanently delete this student's progress"; return; }
    const d = (await db.doc("students/" + T.sel).get()).data(); await wipeStudent(T.sel, d); toast("Progress deleted"); await loadStudentData(T.sel); await loadTeacher(); return; }
  if (a === "privacy") { ev.preventDefault(); document.body.insertAdjacentHTML("beforeend", privacyHtml()); return; }
  if (a === "privacyClose") { const el = document.getElementById("privacy"); if (el) el.remove(); return; }
  if (a === "obLang") { ST._lang = b.dataset.v; document.querySelectorAll('[data-act="obLang"]').forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false")); return obReady(true); }
  if (a === "helloGo") { ST.greetDay = today(); saveST(); TAB = "today"; view = { name: "tabs" }; return render(); }
  if (a === "obIntroGo") { OB_INTRO = false; OB_DIR = 1; return render(); }
  if (a === "obBack") { stashOnboard(); OB_DIR = -1; if (OB === 0) { OB_INTRO = true; return render(); } OB = Math.max(0, OB - 1); render(); return mascotAct("act-nod", 500); }
  if (a === "obGoal") { const g = new Set(ST._goals || []); g.has(b.dataset.v) ? g.delete(b.dataset.v) : g.add(b.dataset.v); ST._goals = [...g]; b.setAttribute("aria-pressed", g.has(b.dataset.v) ? "true" : "false"); mascotHappy(g.size > 0); return obReady(true); }
  if (a === "setLang") { ST.settings = Object.assign({}, ST.settings || {}, { lang: b.dataset.v }); saveST(); return render(); }
  if (a === "startLevel") { LIS = 0; return startLevelTest(false); }
  if (a === "skipLevel" && IS_OWNER) return startLevelTest(true);
  if (a === "ltPick") return levelAnswer(b.dataset.id);
  if (a === "ltIdk") return levelAnswer(null);
  if (a === "levelDone" && view.fromHome) { TAB = view.back || "today"; view = { name: "tabs" }; window.scrollTo(0, 0); return render(); }
  if (a === "levelDone" && !ST.setupDone && studentHome() === "tabs") { SU = 0; view = { name: "setup" }; window.scrollTo(0, 0); return render(); }
  if (a === "levelDone") { TAB = "today"; view = { name: studentHome() }; window.scrollTo(0, 0); return render(); }
  if (a === "suNext") { SU++; OB_DIR = 1; render(); return mascotNext(); }
  if (a === "suBack") { SU--; OB_DIR = -1; return render(); }
  if (a === "suWords") return suWords(+b.dataset.v);
  if (a === "suDone") { ST.setupDone = Date.now(); saveST(); TAB = "today"; view = { name: "tabs" }; window.scrollTo(0, 0); return render(); }
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
  if (a === "quiz") { if (!IS_OWNER && ((ST.lock && ST.lock.on) || (ST.week && !quizReady()))) return; return startRun("quiz"); }
  if (a === "train") { const P = packInfo(); return trainTap(!!P && P.due === 0); }
  if (a === "packCheck") return startPackCheck();
  if (a === "sheetTestOut") { closeSheet(); return startTestOut(); }
  if (a === "packLearn") { const pk = PACK_PENDING; closeSheet(); if (pk) startTraining(pk.ids, pk.reason); return; }
  if (a === "packGo") { const v = view; return startTraining(v.rest, v.reason); }
  if (a === "trainWeak") { const ids = shuffle(weekIds().filter(id => !isMastered(id))).slice(0, 8); return startTraining(ids.length ? ids : null, "weak"); }
  if (a === "trainOne") return startTraining([b.dataset.id], "free");
  if (a === "pick") return answer(null, b.dataset.id);
  if (a === "mL" || a === "mR") return matchTap(a === "mL" ? "L" : "R", b.dataset.id);
  if (a === "qmic") return quizListen();
  if (a === "sayGiveUp") { if (!RUN.answered) { RUN.answered = true; RUN.ok = false; record(RUN.qs[RUN.i].id, "say_en", false, "(no mic)", 0); } RUN.fixTries = 3; return render(); }
  if (a === "coach") { if (!IS_OWNER && ST.week && !quizReady()) return; return startCoach(); }
  if (a === "coachMic") return coachListen();
  if (a === "coachCheck") return coachCheck();
  if (a === "coachRetry") { CO.res = null; CO.text = ""; CO.sayOk = false; CO.sayTries = 0; CO.sayHeard = ""; CO.typing = false; CO.vkey = ""; return render(); }
  if (a === "coachRedo") return coachRedo();
  if (a === "coachType") { CO.typing = true; return render(); }
  if (a === "coachSay") return coachSay();
  if (a === "coachSaySkip") { ATT.items.push({ id: CO.ids[CO.i], t: "saysent", ok: false, ans: "(skipped)", ms: 0 }); saveAttempt(); CO.sayOk = true; CO.sayHeard = "Skipped. Your teacher will help with this one."; return render(); }
  if (a === "coachNext") return coachNext();
  if (a === "celOk") return celOk();
  if (a === "pushOn") return turnOnPush(b);
  if (a === "story") { if (!IS_OWNER && ST.week && !storyReady()) return; return openStory(); }
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
  if (a === "cover") return startCountdown();
  if (a === "spNext") return spNext();
  if (a === "playMine") return voicePlay(b.dataset.key);
  if (a === "playBest") { if (MYV.saved) { stopAudio(); new Audio(MYV.saved.url).play().catch(() => {}); } return; }
  if (a === "spRedo") return spRedo();
  if (a === "trHint") { const id = TR.queue[0]; TR.hints[id] = (TR.hints[id] || 0) + 1; return render(); }
  if (a === "saveExit") { const n = Object.keys(TR ? TR.seen : {}).length; leaveActivity(); view = { name: studentHome() }; render(); toast(n ? "Saved 💾 Come back any time to finish." : "Okay! Come back any time."); return; }
  if (a === "learnMore") return trainTap(true);
  if (a === "flash") return flashSheet();
  if (a === "spaced") return startSpaced();
  if (a === "weekCard") return weekCardSheet("this");
  if (a === "cardWhich") return weekCardSheet(b.dataset.w);
  if (a === "cardShare") return shareWeekCard();
  if (a === "removeKid") return removeKid(b);
  if (a === "tDelete") { if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again to delete for good"; return; }
    const sid = b.dataset.id || T.sel; $app.innerHTML = loaderHtml("Deleting… 🗑️"); try { await purgeStudent(sid); toast("Deleted"); } catch (e) { toast("Couldn't delete: " + (e.message || e)); }
    T.sel = null; T.view = "list"; T.data = null; await loadTeacher(); return; }
  if (a === "tDeleteEmpty") { if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again to delete them all"; return; }
    $app.innerHTML = loaderHtml("Cleaning up… 🧹"); for (const s of emptyAccounts()) { try { await purgeStudent(s._id); } catch (e) {} } await loadTeacher(); return; }
  if (a === "tMore") { const m = document.getElementById("tMoreMenu"); if (m) m.hidden = !m.hidden; return; }
  if (a === "calMonth") { CAL_M = Math.min(0, CAL_M + +b.dataset.d); return render(); }
  if (a === "flStart") return startFlash(b.dataset.deck);
  if (a === "flFlip") return flFlip();
  if (a === "flRate") return flRate(b.dataset.r);
  if (a === "flHome") { stopAudio(); FL = null; TAB = "words"; view = { name: "tabs" }; window.scrollTo(0, 0); return render(); }
  if (a === "moreYes") { closeDayDone(); return trainTap(true); }
  if (a === "moreNo") { closeDayDone(); TAB = "today"; view = { name: "tabs" }; window.scrollTo(0, 0); render(); setTimeout(checkBadges, 400); return; }
  if (a === "liNext") { LIS++; return render(); }
  if (a === "liBack") { LIS--; return render(); }
  if (a === "showGrade") { if (!ST.level) return; view = { name: "levelResult", fromHome: true, back: TAB }; window.scrollTo(0, 0); return render(); }
  if (a === "trainNext") return trainNext();
  if (a === "rate") return trainNext(b.dataset.r);
  if (a === "quit") { leaveActivity(); view = { name: studentHome() }; return render(); }
  // teacher
  if (a === "toTeacher") { mode = "teacher"; clearInterval(hbTimer); SESSION = null; await loadTeacher(); return; }
  if (a === "preview") return enterPreview();
  if (a === "refresh") { $app.innerHTML = loaderHtml("Refreshing… 🔄"); await loadTeacher(); toast("Updated"); return; }
  if (a === "ttab") { T.tab = b.dataset.tab; return render(); }
  if (a === "wkPrev" || a === "wkNext") { const ks = weekOptions(); const i = ks.indexOf(T.week) + (a === "wkPrev" ? 1 : -1); if (ks[i]) T.week = ks[i]; return render(); }
  if (a === "selStudent" || a === "openStudent") { T.sel = b.dataset.id; T.week = null; T.view = "student"; if (T.tab === "global") T.tab = "week"; $app.innerHTML = loaderHtml("Opening folder… 📂"); await loadStudentData(T.sel); window.scrollTo(0, 0); return render(); }
  if (a === "tBackList") { T.view = "list"; T.data = null; if (T.tab === "global") T.tab = "week"; window.scrollTo(0, 0); return render(); }
  if (a === "tGlobal") { T.view = "list"; T.tab = "global"; return render(); }
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
  if (f === "onboard") { obNext(); return; }
  if (f === "dict") { dictCheck(); return; }
  if (f === "answer") { if (!v.trim()) return; answer(v); } if (f === "trainWrite") { if (!v.trim()) return; trainCheck(v); }
  if (f === "fixQuiz" || f === "fixTrain") { const el = document.getElementById("fix"); const id = f === "fixQuiz" ? RUN.qs[RUN.i].id : TR.queue[0];
    if (norm(el.value) === norm(BY[id].w)) { if (f === "fixQuiz") RUN.fixed = true; else TR.fixed = true; render(); }
    else { el.value = ""; el.focus(); toast("Not quite. Look at the word and try again"); } } });
document.addEventListener("input", ev => { if (ev.target.dataset.input === "obReady") obReady(true); });
document.addEventListener("change", async ev => {
  if (ev.target.dataset.change === "myPlan") return savePlan();
  if (ev.target.dataset.change === "remTime") return saveRemTime(+ev.target.dataset.i, ev.target.value);
  if (ev.target.dataset.change === "obDobSel") { stashOnboard(); const g = id => +(document.getElementById(id) || {}).value || 0; const y = g("obY"), m = g("obM"); let d = g("obD");
    if (y && m && d > new Date(y, m, 0).getDate()) d = new Date(y, m, 0).getDate(); ST._dobP = [y, m, d];
    ST._dob = y && m && d ? y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0") : ""; OB_DIR = 0; render(); return mascotWrite(); }
  if (ev.target.dataset.change === "obReady") return obReady(true);
  if (ev.target.dataset.change === "tSort") { T.sort = ev.target.value; return render(); }
  if (ev.target.dataset.change === "voice") { MYV = VOICES.find(v => v.name === ev.target.value) || MYV; try { localStorage.setItem("ww_voice", MYV.name); } catch (e) {} say("Hello! This is how your words will sound."); } });
async function enterPreview() { mode = "student"; SID = ME; TAB = "today"; await loadStudent(true); }

/* ---------- login ---------- */
function renderLogin() {
  const m = view.mode || "in"; const field = (id, label, type, ac, extra) => `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" autocomplete="${ac}" autocapitalize="off" autocorrect="off" spellcheck="false" ${extra || ""}></div>`;
  const tabs = `<div class="seg" style="width:100%"><button type="button" data-act="lgMode" data-m="in" aria-pressed="${m === "in"}" style="flex:1">Sign in</button><button type="button" data-act="lgMode" data-m="up" aria-pressed="${m === "up"}" style="flex:1">Create account</button></div>`;
  let body;
  if (m === "forgot") body = `<h2>Forgot password?</h2><p class="muted small">Type your email. We'll send a link to make a new password. 비밀번호 재설정 링크를 이메일로 보내 드려요.</p>${field("lgEmail", "Email", "text", "username", 'inputmode="email"')}
    ${view.err ? `<div class="fb bad">${esc(view.err)}</div>` : ""}${view.ok ? `<div class="fb good">${esc(view.ok)}</div>` : ""}<button class="big primary" type="submit">Send reset link</button><button type="button" class="ghost" data-act="lgMode" data-m="in" style="align-self:center">Back to sign in</button>`;
  else if (m === "up") body = `${tabs}<p class="muted small">Parents: create one account for each child. Your teacher approves new accounts before they can start. 새 계정은 선생님 승인 후 사용할 수 있어요.</p>
    ${field("lgEmail", "Email", "text", "username", 'inputmode="email"')}${field("lgPw", "Password (6+ characters)", "password", "new-password")}${field("lgPw2", "Type the password again", "password", "new-password")}
    ${view.err ? `<div class="fb bad">${esc(view.err)}</div>` : ""}<button class="big primary" type="submit">Create account</button>`;
  else body = `${tabs}${field("lgEmail", "Email", "text", "username", `inputmode="email" value="${esc(savedEmail())}"`)}${field("lgPw", "Password", "password", "current-password")}
    <label class="row" style="gap:10px;font-weight:700"><input id="lgRemember" type="checkbox" ${rememberOn() ? "checked" : ""} style="width:22px;height:22px;flex:none"><span>Remember me · 로그인 유지</span></label>
    ${view.err ? `<div class="fb bad">${esc(view.err)}</div>` : ""}<button class="big primary" type="submit">Sign in</button><button type="button" class="ghost" data-act="lgMode" data-m="forgot" style="align-self:center">Forgot password?</button>`;
  $app.innerHTML = (INAPP ? `<div style="padding-top:12px">${inappBanner()}</div>` : "") + `<section class="hero" style="text-align:center;padding-bottom:80px"><div class="stack" style="align-items:center;gap:10px;padding-top:30px">${buddy("happy", 110)}<h1>Vocaboo</h1><p class="muted">Train your words every day</p></div></section>
  <form class="card" data-form="login" style="margin-top:-56px;position:relative">${body}</form>${installBanner()}
  <a href="../" class="muted small" style="align-self:center;font-weight:800;text-decoration:none;padding:8px">ℹ️ What is Vocaboo? · Vocaboo 소개</a>`;
}
const savedEmail = () => { try { return localStorage.getItem("vb_email") || ""; } catch (e) { return ""; } };
const rememberOn = () => { try { return !localStorage.getItem("vb_norem"); } catch (e) { return true; } };
const authMsg = e => { const c = (e && e.code) || ""; return /invalid-email/.test(c) ? "That email doesn't look right." : /email-already-in-use/.test(c) ? "An account with this email already exists. Try signing in." : /weak-password/.test(c) ? "Use a password with at least 6 characters." : /invalid|wrong|not-found|credential/.test(c) ? "That email or password isn't right." : /too-many/.test(c) ? "Too many tries. Wait a few minutes and try again." : "Something went wrong: " + (c || (e && e.message)); };
async function doLogin() { const m = view.mode || "in"; const em = (document.getElementById("lgEmail") || {}).value || "", pw = (document.getElementById("lgPw") || {}).value || "";
  if (!em) return;
  try {
    if (m === "forgot") { await WW.resetPassword(em); view = { name: "login", mode: "forgot", ok: "Check your email for the reset link (look in spam too)." }; return render(); }
    if (!pw) return;
    if (m === "up") { if (pw !== ((document.getElementById("lgPw2") || {}).value || "")) { view = { name: "login", mode: "up", err: "The two passwords don't match." }; return render(); } $app.innerHTML = loaderHtml("Creating your account… ✨"); await WW.signUp(em, pw); return; }
    const rem = !!(document.getElementById("lgRemember") || { checked: true }).checked;
    try { if (rem) { localStorage.setItem("vb_email", em.trim()); localStorage.removeItem("vb_norem"); } else { localStorage.removeItem("vb_email"); localStorage.setItem("vb_norem", "1"); } } catch (x) {}
    $app.innerHTML = loaderHtml("Signing you in… 🔑"); await WW.signIn(em, pw, rem);
  } catch (e) { view = { name: "login", mode: m, err: authMsg(e) }; render(); } }

/* ---------- boot ---------- */
async function loadStudent(test) {
  const sd = await db.doc(sPath()).get();
  ST = sd.exists ? clone(sd.data()) : newStudent(test);
  if (!sd.exists && !test) { // new sign-up: free beta seat if any are left, otherwise the launch list
    ST.approved = false; ST.email = (WW.user() && WW.user().email) || ""; if (SID !== ME) ST.parent = ME;
    try { const bd = await db.doc("config/beta").get(); const B = bd.exists ? bd.data() : null;
      if (B && B.on && (B.count || 0) < (B.cap || 0) && db.batch) { const seat = (B.count || 0) + 1; const st2 = Object.assign(clone(ST), { approved: true, betaSeat: seat, approvedAt: Date.now() });
        await db.batch([{ type: "set", path: sPath(), data: st2 }, { type: "update", path: "config/beta", data: { count: seat, last: SID } }]); ST = st2; }
      else if (B && B.on) ST.waitlist = true;
    } catch (e) { console.warn("beta seat", e); ST.approved = false; ST.waitlist = true; } }
  const em = WW.user() && WW.user().email; if (em && ST.email !== em && !test) { ST.email = em; await saveST(); } else if (!sd.exists) await saveST();
  const words = await getAll(sPath() + "/words"); WORDS = {}; words.forEach(w => { const id = w._id; delete w._id; WORDS[id] = w; });
  if (!ST.weekAnchor && ST.week && !SET().textbook) { ST.weekAnchor = ST.week.key; await saveST(); } // keep the current week as it is
  WK_ANCHOR = SET().textbook ? null : (ST.weekAnchor || null);
  if (readyForWeeks()) {
    const atts = ST.sizeCheckedFor === addDays(weekKey(), -7) ? [] : await getAll(sPath() + "/attempts");
    const changed = buildWeek(ST, WORDS, effCfg(ST), false); growQuiz(ST, atts);
    if (changed || atts.length) await saveST();
    loadPacksFor(weekIds());
  }
  applyTextSize(); applyTheme();
  if (ST.approved !== false && !ST.rejected) { trackStudent(); setTimeout(prepStory, 5000); } PROG = null;
  const home = studentHome(); const back = home === "tabs" && !IS_OWNER && ST.greetDay !== today() && ST.lastSeen && Date.now() - ST.lastSeen > 6 * 3600e3;
  ST.lastSeen = Date.now(); saveST();
  view = { name: back ? "hello" : home }; render();
}
let booted = false;
async function boot() { try { applyTheme(); } catch (e) {}
  await new Promise(r => { if (window.WW) return r(); window.addEventListener("ww-ready", r, { once: true }); setTimeout(r, 15000); });
  if (!window.WW) { view = { name: "error", msg: "Couldn't connect. Check the internet connection and try again." }; return render(); }
  if (WW.error) { view = { name: "error", msg: WW.error }; return render(); }
  db = WW.db;
  WW.onAuth(async u => {
    if (!u) { booted = false; mode = "student"; view = { name: "login" }; render(); return splashOff(); }
    if (booted) return; booted = true;
    try {
      ME = u.uid; IS_OWNER = !!WW.teacherUid && u.uid === WW.teacherUid;
      if (!WW.teacherUid || /PASTE/.test(WW.teacherUid)) throw new Error("Setup isn't finished. Your User UID is " + u.uid + ". Paste it into config.js as teacherUid, upload config.js again, then reload.");
      const c = await db.doc("config/main").get(); if (c.exists) CFG = Object.assign({}, DEFAULT_CFG, c.data());
      SID = ME;
      if (IS_OWNER) { mode = "teacher"; await loadTeacher(); }
      else { mode = "student"; await startFamily(false); }
    } catch (e) { console.error(e); mode = "student"; view = { name: "error", msg: /permission/i.test(e.code || e.message || "") ? "The database refused access. Check the Firestore rules step in the setup guide." : (e.message || String(e)) }; render(); }
    await splashOff(); const h = document.querySelector(".hello.wait"); if (h) h.classList.remove("wait"); try { MASCOT.key = ""; mascotSync(true); } catch (e) {}
  });
}
boot();
})();
