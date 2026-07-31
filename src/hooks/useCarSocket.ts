import { useCallback, useEffect, useRef, useState } from "react";
import type { CarStatus, ConnectionState, DriveCommand, LogEntry } from "@/lib/car-protocol";

const SEND_INTERVAL = 50; // ms -> 20 Hz
const MAX_LOGS = 60;

type Options = {
  url: string;
  enabled: boolean;
  demoMode: boolean;
};

let logId = 0;

export function useCarSocket({ url, enabled, demoMode }: Options) {
  const [connection, setConnection] = useState<ConnectionState>("disconnected");
  const [status, setStatus] = useState<CarStatus>({});
  const [ping, setPing] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const commandRef = useRef<DriveCommand>({ throttle: 0, steering: 0 });
  const lastSentRef = useRef<string>("");
  const retryRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const log = useCallback((level: LogEntry["level"], message: string) => {
    setLogs((prev) =>
      [
        {
          id: ++logId,
          time: new Date().toLocaleTimeString("sv-SE"),
          level,
          message,
        },
        ...prev,
      ].slice(0, MAX_LOGS),
    );
  }, []);

  const setCommand = useCallback((cmd: DriveCommand) => {
    commandRef.current = cmd;
  }, []);

  const sendJson = useCallback((payload: unknown) => {
    const sock = socketRef.current;
    if (sock && sock.readyState === WebSocket.OPEN) {
      sock.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  // --- Demo mode: simulated vehicle -----------------------------------
  useEffect(() => {
    if (!demoMode || !enabled) return;
    setConnection("connecting");
    log("info", "Demoläge startat – simulerad bil");
    const start = setTimeout(() => {
      setConnection("connected");
      log("info", "Ansluten till demo-fordon");
    }, 600);
    const tick = setInterval(() => {
      const t = Date.now() / 1000;
      setStatus({
        battery: 11.4 + Math.sin(t / 20) * 0.35,
        rssi: -55 + Math.round(Math.sin(t / 7) * 8),
        speed: Math.abs(commandRef.current.throttle) * 0.32,
        temperature: 31 + Math.sin(t / 30) * 2,
        heading: (t * 6) % 360,
      });
      setPing(18 + Math.round(Math.random() * 14));
    }, 400);
    return () => {
      clearTimeout(start);
      clearInterval(tick);
      setConnection("disconnected");
    };
  }, [demoMode, enabled, log]);

  // --- Real WebSocket --------------------------------------------------
  useEffect(() => {
    if (demoMode || !enabled || !url) {
      setConnection("disconnected");
      return;
    }
    let closed = false;

    const connect = () => {
      if (closed) return;
      setConnection("connecting");
      log("info", `Ansluter till ${url}`);
      let sock: WebSocket;
      try {
        sock = new WebSocket(url);
      } catch {
        log("error", "Ogiltig WebSocket-adress");
        setConnection("disconnected");
        return;
      }
      socketRef.current = sock;

      sock.onopen = () => {
        retryRef.current = 0;
        setConnection("connected");
        log("info", "Anslutning upprättad");
      };
      sock.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data));
          if (data.pong) {
            setPing(Math.round(Date.now() - Number(data.pong)));
            return;
          }
          setStatus((prev) => ({ ...prev, ...data }));
        } catch {
          log("warn", "Kunde inte tolka meddelande från bilen");
        }
      };
      sock.onerror = () => log("error", "WebSocket-fel");
      sock.onclose = () => {
        socketRef.current = null;
        setConnection("disconnected");
        setPing(null);
        if (closed) return;
        log("warn", "Anslutningen bröts – försöker igen");
        retryRef.current += 1;
        const delay = Math.min(1000 * 2 ** (retryRef.current - 1), 10000);
        timersRef.current.push(setTimeout(connect, delay));
      };
    };

    connect();

    return () => {
      closed = true;
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [url, enabled, demoMode, log]);

  // --- Continuous command loop + ping ----------------------------------
  useEffect(() => {
    if (demoMode) return;
    const interval = setInterval(() => {
      const payload = JSON.stringify(commandRef.current);
      if (payload !== lastSentRef.current) {
        if (sendJson(commandRef.current)) lastSentRef.current = payload;
      }
    }, SEND_INTERVAL);
    const heartbeat = setInterval(() => {
      sendJson({ ...commandRef.current, ping: Date.now() });
    }, 1000);
    return () => {
      clearInterval(interval);
      clearInterval(heartbeat);
    };
  }, [sendJson, demoMode]);

  const sendAction = useCallback(
    (action: string, value?: unknown) => {
      log("info", `Kommando: ${action}${value !== undefined ? ` = ${String(value)}` : ""}`);
      if (demoMode) return true;
      return sendJson({ action, value });
    },
    [sendJson, log, demoMode],
  );

  return { connection, status, ping, logs, setCommand, sendAction, log };
}
