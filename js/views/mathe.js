import { h, icon, toast, mehrzahl } from '../dom.js';
import * as store from '../store.js';
import { calc, compile, formatNumber, CalcError } from '../calc.js';
import { kiVerfuegbar, bildVorbereiten, matheErklaeren, uebungenErzeugen } from '../ai.js';

const ui = {
  tab: 'rechner',
  rechner: { eingabe: '', fehler: '', fertig: false, ergebnis: '' },
  plot: { fns: ['x² − 4', '', ''], cx: 0, cy: 0, breite: 16, marke: null },
  erkl: { text: '', foto: null, laden: false, ergebnis: null, fehler: '', uebungen: null, uebLaden: false, ki: undefined, lauf: 0 },
};

// ====================== Taschenrechner ======================
const TASTEN = [
  ['sin', 'cos', 'tan', '√', 'x²'],
  ['ln', 'log', 'π', 'e', 'xʸ'],
  ['(', ')', '%', 'n!', 'GRAD'],
  ['7', '8', '9', '÷', '⌫'],
  ['4', '5', '6', '×', 'AC'],
  ['1', '2', '3', '−', '='],
  ['0', ',', 'Ans', '+'],
];
const EINFUEGEN = { sin: 'sin(', cos: 'cos(', tan: 'tan(', '√': '√(', 'x²': '²', ln: 'ln(', log: 'log(', 'xʸ': '^', 'n!': '!' };
const HAENGT_AN = new Set(['+', '−', '×', '÷', 'xʸ', 'x²', 'n!', '%']);
const VORLESEN = { '⌫': 'Letztes Zeichen löschen', AC: 'Alles löschen', '=': 'Ausrechnen', '÷': 'geteilt', '×': 'mal', '−': 'minus', '+': 'plus', ',': 'Komma', 'x²': 'Quadrat', 'xʸ': 'hoch', '√': 'Wurzel', 'n!': 'Fakultät', 'π': 'Pi', Ans: 'Letztes Ergebnis' };

