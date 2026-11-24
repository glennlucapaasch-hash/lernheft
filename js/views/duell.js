// Live-Quiz (wie Kahoot): gleiche Fragen für alle, wer schneller richtig antwortet, bekommt mehr Punkte.
// Mit Beamer-Modus (Host zeigt nur die große Ansicht), Antwort-Serien-Bonus, Emoji-Reaktionen und Siegertreppchen.
import { h, icon, toast } from '../dom.js';
import * as store from '../store.js';
import { FAECHER } from '../store.js';
import { shuffle, mcOptionen } from '../exam.js';
import { kiVerfuegbar, quizFragen } from '../ai.js';

const ui = { code: null, stand: null, deckId: 'alle', eingabe: '', gezaehlt: null, quelle: 'stapel', thema: '', beamer: false, gesehen: new Set() };
const FORMEN = [['▲', 'rot'], ['◆', 'blau'], ['●', 'gelb'], ['■', 'gruen']];
const EMOJIS = ['🔥', '😂', '😱', '👏', '🤯', '💪'];

async function api(pfad, body) {
  const r = await fetch(pfad, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-lernheft': '1' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || 'Das hat nicht geklappt.');
  return d;
}

function fragenBauen() {
  const karten = store.getState().cards.filter((c) => c.front && c.back && (ui.deckId === 'alle' || c.deckId === ui.deckId));
  const fragen = [];
  for (const c of shuffle(karten)) {
    const pool = karten.filter((x) => x.deckId === c.deckId).map((x) => x.back);
    const opts = mcOptionen(c.back, pool) || mcOptionen(c.back, karten.map((x) => x.back));
    if (opts) fragen.push({ frage: c.front, opts, antwort: c.back });
    if (fragen.length >= 10) break;
  }
  return fragen;
}

function setzen(ctx, stand) {
  ui.stand = stand;
  ui.code = stand.code;
  if (stand.phase === 'ende' && ui.gezaehlt !== stand.code && stand.dabei) {
    ui.gezaehlt = stand.code;
    const sp = store.getState().spiele;
    sp.duelle = (sp.duelle || 0) + 1;
    if (stand.spieler[0]?.name === ctx.konto?.name && stand.spieler[0].punkte > 0) sp.duellSiege = (sp.duellSiege || 0) + 1;
    store.save();
  }
  reaktionenZeigen(stand.reaktionen || []);
  const { reaktionen, rest, countdown, ...ohne } = stand;
  const vergleich = JSON.stringify({ ...ohne, cd: Math.ceil(countdown / 1000) });
  // Uhr und Zeitbalken direkt aktualisieren, ohne die ganze Seite neu zu zeichnen (sonst flackern die Animationen)
  const uhr = document.querySelector('.spiel .blitz-uhr');
  if (uhr) { const sek = Math.ceil(rest / 1000); uhr.textContent = `${sek} s`; uhr.classList.toggle('uhr-knapp', sek <= 5); }
  document.querySelector('.duell-zeit')?.style.setProperty('--rest', String(rest / 15000));
  if (vergleich !== ui.letzt && ['#spiele', '#live'].includes(location.hash)) { ui.letzt = vergleich; ctx.refresh(); }
}

function reaktionenZeigen(liste) {
  for (const r of liste) {
    if (ui.gesehen.has(r.id)) continue;
    ui.gesehen.add(r.id);
    const e = h('span', { class: 'live-reaktion', style: `left:${10 + Math.random() * 80}%`, 'aria-hidden': 'true' }, r.emoji);
    document.body.append(e);
    setTimeout(() => e.remove(), 3000);
  }
}

async function erstellen(ctx, knopf) {
  let fragen; let titel;
  if (ui.quelle === 'ki') {
    if (!ui.thema.trim()) { toast('Schreib ein Thema hin, z. B. „Photosynthese“.', 'fehler'); return; }
    if (!(await kiVerfuegbar())) { toast('Dafür braucht die App die KI.', 'fehler'); return; }
    knopf.disabled = true; knopf.textContent = 'KI schreibt Fragen …';
    try { fragen = await quizFragen(ui.thema.trim(), 10); } catch (e) { toast(e.message, 'fehler'); knopf.disabled = false; knopf.textContent = 'Live-Quiz erstellen'; return; }
    titel = ui.thema.trim();
  } else {
    fragen = fragenBauen();
    titel = ui.deckId === 'alle' ? 'Gemischtes Quiz' : store.getDeck(ui.deckId)?.name;
  }
  if (!fragen || fragen.length < 3) { toast('Dafür braucht es mindestens 4 Karten.', 'fehler'); knopf.disabled = false; return; }
  try { const { code: c } = await api('/api/duell', { titel, fragen, beamer: ui.beamer }); setzen(ctx, await api(`/api/duell/${c}`)); } catch (e) { toast(e.message, 'fehler'); knopf.disabled = false; }
}

function start(ctx) {
  const decks = store.getState().decks.filter((d) => store.cardsOf(d.id).length >= 4);
  const code = h('input', { type: 'text', inputmode: 'numeric', maxlength: '4', placeholder: '1234', class: 'duell-code-eingabe', 'aria-label': 'Quiz-Code', value: ui.eingabe, oninput: (e) => { ui.eingabe = e.target.value.replace(/\D/g, ''); e.target.value = ui.eingabe; } });
  const quelleWahl = h('div', { class: 'reiter', role: 'tablist' }, [['stapel', 'Aus meinen Karten'], ['ki', '✨ KI-Fragen zu einem Thema']].map(([w, t]) =>
    h('button', { role: 'tab', 'aria-selected': String(ui.quelle === w), class: `reiter-knopf ${ui.quelle === w ? 'ist-aktiv' : ''}`, onclick: () => { ui.quelle = w; ctx.refresh(); } }, t)));
  return h('div', { class: 'spiel duell-start' },
    h('div', { class: 'live-titel' }, h('span', null, '▲'), h('span', null, '◆'), h('span', null, '●'), h('span', null, '■'), h('strong', null, 'Live-Quiz')),
    h('section', { class: 'blatt live-mitspielen' },
      h('h2', null, 'Mitspielen'),
      h('form', { class: 'reihe', onsubmit: async (e) => {
        e.preventDefault();
        if (ui.eingabe.length !== 4) { code.focus(); return; }
        try { setzen(ctx, await api(`/api/duell/${ui.eingabe}/beitreten`, {})); } catch (err) { toast(err.message, 'fehler'); }
      } }, code, h('button', { class: 'knopf knopf-haupt knopf-gross', type: 'submit' }, 'Beitreten'))),
    h('section', { class: 'blatt' },
      h('h2', null, 'Quiz erstellen'),
      h('p', null, '10 Fragen, 15 Sekunden pro Frage. Schnelle richtige Antworten geben mehr Punkte, mehrere richtige hintereinander geben Bonus 🔥.'),
      quelleWahl,
      ui.quelle === 'stapel'
        ? h('select', { 'aria-label': 'Stapel', onchange: (e) => { ui.deckId = e.target.value; } },
          h('option', { value: 'alle' }, 'Alle Stapel gemischt'),
          decks.map((d) => h('option', { value: d.id, selected: ui.deckId === d.id }, `${d.name} (${FAECHER[d.fach].name})`)))
        : h('input', { type: 'text', maxlength: '80', placeholder: 'z. B. Französische Revolution, Brüche, Simple Past', value: ui.thema, oninput: (e) => { ui.thema = e.target.value; }, 'aria-label': 'Thema' }),
      h('label', { class: 'schalter-zeile' }, h('input', { type: 'checkbox', checked: ui.beamer, onchange: (e) => { ui.beamer = e.target.checked; } }),
        h('span', null, h('strong', null, 'Beamer-Modus'), h('small', null, ' – du spielst nicht mit, dein Bildschirm zeigt groß Fragen, Countdown und Rangliste (z. B. am Whiteboard im Klassenraum).'))),
      h('button', { class: 'knopf knopf-haupt knopf-gross', onclick: (e) => erstellen(ctx, e.currentTarget) }, icon('spiele', 18), 'Live-Quiz erstellen')));
}

function rangliste(stand, ich, mitPlus) {
  return h('ol', { class: 'duell-rang' }, stand.spieler.slice(0, 10).map((s, i) => h('li', { class: s.name === ich ? 'ist-ich' : '', style: `animation-delay:${i * 0.06}s` },
    h('span', { class: 'rang-platz' }, ['🥇', '🥈', '🥉'][i] || `${i + 1}.`),
    h('span', { class: 'rang-name' }, s.name, s.serie >= 2 && h('small', { class: 'live-serie' }, ` 🔥${s.serie}`)),
    mitPlus && s.plus > 0 && h('span', { class: 'duell-plus' }, `+${s.plus}`),
    h('b', null, String(s.punkte)))));
}

function treppchen(s) {
  const [a, b, c] = s.spieler;
  const stufe = (p, platz, hoehe) => p && h('div', { class: `treppe treppe-${platz}`, style: `--h:${hoehe}` },
    h('span', { class: 'treppe-name' }, p.name), h('span', { class: 'treppe-punkte' }, `${p.punkte}`), h('div', { class: 'treppe-block' }, String(platz)));
  return h('div', { class: 'treppchen' }, stufe(b, 2, 0.7), stufe(a, 1, 1), stufe(c, 3, 0.5));
}

function konfetti() {
  for (let i = 0; i < 60; i++) {
    const k = h('span', { class: 'konfetti', 'aria-hidden': 'true', style: `left:${Math.random() * 100}%;background:hsl(${Math.random() * 360} 90% 55%);animation-delay:${Math.random() * 0.8}s;--dreh:${Math.random() * 720}deg` });
    document.body.append(k);
    setTimeout(() => k.remove(), 3500);
  }
}

function laeuft(ctx) {
  const s = ui.stand;
  const ich = ctx.konto?.name;
  const istBeamer = s.beamer && s.host === ich;
  const verlassen = h('button', { class: 'knopf knopf-leise knopf-mini', onclick: () => { ui.code = null; ui.stand = null; ctx.refresh(); } }, 'Quiz verlassen');
  const reaktionsLeiste = !istBeamer && h('div', { class: 'live-emojis', role: 'group', 'aria-label': 'Reaktion senden' }, EMOJIS.map((e) =>
    h('button', { class: 'knopf-icon', 'aria-label': `Reaktion ${e}`, onclick: () => api(`/api/duell/${s.code}/reaktion`, { emoji: e }).catch(() => {}) }, e)));

  if (s.phase === 'lobby') {
    return h('div', { class: `spiel ${istBeamer ? 'live-beamer' : ''}` },
      h('div', { class: 'blatt duell-lobby' },
        h('p', null, istBeamer ? `Geht auf ${location.host} → Spiele → Live-Quiz und gebt den Code ein:` : 'Sag den anderen diesen Code:'),
        h('p', { class: 'duell-code' }, s.code),
        h('p', { class: 'hinweis' }, `${s.titel} · ${s.n} Fragen`),
        h('h3', null, `Dabei (${s.spieler.length})`),
        h('ul', { class: 'duell-spieler' }, s.spieler.map((p) => h('li', { class: 'live-pop' }, p.name))),
        s.host === ich
          ? h('button', { class: 'knopf knopf-haupt knopf-gross', disabled: s.spieler.length === 0, onclick: async () => { try { setzen(ctx, await api(`/api/duell/${s.code}/start`, {})); } catch (e) { toast(e.message, 'fehler'); } } }, 'Los geht’s!')
          : h('p', { class: 'hinweis' }, `Warte, bis ${s.host} startet …`)),
      reaktionsLeiste, verlassen);
  }
  if (s.phase === 'ende') {
    if (ui.konfetti !== s.code) { ui.konfetti = s.code; konfetti(); }
    const sieger = s.spieler[0];
    return h('div', { class: `spiel ${istBeamer ? 'live-beamer' : ''}` },
      h('div', { class: 'blatt spiel-ende' },
        h('p', { class: 'handschrift ende-spruch' }, sieger?.name === ich ? 'Du hast gewonnen!' : `${sieger?.name || 'Niemand'} gewinnt!`),
        treppchen(s),
        rangliste(s, ich, false),
        h('button', { class: 'knopf knopf-haupt', onclick: () => { ui.code = null; ui.stand = null; ctx.refresh(); } }, 'Neues Quiz')));
  }
  if (s.countdown > 0) {
    return h('div', { class: `spiel ${istBeamer ? 'live-beamer' : ''}` }, h('div', { class: 'blatt duell-countdown' }, h('p', null, 'Gleich geht’s los'), h('p', { class: 'duell-code live-zahl', key: String(Math.ceil(s.countdown / 1000)) }, String(Math.ceil(s.countdown / 1000)))));
  }
  const f = s.frage;
  const auf = s.phase === 'aufloesung';
  const sek = Math.ceil(s.rest / 1000);
  const ich_ = s.spieler.find((p) => p.name === ich);
  const max = Math.max(1, ...(s.verteilung || [1]));
  return h('div', { class: `spiel ${istBeamer ? 'live-beamer' : ''}` },
    h('div', { class: 'spiel-kopf' }, h('strong', null, `Frage ${s.i + 1} von ${s.n}`),
      !auf && h('span', { class: `blitz-uhr ${sek <= 5 ? 'uhr-knapp' : ''}` }, `${sek} s`),
      istBeamer && !auf && h('span', { class: 'hinweis' }, `${s.spieler.filter((p) => p.fertig).length}/${s.spieler.length} haben geantwortet`)),
    !auf && h('div', { class: 'duell-zeit', style: `--rest:${s.rest / 15000}` }),
    h('div', { class: 'karteikarte gross farbe-gelb blitz-karte' }, h('div', { class: 'karte-seite' }, h('p', { class: 'karte-text' }, f.frage))),
    auf && s.verteilung && h('div', { class: 'live-balken' }, f.opts.map((o, i) => h('div', { class: `live-balken-saeule farbe-${FORMEN[i][1]} ${o === s.antwort ? 'ist-richtig' : ''}` },
      h('b', null, String(s.verteilung[i])), h('div', { style: `--h:${s.verteilung[i] / max}` }), h('span', null, FORMEN[i][0], o === s.antwort && ' ✓')))),
    h('div', { class: 'live-optionen' }, f.opts.map((o, i) => {
      const gewaehlt = s.meine?.wahl === o;
      const richtig = auf && o === s.antwort;
      const falsch = auf && !richtig;
      return h('button', { class: `live-option farbe-${FORMEN[i][1]} ${richtig ? 'ist-richtig' : ''} ${falsch ? 'ist-blass' : ''} ${gewaehlt ? 'ist-gewaehlt' : ''}`, disabled: istBeamer || Boolean(s.meine) || auf,
        onclick: async () => { try { if (navigator.vibrate) navigator.vibrate(30); setzen(ctx, await api(`/api/duell/${s.code}/antwort`, { i: s.i, wahl: o })); } catch (e) { toast(e.message, 'fehler'); } } },
        h('span', { class: 'live-form', 'aria-hidden': 'true' }, FORMEN[i][0]), h('span', null, o), richtig && icon('check', 20));
    })),
    s.meine && !auf && h('p', { class: 'hinweis' }, `Antwort gespeichert – warte auf die anderen (${s.spieler.filter((p) => p.fertig).length}/${s.spieler.length}).`),
    auf && !istBeamer && h('p', { class: `duell-ergebnis live-pop ${s.meine?.punkte ? 'ist-gut' : ''}` }, s.meine?.punkte ? `Richtig! +${s.meine.punkte}${ich_?.bonus ? ` (inkl. 🔥 Serienbonus +${ich_.bonus})` : ''}` : s.meine ? 'Leider falsch.' : 'Zu langsam!'),
    auf && rangliste(s, ich, true),
    reaktionsLeiste);
}

export function duell(ctx) {
  if (!ctx.konto) return h('div', { class: 'blatt' }, h('p', null, 'Das Live-Quiz gibt es, wenn du mit einem Konto angemeldet bist.'));
  if (!ui.code || !ui.stand) return start(ctx);
  const takt = setInterval(async () => {
    try { setzen(ctx, await api(`/api/duell/${ui.code}`)); } catch (e) { clearInterval(takt); toast(e.message, 'fehler'); ui.code = null; ui.stand = null; ctx.refresh(); }
  }, 600);
  ctx.onLeave(() => clearInterval(takt));
  return laeuft(ctx);
}
