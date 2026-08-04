import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { localWsUrl, useSettings } from "@/hooks/useSettings";
import { useI18n } from "@/hooks/useI18n";
import { LANGUAGES } from "@/lib/i18n";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — RC Control Station" },
      {
        name: "description",
        content:
          "Configure WebSocket address, video address, top speed, joystick sensitivity and inverted controls.",
      },
      { property: "og:title", content: "Settings — RC Control Station" },
      {
        property: "og:description",
        content: "Tune connection and driving feel for your RC car.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
      <span className="min-w-0 text-sm leading-snug">{label}</span>
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
  const { t } = useI18n();

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 p-3 pb-10">
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <Link
          to="/"
          aria-label={t("common.back")}
          className="glass-panel grid h-10 w-10 place-items-center transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="truncate text-base font-bold uppercase tracking-[0.2em]">{t("settings.title")}</h1>
        <button
          type="button"
          onClick={reset}
          aria-label={t("settings.reset")}
          className="glass-panel grid h-10 w-10 place-items-center transition-colors hover:text-destructive"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </header>

      <section className="glass-panel space-y-3 p-4">
        <Field label={t("settings.language")}>
          <div className="grid grid-cols-2 gap-2">
            {LANGUAGES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => update({ language: option.value })}
                aria-pressed={settings.language === option.value}
                className={`min-w-0 truncate rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                  settings.language === option.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background/50 hover:border-primary/50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Field>
      </section>

      <section className="glass-panel space-y-4 p-4">
        <Field label={t("settings.wsUrl")} hint={t("settings.wsUrl.hint")}>
          <input
            className={inputClass}
            value={settings.wsUrl}
            onChange={(e) => update({ wsUrl: e.target.value })}
            placeholder="ws://192.168.1.146:81"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => update({ wsUrl: localWsUrl() })}
              className="glass-panel px-3 py-1.5 text-xs transition-colors hover:text-primary"
            >
              {t("settings.wsUrl.same")}
            </button>
            <button
              type="button"
              onClick={() => update({ wsUrl: "ws://192.168.1.146:81" })}
              className="glass-panel px-3 py-1.5 text-xs transition-colors hover:text-primary"
            >
              raspberrypi.local:81
            </button>
          </div>
        </Field>

        <Field
          label={t("settings.token")}
          hint={t("settings.token.hint")}
        >
          <input
            className={inputClass}
            type="password"
            autoComplete="off"
            value={settings.wsToken}
            onChange={(e) => update({ wsToken: e.target.value })}
            placeholder={t("settings.token.placeholder")}
          />
        </Field>



        <Field
          label={t("settings.videoUrl")}
          hint={t("settings.videoUrl.hint")}
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
              {t("settings.videoUrl.nginx")}
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
              {t("settings.videoUrl.port")}
            </button>
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
          <Toggle
            label={t("settings.flipH")}
            checked={settings.videoFlipH}
            onChange={(v) => update({ videoFlipH: v })}
          />
          <Toggle
            label={t("settings.flipV")}
            checked={settings.videoFlipV}
            onChange={(v) => update({ videoFlipV: v })}
          />
        </div>
      </section>

      <section className="glass-panel space-y-5 p-4">
        <Field label={t("settings.maxSpeed", { v: settings.maxSpeed })}>
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
        <Field label={t("settings.sensitivity", { v: settings.sensitivity.toFixed(2) })}>
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
          label={t("settings.invertSteering")}
          checked={settings.invertSteering}
          onChange={(v) => update({ invertSteering: v })}
        />
        <Toggle
          label={t("settings.invertThrottle")}
          checked={settings.invertThrottle}
          onChange={(v) => update({ invertThrottle: v })}
        />
        <Toggle
          label={t("settings.demoMode")}
          checked={settings.demoMode}
          onChange={(v) => update({ demoMode: v })}
        />
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {t("settings.autosave")}
      </p>
    </main>
  );
}
