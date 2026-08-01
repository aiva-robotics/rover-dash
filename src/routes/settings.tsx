import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { localWsUrl, useSettings } from "@/hooks/useSettings";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Inställningar — RC Control Station" },
      {
        name: "description",
        content:
          "Ställ in WebSocket-adress, videoadress, maxhastighet, joystickkänslighet och inverterade reglage.",
      },
      { property: "og:title", content: "Inställningar — RC Control Station" },
      {
        property: "og:description",
        content: "Anpassa anslutning och körkänsla för din radiostyrda bil.",
      },
    ],
  }),
  component: SettingsPage,
});

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 font-mono text-sm outline-none transition-colors focus:border-primary";

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="glass-panel grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left"
    >
      <span className="min-w-0 truncate text-sm">{label}</span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-background transition-transform ${
            checked ? "translate-x-[1.375rem]" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function SettingsPage() {
  const { settings, update, reset } = useSettings();

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 p-3 pb-10">
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <Link
          to="/"
          aria-label="Tillbaka"
          className="glass-panel grid h-10 w-10 place-items-center transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="truncate text-base font-bold uppercase tracking-[0.2em]">Inställningar</h1>
        <button
          type="button"
          onClick={reset}
          aria-label="Återställ"
          className="glass-panel grid h-10 w-10 place-items-center transition-colors hover:text-destructive"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </header>

      <section className="glass-panel space-y-4 p-4">
        <Field label="WebSocket-adress" hint="Adressen till bilens styrserver (rc-car-server på Pi:n, port 81).">
          <input
            className={inputClass}
            value={settings.wsUrl}
            onChange={(e) => update({ wsUrl: e.target.value })}
            placeholder="ws://raspberrypi.local:81"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => update({ wsUrl: localWsUrl() })}
              className="glass-panel px-3 py-1.5 text-xs transition-colors hover:text-primary"
            >
              Pi WebSocket (samma värd)
            </button>
            <button
              type="button"
              onClick={() => update({ wsUrl: "ws://raspberrypi.local:81" })}
              className="glass-panel px-3 py-1.5 text-xs transition-colors hover:text-primary"
            >
              raspberrypi.local:81
            </button>
          </div>
        </Field>

        <Field
          label="Åtkomsttoken"
          hint="Måste matcha RC_TOKEN på Pi:n. Lämna tomt om servern körs utan autentisering."
        >
          <input
            className={inputClass}
            type="password"
            autoComplete="off"
            value={settings.wsToken}
            onChange={(e) => update({ wsToken: e.target.value })}
            placeholder="valfri hemlighet"
          />
        </Field>



        <Field
          label="Videoadress"
          hint="MJPEG-ström från Raspberry Pi-kameran."
        >
          <input
            className={inputClass}
            value={settings.videoUrl}
            onChange={(e) => update({ videoUrl: e.target.value })}
            placeholder="http://raspberrypi.local/camera/stream"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                update({
                  videoUrl: `${window.location.protocol}//${window.location.hostname}/camera/stream`,
                })
              }
              className="glass-panel px-3 py-1.5 text-xs transition-colors hover:text-primary"
            >
              Pi-kamera (via nginx)
            </button>
            <button
              type="button"
              onClick={() =>
                update({
                  videoUrl: `${window.location.protocol}//${window.location.hostname}:8080/stream`,
                })
              }
              className="glass-panel px-3 py-1.5 text-xs transition-colors hover:text-primary"
            >
              Pi-kamera (port 8080)
            </button>
          </div>
        </Field>

      </section>

      <section className="glass-panel space-y-5 p-4">
        <Field label={`Maxhastighet — ${settings.maxSpeed}%`}>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={settings.maxSpeed}
            onChange={(e) => update({ maxSpeed: Number(e.target.value) })}
            className="w-full accent-[var(--color-primary)]"
          />
        </Field>
        <Field label={`Joystickkänslighet — ${settings.sensitivity.toFixed(2)}x`}>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={settings.sensitivity}
            onChange={(e) => update({ sensitivity: Number(e.target.value) })}
            className="w-full accent-[var(--color-primary)]"
          />
        </Field>
      </section>

      <div className="space-y-2">
        <Toggle
          label="Invertera styrning"
          checked={settings.invertSteering}
          onChange={(v) => update({ invertSteering: v })}
        />
        <Toggle
          label="Invertera gas"
          checked={settings.invertThrottle}
          onChange={(v) => update({ invertThrottle: v })}
        />
        <Toggle
          label="Demoläge (simulerad bil)"
          checked={settings.demoMode}
          onChange={(v) => update({ demoMode: v })}
        />
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Alla inställningar sparas automatiskt i webbläsaren.
      </p>
    </main>
  );
}
