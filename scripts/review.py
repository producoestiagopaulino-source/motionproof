#!/usr/bin/env python3
"""review.py - check a rendered film from its pixels and sound, whatever made it (HTML, HyperFrames, Remotion, an editor).

Usage:
  python review.py film.mp4 [--out DIR] [--zones auto|reels|tiktok|shorts|story|vertical|feed45|square|wide|none]
                   [--target reels|tiktok|shorts|youtube|web|podcast|broadcast] [--expect S] [--expect-audio]
                   [--exit-required] [--fade-required] [--strict-zones] [--end-hold-max 1.4] [--freeze-max 2.0]
                   [--frames 12] [--events FILE] [--profile FILE.json] [--json]

Gates (FAIL = exit 1):
  R1 render      decodes; >= 75 % of frames carry picture; >= 20 % of frames change; duration within max(1 frame, 0.05 s) of --expect;
                 an audio stream exists when --expect-audio
  R2 dead air    no flat-field run longer than 3 frames inside the film (a black open up to 1.0 s is allowed);
                 no frozen picture longer than --freeze-max seconds before the end
  R3 ending      picture-unchanged end hold <= --end-hold-max; with --exit-required the last second must move
                 (>= 0.25 s of changing frames) and the end hold must be <= 0.6 s
  R4 flashes     no more than 3 general flashes in any 1 s window in any of 9 screen cells (WCAG 2.3.1 style; approximate)
  R5 safe zones  persistent detailed edges (text-like) inside the platform overlay margins; WARN, FAIL with --strict-zones.
                 Pixels cannot tell text from texture: open sheet.jpg (the red bands are the margins) before you act on it.
  R6 sound       integrated loudness within +-1.5 LU of the target; true peak <= target; silent tail <= 0.3 s;
                 with --fade-required the last 0.25 s is >= 6 dB below the 2 s before it
Writes DIR/sheet.jpg (contact sheet with the margins drawn), DIR/report.json. Facts and numbers, no taste verdicts.
A --profile JSON sets defaults for any option by its long name with underscores (e.g. {"exit_required": true, "target": "reels"}).
Exit: 0 pass, 1 a gate failed, 2 bad usage or unreadable file.
"""
from __future__ import annotations

import argparse
import array
import json
import math
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
MOVE_SHARE = 0.001   # a frame 'changes' when at least 0.1 % of analysis pixels move by >= 4 levels (small text on a big ground counts)
FLAT_STD, FLAT_RNG = 1.5, 8


def die(msg, code=2):
    print("error: " + msg, file=sys.stderr)
    sys.exit(code)


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def run(args, binary=False):
    return subprocess.run(args, capture_output=True, text=not binary)


def probe(path):
    r = run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path])
    if r.returncode:
        die("ffprobe cannot read %s: %s" % (path, r.stderr.strip()[:300]))
    return json.loads(r.stdout)


def frames_gray(path, w, h, vf_extra=""):
    """Yield raw gray frames of size w x h."""
    vf = (vf_extra + "," if vf_extra else "") + "scale=%d:%d:flags=area,format=gray" % (w, h)
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", path, "-an", "-vf", vf, "-f", "rawvideo", "-"], stdout=subprocess.PIPE)
    n = w * h
    try:
        while True:
            b = p.stdout.read(n)
            if len(b) < n:
                break
            yield b
    finally:
        p.stdout.close()
        p.wait()


def median(v):
    s = sorted(v)
    n = len(s)
    return 0.0 if not n else (s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2)


GAMMA = [((i / 255.0) / 12.92 if i / 255.0 <= 0.04045 else ((i / 255.0 + 0.055) / 1.055) ** 2.4) for i in range(256)]


