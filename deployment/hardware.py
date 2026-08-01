"""RC-PWM-utgångar för styrservo och ESC via pigpio.

Mappar appens -100..100 till pulsbredder i mikrosekunder (1000-2000 us @ 50 Hz).
"""

from __future__ import annotations

import logging
import time

import config

log = logging.getLogger("hardware")


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def percent_to_us(percent: float, min_us: int, mid_us: int, max_us: int) -> int:
    """-100 -> min_us, 0 -> mid_us, 100 -> max_us (asymmetriska ändlägen stöds)."""
    p = clamp(percent, -100.0, 100.0)
    if p >= 0:
        return int(round(mid_us + (max_us - mid_us) * (p / 100.0)))
    return int(round(mid_us + (mid_us - min_us) * (p / 100.0)))


class _SimPi:
    """Fallback när pigpio saknas – loggar bara pulserna."""

    connected = True

    def set_mode(self, *_args):  # noqa: D102
        pass

    def set_PWM_frequency(self, *_args):  # noqa: D102
        pass

    def set_servo_pulsewidth(self, gpio, us):  # noqa: D102
        log.debug("SIM gpio=%s pulse=%sus", gpio, us)

    def write(self, gpio, level):  # noqa: D102
        log.debug("SIM gpio=%s level=%s", gpio, level)

    def stop(self):  # noqa: D102
        pass


class RCOutputs:
    """Två RC-utgångar: styrservo och ESC."""

    def __init__(self) -> None:
        self.simulated = config.SIMULATE
        self.pi = None
        self.armed = False
        self.last_steering_us = config.STEERING_MID_US
        self.last_esc_us = config.ESC_MID_US

    # -- livscykel ---------------------------------------------------------
    def connect(self) -> None:
        if self.simulated:
            self.pi = _SimPi()
            log.warning("Kör i SIMULERAT läge – inga riktiga PWM-signaler")
        else:
            try:
                import pigpio  # type: ignore
            except ImportError as exc:  # pragma: no cover
                raise RuntimeError(
                    "pigpio saknas. Installera med: sudo apt-get install -y pigpio python3-pigpio"
                ) from exc
            pi = pigpio.pi()
            if not pi.connected:
                raise RuntimeError(
                    "Kan inte nå pigpiod. Starta med: sudo systemctl enable --now pigpiod"
                )
            self.pi = pi
            self.pi.set_mode(config.STEERING_GPIO, pigpio.OUTPUT)
            self.pi.set_mode(config.ESC_GPIO, pigpio.OUTPUT)
            for gpio in (config.LIGHTS_GPIO, config.HORN_GPIO):
                if gpio >= 0:
                    self.pi.set_mode(gpio, pigpio.OUTPUT)

        self.pi.set_PWM_frequency(config.STEERING_GPIO, config.PWM_FREQUENCY)
        self.pi.set_PWM_frequency(config.ESC_GPIO, config.PWM_FREQUENCY)
        self.neutral()
        log.info(
            "PWM aktiv: styrservo GPIO %s, ESC GPIO %s @ %s Hz",
            config.STEERING_GPIO,
            config.ESC_GPIO,
            config.PWM_FREQUENCY,
        )

    def arm(self) -> None:
        """Håll neutral en stund så att ESC:n armerar."""
        self.neutral()
        log.info("Armerar ESC (%.1f s neutral)…", config.ARM_SECONDS)
        time.sleep(config.ARM_SECONDS)
        self.armed = True
        log.info("ESC armerad")

    def close(self) -> None:
        try:
            self.accessories_off()
            self.neutral()
            time.sleep(0.1)
            if self.pi:
                self.pi.set_servo_pulsewidth(config.STEERING_GPIO, 0)
                self.pi.set_servo_pulsewidth(config.ESC_GPIO, 0)
                self.pi.stop()
        except Exception:  # pragma: no cover
            log.exception("Fel vid nedstängning av PWM")
        finally:
            self.pi = None
            self.armed = False

    # -- styrning ----------------------------------------------------------
    def apply(self, throttle: float, steering: float) -> None:
        if self.pi is None:
            return
        if abs(throttle) < config.ESC_DEADBAND:
            throttle = 0.0
        steering_us = percent_to_us(
            steering, config.STEERING_MIN_US, config.STEERING_MID_US, config.STEERING_MAX_US
        )
        esc_us = percent_to_us(throttle, config.ESC_MIN_US, config.ESC_MID_US, config.ESC_MAX_US)
        if steering_us != self.last_steering_us:
            self.pi.set_servo_pulsewidth(config.STEERING_GPIO, steering_us)
            self.last_steering_us = steering_us
        if esc_us != self.last_esc_us:
            self.pi.set_servo_pulsewidth(config.ESC_GPIO, esc_us)
            self.last_esc_us = esc_us

    def neutral(self) -> None:
        """Failsafe: båda utgångarna till neutralt läge."""
        if self.pi is None:
            return
        self.pi.set_servo_pulsewidth(config.STEERING_GPIO, config.STEERING_MID_US)
        self.pi.set_servo_pulsewidth(config.ESC_GPIO, config.ESC_MID_US)
        self.last_steering_us = config.STEERING_MID_US
        self.last_esc_us = config.ESC_MID_US

    # -- tillbehör ---------------------------------------------------------
    def _write(self, gpio: int, on: bool, active_low: bool) -> None:
        if self.pi is None or gpio < 0:
            return
        level = (0 if on else 1) if active_low else (1 if on else 0)
        try:
            self.pi.write(gpio, level)
        except Exception:  # pragma: no cover
            log.exception("Kunde inte skriva GPIO %s", gpio)

    def set_lights(self, on: bool) -> None:
        self._write(config.LIGHTS_GPIO, on, config.LIGHTS_ACTIVE_LOW)
        log.info("Strålkastare GPIO %s -> %s", config.LIGHTS_GPIO, on)

    def horn(self, seconds: float | None = None) -> None:
        """Blockerande pip – anropas via executor så event-loopen inte hakar upp sig."""
        duration = config.HORN_SECONDS if seconds is None else float(seconds)
        self._write(config.HORN_GPIO, True, config.HORN_ACTIVE_LOW)
        time.sleep(max(0.05, min(3.0, duration)))
        self._write(config.HORN_GPIO, False, config.HORN_ACTIVE_LOW)

    def accessories_off(self) -> None:
        self._write(config.LIGHTS_GPIO, False, config.LIGHTS_ACTIVE_LOW)
        self._write(config.HORN_GPIO, False, config.HORN_ACTIVE_LOW)

    # alias
    fail_safe = neutral
