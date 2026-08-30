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

typedef enum
{
  PROTOCOL_MSG_CONTROL = 0x01u,
  PROTOCOL_MSG_RPI_SHUTDOWN = 0x02u,
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
