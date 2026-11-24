// Vokabelspiele: Wortregen, Buchstabensalat, Galgenmännchen
import { h, icon, toast, mehrzahl } from '../dom.js';
import * as store from '../store.js';
import { shuffle, mcOptionen } from '../exam.js';

const ARTIKEL = /^(der|die|das|the|to|a|an|le|la|les|l'|un|une|el|los|las|una|un)\s+/i;
export function wortListe(deckId) {
  return store.getState().cards
    .filter((c) => c.front && c.back && (deckId === 'alle' || c.deckId === deckId))
    .map((c) => ({ id: c.id, wort: c.front.replace(ARTIKEL, '').replace(/^l'/i, '').trim(), hinweis: c.back }))
    .filter((w) => /^[\p{L}'-]{3,14}$/u.test(w.wort));
}
const rekord = (name, wert) => {
  const s = store.getState().spiele;
  if (wert > (s[name] || 0)) { s[name] = wert; store.save(); return true; }
  return false;
};

// ---------------- Wortregen ----------------
const regen = { an: false };
export function wortregen(ctx, deckId) {
  const karten = store.getState().cards.filter((c) => c.front && c.back && (deckId === 'alle' || c.deckId === deckId));
  if (karten.length < 4) return h('p', { class: 'blatt' }, 'Für den Wortregen brauchst du mindestens 4 Karten.');
  if (!regen.an) {
    const best = store.getState().spiele.wortregen || 0;
    return h('div', { class: 'blatt blitz-start' },
      h('p', { class: 'handschrift blitz-titel' }, 'Wortregen'),
      h('p', null, 'Wörter fallen vom Himmel. Tippe die richtige Übersetzung, bevor sie unten aufschlagen. Es wird immer schneller – du hast 3 Leben.'),
      best > 0 && h('p', null, 'Rekord: ', h('mark', null, mehrzahl(best, 'Wort', 'Wörter'))),
      regen.ende !== undefined && h('p', { class: 'blitz-punkte' }, `${regen.ende} geschafft${regen.neu ? ' – neuer Rekord! 🎉' : ''}`),
      h('button', { class: 'knopf knopf-haupt knopf-gross', onclick: () => { Object.assign(regen, { an: true, punkte: 0, leben: 3, dauer: 7000, wort: null }); ctx.refresh(); } }, 'Los!'));
  }
  const himmel = h('div', { class: 'regen-himmel' });
  const knoepfe = h('div', { class: 'ankreuzen regen-knoepfe' });
  const stand = h('div', { class: 'spiel-kopf' });
  let timer = null;
  function standZeigen() { stand.replaceChildren(h('strong', null, mehrzahl(regen.punkte, 'Wort', 'Wörter')), h('span', { class: 'regen-leben', 'aria-label': `${regen.leben} Leben` }, '❤️'.repeat(regen.leben) + '🤍'.repeat(3 - regen.leben))); }
  function naechstes() {
    clearTimeout(timer);
    if (regen.leben <= 0) { regen.an = false; regen.ende = regen.punkte; regen.neu = rekord('wortregen', regen.punkte); ctx.refresh(); return; }
    const c = karten[Math.floor(Math.random() * karten.length)];
    const opts = mcOptionen(c.back, karten.map((x) => x.back)) || [c.back];
    const wort = h('div', { class: 'regen-wort', style: `left:${10 + Math.random() * 55}%;animation-duration:${regen.dauer}ms` }, c.front);
    himmel.replaceChildren(wort);
    knoepfe.replaceChildren(...opts.map((o) => h('button', { class: 'knopf knopf-option', onclick: (e) => {
      if (o === c.back) {
        regen.punkte += 1; regen.dauer = Math.max(2200, regen.dauer * 0.93);
        wort.classList.add('platzt'); e.currentTarget.classList.add('ist-richtig');
        clearTimeout(timer); standZeigen(); setTimeout(naechstes, 350);
      } else { e.currentTarget.classList.add('ist-falsch'); e.currentTarget.disabled = true; }
    } }, h('span', null, o))));
    timer = setTimeout(() => { regen.leben -= 1; wort.classList.add('aufschlag'); standZeigen(); setTimeout(naechstes, 600); }, regen.dauer);
  }
  ctx.onLeave(() => { clearTimeout(timer); });
  standZeigen();
  queueMicrotask(naechstes);
  return h('div', { class: 'spiel' }, stand, himmel, knoepfe);
}

// ---------------- Buchstabensalat ----------------
const salat = { wort: null };
export function buchstabensalat(ctx, deckId) {
  const woerter = wortListe(deckId);
  if (woerter.length < 3) return h('p', { class: 'blatt' }, 'Für den Buchstabensalat brauchst du mindestens 3 Karten mit einzelnen Wörtern.');
  if (!salat.wort || salat.deck !== deckId) {
    const w = woerter[Math.floor(Math.random() * woerter.length)];
    let teile = shuffle([...w.wort].map((b, i) => ({ b, i })));
    if (teile.map((t) => t.b).join('') === w.wort && w.wort.length > 1) teile = teile.reverse();
    Object.assign(salat, { wort: w, deck: deckId, teile, gewaehlt: [], geloest: false, serie: salat.serie || 0 });
  }
  const s = salat;
  const ziel = s.wort.wort;
  const eingabe = s.gewaehlt.map((n) => s.teile[n].b).join('');
  const falsch = eingabe.length === ziel.length && eingabe.toLowerCase() !== ziel.toLowerCase();
  if (eingabe.length === ziel.length && !falsch && !s.geloest) { s.geloest = true; s.serie += 1; rekord('salat', s.serie); }
  const neu = () => { salat.wort = null; ctx.refresh(); };
  return h('div', { class: 'spiel salat' },
    h('div', { class: 'spiel-kopf' }, h('span', { class: 'spiel-stand' }, `Serie: ${s.serie} · Rekord ${store.getState().spiele.salat || 0}`)),
    h('div', { class: 'karteikarte gross farbe-blau salat-hinweis' }, h('div', { class: 'karte-seite' }, h('small', null, 'Gesucht ist:'), h('p', { class: 'karte-text' }, s.wort.hinweis))),
    h('div', { class: `salat-loesung ${falsch ? 'wackelt' : ''} ${s.geloest ? 'ist-geloest' : ''}`, 'aria-live': 'polite' },
      [...ziel].map((_, i) => h('span', { class: `salat-feld ${s.gewaehlt[i] !== undefined ? 'voll' : ''}`, onclick: () => { if (!s.geloest && i < s.gewaehlt.length) { s.gewaehlt.splice(i); ctx.refresh(); } } }, s.gewaehlt[i] !== undefined ? s.teile[s.gewaehlt[i]].b : ''))),
    s.geloest
      ? h('div', { class: 'reihe', style: 'justify-content:center' }, h('p', { class: 'handschrift ende-spruch' }, 'Richtig!'), h('button', { class: 'knopf knopf-haupt', onclick: neu }, 'Nächstes Wort'))
      : [
          h('div', { class: 'salat-steine' }, s.teile.map((t, n) => h('button', { class: `salat-stein ${s.gewaehlt.includes(n) ? 'weg' : ''}`, disabled: s.gewaehlt.includes(n), style: `--r:${(n % 5) * 3 - 6}deg`, onclick: () => { s.gewaehlt.push(n); ctx.refresh(); } }, t.b))),
          h('div', { class: 'reihe', style: 'justify-content:center' },
            h('button', { class: 'knopf', onclick: () => { s.gewaehlt = []; ctx.refresh(); } }, 'Zurücksetzen'),
            h('button', { class: 'knopf', onclick: () => {
              // Tipp: richtige Buchstaben bis zur ersten Abweichung setzen, plus einen
              const richtig = [];
              const frei = s.teile.map((_, n) => n);
              for (const ch of ziel.slice(0, Math.min(ziel.length, (s.gewaehlt.length || 0) + 1))) {
                const n = frei.find((x) => s.teile[x].b === ch && !richtig.includes(x));
                if (n !== undefined) richtig.push(n);
              }
              s.gewaehlt = richtig; s.serie = 0; ctx.refresh();
            } }, 'Tipp'),
            h('button', { class: 'knopf knopf-leise', onclick: () => { toast(`Das Wort war: ${ziel}`); s.serie = 0; neu(); } }, 'Auflösen')),
        ]);
}

// ---------------- Galgenmännchen ----------------
const galgen = { wort: null };
const TEILE = 8;
function galgenBild(fehler) {
  const teile = [
    '<path d="M10 115h60"/>', '<path d="M30 115V10"/>', '<path d="M30 10h50M30 30l20-20"/>', '<path d="M80 10v15"/>',
    '<circle cx="80" cy="35" r="10"/>', '<path d="M80 45v35"/>', '<path d="M80 55l-14 12M80 55l14 12"/>', '<path d="M80 80l-12 18M80 80l12 18"/>',
  ];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('class', 'galgen-bild');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${fehler} von ${TEILE} Fehlern`);
  svg.innerHTML = teile.slice(0, fehler).map((t, i) => t.replace('<', `<g class="${i === fehler - 1 ? 'neu' : ''}"><`).replace(/\/>$/, '/></g>')).join('');
  return svg;
}
export function galgenmaennchen(ctx, deckId) {
  const woerter = wortListe(deckId);
  if (woerter.length < 1) return h('p', { class: 'blatt' }, 'Für Galgenmännchen brauchst du Karten mit einzelnen Wörtern.');
  if (!galgen.wort || galgen.deck !== deckId) {
    Object.assign(galgen, { wort: woerter[Math.floor(Math.random() * woerter.length)], deck: deckId, geraten: new Set(), fehler: 0 });
  }
  const g = galgen;
  const ziel = g.wort.wort;
  const norm = (c) => c.toLowerCase();
  const geloest = [...ziel].every((c) => !/\p{L}/u.test(c) || g.geraten.has(norm(c)));
  const verloren = g.fehler >= TEILE;
  const sonder = [...new Set([...ziel.toLowerCase()].filter((c) => /\p{L}/u.test(c) && !/[a-z]/.test(c)))];
  const tasten = [...'abcdefghijklmnopqrstuvwxyz', ...sonder];
  if (geloest && !g.gezaehlt) { g.gezaehlt = true; const s = store.getState().spiele; s.galgen = (s.galgen || 0) + 1; store.save(); }
  return h('div', { class: 'spiel galgen' },
    h('div', { class: 'galgen-oben' },
      galgenBild(g.fehler),
      h('div', null,
        h('small', { class: 'hinweis' }, 'Übersetzung von:'),
        h('p', { class: 'galgen-hinweis' }, g.wort.hinweis),
        h('p', { class: 'hinweis' }, `${TEILE - g.fehler} Fehlversuche übrig`))),
    h('p', { class: `galgen-wort ${geloest ? 'ist-geloest' : ''}`, 'aria-live': 'polite' }, [...ziel].map((c) =>
      h('span', { class: 'galgen-buchstabe' }, !/\p{L}/u.test(c) || g.geraten.has(norm(c)) || verloren ? c : ' '))),
    geloest || verloren
      ? h('div', { class: 'reihe', style: 'justify-content:center' },
          h('p', { class: 'handschrift ende-spruch' }, geloest ? 'Gerettet!' : 'Schade!'),
          h('button', { class: 'knopf knopf-haupt', onclick: () => { galgen.wort = null; galgen.gezaehlt = false; ctx.refresh(); } }, 'Nächstes Wort'))
      : h('div', { class: 'tastatur' }, tasten.map((t) => h('button', {
          class: `taste-buchstabe ${g.geraten.has(t) ? (ziel.toLowerCase().includes(t) ? 'treffer' : 'niete') : ''}`, disabled: g.geraten.has(t),
          onclick: () => { g.geraten.add(t); if (!ziel.toLowerCase().includes(t)) g.fehler += 1; ctx.refresh(); },
        }, t))));
}
