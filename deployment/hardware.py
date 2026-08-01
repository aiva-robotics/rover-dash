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

    # alias
    fail_safe = neutral
