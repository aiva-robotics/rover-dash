import { BatteryFull, Map, ScanEye, Video, Videotape } from "lucide-react";

const modules = [
  { icon: Map, title: "GPS-karta", desc: "Live-position och rutthistorik" },
  { icon: ScanEye, title: "AI-objektdetektering", desc: "Igenkänning direkt i videoströmmen" },
  { icon: Videotape, title: "Videoinspelning", desc: "Spela in och spara körningar" },
  { icon: Video, title: "Flera kameror", desc: "Växla mellan fram- och bakkamera" },
  { icon: BatteryFull, title: "Batterihistorik", desc: "Grafer över spänning och förbrukning" },
];

export function FuturePanels() {
  return (
    <section className="space-y-2">
      <h2 className="text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">
        Kommande moduler
      </h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {modules.map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="glass-panel flex items-start gap-3 p-3 opacity-70 transition-opacity hover:opacity-100"
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">{title}</span>
                <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[0.55rem] uppercase tracking-widest text-muted-foreground">
                  Snart
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
