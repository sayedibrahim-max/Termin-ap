# Termin per Sprache – erster Prototyp

## Was die App kann

1. Du sprichst einen Termin, z.B. „Morgen um 15 Uhr Zahnarzt“ oder „Freitag halb drei Meeting mit Ali im Büro“.
2. Die App versteht Datum, Uhrzeit, Dauer, Titel und Ort und zeigt dir den Termin zum Prüfen.
3. Mit „Im Kalender speichern“ landet er im Kalender deines Handys (Google-Kalender auf Android, Apple-Kalender auf dem iPhone, auch Outlook, wenn er dort eingebunden ist). Eine Erinnerung 30 Minuten vorher wird gesetzt.
4. Unten siehst du deine Termine der nächsten drei Wochen.

**KI:** Ohne Einstellung versteht die App einfache deutsche Sätze selbst (ohne Internet). Wenn du in den Einstellungen einen Claude-API-Schlüssel einträgst, versteht die KI auch freie Sätze wie „Trag mir nächste Woche vormittags den Friseur ein, wenn ich frei bin“, sucht eine freie Lücke und warnt bei Überschneidungen.

## Technik (kurz)

- Expo / React Native: eine App für Android und iPhone.
- `expo-calendar`: voller Zugriff auf den Handy-Kalender.
- `expo-speech-recognition`: Spracherkennung auf dem Handy (Deutsch).
- Claude (Modell `claude-haiku-5-5`) für das KI-Verständnis, optional.

## Ausprobieren

### Weg A: Schnelltest mit Expo Go (ohne eigenen Mikrofon-Knopf)

1. „Expo Go“ aus dem Play Store / App Store aufs Handy laden.
2. Am Computer (Node.js installiert) im Ordner `termin-app`: `npm install`, dann `npx expo start`.
3. Den QR-Code mit dem Handy scannen (Android: in Expo Go, iPhone: mit der Kamera).
4. In Expo Go sprichst du über das Mikrofon-Symbol der Tastatur.

### Weg B: Echte App auf dem Handy (mit Mikrofon-Knopf)

- **Android:** kostenloses Konto auf expo.dev, dann `npx eas-cli build -p android --profile preview`. Ergebnis ist eine APK-Datei, die man direkt aufs Handy laden und installieren kann.
- **iPhone:** braucht ein Apple-Entwicklerkonto (99 €/Jahr) und wird dann über TestFlight installiert.

## Termine löschen

Sag zum Beispiel „Lösche den Zahnarzt am Freitag“ oder „Sag den Friseur ab“. Die App zeigt die passenden Termine, und du tippst beim richtigen auf **Löschen** und bestätigst. Bei Serienterminen wird nur dieser eine Termin gelöscht. Auf dem Sperrbildschirm ist Löschen gesperrt.

## Vom Sperrbildschirm aus (Android)

Die App bringt eine Schnell-Kachel „Termin sprechen“ mit:

1. Wische von oben zweimal nach unten, damit die Schnelleinstellungen ganz aufgehen.
2. Tippe auf den Stift (Bearbeiten) und ziehe „Termin sprechen“ nach oben zu deinen Kacheln.
3. Ab jetzt: Sperrbildschirm → nach unten wischen → Kachel antippen. Die App hört sofort zu, versteht den Satz automatisch und zeigt den Termin zum Speichern.

Auf dem Sperrbildschirm zeigt die App keine Termine und keine Einstellungen an.

## Bekannte Grenzen

- Der eingebaute Parser kennt keine Wiederholungen („jeden Montag“) und keine ganztägigen Termine; die KI kann das.
- Der API-Schlüssel wird nur auf dem Handy gespeichert. Für eine App, die andere Leute nutzen, gehört der Schlüssel später auf einen eigenen Server.
- Die KI-Anbindung ist geschrieben, aber noch nicht mit einem echten Schlüssel getestet.
