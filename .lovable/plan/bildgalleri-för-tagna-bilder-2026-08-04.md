# Bildgalleri för tagna bilder

Ett galleri där varje tagen stillbild visas som thumbnail med tidsstämpel, går att öppna i stor vy och laddas ner igen.

## Så fungerar det

- När du trycker på fotoknappen sparas bilden som idag (nedladdning + på bilen), men läggs nu också till i galleriet.
- En ny galleriknapp visar antal bilder. Den öppnar en panel med rutnät av thumbnails, nyaste först, med klockslag och datum under varje bild.
- Klick på en thumbnail öppnar bilden stort med knappar för "Ladda ner" och "Radera".
- Galleriet rymmer de senaste 30 bilderna och överlever omladdning av sidan (sparas lokalt i webbläsaren). Knapp för "Rensa galleri".
- Om lagringen är full eller nekas visas bilderna ändå för den aktuella sessionen.

## Teknisk plan

- `src/lib/photoStore.ts`: IndexedDB-lager (`rc-photos`) som sparar `{ id, takenAt, blob, width, height }`, med `list()`, `add()` (trimmar till 30 senaste), `remove()`, `clear()`. Fallback till minne om IndexedDB saknas (t.ex. privat läge/SSR).
- `src/hooks/usePhotoGallery.ts`: laddar listan efter hydrering, exponerar `photos`, `addPhoto(blob)`, `removePhoto`, `clearAll`. Skapar och återkallar object-URL:er för thumbnails i en `useEffect`-cleanup så inget läcker.
- `src/components/car/PhotoGallery.tsx`: Sheet/Dialog (shadcn, samma glasmönster som `DetailsDrawer`) med responsivt rutnät, tidsstämpel via `toLocaleString("sv-SE")`, lightbox-läge samt ladda ner/radera. Tomt läge med hjälptext.
- `src/routes/index.tsx`: `handlePhoto` anropar `addPhoto(blob)` innan nedladdningen; ny galleriknapp placeras bredvid inställningsikonen i toppraden (badge med antal) och styr öppet läge.
- Filnamn vid nedladdning från galleriet återanvänder samma `rc-bild-ÅÅÅÅMMDD-HHMMSS.jpg`-format (bryts ut till en liten hjälpfunktion).
- Ingen serverändring; allt sker lokalt i webbläsaren.
