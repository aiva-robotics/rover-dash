import { useEffect, useRef, useState, type ReactNode } from "react";
import { Camera, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  src: string;
  online: boolean;
  children?: ReactNode | undefined;
};

export function VideoFeed({ src, online, children }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [failed, setFailed] = useState(false);

  // Ny videoadress → försök igen även om den förra strömmen misslyckades.
  useEffect(() => {
    setFailed(false);
  }, [src]);
  const isNativeFs = typeof document !== "undefined" && !!document.fullscreenElement;

  const toggle = async () => {
    const el = wrapRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setFullscreen(false);
      } else if (el.requestFullscreen) {
        await el.requestFullscreen();
        setFullscreen(true);
      } else {
        setFullscreen((v) => !v);
      }
    } catch {
      // Fullscreen can be blocked (e.g. inside an embedded preview) – fall back
      // to an in-page expanded view instead of crashing.
      setFullscreen((v) => !v);
    }
  };

  return (
    <div
      ref={wrapRef}
      className={cn(
        "glass-panel relative aspect-video w-full overflow-hidden bg-black/60",
        fullscreen && !isNativeFs && "fixed inset-0 z-40 aspect-auto h-screen rounded-none",
      )}
    >
      {online && src && !failed ? (
        <img
          src={src}
          alt="Livevideo från bilens kamera"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="scanlines absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--color-primary)_12%,transparent),transparent_70%)]">
          <div className="text-center">
            <Camera className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Ingen videosignal
            </p>
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
