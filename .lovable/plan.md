Bakgrund
--------
`deployment/pi-camera-server.py` använder redan libcamera `Transform(hflip=..., vflip=...)` styrt av miljövariablerna `CAM_HFLIP` / `CAM_VFLIP`. Detta är en hårdvarutransform och kostar i princip inget. För användaren är det dock smidigare att också kunna vända direkt i appen (CSS-transform, GPU-accelererat, ingen prestandapåverkan).

Plan
----
1. Utöka inställningar (`src/hooks/useSettings.tsx`)
   - Lägg till `videoFlipH: boolean` och `videoFlipV: boolean` i `Settings`-typen och `defaultSettings`.

2. Lägg till reglage på inställningssidan (`src/routes/settings.tsx`)
   - Två nya toggles:
     - "Vänd bild horisontellt"
     - "Vänd bild vertikalt"
   - Placera dem i en ny sektion under videoinställningarna.

3. Applicera vändning i videokomponenten (`src/components/car/VideoFeed.tsx`)
   - Ta emot nya props `flipH?: boolean` och `flipV?: boolean`.
   - Applicera på `<img>` via inline style:
     - `transform: scaleX(-1)` när `flipH` är true
     - `transform: scaleY(-1)` när `flipV` är true
     - kombinera med `scaleX(-1) scaleY(-1)` om båda är true
   - CSS-transformen är GPU-komponerad och påverkar inte CPU/batteri.

4. Träda inställningarna till `VideoFeed` (`src/routes/index.tsx`)
   - Skicka med `flipH={settings.videoFlipH}` och `flipV={settings.videoFlipV}`.

5. Dokumentera hårdvarualternativet (`deployment/pi-camera.service` + docs)
   - Behåll befintliga `Environment=CAM_HFLIP=0` och `Environment=CAM_VFLIP=0`.
   - Lägg till en kort kommentar i tjänsten och i `docs/raspberry-pi-deployment.md` om att ändra dessa till `1` för att vända i kameran istället för i appen.

6. Uppdatera setup-scriptet (`scripts/pi-camera-setup.sh`)
   - Säkerställ att en eventuellt redigerad tjänstefil inte skrivs över utan varning, eller dokumentera att användaren själv ändrar `CAM_HFLIP`/`CAM_VFLIP` i `/etc/systemd/system/pi-camera.service` efter installation.

Kontrollpunkter
---------------
- [ ] Inställningssidan visar de nya toggles.
- [ ] Videoströmmen vänder sig direkt när toggles ändras.
- [ ] Helskärmsläget och landskapsrotation påverkas inte av vändningen.
- [ ] Ingen synbar prestandaförlust mäts i dev-tools / på Pi.

Berörda filer
-------------
- `src/hooks/useSettings.tsx`
- `src/routes/settings.tsx`
- `src/components/car/VideoFeed.tsx`
- `src/routes/index.tsx`
- `deployment/pi-camera.service`
- `scripts/pi-camera-setup.sh`
- `docs/raspberry-pi-deployment.md`