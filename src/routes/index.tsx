import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Images, Settings as SettingsIcon } from "lucide-react";
import { VideoFeed, type VideoFeedHandle } from "@/components/car/VideoFeed";
import { DrivingHUD, MODE_KEYS, type HudMode } from "@/components/car/DrivingHUD";
import { Joystick } from "@/components/car/Joystick";
import { ControlButtons } from "@/components/car/ControlButtons";
import { StatusBar } from "@/components/car/StatusBar";
import { DetailsDrawer } from "@/components/car/DetailsDrawer";
import { PhotoGallery } from "@/components/car/PhotoGallery";
import { ConnectionLostOverlay } from "@/components/car/ConnectionLostOverlay";
import { useCarSocket, sessionId } from "@/hooks/useCarSocket";
import { usePhotoGallery } from "@/hooks/usePhotoGallery";
import { useSettings } from "@/hooks/useSettings";
import { useI18n } from "@/hooks/useI18n";
import { downloadBlob, photoFileName } from "@/lib/photoStore";
import { clamp, DIGITAL_LIGHTS_BIT, HORN_FREQUENCY_HZ } from "@/lib/car-protocol";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RC Control Station — FPV camera car control" },
      {
        name: "description",
        content:
          "Mobile-first control station for an RC car with a Raspberry Pi camera: live video, HUD, joysticks and realtime telemetry.",
      },
      { property: "og:title", content: "RC Control Station — FPV camera car control" },
      {
        property: "og:description",
        content: "Mobile-first control station for an RC car with a Raspberry Pi camera: live video, HUD, joysticks and realtime telemetry.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ControlStation,
});

function ControlStation() {
  const { settings, hydrated, update } = useSettings();
  const { t, locale } = useI18n();
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
    t,
    locale,
  });


  const [throttleRaw, setThrottleRaw] = useState(0);
  const [steeringRaw, setSteeringRaw] = useState(0);
  const [estop, setEstop] = useState(false);
  const [lightsOn, setLightsOn] = useState(false);
  const [hornOn, setHornOn] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const videoRef = useRef<VideoFeedHandle | null>(null);


  const online = connection === "connected";
  const driveLocked = !online || estop;
  const accessoryLocked = !online || estop;
  // Ljusstatus speglas från STM32:ans eko när det finns, annars lokalt önskeläge.
  const echoedMask = status.stm32?.digitalMask;
  const headlights =
    typeof echoedMask === "number" ? (echoedMask & DIGITAL_LIGHTS_BIT) !== 0 : lightsOn;

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
    setCommand({
      throttle,
      steering,
      estop,
      digital: !estop && lightsOn ? DIGITAL_LIGHTS_BIT : 0,
      buzzer: !estop && hornOn ? HORN_FREQUENCY_HZ : 0,
    });
  }, [throttle, steering, estop, lightsOn, hornOn, setCommand]);

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
      log("error", t("logmsg.estopNotAcked"));
    }, 1500);
    return () => clearTimeout(timer);
  }, [estopPending, log, t]);


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
    const stamp = new Date().toLocaleTimeString(locale);
    log(
      hudMode === "estop" || hudMode === "offline" ? "warn" : "info",
      t("logmsg.modeChange", {
        time: stamp,
        from: t(MODE_KEYS[from]),
        to: t(MODE_KEYS[hudMode]),
      }),
    );
  }, [hudMode, hydrated, log, t, locale]);


  const hornTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const horn = useCallback(() => {
    // Summern styrs via det löpande kommandot – håll den på i en kort puls.
    setHornOn(true);
    if (hornTimerRef.current) clearTimeout(hornTimerRef.current);
    hornTimerRef.current = setTimeout(() => setHornOn(false), 400);
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
  }, []);

  useEffect(() => {
    return () => {
      if (hornTimerRef.current) clearTimeout(hornTimerRef.current);
    };
  }, []);

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

  const {
    photos,
    addPhoto,
    removePhoto,
    clearAll,
  } = usePhotoGallery(hydrated);

  /** Tar en stillbild: sparas på bilen, i galleriet och laddas ner till enheten. */
  const handlePhoto = useCallback(async () => {
    sendAction("photo");
    try {
      const blob = await videoRef.current?.captureFrame();
      if (!blob) {
        log("error", t("logmsg.noFrame"));
        return;
      }
      const takenAt = Date.now();
      const name = photoFileName(takenAt);
      try {
        await addPhoto(blob, takenAt);
      } catch (err) {
        console.debug("Kunde inte spara bild i galleriet", err);
      }
      downloadBlob(blob, name);
      log("info", t("logmsg.photoSaved", { name }));
    } catch (err) {
      log(
        "error",
        t("logmsg.photoError", { error: err instanceof Error ? err.message : String(err) }),
      );
    }
  }, [addPhoto, log, sendAction, t]);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);



  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-3 p-3 pb-8">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
        <StatusBar
          status={status}
          connection={connection}
          ping={ping}
          sessionId={hydrated ? sessionId() : ""}
        />
        <button
          type="button"
          onClick={() => setGalleryOpen(true)}
          aria-label={t("gallery.open", { n: photos.length })}
          className="glass-panel relative grid h-10 w-10 shrink-0 place-items-center transition-colors hover:text-primary"
        >
          <Images className="h-4 w-4" />
          {photos.length > 0 && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 font-mono text-[0.6rem] text-primary-foreground">
              {photos.length}
            </span>
          )}
        </button>
        <Link
          to="/settings"
          aria-label={t("common.settings")}
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
                label={t("joystick.throttle")}
                axis="y"
                compact
                disabled={driveLocked}
                onChange={setThrottleRaw}
                accent="primary"
              />
            </div>
            <div className="pointer-events-auto w-[34%] max-w-[150px]">
              <Joystick
                label={t("joystick.steering")}
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
          label={t("joystick.throttle")}
          axis="y"
          disabled={driveLocked}
          onChange={setThrottleRaw}
          accent="primary"
        />
        <Joystick
          label={t("joystick.steering")}
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
        onPhoto={() => void handlePhoto()}
        onEmergencyStop={() => {
          if (estop) {
            setEstop(false);
            log("info", t("logmsg.estopReset"));
            sendAction("resume");
          } else {
            setEstop(true);
            setThrottleRaw(0);
            setSteeringRaw(0);
            log("error", t("logmsg.estopActivated"));
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

      <PhotoGallery
        photos={photos}
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        onRemove={(id) => void removePhoto(id)}
        onClear={() => void clearAll()}
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
          log("info", t("logmsg.demoSwitch"));
        }}

      />
    </main>
  );
}
