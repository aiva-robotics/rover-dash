#include "uart_task.h"

#include "control_task.h"
#include "protocol.h"

#include <string.h>

#define UART_DMA_RX_BUFFER_SIZE 128u
#define UART_RX_RING_SIZE 256u

static UART_HandleTypeDef *uart_handle;
static rover_state_t *uart_state;
static rover_diag_t *uart_diag;
static uint8_t uart_dma_rx_buffer[UART_DMA_RX_BUFFER_SIZE];
static uint8_t uart_rx_ring[UART_RX_RING_SIZE];
static volatile uint16_t uart_rx_head;
static uint16_t uart_rx_tail;
static volatile bool uart_tx_busy;

static uint16_t ring_next(uint16_t index)
{
  return (uint16_t)((index + 1u) % UART_RX_RING_SIZE);
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
    if (packet->payload_length < 4u)
    {
      if (uart_diag != 0)
      {
        uart_diag->uart_length_errors++;
      }
      return;
    }

    int16_t steering = (int16_t)read_u16_le(&packet->payload[0]);
    int16_t throttle = (int16_t)read_u16_le(&packet->payload[2]);
    control_task_apply_command(steering, throttle, HAL_GetTick());
    if (uart_state != 0)
    {
      uart_state->rpi_connected = true;
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

  if (uart_handle != 0)
  {
    HAL_NVIC_SetPriority(DMA1_Channel2_IRQn, 0, 0);
    HAL_NVIC_EnableIRQ(DMA1_Channel2_IRQn);
    HAL_NVIC_SetPriority(DMA1_Channel3_IRQn, 0, 0);
    HAL_NVIC_EnableIRQ(DMA1_Channel3_IRQn);
    HAL_NVIC_SetPriority(USART2_IRQn, 0, 0);
    HAL_NVIC_EnableIRQ(USART2_IRQn);

    (void)HAL_UARTEx_ReceiveToIdle_DMA(uart_handle, uart_dma_rx_buffer, UART_DMA_RX_BUFFER_SIZE);
    if (uart_handle->hdmarx != 0)
    {
      __HAL_DMA_DISABLE_IT(uart_handle->hdmarx, DMA_IT_HT);
    }
  }
}

void uart_task_rx_event_callback(UART_HandleTypeDef *huart, uint16_t size)
{
  if (huart != uart_handle)
  {
    return;
  }

  if (size > UART_DMA_RX_BUFFER_SIZE)
  {
    size = UART_DMA_RX_BUFFER_SIZE;
  }

  for (uint16_t i = 0u; i < size; i++)
  {
    ring_push(uart_dma_rx_buffer[i]);
  }

  (void)HAL_UARTEx_ReceiveToIdle_DMA(uart_handle, uart_dma_rx_buffer, UART_DMA_RX_BUFFER_SIZE);
  if (uart_handle->hdmarx != 0)
  {
    __HAL_DMA_DISABLE_IT(uart_handle->hdmarx, DMA_IT_HT);
  }
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
        if (uart_diag != 0)
        {
          uart_diag->uart_rx_frames++;
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
  if ((uart_handle == 0) || uart_tx_busy || (frame == 0) || (length == 0u))
  {
    return false;
  }

  uart_tx_busy = true;
  if (HAL_UART_Transmit_DMA(uart_handle, (uint8_t *)frame, length) != HAL_OK)
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
