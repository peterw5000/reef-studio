// Builds index.html (the packed, shippable page) from the readable reef-studio.html.
// Same features and detail; only whitespace, comments and local names shrink.
// Usage: npm run build   (or: node scripts/build.mjs [--plain])
import { minify } from 'terser';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'reef-studio.html');
const out = path.join(root, 'index.html');
let html = fs.readFileSync(src, 'utf8');

// 1. JavaScript module
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
let js = m[1];
// GLSL lives in template strings. Shrink it: comments, line breaks (kept around #directives),
// spaces next to operators, and float literals (0.50 -> .5, 2.0 -> 2.). ${...} parts are left untouched.
const isGLSL = b => /\b(vec[234]|mat[34]|float|uniform|varying|gl_\w+|void main)\b|#include|#ifdef|#define/.test(b);
function glslMin(body) {
  const holes = [];
  let s = body.replace(/\$\{[^}]*\}/g, h => '\u0001' + (holes.push(h) - 1) + '\u0001');
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
  const out = []; let cur = '';
  for (let line of s.split('\n')) {
    line = line.trim(); if (!line) continue;
    if (line[0] === '#') { if (cur) out.push(cur); cur = ''; out.push(line.replace(/\s+/g, ' ')); continue; }
    cur += (cur ? ' ' : '') + line;
  }
  if (cur) out.push(cur);
  s = out.map(l => l[0] === '#' ? l : l
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}()\[\];,=*/<>!&|?:^%])\s*/g, '$1')
    .replace(/(?<![+-])\s*([+-])\s*(?![+-])/g, '$1')
    .replace(/(\d+\.\d*?)0+\b(?![.\w])/g, '$1')
    .replace(/(?<![\w.])0\.(\d)/g, '.$1')
  ).join('\n');
  // pieces get glued to other shader text, so a directive must keep its line breaks at either end
  if (out.length && out[0][0] === '#') s = '\n' + s;
  if (out.length && out[out.length - 1][0] === '#') s += '\n';
  else if (/\n\s*$/.test(body) && /\u0001\d+\u0001$/.test(out[out.length - 1] || '')) s += '\n';
  return s.replace(/\u0001(\d+)\u0001/g, (_, i) => holes[+i]);
}
let glslIn = 0, glslOut = 0;
js = js.replace(/`([^`]*)`/g, (all, body) => {
  if (!isGLSL(body)) return all;
  const m2 = glslMin(body); glslIn += body.length; glslOut += m2.length; return '`' + m2 + '`';
});
const res = await minify(js, { module: true, ecma: 2020, compress: { passes: 3 }, mangle: true, format: { comments: false } });
console.log(`shaders  ${(glslIn / 1024).toFixed(1)} KB -> ${(glslOut / 1024).toFixed(1)} KB`);
html = html.replace(m[0], () => '<script type="module">' + res.code + '</script>');

// 2. CSS
html = html.replace(/<style>([\s\S]*?)<\/style>/, (_, css) => '<style>' + css
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}').trim() + '</style>');

// 3. HTML whitespace between tags (outside <script>)
html = html.replace(/(<script[\s\S]*?<\/script>)|>\s+</g, (all, script) => script ? script : '><');

// 4. Pack: store the module compressed (deflate-raw, base64) and unpack it at load with DecompressionStream.
//    Same code runs; the file on disk is about half the size. `--plain` skips this step.
const plain = html;
if (!process.argv.includes('--plain')) {
  const mod = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  const b64 = zlib.deflateRawSync(Buffer.from(mod[1], 'utf8'), { level: 9, memLevel: 9 }).toString('base64');
  const boot = `<script type="module">const s=document.createElement('script');s.type='module';s.textContent=await new Response(new Blob([Uint8Array.from(atob("${b64}"),c=>c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();document.body.append(s)</script>`;
  html = html.replace(mod[0], () => boot);
}

fs.writeFileSync(out, html);
const kb = b => (b / 1024).toFixed(1) + ' KB';
const a = fs.statSync(src).size, b = Buffer.byteLength(html), p = Buffer.byteLength(plain);
console.log(`source   ${kb(a)}  (gzip ${kb(zlib.gzipSync(fs.readFileSync(src)).length)})`);
console.log(`minified ${kb(p)}  (gzip ${kb(zlib.gzipSync(plain).length)})  → ${Math.round((1 - p / a) * 100)}% smaller`);
if (b !== p) console.log(`packed   ${kb(b)}  → ${Math.round((1 - b / a) * 100)}% smaller than source  (written to index.html)`);
