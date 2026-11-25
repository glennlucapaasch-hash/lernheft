// Notizen wie in GoodNotes: Notizbücher mit Cover, Papiervorlagen, Füller/Kugelschreiber/Pinsel, Textmarker,
// Radierer (mit Größen), Formen (auch „zeichnen und halten“), Lasso (verschieben, skalieren, umfärben, kopieren),
// Textfelder, Bilder, Laserpointer, Zoom, Seitenübersicht, PDF-Export. Apple Pencil: Druck, Neigung, Schweben,
// Handballen-Erkennung. Gespeichert wird als Vektor-Striche (klein, scharf in jeder Größe).
import { h, icon, toast, nachfragen, modal, datumKurz, mehrzahl } from '../dom.js';
import * as store from '../store.js';
import { FAECHER } from '../store.js';
import { kiVerfuegbar, stoffErkennen, istServerModus } from '../ai.js';
import { sendenDialog, sendenApi } from './senden.js';
import { zusammenfassung, lueckentext } from './kiextras.js';
import { sprechen, kannSprechen } from '../dom.js';
import { bildAlsDaten } from '../bild.js';

const B = 1000;           // logische Blattbreite
const SEITE = 1414;       // logische Seitenhöhe (A4-Verhältnis)
const FARBEN = [['#1b2a5c', 'Dunkelblau'], ['#111111', 'Schwarz'], ['#2440b3', 'Königsblau'], ['#c4273c', 'Rot'], ['#17784a', 'Grün'], ['#d4700a', 'Orange'], ['#7a3cc4', 'Lila']];
const MARKER = [['#ffe14d', 'Gelb'], ['#8ee89b', 'Grün'], ['#ffaecb', 'Pink'], ['#8fd0ff', 'Blau'], ['#ffc078', 'Orange']];
const DICKEN = [[1.6, 'Fein'], [3, 'Mittel'], [5.5, 'Dick']];
const RADIERER = [[8, 'Radierer klein'], [18, 'Radierer mittel'], [34, 'Radierer groß'], [60, 'Radierer riesig']];
const STIFTE = [['fueller', 'Füller', 'Druckempfindlich wie ein Füller'], ['kugel', 'Kugelschreiber', 'Immer gleich dick'], ['pinsel', 'Pinsel', 'Sehr druckempfindlich']];
const PAPIERE = { leer: 'Blanko', linien: 'Liniert', karo: 'Kariert', punkte: 'Gepunktet', cornell: 'Cornell', schmal: 'Eng liniert' };
const PAPIERFARBEN = { weiss: ['#ffffff', 'Weiß'], creme: ['#fbf6e9', 'Creme'], gelb: ['#fff7cc', 'Gelb'], grau: ['#f1f3f6', 'Grau'] };
const COVER = ['#2440b3', '#c4273c', '#17784a', '#d4700a', '#7a3cc4', '#1b2a5c', '#0b7a8a', '#b5835a', '#e06c9f', '#4a4a55'];

const ui = { id: null, werkzeug: 'stift', letztes: 'radierer', farbe: FARBEN[0][0], marker: MARKER[0][0], dicke: 3, radierGroesse: 18, stiftArt: 'fueller', nurStift: false, zoom: 1, suche: '', fachFilter: 'alle' };

const liste = () => store.getState().notizen;
const finden = (id) => liste().find((n) => n.id === id);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

function neueNotiz(papier = 'karo') {
  const n = { id: store.uid(), titel: '', fach: 'sonstiges', papier, papierFarbe: 'weiss', cover: COVER[Math.floor(Math.random() * COVER.length)], seiten: 1, striche: [], texte: [], bilder: [], text: '', geaendert: Date.now() };
  liste().unshift(n);
  store.save();
  return n;
}
const eigeneFarben = () => { const s = store.getState().settings; return Array.isArray(s.stiftFarben) ? s.stiftFarben.slice(0, 6) : []; };

// ---------- Zeichnen ----------
function breite(s, pt) {
  const p = pt[2] ?? 0.5;
  if (s.t === 'kugel' || s.form) return s.d * 0.95;
  if (s.t === 'pinsel') return s.d * (0.15 + p * 2.2) * (1 + (pt[3] || 0) * 2.5);
  return s.d * (0.35 + p * 1.1) * (1 + (pt[3] || 0) * 2.5);
}

function strich(g, s, von = 1, schwanz = von <= 1) {
  const p = s.p;
  if (!p.length) return;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (s.w === 'marker') {
    g.save();
    g.globalAlpha = 0.45;
    g.globalCompositeOperation = 'multiply';
    g.strokeStyle = s.f;
    g.lineWidth = s.d * 6;
    g.lineCap = s.form ? 'round' : 'butt';
    g.beginPath();
    g.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]);
    if (p.length === 1) g.lineTo(p[0][0] + 0.1, p[0][1]);
    g.stroke();
    g.restore();
    return;
  }
  g.strokeStyle = s.f;
  g.fillStyle = s.f;
  if (s.form) { // Formen: glatte Linien
    g.lineWidth = breite(s, p[0]);
    g.beginPath(); g.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]);
    g.stroke();
    return;
  }
  if (p.length === 1) {
    g.beginPath();
    g.arc(p[0][0], p[0][1], breite(s, p[0]) / 2, 0, Math.PI * 2);
    g.fill();
    return;
  }
  for (let i = Math.max(1, von); i < p.length; i++) {
    const a = p[i - 1], b = p[i], c = p[i - 2] || a;
    g.lineWidth = breite(s, b);
    g.beginPath();
    if (i === 1) g.moveTo(a[0], a[1]); else g.moveTo((c[0] + a[0]) / 2, (c[1] + a[1]) / 2);
    g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    g.stroke();
  }
  if (!schwanz) return;
  const a = p[p.length - 2], b = p[p.length - 1];
  g.lineWidth = breite(s, b);
  g.beginPath();
  g.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  g.lineTo(b[0], b[1]);
  g.stroke();
}

// Bilder werden einmal geladen und dann aus dem Speicher gezeichnet
const bildCache = new Map();
function bildLaden(src, fertig) {
  let b = bildCache.get(src);
  if (!b) { b = new Image(); b.src = src; bildCache.set(src, b); }
  if (!b.complete && fertig) b.addEventListener('load', fertig, { once: true });
  return b;
}
const SCHRIFT = '"Inter", system-ui, -apple-system, sans-serif';
function textZeichnen(g, t) {
  g.save();
  g.fillStyle = t.f || '#1b2a5c';
  g.font = `${t.fett ? '700 ' : ''}${t.g || 28}px ${SCHRIFT}`;
  g.textBaseline = 'top';
  const zeilen = String(t.t || '').split('\n');
  zeilen.forEach((z, i) => g.fillText(z, t.x, t.y + i * (t.g || 28) * 1.3));
  g.restore();
}
function textBox(t) {
  const zeilen = String(t.t || '').split('\n');
  const gr = t.g || 28;
  const breiteMax = Math.max(...zeilen.map((z) => z.length)) * gr * 0.56;
  return { x: t.x, y: t.y, w: Math.max(gr, breiteMax), h: zeilen.length * gr * 1.3 };
}

// Alles einer Notiz zeichnen (Bilder → Striche → Texte)
function inhaltZeichnen(g, n, striche = n.striche, texte = n.texte || [], bilder = n.bilder || [], neu) {
  for (const b of bilder) { const img = bildLaden(b.src, neu); if (img.complete && img.naturalWidth) g.drawImage(img, b.x, b.y, b.w, b.h); }
  for (const s of striche) strich(g, s);
  for (const t of texte) textZeichnen(g, t);
}

function vorlageZeichnen(g, papier, x0, y0, w, hoehe, staerke = 1) {
  g.save();
  g.lineWidth = 1.2 * staerke;
  if (papier === 'linien' || papier === 'schmal' || papier === 'cornell') {
    const abst = papier === 'schmal' ? 30 : 40;
    g.strokeStyle = '#c9d5ea';
    for (let y = y0 + (papier === 'cornell' ? 120 : 80); y < y0 + hoehe; y += abst) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w, y); g.stroke(); }
    if (papier === 'cornell') {
      g.strokeStyle = '#e8a0a8'; g.lineWidth = 2 * staerke;
      g.beginPath(); g.moveTo(x0 + 280, y0 + 80); g.lineTo(x0 + 280, y0 + hoehe - 260); g.stroke();
      g.beginPath(); g.moveTo(x0, y0 + 80); g.lineTo(x0 + w, y0 + 80); g.stroke();
      g.beginPath(); g.moveTo(x0, y0 + hoehe - 260); g.lineTo(x0 + w, y0 + hoehe - 260); g.stroke();
    }
  } else if (papier === 'karo') {
    g.strokeStyle = '#dfe6f2';
    for (let y = y0; y < y0 + hoehe; y += 25) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w, y); g.stroke(); }
    for (let x = x0; x < x0 + w; x += 25) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + hoehe); g.stroke(); }
  } else if (papier === 'punkte') {
    g.fillStyle = '#b8c3d8';
    for (let y = y0 + 25; y < y0 + hoehe; y += 25) for (let x = x0 + 25; x < x0 + w; x += 25) { g.beginPath(); g.arc(x, y, 1.6 * staerke, 0, Math.PI * 2); g.fill(); }
  }
  g.restore();
}

