// Termine per Sprache verschieben: "Verschiebe den Zahnarzt am Freitag auf Montag 15 Uhr".
import { parseLocal } from './parseLocal';
import { findMatches } from './deleteMatch';

const MOVE_WORDS = [
  'verschieb', 'verleg', 'änder', 'umleg',
  'move', 'reschedul', 'postpone', 'change',
  'ertele', 'değiştir', 'taşı',
  'déplac', 'decal', 'décal', 'modifi', 'reporte', 'reporter',
  'mueve', 'mover', 'cambia', 'aplaza', 'pospon',
  'أجل', 'اجل', 'غير', 'انقل', 'عدل',
];

export function isMoveRequest(text) {
  const t = ' ' + text.toLowerCase().replace(/[.,!?]/g, ' ') + ' ';
  return MOVE_WORDS.some((w) => t.includes(' ' + w));
}

// Teilt den Satz in "welcher Termin" und "neuer Zeitpunkt" (Deutsch/Englisch ohne KI).
export function parseMove(text, events, now = new Date()) {
  let rest = text;
  for (const w of MOVE_WORDS) rest = rest.replace(new RegExp(w + '\\p{L}*', 'giu'), ' ');
  const m = rest.match(/^(.*)\s(?:auf|to|zu)\s(.*)$/iu);
  const oldPart = m ? m[1] : rest;
  const newPart = m ? m[2] : rest;
  // Für die Suche den neuen Zeitpunkt weglassen, sonst passt der alte Tag nicht.
  const matches = findMatches(m ? oldPart : stripDateWords(oldPart, now), events, now);
  const p = parseLocal(newPart, now);
  return { matches, dateGiven: p.dateGiven, timeGiven: p.timeGiven, newStart: p.start };
}

// Nur die Titelwörter behalten (Datum/Uhrzeit beschreiben ohne "auf" den neuen Zeitpunkt).
function stripDateWords(text, now) {
  const p = parseLocal(text, now);
  return p.title === 'Termin' ? '' : p.title;
}

// Neuer Beginn für einen gefundenen Termin: nur das ändern, was gesagt wurde.
export function shiftedStart(event, move) {
  const old = new Date(event.startDate);
  const n = new Date(old);
  if (move.dateGiven) n.setFullYear(move.newStart.getFullYear(), move.newStart.getMonth(), move.newStart.getDate());
  if (move.timeGiven) n.setHours(move.newStart.getHours(), move.newStart.getMinutes(), 0, 0);
  return n;
}
