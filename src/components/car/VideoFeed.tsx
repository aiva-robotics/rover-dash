import { useRef, useState, type ReactNode } from "react";
import { Camera, Maximize2, Minimize2 } from "lucide-react";

type Props = {
  src: string;
  online: boolean;
  children?: ReactNode | undefined;
};

export function VideoFeed({ src, online, children }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [failed, setFailed] = useState(false);

  const toggle = async () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      setFullscreen(false);
    } else {
      await el.requestFullscreen?.();
      setFullscreen(true);
    }
  };

  return (
    <div
      ref={wrapRef}
      className="glass-panel relative aspect-video w-full overflow-hidden bg-black/60"
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
