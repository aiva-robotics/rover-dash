import { Battery, Circle, Wifi } from "lucide-react";
import type { CarStatus } from "@/lib/car-protocol";
import { rssiToPercent, voltageToPercent } from "@/lib/car-protocol";

export type HudMode = "live" | "demo" | "estop" | "offline";

type Props = {
  status: CarStatus;
  throttle: number;
  steering: number;
  recording?: boolean | undefined;
  mode?: HudMode | undefined;
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


function Bar({ value, label }: { value: number; label: string }) {
  const positive = value >= 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-[0.6rem] uppercase tracking-widest text-foreground/60">
        {label}
      </span>
      <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-foreground/15">
        <div
          className="absolute top-0 h-full rounded-full bg-primary transition-[width,left] duration-100"
          style={{
            left: positive ? "50%" : `${50 - Math.abs(value) / 2}%`,
            width: `${Math.abs(value) / 2}%`,
          }}
        />
      </div>
    </div>
  );
}

export function DrivingHUD({ status, throttle, steering, recording, mode = "live" }: Props) {
  const battery =
    status.batteryPercent ?? (status.battery ? voltageToPercent(status.battery) : undefined);
  const wifi = status.rssi !== undefined ? rssiToPercent(status.rssi) : undefined;
  const heading = status.heading ?? 0;
  const modeStyle = MODE_STYLES[mode];

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 text-foreground">
      <div
        aria-live="polite"
        className={
          mode === "live"
            ? `absolute left-1/2 top-3 -translate-x-1/2 rounded-full border px-3 py-1 text-[0.6rem] font-bold uppercase tracking-[0.3em] backdrop-blur-md ${modeStyle.className}`
            : `absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl border px-5 py-2 text-center text-lg font-black uppercase tracking-[0.3em] backdrop-blur-md ${modeStyle.className} ${modeStyle.pulse ? "animate-pulse" : "opacity-90"}`
        }
      >
        {modeStyle.label}
      </div>


      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 rounded-full bg-background/45 px-3 py-1.5 backdrop-blur-md">
          <span className="flex items-center gap-1.5 font-mono text-xs tabular-nums">
            <Battery className="h-4 w-4 text-primary" />
            {battery !== undefined ? `${battery}%` : "--"}
          </span>
          <span className="flex items-center gap-1.5 font-mono text-xs tabular-nums">
            <Wifi className="h-4 w-4 text-primary" />
            {wifi !== undefined ? `${wifi}%` : "--"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {recording && (
            <span className="flex items-center gap-1.5 rounded-full bg-destructive/80 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-widest backdrop-blur-md">
              <Circle className="h-2 w-2 animate-pulse fill-current" /> Rec
            </span>
          )}
          <div className="relative grid h-12 w-12 place-items-center rounded-full bg-background/45 backdrop-blur-md">
            <div
              className="-mt-1.5 text-[0.6rem] font-bold text-primary transition-transform duration-300"
              style={{ transform: `rotate(${heading}deg)` }}
            >
              ▲
            </div>
            <span className="absolute bottom-1 font-mono text-[0.55rem] leading-none tabular-nums text-foreground/70">
              {Math.round(heading)}°
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-end justify-between gap-3 pr-11">
        <div className="space-y-1.5 rounded-xl bg-background/45 px-3 py-2 backdrop-blur-md">
          <Bar label="Gas" value={throttle} />
          <Bar label="Ratt" value={steering} />
        </div>
        <div className="rounded-xl bg-background/45 px-3 py-1.5 text-right backdrop-blur-md">
          <div className="font-mono text-2xl font-bold leading-none tabular-nums text-primary">
            {Math.round(status.speed ?? 0)}
          </div>
          <div className="text-[0.55rem] uppercase tracking-[0.2em] text-foreground/60">km/h</div>
        </div>
      </div>
    </div>
  );
}
