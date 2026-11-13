#!/usr/bin/env node
// doctor.mjs - check the machine before a film: Node, Python, ffmpeg, a headless browser, free disk.
// Usage: node doctor.mjs [--min-free 20] [--json]
// Exit 0 = ready, 1 = something required is missing or the disk is too full.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { findBrowser, parseArgs } from './cdp.mjs';

let pos, opt;
try { ({ pos, opt } = parseArgs(process.argv.slice(2), { 'min-free': 's', json: 'bool', help: 'bool' })); }
catch (e) { console.error('error: ' + e.message); process.exit(2); }
if (opt.help) { console.log('node doctor.mjs [--min-free GB] [--json]'); process.exit(0); }
const minFree = Number(opt['min-free'] ?? 20);

const ver = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: false });
  return r.status === 0 ? (r.stdout || r.stderr).split('\n')[0].trim() : null;
};
const python = ['python3', 'python', 'py'].map((c) => [c, ver(c, ['--version'])]).find(([, v]) => v && /Python 3/.test(v));
const nodeMajor = Number(process.versions.node.split('.')[0]);
let freeGB = null;
try { const s = fs.statfsSync(process.cwd()); freeGB = +(s.bavail * s.bsize / 1e9).toFixed(1); } catch {}

const checks = [
  { name: 'node >= 22', ok: nodeMajor >= 22, detail: process.versions.node, required: true },
  { name: 'python 3', ok: !!python, detail: python ? python[0] + ' (' + python[1] + ')' : 'not found', required: true },
  { name: 'ffmpeg', ok: !!ver('ffmpeg', ['-version']), detail: ver('ffmpeg', ['-version']) || 'not found', required: true },
  { name: 'ffprobe', ok: !!ver('ffprobe', ['-version']), detail: ver('ffprobe', ['-version']) ? 'ok' : 'not found', required: true },
  { name: 'browser (HTML films only)', ok: !!findBrowser(), detail: findBrowser() || 'not found: set CHROME_PATH', required: false },
  { name: 'free disk >= ' + minFree + ' GB', ok: freeGB === null || freeGB >= minFree, detail: freeGB === null ? 'unknown' : freeGB + ' GB', required: true },
];
const ready = checks.every((c) => c.ok || !c.required);
if (opt.json) console.log(JSON.stringify({ platform: os.platform(), ready, checks }, null, 1));
else {
  for (const c of checks) console.log((c.ok ? '  ok    ' : c.required ? '  MISS  ' : '  opt   ') + c.name.padEnd(28) + c.detail);
  console.log(ready ? 'READY' : 'NOT READY');
}
process.exit(ready ? 0 : 1);
