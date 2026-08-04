import { Camera, Lightbulb, OctagonAlert, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  accessoryDisabled?: boolean | undefined;
  headlights: boolean;
  onToggleLights: () => void;
  onHorn: () => void;
  onPhoto: () => void;
  onEmergencyStop: () => void;
  stopped: boolean;
  /** True när bilen ännu inte kvitterat nödstoppsläget. */
  pending?: boolean | undefined;
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
  active?: boolean | undefined;
  disabled?: boolean | undefined;
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
  accessoryDisabled,
  headlights,
  onToggleLights,
  onHorn,
  onPhoto,
  onEmergencyStop,
  stopped,
  pending,
}: Props) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <ActionButton
        icon={<Lightbulb className="h-5 w-5" />}
        label="Strålkastare"
        active={headlights}
        disabled={accessoryDisabled}
        onClick={onToggleLights}
      />
      <ActionButton
        icon={<Volume2 className="h-5 w-5" />}
        label="Tuta"
        disabled={accessoryDisabled}
        onClick={onHorn}
      />
      <ActionButton
        icon={<Camera className="h-5 w-5" />}
        label="Ta bild"
        disabled={accessoryDisabled}
        onClick={onPhoto}
      />
      <button
        type="button"
        onClick={onEmergencyStop}
        className={cn(
          "col-span-3 flex items-center justify-center gap-3 rounded-2xl border border-destructive/60 bg-destructive py-5 text-sm font-bold uppercase tracking-[0.3em] text-destructive-foreground backdrop-blur-md transition-all active:scale-[0.99]",
          pending && "animate-pulse ring-2 ring-destructive",
          stopped
            ? "animate-pulse bg-destructive"
            : "shadow-[0_0_30px_color-mix(in_oklab,var(--color-destructive)_35%,transparent)] hover:bg-destructive/90",
        )}
      >
        <OctagonAlert className="h-6 w-6" />
        {pending ? "Väntar på bilens kvittens…" : stopped ? "Återställ nödstopp" : "Nödstopp"}
      </button>
    </div>
  );
}
