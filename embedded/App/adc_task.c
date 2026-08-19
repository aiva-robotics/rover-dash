#include "adc_task.h"

#define ADC_DMA_FRAME_COUNT 20u
#define ADC_DMA_BUFFER_LENGTH (ADC_TASK_CHANNEL_COUNT * ADC_DMA_FRAME_COUNT)

static ADC_HandleTypeDef *adc1_handle;
static ADC_HandleTypeDef *adc2_handle;
static rover_state_t *adc_state;
static rover_diag_t *adc_diag;
static uint16_t adc_dma_buffer[ADC_DMA_BUFFER_LENGTH];
static volatile uint8_t adc_half_ready;
static volatile uint8_t adc_full_ready;
static adc_values_t adc_values;

static void accumulate_samples(uint32_t start, uint32_t end, uint32_t *sums, uint32_t *frames)
{
  for (uint32_t index = start; index + ADC_TASK_CHANNEL_COUNT <= end; index += ADC_TASK_CHANNEL_COUNT)
  {
    for (uint32_t channel = 0u; channel < ADC_TASK_CHANNEL_COUNT; channel++)
    {
      sums[channel] += adc_dma_buffer[index + channel];
    }
    (*frames)++;
  }
}

void adc_task_init(ADC_HandleTypeDef *adc1, ADC_HandleTypeDef *adc2, rover_state_t *state, rover_diag_t *diag)
{
  adc1_handle = adc1;
  adc2_handle = adc2;
  adc_state = state;
  adc_diag = diag;

  if (adc1_handle != 0)
  {
    (void)HAL_ADC_Start_DMA(adc1_handle, (uint32_t *)adc_dma_buffer, ADC_DMA_BUFFER_LENGTH);
  }

  if (adc2_handle != 0)
  {
    (void)HAL_ADC_Start(adc2_handle);
  }
}

void adc_task_dma_half_callback(ADC_HandleTypeDef *hadc)
{
  if (hadc == adc1_handle)
  {
    adc_half_ready = 1u;
    if (adc_diag != 0)
    {
      adc_diag->adc_half_cycles++;
    }
  }
}

void adc_task_dma_full_callback(ADC_HandleTypeDef *hadc)
{
  if (hadc == adc1_handle)
  {
    adc_full_ready = 1u;
    if (adc_diag != 0)
    {
      adc_diag->adc_dma_cycles++;
    }
  }
}

void adc_task(void)
{
  uint32_t sums[ADC_TASK_CHANNEL_COUNT] = {0u};
  uint32_t frames = 0u;

  if (adc_half_ready != 0u)
  {
    adc_half_ready = 0u;
    accumulate_samples(0u, ADC_DMA_BUFFER_LENGTH / 2u, sums, &frames);
  }

  if (adc_full_ready != 0u)
  {
    adc_full_ready = 0u;
    accumulate_samples(ADC_DMA_BUFFER_LENGTH / 2u, ADC_DMA_BUFFER_LENGTH, sums, &frames);
  }

  if (frames > 0u)
  {
    for (uint32_t channel = 0u; channel < ADC_TASK_CHANNEL_COUNT; channel++)
    {
      adc_values.analog[channel] = (uint16_t)(sums[channel] / frames);
    }
  }

  if (adc2_handle != 0)
  {
    if (HAL_ADC_PollForConversion(adc2_handle, 0u) == HAL_OK)
    {
      adc_values.motor_temperature = (float)HAL_ADC_GetValue(adc2_handle);
    }
  }

  adc_values.battery_voltage = (float)adc_values.analog[0];
  adc_values.current = (float)adc_values.analog[1];

  if (adc_state != 0)
  {
    adc_state->battery_voltage = adc_values.battery_voltage;
    adc_state->battery_current = adc_values.current;
    adc_state->motor_temperature = adc_values.motor_temperature;
  }
}

const adc_values_t *adc_task_get_values(void)
{
  return &adc_values;
}
