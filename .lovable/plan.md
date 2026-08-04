# Rensad kontrollstation — fokus på körning

Idag visas allt samtidigt på startsidan: video + HUD, förarpanel, telemetri (6 rutor), joysticks, knappar, anslutningshälsa (12 mätvärden), framtidspaneler och logg. Det blir en lång, rörig sida där det viktiga (video, styrning, nödstopp) drunknar.

## Nytt upplägg

**Alltid synligt (ovanför "vecket"):**
- Videoströmmen med HUD (batteri, wifi, hastighet, gas/ratt, läge)
- Joysticks
- Kontrollknappar (ljus, tuta, foto, nödstopp)
- En smal statusrad högst upp: anslutningsprick + ping + batteri + "Du styr"/"Annan styr" i komprimerad form

**Dolt bakom en "Detaljer"-panel (utfällbar längst ner, stängd som standard):**
- Full telemetri (spänning, dBm, temperatur, hastighet, ping)
- Anslutningshälsa (jitter, min/medel/max, paketförlust, försök, meddelanden)
- Förarpanel med sessions-ID och övertagningshistorik
- Logg

**Fortsatt påträngande när det behövs:**
- Nödstopp och anslutningsbortfall visas som idag med tydligt överlägg — ingenting av säkerhetsvärde göms.
- Om anslutningen tappas eller pingen blir dålig lyfts ett kort felmeddelande upp i statusraden även om detaljpanelen är stängd.

## Teknisk avgränsning

- Endast presentation ändras. `useCarSocket`, protokoll, inställningar och serverkod rörs inte.
- Ny komponent `src/components/car/StatusBar.tsx` (kompakt topprad).
- Ny komponent `src/components/car/DetailsDrawer.tsx` som samlar befintliga `TelemetryPanel`, `ConnectionHealthPanel`, `DriverPanel` och `LogPanel` i en shadcn `Accordion`/`Collapsible`, öppet läge sparas i localStorage via befintlig settings-hook-stil (eller lokal state om vi vill hålla settings orörd).
- `FuturePanels` (GPS/AI-platshållare) tas bort helt från sidan och komponentfilen raderas.
- `src/routes/index.tsx` byggs om till: header/statusrad → video+HUD → joysticks → knappar → detaljlåda.
- Befintliga paneler behålls oförändrade internt, bara flyttade.