function rechner(ctx) {
  const r = ui.rechner;
  const zustand = store.getState().rechner;
  const umgebung = () => ({ ans: zustand.ans ?? 0, deg: zustand.grad !== false });

  const eingabe = h('input', {
    type: 'text', class: 'rechner-eingabe', value: r.eingabe, inputmode: 'none', autocomplete: 'off', spellcheck: 'false',
    'aria-label': 'Rechnung', placeholder: '0',
    oninput: (e) => { r.eingabe = e.target.value; r.fertig = false; r.fehler = ''; zeigen(); },
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); rechnen(); } },
  });
  const ausgabe = h('output', { class: 'rechner-ergebnis', 'aria-live': 'polite' });
  const verlauf = h('ul', { class: 'rechner-verlauf' });

  function zeigen() {
    if (eingabe.value !== r.eingabe) eingabe.value = r.eingabe;
    ausgabe.classList.toggle('ist-fehler', Boolean(r.fehler));
    ausgabe.classList.toggle('ist-vorschau', !r.fehler && !r.fertig);
    if (r.fehler) { ausgabe.textContent = r.fehler; return; }
    if (r.fertig) { ausgabe.textContent = `= ${r.ergebnis}`; return; }
    try {
      ausgabe.textContent = r.eingabe.trim() ? `= ${formatNumber(calc(mitKlammern(r.eingabe), umgebung()))}` : '';
    } catch {
      ausgabe.textContent = '';
    }
  }
  function verlaufZeigen() {
    verlauf.replaceChildren(...zustand.verlauf.map((v) =>
      h('li', null, h('button', { class: 'verlauf-zeile', title: 'Ergebnis übernehmen', onclick: () => { r.eingabe = r.fertig ? v.ergebnis : r.eingabe + v.ergebnis; r.fertig = false; r.fehler = ''; zeigen(); } },
        h('span', null, v.rechnung), h('b', null, `= ${v.ergebnis}`)))));
  }
  function mitKlammern(text) {
    const offen = (text.match(/\(/g) || []).length - (text.match(/\)/g) || []).length;
    return offen > 0 ? text + ')'.repeat(offen) : text;
  }
  function rechnen() {
    if (!r.eingabe.trim()) return;
    const rechnung = mitKlammern(r.eingabe);
    try {
      const wert = calc(rechnung, umgebung());
      r.ergebnis = formatNumber(wert);
      r.eingabe = rechnung;
      r.fertig = true;
      r.fehler = '';
      store.setRechner({ ans: wert });
      store.rechnerMerken({ rechnung, ergebnis: r.ergebnis });
      verlaufZeigen();
    } catch (e) {
      r.fehler = e instanceof CalcError ? e.message : 'Das kann ich nicht rechnen.';
    }
    zeigen();
  }
  function druecke(taste) {
    r.fehler = '';
    if (taste === 'AC') { r.eingabe = ''; r.fertig = false; r.ergebnis = ''; }
    else if (taste === '=') { rechnen(); return; }
    else if (taste === '⌫') {
      r.fertig = false;
      r.eingabe = r.eingabe.replace(/(sin\(|cos\(|tan\(|ln\(|log\(|√\(|Ans|.)$/, '');
    } else if (taste === 'GRAD') {
      store.setRechner({ grad: zustand.grad === false });
      gradKnopf.textContent = zustand.grad === false ? 'Bogen' : 'Grad';
      gradKnopf.setAttribute('aria-label', zustand.grad === false ? 'Winkel im Bogenmaß. Auf Grad umstellen' : 'Winkel in Grad. Auf Bogenmaß umstellen');
    } else {
      if (r.fertig) { r.eingabe = HAENGT_AN.has(taste) ? 'Ans' : ''; r.fertig = false; }
      r.eingabe += EINFUEGEN[taste] ?? taste;
    }
    zeigen();
  }

  let gradKnopf;
  const tasten = h('div', { class: 'tasten' }, TASTEN.flat().map((t) => {
    const art = /^[0-9,]$/.test(t) ? 'zahl' : t === '=' ? 'gleich' : ['÷', '×', '−', '+'].includes(t) ? 'op' : ['AC', '⌫'].includes(t) ? 'loesch' : 'funk';
    const knopf = h('button', { class: `taste taste-${art}`, 'aria-label': VORLESEN[t] || null, onclick: () => druecke(t) },
      t === 'GRAD' ? (zustand.grad === false ? 'Bogen' : 'Grad') : t);
    if (t === 'GRAD') {
      gradKnopf = knopf;
      knopf.setAttribute('aria-label', zustand.grad === false ? 'Winkel im Bogenmaß. Auf Grad umstellen' : 'Winkel in Grad. Auf Bogenmaß umstellen');
    }
    return knopf;
  }));

  zeigen();
  verlaufZeigen();
  return h('div', { class: 'rechner-layout' },
    h('div', { class: 'rechner' },
      h('div', { class: 'rechner-anzeige' }, eingabe, ausgabe),
      tasten),
    h('section', { class: 'rechner-neben' },
      h('div', { class: 'abschnitt-kopf' },
        h('h2', null, 'Verlauf'),
        zustand.verlauf.length > 0 && h('button', { class: 'knopf knopf-leise', onclick: () => { store.setRechner({ verlauf: [] }); ctx.refresh(); } }, 'Leeren')),
      zustand.verlauf.length ? verlauf : h('p', { class: 'hinweis' }, 'Deine letzten Rechnungen stehen hier. Tipp auf eine, um das Ergebnis zu übernehmen.')));
}

// ====================== Funktionen zeichnen ======================
const KURVEN = [
  { name: 'f', farbe: '--koenigsblau', strich: [] },
  { name: 'g', farbe: '--rotstift', strich: [9, 5] },
  { name: 'h', farbe: '--gruen', strich: [2, 5] },
];

function schritt(spanne) {
  const roh = spanne / 8;
  const zehner = Math.pow(10, Math.floor(Math.log10(roh)));
  const n = roh / zehner;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * zehner;
}

function plotter(ctx) {
  const p = ui.plot;
  let kompiliert = [];
  const fehler = KURVEN.map(() => h('p', { class: 'fehlertext', role: 'status' }));
  const ablesen = h('p', { class: 'ablesen', 'aria-live': 'polite' }, 'Tipp in das Bild, um Werte abzulesen. Ziehen verschiebt, zwei Finger oder das Mausrad zoomen.');
  const canvas = h('canvas', { class: 'plot', role: 'img', 'aria-label': 'Koordinatensystem mit den eingegebenen Funktionen' });

  function einlesen() {
    kompiliert = p.fns.map((text, i) => {
      fehler[i].textContent = '';
      if (!text.trim()) return null;
      try {
        return compile(text);
      } catch (e) {
        fehler[i].textContent = e instanceof CalcError ? e.message : 'Das verstehe ich nicht.';
        return null;
      }
    });
  }

  function zeichnen() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = globalThis.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = rect.width, H = rect.height;
    const stil = getComputedStyle(document.documentElement);
    const farbe = (n) => stil.getPropertyValue(n).trim();
    const skala = W / p.breite;
    const xmin = p.cx - p.breite / 2, xmax = p.cx + p.breite / 2;
    const hoehe = H / skala;
    const ymin = p.cy - hoehe / 2, ymax = p.cy + hoehe / 2;
    const px = (x) => (x - xmin) * skala;
    const py = (y) => H - (y - ymin) * skala;

    g.fillStyle = farbe('--blatt');
    g.fillRect(0, 0, W, H);

    const s = schritt(p.breite);
    const zahl = (v) => formatNumber(parseFloat(v.toPrecision(10)));
    g.lineWidth = 1;
    g.strokeStyle = farbe('--karo');
    g.fillStyle = farbe('--grau');
    g.font = '12px system-ui, sans-serif';
    const achseY = Math.min(Math.max(py(0), 0), H);
    const achseX = Math.min(Math.max(px(0), 0), W);
    g.beginPath();
    for (let x = Math.ceil(xmin / s) * s; x <= xmax; x += s) { g.moveTo(px(x), 0); g.lineTo(px(x), H); }
    for (let y = Math.ceil(ymin / s) * s; y <= ymax; y += s) { g.moveTo(0, py(y)); g.lineTo(W, py(y)); }
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = achseY > H - 18 ? 'bottom' : 'top';
    for (let x = Math.ceil(xmin / s) * s; x <= xmax; x += s) {
      if (Math.abs(x) > s / 2) g.fillText(zahl(x), px(x), achseY + (achseY > H - 18 ? -4 : 4));
    }
    g.textBaseline = 'middle';
    g.textAlign = achseX < 34 ? 'left' : 'right';
    for (let y = Math.ceil(ymin / s) * s; y <= ymax; y += s) {
      if (Math.abs(y) > s / 2) g.fillText(zahl(y), achseX + (achseX < 34 ? 6 : -6), py(y));
    }
    g.strokeStyle = farbe('--tinte');
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, py(0)); g.lineTo(W, py(0));
    g.moveTo(px(0), 0); g.lineTo(px(0), H);
    g.stroke();

    const env = { deg: false };
    kompiliert.forEach((f, i) => {
      if (!f) return;
      g.strokeStyle = farbe(KURVEN[i].farbe);
      g.lineWidth = 2.5;
      g.setLineDash(KURVEN[i].strich);
      g.beginPath();
      let vorher = null;
      for (let i2 = 0; i2 <= W; i2 += 1) {
        const y = py(f(xmin + i2 / skala, env));
        if (!Number.isFinite(y) || (vorher !== null && Math.abs(y - vorher) > H * 1.5)) { vorher = null; continue; }
        if (vorher === null) g.moveTo(i2, y); else g.lineTo(i2, y);
        vorher = y;
      }
      g.stroke();
      g.setLineDash([]);
    });

    if (p.marke !== null && p.marke >= xmin && p.marke <= xmax) {
      g.strokeStyle = farbe('--grau');
      g.lineWidth = 1;
      g.setLineDash([4, 4]);
      g.beginPath(); g.moveTo(px(p.marke), 0); g.lineTo(px(p.marke), H); g.stroke();
      g.setLineDash([]);
      const teile = kompiliert.map((f, i) => {
        if (!f) return null;
        const y = f(p.marke, env);
        if (Number.isFinite(y)) {
          g.fillStyle = farbe(KURVEN[i].farbe);
          g.beginPath(); g.arc(px(p.marke), py(y), 4.5, 0, Math.PI * 2); g.fill();
        }
        return `${KURVEN[i].name}(x) = ${Number.isFinite(y) ? formatNumber(Math.round(y * 1000) / 1000) : 'nicht definiert'}`;
      }).filter(Boolean);
      ablesen.textContent = teile.length ? `x = ${formatNumber(Math.round(p.marke * 1000) / 1000)}:  ${teile.join(',  ')}` : 'Gib oben eine Funktion ein.';
    }
  }

  // Verschieben, Zoomen, Ablesen
  const finger = new Map();
  let abstand = 0, bewegt = false;
  const xBei = (e) => {
    const rect = canvas.getBoundingClientRect();
    return p.cx - p.breite / 2 + ((e.clientX - rect.left) / rect.width) * p.breite;
  };
  const zoom = (faktor) => { p.breite = Math.min(2000, Math.max(0.02, p.breite * faktor)); zeichnen(); };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    finger.set(e.pointerId, { x: e.clientX, y: e.clientY });
    bewegt = false;
    if (finger.size === 2) { const [a, b] = [...finger.values()]; abstand = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  canvas.addEventListener('pointermove', (e) => {
    const alt = finger.get(e.pointerId);
    if (!alt) { if (e.pointerType === 'mouse') { p.marke = xBei(e); zeichnen(); } return; }
    const rect = canvas.getBoundingClientRect();
    if (finger.size === 1) {
      const dx = e.clientX - alt.x, dy = e.clientY - alt.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) bewegt = true;
      if (bewegt) { p.cx -= (dx / rect.width) * p.breite; p.cy += (dy / rect.width) * p.breite; finger.set(e.pointerId, { x: e.clientX, y: e.clientY }); zeichnen(); }
    } else if (finger.size === 2) {
      finger.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...finger.values()];
      const neu = Math.hypot(a.x - b.x, a.y - b.y);
      if (abstand > 0 && neu > 0) zoom(abstand / neu);
      abstand = neu;
      bewegt = true;
    }
  });
  const los = (e) => {
    if (finger.has(e.pointerId) && finger.size === 1 && !bewegt) { p.marke = xBei(e); zeichnen(); }
    finger.delete(e.pointerId);
  };
  canvas.addEventListener('pointerup', los);
  canvas.addEventListener('pointercancel', (e) => finger.delete(e.pointerId));
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15); }, { passive: false });

  const beobachter = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(zeichnen) : null;
  beobachter?.observe(canvas);
  ctx.onLeave(() => beobachter?.disconnect());
  einlesen();
  queueMicrotask(zeichnen);

  return h('div', { class: 'plot-layout' },
    h('div', { class: 'plot-eingaben' }, KURVEN.map((k, i) =>
      h('div', { class: 'plot-zeile' },
        h('label', { for: `fn-${i}`, class: `plot-name kurve-${i}` }, `${k.name}(x) =`),
        h('input', { id: `fn-${i}`, type: 'text', value: p.fns[i], autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', placeholder: i === 0 ? 'z. B. x² − 4' : i === 1 ? 'z. B. 2x + 1' : 'z. B. sin(x)',
          oninput: (e) => { p.fns[i] = e.target.value; einlesen(); zeichnen(); } }),
        fehler[i]))),
    h('div', { class: 'plot-rahmen' },
      canvas,
      h('div', { class: 'plot-knoepfe' },
        h('button', { class: 'knopf-icon', 'aria-label': 'Vergrößern', onclick: () => zoom(1 / 1.4) }, icon('plus')),
        h('button', { class: 'knopf-icon', 'aria-label': 'Verkleinern', onclick: () => zoom(1.4) }, icon('halb')),
        h('button', { class: 'knopf knopf-leise', onclick: () => { Object.assign(p, { cx: 0, cy: 0, breite: 16, marke: null }); zeichnen(); } }, 'Zurücksetzen'))),
    ablesen,
    h('p', { class: 'hinweis' }, 'Schreibweise: x², x^3, √(x), 2x, sin(x), 1/x. Winkel zählen hier im Bogenmaß.'));
}

