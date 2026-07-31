## Mål

En mobilanpassad kontrollstation för en RC-bil med ESP32-CAM: livevideo med HUD, två virtuella joysticks, snabbknappar, telemetri och en inställningssida. Allt i React + TypeScript med modulär struktur.

## Design

- Mörkt tema, glasliknande paneler (glassmorphism), neonaccent i cyan/limegrön, röd för fara.
- Tokens läggs i `src/styles.css` (mörkt som standard), monospace-siffror för telemetri.
- Layout optimerad för mobil i stående läge, skalar upp till desktop (video + sidopanel).

## Sidor

- `/` — Kontrollstation
- `/settings` — Inställningar

```text
┌───────────────────────────┐
│  16:9 video + HUD overlay │  batteri, wifi, km/h,
│               [fullskärm] │  rattvinkel, gas, REC, kompass
├───────────────────────────┤
│  Telemetripanel (chips)   │  V, RSSI, status, hastighet, temp, ping
├─────────────┬─────────────┤
│ Gas/broms   │  Styrning   │  två joysticks
├─────────────┴─────────────┤
│ Ljus │ Tuta │ Foto │ STOP │
└───────────────────────────┘
```

## Funktion

**Joysticks:** egen komponent med Pointer Events (touch + mus), fjädrar tillbaka till mitten vid släpp, vänster låst till Y-axel (gas/broms), höger till X-axel (styrning). Känslighet, maxhastighet och invertering appliceras från inställningarna.

**WebSocket:** en `useCarSocket`-hook som ansluter till adressen i inställningarna, skickar `{"throttle":-100,"steering":50}` ~20 ggr/sek (endast vid ändring eller hjärtslag), tar emot status-JSON (batteri, rssi, hastighet, temp) och mäter ping via ping/pong. Automatisk återanslutning med backoff.

**Säkerhet:** vid avbruten anslutning visas en stor röd varningsoverlay, alla reglage inaktiveras, joysticks nollställs och gränssnittet markerar NÖDSTOPP. Nödstoppsknappen skickar stoppkommando och låser reglagen tills den kvitteras.

**Inställningar:** WebSocket-adress, videoadress, maxhastighet, joystickkänslighet, invertera styrning, invertera gas — sparas i Local Storage via en `SettingsProvider` (läses efter hydrering för att undvika SSR-krockar).

**Förberett för framtiden:** platshållarkort/flikar för GPS-karta, AI-objektdetektering, videoinspelning, flera kameror, batterihistorik och loggpanel — loggpanelen fungerar direkt (visar WebSocket-händelser), övriga visas som "kommer snart" med färdig struktur.

## Teknisk översikt

```text
src/routes/index.tsx          kontrollstation
src/routes/settings.tsx       inställningar
src/components/car/VideoFeed.tsx, DrivingHUD.tsx, Joystick.tsx,
  ControlButtons.tsx, TelemetryPanel.tsx, ConnectionLostOverlay.tsx,
  LogPanel.tsx, FuturePanels.tsx
src/hooks/useCarSocket.ts, useSettings.tsx, useLocalStorage.ts
src/lib/car-protocol.ts       typer + JSON-schema för kommandon/status
```

Ingen backend behövs — bilen är WebSocket-servern. Utan ansluten bil visar appen frånkopplat läge (och ett valfritt demoläge så gränssnittet går att testa).

Varje route får egen SEO-metadata.