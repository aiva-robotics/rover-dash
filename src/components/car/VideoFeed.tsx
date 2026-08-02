import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  src: string;
  online: boolean;
  flipH?: boolean;
  flipV?: boolean;
  children?: ReactNode | undefined;
};

type OrientationLockable = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
};

export function VideoFeed({ src, online, flipH, flipV, children }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Sant när enheten inte kan låsa orienteringen – då roterar vi bilden själva.
  const [rotate, setRotate] = useState(false);

  // Ny videoadress → försök igen även om den förra strömmen misslyckades.
  useEffect(() => {
    setFailed(false);
    setAttempt(0);
  }, [src]);

  // MJPEG-strömmar dör tyst när kameraservern startas om. Ladda om strömmen
  // automatiskt var 4:e sekund tills en bild kommer igenom igen.
  useEffect(() => {
    if (!failed || !online || !src) return;
    const id = setTimeout(() => {
      setFailed(false);
      setAttempt((n) => n + 1);
    }, 4000);
    return () => clearTimeout(id);
  }, [failed, online, src, attempt]);
  const isNativeFs = typeof document !== "undefined" && !!document.fullscreenElement;

  const isMobile = () =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;

  const lockLandscape = async () => {
    if (!isMobile()) return;
    const orientation = screen.orientation as OrientationLockable | undefined;
    try {
      if (orientation?.lock) {
        await orientation.lock("landscape");
        setRotate(false);
        return;
      }
    } catch {
      // iOS Safari m.fl. tillåter inte orienteringslås.
    }
    setRotate(window.innerHeight > window.innerWidth);
  };

  const unlockOrientation = () => {
    try {
      screen.orientation?.unlock?.();
    } catch {
      // ignoreras
    }
    setRotate(false);
  };

  // Håll state i synk om användaren lämnar helskärm med systemgesten.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) {
        setFullscreen(false);
        unlockOrientation();
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = async () => {
    const el = wrapRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setFullscreen(false);
        unlockOrientation();
      } else if (el.requestFullscreen) {
        await el.requestFullscreen();
        setFullscreen(true);
        await lockLandscape();
      } else {
        setFullscreen((v) => !v);
        if (fullscreen) unlockOrientation();
        else await lockLandscape();
      }
    } catch {
      // Fullscreen can be blocked (e.g. inside an embedded preview) – fall back
      // to an in-page expanded view instead of crashing.
      setFullscreen((v) => !v);
      if (fullscreen) unlockOrientation();
      else await lockLandscape();
    }
  };

  const overlay = fullscreen && !isNativeFs;

  return (
    <div
      ref={wrapRef}
      className={cn(
        "glass-panel relative aspect-video w-full overflow-hidden bg-black/60",
        overlay && "fixed inset-0 z-40 aspect-auto h-screen rounded-none",
        fullscreen && rotate && "aspect-auto",
      )}
      style={
        fullscreen && rotate
          ? {
              position: "fixed",
              top: 0,
              left: 0,
              zIndex: 40,
              width: "100vh",
              height: "100vw",
              transform: "rotate(90deg) translateY(-100%)",
              transformOrigin: "top left",
              borderRadius: 0,
            }
          : undefined
      }
    >

      {online && src && !failed ? (
        <img
          key={attempt}
          src={attempt > 0 ? `${src}${src.includes("?") ? "&" : "?"}r=${attempt}` : src}
          alt="Livevideo från bilens kamera"
          className="h-full w-full object-cover"
          style={{
            transform:
              flipH && flipV
                ? "scaleX(-1) scaleY(-1)"
                : flipH
                  ? "scaleX(-1)"
                  : flipV
                    ? "scaleY(-1)"
                    : undefined,
          }}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="scanlines absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--color-primary)_12%,transparent),transparent_70%)]">
          <div className="text-center">
            <Camera className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Ingen videosignal
            </p>
            {online && src ? (
              <p className="mt-1 text-[0.65rem] tracking-[0.15em] text-muted-foreground/70">
                Försöker återansluta till kameran…{attempt > 0 ? ` (försök ${attempt})` : ""}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {children}

      <button
        type="button"
        onClick={toggle}
        aria-label="Helskärm"
        className="pointer-events-auto absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-lg bg-background/50 text-foreground backdrop-blur-md transition-colors hover:bg-background/80"
      >
        {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>
    </div>
  );
}
