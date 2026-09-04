#ifndef BUZZER_H
#define BUZZER_H

#include "stm32g4xx_hal.h"

#include <stdbool.h>
#include <stdint.h>

typedef struct
{
  uint16_t frequency_hz;
  uint16_t duration_ms;
} buzzer_note_t;

void buzzer_init(TIM_HandleTypeDef *timer);
void buzzer_start(uint32_t frequency_hz);
void buzzer_stop(void);
void buzzer_play_sequence(const buzzer_note_t *notes, uint8_t note_count);
void buzzer_task(void);
bool buzzer_sequence_active(void);

#endif
