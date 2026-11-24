// Notizen mit Apple Pencil: Druck, Neigung (Schattieren), Schweben (Vorschau), Handballen-Erkennung,
// Radierer, Textmarker, Rückgängig mit zwei Fingern. Gespeichert wird als Striche (klein, scharf in jeder Größe).
import { h, icon, toast, nachfragen, modal, datumKurz, mehrzahl } from '../dom.js';
import * as store from '../store.js';
import { FAECHER } from '../store.js';
import { kiVerfuegbar, stoffErkennen, istServerModus } from '../ai.js';
import { sendenDialog, sendenApi } from './senden.js';

const B = 1000;           // logische Blattbreite
const SEITE = 1414;       // logische Seitenhöhe (A4-Verhältnis)
const FARBEN = [['#1b2a5c', 'Dunkelblau'], ['#2440b3', 'Königsblau'], ['#c4273c', 'Rot'], ['#17784a', 'Grün'], ['#d4700a', 'Orange'], ['#7a3cc4', 'Lila'], ['#111111', 'Schwarz']];
const MARKER = [['#ffe14d', 'Gelb'], ['#8ee89b', 'Grün'], ['#ffaecb', 'Pink'], ['#8fd0ff', 'Blau']];
const DICKEN = [[1.6, 'Fein'], [3, 'Mittel'], [5.5, 'Dick']];
const PAPIERE = { karo: 'Karo', linien: 'Liniert', leer: 'Blanko' };

const ui = { id: null, werkzeug: 'stift', letztes: 'radierer', farbe: FARBEN[0][0], marker: MARKER[0][0], dicke: 3, nurStift: false };

const liste = () => store.getState().notizen;
const finden = (id) => liste().find((n) => n.id === id);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

function neueNotiz() {
  const n = { id: store.uid(), titel: '', fach: 'sonstiges', papier: 'karo', seiten: 1, striche: [], text: '', geaendert: Date.now() };
  liste().unshift(n);
  store.save();
  return n;
}

// ---------- Zeichnen ----------
const breite = (s, pt) => s.d * (0.35 + (pt[2] ?? 0.5) * 1.1) * (1 + (pt[3] || 0) * 2.5);

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
    g.lineCap = 'butt';
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

function seitenBild(n, seite, typ = 'image/jpeg') {
  const c = document.createElement('canvas');
  c.width = B; c.height = SEITE;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, B, SEITE);
  g.translate(0, -seite * SEITE);
  for (const s of n.striche) strich(g, s);
  return new Promise((ok) => c.toBlob(ok, typ, 0.9));
}

// ---------- Übersicht ----------
function vorschau(n) {
  const c = h('canvas', { class: 'notiz-vorschau', 'aria-hidden': 'true' });
  requestAnimationFrame(() => {
    const w = c.clientWidth || 220;
    const dpr = devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(w * 0.72 * dpr);
    const g = c.getContext('2d');
    g.scale((w * dpr) / B, (w * dpr) / B);
    for (const s of n.striche) if (s.p[0]?.[1] < SEITE * 0.75) strich(g, s);
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
          const n = { id: store.uid(), titel: voll.name, fach: voll.fach, papier: voll.notiz.papier, seiten: voll.notiz.seiten, striche: voll.notiz.striche, text: voll.notiz.text, geaendert: Date.now() };
          liste().unshift(n); store.save();
          toast('Notiz übernommen.');
          ui.id = n.id; ctx.refresh();
        } catch (e) { toast(e.message, 'fehler'); }
      } }, 'Übernehmen')))));
}

