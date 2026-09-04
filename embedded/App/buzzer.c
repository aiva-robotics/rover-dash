#include "buzzer.h"

#define BUZZER_TIMER_CLOCK_HZ 1000000u
#define BUZZER_CHANNEL TIM_CHANNEL_2

static TIM_HandleTypeDef *buzzer_timer;
static const buzzer_note_t *active_sequence;
static uint32_t note_started_ms;
static uint8_t active_note_count;
static uint8_t active_note_index;
static bool sequence_active;

static void buzzer_hw_start(uint32_t frequency_hz)
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

static void buzzer_hw_stop(void)
{
  if (buzzer_timer != 0)
  {
    (void)HAL_TIM_PWM_Stop(buzzer_timer, BUZZER_CHANNEL);
    __HAL_TIM_SET_COMPARE(buzzer_timer, BUZZER_CHANNEL, 0u);
  }
}

static void buzzer_start_note(uint8_t note_index)
{
  if ((active_sequence == 0) || (note_index >= active_note_count))
  {
    return;
  }

  note_started_ms = HAL_GetTick();
  if (active_sequence[note_index].frequency_hz == 0u)
  {
    buzzer_hw_stop();
  }
  else
  {
    buzzer_hw_start(active_sequence[note_index].frequency_hz);
  }
}

void buzzer_init(TIM_HandleTypeDef *timer)
{
  buzzer_timer = timer;
  active_sequence = 0;
  active_note_count = 0u;
  active_note_index = 0u;
  sequence_active = false;
  buzzer_hw_stop();
}

void buzzer_start(uint32_t frequency_hz)
{
  if (!sequence_active)
  {
    buzzer_hw_start(frequency_hz);
  }
}

void buzzer_stop(void)
{
  if (!sequence_active)
  {
    buzzer_hw_stop();
  }
}

void buzzer_play_sequence(const buzzer_note_t *notes, uint8_t note_count)
{
  if ((notes == 0) || (note_count == 0u))
  {
    sequence_active = false;
    active_sequence = 0;
    active_note_count = 0u;
    active_note_index = 0u;
    buzzer_hw_stop();
    return;
  }

  active_sequence = notes;
  active_note_count = note_count;
  active_note_index = 0u;
  sequence_active = true;
  buzzer_start_note(active_note_index);
}

void buzzer_task(void)
{
  if (!sequence_active || (active_sequence == 0))
  {
    return;
  }

  if ((uint32_t)(HAL_GetTick() - note_started_ms) < active_sequence[active_note_index].duration_ms)
  {
    return;
  }

  active_note_index++;
  if (active_note_index >= active_note_count)
  {
    sequence_active = false;
    active_sequence = 0;
    active_note_count = 0u;
    active_note_index = 0u;
    buzzer_hw_stop();
    return;
  }

  buzzer_start_note(active_note_index);
}

bool buzzer_sequence_active(void)
{
  return sequence_active;
}
