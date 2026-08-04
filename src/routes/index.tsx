import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { VideoFeed } from "@/components/car/VideoFeed";
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
      const ctx = audioRef.current ?? new AudioContext();
      audioRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 440;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      /* ignore */
    }
  }, [sendAction]);

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
        src={settings.videoUrl}
        online={online || settings.demoMode}
        flipH={settings.videoFlipH}
        flipV={settings.videoFlipV}
      >
        <DrivingHUD
          status={status}
          throttle={throttle}
          steering={steering}
          recording={status.recording ?? false}
          mode={hudMode}
          flipH={settings.videoFlipH}
          flipV={settings.videoFlipV}
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

      <ConnectionHealthPanel
        health={health}
        connection={connection}
        ping={ping}
        onReconnect={reconnectNow}
      />

      <FuturePanels />
      <LogPanel logs={logs} />

      <ConnectionLostOverlay
        visible={hydrated && (connection === "disconnected" || estop)}
        reason={estop ? "estop" : "connection"}
        error={lastError}

        onReset={estop ? () => setEstop(false) : undefined}
        onRetry={reconnectNow}
        onDemoMode={() => {
          setEstop(false);
          update({ demoMode: true });
          log("info", "Växlade till demoläge");
        }}
      />
    </main>
  );
}
