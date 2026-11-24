// Foto-Hausaufgabenhilfe: Aufgabe fotografieren, die KI führt Schritt für Schritt hin – Lösung erst, wenn du willst.
import { h, icon, toast } from '../dom.js';
import * as store from '../store.js';
import { kiVerfuegbar, bildVorbereiten, aufgabeErklaeren, loesungPruefen } from '../ai.js';

const ui = { foto: null, url: null, hinweis: '', ergebnis: null, offen: 0, loesungOffen: false, laedt: false, pruefung: null };

async function los(ctx) {
  if (!(await kiVerfuegbar())) { toast('Dafür braucht die App die KI.', 'fehler'); return; }
  ui.laedt = true; ctx.refresh();
  try {
    ui.ergebnis = await aufgabeErklaeren([await bildVorbereiten(ui.foto)], ui.hinweis.trim());
    ui.offen = 0; ui.loesungOffen = false; ui.pruefung = null;
  } catch (e) { toast(e.message, 'fehler'); }
  ui.laedt = false; ctx.refresh();
}

function neu(ctx) { if (ui.url) URL.revokeObjectURL(ui.url); Object.assign(ui, { foto: null, url: null, hinweis: '', ergebnis: null, pruefung: null }); ctx.refresh(); }

export function hilfe(ctx) {
  const kamera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: (e) => { const f = e.target.files[0]; if (!f) return; if (ui.url) URL.revokeObjectURL(ui.url); ui.foto = f; ui.url = URL.createObjectURL(f); ui.ergebnis = null; ctx.refresh(); } });
  const galerie = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: kamera.onchange });

  if (ui.laedt) return h('div', { class: 'blatt warten', role: 'status' }, h('div', { class: 'hilfe-lupe', 'aria-hidden': 'true' }, '🔍'), h('p', null, h('strong', null, 'Ich lese die Aufgabe und überlege mir einen Weg …')));

  if (!ui.ergebnis) {
    return h('div', { class: 'hilfe' },
      h('p', { class: 'einleitung' }, 'Fotografier eine Aufgabe, bei der du hängst. Ich verrate dir nicht sofort die Lösung, sondern gebe dir Schritt für Schritt Tipps – so lernst du es wirklich.'),
      kamera, galerie,
      ui.url
        ? h('div', { class: 'blatt' }, h('img', { src: ui.url, alt: 'Foto der Aufgabe', class: 'hilfe-foto' }),
          h('div', { class: 'feld' }, h('label', { for: 'hilfe-hinweis' }, 'Was genau verstehst du nicht? (optional)'),
            h('input', { id: 'hilfe-hinweis', type: 'text', maxlength: '300', placeholder: 'z. B. Aufgabe 3b, ich weiß nicht wie anfangen', value: ui.hinweis, oninput: (e) => { ui.hinweis = e.target.value; } })),
          h('div', { class: 'reihe' }, h('button', { class: 'knopf knopf-haupt knopf-gross', onclick: () => los(ctx) }, '✨ Hilf mir'), h('button', { class: 'knopf', onclick: () => kamera.click() }, 'Neues Foto')))
        : h('div', { class: 'hilfe-start' },
          h('button', { class: 'scan-knopf-riesig', onclick: () => kamera.click() }, icon('scan', 40), h('strong', null, 'Aufgabe fotografieren')),
          h('button', { class: 'knopf', onclick: () => galerie.click() }, 'Aus Fotos wählen')));
  }

  const r = ui.ergebnis;
  const versuch = h('textarea', { rows: '2', placeholder: 'Deine Lösung – ich sag dir, ob sie stimmt', 'aria-label': 'Deine Lösung' });
  return h('div', { class: 'hilfe' },
    h('div', { class: 'blatt' },
      h('p', { class: 'stapel-fach' }, [r.fach, r.thema].filter(Boolean).join(' – ')),
      h('h2', null, 'Die Aufgabe'),
      h('p', { class: 'hilfe-aufgabe' }, r.aufgabe),
      r.ansatz && h('p', { class: 'hilfe-ansatz' }, '💡 ', r.ansatz)),
    h('ol', { class: 'hilfe-schritte' }, r.schritte.map((s, i) => h('li', { class: `blatt hilfe-schritt ${i < ui.offen ? 'ist-offen' : ''} ${i === ui.offen ? 'ist-aktuell' : ''}` },
      h('p', { class: 'hilfe-schritt-nr' }, `Schritt ${i + 1}`),
      i <= ui.offen ? h('p', null, h('strong', null, 'Tipp: '), s.tipp) : h('p', { class: 'hinweis' }, '🔒 Noch versteckt'),
      i < ui.offen && h('p', { class: 'hilfe-erklaerung' }, s.erklaerung),
      i === ui.offen && h('div', { class: 'reihe' },
        h('button', { class: 'knopf', onclick: () => { ui.offen += 1; ctx.refresh(); } }, 'Erklärung zeigen'))))),
    h('div', { class: 'blatt' },
      h('h3', null, 'Selbst probiert? Lass es prüfen'),
      h('form', { onsubmit: async (e) => {
        e.preventDefault();
        if (!versuch.value.trim()) return;
        const k = e.currentTarget.querySelector('button'); k.disabled = true;
        try { ui.pruefung = await loesungPruefen(r.aufgabe, r.loesung, versuch.value.trim()); if (ui.pruefung.richtig) { store.getState().bonusXp += 20; store.save(); } } catch (err) { toast(err.message, 'fehler'); }
        ctx.refresh();
      } }, versuch, h('button', { class: 'knopf knopf-haupt', type: 'submit' }, 'Prüfen')),
      ui.pruefung && h('p', { class: `hilfe-pruefung ${ui.pruefung.richtig ? 'ist-richtig' : 'ist-falsch'}`, role: 'status' }, ui.pruefung.richtig ? '✅ Richtig! +20 XP – ' : '🤔 Noch nicht ganz – ', ui.pruefung.text)),
    h('div', { class: 'reihe' },
      ui.loesungOffen ? h('div', { class: 'blatt hilfe-loesung' }, h('h3', null, 'Lösung'), h('p', null, r.loesung))
        : h('button', { class: 'knopf knopf-leise', onclick: () => { ui.loesungOffen = true; ctx.refresh(); } }, 'Ganze Lösung zeigen'),
      h('button', { class: 'knopf', onclick: () => ctx.go('chat', { frage: `Ich habe eine Frage zu dieser Aufgabe: ${r.aufgabe.slice(0, 400)}` }) }, icon('chat', 18), 'Nachfragen'),
      h('button', { class: 'knopf', onclick: () => neu(ctx) }, 'Neue Aufgabe')));
}