// ====================== Aufgabe erklären (KI) ======================
function matheStapel() {
  return store.getState().decks.find((d) => d.fach === 'mathe' && d.name === 'Mathe-Übungen') || store.addDeck('Mathe-Übungen', 'mathe');
}

async function erklaerenLassen(ctx) {
  const e = ui.erkl;
  const lauf = ++e.lauf;
  Object.assign(e, { laden: true, fehler: '', ergebnis: null, uebungen: null });
  ctx.refresh();
  try {
    const bilder = e.foto ? [await bildVorbereiten(e.foto.datei)] : [];
    const ergebnis = await matheErklaeren(e.text.trim(), bilder);
    if (lauf !== e.lauf) return;
    e.ergebnis = ergebnis;
  } catch (err) {
    if (lauf !== e.lauf) return;
    e.fehler = err?.message || 'Das hat nicht geklappt. Versuch es noch mal.';
  }
  e.laden = false;
  if (location.hash === '#mathe') ctx.refresh();
}

async function uebungenHolen(ctx) {
  const e = ui.erkl;
  e.uebLaden = true;
  ctx.refresh();
  try {
    e.uebungen = await uebungenErzeugen(e.ergebnis.aufgabe);
  } catch (err) {
    toast(err?.message || 'Das hat nicht geklappt.', 'fehler');
  }
  e.uebLaden = false;
  if (location.hash === '#mathe') ctx.refresh();
}

