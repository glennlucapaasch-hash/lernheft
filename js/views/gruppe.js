// Gemeinsam: Gruppen-Challenge, Gruppen-Chat, gemeinsame Stapel
import { h, icon, toast, modal, feld, nachfragen, mehrzahl } from '../dom.js';
import * as store from '../store.js';
import { FAECHER } from '../store.js';

async function api(pfad, opts = {}) {
  const r = await fetch(pfad, { credentials: 'same-origin', ...opts, headers: { 'content-type': 'application/json', 'x-lernheft': '1' } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || 'Das hat nicht geklappt.');
  return d;
}
const ui = { tab: 'chat', nachrichten: [], gruppe: null, stapel: null, offen: null, entwurf: '' };

// ---------- Challenge ----------
function challengeKarte(g) {
  if (!g?.challenge) return null;
  const c = g.challenge;
  const anteil = Math.min(100, Math.round((c.summe / c.ziel) * 100));
  return h('section', { class: 'blatt challenge' },
    h('h2', null, '🏁 Gruppen-Challenge der Woche'),
    h('p', null, `Zusammen ${c.ziel} Karten in 7 Tagen – ${c.aktive} von ${c.personen} sind dabei.`),
    h('div', { class: 'challenge-spur', role: 'progressbar', 'aria-valuenow': anteil, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', { style: `width:${anteil}%` }, anteil >= 12 ? `${anteil} %` : '')),
    h('p', { class: 'hinweis' }, anteil >= 100 ? '🎉 Geschafft! Ihr seid großartig.' : `Noch ${c.ziel - c.summe} Karten bis zum Ziel.`));
}

// ---------- Chat ----------
function chatTab(ctx) {
  const ich = ctx.konto?.name;
  const liste = h('ol', { class: 'gchat' });
  const zeichnen = () => {
    liste.replaceChildren(...(ui.nachrichten.length ? ui.nachrichten.map((m) => h('li', { class: `gchat-msg ${m.von === ich ? 'ist-ich' : ''}` },
      m.von !== ich && h('small', { class: 'gchat-von' }, m.von),
      h('p', null, m.text),
      h('small', { class: 'gchat-zeit' }, new Date(m.zeit).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
        (m.von === ich || ctx.konto?.admin) && h('button', { class: 'gchat-weg', 'aria-label': 'Nachricht löschen', onclick: async () => { try { await api(`/api/gruppenchat/${m.id}`, { method: 'DELETE' }); ui.nachrichten = ui.nachrichten.filter((x) => x.id !== m.id); zeichnen(); } catch (e) { toast(e.message, 'fehler'); } } }, '×'))))
      : [h('li', { class: 'hinweis' }, 'Noch keine Nachrichten. Frag die Gruppe etwas!')]));
    requestAnimationFrame(() => liste.lastElementChild?.scrollIntoView({ block: 'end' }));
  };
  const laden = async () => {
    try {
      const seit = ui.nachrichten.at(-1)?.zeit || 0;
      const neu = await api(`/api/gruppenchat?seit=${seit}`);
      if (neu.length) { ui.nachrichten = [...ui.nachrichten, ...neu].slice(-200); zeichnen(); }
    } catch { /* später nochmal */ }
  };
  zeichnen();
  laden();
  const takt = setInterval(laden, 4000);
  ctx.onLeave(() => clearInterval(takt));
  const eingabe = h('input', { type: 'text', maxlength: '1000', placeholder: 'Nachricht an die Gruppe', 'aria-label': 'Nachricht', value: ui.entwurf, oninput: (e) => { ui.entwurf = e.target.value; } });
  return [liste, h('form', { class: 'gchat-leiste', onsubmit: async (e) => {
    e.preventDefault();
    if (!eingabe.value.trim()) return;
    try { await api('/api/gruppenchat', { method: 'POST', body: JSON.stringify({ text: eingabe.value }) }); ui.entwurf = ''; eingabe.value = ''; laden(); }
    catch (err) { toast(err.message, 'fehler'); }
  } }, eingabe, h('button', { class: 'chat-senden', 'aria-label': 'Senden' }, icon('senden', 20))),
  h('p', { class: 'hinweis' }, 'Alle in der Lerngruppe können diese Nachrichten lesen. Bitte freundlich bleiben – und keine privaten Daten posten.')];
}

// ---------- Gemeinsame Stapel ----------
function gsNeu(ctx) {
  const name = h('input', { type: 'text', maxlength: '60', placeholder: 'z. B. Englisch Unit 4 – zusammen' });
  const fach = h('select', null, Object.entries(FAECHER).map(([id, f]) => h('option', { value: id }, f.name)));
  const wahl = new Set();
  const liste = h('ul', { class: 'haken-liste personen-liste' }, h('li', { class: 'hinweis' }, 'Lade …'));
  api('/api/personen').then((p) => liste.replaceChildren(...p.map((n) => h('li', null, h('label', null, h('input', { type: 'checkbox', onchange: (e) => { if (e.target.checked) wahl.add(n); else wahl.delete(n); } }), h('span', null, n)))))).catch(() => {});
  const zu = modal('Gemeinsamer Stapel', h('form', { onsubmit: async (e) => {
    e.preventDefault();
    if (!name.value.trim()) { name.focus(); return; }
    try { const g = await api('/api/gemeinsam', { method: 'POST', body: JSON.stringify({ name: name.value, fach: fach.value, mitglieder: [...wahl] }) }); zu(); ui.stapel = null; ui.offen = g.id; ctx.refresh(); }
    catch (err) { toast(err.message, 'fehler'); }
  } }, h('p', null, 'Alle Mitglieder können Karten hinzufügen – so teilt ihr euch die Arbeit, z. B. jeder tippt eine Seite ab.'), feld('Name', name), feld('Fach', fach), h('h3', null, 'Wer macht mit?'), liste,
    h('div', { class: 'reihe reihe-ende' }, h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Anlegen'))));
}
function gsDetail(ctx, g) {
  const ich = ctx.konto?.name;
  const front = h('input', { type: 'text', placeholder: 'Vorderseite', 'aria-label': 'Vorderseite', maxlength: '600' });
  const back = h('input', { type: 'text', placeholder: 'Rückseite', 'aria-label': 'Rückseite', maxlength: '1500' });
  return h('div', null,
    h('button', { class: 'knopf knopf-leise zurueck', onclick: () => { ui.offen = null; ctx.refresh(); } }, icon('zurueck', 18), 'Alle gemeinsamen Stapel'),
    h('header', { class: `karteikarte stapel-kopf farbe-${FAECHER[g.fach]?.farbe || 'weiss'}` },
      h('span', { class: 'stapel-fach' }, `${FAECHER[g.fach]?.name} · von ${g.von}${g.mitglieder.length ? ` mit ${g.mitglieder.join(', ')}` : ''}`),
      h('h2', null, g.name),
      h('div', { class: 'reihe' },
        h('button', { class: 'knopf knopf-haupt', disabled: !g.karten.length, onclick: () => {
          // In eigene Karten holen bzw. aktualisieren (nur neue Karten dazu)
          const s = store.getState();
          let deck = s.decks.find((d) => d.gemeinsamId === g.id);
          if (!deck) { deck = store.addDeck(g.name, g.fach); deck.gemeinsamId = g.id; }
          const schon = new Set(store.cardsOf(deck.id).map((c) => c.gsId).filter(Boolean));
          const neu = store.addCards(deck.id, g.karten.filter((k) => !schon.has(k.id)));
          neu.forEach((c, i) => { c.gsId = g.karten.filter((k) => !schon.has(k.id))[i].id; });
          store.save();
          toast(neu.length ? `${mehrzahl(neu.length, 'Karte', 'Karten')} in „${deck.name}“ übernommen.` : 'Du hast schon alle Karten.');
        } }, 'In meine Karten holen'),
        g.von === ich && h('button', { class: 'knopf knopf-gefahr-leise', onclick: async () => { if (await nachfragen('Gemeinsamen Stapel löschen?', 'Er verschwindet für alle. Wer Karten schon geholt hat, behält sie.', 'Löschen', { gefahr: true })) { await api(`/api/gemeinsam/${g.id}`, { method: 'DELETE' }); ui.offen = null; ui.stapel = null; ctx.refresh(); } } }, 'Löschen'))),
    h('form', { class: 'gs-neu', onsubmit: async (e) => {
      e.preventDefault();
      if (!front.value.trim() || !back.value.trim()) return;
      try { ui.gs = await api(`/api/gemeinsam/${g.id}/karten`, { method: 'POST', body: JSON.stringify({ front: front.value, back: back.value }) }); front.value = ''; back.value = ''; ctx.refresh(); }
      catch (err) { toast(err.message, 'fehler'); }
    } }, front, back, h('button', { class: 'knopf knopf-haupt', type: 'submit' }, icon('plus', 18), 'Karte')),
    h('ul', { class: 'karten-liste' }, g.karten.length ? g.karten.slice().reverse().map((k) => h('li', null, h('div', { class: 'karten-zeile' },
      h('span', { class: 'kz-vorn' }, k.front), h('span', { class: 'kz-hinten' }, k.back),
      h('span', { class: 'kz-stufe' }, k.von, (k.von === ich || g.von === ich) && h('button', { class: 'gchat-weg', 'aria-label': 'Karte löschen', onclick: async () => { ui.gs = await api(`/api/gemeinsam/${g.id}/karten/${k.id}`, { method: 'DELETE' }); ctx.refresh(); } }, '×')))))
      : h('li', { class: 'hinweis', style: 'padding:1rem' }, 'Noch leer – leg die erste Karte an.')));
}
function stapelTab(ctx) {
  if (ui.offen) {
    if (!ui.gs || ui.gs.id !== ui.offen) { api(`/api/gemeinsam/${ui.offen}`).then((g) => { ui.gs = g; ctx.refresh(); }).catch((e) => { toast(e.message, 'fehler'); ui.offen = null; ctx.refresh(); }); return h('p', { class: 'hinweis' }, 'Lade …'); }
    return gsDetail(ctx, ui.gs);
  }
  if (!ui.stapel) { api('/api/gemeinsam').then((l) => { ui.stapel = l; ctx.refresh(); }).catch(() => { ui.stapel = []; }); return h('p', { class: 'hinweis' }, 'Lade …'); }
  return h('div', null,
    h('div', { class: 'abschnitt-kopf' }, h('p', { class: 'hinweis' }, 'Stapel, an denen mehrere zusammen arbeiten.'), h('button', { class: 'knopf knopf-haupt', onclick: () => gsNeu(ctx) }, icon('plus', 18), 'Neuer gemeinsamer Stapel')),
    ui.stapel.length ? h('ul', { class: 'geteilt-liste' }, ui.stapel.map((g) => h('li', null,
      h('span', { class: `geteilt-punkt farbe-${FAECHER[g.fach]?.farbe || 'weiss'}` }),
      h('div', { class: 'geteilt-text' }, h('strong', null, g.name), h('small', null, `${mehrzahl(g.anzahl, 'Karte', 'Karten')} · ${[g.von, ...g.mitglieder].join(', ')}`)),
      h('button', { class: 'knopf knopf-mini', onclick: () => { ui.offen = g.id; ui.gs = null; ctx.refresh(); } }, 'Öffnen'))))
      : h('div', { class: 'blatt leer' }, h('p', null, 'Noch kein gemeinsamer Stapel. Teilt euch die Vokabeln einer Unit auf – jeder tippt einen Teil ab, alle profitieren.')));
}

export function gruppe(ctx) {
  if (!ctx.konto) return h('div', { class: 'seite' }, h('h1', { class: 'handschrift' }, 'Gemeinsam'), h('p', { class: 'blatt' }, 'Das gibt es mit Konto auf dem Lernheft-Server.'));
  if (ctx.optionen?.neu) { ui.stapel = null; ui.gruppe = null; ui.offen = null; }
  if (!ui.gruppe) api('/api/gruppe').then((g) => { ui.gruppe = g; if (location.hash === '#gruppe') ctx.refresh(); }).catch(() => {});
  const tabs = [['chat', 'Gruppen-Chat'], ['stapel', 'Gemeinsame Stapel']];
  return h('div', { class: 'seite' },
    h('header', { class: 'seiten-kopf' }, h('h1', { class: 'handschrift' }, 'Gemeinsam')),
    challengeKarte(ui.gruppe),
    h('div', { class: 'reiter', role: 'tablist' }, tabs.map(([id, n]) => h('button', { role: 'tab', class: 'reiter-knopf', 'aria-selected': String(ui.tab === id), onclick: () => { ui.tab = id; ctx.refresh(); } }, n))),
    h('div', { role: 'tabpanel' }, ui.tab === 'chat' ? chatTab(ctx) : stapelTab(ctx)));
}

// Ankündigung des Admins (oben auf der Startseite, wegklickbar)
export function ankuendigung(ctx) {
  const a = ui.gruppe?.ankuendigung;
  if (!ctx.konto) return null;
  if (!ui.gruppe) { api('/api/gruppe').then((g) => { ui.gruppe = g; if (g.ankuendigung && location.hash.replace('#', '') in { '': 1, start: 1 }) ctx.refresh(); }).catch(() => {}); return null; }
  let weg = '';
  try { weg = localStorage.getItem('lernheft.ank') || ''; } catch { /* egal */ }
  if (!a || weg === a.id) return null;
  const el = h('div', { class: 'ankuendigung', role: 'status' }, h('span', { 'aria-hidden': 'true' }, '📣'), h('p', null, h('strong', null, 'Von Glenn: '), a.text),
    h('button', { class: 'knopf-icon', 'aria-label': 'Ausblenden', onclick: () => { try { localStorage.setItem('lernheft.ank', a.id); } catch { /* egal */ } el.remove(); } }, icon('x', 18)));
  return el;
}
