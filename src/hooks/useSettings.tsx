import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Settings = {
  wsUrl: string;
  videoUrl: string;
  maxSpeed: number; // percent
  sensitivity: number; // 0.5 - 2
  invertSteering: boolean;
  invertThrottle: boolean;
  demoMode: boolean;
};

export const defaultSettings: Settings = {
  wsUrl: "ws://192.168.4.1:81",
  videoUrl: "http://192.168.4.1:81/stream",
  maxSpeed: 100,
  sensitivity: 1,
  invertSteering: false,
  invertThrottle: false,
  demoMode: true,
};

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
      if (raw) setSettings({ ...defaultSettings, ...JSON.parse(raw) });
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