function erklaeren(ctx) {
  const e = ui.erkl;
  kiVerfuegbar().then((weg) => {
    if (weg === e.ki) return;
    e.ki = weg;
    if (location.hash === '#mathe' && ui.tab === 'erklaeren') ctx.refresh();
  });

  const foto = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: (ev) => {
    const datei = ev.target.files[0];
    if (!datei) return;
    if (e.foto) URL.revokeObjectURL(e.foto.url);
    e.foto = { datei, url: URL.createObjectURL(datei) };
    ctx.refresh();
  } });

  const formular = h('form', { class: 'blatt', onsubmit: (ev) => { ev.preventDefault(); if (e.text.trim() || e.foto) erklaerenLassen(ctx); } },
    h('div', { class: 'feld' },
      h('label', { for: 'aufgabe' }, 'Deine Aufgabe'),
      h('textarea', { id: 'aufgabe', rows: '3', placeholder: 'z. B. Löse die Gleichung 2x + 7 = 19', oninput: (ev) => { e.text = ev.target.value; } }, e.text)),
    foto,
    e.foto && h('ul', { class: 'fotos' }, h('li', null,
      h('img', { src: e.foto.url, alt: 'Foto der Aufgabe' }),
      h('button', { type: 'button', class: 'knopf-icon foto-weg', 'aria-label': 'Foto entfernen', onclick: () => { URL.revokeObjectURL(e.foto.url); e.foto = null; ctx.refresh(); } }, icon('x', 18)))),
    h('div', { class: 'reihe' },
      h('button', { class: 'knopf knopf-haupt', type: 'submit', disabled: e.laden || !e.ki }, e.laden ? 'Ich rechne …' : 'Schritt für Schritt erklären'),
      h('button', { class: 'knopf', type: 'button', onclick: () => foto.click() }, icon('scan', 18), e.foto ? 'Anderes Foto' : 'Foto der Aufgabe')));

  const ergebnis = e.ergebnis && h('section', { class: 'blatt erklaerung' },
    h('p', { class: 'erkl-aufgabe' }, e.ergebnis.aufgabe),
    h('ol', { class: 'schritte' }, e.ergebnis.schritte.map((s) =>
      h('li', null, s.titel && h('strong', null, s.titel), h('p', null, s.text)))),
    e.ergebnis.ergebnis && h('p', { class: 'erkl-ergebnis' }, 'Ergebnis: ', h('mark', null, e.ergebnis.ergebnis)),
    e.ergebnis.tipp && h('p', { class: 'erkl-tipp' }, h('strong', null, 'Merke: '), e.ergebnis.tipp),
    h('div', { class: 'reihe' },
      h('button', { class: 'knopf', onclick: () => {
        const deck = matheStapel();
        store.addCards(deck.id, [{ front: e.ergebnis.aufgabe, back: e.ergebnis.ergebnis || 'siehe Rechenweg', note: e.ergebnis.schritte.map((s) => s.titel).filter(Boolean).join(' → ') }]);
        toast(`Als Karte in „${deck.name}“ gespeichert.`);
      } }, icon('karten', 18), 'Als Karte speichern'),
      h('button', { class: 'knopf', disabled: e.uebLaden, onclick: () => uebungenHolen(ctx) }, e.uebLaden ? 'Ich denke mir Aufgaben aus …' : 'Ähnliche Aufgaben zum Üben')));

  const uebungen = e.uebungen?.length > 0 && h('section', { class: 'blatt' },
    h('h2', null, 'Zum Üben'),
    h('ol', { class: 'uebungen' }, e.uebungen.map((u) =>
      h('li', null, h('p', null, u.front),
        h('details', null, h('summary', null, 'Lösung zeigen'), h('p', null, h('b', null, u.back)), u.note && h('p', { class: 'hinweis' }, u.note))))),
    h('button', { class: 'knopf', onclick: () => {
      const deck = matheStapel();
      const neu = store.addCards(deck.id, e.uebungen);
      toast(`${mehrzahl(neu.length, 'Karte', 'Karten')} in „${deck.name}“ gespeichert.`);
      e.uebungen = null;
      ctx.refresh();
    } }, icon('karten', 18), 'Alle als Karten speichern'));

  return h('div', { class: 'erkl-layout' },
    e.ki === null && h('div', { class: 'blatt meldung' },
      h('p', null, h('strong', null, 'Für Erklärungen braucht die App einen KI-Schlüssel.'), ' Rechner und Funktionen funktionieren auch ohne.'),
      h('a', { class: 'knopf knopf-haupt', href: '#einstellungen' }, 'Schlüssel hinterlegen')),
    formular,
    e.fehler && h('div', { class: 'blatt meldung meldung-fehler', role: 'alert' }, h('p', null, e.fehler)),
    e.laden && h('div', { class: 'blatt warten', role: 'status' }, h('div', { class: 'stift-laeuft', 'aria-hidden': 'true' }), h('p', null, 'Ich schreibe den Rechenweg auf …')),
    ergebnis,
    uebungen);
}

// ====================== Rahmen mit Reitern ======================
const TABS = [
  { id: 'rechner', name: 'Rechner', view: rechner },
  { id: 'plotter', name: 'Funktionen', view: plotter },
  { id: 'erklaeren', name: 'Erklären', view: erklaeren },
];

export function mathe(ctx) {
  if (ctx.optionen?.tab) ui.tab = ctx.optionen.tab;
  const aktiv = TABS.find((t) => t.id === ui.tab) || TABS[0];
  return h('div', { class: 'seite seite-mathe' },
    h('header', { class: 'seiten-kopf' }, h('h1', { class: 'handschrift' }, 'Mathe')),
    h('div', { class: 'reiter', role: 'tablist', 'aria-label': 'Mathe-Werkzeuge' }, TABS.map((t) =>
      h('button', { role: 'tab', 'aria-selected': String(t.id === aktiv.id), class: 'reiter-knopf', onclick: () => { ui.tab = t.id; ctx.refresh(); } }, t.name))),
    h('div', { role: 'tabpanel', 'aria-label': aktiv.name }, aktiv.view(ctx)));
}
