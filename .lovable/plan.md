# Ta bild – ladda ner till enheten

Fotoknappen finns redan men sparar bilden på bilens SD-kort. Nu ska ett tryck även ge dig bilden direkt i telefonen/datorn.

## Så fungerar det

- Tryck på **Bild** (samma knapp som idag, även i helskärm) → aktuell bildruta från videoströmmen fångas och laddas ner som JPEG.
- Filnamn: `rc-bild-ÅÅÅÅMMDD-HHMMSS.jpg`.
- Kort visuell bekräftelse: en snabb "blixt" över videon plus en rad i loggen ("Bild sparad: …").
- Bilden speglas/vänds precis som videon visas, så nedladdningen matchar det du ser.
- Fungerar även i demoläge? Nej – utan videoström visas ett tydligt meddelande "Ingen videoström att fånga".
- Bilden sparas fortfarande på bilen som tidigare (oförändrat beteende).

## Teknisk lösning

**`src/components/car/VideoFeed.tsx`**
- Exponera en `captureFrame()`-funktion via `useImperativeHandle` (forwardRef) som ritar `imgRef.current` till en offscreen `<canvas>` i naturlig upplösning, applicerar `videoFlipH`/`videoFlipV` som canvas-transform, och returnerar en `Blob` via `canvas.toBlob(..., "image/jpeg", 0.92)`.
- Sätt `crossOrigin="anonymous"` på `<img>` så att canvasen inte blir "tainted" när kameraservern ligger på en annan port/origin (den skickar redan `Access-Control-Allow-Origin: *`).
- Fallback när canvas ändå är tainted eller bilden inte laddat: hämta `/<samma bas>/snapshot` med `fetch` och använd den blobben.
- Lägg till en kort blixt-overlay (150 ms, CSS-opacity) vid lyckad fångst.

**`src/routes/index.tsx`**
- Ny `videoRef` till `VideoFeed`.
- `onPhoto` blir en `handlePhoto()`-callback: skickar `sendAction("photo")` som idag, anropar `videoRef.current?.captureFrame()`, skapar en objekt-URL och triggar nedladdning via ett temporärt `<a download>`-element (URL:en revokeas direkt efter).
- Fel loggas som `log("error", …)` i den befintliga loggpanelen.

Inga ändringar behövs på Raspberry Pi-sidan.
