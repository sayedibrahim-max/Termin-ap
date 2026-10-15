// Einfacher deutscher Termin-Parser ohne Internet.
// Versteht z.B. "Morgen um 15 Uhr Zahnarzt", "Freitag halb drei Meeting mit Ali",
// "am 14.11. um 9:30 Friseur für 2 Stunden", "nächsten Montag 10 Uhr Elternabend in der Schule".

const WEEKDAYS = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'];
const MONTHS = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
const NUMBERS = {
  ein: 1, eins: 1, eine: 1, einer: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8,
  neun: 9, zehn: 10, elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16,
  siebzehn: 17, achtzehn: 18, neunzehn: 19, zwanzig: 20, dreißig: 30, halbe: 0.5,
};
const NUM = '(\\d{1,2}|' + Object.keys(NUMBERS).sort((a, b) => b.length - a.length).join('|') + ')';

// JavaScripts \b kennt keine Umlaute ("übermorgen"), daher eigene Wortgrenze.
const WB = '(?:(?<=[\\p{L}\\d])(?![\\p{L}\\d])|(?<![\\p{L}\\d])(?=[\\p{L}\\d]))';
function rx(re, flags = '') {
  const src = typeof re === 'string' ? re : re.source;
  const own = typeof re === 'string' ? '' : re.flags;
  return new RegExp(src.replace(/\\b/g, WB), own + flags + 'u');
}

