# Lernheft

Eine Lern-App für die Schule, die im Browser läuft – auf Handy, Tablet und PC.

- **Seite scannen:** Vokabelseiten, Mathe-Aufgaben oder Lernstoff fotografieren – die KI macht Karteikarten daraus, du prüfst sie kurz und speicherst.
- **Karteikarten:** Abfrage durch Umdrehen, Schreiben (mit Prüfung von Schreibweise und Artikel, Sonderzeichen für Französisch/Spanisch) oder Ankreuzen. Ein Wiederholungsplan zeigt Karten, die du gut kannst, seltener. Aussprache zum Anhören.
- **Mathe:** wissenschaftlicher Taschenrechner (Grad/Bogenmaß, Verlauf), Funktionsplotter für bis zu drei Funktionen, KI-Erklärung von Aufgaben Schritt für Schritt (auch per Foto) mit ähnlichen Übungsaufgaben.
- **Probeklausuren:** automatisch erstellt – von der KI mit neuen Aufgaben oder ohne KI aus deinen Karten. Mit Zeitlimit, Korrektur, Note und Fehlerkartei.
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
