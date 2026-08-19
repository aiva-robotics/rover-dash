#include "control_task.h"

#include "main.h"

#define CONTROL_FAILSAFE_TIMEOUT_MS 250u
#define RC_COMMAND_MIN (-1000)
#define RC_COMMAND_MAX 1000
#define RC_PULSE_MIN_US 1000u
#define RC_PULSE_NEUTRAL_US 1500u
#define RC_PULSE_MAX_US 2000u

static TIM_HandleTypeDef *control_servo_timer;
static rover_state_t *control_state;
static rover_diag_t *control_diag;
static uint32_t last_control_message_ms;
static bool previous_failsafe_active = true;

static int16_t clamp_command(int16_t value)
{
  if (value < RC_COMMAND_MIN)
  {
    return RC_COMMAND_MIN;
  }
  if (value > RC_COMMAND_MAX)
  {
    return RC_COMMAND_MAX;
  }
  return value;
}

static uint32_t command_to_pulse_us(int16_t value)
{
  int32_t clamped = clamp_command(value);
  int32_t span = (int32_t)(RC_PULSE_MAX_US - RC_PULSE_MIN_US);
  return (uint32_t)((int32_t)RC_PULSE_NEUTRAL_US + ((clamped * span) / (2 * RC_COMMAND_MAX)));
}

static void set_servo_compare(uint32_t channel, uint32_t pulse_us)
{
  if (control_servo_timer != 0)
  {
    __HAL_TIM_SET_COMPARE(control_servo_timer, channel, pulse_us);
  }
}

void steering_set(int16_t value)
{
  set_servo_compare(TIM_CHANNEL_3, command_to_pulse_us(value));
}

void throttle_set(int16_t value)
{
  set_servo_compare(TIM_CHANNEL_4, command_to_pulse_us(value));
}

void control_task_init(TIM_HandleTypeDef *servo_timer, rover_state_t *state, rover_diag_t *diag)
{
  control_servo_timer = servo_timer;
  control_state = state;
  control_diag = diag;
  last_control_message_ms = HAL_GetTick();

  steering_set(0);
  throttle_set(0);

  if (control_servo_timer != 0)
  {
    (void)HAL_TIM_PWM_Start(control_servo_timer, TIM_CHANNEL_1);
    (void)HAL_TIM_PWM_Start(control_servo_timer, TIM_CHANNEL_2);
    (void)HAL_TIM_PWM_Start(control_servo_timer, TIM_CHANNEL_3);
    (void)HAL_TIM_PWM_Start(control_servo_timer, TIM_CHANNEL_4);
  }
}

void control_task_apply_command(int16_t steering, int16_t throttle, uint32_t now_ms)
{
  last_control_message_ms = now_ms;

  if (control_state != 0)
  {
    control_state->steering_command = clamp_command(steering);
    control_state->throttle_command = clamp_command(throttle);
    control_state->rpi_connected = true;
  }

  steering_set(steering);
  throttle_set(throttle);
}

void control_task(void)
{
  uint32_t now_ms = HAL_GetTick();
  bool failsafe_active = ((uint32_t)(now_ms - last_control_message_ms) >= CONTROL_FAILSAFE_TIMEOUT_MS);

  if (control_state != 0)
  {
    control_state->rpi_connected = !failsafe_active;
    control_state->failsafe_active = failsafe_active;

    if (failsafe_active)
    {
      control_state->steering_command = 0;
      control_state->throttle_command = 0;
      steering_set(0);
      throttle_set(0);
      HAL_GPIO_WritePin(OUTPUT_0_GPIO_Port, OUTPUT_0_Pin, GPIO_PIN_RESET);
      HAL_GPIO_WritePin(OUTPUT_1_GPIO_Port, OUTPUT_1_Pin, GPIO_PIN_RESET);
      HAL_GPIO_WritePin(OUTPUT_2_GPIO_Port, OUTPUT_2_Pin, GPIO_PIN_RESET);
      HAL_GPIO_WritePin(OUTPUT_3_GPIO_Port, OUTPUT_3_Pin, GPIO_PIN_RESET);
    }
  }

  if ((control_diag != 0) && failsafe_active && !previous_failsafe_active)
  {
    control_diag->failsafe_count++;
  }
  previous_failsafe_active = failsafe_active;
}
