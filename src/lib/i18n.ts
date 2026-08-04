export type Lang = "en" | "sv";

export const LANGUAGES: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "sv", label: "Svenska" },
];

export const LOCALES: Record<Lang, string> = { en: "en-GB", sv: "sv-SE" };

type Dict = Record<string, string>;

const en = {
  // Common
  "common.dash": "—",
  "common.back": "Back",
  "common.close": "Close",
  "common.reset": "Reset",
  "common.settings": "Settings",
  "common.connected": "Connected",
  "common.connecting": "Connecting…",
  "common.disconnected": "Offline",
  "common.offlineShort": "Offline",

  // Head / meta
  "meta.home.title": "RC Control Station — FPV camera car control",
  "meta.home.description":
    "Mobile-first control station for an RC car with a Raspberry Pi camera: live video, HUD, joysticks and realtime telemetry.",
  "meta.home.ogDescription":
    "Live video, driving HUD, virtual joysticks and telemetry over WebSocket.",
  "meta.settings.title": "Settings — RC Control Station",
  "meta.settings.description":
    "Configure WebSocket address, video address, top speed, joystick sensitivity and inverted controls.",
  "meta.settings.ogDescription": "Tune connection and driving feel for your RC car.",

  // Status bar
  "status.driver.offline": "Offline",
  "status.driver.none": "No driver",
  "status.driver.me": "You drive",
  "status.driver.other": "Other driver",
  "status.driver.offlineShort": "Offline",
  "status.driver.noneShort": "None",
  "status.driver.meShort": "You",
  "status.driver.otherShort": "Other",

  // HUD
  "hud.mode.live": "Live",
  "hud.mode.demo": "Demo mode",
  "hud.mode.estop": "E-stop",
  "hud.mode.offline": "Offline",
  "hud.rec": "Rec",

  // Joysticks
  "joystick.throttle": "Throttle / brake",
  "joystick.steering": "Steering",

  // Control buttons
  "controls.headlights": "Lights",
  "controls.horn": "Horn",
  "controls.photo": "Photo",
  "controls.estop.pending": "Waiting for car ack…",
  "controls.estop.reset": "Reset e-stop",
  "controls.estop.stop": "Emergency stop",

  // Video feed
  "video.alt": "Live video from the car camera",
  "video.offline": "The car is offline",
  "video.noNetwork": "This device has no network",
  "video.paused": "Stream paused (tab in background)",
  "video.retrying": "Reconnecting to the camera…",
  "video.noAddress": "No video address configured",
  "video.cameraNotResponding": "The camera server is not responding",
  "video.noSignal": "No video signal",
  "video.attempt": "(attempt {n})",
  "video.retry": "Try again",
  "video.connecting": "Connecting…",
  "video.rotate": "Rotate your device to landscape",
  "video.fullscreen": "Fullscreen",

  // Details drawer
  "details.title": "Details",

  // Telemetry
  "telemetry.battery": "Battery",
  "telemetry.wifi": "WiFi",
  "telemetry.status": "Status",
  "telemetry.speed": "Speed",
  "telemetry.temperature": "Temperature",
  "telemetry.ping": "Ping",

  // Connection health
  "health.title": "Connection health",
  "health.reconnect": "Reconnect",
  "health.reconnecting": "Reconnecting… (attempt {n})",
  "health.retryIn": "Retry in {s} s (attempt {n})",
  "health.quality": "Quality",
  "health.quality.none": "No link",
  "health.quality.measuring": "Measuring…",
  "health.quality.excellent": "Excellent",
  "health.quality.good": "Good",
  "health.quality.weak": "Weak",
  "health.jitter": "Jitter",
  "health.min": "Min",
  "health.avg": "Avg",
  "health.max": "Max",
  "health.uptime": "Uptime",
  "health.packetLoss": "Packet loss",
  "health.attempts": "Attempts",
  "health.connects": "Connects",
  "health.disconnects": "Drops",
  "health.messages": "Messages",

  // Driver panel
  "driver.title": "Driver control",
  "driver.noContact": "No contact with the car",
  "driver.none": "No active driver",
  "driver.me": "You are driving",
  "driver.other": "Other driver: {name}",
  "driver.unknown": "unknown",
  "driver.activeSince": "Active since {clock} ({ago})",
  "driver.waiting": "Waiting for someone to take control.",
  "driver.handover": "Last handover: {clock} ({ago})",
  "driver.noHandover": "No handover recorded.",
  "driver.session": "Your session: {id}",
  "driver.activeSession": " · active: {id}",
  "time.secondsAgo": "{n} s ago",
  "time.minutesAgo": "{n} min ago",
  "time.hoursAgo": "{h} h {m} min ago",

  // Log
  "log.title": "Log",
  "log.empty": "No events yet.",

  // Gallery
  "gallery.title": "Photo gallery",
  "gallery.open": "Photo gallery ({n} photos)",
  "gallery.clear": "Clear gallery",
  "gallery.description":
    "Captured stills with timestamps. Open one to view it larger or download it again.",
  "gallery.empty": "No photos yet. Tap the camera button to capture a still.",
  "gallery.thumbAlt": "Still captured {stamp}",
  "gallery.previewAlt": "Preview of photo captured {stamp}",
  "gallery.download": "Download",
  "gallery.delete": "Delete",

  // Connection lost overlay
  "overlay.estop.title": "Emergency stop active",
  "overlay.estop.body": "All controls are locked. Make sure the track is clear before resetting.",
  "overlay.connection.title": "Connection lost",
  "overlay.connection.body":
    "Contact with the car was lost. The car has entered emergency stop and all controls are disabled.",
  "overlay.address": "Address",
  "overlay.attempts": "Reconnect attempts: {n}",
  "overlay.reset": "Reset",
  "overlay.retry": "Try connecting again",
  "overlay.demo": "Switch to demo mode",

  // Settings page
  "settings.title": "Settings",
  "settings.reset": "Reset",
  "settings.language": "Language",
  "settings.wsUrl": "WebSocket address",
  "settings.wsUrl.hint": "Address of the car control server (rc-car-server on the Pi, port 81).",
  "settings.wsUrl.same": "Pi WebSocket (same host)",
  "settings.token": "Access token",
  "settings.token.hint":
    "Must match RC_TOKEN on the Pi. Leave empty if the server runs without authentication.",
  "settings.token.placeholder": "optional secret",
  "settings.videoUrl": "Video address",
  "settings.videoUrl.hint": "MJPEG stream from the Raspberry Pi camera.",
  "settings.videoUrl.nginx": "Pi camera (via nginx)",
  "settings.videoUrl.port": "Pi camera (port 8080)",
  "settings.flipH": "Flip image horizontally",
  "settings.flipV": "Flip image vertically",
  "settings.maxSpeed": "Top speed — {v}%",
  "settings.sensitivity": "Joystick sensitivity — {v}x",
  "settings.invertSteering": "Invert steering",
  "settings.invertThrottle": "Invert throttle",
  "settings.demoMode": "Demo mode (simulated car)",
  "settings.autosave": "All settings are saved automatically in your browser.",

  // Socket errors
  "err.unreachable.title": "Cannot reach the control server",
  "err.unreachable.message":
    "The browser cannot reach the car's WebSocket server. It may be stopped, on a different address, or blocked by the network.",
  "err.unreachable.hint": "Check on the Pi: sudo systemctl status rc-car-server",
  "err.dropped.title": "Connection dropped",
  "err.dropped.message":
    "Contact with the car was lost. The car automatically enters emergency stop (neutral throttle and steering) through the server watchdog.",
  "err.dropped.hint": "Check the WiFi signal and: sudo journalctl -u rc-car-server -n 30",
  "err.stale.title": "The car is not responding",
  "err.stale.message":
    "The connection looks open but the car stopped answering pings. Most likely a lost WiFi link or a hung control server — the car enters emergency stop via the watchdog.",
  "err.stale.hint": "Check WiFi coverage and: sudo systemctl status rc-car-server",
  "err.busy.title": "The car is busy",
  "err.busy.message": "Another client is already driving. The server allows one driver at a time.",
  "err.busy.hint": "Close the other tab or device and try again.",
  "err.taken_over.title": "Control taken over",
  "err.taken_over.message": "Another client took over control of the car.",
  "err.taken_over.hint": "Press Try connecting again to take control back.",
  "err.unauthorized.title": "Wrong access token",
  "err.unauthorized.message":
    "The control server rejected the connection because the token is missing or wrong.",
  "err.unauthorized.hint": "Enter the same token as RC_TOKEN on the Pi under Settings.",
  "err.invalid_url.title": "Invalid WebSocket address",
  "err.invalid_url.message": "The address could not be parsed as a WebSocket address.",
  "err.invalid_url.hint": "It must start with ws:// or wss://, e.g. ws://192.168.1.50:81",
  "err.no_url.title": "No WebSocket address",
  "err.no_url.message": "There is no address for the car control server.",
  "err.no_url.hint": "Enter the address under Settings.",

  // Log messages
  "logmsg.demoStarted": "Demo mode started — simulated car",
  "logmsg.demoConnected": "Connected to demo vehicle",
  "logmsg.invalidUrl": "Invalid WebSocket address",
  "logmsg.connecting": "Connecting to {url}",
  "logmsg.reconnectingTo": "Reconnecting to {url} (attempt {n})",
  "logmsg.connected": "Connection established",
  "logmsg.photoSavedCar": "Photo saved on the car: {path}",
  "logmsg.photoFailedCar": "The car could not take a photo",
  "logmsg.parseFailed": "Could not parse message from the car",
  "logmsg.wsError": "WebSocket error",
  "logmsg.dropped": "Connection dropped — retrying in {s} s",
  "logmsg.noPong": "The car is not answering pings — disconnecting and retrying",
  "logmsg.command": "Command: {cmd}",
  "logmsg.commandFailed": 'Command "{action}" could not be sent — no connection',
  "logmsg.estopNotAcked": "The car has not confirmed emergency stop — check the connection",
  "logmsg.modeChange": "[{time}] Mode: {from} → {to}",
  "logmsg.estopReset": "Emergency stop reset",
  "logmsg.estopActivated": "EMERGENCY STOP activated",
  "logmsg.demoSwitch": "Switched to demo mode",
  "logmsg.noFrame": "No video stream to capture — the photo could not be downloaded",
  "logmsg.photoSaved": "Photo saved: {name}",
  "logmsg.photoError": "Could not save the photo: {error}",
} satisfies Dict;

