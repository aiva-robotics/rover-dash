#include "adc_task.h"


static ADC_HandleTypeDef *adc1_handle;
static ADC_HandleTypeDef *adc2_handle;
static TIM_HandleTypeDef *tim6_handle;
static rover_state_t *adc_state;
static rover_diag_t *adc_diag;

static volatile uint16_t adc_dma[ADC_CHANNEL_COUNT];
static uint16_t adc_raw[ADC_CHANNEL_COUNT];
static uint16_t adc_filtered[ADC_CHANNEL_COUNT];

void adc_task_init(ADC_HandleTypeDef *adc1, ADC_HandleTypeDef *adc2, TIM_HandleTypeDef *tim6, rover_state_t *state, rover_diag_t *diag)
{
	adc1_handle = adc1;
	adc2_handle = adc2;
	tim6_handle = tim6;
	adc_state = state;
	adc_diag = diag;

	for (uint8_t i = 0; i < ADC_CHANNEL_COUNT; i++)
	{
		adc_raw[i] = adc_dma[i];
		adc_filtered[i] = adc_dma[i];
	}

	if (adc1_handle != 0)
	{
		if (HAL_ADC_Start_DMA(adc1_handle, (uint32_t *)adc_dma, ADC1_CHANNEL_COUNT) == HAL_OK)
		{
			if (tim6_handle != 0)
			{
				(void)HAL_TIM_Base_Start(tim6_handle);
			}
		}
	}

	if (adc2_handle != 0)
	{
		(void)HAL_ADC_Start(adc2_handle);
	}
}

void adc_task(void)
{

	// Handle ADC2 unique but still use the rest of the filtering
	// ADC1 is read using DMA
	if (adc2_handle != 0)
	{
		if (HAL_ADC_PollForConversion(adc2_handle, 0u) == HAL_OK)
		{
			adc_dma[ADC_CH_4] = HAL_ADC_GetValue(adc2_handle);
		}
	}

	for (uint8_t i = 0; i < ADC_CHANNEL_COUNT; i++)
	{
		adc_raw[i] = adc_dma[i];

		int32_t diff =
				(int32_t)adc_raw[i] -
				(int32_t)adc_filtered[i];

		adc_filtered[i] += diff / 8;
	}


	if (adc_state != 0)
	{
		for (uint8_t i = 0u; i < ROVER_ANALOG_INPUT_COUNT; i++)
		{
			adc_state->analog_input_raw[i] = adc_filtered[i];
		}
		adc_state->ntc_temperature_raw = adc_filtered[ADC_CH_4];
	}
}

void adc_task_dma_full_callback(ADC_HandleTypeDef *hadc)
{
	if ((hadc == adc1_handle) && (adc_diag != 0))
	{
		adc_diag->adc1_scan_count++;
	}
}

uint16_t adc_get_filtered(adc_channel_t channel)
{
	return adc_filtered[channel];
}