async function seitenBild(n, seite, typ = 'image/jpeg', mitVorlage = false) {
  const c = document.createElement('canvas');
  c.width = B; c.height = SEITE;
  const g = c.getContext('2d');
  g.fillStyle = PAPIERFARBEN[n.papierFarbe || 'weiss']?.[0] || '#fff';
  g.fillRect(0, 0, B, SEITE);
  if (mitVorlage) vorlageZeichnen(g, n.papier, 0, 0, B, SEITE);
  // Bilder fertig laden
  await Promise.all((n.bilder || []).map((b) => new Promise((ok) => { const img = bildLaden(b.src); if (img.complete) ok(); else { img.onload = ok; img.onerror = ok; } })));
  g.translate(0, -seite * SEITE);
  inhaltZeichnen(g, n);
  return new Promise((ok) => c.toBlob(ok, typ, 0.92));
}

// ---------- Formerkennung („zeichnen und halten“) ----------
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len;
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [a, b];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}
function formErkennen(p) {
  if (p.length < 3) return null;
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = x1 - x0, hh = y1 - y0, diag = Math.hypot(w, hh);
  if (diag < 12) return null;
  let laenge = 0;
  for (let i = 1; i < p.length; i++) laenge += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  const [a, z] = [p[0], p[p.length - 1]];
  const pt = (x, y) => [r1(x), r1(y), 0.5, 0];
  // Gerade Linie
  if (Math.hypot(z[0] - a[0], z[1] - a[1]) / laenge > 0.88) {
    let ex = z[0], ey = z[1];
    const winkel = Math.atan2(ey - a[1], ex - a[0]);
    const schnapp = Math.round(winkel / (Math.PI / 4)) * (Math.PI / 4); // auf 45° einrasten, wenn fast gerade
    if (Math.abs(winkel - schnapp) < 0.09) { const l = Math.hypot(ex - a[0], ey - a[1]); ex = a[0] + Math.cos(schnapp) * l; ey = a[1] + Math.sin(schnapp) * l; }
    return [pt(a[0], a[1]), pt(ex, ey)];
  }
  const geschlossen = Math.hypot(z[0] - a[0], z[1] - a[1]) < diag * 0.25;
  if (geschlossen) {
    const ecken = rdp(p, diag * 0.07);
    const n = ecken.length - 1; // letzter = erster
    if (n === 3) return [...ecken.slice(0, 3), ecken[0]].map((q) => pt(q[0], q[1]));
    if (n === 4) {
      // fast achsenparallel → sauberes Rechteck
      return [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1), pt(x0, y0)];
    }
    // Kreis / Ellipse
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let rx = w / 2, ry = hh / 2;
    if (Math.abs(rx - ry) / Math.max(rx, ry) < 0.15) rx = ry = (rx + ry) / 2;
    return Array.from({ length: 73 }, (_, i) => pt(cx + Math.cos((i / 72) * Math.PI * 2) * rx, cy + Math.sin((i / 72) * Math.PI * 2) * ry));
  }
  const vereinfacht = rdp(p, diag * 0.05);
  if (vereinfacht.length <= 6) return vereinfacht.map((q) => pt(q[0], q[1]));
  return null;
}

// Punkt in Polygon (Lasso)
function drin(x, y, poly) {
  let ja = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ja = !ja;
  }
  return ja;
}

// ---------- Übersicht (Bibliothek wie in GoodNotes) ----------
function vorschau(n) {
  const c = h('canvas', { class: 'notiz-vorschau', 'aria-hidden': 'true' });
  requestAnimationFrame(() => {
    const w = c.clientWidth || 160;
    const dpr = devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(w * (SEITE / B) * dpr);
    const g = c.getContext('2d');
    g.scale((w * dpr) / B, (w * dpr) / B);
    g.fillStyle = PAPIERFARBEN[n.papierFarbe || 'weiss']?.[0] || '#fff';
    g.fillRect(0, 0, B, SEITE);
    vorlageZeichnen(g, n.papier, 0, 0, B, SEITE, 3);
    const zeichnen = () => inhaltZeichnen(g, n, n.striche.filter((s) => s.p[0]?.[1] < SEITE), (n.texte || []).filter((t) => t.y < SEITE), (n.bilder || []).filter((b) => b.y < SEITE));
    zeichnen();
  });
  return c;
}

const post = { liste: null, laden: false };
function posteingang(ctx) {
  if (!istServerModus()) return null;
  if (!post.liste && !post.laden) {
    post.laden = true;
    sendenApi('/api/geteilt').then((l) => { post.liste = l.filter((g) => g.typ === 'notiz' && g.von !== ctx.konto?.name); }).catch(() => { post.liste = []; })
      .finally(() => { post.laden = false; if (location.hash === '#notizen') ctx.refresh(); });
  }
  if (!post.liste?.length) return null;
  return h('section', { class: 'geteilt' },
    h('h2', null, 'Dir geschickt'),
    h('ul', { class: 'geteilt-liste' }, post.liste.map((g) => h('li', null,
      icon('stift', 20),
      h('div', { class: 'geteilt-text' }, h('strong', null, g.name), h('small', null, `von ${g.von}${g.an?.length ? ' an dich' : ' an alle'} · ${datumKurz(g.datum)}`)),
      h('button', { class: 'knopf knopf-mini', onclick: async () => {
        try {
          const voll = await sendenApi(`/api/geteilt/${g.id}`);
          const nz = voll.notiz;
          const n = { id: store.uid(), titel: voll.name, fach: voll.fach, papier: nz.papier, papierFarbe: nz.papierFarbe || 'weiss', cover: nz.cover || COVER[0], seiten: nz.seiten, striche: nz.striche || [], texte: nz.texte || [], bilder: nz.bilder || [], text: nz.text, geaendert: Date.now() };
          liste().unshift(n); store.save();
          toast('Notiz übernommen.');
          ui.id = n.id; ctx.refresh();
        } catch (e) { toast(e.message, 'fehler'); }
      } }, 'Übernehmen')))));
}

function neuDialog(ctx, oeffnen) {
  let papier = 'karo';
  let farbe = 'weiss';
  const gitter = h('div', { class: 'vorlagen-gitter' });
  const zeichnen = () => gitter.replaceChildren(...Object.entries(PAPIERE).map(([id, name]) => {
    const c = h('canvas', { width: 100, height: 141, 'aria-hidden': 'true' });
    const g = c.getContext('2d'); g.scale(0.1, 0.1); g.fillStyle = PAPIERFARBEN[farbe][0]; g.fillRect(0, 0, B, SEITE); vorlageZeichnen(g, id, 0, 0, B, SEITE, 7);
    return h('button', { class: `vorlage ${papier === id ? 'ist-aktiv' : ''}`, 'aria-pressed': String(papier === id), onclick: () => { papier = id; zeichnen(); } }, c, h('span', null, name));
  }));
  zeichnen();
  const zu = modal('Neues Notizbuch', [
    h('h3', null, 'Papier'), gitter,
    h('h3', null, 'Papierfarbe'),
    h('div', { class: 'reihe' }, Object.entries(PAPIERFARBEN).map(([id, [f, name]]) => h('button', { class: 'papierfarbe', style: `--f:${f}`, 'aria-label': name, title: name, onclick: (e) => { farbe = id; e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('ist-aktiv', b === e.currentTarget)); zeichnen(); } }))),
    h('div', { class: 'reihe reihe-ende' }, h('button', { class: 'knopf knopf-haupt', onclick: () => { const n = neueNotiz(papier); n.papierFarbe = farbe; store.save(); zu(); oeffnen(n.id); } }, 'Erstellen')),
  ]);
}

