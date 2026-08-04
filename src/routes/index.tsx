import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { VideoFeed, type VideoFeedHandle } from "@/components/car/VideoFeed";
import { DrivingHUD, type HudMode } from "@/components/car/DrivingHUD";
import { Joystick } from "@/components/car/Joystick";
import { ControlButtons } from "@/components/car/ControlButtons";
import { StatusBar } from "@/components/car/StatusBar";
import { DetailsDrawer } from "@/components/car/DetailsDrawer";
import { ConnectionLostOverlay } from "@/components/car/ConnectionLostOverlay";
import { useCarSocket, sessionId } from "@/hooks/useCarSocket";
import { useSettings } from "@/hooks/useSettings";
import { clamp } from "@/lib/car-protocol";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RC Control Station — Fjärrstyr bil med FPV-kamera" },
      {
        name: "description",
        content:
          "Mobilanpassad kontrollstation för radiostyrd bil med Raspberry Pi-kamera: livevideo, HUD, joysticks och realtidstelemetri.",
      },
      { property: "og:title", content: "RC Control Station — Fjärrstyr bil med FPV-kamera" },
      {
        property: "og:description",
        content: "Livevideo, driving-HUD, virtuella joysticks och telemetri över WebSocket.",
      },
    ],
  }),
  component: ControlStation,
});

const MODE_LABELS: Record<HudMode, string> = {
  live: "Live",
  demo: "Demoläge",
  estop: "Nödstopp",
  offline: "Frånkopplad",
};

