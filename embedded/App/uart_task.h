#ifndef UART_TASK_H
#define UART_TASK_H

#include "rover_state.h"

#include "stm32g4xx_hal.h"

#include <stdbool.h>
#include <stdint.h>

void uart_task_init(UART_HandleTypeDef *uart, rover_state_t *state, rover_diag_t *diag);
void uart_task(void);
void uart_task_rx_event_callback(UART_HandleTypeDef *huart, uint16_t size);
bool uart_task_send_frame(const uint8_t *frame, uint16_t length);

#endif
