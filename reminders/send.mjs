// Sends Vocaboo reminders. Runs on GitHub Actions every hour.
// Each student (or parent) picks up to 3 reminder times in the app; default 8am, 5pm, 8pm.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const admin = require("./node_modules/firebase-admin");

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
if (!sa.project_id) { console.error("Missing FIREBASE_SERVICE_ACCOUNT secret"); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const APP_URL = process.env.APP_URL || "";
const FORCE = process.env.SLOT || ""; // manual test run: send this slot to everyone now

function localParts(tz) {
  try {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
    const p = Object.fromEntries(f.formatToParts(new Date()).map(x => [x.type, x.value]));
    return { day: `${p.year}-${p.month}-${p.day}`, hour: +p.hour };
  } catch (e) { return localParts("Asia/Seoul"); }
}
const prevDay = d => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); };

function message(st, slot, today) {
  const name = (st.profile && st.profile.name) ? ", " + st.profile.name : "";
  const done = st.lastQuizDay === today;
  const s = st.streak || {}; const gap = s.last ? Math.round((new Date(today + "T12:00:00Z") - new Date(s.last + "T12:00:00Z")) / 864e5) : 99;
  const streak = gap <= 1 + (st.freezes || 0) ? s.count || 0 : 0;
  const locked = st.lock && st.lock.on;
  const newWeek = st.week && !st.week.introDone;
  if (slot === "morning") {
    if (newWeek) return { title: `New words this week${name}! 🌱`, body: "Learn this week's words and unlock your daily quiz." };
    return { title: `Good morning${name}! ☀️`, body: streak ? `Your ${streak}-day streak 🔥 is waiting. A quick quiz keeps it going!` : "Your words are waiting. Start a new streak today!" };
  }
  if (slot === "afternoon") {
    if (done) return st.coachDay === today ? null : { title: `Nice work today${name}! 💬`, body: "Try the sentence coach: say 3 of your own sentences." };
    if (locked) return { title: "Let's fix those words 💪", body: "Train your missed words to unlock the daily quiz." };
    return { title: `Quiz time${name}! ✏️`, body: "Your daily quiz takes about 10 minutes." };
  }
  if (done) return null; // evening: only if the quiz isn't done
  return { title: streak ? `Don't lose your ${streak}-day streak${name}! 🔥` : `There's still time today${name}! ⏰`, body: "Do today's quiz before bed." };
}

const snap = await db.collection("students").get();
let sent = 0;
for (const doc of snap.docs) {
  const st = doc.data();
  if (st.test || st.approved === false || st.rejected) continue;
  const tokens = (st.push && st.push.tokens) || [];
  if (!tokens.length) continue;
  const { day, hour } = localParts(st.push && st.push.tz);
  const times = (st.push && Array.isArray(st.push.times)) ? st.push.times : [8, 17, 20];
  let slot = FORCE;
  if (!slot) {
    if (!times.includes(hour)) continue;
    const last = Math.max(...times);
    slot = hour === last && times.length > 1 ? "evening" : hour < 12 ? "morning" : hour < 19 ? "afternoon" : "evening";
  }
  const m = message(st, slot, day);
  if (!m) { console.log(doc.id, "skip", slot); continue; }
  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title: m.title, body: m.body },
    webpush: { fcmOptions: APP_URL ? { link: APP_URL } : undefined, notification: { icon: APP_URL ? APP_URL + "icon-192.png" : undefined }, data: { link: APP_URL } }
  });
  const bad = [];
  res.responses.forEach((r, i) => { if (!r.success) { console.log("fail", r.error && r.error.code); if (/registration-token-not-registered|invalid-argument|invalid-registration-token/.test(r.error && r.error.code || "")) bad.push(tokens[i]); } });
  if (bad.length) await doc.ref.update({ "push.tokens": tokens.filter(t => !bad.includes(t)) });
  sent += res.successCount;
  console.log(doc.id, slot, m.title, "ok", res.successCount);
}
console.log("sent", sent);
process.exit(0);
