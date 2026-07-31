import { useEffect, useState } from "react";
import { Activity, PlugZap, RefreshCw } from "lucide-react";
import type { SocketHealth } from "@/hooks/useCarSocket";
import type { ConnectionState } from "@/lib/car-protocol";

type Props = {
  health: SocketHealth;
  connection: ConnectionState;
  ping: number | null;
  onReconnect: () => void;
};

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function formatDuration(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/50 bg-background/30 px-2.5 py-2">
      <div className="truncate text-[0.55rem] uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </div>
      <div className="truncate font-mono text-xs font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function ConnectionHealthPanel({ health, connection, ping, onReconnect }: Props) {
  const now = useNow(true);
  const retryIn =
    health.nextRetryAt !== null ? Math.max(0, Math.ceil((health.nextRetryAt - now) / 1000)) : null;
  const uptime = health.connectedSince !== null ? now - health.connectedSince : null;
  const quality =
    connection !== "connected"
      ? "Ingen länk"
      : ping === null
        ? "Mäter…"
        : ping < 60
          ? "Utmärkt"
          : ping < 140
            ? "Bra"
            : "Svag";

  return (
    <section className="glass-panel space-y-3 p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">
          <Activity className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Anslutningshälsa</span>
        </h2>
        <button
          type="button"
          onClick={onReconnect}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border/60 bg-background/40 px-2.5 py-1.5 text-[0.6rem] uppercase tracking-[0.15em] transition-colors hover:border-primary hover:text-primary"
        >
          <RefreshCw className="h-3 w-3" />
          Återanslut
        </button>
      </div>

      {connection !== "connected" && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs">
          <PlugZap className="h-4 w-4 shrink-0 text-destructive" />
          <span className="min-w-0">
            {connection === "connecting"
              ? `Återansluter… (försök ${health.attempts + 1})`
              : retryIn !== null
                ? `Nytt försök om ${retryIn} s (försök ${health.attempts + 1})`
                : "Frånkopplad"}
          </span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Metric label="Kvalitet" value={quality} />
        <Metric label="Ping" value={ping !== null ? `${ping} ms` : "—"} />
        <Metric label="Jitter" value={health.jitter !== null ? `${health.jitter} ms` : "—"} />
        <Metric label="Min" value={health.pingMin !== null ? `${health.pingMin} ms` : "—"} />
        <Metric label="Medel" value={health.pingAvg !== null ? `${health.pingAvg} ms` : "—"} />
        <Metric label="Max" value={health.pingMax !== null ? `${health.pingMax} ms` : "—"} />
        <Metric label="Upptid" value={uptime !== null ? formatDuration(uptime) : "—"} />
        <Metric label="Paketförlust" value={`${health.packetLoss}%`} />
        <Metric label="Försök" value={String(health.attempts)} />
        <Metric label="Anslutningar" value={String(health.totalConnects)} />
        <Metric label="Avbrott" value={String(health.totalDisconnects)} />
        <Metric
          label="Meddelanden"
          value={`${health.messagesReceived}/${health.commandsSent}`}
        />
      </div>
    </section>
  );
}
