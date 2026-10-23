#!/usr/bin/env python3
"""Shortlist royalty-free background music from Kevin MacLeod's incompetech catalogue (CC BY 4.0:
free to use, commercially too, with the credit line this prints).

  python3 -I find-music.py --length 289 [--bpm 75-125] [--feel Bright,Calming,Uplifting] [--catalog pieces.json]

Without --catalog it downloads the catalogue JSON into a temporary folder (it is data, never code).
Prints the best matches: length (prefers tracks a little longer than the video, so the ending can
land on the end card), tempo, feel, instruments and the download URL. Download the one you choose
into its own folder, listen, then mix it with mix.cjs --music.
"""
import argparse, json, os, sys, tempfile, urllib.parse, urllib.request

CATALOG = "https://incompetech.com/music/royalty-free/pieces.json"
MP3 = "https://incompetech.com/music/royalty-free/mp3-royaltyfree/{}"
AVOID = {"Dark", "Mysterious", "Intense", "Eerie", "Unnerving", "Somber", "Mystical", "Humorous", "Epic", "Action",
         "Suspenseful", "Aggressive", "Bouncy"}
KEYWORDS = ["corporate", "technolog", "business", "piano", "ambient", "inspir", "positive", "electronic", "modern",
            "presentation", "commercial", "background", "optimis", "hopeful", "uplift", "synth"]


def secs(length):
    parts = [int(x) for x in str(length).split(":")]
    while len(parts) < 3:
        parts.insert(0, 0)
    h, m, s = parts
    return h * 3600 + m * 60 + s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--length", type=float, required=True, help="video length in seconds")
    ap.add_argument("--bpm", default="75-125")
    ap.add_argument("--feel", default="Bright,Calming,Relaxed,Uplifting,Grooving")
    ap.add_argument("--avoid", default=",".join(sorted(AVOID)))
    ap.add_argument("--keywords", default=",".join(KEYWORDS))
    ap.add_argument("--catalog", help="a downloaded pieces.json")
    ap.add_argument("--top", type=int, default=15)
    a = ap.parse_args()

    path = a.catalog
    if not path:
        path = os.path.join(tempfile.mkdtemp(prefix="incompetech-"), "pieces.json")
        req = urllib.request.Request(CATALOG, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(path, "wb") as f:
            f.write(r.read())
    pieces = json.load(open(path, encoding="utf-8"))

    lo, hi = (int(x) for x in a.bpm.split("-"))
    want = {f.strip() for f in a.feel.split(",") if f.strip()}
    avoid = {f.strip() for f in a.avoid.split(",") if f.strip()}
    keys = [k.strip().lower() for k in a.keywords.split(",") if k.strip()]
    rows = []
    for p in pieces:
        feel = {f.strip() for f in str(p.get("feel", "")).split(",")}
        if want and not (feel & want) or (feel & avoid):
            continue
        if any(v in str(p.get("instruments", "")).lower() for v in ("choir", "vocal", "voice")):
            continue   # a sung line fights the narration
        try:
            length, bpm = secs(p["length"]), int(p.get("bpm") or 0)
        except (KeyError, ValueError):
            continue
        if not (lo <= bpm <= hi) or length < min(a.length * 0.5, 120):
            continue
        text = " ".join(str(p.get(k, "")) for k in ("description", "instruments", "title", "genre")).lower()
        score = sum(k in text for k in keys)
        # Best: within -3 % .. +12 % of the video (tempo can be nudged by up to 3 % to fit exactly).
        ratio = length / a.length
        fit = 3 if 0.97 <= ratio <= 1.12 else 2 if ratio > 1.12 else 1 if ratio >= 0.8 else 0
        rows.append((fit, score, length, bpm, p))
    rows.sort(key=lambda r: (-r[0], -r[1], abs(r[2] - a.length)))
    fits = {3: "fits", 2: "longer: trim + fade", 1: "short: loops once", 0: "short: loops"}
    for fit, score, length, bpm, p in rows[: a.top]:
        print(f"{p['title']}  —  {int(length) // 60}:{int(length) % 60:02d}, {bpm} bpm, {fits[fit]}, keywords {score}")
        print(f"   feel: {p.get('feel')} | instruments: {p.get('instruments')}")
        print(f"   {str(p.get('description', ''))[:160]}")
        print(f"   {MP3.format(urllib.parse.quote(p['filename']))}")
        print(f"   credit: \"{p['title']}\" by Kevin MacLeod (incompetech.com), licensed under CC BY 4.0 (creativecommons.org/licenses/by/4.0)")
    print(f"\n{len(rows)} candidates", file=sys.stderr)


if __name__ == "__main__":
    main()
