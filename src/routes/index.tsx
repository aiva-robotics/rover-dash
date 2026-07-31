import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { VideoFeed } from "@/components/car/VideoFeed";
import { DrivingHUD } from "@/components/car/DrivingHUD";
import { Joystick } from "@/components/car/Joystick";
import { ControlButtons } from "@/components/car/ControlButtons";
import { TelemetryPanel } from "@/components/car/TelemetryPanel";
import { ConnectionLostOverlay } from "@/components/car/ConnectionLostOverlay";
import { LogPanel } from "@/components/car/LogPanel";
import { ConnectionHealthPanel } from "@/components/car/ConnectionHealthPanel";
import { FuturePanels } from "@/components/car/FuturePanels";
import { useCarSocket } from "@/hooks/useCarSocket";
import { useSettings } from "@/hooks/useSettings";
import { clamp } from "@/lib/car-protocol";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RC Control Station — Fjärrstyr bil med FPV-kamera" },
      {
        name: "description",
        content:
          "Mobilanpassad kontrollstation för radiostyrd bil med ESP32-CAM: livevideo, HUD, joysticks och realtidstelemetri.",
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

function ControlStation() {
  const { settings, hydrated, update } = useSettings();
  const { connection, status, ping, logs, health, setCommand, sendAction, log, reconnectNow } =
    useCarSocket({
      url: settings.wsUrl,
      enabled: hydrated,
      demoMode: settings.demoMode,
    });

  const [throttleRaw, setThrottleRaw] = useState(0);
  const [steeringRaw, setSteeringRaw] = useState(0);
  const [headlights, setHeadlights] = useState(false);
  const [estop, setEstop] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);

  const online = connection === "connected";
  const locked = !online || estop;

  const throttle = locked
    ? 0
    : Math.round(
        clamp(throttleRaw * settings.sensitivity, -100, 100) *
          (settings.maxSpeed / 100) *
          (settings.invertThrottle ? -1 : 1),
      );
  const steering = locked
    ? 0
    : Math.round(
        clamp(steeringRaw * settings.sensitivity, -100, 100) * (settings.invertSteering ? -1 : 1),
      );

  useEffect(() => {
    setCommand({ throttle, steering });
  }, [throttle, steering, setCommand]);

  useEffect(() => {
    if (connection === "disconnected" && hydrated) {
      setThrottleRaw(0);
      setSteeringRaw(0);
    }
  }, [connection, hydrated]);

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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-3 p-3 pb-8">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${
              online ? "bg-primary shadow-[0_0_12px_var(--color-primary)]" : "bg-destructive"
            }`}
          />
          <h1 className="truncate text-base font-bold uppercase tracking-[0.2em]">
            RC Control Station
          </h1>
        </div>
        <Link
          to="/settings"
          aria-label="Inställningar"
          className="glass-panel grid h-10 w-10 shrink-0 place-items-center transition-colors hover:text-primary"
        >
          <SettingsIcon className="h-4 w-4" />
        </Link>
      </header>

      <VideoFeed src={settings.videoUrl} online={online && !settings.demoMode}>
        <DrivingHUD
          status={status}
          throttle={throttle}
          steering={steering}
          recording={status.recording ?? false}
        />
      </VideoFeed>

      <TelemetryPanel status={status} connection={connection} ping={ping} />

      <div className="grid grid-cols-2 gap-2">
        <Joystick
          label="Gas / broms"
          axis="y"
          disabled={locked}
          onChange={setThrottleRaw}
          accent="primary"
        />
        <Joystick
          label="Styrning"
          axis="x"
          disabled={locked}
          onChange={setSteeringRaw}
          accent="accent"
        />
      </div>

      <ControlButtons
        disabled={locked}
        headlights={headlights}
        stopped={estop}
        onToggleLights={() => {
          setHeadlights((v) => {
            sendAction("headlights", !v);
            return !v;
          });
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
