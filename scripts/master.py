#!/usr/bin/env python3
"""master.py - bring a film's soundtrack to a delivery target and fade it out, video stream copied untouched.

Usage:
  python master.py in.mp4 out.mp4 [--target reels|tiktok|shorts|youtube|web|podcast|broadcast] [--fade 1.0] [--no-fade]
  python master.py in.wav out.wav [...]            audio-only files work the same way

Two-pass ffmpeg loudnorm (linear) to the target's integrated LUFS and true peak (data/targets.json), then a fade-out over the
last --fade seconds (default 1.0; 0.8-1.5 reads as an ending, shorter reads as a cut). Prints the measured result.
Exit: 0 ok, 1 ffmpeg failure, 2 bad usage.
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
    chain = second + ",aresample=48000"
    if not a.no_fade and a.fade > 0:
        chain += ",afade=t=out:st=%.3f:d=%.3f" % (max(0.0, dur - a.fade), min(a.fade, dur))
    args = ["-y", "-i", a.src, "-af", chain]
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
    print("%s  in %.1f LUFS -> out %s LUFS, true peak %s dBTP (target %s / %s)%s" % (
        a.dst, float(meas["input_i"]), lu.group(1) if lu else "?", tp.group(1) if tp else "?", T["lufs"], T["tp"],
        "" if a.no_fade else ", fade-out %.1f s" % a.fade))


if __name__ == "__main__":
    main()
