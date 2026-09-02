#ifndef PROTOCOL_H
#define PROTOCOL_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define PROTOCOL_MAX_PAYLOAD_SIZE 64u
#define PROTOCOL_MAX_PACKET_SIZE (2u + PROTOCOL_MAX_PAYLOAD_SIZE + 2u)
#define PROTOCOL_MAX_FRAME_SIZE (PROTOCOL_MAX_PACKET_SIZE + 2u)
#define PROTOCOL_CONTROL_RC_CHANNELS 4u
#define PROTOCOL_CONTROL_PAYLOAD_SIZE 11u
#define PROTOCOL_CONTROL_OUTPUT_MASK_INDEX 8u
#define PROTOCOL_CONTROL_BUZZER_FREQUENCY_INDEX 9u
#define PROTOCOL_STATUS_PAYLOAD_SIZE 56u
#define PROTOCOL_STATUS_UPTIME_MS_INDEX 0u
#define PROTOCOL_STATUS_RC_COMMAND_INDEX 4u
#define PROTOCOL_STATUS_DIGITAL_OUTPUT_MASK_INDEX 12u
#define PROTOCOL_STATUS_FAILSAFE_ACTIVE_INDEX 13u
#define PROTOCOL_STATUS_BUZZER_FREQUENCY_INDEX 14u
#define PROTOCOL_STATUS_UART_RX_FRAMES_INDEX 16u
#define PROTOCOL_STATUS_UART_CRC_ERRORS_INDEX 20u
#define PROTOCOL_STATUS_FAILSAFE_COUNT_INDEX 24u
#define PROTOCOL_STATUS_RPI_CONNECTED_INDEX 28u
#define PROTOCOL_STATUS_RPI_POWER_ENABLED_INDEX 30u
#define PROTOCOL_STATUS_RPI_POWER_OFF_OK_INDEX 31u
#define PROTOCOL_STATUS_RPI_SHUTDOWN_REQUESTED_INDEX 32u
#define PROTOCOL_STATUS_RPI_STATUS_INDEX 33u
#define PROTOCOL_STATUS_ANALOG_INPUT_INDEX 34u
#define PROTOCOL_STATUS_NTC_TEMPERATURE_RAW_INDEX 42u
#define PROTOCOL_STATUS_TMP75_TEMPERATURE_INDEX 44u
#define PROTOCOL_STATUS_TMP75_VALID_INDEX 46u
#define PROTOCOL_STATUS_SPEED_HZ_X100_INDEX 47u
#define PROTOCOL_STATUS_INA226_BUS_VOLTAGE_INDEX 51u
#define PROTOCOL_STATUS_INA226_CURRENT_INDEX 53u
#define PROTOCOL_STATUS_INA226_VALID_INDEX 55u

typedef enum
{
  PROTOCOL_MSG_CONTROL = 0x01u,
  PROTOCOL_MSG_RPI_SHUTDOWN = 0x02u,
  PROTOCOL_MSG_DISPLAY_DATA = 0x03u,
  PROTOCOL_MSG_DISPLAY_UPDATE = 0x04u,
  PROTOCOL_MSG_STATUS = 0x80u,
  PROTOCOL_MSG_DIAGNOSTICS = 0x81u
} protocol_message_type_t;

typedef enum
{
  PROTOCOL_STATUS_OK = 0,
  PROTOCOL_STATUS_COBS_ERROR,
  PROTOCOL_STATUS_LENGTH_ERROR,
  PROTOCOL_STATUS_CRC_ERROR,
  PROTOCOL_STATUS_TYPE_ERROR
} protocol_status_t;

typedef struct
{
  uint8_t type;
  uint8_t payload_length;
  uint8_t payload[PROTOCOL_MAX_PAYLOAD_SIZE];
} protocol_packet_t;

void write_u16_le(uint8_t *dst, uint16_t value);
void write_u32_le(uint8_t *dst, uint32_t value);
uint16_t read_u16_le(const uint8_t *src);
uint32_t read_u32_le(const uint8_t *src);

uint16_t protocol_crc16_ccitt(const uint8_t *data, size_t length);
protocol_status_t protocol_decode_frame(const uint8_t *frame, size_t frame_length, protocol_packet_t *packet);
bool protocol_encode_packet(uint8_t type, const uint8_t *payload, uint8_t payload_length, uint8_t *frame, size_t frame_capacity, size_t *frame_length);

#endif
