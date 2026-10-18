# Records Vocaboo's AI-written weekly stories with the natural "Bella" voice.
# Runs on GitHub Actions every few minutes. Finds stories marked needsAudio,
# makes one MP3 per story part, and saves it next to the story in Firestore.
import base64, json, os, re, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

def sentences(text):
    parts = re.split(r'(?<=[.!?])\s+(?=[A-Z"“‘])|(?<=[.!?]["”’])\s+(?=[A-Z"“‘])', str(text).strip())
    return [p.strip() for p in parts if p.strip()]

_k = None
def kokoro():
    global _k
    if _k is None:
        from kokoro_onnx import Kokoro
        _k = Kokoro(os.path.join(HERE, "kokoro.onnx"), os.path.join(HERE, "bella.npz"))
    return _k

def tts_part(text):
    import numpy as np
    from g2p import g2p
    import lameenc
    k = kokoro(); sr = 24000; chunks = []
    gap = np.zeros(int(sr * 0.32), dtype=np.float32)
    for s in sentences(text):
        a, sr = k.create(g2p(s), voice="af_bella", speed=0.95, is_phonemes=True)
        a = a.astype(np.float32)
        # trim the model's own silence at both ends so pauses stay short and even
        idx = np.where(np.abs(a) > 0.01)[0]
        if len(idx): a = a[max(0, idx[0] - int(sr * 0.03)): idx[-1] + int(sr * 0.06)]
        chunks += [a, gap]
    if not chunks: return None
    pcm = (np.clip(np.concatenate(chunks), -1, 1) * 32767).astype(np.int16).tobytes()
    enc = lameenc.Encoder(); enc.set_bit_rate(40); enc.set_in_sample_rate(sr); enc.set_channels(1); enc.set_quality(2)
    return enc.encode(pcm) + enc.flush()

def main():
    import firebase_admin
    from firebase_admin import credentials, firestore
    sa = json.loads(os.environ.get("FIREBASE_SERVICE_ACCOUNT") or "{}")
    if not sa.get("project_id"): print("Missing FIREBASE_SERVICE_ACCOUNT secret"); sys.exit(1)
    firebase_admin.initialize_app(credentials.Certificate(sa))
    db = firestore.client()
    # each student doc says which week's story still needs a voice (storyAudioPending = week key)
    studs = list(db.collection("students").where("storyAudioPending", ">", "").limit(8).stream())
    if os.environ.get("CHECK_ONLY"):
        out = os.environ.get("GITHUB_OUTPUT")
        if out: open(out, "a").write(f"pending={len(studs)}\n")
        print("pending", len(studs)); return
    for s in studs:
        week = (s.to_dict() or {}).get("storyAudioPending"); ref = s.reference.collection("stories").document(str(week))
        snap = ref.get(); st = snap.to_dict() if snap.exists else None
        if not st or not st.get("needsAudio") or not st.get("parts"):
            s.reference.update({"storyAudioPending": firestore.DELETE_FIELD}); continue
        t0 = time.time(); n = 0
        try:
            for i, p in enumerate(st["parts"]):
                mp3 = tts_part(p.get("en", ""))
                if not mp3: continue
                ref.collection("audio").document(str(i)).set({"b64": base64.b64encode(mp3).decode(), "voice": "af_bella", "at": int(time.time() * 1000)})
                n += 1
            ref.update({"needsAudio": False, "audio": {"parts": n, "voice": "af_bella", "at": int(time.time() * 1000)}})
            s.reference.update({"storyAudioPending": firestore.DELETE_FIELD})
            print(ref.path, "parts", n, "in", round(time.time() - t0, 1), "s")
        except Exception as e:
            print("failed", ref.path, e); tries = (st.get("audioTries") or 0) + 1
            ref.update({"audioTries": tries, "needsAudio": tries < 3})
            if tries >= 3: s.reference.update({"storyAudioPending": firestore.DELETE_FIELD})

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        mp3 = tts_part("Mina looked at the starry sky. She felt a sharp wind on her face! Was it going to rain?")
        open(os.path.join(HERE, "test.mp3"), "wb").write(mp3); print("wrote test.mp3", len(mp3), "bytes")
    else:
        main()
