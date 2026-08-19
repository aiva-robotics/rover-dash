#include "buzzer.h"

#define BUZZER_TIMER_CLOCK_HZ 1000000u
#define BUZZER_CHANNEL TIM_CHANNEL_2

static TIM_HandleTypeDef *buzzer_timer;

void buzzer_init(TIM_HandleTypeDef *timer)
{
  buzzer_timer = timer;
  buzzer_stop();
}

void buzzer_start(uint32_t frequency_hz)
{
  if ((buzzer_timer == 0) || (frequency_hz == 0u))
  {
    return;
  }

  uint32_t period = (BUZZER_TIMER_CLOCK_HZ / frequency_hz);
  if (period < 2u)
  {
    period = 2u;
  }

  __HAL_TIM_SET_AUTORELOAD(buzzer_timer, period - 1u);
  __HAL_TIM_SET_COMPARE(buzzer_timer, BUZZER_CHANNEL, period / 2u);
  __HAL_TIM_SET_COUNTER(buzzer_timer, 0u);
  (void)HAL_TIM_PWM_Start(buzzer_timer, BUZZER_CHANNEL);
}

void buzzer_stop(void)
{
  if (buzzer_timer != 0)
  {
    (void)HAL_TIM_PWM_Stop(buzzer_timer, BUZZER_CHANNEL);
    __HAL_TIM_SET_COMPARE(buzzer_timer, BUZZER_CHANNEL, 0u);
  }
}
