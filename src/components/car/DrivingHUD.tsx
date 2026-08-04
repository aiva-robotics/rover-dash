import { Battery, Circle, Wifi } from "lucide-react";
import type { CarStatus } from "@/lib/car-protocol";
import { rssiToPercent, voltageToPercent } from "@/lib/car-protocol";

export type HudMode = "live" | "demo" | "estop" | "offline";

type Props = {
  status: CarStatus;
  recording?: boolean | undefined;
  mode?: HudMode | undefined;
  flipH?: boolean | undefined;
};

const MODE_STYLES: Record<HudMode, { label: string; className: string; pulse: boolean }> = {
  live: {
    label: "Live",
    className: "border-primary/70 bg-primary/20 text-primary",
    pulse: false,
  },
  demo: {
    label: "Demoläge",
    className: "border-accent/70 bg-accent/20 text-accent",
    pulse: false,
  },
  estop: {
    label: "Nödstopp",
    className: "border-destructive bg-destructive/30 text-destructive",
    pulse: true,
  },
  offline: {
    label: "Frånkopplad",
    className: "border-destructive/70 bg-destructive/20 text-destructive",
    pulse: true,
  },
};



export function DrivingHUD({
  status,
  recording,
  mode = "live",
  flipH = false,
}: Props) {
  const battery =
    status.batteryPercent ?? (status.battery ? voltageToPercent(status.battery) : undefined);
  const wifi = status.rssi !== undefined ? rssiToPercent(status.rssi) : undefined;
  const modeStyle = MODE_STYLES[mode];
  const rowClass = flipH ? "flex-row-reverse" : "flex-row";
  const alert = mode !== "live";

  return (
    <div
      className="pointer-events-none absolute inset-0 flex text-foreground"
      style={{
        paddingTop: "max(0.5rem, env(safe-area-inset-top))",
        paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
        paddingRight: "max(0.5rem, env(safe-area-inset-right))",
      }}
    >
      {/* Mjuk skugga i toppen så att statusraden syns mot videon */}
      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/45 to-transparent" />

      <div
        aria-live="polite"
        className={
          alert
            ? `absolute left-1/2 top-2 -translate-x-1/2 rounded-full border px-4 py-1.5 text-center text-xs font-black uppercase tracking-[0.25em] backdrop-blur-sm sm:text-sm ${modeStyle.className} ${modeStyle.pulse ? "animate-pulse" : "opacity-95"}`
            : `absolute left-1/2 top-2 -translate-x-1/2 rounded-full border px-2.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-[0.3em] backdrop-blur-sm ${modeStyle.className}`
        }
      >
        {modeStyle.label}
      </div>

      <div className={`relative flex ${rowClass} items-start justify-between gap-2`}>
        <div className="flex items-center gap-2.5 rounded-full bg-background/55 px-2.5 py-1 backdrop-blur-sm">
          <span className="flex items-center gap-1 font-mono text-[0.7rem] tabular-nums">
            <Battery className="h-3.5 w-3.5 text-primary" />
            {battery !== undefined ? `${battery}%` : "--"}
          </span>
          <span className="flex items-center gap-1 font-mono text-[0.7rem] tabular-nums">
            <Wifi className="h-3.5 w-3.5 text-primary" />
            {wifi !== undefined ? `${wifi}%` : "--"}
          </span>
        </div>
        {recording && (
          <span className="flex items-center gap-1.5 rounded-full bg-destructive/70 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-widest backdrop-blur-sm">
            <Circle className="h-2 w-2 animate-pulse fill-current" /> Rec
          </span>
        )}
      </div>
    </div>
  );
}

