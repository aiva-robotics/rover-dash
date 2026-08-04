import { useEffect, useState } from "react";
import { UserCheck, UserX, Users } from "lucide-react";
import type { CarStatus, ConnectionState } from "@/lib/car-protocol";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";
import type { TFunc } from "@/lib/i18n";

type Props = {
  status: CarStatus;
  connection: ConnectionState;
  /** Den här klientens sessions-ID. */
  sessionId: string;
};

function formatClock(ms: number | null | undefined, locale: string) {
  if (!ms) return null;
  return new Date(ms).toLocaleTimeString(locale);
}

function formatAgo(ms: number | null | undefined, now: number, t: TFunc) {
  if (!ms) return null;
  const seconds = Math.max(0, Math.round((now - ms) / 1000));
  if (seconds < 60) return t("time.secondsAgo", { n: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("time.minutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  return t("time.hoursAgo", { h: hours, m: minutes % 60 });
}

export function DriverPanel({ status, connection, sessionId }: Props) {
  const { t, locale } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const driver = status.driver;
  const online = connection === "connected";
  const hasDriver = Boolean(driver?.session || driver?.label);
  const isMe = Boolean(driver?.session && driver.session === sessionId);

  const title = !online
    ? t("driver.noContact")
    : !hasDriver
      ? t("driver.none")
      : isMe
        ? t("driver.me")
        : t("driver.other", { name: driver?.label ?? t("driver.unknown") });

  const Icon = !online || !hasDriver ? UserX : isMe ? UserCheck : Users;

  return (
    <section className="glass-panel p-4">
      <h2 className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">
        <Users className="h-3.5 w-3.5" /> {t("driver.title")}
      </h2>

      <div className="mt-3 flex items-start gap-3">
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-full border",
            isMe && online
              ? "border-primary/50 bg-primary/10 text-primary"
              : hasDriver && online
                ? "border-accent/50 bg-accent/10 text-accent"
                : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="font-mono text-[0.7rem] text-muted-foreground">
            {hasDriver && online
              ? t("driver.activeSince", {
                  clock: formatClock(driver?.since, locale) ?? "—",
                  ago: formatAgo(driver?.since, now, t) ?? "—",
                })
              : t("driver.waiting")}
          </p>
          <p className="font-mono text-[0.7rem] text-muted-foreground">
            {driver?.handover
              ? t("driver.handover", {
                  clock: formatClock(driver.handover, locale) ?? "—",
                  ago: formatAgo(driver.handover, now, t) ?? "—",
                })
              : t("driver.noHandover")}
          </p>
          <p className="font-mono text-[0.65rem] text-muted-foreground/70">
            {t("driver.session", { id: sessionId.slice(0, 8) })}
            {driver?.session && !isMe
              ? t("driver.activeSession", { id: driver.session.slice(0, 8) })
              : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
