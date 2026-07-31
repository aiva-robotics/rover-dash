import { Activity, BatteryCharging, Gauge, Signal, Thermometer, Wifi } from "lucide-react";
import type { CarStatus, ConnectionState } from "@/lib/car-protocol";

type Props = {
  status: CarStatus;
  connection: ConnectionState;
  ping: number | null;
};

const labels: Record<ConnectionState, string> = {
  connected: "Ansluten",
  connecting: "Ansluter…",
  disconnected: "Frånkopplad",
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

export function TelemetryPanel({ status, connection, ping }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Stat
        icon={<BatteryCharging className="h-4 w-4" />}
        label="Batteri"
        value={status.battery !== undefined ? `${status.battery.toFixed(2)} V` : "—"}
      />
      <Stat
        icon={<Wifi className="h-4 w-4" />}
        label="WiFi"
        value={status.rssi !== undefined ? `${status.rssi} dBm` : "—"}
      />
      <Stat
        icon={<Signal className="h-4 w-4" />}
        label="Status"
        value={labels[connection]}
        tone={connection === "connected" ? "good" : "bad"}
      />
      <Stat
        icon={<Gauge className="h-4 w-4" />}
        label="Hastighet"
        value={`${(status.speed ?? 0).toFixed(1)} km/h`}
      />
      <Stat
        icon={<Thermometer className="h-4 w-4" />}
        label="Temperatur"
        value={status.temperature !== undefined ? `${status.temperature.toFixed(1)} °C` : "—"}
      />
      <Stat
        icon={<Activity className="h-4 w-4" />}
        label="Ping"
        value={ping !== null ? `${ping} ms` : "—"}
      />
    </div>
  );
}
