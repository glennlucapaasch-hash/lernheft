// Prüft eingetippte Antworten: 'richtig', 'fast' (kleiner Fehler) oder 'falsch'.

const ARTIKEL = /^(der|die|das|ein|eine|einen|the|a|an|to|le|la|les|l'|un|une|des|el|los|las|una|unos|unas|sich)\s+/;

export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[.!?¿¡"„“”;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ohneAkzente(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function locker(text) {
  let t = text.replace(/^l'/, '');
  let vorher;
  do {
    vorher = t;
    t = t.replace(ARTIKEL, '');
  } while (t !== vorher);
  return ohneAkzente(t).replace(/[-']/g, ' ').replace(/\s+/g, ' ').trim();
}

// "to go, to walk / laufen" -> ["to go", "to walk", "laufen"] plus die ganze Antwort
export function alternativen(erwartet) {
  const roh = String(erwartet ?? '');
  const ganz = normalize(roh);
  const teile = roh
    .replace(/\([^)]*\)/g, ' ')
    .split(/[,;/]|\boder\b/)
    .map(normalize)
    .filter(Boolean);
  return [...new Set([ganz, ...teile].filter(Boolean))];
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function checkAnswer(gegeben, erwartet) {
  const g = normalize(gegeben);
  if (!g) return 'falsch';
  const alts = alternativen(erwartet);
  if (alts.includes(g)) return 'richtig';

  const gTeile = g.split(/[,;/]/).map((t) => t.trim()).filter(Boolean);
  if (gTeile.length > 1 && gTeile.every((t) => alts.includes(t))) return 'richtig';

  const gl = locker(g);
  for (const alt of alts) {
    const al = locker(alt);
    if (!al) continue;
    if (gl === al) return 'fast';
    const erlaubt = al.length >= 10 ? 2 : al.length >= 5 ? 1 : 0;
    if (erlaubt && levenshtein(gl, al) <= erlaubt) return 'fast';
  }
  return 'falsch';
}
