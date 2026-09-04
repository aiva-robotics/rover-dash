#include "uart_task.h"

#include "control_task.h"
#include "oled_task.h"
#include "protocol.h"

#include <string.h>

#define UART_RX_RING_SIZE 2048u
#define UART_RING_INDEX_MASK (UART_RX_RING_SIZE - 1u)
#define UART_TX_QUEUE_LENGTH 6u

_Static_assert((UART_RX_RING_SIZE & UART_RING_INDEX_MASK) == 0u, "UART_RX_RING_SIZE must be a power of two");

typedef struct
{
  uint8_t data[PROTOCOL_MAX_FRAME_SIZE];
  uint16_t length;
} uart_tx_queue_item_t;

static UART_HandleTypeDef *uart_handle;
static rover_state_t *uart_state;
static rover_diag_t *uart_diag;
static uint8_t uart_dma_tx_buffer[PROTOCOL_MAX_FRAME_SIZE];
static uint8_t uart_rx_byte;
static uint8_t uart_rx_ring[UART_RX_RING_SIZE];
static uart_tx_queue_item_t uart_tx_queue[UART_TX_QUEUE_LENGTH];
static volatile uint16_t uart_rx_head;
static volatile uint16_t uart_rx_tail;
static volatile uint8_t uart_tx_head;
static volatile uint8_t uart_tx_tail;
static volatile bool uart_tx_busy;

static uint16_t ring_next(uint16_t index)
{
  return (uint16_t)((index + 1u) & UART_RING_INDEX_MASK);
}

static uint8_t tx_queue_next(uint8_t index)
{
  return (uint8_t)((index + 1u) % UART_TX_QUEUE_LENGTH);
}

static void uart_start_rx_it(void)
{
  if (uart_handle == 0)
  {
    return;
  }

  (void)HAL_UART_Receive_IT(uart_handle, &uart_rx_byte, 1u);
}

static void uart_try_start_tx(void)
{
  uint8_t tail;
  uart_tx_queue_item_t *item;

  if ((uart_handle == 0) || uart_tx_busy || (uart_tx_head == uart_tx_tail))
  {
    return;
  }

  tail = uart_tx_tail;
  item = &uart_tx_queue[tail];
  memcpy(uart_dma_tx_buffer, item->data, item->length);

  uart_tx_tail = tx_queue_next(tail);
  uart_tx_busy = true;
  if (HAL_UART_Transmit_DMA(uart_handle, uart_dma_tx_buffer, item->length) == HAL_OK)
  {
    return;
  }

  uart_tx_busy = false;
  uart_tx_tail = tail;
  if (uart_diag != 0)
  {
    uart_diag->uart_overruns++;
  }
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
  else if (packet->type == PROTOCOL_MSG_RPI_INFO)
  {
    if ((uart_state == 0) || (packet->payload_length >= ROVER_RPI_IP_ADDRESS_LENGTH))
    {
      if (uart_diag != 0)
      {
        uart_diag->uart_length_errors++;
      }
      return;
    }

    memcpy(uart_state->rpi_ip_address, packet->payload, packet->payload_length);
    uart_state->rpi_ip_address[packet->payload_length] = '\0';
    if (uart_state->rpi_connected)
    {
      display_status("RASPBERRY PI", uart_state->rpi_ip_address);
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
  uart_rx_head = 0u;
  uart_rx_tail = 0u;
  uart_tx_head = 0u;
  uart_tx_tail = 0u;
  uart_tx_busy = false;

  if (uart_handle != 0)
  {
    HAL_NVIC_SetPriority(DMA1_Channel3_IRQn, 0, 0);
    HAL_NVIC_EnableIRQ(DMA1_Channel3_IRQn);
    HAL_NVIC_SetPriority(USART2_IRQn, 0, 0);
    HAL_NVIC_EnableIRQ(USART2_IRQn);

    uart_start_rx_it();
  }
}

void uart_task_rx_complete_callback(UART_HandleTypeDef *huart)
{
  if (huart != uart_handle)
  {
    return;
  }

  ring_push(uart_rx_byte);
  uart_start_rx_it();
}

void uart_task_error_callback(UART_HandleTypeDef *huart)
{
  if (huart != uart_handle)
  {
    return;
  }

  if (uart_diag != 0)
  {
    uart_diag->uart_overruns++;
  }

  (void)HAL_UART_AbortReceive(huart);
  uart_start_rx_it();
}

void uart_task(void)
{
  static uint8_t frame[PROTOCOL_MAX_FRAME_SIZE];
  static uint16_t frame_length;
  uint8_t byte;

  uart_try_start_tx();

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

  uart_try_start_tx();
}

bool uart_task_send_frame(const uint8_t *frame, uint16_t length)
{
  uint8_t next;

  if ((uart_handle == 0) || (frame == 0) || (length == 0u) || (length > PROTOCOL_MAX_FRAME_SIZE))
  {
    return false;
  }

  next = tx_queue_next(uart_tx_head);
  if (next == uart_tx_tail)
  {
    if (uart_diag != 0)
    {
      uart_diag->uart_overruns++;
    }
    return false;
  }

  memcpy(uart_tx_queue[uart_tx_head].data, frame, length);
  uart_tx_queue[uart_tx_head].length = length;
  uart_tx_head = next;
  uart_try_start_tx();
  return true;
}

void HAL_UART_TxCpltCallback(UART_HandleTypeDef *huart)
{
  if (huart == uart_handle)
  {
    uart_tx_busy = false;
  }
}
