export type DriveCommand = {
  throttle: number; // -100..100
  steering: number; // -100..100
  /** Nödstopp ingår i varje kommando så att servern alltid vet läget. */
  estop?: boolean;
  /** Digitala utgångar, bitmask 0..15 (bit 0 = ljus). */
  digital?: number;
  /** Summerfrekvens i Hz, 0 = tyst. */
  buzzer?: number;
};

/** Digital utgång (bit) för strålkastare på STM32-kortet. */
export const DIGITAL_LIGHTS_BIT = 0x01;
/** Frekvens som skickas till summern när tutan är aktiv. */
export const HORN_FREQUENCY_HZ = 2000;

/** Skalar appens -100..100 till STM32-kortets RC-område -1000..1000. */
export function toRcValue(value: number) {
  return Math.round(clamp(value, -100, 100) * 10);
}

/**
 * Bygger serverns kommandopaket.
 * Kanal 1 (index 0) = styrning, kanal 3 (index 2) = gas.
 */
export function toServerCommand(cmd: DriveCommand) {
  return {
    rc: [toRcValue(cmd.steering), 0, toRcValue(cmd.throttle), 0],
    digital: cmd.digital ?? 0,
    buzzer: cmd.buzzer ?? 0,
    estop: cmd.estop ?? false,
  };
}

export type CarStatus = {
  battery?: number; // volts
  batteryPercent?: number;
  rssi?: number; // dBm
  speed?: number; // km/h
  temperature?: number; // celsius
  heading?: number; // degrees, future IMU
  recording?: boolean;
  headlights?: boolean;
  /** Serverns bekräftade nödstoppsläge. */
  estop?: boolean;
  armed?: boolean;
  failsafe?: boolean;
  /** Rå eko-telemetri från STM32-kortet. */
  stm32?: {
    rc?: number[];
    digitalMask?: number;
    buzzerHz?: number;
    failsafeCount?: number;
    uptimeMs?: number;
    [key: string]: unknown;
  };
  /** Vem som styr just nu, enligt servern. */
  driver?: {
    session?: string | null;
    label?: string | null;
    /** Epoch ms när nuvarande förare tog kontrollen. */
    since?: number | null;
    /** Epoch ms för senaste övertagande mellan olika förare. */
    handover?: number | null;
  };
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
