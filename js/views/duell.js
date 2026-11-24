// Gruppen-Duell live: gleiche Fragen für alle, wer schneller richtig antwortet, bekommt mehr Punkte.
import { h, icon, toast } from '../dom.js';
import * as store from '../store.js';
import { FAECHER } from '../store.js';
import { shuffle, mcOptionen } from '../exam.js';

const ui = { code: null, stand: null, deckId: 'alle', eingabe: '', gezaehlt: null };

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
  const alt = JSON.stringify(ui.stand);
  ui.stand = stand;
  ui.code = stand.code;
  if (stand.phase === 'ende' && ui.gezaehlt !== stand.code) {
    ui.gezaehlt = stand.code;
    const sp = store.getState().spiele;
    sp.duelle = (sp.duelle || 0) + 1;
    if (stand.spieler[0]?.name === ctx.konto?.name && stand.spieler[0].punkte > 0) sp.duellSiege = (sp.duellSiege || 0) + 1;
    store.save();
  }
  if (JSON.stringify(stand) !== alt && location.hash === '#spiele') ctx.refresh();
}

function start(ctx) {
  const decks = store.getState().decks.filter((d) => store.cardsOf(d.id).length >= 4);
  const code = h('input', { type: 'text', inputmode: 'numeric', maxlength: '4', placeholder: '1234', class: 'duell-code-eingabe', 'aria-label': 'Duell-Code', value: ui.eingabe, oninput: (e) => { ui.eingabe = e.target.value.replace(/\D/g, ''); e.target.value = ui.eingabe; } });
  return h('div', { class: 'spiel duell-start' },
    h('section', { class: 'blatt' },
      h('h2', null, 'Duell erstellen'),
      h('p', null, '10 Fragen aus deinem Stapel. Alle sehen dieselbe Frage – wer schneller richtig antwortet, bekommt mehr Punkte.'),
      h('select', { 'aria-label': 'Stapel', onchange: (e) => { ui.deckId = e.target.value; } },
        h('option', { value: 'alle' }, 'Alle Stapel gemischt'),
        decks.map((d) => h('option', { value: d.id, selected: ui.deckId === d.id }, `${d.name} (${FAECHER[d.fach].name})`))),
      h('button', { class: 'knopf knopf-haupt', onclick: async () => {
        const fragen = fragenBauen();
        if (fragen.length < 3) { toast('Dafür braucht der Stapel mindestens 4 Karten.', 'fehler'); return; }
        const titel = ui.deckId === 'alle' ? 'Gemischtes Duell' : store.getDeck(ui.deckId)?.name;
        try { const { code: c } = await api('/api/duell', { titel, fragen }); setzen(ctx, await api(`/api/duell/${c}`)); } catch (e) { toast(e.message, 'fehler'); }
      } }, icon('spiele', 18), 'Duell erstellen')),
    h('section', { class: 'blatt' },
      h('h2', null, 'Mitspielen'),
      h('p', null, 'Gib den 4-stelligen Code ein, den dir jemand sagt.'),
      h('form', { class: 'reihe', onsubmit: async (e) => {
        e.preventDefault();
        if (ui.eingabe.length !== 4) { code.focus(); return; }
        try { setzen(ctx, await api(`/api/duell/${ui.eingabe}/beitreten`, {})); } catch (err) { toast(err.message, 'fehler'); }
      } }, code, h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Beitreten'))));
}

function rangliste(stand, ich, mitPlus) {
  return h('ol', { class: 'duell-rang' }, stand.spieler.map((s, i) => h('li', { class: s.name === ich ? 'ist-ich' : '' },
    h('span', { class: 'rang-platz' }, ['🥇', '🥈', '🥉'][i] || `${i + 1}.`),
    h('span', { class: 'rang-name' }, s.name),
    mitPlus && s.plus > 0 && h('span', { class: 'duell-plus' }, `+${s.plus}`),
    h('b', null, String(s.punkte)))));
}

function laeuft(ctx) {
  const s = ui.stand;
  const ich = ctx.konto?.name;
  const verlassen = h('button', { class: 'knopf knopf-leise knopf-mini', onclick: () => { ui.code = null; ui.stand = null; ctx.refresh(); } }, 'Duell verlassen');

  if (s.phase === 'lobby') {
    return h('div', { class: 'spiel' },
      h('div', { class: 'blatt duell-lobby' },
        h('p', null, 'Sag den anderen diesen Code:'),
        h('p', { class: 'duell-code' }, s.code),
        h('p', { class: 'hinweis' }, `${s.titel} · ${s.n} Fragen`),
        h('h3', null, `Dabei (${s.spieler.length})`),
        h('ul', { class: 'duell-spieler' }, s.spieler.map((p) => h('li', null, p.name, p.name === s.host && h('small', null, ' – erstellt')))),
        s.host === ich
          ? h('button', { class: 'knopf knopf-haupt knopf-gross', onclick: async () => { try { setzen(ctx, await api(`/api/duell/${s.code}/start`, {})); } catch (e) { toast(e.message, 'fehler'); } } }, 'Los geht’s!')
          : h('p', { class: 'hinweis' }, `Warte, bis ${s.host} startet …`)),
      verlassen);
  }
  if (s.phase === 'ende') {
    const sieger = s.spieler[0];
    return h('div', { class: 'spiel' },
      h('div', { class: 'blatt spiel-ende' },
        h('p', { class: 'handschrift ende-spruch' }, sieger?.name === ich ? 'Du hast gewonnen!' : `${sieger?.name} gewinnt!`),
        rangliste(s, ich, false),
        h('button', { class: 'knopf knopf-haupt', onclick: () => { ui.code = null; ui.stand = null; ctx.refresh(); } }, 'Neues Duell')));
  }
  if (s.countdown > 0) {
    return h('div', { class: 'spiel' }, h('div', { class: 'blatt duell-countdown' }, h('p', null, 'Gleich geht’s los'), h('p', { class: 'duell-code' }, String(Math.ceil(s.countdown / 1000)))));
  }
  const f = s.frage;
  const auf = s.phase === 'aufloesung';
  const sek = Math.ceil(s.rest / 1000);
  return h('div', { class: 'spiel' },
    h('div', { class: 'spiel-kopf' }, h('strong', null, `Frage ${s.i + 1} von ${s.n}`),
      !auf && h('span', { class: `blitz-uhr ${sek <= 5 ? 'uhr-knapp' : ''}` }, `${sek} s`)),
    !auf && h('div', { class: 'duell-zeit', style: `--rest:${s.rest / 15000}` }),
    h('div', { class: 'karteikarte gross farbe-gelb blitz-karte' }, h('div', { class: 'karte-seite' }, h('p', { class: 'karte-text' }, f.frage))),
    h('div', { class: 'ankreuzen' }, f.opts.map((o) => {
      const gewaehlt = s.meine?.wahl === o;
      const richtig = auf && o === s.antwort;
      const falsch = auf && gewaehlt && o !== s.antwort;
      return h('button', { class: `knopf knopf-option ${richtig ? 'ist-richtig' : ''} ${falsch ? 'ist-falsch' : ''} ${gewaehlt && !auf ? 'ist-gewaehlt' : ''}`, disabled: Boolean(s.meine) || auf,
        onclick: async () => { try { setzen(ctx, await api(`/api/duell/${s.code}/antwort`, { i: s.i, wahl: o })); } catch (e) { toast(e.message, 'fehler'); } } },
        richtig && icon('check', 18), falsch && icon('x', 18), h('span', null, o));
    })),
    s.meine && !auf && h('p', { class: 'hinweis' }, `Antwort gespeichert – warte auf die anderen (${s.spieler.filter((p) => p.fertig).length}/${s.spieler.length}).`),
    auf && h('div', null, h('p', { class: 'duell-ergebnis' }, s.meine?.punkte ? `Richtig! +${s.meine.punkte}` : s.meine ? 'Leider falsch.' : 'Zu langsam!'), rangliste(s, ich, true)));
}

export function duell(ctx) {
  if (!ctx.konto) return h('div', { class: 'blatt' }, h('p', null, 'Duelle gibt es, wenn du mit einem Konto angemeldet bist.'));
  if (!ui.code || !ui.stand) return start(ctx);
  const takt = setInterval(async () => {
    try { setzen(ctx, await api(`/api/duell/${ui.code}`)); } catch (e) { clearInterval(takt); toast(e.message, 'fehler'); ui.code = null; ui.stand = null; ctx.refresh(); }
  }, 700);
  ctx.onLeave(() => clearInterval(takt));
  return laeuft(ctx);
}
