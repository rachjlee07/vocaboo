# Records every word and example sentence in the natural "Bella" voice.
# Run by the "Vocaboo word audio" GitHub Action (start it by hand once; re-run any time new words are added).
#   python tts/word_audio.py part 3 8   -> records part 3 of 8 into out_part_3.json
#   python tts/word_audio.py merge      -> puts all parts into app/audio/*.json
import base64, glob, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
AUDIO = os.path.join(ROOT, "app", "audio")
sys.path.insert(0, HERE)
idof = lambda w: re.sub(r"[^a-z0-9]+", "_", w.lower())

def bank():
    s = open(os.path.join(ROOT, "app", "words.js"), encoding="utf-8").read()
    i = s.index("[", s.index("window.__BANK__")); arr, _ = json.JSONDecoder().raw_decode(s[i:])
    return arr

def course_entries(b):
    """course packs (app/courses.js): each unit gets its own pack with the word, its 3 course sentences and the tile sentence"""
    f = os.path.join(ROOT, "app", "courses.js")
    if not os.path.exists(f): return []
    s = open(f, encoding="utf-8").read(); out = []
    i = s.index("[", s.index("var N=")); N, _ = json.JSONDecoder().raw_decode(s[i:])
    i = s.index("{", s.index("window.__CX__")); CX, _ = json.JSONDecoder().raw_decode(s[i:])
    words = {idof(e["w"]): e["w"] for e in b}; words.update({idof(e["w"]): e["w"] for e in N})
    for key, m in CX["items"].items():
        for wid, it in m.items():
            if wid not in words: continue
            out.append({"w": words[wid], "src": [it["pk"]], "ex": it.get("ex") or [], "tr": (it.get("tr") or {}).get("en"), "_c": 1})
    return out

def test_ids():
    s = open(os.path.join(ROOT, "app", "words.js"), encoding="utf-8").read()
    if "window.__TEST__" not in s: return []
    i = s.index("[", s.index("window.__TEST__")); arr, _ = json.JSONDecoder().raw_decode(s[i:]); return arr

def packs():
    out = {}
    for f in glob.glob(os.path.join(AUDIO, "*.json")):
        try: out[os.path.basename(f)[:-5]] = json.load(open(f))
        except Exception: pass
    return out

def tasks(b, P):
    t = []
    for e in course_entries(b):
        i = idof(e["w"]); pk = P.get(e["src"][0], {}); ent = pk.get(i) if isinstance(pk.get(i), dict) else {}
        if not ent.get("w"): t.append((e, i, "w"))
        for k in range(len(e["ex"][:3])):
            if not ent.get("e%d" % k): t.append((e, i, "e%d" % k))
        if e.get("tr") and not ent.get("t"): t.append((e, i, "t"))
    for e in b:
        i = idof(e["w"]); pk = P.get(e["src"][0], {}); ent = pk.get(i) if isinstance(pk.get(i), dict) else {}
        done = set(pk.get("_bella", []))
        if not ent.get("w"): t.append((e, i, "w"))
        if i not in done:
            for k, x in enumerate((e.get("ex") or [])[:2]): t.append((e, i, "e%d" % k))
    return t

def record(e, tag):
    import numpy as np, lameenc
    from g2p import g2p, OVERRIDE
    global K
    if K is None:
        from kokoro_onnx import Kokoro
        K = Kokoro(os.path.join(HERE, "kokoro.onnx"), os.path.join(HERE, "bella.npz"))
    if tag == "w": ps, sp = (OVERRIDE.get(e["w"]) or g2p(e["w"])) + ".", 0.9
    elif tag == "t": ps, sp = g2p(e["tr"]), 0.92
    else: ps, sp = g2p(e["ex"][int(tag[1])]), 0.92
    a, sr = K.create(ps, voice="af_bella", speed=sp, is_phonemes=True); a = a.astype(np.float32)
    idx = np.where(np.abs(a) > 0.01)[0]
    if len(idx): a = a[max(0, idx[0] - int(sr * 0.03)): idx[-1] + int(sr * 0.08)]
    pad = np.zeros(int(sr * 0.08), dtype=np.float32); a = np.concatenate([pad, a, pad])
    pcm = (np.clip(a, -1, 1) * 32767).astype(np.int16).tobytes()
    enc = lameenc.Encoder(); enc.set_bit_rate(32); enc.set_in_sample_rate(sr); enc.set_channels(1); enc.set_quality(2)
    return base64.b64encode(enc.encode(pcm) + enc.flush()).decode()
K = None

def part(p, n):
    b = bank(); T = tasks(b, packs()); mine = [x for k, x in enumerate(T) if k % n == p]
    lim = int(os.environ.get("LIMIT") or 0)
    if lim: mine = mine[:lim]
    print("total tasks", len(T), "this part", len(mine), flush=True)
    out = {}
    for k, (e, i, tag) in enumerate(mine):
        try: out.setdefault(e["src"][0] + "|" + i, {"src": e["src"][0], "id": i})[tag] = record(e, tag)
        except Exception as ex: print("skip", e["w"], tag, ex)
        if k % 200 == 0: print(k, e["w"], tag, flush=True)
    json.dump(out, open(os.path.join(ROOT, "out_part_%d.json" % p), "w"), separators=(",", ":"))
    print("done part", p, len(mine))

def merge():
    P = packs(); n = 0; b = {idof(e["w"]): e for e in bank()}
    for f in glob.glob(os.path.join(ROOT, "**", "out_part_*.json"), recursive=True):
        for i, d in json.load(open(f)).items():
            src = d.pop("src"); i = d.pop("id", i.split("|")[-1]); pk = P.setdefault(src, {}); ent = pk.get(i) if isinstance(pk.get(i), dict) else {}
            ent.update(d); pk[i] = ent; n += len(d)
            e = b.get(i)
            if e and e["src"][0] == src and all(("e%d" % k) in ent for k in range(len((e.get("ex") or [])[:2]))):
                pk["_bella"] = sorted(set(pk.get("_bella", [])) | {i})
    tp = P.setdefault("TEST", {})  # the level test loads only this pack
    for i in test_ids():
        e = b.get(i)
        if not e: continue
        ent = P.get(e["src"][0], {}).get(i)
        if isinstance(ent, dict) and ent.get("w") and not (isinstance(tp.get(i), dict) and tp[i].get("w")): tp[i] = {"w": ent["w"]}
    os.makedirs(AUDIO, exist_ok=True)
    for name, d in P.items():
        json.dump(d, open(os.path.join(AUDIO, name + ".json"), "w"), separators=(",", ":"))
    print("merged clips", n, "packs", len(P))

if __name__ == "__main__":
    if sys.argv[1] == "part": part(int(sys.argv[2]), int(sys.argv[3]))
    elif sys.argv[1] == "merge": merge()
    elif sys.argv[1] == "count": T = tasks(bank(), packs()); print("tasks", len(T))
