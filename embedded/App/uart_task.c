#include "uart_task.h"

#include "control_task.h"
#include "oled_task.h"
#include "protocol.h"

#include <string.h>

#define UART_DMA_RX_BUFFER_SIZE 1024u
#define UART_RX_RING_SIZE 2048u
#define UART_RING_INDEX_MASK (UART_RX_RING_SIZE - 1u)

_Static_assert((UART_RX_RING_SIZE & UART_RING_INDEX_MASK) == 0u, "UART_RX_RING_SIZE must be a power of two");

static UART_HandleTypeDef *uart_handle;
static rover_state_t *uart_state;
static rover_diag_t *uart_diag;
static uint8_t uart_dma_rx_buffer[UART_DMA_RX_BUFFER_SIZE];
static uint8_t uart_dma_tx_buffer[PROTOCOL_MAX_FRAME_SIZE];
static uint8_t uart_rx_ring[UART_RX_RING_SIZE];
static volatile uint16_t uart_rx_head;
static volatile uint16_t uart_rx_tail;
static volatile bool uart_tx_busy;
static volatile uint16_t uart_dma_rx_position;

static uint16_t ring_next(uint16_t index)
{
  return (uint16_t)((index + 1u) & UART_RING_INDEX_MASK);
}

static void ring_push(uint8_t byte)
{
  uint16_t next = ring_next(uart_rx_head);
  if (next == uart_rx_tail)
  {
    if (uart_diag != 0)
    {
      uart_diag->uart_overruns++;
    }
    return;
  }

  uart_rx_ring[uart_rx_head] = byte;
  uart_rx_head = next;
}

static bool ring_pop(uint8_t *byte)
{
  if (uart_rx_tail == uart_rx_head)
  {
    return false;
  }

  *byte = uart_rx_ring[uart_rx_tail];
  uart_rx_tail = ring_next(uart_rx_tail);
  return true;
}

static void handle_packet(const protocol_packet_t *packet)
{
  if (packet->type == PROTOCOL_MSG_CONTROL)
  {
    if (packet->payload_length != PROTOCOL_CONTROL_PAYLOAD_SIZE)
    {
      if (uart_diag != 0)
      {
        uart_diag->uart_length_errors++;
      }
      return;
    }

    int16_t rc_command[PROTOCOL_CONTROL_RC_CHANNELS];
    for (uint8_t output = 0u; output < PROTOCOL_CONTROL_RC_CHANNELS; output++)
    {
      rc_command[output] = (int16_t)read_u16_le(&packet->payload[output * 2u]);
    }
    uint16_t buzzer_frequency_hz = read_u16_le(&packet->payload[PROTOCOL_CONTROL_BUZZER_FREQUENCY_INDEX]);
    control_task_apply_command(rc_command, packet->payload[PROTOCOL_CONTROL_OUTPUT_MASK_INDEX], buzzer_frequency_hz, HAL_GetTick());
  }
  else if (packet->type == PROTOCOL_MSG_DISPLAY_DATA)
  {
    if ((packet->payload_length < 2u) ||
        !display_receive_rpi_chunk(packet->payload[0], &packet->payload[1], (uint8_t)(packet->payload_length - 1u)))
    {
      if (uart_diag != 0)
      {
        uart_diag->uart_length_errors++;
      }
    }
  }
  else if (packet->type == PROTOCOL_MSG_DISPLAY_UPDATE)
  {
    if ((packet->payload_length != 0u) || !display_rpi_update())
    {
      if (uart_diag != 0)
      {
        uart_diag->uart_length_errors++;
      }
    }
  }
}

static void count_protocol_error(protocol_status_t status)
{
  if (uart_diag == 0)
  {
    return;
  }

  switch (status)
  {
    case PROTOCOL_STATUS_COBS_ERROR:
      uart_diag->uart_cobs_errors++;
      break;
    case PROTOCOL_STATUS_CRC_ERROR:
      uart_diag->uart_crc_errors++;
      break;
    case PROTOCOL_STATUS_TYPE_ERROR:
      uart_diag->uart_type_errors++;
      break;
    case PROTOCOL_STATUS_LENGTH_ERROR:
      uart_diag->uart_length_errors++;
      break;
    case PROTOCOL_STATUS_OK:
    default:
      break;
  }
}

