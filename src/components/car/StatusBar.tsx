import { Battery, Wifi } from "lucide-react";
import type { CarStatus, ConnectionState } from "@/lib/car-protocol";
import { voltageToPercent } from "@/lib/car-protocol";
import { cn } from "@/lib/utils";
import aivaLogo from "@/assets/aiva-robotics-logo.png.asset.json";


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

  const battery =
    status.batteryPercent ?? (status.battery !== undefined ? voltageToPercent(status.battery) : undefined);
  const wifi = status.rssi !== undefined ? status.rssi : undefined;

  const driverText = !online
    ? "Frånkopplad"
    : !hasDriver
      ? "Ingen förare"
      : isMe
        ? "Du styr"
        : "Annan styr";

  // Kortare etikett på små skärmar så att texten aldrig kapas.
  const driverTextShort = !online
    ? "Offline"
    : !hasDriver
      ? "Ingen"
      : isMe
        ? "Du"
        : "Annan";

  return (
    <div className="glass-panel grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 overflow-hidden px-3 py-2.5">
      <img
        src={aivaLogo.url}
        alt="AIVA Robotics"
        className="h-6 w-auto shrink-0 object-contain"
      />

      <div className="flex min-w-0 items-center justify-end gap-2 text-[0.7rem] text-muted-foreground sm:gap-3">
        <span className="flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              online ? "bg-primary shadow-[0_0_10px_var(--color-primary)]" : "bg-destructive",
            )}
          />
          <span className="hidden sm:inline">{online ? "Ansluten" : "Frånkopplad"}</span>
        </span>

        <span className="hidden shrink-0 items-center gap-1 font-mono tabular-nums sm:flex">
          <Wifi className="h-3 w-3" />
          {wifi !== undefined ? `${wifi} dBm` : "—"}
        </span>

        <span className="flex shrink-0 items-center gap-1 font-mono tabular-nums">
          <Battery className="h-3 w-3" />
          {battery !== undefined ? `${battery}%` : "—"}
        </span>

        <span className="hidden shrink-0 font-mono tabular-nums sm:inline">
          {ping !== null ? `${ping} ms` : "—"}
        </span>

        <span
          className={cn(
            "min-w-0 truncate rounded-full border px-2 py-0.5 text-[0.6rem] uppercase tracking-wider",
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
