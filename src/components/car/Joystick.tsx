import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  axis: "x" | "y";
  disabled?: boolean | undefined;
  onChange: (value: number) => void; // -100..100
  accent?: "primary" | "accent";
};

export function Joystick({ label, axis, disabled, onChange, accent = "primary" }: Props) {
  const areaRef = useRef<HTMLDivElement | null>(null);
  const [value, setValue] = useState(0);
  const [active, setActive] = useState(false);
  const pointerId = useRef<number | null>(null);

  const emit = useCallback(
    (next: number) => {
      setValue(next);
      onChange(next);
    },
    [onChange],
  );

  useEffect(() => {
    if (disabled) emit(0);
  }, [disabled, emit]);

  const compute = (clientX: number, clientY: number) => {
    const el = areaRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const raw =
      axis === "x" ? (clientX - cx) / (rect.width / 2) : -((clientY - cy) / (rect.height / 2));
    return Math.round(Math.max(-1, Math.min(1, raw)) * 100);
  };

  const handleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    pointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setActive(true);
    emit(compute(e.clientX, e.clientY));
  };

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || pointerId.current !== e.pointerId) return;
    emit(compute(e.clientX, e.clientY));
  };

  const release = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerId.current !== e.pointerId) return;
    pointerId.current = null;
    setActive(false);
    emit(0);
  };

  const offset = `${value}%`;
  const accentVar = accent === "primary" ? "var(--color-primary)" : "var(--color-accent)";

  return (
    <div className="glass-panel flex select-none flex-col items-center gap-3 p-4">
      <div className="flex w-full items-center justify-between text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
        <span className="truncate">{label}</span>
        <span className="font-mono tabular-nums text-foreground">{value}</span>
      </div>
      <div
        ref={areaRef}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
        className={cn(
          "relative aspect-square w-full max-w-[190px] touch-none rounded-full border border-border/60 bg-background/40 shadow-inner backdrop-blur-md transition-opacity",
          disabled && "pointer-events-none opacity-40",
        )}
        role="slider"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={-100}
        aria-valuemax={100}
      >
        <div className="absolute inset-3 rounded-full border border-dashed border-border/40" />
        <div
          className={cn(
            "absolute left-1/2 top-1/2 h-1/2 w-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border",
            active ? "border-transparent" : "border-transparent",
          )}
        />
        <div
          className="absolute left-1/2 top-1/2 grid h-[42%] w-[42%] place-items-center rounded-full border border-border/70 text-[0.6rem] font-semibold"
          style={{
            transform:
              axis === "x"
                ? `translate(calc(-50% + ${offset}), -50%)`
                : `translate(-50%, calc(-50% - ${offset}))`,
            transition: active ? "none" : "transform 260ms cubic-bezier(.22,1,.36,1)",
            background: `radial-gradient(circle at 35% 30%, color-mix(in oklab, ${accentVar} 55%, transparent), color-mix(in oklab, var(--color-card) 90%, transparent))`,
            boxShadow: active
              ? `0 0 26px color-mix(in oklab, ${accentVar} 55%, transparent)`
              : `0 0 12px color-mix(in oklab, ${accentVar} 25%, transparent)`,
          }}
        >
          <span className="font-mono tabular-nums text-foreground/80">
            {axis === "x" ? "◄ ►" : "▲▼"}
          </span>
        </div>
      </div>
    </div>
  );
}
