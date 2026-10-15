// Termine per Sprache löschen: erkennt Lösch-Sätze und sucht passende Termine.
import { parseLocal } from './parseLocal';

// Lösch-Wörter in den App-Sprachen (Wortanfänge, damit "lösche", "löschen", "gelöscht" passen).
const DELETE_WORDS = [
  'lösch', 'gelösch', 'entfern', 'absag', 'streich', 'stornier',
  'delete', 'remove', 'cancel',
  'iptal',
  'supprim', 'annul', 'efface',
  'borra', 'elimina', 'cancela', 'anula',
  'احذف', 'حذف', 'الغ', 'إلغاء', 'امسح',
];

export function isDeleteRequest(text) {
  const t = ' ' + text.toLowerCase().replace(/[.,!?]/g, ' ') + ' ';
  if (DELETE_WORDS.some((w) => t.includes(' ' + w))) return true;
  // "Sag den Friseur ab" (getrenntes Verb) und türkisch "sil" nur als ganzes Wort.
  return (/ sag(e)? /.test(t) && / ab /.test(t)) || / sil /.test(t);
}

const STOP = new Set([
  'termin', 'termine', 'den', 'die', 'das', 'der', 'dem', 'mein', 'meinen', 'meine', 'bitte', 'mit', 'beim', 'vom',
  'appointment', 'the', 'my', 'please', 'with',
]);

function words(s) {
  return s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Einfache Suche ohne KI: Datum/Uhrzeit aus dem Satz, Rest als Suchwörter.
export function findMatches(text, events, now = new Date()) {
  let rest = text;
  for (const w of DELETE_WORDS) rest = rest.replace(new RegExp(w + '\\p{L}*', 'giu'), ' ');
  rest = rest.replace(/(^|\s)(sage?|ab|sil)(?=\s|$)/giu, ' ');
  const p = parseLocal(rest, now);
  const keys = words(p.title === 'Termin' ? '' : p.title);

  const scored = events
    .map((e) => {
      const start = new Date(e.startDate);
      if (p.dateGiven && !sameDay(start, p.start)) return null;
      let score = p.dateGiven ? 1 : 0;
      if (p.timeGiven && start.getHours() === p.start.getHours()) score += 2;
      const title = (e.title || '').toLowerCase();
      const hits = keys.filter((k) => title.includes(k) || words(title).some((w) => k.includes(w))).length;
      if (keys.length && !hits) return null;
      score += hits * 3;
      return score > 0 ? { event: e, score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || new Date(a.event.startDate) - new Date(b.event.startDate));
  return scored.slice(0, 5).map((x) => x.event);
}
