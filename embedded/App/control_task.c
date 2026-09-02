#include "control_task.h"

#include "buzzer.h"
#include "main.h"

#define CONTROL_FAILSAFE_TIMEOUT_MS 1000u
#define RC_COMMAND_MIN (-1000)
#define RC_COMMAND_MAX 1000
#define RC_PULSE_MIN_US 1000u
#define RC_PULSE_NEUTRAL_US 1500u
#define RC_PULSE_MAX_US 2000u
#define RC_OUTPUT_COUNT 4u
#define DIGITAL_OUTPUT_MASK_ALL 0x0fu

static TIM_HandleTypeDef *control_rc_output_timer;
static rover_state_t *control_state;
static rover_diag_t *control_diag;
static uint32_t last_control_message_ms;
static bool previous_failsafe_active = true;
static bool forced_failsafe_active = true;

static const uint32_t rc_output_channels[RC_OUTPUT_COUNT] =
{
  TIM_CHANNEL_4, /* RC output 0, PA11 */
  TIM_CHANNEL_3, /* RC output 1, PA10 */
  TIM_CHANNEL_2, /* RC output 2, PA9 */
  TIM_CHANNEL_1  /* RC output 3, PA8 */
};

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

static void set_rc_compare(uint32_t channel, uint32_t pulse_us)
{
  if (control_rc_output_timer != 0)
  {
    __HAL_TIM_SET_COMPARE(control_rc_output_timer, channel, pulse_us);
  }
}

void rc_output_set(uint8_t output, int16_t value)
{
  if (output < RC_OUTPUT_COUNT)
  {
    set_rc_compare(rc_output_channels[output], command_to_pulse_us(value));
  }
}

void digital_outputs_set(uint8_t output_mask)
{
  uint8_t masked_outputs = (uint8_t)(output_mask & DIGITAL_OUTPUT_MASK_ALL);

  HAL_GPIO_WritePin(OUTPUT_0_GPIO_Port, OUTPUT_0_Pin, ((masked_outputs & 0x01u) != 0u) ? GPIO_PIN_SET : GPIO_PIN_RESET);
  HAL_GPIO_WritePin(OUTPUT_1_GPIO_Port, OUTPUT_1_Pin, ((masked_outputs & 0x02u) != 0u) ? GPIO_PIN_SET : GPIO_PIN_RESET);
  HAL_GPIO_WritePin(OUTPUT_2_GPIO_Port, OUTPUT_2_Pin, ((masked_outputs & 0x04u) != 0u) ? GPIO_PIN_SET : GPIO_PIN_RESET);
  HAL_GPIO_WritePin(OUTPUT_3_GPIO_Port, OUTPUT_3_Pin, ((masked_outputs & 0x08u) != 0u) ? GPIO_PIN_SET : GPIO_PIN_RESET);
}

static void apply_safe_outputs(void)
{
  for (uint8_t output = 0u; output < RC_OUTPUT_COUNT; output++)
  {
    rc_output_set(output, 0);
  }
  digital_outputs_set(0u);
  buzzer_stop();
}

static void store_safe_state(void)
{
  if (control_state == 0)
  {
    return;
  }

  for (uint8_t output = 0u; output < RC_OUTPUT_COUNT; output++)
  {
    control_state->rc_command[output] = 0;
  }
  control_state->digital_output_mask = 0u;
  control_state->buzzer_frequency_hz = 0u;
}

static void apply_state_outputs(void)
{
  if (control_state == 0)
  {
    return;
  }

  for (uint8_t output = 0u; output < RC_OUTPUT_COUNT; output++)
  {
    rc_output_set(output, control_state->rc_command[output]);
  }
  digital_outputs_set(control_state->digital_output_mask);
  if (control_state->buzzer_frequency_hz == 0u)
  {
    buzzer_stop();
  }
  else
  {
    buzzer_start(control_state->buzzer_frequency_hz);
  }
}

void control_task_init(TIM_HandleTypeDef *rc_output_timer, rover_state_t *state, rover_diag_t *diag)
{
  control_rc_output_timer = rc_output_timer;
  control_state = state;
  control_diag = diag;
  last_control_message_ms = HAL_GetTick();

  apply_safe_outputs();
  store_safe_state();

  if (control_rc_output_timer != 0)
  {
    (void)HAL_TIM_PWM_Start(control_rc_output_timer, TIM_CHANNEL_1);
    (void)HAL_TIM_PWM_Start(control_rc_output_timer, TIM_CHANNEL_2);
    (void)HAL_TIM_PWM_Start(control_rc_output_timer, TIM_CHANNEL_3);
    (void)HAL_TIM_PWM_Start(control_rc_output_timer, TIM_CHANNEL_4);
  }
}

void control_task_apply_command(const int16_t rc_command[4], uint8_t digital_output_mask, uint16_t buzzer_frequency_hz, uint32_t now_ms)
{
  uint8_t masked_outputs = (uint8_t)(digital_output_mask & DIGITAL_OUTPUT_MASK_ALL);

  if (rc_command == 0)
  {
    return;
  }

  last_control_message_ms = now_ms;

  if (control_state != 0)
  {
    for (uint8_t output = 0u; output < RC_OUTPUT_COUNT; output++)
    {
      control_state->rc_command[output] = clamp_command(rc_command[output]);
    }
    control_state->digital_output_mask = masked_outputs;
    control_state->buzzer_frequency_hz = buzzer_frequency_hz;
  }

  if (forced_failsafe_active)
  {
    apply_safe_outputs();
    return;
  }

  apply_state_outputs();
}

void control_task_set_forced_failsafe(bool enabled)
{
  bool was_forced_failsafe_active = forced_failsafe_active;
  forced_failsafe_active = enabled;
  if (enabled)
  {
    store_safe_state();
    apply_safe_outputs();
  }
  else if (was_forced_failsafe_active &&
           ((uint32_t)(HAL_GetTick() - last_control_message_ms) < CONTROL_FAILSAFE_TIMEOUT_MS))
  {
    apply_state_outputs();
  }
}

void control_task(void)
{
  uint32_t now_ms = HAL_GetTick();
  bool communication_timeout = (uint32_t)(now_ms - last_control_message_ms) >= CONTROL_FAILSAFE_TIMEOUT_MS;
  bool failsafe_active = forced_failsafe_active || communication_timeout;

  if (control_state != 0)
  {
    control_state->failsafe_active = failsafe_active;

    if (failsafe_active)
    {
      store_safe_state();
      apply_safe_outputs();
    }
  }

  if ((control_diag != 0) && failsafe_active && !previous_failsafe_active)
  {
    control_diag->failsafe_count++;
  }
  previous_failsafe_active = failsafe_active;
}
