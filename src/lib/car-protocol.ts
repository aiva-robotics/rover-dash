export type DriveCommand = {
  throttle: number; // -100..100
  steering: number; // -100..100
};

export type CarStatus = {
  battery?: number; // volts
  batteryPercent?: number;
  rssi?: number; // dBm
  speed?: number; // km/h
  temperature?: number; // celsius
  heading?: number; // degrees, future IMU
  recording?: boolean;
  headlights?: boolean;
};

export type ConnectionState = "connecting" | "connected" | "disconnected";

export type LogEntry = {
  id: number;
  time: string;
  level: "info" | "warn" | "error";
  message: string;
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Rough battery percentage for a 3S LiPo pack (9.0V empty -> 12.6V full). */
export function voltageToPercent(volts: number) {
  return Math.round(clamp(((volts - 9) / (12.6 - 9)) * 100, 0, 100));
}

/** WiFi signal strength (dBm) to 0-100. */
export function rssiToPercent(rssi: number) {
  return Math.round(clamp(((rssi + 100) / 60) * 100, 0, 100));
}
