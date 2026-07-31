import { TriangleAlert, RefreshCw, Joystick as JoystickIcon } from "lucide-react";

type Props = {
  visible: boolean;
  reason: "connection" | "estop";
  onReset?: (() => void) | undefined;
  onRetry?: (() => void) | undefined;
  onDemoMode?: (() => void) | undefined;
};

export function ConnectionLostOverlay({
  visible,
  reason,
  onReset,
  onRetry,
  onDemoMode,
}: Props) {
  if (!visible) return null;
  const isEstop = reason === "estop";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 px-6 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-sm rounded-3xl border border-destructive/70 bg-destructive/15 p-6 text-center shadow-[0_0_60px_color-mix(in_oklab,var(--color-destructive)_40%,transparent)]">
        <TriangleAlert className="mx-auto h-12 w-12 animate-pulse text-destructive" />
        <h2 className="mt-4 text-xl font-bold uppercase tracking-[0.2em] text-destructive">
          {isEstop ? "Nödstopp aktivt" : "Anslutning bruten"}
        </h2>
        <p className="mt-3 text-sm text-foreground/80">
          {isEstop
            ? "Alla reglage är låsta. Bekräfta att banan är fri innan du återställer."
            : "Kontakten med bilen har tappats. Bilen har gått till nödstopp och alla reglage är inaktiverade."}
        </p>
        {isEstop && onReset && (
          <button
            type="button"
            onClick={onReset}
            className="mt-5 w-full rounded-xl border border-destructive/60 bg-destructive/30 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-destructive-foreground transition-colors hover:bg-destructive/50"
          >
            Återställ
          </button>
        )}
        {!isEstop && (
          <div className="mt-5 grid gap-2">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/60 bg-destructive/30 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-destructive-foreground transition-colors hover:bg-destructive/50"
              >
                <RefreshCw className="h-4 w-4" />
                Försök ansluta igen
              </button>
            )}
            {onDemoMode && (
              <button
                type="button"
                onClick={onDemoMode}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/50 bg-primary/15 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-primary transition-colors hover:bg-primary/25"
              >
                <JoystickIcon className="h-4 w-4" />
                Gå till demoläge
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
