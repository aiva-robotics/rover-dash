#include "protocol.h"

#include <string.h>

void write_u16_le(uint8_t *dst, uint16_t value)
{
  dst[0] = (uint8_t)(value & 0xffu);
  dst[1] = (uint8_t)(value >> 8);
}

void write_u32_le(uint8_t *dst, uint32_t value)
{
  dst[0] = (uint8_t)(value & 0xffu);
  dst[1] = (uint8_t)((value >> 8) & 0xffu);
  dst[2] = (uint8_t)((value >> 16) & 0xffu);
  dst[3] = (uint8_t)((value >> 24) & 0xffu);
}

uint16_t read_u16_le(const uint8_t *src)
{
  return (uint16_t)src[0] | ((uint16_t)src[1] << 8);
}

uint32_t read_u32_le(const uint8_t *src)
{
  return (uint32_t)src[0] | ((uint32_t)src[1] << 8) | ((uint32_t)src[2] << 16) | ((uint32_t)src[3] << 24);
}

uint16_t protocol_crc16_ccitt(const uint8_t *data, size_t length)
{
  uint16_t crc = 0xffffu;

  for (size_t i = 0; i < length; i++)
  {
    crc ^= (uint16_t)data[i] << 8;
    for (uint8_t bit = 0; bit < 8u; bit++)
    {
      if ((crc & 0x8000u) != 0u)
      {
        crc = (uint16_t)((crc << 1) ^ 0x1021u);
      }
      else
      {
        crc <<= 1;
      }
    }
  }

  return crc;
}

static bool protocol_is_known_type(uint8_t type)
{
  return (type == PROTOCOL_MSG_CONTROL) || (type == PROTOCOL_MSG_STATUS) || (type == PROTOCOL_MSG_DIAGNOSTICS);
}

static bool cobs_decode(const uint8_t *input, size_t input_length, uint8_t *output, size_t output_capacity, size_t *output_length)
{
  size_t read_index = 0u;
  size_t write_index = 0u;

  while (read_index < input_length)
  {
    uint8_t code = input[read_index++];
    if (code == 0u)
    {
      return false;
    }

    for (uint8_t i = 1u; i < code; i++)
    {
      if ((read_index >= input_length) || (write_index >= output_capacity))
      {
        return false;
      }
      output[write_index++] = input[read_index++];
    }

    if ((code != 0xffu) && (read_index < input_length))
    {
      if (write_index >= output_capacity)
      {
        return false;
      }
      output[write_index++] = 0u;
    }
  }

  *output_length = write_index;
  return true;
}

static bool cobs_encode(const uint8_t *input, size_t input_length, uint8_t *output, size_t output_capacity, size_t *output_length)
{
  size_t read_index = 0u;
  size_t write_index = 1u;
  size_t code_index = 0u;
  uint8_t code = 1u;

  if (output_capacity < 2u)
  {
    return false;
  }

  while (read_index < input_length)
  {
    if (write_index >= output_capacity)
    {
      return false;
    }

    if (input[read_index] == 0u)
    {
      output[code_index] = code;
      code = 1u;
      code_index = write_index++;
      read_index++;
    }
    else
    {
      output[write_index++] = input[read_index++];
      code++;
      if (code == 0xffu)
      {
        output[code_index] = code;
        code = 1u;
        code_index = write_index++;
      }
    }
  }

  if (write_index >= output_capacity)
  {
    return false;
  }

  output[code_index] = code;
  output[write_index++] = 0u;
  *output_length = write_index;
  return true;
}

protocol_status_t protocol_decode_frame(const uint8_t *frame, size_t frame_length, protocol_packet_t *packet)
{
  uint8_t decoded[PROTOCOL_MAX_PACKET_SIZE];
  size_t decoded_length = 0u;

  if ((frame_length == 0u) || (packet == 0))
  {
    return PROTOCOL_STATUS_LENGTH_ERROR;
  }

  if (frame[frame_length - 1u] == 0u)
  {
    frame_length--;
  }

  if (!cobs_decode(frame, frame_length, decoded, sizeof(decoded), &decoded_length))
  {
    return PROTOCOL_STATUS_COBS_ERROR;
  }

  if (decoded_length < 4u)
  {
    return PROTOCOL_STATUS_LENGTH_ERROR;
  }

  uint8_t type = decoded[0];
  uint8_t payload_length = decoded[1];
  if (!protocol_is_known_type(type))
  {
    return PROTOCOL_STATUS_TYPE_ERROR;
  }

  if ((payload_length > PROTOCOL_MAX_PAYLOAD_SIZE) || (decoded_length != (size_t)payload_length + 4u))
  {
    return PROTOCOL_STATUS_LENGTH_ERROR;
  }

  uint16_t received_crc = read_u16_le(&decoded[decoded_length - 2u]);
  uint16_t calculated_crc = protocol_crc16_ccitt(decoded, decoded_length - 2u);
  if (received_crc != calculated_crc)
  {
    return PROTOCOL_STATUS_CRC_ERROR;
  }

  packet->type = type;
  packet->payload_length = payload_length;
  if (payload_length > 0u)
  {
    memcpy(packet->payload, &decoded[2], payload_length);
  }

  return PROTOCOL_STATUS_OK;
}

bool protocol_encode_packet(uint8_t type, const uint8_t *payload, uint8_t payload_length, uint8_t *frame, size_t frame_capacity, size_t *frame_length)
{
  uint8_t packet[PROTOCOL_MAX_PACKET_SIZE];
  size_t packet_length = (size_t)payload_length + 4u;

  if ((payload_length > PROTOCOL_MAX_PAYLOAD_SIZE) || (frame == 0) || (frame_length == 0))
  {
    return false;
  }

  packet[0] = type;
  packet[1] = payload_length;
  if (payload_length > 0u)
  {
    if (payload == 0)
    {
      return false;
    }
    memcpy(&packet[2], payload, payload_length);
  }

  write_u16_le(&packet[packet_length - 2u], protocol_crc16_ccitt(packet, packet_length - 2u));
  return cobs_encode(packet, packet_length, frame, frame_capacity, frame_length);
}