function ControlStation() {
  const { settings, hydrated, update } = useSettings();
  const {
    connection,
    status,
    ping,
    logs,
    health,
    lastError,
    setCommand,
    sendAction,
    log,
    reconnectNow,
  } = useCarSocket({
    url: settings.wsUrl,
    token: settings.wsToken,
    enabled: hydrated,
    demoMode: settings.demoMode,
  });


  const [throttleRaw, setThrottleRaw] = useState(0);
  const [steeringRaw, setSteeringRaw] = useState(0);
  const [estop, setEstop] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const videoRef = useRef<VideoFeedHandle | null>(null);


  const online = connection === "connected";
  const driveLocked = !online || estop;
  const accessoryLocked = !online || estop;
  const headlights = status.headlights ?? false;

  const throttle = driveLocked
    ? 0
    : Math.round(
        clamp(throttleRaw * settings.sensitivity, -100, 100) *
          (settings.maxSpeed / 100) *
          (settings.invertThrottle ? -1 : 1),
      );
  const steering = driveLocked
    ? 0
    : Math.round(
        clamp(steeringRaw * settings.sensitivity, -100, 100) * (settings.invertSteering ? -1 : 1),
      );

  // Nödstoppet ingår i varje kommando (20 Hz) så att bilen får det även om
  // ett enstaka action-meddelande går förlorat.
  useEffect(() => {
    setCommand({ throttle, steering, estop });
  }, [throttle, steering, estop, setCommand]);

  /** Servern har inte kvitterat nödstoppsläget ännu. */
  const estopPending = online && (status.estop ?? false) !== estop;

  const estopWarnedRef = useRef(false);
  useEffect(() => {
    if (!estopPending) {
      estopWarnedRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      if (estopWarnedRef.current) return;
      estopWarnedRef.current = true;
      log("error", "Bilen har inte bekräftat nödstoppsläget – kontrollera anslutningen");
    }, 1500);
    return () => clearTimeout(timer);
  }, [estopPending, log]);


  useEffect(() => {
    if (connection === "disconnected" && hydrated) {
      setThrottleRaw(0);
      setSteeringRaw(0);
    }
  }, [connection, hydrated]);

  const hudMode: HudMode = estop
    ? "estop"
    : !online
      ? "offline"
      : settings.demoMode
        ? "demo"
        : "live";

  const prevMode = useRef<HudMode | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (prevMode.current === hudMode) return;
    const from = prevMode.current;
    prevMode.current = hudMode;
    if (!from) return;
    const stamp = new Date().toLocaleTimeString("sv-SE");
    log(
      hudMode === "estop" || hudMode === "offline" ? "warn" : "info",
      `[${stamp}] Läge: ${MODE_LABELS[from]} → ${MODE_LABELS[hudMode]}`,
    );
  }, [hudMode, hydrated, log]);


  const horn = useCallback(() => {
    sendAction("horn");
    try {
      let ctx = audioRef.current;
      if (!ctx || ctx.state === "closed") {
        ctx = new AudioContext();
        audioRef.current = ctx;
      }
      if (ctx.state === "suspended") void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 440;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch (err) {
          console.debug("Kunde inte koppla loss ljudnoder", err);
        }
      };
    } catch (err) {
      console.debug("Tutljud kunde inte spelas upp", err);
    }
  }, [sendAction]);

  // Stäng AudioContext vid unmount – annars ackumuleras kontexter (webbläsare
  // har ett tak) och tutan slutar fungera efter några remounts.
  useEffect(() => {
    return () => {
      const ctx = audioRef.current;
      audioRef.current = null;
      if (ctx && ctx.state !== "closed") {
        void ctx.close().catch(() => undefined);
      }
    };
  }, []);

  /** Tar en stillbild: sparas på bilen och laddas ner till enheten. */
  const handlePhoto = useCallback(async () => {
    sendAction("photo");
    try {
      const blob = await videoRef.current?.captureFrame();
      if (!blob) {
        log("error", "Ingen videoström att fånga – bilden kunde inte laddas ner");
        return;
      }
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const name = `rc-bild-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.jpg`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      log("info", `Bild sparad: ${name}`);
    } catch (err) {
      log("error", `Kunde inte spara bilden: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [log, sendAction]);

  const [detailsOpen, setDetailsOpen] = useState(false);


  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-3 p-3 pb-8">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <StatusBar
          status={status}
          connection={connection}
          ping={ping}
          sessionId={hydrated ? sessionId() : ""}
        />
        <Link
          to="/settings"
          aria-label="Inställningar"
          className="glass-panel grid h-10 w-10 shrink-0 place-items-center transition-colors hover:text-primary"
        >
          <SettingsIcon className="h-4 w-4" />
        </Link>
      </div>

      <VideoFeed
        ref={videoRef}
        src={settings.videoUrl}

        online={online || settings.demoMode}
        flipH={settings.videoFlipH}
        flipV={settings.videoFlipV}
        overlayControls={
          <>
            <div className="pointer-events-auto w-[34%] max-w-[150px]">
              <Joystick
                label="Gas / broms"
                axis="y"
                compact
                disabled={driveLocked}
                onChange={setThrottleRaw}
                accent="primary"
              />
            </div>
            <div className="pointer-events-auto w-[34%] max-w-[150px]">
              <Joystick
                label="Styrning"
                axis="x"
                compact
                disabled={driveLocked}
                onChange={setSteeringRaw}
                accent="accent"
              />
            </div>
          </>
        }
      >
        <DrivingHUD
          status={status}
          recording={status.recording ?? false}
          mode={hudMode}
          flipH={settings.videoFlipH}
        />
      </VideoFeed>

      <div className="grid grid-cols-2 gap-2">
        <Joystick
          label="Gas / broms"
          axis="y"
          disabled={driveLocked}
          onChange={setThrottleRaw}
          accent="primary"
        />
        <Joystick
          label="Styrning"
          axis="x"
          disabled={driveLocked}
          onChange={setSteeringRaw}
          accent="accent"
        />
      </div>

      <ControlButtons
        accessoryDisabled={accessoryLocked}
        headlights={headlights}
        stopped={estop}
        pending={estopPending}

        onToggleLights={() => {
          sendAction("headlights", !headlights);
        }}
        onHorn={horn}
        onPhoto={() => sendAction("photo")}
        onEmergencyStop={() => {
          if (estop) {
            setEstop(false);
            log("info", "Nödstopp återställt");
            sendAction("resume");
          } else {
            setEstop(true);
            setThrottleRaw(0);
            setSteeringRaw(0);
            log("error", "NÖDSTOPP aktiverat");
            sendAction("estop");
          }
        }}
      />

      <DetailsDrawer
        status={status}
        connection={connection}
        ping={ping}
        health={health}
        logs={logs}
        error={lastError}
        sessionId={hydrated ? sessionId() : ""}
        onReconnect={reconnectNow}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />

      <ConnectionLostOverlay
        visible={hydrated && (connection === "disconnected" || estop)}
        reason={estop ? "estop" : "connection"}
        error={lastError}

        onReset={estop ? () => setEstop(false) : undefined}
        onRetry={reconnectNow}
        onDemoMode={() => {
          setEstop(false);
          update({ demoMode: true });
          // Startar om simuleringen även om demoläget redan var påslaget.
          reconnectNow();
          log("info", "Växlade till demoläge");
        }}

      />
    </main>
  );
}
