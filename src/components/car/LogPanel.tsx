import { Terminal } from "lucide-react";
import type { LogEntry } from "@/lib/car-protocol";
import { cn } from "@/lib/utils";

export function LogPanel({ logs }: { logs: LogEntry[] }) {
  return (
    <section className="glass-panel p-4">
      <h2 className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.25em] text-muted-foreground">
        <Terminal className="h-3.5 w-3.5" /> Logg
      </h2>
      <div className="mt-3 max-h-48 space-y-1 overflow-y-auto font-mono text-[0.7rem] leading-relaxed">
        {logs.length === 0 && <p className="text-muted-foreground">Inga händelser ännu.</p>}
        {logs.map((entry) => (
          <div key={entry.id} className="flex gap-2">
            <span className="shrink-0 text-muted-foreground">{entry.time}</span>
            <span
              className={cn(
                "min-w-0 break-words",
                entry.level === "error" && "text-destructive",
                entry.level === "warn" && "text-accent",
              )}
            >
              {entry.message}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
