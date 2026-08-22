#ifndef ADC_TASK_H
#define ADC_TASK_H

#include "rover_state.h"

#include "stm32g4xx_hal.h"

#include <stdint.h>

#define ADC1_CHANNEL_COUNT 4

typedef enum
{
	ADC_CH_0 = 0,
	ADC_CH_1,
	ADC_CH_2,
	ADC_CH_3,
	ADC_CH_4,
	ADC_CHANNEL_COUNT
} adc_channel_t;

typedef struct
{
  uint16_t analog[ADC_CHANNEL_COUNT];
} adc_values_t;

void adc_task_init(ADC_HandleTypeDef *adc1, ADC_HandleTypeDef *adc2, TIM_HandleTypeDef *tim6, rover_state_t *state, rover_diag_t *diag);
void adc_task(void);
void adc_task_dma_full_callback(ADC_HandleTypeDef *hadc);
uint16_t adc_get_filtered(adc_channel_t channel);

#endif
