import { useCallback, useEffect, useRef, useState } from "react";
import type { CarStatus, ConnectionState, DriveCommand, LogEntry } from "@/lib/car-protocol";
import { translate, type TFunc, type TKey, type TVars } from "@/lib/i18n";

const SEND_INTERVAL = 50; // ms -> 20 Hz, måste vara snabbare än serverns watchdog
const PING_INTERVAL = 1000;
const UI_FLUSH_INTERVAL = 250; // ms -> 4 Hz uppdatering av React-state
const MAX_LOGS = 60;
const MAX_RETRY_DELAY = 15000;
const BASE_RETRY_DELAY = 1000;
const PING_HISTORY = 20;
// Om ingen pong kommer inom denna tid är länken "halvöppen" (t.ex. WiFi borta
// utan TCP-FIN). Då tvingar vi fram en omkoppling istället för att låtsas att
// bilen fortfarande lyssnar.
const PONG_TIMEOUT = 3500;

type Options = {
  url: string;
  /** Delad hemlighet – skickas i WebSocket-handskakningen, aldrig i URL:en. */
  token?: string;
  enabled: boolean;
  demoMode: boolean;
  /** Översättningsfunktion – styr språket i loggar och felmeddelanden. */
  t?: TFunc;
  /** Locale för tidsstämplar i loggen. */
  locale?: string;
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
  | "stale"
  | "busy"
  | "taken_over"
  | "unauthorized"
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

/** Stabilt ID per flik – gör att egen återanslutning inte ser ut som övertagning. */
let cachedSessionId: string | null = null;
export function sessionId(): string {
  if (cachedSessionId) return cachedSessionId;
  let id = "";
  try {
    id = window.sessionStorage.getItem("rc-session-id") ?? "";
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.sessionStorage.setItem("rc-session-id", id);
    }
  } catch {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  cachedSessionId = id;
  return id;
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function useCarSocket({
  url,
  token = "",
  enabled,
  demoMode,
  t: tProp,
  locale = "en-GB",
}: Options) {
  const tRef = useRef<TFunc>(tProp ?? ((key, vars) => translate("en", key, vars)));
  tRef.current = tProp ?? ((key, vars) => translate("en", key, vars));
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const [connection, setConnection] = useState<ConnectionState>("disconnected");
  const [status, setStatus] = useState<CarStatus>({});
  const [ping, setPing] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [health, setHealth] = useState<SocketHealth>(initialHealth);
  const [manualNonce, setManualNonce] = useState(0);
  const [lastError, setLastError] = useState<SocketError | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const commandRef = useRef<DriveCommand>({ throttle: 0, steering: 0, estop: false });
  const retryRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pingHistoryRef = useRef<number[]>([]);
  const pingsSentRef = useRef(0);
  const pongsRef = useRef(0);
  const openedRef = useRef(false);
  const lastPongRef = useRef(0);
  const serverErrorRef = useRef<SocketErrorCode | null>(null);

  // Buffrad UI-state: telemetri och statistik uppdateras i refs och
  // flushas till React med 4 Hz så att 20 Hz-trafiken inte renderar om appen.
  const statusRef = useRef<CarStatus>({});
  const healthRef = useRef<SocketHealth>(initialHealth);
  const pingRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);

  const patchHealth = useCallback((patch: Partial<SocketHealth>) => {
    healthRef.current = { ...healthRef.current, ...patch };
    dirtyRef.current = true;
  }, []);

  /** Flusha direkt vid viktiga tillståndsbyten (anslut/avbrott). */
  const flushNow = useCallback(() => {
    dirtyRef.current = false;
    setHealth(healthRef.current);
    setStatus(statusRef.current);
    setPing(pingRef.current);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      setHealth(healthRef.current);
      setStatus(statusRef.current);
      setPing(pingRef.current);
    }, UI_FLUSH_INTERVAL);
    return () => clearInterval(id);
  }, []);

  const raiseError = useCallback((code: SocketErrorCode, targetUrl: string, attempts: number) => {
    const tr = tRef.current;
    setLastError({
      code,
      title: tr(`err.${code}.title` as TKey),
      message: tr(`err.${code}.message` as TKey),
      hint: tr(`err.${code}.hint` as TKey),
      url: targetUrl,
      attempts,
      at: Date.now(),
    });
  }, []);

  const log = useCallback((level: LogEntry["level"], message: string) => {
    setLogs((prev) =>
      [
        {
          id: ++logId,
          time: new Date().toLocaleTimeString(localeRef.current),
          level,
          message,
        },
        ...prev,
      ].slice(0, MAX_LOGS),
    );
  }, []);

  /** Loggar en översatt nyckel – språket avgörs vid loggtillfället. */
  const logKey = useCallback(
    (level: LogEntry["level"], key: TKey, vars?: TVars) => {
      log(level, tRef.current(key, vars));
    },
    [log],
  );

  const recordPing = useCallback(
    (rtt: number) => {
      pingRef.current = rtt;
      lastPongRef.current = Date.now();
      const hist = pingHistoryRef.current;
      hist.push(rtt);
      if (hist.length > PING_HISTORY) hist.shift();
      const avg = hist.reduce((a, b) => a + b, 0) / hist.length;
      const jitter =
        hist.length > 1
          ? hist.slice(1).reduce((a, v, i) => a + Math.abs(v - hist[i]!), 0) / (hist.length - 1)
          : 0;
      patchHealth({
        pingMin: Math.min(...hist),
        pingMax: Math.max(...hist),
        pingAvg: Math.round(avg),
        jitter: Math.round(jitter),
      });
    },
    [patchHealth],
  );

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
    serverErrorRef.current = null;
    setLastError(null);
    patchHealth({ nextRetryAt: null, retryDelay: 0, attempts: 0 });
    flushNow();
    setManualNonce((n) => n + 1);
  }, [patchHealth, flushNow]);

  // --- Demo mode: simulated vehicle -----------------------------------
  useEffect(() => {
    if (!demoMode || !enabled) return;
    setConnection("connecting");
    setLastError(null);
    logKey("info", "logmsg.demoStarted");
    const start = setTimeout(() => {
      setConnection("connected");
      patchHealth({
        attempts: 0,
        totalConnects: healthRef.current.totalConnects + 1,
        connectedSince: Date.now(),
        nextRetryAt: null,
      });
      flushNow();
      logKey("info", "logmsg.demoConnected");
    }, 600);
    const tick = setInterval(() => {
      const t = Date.now() / 1000;
      statusRef.current = {
        ...statusRef.current,
        battery: 11.4 + Math.sin(t / 20) * 0.35,
        rssi: -55 + Math.round(Math.sin(t / 7) * 8),
        speed: Math.abs(commandRef.current.throttle) * 0.32,
        temperature: 31 + Math.sin(t / 30) * 2,
        heading: (t * 6) % 360,
        estop: commandRef.current.estop ?? false,
      };
      pingsSentRef.current += 1;
      pongsRef.current += 1;
      recordPing(18 + Math.round(Math.random() * 14));
      patchHealth({
        messagesReceived: healthRef.current.messagesReceived + 1,
        commandsSent: healthRef.current.commandsSent + 1,
        lastMessageAt: Date.now(),
      });
    }, 400);
    return () => {
      clearTimeout(start);
      clearInterval(tick);
      setConnection("disconnected");
      patchHealth({ connectedSince: null });
      flushNow();
    };
  }, [demoMode, enabled, manualNonce, log, recordPing, patchHealth, flushNow]);

  // --- Real WebSocket --------------------------------------------------
  useEffect(() => {
    if (demoMode) {
      // Demoeffekten äger anslutningsstatusen i demoläge.
      return;
    }
    if (!enabled) {
      setConnection("disconnected");
      return;
    }

    if (!url) {
      setConnection("disconnected");
      raiseError("no_url", "", 0);
      return;
    }
    let closed = false;

    const connect = () => {
      if (closed) return;
      setConnection("connecting");
      patchHealth({ nextRetryAt: null });
      if (retryRef.current > 0) {
        logKey("info", "logmsg.reconnectingTo", { url, n: retryRef.current + 1 });
      } else {
        logKey("info", "logmsg.connecting", { url });
      }
      let sock: WebSocket;
      openedRef.current = false;
      serverErrorRef.current = null;
      try {
        const protocols = ["rc-control", `rc-session.${toBase64Url(sessionId())}`];
        if (token) protocols.push(`rc-token.${toBase64Url(token)}`);
        sock = new WebSocket(url, protocols);
      } catch {
        logKey("error", "logmsg.invalidUrl");
        raiseError("invalid_url", url, retryRef.current);
        setConnection("disconnected");
        return;
      }
      socketRef.current = sock;

      sock.onopen = () => {
        retryRef.current = 0;
        openedRef.current = true;
        pingHistoryRef.current = [];
        pingsSentRef.current = 0;
        pongsRef.current = 0;
        lastPongRef.current = Date.now();
        setConnection("connected");
        setLastError(null);
        patchHealth({
          attempts: 0,
          retryDelay: 0,
          nextRetryAt: null,
          totalConnects: healthRef.current.totalConnects + 1,
          connectedSince: Date.now(),
          packetLoss: 0,
        });
        flushNow();
        logKey("info", "logmsg.connected");
      };
      sock.onmessage = (event) => {
        patchHealth({
          messagesReceived: healthRef.current.messagesReceived + 1,
          lastMessageAt: Date.now(),
        });
        try {
          const data = JSON.parse(String(event.data));
          if (data.pong) {
            pongsRef.current += 1;
            recordPing(Math.round(Date.now() - Number(data.pong)));
            return;
          }
          if (data.photo) {
            if (data.photo.ok) {
              logKey("info", "logmsg.photoSavedCar", { path: String(data.photo.path ?? "") });
            } else {
              logKey("error", "logmsg.photoFailedCar");
            }
            return;
          }
          if (
            data.error === "busy" ||
            data.error === "taken_over" ||
            data.error === "unauthorized"
          ) {
            serverErrorRef.current = data.error;
            log("error", String(data.message ?? data.error));
            raiseError(data.error, url, retryRef.current);
            return;
          }
          statusRef.current = { ...statusRef.current, ...data };
        } catch {
          logKey("warn", "logmsg.parseFailed");
        }
      };
      sock.onerror = () => logKey("error", "logmsg.wsError");
      sock.onclose = (event) => {
        socketRef.current = null;
        setConnection("disconnected");
        pingRef.current = null;
        if (closed) return;
        // 4005 = servern ersatte en gammal anslutning från samma flik – tyst omstart.
        if (event.code === 4005) {
          timersRef.current.push(setTimeout(connect, 200));
          return;
        }
        retryRef.current += 1;
        const delay = Math.min(BASE_RETRY_DELAY * 2 ** (retryRef.current - 1), MAX_RETRY_DELAY);
        patchHealth({
          attempts: retryRef.current,
          totalDisconnects: healthRef.current.totalDisconnects + 1,
          connectedSince: null,
          retryDelay: delay,
          nextRetryAt: Date.now() + delay,
        });
        flushNow();
        const code: SocketErrorCode =
          serverErrorRef.current ?? (openedRef.current ? "dropped" : "unreachable");
        raiseError(code, url, retryRef.current);
        logKey("warn", "logmsg.dropped", { s: Math.round(delay / 1000) });
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
  }, [
    url,
    token,
    enabled,
    demoMode,
    logKey,
    recordPing,
    manualNonce,
    raiseError,
    patchHealth,
    flushNow,
  ]);

  // --- Continuous command loop + ping ----------------------------------
  // Kommandot skickas ALLTID med 20 Hz (även oförändrat) eftersom serverns
  // watchdog går till neutral efter 500 ms utan inkommande kommando.
  useEffect(() => {
    if (demoMode) return;
    const interval = setInterval(() => {
      if (sendJson(commandRef.current)) {
        patchHealth({ commandsSent: healthRef.current.commandsSent + 1 });
      }
    }, SEND_INTERVAL);
    const heartbeat = setInterval(() => {
      const sock = socketRef.current;
      // Halvöppen anslutning: öppen socket men inga pong-svar.
      if (
        sock &&
        sock.readyState === WebSocket.OPEN &&
        lastPongRef.current > 0 &&
        Date.now() - lastPongRef.current > PONG_TIMEOUT
      ) {
        logKey("error", "logmsg.noPong");
        serverErrorRef.current = "stale";
        lastPongRef.current = 0;
        sock.close();
        return;
      }
      if (sendJson({ ping: Date.now() })) {
        pingsSentRef.current += 1;
        const sent = pingsSentRef.current;
        const lost = Math.max(0, sent - pongsRef.current - 1);
        patchHealth({
          packetLoss: sent > 1 ? Math.round((lost / sent) * 100) : 0,
        });
      }
    }, PING_INTERVAL);
    return () => {
      clearInterval(interval);
      clearInterval(heartbeat);
    };
  }, [sendJson, demoMode, patchHealth, logKey]);

  const sendAction = useCallback(
    (action: string, value?: unknown) => {
      logKey("info", "logmsg.command", {
        cmd: `${action}${value !== undefined ? ` = ${String(value)}` : ""}`,
      });
      if (demoMode) return true;
      const ok = sendJson({ action, value });
      if (!ok) logKey("error", "logmsg.commandFailed", { action });
      return ok;
    },
    [sendJson, logKey, demoMode],
  );

  return {
    connection,
    status,
    ping,
    logs,
    health,
    lastError,
    setCommand,
    sendAction,
    log,
    reconnectNow,
  };
}
