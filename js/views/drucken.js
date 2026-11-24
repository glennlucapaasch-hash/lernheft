// Stapel als Papier-Karteikarten drucken (oder als PDF sichern): Vorderseiten, dann gespiegelte Rückseiten
import { h, toast } from '../dom.js';
import * as store from '../store.js';

export function druckenStapel(deck) {
  const karten = store.cardsOf(deck.id);
  const proSeite = 8;
  const seiten = [];
  for (let i = 0; i < karten.length; i += proSeite) {
    const teil = karten.slice(i, i + proSeite);
    seiten.push(h('div', { class: 'druck-seite' }, teil.map((c) => h('div', { class: 'druck-karte' }, h('small', null, deck.name), h('p', null, c.front)))));
    // Rückseiten zeilenweise gespiegelt, damit sie beim beidseitigen Druck passen
    const gespiegelt = [];
    for (let r = 0; r < teil.length; r += 2) gespiegelt.push(teil[r + 1] || null, teil[r]);
    seiten.push(h('div', { class: 'druck-seite' }, gespiegelt.map((c) => h('div', { class: 'druck-karte rueck' }, c ? [h('p', null, c.back), c.note && h('small', null, c.note)] : null))));
  }
  const bereich = h('div', { class: 'druck-bereich' }, seiten);
  document.body.append(bereich);
  document.body.classList.add('drucken');
  const fertig = () => { bereich.remove(); document.body.classList.remove('drucken'); removeEventListener('afterprint', fertig); };
  addEventListener('afterprint', fertig);
  try { window.print(); } catch { toast('Drucken klappt in dieser Ansicht nicht.', 'fehler'); fertig(); }
  setTimeout(() => { if (document.body.classList.contains('drucken')) fertig(); }, 60000);
}
