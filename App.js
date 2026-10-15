import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { requireOptionalNativeModule } from 'expo';
import * as Calendar from 'expo-calendar/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseLocal } from './src/parseLocal';
import { parseWithClaude } from './src/ai';
import { LANGUAGES, deviceLanguage } from './src/i18n';

// Die eingebaute Spracherkennung gibt es nur in einer eigenen App-Version (nicht in Expo Go).
// In Expo Go fehlt das Modul, dann nutzt man das Mikrofon der Tastatur.
const Speech = requireOptionalNativeModule('ExpoSpeechRecognition');

const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtNice = (d, locale) =>
  d.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' }) + ' ' + fmtTime(d);

function readDateTime(dateStr, timeStr) {
  const dm = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(dateStr.trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!dm || !tm) return null;
  return new Date(+dm[3], +dm[2] - 1, +dm[1], +tm[1], +tm[2]);
}

export default function Root() {
  return (
    <SafeAreaProvider>
      <App />
    </SafeAreaProvider>
  );
}

function App() {
  const [hasPermission, setHasPermission] = useState(null);
  const [calendars, setCalendars] = useState([]);
  const [calendarId, setCalendarId] = useState(null);
  const [events, setEvents] = useState([]);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [lang, setLang] = useState(deviceLanguage());
  const L = LANGUAGES[lang];
  const t = L.t;
  const dir = L.rtl ? { textAlign: 'right', writingDirection: 'rtl' } : null;
  const inputRef = useRef(null);

  // ---------- Kalender ----------
  const loadEvents = useCallback(async (cals) => {
    const ids = (cals || calendars).map((c) => c.id);
    if (!ids.length) return;
    const now = new Date();
    const until = new Date(now.getTime() + 21 * 24 * 3600 * 1000);
    const list = await Calendar.getEventsAsync(ids, now, until);
    list.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    setEvents(list);
  }, [calendars]);

  useEffect(() => {
    (async () => {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      setHasPermission(status === 'granted');
      const savedKey = await AsyncStorage.getItem('apiKey');
      if (savedKey) setApiKey(savedKey);
      const savedLang = await AsyncStorage.getItem('lang');
      if (savedLang && LANGUAGES[savedLang]) setLang(savedLang);
      if (status !== 'granted') return;

      const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      setCalendars(cals);
      const writable = cals.filter((c) => c.allowsModifications);
      const saved = await AsyncStorage.getItem('calendarId');
      let chosen = writable.find((c) => c.id === saved);
      if (!chosen && Platform.OS === 'ios') {
        const def = await Calendar.getDefaultCalendarAsync().catch(() => null);
        chosen = writable.find((c) => c.id === def?.id);
      }
      if (!chosen) chosen = writable.find((c) => c.isPrimary) || writable[0];
      if (chosen) setCalendarId(chosen.id);
      await loadEvents(cals);
    })().catch((e) => Alert.alert('Error', String(e.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Spracherkennung (nur eigene App-Version) ----------
  useEffect(() => {
    if (!Speech) return;
    const subs = [
      Speech.addListener('result', (ev) => setText(ev.results?.[0]?.transcript || '')),
      Speech.addListener('end', () => setListening(false)),
      Speech.addListener('error', (ev) => {
        setListening(false);
        if (ev.error !== 'no-speech' && ev.error !== 'aborted') Alert.alert('🎤', ev.message || ev.error);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  const toggleMic = async () => {
    if (!Speech) {
      inputRef.current?.focus();
      Alert.alert(t.mic, t.micFallback);
      return;
    }
    if (listening) {
      Speech.stop();
      return;
    }
    const perm = await Speech.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t.mic, t.micPermission);
      return;
    }
    setText('');
    setDraft(null);
    setListening(true);
    Speech.start({ lang: L.speech, interimResults: true, continuous: false });
  };

  // ---------- Verstehen ----------
  const understand = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      let result;
      if (apiKey) {
        try {
          result = await parseWithClaude(text, apiKey, events, L.name);
        } catch (e) {
          result = { ...parseLocal(text), hint: t.aiFailed + ' ' + e.message };
        }
      } else {
        result = { ...parseLocal(text), hint: lang === 'de' ? '' : t.needKey };
      }
      setDraft({
        title: result.title,
        location: result.location,
        notes: result.notes,
        hint: result.hint || '',
        date: fmtDate(result.start),
        startTime: fmtTime(result.start),
        endTime: fmtTime(result.end),
        allDay: result.allDay,
      });
    } finally {
      setBusy(false);
    }
  };

  // ---------- Speichern ----------
  const save = async () => {
    const start = readDateTime(draft.date, draft.startTime);
    let end = readDateTime(draft.date, draft.endTime);
    if (!start || !end) {
      Alert.alert(t.checkInput, t.checkInputText);
      return;
    }
    if (end <= start) end = new Date(end.getTime() + 24 * 3600 * 1000);
    if (!calendarId) {
      Alert.alert(t.error, t.noCalendar);
      return;
    }
    try {
      await Calendar.createEventAsync(calendarId, {
        title: draft.title,
        startDate: start,
        endDate: end,
        location: draft.location || undefined,
        notes: draft.notes || undefined,
        allDay: draft.allDay,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        alarms: [{ relativeOffset: -30 }],
      });
      setDraft(null);
      setText('');
      await loadEvents();
      Alert.alert(t.savedTitle, t.saved(draft.title, fmtNice(start, L.locale)));
    } catch (e) {
      Alert.alert(t.error, String(e.message || e));
    }
  };

  const pickCalendar = async (id) => {
    setCalendarId(id);
    await AsyncStorage.setItem('calendarId', id);
  };

  const pickLang = async (code) => {
    setLang(code);
    await AsyncStorage.setItem('lang', code);
  };

  const saveKey = async (k) => {
    setApiKey(k.trim());
    await AsyncStorage.setItem('apiKey', k.trim());
  };

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={[styles.h1, dir]}>{t.noPermissionTitle}</Text>
        <Text style={[styles.muted, dir]}>{t.noPermission}</Text>
      </SafeAreaView>
    );
  }

  const writable = calendars.filter((c) => c.allowsModifications);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={styles.headerRow}>
            <Text style={styles.h1}>{t.appTitle}</Text>
            <Pressable onPress={() => setShowSettings(!showSettings)} hitSlop={12}>
              <Text style={styles.link}>{showSettings ? t.done : t.settings}</Text>
            </Pressable>
          </View>

          {showSettings && (
            <View style={styles.card}>
              <Text style={[styles.label, dir]}>{t.language}</Text>
              <View style={styles.langRow}>
                {Object.entries(LANGUAGES).map(([code, l]) => (
                  <Pressable key={code} onPress={() => pickLang(code)} style={[styles.chip, code === lang && styles.chipOn]}>
                    <Text style={[styles.chipText, code === lang && { color: '#fff' }]}>{l.name}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.label, dir, { marginTop: 16 }]}>{t.calendarToSave}</Text>
              {writable.map((c) => (
                <Pressable key={c.id} onPress={() => pickCalendar(c.id)} style={styles.calRow}>
                  <View style={[styles.dot, { backgroundColor: c.color || '#888' }]} />
                  <Text style={styles.calName}>
                    {c.title}
                    {c.source?.name ? `  (${c.source.name})` : ''}
                  </Text>
                  {c.id === calendarId && <Text style={styles.check}>✓</Text>}
                </Pressable>
              ))}
              <Text style={[styles.label, dir, { marginTop: 16 }]}>{t.apiKey}</Text>
              <TextInput
                style={styles.input}
                value={apiKey}
                onChangeText={saveKey}
                placeholder="sk-ant-…"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
              <Text style={[styles.muted, dir]}>{t.apiKeyHelp}</Text>
            </View>
          )}

          <Pressable onPress={toggleMic} style={[styles.mic, listening && styles.micOn]}>
            <Text style={styles.micIcon}>{listening ? '■' : '🎤'}</Text>
            <Text style={styles.micText}>{listening ? t.listening : t.speak}</Text>
          </Pressable>

          <TextInput
            ref={inputRef}
            style={[styles.input, styles.big, dir]}
            value={text}
            onChangeText={setText}
            placeholder={t.placeholder}
            multiline
          />

          <Pressable onPress={understand} style={[styles.button, !text.trim() && styles.disabled]} disabled={!text.trim() || busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t.understand}</Text>}
          </Pressable>

          {draft && (
            <View style={styles.card}>
              <Text style={[styles.h2, dir]}>{t.newEvent}</Text>
              {!!draft.hint && <Text style={[styles.hint, dir]}>{draft.hint}</Text>}
              <Field dir={dir} label={t.title} value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} />
              <Field dir={dir} label={t.date} value={draft.date} onChange={(v) => setDraft({ ...draft, date: v })} />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Field dir={dir} label={t.from} value={draft.startTime} onChange={(v) => setDraft({ ...draft, startTime: v })} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field dir={dir} label={t.to} value={draft.endTime} onChange={(v) => setDraft({ ...draft, endTime: v })} />
                </View>
              </View>
              <Field dir={dir} label={t.location} value={draft.location} onChange={(v) => setDraft({ ...draft, location: v })} />
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                <Pressable onPress={() => setDraft(null)} style={[styles.button, styles.secondary, { flex: 1 }]}>
                  <Text style={[styles.buttonText, { color: '#333' }]}>{t.discard}</Text>
                </Pressable>
                <Pressable onPress={save} style={[styles.button, { flex: 1 }]}>
                  <Text style={styles.buttonText}>{t.save}</Text>
                </Pressable>
              </View>
            </View>
          )}

          <Text style={[styles.h2, dir, { marginTop: 24 }]}>{t.upcoming}</Text>
          {events.length === 0 && <Text style={[styles.muted, dir]}>{t.noEvents}</Text>}
          {events.slice(0, 30).map((e) => (
            <View key={e.id + e.startDate} style={styles.eventRow}>
              <Text style={styles.eventTime}>{fmtNice(new Date(e.startDate), L.locale)}</Text>
              <Text style={styles.eventTitle} numberOfLines={1}>
                {e.title}
              </Text>
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, dir }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={[styles.label, dir]}>{label}</Text>
      <TextInput style={[styles.input, dir]} value={value} onChangeText={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F9' },
  center: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#F6F7F9' },
  page: { padding: 20, paddingBottom: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  h1: { fontSize: 24, fontWeight: '700', color: '#111' },
  h2: { fontSize: 18, fontWeight: '600', color: '#111', marginBottom: 8 },
  link: { color: '#2563EB', fontSize: 16 },
  muted: { color: '#666', fontSize: 14, marginTop: 6 },
  hint: { color: '#92400E', backgroundColor: '#FEF3C7', padding: 8, borderRadius: 8, marginBottom: 8 },
  label: { color: '#555', fontSize: 13, marginBottom: 4 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginTop: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111',
  },
  big: { minHeight: 90, textAlignVertical: 'top', marginTop: 16 },
  mic: { backgroundColor: '#2563EB', borderRadius: 18, paddingVertical: 22, alignItems: 'center' },
  micOn: { backgroundColor: '#DC2626' },
  micIcon: { fontSize: 36, color: '#fff' },
  micText: { color: '#fff', fontSize: 17, fontWeight: '600', marginTop: 6 },
  button: { backgroundColor: '#111827', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  secondary: { backgroundColor: '#E5E7EB' },
  disabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  chipText: { color: '#111', fontSize: 14 },
  calRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  calName: { flex: 1, fontSize: 15, color: '#111' },
  check: { color: '#2563EB', fontSize: 18, fontWeight: '700' },
  eventRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  eventTime: { width: 120, color: '#555' },
  eventTitle: { flex: 1, color: '#111' },
});
