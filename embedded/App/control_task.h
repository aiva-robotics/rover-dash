#ifndef CONTROL_TASK_H
#define CONTROL_TASK_H

#include "rover_state.h"

#include "stm32g4xx_hal.h"

#include <stdint.h>

void control_task_init(TIM_HandleTypeDef *servo_timer, rover_state_t *state, rover_diag_t *diag);
void control_task(void);
void control_task_apply_command(int16_t steering, int16_t throttle, uint32_t now_ms);
void steering_set(int16_t value);
void throttle_set(int16_t value);

#endif
