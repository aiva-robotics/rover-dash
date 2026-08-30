#ifndef CONTROL_TASK_H
#define CONTROL_TASK_H

#include "rover_state.h"

#include "stm32g4xx_hal.h"

#include <stdint.h>

void control_task_init(TIM_HandleTypeDef *rc_output_timer, rover_state_t *state, rover_diag_t *diag);
void control_task(void);
void control_task_apply_command(const int16_t rc_command[4], uint8_t digital_output_mask, uint16_t buzzer_frequency_hz, uint32_t now_ms);
void control_task_set_forced_failsafe(bool enabled);
void rc_output_set(uint8_t output, int16_t value);
void digital_outputs_set(uint8_t output_mask);

#endif
