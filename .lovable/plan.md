# Språkstöd: engelska och svenska

Appens gränssnitt är idag hårdkodat på svenska. Planen inför ett litet översättningslager med engelska som standard och ett språkval i inställningsvyn.

## Vad som byggs

- **Språkval i inställningar**: ny rad högst upp i inställningsvyn med två val, English och Svenska. Valet sparas i samma Local Storage-inställningar som resten (adresser, maxfart, invertering) och gäller direkt utan omladdning.
- **Standard engelska**: nya användare får engelska. Befintliga användare som redan har sparade inställningar får också engelska tills de aktivt väljer svenska.
- **Alla synliga texter översätts**, inklusive:
  - statusrad, förarpanel, kontrollknappar, nödstopp
  - videoruta (statusmeddelanden, försök igen, helskärm, vrid enheten)
  - HUD-banners och lägesetiketter
  - anslutningsvarningar och felmeddelanden vid tappad kontakt
  - detaljlådan: telemetri, anslutningshälsa, logg
  - bildgalleriet (tomt läge, ladda ner, radera, tidsstämplar)
  - hela inställningsvyn med hjälptexter
- **Datum och tid** (bildgalleri, senaste övertagande) formateras enligt valt språk.
- **Sidtitlar och beskrivningar** för start- och inställningsvyn följer språkvalet där det går; standardmetadata i sidhuvudet skrivs på engelska.

## Teknisk lösning

- Ny modul `src/lib/i18n.ts` med `type Lang = "en" | "sv"` och ett typat ordboksobjekt `translations` (nyckel -> `{ en, sv }` eller två platta objekt med delad nyckeltyp), plus stöd för enkel interpolering (`{count}`, `{name}`).
- Ny `src/hooks/useI18n.tsx` som läser `settings.language` från befintlig `SettingsProvider` och exponerar `t(key, vars?)` samt `lang`. Ingen extra provider behövs; `SettingsProvider` ligger redan över hela trädet.
- `Settings` i `src/hooks/useSettings.tsx` utökas med `language: Lang`, `defaultSettings.language = "en"`. Hydrering behåller nuvarande merge-logik, så saknad nyckel i gammal Local Storage blir automatiskt `"en"`.
- Alla komponenter under `src/components/car/` samt `src/routes/index.tsx` och `src/routes/settings.tsx` byter hårdkodade strängar mot `t(...)`. Toast-texter och logg-/felsträngar som visas i UI (bl.a. de som produceras i `src/hooks/useCarSocket.ts` och `ConnectionLostOverlay.tsx`) flyttas till nyckelbaserade koder som översätts vid rendering, så att hooken förblir språkoberoende.
- Tid/datum via `Intl.DateTimeFormat` med `en-GB` respektive `sv-SE`.
- `<html lang>` i `src/routes/__root.tsx` sätts efter valt språk.
- Serverskript och deployment-dokumentation i `deployment/` och `docs/` berörs inte.

## Utanför omfattning

- Ingen översättning av loggtext som kommer råa från Pi-servern (visas som de skickas).
- Inga fler språk än engelska och svenska.
