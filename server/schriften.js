// Schriften selbst ausliefern: Der Server holt die Google-Fonts EINMAL und speichert sie.
// So bekommt Google nie die IP-Adressen der Nutzer (wichtig für den Datenschutz in Deutschland).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const QUELLEN = [
  'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:ital,wght@0,400;0,600;0,700;1,400&display=swap',
  'https://fonts.googleapis.com/css2?family=Playwrite+DE+Grund:wght@300;400&display=swap',
];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
let ordner = '';
let laeuft = null;

export function oeffnen(daten) {
  ordner = path.join(daten, 'schriften');
  mkdirSync(ordner, { recursive: true });
}

async function holen() {
  let css = '';
  for (const q of QUELLEN) {
    const r = await fetch(q, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`Schriften: ${r.status}`);
    css += `${await r.text()}\n`;
  }
  const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]))];
  for (const u of urls) {
    const name = `${crypto.createHash('sha1').update(u).digest('hex').slice(0, 16)}${path.extname(new URL(u).pathname) || '.woff2'}`;
    const ziel = path.join(ordner, name);
    if (!existsSync(ziel)) {
      const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`Schrift: ${r.status}`);
      writeFileSync(ziel, Buffer.from(await r.arrayBuffer()));
    }
    css = css.split(u).join(`/schriften/${name}`);
  }
  writeFileSync(path.join(ordner, 'schriften.css'), css);
  return css;
}

export async function css() {
  const datei = path.join(ordner, 'schriften.css');
  if (existsSync(datei)) return readFileSync(datei, 'utf8');
  laeuft ||= holen().catch((e) => { console.error(e.message); laeuft = null; return ''; });
  return laeuft;
}

export function datei(name) {
  if (!/^[a-f0-9]{16}\.(woff2|woff|ttf)$/.test(name)) return null;
  const p = path.join(ordner, name);
  return existsSync(p) ? readFileSync(p) : null;
}
