// Quick check: the packed page (index.html) and the readable source both load, build a reef and log no console errors.
// Needs Chrome, Edge or Chromium: set CHROME=/path/to/chrome if it is not found. Needs internet once, for three.js.
// Usage: npm run test:smoke
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guess = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const executablePath = guess.find(p => fs.existsSync(p));
if (!executablePath) { console.error('Chrome not found. Set the CHROME environment variable to its path.'); process.exit(2); }

const browser = await puppeteer.launch({ executablePath, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
let failed = false;
for (const file of ['index.html', 'reef-studio.html']) {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(pathToFileURL(path.join(root, file)).href + '?auto', { waitUntil: 'networkidle0', timeout: 90000 });
  let built = true;
  await page.waitForFunction(() => window.__ok, { timeout: 90000 }).catch(() => { built = false; });
  const ok = built && !errors.length;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${file}${built ? '' : '  (the reef never finished building)'}${errors.length ? '\n     ' + errors.join('\n     ') : ''}`);
  if (!ok) failed = true;
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