void uart_task_init(UART_HandleTypeDef *uart, rover_state_t *state, rover_diag_t *diag)
{
  uart_handle = uart;
  uart_state = state;
  uart_diag = diag;
  uart_dma_rx_position = 0u;

  if (uart_handle != 0)
  {
    HAL_NVIC_SetPriority(DMA1_Channel2_IRQn, 0, 0);
    HAL_NVIC_EnableIRQ(DMA1_Channel2_IRQn);
    HAL_NVIC_SetPriority(DMA1_Channel3_IRQn, 0, 0);
    HAL_NVIC_EnableIRQ(DMA1_Channel3_IRQn);
    HAL_NVIC_SetPriority(USART2_IRQn, 0, 0);
    HAL_NVIC_EnableIRQ(USART2_IRQn);

    (void)HAL_UARTEx_ReceiveToIdle_DMA(uart_handle, uart_dma_rx_buffer, UART_DMA_RX_BUFFER_SIZE);
  }
}

void uart_task_rx_event_callback(UART_HandleTypeDef *huart, uint16_t size)
{
  uint16_t previous_position;

  if (huart != uart_handle)
  {
    return;
  }

  if (size > UART_DMA_RX_BUFFER_SIZE)
  {
    size = UART_DMA_RX_BUFFER_SIZE;
  }

  previous_position = uart_dma_rx_position;
  if (size == previous_position)
  {
    return;
  }

  if (size > previous_position)
  {
    for (uint16_t i = previous_position; i < size; i++)
    {
      ring_push(uart_dma_rx_buffer[i]);
    }
  }
  else
  {
    for (uint16_t i = previous_position; i < UART_DMA_RX_BUFFER_SIZE; i++)
    {
      ring_push(uart_dma_rx_buffer[i]);
    }
    for (uint16_t i = 0u; i < size; i++)
    {
      ring_push(uart_dma_rx_buffer[i]);
    }
  }

  uart_dma_rx_position = size;
}

void uart_task(void)
{
  static uint8_t frame[PROTOCOL_MAX_FRAME_SIZE];
  static uint16_t frame_length;
  uint8_t byte;

  while (ring_pop(&byte))
  {
    if (byte == 0u)
    {
      protocol_packet_t packet;
      protocol_status_t status = protocol_decode_frame(frame, frame_length, &packet);
      frame_length = 0u;

      if (status == PROTOCOL_STATUS_OK)
      {
        uint32_t now_ms = HAL_GetTick();
        if (uart_diag != 0)
        {
          uart_diag->uart_rx_frames++;
        }
        if (uart_state != 0)
        {
          uart_state->rpi_last_rx_ms = now_ms;
          uart_state->rpi_connected = true;
        }
        handle_packet(&packet);
      }
      else
      {
        count_protocol_error(status);
      }
    }
    else if (frame_length < sizeof(frame))
    {
      frame[frame_length++] = byte;
    }
    else
    {
      frame_length = 0u;
      if (uart_diag != 0)
      {
        uart_diag->uart_overruns++;
      }
    }
  }
}

bool uart_task_send_frame(const uint8_t *frame, uint16_t length)
{
  if ((uart_handle == 0) || uart_tx_busy || (frame == 0) || (length == 0u) || (length > sizeof(uart_dma_tx_buffer)))
  {
    return false;
  }

  memcpy(uart_dma_tx_buffer, frame, length);
  uart_tx_busy = true;
  if (HAL_UART_Transmit_DMA(uart_handle, uart_dma_tx_buffer, length) != HAL_OK)
  {
    uart_tx_busy = false;
    return false;
  }
  return true;
}

void HAL_UART_TxCpltCallback(UART_HandleTypeDef *huart)
{
  if (huart == uart_handle)
  {
    uart_tx_busy = false;
  }
}