function uebersicht(ctx) {
  const oeffnen = (id) => { ui.id = id; ui.zoom = 1; ctx.refresh(); scrollTo(0, 0); };
  const q = ui.suche.trim().toLowerCase();
  const alle = liste().slice().sort((a, b) => b.geaendert - a.geaendert)
    .filter((n) => ui.fachFilter === 'alle' || n.fach === ui.fachFilter)
    .filter((n) => !q || (n.titel || '').toLowerCase().includes(q) || (n.text || '').toLowerCase().includes(q) || (n.texte || []).some((t) => String(t.t).toLowerCase().includes(q)));
  const faecher = [...new Set(liste().map((n) => n.fach))];
  const suche = h('input', { type: 'search', class: 'notiz-suche', placeholder: 'Notizbücher durchsuchen', value: ui.suche, 'aria-label': 'Notizbücher durchsuchen', oninput: (e) => { ui.suche = e.target.value; const pos = e.target.selectionStart; ctx.refresh(); const neu = document.querySelector('.notiz-suche'); neu?.focus(); neu?.setSelectionRange(pos, pos); } });
  return h('div', { class: 'seite notiz-bibliothek' },
    h('header', { class: 'seiten-kopf' },
      h('h1', { class: 'handschrift' }, 'Notizen'),
      h('button', { class: 'knopf knopf-haupt', onclick: () => neuDialog(ctx, oeffnen) }, icon('plus', 18), 'Neu')),
    liste().length > 0 && h('div', { class: 'notiz-filter' }, suche,
      faecher.length > 1 && h('div', { class: 'chips' }, [['alle', 'Alle'], ...faecher.map((f) => [f, FAECHER[f]?.name || 'Sonstiges'])].map(([id, name]) =>
        h('button', { class: `chip ${ui.fachFilter === id ? 'ist-aktiv' : ''}`, 'aria-pressed': String(ui.fachFilter === id), onclick: () => { ui.fachFilter = id; ctx.refresh(); } }, name)))),
    liste().length
      ? h('div', { class: 'notiz-gitter' },
        h('button', { class: 'notiz-kachel notiz-neu', onclick: () => neuDialog(ctx, oeffnen), 'aria-label': 'Neues Notizbuch' }, h('span', { class: 'notiz-buch notiz-buch-neu' }, icon('plus', 34)), h('span', { class: 'notiz-kachel-titel' }, 'Neu')),
        alle.map((n) => h('button', { class: 'notiz-kachel', onclick: () => oeffnen(n.id) },
          h('span', { class: 'notiz-buch', style: `--cover:${n.cover || COVER[0]}` }, h('span', { class: 'notiz-buch-ruecken' }), vorschau(n)),
          h('span', { class: 'notiz-kachel-titel' }, n.titel || 'Ohne Titel'),
          h('span', { class: 'notiz-kachel-info' }, `${FAECHER[n.fach]?.name || 'Sonstiges'} · ${mehrzahl(n.seiten, 'Seite', 'Seiten')} · ${datumKurz(n.geaendert)}`))),
        !alle.length && h('p', { class: 'hinweis' }, 'Nichts gefunden.'))
      : h('div', { class: 'blatt leer' },
        h('p', null, 'Schreib mit dem Apple Pencil wie in GoodNotes: Mitschriften, Rechenwege, Skizzen, Formen, Bilder und Text. Aus jeder Notiz kann die KI Karteikarten machen.'),
        h('button', { class: 'knopf knopf-haupt', onclick: () => neuDialog(ctx, oeffnen) }, icon('stift', 18), 'Erstes Notizbuch anlegen')),
    posteingang(ctx));
}

