import { Activity, BatteryCharging, Gauge, Signal, Thermometer, Wifi } from "lucide-react";
import type { CarStatus, ConnectionState } from "@/lib/car-protocol";
import type { SocketError } from "@/hooks/useCarSocket";
import { useI18n } from "@/hooks/useI18n";

type Props = {
  status: CarStatus;
  connection: ConnectionState;
  ping: number | null;
  error?: SocketError | null;
};

const stateKeys: Record<ConnectionState, "common.connected" | "common.connecting" | "common.disconnected"> = {
  connected: "common.connected",
  connecting: "common.connecting",
  disconnected: "common.disconnected",
};


function Stat({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "good" | "bad";
}) {
  return (
    <div className="glass-panel flex min-w-0 items-center gap-2.5 px-3 py-2.5">
      <span
        className={
          tone === "bad" ? "text-destructive" : tone === "good" ? "text-primary" : "text-accent"
        }
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[0.6rem] uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </div>
        <div className="truncate font-mono text-sm font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

export function TelemetryPanel({ status, connection, ping, error }: Props) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      {error && connection !== "connected" && (
        <div className="glass-panel flex min-w-0 items-start gap-2.5 border-destructive/50 px-3 py-2.5 text-left">
          <Signal className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-destructive">{error.title}</div>
            <div className="truncate font-mono text-[0.7rem] text-muted-foreground">
              {error.url || error.hint}
            </div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">

      <Stat
        icon={<BatteryCharging className="h-4 w-4" />}
        label={t("telemetry.battery")}
        value={status.battery !== undefined ? `${status.battery.toFixed(2)} V` : "—"}
      />
      <Stat
        icon={<Wifi className="h-4 w-4" />}
        label={t("telemetry.wifi")}
        value={status.rssi !== undefined ? `${status.rssi} dBm` : "—"}
      />
      <Stat
        icon={<Signal className="h-4 w-4" />}
        label={t("telemetry.status")}
        value={t(stateKeys[connection])}
        tone={connection === "connected" ? "good" : "bad"}
      />
      <Stat
        icon={<Gauge className="h-4 w-4" />}
        label={t("telemetry.speed")}
        value={`${(status.speed ?? 0).toFixed(1)} km/h`}
      />
      <Stat
        icon={<Thermometer className="h-4 w-4" />}
        label={t("telemetry.temperature")}
        value={status.temperature !== undefined ? `${status.temperature.toFixed(1)} °C` : "—"}
      />
      <Stat
        icon={<Activity className="h-4 w-4" />}
        label={t("telemetry.ping")}
        value={ping !== null ? `${ping} ms` : "—"}
      />
      </div>
    </div>

  );
}
