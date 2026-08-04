import { ChevronDown, Info } from "lucide-react";
import * as Collapsible from "@radix-ui/react-collapsible";
import type { CarStatus, ConnectionState, LogEntry } from "@/lib/car-protocol";
import type { SocketError, SocketHealth } from "@/hooks/useCarSocket";
import { TelemetryPanel } from "./TelemetryPanel";
import { ConnectionHealthPanel } from "./ConnectionHealthPanel";
import { DriverPanel } from "./DriverPanel";
import { LogPanel } from "./LogPanel";
import { cn } from "@/lib/utils";

type Props = {
  status: CarStatus;
  connection: ConnectionState;
  ping: number | null;
  health: SocketHealth;
  logs: LogEntry[];
  error: SocketError | null;
  sessionId: string;
  onReconnect: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DetailsDrawer({
  status,
  connection,
  ping,
  health,
  logs,
  error,
  sessionId,
  open,
  onOpenChange,
}: Props) {
  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange}>
      <Collapsible.Trigger asChild>
        <button
          type="button"
          className="glass-panel flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:border-primary/40"
        >
          <span className="flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            Detaljer
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
      </Collapsible.Trigger>

      <Collapsible.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="space-y-3 pt-3">
          <TelemetryPanel status={status} connection={connection} ping={ping} error={error} />
          <ConnectionHealthPanel
            health={health}
            connection={connection}
            ping={ping}
            onReconnect={() => {}}
          />
          <DriverPanel status={status} connection={connection} sessionId={sessionId} />
          <LogPanel logs={logs} />
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
