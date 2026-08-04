import { TriangleAlert, RefreshCw, Joystick as JoystickIcon, Terminal } from "lucide-react";
import type { SocketError } from "@/hooks/useCarSocket";
import { useI18n } from "@/hooks/useI18n";

type Props = {
  visible: boolean;
  reason: "connection" | "estop";
  error?: SocketError | null;
  onReset?: (() => void) | undefined;
  onRetry?: (() => void) | undefined;
  onDemoMode?: (() => void) | undefined;
};

export function ConnectionLostOverlay({
  visible,
  reason,
  error,
  onReset,
  onRetry,
  onDemoMode,
}: Props) {
  const { t } = useI18n();
  if (!visible) return null;
  const isEstop = reason === "estop";

  const title = isEstop ? t("overlay.estop.title") : (error?.title ?? t("overlay.connection.title"));
  const body = isEstop ? t("overlay.estop.body") : (error?.message ?? t("overlay.connection.body"));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 px-6 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-sm rounded-3xl border border-destructive/70 bg-destructive/15 p-6 text-center shadow-[0_0_60px_color-mix(in_oklab,var(--color-destructive)_40%,transparent)]">
        <TriangleAlert className="mx-auto h-12 w-12 animate-pulse text-destructive" />
        <h2 className="mt-4 text-xl font-bold uppercase tracking-[0.2em] text-destructive">
          {title}
        </h2>
        <p className="mt-3 text-sm text-foreground/80">{body}</p>

        {!isEstop && error && (
          <div className="mt-4 space-y-2 rounded-2xl border border-border/60 bg-background/40 p-3 text-left">
            {error.url && (
              <div className="min-w-0">
                <div className="text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">
                  {t("overlay.address")}
                </div>
                <div className="truncate font-mono text-xs">{error.url}</div>
              </div>
            )}
            <div className="flex items-start gap-2">
              <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
              <code className="min-w-0 break-words font-mono text-[0.7rem] text-foreground/80">
                {error.hint}
              </code>
            </div>
            {error.attempts > 0 && (
              <div className="text-[0.7rem] text-muted-foreground">
                {t("overlay.attempts", { n: error.attempts })}
              </div>
            )}
          </div>
        )}

        {isEstop && onReset && (
          <button
            type="button"
            onClick={onReset}
            className="mt-5 w-full rounded-xl border border-destructive/60 bg-destructive/30 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-destructive-foreground transition-colors hover:bg-destructive/50"
          >
            {t("overlay.reset")}
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
                <span className="min-w-0">{t("overlay.retry")}</span>
              </button>
            )}
            {onDemoMode && (
              <button
                type="button"
                onClick={onDemoMode}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/50 bg-primary/15 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-primary transition-colors hover:bg-primary/25"
              >
                <JoystickIcon className="h-4 w-4" />
                <span className="min-w-0">{t("overlay.demo")}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