function uebersicht(ctx) {
  const alle = liste().slice().sort((a, b) => b.geaendert - a.geaendert);
  const oeffnen = (id) => { ui.id = id; ctx.refresh(); scrollTo(0, 0); };
  return h('div', { class: 'seite' },
    h('header', { class: 'seiten-kopf' },
      h('h1', { class: 'handschrift' }, 'Notizen'),
      h('button', { class: 'knopf knopf-haupt', onclick: () => oeffnen(neueNotiz().id) }, icon('plus', 18), 'Neue Notiz')),
    alle.length
      ? h('div', { class: 'notiz-gitter' }, alle.map((n) =>
          h('button', { class: 'notiz-kachel', onclick: () => oeffnen(n.id) },
            h('span', { class: `notiz-kachel-blatt papier-${n.papier}` }, vorschau(n)),
            h('span', { class: 'notiz-kachel-titel' }, n.titel || 'Ohne Titel'),
            h('span', { class: 'notiz-kachel-info' }, `${FAECHER[n.fach]?.name || 'Sonstiges'} · ${datumKurz(n.geaendert)}`))))
      : h('div', { class: 'blatt leer' },
          h('p', null, 'Schreib mit dem Apple Pencil wie auf Papier: Mitschriften, Rechenwege, Skizzen. Aus jeder Notiz kann die KI Karteikarten machen.'),
          h('button', { class: 'knopf knopf-haupt', onclick: () => oeffnen(neueNotiz().id) }, icon('stift', 18), 'Erste Notiz anlegen')),
    posteingang(ctx));
}

