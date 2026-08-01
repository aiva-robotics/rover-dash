import { useCallback, useEffect, useRef, useState } from "react";
import type { CarStatus, ConnectionState, DriveCommand, LogEntry } from "@/lib/car-protocol";

const SEND_INTERVAL = 50; // ms -> 20 Hz
const MAX_LOGS = 60;
const MAX_RETRY_DELAY = 15000;
const BASE_RETRY_DELAY = 1000;
const PING_HISTORY = 20;

type Options = {
  url: string;
  enabled: boolean;
  demoMode: boolean;
};

export type SocketHealth = {
  attempts: number; // consecutive failed attempts
  totalConnects: number;
  totalDisconnects: number;
  connectedSince: number | null;
  nextRetryAt: number | null;
  retryDelay: number;
  messagesReceived: number;
  commandsSent: number;
  lastMessageAt: number | null;
  pingMin: number | null;
  pingAvg: number | null;
  pingMax: number | null;
  jitter: number | null;
  packetLoss: number; // percent of unanswered pings
};

export type SocketErrorCode =
  | "unreachable"
  | "dropped"
  | "busy"
  | "taken_over"
  | "invalid_url"
  | "no_url";

export type SocketError = {
  code: SocketErrorCode;
  title: string;
  message: string;
  hint: string;
  url: string;
  attempts: number;
  at: number;
};

const ERROR_TEXT: Record<SocketErrorCode, { title: string; message: string; hint: string }> = {
  unreachable: {
    title: "Når inte styrservern",
    message:
      "Webbläsaren får ingen kontakt med bilens WebSocket-server. Servern kan vara stoppad, fel adress eller blockerad av nätverket.",
    hint: "Kontrollera på Pi:n: sudo systemctl status rc-car-server",
  },
  dropped: {
    title: "Anslutningen bröts",
    message:
      "Kontakten med bilen tappades. Bilen går automatiskt till nödstopp (neutral gas och styrning) via serverns watchdog.",
    hint: "Kolla WiFi-signalen och: sudo journalctl -u rc-car-server -n 30",
  },
  busy: {
    title: "Bilen är upptagen",
    message: "En annan klient styr redan bilen. Servern tillåter bara en förare i taget.",
    hint: "Stäng den andra fliken/enheten och försök igen.",
  },
  taken_over: {
    title: "Styrningen övertagen",
    message: "En annan klient tog över styrningen av bilen.",
    hint: "Tryck Försök ansluta igen för att ta tillbaka kontrollen.",
  },
  invalid_url: {
    title: "Ogiltig WebSocket-adress",
    message: "Adressen kunde inte tolkas som en WebSocket-adress.",
    hint: "Adressen ska börja med ws:// eller wss://, t.ex. ws://192.168.1.50:81",
  },
  no_url: {
    title: "Ingen WebSocket-adress",
    message: "Det finns ingen adress till bilens styrserver.",
    hint: "Ange adressen under Inställningar.",
  },
};

const initialHealth: SocketHealth = {
  attempts: 0,
  totalConnects: 0,
  totalDisconnects: 0,
  connectedSince: null,
  nextRetryAt: null,
  retryDelay: 0,
  messagesReceived: 0,
  commandsSent: 0,
  lastMessageAt: null,
  pingMin: null,
  pingAvg: null,
  pingMax: null,
  jitter: null,
  packetLoss: 0,
};

let logId = 0;