export type TKey = keyof typeof en;

const sv: Record<TKey, string> = {
  "common.dash": "—",
  "common.back": "Tillbaka",
  "common.close": "Stäng",
  "common.reset": "Återställ",
  "common.settings": "Inställningar",
  "common.connected": "Ansluten",
  "common.connecting": "Ansluter…",
  "common.disconnected": "Frånkopplad",
  "common.offlineShort": "Offline",

  "meta.home.title": "RC Control Station — Fjärrstyr bil med FPV-kamera",
  "meta.home.description":
    "Mobilanpassad kontrollstation för radiostyrd bil med Raspberry Pi-kamera: livevideo, HUD, joysticks och realtidstelemetri.",
  "meta.home.ogDescription":
    "Livevideo, driving-HUD, virtuella joysticks och telemetri över WebSocket.",
  "meta.settings.title": "Inställningar — RC Control Station",
  "meta.settings.description":
    "Ställ in WebSocket-adress, videoadress, maxhastighet, joystickkänslighet och inverterade reglage.",
  "meta.settings.ogDescription": "Anpassa anslutning och körkänsla för din radiostyrda bil.",

  "status.driver.offline": "Frånkopplad",
  "status.driver.none": "Ingen förare",
  "status.driver.me": "Du styr",
  "status.driver.other": "Annan styr",
  "status.driver.offlineShort": "Offline",
  "status.driver.noneShort": "Ingen",
  "status.driver.meShort": "Du",
  "status.driver.otherShort": "Annan",

  "hud.mode.live": "Live",
  "hud.mode.demo": "Demoläge",
  "hud.mode.estop": "Nödstopp",
  "hud.mode.offline": "Frånkopplad",
  "hud.rec": "Rec",

  "joystick.throttle": "Gas / broms",
  "joystick.steering": "Styrning",

  "controls.headlights": "Ljus",
  "controls.horn": "Tuta",
  "controls.photo": "Ta bild",
  "controls.estop.pending": "Väntar på bilens kvittens…",
  "controls.estop.reset": "Återställ nödstopp",
  "controls.estop.stop": "Nödstopp",

  "video.alt": "Livevideo från bilens kamera",
  "video.offline": "Bilen är frånkopplad",
  "video.noNetwork": "Enheten saknar nätverk",
  "video.paused": "Strömmen pausad (fliken i bakgrunden)",
  "video.retrying": "Försöker återansluta till kameran…",
  "video.noAddress": "Ingen videoadress angiven",
  "video.cameraNotResponding": "Kameraservern svarar inte",
  "video.noSignal": "Ingen videosignal",
  "video.attempt": "(försök {n})",
  "video.retry": "Försök igen",
  "video.connecting": "Ansluter…",
  "video.rotate": "Vrid enheten till landskap",
  "video.fullscreen": "Helskärm",

  "details.title": "Detaljer",

  "telemetry.battery": "Batteri",
  "telemetry.wifi": "WiFi",
  "telemetry.status": "Status",
  "telemetry.speed": "Hastighet",
  "telemetry.temperature": "Temperatur",
  "telemetry.ping": "Ping",

  "health.title": "Anslutningshälsa",
  "health.reconnect": "Återanslut",
  "health.reconnecting": "Återansluter… (försök {n})",
  "health.retryIn": "Nytt försök om {s} s (försök {n})",
  "health.quality": "Kvalitet",
  "health.quality.none": "Ingen länk",
  "health.quality.measuring": "Mäter…",
  "health.quality.excellent": "Utmärkt",
  "health.quality.good": "Bra",
  "health.quality.weak": "Svag",
  "health.jitter": "Jitter",
  "health.min": "Min",
  "health.avg": "Medel",
  "health.max": "Max",
  "health.uptime": "Upptid",
  "health.packetLoss": "Paketförlust",
  "health.attempts": "Försök",
  "health.connects": "Anslutningar",
  "health.disconnects": "Avbrott",
  "health.messages": "Meddelanden",

  "driver.title": "Förarkontroll",
  "driver.noContact": "Ingen kontakt med bilen",
  "driver.none": "Ingen aktiv förare",
  "driver.me": "Du styr bilen",
  "driver.other": "Annan förare: {name}",
  "driver.unknown": "okänd",
  "driver.activeSince": "Aktiv sedan {clock} ({ago})",
  "driver.waiting": "Väntar på att någon ska ta kontrollen.",
  "driver.handover": "Senaste övertagande: {clock} ({ago})",
  "driver.noHandover": "Inget övertagande registrerat.",
  "driver.session": "Din session: {id}",
  "driver.activeSession": " · aktiv: {id}",
  "time.secondsAgo": "{n} s sedan",
  "time.minutesAgo": "{n} min sedan",
  "time.hoursAgo": "{h} h {m} min sedan",

  "log.title": "Logg",
  "log.empty": "Inga händelser ännu.",

  "gallery.title": "Bildgalleri",
  "gallery.open": "Bildgalleri ({n} bilder)",
  "gallery.clear": "Rensa galleri",
  "gallery.description":
    "Tagna stillbilder med tidsstämpel. Öppna för att visa större eller ladda ner igen.",
  "gallery.empty": "Inga bilder ännu. Tryck på kameraknappen för att ta en stillbild.",
  "gallery.thumbAlt": "Stillbild tagen {stamp}",
  "gallery.previewAlt": "Förhandsvisning av bild tagen {stamp}",
  "gallery.download": "Ladda ner",
  "gallery.delete": "Radera",

  "overlay.estop.title": "Nödstopp aktivt",
  "overlay.estop.body":
    "Alla reglage är låsta. Bekräfta att banan är fri innan du återställer.",
  "overlay.connection.title": "Anslutning bruten",
  "overlay.connection.body":
    "Kontakten med bilen har tappats. Bilen har gått till nödstopp och alla reglage är inaktiverade.",
  "overlay.address": "Adress",
  "overlay.attempts": "Återanslutningsförsök: {n}",
  "overlay.reset": "Återställ",
  "overlay.retry": "Försök ansluta igen",
  "overlay.demo": "Gå till demoläge",

  "settings.title": "Inställningar",
  "settings.reset": "Återställ",
  "settings.language": "Språk",
  "settings.wsUrl": "WebSocket-adress",
  "settings.wsUrl.hint": "Adressen till bilens styrserver (rc-car-server på Pi:n, port 81).",
  "settings.wsUrl.same": "Pi WebSocket (samma värd)",
  "settings.token": "Åtkomsttoken",
  "settings.token.hint":
    "Måste matcha RC_TOKEN på Pi:n. Lämna tomt om servern körs utan autentisering.",
  "settings.token.placeholder": "valfri hemlighet",
  "settings.videoUrl": "Videoadress",
  "settings.videoUrl.hint": "MJPEG-ström från Raspberry Pi-kameran.",
  "settings.videoUrl.nginx": "Pi-kamera (via nginx)",
  "settings.videoUrl.port": "Pi-kamera (port 8080)",
  "settings.flipH": "Vänd bild horisontellt",
  "settings.flipV": "Vänd bild vertikalt",
  "settings.maxSpeed": "Maxhastighet — {v}%",
  "settings.sensitivity": "Joystickkänslighet — {v}x",
  "settings.invertSteering": "Invertera styrning",
  "settings.invertThrottle": "Invertera gas",
  "settings.demoMode": "Demoläge (simulerad bil)",
  "settings.autosave": "Alla inställningar sparas automatiskt i webbläsaren.",

  "err.unreachable.title": "Når inte styrservern",
  "err.unreachable.message":
    "Webbläsaren får ingen kontakt med bilens WebSocket-server. Servern kan vara stoppad, fel adress eller blockerad av nätverket.",
  "err.unreachable.hint": "Kontrollera på Pi:n: sudo systemctl status rc-car-server",
  "err.dropped.title": "Anslutningen bröts",
  "err.dropped.message":
    "Kontakten med bilen tappades. Bilen går automatiskt till nödstopp (neutral gas och styrning) via serverns watchdog.",
  "err.dropped.hint": "Kolla WiFi-signalen och: sudo journalctl -u rc-car-server -n 30",
  "err.stale.title": "Bilen svarar inte",
  "err.stale.message":
    "Anslutningen ser öppen ut men bilen har slutat svara på ping. Sannolikt tappad WiFi-länk eller hängd styrserver – bilen går till nödstopp via watchdogen.",
  "err.stale.hint": "Kolla WiFi-täckningen och: sudo systemctl status rc-car-server",
  "err.busy.title": "Bilen är upptagen",
  "err.busy.message": "En annan klient styr redan bilen. Servern tillåter bara en förare i taget.",
  "err.busy.hint": "Stäng den andra fliken/enheten och försök igen.",
  "err.taken_over.title": "Styrningen övertagen",
  "err.taken_over.message": "En annan klient tog över styrningen av bilen.",
  "err.taken_over.hint": "Tryck Försök ansluta igen för att ta tillbaka kontrollen.",
  "err.unauthorized.title": "Fel åtkomsttoken",
  "err.unauthorized.message":
    "Styrservern avvisade anslutningen eftersom token saknas eller är felaktig.",
  "err.unauthorized.hint": "Ange samma token som RC_TOKEN på Pi:n under Inställningar.",
  "err.invalid_url.title": "Ogiltig WebSocket-adress",
  "err.invalid_url.message": "Adressen kunde inte tolkas som en WebSocket-adress.",
  "err.invalid_url.hint": "Adressen ska börja med ws:// eller wss://, t.ex. ws://192.168.1.50:81",
  "err.no_url.title": "Ingen WebSocket-adress",
  "err.no_url.message": "Det finns ingen adress till bilens styrserver.",
  "err.no_url.hint": "Ange adressen under Inställningar.",

  "logmsg.demoStarted": "Demoläge startat – simulerad bil",
  "logmsg.demoConnected": "Ansluten till demo-fordon",
  "logmsg.invalidUrl": "Ogiltig WebSocket-adress",
  "logmsg.connecting": "Ansluter till {url}",
  "logmsg.reconnectingTo": "Återansluter till {url} (försök {n})",
  "logmsg.connected": "Anslutning upprättad",
  "logmsg.photoSavedCar": "Bild sparad på bilen: {path}",
  "logmsg.photoFailedCar": "Bilen kunde inte ta bild",
  "logmsg.parseFailed": "Kunde inte tolka meddelande från bilen",
  "logmsg.wsError": "WebSocket-fel",
  "logmsg.dropped": "Anslutningen bröts – nytt försök om {s} s",
  "logmsg.noPong": "Bilen svarar inte på ping – kopplar ner och försöker igen",
  "logmsg.command": "Kommando: {cmd}",
  "logmsg.commandFailed": 'Kommandot "{action}" kunde inte skickas – ingen anslutning',
  "logmsg.estopNotAcked":
    "Bilen har inte bekräftat nödstoppsläget – kontrollera anslutningen",
  "logmsg.modeChange": "[{time}] Läge: {from} → {to}",
  "logmsg.estopReset": "Nödstopp återställt",
  "logmsg.estopActivated": "NÖDSTOPP aktiverat",
  "logmsg.demoSwitch": "Växlade till demoläge",
  "logmsg.noFrame": "Ingen videoström att fånga – bilden kunde inte laddas ner",
  "logmsg.photoSaved": "Bild sparad: {name}",
  "logmsg.photoError": "Kunde inte spara bilden: {error}",
};

export const translations: Record<Lang, Record<TKey, string>> = { en, sv };

export type TVars = Record<string, string | number>;
export type TFunc = (key: TKey, vars?: TVars) => string;

export function translate(lang: Lang, key: TKey, vars?: TVars): string {
  const table = translations[lang] ?? translations.en;
  let text = table[key] ?? translations.en[key] ?? String(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.split(`{${k}}`).join(String(v));
    }
  }
  return text;
}
