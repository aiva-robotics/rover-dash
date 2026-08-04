import { Battery, Wifi } from "lucide-react";
import type { CarStatus, ConnectionState } from "@/lib/car-protocol";
import { voltageToPercent } from "@/lib/car-protocol";
import { cn } from "@/lib/utils";

type Props = {
  status: CarStatus;
  connection: ConnectionState;
  ping: number | null;
  sessionId: string;
};

export function StatusBar({ status, connection, ping, sessionId }: Props) {
  const online = connection === "connected";
  const driver = status.driver;
  const hasDriver = Boolean(driver?.session || driver?.label);
  const isMe = Boolean(driver?.session && driver.session === sessionId);

  const battery = status.batteryPercent ?? (status.battery ? Math.round(status.battery) : undefined);
  const wifi = status.rssi !== undefined ? status.rssi : undefined;

  const driverText = !online
    ? "Frånkopplad"
    : !hasDriver
      ? "Ingen förare"
      : isMe
        ? "Du styr"
        : "Annan styr";

  return (
    <div className="glass-panel flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-[0.6rem] font-bold text-primary">
          A
        </span>
        <span className="truncate text-sm font-semibold tracking-wide">
          AIVA <span className="font-normal text-muted-foreground">Robotics</span>
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-3 text-[0.7rem] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              online ? "bg-primary shadow-[0_0_10px_var(--color-primary)]" : "bg-destructive",
            )}
          />
          <span className="hidden sm:inline">{online ? "Ansluten" : "Frånkopplad"}</span>
        </span>

        <span className="flex items-center gap-1 font-mono tabular-nums">
          <Wifi className="h-3 w-3" />
          {wifi !== undefined ? `${wifi} dBm` : "—"}
        </span>

        <span className="flex items-center gap-1 font-mono tabular-nums">
          <Battery className="h-3 w-3" />
          {battery !== undefined ? `${battery}%` : "—"}
        </span>

        <span className="font-mono tabular-nums">{ping !== null ? `${ping} ms` : "—"}</span>

        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[0.6rem] uppercase tracking-wider",
            isMe && online
              ? "border-primary/40 bg-primary/10 text-primary"
              : hasDriver && online
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {driverText}
        </span>
      </div>
    </div>
  );
}
