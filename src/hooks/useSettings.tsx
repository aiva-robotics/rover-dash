import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Settings = {
  wsUrl: string;
  /** Delad hemlighet (RC_TOKEN på Pi:n). Tom = ingen autentisering. */
  wsToken: string;
  videoUrl: string;
  maxSpeed: number; // percent
  sensitivity: number; // 0.5 - 2
  invertSteering: boolean;
  invertThrottle: boolean;
  demoMode: boolean;
};

export const defaultSettings: Settings = {
  wsUrl: "ws://raspberrypi.local:81",
  wsToken: "",
  videoUrl: "/camera/stream",
  maxSpeed: 100,
  sensitivity: 1,
  invertSteering: false,
  invertThrottle: false,
  demoMode: true,
};

/** Styrservern kör på samma Pi som webbappen – härled adressen från sidan. */
export function localWsUrl(): string {
  if (typeof window === "undefined") return defaultSettings.wsUrl;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname || "raspberrypi.local";
  return `${proto}//${host}:81`;
}

/**
 * Token skickas numera i WebSocket-handskakningen (Sec-WebSocket-Protocol)
 * istället för i URL:en, så att den inte hamnar i loggar eller proxyhistorik.
 */

const STORAGE_KEY = "rc-control-settings";


type Ctx = {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
  hydrated: boolean;
};

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setSettings({ ...defaultSettings, ...JSON.parse(raw) });
      } else {
        setSettings({ ...defaultSettings, wsUrl: localWsUrl() });
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);


  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings, hydrated]);

  const value = useMemo<Ctx>(
    () => ({
      settings,
      hydrated,
      update: (patch) => setSettings((s) => ({ ...s, ...patch })),
      reset: () => setSettings(defaultSettings),
    }),
    [settings, hydrated],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
