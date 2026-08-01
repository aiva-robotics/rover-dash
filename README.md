# RC Command Center

Skapa en modern, mobilanpassad webbapplikation för att fjärrstyra en radiostyrd bil med kamera. Designen ska kännas som en professionell kontrollstation för en robot eller FPV-fordon med mörkt tema, glasliknande paneler (glassmorphism), mjuka animationer och responsiv layout.



Layout:

- Överst visas en stor 16:9 livevideoström från en ESP32-CAM med möjlighet till helskärm.

- Ovanpå videon ska en transparent Driving HUD visas med batterinivå, WiFi-signal, hastighet, styrvinkel, gaspådrag, inspelningsindikator och kompass (förberedd för framtida IMU).

- Under videon finns två virtuella joysticks:

  - Vänster joystick styr gas/broms.

  - Höger joystick styr styrservot.

  - Joysticks ska fungera med både touch och mus och automatiskt återgå till mitten när de släpps.

- Nederst finns fyra stora knappar:

  - Strålkastare

  - Tuta

  - Ta bild

  - Stor röd Nödstopp-knapp



Instrumentpanel:

Visa i realtid:

- Batterispänning

- WiFi-signal

- Anslutningsstatus

- Hastighet

- Temperatur (om tillgänglig)

- Ping till bilen



Kommunikation:

- Använd WebSocket.

- Skicka styrkommandon kontinuerligt i JSON-format:

{

  "throttle": -100,

  "steering": 50

}

- Ta emot status som JSON och uppdatera gränssnittet automatiskt.



Inställningar:

Skapa en inställningssida där användaren kan ändra:

- WebSocket-adress

- Videoadress

- Maxhastighet

- Joystickkänslighet

- Invertera styrning

- Invertera gas



Alla inställningar ska sparas i Local Storage.



Säkerhet:

Om anslutningen bryts ska:

- En stor röd varning visas.

- Alla reglage inaktiveras.

- Gränssnittet tydligt indikera att bilen gått till nödstopp.



Förbered gränssnittet för framtida funktioner:

- GPS-karta

- AI-objektdetektering

- Videoinspelning

- Flera kameror

- Batterihistorik

- Loggpanel



Bygg applikationen i React + TypeScript med en modulär komponentstruktur som är enkel att vidareutveckla.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/422cf66d-660f-4919-b7d5-5cbf4e8ac53d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
