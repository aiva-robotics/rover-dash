#include "speed_task.h"

#define SPEED_CAPTURE_CHANNEL TIM_CHANNEL_4
#define SPEED_TIMEOUT_MS 500u
#define SPEED_TIMER_TICK_HZ 1000000.0f

static TIM_HandleTypeDef *speed_timer;
static rover_state_t *speed_state;
static rover_diag_t *speed_diag;
static volatile uint32_t last_capture_ticks;
static volatile uint32_t latest_period_ticks;
static volatile uint8_t period_ready;
static volatile uint32_t last_capture_ms;

void speed_task_init(TIM_HandleTypeDef *timer, rover_state_t *state, rover_diag_t *diag)
{
  speed_timer = timer;
  speed_state = state;
  speed_diag = diag;
  last_capture_ms = HAL_GetTick();

  if (speed_timer != 0)
  {
    (void)HAL_TIM_IC_Start_IT(speed_timer, SPEED_CAPTURE_CHANNEL);
  }
}

void speed_task_capture_callback(TIM_HandleTypeDef *htim)
{
  if ((htim == speed_timer) && (htim->Channel == HAL_TIM_ACTIVE_CHANNEL_4))
  {
    uint32_t capture = HAL_TIM_ReadCapturedValue(htim, SPEED_CAPTURE_CHANNEL);
    latest_period_ticks = capture - last_capture_ticks;
    last_capture_ticks = capture;
    period_ready = 1u;
    last_capture_ms = HAL_GetTick();

    if (speed_diag != 0)
    {
      speed_diag->speed_captures++;
    }
  }
}

void speed_task(void)
{
  if (period_ready != 0u)
  {
    HAL_NVIC_DisableIRQ(TIM2_IRQn);
    uint32_t period_ticks = latest_period_ticks;
    period_ready = 0u;
    HAL_NVIC_EnableIRQ(TIM2_IRQn);

    if ((speed_state != 0) && (period_ticks > 0u))
    {
      speed_state->vehicle_speed = SPEED_TIMER_TICK_HZ / (float)period_ticks;
    }
  }

  if ((uint32_t)(HAL_GetTick() - last_capture_ms) >= SPEED_TIMEOUT_MS)
  {
    if (speed_state != 0)
    {
      speed_state->vehicle_speed = 0.0f;
    }
    if (speed_diag != 0)
    {
      speed_diag->speed_timeouts++;
    }
    last_capture_ms = HAL_GetTick();
  }
}
