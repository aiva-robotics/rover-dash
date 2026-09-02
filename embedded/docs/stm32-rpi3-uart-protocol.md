# Rover Dash STM32 to Raspberry Pi 3 UART Protocol

This document describes the UART protocol used between the Rover Dash STM32 controller and a Raspberry Pi 3. It is intended as an architectural reference for reimplementing the Raspberry Pi side in another language, runtime, or application.

## Purpose

The Raspberry Pi is the high-level controller. The STM32 is the real-time I/O controller.

The Raspberry Pi sends control commands to the STM32 for:

- 4 generic RC PWM outputs
- 4 digital outputs
- Buzzer frequency
- Optional OLED framebuffer content

The STM32 sends status and telemetry back to the Raspberry Pi containing:

- Command echo
- Failsafe state
- Raspberry Pi power-management state
- ADC values
- NTC raw value
- TMP75 temperature
- Speed sensor value
- INA226 voltage and current

The STM32 can also send a shutdown request to the Raspberry Pi.

## Physical Link

```text
UART:        115200 baud
Data bits:   8
Parity:      none
Stop bits:   1
Flow control: none
Framing:     COBS + 0x00 delimiter
```

Each UART frame is COBS encoded and terminated with byte `0x00`.

## Packet Format Before COBS

Before COBS encoding, every packet has this format:

```text
byte 0:       message type
byte 1:       payload length
bytes 2..N:   payload
last 2 bytes: CRC16-CCITT, little-endian
```

The CRC is calculated over:

```text
message type + payload length + payload
```

CRC settings:

```text
CRC16-CCITT
Polynomial: 0x1021
Initial value: 0xFFFF
Output byte order: little-endian
```

## Message Types

```text
0x01 CONTROL       Raspberry Pi -> STM32
0x02 RPI_SHUTDOWN  STM32 -> Raspberry Pi
0x03 DISPLAY_DATA  Raspberry Pi -> STM32
0x04 DISPLAY_UPDATE Raspberry Pi -> STM32
0x80 STATUS        STM32 -> Raspberry Pi
0x81 DIAGNOSTICS   Reserved/optional
```

## CONTROL Packet

Direction:

```text
Raspberry Pi -> STM32
```

Message type:

```text
0x01
```

Payload length:

```text
11 bytes
```

Payload layout:

```text
0-1:  RC Output 0, int16 little-endian, range -1000..1000, maps to PA11
2-3:  RC Output 1, int16 little-endian, range -1000..1000, maps to PA10
4-5:  RC Output 2, int16 little-endian, range -1000..1000, maps to PA9
6-7:  RC Output 3, int16 little-endian, range -1000..1000, maps to PA8
8:    digital output bitmask, uint8
9-10: buzzer frequency Hz, uint16 little-endian
```

Digital output bitmask:

```text
bit 0: Digital Output 0, PA6
bit 1: Digital Output 1, PA7
bit 2: Digital Output 2, PB0
bit 3: Digital Output 3, PB1
```

Buzzer behavior:

```text
0 Hz:  buzzer off
>0 Hz: buzzer on at requested frequency
```

RC output scaling on STM32:

```text
-1000 -> 1000 us pulse
0     -> 1500 us pulse
+1000 -> 2000 us pulse
```

The Raspberry Pi should send `CONTROL` periodically while active. A good default rate is `20 Hz`. The STM32 output failsafe timeout is currently `1000 ms`; if no valid `CONTROL` packet is received within that time, RC outputs return to neutral, digital outputs turn off, and the buzzer turns off.

## RPI_SHUTDOWN Packet

Direction:

```text
STM32 -> Raspberry Pi
```

Message type:

```text
0x02
```

Payload length:

```text
0 bytes
```

Meaning:

The STM32 requests that the Raspberry Pi shut down cleanly.

The Raspberry Pi should respond by starting its OS shutdown sequence. Before final poweroff, the Raspberry Pi should assert its shutdown-ready signal connected to:

```text
STM32 input:       RPI_POWER_OFF_OK
Raspberry Pi GPIO: GPIO26
```

The STM32 then disables `REG_5V_EN` and removes Raspberry Pi power.

## OLED Ownership And Framebuffer Display

The STM32 owns the physical OLED display at all times. The Raspberry Pi must not access the OLED I2C bus directly. If the Raspberry Pi wants to draw on the OLED, it sends a complete 128x32 monochrome framebuffer over UART and the STM32 decides whether to show it.

The STM32 keeps two independent 512-byte framebuffers:

```text
local_framebuffer: STM32-generated status and warning display
rpi_framebuffer:   latest complete framebuffer received from Raspberry Pi
```

The OLED framebuffer is arranged as 4 pages of 128 bytes. Each byte represents one vertical column of 8 pixels, matching the SSD1306 page format.

At startup the active display source is always STM32/local. This lets the STM32 show local startup and power-management messages before the Raspberry Pi has booted.

Typical local STM32 messages include:

```text
ROVERCORE
STARTING...

RASPBERRY PI
BOOTING...

RASPBERRY PI
CONNECTED

RASPBERRY PI
SHUTDOWN

RASPBERRY PI
POWER OFF

POWER FAULT
PI DISABLED
```

### DISPLAY_DATA Packet

Direction:

```text
Raspberry Pi -> STM32
```

Message type:

```text
0x03
```

Payload layout:

```text
byte 0:     chunk number, 0..8
bytes 1..N: framebuffer data bytes
```

Chunk sizes:

