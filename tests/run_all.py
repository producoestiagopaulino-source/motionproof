#!/usr/bin/env python3
"""run_all.py - offline test suite. Builds video fixtures with ffmpeg (lavfi, no fonts, no network) in a temp folder,
runs every script on them and on tests/fixtures/*.html, checks exit codes and key lines, then deletes the temp folder.

Usage: python tests/run_all.py [--keep] [--skip-browser]
Browser tests are skipped (not failed) when no Chrome or Edge is found. Exit 0 = all passed.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = os.path.join(ROOT, "scripts")
FX = os.path.join(ROOT, "tests", "fixtures")
PY = sys.executable
results = []


def sh(args, cwd=None):
    r = subprocess.run(args, capture_output=True, text=True, cwd=cwd, encoding="utf-8", errors="replace")
    return r.returncode, r.stdout + r.stderr


def expect(name, args, code, must=None, cwd=None):
    rc, out = sh(args, cwd)
    ok = rc == code and (must is None or re.search(must, out, re.M) is not None)
    results.append((name, ok))
    print("%s  %s" % ("PASS" if ok else "FAIL", name))
    if not ok:
        print("      exit %d (wanted %d)%s\n      %s" % (rc, code, "" if must is None else ", wanted /%s/" % must, out.strip().replace("\n", "\n      ")[-1500:]))
    return out


def ff(*args):
    rc, out = sh(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"] + list(args))
    if rc:
        raise SystemExit("fixture build failed: " + out[-500:])


def build(tmp):
    s = "540x960"
    j = lambda n: os.path.join(tmp, n)
    enc = ["-c:v", "libx264", "-pix_fmt", "yuv420p"]

    def mover(name, dur, x, y="420+40*cos(t*2)", post="", audio=None, color="0xff8a00"):
        """A 140 px square moving on a dark ground (overlay evaluates x/y per frame), optional extra filters and a sine soundtrack."""
        g = ("color=c=0x101828:s=%s:d=%s:r=30[bg];color=c=%s:s=140x140:r=30:d=%s[b];[bg][b]overlay=x='%s':y='%s':shortest=1%s[v]"
             % (s, dur, color, dur, x, y, ("," + post) if post else ""))
        args = ["-filter_complex", g, "-map", "[v]"]
        if audio:
            args = ["-f", "lavfi", "-i", "sine=f=%d:d=%s:sample_rate=48000" % (audio[0], dur)] + args + ["-map", "0:a", "-af", audio[1], "-c:a", "aac"]
        ff(*(args + enc + [j(name)]))

    wave = "200+60*sin(t*3)"
    mover("good-raw.mp4", 4, wave, audio=(220, "volume=-6dB"))
    mover("silent.mp4", 4, wave)
    mover("hold.mp4", 4, "if(lt(t,1),100+300*t,400)", y="420")                                   # moves 1 s, then sits 3 s
    mover("freeze.mp4", 5, "if(lt(t,1),100+200*t,if(lt(t,3.6),300,300+200*(t-3.6)))", y="420")    # frozen 1-3.6 s
    marks = ",".join("drawbox=x=%d:y=40:w=5:h=34:color=white:t=fill" % (60 + 13 * k) for k in range(30))
    mover("edge.mp4", 4, wave, post=marks)                                                        # text-like marks in the top margin
    mover("loud.mp4", 4, wave, audio=(440, "volume=12dB,alimiter=limit=1:level=false"))
    ff("-f", "lavfi", "-i", "color=c=black:s=%s:d=3:r=30" % s, *enc, j("black.mp4"))
    # full-frame black/white alternation at 5 Hz (10 transitions per second)
    ff("-f", "lavfi", "-i", "color=c=black:s=%s:d=3:r=30,geq=lum='if(lt(mod(N\\,6)\\,3)\\,16\\,235)':cb=128:cr=128" % s, *enc, j("flash.mp4"))
    return j


def main():
    keep = "--keep" in sys.argv
    tmp = tempfile.mkdtemp(prefix="motionproof-test-")
    try:
        j = build(tmp)
        rv = lambda f, *extra: [PY, os.path.join(S, "review.py"), j(f), "--out", j(f + "-r")] + list(extra)
        expect("review: black film fails R1", rv("black.mp4"), 1, r"^R1 render\s+FAIL")
        expect("review: long end hold fails R3", rv("hold.mp4"), 1, r"^R3 ending\s+FAIL")
        expect("review: mid-film freeze fails R2", rv("freeze.mp4"), 1, r"^R2 dead air\s+FAIL.*frozen")
        expect("review: 5 Hz flashing fails R4", rv("flash.mp4"), 1, r"^R4 flashes\s+FAIL")
        expect("review: marks in top margin warn R5", rv("edge.mp4"), 0, r"^R5 safe zones \(reels\)\s+WARN.*top")
        expect("review: --strict-zones turns R5 into FAIL", rv("edge.mp4", "--strict-zones"), 1, r"^R5 .*FAIL")
        expect("review: clean mover passes", rv("silent.mp4", "--expect", "4", "--exit-required"), 0, r"^RESULT PASS")
        expect("review: wrong --expect fails R1", rv("silent.mp4", "--expect", "5"), 1, r"duration .* expected")
        expect("review: --expect-audio without sound fails", rv("silent.mp4", "--expect-audio"), 1, r"^R6 sound\s+FAIL")
        expect("review: loud soundtrack fails R6", rv("loud.mp4"), 1, r"^R6 sound \(reels\)\s+FAIL")
        expect("review: unfaded soundtrack fails --fade-required", rv("good-raw.mp4", "--fade-required"), 1, r"no fade-out")
        expect("master: normalise and fade", [PY, os.path.join(S, "master.py"), j("good-raw.mp4"), j("good.mp4"), "--target", "reels"], 0, r"out -1[3-5]\.\d LUFS")
        expect("review: mastered film passes R6 with fade", rv("good.mp4", "--expect-audio", "--fade-required", "--expect", "4"), 0, r"^R6 sound \(reels\)\s+PASS")
        prof = j("profile.json")
        with open(prof, "w", encoding="utf-8") as f:
            json.dump({"exit_required": True, "fade_required": True, "expect_audio": True}, f)
        expect("review: profile applies defaults", rv("silent.mp4", "--profile", prof), 1, r"^R6 sound\s+FAIL")
        rep = json.load(open(j("good.mp4-r") + os.sep + "report.json", encoding="utf-8"))
        ok = rep["result"] == "PASS" and os.path.isfile(rep["sheet"])
        results.append(("review: report.json and sheet.jpg written", ok)); print("%s  review: report.json and sheet.jpg written" % ("PASS" if ok else "FAIL"))

        expect("beats: grid", [PY, os.path.join(S, "beats.py"), "grid", "--bpm", "120", "--fps", "30", "--duration", "2"], 0, r"beat\s+4\s+2\.000 s\s+frame\s+60")
        expect("beats: check", [PY, os.path.join(S, "beats.py"), "check", "--bpm", "120", "--fps", "30", "--cuts", "1.0,1.27"], 0, r"1 of 2 cuts")

        led = j("ledger.jsonl")
        L = lambda *a: [PY, os.path.join(S, "ledger.py"), a[0], "--ledger", led] + list(a[1:])
        expect("ledger: first film accepted", L("add", "--brand", "acme", "--film", "f1", "--concept", "countdown", "--track", "t1", "--exit", "iris-on-logo", "--transition", "match-cut"), 0, r"recorded f1")
        expect("ledger: same track rejected", L("check", "--brand", "acme", "--concept", "map-or-plan", "--track", "t1", "--exit", "curtain"), 1, r"track 't1'")
        expect("ledger: same concept as last rejected", L("check", "--brand", "acme", "--concept", "Countdown ", "--track", "t2"), 1, r"concept")
        expect("ledger: half the axes repeat rejected", L("check", "--brand", "acme", "--concept", "map-or-plan", "--track", "t9", "--exit", "iris-on-logo", "--transition", "match-cut"), 1, r"50% of the axes")
        expect("ledger: new combination accepted", L("add", "--brand", "acme", "--film", "f2", "--concept", "map-or-plan", "--track", "t2", "--exit", "curtain", "--transition", "whip-pan"), 0, r"recorded f2")
        expect("ledger: other brand is independent", L("check", "--brand", "other", "--concept", "countdown", "--track", "t1"), 0, r"OK")
        expect("ledger: verdict", L("verdict", "--film", "f2", "--verdict", "rejected", "--note", "too busy"), 0, r"rejected")
        expect("ledger: rejected combo blocked for any brand", L("check", "--brand", "other", "--concept", "map-or-plan", "--exit", "curtain"), 1, r"rejected film f2")
        expect("ledger: suggest", L("suggest", "--brand", "acme"), 0, r"free: .*single-held-shot")

        tokens = json.load(open(os.path.join(ROOT, "data", "tokens.json"), encoding="utf-8"))["curves"]
        zones = json.load(open(os.path.join(ROOT, "data", "zones.json"), encoding="utf-8"))
        kit = open(os.path.join(ROOT, "templates", "kit.js"), encoding="utf-8").read()
        ts = open(os.path.join(ROOT, "adapters", "remotion", "motionproof.ts"), encoding="utf-8").read()
        num = lambda v: [float(x) for x in v]
        drift = []
        for k, v in tokens.items():
            m = re.search(r"\b%s: \[([^\]]+)\]" % k, kit)
            if not m or num(m.group(1).split(",")) != num(v["bezier"]):
                drift.append("kit.js " + k)
            m = re.search(r"\b%s: \{ bezier: \[([^\]]+)\], frames: (\d+)" % k, ts)
            if not m or num(m.group(1).split(",")) != num(v["bezier"]) or int(m.group(2)) != v["frames"]:
                drift.append("motionproof.ts " + k)
        for k, v in zones.items():
            if k.startswith("_"):
                continue
            m = re.search(r"\b%s: \{ top: ([\d.]+), bottom: ([\d.]+), left: ([\d.]+), right: ([\d.]+) \}" % k, ts)
            if not m or num(m.groups()) != num([v["top"], v["bottom"], v["left"], v["right"]]):
                drift.append("motionproof.ts zone " + k)
        results.append(("tokens: kit.js and Remotion adapter match data/", not drift))
        print("%s  tokens: kit.js and Remotion adapter match data/%s" % ("PASS" if not drift else "FAIL", "" if not drift else " " + ", ".join(drift)))
        expect("remotion adapter runs under node", ["node", "-e", "import('./adapters/remotion/motionproof.ts').then(m=>{const b=m.safeBox('reels',1080,1920);if(b.left!==130||m.minFontPx(1080,1920)!==34||Math.abs(m.ease('linear')(0.5)-0.5)>1e-4)process.exit(1);console.log('ok')})"], 0, r"ok", cwd=ROOT)

        expect("doctor runs", ["node", os.path.join(S, "doctor.mjs"), "--min-free", "0"], 0, r"READY")
        rc, out = sh(["node", "-e", "import('./scripts/cdp.mjs').then(m=>console.log(m.findBrowser()||''))"], cwd=ROOT)
        if "--skip-browser" in sys.argv or not out.strip():
            print("SKIP  browser tests (%s)" % ("--skip-browser" if "--skip-browser" in sys.argv else "no Chrome or Edge found"))
        else:
            P = lambda f, *a: ["node", os.path.join(S, "probe.mjs"), os.path.join(FX, f), "--samples", "4"] + list(a)
            expect("probe: good text passes", P("good.html"), 0, r"GATE probe: PASS")
            expect("probe: small text fails L1", P("small.html"), 1, r"^L1 .*FAIL")
            expect("probe: low contrast fails L2", P("contrast.html"), 1, r"^L2 .*FAIL")
            expect("probe: text under platform UI fails L3", P("unsafe.html"), 1, r"^L3 .*FAIL")
            expect("probe: text cut by the frame fails L4", P("clipped.html"), 1, r"^L4 .*FAIL")
            expect("probe: text shown 0.3 s fails L5", P("short.html"), 1, r"^L5 .*FAIL")
            expect("probe: counter label warns W2", P("chrome.html"), 0, r"^W2 .*WARN")
            expect("probe: data-diegetic silences W2", P("diegetic.html"), 0, r"^W2 .*PASS")
            expect("probe: zones=none ignores margins", P("unsafe.html", "--zones", "none"), 0, r"GATE probe: PASS")
            out_mp4 = j("template.mp4")
            expect("render: template to mp4", ["node", os.path.join(S, "render.mjs"), os.path.join(ROOT, "templates", "film.html"), out_mp4], 0, r"180 frames\s+1080x1920@30")
            expect("render: stills", ["node", os.path.join(S, "render.mjs"), os.path.join(ROOT, "templates", "film.html"), "--still", "0.5,3", "--out", j("stills")], 0, r"still-3_00\.png")
            expect("review: rendered template passes with events", rv("template.mp4", "--expect", "6", "--exit-required"), 0, r"cuts \(events\): 2\.00, 4\.00")
            expect("probe: template passes", ["node", os.path.join(S, "probe.mjs"), os.path.join(ROOT, "templates", "film.html")], 0, r"GATE probe: PASS")
    finally:
        if keep:
            print("kept " + tmp)
        else:
            shutil.rmtree(tmp, ignore_errors=True)
    bad = [n for n, ok in results if not ok]
    print("\n%d passed, %d failed" % (len(results) - len(bad), len(bad)))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
