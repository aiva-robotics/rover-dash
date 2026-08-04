import { Battery, Circle, Wifi } from "lucide-react";
import type { CarStatus } from "@/lib/car-protocol";
import { rssiToPercent, voltageToPercent } from "@/lib/car-protocol";

export type HudMode = "live" | "demo" | "estop" | "offline";

type Props = {
  status: CarStatus;
  recording?: boolean | undefined;
  mode?: HudMode | undefined;
  flipH?: boolean | undefined;
  flipV?: boolean | undefined;
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
  flipV = false,
}: Props) {
  const battery =
    status.batteryPercent ?? (status.battery ? voltageToPercent(status.battery) : undefined);
  const wifi = status.rssi !== undefined ? rssiToPercent(status.rssi) : undefined;
  const heading = status.heading ?? 0;
  const modeStyle = MODE_STYLES[mode];
  // Spegla HUD:en så att den matchar den vända videobilden
  const mirrored = flipH !== flipV;
  const headingDeg = mirrored ? -heading : heading;
  const rowClass = flipH ? "flex-row-reverse" : "flex-row";
  const colClass = flipV ? "flex-col-reverse" : "flex-col";
  const alert = mode !== "live";

  return (
    <div
      className={`pointer-events-none absolute inset-0 flex ${colClass} justify-between text-foreground`}
      style={{
        paddingTop: "max(0.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
        paddingRight: "max(0.5rem, env(safe-area-inset-right))",
      }}
    >
      {/* Mjuka skuggor i topp/botten så att texten syns utan att dölja bildens mitt */}
      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/45 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/45 to-transparent" />

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
        <div className={`flex ${rowClass} items-center gap-2`}>
          {recording && (
            <span className="flex items-center gap-1.5 rounded-full bg-destructive/70 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-widest backdrop-blur-sm">
              <Circle className="h-2 w-2 animate-pulse fill-current" /> Rec
            </span>
          )}
          <div className="relative grid h-9 w-9 place-items-center rounded-full bg-background/55 backdrop-blur-sm sm:h-11 sm:w-11">
            <div
              className="-mt-1 text-[0.55rem] font-bold text-primary transition-transform duration-300"
              style={{ transform: `rotate(${headingDeg}deg)` }}
            >
              ▲
            </div>
            <span className="absolute bottom-0.5 font-mono text-[0.5rem] leading-none tabular-nums text-foreground/70">
              {Math.round(heading)}°
            </span>
          </div>
        </div>
      </div>

      <div className={`relative flex ${rowClass} items-end justify-between gap-3`}>
        <div className="rounded-lg bg-background/55 px-2 py-1 text-right backdrop-blur-sm">
          <div className="font-mono text-lg font-bold leading-none tabular-nums text-primary sm:text-2xl">
            {Math.round(status.speed ?? 0)}
          </div>
          <div className="text-[0.5rem] uppercase tracking-[0.2em] text-foreground/70">km/h</div>
        </div>
      </div>
    </div>
  );
}