def analyse(path, W, H):
    """Per frame: mean |diff| to previous, correlation to previous, std, range, mean, 3x3 cell relative luminance."""
    if W >= H:
        aw, ah = 160, max(2, int(round(160 * H / W / 2)) * 2)
    else:
        ah, aw = 160, max(2, int(round(160 * W / H / 2)) * 2)
    n = aw * ah
    cell_rows = [(ah * k // 3, ah * (k + 1) // 3) for k in range(3)]
    cell_cols = [(aw * k // 3, aw * (k + 1) // 3) for k in range(3)]
    D, P, C, STD, RNG, MEAN, CELL = [], [], [], [], [], [], []
    prev = None
    pm = pv = 0.0
    for fr in frames_gray(path, aw, ah):
        mean = sum(fr) / n
        var = max(0.0, sum(x * x for x in fr) / n - mean * mean)
        STD.append(math.sqrt(var)); RNG.append(max(fr) - min(fr)); MEAN.append(mean)
        cl = []
        for r0, r1 in cell_rows:
            for c0, c1 in cell_cols:
                tot = 0.0
                for y in range(r0, r1):
                    row = fr[y * aw + c0: y * aw + c1]
                    tot += sum(GAMMA[v] for v in row)
                cl.append(tot / ((r1 - r0) * (c1 - c0)))
        CELL.append(cl)
        if prev is None:
            D.append(0.0); P.append(0.0); C.append(1.0)
        else:
            dif = [abs(a - b) for a, b in zip(fr, prev)]
            D.append(sum(dif) / n)
            P.append(sum(1 for d in dif if d >= 4) / n)
            if var < 1e-3 or pv < 1e-3:
                C.append(1.0 if (var < 1e-3 and pv < 1e-3 and abs(mean - pm) < 2) else 0.0)
            else:
                cov = sum(a * b for a, b in zip(fr, prev)) / n - mean * pm
                C.append(cov / math.sqrt(var * pv))
        prev, pm, pv = fr, mean, var
    return D, P, C, STD, RNG, MEAN, CELL


def detect_cuts(D, C):
    cuts = []
    for i in range(2, len(D)):
        around = D[max(1, i - 4):i] + D[i + 1:i + 5]
        if D[i] >= 10 and C[i] < 0.6 and D[i] >= 3 * (median(around) + 0.5):
            if not cuts or i - cuts[-1] > 3:
                cuts.append(i)
    return cuts


def events_cuts(path, fps):
    try:
        with open(path, encoding="utf-8") as f:
            ev = json.load(f)
    except (OSError, ValueError) as e:
        die("cannot read events %s: %s" % (path, e))
    ev = ev.get("events", []) if isinstance(ev, dict) else ev
    return sorted({int(round(e["t"] * fps)) for e in ev if isinstance(e, dict) and "cut" in str(e.get("type", "")).lower() and isinstance(e.get("t"), (int, float))})


def flash_transitions(series, fps):
    """Max number of opposing luminance transitions (>= 0.1 relative luminance, darker side < 0.8) in any 1 s window."""
    trans = []
    lo = hi = series[0]
    ref, d = series[0], 0
    for i, x in enumerate(series):
        if d == 0:
            lo, hi = min(lo, x), max(hi, x)
            if hi - lo >= 0.1 and min(lo, hi) < 0.8:
                d = 1 if x == hi else -1
                ref = x
                trans.append(i)
            continue
        if d == 1:
            if x > ref:
                ref = x
            elif ref - x >= 0.1 and x < 0.8:
                trans.append(i); d, ref = -1, x
        else:
            if x < ref:
                ref = x
            elif x - ref >= 0.1 and ref < 0.8:
                trans.append(i); d, ref = 1, x
    best, j = 0, 0
    win = max(1, int(round(fps)))
    for i in range(len(trans)):
        while trans[i] - trans[j] >= win:
            j += 1
        best = max(best, i - j + 1)
    return best


def zone_edges(path, W, H, Z, sample_fps=2.0):
    """Per margin band: list over consecutive sample pairs of the share of pixels that are an edge in both samples."""
    k = 270.0 / min(W, H)                      # analysis frame: short side 270 px, whatever the source size
    ew, eh = int(round(W * k / 2)) * 2, int(round(H * k / 2)) * 2
    bands = {
        "top": (0, 0, ew, int(eh * Z["top"])), "bottom": (0, eh - int(eh * Z["bottom"]), ew, eh),
        "left": (0, 0, int(ew * Z["left"]), eh), "right": (ew - int(ew * Z["right"]), 0, ew, eh),
    }
    res = {k: [] for k in bands}
    prev = None
    for fr in frames_gray(path, ew, eh, "fps=%s,edgedetect=low=0.1:high=0.3" % sample_fps):
        if prev is not None:
            for k, (x0, y0, x1, y1) in bands.items():
                if x1 - x0 < 2 or y1 - y0 < 2:
                    res[k].append(0.0); continue
                hit = tot = 0
                for y in range(y0, y1):
                    a = fr[y * ew + x0: y * ew + x1]
                    b = prev[y * ew + x0: y * ew + x1]
                    hit += sum(1 for p, q in zip(a, b) if p > 127 and q > 127)
                    tot += x1 - x0
                res[k].append(hit / tot)
        prev = fr
    return res


def audio_env(path, sr=8000, hop=0.05):
    r = run(["ffmpeg", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"], binary=True)
    a = array.array("h")
    a.frombytes(r.stdout[: len(r.stdout) // 2 * 2])
    if sys.byteorder == "big":
        a.byteswap()
    n = int(sr * hop)
    env = []
    for i in range(0, len(a) - n + 1, n):
        seg = a[i:i + n]
        env.append(10 * math.log10(max(sum(x * x for x in seg) / n / 32768.0 ** 2, 1e-12)))
    return env, hop


def loudness(path):
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"])
    s = r.stderr[r.stderr.rfind("Summary:"):]
    g = lambda p: (lambda m: float(m.group(1)) if m else None)(re.search(p, s))
    return {"lufs": g(r"I:\s+(-?[\d.]+) LUFS"), "lra": g(r"LRA:\s+([\d.]+) LU"), "tp": g(r"Peak:\s+(-?[\d.]+) dBFS")}


def sheet(path, out, W, H, Z, nframes, count):
    count = max(1, min(count, nframes))
    idx = sorted({min(nframes - 1, int((k + 0.5) * nframes / count)) for k in range(count)})
    sel = "+".join("eq(n\\,%d)" % i for i in idx)
    boxes = []
    for side, expr in (("top", "x=0:y=0:w=iw:h=ih*%f"), ("bottom", "x=0:y=ih*(1-%f):w=iw:h=ih"), ("left", "x=0:y=0:w=iw*%f:h=ih"), ("right", "x=iw*(1-%f):y=0:w=iw:h=ih")):
        if Z.get(side):
            boxes.append("drawbox=" + (expr % Z[side]) + ":color=red@0.16:t=fill")
    cols = min(len(idx), 6 if H > W else 4)
    tw = 240 if H > W else 480
    vf = "select='%s',%sscale=%d:-2,tile=%dx%d:padding=4:margin=4:color=0x202020" % (sel, ",".join(boxes) + "," if boxes else "", tw, cols, math.ceil(len(idx) / cols))
    r = run(["ffmpeg", "-v", "error", "-y", "-i", path, "-an", "-vf", vf, "-frames:v", "1", "-fps_mode", "passthrough", "-q:v", "3", out])
    return idx if r.returncode == 0 else None


def main():
    pre = argparse.ArgumentParser(add_help=False)
    pre.add_argument("--profile")
    known, _ = pre.parse_known_args()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("film")
    ap.add_argument("--out")
    ap.add_argument("--zones", default="auto")
    ap.add_argument("--target", default="reels")
    ap.add_argument("--expect", type=float)
    ap.add_argument("--expect-audio", action="store_true")
    ap.add_argument("--exit-required", action="store_true")
    ap.add_argument("--fade-required", action="store_true")
    ap.add_argument("--strict-zones", action="store_true")
    ap.add_argument("--end-hold-max", type=float, default=1.4)
    ap.add_argument("--freeze-max", type=float, default=2.0)
    ap.add_argument("--zone-density", type=float, default=0.012, help="R5: share of persistent edge pixels in a margin band that counts")
    ap.add_argument("--frames", type=int, default=12)
    ap.add_argument("--events")
    ap.add_argument("--profile")
    ap.add_argument("--json", action="store_true")
    if known.profile:
        try:
            with open(known.profile, encoding="utf-8") as f:
                ap.set_defaults(**json.load(f))
        except (OSError, ValueError) as e:
            die("cannot read profile: %s" % e)
    a = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except AttributeError:
        pass
    for t in ("ffmpeg", "ffprobe"):
        if not shutil.which(t):
            die(t + " not found on PATH")
    if not os.path.isfile(a.film):
        die("film not found: " + a.film)
    zones, targets = load("zones.json"), load("targets.json")
    info = probe(a.film)
    vs = next((s for s in info["streams"] if s.get("codec_type") == "video"), None)
    au = next((s for s in info["streams"] if s.get("codec_type") == "audio"), None)
    if not vs:
        die("no video stream")
    W, H = int(vs["width"]), int(vs["height"])
    num, den = (vs.get("avg_frame_rate") or "0/1").split("/")
    fps = float(num) / float(den) if float(den) else 0.0
    dur = float(info["format"].get("duration") or vs.get("duration") or 0)
    if fps <= 0 or dur <= 0:
        die("cannot read fps or duration")
    zname = a.zones
    if zname == "auto":
        r_ = W / H
        zname = "reels" if r_ < 0.6 else "feed45" if r_ < 0.9 else "square" if r_ < 1.2 else "wide"
    if zname not in zones:
        die("unknown zone preset " + zname)
    Z = zones[zname]
    if a.target not in targets:
        die("unknown target " + a.target)
    T = targets[a.target]
    out = a.out or os.path.splitext(a.film)[0] + "-review"
    os.makedirs(out, exist_ok=True)

    D, P, C, STD, RNG, MEAN, CELL = analyse(a.film, W, H)
    n = len(D)
    if n < 2:
        die("could not decode frames", 1)
    flat = [STD[i] < FLAT_STD and RNG[i] < FLAT_RNG for i in range(n)]
    ev_path = a.events or next((p for p in (a.film + ".events.json", os.path.splitext(a.film)[0] + ".events.json") if os.path.isfile(p)), None)
    cuts = events_cuts(ev_path, fps) if ev_path else []
    cut_src = "events" if cuts else "detected"
    if not cuts:
        cuts = detect_cuts(D, C)
    gates = []

    def gate(gid, name, status, detail):
        gates.append({"id": gid, "name": name, "status": status, "detail": detail})

    # R1
    why, st = [], "PASS"
    content = sum(1 for f in flat if not f) / n
    moving = sum(1 for p in P[1:] if p >= MOVE_SHARE) / max(1, n - 1)
    why.append("%.0f%% frames with picture, %.0f%% frames change" % (content * 100, moving * 100))
    if content < 0.75:
        st = "FAIL"; why.append("blank or near-blank film")
    if moving < 0.20:
        st = "FAIL"; why.append("almost nothing moves")
    if a.expect is not None:
        tol = max(1.0 / fps, 0.05)
        if abs(dur - a.expect) > tol + 1e-9:
            st = "FAIL"; why.append("duration %.3f s, expected %.3f s (+-%.3f)" % (dur, a.expect, tol))
        else:
            why.append("duration %.3f s as expected" % dur)
    if a.expect_audio and not au:
        st = "FAIL"; why.append("no audio stream")
    gate("R1", "render", st, "; ".join(why))

    # R2
    runs, s0 = [], None
    for i, f in enumerate(flat + [False]):
        if f and s0 is None:
            s0 = i
        elif not f and s0 is not None:
            runs.append((s0, i - 1)); s0 = None
    bad = []
    for s, e in runs:
        L = e - s + 1
        if e >= n - 1:
            continue                       # touches the end: judged by R3
        if s == 0 and L / fps <= 1.0:
            continue                       # a black open of up to 1 s is a choice
        if L > 3:
            bad.append("flat %.2f-%.2f s (%d f)" % (s / fps, (e + 1) / fps, L))
    still_runs, s0 = [], None
    for i in range(1, n + 1):
        f = i < n and P[i] < MOVE_SHARE
        if f and s0 is None:
            s0 = i
        elif not f and s0 is not None:
            still_runs.append((s0 - 1, i - 1)); s0 = None
    for s, e in still_runs:
        if e < n - 1 and (e - s + 1) / fps > a.freeze_max:
            bad.append("frozen %.2f-%.2f s (%.2f s > %.1f)" % (s / fps, (e + 1) / fps, (e - s + 1) / fps, a.freeze_max))
    gate("R2", "dead air", "FAIL" if bad else "PASS", "; ".join(bad) if bad else "no flat run > 3 f, no freeze > %.1f s" % a.freeze_max)

    # R3
    hold_f = 0
    for i in range(n - 1, 0, -1):
        if P[i] < MOVE_SHARE:
            hold_f += 1
        else:
            break
    hold = (hold_f + 1) / fps if hold_f else 0.0
    st, why = "PASS", ["end hold %.2f s" % hold]
    lim = min(a.end_hold_max, 0.6) if a.exit_required else a.end_hold_max
    if hold > lim + 1e-9:
        st = "FAIL"; why.append("> %.2f s: the film sits finished" % lim)
    last = P[max(1, n - int(round(fps))):]
    exit_motion = sum(1 for p in last if p >= MOVE_SHARE) / fps
    why.append("motion in last second %.2f s" % exit_motion)
    if a.exit_required and exit_motion < 0.25:
        st = "FAIL"; why.append("no exit move at the end")
    final_shot = (dur - cuts[-1] / fps) if cuts else dur
    why.append("final shot %.2f s (%.0f%% of film)" % (final_shot, 100 * final_shot / dur))
    gate("R3", "ending", st, "; ".join(why))

    # R4
    worst, cell = 0, -1
    for k in range(9):
        c = flash_transitions([row[k] for row in CELL], fps)
        if c > worst:
            worst, cell = c, k
    flashes = worst // 2
    gate("R4", "flashes", "FAIL" if worst > 6 else "PASS", "max %d opposing transitions (~%d flashes) in 1 s%s; limit 3 flashes" % (worst, flashes, (" in cell %d" % cell) if cell >= 0 else ""))

    # R5
    zr = {}
    if zname != "none":
        ze = zone_edges(a.film, W, H, Z)
        flagged = []
        for k, v in ze.items():
            best, cur = 0, 0
            for x in v:
                cur = cur + 1 if x >= a.zone_density else 0
                best = max(best, cur)
            zr[k] = {"max_density": round(max(v) if v else 0.0, 4), "longest_pairs": best}
            if best >= 2:
                flagged.append("%s band (%.1f%% persistent edges for >= %.1f s)" % (k, 100 * max(v), best / 2.0))
        st = ("FAIL" if a.strict_zones else "WARN") if flagged else "PASS"
        gate("R5", "safe zones (%s)" % zname, st, "; ".join(flagged) if flagged else "no persistent detail in the margins")
    else:
        gate("R5", "safe zones", "PASS", "zones=none")

    # R6
    aud = None
    if au:
        L = loudness(a.film)
        env, hop = audio_env(a.film)
        audible = [i for i, v in enumerate(env) if v >= -50]
        tail = (len(env) - 1 - audible[-1]) * hop if audible else dur
        lead = audible[0] * hop if audible else dur
        drops = []
        if audible:
            s0 = None
            for i in range(audible[0], audible[-1] + 1):
                if env[i] < -70 and s0 is None:
                    s0 = i
                elif env[i] >= -70 and s0 is not None:
                    if (i - s0) * hop >= 0.25:
                        drops.append(round(s0 * hop, 2))
                    s0 = None
        endw = int(0.25 / hop)
        before = env[-int(2.25 / hop):-endw] if len(env) > int(2.5 / hop) else []
        fade_db = (median(before) - (sum(env[-endw:]) / endw)) if before and audible else None
        aud = {"lufs": L["lufs"], "tp": L["tp"], "lra": L["lra"], "lead_silence": round(lead, 2), "tail_silence": round(tail, 2), "dropouts": drops,
               "fade_drop_db": None if fade_db is None else round(fade_db, 1)}
        st, why = "PASS", []
        if L["lufs"] is None or L["lufs"] < -69:
            st = "FAIL"; why.append("soundtrack silent")
        else:
            why.append("%.1f LUFS (target %d +-%.1f), true peak %.1f dBTP (max %.1f)" % (L["lufs"], T["lufs"], targets["tolerance_lu"], L["tp"], T["tp"]))
            if abs(L["lufs"] - T["lufs"]) > targets["tolerance_lu"]:
                st = "FAIL"; why.append("loudness off target")
            if L["tp"] is not None and L["tp"] > T["tp"] + 0.2:
                st = "FAIL"; why.append("true peak too high")
        if tail > 0.3:
            st = "FAIL"; why.append("silent tail %.2f s" % tail)
        if a.fade_required and (fade_db is None or fade_db < 6):
            st = "FAIL"; why.append("no fade-out at the end (drop %s dB < 6)" % (None if fade_db is None else round(fade_db, 1)))
        elif fade_db is not None:
            why.append("end drop %.1f dB" % fade_db)
        if drops:
            why.append("note: digital silence inside at %s s (fine if it is a designed pause)" % ", ".join(map(str, drops[:5])))
        gate("R6", "sound (%s)" % a.target, st, "; ".join(why))
    else:
        gate("R6", "sound", "FAIL" if a.expect_audio else "PASS", "no audio stream" + (" but --expect-audio" if a.expect_audio else " (not required)"))

    sh = os.path.join(out, "sheet.jpg")
    idx = sheet(a.film, sh, W, H, Z if zname != "none" else {}, n, a.frames)
    motion = sum(D[1:]) / max(1, n - 1)
    report = {"film": os.path.abspath(a.film), "width": W, "height": H, "fps": round(fps, 3), "duration": round(dur, 3), "frames": n,
              "zones": zname, "target": a.target, "cuts": {"source": cut_src, "times": [round(c / fps, 3) for c in cuts]},
              "motion_mean": round(motion, 2), "audio": aud, "zone_edges": zr, "gates": gates,
              "sheet": sh if idx is not None else None, "sheet_times": [round(i / fps, 2) for i in idx] if idx else []}
    report["result"] = "FAIL" if any(g["status"] == "FAIL" for g in gates) else "PASS"
    with open(os.path.join(out, "report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=1)
    if a.json:
        print(json.dumps(report, indent=1))
    else:
        print("review %s  %dx%d  %.2f fps  %.2f s  zones=%s  target=%s" % (a.film, W, H, fps, dur, zname, a.target))
        print("cuts (%s): %s" % (cut_src, ", ".join("%.2f" % (c / fps) for c in cuts[:20]) or "none"))
        print("motion mean %.2f / 255 per frame (a reading, not a gate)" % motion)
        for g in gates:
            print("%s %-22s %-4s  %s" % (g["id"], g["name"], g["status"], g["detail"]))
        print("sheet %s  (frames at %s s)" % (sh, ", ".join("%.2f" % t for t in report["sheet_times"])))
        print("RESULT " + report["result"])
    sys.exit(1 if report["result"] == "FAIL" else 0)


if __name__ == "__main__":
    main()