// ---------- Editor ----------
function editor(ctx, n) {
  n.texte ||= []; n.bilder ||= []; n.papierFarbe ||= 'weiss'; n.cover ||= COVER[0];
  let striche = n.striche, texte = n.texte, bilder = n.bilder;
  const rueck = [];
  const vor = [];
  let k = 1, g, go, dpr = 1;
  let auswahl = null; // { s:Set, t:Set, b:Set, box }

  const cv = h('canvas', { class: 'notiz-canvas', 'aria-hidden': 'true' });
  const ov = h('canvas', { class: 'notiz-overlay', role: 'img', 'aria-label': 'Zeichenfläche. Mit Stift oder Finger schreiben.' });
  const auswahlLeiste = h('div', { class: 'auswahl-leiste', hidden: true, role: 'toolbar', 'aria-label': 'Auswahl' });
  const blatt = h('div', { class: 'notiz-blatt', style: `--papier:${PAPIERFARBEN[n.papierFarbe][0]}` }, cv, ov, auswahlLeiste);
  const zoomRahmen = h('div', { class: 'notiz-zoom' }, blatt);

  const stand = () => ({ s: striche, t: texte, b: bilder });
  function speichern() {
    n.striche = striche; n.texte = texte; n.bilder = bilder;
    n.geaendert = Date.now();
    store.save();
    knoepfeAktualisieren();
  }
  function aendern({ s = striche, t = texte, b = bilder }) {
    rueck.push(stand());
    if (rueck.length > 100) rueck.shift();
    vor.length = 0;
    striche = s; texte = t; bilder = b;
    speichern();
  }
  function alles() {
    if (!g) return;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.restore();
    for (let i = 0; i < n.seiten; i++) vorlageZeichnen(g, n.papier, 0, i * SEITE, B, SEITE);
    g.save();
    g.strokeStyle = 'rgba(27,42,92,.25)'; g.setLineDash([8, 8]); g.lineWidth = 1.5;
    for (let i = 1; i < n.seiten; i++) { g.beginPath(); g.moveTo(0, i * SEITE); g.lineTo(B, i * SEITE); g.stroke(); }
    g.restore();
    inhaltZeichnen(g, n, striche, texte, bilder, () => alles());
    auswahlZeichnen();
  }
  function groesse() {
    const w = blatt.clientWidth;
    if (!w) return;
    k = w / B;
    dpr = Math.min(devicePixelRatio || 1, ui.zoom > 1.5 ? 2 : 3);
    const hoehe = SEITE * n.seiten * k;
    for (const c of [cv, ov]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(hoehe * dpr);
      c.style.height = `${hoehe}px`;
    }
    blatt.style.height = `${hoehe}px`;
    g = cv.getContext('2d'); go = ov.getContext('2d');
    g.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    go.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    alles();
  }
  const overlayLeeren = () => { go?.save(); go?.setTransform(1, 0, 0, 1, 0, 0); go?.clearRect(0, 0, ov.width, ov.height); go?.restore(); auswahlZeichnen(); };

  function zoomSetzen(z, mitte) {
    const alt = ui.zoom;
    ui.zoom = Math.min(3, Math.max(1, Math.round(z * 100) / 100));
    if (ui.zoom === alt) return;
    const r = zoomRahmen.getBoundingClientRect();
    const mx = (mitte?.x ?? r.left + r.width / 2) - r.left;
    const relX = (zoomRahmen.scrollLeft + mx) / (alt * r.width);
    blatt.style.width = `${ui.zoom * 100}%`;
    groesse();
    zoomRahmen.scrollLeft = relX * ui.zoom * r.width - mx;
    zoomAnzeige.textContent = `${Math.round(ui.zoom * 100)} %`;
  }

  // ----- Auswahl (Lasso) -----
  function auswahlBox(a) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const dazu = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const i of a.s) for (const q of striche[i].p) dazu(q[0], q[1]);
    for (const i of a.t) { const b = textBox(texte[i]); dazu(b.x, b.y); dazu(b.x + b.w, b.y + b.h); }
    for (const i of a.b) { const b = bilder[i]; dazu(b.x, b.y); dazu(b.x + b.w, b.y + b.h); }
    return { x: x0 - 10, y: y0 - 10, w: x1 - x0 + 20, h: y1 - y0 + 20 };
  }
  function auswahlZeichnen() {
    if (!go || !auswahl) { auswahlLeiste.hidden = true; return; }
    const bx = auswahl.box;
    go.save();
    go.strokeStyle = '#2f6df6'; go.lineWidth = 1.5 / k; go.setLineDash([6 / k, 5 / k]);
    go.strokeRect(bx.x, bx.y, bx.w, bx.h);
    go.setLineDash([]); go.fillStyle = '#fff'; go.lineWidth = 2 / k;
    go.beginPath(); go.arc(bx.x + bx.w, bx.y + bx.h, 9 / k, 0, Math.PI * 2); go.fill(); go.stroke();
    go.restore();
    auswahlLeiste.hidden = false;
    auswahlLeiste.style.left = `${Math.max(4, Math.min(bx.x * k, blatt.clientWidth - 330))}px`;
    auswahlLeiste.style.top = `${Math.max(4, bx.y * k - 54)}px`;
  }
  function auswahlSetzen(a) {
    auswahl = a && (a.s.size || a.t.size || a.b.size) ? { ...a, box: auswahlBox(a) } : null;
    if (auswahl) auswahlLeisteBauen();
    overlayLeeren();
  }
  function auswahlLeisteBauen() {
    const farben = [...FARBEN.slice(0, 5), ...eigeneFarben().slice(0, 2)];
    auswahlLeiste.replaceChildren(
      ...farben.map(([f, name]) => h('button', { class: 'farbpunkt klein', style: `--f:${f}`, 'aria-label': `Färben: ${name || f}`, onclick: () => {
        const s = striche.map((x, i) => (auswahl.s.has(i) && x.w !== 'marker' ? { ...x, f } : x));
        const t = texte.map((x, i) => (auswahl.t.has(i) ? { ...x, f } : x));
        aendern({ s, t }); alles();
      } })),
      h('span', { class: 'schwebe-trenner' }),
      h('button', { class: 'auswahl-knopf', onclick: () => { ui.ablage = kopieren(); toast('Kopiert. Zum Einfügen: „Einfügen“ oben in der Leiste.'); leisteZeichnen(); } }, 'Kopieren'),
      h('button', { class: 'auswahl-knopf', onclick: () => einfuegen(kopieren(), 30) }, 'Duplizieren'),
      h('button', { class: 'auswahl-knopf gefahr', onclick: () => {
        aendern({ s: striche.filter((_, i) => !auswahl.s.has(i)), t: texte.filter((_, i) => !auswahl.t.has(i)), b: bilder.filter((_, i) => !auswahl.b.has(i)) });
        auswahlSetzen(null); alles();
      } }, 'Löschen'));
  }
  const kopieren = () => ({ s: [...auswahl.s].map((i) => structuredClone(striche[i])), t: [...auswahl.t].map((i) => ({ ...texte[i] })), b: [...auswahl.b].map((i) => ({ ...bilder[i] })) });
  function einfuegen(abl, versatz = 30) {
    if (!abl) return;
    const verschoben = { s: abl.s.map((x) => ({ ...x, p: x.p.map((q) => [r1(q[0] + versatz), r1(q[1] + versatz), q[2], q[3]]) })), t: abl.t.map((x) => ({ ...x, id: store.uid(), x: x.x + versatz, y: x.y + versatz })), b: abl.b.map((x) => ({ ...x, id: store.uid(), x: x.x + versatz, y: x.y + versatz })) };
    const s0 = striche.length, t0 = texte.length, b0 = bilder.length;
    aendern({ s: [...striche, ...verschoben.s], t: [...texte, ...verschoben.t], b: [...bilder, ...verschoben.b] });
    alles();
    auswahlSetzen({ s: new Set(verschoben.s.map((_, i) => s0 + i)), t: new Set(verschoben.t.map((_, i) => t0 + i)), b: new Set(verschoben.b.map((_, i) => b0 + i)) });
  }
  // Auswahl live verschieben/skalieren (dx, dy, faktor um die linke obere Ecke)
  function auswahlVeraendern(basis, dx, dy, f) {
    const ox = basis.box.x, oy = basis.box.y;
    const tr = (x, y) => [r1(ox + (x - ox) * f + dx), r1(oy + (y - oy) * f + dy)];
    striche = basis.s0.map((x, i) => (auswahl.s.has(i) ? { ...x, d: f === 1 ? x.d : r2(x.d * Math.sqrt(f)), p: x.p.map((q) => [...tr(q[0], q[1]), q[2], q[3]]) } : x));
    texte = basis.t0.map((x, i) => { if (!auswahl.t.has(i)) return x; const [nx, ny] = tr(x.x, x.y); return { ...x, x: nx, y: ny, g: Math.max(10, Math.round((x.g || 28) * f)) }; });
    bilder = basis.b0.map((x, i) => { if (!auswahl.b.has(i)) return x; const [nx, ny] = tr(x.x, x.y); return { ...x, x: nx, y: ny, w: x.w * f, h: x.h * f }; });
    auswahl.box = { x: ox + dx, y: oy + dy, w: basis.box.w * f, h: basis.box.h * f };
    alles();
  }

  // ----- Text -----
  function textDialog(vorhanden, x, y) {
    const t = vorhanden ? texte[vorhanden.i] : { id: store.uid(), x, y, t: '', g: 28, f: ui.farbe, fett: false };
    let groesseW = t.g, farbeW = t.f, fett = t.fett;
    const feld = h('textarea', { rows: '4', placeholder: 'Text eingeben …', 'aria-label': 'Text' }, t.t);
    const groessen = h('div', { class: 'reihe' }, [[20, 'Klein'], [28, 'Normal'], [40, 'Groß'], [56, 'Überschrift']].map(([gr, name]) => h('button', { class: `knopf knopf-mini ${groesseW === gr ? 'knopf-haupt' : ''}`, onclick: (e) => { groesseW = gr; groessen.querySelectorAll('button').forEach((b) => b.classList.toggle('knopf-haupt', b === e.currentTarget)); } }, name)),
    h('button', { class: `knopf knopf-mini ${fett ? 'knopf-haupt' : ''}`, onclick: (e) => { fett = !fett; e.currentTarget.classList.toggle('knopf-haupt', fett); } }, h('strong', null, 'F')));
    const farben = h('div', { class: 'reihe' }, [...FARBEN, ...eigeneFarben()].map(([f, name]) => h('button', { class: `farbpunkt ${farbeW === f ? 'ist-aktiv' : ''}`, style: `--f:${f}`, 'aria-label': name || f, onclick: (e) => { farbeW = f; farben.querySelectorAll('button').forEach((b) => b.classList.toggle('ist-aktiv', b === e.currentTarget)); } })));
    const zu = modal(vorhanden ? 'Text bearbeiten' : 'Textfeld', [feld, groessen, farben,
      h('div', { class: 'reihe reihe-ende' },
        vorhanden && h('button', { class: 'knopf knopf-gefahr-leise', onclick: () => { aendern({ t: texte.filter((_, i) => i !== vorhanden.i) }); alles(); zu(); } }, 'Löschen'),
        h('button', { class: 'knopf knopf-haupt', onclick: () => {
          const wert = feld.value.replace(/\s+$/, '');
          if (!wert) { if (vorhanden) aendern({ t: texte.filter((_, i) => i !== vorhanden.i) }); zu(); alles(); return; }
          const neu = { ...t, t: wert.slice(0, 2000), g: groesseW, f: farbeW, fett };
          aendern({ t: vorhanden ? texte.map((x, i) => (i === vorhanden.i ? neu : x)) : [...texte, neu] });
          alles(); zu();
        } }, 'Fertig'))]);
    setTimeout(() => feld.focus(), 50);
  }
  const textTreffer = (x, y) => { for (let i = texte.length - 1; i >= 0; i--) { const b = textBox(texte[i]); if (x >= b.x - 8 && x <= b.x + b.w + 8 && y >= b.y - 8 && y <= b.y + b.h + 8) return { i }; } return null; };

  // ----- Bild einfügen -----
  const bildWahl = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async (e) => {
    const datei = e.target.files[0];
    e.target.value = '';
    if (!datei) return;
    try {
      const src = await bildAlsDaten(datei, 1400);
      const img = await new Promise((ok, nein) => { const i = new Image(); i.onload = () => ok(i); i.onerror = nein; i.src = src; });
      const w = Math.min(600, img.naturalWidth);
      const hh = (w * img.naturalHeight) / img.naturalWidth;
      const r = blatt.getBoundingClientRect();
      const y = Math.max(20, Math.min(n.seiten * SEITE - hh - 20, (-r.top + 120) / k));
      const neu = { id: store.uid(), src, x: (B - w) / 2, y, w, h: hh };
      aendern({ b: [...bilder, neu] });
      alles();
      werkzeug('lasso');
      auswahlSetzen({ s: new Set(), t: new Set(), b: new Set([bilder.length - 1]) });
      toast('Bild eingefügt – ziehen zum Verschieben, Ecke ziehen zum Vergrößern.');
    } catch { toast('Dieses Bild kann ich nicht einfügen.', 'fehler'); }
  } });

  // ----- Laserpointer -----
  let laser = [];
  let laserLaeuft = false;
  function laserZeichnen() {
    const jetzt = performance.now();
    laser = laser.filter((p) => jetzt - p.t < 900);
    overlayLeeren();
    for (let i = 1; i < laser.length; i++) {
      const a = laser[i - 1], b = laser[i];
      if (b.t - a.t > 120) continue;
      const alpha = 1 - (jetzt - b.t) / 900;
      go.strokeStyle = `rgba(255,40,60,${alpha})`; go.lineWidth = 6 / k; go.lineCap = 'round';
      go.shadowColor = 'rgba(255,40,60,.8)'; go.shadowBlur = 12 / k;
      go.beginPath(); go.moveTo(a.x, a.y); go.lineTo(b.x, b.y); go.stroke();
    }
    go.shadowBlur = 0;
    if (laser.length) requestAnimationFrame(laserZeichnen); else laserLaeuft = false;
  }

  // ----- Eingabe -----
  let akt = null;
  const finger = new Map();
  let fingerStart = 0, fingerBewegt = false, fingerMax = 0, letzte = null, pinch = null;

  const pos = (e) => {
    const r = ov.getBoundingClientRect();
    return [(e.clientX - r.left) / k, (e.clientY - r.top) / k];
  };
  function neigung(e) {
    if (e.pointerType !== 'pen') return 0;
    let alt = e.altitudeAngle;
    if (alt === undefined && (e.tiltX || e.tiltY)) alt = ((90 - Math.max(Math.abs(e.tiltX), Math.abs(e.tiltY))) * Math.PI) / 180;
    if (alt === undefined) return 0;
    const t = 1 - Math.min(1, alt / (Math.PI / 2));
    return t > 0.5 ? r2((t - 0.5) / 0.5) : 0; // erst bei flach gehaltenem Stift: schattieren
  }
  const druck = (e) => (e.pointerType === 'pen' ? (e.pressure || 0.05) : 0.5);

  function radieren(e) {
    const [x, y] = pos(e);
    const r = ui.radierGroesse;
    const neu = striche.filter((s) => !s.p.some((pt) => (pt[0] - x) ** 2 + (pt[1] - y) ** 2 < (r + s.d) ** 2));
    if (neu.length !== striche.length) { striche = neu; alles(); }
    overlayLeeren();
    go.strokeStyle = 'rgba(196,39,60,.7)'; go.lineWidth = 2 / k; go.setLineDash([]);
    go.beginPath(); go.arc(x, y, r, 0, Math.PI * 2); go.stroke();
  }

  function halteTimer() {
    clearTimeout(akt.halt);
    if (akt.s.form || akt.s.p.length < 4) return;
    akt.halt = setTimeout(() => {
      if (!akt?.s || akt.s.form) return;
      const f = formErkennen(akt.s.p);
      if (!f) return;
      akt.s.p = f; akt.s.form = true;
      if (navigator.vibrate) navigator.vibrate(15);
      alles(); overlayLeeren(); strich(go, akt.s);
    }, 550);
  }

  function punkte(e) {
    const s = akt.s;
    if (s.form) return;
    const liste = e.getCoalescedEvents?.() || [e];
    const vorher = s.p.length;
    for (const ev of (liste.length ? liste : [e])) {
      const [x, y] = pos(ev);
      const letzt = s.p[s.p.length - 1];
      if (letzt && (letzt[0] - x) ** 2 + (letzt[1] - y) ** 2 < 0.36) continue;
      s.p.push([r1(x), r1(y), r2(druck(ev)), s.w === 'stift' && s.t !== 'kugel' ? neigung(ev) : 0]);
    }
    if (s.p.length === vorher) return;
    if (s.w === 'marker' || akt.form) { overlayLeeren(); strich(go, s); }
    else strich(g, s, Math.max(1, vorher));
    halteTimer();
  }

  // ----- Schwebe-Menü: Stift kurz still über dem Blatt halten → Werkzeuge direkt an der Spitze -----
  let schwebe = null;
  let menueEl = null;
  function menueZu() {
    if (!menueEl) return;
    const el = menueEl; menueEl = null;
    el.classList.add('geht'); setTimeout(() => el.remove(), 160);
  }
  function menueAuf(cx, cy) {
    menueZu();
    const r = blatt.getBoundingClientRect();
    const w = ui.werkzeug;
    const farben = (w === 'marker' ? MARKER : FARBEN).slice(0, 5);
    const wahl = (fn) => () => { fn(); leisteZeichnen(); setTimeout(menueZu, 220); };
    menueEl = h('div', { class: 'schwebe-menue', role: 'toolbar', 'aria-label': 'Schnellauswahl', style: `left:${Math.min(cx - r.left + 22, r.width - 250)}px;top:${Math.max(cy - r.top - 70, 8)}px` },
      [['stift', 'Stift'], ['marker', 'Textmarker'], ['radierer', 'Radierer'], ['lasso', 'Lasso']].map(([id, name]) =>
        h('button', { class: `werkzeug ${w === id ? 'ist-aktiv' : ''}`, 'aria-label': name, onclick: wahl(() => werkzeug(id)) }, icon(id))),
      h('span', { class: 'schwebe-trenner' }),
      w === 'radierer' && RADIERER.map(([gr, name]) => h('button', { class: `dicke radier-groesse ${ui.radierGroesse === gr ? 'ist-aktiv' : ''}`, 'aria-label': name, onclick: wahl(() => { ui.radierGroesse = gr; }) }, h('span', { style: { width: `${Math.min(26, gr * 0.45 + 4)}px`, height: `${Math.min(26, gr * 0.45 + 4)}px` } }))),
      (w === 'stift' || w === 'marker' || w === 'form') && farben.map(([f, name]) =>
        h('button', { class: `farbpunkt ${(w === 'marker' ? ui.marker : ui.farbe) === f ? 'ist-aktiv' : ''}`, style: `--f:${f}`, 'aria-label': name, onclick: wahl(() => { if (w === 'marker') ui.marker = f; else ui.farbe = f; }) })),
      h('span', { class: 'schwebe-trenner' }),
      h('button', { class: 'werkzeug', 'aria-label': 'Rückgängig', onclick: () => { zurueck(); } }, icon('rueck')));
    menueEl.dataset.x = cx; menueEl.dataset.y = cy;
    blatt.append(menueEl);
    const breiteM = menueEl.offsetWidth;
    menueEl.style.left = `${Math.max(8, Math.min(cx - r.left + 22, r.width - breiteM - 8))}px`;
  }
  function schweben(e) {
    if (menueEl) {
      if (Math.hypot(e.clientX - menueEl.dataset.x, e.clientY - menueEl.dataset.y) > 140) menueZu();
      return;
    }
    if (!schwebe || Math.hypot(e.clientX - schwebe.x, e.clientY - schwebe.y) > 5) {
      clearTimeout(schwebe?.t);
      schwebe = { x: e.clientX, y: e.clientY, t: setTimeout(() => menueAuf(e.clientX, e.clientY), 650) };
    }
  }
  ctx.onLeave(() => clearTimeout(schwebe?.t));

  function hover(e) {
    if (e.pointerType === 'pen') schweben(e);
    overlayLeeren();
    if (e.pointerType !== 'pen' || akt) return;
    const [x, y] = pos(e);
    const w = ui.werkzeug;
    go.setLineDash([]);
    if (w === 'radierer') { go.strokeStyle = 'rgba(196,39,60,.6)'; go.lineWidth = 2 / k; go.beginPath(); go.arc(x, y, ui.radierGroesse, 0, Math.PI * 2); go.stroke(); return; }
    if (w !== 'stift' && w !== 'marker' && w !== 'form') return;
    go.fillStyle = w === 'marker' ? ui.marker : ui.farbe;
    go.globalAlpha = 0.45;
    go.beginPath(); go.arc(x, y, Math.max(2, (w === 'marker' ? ui.dicke * 6 : ui.dicke * 1.2) / 2), 0, Math.PI * 2); go.fill();
    go.globalAlpha = 1;
  }

  // Trifft der Punkt die Auswahl? → 'griff' (Ecke = skalieren) oder 'innen' (verschieben)
  function auswahlTreffer(x, y) {
    if (!auswahl) return null;
    const b = auswahl.box;
    if (Math.hypot(x - (b.x + b.w), y - (b.y + b.h)) < 26 / k) return 'griff';
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return 'innen';
    return null;
  }

  ov.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'pen' && !ui.nurStift) { ui.nurStift = true; stiftSchalter.checked = true; }
    const istFinger = e.pointerType === 'touch';
    if (istFinger && (ui.nurStift || akt || finger.size)) {
      // Ein Finger malt gerade (ohne „Nur Stift“) und ein zweiter kommt dazu → das ist eine Geste, kein Strich
      if (akt && akt.finger) {
        finger.set(akt.id, { x: akt.cx, y: akt.cy });
        clearTimeout(akt.halt); akt = null; alles(); overlayLeeren();
      }
      finger.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (finger.size === 1) { fingerStart = Date.now(); fingerBewegt = false; fingerMax = 1; letzte = { x: e.clientX, y: e.clientY }; }
      if (finger.size === 2) { const [a, b] = [...finger.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: ui.zoom }; }
      fingerMax = Math.max(fingerMax, finger.size);
      return;
    }
    if (akt) return;
    clearTimeout(schwebe?.t); schwebe = null; menueZu();
    e.preventDefault();
    try { ov.setPointerCapture(e.pointerId); } catch { /* egal */ }
    const [x, y] = pos(e);
    // Auswahl anfassen (mit Stift oder Finger)
    const treffer = auswahlTreffer(x, y);
    if (treffer) {
      akt = { id: e.pointerId, ziehen: treffer, start: [x, y], basis: { box: { ...auswahl.box }, s0: striche, t0: texte, b0: bilder, vorher: stand() } };
      return;
    }
    if (auswahl) { auswahlSetzen(null); if (ui.werkzeug !== 'lasso') return; }
    const w = e.buttons & 32 ? 'radierer' : ui.werkzeug;
    if (w === 'radierer') { akt = { id: e.pointerId, radierer: true, vorher: striche }; radieren(e); return; }
    if (w === 'lasso') { akt = { id: e.pointerId, lasso: [[x, y]] }; return; }
    if (w === 'text') { akt = { id: e.pointerId, text: [x, y] }; return; }
    if (w === 'laser') { akt = { id: e.pointerId, laser: true }; laser.push({ x, y, t: performance.now() }); if (!laserLaeuft) { laserLaeuft = true; requestAnimationFrame(laserZeichnen); } return; }
    const marker = w === 'marker';
    akt = { id: e.pointerId, finger: istFinger, cx: e.clientX, cy: e.clientY, form: w === 'form', s: { w: marker ? 'marker' : 'stift', t: marker ? undefined : (w === 'form' ? 'kugel' : ui.stiftArt), f: marker ? ui.marker : ui.farbe, d: ui.dicke, p: [] } };
    overlayLeeren();
    punkte(e);
  });
  ov.addEventListener('pointermove', (e) => {
    if (finger.has(e.pointerId)) {
      const alt = finger.get(e.pointerId);
      if (Math.hypot(e.clientX - alt.x, e.clientY - alt.y) > 6) fingerBewegt = true;
      finger.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (finger.size === 2 && pinch) {
        const [a, b] = [...finger.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (Math.abs(d - pinch.d) > 18) zoomSetzen(pinch.z * (d / pinch.d), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      } else if (finger.size === 1 && letzte) {
        scrollBy(0, letzte.y - e.clientY);
        zoomRahmen.scrollLeft += letzte.x - e.clientX;
        letzte = { x: e.clientX, y: e.clientY };
      }
      return;
    }
    if (!akt) { hover(e); return; }
    if (e.pointerId !== akt.id) return;
    const [x, y] = pos(e);
    if (akt.ziehen) {
      const dx = x - akt.start[0], dy = y - akt.start[1];
      if (akt.ziehen === 'innen') auswahlVeraendern(akt.basis, dx, dy, 1);
      else { const b = akt.basis.box; const f = Math.max(0.15, Math.min(6, Math.max((b.w + dx) / b.w, (b.h + dy) / b.h))); auswahlVeraendern(akt.basis, 0, 0, f); }
      overlayLeeren();
      return;
    }
    if (akt.lasso) {
      akt.lasso.push([x, y]);
      overlayLeeren();
      go.save(); go.strokeStyle = '#2f6df6'; go.lineWidth = 1.5 / k; go.setLineDash([6 / k, 5 / k]); go.fillStyle = 'rgba(47,109,246,.06)';
      go.beginPath(); akt.lasso.forEach(([lx, ly], i) => (i ? go.lineTo(lx, ly) : go.moveTo(lx, ly))); go.closePath(); go.fill(); go.stroke(); go.restore();
      return;
    }
    if (akt.laser) { laser.push({ x, y, t: performance.now() }); return; }
    if (akt.text) return;
    akt.cx = e.clientX; akt.cy = e.clientY;
    if (akt.radierer) radieren(e); else punkte(e);
  });
  const ende = (e) => {
    if (finger.has(e.pointerId)) {
      finger.delete(e.pointerId);
      if (finger.size < 2) pinch = null;
      if (!finger.size) {
        if (!fingerBewegt && Date.now() - fingerStart < 350) { if (fingerMax === 2) zurueck(); else if (fingerMax === 3) wieder(); }
        letzte = null;
      } else { const [a] = [...finger.values()]; letzte = { x: a.x, y: a.y }; }
      return;
    }
    if (!akt || e.pointerId !== akt.id) return;
    const a = akt;
    akt = null;
    clearTimeout(a.halt);
    if (a.ziehen) {
      const neu = stand();
      striche = a.basis.vorher.s; texte = a.basis.vorher.t; bilder = a.basis.vorher.b;
      if (neu.s !== striche || neu.t !== texte || neu.b !== bilder) aendern(neu);
      auswahl.box = auswahlBox(auswahl);
      overlayLeeren();
      return;
    }
    if (a.lasso) {
      const poly = a.lasso;
      if (poly.length < 4) { overlayLeeren(); return; }
      const s = new Set(), t = new Set(), b = new Set();
      striche.forEach((x, i) => { const drinnen = x.p.filter((q) => drin(q[0], q[1], poly)).length; if (drinnen / x.p.length > 0.5) s.add(i); });
      texte.forEach((x, i) => { const bx = textBox(x); if (drin(bx.x + bx.w / 2, bx.y + bx.h / 2, poly)) t.add(i); });
      bilder.forEach((x, i) => { if (drin(x.x + x.w / 2, x.y + x.h / 2, poly)) b.add(i); });
      auswahlSetzen({ s, t, b });
      if (!auswahl) toast('Nichts ausgewählt – kreise etwas mit dem Lasso ein.');
      return;
    }
    if (a.text) { textDialog(textTreffer(a.text[0], a.text[1]), a.text[0], a.text[1]); return; }
    if (a.laser) return;
    overlayLeeren();
    if (a.radierer) {
      if (striche !== a.vorher) { const neu = striche; striche = a.vorher; aendern({ s: neu }); }
      return;
    }
    if (!a.s.p.length) return;
    if (a.form && !a.s.form) { const f = formErkennen(a.s.p); if (f) { a.s.p = f; a.s.form = true; } }
    aendern({ s: [...striche, a.s] });
    if (a.s.form || a.s.w === 'marker') alles(); else strich(g, a.s, a.s.p.length, true);
  };
  ov.addEventListener('pointerup', ende);
  ov.addEventListener('pointercancel', ende);
  ov.addEventListener('pointerleave', (e) => { if (!akt && e.pointerType === 'pen') { overlayLeeren(); clearTimeout(schwebe?.t); schwebe = null; } });
  // iOS: kein Text-Auswählen, keine Lupe und kein „Kopieren“-Menü beim Schreiben
  ov.addEventListener('contextmenu', (e) => e.preventDefault());
  ov.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  ov.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  blatt.addEventListener('selectstart', (e) => e.preventDefault());
  blatt.addEventListener('dblclick', (e) => e.preventDefault());

  function zurueck() { if (!rueck.length) return; vor.push(stand()); const s = rueck.pop(); striche = s.s; texte = s.t; bilder = s.b; auswahlSetzen(null); alles(); speichern(); }
  function wieder() { if (!vor.length) return; rueck.push(stand()); const s = vor.pop(); striche = s.s; texte = s.t; bilder = s.b; auswahlSetzen(null); alles(); speichern(); }

  const taste = (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) wieder(); else zurueck(); }
    else if (mod && e.key.toLowerCase() === 'c' && auswahl) { ui.ablage = kopieren(); leisteZeichnen(); }
    else if (mod && e.key.toLowerCase() === 'v' && ui.ablage) { e.preventDefault(); einfuegen(ui.ablage); }
    else if ((e.key === 'Backspace' || e.key === 'Delete') && auswahl) { aendern({ s: striche.filter((_, i) => !auswahl.s.has(i)), t: texte.filter((_, i) => !auswahl.t.has(i)), b: bilder.filter((_, i) => !auswahl.b.has(i)) }); auswahlSetzen(null); alles(); }
    else if (e.key === 'Escape' && auswahl) auswahlSetzen(null);
    else if (!mod && { e: 1, p: 1, m: 1, l: 1, t: 1, s: 1 }[e.key]) werkzeug({ e: 'radierer', p: 'stift', m: 'marker', l: 'lasso', t: 'text', s: 'form' }[e.key]);
  };
  document.addEventListener('keydown', taste);
  const beobachter = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => groesse()) : null;
  beobachter?.observe(blatt);
  ctx.onLeave(() => { document.removeEventListener('keydown', taste); beobachter?.disconnect(); store.jetztSpeichern(); document.body.classList.remove('notiz-offen'); });
  document.body.classList.add('notiz-offen');

  // ----- Werkzeugleiste (wie GoodNotes: Werkzeuge in der Mitte, rechts Farben und Stärken) -----
  const leiste = h('div', { class: 'notiz-leiste', role: 'toolbar', 'aria-label': 'Werkzeuge' });
  const undoK = h('button', { class: 'knopf-icon', 'aria-label': 'Rückgängig', title: 'Rückgängig (⌘Z)', onclick: zurueck }, icon('rueck'));
  const redoK = h('button', { class: 'knopf-icon', 'aria-label': 'Wiederholen', title: 'Wiederholen', onclick: wieder }, icon('vor'));
  const zoomAnzeige = h('button', { class: 'zoom-anzeige', 'aria-label': 'Zoom zurücksetzen', title: 'Zoom zurücksetzen', onclick: () => zoomSetzen(1) }, `${Math.round(ui.zoom * 100)} %`);
  function knoepfeAktualisieren() { undoK.disabled = !rueck.length; redoK.disabled = !vor.length; }
  function werkzeug(w) {
    if (w === 'bild') { bildWahl.click(); return; }
    if (w !== ui.werkzeug) { ui.letztes = ui.werkzeug; ui.werkzeug = w; }
    if (w !== 'lasso' && auswahl) auswahlSetzen(null);
    leisteZeichnen();
  }
  const stiftSchalter = h('input', { type: 'checkbox', checked: ui.nurStift, onchange: (e) => { ui.nurStift = e.target.checked; } });
  const farbWahl = h('input', { type: 'color', class: 'farb-wahl', 'aria-label': 'Eigene Farbe wählen', value: ui.farbe, onchange: (e) => {
    const f = e.target.value;
    const s = store.getState().settings;
    s.stiftFarben = [[f, f], ...eigeneFarben().filter(([x]) => x !== f)].slice(0, 6);
    store.save();
    if (ui.werkzeug === 'marker') ui.marker = f; else ui.farbe = f;
    leisteZeichnen();
  } });

  const WERKZEUGE = [['stift', 'Stift (P)'], ['marker', 'Textmarker (M)'], ['radierer', 'Radierer (E)'], ['form', 'Formen (S)'], ['lasso', 'Lasso (L)'], ['text', 'Text (T)'], ['bild', 'Bild einfügen'], ['laser', 'Laserpointer']];
  function leisteZeichnen() {
    const w = ui.werkzeug;
    const malend = w === 'stift' || w === 'marker' || w === 'form';
    const farben = w === 'marker' ? MARKER : [...FARBEN.slice(0, 5), ...eigeneFarben()];
    const aktiv = w === 'marker' ? ui.marker : ui.farbe;
    leiste.replaceChildren(...[
      h('div', { class: 'leiste-gruppe leiste-werkzeuge' }, WERKZEUGE.map(([id, name]) =>
        h('button', { class: `werkzeug ${w === id ? 'ist-aktiv' : ''}`, 'aria-pressed': String(w === id), 'aria-label': name, title: name, onclick: () => werkzeug(id) }, icon(id === 'stift' ? 'stift' : id)))),
      w === 'stift' && h('div', { class: 'leiste-gruppe stift-arten', role: 'group', 'aria-label': 'Stiftart' }, STIFTE.map(([id, name, text]) =>
        h('button', { class: `stift-art ${ui.stiftArt === id ? 'ist-aktiv' : ''}`, 'aria-pressed': String(ui.stiftArt === id), title: text, onclick: () => { ui.stiftArt = id; leisteZeichnen(); } }, name))),
      malend && h('div', { class: 'leiste-gruppe' }, farben.map(([f, name]) =>
        h('button', { class: `farbpunkt ${aktiv === f ? 'ist-aktiv' : ''}`, style: `--f:${f}`, 'aria-label': name || f, 'aria-pressed': String(aktiv === f), onclick: () => { if (w === 'marker') ui.marker = f; else ui.farbe = f; leisteZeichnen(); } })),
        w !== 'marker' && h('label', { class: 'farbpunkt farbpunkt-plus', title: 'Eigene Farbe' }, '+', farbWahl)),
      w === 'radierer' && h('div', { class: 'leiste-gruppe', role: 'group', 'aria-label': 'Radierer-Größe' }, RADIERER.map(([gr, name]) =>
        h('button', { class: `dicke radier-groesse ${ui.radierGroesse === gr ? 'ist-aktiv' : ''}`, 'aria-label': name, title: name, 'aria-pressed': String(ui.radierGroesse === gr), onclick: () => { ui.radierGroesse = gr; leisteZeichnen(); } }, h('span', { style: { width: `${Math.min(30, gr * 0.5 + 4)}px`, height: `${Math.min(30, gr * 0.5 + 4)}px` } })))),
      malend && h('div', { class: 'leiste-gruppe' }, DICKEN.map(([d, name]) =>
        h('button', { class: `dicke ${ui.dicke === d ? 'ist-aktiv' : ''}`, 'aria-label': name, title: name, 'aria-pressed': String(ui.dicke === d), onclick: () => { ui.dicke = d; leisteZeichnen(); } }, h('span', { style: { width: `${d * 2.2 + 2}px`, height: `${d * 2.2 + 2}px` } })))),
      w === 'lasso' && h('p', { class: 'leiste-tipp' }, 'Kreise etwas ein – dann verschieben, an der Ecke skalieren, umfärben oder kopieren.'),
      w === 'form' && h('p', { class: 'leiste-tipp' }, 'Zeichne Linie, Kreis, Dreieck oder Rechteck – wird automatisch gerade. Tipp: Auch mit dem Stift klappt es, wenn du am Ende kurz still hältst.'),
      w === 'text' && h('p', { class: 'leiste-tipp' }, 'Tippe aufs Blatt für ein Textfeld – tippe auf einen Text zum Bearbeiten.'),
      w === 'laser' && h('p', { class: 'leiste-tipp' }, 'Zum Zeigen – verschwindet von selbst.'),
      ui.ablage && h('div', { class: 'leiste-gruppe' }, h('button', { class: 'knopf knopf-mini', onclick: () => einfuegen(ui.ablage) }, 'Einfügen')),
      h('div', { class: 'leiste-gruppe leiste-rechts' },
        h('button', { class: 'knopf-icon', 'aria-label': 'Verkleinern', onclick: () => zoomSetzen(ui.zoom - 0.25) }, icon('zoomraus')),
        zoomAnzeige,
        h('button', { class: 'knopf-icon', 'aria-label': 'Vergrößern', onclick: () => zoomSetzen(ui.zoom + 0.25) }, icon('zoomrein')),
        undoK, redoK)].filter(Boolean));
    knoepfeAktualisieren();
    tauschK.setAttribute('aria-label', `Wechseln zu ${{ radierer: 'Radierer', marker: 'Textmarker', stift: 'Stift', lasso: 'Lasso', form: 'Formen', text: 'Text', laser: 'Laserpointer' }[ui.letztes] || 'Stift'}`);
  }
  // Schnellwechsel am Rand – Ersatz für Doppeltippen/Drücken am Stift, das Webseiten nicht erreicht
  const tauschK = h('button', { class: 'notiz-tausch', onclick: () => werkzeug(ui.letztes) }, icon('tausch', 24));

  // ----- Seiten -----
  const seiteVon = (y) => Math.max(0, Math.floor(y / SEITE));
  function seitenUmbauen(ziel) { // ziel[i] = neue Seitennummer von Seite i, -1 = löschen
    const ver = (y) => { const alt = seiteVon(y); const neu = ziel[Math.min(alt, ziel.length - 1)]; return neu < 0 ? null : (neu - alt) * SEITE; };
    const s = striche.flatMap((x) => { const d = ver(x.p[0]?.[1] ?? 0); return d === null ? [] : [d ? { ...x, p: x.p.map((q) => [q[0], r1(q[1] + d), q[2], q[3]]) } : x]; });
    const t = texte.flatMap((x) => { const d = ver(x.y); return d === null ? [] : [{ ...x, y: x.y + d }]; });
    const b = bilder.flatMap((x) => { const d = ver(x.y); return d === null ? [] : [{ ...x, y: x.y + d }]; });
    n.seiten = Math.max(1, ziel.filter((z) => z >= 0).length);
    aendern({ s, t, b });
    groesse();
  }
  async function seitenDialog() {
    const gitter = h('div', { class: 'seiten-gitter' });
    let zu;
    const bauen = async () => {
      gitter.replaceChildren(h('p', { class: 'hinweis' }, 'Lade Seiten …'));
      n.striche = striche; n.texte = texte; n.bilder = bilder;
      const kacheln = [];
      for (let i = 0; i < n.seiten; i++) {
        const blob = await seitenBild(n, i, 'image/jpeg', true);
        const url = URL.createObjectURL(blob);
        const ziel = (fn) => () => { const z = Array.from({ length: n.seiten }, (_, j) => j); fn(z); seitenUmbauen(z); bauen(); };
        kacheln.push(h('div', { class: 'seiten-kachel' },
          h('button', { class: 'seiten-bild', 'aria-label': `Zu Seite ${i + 1}`, onclick: () => { zu(); const r = blatt.getBoundingClientRect(); scrollTo({ top: scrollY + r.top + i * SEITE * k - 80, behavior: 'smooth' }); } }, h('img', { src: url, alt: '' })),
          h('span', null, `Seite ${i + 1}`),
          h('div', { class: 'reihe seiten-aktionen' },
            i > 0 && h('button', { class: 'knopf-icon', 'aria-label': 'Nach vorne', onclick: ziel((z) => { z[i] = i - 1; z[i - 1] = i; }) }, '◀'),
            i < n.seiten - 1 && h('button', { class: 'knopf-icon', 'aria-label': 'Nach hinten', onclick: ziel((z) => { z[i] = i + 1; z[i + 1] = i; }) }, '▶'),
            n.seiten > 1 && h('button', { class: 'knopf-icon', 'aria-label': `Seite ${i + 1} löschen`, onclick: async () => { if (await nachfragen('Seite löschen?', `Seite ${i + 1} mit allem darauf wird gelöscht. Mit Rückgängig holst du sie zurück.`, 'Löschen', { gefahr: true })) { const z = Array.from({ length: n.seiten }, (_, j) => (j < i ? j : j === i ? -1 : j - 1)); seitenUmbauen(z); bauen(); } } }, icon('muell', 18)))));
      }
      gitter.replaceChildren(...kacheln, h('button', { class: 'seiten-kachel seiten-neu', onclick: () => { n.seiten += 1; groesse(); speichern(); bauen(); } }, icon('plus', 30), h('span', null, 'Seite anhängen')));
    };
    zu = modal(`Seiten (${n.seiten})`, gitter);
    bauen();
  }

  // ----- Export -----
  async function pdfExport() {
    n.striche = striche; n.texte = texte; n.bilder = bilder;
    toast('PDF wird vorbereitet …');
    const bilderSeiten = [];
    for (let i = 0; i < n.seiten; i++) bilderSeiten.push(URL.createObjectURL(await seitenBild(n, i, 'image/jpeg', true)));
    const bereich = h('div', { class: 'druck-bereich druck-notiz' }, bilderSeiten.map((u) => h('img', { src: u, alt: '' })));
    document.body.append(bereich);
    document.body.classList.add('drucken');
    await Promise.all([...bereich.querySelectorAll('img')].map((i) => (i.complete ? null : new Promise((ok) => { i.onload = ok; i.onerror = ok; }))));
    const fertig = () => { bereich.remove(); document.body.classList.remove('drucken'); bilderSeiten.forEach((u) => URL.revokeObjectURL(u)); removeEventListener('afterprint', fertig); };
    addEventListener('afterprint', fertig);
    try { window.print(); } catch { fertig(); }
    setTimeout(() => { if (document.body.contains(bereich)) fertig(); }, 120000);
  }

  // ----- Menü -----
  async function karten() {
    if (!(await kiVerfuegbar())) { toast('Dafür braucht die App die KI.', 'fehler'); return; }
    if (!striche.length && !texte.length && !bilder.length) { toast('Die Notiz ist noch leer.'); return; }
    toast('Ich lese deine Notiz …');
    try {
      n.striche = striche; n.texte = texte; n.bilder = bilder;
      const bilderKi = [];
      for (let i = 0; i < Math.min(n.seiten, 4); i++) bilderKi.push(await seitenBild(n, i));
      const r = await stoffErkennen(bilderKi);
      if (!r.karten.length) { toast('Ich habe nichts zum Lernen gefunden.', 'fehler'); return; }
      const deck = store.addDeck(n.titel || r.titel, n.fach);
      const neu = store.addCards(deck.id, r.karten);
      toast(`${mehrzahl(neu.length, 'Karte', 'Karten')} in „${deck.name}“ erstellt.`);
      ctx.go('karten', { deckId: deck.id });
    } catch (e) {
      toast(e?.message || 'Das hat nicht geklappt.', 'fehler');
    }
  }
  async function seitenFuerKi() { n.striche = striche; n.texte = texte; n.bilder = bilder; const b = []; for (let i = 0; i < Math.min(n.seiten, 4); i++) b.push(await seitenBild(n, i)); return (striche.length || texte.length || bilder.length) ? b : []; }
  async function teilen() {
    n.striche = striche; n.texte = texte; n.bilder = bilder;
    const dateien = [];
    for (let i = 0; i < n.seiten; i++) {
      const blob = await seitenBild(n, i, 'image/png', true);
      dateien.push(new File([blob], `${(n.titel || 'Notiz').replace(/[^\wäöüÄÖÜß -]/g, '')}${n.seiten > 1 ? `-${i + 1}` : ''}.png`, { type: 'image/png' }));
    }
    try {
      if (navigator.canShare?.({ files: dateien })) { await navigator.share({ files: dateien, title: n.titel || 'Notiz' }); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    for (const d of dateien) {
      const url = URL.createObjectURL(d);
      const a = h('a', { href: url, download: d.name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }
  function menue() {
    const zu = modal('Notizbuch', [
      h('h3', null, 'Papier'),
      h('div', { class: 'reihe' }, Object.entries(PAPIERE).map(([id, name]) =>
        h('button', { class: `knopf knopf-mini ${n.papier === id ? 'knopf-haupt' : ''}`, onclick: () => { n.papier = id; alles(); speichern(); zu(); } }, name))),
      h('h3', null, 'Papierfarbe'),
      h('div', { class: 'reihe' }, Object.entries(PAPIERFARBEN).map(([id, [f, name]]) =>
        h('button', { class: `papierfarbe ${n.papierFarbe === id ? 'ist-aktiv' : ''}`, style: `--f:${f}`, 'aria-label': name, title: name, onclick: () => { n.papierFarbe = id; blatt.style.setProperty('--papier', f); speichern(); zu(); } }))),
      h('h3', null, 'Cover'),
      h('div', { class: 'reihe' }, COVER.map((f) => h('button', { class: `farbpunkt ${n.cover === f ? 'ist-aktiv' : ''}`, style: `--f:${f}`, 'aria-label': `Cover ${f}`, onclick: () => { n.cover = f; speichern(); zu(); toast('Cover geändert.'); } }))),
      h('label', { class: 'schalter-zeile' }, stiftSchalter, h('span', null, h('strong', null, 'Nur mit dem Stift schreiben'), h('small', null, 'Finger scrollen und zoomen dann nur, der Handballen malt nicht. Schaltet sich ein, sobald du den Apple Pencil benutzt.'))),
      h('h3', null, 'Lernen mit KI'),
      h('div', { class: 'reihe' },
        h('button', { class: 'knopf', onclick: () => { zu(); karten(); } }, icon('karten', 18), 'Karteikarten daraus machen'),
        h('button', { class: 'knopf', onclick: async () => { zu(); zusammenfassung(ctx, n, await seitenFuerKi()); } }, '✨ Zusammenfassen'),
        h('button', { class: 'knopf', onclick: async () => { zu(); lueckentext(ctx, n, await seitenFuerKi()); } }, '🧩 Lückentext'),
        n.text && kannSprechen() && h('button', { class: 'knopf', onclick: () => { zu(); sprechen(n.text, 'de-DE'); toast('Ich lese den getippten Text vor.'); } }, icon('ton', 18), 'Vorlesen')),
      h('h3', null, 'Teilen und exportieren'),
      h('div', { class: 'reihe' },
        h('button', { class: 'knopf', onclick: () => { zu(); pdfExport(); } }, '📄 Als PDF / Drucken'),
        h('button', { class: 'knopf', onclick: () => { zu(); teilen(); } }, 'Als Bilder teilen'),
        istServerModus() && h('button', { class: 'knopf', onclick: () => { zu(); sendenDialog({ titel: `„${n.titel || 'Notiz'}“ schicken`, beschreibung: 'Die Empfänger bekommen eine Kopie deiner Notiz in ihre Notizen.', daten: { typ: 'notiz', name: n.titel || 'Notiz', fach: n.fach, notiz: { papier: n.papier, papierFarbe: n.papierFarbe, cover: n.cover, seiten: n.seiten, text: n.text, striche, texte, bilder } } }); } }, icon('teilen', 18), 'Schicken')),
      h('div', { class: 'reihe' },
        h('button', { class: 'knopf knopf-gefahr-leise', onclick: () => { zu(); if (striche.length || texte.length || bilder.length) { aendern({ s: [], t: [], b: [] }); auswahlSetzen(null); alles(); toast('Geleert – mit Rückgängig holst du alles zurück.'); } } }, 'Alles wegradieren'),
        h('button', { class: 'knopf knopf-gefahr-leise', onclick: async () => {
          zu();
          if (await nachfragen('Notizbuch löschen?', `„${n.titel || 'Ohne Titel'}“ wird gelöscht. Das lässt sich nicht rückgängig machen.`, 'Löschen', { gefahr: true })) {
            store.getState().notizen = liste().filter((x) => x.id !== n.id);
            store.save(); ui.id = null; ctx.refresh();
          }
        } }, icon('muell', 18), 'Notizbuch löschen')),
    ]);
  }

  leisteZeichnen();
  blatt.style.width = `${ui.zoom * 100}%`;
  queueMicrotask(groesse);
  if (!n.titel && !n.striche.length) queueMicrotask(() => titel.focus());

  const titel = h('input', { type: 'text', class: 'notiz-titel', value: n.titel, placeholder: 'Titel', maxlength: '80', 'aria-label': 'Titel der Notiz', oninput: (e) => { n.titel = e.target.value; speichern(); } });
  return h('div', { class: 'seite seite-notiz', 'data-lern-fach': n.fach },
    h('div', { class: 'notiz-kopf' },
      h('button', { class: 'knopf knopf-leise', onclick: () => { ui.id = null; ctx.refresh(); } }, icon('zurueck', 18), 'Notizen'),
      titel,
      h('select', { class: 'notiz-fach', 'aria-label': 'Fach', onchange: (e) => { n.fach = e.target.value; speichern(); } },
        Object.entries(FAECHER).map(([id, f]) => h('option', { value: id, selected: id === n.fach }, f.name))),
      h('button', { class: 'knopf-icon', 'aria-label': 'Seitenübersicht', title: 'Seiten', onclick: seitenDialog }, icon('seiten')),
      h('button', { class: 'knopf-icon', 'aria-label': 'Mehr', onclick: menue }, icon('mehr'))),
    leiste,
    h('details', { class: 'notiz-text', open: Boolean(n.text) },
      h('summary', null, 'Getippter Text'),
      h('textarea', { rows: '4', placeholder: 'Hier kannst du tippen – oder mit dem Pencil hineinschreiben (Kritzeln wird zu Text).', oninput: (e) => { n.text = e.target.value; speichern(); } }, n.text)),
    zoomRahmen,
    bildWahl,
    h('button', { class: 'knopf knopf-leise seite-dazu', onclick: () => { n.seiten += 1; groesse(); speichern(); scrollBy({ top: 400, behavior: 'smooth' }); } }, icon('plus', 18), 'Seite anhängen'),
    tauschK);
}

export function notizen(ctx) {
  if (ctx.optionen?.neu) ui.id = null;
  if (ctx.optionen?.notiz) ui.id = ctx.optionen.notiz;
  const n = ui.id && finden(ui.id);
  if (!n) ui.id = null;
  return n ? editor(ctx, n) : uebersicht(ctx);
}