function toNum(s) {
  if (s == null) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  return NUMBERS[s] ?? null;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function parseLocal(input, now = new Date()) {
  // orig behält die Groß-/Kleinschreibung für den Titel, text ist kleingeschrieben zum Suchen.
  let orig = ' ' + input.replace(/[!?]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  let text = orig.toLowerCase();
  if (text.length !== orig.length) orig = text;
  const cut = (match) => {
    const blank = ' '.repeat(match[0].length);
    const at = match.index;
    text = text.slice(0, at) + blank + text.slice(at + match[0].length);
    orig = orig.slice(0, at) + blank + orig.slice(at + match[0].length);
  };

  // ---------- Datum ----------
  let day = null;
  let m;
  const today = startOfDay(now);

  if ((m = text.match(rx(/\b(\d{1,2})\.\s?(\d{1,2})\.?(\d{2,4})?\b/)))) {
    let y = m[3] ? parseInt(m[3], 10) : today.getFullYear();
    if (y < 100) y += 2000;
    day = new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
    if (!m[3] && day < today) day.setFullYear(y + 1);
    cut(m);
  } else if ((m = text.match(rx('\\b(\\d{1,2})\\.?\\s(' + MONTHS.join('|') + ')(\\s\\d{4})?\\b')))) {
    const y = m[3] ? parseInt(m[3], 10) : today.getFullYear();
    day = new Date(y, MONTHS.indexOf(m[2]), parseInt(m[1], 10));
    if (!m[3] && day < today) day.setFullYear(y + 1);
    cut(m);
  } else if ((m = text.match(rx(/\bübermorgen\b/)))) {
    day = addDays(today, 2);
    cut(m);
  } else if ((m = text.match(rx(/\bmorgen\b(?!s)/)))) {
    day = addDays(today, 1);
    cut(m);
  } else if ((m = text.match(rx(/\bheute\b/)))) {
    day = today;
    cut(m);
  } else if ((m = text.match(rx('\\bin ' + NUM + ' (tag|tagen|woche|wochen)\\b')))) {
    const n = toNum(m[1]) || 1;
    day = addDays(today, m[2].startsWith('woche') ? n * 7 : n);
    cut(m);
  } else if ((m = text.match(rx('\\b(nächsten|nächster|kommenden|kommender|diesen|am)?\\s?(' + WEEKDAYS.join('|') + ')\\b')))) {
    const target = WEEKDAYS.indexOf(m[2]);
    let diff = (target - today.getDay() + 7) % 7;
    if (diff === 0) diff = 7; // "Montag" am Montag = nächste Woche
    day = addDays(today, diff);
    cut(m);
  } else if ((m = text.match(rx(/\bnächste woche\b/)))) {
    const diff = ((1 - today.getDay() + 7) % 7) || 7;
    day = addDays(today, diff);
    cut(m);
  }

  // ---------- Uhrzeit ----------
  let hour = null;
  let minute = 0;
  if ((m = text.match(rx(/\b(?:um\s)?(\d{1,2})[:.](\d{2})(\s?uhr)?\b/)))) {
    hour = parseInt(m[1], 10);
    minute = parseInt(m[2], 10);
    cut(m);
  } else if ((m = text.match(rx('\\b(?:um\\s)?halb\\s' + NUM + '\\b')))) {
    hour = (toNum(m[1]) + 23) % 24;
    minute = 30;
    cut(m);
  } else if ((m = text.match(rx('\\b(?:um\\s)?viertel nach\\s' + NUM + '\\b')))) {
    hour = toNum(m[1]);
    minute = 15;
    cut(m);
  } else if ((m = text.match(rx('\\b(?:um\\s)?viertel vor\\s' + NUM + '\\b')))) {
    hour = (toNum(m[1]) + 23) % 24;
    minute = 45;
    cut(m);
  } else if ((m = text.match(rx('\\bum\\s' + NUM + '(\\suhr)?\\b')) || text.match(rx('\\b' + NUM + '\\suhr\\b')))) {
    hour = toNum(m[1]);
    cut(m);
  }

  let partOfDay = null;
  if ((m = text.match(rx(/\b(morgens|früh|vormittags?|mittags?|nachmittags?|abends?|nachts)\b/)))) {
    partOfDay = m[1].replace(/s$/, '');
    cut(m);
  }
  if (hour != null) {
    const pm = ['nachmittag', 'abend', 'nacht'].includes(partOfDay);
    const am = ['morgen', 'früh', 'vormittag'].includes(partOfDay);
    if (pm && hour < 12) hour += 12;
    // "um 3" ohne Angabe meint meistens 15 Uhr
    if (!pm && !am && hour >= 1 && hour <= 7) hour += 12;
  } else if (partOfDay) {
    hour = { morgen: 8, früh: 8, vormittag: 10, mittag: 12, nachmittag: 15, abend: 19, nacht: 22 }[partOfDay];
  }

  // ---------- Dauer ----------
  let durationMin = 60;
  if ((m = text.match(rx('\\b(?:für\\s)?(?:eine\\s)?' + NUM + '\\s(stunde|stunden)\\b')))) {
    durationMin = Math.round(toNum(m[1]) * 60);
    cut(m);
  } else if ((m = text.match(rx(/\b(?:für\s)?(eine\s)?halbe stunde\b/)))) {
    durationMin = 30;
    cut(m);
  } else if ((m = text.match(rx('\\b(?:für\\s)?' + NUM + '\\s(minute|minuten)\\b')))) {
    durationMin = toNum(m[1]);
    cut(m);
  }

  // ---------- Ort ----------
  let location = '';
  if ((m = orig.match(rx(/\b(?:ort|adresse)\s?:?\s(.+)$/i)))) {
    location = m[1].trim();
    cut(m);
  } else if ((m = orig.match(rx(/\b(?:in der|in dem|im)\s([^,]+?)\s*$/i)))) {
    location = m[1].trim();
    cut(m);
  }

  // ---------- Titel ----------
  const filler = rx(/\b(bitte|trag(e)?|ein|eintragen|erstelle|mach(e)?|leg(e)?|an|neuen|neuer|einen|einem|termin|am|um|uhr|für|mir|mich|ich|habe|hab|einen|ist|zum|zur|den|der|die|das|und)\b/i, 'g');
  let title = orig.replace(filler, ' ').replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!title) title = 'Termin';
  title = title.charAt(0).toUpperCase() + title.slice(1);
  location = location ? location.charAt(0).toUpperCase() + location.slice(1) : '';

  const dateGiven = !!day;
  const timeGiven = hour != null;
  if (!day) day = hour != null && hour * 60 + minute <= now.getHours() * 60 + now.getMinutes() ? addDays(today, 1) : today;
  if (hour == null) {
    hour = 9;
  }
  const start = new Date(day);
  start.setHours(hour, minute, 0, 0);
  const end = new Date(start.getTime() + durationMin * 60000);

  return { title, location, notes: '', start, end, allDay: false, dateGiven, timeGiven };
}
