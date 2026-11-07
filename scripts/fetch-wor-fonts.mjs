#!/usr/bin/env node
/**
 * Downloads the 29 Arabic reader fonts as local woff2 files so the ported
 * New-moon-2 reader renders identically OFFLINE inside the iOS WebView.
 *
 * For every family in the reader's font list (same Google query as the
 * original `worFonts.js`), we fetch the css2 stylesheet with a modern Chrome
 * UA (=> woff2 / variable-font responses), keep only the ARABIC and LATIN
 * unicode-range subsets, download them next to this script under
 * assets/reader/wor/fonts/, and emit assets/reader/wor/fontFaces.js — a
 * module that returns the @font-face CSS with a configurable URL prefix.
 *
 * Run once from the repo root:  node scripts/fetch-wor-fonts.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// value → google query, copied 1:1 from New-moon-2 src/reader/worFonts.js
const FONTS = [
  ['cairo', 'Cairo:wght@300;400;600;700;900'],
  ['tajawal', 'Tajawal:wght@300;400;500;700;900'],
  ['amiri', 'Amiri:wght@400;700'],
  ['noto-naskh-arabic', 'Noto+Naskh+Arabic:wght@400;500;600;700'],
  ['readex-pro', 'Readex+Pro:wght@300;400;500;600;700'],
  ['scheherazade-new', 'Scheherazade+New:wght@400;700'],
  ['changa', 'Changa:wght@300;400;500;600;700;800'],
  ['el-messiri', 'El+Messiri:wght@400;500;600;700'],
  ['harmattan', 'Harmattan:wght@400;500;600;700'],
  ['reem-kufi', 'Reem+Kufi:wght@400;500;600;700'],
  ['markazi-text', 'Markazi+Text:wght@400;500;600;700'],
  ['lateef', 'Lateef:wght@400;700'],
  ['mirza', 'Mirza:wght@400;700'],
  ['lalezar', 'Lalezar'],
  ['baloo-bhaijaan-2', 'Baloo+Bhaijaan+2:wght@400;500;600;700;800'],
  ['aref-ruqaa', 'Aref+Ruqaa:wght@400;700'],
  ['rakkas', 'Rakkas'],
  ['vazirmatn', 'Vazirmatn:wght@300;400;500;700;900'],
  ['almarai', 'Almarai:wght@300;400;700;800'],
  ['changa-one', 'Changa+One'],
  ['katibeh', 'Katibeh'],
  ['kufam', 'Kufam:wght@400;500;600;700;800;900'],
  ['mada', 'Mada:wght@300;400;500;600;700;800;900'],
  ['qahiri', 'Qahiri'],
  ['ruwudu', 'Ruwudu:wght@400;500;600;700'],
  ['noto-kufi-arabic', 'Noto+Kufi+Arabic:wght@300;400;500;600;700;800;900'],
  ['noto-sans-arabic', 'Noto+Sans+Arabic:wght@300;400;500;600;700;800;900'],
];

const OUT_DIR = path.resolve('assets/reader/wor/fonts');
const MOD_PATH = path.resolve('src/screens/reader/wor/engine/fontFaces.js');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Subsets worth bundling: Arabic for the novels, Latin for digits/names.
const KEEP_RANGE_HINTS = [/U\+0600-/, /U\+0000-00FF/i, /U\+0131/, /latin/i];

function parseFaces(css) {
  // Split into @font-face blocks with their preceding /* subset */ comment.
  const blocks = [];
  const re = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/gi;
  let m;
  while ((m = re.exec(css))) {
    blocks.push({ subset: m[1], body: m[2] });
  }
  return blocks;
}

function field(body, name) {
  const m = body.match(new RegExp(`${name}:\\s*([^;]+);`));
  return m ? m[1].trim() : undefined;
}

let totalBytes = 0;
const entries = [];

for (const [value, query] of FONTS) {
  const url = `https://fonts.googleapis.com/css2?family=${query}&display=swap`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) {
    console.error(`FAIL css2 ${value}: ${res.status}`);
    process.exitCode = 1;
    continue;
  }
  const css = await res.text();
  const faces = parseFaces(css);
  if (!faces.length) {
    console.error(`FAIL parse ${value}: no @font-face found`);
    process.exitCode = 1;
    continue;
  }

  let idx = 0;
  for (const face of faces) {
    const isArabic = face.subset === 'arabic';
    const isLatin = face.subset === 'latin';
    if (!isArabic && !isLatin) continue;

    const src = field(face.body, 'src');
    const weight = field(face.body, 'font-weight') || '400';
    const style = field(face.body, 'font-style') || 'normal';
    const range = field(face.body, 'unicode-range') || 'U+0-10FFFF';
    const remote = src?.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
    if (!remote) continue;

    const file = `${value}-${isArabic ? 'arabic' : 'latin'}${idx++}.woff2`;
    const bin = Buffer.from(await (await fetch(remote, { headers: { 'User-Agent': UA } })).arrayBuffer());
    fs.writeFileSync(path.join(OUT_DIR, file), bin);
    totalBytes += bin.length;

    entries.push({ value, weight, style, range, file, subset: face.subset, bytes: bin.length });
  }
  console.log(`ok ${value}: ${entries.filter(e => e.value === value).length} files`);
}

const cssBlock = entries
  .map(e => {
    const family = `wor-${e.value}`;
    return (
      `@font-face { font-family: '${family}'; font-style: ${e.style}; font-weight: ${e.weight}; ` +
      `font-display: swap; src: url('fonts/${e.file}') format('woff2'); unicode-range: ${e.range}; }`
    );
  })
  .join('\n');

// Map each reader font value to its bundled CSS family stack. Family order
// mirrors the original font stacks (Arabic-first).
const familyMap = {};
for (const e of entries) {
  familyMap[e.value] = `wor-${e.value}`;
}

const moduleSrc = `// GENERATED by scripts/fetch-wor-fonts.mjs — do not edit by hand.
// ${entries.length} local woff2 files under assets/reader/wor/fonts.
// @font-face declarations use RELATIVE 'fonts/<file>' URLs; the host resolves
// them against the runtime HTML's base URL.

export const WOR_FONT_FACE_CSS = ${JSON.stringify(cssBlock)};

/** reader font value -> local @font-face family name (undefined = none). */
export const WOR_LOCAL_FONT_FAMILY = ${JSON.stringify(familyMap, null, 2)};
`;

fs.writeFileSync(MOD_PATH, moduleSrc);
console.log(
  `done: ${entries.length} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MB`,
);
