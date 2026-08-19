#ifndef BUZZER_H
#define BUZZER_H

#include "stm32g4xx_hal.h"

#include <stdint.h>

void buzzer_init(TIM_HandleTypeDef *timer);
void buzzer_start(uint32_t frequency_hz);
void buzzer_stop(void);

#endif
