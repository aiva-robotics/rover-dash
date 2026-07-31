import { Camera, Lightbulb, OctagonAlert, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  disabled?: boolean;
  headlights: boolean;
  onToggleLights: () => void;
  onHorn: () => void;
  onPhoto: () => void;
  onEmergencyStop: () => void;
  stopped: boolean;
};

function ActionButton({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "glass-panel flex flex-col items-center justify-center gap-1.5 py-4 text-[0.65rem] uppercase tracking-[0.15em] transition-all active:scale-[0.97] disabled:opacity-40",
        active && "border-primary/60 text-primary shadow-[0_0_24px_color-mix(in_oklab,var(--color-primary)_35%,transparent)]",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function ControlButtons({
  disabled,
  headlights,
  onToggleLights,
  onHorn,
  onPhoto,
  onEmergencyStop,
  stopped,
}: Props) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <ActionButton
        icon={<Lightbulb className="h-5 w-5" />}
        label="Strålkastare"
        active={headlights}
        disabled={disabled}
        onClick={onToggleLights}
      />
      <ActionButton
        icon={<Volume2 className="h-5 w-5" />}
        label="Tuta"
        disabled={disabled}
        onClick={onHorn}
      />
      <ActionButton
        icon={<Camera className="h-5 w-5" />}
        label="Ta bild"
        disabled={disabled}
        onClick={onPhoto}
      />
      <button
        type="button"
        onClick={onEmergencyStop}
        className={cn(
          "col-span-3 flex items-center justify-center gap-3 rounded-2xl border border-destructive/60 bg-destructive/20 py-5 text-sm font-bold uppercase tracking-[0.3em] text-destructive-foreground backdrop-blur-md transition-all active:scale-[0.99]",
          stopped
            ? "animate-pulse bg-destructive/70"
            : "shadow-[0_0_30px_color-mix(in_oklab,var(--color-destructive)_35%,transparent)] hover:bg-destructive/35",
        )}
      >
        <OctagonAlert className="h-6 w-6" />
        {stopped ? "Återställ nödstopp" : "Nödstopp"}
      </button>
    </div>
  );
}
