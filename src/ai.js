// KI-Verständnis über die Claude-API (alle Sprachen). Wird nur benutzt, wenn in den
// Einstellungen ein API-Schlüssel hinterlegt ist; sonst nutzt die App den deutschen Parser.

const MODEL = 'claude-haiku-5-5';

const pad = (n) => String(n).padStart(2, '0');
export const toLocalIso = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function fromLocalIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || '');
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

export async function parseWithClaude(text, apiKey, upcomingEvents = [], uiLanguage = 'Deutsch', now = new Date()) {
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const list = upcomingEvents.slice(0, 80);
  const busy = list
    .map((e, i) => `[${i}] ${toLocalIso(new Date(e.startDate))} to ${toLocalIso(new Date(e.endDate))}: ${e.title}`)
    .join('\n');

  const system = `You turn spoken sentences into calendar appointments. The user may speak any language
(German, English, Arabic, Turkish, French, Spanish, …).
Now is ${weekday}, ${toLocalIso(now)} (user's local time).
Existing appointments in the coming weeks:
${busy || '(none)'}

Rules:
- Reply with ONLY one JSON object, no other text.
- If the user wants to delete/cancel/remove an appointment, reply {"action":"delete","matches":[indices of the matching existing appointments, best first, at most 5],"hint":"..."}. Use [] if nothing fits.
- Otherwise create a new appointment with action "create" and the fields below.
- Fields for create: title (short, without date/time, in the language the user spoke), start and end as YYYY-MM-DDTHH:mm (local time), allDay (true/false), location (or ""), notes (or ""), hint (one short sentence in ${uiLanguage}, e.g. an overlap or an assumption you made, otherwise "").
- No duration given: 60 minutes. A bare hour like "at 3" without time of day means 15:00.
- If the user asks for a free time ("when I'm free", "sometime next week in the morning"), pick a free gap between the existing appointments.
- If the new appointment overlaps an existing one, say so in hint.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 500,
      system,
      messages: [{ role: 'user', content: text }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const raw = (data.content || []).map((c) => c.text || '').join('');
  const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  if (json.action === 'delete') {
    const matches = (json.matches || []).map((i) => list[i]).filter(Boolean);
    return { action: 'delete', matches, hint: json.hint || '' };
  }

  const start = fromLocalIso(json.start);
  if (!start) throw new Error('No valid date from AI.');
  const end = fromLocalIso(json.end) || new Date(start.getTime() + 3600000);
  return {
    title: json.title || 'Termin',
    start,
    end,
    allDay: !!json.allDay,
    location: json.location || '',
    notes: json.notes || '',
    hint: json.hint || '',
  };
}
