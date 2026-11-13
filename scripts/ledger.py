#!/usr/bin/env python3
"""ledger.py - remember what each film was made of, and refuse to make the same film twice.

Usage:
  python ledger.py check   --brand B [--concept X --opening X --transition X --camera X --type X --palette X --texture X --track X --exit X]
  python ledger.py add     --brand B --film NAME [same axes]           (runs check first; --force records a repeat on purpose)
  python ledger.py verdict --film NAME --verdict approved|rejected [--note "what the viewer said"]
  python ledger.py list    [--brand B] [--last 10]
  python ledger.py suggest [--brand B]                                 (values not used yet, per axis)
Ledger file: --ledger PATH, else $MOTIONPROOF_LEDGER, else ./motion-ledger.jsonl (one JSON object per line; keep it in the project).

A combination is REJECTED (exit 1) when, against films of the same brand:
  1. the track equals one of the last 3 films' tracks;
  2. the concept or the exit equals the last film's;
  3. half or more of the filled axes equal any of the last 5 films;
  4. half or more of the filled axes equal any film with verdict "rejected" (ever, any brand).
Values are compared case-insensitively after trimming. Exit: 0 ok, 1 rejected, 2 bad usage.
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import sys

AXES = ["concept", "opening", "transition", "camera", "type", "palette", "texture", "track", "exit"]
VOCAB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "vocabulary.json")


def norm(v):
    return (v or "").strip().lower()


def read(path):
    rows = []
    if os.path.isfile(path):
        with open(path, encoding="utf-8") as f:
            for i, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    print("warn: %s line %d is not JSON, skipped" % (path, i), file=sys.stderr)
    return rows


def write(path, rows):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    os.replace(tmp, path)


def overlap(a, b):
    filled = [k for k in AXES if norm(a.get(k))]
    if not filled:
        return 0.0, []
    same = [k for k in filled if norm(a.get(k)) == norm(b.get(k))]
    return len(same) / len(filled), same


def check(rows, cand):
    """-> list of reasons (empty = accepted)."""
    brand = norm(cand.get("brand"))
    mine = [r for r in rows if norm(r.get("brand")) == brand]
    why = []
    t = norm(cand.get("track"))
    if t:
        for r in mine[-3:]:
            if norm(r.get("track")) == t:
                why.append("track '%s' was used by %s (one of the last 3)" % (cand["track"], r.get("film")))
                break
    if mine:
        last = mine[-1]
        for k in ("concept", "exit"):
            if norm(cand.get(k)) and norm(cand.get(k)) == norm(last.get(k)):
                why.append("%s '%s' repeats the last film (%s)" % (k, cand[k], last.get("film")))
    for r in mine[-5:]:
        share, same = overlap(cand, r)
        if share >= 0.5:
            why.append("%.0f%% of the axes repeat %s: %s" % (share * 100, r.get("film"), ", ".join(same)))
    for r in rows:
        if r.get("verdict") == "rejected":
            share, same = overlap(cand, r)
            if share >= 0.5:
                why.append("%.0f%% of the axes match rejected film %s (%s)%s" % (share * 100, r.get("film"), ", ".join(same),
                           ": " + r["note"] if r.get("note") else ""))
    return why


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["check", "add", "verdict", "list", "suggest"])
    ap.add_argument("--ledger", default=os.environ.get("MOTIONPROOF_LEDGER", "motion-ledger.jsonl"))
    ap.add_argument("--brand")
    ap.add_argument("--film")
    ap.add_argument("--verdict", choices=["approved", "rejected"])
    ap.add_argument("--note")
    ap.add_argument("--last", type=int, default=10)
    ap.add_argument("--force", action="store_true")
    for k in AXES:
        ap.add_argument("--" + k)
    a = ap.parse_args()
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except AttributeError:
        pass
    rows = read(a.ledger)
    cand = {k: getattr(a, k) for k in AXES if getattr(a, k)}

    if a.cmd in ("check", "add"):
        if not a.brand:
            print("error: --brand is required", file=sys.stderr); sys.exit(2)
        cand["brand"] = a.brand
        if len(cand) < 3:
            print("error: give at least two axes (e.g. --concept and --track)", file=sys.stderr); sys.exit(2)
        why = check(rows, cand)
        for w in why:
            print("REPEAT  " + w)
        if a.cmd == "check" or (why and not a.force):
            print("REJECTED" if why else "OK: nothing repeats")
            sys.exit(1 if why else 0)
        if not a.film:
            print("error: add needs --film", file=sys.stderr); sys.exit(2)
        if any(r.get("film") == a.film for r in rows):
            print("error: film '%s' is already in the ledger" % a.film, file=sys.stderr); sys.exit(2)
        cand.update(film=a.film, date=datetime.date.today().isoformat(), forced=bool(why) or None)
        rows.append({k: v for k, v in cand.items() if v is not None})
        write(a.ledger, rows)
        print("recorded %s in %s%s" % (a.film, a.ledger, " (repeat forced)" if why else ""))
    elif a.cmd == "verdict":
        if not a.film or not a.verdict:
            print("error: verdict needs --film and --verdict", file=sys.stderr); sys.exit(2)
        hit = [r for r in rows if r.get("film") == a.film]
        if not hit:
            print("error: film '%s' not in the ledger" % a.film, file=sys.stderr); sys.exit(2)
        hit[0]["verdict"] = a.verdict
        if a.note:
            hit[0]["note"] = a.note
        write(a.ledger, rows)
        print("%s: %s" % (a.film, a.verdict))
    elif a.cmd == "list":
        sel = [r for r in rows if not a.brand or norm(r.get("brand")) == norm(a.brand)][-a.last:]
        for r in sel:
            print("%s  %-18s %-10s %s" % (r.get("date", "?"), r.get("film"), r.get("verdict", "-"), "  ".join("%s=%s" % (k, r[k]) for k in AXES if r.get(k))))
        if not sel:
            print("ledger empty")
    else:
        with open(VOCAB, encoding="utf-8") as f:
            vocab = json.load(f)
        mine = [r for r in rows if not a.brand or norm(r.get("brand")) == norm(a.brand)]
        for k in AXES:
            used = {norm(r.get(k)) for r in mine if r.get(k)}
            free = [v for v in vocab.get(k, []) if norm(v) not in used]
            print("%-11s used: %s" % (k, ", ".join(sorted(used)) or "-"))
            print("%-11s free: %s" % ("", ", ".join(free) or "(add values to data/vocabulary.json or invent one)"))


if __name__ == "__main__":
    main()
