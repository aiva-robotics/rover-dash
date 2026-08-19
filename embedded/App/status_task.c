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
  uint8_t payload[24];
  uint8_t frame[PROTOCOL_MAX_FRAME_SIZE];
  size_t frame_length = 0u;

  if ((status_state == 0) || (status_diag == 0))
  {
    return;
  }

  write_u32_le(&payload[0], status_state->uptime_ms);
  write_u16_le(&payload[4], (uint16_t)status_state->steering_command);
  write_u16_le(&payload[6], (uint16_t)status_state->throttle_command);
  write_u16_le(&payload[8], status_state->failsafe_active ? 1u : 0u);
  write_u32_le(&payload[10], status_diag->uart_rx_frames);
  write_u32_le(&payload[14], status_diag->uart_crc_errors);
  write_u32_le(&payload[18], status_diag->failsafe_count);
  write_u16_le(&payload[22], status_state->rpi_connected ? 1u : 0u);

  if (protocol_encode_packet(PROTOCOL_MSG_STATUS, payload, sizeof(payload), frame, sizeof(frame), &frame_length))
  {
    (void)uart_task_send_frame(frame, (uint16_t)frame_length);
  }
}