export function useCarSocket({ url, enabled, demoMode }: Options) {
  const [connection, setConnection] = useState<ConnectionState>("disconnected");
  const [status, setStatus] = useState<CarStatus>({});
  const [ping, setPing] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [health, setHealth] = useState<SocketHealth>(initialHealth);
  const [manualNonce, setManualNonce] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);
  const commandRef = useRef<DriveCommand>({ throttle: 0, steering: 0 });
  const lastSentRef = useRef<string>("");
  const retryRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pingHistoryRef = useRef<number[]>([]);
  const pingsSentRef = useRef(0);
  const pongsRef = useRef(0);

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

  const recordPing = useCallback((rtt: number) => {
    setPing(rtt);
    const hist = pingHistoryRef.current;
    hist.push(rtt);
    if (hist.length > PING_HISTORY) hist.shift();
    const avg = hist.reduce((a, b) => a + b, 0) / hist.length;
    const jitter =
      hist.length > 1
        ? hist.slice(1).reduce((a, v, i) => a + Math.abs(v - hist[i]!), 0) / (hist.length - 1)
        : 0;
    setHealth((h) => ({
      ...h,
      pingMin: Math.min(...hist),
      pingMax: Math.max(...hist),
      pingAvg: Math.round(avg),
      jitter: Math.round(jitter),
    }));
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

  const reconnectNow = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    retryRef.current = 0;
    socketRef.current?.close();
    socketRef.current = null;
    setHealth((h) => ({ ...h, nextRetryAt: null, retryDelay: 0, attempts: 0 }));
    setManualNonce((n) => n + 1);
  }, []);

  // --- Demo mode: simulated vehicle -----------------------------------
  useEffect(() => {
    if (!demoMode || !enabled) return;
    setConnection("connecting");
    log("info", "Demoläge startat – simulerad bil");
    const start = setTimeout(() => {
      setConnection("connected");
      setHealth((h) => ({
        ...h,
        attempts: 0,
        totalConnects: h.totalConnects + 1,
        connectedSince: Date.now(),
        nextRetryAt: null,
      }));
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
      pingsSentRef.current += 1;
      pongsRef.current += 1;
      recordPing(18 + Math.round(Math.random() * 14));
      setHealth((h) => ({
        ...h,
        messagesReceived: h.messagesReceived + 1,
        commandsSent: h.commandsSent + 1,
        lastMessageAt: Date.now(),
      }));
    }, 400);
    return () => {
      clearTimeout(start);
      clearInterval(tick);
      setConnection("disconnected");
      setHealth((h) => ({ ...h, connectedSince: null }));
    };
  }, [demoMode, enabled, log, recordPing]);

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
      setHealth((h) => ({ ...h, nextRetryAt: null }));
      log(
        "info",
        retryRef.current > 0
          ? `Återansluter till ${url} (försök ${retryRef.current + 1})`
          : `Ansluter till ${url}`,
      );
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
        pingHistoryRef.current = [];
        pingsSentRef.current = 0;
        pongsRef.current = 0;
        setConnection("connected");
        setHealth((h) => ({
          ...h,
          attempts: 0,
          retryDelay: 0,
          nextRetryAt: null,
          totalConnects: h.totalConnects + 1,
          connectedSince: Date.now(),
          packetLoss: 0,
        }));
        log("info", "Anslutning upprättad");
      };
      sock.onmessage = (event) => {
        setHealth((h) => ({
          ...h,
          messagesReceived: h.messagesReceived + 1,
          lastMessageAt: Date.now(),
        }));
        try {
          const data = JSON.parse(String(event.data));
          if (data.pong) {
            pongsRef.current += 1;
            recordPing(Math.round(Date.now() - Number(data.pong)));
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
        retryRef.current += 1;
        const delay = Math.min(BASE_RETRY_DELAY * 2 ** (retryRef.current - 1), MAX_RETRY_DELAY);
        setHealth((h) => ({
          ...h,
          attempts: retryRef.current,
          totalDisconnects: h.totalDisconnects + 1,
          connectedSince: null,
          retryDelay: delay,
          nextRetryAt: Date.now() + delay,
        }));
        log("warn", `Anslutningen bröts – nytt försök om ${Math.round(delay / 1000)} s`);
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
  }, [url, enabled, demoMode, log, recordPing, manualNonce]);

  // --- Continuous command loop + ping ----------------------------------
  useEffect(() => {
    if (demoMode) return;
    const interval = setInterval(() => {
      const payload = JSON.stringify(commandRef.current);
      if (payload !== lastSentRef.current) {
        if (sendJson(commandRef.current)) {
          lastSentRef.current = payload;
          setHealth((h) => ({ ...h, commandsSent: h.commandsSent + 1 }));
        }
      }
    }, SEND_INTERVAL);
    const heartbeat = setInterval(() => {
      if (sendJson({ ...commandRef.current, ping: Date.now() })) {
        pingsSentRef.current += 1;
        const sent = pingsSentRef.current;
        const lost = Math.max(0, sent - pongsRef.current - 1);
        setHealth((h) => ({
          ...h,
          commandsSent: h.commandsSent + 1,
          packetLoss: sent > 1 ? Math.round((lost / sent) * 100) : 0,
        }));
      }
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

  return { connection, status, ping, logs, health, setCommand, sendAction, log, reconnectNow };
}
