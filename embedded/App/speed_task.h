#ifndef SPEED_TASK_H
#define SPEED_TASK_H

#include "rover_state.h"

#include "stm32g4xx_hal.h"

void speed_task_init(TIM_HandleTypeDef *timer, rover_state_t *state, rover_diag_t *diag);
void speed_task(void);
void speed_task_capture_callback(TIM_HandleTypeDef *htim);

#endif
