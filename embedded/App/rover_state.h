#ifndef ROVER_STATE_H
#define ROVER_STATE_H

#include <stdbool.h>
#include <stdint.h>

#define ROVER_ANALOG_INPUT_COUNT 4u

typedef struct
{
  uint32_t uptime_ms;

  uint16_t analog_input_raw[ROVER_ANALOG_INPUT_COUNT];
  uint16_t ntc_temperature_raw;
  int16_t tmp75_temperature_centi_c;
  bool tmp75_temperature_valid;
  uint16_t ina226_bus_voltage_mv;
  int16_t ina226_current_ma;
  bool ina226_valid;

  float battery_voltage;
  float battery_current;
  float motor_temperature;

  float vehicle_speed;

  int16_t rc_command[4];
  uint8_t digital_output_mask;
  uint16_t buzzer_frequency_hz;

  bool rpi_connected;
  bool rpi_power_enabled;
  bool rpi_poweroff_ok;
  bool rpi_shutdown_requested;
  bool failsafe_active;
  uint8_t rpi_status;
} rover_state_t;

typedef struct
{
  uint32_t uart_rx_frames;
  uint32_t uart_crc_errors;
  uint32_t uart_cobs_errors;
  uint32_t uart_length_errors;
  uint32_t uart_type_errors;
  uint32_t uart_overruns;

  uint32_t adc1_scan_count;

  uint32_t i2c_errors;

  uint32_t speed_captures;
  uint32_t speed_timeouts;

  uint32_t failsafe_count;
  uint32_t rpi_shutdown_requests;
  uint32_t rpi_forced_poweroffs;
} rover_diag_t;

#endif
