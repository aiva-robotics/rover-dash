#ifndef ADC_TASK_H
#define ADC_TASK_H

#include "rover_state.h"

#include "stm32g4xx_hal.h"

#include <stdint.h>

#define ADC_TASK_CHANNEL_COUNT 4u

typedef struct
{
  uint16_t analog[ADC_TASK_CHANNEL_COUNT];
  float battery_voltage;
  float current;
  float motor_temperature;
} adc_values_t;

void adc_task_init(ADC_HandleTypeDef *adc1, ADC_HandleTypeDef *adc2, rover_state_t *state, rover_diag_t *diag);
void adc_task(void);
void adc_task_dma_half_callback(ADC_HandleTypeDef *hadc);
void adc_task_dma_full_callback(ADC_HandleTypeDef *hadc);
const adc_values_t *adc_task_get_values(void);

#endif
