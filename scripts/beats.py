#!/usr/bin/env python3
"""beats.py - a music grid in frames, and how well the cuts sit on it.

Usage:
  python beats.py grid  --bpm 124 --fps 30 --duration 15 [--offset 0.0] [--per-bar 4] [--json]
  python beats.py check --bpm 124 --fps 30 --cuts 2.0,4.13,6.0 [--offset 0.0] [--tol 1]
  python beats.py check --bpm 124 --fps 30 --report film-review/report.json     (cuts from review.py)

grid  prints every beat as time and frame (downbeats marked), so a storyboard can place cuts and hits on frames.
check prints, per cut, the nearest beat and the distance in frames; a cut within --tol frames is on the beat.
      This is a reading, not a gate: off-beat cuts can be a choice. Exit 0 always, 2 on bad usage.
--offset is the time of the first downbeat in the track (seconds).
"""
from __future__ import annotations

import argparse
import json
import sys


def beats(bpm, offset, duration):
    step = 60.0 / bpm
    t, i, out = offset, 0, []
    while t <= duration + 1e-9:
        out.append((i, t))
        i += 1
        t = offset + i * step
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mode", choices=["grid", "check"])
    ap.add_argument("--bpm", type=float, required=True)
    ap.add_argument("--fps", type=float, default=30)
    ap.add_argument("--duration", type=float)
    ap.add_argument("--offset", type=float, default=0.0)
    ap.add_argument("--per-bar", type=int, default=4)
    ap.add_argument("--cuts")
    ap.add_argument("--report")
    ap.add_argument("--tol", type=int, default=1)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    if a.bpm <= 0 or a.fps <= 0:
        print("error: --bpm and --fps must be > 0", file=sys.stderr); sys.exit(2)
    if a.mode == "grid":
        if not a.duration:
            print("error: grid needs --duration", file=sys.stderr); sys.exit(2)
        g = [{"beat": i, "t": round(t, 4), "frame": int(round(t * a.fps)), "downbeat": i % a.per_bar == 0} for i, t in beats(a.bpm, a.offset, a.duration)]
        if a.json:
            print(json.dumps(g, indent=1))
        else:
            print("%.2f bpm = %.3f s = %.2f frames per beat at %g fps" % (a.bpm, 60 / a.bpm, 60 / a.bpm * a.fps, a.fps))
            for b in g:
                print("%s beat %3d  %7.3f s  frame %4d" % ("|" if b["downbeat"] else " ", b["beat"], b["t"], b["frame"]))
        return
    if a.report:
        with open(a.report, encoding="utf-8") as f:
            cuts = json.load(f)["cuts"]["times"]
    elif a.cuts:
        cuts = [float(x) for x in a.cuts.split(",") if x.strip()]
    else:
        print("error: check needs --cuts or --report", file=sys.stderr); sys.exit(2)
    grid = beats(a.bpm, a.offset, (max(cuts) if cuts else 0) + 60.0 / a.bpm)
    on = 0
    for c in cuts:
        i, t = min(grid, key=lambda b: abs(b[1] - c))
        d = int(round((c - t) * a.fps))
        on += abs(d) <= a.tol
        print("cut %7.3f s  nearest beat %3d (%7.3f s)  %+d f  %s" % (c, i, t, d, "on beat" if abs(d) <= a.tol else ""))
    if cuts:
        print("%d of %d cuts within +-%d f of a beat" % (on, len(cuts), a.tol))


if __name__ == "__main__":
    main()