// ---------- Editor ----------
function editor(ctx, n) {
  let striche = n.striche;
  const rueck = [];
  const vor = [];
  let k = 1, g, go, dpr = 1;

  const cv = h('canvas', { class: 'notiz-canvas', 'aria-hidden': 'true' });
  const ov = h('canvas', { class: 'notiz-overlay', role: 'img', 'aria-label': 'Zeichenfläche. Mit Stift oder Finger schreiben.' });
  const blatt = h('div', { class: `notiz-blatt papier-${n.papier}` }, cv, ov);

  function speichern() {
    n.striche = striche;
    n.geaendert = Date.now();
    store.save();
    knoepfeAktualisieren();
  }
  function aendern(neu) {
    rueck.push(striche);
    if (rueck.length > 80) rueck.shift();
    vor.length = 0;
    striche = neu;
    speichern();
  }
  function alles() {
    if (!g) return;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.restore();
    g.save();
    g.strokeStyle = 'rgba(27,42,92,.25)'; g.setLineDash([8, 8]); g.lineWidth = 1.5;
    for (let i = 1; i < n.seiten; i++) { g.beginPath(); g.moveTo(0, i * SEITE); g.lineTo(B, i * SEITE); g.stroke(); }
    g.restore();
    for (const s of striche) strich(g, s);
  }
  function groesse() {
    const w = blatt.clientWidth;
    if (!w) return;
    k = w / B;
    dpr = Math.min(devicePixelRatio || 1, 3);
    const hoehe = SEITE * n.seiten * k;
    for (const c of [cv, ov]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(hoehe * dpr);
      c.style.height = `${hoehe}px`;
    }
    blatt.style.height = `${hoehe}px`;
    blatt.style.setProperty('--raster', `${(n.papier === 'linien' ? 40 : 25) * k}px`);
    g = cv.getContext('2d'); go = ov.getContext('2d');
    g.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    go.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    alles();
  }
  const overlayLeeren = () => { go?.save(); go?.setTransform(1, 0, 0, 1, 0, 0); go?.clearRect(0, 0, ov.width, ov.height); go?.restore(); };

  // ----- Eingabe -----
  let akt = null;
  let stiftZeit = 0;
  const finger = new Map();
  let fingerStart = 0, fingerBewegt = false, fingerMax = 0, scrollY = null;

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
    const r = ui.dicke * 3 + 8;
    const neu = striche.filter((s) => !s.p.some((pt) => (pt[0] - x) ** 2 + (pt[1] - y) ** 2 < (r + s.d) ** 2));
    if (neu.length !== striche.length) { striche = neu; alles(); }
    overlayLeeren();
    go.strokeStyle = 'rgba(196,39,60,.7)'; go.lineWidth = 2 / k; go.setLineDash([]);
    go.beginPath(); go.arc(x, y, r, 0, Math.PI * 2); go.stroke();
  }

  function punkte(e) {
    const s = akt.s;
    const liste = e.getCoalescedEvents?.() || [e];
    const vorher = s.p.length;
    for (const ev of (liste.length ? liste : [e])) {
      const [x, y] = pos(ev);
      const letzt = s.p[s.p.length - 1];
      if (letzt && (letzt[0] - x) ** 2 + (letzt[1] - y) ** 2 < 0.36) continue;
      s.p.push([r1(x), r1(y), r2(druck(ev)), s.w === 'stift' ? neigung(ev) : 0]);
    }
    if (s.w === 'marker') { overlayLeeren(); strich(go, s); }
    else if (s.p.length > vorher) strich(g, s, Math.max(1, vorher));
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
    const wahl = (fn) => () => { fn(); leisteZeichnen(); setTimeout(menueZu, 220); menueEl?.querySelectorAll('.ist-aktiv').forEach((x) => x.classList.remove('ist-aktiv')); };
    menueEl = h('div', { class: 'schwebe-menue', role: 'toolbar', 'aria-label': 'Schnellauswahl', style: `left:${Math.min(cx - r.left + 22, r.width - 250)}px;top:${Math.max(cy - r.top - 70, 8)}px` },
      [['stift', 'Stift'], ['marker', 'Textmarker'], ['radierer', 'Radierer']].map(([id, name]) =>
        h('button', { class: `werkzeug ${w === id ? 'ist-aktiv' : ''}`, 'aria-label': name, onclick: wahl(() => werkzeug(id)) }, icon(id))),
      w !== 'radierer' && h('span', { class: 'schwebe-trenner' }),
      w !== 'radierer' && farben.map(([f, name]) =>
        h('button', { class: `farbpunkt ${(w === 'marker' ? ui.marker : ui.farbe) === f ? 'ist-aktiv' : ''}`, style: `--f:${f}`, 'aria-label': name, onclick: wahl(() => { if (w === 'marker') ui.marker = f; else ui.farbe = f; }) })),
      h('span', { class: 'schwebe-trenner' }),
      h('button', { class: 'werkzeug', 'aria-label': 'Rückgängig', onclick: () => { zurueck(); } }, icon('rueck')));
    menueEl.dataset.x = cx; menueEl.dataset.y = cy;
    blatt.append(menueEl);
    const breiteM = menueEl.offsetWidth;
    menueEl.style.left = `${Math.max(8, Math.min(cx - r.left + 22, r.width - breiteM - 8))}px`;
    clearTimeout(menueEl.zu);
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
    // Apple Pencil (Pro/2. Gen. mit M-iPad) schwebt: Vorschau, wo und wie dick der Strich wird
    overlayLeeren();
    if (e.pointerType !== 'pen' || akt) return;
    const [x, y] = pos(e);
    const w = ui.werkzeug;
    go.setLineDash([]);
    if (w === 'radierer') { go.strokeStyle = 'rgba(196,39,60,.6)'; go.lineWidth = 2 / k; go.beginPath(); go.arc(x, y, ui.dicke * 3 + 8, 0, Math.PI * 2); go.stroke(); return; }
    go.fillStyle = w === 'marker' ? ui.marker : ui.farbe;
    go.globalAlpha = 0.45;
    go.beginPath(); go.arc(x, y, Math.max(2, (w === 'marker' ? ui.dicke * 6 : ui.dicke * 1.2) / 2), 0, Math.PI * 2); go.fill();
    go.globalAlpha = 1;
  }

  ov.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'pen') { stiftZeit = Date.now(); if (!ui.nurStift) { ui.nurStift = true; stiftSchalter.checked = true; } }
    if (e.pointerType === 'touch' && (ui.nurStift || akt)) {
      // Handballen und Finger zeichnen nicht: Finger scrollen, Tipp mit 2 Fingern = rückgängig, 3 Finger = wiederholen
      finger.set(e.pointerId, e.clientY);
      if (finger.size === 1) { fingerStart = Date.now(); fingerBewegt = false; fingerMax = 1; scrollY = e.clientY; }
      fingerMax = Math.max(fingerMax, finger.size);
      return;
    }
    if (akt) return;
    clearTimeout(schwebe?.t); schwebe = null; menueZu();
    e.preventDefault();
    try { ov.setPointerCapture(e.pointerId); } catch { /* egal */ }
    const w = e.buttons & 32 ? 'radierer' : ui.werkzeug;
    if (w === 'radierer') { akt = { id: e.pointerId, radierer: true, vorher: striche }; radieren(e); return; }
    akt = { id: e.pointerId, s: { w, f: w === 'marker' ? ui.marker : ui.farbe, d: ui.dicke, p: [] } };
    overlayLeeren();
    punkte(e);
  });
  ov.addEventListener('pointermove', (e) => {
    if (finger.has(e.pointerId)) {
      const alt = finger.get(e.pointerId);
      if (Math.abs(e.clientY - alt) > 6) fingerBewegt = true;
      if (finger.size === 1 && scrollY !== null) { scrollBy(0, scrollY - e.clientY); scrollY = e.clientY; }
      return;
    }
    if (!akt) { hover(e); return; }
    if (e.pointerId !== akt.id) return;
    if (akt.radierer) radieren(e); else punkte(e);
  });
  const ende = (e) => {
    if (finger.has(e.pointerId)) {
      finger.delete(e.pointerId);
      if (!finger.size) {
        if (!fingerBewegt && Date.now() - fingerStart < 350) { if (fingerMax === 2) zurueck(); else if (fingerMax === 3) wieder(); }
        scrollY = null;
      }
      return;
    }
    if (!akt || e.pointerId !== akt.id) return;
    const a = akt;
    akt = null;
    overlayLeeren();
    if (a.radierer) {
      if (striche !== a.vorher) { const neu = striche; striche = a.vorher; aendern(neu); }
      return;
    }
    if (!a.s.p.length) return;
    if (a.s.w === 'marker') strich(g, a.s); else strich(g, a.s, a.s.p.length, true);
    aendern([...striche, a.s]);
  };
  ov.addEventListener('pointerup', ende);
  ov.addEventListener('pointercancel', ende);
  ov.addEventListener('pointerleave', (e) => { if (!akt && e.pointerType === 'pen') { overlayLeeren(); clearTimeout(schwebe?.t); schwebe = null; } });
  ov.addEventListener('contextmenu', (e) => e.preventDefault());

  function zurueck() { if (!rueck.length) return; vor.push(striche); striche = rueck.pop(); alles(); speichern(); }
  function wieder() { if (!vor.length) return; rueck.push(striche); striche = vor.pop(); alles(); speichern(); }

  const taste = (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) wieder(); else zurueck(); }
    else if (e.key === 'e') werkzeug('radierer');
    else if (e.key === 'p') werkzeug('stift');
    else if (e.key === 'm') werkzeug('marker');
  };
  document.addEventListener('keydown', taste);
  const beobachter = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => groesse()) : null;
  beobachter?.observe(blatt);
  ctx.onLeave(() => { document.removeEventListener('keydown', taste); beobachter?.disconnect(); store.jetztSpeichern(); });

  // ----- Werkzeugleiste -----
  const leiste = h('div', { class: 'notiz-leiste', role: 'toolbar', 'aria-label': 'Werkzeuge' });
  const undoK = h('button', { class: 'knopf-icon', 'aria-label': 'Rückgängig', onclick: zurueck }, icon('rueck'));
  const redoK = h('button', { class: 'knopf-icon', 'aria-label': 'Wiederholen', onclick: wieder }, icon('vor'));
  function knoepfeAktualisieren() { undoK.disabled = !rueck.length; redoK.disabled = !vor.length; }
  function werkzeug(w) {
    if (w !== ui.werkzeug) { ui.letztes = ui.werkzeug; ui.werkzeug = w; }
    leisteZeichnen();
  }
  const stiftSchalter = h('input', { type: 'checkbox', checked: ui.nurStift, onchange: (e) => { ui.nurStift = e.target.checked; } });

  function leisteZeichnen() {
    const w = ui.werkzeug;
    const farben = w === 'marker' ? MARKER : FARBEN;
    const aktiv = w === 'marker' ? ui.marker : ui.farbe;
    leiste.replaceChildren(
      h('div', { class: 'leiste-gruppe' }, [['stift', 'Stift', 'stift'], ['marker', 'Textmarker', 'marker'], ['radierer', 'Radierer', 'radierer']].map(([id, name, ic]) =>
        h('button', { class: `werkzeug ${w === id ? 'ist-aktiv' : ''}`, 'aria-pressed': String(w === id), 'aria-label': name, title: name, onclick: () => werkzeug(id) }, icon(ic)))),
      w !== 'radierer' && h('div', { class: 'leiste-gruppe' }, farben.map(([f, name]) =>
        h('button', { class: `farbpunkt ${aktiv === f ? 'ist-aktiv' : ''}`, style: `--f:${f}`, 'aria-label': name, 'aria-pressed': String(aktiv === f), onclick: () => { if (w === 'marker') ui.marker = f; else ui.farbe = f; leisteZeichnen(); } }))),
      h('div', { class: 'leiste-gruppe' }, DICKEN.map(([d, name]) =>
        h('button', { class: `dicke ${ui.dicke === d ? 'ist-aktiv' : ''}`, 'aria-label': name, 'aria-pressed': String(ui.dicke === d), onclick: () => { ui.dicke = d; leisteZeichnen(); } }, h('span', { style: { width: `${d * 2.2 + 2}px`, height: `${d * 2.2 + 2}px` } })))),
      h('div', { class: 'leiste-gruppe' }, undoK, redoK));
    knoepfeAktualisieren();
    tauschK.setAttribute('aria-label', `Wechseln zu ${ui.letztes === 'radierer' ? 'Radierer' : ui.letztes === 'marker' ? 'Textmarker' : 'Stift'}`);
  }
  // Schnellwechsel am Rand – Ersatz für Doppeltippen/Drücken am Stift, das Webseiten nicht erreicht
  const tauschK = h('button', { class: 'notiz-tausch', onclick: () => werkzeug(ui.letztes) }, icon('tausch', 24));

  // ----- Menü -----
  async function karten() {
    if (!(await kiVerfuegbar())) { toast('Dafür braucht die App die KI.', 'fehler'); return; }
    if (!striche.length) { toast('Die Notiz ist noch leer.'); return; }
    toast('Ich lese deine Notiz …');
    try {
      const bilder = [];
      for (let i = 0; i < Math.min(n.seiten, 4); i++) bilder.push(await seitenBild(n, i));
      const r = await stoffErkennen(bilder);
      if (!r.karten.length) { toast('Ich habe nichts zum Lernen gefunden.', 'fehler'); return; }
      const deck = store.addDeck(n.titel || r.titel, n.fach);
      const neu = store.addCards(deck.id, r.karten);
      toast(`${mehrzahl(neu.length, 'Karte', 'Karten')} in „${deck.name}“ erstellt.`);
      ctx.go('karten', { deckId: deck.id });
    } catch (e) {
      toast(e?.message || 'Das hat nicht geklappt.', 'fehler');
    }
  }
  async function teilen() {
    const dateien = [];
    for (let i = 0; i < n.seiten; i++) {
      const blob = await seitenBild(n, i, 'image/png');
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
    const zu = modal('Notiz', [
      h('h3', null, 'Papier'),
      h('div', { class: 'reihe' }, Object.entries(PAPIERE).map(([id, name]) =>
        h('button', { class: `knopf ${n.papier === id ? 'knopf-haupt' : ''}`, onclick: () => { n.papier = id; blatt.className = `notiz-blatt papier-${id}`; groesse(); speichern(); zu(); } }, name))),
      h('label', { class: 'schalter-zeile' }, stiftSchalter, h('span', null, h('strong', null, 'Nur mit dem Stift schreiben'), h('small', null, 'Finger und Handballen zeichnen dann nicht, sondern scrollen. Schaltet sich ein, sobald du den Apple Pencil benutzt.'))),
      h('div', { class: 'reihe' },
        h('button', { class: 'knopf', onclick: () => { zu(); karten(); } }, icon('karten', 18), 'Karteikarten daraus machen'),
        h('button', { class: 'knopf', onclick: () => { zu(); teilen(); } }, 'Als Bild teilen'),
        istServerModus() && h('button', { class: 'knopf', onclick: () => { zu(); sendenDialog({ titel: `„${n.titel || 'Notiz'}“ schicken`, beschreibung: 'Die Empfänger bekommen eine Kopie deiner Notiz in ihre Notizen.', daten: { typ: 'notiz', name: n.titel || 'Notiz', fach: n.fach, notiz: { papier: n.papier, seiten: n.seiten, text: n.text, striche } } }); } }, icon('teilen', 18), 'Schicken'),
        h('button', { class: 'knopf', onclick: () => { n.seiten += 1; groesse(); speichern(); zu(); } }, icon('plus', 18), 'Seite anhängen')),
      h('div', { class: 'reihe' },
        h('button', { class: 'knopf knopf-gefahr-leise', onclick: () => { zu(); if (striche.length) { aendern([]); alles(); toast('Geleert – mit Rückgängig holst du alles zurück.'); } } }, 'Alles wegradieren'),
        h('button', { class: 'knopf knopf-gefahr-leise', onclick: async () => {
          zu();
          if (await nachfragen('Notiz löschen?', `„${n.titel || 'Ohne Titel'}“ wird gelöscht. Das lässt sich nicht rückgängig machen.`, 'Löschen', { gefahr: true })) {
            store.getState().notizen = liste().filter((x) => x.id !== n.id);
            store.save(); ui.id = null; ctx.refresh();
          }
        } }, icon('muell', 18), 'Notiz löschen')),
    ]);
  }

  leisteZeichnen();
  queueMicrotask(groesse);
  if (!n.titel && !n.striche.length) queueMicrotask(() => titel.focus());

  const titel = h('input', { type: 'text', class: 'notiz-titel', value: n.titel, placeholder: 'Titel', maxlength: '80', 'aria-label': 'Titel der Notiz', oninput: (e) => { n.titel = e.target.value; speichern(); } });
  return h('div', { class: 'seite seite-notiz' },
    h('div', { class: 'notiz-kopf' },
      h('button', { class: 'knopf knopf-leise', onclick: () => { ui.id = null; ctx.refresh(); } }, icon('zurueck', 18), 'Notizen'),
      titel,
      h('select', { class: 'notiz-fach', 'aria-label': 'Fach', onchange: (e) => { n.fach = e.target.value; speichern(); } },
        Object.entries(FAECHER).map(([id, f]) => h('option', { value: id, selected: id === n.fach }, f.name))),
      h('button', { class: 'knopf-icon', 'aria-label': 'Mehr', onclick: menue }, icon('mehr'))),
    leiste,
    h('details', { class: 'notiz-text', open: Boolean(n.text) },
      h('summary', null, 'Getippter Text'),
      h('textarea', { rows: '4', placeholder: 'Hier kannst du tippen – oder mit dem Pencil hineinschreiben (Kritzeln wird zu Text).', oninput: (e) => { n.text = e.target.value; speichern(); } }, n.text)),
    blatt,
    h('button', { class: 'knopf knopf-leise seite-dazu', onclick: () => { n.seiten += 1; groesse(); speichern(); scrollBy({ top: 400, behavior: 'smooth' }); } }, icon('plus', 18), 'Seite anhängen'),
    tauschK);
}

export function notizen(ctx) {
  if (ctx.optionen?.neu) ui.id = null;
  const n = ui.id && finden(ui.id);
  if (!n) ui.id = null;
  return n ? editor(ctx, n) : uebersicht(ctx);
}
