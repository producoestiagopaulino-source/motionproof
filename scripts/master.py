#!/usr/bin/env python3
"""master.py - bring a film's soundtrack to a delivery target and fade it out, video stream copied untouched.

Usage:
  python master.py in.mp4 out.mp4 [--target reels|tiktok|shorts|youtube|web|podcast|broadcast] [--fade 1.0] [--no-fade]
  python master.py in.wav out.wav [...]            audio-only files work the same way

Two-pass ffmpeg loudnorm (linear) to the target's integrated LUFS and true peak (data/targets.json), then (if the true peak is still over the target) an alimiter, re-measured up to 3 more times; exit 1 if it cannot get under.
Output length equals the input video length. A fade-out over the
last --fade seconds (default 1.0; 0.8-1.5 reads as an ending, shorter reads as a cut). Prints the measured result.
Exit: 0 ok, 1 ffmpeg failure or true peak above target, 2 bad usage.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")


def die(msg, code=2):
    print("error: " + msg, file=sys.stderr)
    sys.exit(code)


def ff(args):
    return subprocess.run(["ffmpeg", "-hide_banner", "-nostats"] + args, capture_output=True, text=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--target", default="reels")
    ap.add_argument("--fade", type=float, default=1.0)
    ap.add_argument("--no-fade", action="store_true")
    a = ap.parse_args()
    if not os.path.isfile(a.src):
        die("not found: " + a.src)
    with open(os.path.join(DATA, "targets.json"), encoding="utf-8") as f:
        targets = json.load(f)
    if a.target not in targets or a.target.startswith("_") or a.target == "tolerance_lu":
        die("unknown target " + a.target)
    T = targets[a.target]
    pr = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", a.src], capture_output=True, text=True)
    if pr.returncode:
        die("ffprobe failed: " + pr.stderr[:300])
    info = json.loads(pr.stdout)
    kinds = [s.get("codec_type") for s in info.get("streams", [])]
    if "audio" not in kinds:
        die("no audio stream in " + a.src)
    dur = float(info["format"]["duration"])
    lra = 11
    first = "loudnorm=I=%s:TP=%s:LRA=%s:print_format=json" % (T["lufs"], T["tp"], lra)
    r = ff(["-i", a.src, "-vn", "-af", first, "-f", "null", "-"])
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr)
    if not m:
        die("loudnorm measure failed: " + r.stderr[-400:], 1)
    meas = json.loads(m.group(0))
    second = ("loudnorm=I=%s:TP=%s:LRA=%s:measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s:linear=true"
              % (T["lufs"], T["tp"], lra, meas["input_i"], meas["input_tp"], meas["input_lra"], meas["input_thresh"], meas["target_offset"]))
    vdur = dur
    if "video" in kinds:
        pv = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=duration", "-of", "csv=p=0", a.src], capture_output=True, text=True)
        try:
            vdur = float(pv.stdout.strip().splitlines()[0])
        except (ValueError, IndexError):
            pass
    dur = vdur  # output length = input video length (loudnorm can pad the audio tail)
    tail = ""
    if not a.no_fade and a.fade > 0:
        tail = ",afade=t=out:st=%.3f:d=%.3f" % (max(0.0, dur - a.fade), min(a.fade, dur))
    lim = None  # dBTP ceiling of the extra alimiter; None on the first try
    tp_out = lu_out = None
    for attempt in range(4):
        chain = second + ",aresample=48000"
        if lim is not None:
            chain += ",alimiter=limit=%.4f:level=false:attack=3:release=50" % (10 ** (lim / 20))
        chain += tail
        args = ["-y", "-i", a.src, "-af", chain, "-t", "%.3f" % dur]
        if "video" in kinds:
            args += ["-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"]
        args.append(a.dst)
        r = ff(args)
        if r.returncode:
            die("ffmpeg failed: " + r.stderr[-600:], 1)
        r = ff(["-i", a.dst, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"])
        s = r.stderr[r.stderr.rfind("Summary:"):]
        lu = re.search(r"I:\s+(-?[\d.]+) LUFS", s)
        tp = re.search(r"Peak:\s+(-?[\d.]+) dBFS", s)
        lu_out, tp_out = (lu.group(1) if lu else None), (float(tp.group(1)) if tp else None)
        if tp_out is None or tp_out <= float(T["tp"]):
            break
        # still over the ceiling (dense track, AAC overshoot): limit harder, with a margin that grows each round
        lim = (float(T["tp"]) if lim is None else lim) - (tp_out - float(T["tp"])) - 0.3 * (attempt + 1)
    print("%s  in %.1f LUFS -> out %s LUFS, true peak %s dBTP (target %s / %s)%s%s" % (
        a.dst, float(meas["input_i"]), lu_out or "?", "?" if tp_out is None else "%.1f" % tp_out, T["lufs"], T["tp"],
        "" if a.no_fade else ", fade-out %.1f s" % a.fade, ", limiter %.1f dB" % lim if lim is not None else ""))
    if tp_out is None or tp_out > float(T["tp"]) + 0.05:
        die("true peak %s dBTP still above target %s after 4 passes" % (tp_out, T["tp"]), 1)


if __name__ == "__main__":
    main()
