import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { Camera, Maximize2, Minimize2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export type VideoFeedHandle = {
  /** Fångar aktuell bildruta som JPEG. Returnerar null om ingen ström finns. */
  captureFrame: () => Promise<Blob | null>;
};

type Props = {
  src: string;
  online: boolean;
  flipH?: boolean;
  flipV?: boolean;
  children?: ReactNode | undefined;
  /** Reglage som bara visas i helskärmsläge (gas/broms + styrning). */
  overlayControls?: ReactNode | undefined;
  ref?: Ref<VideoFeedHandle> | undefined;
};

type OrientationLockable = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
};

/** Backoff-schema (ms) för återanslutning till MJPEG-strömmen. */
const BACKOFF = [1000, 2000, 4000, 8000, 15000, 30000];
/** Utan nya bildrutor så här länge betraktas strömmen som död. */
const STALL_MS = 6000;
const HEALTH_INTERVAL = 5000;
const HEALTH_TIMEOUT = 2500;

function siblingUrlFrom(src: string, endpoint: string): string | null {
  try {
    const url = new URL(src, window.location.href);
    url.pathname = url.pathname.endsWith("/stream")
      ? url.pathname.replace(/\/stream$/, `/${endpoint}`)
      : `/${endpoint}`;
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

function healthUrlFrom(src: string): string | null {
  return siblingUrlFrom(src, "health");
}

export function VideoFeed({ src, online, flipH, flipV, children, overlayControls, ref }: Props) {

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [netOnline, setNetOnline] = useState(true);
  const [visible, setVisible] = useState(true);
  // Sant när enheten inte kan låsa orienteringen – då roterar vi bilden själva.
  const [rotate, setRotate] = useState(false);
  // Används för att visa en uppmaning om att vrida enheten.
  const [portrait, setPortrait] = useState(false);

  const lastFrameAt = useRef(0);
  const lastFrameCount = useRef<number | null>(null);
  const failStreak = useRef(0);
  const active = online && !!src && netOnline && visible;

  const retry = useCallback(() => {
    lastFrameAt.current = 0;
    lastFrameCount.current = null;
    setStreaming(false);
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  const hardReset = useCallback(() => {
    lastFrameAt.current = 0;
    lastFrameCount.current = null;
    failStreak.current = 0;
    setStreaming(false);
    setFailed(false);
    setHealthOk(null);
    setAttempt(0);
  }, []);


  // Ny videoadress → börja om från början.
  useEffect(() => {
    hardReset();
  }, [src, hardReset]);

  // Nätverk tillbaka / flik synlig igen → starta om strömmen direkt.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      const on = navigator.onLine !== false;
      setNetOnline(on);
      if (on) retry();
    };
    const onVisibility = () => {
      const vis = document.visibilityState === "visible";
      setVisible(vis);
      if (vis) retry();
    };
    setNetOnline(navigator.onLine !== false);
    setVisible(document.visibilityState === "visible");
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [retry]);

  // Hälsokoll mot kameraserverns /health. Räknaren "frames" avslöjar även
  // strömmar som ser levande ut men inte längre producerar bildrutor.
  useEffect(() => {
    if (!active) {
      setHealthOk(null);
      return;
    }
    const url = healthUrlFrom(src);
    if (!url) {
      setHealthOk(false);
      return;
    }
    let cancelled = false;
    const check = async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT);
      try {
        const res = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (cancelled) return;
        setHealthOk(res.ok);
        if (!res.ok) {
          setFailed(true);
          return;
        }
        const data = (await res.json().catch(() => null)) as { frames?: number } | null;
        if (cancelled || typeof data?.frames !== "number") return;
        const prev = lastFrameCount.current;
        lastFrameCount.current = data.frames;
        // Servern lever men encodern har fastnat – tvinga omladdning.
        if (prev !== null && data.frames === prev) setFailed(true);
      } catch {
        if (!cancelled) {
          setHealthOk(false);
          setFailed(true);
        }
      } finally {
        window.clearTimeout(timeout);
      }
    };
    void check();
    const id = window.setInterval(check, HEALTH_INTERVAL);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active, src]);

  // Vakt för anslutningar som hänger sig utan att ge vare sig bild eller fel.
  // (Löpande stall upptäcks via frames-räknaren i /health ovan.)
  useEffect(() => {
    if (!active || failed || streaming) return;
    const id = window.setTimeout(() => setFailed(true), STALL_MS);
    return () => window.clearTimeout(id);
  }, [active, failed, streaming, attempt]);


  // Återanslut med exponentiell backoff.
  useEffect(() => {
    if (!failed || !active) return;
    const delay = BACKOFF[Math.min(failStreak.current, BACKOFF.length - 1)] ?? 30000;
    const id = window.setTimeout(() => {
      failStreak.current += 1;
      retry();
    }, delay);
    return () => window.clearTimeout(id);
  }, [failed, active, attempt, retry]);


  // Frigör dekodern när strömmen inte ska visas (sparar minne/batteri).
  useEffect(() => {
    if (active) return;
    const img = imgRef.current;
    if (img) img.removeAttribute("src");
    setStreaming(false);
  }, [active]);

  const isNativeFs = typeof document !== "undefined" && !!document.fullscreenElement;

  const isMobile = () =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;

  const detectPortrait = () =>
    typeof window !== "undefined" && window.innerHeight > window.innerWidth;

  const lockLandscape = async () => {
    if (!isMobile()) return;
    const inPortrait = detectPortrait();
    setPortrait(inPortrait);
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
    // Fallback: rotera innehållet själva om vi är i porträtt.
    setRotate(inPortrait);
  };

  const unlockOrientation = () => {
    try {
      screen.orientation?.unlock?.();
    } catch {
      // ignoreras
    }
    setRotate(false);
    setPortrait(false);
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

  // Uppdatera rotationsstatus om användaren vrider enheten under helskärm.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      const inPortrait = detectPortrait();
      setPortrait(inPortrait);
      if (fullscreen && isMobile()) {
        setRotate(inPortrait);
      }
    };
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [fullscreen]);

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
  const showImage = active && !failed;
  const streamSrc = attempt > 0 ? `${src}${src.includes("?") ? "&" : "?"}r=${attempt}` : src;

  const statusText = !online
    ? "Bilen är frånkopplad"
    : !src
      ? "Ingen videoadress angiven"
      : !netOnline
        ? "Enheten saknar nätverk"
        : !visible
          ? "Strömmen pausad (fliken i bakgrunden)"
          : healthOk === false
            ? "Kameraservern svarar inte"
            : "Försöker återansluta till kameran…";

  return (
    <div
      ref={wrapRef}
      className={cn(
        "glass-panel relative aspect-video w-full overflow-hidden bg-muted",
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
      {showImage ? (
        <img
          ref={imgRef}
          key={attempt}
          src={streamSrc}
          alt="Livevideo från bilens kamera"
          className="h-full w-full object-cover"
          decoding="async"
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
          onError={() => {
            setStreaming(false);
            setFailed(true);
          }}
          onLoad={() => {
            lastFrameAt.current = Date.now();
            failStreak.current = 0;
            setStreaming(true);
            setHealthOk(true);
          }}

        />
      ) : (
        <div className="scanlines absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--color-primary)_12%,transparent),transparent_70%)]">
          <div className="text-center">
            <Camera className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Ingen videosignal
            </p>
            <p className="mt-1 text-[0.65rem] tracking-[0.15em] text-muted-foreground/70">
              {statusText}
              {attempt > 0 ? ` (försök ${attempt})` : ""}
            </p>
            {online && src ? (
              <button
                type="button"
                onClick={retry}
                className="mx-auto mt-3 flex items-center gap-2 rounded-lg bg-background/60 px-3 py-1.5 text-[0.7rem] uppercase tracking-[0.15em] text-foreground backdrop-blur-md transition-colors hover:bg-background/90"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Försök igen
              </button>
            ) : null}
          </div>
        </div>
      )}

      {children}

      {showImage && !streaming ? (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-background/60 px-2 py-1 text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground backdrop-blur-md">
          Ansluter…
        </div>
      ) : null}

      {fullscreen && overlayControls ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4"
          style={{
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
            paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
            paddingRight: "max(0.75rem, env(safe-area-inset-right))",
          }}
        >
          {overlayControls}
        </div>
      ) : null}

      {/* Tydlig uppmaning på mobil när vi tvingar landskap via CSS-rotation.
          Texten motroteras så att den är läsbar även när containern är roterad. */}
      {fullscreen && portrait && rotate ? (
        <div
          className="pointer-events-none absolute left-1/2 top-4 z-50 rounded-full bg-background/80 px-4 py-2 text-xs font-semibold text-foreground shadow-lg backdrop-blur-md"
          style={{ transform: "translateX(-50%) rotate(-90deg)" }}
        >
          Vrid enheten till landskap
        </div>
      ) : null}

      <button
        type="button"
        onClick={toggle}
        aria-label="Helskärm"
        className={cn(
          "pointer-events-auto absolute right-3 grid h-9 w-9 place-items-center rounded-lg bg-background/50 text-foreground backdrop-blur-md transition-colors hover:bg-background/80",
          fullscreen && overlayControls ? "top-3" : "bottom-3",
        )}
      >
        {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>
    </div>
  );
}
