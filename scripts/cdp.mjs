// cdp.mjs - tiny DevTools Protocol client for headless Chrome or Edge. Node 22+ (global WebSocket), no npm packages.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function findBrowser() {
  const env = process.env.CHROME_PATH || process.env.BROWSER_PATH;
  if (env && fs.existsSync(env)) return env;
  const local = process.env.LOCALAPPDATA || '';
  const pf = process.env.PROGRAMFILES || 'C:\\Program Files';
  const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  const list = process.platform === 'win32' ? [
    path.join(pf, 'Google/Chrome/Application/chrome.exe'),
    path.join(pf86, 'Google/Chrome/Application/chrome.exe'),
    path.join(local, 'Google/Chrome/Application/chrome.exe'),
    path.join(pf86, 'Microsoft/Edge/Application/msedge.exe'),
    path.join(pf, 'Microsoft/Edge/Application/msedge.exe'),
  ] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ] : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  return list.find((p) => fs.existsSync(p)) || null;
}

export function toUrl(src) {
  if (/^(https?|file):/i.test(src)) return src;
  if (!fs.existsSync(src)) throw new Error('input not found: ' + src);
  return pathToFileURL(path.resolve(src)).href;
}

export async function launch({ width = 1920, height = 1080 } = {}) {
  const exe = findBrowser();
  if (!exe) throw new Error('no Chrome or Edge found; set CHROME_PATH');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motionproof-'));
  const proc = spawn(exe, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + dir, '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars', '--mute-audio', '--allow-file-access-from-files', '--force-device-scale-factor=1',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--font-render-hinting=none', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const to = setTimeout(() => reject(new Error('browser did not start in 30 s')), 30000);
    proc.stderr.on('data', (d) => {
      buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m) { clearTimeout(to); resolve(m[1]); }
    });
    proc.on('exit', (c) => { clearTimeout(to); reject(new Error('browser exited with code ' + c)); });
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('cannot connect to ' + wsUrl)); });
  let id = 0; const wait = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && wait.has(m.id)) { const { res, rej } = wait.get(m.id); wait.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const i = ++id; wait.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const cmd = (m, p) => send(m, p, sessionId);
  await cmd('Page.enable'); await cmd('Runtime.enable');
  const page = {
    cmd,
    async viewport(w, h) { await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); },
    async goto(url) {
      await cmd('Page.navigate', { url });
      for (let i = 0; i < 300; i++) { if (await page.eval('document.readyState') === 'complete') return; await new Promise((r) => setTimeout(r, 100)); }
      throw new Error('page did not load in 30 s');
    },
    async eval(expr) {
      const r = await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('page error: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    },
    async shot(format = 'jpeg', quality = 92) {
      const r = await cmd('Page.captureScreenshot', { format, ...(format === 'jpeg' ? { quality } : {}), fromSurface: true });
      return Buffer.from(r.data, 'base64');
    },
  };
  await page.viewport(width, height);
  const close = async () => {
    try { ws.close(); } catch {}
    try { proc.kill(); } catch {}
    await new Promise((r) => setTimeout(r, 300));
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  };
  return { page, close };
}

// Installed in the page: one seek that works for the kit runtime, HyperFrames/GSAP timelines, plain GSAP and CSS/WAAPI animations.
export const PAGE_HELPERS = String.raw`(() => {
  const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__mpInfo = () => {
    const main = document.querySelector('[data-composition-id]');
    const tls = window.__timelines && typeof window.__timelines === 'object' ? window.__timelines : null;
    let d = null;
    if (typeof window.__duration === 'number') d = window.__duration;
    else if (main && parseFloat(main.getAttribute('data-duration')) > 0) d = parseFloat(main.getAttribute('data-duration'));
    else if (tls && tls.main && tls.main.duration) d = tls.main.duration();
    else if (window.gsap && gsap.globalTimeline) d = gsap.globalTimeline.duration();
    const w = main ? parseInt(main.getAttribute('data-width')) : 0, h = main ? parseInt(main.getAttribute('data-height')) : 0;
    return { duration: d, width: w || null, height: h || null,
      seek: typeof window.__seek === 'function' ? '__seek' : tls && Object.keys(tls).length ? '__timelines' : window.gsap ? 'gsap' : 'waapi' };
  };
  window.__mpPrepare = async () => {
    try { await document.fonts.ready; } catch (e) {}
    await Promise.all([...document.images].map((i) => i.decode ? i.decode().catch(() => 0) : 0));
    if (window.__ready && typeof window.__ready.then === 'function') await window.__ready;
    for (const m of document.querySelectorAll('audio,video')) { m.muted = true; try { m.pause(); } catch (e) {} }
    return true;
  };
  window.__mpSeek = async (t) => {
    if (typeof window.__seek === 'function') await window.__seek(t);
    else if (window.__timelines && Object.keys(window.__timelines).length) {
      const names = Object.keys(window.__timelines).sort((a, b) => (a === 'main') - (b === 'main'));
      for (const n of names) { const tl = window.__timelines[n]; if (tl && tl.seek) { if (tl.pause) tl.pause(); tl.seek(t, false); } }
    } else if (window.gsap && gsap.globalTimeline) { gsap.globalTimeline.pause(); gsap.globalTimeline.seek(t, false); }
    for (const a of document.getAnimations ? document.getAnimations() : []) { try { a.pause(); a.currentTime = t * 1000; } catch (e) {} }
    await Promise.all([...document.querySelectorAll('video')].map((v) => new Promise((res) => {
      const target = Math.max(0, t - (parseFloat(v.dataset.start) || 0));
      if (Math.abs(v.currentTime - target) < 0.001) return res();
      const to = setTimeout(res, 3000); v.addEventListener('seeked', () => { clearTimeout(to); res(); }, { once: true }); v.currentTime = target;
    })));
    await raf2();
    return true;
  };
  return true;
})()`;

export function parseArgs(argv, spec) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const k = a.slice(2);
    if (!(k in spec)) throw new Error('unknown option ' + a);
    opt[k] = spec[k] === 'bool' ? true : argv[++i];
    if (opt[k] === undefined) throw new Error(a + ' needs a value');
  }
  return { pos, opt };
}
