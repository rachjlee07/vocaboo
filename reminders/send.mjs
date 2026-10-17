// Sends Vocaboo reminders. Runs on GitHub Actions three times a day.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const admin = require("./node_modules/firebase-admin");

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
if (!sa.project_id) { console.error("Missing FIREBASE_SERVICE_ACCOUNT secret"); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const APP_URL = process.env.APP_URL || "";

// Korea time
const now = new Date(Date.now() + 9 * 3600e3);
const today = now.toISOString().slice(0, 10);
const yesterday = new Date(now.getTime() - 864e5).toISOString().slice(0, 10);
const h = now.getUTCHours();
const slot = process.env.SLOT || (h < 12 ? "morning" : h < 19 ? "afternoon" : "evening");

function message(st) {
  const done = st.lastQuizDay === today;
  const streak = (st.streak && (st.streak.last === today || st.streak.last === yesterday)) ? st.streak.count || 0 : 0;
  const locked = st.lock && st.lock.on;
  const newWeek = st.week && !st.week.introDone;
  if (slot === "morning") {
    if (newWeek) return { title: "New words this week! 🌱", body: "Learn this week's words and unlock your daily quiz." };
    return { title: "Good morning! ☀️", body: streak ? `Your ${streak}-day streak 🔥 is waiting. A quick quiz keeps it going!` : "Your words are waiting. Start a new streak today!" };
  }
  if (slot === "afternoon") {
    if (done) return st.coachDay === today ? null : { title: "Nice work today! 💬", body: "Try the sentence coach: say 3 of your own sentences." };
    if (locked) return { title: "Let's fix those words 💪", body: "Train your missed words to unlock the daily quiz." };
    return { title: "Quiz time! ✏️", body: "Your daily quiz takes about 10 minutes." };
  }
  if (done) return null; // evening: only if the quiz isn't done
  return { title: streak ? `Don't lose your ${streak}-day streak! 🔥` : "There's still time today! ⏰", body: "Do today's quiz before bed." };
}

const snap = await db.collection("students").get();
let sent = 0;
for (const doc of snap.docs) {
  const st = doc.data();
  if (st.test) continue;
  const tokens = (st.push && st.push.tokens) || [];
  if (!tokens.length) continue;
  const m = message(st);
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
