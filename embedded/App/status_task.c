#include "status_task.h"

#include "protocol.h"
#include "uart_task.h"

static rover_state_t *status_state;
static rover_diag_t *status_diag;

void status_task_init(rover_state_t *state, rover_diag_t *diag)
{
  status_state = state;
  status_diag = diag;
}

void status_task(void)
{
  uint8_t payload[PROTOCOL_STATUS_PAYLOAD_SIZE];
  uint8_t frame[PROTOCOL_MAX_FRAME_SIZE];
  size_t frame_length = 0u;
  uint32_t speed_hz_x100 = 0u;

  if ((status_state == 0) || (status_diag == 0))
  {
    return;
  }

  write_u32_le(&payload[0], status_state->uptime_ms);
  for (uint8_t output = 0u; output < PROTOCOL_CONTROL_RC_CHANNELS; output++)
  {
    write_u16_le(&payload[4u + (output * 2u)], (uint16_t)status_state->rc_command[output]);
  }
  payload[12] = status_state->digital_output_mask;
  payload[13] = status_state->failsafe_active ? 1u : 0u;
  write_u16_le(&payload[14], status_state->buzzer_frequency_hz);
  write_u32_le(&payload[16], status_diag->uart_rx_frames);
  write_u32_le(&payload[20], status_diag->uart_crc_errors);
  write_u32_le(&payload[24], status_diag->failsafe_count);
  write_u16_le(&payload[28], status_state->rpi_connected ? 1u : 0u);
  payload[30] = status_state->rpi_power_enabled ? 1u : 0u;
  payload[31] = status_state->rpi_poweroff_ok ? 1u : 0u;
  payload[32] = status_state->rpi_shutdown_requested ? 1u : 0u;
  payload[33] = status_state->rpi_status;
  for (uint8_t input = 0u; input < ROVER_ANALOG_INPUT_COUNT; input++)
  {
    write_u16_le(&payload[34u + (input * 2u)], status_state->analog_input_raw[input]);
  }
  write_u16_le(&payload[42], status_state->ntc_temperature_raw);
  write_u16_le(&payload[44], (uint16_t)status_state->tmp75_temperature_centi_c);
  payload[46] = status_state->tmp75_temperature_valid ? 1u : 0u;
  if (status_state->vehicle_speed > 0.0f)
  {
    speed_hz_x100 = (uint32_t)((status_state->vehicle_speed * 100.0f) + 0.5f);
  }
  write_u32_le(&payload[47], speed_hz_x100);
  write_u16_le(&payload[51], status_state->ina226_bus_voltage_mv);
  write_u16_le(&payload[53], (uint16_t)status_state->ina226_current_ma);
  payload[55] = status_state->ina226_valid ? 1u : 0u;

  if (protocol_encode_packet(PROTOCOL_MSG_STATUS, payload, sizeof(payload), frame, sizeof(frame), &frame_length))
  {
    (void)uart_task_send_frame(frame, (uint16_t)frame_length);
  }
}
