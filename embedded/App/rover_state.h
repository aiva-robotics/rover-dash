#ifndef ROVER_STATE_H
#define ROVER_STATE_H

#include <stdbool.h>
#include <stdint.h>

typedef struct
{
  uint32_t uptime_ms;

  float battery_voltage;
  float battery_current;
  float motor_temperature;

  float vehicle_speed;

  int16_t steering_command;
  int16_t throttle_command;

  bool rpi_connected;
  bool failsafe_active;
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
} rover_diag_t;

#endif
