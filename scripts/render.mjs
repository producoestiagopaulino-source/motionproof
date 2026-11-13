#!/usr/bin/env node
// render.mjs - render an HTML film frame by frame (seek, screenshot, ffmpeg). Works with kit.js, HyperFrames/GSAP timelines,
// plain GSAP and CSS/WAAPI animations (see cdp.mjs PAGE_HELPERS for the seek order).
//
// Usage:
//   node render.mjs <film.html> <out.mp4> [--fps 30] [--width W --height H] [--from S --to S] [--duration S]
//                   [--scale 0.5] [--audio mix.wav] [--crf 18]
//   node render.mjs <film.html> --still 0.5,2,4 [--out stills]      PNG stills at those seconds
// Size comes from --width/--height, else data-width/data-height on [data-composition-id], else 1920x1080.
// window.__events (cuts) is written to <out.mp4>.events.json for review.py.
// Exit: 0 ok, 1 failure, 2 bad usage.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launch, parseArgs, toUrl, PAGE_HELPERS } from './cdp.mjs';

let pos, opt;
try {
  ({ pos, opt } = parseArgs(process.argv.slice(2), { fps: 's', width: 's', height: 's', from: 's', to: 's', duration: 's', scale: 's',
    audio: 's', crf: 's', still: 's', out: 's', help: 'bool' }));
} catch (e) { console.error('error: ' + e.message); process.exit(2); }
if (opt.help || !pos[0] || (!pos[1] && !opt.still)) { console.log('node render.mjs <film.html> <out.mp4> [options] | --still t,t [--out dir]'); process.exit(opt.help ? 0 : 2); }
const num = (v, d) => { if (v === undefined) return d; const n = Number(v); if (!Number.isFinite(n)) { console.error('error: not a number: ' + v); process.exit(2); } return n; };
const fps = num(opt.fps, 30), scale = num(opt.scale, 1), crf = num(opt.crf, 18);
if (opt.audio && !fs.existsSync(opt.audio)) { console.error('error: audio not found: ' + opt.audio); process.exit(2); }

let br, code = 0;
try {
  const url = toUrl(pos[0]);
  br = await launch({ width: 1920, height: 1080 });
  const { page } = br;
  await page.goto(url);
  await page.eval(PAGE_HELPERS);
  await page.eval('window.__mpPrepare()');
  const info = await page.eval('window.__mpInfo()');
  const W = num(opt.width, info.width || 1920), H = num(opt.height, info.height || 1080);
  const dur = num(opt.duration, info.duration || 0);
  if (!(dur > 0)) throw new Error('duration unknown: set window.__duration or pass --duration');
  await page.viewport(Math.round(W), Math.round(H));
  if (scale !== 1) await page.cmd('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: scale, mobile: false });

  if (opt.still) {
    const dir = path.resolve(opt.out || 'stills'); fs.mkdirSync(dir, { recursive: true });
    for (const t of opt.still.split(',').map(Number).filter((n) => Number.isFinite(n) && n >= 0)) {
      await page.eval(`window.__mpSeek(${t})`);
      const f = path.join(dir, 'still-' + t.toFixed(2).replace('.', '_') + '.png');
      fs.writeFileSync(f, await page.shot('png'));
      console.log(f);
    }
  } else {
    const out = path.resolve(pos[1]);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const t0 = num(opt.from, 0), t1 = Math.min(num(opt.to, dur), dur);
    const n = Math.max(1, Math.round((t1 - t0) * fps));
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-'];
    if (opt.audio) args.push('-ss', String(t0), '-t', String(t1 - t0), '-i', opt.audio);
    args.push('-vf', `scale=${Math.round(W * scale / 2) * 2}:${Math.round(H * scale / 2) * 2}`, '-c:v', 'libx264', '-preset', 'medium',
      '-crf', String(crf), '-pix_fmt', 'yuv420p', '-r', String(fps));
    if (opt.audio) args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest');
    args.push('-movflags', '+faststart', out);
    const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'pipe'] });
    let ffErr = ''; ff.stderr.on('data', (d) => { ffErr += d; });
    const done = new Promise((res) => ff.on('close', res));
    const started = Date.now();
    for (let i = 0; i < n; i++) {
      await page.eval(`window.__mpSeek(${t0 + i / fps})`);
      const buf = await page.shot('jpeg', 92);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (i % 30 === 0) process.stderr.write(`\rframe ${i + 1}/${n}`);
    }
    ff.stdin.end();
    const rc = await done;
    process.stderr.write('\n');
    if (rc !== 0) throw new Error('ffmpeg failed: ' + ffErr.slice(-800));
    const events = await page.eval('Array.isArray(window.__events) ? window.__events : []');
    if (events.length) fs.writeFileSync(out + '.events.json', JSON.stringify(events.filter((e) => e.t >= t0 && e.t <= t1).map((e) => ({ ...e, t: +(e.t - t0).toFixed(4) })), null, 1));
    const secs = (Date.now() - started) / 1000;
    console.log(`${out}  ${n} frames  ${W}x${H}@${fps}  ${secs.toFixed(1)} s (${(n / secs).toFixed(1)} fps)`);
  }
} catch (e) { console.error('error: ' + e.message); code = 1; }
finally { if (br) await br.close(); }
process.exit(code);
