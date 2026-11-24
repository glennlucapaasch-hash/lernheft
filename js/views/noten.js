import { h, icon, modal, feld, toast, nachfragen, datumKurz, mehrzahl } from '../dom.js';
import * as store from '../store.js';
import { FAECHER } from '../store.js';
import { noteLesen, zahl, fachStand, uebersicht, empfehlungen, istPunkte, gewicht, besser } from '../noten.js';

const ui = { fach: null };
const fachName = (f) => FAECHER[f]?.name || f;
const notenText = (n) => n.text || zahl(n.wert, istPunkte() ? 0 : 1);

function notenFarbe(wert) {
  const gut = istPunkte() ? wert / 15 : (6 - wert) / 5;
  return gut >= 0.75 ? 'gut' : gut >= 0.45 ? 'mittel' : 'schwach';
}

function eintragen(ctx, vorFach, vorArt, alt) {
  const fach = h('select', null, Object.entries(FAECHER).map(([id, f]) => h('option', { value: id, selected: id === (alt?.fach || vorFach) }, f.name)));
  let art = alt?.art || vorArt || 'schriftlich';
  const artWahl = h('div', { class: 'auswahl' }, [['schriftlich', 'Schriftlich', 'Klassenarbeit, Test'], ['muendlich', 'Mündlich', 'Mitarbeit, Referat, Abfrage']].map(([w, t, x]) => {
    const id = `art-${w}`;
    return h('div', { class: 'auswahl-punkt' }, h('input', { type: 'radio', name: 'art', id, checked: w === art, onchange: () => { art = w; } }), h('label', { for: id }, h('span', { class: 'auswahl-titel' }, t), h('span', { class: 'auswahl-text' }, x)));
  }));
  const note = h('input', { type: 'text', inputmode: istPunkte() ? 'numeric' : 'text', value: alt?.text || '', placeholder: istPunkte() ? 'z. B. 11' : 'z. B. 2-  oder  2,5', required: true, autocomplete: 'off' });
  const titel = h('input', { type: 'text', value: alt?.titel || '', placeholder: 'z. B. Vokabeltest Unit 2', maxlength: '60' });
  const datum = h('input', { type: 'date', value: alt?.datum || new Date().toISOString().slice(0, 10) });
  const zu = modal(alt ? 'Note bearbeiten' : 'Note eintragen', h('form', { onsubmit: (e) => {
    e.preventDefault();
    const wert = noteLesen(note.value);
    if (wert == null) { toast(istPunkte() ? 'Bitte Punkte von 0 bis 15 eingeben.' : 'Bitte eine Note von 1 bis 6 eingeben, z. B. 2, 2+ oder 2,5.', 'fehler'); note.focus(); return; }
    const s = store.getState();
    const eintrag = { id: alt?.id || store.uid(), fach: fach.value, art, wert, text: note.value.trim(), titel: titel.value.trim(), datum: datum.value };
    s.noten = alt ? s.noten.map((n) => (n.id === alt.id ? eintrag : n)) : [...s.noten, eintrag];
    store.save();
    zu();
    toast(alt ? 'Gespeichert.' : 'Note eingetragen.');
    ctx.refresh();
  } },
    feld('Fach', fach), artWahl,
    feld(istPunkte() ? 'Punkte (0–15)' : 'Note', note, istPunkte() ? null : 'Plus und Minus gehen auch: 2+ zählt als 1,7, 2- als 2,3.'),
    feld('Wofür? (freiwillig)', titel), feld('Datum', datum),
    h('div', { class: 'reihe reihe-ende' },
      alt && h('button', { type: 'button', class: 'knopf knopf-gefahr-leise', onclick: async () => {
        zu();
        if (await nachfragen('Note löschen?', 'Die Note wird entfernt.', 'Löschen')) { store.getState().noten = store.getState().noten.filter((n) => n.id !== alt.id); store.save(); ctx.refresh(); }
      } }, 'Löschen'),
      h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Speichern'))));
  queueMicrotask(() => note.focus());
}

function einstellungenDialog(ctx) {
  const e = store.getState().notenEinst;
  const system = h('select', null, h('option', { value: 'noten', selected: e.system === 'noten' }, 'Noten 1–6 (Klasse 5–10)'), h('option', { value: 'punkte', selected: e.system === 'punkte' }, 'Punkte 0–15 (Oberstufe)'));
  const m = h('input', { type: 'range', min: '0', max: '100', step: '5', value: e.muendlich });
  const anzeige = h('output', null, `${e.muendlich} % mündlich · ${100 - e.muendlich} % schriftlich`);
  m.addEventListener('input', () => { anzeige.textContent = `${m.value} % mündlich · ${100 - m.value} % schriftlich`; });
  const faecher = [...new Set(store.getState().noten.map((n) => n.fach))];
  const eigene = {};
  const zu = modal('Gewichtung', h('form', { onsubmit: (ev) => {
    ev.preventDefault();
    if (system.value !== e.system && store.getState().noten.length && !confirmWechsel()) return;
    e.system = system.value;
    e.muendlich = Number(m.value);
    for (const [f, inp] of Object.entries(eigene)) { if (inp.value === '') delete e.faecher[f]; else e.faecher[f] = Math.min(100, Math.max(0, Number(inp.value))); }
    store.save(); zu(); ctx.refresh();
  } },
    feld('Notensystem', system),
    feld('Standard-Gewichtung', h('div', { class: 'gewicht-regler' }, m, anzeige), 'Die meisten Schulen werten in Hauptfächern etwa 60 % mündlich und 40 % schriftlich – frag im Zweifel deine Lehrkraft.'),
    faecher.length > 0 && h('fieldset', null, h('legend', null, 'Abweichend pro Fach (% mündlich)'),
      h('div', { class: 'gewicht-faecher' }, faecher.map((f) => {
        eigene[f] = h('input', { type: 'number', min: '0', max: '100', step: '5', placeholder: String(e.muendlich), value: Number.isFinite(e.faecher[f]) ? e.faecher[f] : '' });
        return h('label', null, h('span', null, fachName(f)), eigene[f]);
      }))),
    h('div', { class: 'reihe reihe-ende' }, h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Speichern'))));
  function confirmWechsel() { toast('Achtung: Bereits eingetragene Noten werden nicht umgerechnet.', 'fehler'); return true; }
}

const AKTIONEN = {
  karten: ['Karten lernen', '#karten'], themen: ['Themen ansehen', '#themen'], klausur: ['Probeklausur', '#klausur'],
  muendlich: ['Lernhelfer fragen', '#chat'], start: ['Zum Pensum', '#start'], scannen: ['Seite scannen', '#scannen'],
};

function fachDetail(ctx, fach) {
  const f = fachStand(fach);
  const zeile = (n) => h('li', null, h('button', { class: 'noten-zeile', onclick: () => eintragen(ctx, fach, n.art, n) },
    h('span', { class: `noten-chip note-${notenFarbe(n.wert)}` }, notenText(n)),
    h('span', { class: 'noten-titel' }, n.titel || (n.art === 'muendlich' ? 'Mündliche Note' : 'Schriftliche Note')),
    h('small', null, datumKurz(`${n.datum}T12:00`))));
  return h('div', { class: 'seite' },
    h('button', { class: 'knopf knopf-leise zurueck', onclick: () => { ui.fach = null; ctx.refresh(); } }, icon('zurueck', 18), 'Alle Fächer'),
    h('header', { class: `karteikarte stapel-kopf farbe-${FAECHER[fach]?.farbe || 'weiss'}` },
      h('span', { class: 'stapel-fach' }, `${f.gewicht} % mündlich · ${100 - f.gewicht} % schriftlich`),
      h('h1', null, fachName(fach)),
      h('p', { class: 'noten-gross' }, `Ø ${zahl(f.gesamt)}`, f.trend > 0 ? ' 📈' : f.trend < 0 ? ' 📉' : '')),
    h('div', { class: 'noten-spalten' },
      ['schriftlich', 'muendlich'].map((art) => {
        const l = art === 'muendlich' ? f.m : f.s;
        const d = art === 'muendlich' ? f.dm : f.ds;
        return h('section', { class: 'blatt' },
          h('div', { class: 'abschnitt-kopf' }, h('h2', null, `${art === 'muendlich' ? 'Mündlich' : 'Schriftlich'} · Ø ${zahl(d)}`),
            h('button', { class: 'knopf knopf-leise', onclick: () => eintragen(ctx, fach, art) }, icon('plus', 18), 'Note')),
          l.length ? h('ul', { class: 'noten-liste' }, l.slice().reverse().map(zeile)) : h('p', { class: 'hinweis' }, 'Noch keine Note.'));
      })));
}

export function noten(ctx) {
  if (ctx.optionen?.neu) ui.fach = null;
  if (ui.fach) return fachDetail(ctx, ui.fach);
  const { staende, schnitt } = uebersicht();
  const tipps = empfehlungen();
  const gesamtAnzahl = store.getState().noten.length;
  return h('div', { class: 'seite' },
    h('header', { class: 'seiten-kopf' },
      h('h1', { class: 'handschrift' }, 'Noten'),
      h('div', { class: 'reihe' },
        h('button', { class: 'knopf knopf-leise', onclick: () => einstellungenDialog(ctx) }, 'Gewichtung'),
        h('button', { class: 'knopf knopf-haupt', onclick: () => eintragen(ctx) }, icon('plus', 18), 'Note eintragen'))),
    !gesamtAnzahl
      ? h('div', { class: 'blatt leer' },
          h('p', null, 'Trag deine mündlichen und schriftlichen Noten ein. Das Lernheft rechnet deinen Schnitt pro Fach aus (standardmäßig 60 % mündlich, 40 % schriftlich) und sagt dir, wo sich Lernen am meisten lohnt.'),
          h('button', { class: 'knopf knopf-haupt', onclick: () => eintragen(ctx) }, icon('plus', 18), 'Erste Note eintragen'))
      : [
          h('section', { class: 'blatt noten-schnitt' },
            h('div', null, h('small', null, 'Gesamtschnitt'), h('p', { class: 'noten-gross handschrift' }, zahl(schnitt))),
            h('p', { class: 'hinweis' }, `${mehrzahl(staende.length, 'Fach', 'Fächer')}, ${mehrzahl(gesamtAnzahl, 'Note', 'Noten')}. Jedes Fach zählt gleich viel.`)),
          tipps.length > 0 && h('section', null,
            h('h2', null, 'Lernempfehlungen'),
            h('ul', { class: 'tipps' }, tipps.map((t, i) => h('li', { class: 'tipp', style: `animation-delay:${i * 0.06}s` },
              h('span', { class: `geteilt-punkt farbe-${FAECHER[t.fach]?.farbe || 'weiss'}` }),
              h('p', null, t.text),
              t.aktion && h('a', { class: 'knopf knopf-mini', href: AKTIONEN[t.aktion][1], onclick: () => { if (t.aktion === 'muendlich') ctx.optionen = { frage: `Ich bin in ${fachName(t.fach)} mündlich schwach. Frag mich bitte ein paar typische Fragen zum aktuellen Stoff ab und gib mir Feedback.` }; } }, AKTIONEN[t.aktion][0]))))),
          h('section', null,
            h('h2', null, 'Deine Fächer'),
            h('ul', { class: 'noten-faecher' }, staende.map((f) => h('li', null, h('button', { class: `noten-fach farbe-${FAECHER[f.fach]?.farbe || 'weiss'}`, onclick: () => { ui.fach = f.fach; ctx.refresh(); scrollTo(0, 0); } },
              h('strong', null, fachName(f.fach)),
              h('span', { class: `noten-chip gross note-${notenFarbe(f.gesamt)}` }, zahl(f.gesamt)),
              h('small', null, `schriftlich ${zahl(f.ds)} · mündlich ${zahl(f.dm)}`, f.trend > 0 ? ' · 📈' : f.trend < 0 ? ' · 📉' : '')))))),
          h('p', { class: 'hinweis' }, 'Die Rechnung ist ein Richtwert. Deine Lehrkraft bewertet am Ende auch Dinge, die hier nicht stehen.'),
        ]);
}
