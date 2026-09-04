# Anpassa appen till nya WebSocket-protokollet (rc-car-server.service)

Servern (STM32-bryggan) accepterar inte längre `{throttle, steering}`. Den förväntar sig
`{"rc": [c1, c2, c3, c4], "digital": 0..15, "buzzer": 0..65535}` med värden -1000..1000,
plus `{"estop": bool}` och `{"action": ...}`. Appen skickar fortfarande det gamla formatet,
så styrningen når aldrig hårdvaran.

## Vad som ändras

1. **Kommandoformat**
   - Skala appens -100..100 till -1000..1000.
   - Kanal 1 (index 0) = styrning, kanal 3 (index 2) = gas. Kanal 2 och 4 skickas som 0.
   - `estop` skickas som idag i samma paket.
   - Kommandot skickas fortfarande med 20 Hz (serverns watchdog kräver det).

2. **Tillbehör mot rätt fält**
   - Ljus: digital utgång bit 0 (`digital: 1`), skickas som del av det löpande kommandot
     så att STM32:ans failsafe inte släcker det.
   - Tuta: `buzzer` sätts till 2000 Hz medan knappen hålls/aktiveras, annars 0.
   - `sendAction("headlights"/"horn")` tas bort — servern känner inte igen dem.

3. **Telemetri och status**
   - Ljusstatus läses från serverns eko (`stm32.digitalMask`) istället för `status.headlights`.
   - `failsafe` från STM32 visas som varningsläge i gränssnittet (finns redan i typen).
   - Batteri kommer nu från INA226 (`battery` i volt) — befintlig visning fungerar,
     men procentskalan justeras inte i denna ändring.

4. **Typer**
   - `DriveCommand` utökas med `digital` och `buzzer` (valfria) i `src/lib/car-protocol.ts`.
   - `CarStatus` får `stm32?`-fältet typat så att digitalMask/failsafe kan läsas säkert.

## Berörda filer

- `src/lib/car-protocol.ts` – typer + skalningshjälpare (`toRcValue`).
- `src/hooks/useCarSocket.ts` – bygger `{rc, digital, buzzer, estop}`-paketet i sändloopen.
- `src/routes/index.tsx` – ljus/tuta styr nu kommandots `digital`/`buzzer`; läser ljusstatus
  från `stm32.digitalMask`.
- `src/components/car/ControlButtons.tsx` – oförändrat API, endast anropen kopplas om.

Inga ändringar i serverkoden eller deployment-skripten behövs.
