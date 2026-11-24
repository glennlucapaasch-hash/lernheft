# Lernheft

Eine Lern-App für die Schule, die im Browser läuft – auf Handy, Tablet und PC.

- **Seite scannen:** Vokabelseiten, Mathe-Aufgaben oder Lernstoff fotografieren – die KI macht Karteikarten daraus, du prüfst sie kurz und speicherst.
- **Karteikarten:** Abfrage durch Umdrehen, Schreiben (mit Prüfung von Schreibweise und Artikel, Sonderzeichen für Französisch/Spanisch) oder Ankreuzen. Ein Wiederholungsplan zeigt Karten, die du gut kannst, seltener. Aussprache zum Anhören.
- **Mathe:** wissenschaftlicher Taschenrechner (Grad/Bogenmaß, Verlauf), Funktionsplotter für bis zu drei Funktionen, KI-Erklärung von Aufgaben Schritt für Schritt (auch per Foto) mit ähnlichen Übungsaufgaben.
- **Probeklausuren:** automatisch erstellt – von der KI mit neuen Aufgaben oder ohne KI aus deinen Karten. Mit Zeitlimit, Korrektur, Note und Fehlerkartei.
- **Lernhelfer:** KI-Chat für alle Fragen rund um die Schule, auch mit Foto. Gibt bei Hausaufgaben erst Denkanstöße statt sofort der Lösung.
- **Notizen:** mit Apple Pencil (Druck, Neigung, Schweben mit Schnellmenü, Handballen-Erkennung), KI macht Karteikarten daraus.
- **Spiele:** Memory, Blitzrunde und Rangliste der Gruppe.
- **Klassenarbeiten:** Termin eintragen, die App plant das tägliche Pensum.
- **Stapel teilen**, **Bilder auf Karten**, **tägliche Erinnerungen** aufs Handy.
- **Themen:** 98 Themen Klasse 5–10 (Mathe, Deutsch, Englisch, Französisch, Spanisch) nach dem Hamburger Bildungsplan, mit Erklärung, Beispiel, Merksatz und KI-Übungskarten.
- **Duell:** live gegeneinander mit Code, **Level & Abzeichen**, **Wochenrückblick**.
- **Mündlich abfragen:** Antwort ins Mikrofon sprechen.
- **Vokabelspiele:** Wortregen, Buchstabensalat, Galgenmännchen.
- **Statistik:** Lernserie, Tagesziel, Abfragen der letzten 14 Tage, Lernstand und Notenverlauf.
- Hell („Heft“) oder dunkel („Tafel“), offline nutzbar, als App auf den Startbildschirm legbar.

## KI-Schlüssel

Für Scannen, Erklären und KI-Klausuren braucht die App einen eigenen API-Schlüssel von Anthropic (Claude Console → API Keys). Er wird nur im Browser gespeichert und nur an Anthropic geschickt. Jede Anfrage kostet ein paar Cent. Ohne Schlüssel funktionieren Karteikarten, Rechner, Plotter und Klausuren aus den eigenen Karten.

## Starten

Keine Installation nötig – es sind nur statische Dateien.

```bash
npm start        # öffnet einen kleinen Server auf http://localhost:8080
npm test         # prüft Rechner, Antwortprüfung, Wiederholungsplan, Klausuren
```

**Kostenlos online stellen:** Im GitHub-Repository unter *Settings → Pages* „Deploy from a branch“, Branch `main`, Ordner `/ (root)` wählen. Nach ein bis zwei Minuten läuft die App unter `https://<name>.github.io/<repo>/` – auf dem Handy öffnen und „Zum Startbildschirm hinzufügen“.

## Daten

Alles liegt nur auf dem Gerät (localStorage). Unter *Einstellungen → Sicherung erstellen* lässt sich alles sichern und auf einem anderen Gerät einspielen.

## Mit Konten auf dem eigenen Server

Läuft die App über `server/server.js`, gibt es Anmeldung mit Benutzername und Passwort. Jede Person hat eigene Karten, Chats und Klausuren (auf dem Server gespeichert), der Admin verwaltet in der App unter **Verwaltung** die Personen, den KI-Schlüssel, das Modell und ein Tageslimit. Der Schlüssel liegt nur auf dem Server.

```bash
# Docker (Daten liegen in /opt/lernheft-daten)
docker run -d --name lernheft --restart unless-stopped -p 172.18.0.1:3020:3000 \
  -v /opt/lernheft:/app:ro -v /opt/lernheft-daten:/daten -e DATEN=/daten -w /app \
  node:22-alpine node server/server.js

docker exec lernheft node server/benutzer.js admin glenn        # Admin anlegen, Passwort wird angezeigt
docker exec lernheft node server/benutzer.js anlegen anna ben    # weitere Konten
docker exec lernheft node server/benutzer.js liste
```

Sicherung: den Ordner `/opt/lernheft-daten` kopieren.