```text
chunks 0..7: payload length 64 bytes, containing 63 framebuffer bytes
chunk 8:     payload length 9 bytes, containing 8 framebuffer bytes
```

For compatibility, the STM32 also accepts chunk `8` with payload length `64` and ignores padding beyond the final 8 framebuffer bytes.

The framebuffer byte offset for each chunk is:

```text
offset = chunk_number * 63
```

Receiving `DISPLAY_DATA` does not immediately change what is shown on the OLED. The STM32 only stores the data in `rpi_framebuffer`.

### DISPLAY_UPDATE Packet

Direction:

```text
Raspberry Pi -> STM32
```

Message type:

```text
0x04
```

Payload length:

```text
0 bytes
```

When `DISPLAY_UPDATE` is received, the STM32 shows `rpi_framebuffer` only if all 9 chunks have been received. Incomplete framebuffer transfers are ignored and the currently displayed source remains unchanged.

The Raspberry Pi does not need to retransmit the framebuffer after a temporary STM32 local display override. The STM32 keeps the latest valid Raspberry Pi framebuffer stored separately.

The Raspberry Pi should keep the periodic `CONTROL` stream running while sending display chunks. Display packets count as Raspberry Pi communication, but they do not refresh the output-control failsafe timer.

At `115200 baud`, one full-size encoded display chunk takes roughly `6 ms` on the UART line. The STM32 UART receive path is sized to accept a complete 9-chunk display burst, but the Raspberry Pi should still serialize writes in order and avoid overlapping writes from multiple async producers.

## STATUS Packet

Direction:

```text
STM32 -> Raspberry Pi
```

Message type:

```text
0x80
```

Payload length:

```text
56 bytes
```

Payload layout:

```text
0-3:   uptime_ms, uint32 little-endian

4-5:   RC Output 0 echo, int16 little-endian
6-7:   RC Output 1 echo, int16 little-endian
8-9:   RC Output 2 echo, int16 little-endian
10-11: RC Output 3 echo, int16 little-endian

12:    digital_output_mask, uint8
13:    failsafe_active, uint8 boolean
14-15: buzzer_frequency_hz, uint16 little-endian

16-19: uart_rx_frames, uint32 little-endian
20-23: uart_crc_errors, uint32 little-endian
24-27: failsafe_count, uint32 little-endian

28-29: rpi_connected, uint16 boolean little-endian
30:    rpi_power_enabled, uint8 boolean
31:    rpi_poweroff_ok, uint8 boolean
32:    rpi_shutdown_requested, uint8 boolean
33:    rpi_status, uint8

34-35: ADC PA0 raw, uint16 little-endian
36-37: ADC PA1 raw, uint16 little-endian
38-39: ADC PA2 raw, uint16 little-endian
40-41: ADC PA3 raw, uint16 little-endian

42-43: NTC PA4 raw, uint16 little-endian

44-45: TMP75 temperature, int16 little-endian, centi-Celsius
46:    TMP75 valid flag, uint8 boolean

47-50: speed_hz_x100, uint32 little-endian

51-52: INA226 bus voltage, uint16 little-endian, millivolts
53-54: INA226 current, int16 little-endian, milliamps
55:    INA226 valid flag, uint8 boolean
```

Display conversions:

```text
uptime_s = uptime_ms / 1000
tmp75_c = tmp75_centi_c / 100
speed_hz = speed_hz_x100 / 100
ina226_voltage_v = ina226_bus_voltage_mv / 1000
ina226_current_a = ina226_current_ma / 1000
```

`rpi_status` values:

```text
0: Boot delay
1: Waiting for ready
2: Running
3: Shutdown requested
4: Powered off
5: Forced off
```

## Startup And Power Behavior

On STM32 startup:

1. `REG_5V_EN` is held low.
2. STM32 waits approximately `100 ms`.
3. STM32 enables `REG_5V_EN`.
4. STM32 enters forced failsafe while waiting for the Raspberry Pi.
5. When the Raspberry Pi starts sending valid `CONTROL` packets, STM32 marks `rpi_connected` true.
6. Forced failsafe is released.

While in failsafe:

```text
RC outputs     -> neutral
digital outputs -> off
buzzer         -> off
```

## Shutdown Behavior

If the user presses the power button on STM32:

1. STM32 enters failsafe.
2. STM32 sends an `RPI_SHUTDOWN` packet.
3. STM32 repeats the shutdown packet until `RPI_POWER_OFF_OK` is detected.
4. Raspberry Pi should assert GPIO26 when it is safe to remove power.
5. STM32 disables `REG_5V_EN`.

If the user holds the power button for a long press, currently around `3000 ms`, the STM32 forces Raspberry Pi power off by disabling `REG_5V_EN`.

## Raspberry Pi Implementation Requirements

A Raspberry Pi implementation should:

1. Open UART at `115200 8N1`.
2. Read bytes continuously.
3. Split frames on `0x00`.
4. Ignore empty frames.
5. COBS-decode each frame.
6. Validate packet length.
7. Validate CRC.
8. Dispatch by message type.
9. Send `CONTROL` packets periodically while running.
10. Listen for `RPI_SHUTDOWN`.
11. On shutdown request, safely stop application logic and initiate OS shutdown.
12. Assert GPIO26 / `RPI_POWER_OFF_OK` before final poweroff if hardware and software allow it.

The Pi should treat invalid CRC, invalid COBS, or wrong payload length as protocol errors and ignore that frame.
